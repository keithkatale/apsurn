import { NextResponse } from "next/server";
import { AdminAccessError, requireAdminUser } from "@/lib/auth/admin";
import { AuthenticationError } from "@/lib/auth/session";

/** Returns an error response when the caller isn't a platform admin, else null. */
export async function requireAdminForApi(): Promise<NextResponse | null> {
  try {
    await requireAdminUser();
    return null;
  } catch (error) {
    if (error instanceof AuthenticationError) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    if (error instanceof AdminAccessError) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    throw error;
  }
}
