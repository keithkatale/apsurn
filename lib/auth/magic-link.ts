import { createHash, randomBytes } from "crypto";
import { after } from "next/server";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { sendResendEmail } from "@/lib/email/resend";
import { magicLinkEmail, welcomeEmail } from "@/lib/email/templates";
import { findAuthUserByEmail } from "@/lib/auth/account-exists";
import { claimGuestWorkspace } from "@/lib/auth/claim-guest";
import { GUEST_EMAIL_SUFFIX, GUEST_ID_COOKIE, isGuestUser } from "@/lib/auth/guest";
import { logEvent } from "@/lib/events";
import { reportSlugFromPath } from "@/lib/reports";

const LINK_MINUTES = 15;
const MAX_SENDS_PER_HOUR = 5;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function safeNextPath(raw: unknown, fallback = "/auth/continue") {
  if (typeof raw !== "string") return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return fallback;
  return raw.slice(0, 500);
}

const sha256 = (value: string) => createHash("sha256").update(value).digest("base64url");

/** Emails a one-time sign-in link. Says nothing about whether the address already has an account. */
export async function startMagicLink(params: { email: string; nextPath: unknown; origin: string }) {
  const email = String(params.email ?? "").trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email) || email.length > 320) {
    return { ok: false as const, status: 400, error: "Enter a valid email address." };
  }
  if (email.endsWith(GUEST_EMAIL_SUFFIX)) {
    return { ok: false as const, status: 400, error: "Enter your own email address." };
  }

  const admin = createAdminClient();
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await admin
    .from("magic_links")
    .select("id", { count: "exact", head: true })
    .eq("email", email)
    .gte("created_at", since);
  if ((count ?? 0) >= MAX_SENDS_PER_HOUR) {
    return { ok: false as const, status: 429, error: "Too many links requested. Wait a few minutes and try again." };
  }

  const token = randomBytes(32).toString("base64url");
  const { error: insertError } = await admin.from("magic_links").insert({
    email,
    token_hash: sha256(token),
    next_path: safeNextPath(params.nextPath),
    expires_at: new Date(Date.now() + LINK_MINUTES * 60 * 1000).toISOString(),
  });
  if (insertError) {
    console.error("[auth/magic] insert", insertError.message);
    return { ok: false as const, status: 500, error: "Could not send the link. Please try again." };
  }

  const link = `${params.origin.replace(/\/$/, "")}/auth/magic?token=${encodeURIComponent(token)}`;
  const message = magicLinkEmail({ link, minutes: LINK_MINUTES });
  try {
    const sent = await sendResendEmail({ to: email, subject: "Your apsurn sign-in link", html: message.html, text: message.text });
    if (sent.skipped) return { ok: false as const, status: 502, error: "Email sending is not configured." };
  } catch (error) {
    console.error("[auth/magic] send", error instanceof Error ? error.message : error);
    return { ok: false as const, status: 502, error: "Could not send the email. Please try again." };
  }
  return { ok: true as const, email };
}

/** Real session for `email`, created server-side once the link is proven. */
async function startSession(userId: string, email: string) {
  const admin = createAdminClient();
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = link.data?.properties?.hashed_token;
  if (link.error || !tokenHash) {
    console.error("[auth/magic] session", link.error?.message ?? "missing token");
    return false;
  }
  const supabase = await createClient();
  const verified = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash });
  if (verified.error) {
    console.error("[auth/magic] otp", verified.error.message);
    return false;
  }
  return verified.data.user?.id === userId;
}

/** Spends the link, then signs the person in, creating the account or upgrading their guest workspace as needed. */
export async function confirmMagicLink(rawToken: unknown) {
  const token = typeof rawToken === "string" ? rawToken.trim() : "";
  const invalid = { ok: false as const, status: 400, error: "This link has expired or was already used. Request a new one." };
  if (token.length < 20 || token.length > 200) return invalid;

  const admin = createAdminClient();
  // One atomic update spends the token, so two requests can never both succeed.
  const { data: row } = await admin
    .from("magic_links")
    .update({ consumed_at: new Date().toISOString() })
    .eq("token_hash", sha256(token))
    .is("consumed_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("email, next_path")
    .maybeSingle();
  if (!row) return invalid;

  const email = String(row.email).toLowerCase();
  const nextPath = safeNextPath(row.next_path);

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const cookieStore = await cookies();
  const guestId = (auth.user && isGuestUser(auth.user) ? auth.user.id : null) ?? cookieStore.get(GUEST_ID_COOKIE)?.value ?? null;

  const existing = await findAuthUserByEmail(email);
  let userId: string;
  let isNew = false;

  if (existing) {
    userId = existing.id;
  } else {
    isNew = true;
    let upgraded: string | null = null;
    if (guestId) {
      // Keep the work they did as a guest: the guest account simply gets this email.
      const { data: guest } = await admin.auth.admin.getUserById(guestId);
      if (guest.user && isGuestUser(guest.user)) {
        const { error } = await admin.auth.admin.updateUserById(guestId, {
          email,
          email_confirm: true,
          user_metadata: { ...(guest.user.user_metadata ?? {}), guest: false },
        });
        if (!error) upgraded = guestId;
        else console.error("[auth/magic] upgrade guest", error.message);
      }
    }
    if (upgraded) {
      userId = upgraded;
    } else {
      const { data: created, error } = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { guest: false } });
      if (error || !created.user) {
        console.error("[auth/magic] create user", error?.message);
        return { ok: false as const, status: 500, error: "Could not create your account." };
      }
      userId = created.user.id;
    }
  }

  if (!(await startSession(userId, email))) {
    return { ok: false as const, status: 500, error: "Could not sign you in. Request a new link." };
  }
  // A returning person who was working as a guest brings that workspace along when their account has none yet.
  if (existing) await claimGuestWorkspace().catch(() => null);

  await logEvent(isNew ? "signup" : "login", { userId, props: { method: "magic_link", report: reportSlugFromPath(nextPath) } });

  if (isNew) {
    const send = () => {
      const welcome = welcomeEmail();
      return sendResendEmail({ to: email, subject: "Welcome to apsurn", html: welcome.html, text: welcome.text }).catch((error) =>
        console.error("[auth/magic] welcome", error instanceof Error ? error.message : error),
      );
    };
    try {
      after(send);
    } catch {
      void send();
    }
  }

  return { ok: true as const, nextPath, isNew };
}
