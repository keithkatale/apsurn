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

  if (typeof candidate?.status === "number") {
    const type = typeof candidate.type === "string" ? candidate.type : null;
    const code = typeof candidate.code === "string" ? candidate.code : null;
    const detail = code ?? type;
    return detail ? `AI request failed (${candidate.status}: ${detail})` : `AI request failed (HTTP ${candidate.status})`;
  }
  if (typeof candidate?.message === "string") {
    return candidate.message.slice(0, 300);
  }
  return "AI request failed";
}
