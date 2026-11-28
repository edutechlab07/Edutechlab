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
    const {
      loginMethod, // "phone" | "admission" | "magic"
      phone,
      dob,
      studentId,
      admissionNo,
      verificationValue,
      isMagicLink,
      isQrScan,
    } = body;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    let matchedStudent: any = null;

    // ============================================================
    // METHOD 1: LOGIN WITH MOBILE NUMBER (+ OPTIONAL DOB / SIBLINGS)
    // ============================================================
    if (loginMethod === "phone" || (phone && !admissionNo)) {
      const cleanPhoneDigits = String(phone ?? "").replace(/\D/g, "");
      const last10 = cleanPhoneDigits.length >= 10 ? cleanPhoneDigits.slice(-10) : cleanPhoneDigits;

      if (!last10 || last10.length < 8) {
        return NextResponse.json(
          { error: "Kripya 10-digit ka valid registered mobile number darj karein." },
          { status: 400 }
        );
      }

      // Query students linked to this phone number
      const { data: candidates, error: candErr } = await admin
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
        .or(`phone.ilike.%${last10}%,guardian_phone.ilike.%${last10}%`);

      let matchedList = candidates || [];

      // Also check student_parents link table
      if (matchedList.length === 0) {
        const { data: parentLinks } = await admin
          .from("student_parents")
          .select("student_id, parents(phone)")
          .ilike("parents.phone", `%${last10}%`);

        if (parentLinks && parentLinks.length > 0) {
          const studentIds = parentLinks.map((pl) => pl.student_id);
          const { data: pStudents } = await admin
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
            .in("id", studentIds);
          matchedList = pStudents || [];
        }
      }

      if (matchedList.length === 0) {
        return NextResponse.json(
          {
            error:
              "Is mobile number se koi student record nahi mila. Kripya school me registered primary mobile number darj karein.",
          },
          { status: 404 }
        );
      }

      // If user selected a specific sibling child by ID
      if (studentId) {
        matchedStudent = matchedList.find((s) => s.id === studentId);
      }

      // If DOB is provided, verify DOB
      if (!matchedStudent && dob) {
        const cleanDob = String(dob).trim();
        const dobMatch = matchedList.find((s) => {
          if (!s.date_of_birth) return false;
          return s.date_of_birth === cleanDob;
        });
        if (dobMatch) {
          matchedStudent = dobMatch;
        }
      }

      // If still not picked:
      if (!matchedStudent) {
        // If multiple siblings found, return list so parent can choose!
        if (matchedList.length > 1 && !dob) {
          return NextResponse.json({
            success: true,
            multiple: true,
            message: `Is number se ${matchedList.length} bachche linked hain. Kripya bachche ko chunein:`,
            students: matchedList.map((s) => ({
              id: s.id,
              admission_no: s.admission_no,
              full_name: `${s.first_name} ${s.last_name || ""}`.trim(),
              class_name: (s.classes as any)?.name || "Standard",
              section_name: (s.sections as any)?.name || "—",
              photo_url: s.photo_url,
              date_of_birth: s.date_of_birth,
            })),
          });
        }

        // Exactly 1 child matched!
        matchedStudent = matchedList[0];
      }
    }

    // ============================================================
    // METHOD 2: LOGIN WITH SMART FORGIVING ADMISSION NO / MAGIC / QR
    // ============================================================
    if (!matchedStudent) {
      const cleanAdm = String(admissionNo ?? "").trim();

      if (!cleanAdm) {
        return NextResponse.json(
          { error: "Student Admission Number ya Mobile Number zaroori hai." },
          { status: 400 }
        );
      }

      // Smart Forgiving Search:
      // Exact match, Roll No match, suffix digits match (e.g. '35' matches 'ADM-2026-035' or '035')
      let query = admin.from("students").select(`
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
      `);

      // If user typed only digits (e.g. '35' or '02' or '1')
      const isPureDigits = /^\d+$/.test(cleanAdm);

      if (isPureDigits) {
        const padded3 = cleanAdm.padStart(3, "0"); // '35' -> '035'
        const padded2 = cleanAdm.padStart(2, "0"); // '2' -> '02'
        query = query.or(
          `admission_no.ilike.${cleanAdm},admission_no.ilike.%-${cleanAdm},admission_no.ilike.%-${padded3},admission_no.ilike.%-${padded2},roll_no.ilike.${cleanAdm},admission_no.ilike.${padded2}`
        );
      } else {
        query = query.or(
          `admission_no.ilike.${cleanAdm},roll_no.ilike.${cleanAdm},admission_no.ilike.%${cleanAdm}%`
        );
      }

      const { data: candidateStudents, error: candErr } = await query;

      if (candErr || !candidateStudents || candidateStudents.length === 0) {
        return NextResponse.json(
          {
            error:
              "Is number se koi student nahi mila. Kripya school ID card ya receipt par likha Admission No. check karein.",
          },
          { status: 404 }
        );
      }

      // If 1-Click WhatsApp Magic Link or ID Card QR Scan is used:
      if (isMagicLink || isQrScan) {
        matchedStudent = candidateStudents[0];
      } else {
        // Credential verification (Phone or DOB)
        const cleanVal = String(verificationValue ?? "").trim();

        if (!cleanVal) {
          // If pure digits were entered and exactly 1 student found, check if student has no phone/dob registered
          if (candidateStudents.length === 1 && !candidateStudents[0].phone && !candidateStudents[0].date_of_birth) {
            matchedStudent = candidateStudents[0];
          } else {
            return NextResponse.json(
              { error: "Registered Mobile Number ya Date of Birth zaroori hai." },
              { status: 400 }
            );
          }
        } else {
          const digitsOnlyVal = cleanVal.replace(/\D/g, "");
          const last10Val = digitsOnlyVal.length >= 10 ? digitsOnlyVal.slice(-10) : digitsOnlyVal;

          let parsedDob: string | null = null;
          if (cleanVal.includes("-") || cleanVal.includes("/") || cleanVal.includes(".")) {
            const parts = cleanVal.split(/[-/.]/);
            if (parts.length === 3) {
              if (parts[0].length === 4) {
                parsedDob = `${parts[0]}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}`;
              } else if (parts[2].length === 4) {
                parsedDob = `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
              }
            }
          }

          for (const s of candidateStudents) {
            let isMatch = false;

            // Check DOB
            if (parsedDob && s.date_of_birth) {
              if (s.date_of_birth === parsedDob || s.date_of_birth === cleanVal) isMatch = true;
            } else if (s.date_of_birth && s.date_of_birth === cleanVal) {
              isMatch = true;
            }

            // Check Student & Guardian Phone
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

            if (isMatch) {
              matchedStudent = s;
              break;
            }
          }
        }
      }

      if (!matchedStudent) {
        return NextResponse.json(
          {
            error:
              "Verification details match nahi hui. Kripya school me registered mobile number ya Date of birth sahi darj karein.",
          },
          { status: 401 }
        );
      }
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

    // 4.1 Resolve Storage Signed URLs for Logo & Student Photo
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
            .createSignedUrl(cleanLogoPath, 604800);
          resolvedLogoUrl = signedLogo?.signedUrl || admin.storage.from("institution-assets").getPublicUrl(cleanLogoPath).data?.publicUrl || null;
        } catch {
          resolvedLogoUrl = admin.storage.from("institution-assets").getPublicUrl(cleanLogoPath).data?.publicUrl || null;
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
          resolvedPhotoUrl = signedPhoto?.signedUrl || admin.storage.from("institution-assets").getPublicUrl(cleanPhotoPath).data?.publicUrl || null;
        } catch {
          resolvedPhotoUrl = admin.storage.from("institution-assets").getPublicUrl(cleanPhotoPath).data?.publicUrl || null;
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

    // 7. Comprehensive Report Cards & Exam Marks
    const { data: orgExams } = await admin
      .from("exams")
      .select("id, name, exam_date, created_at")
      .eq("organization_id", matchedStudent.organization_id)
      .order("created_at", { ascending: false });

    const reportCards: any[] = [];
    const gradingScale = (orgSettings?.grading_scale as any[]) || DEFAULT_GRADING_SCALE;

    for (const ex of orgExams || []) {
      const { data: examSubjects } = await admin
        .from("exam_subjects")
        .select("id, subject, max_marks, pass_percentage, sort_order")
        .eq("exam_id", ex.id)
        .order("sort_order", { ascending: true });

      const { data: studentMarks } = await admin
        .from("exam_marks")
        .select("id, subject, marks, max_marks, status, pass_percentage")
        .eq("exam_id", ex.id)
        .eq("student_id", matchedStudent.id);

      const marksMap = new Map((studentMarks || []).map((m) => [m.subject, m]));

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
          if (marksObtained < minPassMarks) allPassed = false;
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

    // 9b. Find Siblings (other students linked to same phone/guardian in this institution)
    let siblingList: any[] = [];
    const studentPhoneDigits = (matchedStudent.phone || "").replace(/\D/g, "");
    const guardianPhoneDigits = (matchedStudent.guardian_phone || "").replace(/\D/g, "");
    const phoneToQuery =
      guardianPhoneDigits.length >= 8
        ? guardianPhoneDigits.slice(-10)
        : studentPhoneDigits.length >= 8
        ? studentPhoneDigits.slice(-10)
        : "";

    if (phoneToQuery && matchedStudent.organization_id) {
      const { data: sibs } = await admin
        .from("students")
        .select(`
          id,
          admission_no,
          roll_no,
          first_name,
          last_name,
          status,
          date_of_birth,
          classes (id, name),
          sections (id, name),
          photo_url
        `)
        .eq("organization_id", matchedStudent.organization_id)
        .neq("id", matchedStudent.id)
        .or(`phone.ilike.%${phoneToQuery}%,guardian_phone.ilike.%${phoneToQuery}%`);

      if (sibs && sibs.length > 0) {
        siblingList = sibs.map((s) => ({
          id: s.id,
          admission_no: s.admission_no,
          roll_no: s.roll_no,
          full_name: `${s.first_name} ${s.last_name || ""}`.trim(),
          class_name: (s.classes as any)?.name || "Standard",
          section_name: (s.sections as any)?.name || "—",
          photo_url: s.photo_url,
          date_of_birth: s.date_of_birth,
        }));
      }
    }

    // 10. Assemble and return complete portal payload
    return NextResponse.json({
      success: true,
      multiple: false,
      siblings: siblingList,
      student: {
        id: matchedStudent.id,
        admission_no: matchedStudent.admission_no,
        roll_no: matchedStudent.roll_no || null,
        first_name: matchedStudent.first_name,
        last_name: matchedStudent.last_name,
        status: matchedStudent.status || "active",
        class_name: (matchedStudent.classes as any)?.name || "Not Assigned",
        section_name: (matchedStudent.sections as any)?.name || "—",
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
