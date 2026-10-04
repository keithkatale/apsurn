import { randomBytes, randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { GUEST_EMAIL_SUFFIX, GUEST_ID_COOKIE, isGuestUser } from "@/lib/auth/guest";

export async function POST() {
  const supabase = await createClient();
  const { data: existing } = await supabase.auth.getUser();
  if (existing.user) {
    return NextResponse.json({ ok: true, guest: isGuestUser(existing.user), userId: existing.user.id });
  }

  const email = `g-${randomUUID()}@${GUEST_EMAIL_SUFFIX.slice(1)}`;
  const password = randomBytes(24).toString("base64url");
  const admin = createAdminClient();
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { guest: true },
  });
  if (created.error || !created.data.user) {
    console.error("[auth/guest]", created.error?.message);
    return NextResponse.json({ error: "Could not start setup." }, { status: 500 });
  }

  const signedIn = await supabase.auth.signInWithPassword({ email, password });
  if (signedIn.error || !signedIn.data.user) {
    console.error("[auth/guest] sign-in", signedIn.error?.message);
    return NextResponse.json({ error: "Could not start setup." }, { status: 500 });
  }

  const response = NextResponse.json({ ok: true, guest: true, userId: signedIn.data.user.id });
  response.cookies.set(GUEST_ID_COOKIE, signedIn.data.user.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
