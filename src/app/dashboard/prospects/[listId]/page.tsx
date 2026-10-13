import { ProspectsPage } from "../prospects-view";

export default function ProspectListPage({ searchParams }: { searchParams: Promise<{ find?: string }> }) {
  return ProspectsPage({ searchParams });
}

export const dynamic = "force-dynamic";
