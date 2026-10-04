import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Markdown } from "@/components/ui-spec/Markdown";
import { UiRenderer } from "@/components/ui-spec/UiRenderer";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPublicDocument } from "@/lib/workspace/documents";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const doc = await getPublicDocument(createAdminClient(), slug);
  return {
    title: doc?.title ?? "Page",
    robots: { index: false, follow: false },
  };
}

/** Public page for a document the owner chose to share, e.g. a demo or proposal sent to one prospect. */
export default async function PublicPage({ params }: Props) {
  const { slug } = await params;
  const doc = await getPublicDocument(createAdminClient(), slug);
  if (!doc) notFound();

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl bg-white px-5 py-10 text-neutral-900 sm:px-8">
      {doc.blocks ? <UiRenderer blocks={doc.blocks} /> : null}
      {doc.body ? (
        <article className={doc.blocks ? "mt-8" : ""}>
          {!doc.blocks ? <h1 className="mb-4 font-heading text-3xl font-semibold tracking-tight">{doc.title}</h1> : null}
          <Markdown>{doc.body}</Markdown>
        </article>
      ) : null}
      <p className="mt-12 text-center text-[11px] text-neutral-400">Made with apsurn</p>
    </main>
  );
}
