// ═══════════════════════════════════════════════════════════════
//  SOLACE LIFE — Send Family Invite Edge Function
//
//  Called by FamilyScreen immediately after a new family_member
//  row is inserted. Sends the invited person a warm welcome email
//  explaining who added them and how to access Solace Life free.
//
//  POST body: { family_member_id: string }
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
  try {
    const body = await req.json()
    family_member_id = body.family_member_id
    if (!family_member_id) throw new Error('Missing family_member_id')
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 400 })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // ── Fetch the family member row ───────────────────────────────
  const { data: member, error: memberErr } = await supabase
    .from('family_members')
    .select('id, name, email, relationship, user_id, confirmation_token')
    .eq('id', family_member_id)
    .single()

  if (memberErr || !member) {
    console.error('Family member not found:', memberErr?.message)
    return new Response(JSON.stringify({ error: 'Family member not found' }), { status: 404 })
  }

  // ── Fetch the sender's profile ────────────────────────────────
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', member.user_id)
    .single()

  const senderName    = profile?.full_name || 'Someone who loves you'
  const recipientName = member.name
  const recipientEmail = member.email

  if (!recipientEmail) {
    return new Response(JSON.stringify({ error: 'No email on family member' }), { status: 400 })
  }

  // Accept / Decline URLs — G2 must actively consent before any memories fire
  const acceptUrl  = `https://solacelife.ca/confirm.html?token=${member.confirmation_token}&action=accept`
  const declineUrl = `https://solacelife.ca/confirm.html?token=${member.confirmation_token}&action=decline`

  // ── Send the invite email via Resend ──────────────────────────
  const emailPayload = {
    from:    FROM_EMAIL,
    to:      [recipientEmail],
    subject: `💌 ${senderName} has added you to their Solace Life`,
    html:    buildInviteEmail({ senderName, recipientName, relationship: member.relationship, acceptUrl, declineUrl }),
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

  console.log(`Invite sent → ${recipientEmail}`)
  return new Response(
    JSON.stringify({ success: true, to: recipientEmail }),
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
<body style="margin:0;padding:0;background-color:#FFF8F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FFF8F5;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

        <!-- Gradient header -->
        <tr><td style="background:linear-gradient(160deg,#F06292 0%,#F48A5A 55%,#FFD07A 100%);border-radius:20px 20px 0 0;padding:36px 32px 28px;text-align:center;">
          <p style="margin:0 0 8px;font-size:40px;line-height:1;">${headerIcon}</p>
          <h1 style="margin:0 0 6px;font-size:22px;font-weight:700;color:#fff;letter-spacing:-0.3px;">Solace Life</h1>
          <p style="margin:0;font-size:13px;color:rgba(255,255,255,0.85);">${headerSubtitle}</p>
        </td></tr>

        <!-- White card body -->
        <tr><td style="background:#fff;border-radius:0 0 20px 20px;padding:32px 32px 28px;border:1px solid #F9D0BB;border-top:none;">
          ${bodyHtml}
        </td></tr>

        <!-- Footer -->
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
function buildInviteEmail({
  senderName,
  recipientName,
  relationship,
  acceptUrl,
  declineUrl,
}: {
  senderName:    string
  recipientName: string
  relationship:  string
  acceptUrl:     string
  declineUrl:    string
}) {
  const relationshipLine =
    relationship === 'spouse'  ? `your partner, ${senderName},` :
    relationship === 'child'   ? `${senderName},` :
    relationship === 'parent'  ? `${senderName},` :
    relationship === 'sibling' ? `${senderName},` :
                                  `${senderName},`

  return sunriseEmail({
    title: `${senderName} has added you to Solace Life`,
    headerIcon: '💌',
    headerSubtitle: 'Someone who cares about you has something to share',
    bodyHtml: `
      <p style="margin:0 0 6px;font-size:13px;color:#7A3448;font-style:italic;">Dear ${recipientName},</p>
      <p style="margin:8px 0 16px;font-size:15px;color:#3D1020;line-height:1.65;">
        <strong style="color:#F06292;">${relationshipLine}</strong>
        has been saving something just for you — personal letters, voice messages,
        and moments they want you to have.
      </p>

      <div style="background:#FFF0E8;border-radius:14px;padding:18px 20px;border:1px solid #F9D0BB;margin-bottom:20px;">
        <p style="margin:0 0 10px;font-size:14px;color:#3D1020;line-height:1.65;">
          ${senderName} is using Solace Life to send personal messages to the people
          they love most — on birthdays, quiet Tuesdays, or whenever you need it most.
        </p>
        <p style="margin:0;font-size:13px;color:#7A3448;line-height:1.6;">
          Messages arrive by email — right in your browser. No app needed. No subscription required.
        </p>
      </div>

      <p style="margin:0 0 6px;font-size:15px;color:#3D1020;text-align:center;font-weight:600;">
        ${senderName} has something for you. Would you like to receive it?
      </p>
      <p style="margin:0 0 22px;font-size:13px;color:#7A3448;text-align:center;">
        This is entirely your choice. You can change your mind any time.
      </p>

      <div style="text-align:center;margin-bottom:12px;">
        <a href="${acceptUrl}"
          style="display:inline-block;background:linear-gradient(135deg,#F06292,#F48A5A);
                  color:#fff;text-decoration:none;font-weight:700;
                  font-size:16px;padding:16px 40px;border-radius:50px;letter-spacing:0.2px;">
          💌 Yes — I'd love to hear from them
        </a>
      </div>
      <div style="text-align:center;margin-bottom:20px;">
        <a href="${declineUrl}"
          style="display:inline-block;background:transparent;color:#7A3448;
                  text-decoration:none;font-weight:600;font-size:13px;
                  padding:10px 28px;border-radius:50px;border:1px solid #F9D0BB;">
          I'd prefer to stay connected another way
        </a>
      </div>

      <p style="margin:0 0 20px;font-size:12px;color:#7A3448;text-align:center;opacity:0.7;">
        This is just for you — ${senderName} won't know which option you selected.
      </p>

      <div style="border-top:1px solid #F9D0BB;padding-top:18px;text-align:center;">
        <p style="margin:0 0 10px;font-size:13px;color:#7A3448;">Want to keep all your messages in one place?</p>
        <a href="https://solacelife.ca"
          style="display:inline-block;background:transparent;color:#F06292;
                  text-decoration:none;font-weight:600;font-size:14px;
                  padding:10px 24px;border-radius:50px;border:1px solid #F9C4D4;">
          Download Solace Life — Free ›
        </a>
      </div>
    `,
    footerText: `You received this because ${senderName} added you as a family member.`,
  })
}
