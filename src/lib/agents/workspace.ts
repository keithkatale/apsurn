import type { AiToolDeclaration } from "@/lib/ai/openai";
import { sanitizeBlueprint } from "@/lib/blueprint/sanitize";
import { publishArtifact } from "@/lib/copilot/artifacts";
import { parseBlocks, UI_SPEC_GUIDE } from "@/lib/ui/spec";
import {
  DOCUMENT_KINDS,
  DOCUMENT_KIND_LABELS,
  createFolder,
  deleteDocument,
  listFolders,
  moveDocument,
  normalizeFolder,
  renameFolder,
  excerpt,
  getDocument,
  isDocumentKind,
  listDocuments,
  saveDocument,
  setDocumentPublic,
  shareUrl,
  type WorkspaceDocument,
} from "@/lib/workspace/documents";
import { getMarketingSkill, marketingSkillIndex, MARKETING_SKILLS } from "@/lib/skills/marketing";
import { userCompanyId } from "./shared";
import type { AgentToolContext } from "./types";

/**
 * The workspace toolkit: tools that let Copilot show rich views and keep durable work in the app
 * (brand identity, templates, playbooks, client demo pages, the company blueprint).
 */

export const WORKSPACE_TOOL_DECLARATIONS: AiToolDeclaration[] = [
  {
    name: "render_ui",
    description: `Show the user a custom visual card in the chat: a dashboard, comparison, plan, checklist, summary, or any view the built-in cards don't cover. Prefer this over long markdown whenever the answer is structured data. Build it from real data you already fetched; never invent figures.\n\n${UI_SPEC_GUIDE}`,
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short title for the card." },
        blocks_json: { type: "string", description: "JSON array of blocks, as described above." },
      },
      required: ["title", "blocks_json"],
    },
  },
  {
    name: "list_documents",
    description:
      "List the files in the user's Library workspace, with their folders and the full folder list. Call this before saving so you reuse existing folders instead of inventing near-duplicates.",
    parameters: {
      type: "object",
      properties: {
        folder: { type: "string", description: "Only files in this folder (and its subfolders)." },
        query: { type: "string", description: "Match on title." },
      },
    },
  },
  {
    name: "get_document",
    description: "Read one saved document in full (markdown body and any UI blocks).",
    parameters: { type: "object", properties: { documentId: { type: "string" } }, required: ["documentId"] },
  },
  {
    name: "save_document",
    description: `Create or update a file in the Library, which works like a file system you organize. Choose a clear title and a folder path such as "Brand", "Templates/Email", "Playbooks" or "Demos/<Prospect name>". Use it for brand identity, brand vision, email templates (with {{first_name}}, {{company}} style merge fields), playbooks, battlecards, notes, and client demo pages. Pass documentId to update an existing file (the old version is kept). Write body_markdown as rich, well-structured Markdown (headings, tables, lists, quotes). For a visual or interactive page (demo for a specific prospect, calculator, one-pager) pass blocks_json, alongside or instead of body_markdown.\n\n${UI_SPEC_GUIDE}`,
    parameters: {
      type: "object",
      properties: {
        documentId: { type: "string", description: "Omit to create a new file." },
        folder: { type: "string", description: 'Folder path, e.g. "Brand" or "Demos/Acme". Empty for the top level.' },
        kind: {
          type: "string",
          enum: [...DOCUMENT_KINDS],
          description: "Optional label. Use brand_identity / brand_vision for those two files so they are found as brand context.",
        },
        title: { type: "string" },
        body_markdown: { type: "string" },
        blocks_json: { type: "string", description: "Optional JSON array of UI blocks for a visual page." },
      },
      required: ["title"],
    },
  },
  {
    name: "move_document",
    description: "Move a file to another folder (created if needed). Use it to keep the Library tidy.",
    parameters: {
      type: "object",
      properties: { documentId: { type: "string" }, folder: { type: "string", description: "Destination folder path. Empty for the top level." } },
      required: ["documentId", "folder"],
    },
  },
  {
    name: "create_folder",
    description: "Create a folder (and any parents) in the Library.",
    parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
  },
  {
    name: "rename_folder",
    description: "Rename a folder and everything inside it.",
    parameters: {
      type: "object",
      properties: { from: { type: "string" }, to: { type: "string" } },
      required: ["from", "to"],
    },
  },
  {
    name: "delete_document",
    description: "Permanently delete a saved document. Only with confirmed=true after the user said to delete it.",
    parameters: {
      type: "object",
      properties: { documentId: { type: "string" }, confirmed: { type: "boolean" } },
      required: ["documentId"],
    },
  },
  {
    name: "publish_page",
    description:
      "Turn a document's public share link on or off, so it can be sent to a prospect or client without a login. Making a page public exposes it to anyone with the link: only call with confirmed=true after the user asked to share or publish it.",
    parameters: {
      type: "object",
      properties: {
        documentId: { type: "string" },
        public: { type: "boolean", description: "true to publish, false to unpublish." },
        confirmed: { type: "boolean" },
      },
      required: ["documentId", "public"],
    },
  },
  {
    name: "get_blueprint",
    description: "Read the full company blueprint: value prop, positioning, product summary, ICP, personas, competitors, and approval state.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "update_blueprint",
    description:
      "Edit the company blueprint. Only pass the fields to change; everything else is kept. Use after the user asks to change positioning, ICP, personas or competitors.",
    parameters: {
      type: "object",
      properties: {
        value_prop: { type: "string" },
        positioning: { type: "string" },
        product_summary: { type: "string" },
        industries: { type: "array", items: { type: "string" } },
        company_size_range: { type: "string" },
        geographies: { type: "array", items: { type: "string" } },
        budget_signals: { type: "array", items: { type: "string" } },
        competitors: { type: "array", items: { type: "string" } },
        personas_json: {
          type: "string",
          description: 'Optional JSON array replacing all personas: [{"title","seniority","painPoints":[],"goals":[]}]',
        },
      },
    },
  },
  {
    name: "get_marketing_skill",
    description:
      "Load a marketing playbook before writing. Call it with a name to read the full playbook, or without one to list them. Use cold-email for any outreach email, email-sequences for multi-step sequences and campaigns, copywriting for pages and demo pages, positioning-brand for brand identity, vision, positioning and messaging, persuasion to choose an angle, copy-editing for a final pass.",
    parameters: {
      type: "object",
      properties: { name: { type: "string", enum: MARKETING_SKILLS.map((s) => s.id) } },
    },
  },
  {
    name: "get_brand_context",
    description:
      "Fetch the user's saved brand identity and brand vision documents plus the blueprint essentials. Call this before writing any copy, templates, pages or emails so the voice and positioning match.",
    parameters: { type: "object", properties: {} },
  },
];

