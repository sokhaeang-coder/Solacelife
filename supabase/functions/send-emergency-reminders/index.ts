// ═══════════════════════════════════════════════════════════════
//  SOLACE LIFE — Emergency Contact Consent Reminder
//
//  Called by Supabase pg_cron (daily at 09:00 UTC).
//  Sends gentle follow-up emails to G2s who haven't responded
//  to an emergency contact request after 7 or 30 days.
//
//  7-day reminder  → sent once, 7 days after the request
//  30-day reminder → sent once, 30 days after the request
//                    (final nudge — no further emails after this)
//
//  Idempotent: uses emergency_consent_reminded_at columns to
//  ensure each reminder fires exactly once.
//
//  POST body: {} (no params — queries all pending rows)
// ═══════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY            = Deno.env.get('RESEND_API_KEY')!
const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const FROM_EMAIL = 'Solace Life <memories@solacelife.ca>'

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const now = new Date()

  // ── Fetch all members still pending consent ───────────────────
  // We also pull the reminder timestamps to decide which wave to send
  const { data: pendingMembers, error } = await supabase
    .from('family_members')
    .select(`
      id, name, email, relationship, user_id,
      emergency_consent_token, emergency_consent_status,
      emergency_consent_requested_at,
      emergency_reminder_7d_sent_at,
      emergency_reminder_30d_sent_at
    `)
    .eq('emergency_consent_status', 'pending')
    .not('email', 'is', null)

  if (error) {
    console.error('Failed to fetch pending members:', error.message)
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  if (!pendingMembers || pendingMembers.length === 0) {
    console.log('No pending emergency consents — nothing to do')
    return new Response(JSON.stringify({ sent: 0 }), { status: 200 })
  }

  let sent7d  = 0
  let sent30d = 0

  for (const member of pendingMembers) {
    const requestedAt = member.emergency_consent_requested_at
      ? new Date(member.emergency_consent_requested_at)
      : null

    if (!requestedAt) continue

    const daysSince = (now.getTime() - requestedAt.getTime()) / (1000 * 60 * 60 * 24)

    // Fetch sender name
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', member.user_id)
      .single()
    const senderName = profile?.full_name || 'Someone who cares about you'

    const acceptUrl  = `https://solacelife.ca/confirm.html?token=${member.emergency_consent_token}&action=accept&type=emergency`
    const declineUrl = `https://solacelife.ca/confirm.html?token=${member.emergency_consent_token}&action=decline&type=emergency`

    // ── 30-day reminder (check first — takes priority over 7d) ──
    if (daysSince >= 30 && !member.emergency_reminder_30d_sent_at) {
      const html = buildReminderEmail({
        senderName,
        recipientName: member.name,
        relationship:  member.relationship,
        wave:          30,
        acceptUrl,
        declineUrl,
      })

      const ok = await sendEmail({
        to:      member.email,
        subject: `A gentle reminder — ${senderName} is hoping to hear from you`,
        html,
      })

      if (ok) {
        await supabase
          .from('family_members')
          .update({ emergency_reminder_30d_sent_at: now.toISOString() })
          .eq('id', member.id)
        sent30d++
        console.log(`30-day reminder sent → ${member.email}`)
      }
      continue // don't also send 7d on the same run
    }

    // ── 7-day reminder ───────────────────────────────────────────
    if (daysSince >= 7 && !member.emergency_reminder_7d_sent_at) {
      const html = buildReminderEmail({
        senderName,
        recipientName: member.name,
        relationship:  member.relationship,
        wave:          7,
        acceptUrl,
        declineUrl,
      })

      const ok = await sendEmail({
        to:      member.email,
        subject: `Just checking in — ${senderName} is still hoping you'll say yes`,
        html,
      })

      if (ok) {
        await supabase
          .from('family_members')
          .update({ emergency_reminder_7d_sent_at: now.toISOString() })
          .eq('id', member.id)
        sent7d++
        console.log(`7-day reminder sent → ${member.email}`)
      }
    }
  }

  console.log(`Reminders sent — 7d: ${sent7d}, 30d: ${sent30d}`)
  return new Response(
    JSON.stringify({ success: true, sent_7d: sent7d, sent_30d: sent30d }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )
})


// ─── Send via Resend ──────────────────────────────────────────
async function sendEmail({ to, subject, html }: { to: string; subject: string; html: string }) {
  const res = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject, html }),
  })
  if (!res.ok) {
    const err = await res.text()
    console.error(`Resend error for ${to}:`, err)
    return false
  }
  return true
}


