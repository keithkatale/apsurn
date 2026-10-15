"use client";

import { useEffect, useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { ContactAvatar } from "@/components/prospects/ContactAvatar";

interface PreviewLead {
  id: string;
  name: string;
  title: string;
  company: string;
  country: string;
  photoUrl: string | null;
  linkedinUrl: string | null;
}

/** Shown only to people who have not run setup yet, and labelled as examples. */
const EXAMPLE_LEADS: PreviewLead[] = [
  { id: "e1", name: "Maya Okafor", title: "Co-Founder", company: "Northwind Labs", country: "United Kingdom", photoUrl: null, linkedinUrl: null },
  { id: "e2", name: "Daniel Reyes", title: "Head of Growth", company: "Basecamp Ops", country: "United States", photoUrl: null, linkedinUrl: null },
  { id: "e3", name: "Lena Fischer", title: "VP Sales", company: "Paperplane", country: "Germany", photoUrl: null, linkedinUrl: null },
  { id: "e4", name: "Sam Adeyemi", title: "CEO", company: "Ledgerly", country: "Nigeria", photoUrl: null, linkedinUrl: null },
  { id: "e5", name: "Priya Nair", title: "Founder", company: "Stackwise", country: "India", photoUrl: null, linkedinUrl: null },
];

const STEP_MS = 1100;
const HOLD_MS = 3200;

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || "there";
}

/** The visitor's own leads when setup already found some (their guest workspace), else clearly-labelled examples. */
function useLeads() {
  const [real, setReal] = useState<PreviewLead[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/prospect-companies")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data || !Array.isArray(data.companies)) return;
        const leads: PreviewLead[] = [];
        for (const company of data.companies as Array<Record<string, unknown>>) {
          const contacts = Array.isArray(company.contacts) ? (company.contacts as Array<Record<string, unknown>>) : [];
          const contact = contacts.find((c) => typeof c.full_name === "string" && c.full_name) ?? null;
          if (!contact) continue;
          leads.push({
            id: String(contact.id ?? company.id),
            name: String(contact.full_name),
            title: typeof contact.title === "string" ? contact.title : "",
            company: typeof company.name === "string" ? company.name : "",
            country:
              (typeof contact.country === "string" && contact.country) || (typeof company.country === "string" ? company.country : ""),
            photoUrl: typeof contact.photo_url === "string" ? contact.photo_url : null,
            linkedinUrl: typeof contact.linkedin_url === "string" ? contact.linkedin_url : null,
          });
          if (leads.length >= 6) break;
        }
        if (leads.length > 0) setReal(leads);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return { leads: real ?? EXAMPLE_LEADS, isReal: real !== null };
}

/**
 * The left side of the sign-up page: leads appearing one after another with the email being written for the
 * latest one, so people see what they are about to open. Plays on a loop.
 */
export function AuthLeadsPreview() {
  const { leads, isReal } = useLeads();
  const [shown, setShown] = useState(0);

  useEffect(() => {
    const reduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      const id = window.setTimeout(() => setShown(leads.length), 0);
      return () => window.clearTimeout(id);
    }
    const id = window.setTimeout(
      () => setShown((current) => (current >= leads.length ? 0 : current + 1)),
      shown >= leads.length ? HOLD_MS : shown === 0 ? 600 : STEP_MS,
    );
    return () => window.clearTimeout(id);
  }, [shown, leads.length]);

  const latest = shown > 0 ? leads[Math.min(shown, leads.length) - 1] : null;
  const visible = useMemo(() => leads.slice(0, shown), [leads, shown]);

  return (
    <div className="absolute inset-0 flex flex-col justify-center bg-[#0b0d12] px-10 py-16 text-white xl:px-16">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(67,121,238,0.35),transparent_60%)]" aria-hidden />
      <div className="relative mx-auto w-full max-w-[34rem]">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#8eb0ff]">
          {isReal ? "Your first leads" : "What you get"}
        </p>
        <h2 className="mt-3 font-heading text-[2rem] font-semibold leading-[1.1] tracking-[-0.04em] xl:text-[2.4rem]">
          {isReal ? "Your campaign is ready to open." : "Leads found. Emails written. Ready to send."}
        </h2>
        <p className="mt-3 text-[15px] leading-relaxed text-white/65">
          {isReal
            ? "Create your account to open your campaigns and start sending."
            : "Paste your website and apsurn finds who should buy, then writes each one a personal email."}
        </p>

        <div className="mt-8 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-sm">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5 text-[12px] text-white/55">
            <span>{isReal ? "Leads from your setup" : "Example leads"}</span>
            <span className="tabular-nums">{shown} found</span>
          </div>
          <ul className="min-h-[19.5rem]">
            {visible.map((lead) => (
              <li key={`${lead.id}-${leads.length}`} className="auth-lead-in flex items-center gap-3 border-b border-white/5 px-4 py-3 last:border-b-0">
                <ContactAvatar name={lead.name} linkedinUrl={lead.linkedinUrl} photoUrl={lead.photoUrl} className="size-9 rounded-lg bg-white/10 text-white/70" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium text-white">{lead.name}</p>
                  <p className="truncate text-[12px] text-white/55">{[lead.title, lead.company].filter(Boolean).join(" · ")}</p>
                </div>
                {lead.country ? <span className="hidden shrink-0 text-[12px] text-white/45 xl:block">{lead.country}</span> : null}
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-[13px] text-white/70" role="status">
          <Sparkles className="size-4 shrink-0 text-[#8eb0ff]" aria-hidden />
          {latest ? (
            <span key={latest.id} className="auth-lead-in min-w-0 truncate">
              Writing a personal email to {firstName(latest.name)}
              <span className="auth-typing-dots" aria-hidden>
                <i />
                <i />
                <i />
              </span>
            </span>
          ) : (
            <span className="text-white/45">Finding leads…</span>
          )}
        </div>
      </div>
    </div>
  );
}
