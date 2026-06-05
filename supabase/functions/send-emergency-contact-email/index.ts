// ═══════════════════════════════════════════════════════════════
//  SOLACE LIFE — Send Emergency Contact Consent Email
//
//  Called when G1 designates a family member as an emergency
//  contact. Sends a consent-request email — G2 must explicitly
//  accept or decline before the role activates.
//
//  POST body:
//    { family_member_id: string, is_new_member?: boolean }
//
//  is_new_member = true  → person was just added AND designated
//                          at the same time (onboarding flow).
//  is_new_member = false → person already in family circle, now
//                          being asked to be emergency contact.
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

  let family_member_id: string
  let is_new_member = false
  try {
    const body = await req.json()
    family_member_id = body.family_member_id
    is_new_member    = body.is_new_member === true
    if (!family_member_id) throw new Error('Missing family_member_id')
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 400 })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // ── Fetch the family member row (including consent token) ─────
  const { data: member, error: memberErr } = await supabase
    .from('family_members')
    .select('id, name, email, relationship, emergency_priority, user_id, emergency_consent_token')
    .eq('id', family_member_id)
    .single()

  if (memberErr || !member) {
    console.error('Family member not found:', memberErr?.message)
    return new Response(JSON.stringify({ error: 'Family member not found' }), { status: 404 })
  }

  if (!member.email) {
    console.log(`No email for member ${family_member_id} — skipping emergency email`)
    return new Response(JSON.stringify({ skipped: true, reason: 'no_email' }), { status: 200 })
  }

  if (!member.emergency_consent_token) {
    console.error('No emergency_consent_token on member — run migration 040 first')
    return new Response(JSON.stringify({ error: 'No consent token available' }), { status: 500 })
  }

  // ── Fetch the sender's profile ────────────────────────────────
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', member.user_id)
    .single()

  const senderName    = profile?.full_name || 'Someone who cares about you'
  const recipientName = member.name

  // ── Build accept / decline URLs ───────────────────────────────
  const acceptUrl  = `https://solacelife.ca/confirm.html?token=${member.emergency_consent_token}&action=accept&type=emergency`
  const declineUrl = `https://solacelife.ca/confirm.html?token=${member.emergency_consent_token}&action=decline&type=emergency`

  // ── Set status to pending in DB ───────────────────────────────
  await supabase
    .from('family_members')
    .update({
      emergency_consent_status:       'pending',
      emergency_consent_requested_at: new Date().toISOString(),
      // Reset reminder timestamps so resends get fresh 7d/30d reminders
      emergency_reminder_7d_sent_at:  null,
      emergency_reminder_30d_sent_at: null,
    })
    .eq('id', member.id)

  // ── Build and send the email ──────────────────────────────────
  const emailPayload = {
    from:    FROM_EMAIL,
    to:      [member.email],
    subject: `${senderName} would be honoured to have you as their emergency contact`,
    html: buildConsentEmail({
      senderName,
      recipientName,
      relationship: member.relationship,
      isNewMember:  is_new_member,
      acceptUrl,
      declineUrl,
    }),
  }

  const emailRes = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify(emailPayload),
  })

  if (!emailRes.ok) {
    const errText = await emailRes.text()
    console.error('Resend error:', errText)
    return new Response(JSON.stringify({ error: 'Email send failed', detail: errText }), { status: 500 })
  }

  console.log(`Emergency consent email sent → ${member.email}`)
  return new Response(
    JSON.stringify({ success: true, to: member.email }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )
})


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
<body style="margin:0;padding:0;background-color:#FFF8F2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FFF8F2;padding:40px 20px;">
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
          <p style="margin:0 0 4px;font-size:12px;color:#A87A52;opacity:0.85;">
            Sent with love via <a href="https://solacelife.ca" style="color:#F06292;text-decoration:none;font-weight:600;">Solace Life</a>
          </p>
          <p style="margin:0;font-size:11px;color:#A87A52;opacity:0.7;">${footerText}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

