# Solace Life — Stripe Dual-Currency Setup Guide

**Version:** v3.1 · Dual-Currency Pricing Model (USD + CAD)  
**Last updated:** May 2026

---

## Overview

Solace Life uses **independent price objects per currency** in Stripe — not auto-conversion. This means you will create **12 price objects** across **6 products**: one USD price and one CAD price for each plan. This approach complies with Canadian consumer protection law (Competition Act), which requires prices to be stated in the currency being charged.

---

## Step 1 — Create the 6 Products in Stripe Dashboard

Go to **Stripe Dashboard → Products → + Add product** for each of the following:

| Product Name | Description | Billing Type | Prices to add |
|---|---|---|---|
| Solace Life — Legacy (Annual) | Annual recurring subscription | Recurring | 2 (USD + CAD) |
| Solace Life — Legacy (Monthly) | Monthly recurring subscription (hidden) | Recurring | 2 (USD + CAD) |
| Solace Life — Legacy 5-Year Bundle | One-time payment, 5-year access | One-time | 2 (USD + CAD) |
| Solace Life — Legacy 10-Year Bundle | One-time payment, 10-year access | One-time | 2 (USD + CAD) |
| Solace Life — Legacy Preservation Plan | One-time payment, 25-year access | One-time | 2 (USD + CAD) |
| Solace Life — AI Avatar Add-On | Annual recurring add-on subscription | Recurring | 2 (USD + CAD) |

**How Products and Prices work in Stripe:**

A Product and a Price are two separate Stripe objects. One product can hold multiple prices. Each price — regardless of which product it belongs to — gets its own unique Price ID (`price_XXXXXXXXXXXXXXXXXXXXXXXX`). This means:

- You create **6 products** (one per plan).
- Inside each product, you click **+ Add price** twice — once for USD, once for CAD.
- Stripe issues a separate Price ID for each price you create.
- You end up with **12 Price IDs** total (6 plans × 2 currencies), which is what the app needs.

You do **not** need to create 12 separate products. Grouping both currency prices under the same product keeps your Stripe dashboard organised and is the recommended approach.

---

## Step 2 — Add Prices to Each Product

For every product, click **+ Add price** twice — once for USD, once for CAD.

### Product 1: Legacy (Annual)

| Currency | Amount | Billing | Stripe Env Var Name |
|---|---|---|---|
| USD | $149.00 / year | Recurring — yearly | `STRIPE_PRICE_LEGACY_ANNUAL_USD` |
| CAD | $199.00 / year | Recurring — yearly | `STRIPE_PRICE_LEGACY_ANNUAL_CAD` |

Settings for each price:
- **Billing period:** Yearly
- **Price:** as above
- **Currency:** USD or CAD
- **Nickname (optional):** e.g. `legacy_annual_usd`

---

### Product 2: Legacy (Monthly) — Hidden

This plan is not shown in the upgrade modal. It is available on request only via the small text link at the bottom of the modal.

| Currency | Amount | Billing | Stripe Env Var Name |
|---|---|---|---|
| USD | $17.99 / month | Recurring — monthly | `STRIPE_PRICE_LEGACY_MONTHLY_USD` |
| CAD | $24.99 / month | Recurring — monthly | `STRIPE_PRICE_LEGACY_MONTHLY_CAD` |

---

### Product 3: Legacy 5-Year Bundle

| Currency | Amount | Billing | Stripe Env Var Name |
|---|---|---|---|
| USD | $499.00 | One-time | `STRIPE_PRICE_LEGACY_5YR_USD` |
| CAD | $649.00 | One-time | `STRIPE_PRICE_LEGACY_5YR_CAD` |

Settings:
- **Billing type:** One time
- **Price description (optional):** `5-year access — no recurring billing`

---

### Product 4: Legacy 10-Year Bundle

| Currency | Amount | Billing | Stripe Env Var Name |
|---|---|---|---|
| USD | $799.00 | One-time | `STRIPE_PRICE_LEGACY_10YR_USD` |
| CAD | $1,049.00 | One-time | `STRIPE_PRICE_LEGACY_10YR_CAD` |

---

### Product 5: Legacy Preservation Plan

| Currency | Amount | Billing | Stripe Env Var Name |
|---|---|---|---|
| USD | $599.00 | One-time | `STRIPE_PRICE_PRESERVATION_USD` |
| CAD | $799.00 | One-time | `STRIPE_PRICE_PRESERVATION_CAD` |

Settings:
- **Billing type:** One time
- **Price description (optional):** `25-year access — estate planning peace of mind`

---

### Product 6: AI Avatar Add-On

| Currency | Amount | Billing | Stripe Env Var Name |
|---|---|---|---|
| USD | $99.00 / year | Recurring — yearly | `STRIPE_PRICE_AVATAR_ADDON_USD` |
| CAD | $129.00 / year | Recurring — yearly | `STRIPE_PRICE_AVATAR_ADDON_CAD` |

> This add-on requires an active Legacy plan. The app enforces this — Stripe does not. Only show this product to users who already have an active Legacy subscription.

---

## Step 3 — Copy the Price IDs

After creating each price, Stripe will assign a Price ID in the format `price_XXXXXXXXXXXXXXXXXXXXXXXX`.

Copy each one and record them here for reference:

