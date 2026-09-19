import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuthenticationError, getCurrentUserId } from "@/lib/auth/session";
import { getAiClient } from "@/lib/ai/openai";
import { safeAiErrorMessage } from "@/lib/ai/errors";

export const runtime = "nodejs";

const requestSchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(2000) }))
    .min(1)
    .max(20),
});

function extractJsonObject(text: string): Record<string, unknown> {
  const cleaned = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error("Model did not return valid JSON");
  }
}

export async function POST(request: NextRequest) {
  try {
    await getCurrentUserId();
  } catch (error) {
    if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const transcript = parsed.data.messages.map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`).join("\n");

  const prompt = `You are a prospecting assistant having a short conversation with a user before launching a company/contact search agent. Read the conversation so far and decide whether you have enough targeting information to start a search, or whether you should ask a clarifying question first.

Only mark ready=true once the user has given at least one concrete targeting signal (an industry/niche, a geography, a company size range, or a persona/job title) OR has explicitly told you to just go ahead / search broadly / use your judgment. A bare greeting ("hey", "hi") or a vague statement with no targeting signal and no explicit go-ahead is NOT enough — ask a short, friendly clarifying question instead (e.g. what kind of companies, what industry, what location, how many). Do not ask more than one question at a time. Once you do have enough (or the user says to just proceed), set ready=true and write a short one-sentence confirmation as your reply (e.g. "Got it — searching for fintech companies in Kenya now.").

Conversation so far:
${transcript}

Return ONLY JSON: {"ready":boolean,"reply":string,"criteria":{"industries":string[],"geographies":string[],"companySizeRange":string,"personas":string[],"limit":number}}.
"criteria" should reflect your best understanding so far even if ready is false (it will be ignored until ready is true). "limit" defaults to 15, clamp between 1 and 30.`;

  try {
    const { ai, model } = await getAiClient();
    const response = await ai.responses.create({ model, input: prompt });
    const parsedJson = extractJsonObject(response.output_text ?? "{}");
    const criteria = (parsedJson.criteria ?? {}) as Record<string, unknown>;

    return NextResponse.json({
      ready: Boolean(parsedJson.ready),
      reply: typeof parsedJson.reply === "string" && parsedJson.reply.trim() ? parsedJson.reply.trim() : "Could you tell me a bit more about who you're looking for?",
      criteria: {
        industries: Array.isArray(criteria.industries) ? criteria.industries.map(String) : [],
        geographies: Array.isArray(criteria.geographies) ? criteria.geographies.map(String) : [],
        companySizeRange: typeof criteria.companySizeRange === "string" ? criteria.companySizeRange : "",
        personas: Array.isArray(criteria.personas) ? criteria.personas.map(String) : [],
        limit: Math.min(Math.max(Number(criteria.limit) || 15, 1), 30),
      },
    });
  } catch (error) {
    return NextResponse.json({ error: safeAiErrorMessage(error) }, { status: 502 });
  }
}
