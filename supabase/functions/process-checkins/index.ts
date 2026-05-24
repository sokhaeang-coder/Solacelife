// ═══════════════════════════════════════════════════════════════
//  SOLACE LIFE — Process Check-ins (Daily Cron Job)
//
//  Runs once daily via Supabase pg_cron or manual invocation.
//  For each active user:
//    1. If next_checkin_due is in the future → skip
//    2. If overdue → increment missed_checkins
//    3. If missed_checkins >= checkin_threshold:
//       → set vault_status = 'escalated'
//       → email all trusted contacts requesting event confirmation
//    4. If vault_status = 'active' and overdue by 1 day → send reminder to owner
//
//  Invoke with:
//    curl -X POST https://<ref>.supabase.co/functions/v1/process-checkins \
//      -H "Authorization: Bearer <SERVICE_ROLE_KEY>"
// ═══════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const APP_URL                   = Deno.env.get('APP_URL') ?? 'https://solacelife.app'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  // ── Security: only service-role callers ──────────────────────
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.includes(SUPABASE_SERVICE_ROLE_KEY)) {
    return new Response('Unauthorized', { status: 401 })
  }

  const now = new Date()
  const results = { processed: 0, reminders: 0, escalated: 0, errors: [] as string[] }

  try {
    // ── Fetch all active users past their check-in deadline ────
    const { data: overdueProfiles, error } = await supabase
      .from('profiles')
      .select(`
        id,
        full_name,
        checkin_frequency,
        checkin_threshold,
        next_checkin_due,
        missed_checkins,
        vault_status
      `)
      .in('vault_status', ['active', 'escalated'])
      .lt('next_checkin_due', now.toISOString())
      .not('next_checkin_due', 'is', null)

    if (error) throw error
    if (!overdueProfiles?.length) {
      return json({ message: 'No overdue check-ins.', ...results })
    }

    for (const profile of overdueProfiles) {
      results.processed++
      try {
        const newMissed = (profile.missed_checkins ?? 0) + 1
        const threshold = profile.checkin_threshold ?? 3

        // ── Determine next due date ─────────────────────────
        const days = profile.checkin_frequency === 'weekly'    ? 7
                   : profile.checkin_frequency === 'quarterly' ? 90
                   : 30
        const nextDue = new Date(now.getTime() + days * 86400000).toISOString()

        if (newMissed >= threshold && profile.vault_status === 'active') {
          // ── ESCALATE: notify trusted contacts ────────────────
          await supabase.from('profiles').update({
            missed_checkins:  newMissed,
            next_checkin_due: nextDue,
            vault_status:     'escalated',
          }).eq('id', profile.id)

          const { data: authUser } = await supabase.auth.admin.getUserById(profile.id)
          const ownerEmail = authUser?.user?.email ?? ''

          const { data: trustedContacts } = await supabase
            .from('family_members')
            .select('name, email, relationship')
            .eq('user_id', profile.id)
            .eq('is_trusted_contact', true)

          // Send event confirmation request to each trusted contact
          for (const contact of (trustedContacts ?? [])) {
            if (!contact.email) continue

            // Generate a one-time confirmation token
            const token = crypto.randomUUID()
            await supabase.from('event_confirmations').insert({
              user_id:            profile.id,
              confirmed_by:       contact.email,
              confirmation_token: token,
              token_used:         false,
            })

            const confirmUrl = `${SUPABASE_URL}/functions/v1/confirm-event?token=${token}`
            await sendEmail({
              to:      contact.email,
              subject: `Solace Life: Welfare check — ${profile.full_name ?? 'your loved one'}`,
              html: escalationEmailHtml({
                contactName: contact.name,
                ownerName:   profile.full_name ?? 'your loved one',
                missedCount: newMissed,
                confirmUrl,
              }),
            })

            await supabase.from('checkin_escalations').insert({
              user_id:      profile.id,
              type:         'escalation',
              recipient:    contact.email,
              missed_count: newMissed,
            })
          }

          results.escalated++
          console.log(`Escalated: ${profile.id} (${newMissed} missed check-ins)`)

        } else if (newMissed === 1) {
          // ── FIRST MISS: gentle reminder to owner ─────────────
          await supabase.from('profiles').update({
            missed_checkins:  newMissed,
            next_checkin_due: nextDue,
          }).eq('id', profile.id)

          const { data: authUser } = await supabase.auth.admin.getUserById(profile.id)
          const ownerEmail = authUser?.user?.email ?? ''

          if (ownerEmail) {
            await sendEmail({
              to:      ownerEmail,
              subject: 'Solace Life: Time to check in 💛',
              html: reminderEmailHtml({ ownerName: profile.full_name ?? 'Friend', checkinUrl: APP_URL }),
            })
            await supabase.from('checkin_escalations').insert({
              user_id:      profile.id,
              type:         'reminder',
              recipient:    ownerEmail,
              missed_count: newMissed,
            })
            results.reminders++
          }

        } else {
          // ── SUBSEQUENT MISS: increment only ──────────────────
          await supabase.from('profiles').update({
            missed_checkins:  newMissed,
            next_checkin_due: nextDue,
          }).eq('id', profile.id)
        }

      } catch (profileErr) {
        const msg = `Error processing ${profile.id}: ${profileErr}`
        console.error(msg)
        results.errors.push(msg)
      }
    }

    return json({ message: 'Done.', ...results })

  } catch (err) {
    console.error('process-checkins fatal error:', err)
    return json({ error: String(err) }, 500)
  }
})

