import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthenticationError, getCurrentUserId } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { SMTP_SCOPE, verifyGmailSmtp } from "@/lib/inbox/smtp";
import { encryptToken } from "@/lib/inbox/token-crypto";

const bodySchema = z.object({
  email: z.string().trim().email().max(200),
  appPassword: z.string().trim().min(8).max(80),
});

export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Enter a Gmail address and App Password." }, { status: 400 });
    }

    const email = parsed.data.email.toLowerCase();
    if (!email.endsWith("@gmail.com") && !email.endsWith("@googlemail.com")) {
      // Workspace domains still work over smtp.gmail.com when App Passwords are allowed.
    }

    await verifyGmailSmtp(email, parsed.data.appPassword);

    const db = createAdminClient();
    const { error } = await db.from("connected_inboxes").upsert(
      {
        user_id: userId,
        provider: "gmail",
        email_address: email,
        access_token_enc: encryptToken("smtp"),
        refresh_token_enc: encryptToken(parsed.data.appPassword.replace(/\s+/g, "")),
        token_expires_at: null,
        scopes: [SMTP_SCOPE],
        status: "connected",
      },
      { onConflict: "user_id,email_address" },
    );
    if (error) throw new Error(error.message);

    await db.from("connected_inboxes").delete().eq("user_id", userId).neq("email_address", email);

    return NextResponse.json({ ok: true, email });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not connect Gmail" },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const parsed = z
      .object({ inboxId: z.string().uuid() })
      .safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "inboxId required" }, { status: 400 });
    }

    const db = createAdminClient();
    const { error } = await db
      .from("connected_inboxes")
      .delete()
      .eq("user_id", userId)
      .eq("id", parsed.data.inboxId);
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not disconnect" },
      { status: 400 },
    );
  }
}
