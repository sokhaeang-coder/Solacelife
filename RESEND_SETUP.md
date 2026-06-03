# Resend Email Setup — Solace Life

Step-by-step guide to connect Resend, verify the `solacelife.ca` domain, and test the full memory-delivery pipeline.

---

## Section 1: Create Resend Account and API Key

1. Go to [resend.com](https://resend.com) and create a free account.
2. In the Resend dashboard, go to **API Keys** → **Create API Key**.
3. Name it `Solace Life Production`.
4. Copy the key — it starts with `re_`. Store it somewhere safe; you will not see it again.

---

## Section 2: Add Domain to Resend

1. In the Resend dashboard, go to **Domains** → **Add Domain**.
2. Enter `solacelife.ca` and click **Add**.
3. Resend will give you a set of DNS records (usually MX, TXT, and DKIM CNAME entries).
4. Add those DNS records to your domain registrar (wherever you registered `solacelife.ca`).
5. Click **Verify** in Resend. Verification typically takes 5–30 minutes.
6. Once verified, you can send from `memories@solacelife.ca`.

> Note: Until the domain is verified, you can still test using Resend's default sandbox — emails will only deliver to your own Resend-verified address.

---

## Section 3: Set the Secret in Supabase

1. Open your Supabase project dashboard.
2. Go to **Edge Functions** → **Secrets** (or **Settings** → **Edge Functions**).
3. Click **Add secret** and enter:
   - **Name:** `RESEND_API_KEY`
   - **Value:** your `re_...` key from Section 1.
4. Save. This secret will be available to all Edge Functions as `Deno.env.get('RESEND_API_KEY')`.

---

## Section 4: Deploy the Functions

From your terminal, in the `Solace-Life` project folder:

```bash
# One-time setup (if not already done)
npm install -g supabase
supabase login
supabase link --project-ref yfthwahxahjabfbuntys

# Deploy both functions
supabase functions deploy deliver-time-capsules
supabase functions deploy test-email-delivery
```

Replace `yfthwahxahjabfbuntys` with the value from **Supabase Dashboard → Settings → General → Reference ID**.

---

## Section 5: Send a Test Email

Use the `test-email-delivery` function to confirm Resend is connected and the HTML template renders correctly.

```bash
curl -X POST \
  'https://yfthwahxahjabfbuntys.supabase.co/functions/v1/test-email-delivery' \
  -H 'Authorization: Bearer YOUR_SERVICE_ROLE_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"to": "sokhaeang@gmail.com", "name": "Sokha", "senderName": "Solace Life Test"}'
```

Replace:
- `yfthwahxahjabfbuntys` — from Supabase Settings → General
- `YOUR_SERVICE_ROLE_KEY` — from Supabase Settings → API → service_role key (keep this secret)

A successful response looks like:

```json
{
  "success": true,
  "resendId": "re_xxxxxxxx",
  "to": "sokhaeang@gmail.com",
  "message": "Test email sent successfully"
}
```

Check your inbox for the email. It will have a `[TEST]` banner at the top so it is easy to identify.

---

## Section 6: End-to-End Test via SQL

This tests the full cron pipeline: database row → Edge Function → Resend → inbox.

**Step 1 — Get real IDs from your database.**

Run these queries in the Supabase SQL Editor:

```sql
-- Get your user ID
SELECT id, email FROM auth.users LIMIT 5;

-- Get a memory ID
SELECT id, title, type FROM memories LIMIT 10;

-- Get a family member ID (must have a valid email)
SELECT id, name, email FROM family_members LIMIT 10;
```

**Step 2 — Insert a test delivery row.**

Open `supabase/migrations/test_delivery_seed.sql`, replace the three UUID placeholders with real IDs, then run the script in the Supabase SQL Editor. The row will have `scheduled_date = CURRENT_DATE` and `status = 'pending'`, so it will be picked up immediately.

**Step 3 — Invoke the delivery function.**

```bash
supabase functions invoke deliver-time-capsules --method POST
```

Or via curl:

```bash
curl -X POST \
  'https://yfthwahxahjabfbuntys.supabase.co/functions/v1/deliver-time-capsules' \
  -H 'Authorization: Bearer YOUR_SERVICE_ROLE_KEY' \
  -H 'Content-Type: application/json' \
  -d '{}'
```

**Step 4 — Verify delivery.**

Check that the row in `scheduled_deliveries` now has `status = 'delivered'` and a non-null `delivered_at`:

```sql
SELECT id, status, delivered_at
FROM scheduled_deliveries
WHERE status = 'delivered'
ORDER BY delivered_at DESC
LIMIT 5;
```

Check the recipient's inbox for the email.

**Step 5 — Clean up the test row.**

In `test_delivery_seed.sql`, uncomment the `DELETE` statement at the bottom, replace `<your-row-id>` with the UUID of your test row, and run it.

---

## Section 7: Set Up the Daily Cron Job

Once you have confirmed the end-to-end test works, enable the daily cron schedule.

1. Open `supabase/functions/deliver-time-capsules/cron.sql`.
2. Replace the two placeholders in the file:
   - `yfthwahxahjabfbuntys` → Supabase Settings → General → Reference ID
   - `YOUR_SERVICE_ROLE_KEY` → Supabase Settings → API → service_role key
3. In the Supabase dashboard, go to **SQL Editor** → **New Query**.
4. Paste the contents of `cron.sql` and click **Run**.

The cron job will run every day at **9:00 AM UTC** (2:00 AM PST / 5:00 AM EST), processing any `scheduled_deliveries` rows with `status = 'pending'` and `scheduled_date <= today`.

> Prerequisites: `pg_cron` and `pg_net` extensions must be enabled in **Database → Extensions**.
