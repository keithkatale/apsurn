import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { AuthenticationError, getCurrentUserId } from "@/lib/auth/session";
import { writeCampaignEmails } from "@/lib/onboarding/generate-campaign-copy";
import { listOwnedContactIdsForWorkspace } from "@/lib/outreach/owned-contact";
import { generateCampaignIconSvg } from "@/lib/campaigns/icon";
import { createSequence, enrollContacts } from "@/lib/sequences/mutations";

export const runtime = "nodejs";
export const maxDuration = 120;

const campaignSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(280).default(""),
  pain: z.string().trim().max(160).default(""),
  targeting: z.array(z.string()).max(8).default([]),
  sampleAccounts: z.array(z.string()).max(8).default([]),
  estimatedVolume: z.number().int().min(1).max(5000).default(200),
  segmentKey: z.string().trim().max(60).default(""),
  outreachMethod: z.string().trim().max(40).default("Cold email"),
});

const bodySchema = z.object({
  campaigns: z.array(campaignSchema).min(1).max(8),
});

export async function POST(request: NextRequest) {
  let userId: string;
  try {
    userId = await getCurrentUserId();
  } catch (error) {
    if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid campaigns" }, { status: 400 });

  const db = createAdminClient();
  const { data: company } = await db.from("companies").select("id,name").eq("user_id", userId).maybeSingle();
  if (!company) return NextResponse.json({ error: "Analyze your website first" }, { status: 400 });

  const { data: blueprint } = await db
    .from("company_blueprints")
    .select("product_summary,value_prop")
    .eq("company_id", company.id)
    .maybeSingle();

  const senderName = (company.name ?? "there").split(/\s+/)[0] ?? "there";

  const created = (
    await Promise.all(
      parsed.data.campaigns.map(async (campaign) => {
        const written = await writeCampaignEmails(campaign, {
          senderName,
          companyName: company.name,
          productSummary: blueprint?.product_summary ?? null,
          valueProp: blueprint?.value_prop ?? null,
        });
        const result = await createSequence(db, userId, {
          name: written.name,
          description: written.description,
          pain: written.pain,
          targeting: written.targeting,
          sampleAccounts: written.sampleAccounts,
          estimatedVolume: written.estimatedVolume,
          segmentKey: written.segmentKey,
          iconSvg: generateCampaignIconSvg(campaign),
          steps: written.steps,
        });
        return result.ok ? result.data.sequenceId : null;
      }),
    )
  ).filter((id): id is string => Boolean(id));

  const contactIds = await listOwnedContactIdsForWorkspace(db, userId);
  if (contactIds.length > 0 && created.length > 0) {
    await Promise.all(created.map((sequenceId) => enrollContacts(db, userId, sequenceId, contactIds)));
  }

  return NextResponse.json({ created: created.length, sequenceIds: created });
}
