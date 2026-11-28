"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  GraduationCap,
  Calendar,
  Wallet,
  FileText,
  Bell,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Clock,
  LogOut,
  AlertCircle,
  Building2,
  Printer,
  ChevronRight,
  ShieldCheck,
  Phone,
  MapPin,
  CreditCard,
  UserCheck,
  BookOpen,
  Sparkles,
  QrCode,
  Heart,
  Droplet,
  Smartphone,
  CalendarDays,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type PortalData = {
  student: {
    id: string;
    admission_no: string;
    roll_no: string | null;
    first_name: string;
    last_name: string | null;
    status: string;
    class_name: string;
    section_name: string;
    photo_url: string | null;
    gender: string | null;
    date_of_birth: string | null;
    father_name: string | null;
    mother_name: string | null;
    guardian_name: string | null;
    guardian_phone: string | null;
    phone: string | null;
    address: string | null;
    blood_group: string | null;
  };
  institute: {
    id?: string;
    name: string;
    logo_url: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    currency: string;
    primary_color: string;
    secondary_color: string;
  };
  attendance: Array<{
    date: string;
    status: "present" | "absent" | "late" | "leave";
    note: string | null;
  }>;
  attendance_stats: {
    total_marked: number;
    present: number;
    absent: number;
    late: number;
    percentage: number;
    today: string;
  };
  fees: {
    total_paid: number;
    total_due: number;
    balance: number;
    payments: Array<{
      id: string;
      amount: number;
      paid_on: string;
      method: string;
      reference: string | null;
    }>;
  };
  exam_marks: Array<{
    exam_id: string;
    exam_name: string;
    exam_date: string | null;
    subject: string;
    marks: number;
    max_marks: number;
    status: string;
  }>;
  homework: Array<{
    id: string;
    title: string;
    description: string;
    subject: string;
    assigned_date: string;
    due_date: string | null;
    teacher_name: string | null;
  }>;
  notices: Array<{
    id: string;
    title: string;
    body: string;
    published_at: string;
  }>;
};

const SESSION_KEY = "edutechlab_parent_session";

