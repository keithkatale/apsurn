/**
 * Google auth errors can embed request bodies containing refresh tokens.
 * Never log or return the raw error object from an AI call.
 */
export function safeAiErrorMessage(error: unknown): string {
  const candidate = error as {
    message?: unknown;
    code?: unknown;
    response?: { data?: { error?: unknown; error_subtype?: unknown } };
  } | null;

  const providerCode = candidate?.response?.data?.error;
  const subtype = candidate?.response?.data?.error_subtype;
  if (providerCode === "invalid_grant" && subtype === "invalid_rapt") {
    return "Google ADC requires reauthentication (invalid_rapt)";
  }
  if (typeof providerCode === "string") {
    return `Google AI request failed (${providerCode})`;
  }
  if (typeof candidate?.code === "number") {
    return `Google AI request failed (HTTP ${candidate.code})`;
  }
  if (typeof candidate?.message === "string") {
    return candidate.message.replace(/1\/\/[A-Za-z0-9_-]+/g, "[REDACTED_REFRESH_TOKEN]").slice(0, 300);
  }
  return "Google AI request failed";
}
