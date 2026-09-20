import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { AuthenticationError, getCurrentUserId } from "@/lib/auth/session";
import { inngest } from "@/lib/inngest/client";
import { runMarketScanWithProgress } from "@/lib/market/mutations";
import { MARKET_PLATFORMS } from "@/lib/market/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const requestSchema = z.object({
  platforms: z.array(z.enum(MARKET_PLATFORMS)).min(1).max(4).optional(),
});

function sseEncode(payload: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`);
}

export async function POST(request: NextRequest) {
  let userId: string;
  try {
    userId = await getCurrentUserId();
  } catch (error) {
    if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => ({})));
  const platforms = parsed.success ? parsed.data.platforms : undefined;

  const db = createAdminClient();
  const { data: company } = await db.from("companies").select("id").eq("user_id", userId).maybeSingle();
  if (!company) return NextResponse.json({ error: "Build and approve your company blueprint first" }, { status: 400 });

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (payload: Record<string, unknown>) => {
        if (!closed) controller.enqueue(sseEncode(payload));
      };
      // Keeps the socket alive across long per-source searches so the browser
      // never sits on a stream that has silently stopped producing bytes.
      const heartbeat = setInterval(() => {
        if (!closed) controller.enqueue(new TextEncoder().encode(": keepalive\n\n"));
      }, 15_000);
      try {
        const result = await runMarketScanWithProgress(db, company.id, (event) => send({ type: "progress", ...event }), platforms);
        send({ type: "done", ...result });

        // Keep digging in the background after the visible batch is shown —
        // no need to hold the response open for this.
        await inngest.send({ name: "market/scan.deepen", data: { companyId: company.id, platforms } }).catch((error) => {
          console.error("[market] failed to enqueue deep scan:", error instanceof Error ? error.message : error);
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Scan failed";
        console.error("[market] scan failed:", message);
        send({ type: "error", error: message });
      } finally {
        clearInterval(heartbeat);
        closed = true;
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
