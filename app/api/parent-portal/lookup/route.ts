import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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
      .select("phone, email, address, logo_url, currency, primary_color, secondary_color, marksheet_title")
      .eq("organization_id", matchedStudent.organization_id)
      .maybeSingle();

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

    // 7. Fetch Exam Marks
    const { data: marksData } = await admin
      .from("exam_marks")
      .select(`
        id,
        exam_id,
        subject,
        marks,
        max_marks,
        status,
        exams (id, name, exam_date)
      `)
      .eq("student_id", matchedStudent.id);

    const examMarks = (marksData || []).map((m: any) => ({
      exam_id: m.exam_id,
      exam_name: m.exams?.name || "Term Exam",
      exam_date: m.exams?.exam_date || null,
      subject: m.subject,
      marks: Number(m.marks || 0),
      max_marks: Number(m.max_marks || 100),
      status: m.status || "marked",
    }));

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
        photo_url: matchedStudent.photo_url || null,
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
        logo_url: orgSettings?.logo_url || null,
        phone: orgSettings?.phone || null,
        email: orgSettings?.email || null,
        address: orgSettings?.address || null,
        currency: orgSettings?.currency || "INR",
        primary_color: orgSettings?.primary_color || "#1e293b",
        secondary_color: orgSettings?.secondary_color || "#6657e8",
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
      exam_marks: examMarks,
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
