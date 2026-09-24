import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AuthenticationError, getCurrentUserId } from "@/lib/auth/session";

export async function GET(_: Request, { params }: { params: Promise<{ runId: string }> }) {
  let userId: string;
  try { userId = await getCurrentUserId(); } catch (error) {
    if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }
  const { runId } = await params;
  const db = createAdminClient();
  const { data } = await db.from("prospecting_runs").select("id,list_id,status,stage,processed_count,target_count,contact_count,warning_count,error_summary,created_at,completed_at").eq("id", runId).eq("user_id", userId).maybeSingle();
  if (!data) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  const { data: companies } = await db
    .from("prospect_companies")
    .select("name, domain, contacts!contacts_prospect_company_id_fkey(full_name, title, email, linkedin_url)")
    .eq("list_id", data.list_id)
    .eq("user_id", userId)
    .is("archived_at", null)
    .order("created_at", { ascending: true });

  const leads = (companies ?? []).flatMap((company) => {
    const contacts = Array.isArray(company.contacts) ? company.contacts : [];
    if (contacts.length === 0) {
      return [{ company: company.name, domain: company.domain, name: null, title: null, email: null, linkedinUrl: null }];
    }
    return contacts.map((contact) => ({
      company: company.name,
      domain: company.domain,
      name: contact.full_name,
      title: contact.title,
      email: contact.email,
      linkedinUrl: contact.linkedin_url,
    }));
  });

  return NextResponse.json({ ...data, leads });
}