// ─── Email HTML template — Sunrise theme ─────────────────────
function buildConsentEmail({
  senderName,
  recipientName,
  relationship,
  isNewMember,
  acceptUrl,
  declineUrl,
}: {
  senderName:    string
  recipientName: string
  relationship:  string
  isNewMember:   boolean
  acceptUrl:     string
  declineUrl:    string
}) {
  const relationshipPhrase =
    relationship === 'Spouse'  ? 'your partner'   :
    relationship === 'Child'   ? 'their child'    :
    relationship === 'Parent'  ? 'their parent'   :
    relationship === 'Sibling' ? 'their sibling'  :
    relationship === 'Friend'  ? 'a close friend' :
                                  'someone they trust'

  const introLine = isNewMember
    ? `${senderName} has added you to their Solace Life family — and is asking you to be their emergency contact.`
    : `${senderName} is asking for your permission to list you as their emergency contact on Solace Life.`

  return sunriseEmail({
    title: `${senderName} is asking you to be their emergency contact`,
    headerIcon: '🛡️',
    headerSubtitle: 'An emergency contact request',
    bodyHtml: `
      <p style="margin:0 0 6px;font-size:13px;color:#6B4A35;font-style:italic;">Dear ${recipientName},</p>
      <p style="margin:8px 0 20px;font-size:15px;color:#4A2418;line-height:1.65;">${introLine}</p>

      <div style="background:#FFF0E8;border-radius:14px;border:1px solid #F9D0BB;padding:18px 20px;margin-bottom:20px;">
        <p style="margin:0 0 14px;font-size:11px;color:#6B4A35;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;">What this means for you</p>
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="padding-bottom:14px;vertical-align:top;width:28px;"><p style="margin:0;font-size:18px;line-height:1;">📱</p></td>
            <td style="padding-bottom:14px;padding-left:12px;vertical-align:top;">
              <p style="margin:0;font-size:14px;color:#4A2418;line-height:1.55;">
                <strong>Your name may appear on their phone's lock screen</strong> — accessible to first responders if there's ever an emergency.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:14px;vertical-align:top;"><p style="margin:0;font-size:18px;line-height:1;">🔐</p></td>
            <td style="padding-bottom:14px;padding-left:12px;vertical-align:top;">
              <p style="margin:0;font-size:14px;color:#4A2418;line-height:1.55;">
                <strong>You may be asked to help release their vault</strong> — the memories and documents ${senderName} has stored for their loved ones.
              </p>
            </td>
          </tr>
          <tr>
            <td style="vertical-align:top;"><p style="margin:0;font-size:18px;line-height:1;">💛</p></td>
            <td style="padding-left:12px;vertical-align:top;">
              <p style="margin:0;font-size:14px;color:#4A2418;line-height:1.55;">
                <strong>It means ${senderName} trusts you completely</strong> — you are ${relationshipPhrase} they want by their side most.
              </p>
            </td>
          </tr>
        </table>
      </div>

      <p style="margin:0 0 22px;font-size:14px;color:#6B4A35;text-align:center;line-height:1.65;">
        You are free to accept or decline — this is entirely your choice.<br>
        If you decline, ${senderName} will not be notified of your decision.
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
          style="display:inline-block;background:transparent;color:#6B4A35;
                  text-decoration:none;font-weight:500;font-size:13px;
                  padding:10px 28px;border-radius:50px;border:1px solid #F9D0BB;">
          No thank you
        </a>
      </div>

      <p style="margin:0 0 20px;font-size:12px;color:#6B4A35;text-align:center;opacity:0.7;">
        Your response is private. ${senderName} will not see whether you accepted or declined.
      </p>

      <div style="border-top:1px solid #F9D0BB;padding-top:18px;text-align:center;">
        <p style="margin:0 0 10px;font-size:13px;color:#6B4A35;">Want to record your own memories for the people you love?</p>
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
