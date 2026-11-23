import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  try {
    const { loginId } = await req.json();
    const normalized = String(loginId ?? "").trim().toUpperCase();

    if (!normalized) {
      return NextResponse.json({ error: "Invalid login ID." }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: profile, error } = await admin
      .from("profiles")
      .select("id, full_name, is_active, organization_id, organizations(is_active, status)")
      .eq("login_id", normalized)
      .maybeSingle();

    if (error || !profile) {
      return NextResponse.json(
        { error: normalized.startsWith("STAFF-") ? "Staff ID or password is incorrect." : "Institute ID or password is incorrect." },
        { status: 401 }
      );
    }

    if (profile.is_active === false) {
      return NextResponse.json(
        { error: "This account has been deactivated. Please contact your administrator." },
        { status: 403 }
      );
    }

    const org = (profile as any)?.organizations;
    if (org && (org.is_active === false || org.status === "suspended")) {
      return NextResponse.json(
        { error: "This institution has been suspended by the platform administrator. Please contact EduTechLab support." },
        { status: 403 }
      );
    }

    const { data: userData, error: userError } = await admin.auth.admin.getUserById(profile.id);
    if (userError || !userData.user?.email) {
      return NextResponse.json({ error: "Account could not be found." }, { status: 401 });
    }

    return NextResponse.json({ email: userData.user.email });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Unable to resolve login ID." }, { status: 500 });
  }
}
