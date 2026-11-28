import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const DEFAULT_GRADING_SCALE = [
  { min: 91, grade: "A1", remark: "Outstanding" },
  { min: 81, grade: "A2", remark: "Excellent" },
  { min: 71, grade: "B1", remark: "Very Good" },
  { min: 61, grade: "B2", remark: "Good" },
  { min: 51, grade: "C1", remark: "Above Average" },
  { min: 41, grade: "C2", remark: "Average" },
  { min: 33, grade: "D", remark: "Pass" },
  { min: 0, grade: "E / Fail", remark: "Needs Improvement" },
];

function calculateGrade(percentage: number, scale = DEFAULT_GRADING_SCALE) {
  for (const s of scale) {
    if (percentage >= s.min) {
      return { grade: s.grade, remark: s.remark };
    }
  }
  return { grade: "E", remark: "Needs Improvement" };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { admissionNo, verificationType, verificationValue } = body;

    const cleanAdm = String(admissionNo ?? "").trim();
    const cleanVal = String(verificationValue ?? "").trim();

    if (!cleanAdm) {
      return NextResponse.json(
        { error: "Student Admission Number is required." },
        { status: 400 }
      );
    }

    if (!cleanVal) {
      return NextResponse.json(
        { error: "Registered Mobile Number or Date of Birth is required for verification." },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1. Find candidate students matching admission_no or roll_no (case-insensitive)
    const { data: students, error: studentErr } = await admin
      .from("students")
      .select(`
        id,
        organization_id,
        admission_no,
        roll_no,
        first_name,
        last_name,
        status,
        date_of_birth,
        gender,
        phone,
        guardian_phone,
        father_name,
        mother_name,
        guardian_name,
        photo_url,
        address,
        blood_group,
        class_id,
        section_id,
        classes (id, name),
        sections (id, name)
      `)
      .or(`admission_no.ilike.${cleanAdm},roll_no.ilike.${cleanAdm}`);

    if (studentErr || !students || students.length === 0) {
      return NextResponse.json(
        {
          error:
            "No student found with this Admission Number. Please verify the admission number from the school fee receipt or ID card.",
        },
        { status: 404 }
      );
    }

    // 2. Normalize verification credential
    const digitsOnlyVal = cleanVal.replace(/\D/g, "");
    const last10Val = digitsOnlyVal.length >= 10 ? digitsOnlyVal.slice(-10) : digitsOnlyVal;

    // Normalizing possible date input (YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY)
    let parsedDob: string | null = null;
    if (cleanVal.includes("-") || cleanVal.includes("/") || cleanVal.includes(".")) {
      const parts = cleanVal.split(/[-/.]/);
      if (parts.length === 3) {
        if (parts[0].length === 4) {
          // YYYY-MM-DD
          parsedDob = `${parts[0]}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}`;
        } else if (parts[2].length === 4) {
          // DD-MM-YYYY
          parsedDob = `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
        }
      }
    }

    // 3. Match candidate student against phone or DOB
    let matchedStudent: any = null;

    for (const s of students) {
      let isMatch = false;

      // Check DOB
      if (parsedDob && s.date_of_birth) {
        if (s.date_of_birth === parsedDob || s.date_of_birth === cleanVal) {
          isMatch = true;
        }
      } else if (s.date_of_birth && s.date_of_birth === cleanVal) {
        isMatch = true;
      }

      // Check Student Phone & Guardian Phone (last 10 digits match)
      if (!isMatch && last10Val.length >= 8) {
        const sPhoneDigits = (s.phone || "").replace(/\D/g, "");
        const sGuardianDigits = (s.guardian_phone || "").replace(/\D/g, "");

        if (
          (sPhoneDigits.length >= 8 && sPhoneDigits.slice(-10) === last10Val) ||
          (sGuardianDigits.length >= 8 && sGuardianDigits.slice(-10) === last10Val)
        ) {
          isMatch = true;
        }
      }

      // If still not matched, check parent record in student_parents table
      if (!isMatch && last10Val.length >= 8) {
        const { data: parentLinks } = await admin
          .from("student_parents")
          .select("parents(phone)")
          .eq("student_id", s.id);

        if (parentLinks && parentLinks.length > 0) {
          for (const pl of parentLinks as any[]) {
            const pPhoneDigits = (pl?.parents?.phone || "").replace(/\D/g, "");
            if (pPhoneDigits.length >= 8 && pPhoneDigits.slice(-10) === last10Val) {
              isMatch = true;
              break;
            }
          }
        }
      }

      if (isMatch) {
        matchedStudent = s;
        break;
      }
    }

    if (!matchedStudent) {
      return NextResponse.json(
        {
          error:
            "Verification credential did not match. Please enter the registered mobile number or Date of Birth provided during admission.",
        },
        { status: 401 }
      );
    }

    // 4. Fetch Institution & Settings
    const { data: org } = await admin
      .from("organizations")
      .select("id, name, is_active, status")
      .eq("id", matchedStudent.organization_id)
      .maybeSingle();

    if (org && (org.is_active === false || org.status === "suspended")) {
      return NextResponse.json(
        {
          error:
            "This institution's portal is currently paused by administration. Please contact the school office.",
        },
        { status: 403 }
      );
    }

    const { data: orgSettings } = await admin
      .from("organization_settings")
      .select(
        "phone, email, address, logo_url, currency, primary_color, secondary_color, marksheet_title, grading_scale, authorized_signatory"
      )
      .eq("organization_id", matchedStudent.organization_id)
      .maybeSingle();

    // 4.1 RESOLVE STORAGE URLS (Signed URLs for Logo and Student Photo)
    let resolvedLogoUrl: string | null = null;
    if (orgSettings?.logo_url) {
      const trimmedLogo = orgSettings.logo_url.trim();
      if (trimmedLogo.startsWith("http://") || trimmedLogo.startsWith("https://") || trimmedLogo.startsWith("data:")) {
        resolvedLogoUrl = trimmedLogo;
      } else {
        const cleanLogoPath = trimmedLogo.replace(/^institution-assets\//, "").replace(/^\/+/, "");
        try {
          const { data: signedLogo } = await admin.storage
            .from("institution-assets")
            .createSignedUrl(cleanLogoPath, 604800); // 7 days
          if (signedLogo?.signedUrl) {
            resolvedLogoUrl = signedLogo.signedUrl;
          } else {
            const { data: pub } = admin.storage.from("institution-assets").getPublicUrl(cleanLogoPath);
            resolvedLogoUrl = pub?.publicUrl || null;
          }
        } catch {
          const { data: pub } = admin.storage.from("institution-assets").getPublicUrl(cleanLogoPath);
          resolvedLogoUrl = pub?.publicUrl || null;
        }
      }
    }

    let resolvedPhotoUrl: string | null = null;
    if (matchedStudent.photo_url) {
      const trimmedPhoto = matchedStudent.photo_url.trim();
      if (trimmedPhoto.startsWith("http://") || trimmedPhoto.startsWith("https://") || trimmedPhoto.startsWith("data:")) {
        resolvedPhotoUrl = trimmedPhoto;
      } else {
        const cleanPhotoPath = trimmedPhoto.replace(/^institution-assets\//, "").replace(/^\/+/, "");
        try {
          const { data: signedPhoto } = await admin.storage
            .from("institution-assets")
            .createSignedUrl(cleanPhotoPath, 604800);
          if (signedPhoto?.signedUrl) {
            resolvedPhotoUrl = signedPhoto.signedUrl;
          } else {
            const { data: pub } = admin.storage.from("institution-assets").getPublicUrl(cleanPhotoPath);
            resolvedPhotoUrl = pub?.publicUrl || null;
          }
        } catch {
          const { data: pub } = admin.storage.from("institution-assets").getPublicUrl(cleanPhotoPath);
          resolvedPhotoUrl = pub?.publicUrl || null;
        }
      }
    }

    // 4.2 Fetch Academic Session
    const { data: sessions } = await admin
      .from("academic_sessions")
      .select("id, name, is_current")
      .eq("organization_id", matchedStudent.organization_id);
    const currentSession = (sessions || []).find((s) => s.is_current) || sessions?.[0];
    const sessionName = currentSession?.name || "2025-2026";

    // 5. Fetch Attendance (Summary & last 60 records)
    const { data: attendanceRecords } = await admin
      .from("attendance")
      .select("attendance_date, status, note")
      .eq("student_id", matchedStudent.id)
      .order("attendance_date", { ascending: false })
      .limit(60);

    const records = attendanceRecords || [];
    const totalMarked = records.length;
    const presentCount = records.filter((r) => r.status === "present").length;
    const absentCount = records.filter((r) => r.status === "absent").length;
    const lateCount = records.filter((r) => r.status === "late").length;
    const percentage = totalMarked > 0 ? Math.round((presentCount / totalMarked) * 1000) / 10 : 0;

    // Check today's attendance
    const todayStr = new Date().toISOString().slice(0, 10);
    const todayRecord = records.find((r) => r.attendance_date === todayStr);

    // 6. Fetch Fees (Paid receipts and dues)
    const { data: feePayments } = await admin
      .from("fee_payments")
      .select("id, amount, paid_on, method, reference")
      .eq("student_id", matchedStudent.id)
      .order("paid_on", { ascending: false });

    const payments = feePayments || [];
    const totalPaid = payments.reduce((acc, p) => acc + Number(p.amount || 0), 0);

    const { data: feeDues } = await admin
      .from("student_fee_months")
      .select("due_amount")
      .eq("student_id", matchedStudent.id);

    const totalDue = (feeDues || []).reduce((acc, d) => acc + Number(d.due_amount || 0), 0);
    const balance = Math.max(0, totalDue - totalPaid);

    // 7. COMPREHENSIVE REPORT CARDS & EXAM MARKS
    // Fetch all exams for this organization
    const { data: orgExams } = await admin
      .from("exams")
      .select("id, name, exam_date, created_at")
      .eq("organization_id", matchedStudent.organization_id)
      .order("created_at", { ascending: false });

    const reportCards: any[] = [];
    const gradingScale = (orgSettings?.grading_scale as any[]) || DEFAULT_GRADING_SCALE;

    for (const ex of orgExams || []) {
      // 1. Get subjects defined for this exam
      const { data: examSubjects } = await admin
        .from("exam_subjects")
        .select("id, subject, max_marks, pass_percentage, sort_order")
        .eq("exam_id", ex.id)
        .order("sort_order", { ascending: true });

      // 2. Get marks entered for this student in this exam
      const { data: studentMarks } = await admin
        .from("exam_marks")
        .select("id, subject, marks, max_marks, status, pass_percentage")
        .eq("exam_id", ex.id)
        .eq("student_id", matchedStudent.id);

      const marksMap = new Map((studentMarks || []).map((m) => [m.subject, m]));

      // Combine subjects and marks
      let totalObtained = 0;
      let totalMax = 0;
      let hasAnyMarks = false;
      let allPassed = true;

      const subjectRows = (examSubjects || []).map((s) => {
        const sm = marksMap.get(s.subject);
        const marksObtained = sm && sm.marks !== null && sm.marks !== undefined ? Number(sm.marks) : null;
        const maxMarks = Number(s.max_marks || sm?.max_marks || 100);
        const passPct = Number(s.pass_percentage || sm?.pass_percentage || 33);
        const minPassMarks = Math.round((maxMarks * passPct) / 100);

        if (marksObtained !== null) {
          hasAnyMarks = true;
          totalObtained += marksObtained;
          totalMax += maxMarks;

          if (marksObtained < minPassMarks) {
            allPassed = false;
          }
        } else {
          totalMax += maxMarks;
        }

        const pct = marksObtained !== null ? Math.round((marksObtained / maxMarks) * 1000) / 10 : null;
        const subjectGrade = pct !== null ? calculateGrade(pct, gradingScale) : null;

        return {
          subject: s.subject,
          marks: marksObtained,
          max_marks: maxMarks,
          pass_marks: minPassMarks,
          percentage: pct,
          grade: subjectGrade?.grade || "—",
          remark: subjectGrade?.remark || "—",
          status:
            marksObtained === null
              ? "pending"
              : marksObtained >= minPassMarks
              ? "pass"
              : "fail",
        };
      });

      // Also check if student has marks for subjects not in exam_subjects
      for (const sm of studentMarks || []) {
        if (!examSubjects?.some((s) => s.subject === sm.subject)) {
          const marksObtained = sm.marks !== null && sm.marks !== undefined ? Number(sm.marks) : null;
          const maxMarks = Number(sm.max_marks || 100);
          const minPassMarks = Math.round((maxMarks * 33) / 100);

          if (marksObtained !== null) {
            hasAnyMarks = true;
            totalObtained += marksObtained;
            totalMax += maxMarks;
            if (marksObtained < minPassMarks) allPassed = false;
          } else {
            totalMax += maxMarks;
          }

          const pct = marksObtained !== null ? Math.round((marksObtained / maxMarks) * 1000) / 10 : null;
          const subjectGrade = pct !== null ? calculateGrade(pct, gradingScale) : null;

          subjectRows.push({
            subject: sm.subject,
            marks: marksObtained,
            max_marks: maxMarks,
            pass_marks: minPassMarks,
            percentage: pct,
            grade: subjectGrade?.grade || "—",
            remark: subjectGrade?.remark || "—",
            status:
              marksObtained === null
                ? "pending"
                : marksObtained >= minPassMarks
                ? "pass"
                : "fail",
          });
        }
      }

      const overallPercentage =
        totalMax > 0 && hasAnyMarks ? Math.round((totalObtained / totalMax) * 1000) / 10 : 0;
      const overallGrade = hasAnyMarks
        ? calculateGrade(overallPercentage, gradingScale)
        : { grade: "—", remark: "Marks Pending" };

      reportCards.push({
        exam_id: ex.id,
        exam_name: ex.name,
        exam_date: ex.exam_date || null,
        session_name: sessionName,
        has_marks: hasAnyMarks,
        total_obtained: hasAnyMarks ? totalObtained : null,
        total_max: totalMax,
        percentage: hasAnyMarks ? overallPercentage : null,
        grade: overallGrade.grade,
        remark: overallGrade.remark,
        result: !hasAnyMarks ? "Evaluation Pending" : allPassed ? "PASSED" : "NEEDS IMPROVEMENT",
        subjects: subjectRows,
      });
    }

    // 8. Fetch Daily Class Homework
    let homeworkList: any[] = [];
    if (matchedStudent.class_id) {
      const { data: hw } = await admin
        .from("class_homework")
        .select("id, title, description, subject, assigned_date, due_date, teacher_name")
        .eq("organization_id", matchedStudent.organization_id)
        .eq("class_id", matchedStudent.class_id)
        .order("assigned_date", { ascending: false })
        .limit(15);
      homeworkList = hw || [];
    }

    // 9. Fetch School Notices
    const { data: noticesData } = await admin
      .from("notices")
      .select("id, title, body, published_at")
      .eq("organization_id", matchedStudent.organization_id)
      .order("published_at", { ascending: false })
      .limit(10);

    // 10. Assemble complete parent portal payload
    return NextResponse.json({
      success: true,
      student: {
        id: matchedStudent.id,
        admission_no: matchedStudent.admission_no,
        roll_no: matchedStudent.roll_no || null,
        first_name: matchedStudent.first_name,
        last_name: matchedStudent.last_name,
        status: matchedStudent.status || "active",
        class_name: matchedStudent.classes?.name || "Not Assigned",
        section_name: matchedStudent.sections?.name || "—",
        photo_url: resolvedPhotoUrl,
        gender: matchedStudent.gender || null,
        date_of_birth: matchedStudent.date_of_birth || null,
        father_name: matchedStudent.father_name || null,
        mother_name: matchedStudent.mother_name || null,
        guardian_name: matchedStudent.guardian_name || null,
        guardian_phone: matchedStudent.guardian_phone || null,
        phone: matchedStudent.phone || null,
        address: matchedStudent.address || null,
        blood_group: matchedStudent.blood_group || null,
      },
      institute: {
        id: org?.id,
        name: org?.name || "Educational Institution",
        logo_url: resolvedLogoUrl,
        phone: orgSettings?.phone || null,
        email: orgSettings?.email || null,
        address: orgSettings?.address || null,
        currency: orgSettings?.currency || "INR",
        primary_color: orgSettings?.primary_color || "#1e293b",
        secondary_color: orgSettings?.secondary_color || "#6657e8",
        marksheet_title: orgSettings?.marksheet_title || "Statement of Marks",
        authorized_signatory: orgSettings?.authorized_signatory || "Principal / Controller of Examinations",
        grading_scale: gradingScale,
      },
      attendance: records.map((r) => ({
        date: r.attendance_date,
        status: r.status,
        note: r.note,
      })),
      attendance_stats: {
        total_marked: totalMarked,
        present: presentCount,
        absent: absentCount,
        late: lateCount,
        percentage,
        today: todayRecord ? todayRecord.status : "unmarked",
      },
      fees: {
        total_paid: totalPaid,
        total_due: totalDue,
        balance,
        payments: payments.map((p) => ({
          id: p.id,
          amount: Number(p.amount),
          paid_on: p.paid_on,
          method: p.method,
          reference: p.reference,
        })),
      },
      report_cards: reportCards,
      homework: homeworkList,
      notices: (noticesData || []).map((n) => ({
        id: n.id,
        title: n.title,
        body: n.body,
        published_at: n.published_at,
      })),
    });
  } catch (err: any) {
    console.error("Parent Portal lookup error:", err);
    return NextResponse.json(
      { error: err.message || "An unexpected error occurred while verifying student credentials." },
      { status: 500 }
    );
  }
}
