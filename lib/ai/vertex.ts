import dns from "node:dns";
import net from "node:net";
import { GoogleGenAI } from "@google/genai";

dns.setDefaultResultOrder("ipv4first");
net.setDefaultAutoSelectFamily(false);

// Simplified Vertex AI adapter for this GTM Builder project.
// Based on the Apsurn project's vertex.ts implementation.
// 
// Configuration matches Apsurn exactly:
// - GOOGLE_CLOUD_PROJECT: project-b102c767-2daf-40a0-a65
// - GOOGLE_CLOUD_LOCATION: us-central1 (default region)
// - GEMINI_LOCATION: global (for chat to reduce rate limiting)
// - Authentication via ADC or GOOGLE_SERVICE_ACCOUNT_JSON

export function isVertexConfigured(): boolean {
  return Boolean(
    process.env.GEMINI_API_KEY?.trim() || 
    process.env.GOOGLE_CLOUD_PROJECT?.trim()
  );
}

export function getVertexModel(): string {
  return (
    process.env.VERTEX_MODEL?.trim() || 
    process.env.GEMINI_MODEL?.trim() || 
    "gemini-3.1-flash-lite"
  );
}

export function getVertexLocation(): string {
  // Chat uses 'global' to reduce rate limiting (matches Apsurn)
  return process.env.GEMINI_LOCATION?.trim() || "global";
}

export function getVertexProjectLocation(): string {
  // Default region for other operations
  return process.env.GOOGLE_CLOUD_LOCATION?.trim() || "us-central1";
}

/** Parses/validates a pasted service-account key without ever logging its contents. */
export function parseServiceAccountJson(raw: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("That doesn't look like valid JSON.");
  }
  const obj = parsed as Record<string, unknown>;
  if (
    obj.type !== "service_account" || 
    typeof obj.private_key !== "string" || 
    typeof obj.client_email !== "string"
  ) {
    throw new Error(
      'Not a service-account key — expected a JSON file with "type": "service_account".'
    );
  }
  return obj;
}

function createGenAI(
  geminiApiKey: string | null, 
  serviceAccountJson: string | null
): GoogleGenAI {
  const apiKey = geminiApiKey || process.env.GEMINI_API_KEY?.trim();
  if (apiKey) {
    return new GoogleGenAI({ apiKey });
  }

  const project = process.env.GOOGLE_CLOUD_PROJECT?.trim();
  if (!project) {
    throw new Error(
      "Gemini is not configured. Set GEMINI_API_KEY (recommended), or GOOGLE_CLOUD_PROJECT for Vertex AI."
    );
  }
  
  // Use GEMINI_LOCATION (global) for chat, GOOGLE_CLOUD_LOCATION (us-central1) as default
  const location = getVertexLocation();

  const rawCredentials = 
    serviceAccountJson || 
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
    
  if (rawCredentials) {
    try {
      const credentials = parseServiceAccountJson(rawCredentials);
      return new GoogleGenAI({ 
        vertexai: true, 
        project, 
        location, 
        googleAuthOptions: { credentials } 
      });
    } catch (error) {
      console.error(
        "[ai/vertex] GOOGLE_SERVICE_ACCOUNT_JSON is set but unusable — trying Application Default Credentials instead:",
        error instanceof Error ? error.message : error
      );
    }
  }

  // Application Default Credentials fallback (primary method for Apsurn)
  console.log(`[ai/vertex] Using ADC for project ${project} in location ${location}`);
  return new GoogleGenAI({ vertexai: true, project, location });
}

/**
 * Create a Vertex AI client for use with the Vercel AI SDK.
 * This uses the Google GenAI SDK which works with both Gemini API and Vertex AI.
 * 
 * Configuration matches Apsurn:
 * - Project: project-b102c767-2daf-40a0-a65
 * - Location: global (for chat)
 * - Auth: ADC (gcloud auth application-default login)
 */
export function createVertexClient(
  geminiApiKey: string | null = null,
  serviceAccountJson: string | null = null
): GoogleGenAI {
  return createGenAI(geminiApiKey, serviceAccountJson);
}
