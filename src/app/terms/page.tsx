import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";

export const metadata: Metadata = {
  title: "Terms and Conditions — apsurn",
  description:
    "Terms of use for the Apsurn B2B prospecting and outreach product, including accounts, Gmail sending, acceptable use, and liability.",
};

const SECTIONS = [
  { id: "agreement", label: "Agreement" },
  { id: "eligibility", label: "Eligibility" },
  { id: "account", label: "Accounts" },
  { id: "service", label: "The service" },
  { id: "customer-content", label: "Your content" },
  { id: "acceptable-use", label: "Acceptable use" },
  { id: "prospecting", label: "Prospecting data" },
  { id: "email", label: "Email and Gmail" },
  { id: "ai", label: "AI features" },
  { id: "third-parties", label: "Third parties" },
  { id: "fees", label: "Trials and fees" },
  { id: "ip", label: "Intellectual property" },
  { id: "confidentiality", label: "Confidentiality" },
  { id: "warranties", label: "Warranties" },
  { id: "liability", label: "Liability" },
  { id: "indemnity", label: "Indemnity" },
  { id: "termination", label: "Termination" },
  { id: "law", label: "Governing law" },
  { id: "changes", label: "Changes" },
  { id: "contact", label: "Contact" },
] as const;

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white text-neutral-900" style={{ colorScheme: "light" }}>
      <Navbar />
      <main className="mx-auto w-full max-w-[1100px] px-5 pb-20 pt-28 sm:px-8 lg:px-10">
        <header className="max-w-3xl">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#4379EE]">Legal</p>
          <h1 className="mt-2 font-heading text-3xl font-semibold tracking-[-0.04em] text-black sm:text-4xl">
            Terms and Conditions
          </h1>
          <p className="mt-3 text-sm text-neutral-500">Effective 21 September 2026 · Last updated 21 September 2026</p>
          <p className="mt-4 text-[15px] leading-relaxed text-neutral-700">
            These Terms and Conditions (“Terms”) are a contract between you and Apsurn, the operator of
            apsurn.com and the Apsurn application (“Apsurn”, “we”, “us”). By creating an account, starting
            setup, connecting an inbox, or otherwise using the service, you agree to these Terms and to our{" "}
            <Link href="/privacy" className="font-medium text-[#4379EE] underline">
              Privacy Policy
            </Link>
            .
          </p>
        </header>

        <div className="mt-10 grid gap-10 lg:grid-cols-[220px_minmax(0,1fr)]">
          <nav className="lg:sticky lg:top-28 lg:self-start">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">On this page</p>
            <ul className="mt-3 flex flex-col gap-1.5 text-sm">
              {SECTIONS.map((section) => (
                <li key={section.id}>
                  <a href={`#${section.id}`} className="text-neutral-600 hover:text-neutral-900">
                    {section.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <article className="flex max-w-3xl flex-col gap-10 text-[15px] leading-relaxed text-neutral-700">
            <Section id="agreement" title="1. Agreement">
              <p>
                If you use Apsurn on behalf of a company, you represent that you have authority to bind that
                company, and “you” includes that company. If you do not agree, do not use the service.
              </p>
            </Section>

            <Section id="eligibility" title="2. Eligibility">
              <p>
                You must be at least 18 and able to form a contract. The service is for business use
                (B2B prospecting and outreach), not consumer marketing to children or personal social use.
              </p>
            </Section>

            <Section id="account" title="3. Accounts">
              <p>
                You must provide accurate registration details and keep credentials confidential. You are
                responsible for activity under your account. Notify us promptly if you suspect unauthorized
                access. We may suspend accounts that violate these Terms or that present a security risk.
              </p>
            </Section>

            <Section id="service" title="4. The service">
              <p>
                Apsurn helps you research a company website, draft an ICP and campaigns, find professional
                accounts and contacts, write outreach, and send email through a mailbox you connect. Features
                may change, be rate-limited, or depend on third-party data and model providers. We do not
                guarantee any number of meetings, replies, or revenue.
              </p>
              <p>
                Output (blueprints, campaign copy, contact lists, scores) is assistive. You must review it
                before you rely on it or send it.
              </p>
            </Section>

            <Section id="customer-content" title="5. Your content">
              <p>
                You retain rights in content you submit (website URLs, edits to blueprints, campaign text,
                notes). You grant Apsurn a worldwide license to host, process, and display that content as
                needed to provide the service, including sending it to subprocessors (database, AI, data
                providers, Google if you connect Gmail).
              </p>
              <p>
                You represent that you have the rights and lawful basis to submit that content and to use
                Apsurn to contact people whose details you store.
              </p>
            </Section>

            <Section id="acceptable-use" title="6. Acceptable use">
              <p>You will not, and will not allow others to:</p>
              <ul className="list-disc space-y-2 pl-5">
                <li>Use Apsurn for unlawful spam, phishing, fraud, harassment, or deceptive email.</li>
                <li>Violate CAN-SPAM, CASL, PECR, GDPR, or any anti-spam or data-protection law that applies to you.</li>
                <li>Harvest credentials, attack the service, or bypass rate limits or security controls.</li>
                <li>Scrape or access private, authenticated, or paywalled systems through Apsurn.</li>
                <li>Upload malware or attempt to reverse engineer non-public parts of the product except as allowed by law.</li>
                <li>Misrepresent your identity or the identity of the sending mailbox.</li>
                <li>Use lists of people who have opted out or been suppressed.</li>
              </ul>
              <p>
                You are the sender of outreach mail. Apsurn is software you operate. You must honor
                unsubscribe and suppression requests that apply to your campaigns.
              </p>
            </Section>

            <Section id="prospecting" title="7. Prospecting data">
              <p>
                Contact and company records may come from public web sources and third-party data APIs. Data
                can be incomplete, outdated, or wrong. You must not treat a fit score or email status as a
                guarantee. Phone numbers, where stored, are not licensed for calling until you separately
                comply with telemarketing rules.
              </p>
              <p>
                People whose professional details appear in your workspace can request access, correction,
                deletion, or suppression via our{" "}
                <Link href="/privacy" className="font-medium text-[#4379EE] underline">
                  Privacy Policy
                </Link>
                . You agree to cooperate with verified requests that affect data you control.
              </p>
            </Section>

            <Section id="email" title="8. Email and Gmail">
              <p>
                Connecting Gmail is optional. If you connect it, you authorize Apsurn to send mail you
                initiate (including send-pass enrollments) using Google APIs, as described in the Privacy
                Policy. Google’s terms also apply to your Google account.
              </p>
              <p>
                We do not send cold outreach from an Apsurn-owned “from” address. Delivery, reputation, and
                Google account limits are between you and Google. Daily caps and sending windows in the
                product are safeguards, not legal advice.
              </p>
              <p>
                You must not use connected inboxes to send malware, spoofing, or bulk unsolicited mail that
                violates Google or applicable law. We may revoke sending if we detect abuse.
              </p>
            </Section>

            <Section id="ai" title="9. AI features">
              <p>
                Drafts and research may be produced by third-party models. Models can hallucinate. Do not
                send AI output that claims false facts about a recipient or your product. You are
                responsible for the final email.
              </p>
            </Section>

            <Section id="third-parties" title="10. Third parties">
              <p>
                The service depends on providers such as hosting/auth (Supabase), AI routing, prospecting
                APIs, and Google. Their outages or policy changes can affect Apsurn. Links and integrations
                are not our endorsement. Your use of a third-party service is under that party’s terms.
              </p>
            </Section>

            <Section id="fees" title="11. Trials and fees">
              <p>
                Features may be offered as a free trial or paid plan. If we charge, prices, limits, and
                renewal terms will be shown at checkout or in an order form. Unless required by law, fees
                are non-refundable once a billing period starts. We may change prices on notice for later
                periods.
              </p>
              <p>
                Third-party usage (for example data-provider credits or Google quotas) may be billed by
                those providers to you or consumed from your Apsurn plan, as disclosed in the product.
              </p>
            </Section>

            <Section id="ip" title="12. Intellectual property">
              <p>
                Apsurn, the product UI, software, and marks remain ours or our licensors’. We grant you a
                limited, non-exclusive, non-transferable right to use the service during your subscription
                or trial, solely for your internal business. You may not copy, resell, or white-label the
                service without a written agreement.
              </p>
              <p>
                Feedback you send may be used to improve the product without obligation to you.
              </p>
            </Section>

            <Section id="confidentiality" title="13. Confidentiality">
              <p>
                Non-public product features and your non-public business information accessed through the
                service should be treated as confidential and used only to perform these Terms, except
                information that is public, independently developed, or required to be disclosed by law.
              </p>
            </Section>

            <Section id="warranties" title="14. Disclaimers">
              <p>
                THE SERVICE IS PROVIDED “AS IS” AND “AS AVAILABLE”. TO THE MAXIMUM EXTENT PERMITTED BY LAW,
                WE DISCLAIM WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND
                NON-INFRINGEMENT, AND ANY WARRANTY THAT DATA, DELIVERABILITY, OR AI OUTPUT WILL BE ACCURATE
                OR UNINTERRUPTED.
              </p>
            </Section>

            <Section id="liability" title="15. Limitation of liability">
              <p>
                TO THE MAXIMUM EXTENT PERMITTED BY LAW, APSURN WILL NOT BE LIABLE FOR INDIRECT, INCIDENTAL,
                SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR FOR LOST PROFITS, REVENUE, DATA,
                OR GOODWILL, EVEN IF ADVISED OF THE POSSIBILITY.
              </p>
              <p>
                OUR TOTAL LIABILITY FOR CLAIMS ARISING OUT OF THE SERVICE IS LIMITED TO THE AMOUNTS YOU PAID
                US FOR THE SERVICE IN THE THREE MONTHS BEFORE THE CLAIM, OR USD $100 IF YOU PAID NOTHING.
              </p>
              <p>
                These limits do not apply to liability that cannot be limited under applicable law (for
                example certain personal injury or fraud).
              </p>
            </Section>

            <Section id="indemnity" title="16. Indemnity">
              <p>
                You will defend and indemnify Apsurn and its personnel against claims, damages, and costs
                (including reasonable legal fees) arising from your content, your outreach, your violation
                of law or these Terms, or your use of prospect data.
              </p>
            </Section>

            <Section id="termination" title="17. Suspension and termination">
              <p>
                You may stop using the service and request account deletion. We may suspend or terminate
                access immediately for breach, legal risk, non-payment, or harm to the service or others.
                Provisions that should survive (including IP, disclaimers, liability, indemnity) survive
                termination. We may delete workspace data after termination according to the Privacy Policy.
              </p>
            </Section>

            <Section id="law" title="18. Governing law">
              <p>
                These Terms are governed by the laws of the State of Delaware, USA, excluding conflict-of-law
                rules, unless a mandatory local law says otherwise for consumers (Apsurn is offered as a
                business service). Courts located in Delaware shall have exclusive jurisdiction, except that
                we may seek injunctive relief in any forum.
              </p>
            </Section>

            <Section id="changes" title="19. Changes">
              <p>
                We may update these Terms. The “last updated” date will change. Continued use after the
                effective date of a change constitutes acceptance, except where the law requires your
                explicit consent. If you do not agree, stop using the service.
              </p>
            </Section>

            <Section id="contact" title="20. Contact">
              <p>
                Legal and product:{" "}
                <a className="font-medium text-[#4379EE] underline" href="mailto:privacy@apsurn.com">
                  privacy@apsurn.com
                </a>
              </p>
              <p>
                Privacy Policy:{" "}
                <Link href="/privacy" className="font-medium text-[#4379EE] underline">
                  /privacy
                </Link>
              </p>
              <p className="text-sm text-neutral-500">
                These Terms are a working contract for the current Apsurn product. They are not legal
                advice. Have counsel review them before you rely on them for customers, Google verification,
                or a specific jurisdiction.
              </p>
            </Section>
          </article>
        </div>
      </main>
      <Footer />
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-28">
      <h2 className="font-heading text-xl font-semibold tracking-[-0.04em] text-black">{title}</h2>
      <div className="mt-3 flex flex-col gap-3">{children}</div>
    </section>
  );
}
