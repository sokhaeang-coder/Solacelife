// ═══════════════════════════════════════════════════════════════
//  SOLACE LIFE — Edge Function: send-checkin-reminder
//
//  Runs every 6 hours (see cron.sql).
//  Finds every active user whose next check-in is due within
//  the next 48 hours and sends them a warm push reminder.
//  Does NOT write any database rows — read-only.
// ═══════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ── Helper: send a single push notification via Expo ─────────

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
      priority: 'high', // check-in reminders are time-sensitive
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

    // Find users whose check-in is due within the next 48 hours.
    // Excludes:
    //  - users who have opted out of push notifications
    //  - users with no push token (simulator / permission denied)
    //  - users whose vault has already been released (no longer active)
    const now = new Date().toISOString()
    const in48h = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()

    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('id, push_token, full_name')
      .eq('push_notifications_enabled', true)
      .not('push_token', 'is', null)
      .neq('vault_status', 'released')
      .gte('next_checkin_due', now)
      .lte('next_checkin_due', in48h)

    if (error) throw error

    if (!profiles || profiles.length === 0) {
      return new Response(
        JSON.stringify({ sent: 0, message: 'No check-ins due in the next 48 hours' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }

    let sent = 0
    let failed = 0

    for (const profile of profiles) {
      const firstName = profile.full_name?.split(' ')[0] || null
      const greeting = firstName ? `Hi ${firstName} ♡` : 'Just checking in ♡'

      try {
        await sendExpoPush(
          profile.push_token!,
          greeting,
          "Tap to let your family know you're well — they'll be relieved to see you.",
        )
        console.log(`Check-in reminder sent to user ${profile.id}`)
        sent++
      } catch (pushErr) {
        console.error(`Failed to send reminder to user ${profile.id}:`, pushErr)
        failed++
      }
    }

    const result = { sent, failed, total: profiles.length }
    console.log('send-checkin-reminder complete:', result)
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('send-checkin-reminder error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
