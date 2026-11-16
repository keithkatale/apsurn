import { NextResponse } from "next/server";
import { AuthenticationError } from "@/lib/auth/session";
import { requireCompany } from "@/lib/market/access";
import { saveMentionToProspects } from "@/lib/market/save-mention";

export const runtime = "nodejs";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId, db, companyId } = await requireCompany();
    if (!companyId) return NextResponse.json({ error: "Set up your company first" }, { status: 400 });
    const { id } = await params;
    const saved = await saveMentionToProspects(db, userId, companyId, id);
    return NextResponse.json(saved);
  } catch (error) {
    if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
    const status = (error as Error & { status?: number }).status;
    if (status === 404) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    console.error("[radar] save failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save" }, { status: 500 });
  }
}
