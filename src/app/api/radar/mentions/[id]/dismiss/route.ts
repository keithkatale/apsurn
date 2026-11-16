import { NextResponse } from "next/server";
import { AuthenticationError } from "@/lib/auth/session";
import { requireCompany } from "@/lib/market/access";

export const runtime = "nodejs";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { db, companyId } = await requireCompany();
    if (!companyId) return NextResponse.json({ error: "Set up your company first" }, { status: 400 });
    const { id } = await params;
    const { data, error } = await db
      .from("market_mentions")
      .update({ status: "dismissed" })
      .eq("id", id)
      .eq("company_id", companyId)
      .select("id")
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }
}
