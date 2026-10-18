"use client";

import { useEffect, useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { ContactAvatar } from "@/components/prospects/ContactAvatar";
import { CompanyFavicon } from "@/components/prospects/CompanyFavicon";
import { MeshGradient } from "@/components/ui/mesh-gradient";

interface PreviewLead {
  id: string;
  name: string;
  title: string;
  company: string;
  domain: string;
  country: string;
  photoUrl: string | null;
  linkedinUrl: string | null;
}

/** Shown only to people who have not run setup yet, and labelled as examples. */
const portrait = (gender: "men" | "women", n: number) => `https://randomuser.me/api/portraits/${gender}/${n}.jpg`;

const EXAMPLE_LEADS: PreviewLead[] = [
  { id: "e1", name: "Maya Okafor", title: "Co-Founder", company: "Northwind Labs", domain: "northwind.io", country: "United Kingdom", photoUrl: portrait("women", 44), linkedinUrl: null },
  { id: "e2", name: "Daniel Reyes", title: "Head of Growth", company: "Basecamp Ops", domain: "basecamp.com", country: "United States", photoUrl: portrait("men", 32), linkedinUrl: null },
  { id: "e3", name: "Lena Fischer", title: "VP Sales", company: "Paperplane", domain: "paperplane.app", country: "Germany", photoUrl: portrait("women", 68), linkedinUrl: null },
  { id: "e4", name: "Sam Adeyemi", title: "CEO", company: "Ledgerly", domain: "ledgerly.com", country: "Nigeria", photoUrl: portrait("men", 75), linkedinUrl: null },
  { id: "e5", name: "Priya Nair", title: "Founder", company: "Stackwise", domain: "stackwise.dev", country: "India", photoUrl: portrait("women", 12), linkedinUrl: null },
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
            domain: typeof company.domain === "string" ? company.domain : "",
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
    // Same look as the landing page hero: a white frame around a rounded blue gradient card.
    <div className="absolute inset-0 bg-white p-3">
      <div className="relative h-full overflow-hidden rounded-[28px] xl:rounded-[32px]">
        <MeshGradient
          className="absolute inset-0"
          color1="#8eb8ff"
          color2="#4379EE"
          color3="#1d4ed8"
          color4="#0a1a4a"
          speed={0.55}
          distortion={0.85}
          swirl={0.5}
          scale={1.35}
          rotation={110}
        />
        <div className="relative z-10 flex h-full flex-col justify-center px-8 py-14 xl:px-12">
          <div className="mx-auto w-full max-w-[36rem]">
            <h2 className="font-heading text-[2rem] font-semibold leading-[1.08] tracking-[-0.045em] text-white xl:text-[2.6rem]">
              {isReal ? "Your campaign is ready to open." : "Leads found. Emails written. Ready to send."}
            </h2>
            <p className="mt-3 text-[16px] font-medium leading-snug text-white/90">
              {isReal
                ? "Create your account to open your campaigns and start sending."
                : "Paste your website. apsurn finds who should buy, then writes each one a personal email."}
            </p>

            <div className="mt-7 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-[0_8px_30px_rgba(10,26,74,0.25)]">
              <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1.2fr)_minmax(0,0.8fr)] gap-3 border-b border-neutral-200 px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wide text-neutral-400">
                <span>Name</span>
                <span>Company</span>
                <span>Country</span>
              </div>
              <ul className="min-h-[18.5rem]">
                {visible.map((lead) => (
                  <li
                    key={`${lead.id}-${leads.length}`}
                    className="auth-lead-in grid grid-cols-[minmax(0,1.5fr)_minmax(0,1.2fr)_minmax(0,0.8fr)] items-center gap-3 border-b border-neutral-100 px-4 py-3 last:border-b-0"
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <ContactAvatar name={lead.name} linkedinUrl={lead.linkedinUrl} photoUrl={lead.photoUrl} className="size-9" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-neutral-900">{lead.name}</span>
                        <span className="block truncate text-[12px] text-neutral-500">{lead.title || "—"}</span>
                      </span>
                    </span>
                    <span className="flex min-w-0 items-center gap-2 text-sm text-neutral-700">
                      {lead.domain ? <CompanyFavicon domain={lead.domain} name={lead.company} /> : null}
                      <span className="truncate">{lead.company || "—"}</span>
                    </span>
                    <span className="truncate text-sm text-neutral-600">{lead.country || "—"}</span>
                  </li>
                ))}
              </ul>
              <p className="border-t border-neutral-100 px-4 py-2 text-left text-[11px] text-neutral-400">
                {shown} lead{shown === 1 ? "" : "s"} · {isReal ? "from your setup" : "example leads"}
              </p>
            </div>

            <div
              className="mt-3 flex items-center gap-2.5 rounded-xl border border-white/25 bg-white/15 px-4 py-3 text-left text-[13px] font-medium text-white backdrop-blur-sm"
              role="status"
            >
              <Sparkles className="size-4 shrink-0" aria-hidden />
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
                <span className="text-white/80">Finding leads…</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
