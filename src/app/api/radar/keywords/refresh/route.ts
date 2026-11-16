import { NextResponse } from "next/server";
import { AuthenticationError } from "@/lib/auth/session";
import { requireCompany } from "@/lib/market/access";
import { loadRadarFeed } from "@/lib/market/feed";
import { regenerateListeningKeywords } from "@/lib/market/suggest";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST() {
  try {
    const { userId, db, companyId } = await requireCompany();
    if (!companyId) return NextResponse.json({ error: "Set up your company first" }, { status: 400 });
    const added = await regenerateListeningKeywords(db, userId, companyId);
    const feed = await loadRadarFeed(db, userId, companyId);
    return NextResponse.json({ added, feed });
  } catch (error) {
    if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
    console.error("[radar] retune failed", error);
    return NextResponse.json({ error: "Could not retune listening phrases" }, { status: 500 });
  }
}
