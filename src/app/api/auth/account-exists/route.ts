import { NextRequest, NextResponse } from "next/server";
import { accountExists } from "@/lib/auth/account-exists";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  if (!email || !email.includes("@") || email.length > 320) {
    return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
  }

  try {
    const exists = await accountExists(email);
    return NextResponse.json({ exists });
  } catch (error) {
    console.error("[auth/account-exists]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Could not look up that account" }, { status: 500 });
  }
}
