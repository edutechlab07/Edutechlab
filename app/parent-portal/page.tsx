"use client";

import { useState, useEffect, useRef } from "react";
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
  Award,
  Eye,
  X,
  Download,
  Share2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type SubjectRow = {
  subject: string;
  marks: number | null;
  max_marks: number;
  pass_marks: number;
  percentage: number | null;
  grade: string;
  remark: string;
  status: "pass" | "fail" | "pending";
};

type ReportCard = {
  exam_id: string;
  exam_name: string;
  exam_date: string | null;
  session_name: string;
  has_marks: boolean;
  total_obtained: number | null;
  total_max: number;
  percentage: number | null;
  grade: string;
  remark: string;
  result: string;
  subjects: SubjectRow[];
};

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
    marksheet_title: string;
    authorized_signatory: string;
    grading_scale: Array<{ min: number; grade: string; remark: string }>;
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
  report_cards: ReportCard[];
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
    "overview" | "reportcards" | "attendance" | "fees" | "homework" | "notices" | "idcard"
  >("overview");

  // Selected report card modal
  const [selectedReportCard, setSelectedReportCard] = useState<ReportCard | null>(null);
  const [logoError, setLogoError] = useState(false);

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
      setLogoError(false);

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
    setSelectedReportCard(null);
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch {}
  };

  const handlePrint = () => {
    window.print();
  };

  // Helper for School Initials
  const getInitials = (name: string) => {
    return name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join("");
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
  const { student, institute, attendance, attendance_stats, fees, report_cards, homework, notices } =
    data;
  const fullName = `${student.first_name} ${student.last_name || ""}`.trim();
  const currency = institute.currency || "INR";
  const initials = getInitials(institute.name);

  return (
    <main className="min-h-screen bg-slate-50 pb-20 selection:bg-purple-200">
      {/* 1. TOP STICKY APP BAR */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            {/* School Logo with Robust Fallback */}
            <div className="relative h-11 w-11 shrink-0 rounded-2xl border border-slate-200 bg-white shadow-xs p-1 grid place-items-center overflow-hidden">
              {institute.logo_url && !logoError ? (
                <img
                  src={institute.logo_url}
                  alt={institute.name}
                  className="h-full w-full object-contain rounded-xl"
                  onError={() => setLogoError(true)}
                />
              ) : (
                <div
                  className="h-full w-full rounded-xl flex items-center justify-center font-black text-xs text-white shadow-inner"
                  style={{ backgroundColor: institute.primary_color || "#7c3aed" }}
                >
                  {initials || "SCH"}
                </div>
              )}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="text-sm font-extrabold text-slate-900 line-clamp-1">{institute.name}</h1>
                <span className="rounded-full bg-emerald-100 p-0.5 text-emerald-700" title="Verified School">
                  <ShieldCheck size={13} />
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-medium line-clamp-1">
                {institute.address || "Official Parent & Student Academic Portal"}
              </p>
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
                {fees.balance > 0 ? `₹${fees.balance.toLocaleString("en-IN")}` : "All Cleared ✓"}
              </p>
              <p className="text-[11px] text-slate-500 font-semibold mt-0.5">
                Total Paid: ₹{fees.total_paid.toLocaleString("en-IN")}
              </p>
            </div>

            {/* 4. Report Cards Status */}
            <div className="p-4 sm:p-5 text-center">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                Exams &amp; Results
              </span>
              <p className="text-2xl sm:text-3xl font-black text-indigo-900 mt-1 font-mono">
                {report_cards.length} Exams
              </p>
              <button
                onClick={() => setActiveTab("reportcards")}
                className="text-[11px] text-purple-700 font-extrabold mt-0.5 hover:underline"
              >
                View Report Cards →
              </button>
            </div>
          </div>
        </div>

        {/* 3. NAVIGATION TAB BAR */}
        <div className="flex overflow-x-auto no-scrollbar gap-2 border-b border-slate-200 pb-2">
          {[
            { id: "overview", label: "Overview", icon: Sparkles },
            { id: "reportcards", label: "Report Cards & Marksheets 📜", icon: Award },
            { id: "attendance", label: "Attendance Log", icon: Calendar },
            { id: "fees", label: "Fees & Receipts", icon: Wallet },
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

        {/* TAB 1: OVERVIEW */}
        {activeTab === "overview" && (
          <div className="grid gap-6 md:grid-cols-2">
            {/* Card 1: Exam & Marksheet Highlight */}
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:col-span-2">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <Award size={20} className="text-purple-600" />
                  <div>
                    <h3 className="font-bold text-sm text-slate-900">Student Academic Report Cards</h3>
                    <p className="text-xs text-slate-500">Official statement of marks & evaluation scorecards</p>
                  </div>
                </div>
                <button
                  onClick={() => setActiveTab("reportcards")}
                  className="text-xs font-bold text-purple-600 hover:underline"
                >
                  View All Exams ({report_cards.length}) →
                </button>
              </div>

              {report_cards.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">
                  School administration dwara abhi tak koi exam register nahi kiya gaya hai.
                </div>
              ) : (
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  {report_cards.slice(0, 2).map((rc) => (
                    <div
                      key={rc.exam_id}
                      className="rounded-2xl border border-purple-100 bg-gradient-to-br from-purple-50/50 via-white to-slate-50 p-5 shadow-xs flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-[10px] font-black uppercase text-purple-800">
                            {rc.session_name}
                          </span>
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                              rc.result === "PASSED"
                                ? "bg-emerald-100 text-emerald-800"
                                : rc.has_marks
                                ? "bg-amber-100 text-amber-800"
                                : "bg-slate-200 text-slate-600"
                            }`}
                          >
                            {rc.result}
                          </span>
                        </div>

                        <h4 className="mt-3 text-lg font-black text-slate-900">{rc.exam_name}</h4>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {rc.exam_date ? `Exam Date: ${rc.exam_date}` : "Evaluation Examination"}
                        </p>

                        <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-white p-3 text-center border border-slate-100">
                          <div>
                            <span className="text-[10px] font-bold uppercase text-slate-400">Marks</span>
                            <p className="font-mono font-black text-slate-900 text-sm">
                              {rc.has_marks ? `${rc.total_obtained}/${rc.total_max}` : "—"}
                            </p>
                          </div>
                          <div>
                            <span className="text-[10px] font-bold uppercase text-slate-400">Percentage</span>
                            <p className="font-mono font-black text-purple-700 text-sm">
                              {rc.has_marks ? `${rc.percentage}%` : "—"}
                            </p>
                          </div>
                          <div>
                            <span className="text-[10px] font-bold uppercase text-slate-400">Grade</span>
                            <p className="font-mono font-black text-emerald-700 text-sm">{rc.grade}</p>
                          </div>
                        </div>
                      </div>

                      <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between">
                        <button
                          type="button"
                          onClick={() => setSelectedReportCard(rc)}
                          className="inline-flex items-center gap-1.5 text-xs font-bold text-purple-700 hover:text-purple-900 transition"
                        >
                          <Eye size={14} />
                          <span>View Official Marksheet</span>
                        </button>
                        <span className="text-[11px] text-slate-400 font-medium">
                          {rc.subjects.length} Subjects
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Card 2: Attendance Highlight */}
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

            {/* Card 3: Latest Homework */}
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
          </div>
        )}

        {/* TAB 2: COMPLETE REPORT CARDS & MARKSHEETS */}
        {activeTab === "reportcards" && (
          <div className="space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="rounded-full bg-purple-100 px-3 py-1 text-xs font-extrabold uppercase text-purple-800">
                  Official Academic Scorecards
                </span>
                <h3 className="text-xl font-black text-slate-900 mt-2">
                  {institute.marksheet_title || "Statement of Marks & Report Cards"}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Aapke bachche ke har exam ke subject-wise marks aur digital report card.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-500">
                  Total Exams Registered: <strong>{report_cards.length}</strong>
                </span>
              </div>
            </div>

            {report_cards.length === 0 ? (
              <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center">
                <Award size={40} className="mx-auto text-slate-300" />
                <h4 className="mt-3 font-bold text-slate-800">No Exam Records Found</h4>
                <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
                  School administration dwara abhi tak marks publish nahi kiye gaye hain. Jaise hi exam results finalize honge, yahan live show ho jayenge.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {report_cards.map((rc) => (
                  <div
                    key={rc.exam_id}
                    className="overflow-hidden rounded-3xl border border-purple-200 bg-white shadow-lg shadow-purple-900/5 transition hover:shadow-xl"
                  >
                    {/* Exam Card Header */}
                    <div className="border-b border-purple-100 bg-gradient-to-r from-purple-50 via-slate-50 to-indigo-50 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="rounded-lg bg-purple-600 px-2.5 py-1 text-xs font-black uppercase text-white shadow-xs">
                            {rc.session_name}
                          </span>
                          <span
                            className={`rounded-lg px-2.5 py-1 text-xs font-bold ${
                              rc.result === "PASSED"
                                ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                                : rc.has_marks
                                ? "bg-amber-100 text-amber-800 border border-amber-200"
                                : "bg-slate-200 text-slate-600"
                            }`}
                          >
                            ● {rc.result}
                          </span>
                        </div>
                        <h4 className="mt-2 text-xl font-black text-slate-900">{rc.exam_name}</h4>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {rc.exam_date ? `Examination Date: ${rc.exam_date}` : "Class Evaluation Test"}
                        </p>
                      </div>

                      {/* Top Action Buttons */}
                      <div className="flex items-center gap-2.5">
                        <button
                          type="button"
                          onClick={() => setSelectedReportCard(rc)}
                          className="inline-flex items-center gap-2 rounded-2xl bg-purple-600 px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-purple-600/25 hover:bg-purple-700 transition"
                        >
                          <Eye size={14} />
                          <span>View Official Marksheet</span>
                        </button>
                      </div>
                    </div>

                    {/* Summary Metric Ribbon */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-100 border-b border-slate-100 bg-white text-center p-3 sm:p-0">
                      <div className="p-4">
                        <span className="text-[10px] font-bold uppercase text-slate-400">Total Marks</span>
                        <p className="font-mono font-black text-slate-900 text-xl mt-0.5">
                          {rc.has_marks ? `${rc.total_obtained} / ${rc.total_max}` : "Evaluation Pending"}
                        </p>
                      </div>
                      <div className="p-4">
                        <span className="text-[10px] font-bold uppercase text-slate-400">Aggregate %</span>
                        <p className="font-mono font-black text-purple-700 text-xl mt-0.5">
                          {rc.has_marks ? `${rc.percentage}%` : "—"}
                        </p>
                      </div>
                      <div className="p-4">
                        <span className="text-[10px] font-bold uppercase text-slate-400">Overall Grade</span>
                        <p className="font-mono font-black text-emerald-700 text-xl mt-0.5">{rc.grade}</p>
                      </div>
                      <div className="p-4">
                        <span className="text-[10px] font-bold uppercase text-slate-400">Teacher Remark</span>
                        <p className="font-bold text-slate-700 text-xs mt-1.5">{rc.remark}</p>
                      </div>
                    </div>

                    {/* Detailed Subject Marks Table */}
                    <div className="p-6">
                      <h5 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 mb-3">
                        Subject-wise Performance Breakdown
                      </h5>

                      <div className="overflow-x-auto rounded-2xl border border-slate-100">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-50 font-bold uppercase text-slate-400 border-b border-slate-100">
                            <tr>
                              <th className="px-5 py-3">Subject</th>
                              <th className="px-5 py-3 text-center">Marks Obtained</th>
                              <th className="px-5 py-3 text-center">Max Marks</th>
                              <th className="px-5 py-3 text-center">Pass Marks</th>
                              <th className="px-5 py-3 text-center">Percentage</th>
                              <th className="px-5 py-3 text-center">Grade</th>
                              <th className="px-5 py-3 text-right">Result</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {rc.subjects.map((sub, idx) => (
                              <tr key={idx} className="hover:bg-slate-50/50">
                                <td className="px-5 py-3.5 font-bold text-slate-900">{sub.subject}</td>
                                <td className="px-5 py-3.5 text-center font-mono font-extrabold text-slate-900 text-sm">
                                  {sub.marks !== null ? sub.marks : <span className="text-slate-400 font-normal">—</span>}
                                </td>
                                <td className="px-5 py-3.5 text-center font-mono text-slate-500">{sub.max_marks}</td>
                                <td className="px-5 py-3.5 text-center font-mono text-slate-400">{sub.pass_marks}</td>
                                <td className="px-5 py-3.5 text-center font-mono font-bold text-purple-700">
                                  {sub.percentage !== null ? `${sub.percentage}%` : "—"}
                                </td>
                                <td className="px-5 py-3.5 text-center font-mono font-bold text-emerald-700">
                                  {sub.grade}
                                </td>
                                <td className="px-5 py-3.5 text-right">
                                  {sub.status === "pass" ? (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800">
                                      <CheckCircle2 size={11} /> Pass
                                    </span>
                                  ) : sub.status === "fail" ? (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-[10px] font-bold text-rose-800">
                                      <XCircle size={11} /> Needs Focus
                                    </span>
                                  ) : (
                                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                                      Pending
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Bottom Footer with Signatory note */}
                      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400 pt-3 border-t border-slate-100">
                        <span>
                          Official Signatory: <strong>{institute.authorized_signatory}</strong>
                        </span>
                        <span className="font-semibold text-emerald-700">
                          ✓ Verified by {institute.name} Academic Cell
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: ATTENDANCE */}
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

        {/* TAB 4: FEES & RECEIPTS */}
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

        {/* TAB 5: DAILY HOMEWORK */}
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

        {/* TAB 6: SCHOOL NOTICES */}
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

        {/* TAB 7: DIGITAL ID CARD */}
        {activeTab === "idcard" && (
          <div className="flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-sm rounded-3xl border-2 border-slate-300 bg-white shadow-2xl overflow-hidden">
              {/* Header */}
              <div
                className="p-4 text-white text-center flex items-center justify-between"
                style={{ backgroundColor: institute.primary_color || "#1e293b" }}
              >
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-white p-0.5 overflow-hidden grid place-items-center">
                    {institute.logo_url && !logoError ? (
                      <img src={institute.logo_url} alt={institute.name} className="h-full w-full object-contain" />
                    ) : (
                      <span className="font-black text-xs text-slate-900">{initials}</span>
                    )}
                  </div>
                  <div className="text-left">
                    <div className="text-xs font-black uppercase tracking-wider line-clamp-1">{institute.name}</div>
                    <div className="text-[9px] text-white/80 line-clamp-1">{institute.address || "Identity Card"}</div>
                  </div>
                </div>
                <span className="rounded-full bg-emerald-400/20 px-2 py-0.5 text-[9px] font-bold text-emerald-300 border border-emerald-400/30">
                  Verified
                </span>
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

      {/* ============================================================ */}
      {/* 5. FULL-SCREEN LUXURY OFFICIAL MARKSHEET MODAL (PRINT READY) */}
      {/* ============================================================ */}
      {selectedReportCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4 backdrop-blur-sm overflow-y-auto print:p-0 print:bg-white print:static">
          <div className="relative w-full max-w-4xl rounded-3xl bg-white shadow-2xl overflow-hidden my-auto print:shadow-none print:border-none print:w-full print:max-w-none">
            {/* Modal Controls Bar (Hidden during Print) */}
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-100 px-6 py-3.5 print:hidden">
              <div className="flex items-center gap-2">
                <Award size={18} className="text-purple-700" />
                <span className="font-bold text-xs text-slate-800">
                  Official Statement of Marks — {selectedReportCard.exam_name}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrint}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-purple-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-purple-700 transition"
                >
                  <Printer size={13} />
                  <span>Print Marksheet (A4)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedReportCard(null)}
                  className="grid h-8 w-8 place-items-center rounded-xl bg-slate-200 text-slate-700 hover:bg-slate-300 transition"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* PRINTABLE MARKSHEET CONTAINER */}
            <div className="p-6 sm:p-10 border-8 border-double border-amber-600/30 bg-gradient-to-b from-amber-50/20 via-white to-amber-50/20 relative">
              {/* Security Watermark in background */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.03] select-none">
                <GraduationCap size={400} />
              </div>

              {/* 1. School Header */}
              <div className="text-center border-b-2 border-amber-700/30 pb-6">
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-2xl border-2 border-amber-600/40 p-1.5 bg-white shadow-sm grid place-items-center overflow-hidden shrink-0">
                    {institute.logo_url && !logoError ? (
                      <img src={institute.logo_url} alt={institute.name} className="h-full w-full object-contain" />
                    ) : (
                      <div
                        className="h-full w-full rounded-xl flex items-center justify-center font-black text-base text-white"
                        style={{ backgroundColor: institute.primary_color || "#7c3aed" }}
                      >
                        {initials}
                      </div>
                    )}
                  </div>
                  <div>
                    <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-slate-900">
                      {institute.name}
                    </h2>
                    <p className="text-xs text-slate-600 font-medium max-w-xl mx-auto mt-0.5">
                      {institute.address || "Affiliated Educational Institution"}
                      {institute.phone ? ` • Contact: ${institute.phone}` : ""}
                    </p>
                    <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-amber-600/50 bg-amber-50 px-4 py-1 text-xs font-black uppercase tracking-wider text-amber-900 shadow-2xs">
                      <span>{institute.marksheet_title || "Official Statement of Marks"}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex justify-center items-center gap-4 text-xs font-bold text-slate-600">
                  <span>Examination: <strong>{selectedReportCard.exam_name}</strong></span>
                  <span>•</span>
                  <span>Academic Session: <strong>{selectedReportCard.session_name}</strong></span>
                  {selectedReportCard.exam_date && (
                    <>
                      <span>•</span>
                      <span>Date: <strong>{selectedReportCard.exam_date}</strong></span>
                    </>
                  )}
                </div>
              </div>

              {/* 2. Student Information Table */}
              <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 text-xs text-slate-800">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <span className="text-slate-400 block text-[10px] font-bold uppercase">Student Name</span>
                    <strong className="text-sm font-black text-slate-900">{fullName}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] font-bold uppercase">Admission Number</span>
                    <strong className="font-mono text-sm font-black text-purple-900">
                      {student.admission_no}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] font-bold uppercase">Class &amp; Section</span>
                    <strong className="font-bold text-slate-900">
                      {student.class_name} {student.section_name ? `(${student.section_name})` : ""}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] font-bold uppercase">Roll Number</span>
                    <strong className="font-bold text-slate-900">{student.roll_no || "—"}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] font-bold uppercase">Father&apos;s Name</span>
                    <strong className="font-semibold text-slate-800">{student.father_name || "—"}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] font-bold uppercase">Mother&apos;s Name</span>
                    <strong className="font-semibold text-slate-800">{student.mother_name || "—"}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] font-bold uppercase">Date of Birth</span>
                    <strong className="font-semibold text-slate-800">{student.date_of_birth || "—"}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] font-bold uppercase">Enrollment Status</span>
                    <span className="inline-block rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-800">
                      Active
                    </span>
                  </div>
                </div>
              </div>

              {/* 3. Official Marks Table */}
              <div className="mt-6 overflow-hidden rounded-2xl border-2 border-slate-900">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900 text-white font-extrabold uppercase text-[11px] tracking-wider">
                    <tr>
                      <th className="px-5 py-3.5 border-r border-slate-800">Sr.</th>
                      <th className="px-5 py-3.5 border-r border-slate-800">Subject</th>
                      <th className="px-5 py-3.5 text-center border-r border-slate-800">Max Marks</th>
                      <th className="px-5 py-3.5 text-center border-r border-slate-800">Pass Marks</th>
                      <th className="px-5 py-3.5 text-center border-r border-slate-800">Marks Obtained</th>
                      <th className="px-5 py-3.5 text-center border-r border-slate-800">Grade</th>
                      <th className="px-5 py-3.5 text-right">Result</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {selectedReportCard.subjects.map((sub, idx) => (
                      <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                        <td className="px-5 py-3 border-r border-slate-200 text-slate-400 font-mono">
                          {String(idx + 1).padStart(2, "0")}
                        </td>
                        <td className="px-5 py-3 border-r border-slate-200 font-bold text-slate-900">
                          {sub.subject}
                        </td>
                        <td className="px-5 py-3 text-center border-r border-slate-200 font-mono text-slate-600">
                          {sub.max_marks}
                        </td>
                        <td className="px-5 py-3 text-center border-r border-slate-200 font-mono text-slate-400">
                          {sub.pass_marks}
                        </td>
                        <td className="px-5 py-3 text-center border-r border-slate-200 font-mono font-black text-slate-900 text-sm">
                          {sub.marks !== null ? sub.marks : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-5 py-3 text-center border-r border-slate-200 font-mono font-black text-emerald-800">
                          {sub.grade}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <span
                            className={`font-black uppercase text-[11px] ${
                              sub.status === "pass" ? "text-emerald-700" : "text-rose-600"
                            }`}
                          >
                            {sub.status === "pass" ? "PASSED" : "NEEDS FOCUS"}
                          </span>
                        </td>
                      </tr>
                    ))}

                    {/* GRAND TOTAL ROW */}
                    <tr className="bg-amber-100/60 font-black text-slate-900 text-sm border-t-2 border-slate-900">
                      <td colSpan={2} className="px-5 py-3.5 border-r border-slate-300 uppercase">
                        Grand Aggregate Total
                      </td>
                      <td className="px-5 py-3.5 text-center border-r border-slate-300 font-mono">
                        {selectedReportCard.total_max}
                      </td>
                      <td className="px-5 py-3.5 text-center border-r border-slate-300 font-mono text-slate-400">
                        —
                      </td>
                      <td className="px-5 py-3.5 text-center border-r border-slate-300 font-mono text-purple-950 text-base">
                        {selectedReportCard.has_marks ? selectedReportCard.total_obtained : "Pending"}
                      </td>
                      <td className="px-5 py-3.5 text-center border-r border-slate-300 font-mono text-emerald-900 text-base">
                        {selectedReportCard.grade}
                      </td>
                      <td className="px-5 py-3.5 text-right font-black uppercase text-emerald-800">
                        {selectedReportCard.result}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* 4. Score Performance Highlights */}
              <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div className="rounded-2xl border border-slate-200 bg-white p-3">
                  <span className="text-[10px] font-bold uppercase text-slate-400">Total Marks</span>
                  <p className="font-mono font-black text-slate-900 text-lg">
                    {selectedReportCard.has_marks
                      ? `${selectedReportCard.total_obtained} / ${selectedReportCard.total_max}`
                      : "—"}
                  </p>
                </div>
                <div className="rounded-2xl border border-purple-200 bg-purple-50 p-3">
                  <span className="text-[10px] font-bold uppercase text-purple-700">Percentage</span>
                  <p className="font-mono font-black text-purple-900 text-lg">
                    {selectedReportCard.has_marks ? `${selectedReportCard.percentage}%` : "—"}
                  </p>
                </div>
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
                  <span className="text-[10px] font-bold uppercase text-emerald-700">Overall Grade</span>
                  <p className="font-mono font-black text-emerald-900 text-lg">{selectedReportCard.grade}</p>
                </div>
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
                  <span className="text-[10px] font-bold uppercase text-amber-800">Evaluation Result</span>
                  <p className="font-black text-amber-950 text-sm mt-1">{selectedReportCard.result}</p>
                </div>
              </div>

              {/* 5. Grading Scale & Signatories */}
              <div className="mt-8 pt-6 border-t-2 border-slate-200 flex flex-col sm:flex-row justify-between items-end gap-6 text-xs text-slate-600">
                <div className="text-left space-y-1">
                  <span className="font-bold uppercase tracking-wider text-slate-400 text-[10px]">
                    CBSE 8-Point Grading System
                  </span>
                  <div className="flex flex-wrap gap-1.5 text-[10px] text-slate-500 font-mono">
                    <span className="bg-slate-100 px-1.5 py-0.5 rounded">A1: 91-100%</span>
                    <span className="bg-slate-100 px-1.5 py-0.5 rounded">A2: 81-90%</span>
                    <span className="bg-slate-100 px-1.5 py-0.5 rounded">B1: 71-80%</span>
                    <span className="bg-slate-100 px-1.5 py-0.5 rounded">B2: 61-70%</span>
                    <span className="bg-slate-100 px-1.5 py-0.5 rounded">C1: 51-60%</span>
                    <span className="bg-slate-100 px-1.5 py-0.5 rounded">C2: 41-50%</span>
                    <span className="bg-slate-100 px-1.5 py-0.5 rounded">D: 33-40%</span>
                  </div>
                </div>

                {/* Signatures */}
                <div className="flex items-center gap-8 text-center pt-8">
                  <div>
                    <div className="h-10 w-28 border-b-2 border-dotted border-slate-400 mx-auto" />
                    <span className="mt-1 block text-[11px] font-bold text-slate-600">Class Teacher</span>
                  </div>

                  <div>
                    <div className="h-10 w-28 border-b-2 border-dotted border-slate-400 mx-auto" />
                    <span className="mt-1 block text-[11px] font-bold text-slate-600">Exam Controller</span>
                  </div>

                  <div>
                    <div className="h-10 w-32 border-b-2 border-slate-900 mx-auto" />
                    <span className="mt-1 block text-[11px] font-black text-slate-900">
                      {institute.authorized_signatory || "Principal / Headmaster"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Watermark security note */}
              <div className="mt-6 pt-3 border-t border-slate-100 text-center text-[10px] text-slate-400 font-medium">
                This is a digitally generated Official Statement of Marks powered by EduTechLab. For any discrepancy, please contact the school office.
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
