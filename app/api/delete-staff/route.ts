import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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
        { error: "Only institute Owner or Admin can delete staff accounts." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const staffId = String(body.staffId ?? "").trim();
    if (!staffId) {
      return NextResponse.json({ error: "Staff ID is required." }, { status: 400 });
    }

    if (staffId === user.id) {
      return NextResponse.json({ error: "You cannot delete your own account." }, { status: 400 });
    }

    const { data: targetProfile, error: targetError } = await admin
      .from("profiles")
      .select("id, organization_id, role, full_name")
      .eq("id", staffId)
      .maybeSingle();

    if (targetError || !targetProfile) {
      return NextResponse.json({ error: "Staff profile not found." }, { status: 404 });
    }

    if (targetProfile.organization_id !== callerProfile.organization_id) {
      return NextResponse.json(
        { error: "Cannot delete staff from another institution." },
        { status: 403 }
      );
    }

    await admin.from("profiles").delete().eq("id", staffId);
    await admin.auth.admin.deleteUser(staffId);

    return NextResponse.json({
      success: true,
      message: `Staff member "${targetProfile.full_name}" has been deleted.`,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to delete staff" }, { status: 500 });
  }
}
