/**
 * Never log or return the raw error object from an AI call — the SDK error
 * can embed request bodies/headers. Provider-agnostic: the active provider
 * (OpenAI, OpenRouter, or Vertex/Gemini) is switchable at runtime, so this
 * can't assume any one SDK's error shape.
 */
export function safeAiErrorMessage(error: unknown): string {
  const candidate = error as {
    status?: unknown;
    code?: unknown;
    type?: unknown;
    message?: unknown;
  } | null;

  // Google's ADC failure message says nothing about what to actually fix,
  // and it's the single most likely Vertex failure: no credential reachable
  // in this environment.
  if (typeof candidate?.message === "string" && /could not load the default credentials/i.test(candidate.message)) {
    return (
      "Vertex AI has no usable credentials in this environment. On Cloud Run, attach a service account with the " +
      "'Vertex AI User' role to the service. Locally, run `gcloud auth application-default login`. " +
      "Alternatively set GEMINI_API_KEY, or switch the provider at /admin."
    );
  }

  // Expired personal ADC. Google returns this as a bare HTTP 400 whose body
  // is a JSON blob, so without this branch it surfaced as "AI request failed
  // (HTTP 400)" — which reads like a bad request and sends you looking at the
  // prompt rather than at the credential that actually expired.
  if (typeof candidate?.message === "string" && /invalid_rapt|invalid_grant|reauth related/i.test(candidate.message)) {
    return (
      "Google credentials have expired and need re-authentication. Locally, run " +
      "`gcloud auth application-default login` and retry. On a server, attach a service account to the " +
      "service instead — personal credentials expire like this and cannot be refreshed without a browser."
    );
  }

  if (typeof candidate?.status === "number") {
    const type = typeof candidate.type === "string" ? candidate.type : null;
    const code = typeof candidate.code === "string" ? candidate.code : null;
    const detail = code ?? type;
    // A stringified JSON body is the only place Google puts the real reason,
    // so keep a trimmed copy rather than discarding it.
    const body =
      typeof candidate.message === "string" && candidate.message.trim().startsWith("{")
        ? ` ${candidate.message.slice(0, 200)}`
        : "";
    return detail
      ? `AI request failed (${candidate.status}: ${detail})${body}`
      : `AI request failed (HTTP ${candidate.status})${body}`;
  }
  if (typeof candidate?.message === "string") {
    return candidate.message.slice(0, 300);
  }
  return "AI request failed";
}
