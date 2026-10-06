import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AuthenticationError, getCurrentUserId } from "@/lib/auth/session";
import { importCsv } from "@/lib/prospects/csv-import";
import { enrollContacts } from "@/lib/sequences/mutations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB — generous for a 1000-row CSV

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

  const db = createAdminClient();
  const { data: company } = await db.from("companies").select("id").eq("user_id", userId).maybeSingle();
  if (!company) return NextResponse.json({ error: "Set up your company first" }, { status: 400 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file === "string") return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  if (file.size > MAX_FILE_BYTES) return NextResponse.json({ error: "File is too large (max 5MB)" }, { status: 400 });
  if (!/\.csv$/i.test(file.name)) return NextResponse.json({ error: "Only .csv files are supported right now" }, { status: 400 });

  const csvText = await file.text();
  const sequenceId = String(form?.get("sequenceId") ?? "").trim();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: Record<string, unknown>) => controller.enqueue(sseEncode(payload));
      try {
        const result = await importCsv(db, userId, company.id, csvText, (event) => send({ ...event }));
        let enrolled = 0;
        if (sequenceId && result.contactIds.length > 0) {
          send({ type: "status", stage: "save", label: "Adding the table to this campaign…", progress: 96 });
          const added = await enrollContacts(db, userId, sequenceId, result.contactIds);
          if (!added.ok) throw new Error(added.error);
          enrolled = added.data.enrolled;
          if (enrolled === 0) {
            const now = new Date().toISOString();
            const { error } = await db.from("enrollments").upsert(
              result.contactIds.map((contactId) => ({
                sequence_id: sequenceId,
                contact_id: contactId,
                status: "active",
                current_step: 0,
                next_send_at: now,
              })),
              { onConflict: "sequence_id,contact_id", ignoreDuplicates: true },
            );
            if (error) throw new Error(error.message);
            enrolled = result.contactIds.length;
          }
        }
        send({ type: "result", ...result, enrolled });
      } catch (error) {
        send({ type: "error", error: error instanceof Error ? error.message : "Import failed" });
      } finally {
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
