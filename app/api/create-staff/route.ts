import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function generateStaffLoginId(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let randomPart = "";
  for (let i = 0; i < 8; i++) {
    randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `STAFF-${randomPart}`;
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const {
      data: { user },
      error: userAuthError,
    } = await userClient.auth.getUser();

    if (userAuthError || !user) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: callerProfile, error: callerError } = await admin
      .from("profiles")
      .select("organization_id, role")
      .eq("id", user.id)
      .single();

    if (callerError || !callerProfile || !["owner", "admin"].includes(callerProfile.role)) {
      return NextResponse.json(
        { error: "Only institute Owner or Admin can create staff accounts." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const fullName = String(body.fullName ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const role = String(body.role ?? "teacher").trim().toLowerCase();

    if (!fullName || !email || password.length < 8) {
      return NextResponse.json(
        { error: "Full name, valid email, and at least 8 character password required." },
        { status: 400 }
      );
    }

    let staffLoginId = generateStaffLoginId();

    const { data: newUserData, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

    if (createError || !newUserData.user) {
      return NextResponse.json(
        { error: createError?.message ?? "Could not create user." },
        { status: 400 }
      );
    }

    const newUserId = newUserData.user.id;

    const { error: profileError } = await admin.from("profiles").insert({
      id: newUserId,
      organization_id: callerProfile.organization_id,
      full_name: fullName,
      role,
      login_id: staffLoginId,
      is_active: true,
    });

    if (profileError) {
      await admin.auth.admin.deleteUser(newUserId);
      return NextResponse.json({ error: profileError.message }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      staffId: newUserId,
      loginId: staffLoginId,
      fullName,
      email,
      role,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to create staff" }, { status: 500 });
  }
}
