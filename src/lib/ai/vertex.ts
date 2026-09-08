import { GoogleGenAI } from "@google/genai";
import type { GoogleAuthOptions } from "google-auth-library";

const DEFAULT_PROJECT = "massive-catfish-507004-p4";
const DEFAULT_LOCATION = "us-central1";
const DEFAULT_MODEL = "gemini-2.5-flash";

const VERTEX_SCOPE = "https://www.googleapis.com/auth/cloud-platform";

function envTrue(name: string): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

/**
 * Credentials JSON for Vercel / serverless (ADC files are not available there).
 * Accepts a service-account key, or an authorized_user ADC JSON as fallback.
 */
export function loadServiceAccountCredentials():
  | Record<string, unknown>
  | null {
  const jsonRaw =
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim() ||
    process.env.GCP_SERVICE_ACCOUNT_JSON?.trim() ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON?.trim();

  if (jsonRaw) {
    try {
      return JSON.parse(jsonRaw) as Record<string, unknown>;
    } catch {
      throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON");
    }
  }

  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64?.trim();
  if (b64) {
    try {
      return JSON.parse(
        Buffer.from(b64, "base64").toString("utf8")
      ) as Record<string, unknown>;
    } catch {
      throw new Error(
        "GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 is not valid base64 JSON"
      );
    }
  }

  const adcPath = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (adcPath?.startsWith("{")) {
    try {
      return JSON.parse(adcPath) as Record<string, unknown>;
    } catch {
      /* file path string — handled by google-auth-library */
    }
  }

  return null;
}

function buildGoogleAuthOptions(): GoogleAuthOptions | undefined {
  const credentials = loadServiceAccountCredentials();
  if (!credentials) return undefined;
  return {
    credentials,
    scopes: [VERTEX_SCOPE],
  };
}

function hasVertexCredentialSource(): boolean {
  return Boolean(
    loadServiceAccountCredentials() ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()
  );
}

export function isVertexConfigured() {
  const apiKey =
    process.env.VERTEX_API_KEY?.trim() ||
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_API_KEY?.trim();
  if (apiKey) return true;

  const hasProject = Boolean(
    process.env.GOOGLE_CLOUD_PROJECT?.trim() ||
      process.env.VERTEX_PROJECT_ID?.trim()
  );
  if (!hasProject) return false;

  if (hasVertexCredentialSource()) return true;

  // Local dev may use gcloud ADC without explicit env credentials.
  return process.env.NODE_ENV !== "production";
}

export function getVertexProjectId() {
  return (
    process.env.GOOGLE_CLOUD_PROJECT?.trim() ||
    process.env.VERTEX_PROJECT_ID?.trim() ||
    DEFAULT_PROJECT
  );
}

export function getVertexLocation() {
  return (
    process.env.GOOGLE_CLOUD_LOCATION?.trim() ||
    process.env.VERTEX_LOCATION?.trim() ||
    DEFAULT_LOCATION
  );
}

export function getAiModel() {
  return process.env.VERTEX_MODEL || process.env.GEMINI_MODEL || DEFAULT_MODEL;
}

/**
 * Vertex AI via ADC (local) or service-account JSON (Vercel).
 * Optional Gemini / Vertex Express API keys for dev fallback.
 */
export function createGenAIClient() {
  const apiKey =
    process.env.VERTEX_API_KEY?.trim() ||
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_API_KEY?.trim();

  const googleAuthOptions = buildGoogleAuthOptions();

  const useVertex =
    envTrue("GOOGLE_GENAI_USE_VERTEXAI") ||
    Boolean(googleAuthOptions) ||
    Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) ||
    !apiKey;

  if (useVertex) {
    if (process.env.NODE_ENV === "production" && !googleAuthOptions && !apiKey) {
      const hasAdcPath = Boolean(
        process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim() &&
          !process.env.GOOGLE_APPLICATION_CREDENTIALS.trim().startsWith("{")
      );
      if (!hasAdcPath) {
        throw new Error(
          "Vertex AI credentials missing on this server. Set GOOGLE_SERVICE_ACCOUNT_JSON (service account JSON) on Vercel, or GOOGLE_APPLICATION_CREDENTIALS locally."
        );
      }
    }

    return new GoogleGenAI({
      vertexai: true,
      project: getVertexProjectId(),
      location: getVertexLocation(),
      ...(googleAuthOptions ? { googleAuthOptions } : {}),
    });
  }

  if (!apiKey) {
    throw new Error(
      "Vertex AI is not configured. Set GOOGLE_SERVICE_ACCOUNT_JSON + GOOGLE_CLOUD_PROJECT, or GEMINI_API_KEY for Google AI Studio."
    );
  }

  return new GoogleGenAI({ apiKey });
}
