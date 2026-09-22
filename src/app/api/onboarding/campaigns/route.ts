import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AuthenticationError, getCurrentUserId } from "@/lib/auth/session";
import { streamCampaignDefinitions } from "@/lib/onboarding/generate-campaigns";
import { persistCampaignDefinition } from "@/lib/sequences/mutations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  let userId: string;
  try {
    userId = await getCurrentUserId();
  } catch (error) {
    if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }

  const db = createAdminClient();
  const { data: company } = await db.from("companies").select("id,name").eq("user_id", userId).maybeSingle();
  if (!company) return NextResponse.json({ error: "Analyze your website first" }, { status: 400 });

  const { data: blueprint } = await db
    .from("company_blueprints")
    .select("product_summary,value_prop,positioning,icp,personas,competitors")
    .eq("company_id", company.id)
    .maybeSingle();
  if (!blueprint) return NextResponse.json({ error: "No blueprint yet" }, { status: 400 });

  const uniquify = new URL(request.url).searchParams.get("add") === "1";
  const senderName = (company.name ?? "there").split(/\s+/)[0] ?? "there";
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };
      try {
        for await (const campaign of streamCampaignDefinitions({
          companyName: company.name,
          productSummary: blueprint.product_summary,
          valueProp: blueprint.value_prop,
          positioning: blueprint.positioning,
          icp: (blueprint.icp as { industries?: string[]; companySizeRange?: string; geographies?: string[] }) ?? {},
          personas: (blueprint.personas as Array<{ title?: string; painPoints?: string[]; goals?: string[] }>) ?? [],
          competitors: Array.isArray(blueprint.competitors) ? (blueprint.competitors as string[]) : [],
        })) {
          const saved = await persistCampaignDefinition(
            db,
            userId,
            campaign,
            {
              senderName,
              companyName: company.name,
              valueProp: blueprint.value_prop,
            },
            { uniquify },
          );
          if (!saved.ok) throw new Error(saved.error);
          send({ type: "campaign", campaign, sequenceId: saved.data.sequenceId });
          await new Promise((resolve) => setTimeout(resolve, 160));
        }
        send({ type: "done" });
      } catch (error) {
        send({ type: "error", error: error instanceof Error ? error.message : "Could not define campaigns" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
