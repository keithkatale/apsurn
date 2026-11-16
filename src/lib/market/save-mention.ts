import type { SupabaseClient } from "@supabase/supabase-js";
import { listSource } from "@/lib/prospects/lists";
import type { MarketPlatform } from "./types";

const LIST_NAME = "Market Insights";

interface MentionRow {
  id: string;
  platform: MarketPlatform;
  url: string;
  author_name: string | null;
  author_handle: string | null;
  content: string;
  qualify_reason: string | null;
  suggested_opener: string | null;
  qualify_score: number | null;
  intent: string | null;
  keyword_id: string | null;
  status: string | null;
}

function conversationDomain(url: string): string {
  let hash = 2166136261;
  for (let index = 0; index < url.length; index += 1) {
    hash ^= url.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `c${(hash >>> 0).toString(36)}.radar.invalid`;
}

function externalSite(text: string): string | null {
  const matches = text.match(/https?:\/\/[^\s)]+/gi) ?? [];
  for (const raw of matches) {
    try {
      const host = new URL(raw).hostname.replace(/^www\./, "");
      if (!host.includes(".")) continue;
      if (/(reddit\.com|twitter\.com|x\.com|linkedin\.com|ycombinator\.com|google\.com|duckduckgo\.com|youtube\.com)$/i.test(host)) continue;
      return host;
    } catch {
      continue;
    }
  }
  return null;
}

function linkedinProfile(platform: string, handle: string | null): string | null {
  if (platform !== "linkedin" || !handle) return null;
  if (/linkedin\.com\//i.test(handle)) return handle.startsWith("http") ? handle : `https://${handle}`;
  const slug = handle.replace(/^@/, "").trim();
  if (!slug || /\s/.test(slug)) return null;
  return `https://www.linkedin.com/in/${slug}`;
}

async function marketListId(db: SupabaseClient, userId: string, companyId: string): Promise<string> {
  const { data: lists, error } = await db.from("prospect_lists").select("id, name, criteria").eq("user_id", userId).eq("company_id", companyId);
  if (error) throw new Error(error.message);
  const existing = (lists ?? []).find((list) => listSource(list) === "market");
  if (existing?.id) return existing.id as string;
  const { data: created, error: insertError } = await db
    .from("prospect_lists")
    .insert({
      user_id: userId,
      company_id: companyId,
      name: LIST_NAME,
      criteria: { source: "market" },
      status: "completed",
      requested_count: 0,
      found_count: 0,
      completed_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (insertError || !created) throw new Error(insertError?.message ?? "Could not create the Radar list");
  return created.id as string;
}

/** Saves the person who wrote the post onto the Market Insights list. An email is not required. */
export async function saveMentionToProspects(
  db: SupabaseClient,
  userId: string,
  companyId: string,
  mentionId: string,
): Promise<{ listId: string; prospectCompanyId: string }> {
  const { data: mention, error } = await db
    .from("market_mentions")
    .select("id, platform, url, author_name, author_handle, content, qualify_reason, suggested_opener, qualify_score, intent, keyword_id, status")
    .eq("id", mentionId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!mention) {
    const missing = new Error("Conversation not found");
    (missing as Error & { status: number }).status = 404;
    throw missing;
  }
  const row = mention as MentionRow;
  const listId = await marketListId(db, userId, companyId);
  const domain = conversationDomain(row.url);
  const name = row.author_name || row.author_handle || "Conversation";
  const site = externalSite(row.content);
  const record: Record<string, unknown> = {
    user_id: userId,
    company_id: companyId,
    list_id: listId,
    name,
    domain,
    website_url: site ? `https://${site}` : null,
    description: row.content.slice(0, 500),
    source: "market",
    source_url: row.url,
    source_ref: {
      mentionId: row.id,
      platform: row.platform,
      url: row.url,
      authorHandle: row.author_handle,
      intent: row.intent,
      keywordId: row.keyword_id,
    },
    qualify_reason: row.qualify_reason,
    key_insight: row.qualify_reason,
    outreach_angle: row.suggested_opener,
    icp_fit_score: row.qualify_score != null ? row.qualify_score / 100 : null,
    status: "qualified",
  };

  const saveCompany = (payload: Record<string, unknown>) =>
    db.from("prospect_companies").upsert(payload, { onConflict: "list_id,domain" }).select("id").single();
  let { data: prospect, error: prospectError } = await saveCompany(record);
  if (prospectError && /outreach_angle|key_insight|source_url|qualify_reason|description|icp_fit_score/i.test(prospectError.message)) {
    const legacy = { ...record };
    delete legacy.outreach_angle;
    delete legacy.key_insight;
    delete legacy.source_url;
    delete legacy.qualify_reason;
    delete legacy.description;
    delete legacy.icp_fit_score;
    ({ data: prospect, error: prospectError } = await saveCompany(legacy));
  }
  if (prospectError || !prospect) throw new Error(prospectError?.message ?? "Could not save the conversation");

  const profile = linkedinProfile(row.platform, row.author_handle);
  const { data: existingContact } = await db.from("contacts").select("id").eq("prospect_company_id", prospect.id).limit(1).maybeSingle();
  if (!existingContact) {
    const { error: contactError } = await db.from("contacts").insert({
      prospect_company_id: prospect.id,
      full_name: name,
      title: row.platform,
      linkedin_url: profile,
      email_status: "unverified",
      source: "market",
      source_ref: { mentionId: row.id, url: row.url },
      lead_status: "new",
    });
    if (contactError) console.warn("[radar] saved the conversation without a contact row:", contactError.message);
  }

  await db
    .from("market_mentions")
    .update({
      status: "saved",
      is_saved: true,
      saved_at: new Date().toISOString(),
      saved_account_name: name,
      save_note: row.suggested_opener,
    })
    .eq("id", row.id)
    .eq("company_id", companyId);

  const { count } = await db.from("prospect_companies").select("id", { count: "exact", head: true }).eq("list_id", listId);
  await db.from("prospect_lists").update({ found_count: count ?? 0, status: "completed" }).eq("id", listId);

  return { listId, prospectCompanyId: prospect.id as string };
}
