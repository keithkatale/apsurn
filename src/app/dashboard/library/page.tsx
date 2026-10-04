import { LibraryWorkspace } from "@/components/library/LibraryWorkspace";
import { getCurrentUserId } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { listDocuments, listFolders, shareUrl } from "@/lib/workspace/documents";

export const dynamic = "force-dynamic";

export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ doc?: string }> }) {
  const [{ doc }, userId] = await Promise.all([searchParams, getCurrentUserId()]);
  const db = createAdminClient();
  let documents: Awaited<ReturnType<typeof listDocuments>> = [];
  let folders: string[] = [];
  let loadError: string | null = null;
  try {
    documents = await listDocuments(db, userId, { limit: 200 });
    folders = await listFolders(db, userId, documents);
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Could not load the Library";
  }
  return (
    <LibraryWorkspace
      loadError={loadError}
      initialFolders={folders}
      initial={documents.map((d) => ({ ...d, shareUrl: d.isPublic && d.shareSlug ? shareUrl(d.shareSlug) : null }))}
      initialId={doc}
    />
  );
}