export const WORKSPACE_TOOL_NAMES = new Set(WORKSPACE_TOOL_DECLARATIONS.map((tool) => tool.name));

export const WORKSPACE_MUTATING_TOOLS = new Set([
  "save_document",
  "move_document",
  "create_folder",
  "rename_folder",
  "delete_document",
  "publish_page",
  "update_blueprint",
]);

function summarize(doc: WorkspaceDocument) {
  return {
    id: doc.id,
    folder: doc.folder,
    kind: doc.kind,
    kindLabel: DOCUMENT_KIND_LABELS[doc.kind],
    title: doc.title,
    version: doc.version,
    public: doc.isPublic,
    shareUrl: doc.isPublic && doc.shareSlug ? shareUrl(doc.shareSlug) : null,
    updatedAt: doc.updatedAt,
  };
}

async function publishDocumentCard(ctx: AgentToolContext, doc: WorkspaceDocument) {
  return publishArtifact(ctx, {
    kind: "document",
    title: doc.title,
    payload: {
      ...summarize(doc),
      documentId: doc.id,
      excerpt: excerpt(doc),
      hasPage: Boolean(doc.blocks),
    },
  });
}

async function getBlueprintRow(ctx: AgentToolContext) {
  const companyId = await userCompanyId(ctx.db, ctx.userId);
  if (!companyId) return null;
  const { data } = await ctx.db
    .from("company_blueprints")
    .select("icp, personas, value_prop, positioning, product_summary, competitors, approved_at, edited_by_user, confidence, model_used")
    .eq("company_id", companyId)
    .maybeSingle();
  return data ? { companyId, row: data } : null;
}

