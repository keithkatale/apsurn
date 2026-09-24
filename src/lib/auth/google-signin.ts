import type { NextRequest } from "next/server";

const STATE_COOKIE = "google_signin_state";

function isCloudRunInternal(value: string) {
  try {
    const url = new URL(value.includes("://") ? value : `http://${value}`);
    return (url.hostname === "localhost" || url.hostname === "127.0.0.1") && url.port === "8080";
  } catch {
    return /localhost:8080|127\.0\.0\.1:8080/.test(value);
  }
}

/** Public site origin — never Cloud Run's internal http://localhost:8080. */
export function publicAppOrigin(request: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (configured && !isCloudRunInternal(configured)) return configured;

  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const host =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    request.headers.get("host")?.split(",")[0]?.trim();
  if (host && proto && !isCloudRunInternal(`${proto}://${host}`)) {
    return `${proto}://${host}`;
  }

  const origin = request.nextUrl.origin.replace(/\/$/, "");
  if (!isCloudRunInternal(origin)) return origin;
  return "https://apsurn.com";
}

export function googleSignInRedirectUri(request: NextRequest) {
  const configured = process.env.GOOGLE_OAUTH_REDIRECT_URI?.trim().replace(/\/$/, "");
  if (configured && !isCloudRunInternal(configured)) {
    if (configured.endsWith("/api/auth/google/callback")) return configured;
    return `${configured.replace(/\/$/, "")}/api/auth/google/callback`;
  }
  return `${publicAppOrigin(request)}/api/auth/google/callback`;
}

function googleClientId() {
  return process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() || process.env.GOOGLE_CLIENT_ID?.trim() || "";
}

function googleClientSecret() {
  return process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() || process.env.GOOGLE_CLIENT_SECRET?.trim() || "";
}

export function googleSignInAuthUrl(state: string, request: NextRequest) {
  const clientId = googleClientId();
  if (!clientId) throw new Error("GOOGLE_OAUTH_CLIENT_ID is not configured");
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: googleSignInRedirectUri(request),
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "offline",
    prompt: "select_account",
    include_granted_scopes: "true",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export function googleSignInCookieName() {
  return STATE_COOKIE;
}

export function encodeGoogleSignInState(state: string, next: string) {
  return `${state}|${next}`;
}

export function decodeGoogleSignInState(value: string) {
  const pipe = value.indexOf("|");
  if (pipe < 0) return { state: value, next: "/dashboard/copilot" };
  const next = value.slice(pipe + 1);
  return {
    state: value.slice(0, pipe),
    next: next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard/copilot",
  };
}

export async function exchangeGoogleSignInCode(code: string, request: NextRequest) {
  const clientId = googleClientId();
  const clientSecret = googleClientSecret();
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET not configured");
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: googleSignInRedirectUri(request),
      grant_type: "authorization_code",
    }),
  });
  const data = (await res.json().catch(() => null)) as {
    id_token?: string;
    access_token?: string;
    error?: string;
    error_description?: string;
  } | null;
  if (!res.ok || !data?.id_token) {
    throw new Error(data?.error_description || data?.error || "Google did not return an ID token");
  }
  return { idToken: data.id_token, accessToken: data.access_token ?? null };
}
