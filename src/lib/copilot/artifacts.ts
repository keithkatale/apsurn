import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentToolContext, ArtifactKind, CopilotArtifact } from "@/lib/agents/types";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function rowToArtifact(row: {
  id: string;
  conversation_id: string;
  kind: string;
  title: string | null;
  payload: unknown;
  state: unknown;
}): CopilotArtifact {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    kind: row.kind as ArtifactKind,
    title: row.title,
    payload: asRecord(row.payload),
    state: asRecord(row.state),
  };
}

export async function createArtifact(
  db: SupabaseClient,
  input: {
    conversationId: string;
    userId: string;
    kind: ArtifactKind;
    title?: string | null;
    payload: Record<string, unknown>;
    state?: Record<string, unknown>;
  },
): Promise<CopilotArtifact | null> {
  const { data, error } = await db
    .from("copilot_artifacts")
    .insert({
      conversation_id: input.conversationId,
      user_id: input.userId,
      kind: input.kind,
      title: input.title ?? null,
      payload: input.payload,
      state: input.state ?? {},
    })
    .select("id, conversation_id, kind, title, payload, state")
    .single();
  if (error || !data) {
    console.error("[copilot] artifact insert failed", error?.message);
    return null;
  }
  return rowToArtifact(data);
}

export async function updateArtifact(
  db: SupabaseClient,
  userId: string,
  id: string,
  patch: { title?: string | null; payload?: Record<string, unknown>; state?: Record<string, unknown> },
): Promise<CopilotArtifact | null> {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) update.title = patch.title;
  if (patch.payload !== undefined) update.payload = patch.payload;
  if (patch.state !== undefined) update.state = patch.state;
  const { data, error } = await db
    .from("copilot_artifacts")
    .update(update)
    .eq("id", id)
    .eq("user_id", userId)
    .select("id, conversation_id, kind, title, payload, state")
    .maybeSingle();
  if (error || !data) return null;
  return rowToArtifact(data);
}

export async function getOwnedArtifact(
  db: SupabaseClient,
  userId: string,
  id: string,
): Promise<CopilotArtifact | null> {
  const { data, error } = await db
    .from("copilot_artifacts")
    .select("id, conversation_id, kind, title, payload, state")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return rowToArtifact(data);
}

export async function listArtifactsForConversation(
  db: SupabaseClient,
  userId: string,
  conversationId: string,
): Promise<CopilotArtifact[]> {
  const { data, error } = await db
    .from("copilot_artifacts")
    .select("id, conversation_id, kind, title, payload, state")
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return data.map(rowToArtifact);
}

export async function publishArtifact(
  ctx: Pick<AgentToolContext, "db" | "userId" | "conversationId" | "emit">,
  input: { kind: ArtifactKind; title?: string | null; payload: Record<string, unknown>; state?: Record<string, unknown> },
): Promise<CopilotArtifact | null> {
  if (!ctx.conversationId) return null;
  const artifact = await createArtifact(ctx.db, {
    conversationId: ctx.conversationId,
    userId: ctx.userId,
    kind: input.kind,
    title: input.title,
    payload: input.payload,
    state: input.state,
  });
  if (artifact) ctx.emit?.({ type: "artifact", name: artifact.kind, artifact });
  return artifact;
}
