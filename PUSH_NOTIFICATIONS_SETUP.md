# Solace Life — Push Notifications Setup

This document covers everything you need to do to activate push notifications end-to-end.

---

## Step 1 — Install packages

Run this from the `Solace-Life/` folder:

```bash
npx expo install expo-notifications expo-device
```

> `npx expo install` (not `npm install`) ensures the versions are compatible with your Expo SDK version.

---

## Step 2 — Update app.json

Add the `expo-notifications` plugin to the `plugins` array in `app.json`:

```json
"plugins": [
  ["expo-notifications", {
    "icon": "./assets/notification-icon.png",
    "color": "#F5CEAA"
  }]
]
```

- Create `assets/notification-icon.png` — a white/transparent 96×96 PNG icon used on Android notification tray.
- The `color` is Solace Life's amber accent colour used for the Android notification LED/background.

---

## Step 3 — Set your Expo Project ID in App.tsx

Open `App.tsx` and find this line inside `registerPushToken`:

```ts
projectId: '2fc26943-45b2-4a45-89b7-325db2d88248',
```

Replace `2fc26943-45b2-4a45-89b7-325db2d88248` with your real project ID, found at:

1. Go to [expo.dev](https://expo.dev)
2. Open your project
3. Copy the **Project ID** from the project overview page (a UUID like `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`)

---

## Step 4 — Run the database migration

Run the migration in Supabase SQL Editor or via the CLI:

```bash
supabase db push
# or manually paste the contents of:
# supabase/migrations/016_push_notifications.sql
```

This adds `push_token` and `push_notifications_enabled` columns to the `profiles` table.

---

## Step 5 — Deploy Edge Functions

From the `Solace-Life/` folder:

```bash
# Log in and link your project (one-time)
supabase login
supabase link --project-ref YOUR_PROJECT_REF

# Deploy both functions
supabase functions deploy send-occasion-nudge
supabase functions deploy send-checkin-reminder
```

---

## Step 6 — Activate the cron jobs

For each function, open the corresponding `cron.sql` file, replace the two placeholders, then run it in Supabase Dashboard → SQL Editor → New Query:

| Placeholder              | Where to find it                          |
|--------------------------|-------------------------------------------|
| `YOUR_PROJECT_REF`       | Supabase Dashboard → Settings → General   |
| `YOUR_SERVICE_ROLE_KEY`  | Supabase Dashboard → Settings → API       |

Files to run:
- `supabase/functions/send-occasion-nudge/cron.sql` — daily at 10:00 AM UTC
- `supabase/functions/send-checkin-reminder/cron.sql` — every 6 hours

---

## Step 7 — Test

Manually invoke each function to verify it runs without errors:

```bash
supabase functions invoke send-checkin-reminder --method POST
supabase functions invoke send-occasion-nudge --method POST
```

Check the Edge Function logs in Supabase Dashboard → Edge Functions → Logs.

---

## Notes

- Push notifications only work on **physical devices**, not simulators. The registration silently skips simulators.
- Users can opt out of push notifications inside the app (flip `push_notifications_enabled` to `false` in their profile row). The Edge Functions honour this flag and skip those users.
- Occasion dates for lunar/religious holidays are hardcoded best-effort estimates. Update `OCCASION_CALENDAR` in `send-occasion-nudge/index.ts` each year or integrate a proper calendar library for production.