| Env Var Name | Price ID |
|---|---|
| `STRIPE_PRICE_LEGACY_ANNUAL_USD` | `price_` |
| `STRIPE_PRICE_LEGACY_ANNUAL_CAD` | `price_` |
| `STRIPE_PRICE_LEGACY_MONTHLY_USD` | `price_` |
| `STRIPE_PRICE_LEGACY_MONTHLY_CAD` | `price_` |
| `STRIPE_PRICE_LEGACY_5YR_USD` | `price_` |
| `STRIPE_PRICE_LEGACY_5YR_CAD` | `price_` |
| `STRIPE_PRICE_LEGACY_10YR_USD` | `price_` |
| `STRIPE_PRICE_LEGACY_10YR_CAD` | `price_` |
| `STRIPE_PRICE_PRESERVATION_USD` | `price_` |
| `STRIPE_PRICE_PRESERVATION_CAD` | `price_` |
| `STRIPE_PRICE_AVATAR_ADDON_USD` | `price_` |
| `STRIPE_PRICE_AVATAR_ADDON_CAD` | `price_` |

> **Security note:** Do not store actual price IDs in this file if it is committed to a public or shared repository. Use the Supabase secrets panel (Step 4) as the authoritative location.

---

## Step 4 — Add Price IDs to Supabase Edge Function Secrets

Go to **Supabase Dashboard → Edge Functions → Secrets (or Settings → Vault)**.

Add each of the 12 price IDs as a secret with the exact name shown in the table above. The Edge Function reads these at runtime using `Deno.env.get('STRIPE_PRICE_...')`.

You also need these existing secrets (add them if not already present):

| Secret Name | Value |
|---|---|
| `STRIPE_SECRET_KEY` | Your Stripe secret key (`sk_live_...` or `sk_test_...`) |
| `STRIPE_WEBHOOK_SECRET` | From Stripe → Webhooks → your endpoint → Signing secret |
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase service role key |
| `APP_URL` | Your web app URL (for web redirect after checkout) |

---

## Step 5 — Configure Stripe Webhooks

Go to **Stripe Dashboard → Developers → Webhooks → + Add endpoint**.

**Endpoint URL:**
```
https://<your-supabase-project-ref>.supabase.co/functions/v1/stripe-webhook
```

**Events to listen for:**
- `checkout.session.completed`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_failed`

After saving, click **Reveal signing secret** and add it as `STRIPE_WEBHOOK_SECRET` in Supabase secrets.

---

## Step 6 — Run Database Migration 010

In **Supabase Dashboard → SQL Editor**, run the contents of:

```
supabase/migrations/010_pricing_v3.sql
```

This migration adds the following columns to the `profiles` table:
- `plan_expires_at` — unified expiry date for all one-time bundle plans
- `trial_ends_at` — 30-day free trial window
- `has_avatar_addon` — whether the AI Avatar add-on is active
- `avatar_addon_subscription_id` — separate Stripe subscription ID for the add-on

It also extends the `subscription_status` check constraint to include `'bundle'` (used for 5-year and 10-year bundle plans).

---

## Step 7 — Deploy Edge Functions

From your terminal, in the project root:

```bash
supabase functions deploy create-checkout-session
supabase functions deploy stripe-webhook
```

Or deploy via the Supabase Dashboard under **Edge Functions → Deploy**.

---

## Step 8 — Test in Stripe Test Mode

Before going live, test each plan:

1. Set `STRIPE_SECRET_KEY` to your `sk_test_...` key in Supabase secrets.
2. Create test price objects in Stripe (using the same steps above but in test mode).
3. Use Stripe test card `4242 4242 4242 4242` with any future expiry and any CVV.
4. Verify that:
   - A USD user sees USD prices and is charged in USD.
   - A CAD user (simulate by changing device locale to `en-CA`) sees CAD prices and is charged in CAD.
   - One-time plans set `plan_expires_at` correctly in the `profiles` table.
   - Recurring plans set `subscription_status: 'active'` and `stripe_subscription_id`.
   - The Avatar add-on sets `has_avatar_addon: true` and `avatar_addon_subscription_id`.
   - Cancellation via `customer.subscription.deleted` sets `subscription_status: 'cancelled'`.

---

## Summary: All 12 Price Objects

| Plan | USD Price | CAD Price | Type |
|---|---|---|---|
| Legacy Annual | $149/yr | $199/yr | Recurring |
| Legacy Monthly | $17.99/mo | $24.99/mo | Recurring |
| Legacy 5-Year Bundle | $499 | $649 | One-time |
| Legacy 10-Year Bundle | $799 | $1,049 | One-time |
| Legacy Preservation Plan | $599 | $799 | One-time |
| AI Avatar Add-On | $99/yr | $129/yr | Recurring |

---

## How Currency Is Determined

The app uses `lib/currency.ts` to detect the user's currency at runtime:

1. **Device locale region** — if the device locale includes region code `CA` (e.g., `en-CA`, `fr-CA`), the user is served CAD prices.
2. **Device timezone** — if the locale region is unavailable, common Canadian timezones (Toronto, Vancouver, Edmonton, etc.) trigger CAD.
3. **Default** — all other users receive USD prices.

The detected currency is passed to the `create-checkout-session` Edge Function in the request body as `currency: 'usd'` or `currency: 'cad'`. The function then looks up the appropriate Stripe price ID from its environment variables and creates the checkout session in that currency.

---

*This guide covers the full Stripe configuration for Solace Life v3.1 dual-currency pricing. For questions, refer to `supabase/functions/create-checkout-session/index.ts` and `supabase/functions/stripe-webhook/index.ts`.*
