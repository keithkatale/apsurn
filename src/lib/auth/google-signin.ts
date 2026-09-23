const STATE_COOKIE = "google_signin_state";

export function googleSignInRedirectUri(origin: string) {
  return `${origin.replace(/\/$/, "")}/api/auth/google/callback`;
}

export function googleSignInAuthUrl(state: string, origin: string) {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  if (!clientId) throw new Error("GOOGLE_OAUTH_CLIENT_ID is not configured");
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: googleSignInRedirectUri(origin),
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
  if (pipe < 0) return { state: value, next: "/dashboard" };
  const next = value.slice(pipe + 1);
  return {
    state: value.slice(0, pipe),
    next: next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard",
  };
}

export async function exchangeGoogleSignInCode(code: string, origin: string) {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
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
      redirect_uri: googleSignInRedirectUri(origin),
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
