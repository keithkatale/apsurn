# Apsurn

Apsurn is a source-backed AI prospecting application. It turns an approved company blueprint into durable prospecting runs, discovers matching companies with Gemini Google Search grounding, crawls public company pages, extracts professional contacts, and stores evidence and confidence alongside every result.

## Local setup

1. Copy `.env.example` to `.env.local` and configure Supabase and Vertex AI.
2. Apply `supabase/migrations` in numeric order to a new Supabase project. Migration `0000` is destructive and must never be applied to a project containing data that should be retained.
3. Run `npm install` and `npm run dev`.
4. In a second terminal, run `npm run inngest:dev`. Local development is explicitly placed in keyless Inngest Dev mode; cloud deployments require the event and signing keys.
5. Configure `EMAIL_VERIFIER_URL`, `EMAIL_VERIFIER_SECRET`, and `SUPPRESSION_HASH_SECRET`. Run `npm run verifier:dev` locally, or deploy the verifier to a host with outbound TCP/25 for production.

The app requires a real Supabase Auth session. Create an account at `/login`, generate and approve a blueprint at `/setup`, then start a search under `/dashboard/prospects`. Website analytics lives under `/dashboard/analytics`.

## Prospecting architecture

- Customer lists and contact snapshots are owner-scoped with RLS.
- The canonical company/person/contact graph is service-role-only and shared across searches.
- Public pages are fetched with SSRF protection, robots handling, same-site redirects, timeouts, and size limits.
- AI extracts and ranks evidence; it is not accepted as the sole source for a person or contact value.
- Known and inferred email addresses are checked by the dedicated verifier. Inference tries a learned company pattern first, then common business-email patterns; only a definitive mailbox result is exposed.
- A company is saved and counted only when at least one named person has a verified email address or public phone number.
- Inngest executes searches asynchronously and persists progress and partial failures.

## Website analytics

Privacy-friendly first-party analytics is available at `/dashboard/analytics`. Add a site, then drop the generated `trackify.js` snippet on any page. The browser posts pageviews to `/api/ingest` (CORS-open, no auth cookie). The dashboard covers overview charts, pages, referrers, locations, devices, and a live visitor globe.

## Email verifier

`services/email-verifier` is a dependency-free Node container intended for a small host with approved outbound TCP/25 and a stable IP. Configure the same `EMAIL_VERIFIER_SECRET` in the application and worker. The worker performs syntax, MX, SMTP recipient, and randomized catch-all checks without sending email. Put it behind HTTPS and restrict ingress to application infrastructure where possible.

## Commands

```bash
npm run dev
npm run lint
npm test
npm run build
```

## Privacy and safety

Only public professional information is indexed. Authenticated social pages are out of scope. Phone numbers remain ineligible for outreach until jurisdiction-specific do-not-call screening is implemented. Data subjects can submit access, correction, deletion, and permanent-suppression requests at `/privacy`.
