# Billing setup (Dodo Payments)

How it works: Dodo handles checkout and subscriptions. The app keeps its own credit ledger in
Supabase and updates it from Dodo webhooks. Paid actions check the balance first and deduct credits
after they succeed.

## 1. Run the migration

Run `supabase/migrations/0003_billing.sql` once in the Supabase SQL editor. It is additive and safe to
re-run. (Do **not** run `apply.js`; that script resets the schema.)

## 2. Environment variables (`.env.local` and Vercel)

```
DODO_PAYMENTS_API_KEY=...            # Dodo dashboard > Developer > API keys
DODO_PAYMENTS_WEBHOOK_KEY=...        # Dodo dashboard > Developer > Webhooks > signing secret
DODO_PAYMENTS_ENVIRONMENT=test_mode  # use live_mode in production
NEXT_PUBLIC_APP_URL=https://your-domain.com
```

Test and live mode use different product IDs. Both are already in `lib/billing/plans.ts`.

## 3. Webhook in the Dodo dashboard

Add an endpoint: `https://<your-domain>/api/billing/webhook`
Subscribe to: `subscription.active`, `subscription.renewed`, `subscription.plan_changed`,
`subscription.updated`, `subscription.on_hold`, `subscription.past_due`, `subscription.paused`,
`subscription.unpaused`, `subscription.cancelled`, `subscription.expired`, `subscription.failed`,
`payment.succeeded`.

For local testing, expose localhost with a tunnel and register that URL for test mode.

## 4. Check the Dodo products

- Plan products (Startup, Growth, Pro): subscription products. Set the subscription period long
  (Dodo recommends 20 years) or the subscription expires after one charge.
- Top-up products: one-time payments. Credits are granted by the app from `payment.succeeded`;
  do not also attach Dodo credit entitlements, or customers would get credits twice.
- Trial: configure the trial on the product (days and any trial amount). A subscription that starts
  on a trial gets `STARTER_CREDITS` (50); one that starts without a trial gets the full monthly
  allowance. The full allowance is granted on `subscription.renewed` once the first real charge happens.

## 5. How credits behave

- Plan credits reset to the monthly allowance each renewal (no rollover). Top-up credits never expire.
- Spending uses plan credits first, then top-ups.
- Cancelled, expired or failed subscriptions lose their plan credits; top-ups are kept.
- Costs per action live in `CREDIT_COSTS` in `lib/billing/plans.ts`.

## What is gated

| Action | No plan | Active plan |
| --- | --- | --- |
| Website scan, competitors, campaigns (setup) | free | credits |
| Setup leads | capped preview (10) | up to 50, 3 credits each |
| AI email drafts | free template | AI draft, 1 credit |
| More leads (`generate_more`) | blocked (402) | 3 credits per lead |
| Lead enrichment | blocked (402) | 5 credits per lead |

## $1 → $30 sending-credits unlock (visitor flow)

Guests finish setup, click the pulsing **Get $30 of Sending Credits** button on a campaign, sign up (their workspace
is kept), and a Dodo checkout popup charges $1 once and grants 2,000 credits (`UNLOCK` in `lib/billing/plans.ts`).

1. Nothing to create by hand: the $1 one-time product is created through the Dodo API the first time someone checks out, and found by name afterwards.
2. Optional: pin a specific product with `DODO_UNLOCK_PRODUCT_ID` (test) / `DODO_UNLOCK_PRODUCT_ID_LIVE` (live).
3. The existing webhook must receive `payment.succeeded`; it grants the credits (idempotent per payment).
