# Apsurn

Apsurn is a source-backed AI prospecting application. It turns an approved company blueprint into durable prospecting runs, discovers matching companies with grounded web search, crawls public company pages, extracts professional contacts, and stores evidence and confidence alongside every result. Copilot and artifacts help you research, save leads into lists, and keep working the pipeline.

## Local setup

1. Copy `.env.example` to `.env.local` and configure Supabase and Vertex AI.
2. Apply `supabase/migrations` in numeric order to a new Supabase project. Migration `0000` is destructive and must never be applied to a project containing data that should be retained.
3. Run `npm install` and `npm run dev`.
4. Configure `EMAIL_VERIFIER_URL`, `EMAIL_VERIFIER_SECRET`, and `SUPPRESSION_HASH_SECRET`. Run `npm run verifier:dev` locally, or deploy the verifier to a host with outbound TCP/25 for production.

The app requires a real Supabase Auth session. Create an account at `/login`, generate and approve a blueprint at `/setup`, then start a search under `/dashboard/prospects` or ask Copilot on `/dashboard`.

## Prospecting architecture

- Customer lists and contact snapshots are owner-scoped with RLS.
- The canonical company/person/contact graph is service-role-only and shared across searches.
- Public pages are fetched with SSRF protection, robots handling, same-site redirects, timeouts, and size limits.
- AI extracts and ranks evidence; it is not accepted as the sole source for a person or contact value.
- Known and inferred email addresses are checked by the dedicated verifier. Inference tries a learned company pattern first, then common business-email patterns; only a definitive mailbox result is exposed.
- A company is saved and counted only when at least one named person has a verified email address or public phone number.
- Background jobs run as Cloud Run HTTP handlers (`/api/jobs/*`, `/api/cron/*`) after the user-facing request returns, or on Cloud Scheduler.

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
