// ═══════════════════════════════════════════════════════════════
//  SOLACE LIFE — Edge Function: send-occasion-nudge
//
//  Runs daily at 10:00 AM UTC (see cron.sql).
//  For every user who has push notifications enabled, it checks
//  whether any of their chosen occasions fall within the next
//  7 days and sends a warm reminder via the Expo Push API.
// ═══════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ── Occasion calendar ────────────────────────────────────────
//  Each entry maps a key (stored in user_occasions) to a human-
//  readable label and its annual MM-DD date string.  For occasions
//  whose date shifts each year (Easter, Eid, Diwali, etc.) we
//  use a best-effort fixed date; update annually or swap in a
//  proper lunar-calendar library for production.

interface OccasionEntry {
  label: string
  emoji: string
  /** 'MM-DD' — compared against current year */
  date: string
}

const OCCASION_CALENDAR: Record<string, OccasionEntry> = {
  christmas:       { label: "Christmas",        emoji: "🎄", date: "12-25" },
  mothers_day:     { label: "Mother's Day",     emoji: "💐", date: "05-11" }, // 2nd Sun May (approx)
  fathers_day:     { label: "Father's Day",     emoji: "👔", date: "06-15" }, // 3rd Sun Jun (approx)
  eid:             { label: "Eid al-Adha",      emoji: "🌙", date: "06-07" }, // shifts yearly
  diwali:          { label: "Diwali",           emoji: "🪔", date: "10-20" }, // shifts yearly
  easter:          { label: "Easter",           emoji: "🐣", date: "04-20" }, // shifts yearly
  hanukkah:        { label: "Hanukkah",         emoji: "🕎", date: "12-14" }, // shifts yearly
  thanksgiving:    { label: "Thanksgiving",     emoji: "🦃", date: "11-27" }, // 4th Thu Nov (approx)
  new_year:        { label: "New Year's Day",   emoji: "🎆", date: "01-01" },
  lunar_new_year:  { label: "Lunar New Year",   emoji: "🧧", date: "01-29" }, // shifts yearly
  valentines:      { label: "Valentine's Day",  emoji: "💝", date: "02-14" },
  vesak:           { label: "Vesak",            emoji: "☸️",  date: "05-12" }, // shifts yearly
  nowruz:          { label: "Nowruz",           emoji: "🌸", date: "03-20" },
  raksha_bandhan:  { label: "Raksha Bandhan",   emoji: "🧣", date: "08-09" }, // shifts yearly
  obon:            { label: "Obon",             emoji: "🏮", date: "08-13" },
  rosh_hashanah:   { label: "Rosh Hashanah",    emoji: "🍎", date: "09-22" }, // shifts yearly
  yom_kippur:      { label: "Yom Kippur",       emoji: "✡️",  date: "10-01" }, // shifts yearly
  sukkot:          { label: "Sukkot",           emoji: "🌿", date: "10-06" }, // shifts yearly
  baisakhi:        { label: "Baisakhi",         emoji: "🌾", date: "04-14" },
  lohri:           { label: "Lohri",            emoji: "🔥", date: "01-13" },
  pongal:          { label: "Pongal",           emoji: "🍚", date: "01-14" },
  navratri:        { label: "Navratri",         emoji: "🎉", date: "10-02" }, // shifts yearly
  dussehra:        { label: "Dussehra",         emoji: "🏹", date: "10-12" }, // shifts yearly
  kwanzaa:         { label: "Kwanzaa",          emoji: "🕯️",  date: "12-26" },
  midsummer:       { label: "Midsummer",        emoji: "☀️",  date: "06-21" },
}

// ── Helpers ──────────────────────────────────────────────────

/**
 * Returns the number of days until an occasion this year (or next year
 * if the occasion has already passed).  Returns null if the key is unknown.
 */
function daysUntil(occasionKey: string): number | null {
  const entry = OCCASION_CALENDAR[occasionKey]
  if (!entry) return null

  const now = new Date()
  const year = now.getFullYear()
  const [month, day] = entry.date.split('-').map(Number)

  let target = new Date(year, month - 1, day)
  // If it already passed this year, check next year
  if (target < now) {
    target = new Date(year + 1, month - 1, day)
  }

  const msPerDay = 1000 * 60 * 60 * 24
  return Math.ceil((target.getTime() - now.getTime()) / msPerDay)
}

/**
 * Sends a batch of push messages via the Expo Push API.
 * Expo accepts up to 100 messages per request; we send one at a time
 * here for simplicity (MVP scale).
 */
async function sendExpoPush(token: string, title: string, body: string): Promise<void> {
  const response = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      to: token,
      title,
      body,
      sound: 'default',
      priority: 'normal',
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    console.error(`Expo push failed for token ${token}:`, text)
  }
}

// ── Main handler ─────────────────────────────────────────────

Deno.serve(async (_req) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Fetch all users with a valid push token who haven't opted out
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, push_token')
      .eq('push_notifications_enabled', true)
      .not('push_token', 'is', null)

    if (profilesError) throw profilesError
    if (!profiles || profiles.length === 0) {
      return new Response(JSON.stringify({ sent: 0, message: 'No eligible users' }), { status: 200 })
    }

    let sent = 0
    let skipped = 0

    for (const profile of profiles) {
      // Fetch this user's selected occasion keys
      const { data: occasions, error: occError } = await supabase
        .from('user_occasions')
        .select('occasion_key')
        .eq('user_id', profile.id)

      if (occError) {
        console.error(`Failed to fetch occasions for user ${profile.id}:`, occError.message)
        skipped++
        continue
      }

      if (!occasions || occasions.length === 0) {
        skipped++
        continue
      }

      // Find the first occasion coming up within the next 7 days
      let nudgeSent = false
      for (const { occasion_key } of occasions) {
        const days = daysUntil(occasion_key)
        if (days === null || days > 7 || days < 0) continue

        const entry = OCCASION_CALENDAR[occasion_key]
        const daysLabel = days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`
        const title = `${entry.label} is ${daysLabel} ${entry.emoji}`
        const body = 'Is there a message waiting to be sent? Your loved ones would love to hear from you.'

        await sendExpoPush(profile.push_token!, title, body)
        console.log(`Sent occasion nudge to user ${profile.id} for ${occasion_key} (${days} days away)`)
        sent++
        nudgeSent = true
        break // one nudge per user per day is enough
      }

      if (!nudgeSent) skipped++
    }

    const result = { sent, skipped, total: profiles.length }
    console.log('send-occasion-nudge complete:', result)
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('send-occasion-nudge error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
