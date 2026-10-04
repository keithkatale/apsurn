import { NextResponse } from "next/server";
import { claimGuestWorkspace } from "@/lib/auth/claim-guest";

export async function POST() {
  try {
    const result = await claimGuestWorkspace();
    return NextResponse.json(result);
  } catch (error) {
    console.error("[auth/claim]", error instanceof Error ? error.message : error);
    return NextResponse.json({ claimed: false }, { status: 500 });
  }
}
