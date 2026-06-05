// ═══════════════════════════════════════════════════════════════
//  SOLACE LIFE — Setup Nudges
//
//  One-shot onboarding notifications, per the notification doctrine:
//    • each nudge fires exactly ONCE per user, ever (nudge_log unique)
//    • max one non-safety notification per user per week
//    • runs daily at 17:00 UTC (≈ 9–10 AM Pacific) via pg_cron
//
//  Nudges, in priority order (first applicable, unsent one wins):
//    first_moment    — account ≥2 days old, zero memories recorded
//    first_family    — account ≥3 days old, zero family members
//                      (the auto-added founder contact doesn't count)
//    trusted_contact — account ≥5 days old, has family but nobody
//                      marked as a trusted contact yet
// ═══════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const DAY = 86_400_000

const NUDGES = [
  {
    key: 'first_moment',
    minAgeDays: 2,
    title: '🎙️ Your first moment is waiting',
    body: 'A story, a laugh, a hello — recording takes two minutes, and someone will treasure it forever.',
    applies: async (userId: string): Promise<boolean> => {
      const { count } = await supabase
        .from('memories')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
      return (count ?? 0) === 0
    },
  },
  {
    key: 'first_family',
    minAgeDays: 3,
    title: '👨‍👩‍👧 Your moments need somewhere to go',
    body: 'Add your first family member so your memories have a home waiting for them.',
    applies: async (userId: string): Promise<boolean> => {
      const { count } = await supabase
        .from('family_members')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_founder_contact', false)   // cardboard Sokha doesn't count
      return (count ?? 0) === 0
    },
  },
  {
    key: 'trusted_contact',
    minAgeDays: 5,
    title: '⭐ One more step protects everything',
    body: 'Choose a trusted contact — the person who makes sure your moments reach your family, no matter what.',
    applies: async (userId: string): Promise<boolean> => {
      const { count: familyCount } = await supabase
        .from('family_members')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_founder_contact', false)
      if ((familyCount ?? 0) === 0) return false   // first_family covers this case
      const { count: trustedCount } = await supabase
        .from('family_members')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_trusted_contact', true)
        .eq('is_founder_contact', false)
      return (trustedCount ?? 0) === 0
    },
  },
]

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  // Sender accounts with a registered device, at least 2 days old
  const cutoff = new Date(Date.now() - 2 * DAY).toISOString()
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, created_at, push_token, account_type')
    .not('push_token', 'is', null)
    .in('account_type', ['sender', 'both'])
    .lte('created_at', cutoff)

  if (error) {
    console.error('Profile fetch failed:', error.message)
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  const results: any[] = []

  for (const profile of profiles ?? []) {
    const ageDays = (Date.now() - new Date(profile.created_at).getTime()) / DAY

    // ── Weekly cap: nothing if ANY nudge went out in the last 7 days ──
    const weekAgo = new Date(Date.now() - 7 * DAY).toISOString()
    const { count: recentCount } = await supabase
      .from('nudge_log')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', profile.id)
      .gte('sent_at', weekAgo)
    if ((recentCount ?? 0) > 0) continue

    // ── Already-sent nudges never repeat ──
    const { data: sentRows } = await supabase
      .from('nudge_log')
      .select('nudge_key')
      .eq('user_id', profile.id)
    const sentKeys = new Set((sentRows ?? []).map(r => r.nudge_key))

    // ── First applicable, unsent nudge wins; one per run ──
    for (const nudge of NUDGES) {
      if (sentKeys.has(nudge.key)) continue
      if (ageDays < nudge.minAgeDays) continue
      if (!(await nudge.applies(profile.id))) continue

      // Log BEFORE sending — the unique constraint makes double-sends
      // impossible even if two runs race.
      const { error: logErr } = await supabase
        .from('nudge_log')
        .insert({ user_id: profile.id, nudge_key: nudge.key })
      if (logErr) break   // unique violation = another run got here first

      await sendExpoPush(profile.push_token!, nudge.title, nudge.body)
      console.log(`Nudge ${nudge.key} → user ${profile.id}`)
      results.push({ user: profile.id, nudge: nudge.key })
      break
    }
  }

  return new Response(
    JSON.stringify({ sent: results.length, results }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )
})

// ── Expo push helper ───────────────────────────────────────────
async function sendExpoPush(token: string, title: string, body: string): Promise<void> {
  const response = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ to: token, title, body, sound: 'default' }),
  })
  if (!response.ok) {
    console.error('Expo push failed:', await response.text())
  }
}
