// ═══════════════════════════════════════════════════════════════
//  SOLACE LIFE — Test Email Delivery Edge Function
//  Manually triggered (NOT a cron job). Call this to verify
//  that Resend is wired up correctly before going live.
//
//  Auth: Bearer token — must match SUPABASE_SERVICE_ROLE_KEY.
//
//  Request body:
//    { "to": "test@example.com", "name": "Test Person", "senderName": "Sokha" }
//
//  Returns:
//    { success: true, resendId: "...", to: "..." }
//    or
//    { success: false, error: "..." }
// ═══════════════════════════════════════════════════════════════

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!

const FROM_EMAIL = 'Solace Life <memories@solacelife.ca>'

// ─── Entry point ─────────────────────────────────────────────
Deno.serve(async (req) => {
  // Only accept POST requests
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  // ── Auth check ───────────────────────────────────────────────
  // Supabase validates the JWT before the function runs.
  // We simply require that an Authorization header is present.
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) {
    console.warn('Unauthorized test-email-delivery attempt')
    return new Response(
      JSON.stringify({ success: false, error: 'Unauthorized' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // ── Parse request body ───────────────────────────────────────
  let to: string
  let name: string
  let senderName: string

  try {
    const body = await req.json()
    to         = body.to
    name       = body.name       || 'Test Person'
    senderName = body.senderName || 'Solace Life Test'

    if (!to) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required field: to' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: 'Invalid JSON body' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // ── Build test email payload ──────────────────────────────────
  // Fixed test data — the point is to verify the Resend integration
  const testMemoryTitle    = 'A message for you'
  const testMemoryType     = 'voice'
  const testMemoryTypeLabel = 'Voice Memo'
  const testMemoryTypeIcon  = '🎙️'
  const testPersonalNote   = 'This is a test delivery from Solace Life. If you received this, the email system is working perfectly. 🎉'
  const testScheduledDate  = new Date().toISOString().split('T')[0]

  const emailPayload = {
    from:    FROM_EMAIL,
    to:      [to],
    subject: `[TEST] 💌 A memory from ${senderName} has arrived`,
    html:    buildEmailHtml({
      senderName,
      recipientName:   name,
      memoryTitle:     testMemoryTitle,
      memoryTypeLabel: testMemoryTypeLabel,
      memoryTypeIcon:  testMemoryTypeIcon,
      personalNote:    testPersonalNote,
      scheduledDate:   testScheduledDate,
      isTest:          true,
    }),
  }

  // ── Send via Resend ───────────────────────────────────────────
  console.log(`Sending test email to ${to} via Resend...`)

  const resendRes = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify(emailPayload),
  })

  const resendBody = await resendRes.json()

  if (resendRes.ok) {
    console.log(`Test email delivered → ${to} (Resend ID: ${resendBody.id})`)
    return new Response(
      JSON.stringify({
        success:  true,
        resendId: resendBody.id,
        to,
        message: 'Test email sent successfully',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } else {
    console.error('Resend error:', JSON.stringify(resendBody))
    return new Response(
      JSON.stringify({
        success: false,
        error:   resendBody,
        to,
      }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    )
  }
})


// ─── Email HTML template ──────────────────────────────────────
// Matches the template in deliver-time-capsules/index.ts exactly,
// with an optional TEST banner at the top for clarity.
function buildEmailHtml({
  senderName,
  recipientName,
  memoryTitle,
  memoryTypeLabel,
  memoryTypeIcon,
  personalNote,
  scheduledDate,
  isTest,
}: {
  senderName:     string
  recipientName:  string
  memoryTitle:    string
  memoryTypeLabel:string
  memoryTypeIcon: string
  personalNote:   string | null
  scheduledDate:  string
  isTest:         boolean
}) {
  const formattedDate = new Date(scheduledDate + 'T12:00:00')
    .toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

  const testBanner = isTest ? `
          <!-- TEST banner -->
          <tr>
            <td align="center" style="padding-bottom:20px;">
              <div style="background:#2A1F4A;border:1px solid #C9A8FF;border-radius:10px;
                          padding:10px 20px;display:inline-block;">
                <p style="margin:0;font-size:12px;font-weight:700;color:#C9A8FF;
                           text-transform:uppercase;letter-spacing:1.5px;">
                  ⚡ Test Email — Resend Integration Check
                </p>
              </div>
            </td>
          </tr>` : ''

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

          ${testBanner}

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

                <!-- CTA button -->
                <tr>
                  <td align="center" style="padding-bottom:28px;">
                    <a href="https://solacelife.ca"
                      style="display:inline-block;
                              background:linear-gradient(135deg,#F5CEAA 0%,#E8A87C 50%,#C07840 100%);
                              color:#0E0B1F;text-decoration:none;font-weight:700;
                              font-size:16px;padding:18px 44px;border-radius:50px;
                              letter-spacing:0.2px;">
                      Open in Solace Life
                    </a>
                  </td>
                </tr>

                <!-- Footer note -->
                <tr>
                  <td>
                    <p style="margin:0;font-size:13px;color:#4A3D60;line-height:1.6;
                              text-align:center;">
                      ${senderName} scheduled this memory to be delivered on
                      <strong style="color:#7B5EA7;">${formattedDate}</strong>.<br>
                      Open the Solace Life app to experience it in full.
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
