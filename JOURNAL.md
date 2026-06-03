# Solace Life — Development Journal

A running log of daily progress, fixes, and milestones from inception to present.
Updated automatically at the end of every session.

---

## 2026-05-24 (Session 18) — Garden widget · profile redesign · copy audit · review card · Sokha as first family member

### Session context
- Continued from Session 17 (context compacted mid-session)
- Resumed at: title discussion for Sokha's founder contact feature

### HomeScreen — Garden widget & milestone card
- Removed original 3-stat row (Vault / Moments / Family cards) — duplicated info
- Added **weighted point system** for garden growth:
  - 1st memory: +10, each extra: +3 | 1st family: +8, each extra: +4 | vault items: +5 each
  - Profile photo: +5 | full name: +2 | phone: +1 | occasions set: +2
- Plant stages: 🌱 (0) → 🌿 (1–14) → 🌸 (15–34) → 🌺 (35–64) → 🌳 (65+)
- Garden card redesigned as **Option 6**: pink→orange→gold gradient border (2px), dark inner bg `#180A1E`
- Stat tiles inside garden card: `#FFD07A` numbers, `#F48A5A` labels
- Milestone card navigates to the next meaningful action based on score thresholds

### HomeScreen — Review card (Task #45)
- Added **Option 2 story card** (always visible for testing — Task #46 wires production trigger)
- Copy: *"Another family could have this peace of mind too."*
- CTA pill: *"Share a kind word →"* — triggers `StoreReview.requestReview()` via `expo-store-review`
- "Maybe later" dismiss link; card removes itself after either action
- **Task #46 (pre-launch)**: switch `useState(true)` → `useState(false)`, fire after 3+ memories, persist dismiss with AsyncStorage

### SettingsScreen — Profile header redesign
- Removed stats row (Moments / Family / Vault counts)
- Replaced profile header with **Option 2**: 140px avatar with gradient ring, name 22px bold, email 13px, completion bar (5px, pink fill), edit pill button
- Removed `nextMilestone` computed variable (no longer used)

### MemoriesScreen — Copy & UI cleanup
- Removed aurora occasion banner block entirely (~50 lines + animation ref + useEffect loop)
- Subtitle changed: `'Leave something behind'` → `"Words they'll carry forever"`

### Full copy audit — departure/death language removed across all screens
All changes preserve database values (e.g. `'remembrance'` key unchanged); display labels only:

| File | Old | New |
|---|---|---|
| FamilyScreen | "Who receives your legacy" | "The people who matter most" |
| FamilyScreen | "when the time comes" (×3) | "if your family ever needs it" / "always connected" / "if you miss check-ins" |
| FamilyScreen | "will receive your vault" (×2) | "will have access to your vault" |
| FamilyScreen | "activate the Vault Release" | "unlock your family's access" |
| OnboardingTrackScreen | "The Remembrance Path" | "The Legacy Path" |
| OnboardingTrackScreen | "Family vault access when the time comes" | "Family access when they need it most" |
| OnboardingEmergencyScreen | "digital executor" | "trusted guardians" |
| OnboardingTourScreen | "final letters, digital executor, when the time comes" | "heartfelt letters, trusted guardian, when your family needs it" |
| SettingsScreen | "Remembrance Path" | "Legacy Path" |
| SettingsScreen | "When your vault is released to your family" | "If your vault is ever shared with your family" |
| ProfessionalServicesModal | "Funeral Services" | "End-of-Life Planning" |

### Founder contact — "Tom from MySpace" feature (Tasks #47 & #48)
**Strategic decision**: Sokha Eang (Founder) is auto-added as every new user's first family member. Title kept as "Founder" — non-tech-savvy users benefit from the clarity it provides. Delete is allowed.

#### Migration — `20260524000002_founder_contact.sql`
- Adds `is_founder_contact BOOLEAN DEFAULT FALSE` to `family_members`
- Updates `handle_new_user()` to auto-insert Sokha (sokhaeang@gmail.com) on every new signup
- Backfills existing sender/both accounts who don't already have his row
- `email_confirmed = TRUE` — bypasses invite flow

#### FamilyScreen — Founder card
- Sokha filtered out of `trustedMembers` and `regularMembers` lists
- Rendered above all other sections with gradient border card (pink→orange→gold, dark inner `#1A0A22`):
  - "S" avatar with pink ring, "FOUNDER" pill badge
  - Name + italic tagline: *"I built this for my own family first — happy you're here."*
  - Faint "Remove" link at bottom
- When Sokha is the only entry: tip card nudges user to add their first real family member
- Empty state only shows when there's truly nobody (no Sokha, no members, no senders)

#### FamilyScreen — Custom delete modal for Sokha
- Icon: 👋 instead of ⚠️
- Title: "Remove Sokha?" instead of "Remove Family Member?"
- Body: warm explanation of who he is + "You can remove him anytime. It won't affect your account."
- Buttons: "Keep Sokha" / "Remove" (same 3-letter confirm mechanism)

### Files changed this session
- `screens/HomeScreen.tsx` — garden card, weighted scoring, review card, stat row removed
- `screens/SettingsScreen.tsx` — profile header Option 2, stats row removed, copy fixes
- `screens/MemoriesScreen.tsx` — aurora banner removed, subtitle copy fix
- `screens/FamilyScreen.tsx` — 7 copy fixes + founder card + custom delete modal
- `screens/onboarding/OnboardingTrackScreen.tsx` — 6 copy fixes
- `screens/onboarding/OnboardingEmergencyScreen.tsx` — 3 copy fixes
- `screens/onboarding/OnboardingTourScreen.tsx` — 1 copy fix
- `screens/ProfessionalServicesModal.tsx` — 2 copy fixes
- `supabase/migrations/20260524000002_founder_contact.sql` — new

### Pending deployment steps (user action required)
1. Run migration `20260524000002_founder_contact.sql` in Supabase SQL Editor ← **already done this session**
2. **Task #46** (pre-launch): wire review card production trigger — `useState(false)`, 3+ memories condition, AsyncStorage persist
3. **Task #49**: welcome moment from Sokha in Memories tab — needs Sokha's Supabase user UUID

---

## 2026-05-24 (Session 17) — Emergency contact consent flow · reminder emails · badge redesign

### Session context
- Continued from Session 16 (context crashed mid-task)
- Resumed at Task 8 — replacing harsh red "Declined" badge with neutral language

### Emergency consent flow — completed end-to-end

#### FamilyScreen.tsx — badge & UX updates
- **Declined badge** (list + view modal): replaced red `✗ Declined emergency role` with neutral grey 🔕 "Not available as emergency contact"
- **View modal declined card**: added "Resend the request →" tap target (pink, calls `send-emergency-contact-email`)
- **Pending badge** (all 4 locations): replaced amber `⏳ Awaiting consent` (`#FFB800` — poor contrast on WARM background) with **Option D** left-border card style:
  - Red left border (3px `#E24B4A`), soft red tint background, 🚑 ambulance icon
  - List view: compact single-line — "Emergency consent pending" in dark red `#7A1F1F`
  - View modal: two-line card — "Emergency contact · request sent" / "Waiting for their reply"
  - Header banner: `🚑 N emergency consent pending` in `#A32D2D`
- **New function** `handleResendEmergencyRequest()` — invokes `send-emergency-contact-email` edge function, resets reminder timestamps

#### New edge function — `send-emergency-reminders`
- Queries all `emergency_consent_status='pending'` rows daily
- **7-day nudge**: subject "Just checking in — still hoping you'll say yes"
- **30-day final**: subject "A gentle reminder — last one, promise" (dove 🕊️ badge, no further emails after)
- Each wave fires exactly once — tracked by `emergency_reminder_7d_sent_at` / `emergency_reminder_30d_sent_at`
- Resending from G1 resets both timestamps so clock restarts fresh

#### New migration — `20260524000001_emergency_reminder_timestamps.sql`
- Adds `emergency_consent_requested_at`, `emergency_reminder_7d_sent_at`, `emergency_reminder_30d_sent_at` to `family_members`
- Backfills `requested_at = NOW()` for any currently pending rows (prevents immediate reminder fire)
- Schedules `pg_cron` job: daily 09:00 UTC → `send-emergency-reminders`

#### Updated edge function — `send-emergency-contact-email`
- Now stamps `emergency_consent_requested_at` on send
- Resets both reminder timestamps to `null` on resend
- Email subject updated: *"[Name] would be honoured to have you as their emergency contact"*
- Accept button updated: *"Yes, I'm honoured to ›"* (consistent across original + reminder emails)

#### confirm.html — v7 (warmer EC copy)
- **Accept page**: "You're honoured to be there for them" / "a profound gift"
- **Decline page**: "No explanation needed" / "quietly saved" / sender name moved to privacy note only

### Files changed this session
- `screens/FamilyScreen.tsx` — 4 badge locations, resend function, header banner
- `supabase/functions/send-emergency-reminders/index.ts` — new
- `supabase/functions/send-emergency-contact-email/index.ts` — timestamp stamping + warmer copy
- `supabase/migrations/20260524000001_emergency_reminder_timestamps.sql` — new
- `landing/confirm.html` — v7, warmer EC accept/decline copy

### Pending deployment steps (user action required)
1. Run migration `040` in Supabase SQL Editor (`20260524000000_emergency_consent.sql`)
2. Run migration `041` in Supabase SQL Editor (`20260524000001_emergency_reminder_timestamps.sql`)
3. Deploy `confirm-emergency-contact` edge function in Supabase Dashboard
4. Deploy `send-emergency-reminders` edge function in Supabase Dashboard
5. Deploy `confirm.html` v7 to Netlify via Terminal curl command

---

## 2026-05-24 (Session 16) — Confirm page v5 · green grass · Layout B

### Session context
- Started fresh Cowork session (previous session crashed from context length)
- Recovered JOURNAL.md from old session, re-familiarised with full project

### confirm.html redesign — `landing/confirm.html`
- Identified critical mismatch: existing v4 confirm page used amber/golden grass colors instead of landing page's green grass
- Designed 3 layout concepts (floating card, text-on-scene, rising earth panel) — user selected **Layout B (text-on-scene)**
- Rebuilt confirm.html as v5 with the following changes:
  - **Grass fixed**: replaced 8 flat amber colors with 7 green gradient pairs exactly matching `landing/index.html` (`#3A5C30→#5A8050`, `#4A6B3C→#6A9060`, etc.)
  - **Grass JS rewritten**: now matches landing page exactly — responsive blade count (`W/3.2`, max 520), variable width (1–3.2px), height as % of container (45–100%), per-blade opacity (0.55–1.0), slower natural sway (2.8–6.2s)
  - **Grass container**: height corrected from 38% → 36% to match landing page
  - **Gold divider**: replaced plain white rule with `rgba(196,154,60,0.65)` gold line
  - **Eyebrow labels**: added uppercase gold eyebrow text above each state heading (e.g. "invitation confirmed", "preference saved")
  - **Overlay**: slightly more opaque at bottom for better text legibility
  - All 5 confirmation states preserved: loading, accept, decline, already-accept, already-decline, error

### Deployment workflow established
- Discovered `.netlify/state.json` had incorrect site ID — corrected to `2b16c6af-9c68-43e8-a9aa-3db3353f3b37`
- Netlify site is **manual deploy** (not git-connected), so GitHub push alone doesn't publish
- Cowork sandbox network cannot reach `api.netlify.com` directly
- Established deploy workflow: Claude prepares ZIP, user runs one `curl` command from Mac Terminal
- Successfully deployed v5 via Netlify API to **solacelife.ca/confirm.html**

---

## 2026-05-23 (Session 15) — Letter UI redesign + PLUM gradient CTA buttons

### Letter viewer redesign — `screens/MemoriesScreen.tsx`
- Replaced the plain text memory viewer with a full parchment letter-on-paper experience
- Cream/ivory background (`#FDF6E3`), Georgia serif font, red vertical margin line (left gutter), drop shadow envelope effect
- Gold letterhead with recipient name, italic date, personal salutation — matches the feel of receiving a real handwritten letter

### Letter composer redesign — `screens/MemoriesScreen.tsx`
- Rewrote the Written Story writing modal to match the parchment aesthetic (user selected Option A)
- Step 1 now uses cream gradient (`['#EDD9A3', '#F5EDCC', '#FDF6E3']`), gold letterhead, `B&B Ink` placeholder style, margin line, dark-brown text (#3D1E05)
- Step 2 (schedule delivery) reverts to WARM gradient as before
- No character limit imposed — letter auto-expands with content, equivalent to "pages" scrolling naturally

### Fix: scroll of doom — `screens/MemoriesScreen.tsx`
- **Root cause:** iOS `onContentSizeChange` on TextInput fires before layout is complete, reporting an inflated height
- **Fix:** Removed `storyHeight` state entirely; TextInput now uses `minHeight: 112` only, `scrollEnabled={false}`, outer `ScrollView` handles all scrolling
- Modal height moved to `height: '92%'` on a concrete-sized View (direct child of overlay) so percentage resolution works inside KeyboardAvoidingView

### PLUM gradient CTA buttons — 7 files updated
- Added `PLUM: ['#2D1052', '#5B2D8E', '#8B4FC8']` constant to `lib/constants.ts`
- Replaced all primary pink solid CTA buttons with `LinearGradient colors={PLUM} start={{x:0,y:0}} end={{x:1,y:1}}`
- Files updated: `FamilyScreen.tsx`, `MemoriesScreen.tsx`, `VaultScreen.tsx`, `SettingsScreen.tsx`, `AvatarScreen.tsx`, `ProfessionalServicesModal.tsx`, `FacebookImportModal.tsx`
- 13 buttons total converted (Send Invite, Save Changes, Save to Vault, Edit Profile Save, Edit Occasions Save, Accept Memories Again, Get Legacy plan, Start Free Trial, Save Note, Connect with partner, Done, schedule delivery buttons)

### Fix: G2→G1 family_members auto-creation — `screens/MemoriesScreen.tsx`
- Supabase upsert with `onConflict: 'user_id,recipient_profile_id'` was silently failing against the partial unique index `WHERE recipient_profile_id IS NOT NULL`
- Fix: switched to plain `INSERT`, catching error code `23505` (unique violation) as a success state, then always fetching the rows after the insert attempt

### Pending
- End-to-end G2→G1 memory send flow needs full device test
- Auth/onboarding screens — PLUM button coverage not yet verified (those screens may still use dark solid buttons)

---

## 2026-05-23 (Session 14) — Hosting migration resolved + 3 tasks confirmed complete

### Hosting migration (resolved)
- Attempted GoDaddy cPanel hosting — ran into SSL (self-signed only), domain limit (1 domain max), and DNS propagation delays
- Reverted to Netlify — restored credits, re-deployed `landing/` folder via drag-and-drop
- Switched GoDaddy nameservers to Netlify's 4 nameservers — Netlify now manages DNS + SSL automatically
- `solacelife.ca` is live with free Let's Encrypt SSL via Netlify

### Tasks #36, #37, #38 — all confirmed working ✅
- **Migration 036** deployed: `email TEXT` column added to profiles, backfilled from auth.users, handle_new_user trigger updated, email sync trigger added
- **MemoriesScreen** — G2 now sees one unified card per person with 🔒 (scheduled) and 📥 (received) badges
- **FamilyScreen** — G1 sender detail modal now shows G1's email (✉️) pulled from profiles.email

---

## 2026-05-21 (Session 13) — Fix: voice playback AVFoundation -11829 — CDN bypass

### Root cause confirmed

Error: `AVFoundationErrorDomain -11829` ("This media may be damaged"). This is `AVErrorFileFailedToParse` — the file downloaded to the local cache is not valid audio. The Supabase CDN returns HTTP 200 with a JSON error body (e.g. `{"message":"Invalid JWT token"}`) instead of real audio bytes. `FileSystem.downloadAsync` treats 200 as success, saves the JSON to disk, then AVFoundation fails to parse it.

This is the same CDN signed URL issue that affected profile photos and album photos. The CDN applies this behavior on iOS when something is wrong with the token or the access path. The authenticated `supabase.storage.download()` API bypasses the CDN entirely and returns real bytes via the Supabase backend.

**Why video works but audio didn't:** Video files were likely already cached from an earlier working session (before this file was tested as a received delivery). Audio had no valid cache so the fresh CDN download exposed the issue.

### Fix — `screens/MemoriesScreen.tsx` → `togglePlayback`

Replaced `createSignedUrl` + `FileSystem.downloadAsync` (CDN path) with `supabase.storage.download()` + FileReader + `writeAsStringAsync` (authenticated API path) for native platforms. Web path unchanged — browser handles signed URLs natively.

The pattern is now identical to `resolvePhotoUri` (profile photos) and `openAlbumDetail` (album photos):
1. Check cache: if file exists and size > 1 KB → use cached file
2. If not: `supabase.storage.download(file_path)` → Blob
3. FileReader.readAsDataURL → strip data: prefix → base64 string
4. `FileSystem.writeAsStringAsync(localPath, base64, Base64 encoding)`
5. `Audio.Sound.createAsync({ uri: localPath })`

**Key design note:** `supabase.storage.download()` works for both G2's own audio AND G1's received audio (Migration 032 grants G2 SELECT on G1's files). No special-casing needed.

---

## 2026-05-21 (Session 12) — Fix: auto-linked rows marked as confirmed active users

### Design logic

G1 is a verified Supabase user — their email was confirmed the moment they created their account. The `⚠️ Email not confirmed` flag exists for *invited* members who haven't yet clicked a link. Auto-created G2→G1 rows are not invites; they're cross-links to an existing active account. Showing the warning is misleading and the "Resend invite" button would do nothing useful.

Similarly, `status = 'pending'` implies G1 hasn't accepted yet — but there's nothing to accept. G1 is already using the app.

The `profiles` table only stores `full_name` and `avatar_url` — it doesn't hold email, phone, or DOB. Those fields in `family_members` can only be populated if G1 manually enters them (a future enhancement). For now the row is populated with all available data.

### Fix — `screens/MemoriesScreen.tsx` → `loadFamilyMembersWithPhotos`:

**New insert fields:**
- `status: 'accepted'` — G1 is an active user, not a pending invite
- `email_confirmed: true` — G1's email was verified at Supabase sign-up
- `accepted_at: now()` — timestamp reflecting when the link was established

**Backfill block expanded:** existing auto-linked rows (inserted before this fix) now get updated with `status`, `email_confirmed`, and `accepted_at` in addition to `photo_url`. Runs whenever `loadFamilyMembersWithPhotos` is called and finds a row that still has the old defaults.

---

## 2026-05-21 (Session 11) — Fix: profile picture in Deliver To + voice error details + album debug visibility

### Fix 1: Profile picture missing in "Deliver To" picker for G1

**Root cause:** `loadFamilyMembersWithPhotos` auto-creates the G2→G1 `family_members` row with `name` and `recipient_profile_id` but no `photo_url`. The schedule modal's recipient picker renders avatars from `memberPhotoUrls[member.id]`, which is populated from `member.photo_url`. Since the auto-created row had no `photo_url`, it always showed the initial letter.

**Fix — `screens/MemoriesScreen.tsx` → `loadFamilyMembersWithPhotos`:**
- Added `avatar_url` to the profiles SELECT: `.select('id, full_name, avatar_url')`
- Added `photo_url: p.avatar_url || null` to new insert objects
- Added backfill block: for any existing auto-linked row with `photo_url = null`, fetches the sender's `avatar_url` from profiles and UPDATEs the row + updates the local `list` so the URL resolves in the same pass

### Fix 2: Voice playback error now shows actual error message

**Fix — `screens/MemoriesScreen.tsx` → `togglePlayback`:**
- Changed generic "Could not play audio" to `Audio error: ${e.message}` so the specific failure is visible
- Added `null` guard on `mem.file_path` (explicit early return if path missing)
- Changed cache key from `mem.file_name` to `mem.id` to prevent cross-user cache collisions (two users with the same `file_name` would have overwritten each other's cached audio)
- Added stale cache check: if cached file is < 1 KB (likely a CDN error body, not real audio), deletes and re-downloads
- Added `downloadAsync` status check: returns with error if status ≠ 200

### Fix 3: Album debug text larger and more visible

- Empty state debug: `fontSize: 11 → 13` with padding and line height
- Placeholder cell debug: `fontSize: 9 → 11`
- Debug text appears in yellow on both the "No photos found" screen and directly on each camera-icon placeholder

---

## 2026-05-21 (Session 10) — Fix: memories join blocked by RLS + duplicate family members

### Root Cause 1: Received memory rows always null in detail modal

**Bug:** `loadReceivedMemories()` queries `.select('*, memories(*)')`. Supabase evaluates RLS on the joined `memories` table independently. The only `memories` SELECT policy was sender-only (`user_id = auth.uid()`). G2 is NOT G1's `user_id` → RLS blocked the join → `delivery.memories = null` for every row → `if (!mem) return null` → ScrollView renders nothing. This is why the modal always showed only the profile card regardless of the height fix.

**Fix — `supabase/migrations/20250101000034_memories_recipient_read.sql`:**
```sql
CREATE POLICY "recipients can read delivered memories"
ON public.memories FOR SELECT
USING (
  id IN (
    SELECT sd.memory_id
    FROM   public.scheduled_deliveries sd
    JOIN   public.family_members fm ON fm.id = sd.family_member_id
    WHERE  fm.recipient_profile_id = auth.uid()
  )
);
```
G2 can now read any memory that G1 explicitly scheduled for delivery to G2.

### Root Cause 2: Duplicate family member cards (2× "Sokha Eang")

**Bug:** `loadFamilyMembersWithPhotos()` runs on mount AND tab-focus (two calls fired before first INSERT commits). Both runs query the DB, find no existing G2→G1 row, and both INSERT → two duplicate rows. The partial unique index from Migration 033 only covers `(user_id, email) WHERE email IS NOT NULL` — it doesn't prevent duplicates when email is NULL.

**Fix — `supabase/migrations/20250101000035_family_members_dedup_unique_recipient.sql`:**
1. Deletes duplicate (user_id, recipient_profile_id) rows, keeping the latest per pair
2. Adds `UNIQUE INDEX family_members_user_recipient_unique ON (user_id, recipient_profile_id) WHERE recipient_profile_id IS NOT NULL`

**Fix — `screens/MemoriesScreen.tsx` → `loadFamilyMembersWithPhotos`:**
- Changed `.insert(inserts)` to `.upsert(inserts, { onConflict: 'user_id,recipient_profile_id', ignoreDuplicates: true })`
- Concurrent calls now silently ignore the second insert

**Fix — `screens/FamilyScreen.tsx` → `loadMembers`:**
- Added `.filter(m => m.email !== null)` to exclude auto-created reciprocal rows from the Family Members list
- These null-email rows are already represented in the "Connected with" section via `receivedGroups`; showing them again as editable family cards was confusing

### Pending deploys (run in order):
1. Migration 034 — `memories` RLS for recipients
2. Migration 035 — dedup + unique constraint

---

## 2026-05-21 (Session 9) — Fix: album photo loading — createSignedUrl + downloadAsync + debug overlay

### Fix 1: Rewrite `openAlbumDetail` — use proven createSignedUrl + FileSystem.downloadAsync pattern

**Problem:** Session 8's `supabase.storage.download()` + FileReader + writeAsStringAsync approach was silently failing (returning `{ signedUrl: '' }` → camera icon placeholder). Exact failure reason unknown without logs.

**Fix — `screens/MemoriesScreen.tsx` → `openAlbumDetail`:**
- Switched to `createSignedUrl(p.path, 3600)` → get a valid CDN URL
- Native path: `FileSystem.downloadAsync(signedUrl, cacheDir/album_id_i.ext)` → cache locally → pass `file://` URI to `<Image>`
- Web path: signed URL passed directly (browser Image handles it fine)
- This is the exact same pattern as voice memos (`togglePlayback`) and video (`openVideoPlayer`) which both work
- Added `dlResult.status !== 200` check to catch download failures and surface them via `albumDebug`

### Fix 2: `albumDebug` state — visible error overlay

**Added:** `const [albumDebug, setAlbumDebug] = useState('')`
- Set on every failure branch (URL error, download status, exception, parse error)
- Displayed as yellow monospace text inside both the "No photos found" empty state AND the 📸 placeholder cell
- Cleared on album close and on each `openAlbumDetail` call
- Allows diagnosing exactly what step is failing without needing Expo logs

---

## 2026-05-21 (Session 8) — Fix: detail modal height (height:80%) + album photo caching

### Fix 1: Detail modal still showing only profile card — explicit height:'80%'

**Root cause (continued from Session 7):** The Session 7 fix added `flex:1` to `s.modalSheet`, but in a `justifyContent:'flex-end'` parent, `flex:1` causes the sheet to expand to the full screen height instead of capping at 85%. Additionally, `s.modalInner` has `maxHeight:640` which was not being overridden by the `[s.modalInner, { flex:1 }]` style array — `maxHeight` takes precedence over `flex`. The ScrollView had `flex:1` but its parents weren't giving it a concrete bounded height to fill.

**Fix — `screens/MemoriesScreen.tsx` → Member Detail Modal container:**
- Replaced `<View style={[s.modalSheet, { maxHeight: '85%', flex: 1 }]}>` with `<View style={{ height: '80%', borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden' }}>` — explicit `height:'80%'` bypasses both `s.modalSheet` (no size) and `s.modalInner` (maxHeight:640). `overflow:'hidden'` keeps rounded corners
- Replaced `<LinearGradient ... style={[s.modalInner, { flex: 1, paddingTop: 24 }]}>` with `style={{ flex: 1, paddingHorizontal: 28, paddingTop: 24, paddingBottom: 28 }}` — no longer inherits `s.modalInner`'s `maxHeight:640`; `flex:1` now fills the explicit 80% height parent

### Fix 2: Album photos showing 📸 placeholder — authenticated download caching

**Root cause:** `openAlbumDetail` used `createSignedUrl()` to get CDN URLs, then passed them directly to `<Image source={{ uri: signedUrl }}>`. On iOS, the Supabase CDN returns HTTP 200 with a small JSON error body (rather than a proper 4xx), making the Image component appear to receive a response but fail to parse it as an image — triggering `onError` → empty `signedUrl` → 📸 placeholder.

**Fix — `screens/MemoriesScreen.tsx` → `openAlbumDetail`:**
- iOS/Android path: uses `supabase.storage.download(p.path)` (authenticated API, not CDN) to get real image bytes as a Blob
- Converts Blob → base64 via `FileReader.readAsDataURL` (same pattern as `resolvePhotoUri`)
- Writes base64 to `FileSystem.documentDirectory + 'album_cache/' + sanitizedPath + '.jpg'`
- Returns local `file://` URI; subsequent opens hit disk cache, no re-download needed
- Web path: unchanged — `createSignedUrl` works fine on web
- Deploy required: Migration 032 (storage SELECT policy for recipients) must be deployed for G2 to download G1's photo files

---

## 2026-05-21 (Session 7) — Fix: email NOT NULL + detail modal height + album empty state

### Fix 1: G1 still not showing in "Deliver to" — email NOT NULL constraint

**Root cause:** `family_members.email` is `TEXT NOT NULL` with a `UNIQUE(user_id, email)` table constraint. The auto-creation insert in `loadFamilyMembersWithPhotos` (added Session 6) doesn't include an email (G1's email isn't accessible client-side via Supabase auth API). The insert silently fails with a NOT NULL violation, so no G2→G1 row is ever created.

**Fix — `supabase/migrations/20250101000033_family_members_email_nullable.sql`:**
1. `ALTER TABLE family_members ALTER COLUMN email DROP NOT NULL` — makes email optional
2. Drops the table-level `UNIQUE(user_id, email)` constraint
3. Re-creates it as a partial unique index `WHERE email IS NOT NULL` — preserves duplicate-invite prevention for normal invitations while allowing multiple NULL-email reciprocal rows

**Deploy required:** Run Migration 033 in Supabase SQL Editor. After deploying, the next time G2 navigates to the Memories tab, `loadFamilyMembersWithPhotos` will auto-create the G2→G1 row, and G1 will appear in "Deliver to" and "Not Yet Assigned" scheduler.

### Fix 2: Detail modal only 1/5 screen height (ScrollView collapses)

**Root cause:** `s.modalInner` has `maxHeight: 640` but no `flex` property. `s.modalSheet` has only border radius — no height. With just `<View style={{ height: 120 }}>` header + unconstrained `<ScrollView>`, the modal auto-sized to ~188px (header + padding), giving ~1/5 screen height. The ScrollView rendered at 0 height because no parent had `flex: 1` to give it room.

**Fix — `screens/MemoriesScreen.tsx` → Member Detail Modal:**
- `s.modalSheet` override: added `flex: 1, maxHeight: '85%'` — gives the sheet explicit flex space
- `LinearGradient` override: replaced `maxHeight: '100%'` with `flex: 1, paddingTop: 24` — expands to fill available height
- IIFE return: changed `<>...</>` (Fragment) to `<View style={{ flex: 1 }}>...</View>` — fragments can't hold flex
- `<ScrollView>`: added `style={{ flex: 1 }}` — now has room to expand to available height

### Fix 3: Album viewer "blank blue screen" — empty state + image error handling

**Root cause (likely):** The photo album viewer uses `backgroundColor: C.bg1 = '#1E1248'` (dark indigo — the retired color scheme). When photos are loading or fail to load, only this dark indigo background shows — no message or placeholder. The user sees "blank blue screen."

**Fix — `screens/MemoriesScreen.tsx` → Album Detail Viewer Modal:**
- Loading state: replaced bare `ActivityIndicator` with a centered view adding "Loading photos…" text
- Empty state: added explicit `albumPhotos.length === 0` branch with a 📷 icon + "No photos found" message + helpful tip
- Image `onError`: if a signed URL resolves but the image fails to load (network failure, expired URL), the handler replaces the broken URL with `''` so the 📸 placeholder emoji shows instead of a blank cell

---

## 2026-05-21 (Session 6) — Fix: G2 can send to G1 + received memories now open correctly

### Fix 1: G2 "Deliver to" list was empty — G1 never appeared

**Root cause:** `loadFamilyMembersWithPhotos` queries `family_members WHERE user_id = G2_uid`. G2 has no rows as an owner — only as a recipient (in G1's row). `openScheduleModal` uses the same query. Result: "Deliver to" was always empty for G2.

**Fix — `screens/MemoriesScreen.tsx` → `loadFamilyMembersWithPhotos`:**
After loading G2's own rows, the function now also:
1. Queries `family_members WHERE recipient_profile_id = G2_uid` to find G1 senders
2. Filters out any G1 senders who already have a G2→G1 forward row
3. Fetches G1 profile names (migration 029 allows cross-user read)
4. Inserts real `family_members` rows with `user_id = G2_uid, recipient_profile_id = G1_uid`
5. Merges those new rows into the list for `setAllFamilyMembers` + `setFamilyMembers`

This is idempotent — once the reverse row exists, the `existingRecipientIds` check skips creation. After first run:
- `openScheduleModal` (which queries the same table) will naturally include G1
- "Deliver to" picker in all schedule modals will show G1
- G2 can create memories and schedule them to G1

### Fix 2: Received memory rows didn't open when tapped

**Root cause (two issues):**
1. The `onPress` handler was a `function` declaration inside the `.map()` callback — an unusual pattern that can cause issues in some React Native/Hermes configurations
2. Modal stacking: for `written`, `video`, `photo` types, a second modal was being opened while the detail modal was still mounted, causing conflicts especially on Android/web

**Fix — `screens/MemoriesScreen.tsx` → received delivery row `onPress`:**
Rewrote as an inline arrow function. Type-aware routing:
- `voice` → `togglePlayback(mem)` — plays inline, detail modal stays open; badge shows "▶ Play" / "⏸ Playing…"
- `written`, `video`, `photo` → `setSelectedMemberGroup(null)` first (closes detail modal), THEN opens the viewer. This prevents double-modal conflicts.

**Note:** Migration 032 must also be deployed in Supabase before voice/video/photo will actually load their media. Written stories work immediately (no storage needed).

---

## 2026-05-21 (Session 5) — Feature: Received memories now playable/viewable

### Feature: Tap to Play/View Received Memories (Migration 032 + MemoriesScreen)

**Problem:** G2 could see G1's delivered memory cards in the Memories detail modal, but they were plain static rows — no way to play or open them.

**Root cause — two-part fix required:**

**Storage block (Migration 032):**
The `memories_user_select` storage policy is `name LIKE auth.uid()::text || '/%'` (self-only). G1's memory files are stored under `{G1_uid}/file.m4a` etc. G2's signed URL request for those paths was blocked, returning null, so media couldn't load.

**Fix:** `supabase/migrations/20250101000032_storage_recipients_read_sender_files.sql`
```sql
CREATE POLICY "recipients can read sender memory files"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'memories'
  AND split_part(name, '/', 1) IN (
    SELECT fm.user_id::text
    FROM   public.family_members fm
    WHERE  fm.recipient_profile_id = auth.uid()
  )
);
```
Allows G2 to read files whose first path segment belongs to a user who has G2 as a linked recipient. Tightly scoped — not a blanket open policy.

**MemoriesScreen.tsx — tappable rows:**
Received delivery rows changed from plain `<View>` to `<TouchableOpacity>` with type-aware `onPress`:
- `written` → `setViewItem(mem)` — opens WARM text-read modal
- `voice` → `togglePlayback(mem)` — resolves signed URL + plays via Audio.Sound; row shows "▶ Play" / "⏸ Playing…" badge
- `video` → `openVideoPlayer(mem)` — resolves signed URL (with iOS cache download), opens VideoPlayerModal
- `photo` → `openAlbumDetail(mem)` — resolves signed URLs for all photos, opens album viewer

Each row now shows a small action hint in the metadata row: "▶ Play" for voice, "Tap to open →" for all others.

**Deploy required:** Run Migration 032 in Supabase SQL Editor before testing media playback.

---

## 2026-05-21 (Session 2) — Fix: Text String Error (comprehensive Fabric-safe rewrite)

### Persistent "Text strings must be rendered within a <Text> component" Error

The Console Error persisted after the previous session's `onPress` fix. Exhaustive static analysis (grepping all `&&` patterns, checking every Fragment and ternary, examining MemberAvatar, ScreenWrap, RecipientFamilyScreen) couldn't locate a single bare text literal statically. 

**Root cause theory:** React Native 0.81 Fabric is stricter than old-arch about how it processes JSX children. The outer `<>` Fragment in the else-branch ternary was promoting its children (including conditional `false` values) as direct `ScrollView` children via Fragment flattening. In Fabric, even non-string falsy values in this position can trigger the createTextInstance guard.

**Fix applied — `screens/FamilyScreen.tsx`:**
- Replaced all `{condition && <JSX>}` patterns in the ScrollView render section with explicit `{condition ? <JSX> : null}` ternaries — the canonical React Native Fabric safe pattern
- Replaced the outer `<>` Fragment (else-branch of the loading ternary, line ~947) with `<View>`, so Fragment children are no longer promoted as direct ScrollView children
- Same treatment applied to the empty-state branch (also was a bare Fragment)
- All `&&` inside trustedMembers, regularMembers, Platform.OS checks, is_emergency_contact, email_confirmed — all converted to explicit ternaries
- Bracket balance verified programmatically: View 41/41, Fragment 4/4

**Issue 2 — SokhaG1's profile photo not appearing in G2's "Connected with" card** (carry-forward from Session 1)
`loadSenders()` queries `profiles` WHERE `id IN [g1_user_ids]` to get `full_name` and `avatar_url`. The profiles SELECT RLS policy is `auth.uid() = id` (self-only). SokhaG2 cannot read SokhaG1's profile row — query returns nothing, so `avatarStoragePath` is null and no photo is shown.

**Fix:** `supabase/migrations/20250101000029_profiles_public_read.sql` — new migration
- Adds `SELECT USING (auth.role() = 'authenticated')` policy on `profiles`
- Allows any signed-in user to read another user's basic profile info (name + avatar)
- The existing self-only update policy is unchanged

### Deploy Required — TWO Migrations (run both in Supabase SQL Editor)

**Root cause is a two-step chain:**
1. `profiles` table RLS is self-only → G2 gets no `avatar_url` path at all (migration 029 fixes)
2. `memories` storage SELECT policy is self-only for the `profiles/` prefix → even with the path, G2 can't create a signed URL (migration 030 fixes)

Run in order:
1. `supabase/migrations/20250101000029_profiles_public_read.sql`
2. `supabase/migrations/20250101000030_storage_profiles_cross_read.sql`

After both are deployed, G1's profile photo will appear seamlessly in:
- G2's Family tab "Connected with" card (FamilyScreen)
- G2's Memories tab G1 sender person card (MemoriesScreen)
- G2's Memories detail modal header when tapping G1's card

### Session 4 — Fix: scheduled_deliveries RLS + isRecipient gate + modal text

**Bug: G2 Memories tab still showed no received memories after code fix**
Root cause: `scheduled_deliveries` SELECT policy is `using (auth.uid() = user_id)`. G1 is the `user_id` on every delivery row. G2 is the recipient — linked via `family_members.recipient_profile_id`, not `user_id`. Every row is blocked.

Fix: Migration 031 — adds second SELECT policy:
```sql
family_member_id IN (SELECT id FROM family_members WHERE recipient_profile_id = auth.uid())
```
G2 can now read delivery rows for any family_member row they're linked to. Sender-only policy unchanged.



**Bug: G2 Memories tab showed no G1 sender card**
Root cause: `isRecipient = accountType === 'recipient' || accountType === 'both'`. G2's `account_type` is `'sender'` (converted via onboarding, not `'both'`), so `isRecipient` was `false`. Every `loadReceivedMemories()` call and every render guard was blocked.

Fix: Removed `isRecipient` entirely from MemoriesScreen. `loadReceivedMemories()` now always runs — it returns immediately if no `family_member` rows exist for the user, so there's no cost for pure senders. All render guards now check `receivedGroups.length > 0` directly.

**Bug: FamilyScreen G1 detail modal said "Open My Vault"**
Fixed: Vault card replaced with Memories card — icon 💌, text "Their messages live in Memories / Open the Memories tab to replay every message they have sent you."

### Session 3 Changes

### Feature: Clickable G1 Sender Card with Detail Sheet

Added `selectedSender` state to `FamilyScreen.tsx`. The G1 sender card in "Connected with" is now wrapped in a `TouchableOpacity` — tapping anywhere on the card (or the avatar) opens a WARM-gradient bottom-sheet modal showing:
- Large circular avatar (photo or initials fallback)
- Sender's full name and relationship label badge
- "Preserving memories for you" info card
- "Your Vault holds their messages" info card with a pointer to open My Vault
- Close button (also an ✕ in the corner)

Implementation: new `Modal` at the bottom of the `ScreenWrap`, driven by `selectedSender` state (null = closed). Uses existing `WARM` / `WM` token system per CLAUDE.md. `MemberAvatar.onPress` wired to same setter so tapping the photo strip also opens the sheet.

### Fix: Reciprocal Relationship Label

Added `getReciprocalLabel(label)` to `FamilyScreen.tsx`. Maps G1's label FOR G2 to the standard reciprocal term G2 should see for G1:
- "Wife" / "Husband" / "Partner" → **Spouse**
- "Child" / "Son" / "Daughter" → **Parent**
- "Parent" / "Mother" / "Father" / "Mom" / "Dad" → **Child**
- "Sibling" / "Brother" / "Sister" → **Sibling**
- "Friend" / "BFF" → **Friend**
- Unknown labels → `null` (no badge shown rather than a confusing label)

Applied in both the sender card and the detail bottom sheet. The existing standard RELATIONSHIPS picker values are also handled correctly (e.g. G1 picks "Spouse" → G2 also sees "Spouse" since it's symmetric).

### Feature: Received Memories Moved to Memories Screen (Memories by Person)

Removed the standalone "Received" section from `MemoriesScreen.tsx`. G1 senders now appear as person cards in the "💌 Memories by Person" section alongside G2's own outgoing family member cards. Visual differentiation:
- Outgoing cards (G2 recorded for this person): green border, `🔒 N sent` badge
- Received cards (G1 sends to G2): pink/accent border, `📥 N received` badge with 📥 overlay on avatar

When a person card is tapped, the detail modal now shows both directions with sub-section headers when both exist:
- `📤 You recorded for them` — G2's own scheduled memories
- `📥 They sent to you` — G1's delivered memories, each row labeled with 📥 icon

Extended `selectedMemberGroup` type to include optional `receivedDeliveries?: any[]`. The `memories.length === 0` empty-state guard now also checks received groups so the person cards appear even when G2 has no outgoing recordings. Vault for G2 is unchanged (for documents/files as intended).

---

## 2026-05-21 — Fix: G1 Not Appearing in G2's Family Screen

### Root Cause (two bugs)

**Bug 1 — App.tsx `applySession`**
The email-matching/linking code was gated behind:
`if (!profile.onboarding_completed && !profile.onboarding_type)`
SokhaG2 had already completed onboarding as a sender, so this block was skipped entirely. The `family_members` row SokhaG1 created for SokhaG2 still had `recipient_profile_id = NULL`. The `loadSenders()` query `WHERE recipient_profile_id = user.id` returned nothing.

**Bug 2 — RLS**
No SELECT policy existed to let a user read `family_members` rows by their own email when `recipient_profile_id` is still NULL. The existing policies only cover `user_id = auth.uid()` (owner) or `recipient_profile_id = auth.uid()` (already-linked recipient). Without this policy, the email-based lookup in `applySession` also fails for existing users.

### Fixes

**App.tsx**
- Moved the email-linking block OUTSIDE the `!profile.onboarding_completed && !profile.onboarding_type` gate
- Now runs for ALL users on every sign-in (idempotent — filters `recipient_profile_id IS NULL`)
- Changed `limit(1)` to `limit(10)` — a user could be added by multiple G1 senders
- Uses `.in('id', ids)` to link all unlinked rows in one update
- Account_type change (`recipient`/`invited`) still only happens for fresh accounts — kept inside the existing onboarding guard

**supabase/migrations/20250101000028_family_member_email_select.sql** — new migration
- Adds `SELECT USING (email = auth.email())` policy on `family_members`
- Allows any authenticated user to read rows where their own email is stored
- Safe: exact email match — users cannot read other people's rows
- Consistent with migration 023's UPDATE policy which already uses `email = auth.email()`

### Deploy Required
Run migration 028 in Supabase SQL Editor, then sign out and back in on SokhaG2 to trigger the new `applySession` linking logic.

---

## 2026-05-21 — G1 Appears in G2's Family Screen (Connected with section)

### Context
SokhaG2 (sokhaeang@gmail.com) has full MainTabs access. When they opened Family, the screen queried only `family_members WHERE user_id = user.id` — their own list, which was empty. SokhaG1 (sokha@reeltors.ca) who invited them never appeared.

### Changes Made

**screens/FamilyScreen.tsx**
- Added `senders` state: `{ familyMemberId, senderName, relationshipLabel, avatarStoragePath }`
- Added `senderPhotoUrls` state: map of familyMemberId → resolved signed URL for G1's profile photo
- Added `loadSenders()`: queries `family_members WHERE recipient_profile_id = user.id`, then fetches G1 names + `avatar_url` from `profiles`, then resolves avatar signed URLs from the `memories` bucket
- Called `loadSenders()` in `useEffect` alongside existing loads
- **Removed** the incorrect separate "People preserving memories for you" stats section from a previous attempt
- **Fixed empty-state condition**: changed `members.length === 0` to `members.length === 0 && senders.length === 0` — so G2 users with senders but no own members see their connected card, not the empty state
- Added **"Connected with"** section at the top of the list: uses the existing `MemberAvatar` component (fillHeight portrait style), shows G1's name, relationship label, and a "💜 Preserving memories for you" badge. Read-only — no edit/delete buttons
- Wrapped the Trusted Contact banner and member list sections in `{members.length > 0 && (...)}` so they only appear when the user has added their own family members

### Behaviour
- Fresh SokhaG2 account: sees SokhaG1's card immediately in the "Connected with" section with name + relationship label + photo (if G1 has set one)
- Works for both newly linked accounts and accounts that were already linked
- If G2 also has their own family members, the "Connected with" section appears above their own list

---

## 2026-05-21 — G2 Senders Section Added to Main FamilyScreen

### Context
G2 users with full app access (MainTabs) were opening Family and seeing only their own (empty) family list. The RecipientFamilyScreen built earlier targets the stripped-down RecipientTabs flow — the fix needed to be in FamilyScreen.tsx itself.

### Changes Made

**screens/FamilyScreen.tsx**
- Added `senders` state (array of `{ familyMemberId, senderName, relationshipLabel, memoriesDelivered, lastDeliveredAt }`)
- Added `loadSenders()` — three-query pattern: (1) `family_members WHERE recipient_profile_id = user.id`, (2) `profiles` lookup for sender names, (3) `scheduled_deliveries` aggregation for count + last delivery date
- Called `loadSenders()` in `useEffect` alongside existing `loadMembers()` and `loadUserData()`
- Injected **"💜 People preserving memories for you"** section between the page header and the Add button — only renders when `senders.length > 0`
- Each sender card: colour-coded avatar with initials, sender name, relationship badge (if set), amber memory count + last delivery date in a row

### Result
When sokhaeang@gmail.com (G2) opens Family, they now see Sokha@reeltors.ca with their relationship label, how many memories have been delivered, and when the last one arrived — all within the existing full-access Family screen they already use.

---

## 2026-05-21 — G2 Family Tab: Recipients Now See Their Senders

### Changes Made

**screens/RecipientFamilyScreen.tsx** — new file
- Brand new screen for account_type = 'recipient' (G2 users)
- Three-step data load: (1) `family_members` WHERE `recipient_profile_id = user.id` → finds G1 rows; (2) `profiles` lookup for G1 display names; (3) `scheduled_deliveries` aggregation for memory count + last delivery date per sender
- Each sender card shows: avatar with initials (color-coded), G1's name, relationship label badge, stats row (memories sent + last arrived date), contextual hint ("Open My Vault to replay" or "First memory is on its way")
- Empty state with instructions for what to tell the G1 sender
- Upgrade banner at top: "Want to send memories too?" → navigates to OnboardingConverted
- Pull-to-refresh support

**App.tsx**
- Added `import RecipientFamilyScreen`
- Added Family tab to `RecipientTabs` between Vault and Profile: `👨‍👩‍👧 Family`
- G2 users now have 3 tabs: My Vault · Family · Profile

### Why It Matters
G2 recipients previously had no visibility into who was sending them memories. The Family tab closes the loop — recipients can see exactly which G1 senders have added them, how many memories they've received, and when the last one arrived. This deepens the emotional connection and gives recipients a reason to log into the app even between deliveries.

---

## 2026-05-20 — Time Capsule Timeline Added to Email & Web Viewer

### Changes Made

**supabase/functions/deliver-time-capsules/index.ts**
- Added `created_at` to the `memories` select query
- Added `recordedDate` parameter to `buildEmailHtml()`
- New "⏳ Time Capsule" block injected into email between greeting and memory card — shows two columns: "📅 Recorded [date]" and "🕊️ Arriving Today [date]" with italic line below: "[Sender] recorded this X years/months/days ago — and kept it waiting just for you."
- Updated footer note to be less redundant (delivery date now shown in the capsule block)

**supabase/functions/get-memory-web/index.ts**
- Added `created_at` to `memories` select
- Added `recorded_date` field to API response so the web viewer can consume it

**landing/memory.html**
- Added CSS styles for `.time-capsule`, `.tc-row`, `.tc-col`, `.tc-icon`, `.tc-head`, `.tc-date`, `.tc-footer`
- Added `#time-capsule-block` HTML block inside `.memory-header` (hidden by default, shown only when `recorded_date` is present)
- Added `timeGapLabel(fromStr, toStr)` JS helper — computes human-readable gap (e.g. "2 years", "3 months", "5 days")
- `loadMemory()` now populates the Time Capsule block when `m.recorded_date` is returned by the API

### Next Steps
- Deploy both edge functions (`deliver-time-capsules`, `get-memory-web`) to Supabase
- Send a test delivery to verify email layout and web viewer display
- Note: memories created before this change won't have a meaningful `created_at` gap unless they were recorded well in the past

---

## 2026-05-20 — First End-to-End Delivery Confirmed ✅

### Changes Made

**screens/MemoriesScreen.tsx**
- `defaultScheduleDate()` changed to return today's date (was tomorrow) to allow same-day delivery for testing. Comment added to revert before production launch.
- Fixed date validation in `handleSaveAndSchedule()` and `saveScheduledDelivery()` — changed `picked <= today` to `picked < today` so today's date is accepted. Error message updated to "Please choose today or a future date."

**screens/SettingsScreen.tsx**
- Added **🧪 Testing** section above Sign Out with a **📬 Send Now** button that manually triggers the `deliver-time-capsules` edge function.
- Added 15-second timeout on the function invoke so the button never hangs indefinitely.
- Result message shows ✅ count, 📭 no deliveries, or ⚠️ error.

**supabase/functions/get-memory-web/index.ts**
- Deployed for the first time — was in codebase but never deployed to Supabase.
- Fixed `profiles` join: `scheduled_deliveries` has no direct FK to `profiles`, so separated into a second query.
- Fixed column name: `media_url` → `file_path` (memories table uses `file_path`).
- Fixed column name: `personal_note` → `message` (scheduled_deliveries uses `message`).
- JWT verification disabled (public endpoint — no login required for recipients).

**supabase/functions/deliver-time-capsules/index.ts**
- JWT verification disabled for testing (allows app to invoke without service role key).

**JOURNAL.md** — created (this file). Auto-update rule saved to memory.

### Issues Resolved
- "Please send a future date" error blocking same-day scheduling → fixed date validation
- Settings Send Now button hanging indefinitely → added timeout + `finally` block
- `get-memory-web` returning "Memory not found" → fixed three column/join mismatches
- JWT auth blocking public web viewer → disabled JWT on both edge functions

### Milestone 🎉
**First memory scheduled and received via email end-to-end. Concept fully proven.**

### Pending Before Production
- Re-enable JWT on `deliver-time-capsules` (should only be called by pg_cron)
- Change `defaultScheduleDate()` back to tomorrow
- Change date validation back to `picked <= today`
- Remove or hide the 🧪 Testing section from Settings

---

## 2026-05-19 — Investor Deck, GitHub Push, Partner Revenue Model

### Changes Made

**Investor Pitch Deck (PPTX)**
- Updated pricing (removed $79/$199 tiers — only $49/$149 plans now)
- Added partner referral revenue flow model on new slide
- VC re-evaluation run: significantly improved attractiveness score with partner revenue included

**landing/partners.html**
- Language refinements: "$300 flat fee for 6 months" → "standard referral % for your industry after trial"
- A Team feedback incorporated; partner positioning approved

**GitHub**
- Remote added: `https://github.com/sokhaeang-coder/Solacelife.git`
- Full codebase pushed for the first time

### Issues Resolved
- `netlify deploy` "Service Temporarily Unavailable" → waited for Netlify recovery
- `git push` password prompt not accepting keystrokes → used Personal Access Token embedded in remote URL

### Milestone
- Code on GitHub for the first time — version control established

---

## 2026-05-19 — Video Playback Fixed + Voice-to-Text Attempt

### Changes Made

**screens/MemoriesScreen.tsx**
- Fixed video playback: removed key-based remount approach that caused iOS modal layer issues. Replaced with persistent `VideoPlayerModal` using `useVideoPlayer(null)` + `player.replaceAsync()`.
- Fixed video upload corruption: switched from `fetch().blob()` to `FileSystem.uploadAsync` with `createSignedUploadUrl`.
- Fixed video cache download on iOS: downloads full file to `FileSystem.cacheDirectory` before playback (Supabase CDN can't stream `.mov` — moov atom at end of file).
- Added `videoOpeningRef` guard to prevent double-tap hanging.
- Removed `expo-speech-recognition` (incompatible with Expo Go — requires native build).
- Replaced voice-to-text with keyboard dictation tip card.

**app.json**
- Added `NSSpeechRecognitionUsageDescription` to iOS info plist.
- Added `android.permission.INTERNET` to Android permissions.

### Issues Resolved
- `-11829 AVErrorMediaDamaged` on video playback → corrupted upload fixed with `FileSystem.uploadAsync`
- Slash through play icon on streaming → fixed with local cache download
- Audio plays but no video container visible → fixed by removing key-based modal remount
- Memories page hanging after second video open → fixed with `videoOpeningRef` guard
- `Cannot find native module 'ExpoSpeechRecognition'` → removed package, replaced with UI tip

---

## 2026-05-18 — Landing Page Refresh, Emergency Email, Partner Page, IP Research

### Changes Made

**supabase/functions/send-emergency-contact-email/index.ts** — new
- When a family member is marked as emergency contact, they receive an email notification immediately

**landing/index.html**
- AI avatar language removed (pivoting away from AI-forward messaging for now)
- Fresh messaging focused on legacy memories

**landing/partners.html** — created
- Referral partner landing page: "we send YOU business" positioning
- Rotating chat examples: financial planner, realtor, estate lawyer, retirement home
- iPhone mockup embedded; partner revenue model explained

**screens/SettingsScreen.tsx**
- Professional Services moved to a button opening a modal
- Sign-out repositioned higher

**screens/onboarding/OnboardingOccasionsScreen.tsx**
- Occasion suggestions auto-trigger when family member is added

**screens/FamilyScreen.tsx**
- "Child" default relationship removed
- Red badge on emergency contact profile picture removed

**supabase/migrations/20250101000026_occasion_suggestions_toggle.sql** — new

### Issues Resolved
- Emergency email not sending initially → Supabase function deployed and triggered manually via `curl`
- `netlify deploy --prod` from wrong directory → fixed

### Milestones
- Emergency contact email notification system live and tested
- Partner/referral landing page built and deployed
- IP protection plan developed (provisional patent applications drafted, prior art search completed, patent lawyer meeting checklist created)
- Emergency email received in real inbox — confirmed live

---

## 2026-05-17 — Pricing Simplified, Recipient Flow, Full E2E Test

### Changes Made

**Pricing**
- Simplified from 3-tier ($9.99/$14.99/$24.99 monthly + annual) to 2 annual plans: Standard $49/yr, Legacy $149/yr
- Same price in USD and CAD

**screens/onboarding/OnboardingInvitedScreen.tsx** — new
- Auto-detected flow: when an invited recipient signs up, they go through a simplified onboarding, not the full sender onboarding

**lib/AuthContext.ts** — new
- Context provider for auth state and account type throughout the app

**supabase/migrations/20250101000021_recipient_link.sql** — new
- `recipient_profile_id` column on `family_members`

**supabase/migrations/20250101000022_relationship_label.sql** — new
**supabase/migrations/20250101000023_fix_family_rls.sql** — new
**supabase/migrations/20250101000024_ai_avatar_interest.sql** — new
**supabase/migrations/20250101000025_ai_avatar_interest_nullable.sql** — new

**screens/onboarding/* ** — all screens updated to WARM colors

**CLAUDE.md** — updated with account types (sender/recipient/both) and navigation structure

### Issues Resolved
- Migration files skipped due to wrong naming pattern → renamed to `YYYYMMDDHHMMSS` format
- "Database error saving new user" for invited recipient signup → `handle_new_user` trigger updated with `account_type` and `onboarding_type` defaults
- `user_occasions` relation does not exist → fixed with migration
- `supabase link` ran from wrong directory → fixed

### Milestone
- Full G1 sender → G2 invited recipient flow tested end-to-end and working
- Memory delivery to email confirmed (via `curl` test)
- Pricing simplified; OnboardingRoleScreen retired

---

## 2026-05-16 — Recipient Flow, WARM Colors, Xcode, Import Contacts, Emergency Contact

### Changes Made

**lib/constants.ts** — SKY/WARM/WM token system established
- `SKY`: main tab screen backgrounds
- `WARM`: all modals, onboarding, overlays, bottom sheets
- `WM`: token map for warm palette (title, sub, cardBg, accent, etc.)

**CLAUDE.md** — created for first time
- Documents color scheme rules, navigation structure, account types, DB project reference
- Will be loaded at the start of every AI-assisted session

**screens/onboarding/OnboardingInvitedScreen.tsx** — new
**screens/RecipientHomeScreen.tsx** — new
**supabase/functions/send-family-invite/index.ts** — new

**screens/FamilyScreen.tsx**
- Import contacts from phone address book (native `expo-contacts`)
- Full-screen contact picker built
- Phone format: `1-604-555-0123`

**supabase/migrations/20250101000017_web_access_tokens.sql** — new
- `web_access_token UUID DEFAULT gen_random_uuid()` added to `scheduled_deliveries`
- `web_view_count INTEGER DEFAULT 0` added to `scheduled_deliveries`

**supabase/functions/get-memory-web/index.ts** — new (not yet deployed until May 20)
**landing/memory.html** — new web memory viewer

### Issues Resolved
- App blank after recipient onboarding added → fixed
- `Unable to resolve "../lib/constants"` → fixed
- `sudo xcode-select: error: invalid developer directory` → Xcode found in `~/Downloads`
- DNS propagation delays for `solacelife.ca` (GoDaddy → Netlify nameservers)
- `confirm.html` 404 on `solacelife.ca` → Netlify redirect rules fixed
- `Error: EACCES: permission denied` on npm/netlify → fixed with `sudo chown`

### Milestones
- Recipient onboarding flow implemented
- WARM gradient color system fully established as design standard
- `CLAUDE.md` written — project's master instruction file
- `solacelife.ca` domain live (GoDaddy → Netlify, 4 nameservers added)
- Import contacts feature working
- Emergency contact lock screen concept designed

---

## 2026-05-15 — Family Profiles, Calendar, Landing Page, Jordan Park Joins A Team

### Changes Made

**components/CalendarPicker.tsx** — new
- Custom tap calendar replacing painful scroll-wheel date picker
- Anniversary dates: month/day auto-populate for current or next year

**screens/HomeScreen.tsx**
- Onboarding nudge prompts added ("Who are you thinking about right now?")
- User profile picture replaces leaf icon

**screens/FamilyScreen.tsx**
- Family member profile pictures fixed (iOS signed URL issue resolved)
- Alphabetical sorting

**screens/onboarding/OnboardingOccasionsScreen.tsx** — new

**supabase/migrations/20250101000011_family_member_photos.sql** — new
**supabase/migrations/20250101000012_user_occasions.sql** — new
**supabase/migrations/20250101000013/14/15** — storage, avatar, profiles RLS fixes

**landing/index.html** — new
- Built and deployed to Netlify (`solacelife.netlify.app`)
- Hero: field of grass with sunrise/sunset sky gradient (lighter violet tones)

**auto-patch skill** — installed
- Claude auto-finds and updates placeholder values, credentials, links across project files

**A Team** — Jordan Park joins as 10th member
- App store / MVP deployment expert; ASO, pricing strategy

**06_Strategy/Solace_90Day_Roadmap.md** — new
**06_Strategy/Legal/Solace_NDA_NonCompete.md** — new

### Issues Resolved
- `HomeScreen.tsx` SyntaxError: Unexpected token → fixed
- Profile pictures not sticking on iOS (signed URL expiry) → resolved with fresh public URLs
- Calendar blown out on web → fixed
- `StorageApiError: new row violates row-level security policy` (avatar upload) → fixed
- EAS init: `npm error could not determine executable to run` → fixed

### Milestones
- Custom CalendarPicker built and deployed
- Landing page live at `solacelife.netlify.app`
- Jordan Park joined A Team (completing the 10-person advisory board)
- 90-day roadmap drafted
- EAS project registered on expo.dev (`@sokhaeang/Solace-Life`)

---

## 2026-05-14 — "The Event" Language, Encryption, AI Avatar, Premortem, A Team Created

### Changes Made

**Terminology change — "death" → "the event" / "post-event"**
- All code, copy, and UI language updated
- `event_trigger` replaces `death_trigger` throughout

**lib/encryption.ts** — new
- AES-256-GCM encryption implemented for Vault items

**screens/AvatarScreen.tsx** — new
- AI avatar chat screen; OpenAI API wired up
- One-way chat interface (avatar responds, user asks)

**supabase/functions/chat-with-avatar/index.ts** — new
**supabase/migrations/007_avatar.sql** — new

**screens/TimeCapsuleScreen.tsx** — new

**supabase/functions/process-checkins/index.ts** — new
**supabase/functions/confirm-event/index.ts** — new
**supabase/migrations/005_death_trigger.sql** (renamed to event trigger) — new
**supabase/migrations/006_checkin_cron.sql** — new

**lib/currency.ts** — new
- USD for US customers / CAD for Canadian customers

**06_Strategy/Legal/Terms_of_Service_DRAFT.md** — new
**06_Strategy/Legal/Privacy_Policy_DRAFT.md** — new
**06_Strategy/ATeam_Pricing_Model_v3_Recommendation.md** — new

**A Team** — fictional advisory board created (9 members)
- Coder, designer, analyst, market researcher, co-founder, 4 domain specialists

**PDF formatting rule** → saved to memory: black/blue text on white backgrounds only; expand all acronyms on first use

### Issues Resolved
- App stuck on heart logo / white screen (Stripe integration broke bundler) → fixed by reverting imports
- `check_ins_select` policy already exists → added `IF NOT EXISTS`
- OpenAI API key → user created OpenAI account
- Memory playback `AVFoundation -11850` error (CORS/signed URL) → partial fix
- Web chat box not visible → fixed; iOS chat bubbles empty → partially fixed
- Stripe checkout flow debugging → worked after fixing key configuration

### Milestones
- "The event" convention established — sets professional tone for sensitive subject matter
- Premortem analysis completed; VC board pivoted strategy → **time capsule becomes the hero feature**
- A Team created (advisory board concept)
- AES-256-GCM encryption live in Vault
- Stripe checkout confirmed working ("yes it works!")
- Pricing v3 with USD/CAD dual-currency strategy locked

---

## 2026-05-13 — Core Features Built: Voice Memo, Time Capsule, Stripe, Vault

### Changes Made

**screens/MemoriesScreen.tsx** — new (major)
- Voice memo record + playback
- Time capsule scheduling (schedule a memory for a specific family member on a specific date)
- Time capsule uniqueness rule: once scheduled for a person, the memory cannot be rescheduled for someone else

**supabase/functions/deliver-time-capsules/index.ts** — new
**supabase/functions/deliver-time-capsules/cron.sql** — new
- Daily pg_cron job at 9:00 AM UTC
- Sends Resend email to recipient with memory details
- Marks delivery as `delivered` after sending

**supabase/functions/create-checkout-session/index.ts** — new
**supabase/functions/stripe-webhook/index.ts** — new
**supabase/migrations/004_stripe_subscription.sql** — new

**Stripe price IDs configured:**
- Keeper $9.99/mo → `price_1TWknU0kqsSV0uKujp81Ap1r`
- Keeper $99.99/yr → `price_1TWkpX0kqsSV0uKuwzO8q7BQ`
- Guardian $14.99/mo → `price_1TWkrQ0kqsSV0uKuGLMuPD9Y`
- Guardian $149.99/yr → `price_1TWks10kqsSV0uKulQQhfN0t`
- Legacy $24.99/mo → `price_1TWkuA0kqsSV0uKu80mptt4Y`
- Legacy $249.99/yr → `price_1TWkuA0kqsSV0uKuChyD4N8b`

**Resend API key:** `re_WzmN9x7k_GEujepFAd9GWhzNQxNMAponT`

**screens/VaultScreen.tsx** — initial build
- Password vault with vault items and categories
- Pencil/trash icons for edit/delete (replaced dot menu)

**Code edit rule** → saved to memory: when code needs updates, Claude rewrites entire files — never asks user to find/replace

**senior-friendly-icons skill** — installed and first eval run

### Issues Resolved
- `scheduled_deliveries` ↔ `profiles` schema cache error → fixed
- "Missing authorization header" on `curl` commands → fixed
- Stripe webhook "add endpoint" not visible in test sandbox → user navigated to correct section
- Navigation post-login not working → fixed (navigator stack issue)
- Video recorder opening Finder window instead → fixed

### Milestones
- Voice memo feature complete
- Time capsule scheduling fully working
- Stripe subscriptions wired up with real price IDs
- Email delivery via Resend configured
- Senior-friendly icons skill live

---

## 2026-05-12 — VC Analysis, MVP Planning, First Code, Supabase Setup

### Changes Made

**First Expo/React Native app initialized**
- Welcome screen, Sign In, Sign Up screens built
- Rose-gold gradient color scheme established
- Back button fix, registration page hang fix

**Supabase project created**
- Project: "Solace Life" — ref: `yfthwahxahjabfbuntys`
- First schema tables created
- Auth configured (email signups enabled)

**supabase/schema.sql** — new
**App.tsx** — navigation wiring (initial)

**06_Strategy/ folder structure created:**
- VC analysis document
- Funding guide PDF
- MVP spec PDF
- `Solace_Project_Journal.md` (first informal journal)

**Journal-keeper skill** — first version installed

### Issues Resolved
- VC analysis PDF was corrupt → regenerated
- Register page hanging → fixed
- "Invalid API key" on registration → fixed with correct Supabase anon key
- "Email signups are disabled" → enabled in Supabase Auth settings

### Milestones
- First successful user account registration on the app
- Supabase project live and linked
- React Native/Expo app running on simulator

---

## 2026-05-09 — Video Script Exploration

**What was explored:**
- Luma.ai video generation — prompt scripts formatted for Luma.ai
- Explored Claude's connector ecosystem for video generation tools
- No connectors available; prompt scripts created manually

---

## 2026-05-08 — App Concept Designed, Named "Solace", Investor Pitch Created

### What happened:
The full Solace Life concept was articulated for the first time:
- **Core problem:** Legacy data is scattered across devices, social media, and platforms — no unified system
- **Core product:** While alive, users design a personal avatar, do estate/will planning, distribute assets; after passing the avatar can send scheduled memories and one-way messages to family
- **Backstop rule:** No autonomous actions (no sending emails, opening bank accounts) — one-way contact only
- **Time capsule feature:** Scheduled delivery to specific family members for birthdays, graduations, weddings
- **QR code at funerals** concept for physical touchpoints
- **Demographics:** Older adults, seniors; warm rose-gold palette confirmed
- **LiDAR avatar** concept for true likeness

**The app was named: "Solace"** ✨

### Documents created:
- Idea Disclosure Document v1/v2/v3 (PDF)
- Investor pitch deck (PowerPoint)
- App navigation flow diagram
- Cloud storage cost simulation model
- Marketing video production scripts
- Zeely.ai and Luma.ai prompt scripts

---

## 2026-05-07 — Idea Inception and First Legal Consultation

### What happened:
- Session opened as a trademark/patent law firm consultation: "it is our first meeting, walk me through the steps"
- Confirmed confidentiality of the session
- First description of the idea: "a tool for people to get comfort and relief"
- Acknowledged no one had been told yet (wife and sister Lisa were the first planned recipients)
- Revealed the origin: "I was using AI for work and it dawned on me that AI can be used in other fashion"
- Requested an NDA be drafted while the consultation continued
- Decided to document the idea formally before disclosing to anyone

### Documents created:
- `Consultation_Notes.md` — initial IP consultation notes
- NDA draft
- Idea Disclosure Document (first draft)

### Milestone 🌱
**This is Day 1. The idea that would become Solace Life was first articulated.**

---

## Statistics Summary

| Date | Key Theme | Milestone |
|---|---|---|
| May 7 | Idea inception, IP consultation | Day 1 — idea first articulated |
| May 8 | Concept design, app named | App named "Solace", investor pitch created |
| May 9 | Video script exploration | — |
| May 12 | VC analysis, first code | First user registration, Supabase live |
| May 13 | Core features | Voice memo, time capsule, Stripe wired |
| May 14 | Event language, encryption | Time capsule declared hero feature |
| May 15 | Family, calendar, landing page | solacelife.netlify.app live, Jordan Park joins |
| May 16 | Recipient flow, WARM colors | CLAUDE.md written, solacelife.ca domain live |
| May 17 | Pricing simplified, E2E test | G1→G2 full flow working |
| May 18 | Emergency email, partner page | Emergency email confirmed in inbox |
| May 19 | GitHub push, investor deck | Code on GitHub for first time |
| May 20 | Video fix, delivery tested | **First memory delivered end-to-end** ✅ |
