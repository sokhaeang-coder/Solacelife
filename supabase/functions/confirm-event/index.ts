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
        subject: `Solace Life: ${ownerName}'s vault has been released`,
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
<style>body{font-family:sans-serif;background:#0E0B1F;color:#EEE8F5;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.box{background:#1A1535;border-radius:20px;padding:40px;max-width:480px;text-align:center}
h2{color:#C9A8FF}p{color:#9985BB}</style></head>
<body><div class="box"><h2>Solace Life</h2><p>${errorMsg}</p></div></body></html>`
  }

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Confirm Event — Solace Life</title>
<style>
body{font-family:sans-serif;background:#0E0B1F;color:#EEE8F5;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px;box-sizing:border-box}
.box{background:#1A1535;border-radius:20px;padding:40px;max-width:480px;width:100%;text-align:center;border:1px solid #2A1F4A}
h2{color:#C9A8FF;margin-bottom:8px}
p{color:#9985BB;line-height:1.6;margin-bottom:24px}
.warn{color:#FF8A8A;background:#FF8A8A11;border:1px solid #FF8A8A33;border-radius:12px;padding:16px;margin-bottom:24px;font-size:14px}
.btn{background:#c0392b;color:#fff;border:none;border-radius:14px;padding:16px 40px;font-size:16px;font-weight:700;cursor:pointer;width:100%;margin-bottom:12px}
.btn:hover{background:#a93226}
.cancel{color:#9985BB;font-size:14px;cursor:pointer;text-decoration:underline}
#result{display:none;margin-top:20px;padding:16px;border-radius:12px;font-weight:600}
.success{background:#8AFFD411;color:#8AFFD4;border:1px solid #8AFFD433}
.error{background:#FF8A8A11;color:#FF8A8A;border:1px solid #FF8A8A33}
</style></head>
<body>
<div class="box">
  <h2>⚠️ Confirm Event</h2>
  <p>You are about to release this person's legacy vault to their designated family members. This action cannot be undone.</p>
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
  <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1a1535;padding:32px 24px;background:#f7f9ff;border-radius:16px;border:1px solid #c9e0ff">
    <h2 style="color:#2C3E80;margin-bottom:8px">🔓 Vault Released — Solace Life</h2>
    <p>Hi ${recipientName},</p>
    <p><strong>${ownerName}</strong> has left you a legacy in Solace Life. Their vault and personal messages are now available to you.</p>
    <p>Please open the Solace Life app to access what they left behind.</p>
    <hr style="border:none;border-top:1px solid #e0e8f5;margin:24px 0"/>
    <p style="color:#9090b0;font-size:12px">Solace Life — Memories and legacies, preserved with care.</p>
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
