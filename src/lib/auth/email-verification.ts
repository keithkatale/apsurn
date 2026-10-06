import { createHash, randomBytes, randomInt, timingSafeEqual } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { sendResendEmail } from "@/lib/email/resend";
import { verificationEmail, welcomeEmail } from "@/lib/email/templates";
import { findAuthUserByEmail } from "@/lib/auth/account-exists";
import { isGuestUser } from "@/lib/auth/guest";

const MAX_ATTEMPTS = 5;
const MAX_SENDS_PER_HOUR = 5;

export function safeNextPath(raw: unknown, fallback = "/dashboard/campaigns") {
  if (typeof raw !== "string") return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return fallback;
  return raw.slice(0, 500);
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("base64url");
}

function hashesMatch(presented: string, expected: string) {
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function startEmailVerification(params: {
  userId: string;
  email: string;
  password: string;
  nextPath: string;
  origin: string;
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
  const { data: current, error: currentError } = await admin.auth.admin.getUserById(params.userId);
  if (currentError || !current.user) {
    return { ok: false as const, status: 401, error: "Authentication required" };
  }
  if (!isGuestUser(current.user)) {
    return { ok: false as const, status: 400, error: "This account is already verified." };
  }

  const existing = await findAuthUserByEmail(email);
  if (existing && existing.id !== params.userId) {
    return {
      ok: false as const,
      status: 409,
      code: "account_exists" as const,
      error: "That email already has an account. Sign in to continue.",
    };
  }

  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await admin
    .from("email_verifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", params.userId)
    .gte("created_at", since);
  if ((count ?? 0) >= MAX_SENDS_PER_HOUR) {
    return { ok: false as const, status: 429, error: "Too many codes. Wait a few minutes and try again." };
  }

  const { error: passwordError } = await admin.auth.admin.updateUserById(params.userId, {
    password: params.password,
    user_metadata: { ...(current.user.user_metadata ?? {}), guest: true },
  });
  if (passwordError) {
    console.error("[auth/verify] password", passwordError.message);
    return { ok: false as const, status: 500, error: "Could not start verification." };
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date("2099-01-01T00:00:00.000Z").toISOString();

  await admin
    .from("email_verifications")
    .update({ consumed_at: new Date().toISOString() })
    .eq("user_id", params.userId)
    .is("consumed_at", null);

  const { error: insertError } = await admin.from("email_verifications").insert({
    user_id: params.userId,
    email,
    code_hash: sha256(code),
    token_hash: sha256(token),
    expires_at: expiresAt,
    next_path: safeNextPath(params.nextPath),
  });
  if (insertError) {
    console.error("[auth/verify] insert", insertError.message);
    return { ok: false as const, status: 500, error: "Could not start verification." };
  }

  const link = `${params.origin.replace(/\/$/, "")}/auth/verify?token=${encodeURIComponent(token)}`;
  const message = verificationEmail({ code, link });
  try {
    const sent = await sendResendEmail({
      to: email,
      subject: "Your apsurn verification code",
      html: message.html,
      text: message.text,
    });
    if (sent.skipped) {
      return { ok: false as const, status: 502, error: "Email sending is not configured." };
    }
  } catch (error) {
    console.error("[auth/verify] send", error instanceof Error ? error.message : error);
    return { ok: false as const, status: 502, error: "Could not send the verification email." };
  }

  return { ok: true as const, email };
}

type VerificationRow = {
  id: string;
  user_id: string;
  email: string;
  code_hash: string;
  token_hash: string;
  attempts: number;
  expires_at: string;
  consumed_at: string | null;
  next_path: string | null;
};

async function loadActiveRow(lookup: { userId: string } | { token: string }) {
  const admin = createAdminClient();
  const query = admin
    .from("email_verifications")
    .select("id,user_id,email,code_hash,token_hash,attempts,expires_at,consumed_at,next_path")
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1);
  const filtered = "userId" in lookup ? query.eq("user_id", lookup.userId) : query.eq("token_hash", sha256(lookup.token));
  const { data } = await filtered.maybeSingle();
  return (data as VerificationRow | null) ?? null;
}

async function establishSession(userId: string, email: string) {
  const admin = createAdminClient();
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = link.data?.properties?.hashed_token;
  if (link.error || !tokenHash) {
    console.error("[auth/verify] session", link.error?.message ?? "missing token");
    return false;
  }
  const supabase = await createClient();
  const verified = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash });
  if (verified.error) {
    console.error("[auth/verify] otp session", verified.error.message);
    return false;
  }
  return verified.data.user?.id === userId;
}

export async function confirmEmailVerification(params: { userId?: string; code?: string; token?: string }) {
  const code = params.code?.trim();
  const token = params.token?.trim();
  if (!code && !token) return { ok: false as const, status: 400, error: "Enter the verification code." };
  if (code && !/^\d{6}$/.test(code)) return { ok: false as const, status: 400, error: "Enter the 6-digit code." };

  const row = token ? await loadActiveRow({ token }) : params.userId ? await loadActiveRow({ userId: params.userId }) : null;
  if (!row) return { ok: false as const, status: 400, error: "That code didn't match. Send a new one." };
  if (params.userId && row.user_id !== params.userId) {
    return { ok: false as const, status: 400, error: "That code didn't match. Send a new one." };
  }

  const admin = createAdminClient();
  const presented = token ? sha256(token) : sha256(code!);
  const expected = token ? row.token_hash : row.code_hash;
  if (!hashesMatch(presented, expected)) {
    const attempts = row.attempts + 1;
    await admin
      .from("email_verifications")
      .update(attempts >= MAX_ATTEMPTS ? { attempts, consumed_at: new Date().toISOString() } : { attempts })
      .eq("id", row.id);
    return {
      ok: false as const,
      status: 400,
      error: attempts >= MAX_ATTEMPTS ? "Too many tries. Send a new code." : "That code is wrong.",
    };
  }

  const { error: updateError } = await admin.auth.admin.updateUserById(row.user_id, {
    email: row.email,
    email_confirm: true,
    user_metadata: { guest: false },
  });
  if (updateError) {
    const taken = /already|exists|registered/i.test(updateError.message);
    return {
      ok: false as const,
      status: taken ? 409 : 500,
      code: taken ? ("account_exists" as const) : undefined,
      error: taken ? "That email already has an account. Sign in to continue." : "Could not finish verification.",
    };
  }

  await admin.from("email_verifications").update({ consumed_at: new Date().toISOString() }).eq("id", row.id);
  const welcome = welcomeEmail();
  await sendResendEmail({ to: row.email, subject: "Welcome to apsurn", html: welcome.html, text: welcome.text }).catch((error) =>
    console.error("[auth/verify] welcome", error instanceof Error ? error.message : error)
  );
  const sessionReady = await establishSession(row.user_id, row.email);
  if (!sessionReady) {
    return { ok: false as const, status: 500, error: "Email verified. Sign in with your password to continue." };
  }

  return {
    ok: true as const,
    email: row.email,
    userId: row.user_id,
    nextPath: safeNextPath(row.next_path),
  };
}