export default function ParentPortalPage() {
  const supabase = createClient();
  const [admissionNo, setAdmissionNo] = useState("");
  const [authMode, setAuthMode] = useState<"phone" | "dob">("phone");
  const [phoneInput, setPhoneInput] = useState("");
  const [dobInput, setDobInput] = useState("");
  const [rememberMe, setRememberMe] = useState(true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<PortalData | null>(null);
  const [activeTab, setActiveTab] = useState<
    "overview" | "attendance" | "fees" | "exams" | "homework" | "notices" | "idcard"
  >("overview");

  // QR scan quick preview
  const [qrProfile, setQrProfile] = useState<any>(null);

  // Auto-load remembered session on mount
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Check QR code scan param (?id=ADM-123 or ?adm=ADM-123)
    const params = new URLSearchParams(window.location.search);
    const idParam = params.get("id") || params.get("adm");
    if (idParam) {
      setAdmissionNo(idParam);
      (async () => {
        try {
          const { data: res, error: rpcErr } = await supabase.rpc("get_student_qr_profile", {
            p_admission_no: idParam.trim(),
          });
          if (!rpcErr && res?.success) {
            setQrProfile(res);
          }
        } catch {}
      })();
      return;
    }

    // Try restoring saved parent session
    try {
      const saved = localStorage.getItem(SESSION_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.admissionNo && parsed.verificationValue) {
          setAdmissionNo(parsed.admissionNo);
          if (parsed.verificationType === "dob") {
            setAuthMode("dob");
            setDobInput(parsed.verificationValue);
          } else {
            setAuthMode("phone");
            setPhoneInput(parsed.verificationValue);
          }
          // Auto login quietly
          performLookup(parsed.admissionNo, parsed.verificationType, parsed.verificationValue, false);
        }
      }
    } catch {}
  }, []);

  const performLookup = async (
    adm: string,
    type: "phone" | "dob",
    val: string,
    saveToStorage = true
  ) => {
    if (!adm.trim() || !val.trim()) {
      setError("Admission number aur mobile number ya DOB dono zaroori hain.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/parent-portal/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          admissionNo: adm.trim(),
          verificationType: type,
          verificationValue: val.trim(),
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(
          json.error || "Koi student record nahi mila. Kripya details check karein ya school se sampark karein."
        );
      }

      setData(json as PortalData);

      if (saveToStorage && rememberMe) {
        try {
          localStorage.setItem(
            SESSION_KEY,
            JSON.stringify({
              admissionNo: adm.trim(),
              verificationType: type,
              verificationValue: val.trim(),
            })
          );
        } catch {}
      }
    } catch (err: any) {
      setError(err.message || "Student lookup fail ho gaya.");
    } finally {
      setLoading(false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = authMode === "phone" ? phoneInput : dobInput;
    performLookup(admissionNo, authMode, val, true);
  };

  const handleLogout = () => {
    setData(null);
    setAdmissionNo("");
    setPhoneInput("");
    setDobInput("");
    setError("");
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch {}
  };

  // ==========================================
  // VIEW 1: LOGIN / VERIFICATION SCREEN
  // ==========================================
  if (!data) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-purple-50/60 via-slate-50 to-indigo-50/40 px-4 py-8 sm:px-6 sm:py-14 selection:bg-purple-200">
        <div className="mx-auto max-w-lg">
          {/* Header Branding */}
          <div className="text-center mb-6">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-2 border border-slate-200 shadow-xs hover:border-purple-300 transition"
            >
              <div className="grid h-8 w-8 place-items-center rounded-xl bg-purple-600 text-white font-bold text-xs shadow-sm">
                <GraduationCap size={18} />
              </div>
              <span className="font-extrabold text-base text-slate-900 tracking-tight">EduTechLab</span>
              <span className="rounded-md bg-purple-100 px-2 py-0.5 text-[10px] font-black text-purple-800">
                PARENT PORTAL
              </span>
            </Link>

            <h1 className="mt-5 text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              Parent &amp; Guardian Access
            </h1>
            <p className="mt-1.5 text-xs sm:text-sm text-slate-500 font-medium max-w-sm mx-auto">
              Apne bachche ki live attendance, fees, receipts, marksheets aur homework mobile par dekhein.
            </p>
          </div>

          {/* Quick QR Card if arrived via QR Scan */}
          {qrProfile && qrProfile.success && (
            <div className="mb-6 rounded-3xl border border-purple-200 bg-white p-5 shadow-md">
              <div className="flex items-center gap-3">
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-purple-100 text-purple-700 font-bold">
                  {qrProfile.student.photo_url ? (
                    <img
                      src={qrProfile.student.photo_url}
                      alt={qrProfile.student.full_name}
                      className="h-full w-full rounded-2xl object-cover"
                    />
                  ) : (
                    <GraduationCap size={24} />
                  )}
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-purple-700">QR ID Scanned</span>
                  <h3 className="font-bold text-sm text-slate-900">{qrProfile.student.full_name}</h3>
                  <p className="text-xs text-slate-500">
                    Class: {qrProfile.student.class_name} • Adm: {qrProfile.student.admission_no}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Main Login Card */}
          <div className="rounded-3xl border border-slate-200/90 bg-white p-6 sm:p-8 shadow-xl shadow-slate-900/5 backdrop-blur-sm">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-4 mb-5">
              <ShieldCheck size={20} className="text-purple-600" />
              <div>
                <h2 className="text-sm font-extrabold text-slate-900">Student Identity Verification</h2>
                <p className="text-[11px] text-slate-400 font-medium">Bina kisi password ke direct secure login</p>
              </div>
            </div>

            <form onSubmit={handleFormSubmit} className="space-y-4">
              {/* Field 1: Admission Number */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
                  Student Admission No. / Roll No.
                </label>
                <div className="relative mt-1.5">
                  <input
                    type="text"
                    required
                    placeholder="e.g. ADM-2026-001 ya Roll No"
                    value={admissionNo}
                    onChange={(e) => setAdmissionNo(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-3.5 text-sm font-semibold text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-purple-600 focus:bg-white focus:ring-4 focus:ring-purple-600/10"
                  />
                </div>
                <p className="mt-1 text-[11px] text-slate-400">
                  School ke ID card ya purani fee receipt par likha Admission No. darj karein.
                </p>
              </div>

              {/* Field 2: Verification Mode Switcher (Phone vs DOB) */}
              <div className="pt-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
                  Verify With:
                </label>
                <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1">
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode("phone");
                      setError("");
                    }}
                    className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold transition ${
                      authMode === "phone"
                        ? "bg-white text-purple-700 shadow-sm"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    <Smartphone size={14} />
                    <span>Mobile Number</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode("dob");
                      setError("");
                    }}
                    className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold transition ${
                      authMode === "dob"
                        ? "bg-white text-purple-700 shadow-sm"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    <CalendarDays size={14} />
                    <span>Date of Birth (DOB)</span>
                  </button>
                </div>
              </div>

              {/* Dynamic Input based on Mode */}
              {authMode === "phone" ? (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
                    Registered Mobile Number
                  </label>
                  <input
                    type="tel"
                    required
                    placeholder="e.g. 98765 43210"
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(e.target.value)}
                    className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-3.5 text-sm font-semibold text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-purple-600 focus:bg-white focus:ring-4 focus:ring-purple-600/10"
                  />
                  <p className="mt-1 text-[11px] text-slate-400">
                    School admission ke waqt diya gaya Parent/Guardian ka 10-digit mobile number.
                  </p>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
                    Student Date of Birth (DOB)
                  </label>
                  <input
                    type="date"
                    required
                    value={dobInput}
                    onChange={(e) => setDobInput(e.target.value)}
                    className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-3.5 text-sm font-semibold text-slate-900 outline-none transition focus:border-purple-600 focus:bg-white focus:ring-4 focus:ring-purple-600/10"
                  />
                  <p className="mt-1 text-[11px] text-slate-400">
                    Bachche ki janmtithi (Date of birth) select karein jo school record me darj hai.
                  </p>
                </div>
              )}

              {/* Remember Me Checkbox */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="rememberMe"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 rounded-md border-slate-300 text-purple-600 focus:ring-purple-500"
                />
                <label htmlFor="rememberMe" className="text-xs font-medium text-slate-600 cursor-pointer">
                  Is phone par login yaad rakhein (Persistent Access)
                </label>
              </div>

              {/* Error Message */}
              {error && (
                <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-700 animate-in fade-in">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 py-4 text-sm font-bold text-white shadow-lg shadow-purple-600/25 transition hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 active:scale-[0.99]"
              >
                {loading ? (
                  <span>Checking Records...</span>
                ) : (
                  <>
                    <span>Student Dashboard Kholein</span>
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </form>

            <div className="mt-6 border-t border-slate-100 pt-5 text-center text-xs text-slate-400 font-medium">
              School Teacher ya Admin hain?{" "}
              <Link href="/login" className="font-bold text-purple-600 hover:underline">
                Staff Login Yahan Karein
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  // ==========================================
  // VIEW 2: LOGGED-IN STUDENT PARENT DASHBOARD
  // ==========================================
  const { student, institute, attendance, attendance_stats, fees, exam_marks, homework, notices } =
    data;
  const fullName = `${student.first_name} ${student.last_name || ""}`.trim();
  const currency = institute.currency || "INR";

  return (
    <main className="min-h-screen bg-slate-50 pb-20 selection:bg-purple-200">
      {/* 1. TOP STICKY APP BAR */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="relative h-10 w-10 shrink-0 rounded-2xl border border-slate-200 bg-purple-50 grid place-items-center overflow-hidden">
              {institute.logo_url ? (
                <img src={institute.logo_url} alt={institute.name} className="h-full w-full object-contain" />
              ) : (
                <Building2 size={20} className="text-purple-700" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="text-sm font-extrabold text-slate-900 line-clamp-1">{institute.name}</h1>
                <span className="rounded-full bg-emerald-100 p-0.5 text-emerald-700" title="Verified School">
                  <ShieldCheck size={13} />
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-medium">EduTechLab Parent Portal</p>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 transition shadow-2xs"
          >
            <LogOut size={13} />
            <span>Switch / Logout</span>
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 pt-6 sm:px-6 space-y-6">
        {/* 2. STUDENT HERO BIO CARD */}
        <div className="overflow-hidden rounded-3xl border border-purple-100 bg-white shadow-xl shadow-purple-900/5">
          <div className="bg-gradient-to-r from-purple-700 via-indigo-700 to-purple-800 p-6 text-white sm:p-8 relative">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
              <div className="flex items-center gap-4">
                {/* Photo or Initials */}
                <div className="relative h-20 w-20 sm:h-24 sm:w-24 shrink-0 rounded-3xl border-4 border-white/20 bg-white/10 shadow-lg backdrop-blur-md overflow-hidden grid place-items-center">
                  {student.photo_url ? (
                    <img src={student.photo_url} alt={fullName} className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-2xl sm:text-3xl font-black text-white uppercase">
                      {student.first_name[0]}
                      {student.last_name ? student.last_name[0] : ""}
                    </span>
                  )}
                </div>

                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-emerald-400/20 px-2.5 py-0.5 text-[10px] font-black uppercase text-emerald-200 border border-emerald-400/30">
                      ● {student.status} Student
                    </span>
                    {student.blood_group && (
                      <span className="rounded-full bg-rose-400/20 px-2 py-0.5 text-[10px] font-bold text-rose-200 border border-rose-400/30 flex items-center gap-1">
                        <Droplet size={10} /> {student.blood_group}
                      </span>
                    )}
                  </div>
                  <h2 className="mt-1 text-2xl sm:text-3xl font-black tracking-tight text-white">{fullName}</h2>
                  <p className="mt-1 text-xs text-white/80 font-medium">
                    Admission No: <strong className="font-mono text-white">{student.admission_no}</strong>
                    {student.roll_no ? ` • Roll No: ${student.roll_no}` : ""}
                  </p>
                  <p className="text-xs text-purple-200 font-semibold mt-0.5">
                    Class: <strong>{student.class_name}</strong> (Section {student.section_name})
                  </p>
                </div>
              </div>

              {/* Parents Bio */}
              <div className="rounded-2xl bg-white/10 p-4 backdrop-blur-sm text-xs text-white/90 space-y-1 sm:text-right border border-white/10">
                {student.father_name && (
                  <div>
                    <span className="text-white/60">Father:</span> <strong>{student.father_name}</strong>
                  </div>
                )}
                {student.mother_name && (
                  <div>
                    <span className="text-white/60">Mother:</span> <strong>{student.mother_name}</strong>
                  </div>
                )}
                {student.date_of_birth && (
                  <div>
                    <span className="text-white/60">DOB:</span> <strong>{student.date_of_birth}</strong>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 4 HIGH IMPACT METRIC PILLS */}
          <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-100 bg-slate-50/70 text-slate-800">
            {/* 1. Overall Attendance */}
            <div className="p-4 sm:p-5 text-center">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                Overall Attendance
              </span>
              <p className="text-2xl sm:text-3xl font-black text-purple-900 mt-1 font-mono">
                {attendance_stats.percentage}%
              </p>
              <p className="text-[11px] text-emerald-600 font-bold mt-0.5">
                {attendance_stats.present} Days Present ({attendance_stats.total_marked} Total)
              </p>
            </div>

            {/* 2. Today's Attendance */}
            <div className="p-4 sm:p-5 text-center">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                Today&apos;s Status
              </span>
              <div className="mt-1">
                {attendance_stats.today === "present" ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-800">
                    <CheckCircle2 size={13} /> Present ✓
                  </span>
                ) : attendance_stats.today === "absent" ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-3 py-1 text-xs font-black text-rose-800">
                    <XCircle size={13} /> Absent ✕
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-3 py-1 text-xs font-bold text-slate-600">
                    Not Marked Yet
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Live from gate / class register</p>
            </div>

            {/* 3. Fee Balance */}
            <div className="p-4 sm:p-5 text-center">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                Pending Fee Dues
              </span>
              <p
                className={`text-2xl sm:text-3xl font-black mt-1 font-mono ${
                  fees.balance > 0 ? "text-amber-600" : "text-emerald-600"
                }`}
              >
                {fees.balance > 0
                  ? `₹${fees.balance.toLocaleString("en-IN")}`
                  : "All Cleared ✓"}
              </p>
              <p className="text-[11px] text-slate-500 font-semibold mt-0.5">
                Total Paid: ₹{fees.total_paid.toLocaleString("en-IN")}
              </p>
            </div>

            {/* 4. Active Homework */}
            <div className="p-4 sm:p-5 text-center">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                Class Homework
              </span>
              <p className="text-2xl sm:text-3xl font-black text-indigo-900 mt-1 font-mono">
                {homework.length} Tasks
              </p>
              <p className="text-[11px] text-indigo-600 font-bold mt-0.5">Daily class dairy updates</p>
            </div>
          </div>
        </div>

        {/* 3. NAVIGATION TAB BAR */}
        <div className="flex overflow-x-auto no-scrollbar gap-2 border-b border-slate-200 pb-2">
          {[
            { id: "overview", label: "Overview", icon: Sparkles },
            { id: "attendance", label: "Attendance Log", icon: Calendar },
            { id: "fees", label: "Fees & Receipts", icon: Wallet },
            { id: "exams", label: "Exam Marksheet", icon: FileText },
            { id: "homework", label: "Daily Homework", icon: BookOpen },
            { id: "notices", label: "School Notices", icon: Bell },
            { id: "idcard", label: "Digital ID Card", icon: QrCode },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-bold transition shrink-0 ${
                  isActive
                    ? "bg-purple-600 text-white shadow-md shadow-purple-600/20"
                    : "bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-slate-200/80"
                }`}
              >
                <Icon size={14} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* 4. TAB CONTENTS */}

        {/* TAB: OVERVIEW (QUICK SUMMARY) */}
        {activeTab === "overview" && (
          <div className="grid gap-6 md:grid-cols-2">
            {/* Card 1: Attendance Highlight */}
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <Calendar size={18} className="text-purple-600" />
                  <h3 className="font-bold text-sm text-slate-900">Recent Attendance Records</h3>
                </div>
                <button
                  onClick={() => setActiveTab("attendance")}
                  className="text-xs font-bold text-purple-600 hover:underline"
                >
                  View All →
                </button>
              </div>

              <div className="mt-4 space-y-2.5">
                {attendance.slice(0, 5).map((att, i) => (
                  <div key={i} className="flex items-center justify-between rounded-2xl bg-slate-50 p-3 text-xs">
                    <span className="font-semibold text-slate-800">{att.date}</span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                        att.status === "present"
                          ? "bg-emerald-100 text-emerald-800"
                          : att.status === "absent"
                          ? "bg-rose-100 text-rose-800"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {att.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Card 2: Latest Homework */}
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <BookOpen size={18} className="text-indigo-600" />
                  <h3 className="font-bold text-sm text-slate-900">Latest Homework / Diary</h3>
                </div>
                <button
                  onClick={() => setActiveTab("homework")}
                  className="text-xs font-bold text-indigo-600 hover:underline"
                >
                  View All →
                </button>
              </div>

              <div className="mt-4 space-y-3">
                {homework.length === 0 ? (
                  <p className="text-xs text-slate-400 py-6 text-center">No recent homework assigned.</p>
                ) : (
                  homework.slice(0, 3).map((hw) => (
                    <div key={hw.id} className="rounded-2xl border border-slate-100 bg-slate-50/50 p-3.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md">
                          {hw.subject}
                        </span>
                        <span className="text-[10px] text-slate-400">{hw.assigned_date}</span>
                      </div>
                      <h4 className="font-bold text-slate-900 mt-1">{hw.title}</h4>
                      <p className="text-slate-600 line-clamp-2 mt-0.5 leading-relaxed">{hw.description}</p>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Card 3: Fee Status & Recent Receipts */}
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:col-span-2">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <Wallet size={18} className="text-emerald-600" />
                  <h3 className="font-bold text-sm text-slate-900">Recent Fee Receipts</h3>
                </div>
                <button
                  onClick={() => setActiveTab("fees")}
                  className="text-xs font-bold text-emerald-600 hover:underline"
                >
                  View All Receipts →
                </button>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {fees.payments.slice(0, 3).map((p) => (
                  <div key={p.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-xs space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-[11px] text-slate-400 font-mono">ID: {p.id.slice(0, 8)}</span>
                      <span className="font-bold text-emerald-700 text-sm">
                        ₹{Number(p.amount).toLocaleString("en-IN")}
                      </span>
                    </div>
                    <div className="text-slate-600">
                      Paid On: <strong>{p.paid_on}</strong> ({p.method.toUpperCase()})
                    </div>
                    <Link
                      href={`/fees/receipt/${p.id}`}
                      target="_blank"
                      className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white py-1.5 font-bold text-slate-700 hover:bg-slate-100 transition"
                    >
                      <Printer size={12} />
                      <span>Download Receipt</span>
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB: ATTENDANCE */}
        {activeTab === "attendance" && (
          <div className="space-y-4">
            <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="border-b border-slate-100 p-5 sm:p-6 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-bold text-base text-slate-900">Daily Attendance Register</h3>
                  <p className="text-xs text-slate-500">School gate scanner aur class teacher dwara recorded data.</p>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="rounded-full bg-emerald-100 px-3 py-1 font-bold text-emerald-800">
                    Present: {attendance_stats.present}
                  </span>
                  <span className="rounded-full bg-rose-100 px-3 py-1 font-bold text-rose-800">
                    Absent: {attendance_stats.absent}
                  </span>
                  <span className="rounded-full bg-amber-100 px-3 py-1 font-bold text-amber-800">
                    Late: {attendance_stats.late}
                  </span>
                </div>
              </div>

              {attendance.length === 0 ? (
                <div className="p-10 text-center text-sm text-slate-400">No attendance marked yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 font-bold uppercase tracking-wider text-slate-400">
                      <tr>
                        <th className="px-6 py-3.5">Date</th>
                        <th className="px-6 py-3.5">Attendance Status</th>
                        <th className="px-6 py-3.5">Teacher Remark</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {attendance.map((att, i) => (
                        <tr key={i} className="hover:bg-slate-50/50">
                          <td className="px-6 py-4 font-semibold text-slate-900">{att.date}</td>
                          <td className="px-6 py-4">
                            {att.status === "present" ? (
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 font-bold text-emerald-800">
                                <CheckCircle2 size={12} /> Present
                              </span>
                            ) : att.status === "absent" ? (
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-3 py-1 font-bold text-rose-800">
                                <XCircle size={12} /> Absent
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 font-bold text-amber-800">
                                <Clock size={12} /> Late
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-slate-500">{att.note || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB: FEES & RECEIPTS */}
        {activeTab === "fees" && (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm text-center">
                <span className="text-xs font-bold uppercase text-slate-400">Total School Fees</span>
                <p className="mt-1 text-2xl sm:text-3xl font-black text-slate-900 font-mono">
                  ₹{fees.total_due.toLocaleString("en-IN")}
                </p>
              </div>

              <div className="rounded-3xl border border-emerald-200 bg-emerald-50/50 p-5 shadow-sm text-center">
                <span className="text-xs font-bold uppercase text-emerald-700">Total Paid</span>
                <p className="mt-1 text-2xl sm:text-3xl font-black text-emerald-700 font-mono">
                  ₹{fees.total_paid.toLocaleString("en-IN")}
                </p>
              </div>

              <div
                className={`rounded-3xl border p-5 shadow-sm text-center ${
                  fees.balance > 0 ? "border-amber-200 bg-amber-50/50" : "border-slate-200 bg-white"
                }`}
              >
                <span className={`text-xs font-bold uppercase ${fees.balance > 0 ? "text-amber-700" : "text-slate-400"}`}>
                  Pending Dues
                </span>
                <p
                  className={`mt-1 text-2xl sm:text-3xl font-black font-mono ${
                    fees.balance > 0 ? "text-amber-700" : "text-slate-900"
                  }`}
                >
                  ₹{fees.balance.toLocaleString("en-IN")}
                </p>
              </div>
            </div>

            {/* Official Receipts Table */}
            <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="border-b border-slate-100 p-5 sm:p-6">
                <h3 className="font-bold text-base text-slate-900">Official Fee Receipts</h3>
                <p className="text-xs text-slate-500">
                  School se generate ki gayi verified digital PDF receipts.
                </p>
              </div>

              {fees.payments.length === 0 ? (
                <div className="p-10 text-center text-sm text-slate-400">No payment receipts found.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 font-bold uppercase tracking-wider text-slate-400">
                      <tr>
                        <th className="px-6 py-3.5">Receipt ID &amp; Date</th>
                        <th className="px-6 py-3.5">Amount</th>
                        <th className="px-6 py-3.5">Payment Mode</th>
                        <th className="px-6 py-3.5">Reference / Txn ID</th>
                        <th className="px-6 py-3.5 text-right">Download</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {fees.payments.map((p) => (
                        <tr key={p.id} className="hover:bg-slate-50/50">
                          <td className="px-6 py-4">
                            <span className="font-bold text-slate-900">{p.paid_on}</span>
                            <span className="block text-[11px] font-mono text-slate-400">ID: {p.id.slice(0, 8)}</span>
                          </td>
                          <td className="px-6 py-4 font-bold text-emerald-700 text-sm">
                            ₹{Number(p.amount).toLocaleString("en-IN")}
                          </td>
                          <td className="px-6 py-4 uppercase font-semibold text-slate-600">{p.method}</td>
                          <td className="px-6 py-4 text-slate-500">{p.reference || "—"}</td>
                          <td className="px-6 py-4 text-right">
                            <Link
                              href={`/fees/receipt/${p.id}`}
                              target="_blank"
                              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-bold text-slate-700 hover:bg-slate-100 transition shadow-2xs"
                            >
                              <Printer size={12} />
                              <span>PDF Receipt</span>
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB: EXAM RESULTS */}
        {activeTab === "exams" && (
          <div className="space-y-4">
            <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="border-b border-slate-100 p-5 sm:p-6">
                <h3 className="font-bold text-base text-slate-900">Examination Results &amp; Marks</h3>
                <p className="text-xs text-slate-500">Subject-wise evaluation marksheet.</p>
              </div>

              {exam_marks.length === 0 ? (
                <div className="p-10 text-center text-sm text-slate-400">No exam results recorded yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 font-bold uppercase tracking-wider text-slate-400">
                      <tr>
                        <th className="px-6 py-3.5">Exam Name</th>
                        <th className="px-6 py-3.5">Subject</th>
                        <th className="px-6 py-3.5">Marks Obtained</th>
                        <th className="px-6 py-3.5">Percentage</th>
                        <th className="px-6 py-3.5">Status</th>
                        <th className="px-6 py-3.5 text-right">Full Marksheet</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {exam_marks.map((m, i) => {
                        const pct = m.max_marks > 0 ? Math.round((Number(m.marks) / Number(m.max_marks)) * 100) : 0;
                        return (
                          <tr key={i} className="hover:bg-slate-50/50">
                            <td className="px-6 py-4 font-bold text-slate-900">{m.exam_name}</td>
                            <td className="px-6 py-4 font-semibold text-slate-700">{m.subject}</td>
                            <td className="px-6 py-4 font-mono font-bold text-slate-900">
                              {m.marks} <span className="text-slate-400 font-normal">/ {m.max_marks}</span>
                            </td>
                            <td className="px-6 py-4 font-bold text-purple-700">{pct}%</td>
                            <td className="px-6 py-4">
                              {pct >= 33 ? (
                                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 font-bold text-emerald-800">
                                  Passed
                                </span>
                              ) : (
                                <span className="rounded-full bg-rose-100 px-2.5 py-0.5 font-bold text-rose-800">
                                  Needs Focus
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-right">
                              {m.exam_id && (
                                <Link
                                  href={`/exams/${m.exam_id}/${student.id}`}
                                  target="_blank"
                                  className="inline-flex items-center gap-1 rounded-xl border border-purple-200 bg-purple-50 px-2.5 py-1 font-bold text-purple-700 hover:bg-purple-100 transition"
                                >
                                  <span>View Report</span>
                                  <ArrowRight size={11} />
                                </Link>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB: DAILY HOMEWORK */}
        {activeTab === "homework" && (
          <div className="space-y-4">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm">
              <h3 className="font-bold text-base text-slate-900">Daily Class Homework &amp; Diary</h3>
              <p className="text-xs text-slate-500">
                Class {student.class_name} ({student.section_name}) ke teachers dwara diya gaya homework.
              </p>

              <div className="mt-5 space-y-3">
                {homework.length === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-400">
                    No homework assigned for this class currently.
                  </div>
                ) : (
                  homework.map((hw) => (
                    <div
                      key={hw.id}
                      className="rounded-2xl border border-slate-200 bg-slate-50/60 p-5 text-xs transition hover:bg-slate-50"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="rounded-lg bg-purple-100 px-3 py-1 font-extrabold text-purple-800">
                          {hw.subject}
                        </span>
                        <div className="text-[11px] text-slate-400">
                          Assigned: <strong>{hw.assigned_date}</strong>
                          {hw.due_date ? ` • Due: ${hw.due_date}` : ""}
                        </div>
                      </div>

                      <h4 className="mt-2 text-sm font-bold text-slate-900">{hw.title}</h4>
                      <p className="mt-1 text-slate-600 leading-relaxed whitespace-pre-wrap">{hw.description}</p>

                      {hw.teacher_name && (
                        <div className="mt-3 text-[11px] text-slate-400">
                          Teacher: <span className="font-medium text-slate-600">{hw.teacher_name}</span>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB: SCHOOL NOTICES */}
        {activeTab === "notices" && (
          <div className="space-y-4">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm">
              <h3 className="font-bold text-base text-slate-900">Official School Circulars &amp; Notices</h3>
              <p className="text-xs text-slate-500">School administration ke dwara jari announcements.</p>

              <div className="mt-5 space-y-4">
                {notices.length === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-400">No active circulars at this time.</div>
                ) : (
                  notices.map((n) => (
                    <div key={n.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span className="font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md">
                          Official Circular
                        </span>
                        <span>{new Date(n.published_at).toLocaleDateString()}</span>
                      </div>
                      <h4 className="mt-2 text-base font-bold text-slate-900">{n.title}</h4>
                      <p className="mt-2 text-xs leading-relaxed text-slate-600 whitespace-pre-wrap">{n.body}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB: DIGITAL ID CARD */}
        {activeTab === "idcard" && (
          <div className="flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-sm rounded-3xl border-2 border-slate-300 bg-white shadow-2xl overflow-hidden">
              {/* Header */}
              <div
                className="p-4 text-white text-center"
                style={{ backgroundColor: institute.primary_color || "#1e293b" }}
              >
                <div className="text-sm font-black uppercase tracking-wider">{institute.name}</div>
                <div className="text-[10px] text-white/80">{institute.address || "Digital Student Identity Card"}</div>
              </div>

              {/* Photo & Details */}
              <div className="p-6 text-center space-y-3">
                <div className="mx-auto h-24 w-24 rounded-2xl border-2 border-slate-200 bg-slate-100 overflow-hidden shadow-sm grid place-items-center">
                  {student.photo_url ? (
                    <img src={student.photo_url} alt={fullName} className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-2xl font-black text-slate-400">{student.first_name[0]}</span>
                  )}
                </div>

                <div>
                  <h3 className="text-lg font-black text-slate-900">{fullName}</h3>
                  <p className="text-xs font-bold text-purple-700">
                    Class: {student.class_name} • Section: {student.section_name}
                  </p>
                </div>

                <div className="rounded-2xl bg-slate-50 p-3 text-xs text-left space-y-1.5 border border-slate-100 font-medium text-slate-700">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Admission No:</span>
                    <strong className="font-mono">{student.admission_no}</strong>
                  </div>
                  {student.roll_no && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">Roll No:</span>
                      <strong>{student.roll_no}</strong>
                    </div>
                  )}
                  {student.father_name && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">Father&apos;s Name:</span>
                      <strong>{student.father_name}</strong>
                    </div>
                  )}
                  {student.date_of_birth && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">DOB:</span>
                      <strong>{student.date_of_birth}</strong>
                    </div>
                  )}
                  {student.blood_group && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">Blood Group:</span>
                      <strong className="text-rose-600">{student.blood_group}</strong>
                    </div>
                  )}
                </div>

                <div className="pt-2">
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                    <ShieldCheck size={12} /> Verified Digital Student Card
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
