import type { FunctionCall, GenerateContentResponse } from "@google/genai";

export interface StreamChunkParts {
  text: string;
  functionCalls: FunctionCall[];
}

/**
 * `response.text` warns/throws when a chunk has only function-call parts
 * (no text parts) in some @google/genai versions — swallow that here so
 * callers can just read `.text` unconditionally.
 */
export function readStreamChunk(chunk: GenerateContentResponse): StreamChunkParts {
  let text = "";
  try {
    text = chunk.text ?? "";
  } catch {
    text = "";
  }
  const functionCalls = chunk.functionCalls ?? [];
  return { text, functionCalls };
}

export function isQuotaError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /quota|rate limit|resource_exhausted|429/i.test(message);
}
