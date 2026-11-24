import { after } from "next/server";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { sendResendEmail } from "@/lib/email/resend";
import { welcomeEmail } from "@/lib/email/templates";
import { findAuthUserByEmail } from "@/lib/auth/account-exists";
import { GUEST_ID_COOKIE, isGuestUser } from "@/lib/auth/guest";
import { claimGuestWorkspace } from "@/lib/auth/claim-guest";

export function safeNextPath(raw: unknown, fallback = "/setup") {
  if (typeof raw !== "string") return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return fallback;
  return raw.slice(0, 500);
}

async function establishSession(userId: string, email: string, hasSession: boolean) {
  if (hasSession) {
    const supabase = await createClient();
    const refreshed = await supabase.auth.refreshSession();
    if (!refreshed.error && refreshed.data.user?.id === userId) return true;
  }
  const admin = createAdminClient();
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = link.data?.properties?.hashed_token;
  if (link.error || !tokenHash) {
    console.error("[auth/signup] session error", link.error?.message ?? "missing token");
    return false;
  }
  const supabase = await createClient();
  const verified = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash });
  if (verified.error) {
    console.error("[auth/signup] otp session error", verified.error.message);
    return false;
  }
  return verified.data.user?.id === userId;
}

export async function directSignup(params: {
  email: string;
  password: string;
  nextPath?: string;
}) {
  const email = params.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) {
    return { ok: false as const, status: 400, error: "Enter a valid email address." };
  }
  if (params.password.length < 8 || params.password.length > 200) {
    return { ok: false as const, status: 400, error: "Password must be at least 8 characters." };
  }
  if (email.endsWith("@guest.apsurn.com")) {
    return { ok: false as const, status: 400, error: "Enter the email you want on the account." };
  }

  const admin = createAdminClient();
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const currentUser = auth.user;
  const cookieStore = await cookies();
  const guestCookieId = cookieStore.get(GUEST_ID_COOKIE)?.value;

  const existing = await findAuthUserByEmail(email);
  if (existing) {
    if (!currentUser || existing.id !== currentUser.id) {
      return {
        ok: false as const,
        status: 409,
        code: "account_exists" as const,
        error: "That email already has an account. Sign in to continue.",
      };
    }
  }

  let targetUserId = "";

  // Case 1: Active guest session
  if (currentUser && isGuestUser(currentUser)) {
    targetUserId = currentUser.id;
    const { error: updateError } = await admin.auth.admin.updateUserById(currentUser.id, {
      email,
      password: params.password,
      email_confirm: true,
      user_metadata: { ...(currentUser.user_metadata ?? {}), guest: false },
    });
    if (updateError) {
      console.error("[auth/signup] update guest error:", updateError.message);
      const taken = /already|exists|registered/i.test(updateError.message);
      return {
        ok: false as const,
        status: taken ? 409 : 500,
        code: taken ? ("account_exists" as const) : undefined,
        error: taken ? "That email already has an account. Sign in to continue." : "Could not finish signup.",
      };
    }
    await establishSession(targetUserId, email, true);
  }
  // Case 2: Guest ID cookie present without active session
  else if (guestCookieId) {
    const { data: guestData } = await admin.auth.admin.getUserById(guestCookieId);
    if (guestData.user && isGuestUser(guestData.user)) {
      targetUserId = guestCookieId;
      const { error: updateError } = await admin.auth.admin.updateUserById(guestCookieId, {
        email,
        password: params.password,
        email_confirm: true,
        user_metadata: { ...(guestData.user.user_metadata ?? {}), guest: false },
      });
      if (updateError) {
        console.error("[auth/signup] update cookie guest error:", updateError.message);
        const taken = /already|exists|registered/i.test(updateError.message);
        return {
          ok: false as const,
          status: taken ? 409 : 500,
          code: taken ? ("account_exists" as const) : undefined,
          error: taken ? "That email already has an account. Sign in to continue." : "Could not finish signup.",
        };
      }
      await establishSession(targetUserId, email, false);
    } else {
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        password: params.password,
        email_confirm: true,
        user_metadata: { guest: false },
      });
      if (createError || !created.user) {
        console.error("[auth/signup] create user error:", createError?.message);
        const taken = /already|exists|registered/i.test(createError?.message ?? "");
        return {
          ok: false as const,
          status: taken ? 409 : 500,
          code: taken ? ("account_exists" as const) : undefined,
          error: taken ? "That email already has an account. Sign in to continue." : "Could not create account.",
        };
      }
      targetUserId = created.user.id;
      await establishSession(targetUserId, email, false);
      await claimGuestWorkspace();
    }
  }
  // Case 3: Fresh signup with no guest context
  else {
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password: params.password,
      email_confirm: true,
      user_metadata: { guest: false },
    });
    if (createError || !created.user) {
      console.error("[auth/signup] fresh create user error:", createError?.message);
      const taken = /already|exists|registered/i.test(createError?.message ?? "");
      return {
        ok: false as const,
        status: taken ? 409 : 500,
        code: taken ? ("account_exists" as const) : undefined,
        error: taken ? "That email already has an account. Sign in to continue." : "Could not create account.",
      };
    }
    targetUserId = created.user.id;
    await establishSession(targetUserId, email, false);
  }

  // Welcome email in background (non-blocking)
  const sendWelcome = () => {
    const welcome = welcomeEmail();
    return sendResendEmail({
      to: email,
      subject: "Welcome to apsurn",
      html: welcome.html,
      text: welcome.text,
    }).catch((error) =>
      console.error("[auth/signup] welcome email error:", error instanceof Error ? error.message : error),
    );
  };
  try {
    after(sendWelcome);
  } catch {
    void sendWelcome();
  }

  return {
    ok: true as const,
    userId: targetUserId,
    email,
    nextPath: safeNextPath(params.nextPath),
  };
}
