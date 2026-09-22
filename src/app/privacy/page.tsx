import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";
import { PrivacyRequestForm } from "@/components/privacy/PrivacyRequestForm";

export const metadata: Metadata = {
  title: "Privacy Policy — apsurn",
  description:
    "How Apsurn collects, uses, stores, and shares personal data for our B2B prospecting product, including Gmail OAuth, analytics, and data-subject rights.",
};

const SECTIONS = [
  { id: "who-we-are", label: "Who we are" },
  { id: "scope", label: "Who this covers" },
  { id: "data-we-collect", label: "Data we collect" },
  { id: "google-user-data", label: "Google user data" },
  { id: "how-we-use", label: "How we use data" },
  { id: "legal-bases", label: "Legal bases" },
  { id: "sharing", label: "Sharing" },
  { id: "retention", label: "Retention" },
  { id: "security", label: "Security" },
  { id: "rights", label: "Your rights" },
  { id: "cookies", label: "Cookies and analytics" },
  { id: "international", label: "International transfers" },
  { id: "children", label: "Children" },
  { id: "changes", label: "Changes" },
  { id: "contact", label: "Contact" },
] as const;

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white text-neutral-900" style={{ colorScheme: "light" }}>
      <Navbar />
      <main className="mx-auto w-full max-w-[1100px] px-5 pb-20 pt-28 sm:px-8 lg:px-10">
        <header className="max-w-3xl">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#4379EE]">Legal</p>
          <h1 className="mt-2 font-heading text-3xl font-semibold tracking-[-0.04em] text-black sm:text-4xl">
            Privacy Policy
          </h1>
          <p className="mt-3 text-sm text-neutral-500">Effective 21 September 2026 · Last updated 21 September 2026</p>
          <p className="mt-4 text-[15px] leading-relaxed text-neutral-700">
            This policy describes how Apsurn (“Apsurn”, “we”, “us”) collects, uses, stores, and shares
            personal data when you use apsurn.com and the Apsurn application. It is written for Google
            OAuth verification, GDPR/UK GDPR, and CCPA/CPRA transparency, and for people whose
            professional contact details appear in customer prospecting lists.
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
            <Section id="who-we-are" title="1. Who we are">
              <p>
                Apsurn is a B2B outbound product: company research, ideal-customer profiling, prospect
                discovery, campaign drafting, and email sending through a mailbox the customer connects.
              </p>
              <p>
                Controller for the Apsurn service: the operator of <strong>apsurn.com</strong>. Privacy
                contact:{" "}
                <a className="font-medium text-[#4379EE] underline" href="mailto:privacy@apsurn.com">
                  privacy@apsurn.com
                </a>
                .
              </p>
              <p>
                When a customer uses Apsurn to find or email other professionals, that customer is typically
                the controller of those prospect records. Apsurn processes that data on the customer’s
                instructions as a processor, except where we must process it to operate, secure, or improve
                the platform, or to handle a rights request sent directly to us.
              </p>
            </Section>

            <Section id="scope" title="2. Who this covers">
              <ul className="list-disc space-y-2 pl-5">
                <li>
                  <strong>Customers and trial users</strong> who create an Apsurn account, connect a website,
                  connect Gmail, or use the dashboard.
                </li>
                <li>
                  <strong>Website visitors</strong> to apsurn.com, including analytics events if enabled.
                </li>
                <li>
                  <strong>Prospects and other professionals</strong> whose public B2B information is stored
                  because a customer ran prospecting or outreach.
                </li>
              </ul>
            </Section>

            <Section id="data-we-collect" title="3. Data we collect">
              <h3 className="font-medium text-neutral-900">Account and billing identity</h3>
              <p>
                Email address, authentication identifiers (via our auth provider), company name and website
                URL you submit, and product settings. We do not ask for payment card numbers in the product
                today; if billing is added later, card data would be handled by the payment processor, not
                stored in Apsurn.
              </p>
              <h3 className="mt-4 font-medium text-neutral-900">Company blueprint and workspace content</h3>
              <p>
                Content we generate or you edit from your site and inputs: positioning, ICP, personas,
                competitors, campaigns, email templates, sequences, enrollments, and send history.
              </p>
              <h3 className="mt-4 font-medium text-neutral-900">Prospecting and contact data</h3>
              <p>
                Professional information from public pages and data providers, which may include name, job
                title, employer, domain, work email, phone (where present), LinkedIn URL, location,
                industry, fit scores, and short evidence excerpts. We index professional B2B information. We
                do not scrape authenticated social sessions. Phone numbers are not used for outreach until
                applicable do-not-call rules are implemented.
              </p>
              <h3 className="mt-4 font-medium text-neutral-900">Market insights</h3>
              <p>
                Public social and web mentions, keywords, followed accounts, and notes a customer saves,
                when that feature is used.
              </p>
              <h3 className="mt-4 font-medium text-neutral-900">Gmail connection</h3>
              <p>
                If you connect Gmail: the Gmail address, OAuth tokens (encrypted at rest), granted scopes,
                connection status, and records of messages Apsurn sends through that inbox (subject, body,
                timestamps, provider message/thread ids, delivery status). See{" "}
                <a href="#google-user-data" className="font-medium text-[#4379EE] underline">
                  Google user data
                </a>
                .
              </p>
              <h3 className="mt-4 font-medium text-neutral-900">Analytics on our marketing site</h3>
              <p>
                First-party pageviews on apsurn.com (path, referrer, approximate location/device, timestamp)
                via our own analytics script. We do not sell this data.
              </p>
              <h3 className="mt-4 font-medium text-neutral-900">Support and privacy requests</h3>
              <p>
                Messages you send us, including email and the contents of a data-rights form submission.
              </p>
              <h3 className="mt-4 font-medium text-neutral-900">Technical logs</h3>
              <p>
                IP address, user agent, timestamps, and error logs needed to operate and secure the service.
              </p>
            </Section>

            <Section id="google-user-data" title="4. Google user data (Gmail OAuth)">
              <p>
                Apsurn’s use and transfer of information received from Google APIs adheres to the{" "}
                <a
                  className="font-medium text-[#4379EE] underline"
                  href="https://developers.google.com/terms/api-services-user-data-policy"
                  target="_blank"
                  rel="noreferrer"
                >
                  Google API Services User Data Policy
                </a>
                , including the Limited Use requirements.
              </p>
              <p>When you click Connect Gmail we request:</p>
              <ul className="list-disc space-y-2 pl-5">
                <li>
                  <code className="text-[13px] text-neutral-800">gmail.send</code> — to send outreach mail
                  that you initiate or that you enrolled in a campaign, appearing as mail from your address.
                </li>
                <li>
                  <code className="text-[13px] text-neutral-800">userinfo.email</code> — to display which
                  Google account is connected.
                </li>
              </ul>
              <p>We use that Google user data only to:</p>
              <ul className="list-disc space-y-2 pl-5">
                <li>Authenticate the connection and show the connected address in Inboxes and Campaigns.</li>
                <li>Send emails you compose or that a send pass sends for enrollments you created.</li>
                <li>Refresh OAuth tokens so sending keeps working until you disconnect.</li>
                <li>Record send identifiers so we can show status and avoid duplicate sends.</li>
              </ul>
              <p>
                We do <strong>not</strong> use Gmail content to train generalized AI models. We do{" "}
                <strong>not</strong> sell Google user data. We do <strong>not</strong> share it with ads
                platforms. We do <strong>not</strong> allow humans to read Gmail tokens or message bodies
                except (a) with your permission for support, (b) for security/legal investigations, or (c)
                as required by law. Encrypted refresh and access tokens are stored in our database and are
                not exposed in the browser.
              </p>
              <p>
                You can disconnect the inbox in Google Account → Security → Third-party access, and by
                asking us to delete the connection. After disconnect, Apsurn cannot send as you.
              </p>
            </Section>

            <Section id="how-we-use" title="5. How we use data">
              <ul className="list-disc space-y-2 pl-5">
                <li>Provide the product: blueprint, campaigns, prospecting, analytics dashboards, copilot.</li>
                <li>Generate campaign and email drafts with AI providers acting as our processors.</li>
                <li>Send mail through your connected inbox when you instruct the product to send.</li>
                <li>Secure the service, prevent abuse, debug, and measure reliability.</li>
                <li>Respond to support and privacy requests.</li>
                <li>Comply with law and enforce acceptable use (no unlawful spam or scraping of private data).</li>
              </ul>
            </Section>

            <Section id="legal-bases" title="6. Legal bases (EEA/UK)">
              <ul className="list-disc space-y-2 pl-5">
                <li>
                  <strong>Contract</strong> — to create your account and provide the features you ask for,
                  including Gmail sending you connect.
                </li>
                <li>
                  <strong>Legitimate interests</strong> — to operate a B2B prospecting platform, secure it,
                  and improve it, balanced against the rights of professionals whose public work details are
                  processed.
                </li>
                <li>
                  <strong>Consent</strong> — where required (for example certain cookies, or connecting
                  Gmail).
                </li>
                <li>
                  <strong>Legal obligation</strong> — tax, accounting, or lawful requests.
                </li>
              </ul>
              <p>
                Customers are responsible for having a lawful basis to email prospects (for example
                legitimate interest assessments and CAN-SPAM / CASL / PECR compliance). Apsurn does not
                replace that obligation.
              </p>
            </Section>

            <Section id="sharing" title="7. Sharing">
              <p>We share personal data only with:</p>
              <ul className="list-disc space-y-2 pl-5">
                <li>
                  <strong>Infrastructure processors</strong> such as our database/auth host (Supabase) and
                  application host.
                </li>
                <li>
                  <strong>AI processors</strong> (currently via OpenRouter / the configured model) to
                  generate blueprints, campaigns, and drafts. Prompts may include the professional context
                  you or the product supply.
                </li>
                <li>
                  <strong>Prospecting data providers</strong> (for example Icypeas and similar APIs) to
                  resolve work emails for companies a customer asked us to find.
                </li>
                <li>
                  <strong>Google</strong> when you connect Gmail, solely to obtain tokens and send mail you
                  authorized.
                </li>
                <li>
                  <strong>Email delivery for Apsurn’s own mail</strong> (for example Resend) for
                  transactional notices such as privacy-request alerts to our team — not for cold outreach
                  from your identity.
                </li>
                <li>Professional advisors or authorities when required by law or to protect rights.</li>
              </ul>
              <p>We do not sell personal information as defined by CCPA/CPRA.</p>
            </Section>

            <Section id="retention" title="8. Retention">
              <ul className="list-disc space-y-2 pl-5">
                <li>Account and workspace data: until you delete the account or we close it for breach.</li>
                <li>Prospect lists: until the customer deletes them or a verified suppression/deletion request is completed.</li>
                <li>Gmail tokens: until you disconnect or the account is deleted.</li>
                <li>Send logs: kept to operate sequences and abuse prevention, then deleted or aggregated.</li>
                <li>
                  After a verified <strong>suppress</strong> request we delete matching contact records and
                  keep only a one-way hash so the same address is not collected again.
                </li>
              </ul>
            </Section>

            <Section id="security" title="9. Security">
              <p>
                Access to production data is restricted. Gmail OAuth tokens are encrypted at rest with an
                application key separate from the database. Transport uses HTTPS. No method is perfect; you
                should use a unique password and disconnect Gmail if you stop using Apsurn.
              </p>
            </Section>

            <Section id="rights" title="10. Your rights">
              <p>
                Depending on where you live, you may have rights to access, correct, delete, restrict,
                port, or object to processing, and to withdraw consent. California residents may request
                know/delete and we will not discriminate for exercising those rights.
              </p>
              <p>
                Use the form below or email{" "}
                <a className="font-medium text-[#4379EE] underline" href="mailto:privacy@apsurn.com">
                  privacy@apsurn.com
                </a>
                . We verify identity (usually via the email address in the record) before changing data. We
                may refuse unfounded or excessive requests.
              </p>
              <p>
                You may also complain to your data protection authority. EEA users can contact their local
                DPA; UK users the ICO.
              </p>
              <div className="rounded-2xl border border-[#EEEEEE] bg-[#FAFAFA] p-5">
                <h3 className="font-heading text-lg font-semibold tracking-[-0.04em] text-black">
                  Submit a data request
                </h3>
                <p className="mt-1 text-sm text-neutral-600">
                  For access, correction, deletion, or permanent suppression of professional records tied to
                  an email address.
                </p>
                <PrivacyRequestForm />
              </div>
            </Section>

            <Section id="cookies" title="11. Cookies and analytics">
              <p>
                We use essential cookies for authentication and security. The marketing site may load our
                first-party analytics script to count visits. We do not use that script to serve
                cross-site advertising. You can block non-essential scripts in your browser; the product
                login will still require cookies needed for the session.
              </p>
            </Section>

            <Section id="international" title="12. International transfers">
              <p>
                We may process data in the United States and other countries where our processors operate.
                Where required, we rely on appropriate safeguards such as Standard Contractual Clauses with
                those processors.
              </p>
            </Section>

            <Section id="children" title="13. Children">
              <p>
                Apsurn is for business users. We do not knowingly collect data from children under 16. If
                you believe we have, contact privacy@apsurn.com and we will delete it.
              </p>
            </Section>

            <Section id="changes" title="14. Changes">
              <p>
                We will update this page when our practices change. The “last updated” date will change. If
                a change is material, we will provide a more prominent notice in the product or by email
                where we have an address.
              </p>
            </Section>

            <Section id="contact" title="15. Contact">
              <p>
                Privacy:{" "}
                <a className="font-medium text-[#4379EE] underline" href="mailto:privacy@apsurn.com">
                  privacy@apsurn.com
                </a>
              </p>
              <p>
                Product site:{" "}
                <Link href="/" className="font-medium text-[#4379EE] underline">
                  apsurn.com
                </Link>
              </p>
              <p className="text-sm text-neutral-500">
                This page is a working privacy notice for the current Apsurn product. It is not legal advice.
                Have counsel review it before you rely on it for Google verification, enterprise contracts,
                or a specific jurisdiction. Related:{" "}
                <Link href="/terms" className="font-medium text-[#4379EE] underline">
                  Terms and Conditions
                </Link>
                .
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
