import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sanitizeBlocks, type UiBlock } from "@/lib/ui/spec";

export const DOCUMENT_KINDS = [
  "brand_identity",
  "brand_vision",
  "email_template",
  "playbook",
  "battlecard",
  "demo_page",
  "page",
  "note",
] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const DOCUMENT_KIND_LABELS: Record<DocumentKind, string> = {
  brand_identity: "Brand identity",
  brand_vision: "Brand vision",
  email_template: "Email template",
  playbook: "Playbook",
  battlecard: "Battlecard",
  demo_page: "Client demo page",
  page: "Page",
  note: "Note",
};

export interface WorkspaceDocument {
  id: string;
  folder: string;
  kind: DocumentKind;
  title: string;
  body: string;
  blocks: UiBlock[] | null;
  shareSlug: string | null;
  isPublic: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

const COLUMNS = "id, folder, kind, title, body, blocks, share_slug, is_public, version, created_at, updated_at";
const MAX_BODY = 60_000;

type Row = {
  id: string;
  folder: string | null;
  kind: string;
  title: string;
  body: string | null;
  blocks: unknown;
  share_slug: string | null;
  is_public: boolean;
  version: number;
  created_at: string;
  updated_at: string;
};

/** Turns a missing-table error into something a person (and the model) can act on. */
function dbError(message: string | undefined, fallback: string): Error {
  if (message && /folder/i.test(message) && /schema cache|does not exist|column/i.test(message)) {
    return new Error(
      "The Library needs a database update for folders. Run supabase/migrations/0027_workspace_folders.sql in the Supabase SQL editor, then try again.",
    );
  }
  if (message && /schema cache|does not exist|workspace_documents/i.test(message)) {
    return new Error(
      "The Library tables are missing in the database. Run supabase/migrations/0026_workspace_library.sql in the Supabase SQL editor, then try again.",
    );
  }
  return new Error(message ?? fallback);
}

/** "Demos / Acme" -> "Demos/Acme". Drops empty, dot and unsafe segments; at most 4 levels deep. */
export function normalizeFolder(input: string): string {
  return input
    .split(/[\\/]+/)
    .map((segment) => segment.replace(/[^\p{L}\p{N} &()_.,'+-]/gu, "").trim().slice(0, 40))
    .filter((segment) => segment && segment !== "." && segment !== "..")
    .slice(0, 4)
    .join("/");
}

export function isDocumentKind(value: unknown): value is DocumentKind {
  return typeof value === "string" && (DOCUMENT_KINDS as readonly string[]).includes(value);
}

function toDocument(row: Row): WorkspaceDocument {
  const blocks = Array.isArray(row.blocks) ? sanitizeBlocks(row.blocks) : null;
  return {
    id: row.id,
    folder: normalizeFolder(row.folder ?? ""),
    kind: isDocumentKind(row.kind) ? row.kind : "note",
    title: row.title,
    body: row.body ?? "",
    blocks: blocks && blocks.length ? blocks : null,
    shareSlug: row.share_slug,
    isPublic: row.is_public,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listDocuments(
  db: SupabaseClient,
  userId: string,
  filter: { kind?: string; query?: string; limit?: number } = {},
): Promise<WorkspaceDocument[]> {
  let q = db
    .from("workspace_documents")
    .select(COLUMNS)
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(Math.min(Math.max(filter.limit ?? 50, 1), 200));
  if (isDocumentKind(filter.kind)) q = q.eq("kind", filter.kind);
  if (filter.query) q = q.ilike("title", `%${filter.query.replace(/[%,]/g, " ")}%`);
  const { data, error } = await q;
  if (error) throw dbError(error.message, "Could not list documents");
  return (data ?? []).map((row) => toDocument(row as Row));
}

export async function getDocument(db: SupabaseClient, userId: string, id: string): Promise<WorkspaceDocument | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data, error } = await db.from("workspace_documents").select(COLUMNS).eq("id", id).eq("user_id", userId).maybeSingle();
  if (error) throw dbError(error.message, "Could not read document");
  return data ? toDocument(data as Row) : null;
}

/** Public lookup by share slug. Only returns documents the owner has published. */
export async function getPublicDocument(db: SupabaseClient, slug: string): Promise<WorkspaceDocument | null> {
  if (!/^[a-z0-9]{6,32}$/.test(slug)) return null;
  const { data } = await db
    .from("workspace_documents")
    .select(COLUMNS)
    .eq("share_slug", slug)
    .eq("is_public", true)
    .maybeSingle();
  return data ? toDocument(data as Row) : null;
}

export async function saveDocument(
  db: SupabaseClient,
  userId: string,
  input: { id?: string; kind: DocumentKind; title: string; body?: string; blocks?: UiBlock[] | null; folder?: string },
): Promise<WorkspaceDocument> {
  const title = input.title.trim().slice(0, 160) || "Untitled";
  const body = (input.body ?? "").slice(0, MAX_BODY);

  if (input.id) {
    const existing = await getDocument(db, userId, input.id);
    if (!existing) throw new Error("Document not found");
    await db.from("workspace_document_versions").insert({
      document_id: existing.id,
      version: existing.version,
      title: existing.title,
      body: existing.body,
      blocks: existing.blocks,
    });
    const { data, error } = await db
      .from("workspace_documents")
      .update({
        kind: input.kind,
        title,
        folder: input.folder !== undefined ? normalizeFolder(input.folder) : existing.folder,
        body: input.body !== undefined ? body : existing.body,
        blocks: input.blocks !== undefined ? input.blocks : existing.blocks,
        version: existing.version + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .eq("user_id", userId)
      .select(COLUMNS)
      .single();
    if (error || !data) throw dbError(error?.message, "Could not update document");
    return toDocument(data as Row);
  }

  const { data, error } = await db
    .from("workspace_documents")
    .insert({ user_id: userId, kind: input.kind, title, body, blocks: input.blocks ?? null, folder: normalizeFolder(input.folder ?? "") })
    .select(COLUMNS)
    .single();
  if (error || !data) throw dbError(error?.message, "Could not save document");
  return toDocument(data as Row);
}

export async function deleteDocument(db: SupabaseClient, userId: string, id: string): Promise<boolean> {
  const { data } = await db.from("workspace_documents").delete().eq("id", id).eq("user_id", userId).select("id");
  return Boolean(data && data.length);
}

/** Turns the public link on or off. The slug is created once and kept so shared links stay stable. */
export async function setDocumentPublic(
  db: SupabaseClient,
  userId: string,
  id: string,
  isPublic: boolean,
): Promise<WorkspaceDocument> {
  const existing = await getDocument(db, userId, id);
  if (!existing) throw new Error("Document not found");
  const slug = existing.shareSlug ?? randomBytes(8).toString("hex").slice(0, 10);
  const { data, error } = await db
    .from("workspace_documents")
    .update({ is_public: isPublic, share_slug: slug })
    .eq("id", id)
    .eq("user_id", userId)
    .select(COLUMNS)
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not update sharing");
  return toDocument(data as Row);
}

export function shareUrl(slug: string): string {
  const origin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "https://apsurn.com";
  return `${origin}/p/${slug}`;
}

export function excerpt(doc: Pick<WorkspaceDocument, "body" | "blocks">, max = 240): string {
  const text = doc.body.trim() || doc.blocks?.map((b) => ("text" in b && typeof b.text === "string" ? b.text : "")).join(" ").trim() || "";
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

/** Every folder path the user can see: explicit ones plus the ancestors of every document and folder. */
export async function listFolders(db: SupabaseClient, userId: string, docs?: WorkspaceDocument[]): Promise<string[]> {
  const [{ data }, documents] = await Promise.all([
    db.from("workspace_folders").select("path").eq("user_id", userId),
    docs ? Promise.resolve(docs) : listDocuments(db, userId, { limit: 200 }),
  ]);
  const all = new Set<string>();
  const add = (path: string) => {
    const parts = path.split("/").filter(Boolean);
    for (let i = 1; i <= parts.length; i++) all.add(parts.slice(0, i).join("/"));
  };
  for (const row of data ?? []) add(row.path as string);
  for (const doc of documents) if (doc.folder) add(doc.folder);
  return [...all].sort((a, b) => a.localeCompare(b));
}

export async function createFolder(db: SupabaseClient, userId: string, path: string): Promise<string> {
  const normalized = normalizeFolder(path);
  if (!normalized) throw new Error("A folder name is required");
  const { error } = await db.from("workspace_folders").upsert({ user_id: userId, path: normalized }, { onConflict: "user_id,path" });
  if (error) throw dbError(error.message, "Could not create folder");
  return normalized;
}

/** Moves one document without touching its content or version history. */
export async function moveDocument(db: SupabaseClient, userId: string, id: string, folder: string): Promise<WorkspaceDocument> {
  const normalized = normalizeFolder(folder);
  if (normalized) await createFolder(db, userId, normalized);
  const { data, error } = await db
    .from("workspace_documents")
    .update({ folder: normalized })
    .eq("id", id)
    .eq("user_id", userId)
    .select(COLUMNS)
    .maybeSingle();
  if (error) throw dbError(error.message, "Could not move document");
  if (!data) throw new Error("Document not found");
  return toDocument(data as Row);
}

/** Renames a folder and everything inside it. */
export async function renameFolder(db: SupabaseClient, userId: string, from: string, to: string): Promise<string> {
  const src = normalizeFolder(from);
  const dst = normalizeFolder(to);
  if (!src || !dst) throw new Error("Both folder names are required");
  if (dst === src || dst.startsWith(`${src}/`)) throw new Error("Choose a different destination");
  const docs = await listDocuments(db, userId, { limit: 200 });
  const swap = (path: string) => (path === src ? dst : path.startsWith(`${src}/`) ? `${dst}${path.slice(src.length)}` : null);

  for (const doc of docs) {
    const next = swap(doc.folder);
    if (next !== null) await db.from("workspace_documents").update({ folder: normalizeFolder(next) }).eq("id", doc.id).eq("user_id", userId);
  }
  const { data: explicit } = await db.from("workspace_folders").select("id, path").eq("user_id", userId);
  for (const row of explicit ?? []) {
    const next = swap(row.path as string);
    if (next !== null) await db.from("workspace_folders").update({ path: normalizeFolder(next) }).eq("id", row.id);
  }
  await createFolder(db, userId, dst);
  return dst;
}

/** Only empty folders can be removed, so nothing is ever deleted by accident. */
export async function deleteFolder(db: SupabaseClient, userId: string, path: string): Promise<boolean> {
  const normalized = normalizeFolder(path);
  if (!normalized) return false;
  const docs = await listDocuments(db, userId, { limit: 200 });
  if (docs.some((d) => d.folder === normalized || d.folder.startsWith(`${normalized}/`))) {
    throw new Error("That folder still has documents in it. Move or delete them first.");
  }
  const folders = await listFolders(db, userId, docs);
  if (folders.some((f) => f.startsWith(`${normalized}/`))) throw new Error("That folder still has folders inside it.");
  await db.from("workspace_folders").delete().eq("user_id", userId).eq("path", normalized);
  return true;
}