function blueprintView(row: {
  value_prop: unknown;
  positioning: unknown;
  product_summary: unknown;
  icp: unknown;
  personas: unknown;
  competitors: unknown;
  approved_at: unknown;
  edited_by_user: unknown;
}) {
  return {
    valueProp: row.value_prop,
    positioning: row.positioning,
    productSummary: row.product_summary,
    icp: row.icp,
    personas: row.personas,
    competitors: row.competitors,
    approved: Boolean(row.approved_at),
    editedByUser: row.edited_by_user,
  };
}

function strList(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : undefined;
}

export async function runWorkspaceTool(
  ctx: AgentToolContext,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case "render_ui": {
      const blocks = parseBlocks(args.blocks_json ?? args.blocks);
      if (blocks.length === 0) {
        return { error: "No valid blocks. Pass blocks_json as a JSON array using the documented block types." };
      }
      const title = typeof args.title === "string" ? args.title.trim().slice(0, 120) : "";
      const artifact = await publishArtifact(ctx, { kind: "ui", title: title || null, payload: { blocks } });
      if (!artifact) return { error: "Could not show the card." };
      return {
        rendered: true,
        artifactId: artifact.id,
        blockCount: blocks.length,
        note: "The card is now visible to the user. Do not repeat its contents; add at most one sentence.",
      };
    }

    case "list_documents": {
      const all = await listDocuments(ctx.db, ctx.userId, {
        query: typeof args.query === "string" ? args.query : undefined,
        limit: 200,
      });
      const within = typeof args.folder === "string" ? normalizeFolder(args.folder) : "";
      const docs = within ? all.filter((d) => d.folder === within || d.folder.startsWith(`${within}/`)) : all;
      return { folders: await listFolders(ctx.db, ctx.userId), documents: docs.map(summarize), count: docs.length };
    }

    case "get_document": {
      const doc = await getDocument(ctx.db, ctx.userId, String(args.documentId ?? ""));
      if (!doc) return { error: "Document not found" };
      return { ...summarize(doc), body: doc.body, blocks: doc.blocks };
    }

    case "save_document": {
      const existing = typeof args.documentId === "string" ? await getDocument(ctx.db, ctx.userId, args.documentId) : null;
      const kind = isDocumentKind(args.kind) ? args.kind : (existing?.kind ?? "note");
      const title = typeof args.title === "string" ? args.title : "";
      if (!title.trim()) return { error: "A title is required." };
      const hasBody = typeof args.body_markdown === "string";
      const blocks = args.blocks_json !== undefined ? parseBlocks(args.blocks_json) : undefined;
      if (args.blocks_json !== undefined && blocks && blocks.length === 0) {
        return { error: "blocks_json had no valid blocks. Use the documented block types." };
      }
      if (!hasBody && !blocks && typeof args.documentId !== "string") {
        return { error: "Provide body_markdown, blocks_json, or both." };
      }
      const doc = await saveDocument(ctx.db, ctx.userId, {
        id: typeof args.documentId === "string" ? args.documentId : undefined,
        kind,
        title,
        folder: typeof args.folder === "string" ? args.folder : undefined,
        body: hasBody ? (args.body_markdown as string) : undefined,
        blocks,
      });
      const artifact = await publishDocumentCard(ctx, doc);
      return {
        saved: true,
        ...summarize(doc),
        artifactId: artifact?.id,
        note: "Saved to the Library and shown to the user as a card. Do not paste the document back; summarize in a sentence.",
      };
    }

    case "move_document": {
      const doc = await moveDocument(ctx.db, ctx.userId, String(args.documentId ?? ""), String(args.folder ?? ""));
      return { moved: true, ...summarize(doc) };
    }

    case "create_folder": {
      const path = await createFolder(ctx.db, ctx.userId, String(args.path ?? ""));
      return { created: true, path };
    }

    case "rename_folder": {
      const path = await renameFolder(ctx.db, ctx.userId, String(args.from ?? ""), String(args.to ?? ""));
      return { renamed: true, path };
    }

    case "delete_document": {
      if (args.confirmed !== true) {
        return { needsConfirmation: true, message: "Ask the user to confirm deleting this document, then call again with confirmed=true." };
      }
      const ok = await deleteDocument(ctx.db, ctx.userId, String(args.documentId ?? ""));
      return ok ? { deleted: true } : { error: "Document not found" };
    }

    case "publish_page": {
      const wantsPublic = args.public === true;
      if (wantsPublic && args.confirmed !== true) {
        return {
          needsConfirmation: true,
          message: "Publishing makes this page viewable by anyone with the link. Confirm with the user, then call again with confirmed=true.",
        };
      }
      const doc = await setDocumentPublic(ctx.db, ctx.userId, String(args.documentId ?? ""), wantsPublic);
      const artifact = await publishDocumentCard(ctx, doc);
      return {
        ...summarize(doc),
        artifactId: artifact?.id,
        note: wantsPublic ? "The page is live at shareUrl." : "The page is no longer public.",
      };
    }

    case "get_blueprint": {
      const found = await getBlueprintRow(ctx);
      if (!found) return { error: "No blueprint yet. Point the user at setup." };
      return blueprintView(found.row);
    }

    case "update_blueprint": {
      const found = await getBlueprintRow(ctx);
      if (!found) return { error: "No blueprint yet. Point the user at setup." };
      const { row } = found;
      const currentIcp = (row.icp ?? {}) as Record<string, unknown>;

      let personas: unknown = row.personas;
      if (typeof args.personas_json === "string") {
        try {
          personas = JSON.parse(args.personas_json);
        } catch {
          return { error: "personas_json was not valid JSON." };
        }
      }

      const merged = sanitizeBlueprint(
        {
          companyName: null,
          icp: {
            industries: strList(args.industries) ?? currentIcp.industries,
            companySizeRange: typeof args.company_size_range === "string" ? args.company_size_range : currentIcp.companySizeRange,
            geographies: strList(args.geographies) ?? currentIcp.geographies,
            budgetSignals: strList(args.budget_signals) ?? currentIcp.budgetSignals,
          },
          personas,
          valueProp: typeof args.value_prop === "string" ? args.value_prop : row.value_prop,
          positioning: typeof args.positioning === "string" ? args.positioning : row.positioning,
          productSummary: typeof args.product_summary === "string" ? args.product_summary : row.product_summary,
          competitors: strList(args.competitors) ?? row.competitors,
        },
        { confidence: row.confidence ?? "model", modelUsed: row.model_used ?? null },
      );

      const { data, error } = await ctx.db
        .from("company_blueprints")
        .update({
          icp: merged.icp,
          personas: merged.personas,
          value_prop: merged.valueProp,
          positioning: merged.positioning,
          product_summary: merged.productSummary,
          competitors: merged.competitors,
          edited_by_user: true,
        })
        .eq("company_id", found.companyId)
        .select("icp, personas, value_prop, positioning, product_summary, competitors, approved_at, edited_by_user")
        .single();
      if (error || !data) return { error: error?.message ?? "Could not update the blueprint." };
      return { updated: true, blueprint: blueprintView(data) };
    }

    case "get_marketing_skill": {
      const skill = typeof args.name === "string" ? getMarketingSkill(args.name) : null;
      if (!skill) return { skills: marketingSkillIndex() };
      return { id: skill.id, title: skill.title, playbook: skill.body };
    }

    case "get_brand_context": {
      const [identity, vision, blueprint] = await Promise.all([
        listDocuments(ctx.db, ctx.userId, { kind: "brand_identity", limit: 1 }),
        listDocuments(ctx.db, ctx.userId, { kind: "brand_vision", limit: 1 }),
        getBlueprintRow(ctx),
      ]);
      return {
        brandIdentity: identity[0] ? { id: identity[0].id, title: identity[0].title, body: identity[0].body } : null,
        brandVision: vision[0] ? { id: vision[0].id, title: vision[0].title, body: vision[0].body } : null,
        blueprint: blueprint ? blueprintView(blueprint.row) : null,
        hint:
          !identity[0] && !vision[0]
            ? "No brand documents saved yet. Offer to draft a brand identity and vision with save_document."
            : undefined,
      };
    }

    default:
      throw new Error(`Unknown workspace tool: ${name}`);
  }
}

/** The two read-only tools the Writer and Operator need so their copy is grounded in the business and a playbook. */
export const COPY_GROUNDING_TOOLS = WORKSPACE_TOOL_DECLARATIONS.filter(
  (tool) => tool.name === "get_marketing_skill" || tool.name === "get_brand_context",
);
export const COPY_GROUNDING_TOOL_NAMES = new Set(COPY_GROUNDING_TOOLS.map((tool) => tool.name));
