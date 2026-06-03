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

  // Optional: when called with a specific family_member_id (e.g. from
  // confirm-family-email immediately after consent is given), only process
  // deliveries for that one recipient.  When absent, the daily cron path
  // processes all due deliveries across all consented members.
  const body = await req.json().catch(() => ({}))
  const filterMemberId: string | null = body.family_member_id ?? null

  // Today's date as YYYY-MM-DD
  const today = new Date().toISOString().split('T')[0]

  // ── 1. Fetch pending deliveries due today or earlier ──────
  //    When filterMemberId is set we target one member only (consent
  //    just granted — deliver any overdue moments immediately).
  //    Otherwise the daily cron processes everyone due today.
  //    The consent gate is enforced per-row below, not in the query,
  //    so the daily path still skips non-consented recipients safely.
  let query = supabase
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

  if (filterMemberId) {
    query = query.eq('family_member_id', filterMemberId)
  }

  const { data: deliveries, error: fetchError } = await query

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

  let timeCapsuleHtml = ''
  if (recordedDate) {
    const recorded  = new Date(recordedDate)
    const delivered = new Date(scheduledDate + 'T12:00:00')
    const formattedRecorded = recorded.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    const daysApart   = Math.floor((delivered.getTime() - recorded.getTime()) / (1000 * 60 * 60 * 24))
    const yearsApart  = Math.floor(daysApart / 365)
    const monthsApart = Math.floor(daysApart / 30)
    const timeAgoLabel = yearsApart >= 2  ? `${yearsApart} years`
                       : yearsApart === 1 ? `1 year`
                       : monthsApart >= 2 ? `${monthsApart} months`
                       : monthsApart === 1 ? `1 month`
                       : daysApart > 0    ? `${daysApart} day${daysApart !== 1 ? 's' : ''}`
                       : 'today'

    timeCapsuleHtml = `
      <div style="background:#FFF0E8;border-radius:14px;border:1px solid #F9D0BB;padding:18px 20px;margin-bottom:20px;">
        <p style="margin:0 0 12px;font-size:11px;color:#7A3448;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;text-align:center;">⏳ Time Capsule</p>
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td width="50%" style="text-align:center;padding:8px 12px;">
              <p style="margin:0 0 4px;font-size:20px;">📅</p>
              <p style="margin:0 0 3px;font-size:10px;color:#7A3448;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Recorded</p>
              <p style="margin:0;font-size:13px;font-weight:700;color:#3D1020;">${formattedRecorded}</p>
            </td>
            <td width="50%" style="text-align:center;padding:8px 12px;border-left:1px solid #F9D0BB;">
              <p style="margin:0 0 4px;font-size:20px;">🕊️</p>
              <p style="margin:0 0 3px;font-size:10px;color:#7A3448;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Arriving Today</p>
              <p style="margin:0;font-size:13px;font-weight:700;color:#3D1020;">${formattedDate}</p>
            </td>
          </tr>
        </table>
        <p style="margin:12px 0 0;font-size:13px;color:#7A3448;text-align:center;font-style:italic;line-height:1.6;">
          ${senderName} recorded this <strong>${timeAgoLabel} ago</strong> — and kept it waiting just for you.
        </p>
      </div>`
  }

  const noteHtml = personalNote ? `
    <div style="border-left:3px solid #F06292;background:#FFF0E8;border-radius:0 12px 12px 0;padding:16px 18px;margin-bottom:20px;">
      <p style="margin:0 0 6px;font-size:11px;color:#7A3448;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;">
        Personal note from ${senderName}
      </p>
      <p style="margin:0;font-size:15px;color:#3D1020;line-height:1.7;font-style:italic;">
        &ldquo;${personalNote}&rdquo;
      </p>
    </div>` : ''

  const bodyHtml = `
    <p style="margin:0 0 6px;font-size:13px;color:#7A3448;font-style:italic;">Dear ${recipientName},</p>
    <p style="margin:8px 0 20px;font-size:15px;color:#3D1020;line-height:1.65;">
      <strong style="color:#F06292;">${senderName}</strong> scheduled something special
      to reach you on this day — a memory they wanted you to have, arriving right on time.
    </p>

    ${timeCapsuleHtml}

    <div style="background:#FFF0E8;border-radius:14px;border:1px solid #F9D0BB;padding:18px 20px;margin-bottom:20px;">
      <p style="margin:0 0 8px;font-size:28px;line-height:1;">${memoryTypeIcon}</p>
      <h2 style="margin:0 0 6px;font-size:18px;font-weight:700;color:#3D1020;">${memoryTitle}</h2>
      <p style="margin:0;font-size:11px;font-weight:700;color:#7A3448;text-transform:uppercase;letter-spacing:1.5px;">${memoryTypeLabel}</p>
    </div>

    ${noteHtml}

    <div style="text-align:center;margin-bottom:14px;">
      <a href="${webViewUrl}"
        style="display:inline-block;background:linear-gradient(135deg,#F06292,#F48A5A);
                color:#fff;text-decoration:none;font-weight:700;
                font-size:16px;padding:16px 40px;border-radius:50px;">
        Open Your Memory ›
      </a>
    </div>
    <div style="text-align:center;margin-bottom:20px;">
      <p style="margin:0 0 10px;font-size:13px;color:#7A3448;">Want to keep all your memories in one place?</p>
      <a href="https://solacelife.ca"
        style="display:inline-block;background:transparent;color:#F06292;
                text-decoration:none;font-weight:600;font-size:13px;
                padding:10px 24px;border-radius:50px;border:1px solid #F9C4D4;">
        Download Solace Life — Free ›
      </a>
    </div>
    <p style="margin:0;font-size:12px;color:#7A3448;text-align:center;opacity:0.7;line-height:1.6;">
      No app needed — open it right in your browser.<br>This memory was sent with love and scheduled to reach you today.
    </p>
  `

  return sunriseEmail({
    title: `A memory from ${senderName} has arrived`,
    headerIcon: '🌸',
    headerSubtitle: 'A memory has arrived for you',
    bodyHtml,
    footerText: 'You received this because a loved one chose to share a memory with you.',
  })
}
