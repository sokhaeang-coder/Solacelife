// ═══════════════════════════════════════════════════════════════
//  SOLACE LIFE — Send Emergency Contact Email
//
//  Called whenever a family member is designated as an emergency
//  contact — either during onboarding or from the Family tab.
//  Sends a warm, clear email to the designated person explaining
//  their role and what to expect.
//
//  POST body:
//    { family_member_id: string, is_new_member?: boolean }
//
//  is_new_member = true  → person was just added AND designated
//                          at the same time (onboarding flow).
//                          Email acknowledges both facts.
//  is_new_member = false → person already existed as a family
//                          member, now being elevated to emergency
//                          contact. Email focuses on the new role.
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

  // ── Fetch the family member row ───────────────────────────────
  const { data: member, error: memberErr } = await supabase
    .from('family_members')
    .select('id, name, email, relationship, emergency_priority, user_id')
    .eq('id', family_member_id)
    .single()

  if (memberErr || !member) {
    console.error('Family member not found:', memberErr?.message)
    return new Response(JSON.stringify({ error: 'Family member not found' }), { status: 404 })
  }

  if (!member.email) {
    // No email address — nothing we can do, but not an error worth crashing on
    console.log(`No email for member ${family_member_id} — skipping emergency email`)
    return new Response(JSON.stringify({ skipped: true, reason: 'no_email' }), { status: 200 })
  }

  // ── Fetch the sender's profile ────────────────────────────────
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', member.user_id)
    .single()

  const senderName    = profile?.full_name || 'Someone who cares about you'
  const recipientName = member.name
  const priority      = member.emergency_priority ?? 1

  // ── Build and send the email ──────────────────────────────────
  const emailPayload = {
    from:    FROM_EMAIL,
    to:      [member.email],
    subject: `🆘 ${senderName} has named you as their emergency contact`,
    html: buildEmergencyEmail({
      senderName,
      recipientName,
      relationship: member.relationship,
      priority,
      isNewMember: is_new_member,
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

  console.log(`Emergency contact email sent → ${member.email}`)
  return new Response(
    JSON.stringify({ success: true, to: member.email }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )
})


// ─── Email HTML template ──────────────────────────────────────
function buildEmergencyEmail({
  senderName,
  recipientName,
  relationship,
  priority,
  isNewMember,
}: {
  senderName:   string
  recipientName: string
  relationship:  string
  priority:      number
  isNewMember:   boolean
}) {
  const priorityLabel =
    priority === 1 ? 'primary'   :
    priority === 2 ? 'secondary' : 'tertiary'

  const relationshipPhrase =
    relationship === 'Spouse'  ? 'your partner'        :
    relationship === 'Child'   ? 'their child'         :
    relationship === 'Parent'  ? 'their parent'        :
    relationship === 'Sibling' ? 'their sibling'       :
    relationship === 'Friend'  ? 'a close friend'      :
                                  'someone they trust'

  const subjectLine = isNewMember
    ? `${senderName} has added you to their Solace Life family — and named you as their emergency contact.`
    : `${senderName} has named you as their emergency contact on Solace Life.`

  const newMemberBadge = isNewMember ? `
    <!-- New member note -->
    <tr>
      <td style="padding-bottom:28px;">
        <div style="background:#1A2E1A;border-radius:14px;padding:20px 22px;
                    border:1px solid #2A4A2A;">
          <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#6FCF97;
                    text-transform:uppercase;letter-spacing:1.2px;">
            Also — you have been added to their family
          </p>
          <p style="margin:0;font-size:15px;color:#D4EDDA;line-height:1.6;">
            ${senderName} has added you as ${relationshipPhrase} in their Solace Life vault.
            This means memories, messages, and moments they record will be
            delivered to you — on birthdays, anniversaries, and the days that matter most.
          </p>
        </div>
      </td>
    </tr>` : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>${senderName} has named you as their emergency contact</title>
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

                <!-- Emergency badge -->
                <tr>
                  <td align="center" style="padding-bottom:28px;">
                    <div style="display:inline-block;background:#3D0E0E;border-radius:50px;
                                padding:10px 24px;border:1px solid #7A2020;">
                      <p style="margin:0;font-size:14px;font-weight:700;color:#FF8A80;
                                letter-spacing:0.5px;">
                        🆘 &nbsp;You are ${senderName}'s ${priorityLabel} emergency contact
                      </p>
                    </div>
                  </td>
                </tr>

                <!-- Greeting -->
                <tr>
                  <td style="padding-bottom:28px;">
                    <p style="margin:0 0 6px;font-size:15px;color:#9985BB;">
                      Dear ${recipientName},
                    </p>
                    <p style="margin:0;font-size:18px;color:#EEE8F5;line-height:1.65;">
                      ${subjectLine}
                    </p>
                  </td>
                </tr>

                ${newMemberBadge}

                <!-- What this means -->
                <tr>
                  <td style="padding-bottom:28px;">
                    <div style="background:#0E0B1F;border-radius:16px;padding:26px 24px;
                                border:1px solid #2A1F4A;">
                      <p style="margin:0 0 16px;font-size:13px;font-weight:700;color:#7B5EA7;
                                text-transform:uppercase;letter-spacing:1.5px;">
                        What does this mean for you?
                      </p>
                      <table width="100%" cellpadding="0" cellspacing="0" border="0">
                        <tr>
                          <td style="padding-bottom:16px;vertical-align:top;width:28px;">
                            <p style="margin:0;font-size:18px;line-height:1;">📱</p>
                          </td>
                          <td style="padding-bottom:16px;padding-left:12px;vertical-align:top;">
                            <p style="margin:0;font-size:15px;color:#EEE8F5;line-height:1.55;">
                              <strong>Your name and number appear on ${senderName}'s lock screen</strong> —
                              accessible to first responders without needing to unlock the phone.
                            </p>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding-bottom:16px;vertical-align:top;">
                            <p style="margin:0;font-size:18px;line-height:1;">📞</p>
                          </td>
                          <td style="padding-bottom:16px;padding-left:12px;vertical-align:top;">
                            <p style="margin:0;font-size:15px;color:#EEE8F5;line-height:1.55;">
                              <strong>If something happens, you may get a call from a stranger</strong> —
                              a nurse, a bystander, or a first responder reaching out on
                              ${senderName}'s behalf.
                            </p>
                          </td>
                        </tr>
                        <tr>
                          <td style="vertical-align:top;">
                            <p style="margin:0;font-size:18px;line-height:1;">💛</p>
                          </td>
                          <td style="padding-left:12px;vertical-align:top;">
                            <p style="margin:0;font-size:15px;color:#EEE8F5;line-height:1.55;">
                              <strong>It means they trust you completely</strong> —
                              you are the person ${senderName} wants by their side most.
                            </p>
                          </td>
                        </tr>
                      </table>
                    </div>
                  </td>
                </tr>

                <!-- No action needed -->
                <tr>
                  <td style="padding-bottom:28px;">
                    <div style="background:#1A1535;border-radius:14px;padding:20px 22px;
                                border:1px solid #2A1F4A;text-align:center;">
                      <p style="margin:0 0 6px;font-size:14px;font-weight:600;color:#C9A8FF;">
                        Nothing you need to do right now
                      </p>
                      <p style="margin:0;font-size:14px;color:#7B5EA7;line-height:1.6;">
                        Just know that if you ever receive an unexpected call from a stranger
                        asking about ${senderName}, it may be someone reaching out through Solace Life.
                        Pick up. It could matter more than you know.
                      </p>
                    </div>
                  </td>
                </tr>

                <!-- Divider -->
                <tr>
                  <td style="padding:4px 0 24px;">
                    <div style="height:1px;background:linear-gradient(to right,transparent,#2A1F4A,transparent);"></div>
                  </td>
                </tr>

                <!-- Download CTA -->
                <tr>
                  <td align="center" style="padding-bottom:16px;">
                    <p style="margin:0 0 16px;font-size:14px;color:#7B5EA7;text-align:center;">
                      Want to preserve your own memories for the people you love?
                    </p>
                    <a href="https://solacelife.ca"
                      style="display:inline-block;
                              background:transparent;
                              color:#C9A8FF;text-decoration:none;font-weight:600;
                              font-size:15px;padding:14px 36px;border-radius:50px;
                              border:1px solid #4A3D60;">
                      Explore Solace Life — Free ›
                    </a>
                  </td>
                </tr>

              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding-top:36px;">
              <p style="margin:0 0 6px;font-size:12px;color:#4A3D60;">
                Sent with care via
                <a href="https://solacelife.ca"
                  style="color:#7B5EA7;text-decoration:none;font-weight:600;">
                  Solace Life
                </a>
              </p>
              <p style="margin:0;font-size:11px;color:#2A1F4A;">
                You received this because ${senderName} designated you as their emergency contact.
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
