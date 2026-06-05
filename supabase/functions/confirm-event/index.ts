// ═══════════════════════════════════════════════════════════════
//  SOLACE LIFE — Confirm Event
//
//  Called when a trusted contact clicks the confirmation link
//  in their escalation email.
//
//  GET  /confirm-event?token=<uuid>
//    → Returns a confirmation HTML page
//
//  POST /confirm-event
//    { token: string }
//    → Validates token, marks vault_status = 'released',
//      notifies all family members, returns JSON result
// ═══════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

Deno.serve(async (req) => {
  const url = new URL(req.url)

  // ── GET: show confirmation page ──────────────────────────────
  if (req.method === 'GET') {
    const token = url.searchParams.get('token')
    if (!token) return new Response('Invalid link.', { status: 400 })

    // Validate token exists and is unused
    const { data: conf } = await supabase
      .from('event_confirmations')
      .select('id, token_used, user_id')
      .eq('confirmation_token', token)
      .single()

    if (!conf) {
      return new Response(confirmPage('Invalid or expired link.', false), {
        headers: { 'Content-Type': 'text/html' },
      })
    }
    if (conf.token_used) {
      return new Response(confirmPage('This confirmation link has already been used.', false), {
        headers: { 'Content-Type': 'text/html' },
      })
    }

    return new Response(confirmPage(null, true, token), {
      headers: { 'Content-Type': 'text/html' },
    })
  }

  // ── POST: process the confirmation ──────────────────────────
  if (req.method === 'POST') {
    const { token } = await req.json()
    if (!token) return json({ error: 'Token required' }, 400)

    // Look up the confirmation record
    const { data: conf, error: confErr } = await supabase
      .from('event_confirmations')
      .select('id, token_used, user_id, confirmed_by')
      .eq('confirmation_token', token)
      .single()

    if (confErr || !conf) return json({ error: 'Invalid token' }, 404)
    if (conf.token_used)   return json({ error: 'Token already used' }, 409)

    // Mark token as used
    await supabase.from('event_confirmations').update({
      token_used:   true,
      confirmed_at: new Date().toISOString(),
    }).eq('id', conf.id)

    // Release the vault
    await supabase.from('profiles').update({
      vault_status:      'released',
      vault_released_at: new Date().toISOString(),
    }).eq('id', conf.user_id)

    // Get owner info
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', conf.user_id)
      .single()

    // Log the vault release escalation event
    await supabase.from('checkin_escalations').insert({
      user_id:      conf.user_id,
      type:         'vault_release',
      recipient:    conf.confirmed_by,
      missed_count: null,
    })

    // Notify all family members that the vault has been released
    const { data: family } = await supabase
      .from('family_members')
      .select('name, email')
      .eq('user_id', conf.user_id)
      .not('email', 'is', null)

    const ownerName = profile?.full_name ?? 'your loved one'
    for (const member of (family ?? [])) {
      if (!member.email) continue
      await sendEmail({
        to:      member.email,
        subject: `Solace Life: ${ownerName} shared documents and messages with you`,
        html: vaultReleaseEmailHtml({ recipientName: member.name, ownerName }),
      })
    }

    console.log(`Vault released for user ${conf.user_id} by ${conf.confirmed_by}`)
    return json({ success: true, message: 'Vault released. Family members have been notified.' })
  }

  return new Response('Method not allowed', { status: 405 })
})