// ─── Sunrise shared layout ────────────────────────────────────
function sunriseEmail({ title, headerIcon, headerSubtitle, bodyHtml, footerText }: {
  title: string; headerIcon: string; headerSubtitle: string; bodyHtml: string; footerText: string
}) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#FFF8F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FFF8F5;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
        <tr><td style="background:linear-gradient(160deg,#F06292 0%,#F48A5A 55%,#FFD07A 100%);border-radius:20px 20px 0 0;padding:36px 32px 28px;text-align:center;">
          <p style="margin:0 0 8px;font-size:40px;line-height:1;">${headerIcon}</p>
          <h1 style="margin:0 0 6px;font-size:22px;font-weight:700;color:#fff;letter-spacing:-0.3px;">Solace Life</h1>
          <p style="margin:0;font-size:13px;color:rgba(255,255,255,0.85);">${headerSubtitle}</p>
        </td></tr>
        <tr><td style="background:#fff;border-radius:0 0 20px 20px;padding:32px 32px 28px;border:1px solid #F9D0BB;border-top:none;">
          ${bodyHtml}
        </td></tr>
        <tr><td align="center" style="padding-top:20px;">
          <p style="margin:0 0 4px;font-size:12px;color:#7A3448;opacity:0.7;">
            Sent with love via <a href="https://solacelife.ca" style="color:#F06292;text-decoration:none;font-weight:600;">Solace Life</a>
          </p>
          <p style="margin:0;font-size:11px;color:#7A3448;opacity:0.5;">${footerText}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

// ─── Email HTML template — Sunrise theme ─────────────────────
function buildReminderEmail({
  senderName,
  recipientName,
  relationship,
  wave,
  acceptUrl,
  declineUrl,
}: {
  senderName:    string
  recipientName: string
  relationship:  string
  wave:          7 | 30
  acceptUrl:     string
  declineUrl:    string
}) {
  const bodyText = wave === 7
    ? `A little while ago, ${senderName} asked if you'd be willing to be their emergency contact on Solace Life. No pressure — but if you haven't had a chance to reply yet, the link is still waiting for you.`
    : `${senderName} first reached out a month ago. This is the last gentle reminder — no further emails will be sent. If you'd like to accept, or simply decline quietly, the link below is still active.`

  const noteText = wave === 7
    ? `No rush — take all the time you need.`
    : `Whatever you decide, ${senderName} will not be notified of your choice.`

  return sunriseEmail({
    title: `A gentle reminder from ${senderName}`,
    headerIcon: wave === 7 ? '💛' : '🕊️',
    headerSubtitle: wave === 7 ? 'Just a gentle nudge' : 'A final, gentle reminder',
    bodyHtml: `
      <p style="margin:0 0 6px;font-size:13px;color:#7A3448;font-style:italic;">Dear ${recipientName},</p>
      <p style="margin:8px 0 20px;font-size:15px;color:#3D1020;line-height:1.65;">${bodyText}</p>

      <p style="margin:0 0 22px;font-size:14px;color:#7A3448;text-align:center;line-height:1.65;">
        ${noteText}<br>If you decline, ${senderName} will not be notified.
      </p>

      <div style="text-align:center;margin-bottom:10px;">
        <a href="${acceptUrl}"
          style="display:inline-block;background:linear-gradient(135deg,#F06292,#F48A5A);
                  color:#fff;text-decoration:none;font-weight:700;
                  font-size:15px;padding:15px 36px;border-radius:50px;">
          Yes, I'm honoured to ›
        </a>
      </div>
      <div style="text-align:center;margin-bottom:20px;">
        <a href="${declineUrl}"
          style="display:inline-block;background:transparent;color:#7A3448;
                  text-decoration:none;font-weight:500;font-size:13px;
                  padding:10px 28px;border-radius:50px;border:1px solid #F9D0BB;">
          No thank you
        </a>
      </div>

      <p style="margin:0 0 20px;font-size:12px;color:#7A3448;text-align:center;opacity:0.7;">
        Your response is private. ${senderName} will not see whether you accepted or declined.
      </p>

      <div style="border-top:1px solid #F9D0BB;padding-top:18px;text-align:center;">
        <p style="margin:0 0 10px;font-size:13px;color:#7A3448;">Want to record your own memories for the people you love?</p>
        <a href="https://solacelife.ca"
          style="display:inline-block;background:transparent;color:#F06292;
                  text-decoration:none;font-weight:600;font-size:13px;
                  padding:10px 24px;border-radius:50px;border:1px solid #F9C4D4;">
          Explore Solace Life — Free ›
        </a>
      </div>
    `,
    footerText: `You received this because ${senderName} has asked you to be their emergency contact.`,
  })
}
