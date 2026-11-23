import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function makeBaseLoginId(instituteName: string) {
  const words = instituteName.trim().replace(/[^a-zA-Z0-9\s]+/g, " ").split(/\s+/).filter(Boolean);
  const initials = words.map((word) => word[0]).join("").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return "EDU-" + (initials || "INST").slice(0, 12) + new Date().getFullYear();
}

async function makeUniqueLoginId(admin: any, instituteName: string) {
  const base = makeBaseLoginId(instituteName);
  const { data, error } = await admin.from("profiles").select("login_id").like("login_id", base + "%");
  if (error) throw error;

  const used = new Set((data ?? []).map((row: any) => String(row.login_id ?? "").toUpperCase()).filter(Boolean));
  if (!used.has(base)) return base;

  let number = 2;
  while (used.has(base + "-" + number)) number++;
  return base + "-" + number;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const instituteName = String(body.instituteName ?? "").trim();
    const instituteType = String(body.instituteType ?? "school").trim();
    const address = String(body.address ?? "").trim();
    const phone = String(body.phone ?? "").trim();
    const instituteEmail = String(body.instituteEmail ?? "").trim();
    const adminName = String(body.adminName ?? "").trim();
    const adminEmail = String(body.adminEmail ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const referralCode = body.referralCode ? String(body.referralCode).trim().toUpperCase() : null;

    if (!instituteName || !adminName || !adminEmail || password.length < 8) {
      return NextResponse.json(
        { error: "Please complete all required fields. Password must be at least 8 characters." },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    let loginId = await makeUniqueLoginId(admin, instituteName);

    const { data: userData, error: userError } = await admin.auth.admin.createUser({
      email: adminEmail,
      password,
      email_confirm: true,
      user_metadata: { full_name: adminName },
    });

    if (userError || !userData.user) {
      return NextResponse.json(
        { error: userError?.message ?? "Could not create the admin account." },
        { status: 400 }
      );
    }

    const userId = userData.user.id;
    const slugBase = instituteName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "institute";
    const slug = slugBase + "-" + loginId.replace(/^EDU-/, "").toLowerCase();

    const { data: org, error: orgError } = await admin
      .from("organizations")
      .insert({ name: instituteName, slug })
      .select("id")
      .single();

    if (orgError || !org) {
      await admin.auth.admin.deleteUser(userId);
      return NextResponse.json(
        { error: orgError?.message ?? "Could not create the institute workspace." },
        { status: 400 }
      );
    }

    let profileError: any = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const result = await admin.from("profiles").insert({
        id: userId,
        organization_id: org.id,
        full_name: adminName,
        role: "owner",
        login_id: loginId,
      });

      profileError = result.error;
      if (!profileError) break;

      if (profileError.code !== "23505" || !profileError.message.includes("login_id")) break;
      loginId = await makeUniqueLoginId(admin, instituteName);
    }

    if (profileError) {
      await admin.from("organizations").delete().eq("id", org.id);
      await admin.auth.admin.deleteUser(userId);
      return NextResponse.json({ error: profileError.message }, { status: 400 });
    }

    const { error: settingsError } = await admin.from("organization_settings").insert({
      organization_id: org.id,
      institute_type: instituteType,
      phone,
      email: instituteEmail || adminEmail,
      address,
    });

    if (settingsError) {
      await admin.from("profiles").delete().eq("id", userId);
      await admin.from("organizations").delete().eq("id", org.id);
      await admin.auth.admin.deleteUser(userId);
      return NextResponse.json({ error: settingsError.message }, { status: 400 });
    }

    // Attach referral code if provided
    if (referralCode) {
      try {
        await admin.rpc("attach_referral_to_institute", {
          p_org_id: org.id,
          p_ref_code: referralCode,
        });
      } catch (refErr) {
        console.warn("Could not attach referral code:", refErr);
      }
    }

    return NextResponse.json({ loginId, instituteName, adminName, organizationId: org.id });
  } catch (error: any) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Registration failed." },
      { status: 500 }
    );
  }
}