// ── Confirmation HTML page ────────────────────────────────────
function confirmPage(errorMsg: string | null, showForm: boolean, token = '') {
  if (!showForm) {
    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Solace Life</title>
<style>body{font-family:sans-serif;background:linear-gradient(160deg,#FFE3D0,#FFD2CE 45%,#F8C4D8);color:#4A2418;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.box{background:rgba(255,255,255,.72);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);border:1px solid rgba(255,255,255,.85);border-radius:26px;padding:40px;max-width:480px;text-align:center;box-shadow:0 18px 50px rgba(74,36,24,.10)}
h2{color:#4A2418}p{color:#8A5A3A}</style></head>
<body><div class="box"><h2>Solace Life</h2><p>${errorMsg}</p></div></body></html>`
  }

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Confirm Event — Solace Life</title>
<style>
body{font-family:sans-serif;background:linear-gradient(160deg,#FFE3D0,#FFD2CE 45%,#F8C4D8);color:#4A2418;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px;box-sizing:border-box}
.box{background:rgba(255,255,255,.72);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);border-radius:26px;padding:40px;max-width:480px;width:100%;text-align:center;border:1px solid rgba(255,255,255,.85);box-shadow:0 18px 50px rgba(74,36,24,.10)}
h2{color:#4A2418;margin-bottom:8px}
p{color:#8A5A3A;line-height:1.6;margin-bottom:24px}
.warn{color:#B3402E;background:rgba(192,57,43,.08);border:1px solid rgba(192,57,43,.25);border-radius:12px;padding:16px;margin-bottom:24px;font-size:14px}
.btn{background:#c0392b;color:#fff;border:none;border-radius:14px;padding:16px 40px;font-size:16px;font-weight:700;cursor:pointer;width:100%;margin-bottom:12px}
.btn:hover{background:#a93226}
.cancel{color:#8A5A3A;font-size:14px;cursor:pointer;text-decoration:underline}
#result{display:none;margin-top:20px;padding:16px;border-radius:12px;font-weight:600}
.success{background:rgba(46,125,110,.10);color:#2E7D6E;border:1px solid rgba(46,125,110,.3)}
.error{background:rgba(192,57,43,.08);color:#B3402E;border:1px solid rgba(192,57,43,.25)}
</style></head>
<body>
<div class="box">
  <h2>⚠️ Confirm Event</h2>
  <p>You are about to make this person's vault documents and messages visible to the family members they chose. This shares copies of information only — it does not transfer ownership of any property or assets. This action cannot be undone.</p>
  <div class="warn">Only proceed if you have confirmed this event has occurred. Their family will be notified immediately.</div>
  <button class="btn" onclick="doConfirm()">Confirm Event & Release Vault</button>
  <div><span class="cancel" onclick="window.close()">Cancel — they are fine</span></div>
  <div id="result"></div>
</div>
<script>
async function doConfirm() {
  const btn = document.querySelector('.btn');
  btn.disabled = true;
  btn.textContent = 'Processing...';
  try {
    const res = await fetch(location.href, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: '${token}' }),
    });
    const data = await res.json();
    const el = document.getElementById('result');
    el.style.display = 'block';
    if (data.success) {
      el.className = 'success';
      el.textContent = 'Vault released. Family members have been notified.';
      btn.style.display = 'none';
    } else {
      el.className = 'error';
      el.textContent = data.error ?? 'Something went wrong.';
      btn.disabled = false;
      btn.textContent = 'Confirm Event & Release Vault';
    }
  } catch(e) {
    document.getElementById('result').style.display = 'block';
    document.getElementById('result').className = 'error';
    document.getElementById('result').textContent = 'Network error. Please try again.';
    btn.disabled = false;
    btn.textContent = 'Confirm Event & Release Vault';
  }
}
</script>
</body></html>`
}

// ── Vault release email ───────────────────────────────────────
function vaultReleaseEmailHtml({ recipientName, ownerName }: { recipientName: string; ownerName: string }) {
  return `
  <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#6B4A35;padding:32px 24px;background:#FFFFFF;border-radius:16px;border:1px solid #F3D9C8">
    <h2 style="color:#4A2418;margin-bottom:8px">💌 Documents Shared With You — Solace Life</h2>
    <p>Hi ${recipientName},</p>
    <p><strong>${ownerName}</strong> chose to share documents, information, and personal messages with you in Solace Life. They are now available for you to see.</p>
    <p>Please open the Solace Life app to view what they shared with you.</p>
    <hr style="border:none;border-top:1px solid #F3D9C8;margin:24px 0"/>
    <p style="color:#A87A52;font-size:11px">Solace Life shares copies of documents and information only. It does not transfer ownership of money, property, or belongings, and it is not a legal will.</p>
    <p style="color:#A87A52;font-size:12px">Solace Life — Memories preserved with care.</p>
  </div>`
}

async function sendEmail({ to, subject, html }: { to: string; subject: string; html: string }) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ to, subject, html }),
  })
  if (!res.ok) console.warn(`Email send failed: ${await res.text()}`)
}

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
