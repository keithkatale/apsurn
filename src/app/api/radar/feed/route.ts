import { NextResponse } from "next/server";
import { AuthenticationError } from "@/lib/auth/session";
import { requireCompany } from "@/lib/market/access";
import { loadRadarFeed } from "@/lib/market/feed";

export const runtime = "nodejs";

export async function GET() {
  try {
    const { userId, db, companyId } = await requireCompany();
    if (!companyId) return NextResponse.json({ error: "Set up your company first" }, { status: 400 });
    const feed = await loadRadarFeed(db, userId, companyId);
    return NextResponse.json({ feed });
  } catch (error) {
    if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
    console.error("[radar] feed failed", error);
    return NextResponse.json({ error: "Could not load Radar" }, { status: 500 });
  }
}