// ── Send email ────────────────────────────────────────────────
async function sendEmail({ to, subject, html }: { to: string; subject: string; html: string }) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ to, subject, html }),
  })
  if (!res.ok) {
    console.warn(`Email send failed (${res.status}): ${await res.text()}`)
  }
}

// ── Email templates ───────────────────────────────────────────
function reminderEmailHtml({ ownerName, checkinUrl }: { ownerName: string; checkinUrl: string }) {
  return `
  <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1a1535;padding:32px 24px;background:#f9f7ff;border-radius:16px">
    <h2 style="color:#7B5EA7;margin-bottom:8px">Solace Life 💛</h2>
    <p>Hi ${ownerName},</p>
    <p>It's time for your periodic check-in. Just a quick tap to let Solace know you're well — your family is counting on you.</p>
    <a href="${checkinUrl}" style="display:inline-block;margin:20px 0;padding:14px 32px;background:#7B5EA7;color:#fff;border-radius:12px;text-decoration:none;font-weight:600">
      I'm Here ✓
    </a>
    <p style="color:#9985BB;font-size:13px">Your trusted contacts will be notified if you miss several check-ins in a row.</p>
    <hr style="border:none;border-top:1px solid #e8e0f5;margin:24px 0"/>
    <p style="color:#c0b8d8;font-size:12px">Solace Life — Your legacy, protected.<br>To change your check-in settings, open the app.</p>
  </div>`
}

function escalationEmailHtml({ contactName, ownerName, missedCount, confirmUrl }:
  { contactName: string; ownerName: string; missedCount: number; confirmUrl: string }) {
  return `
  <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1a1535;padding:32px 24px;background:#fff8f8;border-radius:16px;border:1px solid #ffcccc">
    <h2 style="color:#c0392b;margin-bottom:8px">⚠️ Well-Being Check — Solace Life</h2>
    <p>Hi ${contactName},</p>
    <p><strong>${ownerName}</strong> has missed <strong>${missedCount} consecutive check-ins</strong> on Solace Life and listed you as a trusted contact.</p>
    <p>Please reach out to them directly. If the event has occurred, you may confirm below to release their vault to authorized family members.</p>
    <a href="${confirmUrl}" style="display:inline-block;margin:20px 0;padding:14px 32px;background:#c0392b;color:#fff;border-radius:12px;text-decoration:none;font-weight:600">
      Confirm Event & Release Vault
    </a>
    <p style="color:#999;font-size:13px">This link is single-use. If ${ownerName} is well, please ignore this email — they can clear the alert by checking in through the app.</p>
    <hr style="border:none;border-top:1px solid #f0e0e0;margin:24px 0"/>
    <p style="color:#c0b8b8;font-size:12px">Solace Life — Your legacy, protected.</p>
  </div>`
}

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
