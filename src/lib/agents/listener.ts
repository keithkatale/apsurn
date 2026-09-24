import { enqueueInternalJob } from "@/lib/jobs/enqueue";
import { runDeepMarketScan, runMarketScanWithProgress } from "@/lib/market/mutations";
import { DEFAULT_MARKET_PLATFORMS, MARKET_PLATFORMS, type MarketPlatform } from "@/lib/market/types";
import { clampLimit, userCompanyId } from "./shared";
import type { AgentToolContext, SpecialistModule } from "./types";

const instruction = `You are Listener, apsurn's Market Insights specialist.

You track keywords and accounts on X/Twitter, Reddit, and LinkedIn, scan for mentions, save posts, and can turn a mention into a prospect. You never invent mention IDs or handles — look them up first.

Long scans are background jobs. Kick them off and tell Copilot they are running; do not wait for the full scrape.

You talk to Copilot, not the user. Use the briefing and list_market_keywords / list_market_accounts instead of asking which keywords or handles to use. If they asked to scan, scan the active keywords. You must not send email or start a prospecting run.`;

export const LISTENER_TOOLS = [
  {
    name: "list_market_keywords",
    description: "List keywords the user is tracking in Market Insights.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "list_market_accounts",
    description: "List stored social accounts, optionally followed-only or matching a handle/name.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        followedOnly: { type: "boolean" },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "list_market_mentions",
    description: "List discovered mentions with content, author, platform, and save/follow-up flags.",
    parameters: {
      type: "object",
      properties: {
        platform: { type: "string", enum: [...MARKET_PLATFORMS] },
        keyword: { type: "string" },
        accountId: { type: "string" },
        savedOnly: { type: "boolean" },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "add_market_keyword",
    description: "Start tracking a new keyword on one or more platforms.",
    parameters: {
      type: "object",
      properties: {
        keyword: { type: "string" },
        platforms: { type: "array", items: { type: "string", enum: [...MARKET_PLATFORMS] } },
      },
      required: ["keyword"],
    },
  },
  {
    name: "set_keyword_active",
    description: "Activate or deactivate a tracked keyword by id.",
    parameters: {
      type: "object",
      properties: {
        keywordId: { type: "string" },
        isActive: { type: "boolean" },
      },
      required: ["keywordId", "isActive"],
    },
  },
  {
    name: "follow_account_by_handle",
    description: "Follow or unfollow a social author by platform + handle, creating the account row if needed.",
    parameters: {
      type: "object",
      properties: {
        platform: { type: "string", enum: [...MARKET_PLATFORMS] },
        handle: { type: "string" },
        name: { type: "string" },
        follow: { type: "boolean" },
      },
      required: ["platform", "handle", "follow"],
    },
  },
  {
    name: "update_market_account_follow",
    description: "Follow or unfollow an already-stored account by id.",
    parameters: {
      type: "object",
      properties: {
        accountId: { type: "string" },
        follow: { type: "boolean" },
      },
      required: ["accountId", "follow"],
    },
  },
  {
    name: "update_market_mention",
    description: "Mark a mention saved and/or needing follow-up.",
    parameters: {
      type: "object",
      properties: {
        mentionId: { type: "string" },
        isSaved: { type: "boolean" },
        needsFollowUp: { type: "boolean" },
      },
      required: ["mentionId"],
    },
  },
  {
    name: "trigger_market_scan",
    description: "Enqueue a Market Insights scan (keywords + followed accounts) plus a deep follow-up job. Returns immediately.",
    parameters: {
      type: "object",
      properties: {
        platforms: { type: "array", items: { type: "string", enum: [...MARKET_PLATFORMS] } },
      },
    },
  },
  {
    name: "convert_mention_to_prospect",
    description: "Create a prospect company + contact from a mention author, and mark the mention saved.",
    parameters: {
      type: "object",
      properties: { mentionId: { type: "string" } },
      required: ["mentionId"],
    },
  },
] as const;

function asPlatforms(value: unknown): MarketPlatform[] {
  if (!Array.isArray(value)) return [...DEFAULT_MARKET_PLATFORMS];
  const allowed = new Set<string>(MARKET_PLATFORMS);
  const picked = value.filter((item): item is MarketPlatform => typeof item === "string" && allowed.has(item));
  return picked.length ? picked : [...DEFAULT_MARKET_PLATFORMS];
}

async function listKeywords(ctx: AgentToolContext) {
  const companyId = await userCompanyId(ctx.db, ctx.userId);
  if (!companyId) return { keywords: [] };
  const { data } = await ctx.db.from("market_keywords").select("id, keyword, platforms, is_active, last_scanned_at").eq("company_id", companyId);
  return { keywords: data ?? [] };
}

async function listAccounts(ctx: AgentToolContext, args: { query?: string; followedOnly?: boolean; limit?: number }) {
  const companyId = await userCompanyId(ctx.db, ctx.userId);
  if (!companyId) return { accounts: [] };
  let q = ctx.db
    .from("market_accounts")
    .select("id, platform, handle, name, is_followed")
    .eq("company_id", companyId)
    .limit(clampLimit(args.limit));
  if (args.followedOnly) q = q.eq("is_followed", true);
  if (args.query) q = q.or(`handle.ilike.%${args.query}%,name.ilike.%${args.query}%`);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return { accounts: data ?? [] };
}

async function listMentions(
  ctx: AgentToolContext,
  args: { platform?: string; keyword?: string; accountId?: string; savedOnly?: boolean; limit?: number },
) {
  const companyId = await userCompanyId(ctx.db, ctx.userId);
  if (!companyId) return { mentions: [] };
  let q = ctx.db
    .from("market_mentions")
    .select("id, platform, url, author_name, author_handle, content, posted_at, engagement, is_saved, needs_follow_up, market_keywords(keyword)")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(clampLimit(args.limit));
  if (args.platform) q = q.eq("platform", args.platform);
  if (args.accountId) q = q.eq("account_id", args.accountId);
  if (args.savedOnly) q = q.eq("is_saved", true);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const keywordOf = (m: (typeof data)[number]): string | undefined => {
    const rel = m.market_keywords as { keyword: string } | { keyword: string }[] | null;
    return Array.isArray(rel) ? rel[0]?.keyword : rel?.keyword;
  };
  const mentions = (data ?? []).filter((m) => !args.keyword || keywordOf(m) === args.keyword);
  return {
    mentions: mentions.map((m) => ({
      id: m.id,
      platform: m.platform,
      url: m.url,
      author: m.author_name || m.author_handle,
      handle: m.author_handle,
      content: m.content,
      postedAt: m.posted_at,
      engagement: m.engagement,
      isSaved: m.is_saved,
      needsFollowUp: m.needs_follow_up,
    })),
  };
}

async function addKeyword(ctx: AgentToolContext, args: Record<string, unknown>) {
  const companyId = await userCompanyId(ctx.db, ctx.userId);
  if (!companyId) return { error: "Build and approve your company blueprint first." };
  const keyword = String(args.keyword ?? "").trim();
  if (!keyword) return { error: "Keyword is required." };
  const { data, error } = await ctx.db
    .from("market_keywords")
    .insert({ user_id: ctx.userId, company_id: companyId, keyword, platforms: asPlatforms(args.platforms) })
    .select("id, keyword, platforms, is_active")
    .single();
  if (error) throw new Error(error.message);
  return { keyword: data };
}

async function setKeywordActive(ctx: AgentToolContext, args: Record<string, unknown>) {
  const { error } = await ctx.db
    .from("market_keywords")
    .update({ is_active: Boolean(args.isActive) })
    .eq("id", String(args.keywordId))
    .eq("user_id", ctx.userId);
  if (error) throw new Error(error.message);
  return { ok: true };
}

async function followByHandle(ctx: AgentToolContext, args: Record<string, unknown>) {
  const companyId = await userCompanyId(ctx.db, ctx.userId);
  if (!companyId) return { error: "No company found." };
  const platform = String(args.platform) as MarketPlatform;
  const handle = String(args.handle ?? "").trim().replace(/^@/, "");
  if (!handle) return { error: "Handle is required." };
  const { data, error } = await ctx.db
    .from("market_accounts")
    .upsert(
      {
        company_id: companyId,
        platform,
        handle,
        name: typeof args.name === "string" ? args.name : null,
        is_followed: Boolean(args.follow),
      },
      { onConflict: "company_id,platform,handle" },
    )
    .select("id, platform, handle, name, is_followed")
    .single();
  if (error) throw new Error(error.message);
  await ctx.db
    .from("market_mentions")
    .update({ account_id: data.id })
    .eq("company_id", companyId)
    .eq("platform", platform)
    .eq("author_handle", handle)
    .is("account_id", null);
  return { account: data };
}

async function updateFollow(ctx: AgentToolContext, args: { accountId: string; follow: boolean }) {
  const companyId = await userCompanyId(ctx.db, ctx.userId);
  if (!companyId) throw new Error("No company found");
  const { error } = await ctx.db.from("market_accounts").update({ is_followed: args.follow }).eq("id", args.accountId).eq("company_id", companyId);
  if (error) throw new Error(error.message);
  return { ok: true };
}

async function updateMention(ctx: AgentToolContext, args: { mentionId: string; isSaved?: boolean; needsFollowUp?: boolean }) {
  const companyId = await userCompanyId(ctx.db, ctx.userId);
  if (!companyId) throw new Error("No company found");
  const update: { is_saved?: boolean; needs_follow_up?: boolean } = {};
  if (args.isSaved !== undefined) update.is_saved = args.isSaved;
  if (args.needsFollowUp !== undefined) update.needs_follow_up = args.needsFollowUp;
  const { error } = await ctx.db.from("market_mentions").update(update).eq("id", args.mentionId).eq("company_id", companyId);
  if (error) throw new Error(error.message);
  return { ok: true };
}

async function triggerScan(ctx: AgentToolContext, args: Record<string, unknown>) {
  const companyId = await userCompanyId(ctx.db, ctx.userId);
  if (!companyId) return { scanned: 0, saved: 0, message: "No company yet — build a blueprint first." };
  const platforms = Array.isArray(args.platforms) ? asPlatforms(args.platforms) : undefined;
  enqueueInternalJob(
    "/api/jobs/market-scan",
    { companyId, platforms },
    async () => {
      await runMarketScanWithProgress(ctx.db, companyId, () => undefined, platforms);
      await runDeepMarketScan(ctx.db, companyId, platforms);
    },
  );
  return { queued: true, companyId, platforms: platforms ?? DEFAULT_MARKET_PLATFORMS };
}

function socialDomain(platform: string, handle: string | null, url: string | null): { domain: string; websiteUrl: string } {
  const clean = (handle ?? "").replace(/^@/, "") || "unknown";
  if (url) {
    try {
      const parsed = new URL(url);
      return { domain: `${parsed.hostname}/${clean}`.slice(0, 180), websiteUrl: url };
    } catch {
      /* fall through */
    }
  }
  const host = platform === "twitter" ? "x.com" : platform === "linkedin" ? "linkedin.com" : platform === "reddit" ? "reddit.com" : `${platform}.com`;
  return { domain: `${host}/${clean}`.slice(0, 180), websiteUrl: `https://${host}/${clean}` };
}

async function convertMention(ctx: AgentToolContext, mentionId: string) {
  const companyId = await userCompanyId(ctx.db, ctx.userId);
  if (!companyId) return { error: "No company found." };
  const { data: mention, error } = await ctx.db
    .from("market_mentions")
    .select("id, platform, url, author_name, author_handle, content")
    .eq("id", mentionId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!mention) return { error: "Mention not found." };

  const { data: existingList } = await ctx.db
    .from("prospect_lists")
    .select("id")
    .eq("user_id", ctx.userId)
    .eq("company_id", companyId)
    .eq("name", "Market Insights")
    .maybeSingle();
  let listId = existingList?.id;
  if (!listId) {
    const { data: created, error: listError } = await ctx.db
      .from("prospect_lists")
      .insert({
        user_id: ctx.userId,
        company_id: companyId,
        name: "Market Insights",
        criteria: { industries: [], geographies: [], personas: [] },
        status: "completed",
        requested_count: 0,
      })
      .select("id")
      .single();
    if (listError || !created) throw new Error(listError?.message ?? "Could not create Market Insights list");
    listId = created.id;
  }

  const author = mention.author_name || mention.author_handle || "Unknown author";
  const { domain, websiteUrl } = socialDomain(mention.platform, mention.author_handle, mention.url);
  const { data: prospect, error: prospectError } = await ctx.db
    .from("prospect_companies")
    .upsert(
      {
        user_id: ctx.userId,
        company_id: companyId,
        list_id: listId,
        name: author,
        domain,
        website_url: websiteUrl,
        source: "market_insights",
        source_ref: { mentionId: mention.id, platform: mention.platform },
        status: "new",
        qualify_reason: mention.content ? String(mention.content).slice(0, 400) : null,
      },
      { onConflict: "list_id,domain" },
    )
    .select("id, name, domain")
    .single();
  if (prospectError || !prospect) throw new Error(prospectError?.message ?? "Could not save prospect");

  const { data: contact, error: contactError } = await ctx.db
    .from("contacts")
    .insert({
      prospect_company_id: prospect.id,
      full_name: author,
      title: null,
      email: null,
      linkedin_url: mention.platform === "linkedin" ? mention.url : null,
      source: "market_insights",
      lead_status: "new",
      qualify_reason: mention.content ? String(mention.content).slice(0, 400) : null,
    })
    .select("id, full_name")
    .single();
  if (contactError) throw new Error(contactError.message);

  await ctx.db
    .from("market_mentions")
    .update({ is_saved: true, needs_follow_up: true })
    .eq("id", mention.id)
    .eq("company_id", companyId);

  return { prospect, contact, mentionId: mention.id };
}

async function runTool(ctx: AgentToolContext, name: string, args: Record<string, unknown>) {
  switch (name) {
    case "list_market_keywords":
      return listKeywords(ctx);
    case "list_market_accounts":
      return listAccounts(ctx, args as { query?: string; followedOnly?: boolean; limit?: number });
    case "list_market_mentions":
      return listMentions(ctx, args as { platform?: string; keyword?: string; accountId?: string; savedOnly?: boolean; limit?: number });
    case "add_market_keyword":
      return addKeyword(ctx, args);
    case "set_keyword_active":
      return setKeywordActive(ctx, args);
    case "follow_account_by_handle":
      return followByHandle(ctx, args);
    case "update_market_account_follow":
      return updateFollow(ctx, args as { accountId: string; follow: boolean });
    case "update_market_mention":
      return updateMention(ctx, args as { mentionId: string; isSaved?: boolean; needsFollowUp?: boolean });
    case "trigger_market_scan":
      return triggerScan(ctx, args);
    case "convert_mention_to_prospect":
      return convertMention(ctx, String(args.mentionId ?? ""));
    default:
      throw new Error(`Unknown Listener tool: ${name}`);
  }
}

export const listener: SpecialistModule = {
  id: "listener",
  instruction,
  tools: [...LISTENER_TOOLS],
  runTool,
};
