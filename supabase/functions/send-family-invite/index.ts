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


// ─── Email HTML template ──────────────────────────────────────
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
  // Pick a warm relationship-specific line
  const relationshipLine =
    relationship === 'Spouse'  ? `your partner, ${senderName},` :
    relationship === 'Child'   ? `${senderName},` :
    relationship === 'Parent'  ? `${senderName},` :
    relationship === 'Sibling' ? `${senderName},` :
                                  `${senderName},`

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>${senderName} has added you to Solace Life</title>
</head>
<body style="margin:0;padding:0;background-color:#0E0B1F;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" border="0"
    style="background-color:#0E0B1F;padding:48px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0"
          style="max-width:600px;width:100%;">

          <!-- Brand header -->
          <tr>
            <td align="center" style="padding-bottom:40px;">
              <p style="margin:0 0 10px;font-size:42px;line-height:1;">🕊️</p>
              <h1 style="margin:0;font-size:26px;font-weight:700;color:#EEE8F5;letter-spacing:-0.3px;">
                Solace Life
              </h1>
              <p style="margin:10px 0 0;font-size:14px;color:#7B5EA7;">
                Preserving what matters most
              </p>
            </td>
          </tr>

          <!-- Main card -->
          <tr>
            <td style="background:linear-gradient(160deg,#1A1535 0%,#231848 100%);
                        border-radius:24px;padding:40px 36px;
                        border:1px solid #2A1F4A;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">

                <!-- Greeting -->
                <tr>
                  <td style="padding-bottom:28px;">
                    <p style="margin:0 0 6px;font-size:15px;color:#9985BB;">
                      Dear ${recipientName},
                    </p>
                    <p style="margin:0;font-size:18px;color:#EEE8F5;line-height:1.65;">
                      <strong style="color:#C9A8FF;">${relationshipLine}</strong>
                      has been saving something just for you — personal letters, voice messages,
                      and moments they want you to have.
                    </p>
                  </td>
                </tr>

                <!-- What Solace Life is — warm, present-tense, no death framing -->
                <tr>
                  <td style="padding-bottom:28px;">
                    <div style="background:#0E0B1F;border-radius:16px;padding:26px 24px;
                                border:1px solid #2A1F4A;">
                      <p style="margin:0 0 14px;font-size:15px;color:#C9A8FF;line-height:1.65;">
                        ${senderName} is using Solace Life to send personal messages, letters,
                        and moments to the people they love most — on birthdays, quiet Tuesdays,
                        or whenever you need it most.
                      </p>
                      <p style="margin:0;font-size:14px;color:#9985BB;line-height:1.6;">
                        When a message arrives for you, it'll come by email — right in your browser,
                        no app needed. No subscription, no account required.
                      </p>
                    </div>
                  </td>
                </tr>

                <!-- Consent — framed as a gift, not a death notice -->
                <tr>
                  <td align="center" style="padding-bottom:12px;">
                    <p style="margin:0 0 8px;font-size:15px;color:#EEE8F5;line-height:1.65;text-align:center;">
                      ${senderName} has something for you. Would you like to receive it?
                    </p>
                    <p style="margin:0 0 24px;font-size:13px;color:#7B5EA7;text-align:center;">
                      This is entirely your choice. You can change your mind any time.
                    </p>

                    <!-- Accept button -->
                    <a href="${acceptUrl}"
                      style="display:inline-block;
                              background:linear-gradient(135deg,#F5CEAA 0%,#E8A87C 50%,#C07840 100%);
                              color:#0E0B1F;text-decoration:none;font-weight:700;
                              font-size:17px;padding:18px 48px;border-radius:50px;
                              letter-spacing:0.2px;margin-bottom:14px;">
                      💌 Yes — I'd love to hear from them
                    </a>

                    <br>

                    <!-- Decline button — preference, not rejection -->
                    <a href="${declineUrl}"
                      style="display:inline-block;
                              background:transparent;
                              color:#7B5EA7;text-decoration:none;font-weight:600;
                              font-size:14px;padding:12px 36px;border-radius:50px;
                              border:1px solid #2A1F4A;margin-top:4px;">
                      I'd prefer to stay connected another way
                    </a>

                    <p style="margin:16px 0 0;font-size:12px;color:#4A3D60;text-align:center;">
                      This is just for you — ${senderName} won't know which option you selected.
                    </p>
                  </td>
                </tr>

                <!-- Divider -->
                <tr>
                  <td style="padding:24px 0;">
                    <div style="height:1px;background:linear-gradient(to right,transparent,#2A1F4A,transparent);"></div>
                  </td>
                </tr>

                <!-- CTA -->
                <tr>
                  <td align="center" style="padding-bottom:16px;">
                    <p style="margin:0 0 16px;font-size:14px;color:#7B5EA7;text-align:center;">
                      Want to keep all your messages in one place?
                    </p>
                    <a href="https://solacelife.ca"
                      style="display:inline-block;
                              background:transparent;
                              color:#C9A8FF;text-decoration:none;font-weight:600;
                              font-size:15px;padding:14px 36px;border-radius:50px;
                              border:1px solid #4A3D60;
                              letter-spacing:0.2px;">
                      Download Solace Life — Free ›
                    </a>
                  </td>
                </tr>

                <!-- Reassurance -->
                <tr>
                  <td>
                    <p style="margin:0;font-size:13px;color:#4A3D60;line-height:1.6;
                              text-align:center;">
                      No subscription required. Your vault is free, always.<br>
                      Messages sent to you will arrive automatically by email.
                    </p>
                  </td>
                </tr>

              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding-top:36px;">
              <p style="margin:0 0 6px;font-size:12px;color:#4A3D60;">
                Sent with love via
                <a href="https://solacelife.ca"
                  style="color:#7B5EA7;text-decoration:none;font-weight:600;">
                  Solace Life
                </a>
              </p>
              <p style="margin:0;font-size:11px;color:#2A1F4A;">
                You received this because ${senderName} added you as a family member.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>`
}
