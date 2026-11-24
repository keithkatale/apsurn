import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isGuestUser } from "@/lib/auth/guest";

export async function GET() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ user: false, guest: false });
  const guest = isGuestUser(data.user);
  return NextResponse.json({ user: true, guest, email: guest ? null : (data.user.email ?? null) });
}
