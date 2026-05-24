// ═══════════════════════════════════════════════════════════════
//  SOLACE LIFE — Time Capsule Delivery Edge Function
//  Runs daily via pg_cron. Finds pending scheduled_deliveries
//  that are due, sends a Resend email to each recipient,
//  then marks the row as delivered.
// ═══════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY          = Deno.env.get('RESEND_API_KEY')!
const SUPABASE_URL            = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const FROM_EMAIL = 'Solace Life <onboarding@resend.dev>'  // TODO: switch to memories@solacelife.ca once domain verified on Resend

// ─── Entry point ─────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // Today's date as YYYY-MM-DD
  const today = new Date().toISOString().split('T')[0]

  // ── 1. Fetch all pending deliveries due today or earlier ──
  //    Only include recipients who have actively consented.
  //    pending / declined / revoked / blocked → skip, never deliver.
  const { data: deliveries, error: fetchError } = await supabase
    .from('scheduled_deliveries')
    .select(`
      id,
      message,
      scheduled_date,
      user_id,
      web_access_token,
      memories (
        id,
        title,
        type,
        description,
        created_at
      ),
      family_members (
        id,
        name,
        email,
        consent_status
      )
    `)
    .eq('status', 'pending')
    .lte('scheduled_date', today)

  if (fetchError) {
    console.error('DB fetch error:', fetchError.message)
    return new Response(JSON.stringify({ error: fetchError.message }), { status: 500 })
  }

  if (!deliveries || deliveries.length === 0) {
    console.log('No deliveries due today:', today)
    return new Response(JSON.stringify({ message: 'No deliveries due', date: today }), { status: 200 })
  }

  console.log(`Processing ${deliveries.length} deliveries for ${today}`)

  const results: any[] = []

  // ── 2. Send one email per delivery ───────────────────────
  for (const delivery of deliveries) {
    const memory    = delivery.memories       as any
    const recipient = delivery.family_members as any

    // Look up the sender's profile separately (no direct FK to profiles)
    const { data: profileData } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', delivery.user_id)
      .single()

    const senderName    = profileData?.full_name || 'Someone who loves you'
    const recipientName = recipient?.name   || 'Friend'
    const recipientEmail = recipient?.email

    if (!recipientEmail) {
      results.push({ id: delivery.id, status: 'skipped', reason: 'no recipient email' })
      continue
    }

    // ── Consent gate — never deliver unless recipient actively accepted ──
    const consentStatus = recipient?.consent_status ?? 'pending'
    if (consentStatus !== 'consented') {
      console.log(`Skipped delivery ${delivery.id} — consent_status=${consentStatus} for ${recipientEmail}`)
      results.push({ id: delivery.id, status: 'skipped', reason: `consent_status=${consentStatus}`, to: recipientEmail })
      continue
    }

    const memoryTypeLabel = memory?.type === 'voice'  ? 'Voice Memo'
                          : memory?.type === 'video'  ? 'Video Memory'
                          : memory?.type === 'photo'  ? 'Photo Memory'
                          : 'Written Story'
    const memoryTypeIcon  = memory?.type === 'voice'  ? '🎙️'
                          : memory?.type === 'video'  ? '🎬'
                          : memory?.type === 'photo'  ? '📷'
                          : '📖'
    const memoryTitle     = memory?.title || 'A Special Memory'

    // Build web viewer URL from the delivery's web_access_token
    const webToken   = (delivery as any).web_access_token as string | null
    const webViewUrl = webToken
      ? `https://solacelife.ca/memory.html?token=${webToken}`
      : 'https://solacelife.ca'

    // Build and send the email
    const emailPayload = {
      from:    FROM_EMAIL,
      to:      [recipientEmail],
      subject: `💌 A memory from ${senderName} has arrived`,
      html:    buildEmailHtml({
        senderName,
        recipientName,
        memoryTitle,
        memoryTypeLabel,
        memoryTypeIcon,
        personalNote:   delivery.message || null,
        scheduledDate:  delivery.scheduled_date,
        recordedDate:   memory?.created_at ?? null,
        webViewUrl,
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

    if (emailRes.ok) {
      // ── 3. Mark as delivered ──────────────────────────────
      await supabase
        .from('scheduled_deliveries')
        .update({
          status:       'delivered',
          delivered_at: new Date().toISOString(),
        })
        .eq('id', delivery.id)

      console.log(`Delivered: ${delivery.id} → ${recipientEmail}`)
      results.push({ id: delivery.id, status: 'delivered', to: recipientEmail })
    } else {
      const errText = await emailRes.text()
      console.error(`Email failed for ${delivery.id}:`, errText)
      results.push({ id: delivery.id, status: 'failed', to: recipientEmail, error: errText })
    }
  }

  return new Response(
    JSON.stringify({ date: today, processed: results.length, results }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )
})


// ─── Email HTML template ──────────────────────────────────────
function buildEmailHtml({
  senderName,
  recipientName,
  memoryTitle,
  memoryTypeLabel,
  memoryTypeIcon,
  personalNote,
  scheduledDate,
  recordedDate,
  webViewUrl,
}: {
  senderName:     string
  recipientName:  string
  memoryTitle:    string
  memoryTypeLabel:string
  memoryTypeIcon: string
  personalNote:   string | null
  scheduledDate:  string
  recordedDate:   string | null
  webViewUrl:     string
}) {
  const formattedDate = new Date(scheduledDate + 'T12:00:00')
    .toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

  // Compute recorded date label + how long ago it was relative to delivery date
  let timeCapsuleSection = ''
  if (recordedDate) {
    const recorded   = new Date(recordedDate)
    const delivered  = new Date(scheduledDate + 'T12:00:00')
    const formattedRecorded = recorded.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

    const msApart    = delivered.getTime() - recorded.getTime()
    const daysApart  = Math.floor(msApart / (1000 * 60 * 60 * 24))
    const yearsApart = Math.floor(daysApart / 365)
    const monthsApart = Math.floor(daysApart / 30)

    const timeAgoLabel = yearsApart >= 2  ? `${yearsApart} years`
                       : yearsApart === 1 ? `1 year`
                       : monthsApart >= 2 ? `${monthsApart} months`
                       : monthsApart === 1 ? `1 month`
                       : daysApart > 0    ? `${daysApart} day${daysApart !== 1 ? 's' : ''}`
                       : 'today'

    timeCapsuleSection = `
    <tr>
      <td style="padding-bottom:28px;">
        <div style="background:#12102A;border-radius:16px;padding:22px 24px;border:1px solid #2A1F4A;">
          <p style="margin:0 0 16px;font-size:11px;color:#9985BB;font-weight:700;
                    text-transform:uppercase;letter-spacing:1.5px;text-align:center;">
            ⏳ Time Capsule
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td width="50%" style="text-align:center;padding:10px 12px;">
                <p style="margin:0 0 6px;font-size:22px;">📅</p>
                <p style="margin:0 0 4px;font-size:10px;color:#9985BB;font-weight:700;
                          text-transform:uppercase;letter-spacing:1px;">Recorded</p>
                <p style="margin:0;font-size:14px;font-weight:700;color:#EEE8F5;line-height:1.4;">
                  ${formattedRecorded}
                </p>
              </td>
              <td width="50%" style="text-align:center;padding:10px 12px;
                                      border-left:1px solid #2A1F4A;">
                <p style="margin:0 0 6px;font-size:22px;">🕊️</p>
                <p style="margin:0 0 4px;font-size:10px;color:#9985BB;font-weight:700;
                          text-transform:uppercase;letter-spacing:1px;">Arriving Today</p>
                <p style="margin:0;font-size:14px;font-weight:700;color:#EEE8F5;line-height:1.4;">
                  ${formattedDate}
                </p>
              </td>
            </tr>
          </table>
          <p style="margin:16px 0 0;font-size:14px;color:#C9A8FF;text-align:center;
                    font-style:italic;line-height:1.6;">
            ${senderName} recorded this <strong>${timeAgoLabel} ago</strong> — and kept it waiting just for you.
          </p>
        </div>
      </td>
    </tr>`
  }

  const noteSection = personalNote ? `
    <tr>
      <td style="padding-bottom:28px;">
        <div style="background:#2A1F4A;border-radius:14px;padding:22px 24px;border-left:4px solid #C9A8FF;">
          <p style="margin:0 0 8px;font-size:11px;color:#9985BB;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;">
            Personal Note from ${senderName}
          </p>
          <p style="margin:0;font-size:16px;color:#EEE8F5;line-height:1.7;font-style:italic;">
            &ldquo;${personalNote}&rdquo;
          </p>
        </div>
      </td>
    </tr>` : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>A memory from ${senderName}</title>
</head>
<body style="margin:0;padding:0;background-color:#0E0B1F;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" border="0"
    style="background-color:#0E0B1F;padding:48px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0"
          style="max-width:600px;width:100%;">

          <!-- Logo / Brand -->
          <tr>
            <td align="center" style="padding-bottom:40px;">
              <p style="margin:0 0 10px;font-size:42px;line-height:1;">🕊️</p>
              <h1 style="margin:0;font-size:26px;font-weight:700;color:#EEE8F5;letter-spacing:-0.3px;">
                Solace Life
              </h1>
              <p style="margin:10px 0 0;font-size:14px;color:#7B5EA7;">
                A memory has arrived for you
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
                      <strong style="color:#C9A8FF;">${senderName}</strong>
                      scheduled something special to reach you on this day.
                      A memory they wanted you to have — arriving right on time.
                    </p>
                  </td>
                </tr>

                <!-- Time capsule timeline (recorded date vs delivery date) -->
                ${timeCapsuleSection}

                <!-- Memory card -->
                <tr>
                  <td style="padding-bottom:28px;">
                    <div style="background:#0E0B1F;border-radius:16px;padding:26px 24px;
                                border:1px solid #2A1F4A;">
                      <p style="margin:0 0 10px;font-size:34px;line-height:1;">${memoryTypeIcon}</p>
                      <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#EEE8F5;
                                  letter-spacing:-0.2px;">
                        ${memoryTitle}
                      </h2>
                      <p style="margin:0;font-size:12px;font-weight:700;color:#7B5EA7;
                                text-transform:uppercase;letter-spacing:1.5px;">
                        ${memoryTypeLabel}
                      </p>
                    </div>
                  </td>
                </tr>

                <!-- Personal note (if present) -->
                ${noteSection}

                <!-- Primary CTA — web viewer (no app required) -->
                <tr>
                  <td align="center" style="padding-bottom:16px;">
                    <a href="${webViewUrl}"
                      style="display:inline-block;
                              background:linear-gradient(135deg,#F5CEAA 0%,#E8A87C 50%,#C07840 100%);
                              color:#0E0B1F;text-decoration:none;font-weight:700;
                              font-size:16px;padding:18px 44px;border-radius:50px;
                              letter-spacing:0.2px;">
                      Open Your Memory ›
                    </a>
                  </td>
                </tr>

                <!-- Secondary CTA — app download -->
                <tr>
                  <td align="center" style="padding-bottom:28px;">
                    <p style="margin:0 0 10px;font-size:13px;color:#7B5EA7;">
                      Want to keep all your memories in one place?
                    </p>
                    <a href="https://solacelife.ca"
                      style="display:inline-block;
                              background:transparent;
                              color:#C9A8FF;text-decoration:none;font-weight:600;
                              font-size:14px;padding:12px 32px;border-radius:50px;
                              border:1.5px solid #4A3D60;letter-spacing:0.2px;">
                      Download the Solace Life App — Free
                    </a>
                  </td>
                </tr>

                <!-- Footer note -->
                <tr>
                  <td>
                    <p style="margin:0;font-size:13px;color:#4A3D60;line-height:1.6;
                              text-align:center;">
                      This memory was sent with love and scheduled to reach you today.<br>
                      No app needed — open it right in your browser.
                    </p>
                  </td>
                </tr>

              </table>
            </td>
          </tr>

          <!-- Email footer -->
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
                You received this because a loved one chose to share a memory with you.
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
