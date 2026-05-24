// ═══════════════════════════════════════════════════════════════
//  SOLACE LIFE — Confirm Family Email Edge Function
//
//  Handles two actions from the invite email link:
//
//    GET /confirm-family-email?token=<uuid>&action=accept
//      → sets email_confirmed=true, consent_status='consented'
//      → backward-compatible default (action omitted = accept)
//
//    GET /confirm-family-email?token=<uuid>&action=decline
//      → sets consent_status='declined'
//      → memories will never be delivered to this recipient
//
//  Both actions are idempotent — clicking twice is safe.
//  'blocked' status is never overwritten by decline.
// ═══════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

Deno.serve(async (req) => {
  const url    = new URL(req.url)
  const token  = url.searchParams.get('token')
  const action = url.searchParams.get('action') ?? 'accept'   // default: accept

  // CORS headers so confirm.html can call this from the browser
  const headers = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Content-Type': 'application/json',
  }

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers })
  }

  if (!token) {
    return new Response(
      JSON.stringify({ error: 'Missing token' }),
      { status: 400, headers }
    )
  }

  if (action !== 'accept' && action !== 'decline') {
    return new Response(
      JSON.stringify({ error: 'Invalid action — must be accept or decline' }),
      { status: 400, headers }
    )
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // Find the family member by their confirmation token
  // Also fetch sender's profile so confirm.html can personalise the message
  const { data: member, error: fetchErr } = await supabase
    .from('family_members')
    .select('id, name, email, email_confirmed, consent_status, user_id')
    .eq('confirmation_token', token)
    .single()

  if (fetchErr || !member) {
    console.error('Token not found:', fetchErr?.message)
    return new Response(
      JSON.stringify({ error: 'Invalid or expired link' }),
      { status: 404, headers }
    )
  }

  // Fetch sender's display name for personalised confirm page
  let senderName: string | null = null
  if (member.user_id) {
    const { data: senderProfile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', member.user_id)
      .single()
    senderName = senderProfile?.full_name ?? null
  }

  // ── ACCEPT ──────────────────────────────────────────────────────
  if (action === 'accept') {
    // Idempotent: already consented → return success
    if (member.consent_status === 'consented') {
      return new Response(
        JSON.stringify({ success: true, action: 'accept', already_confirmed: true, name: member.name, senderName }),
        { status: 200, headers }
      )
    }

    // Don't overwrite 'blocked' — blocked members cannot re-accept
    if (member.consent_status === 'blocked') {
      return new Response(
        JSON.stringify({ error: 'This link is no longer valid.' }),
        { status: 403, headers }
      )
    }

    const { error: updateErr } = await supabase
      .from('family_members')
      .update({
        email_confirmed: true,
        confirmed_at:    new Date().toISOString(),
        consent_status:  'consented',
        consent_at:      new Date().toISOString(),
      })
      .eq('id', member.id)

    if (updateErr) {
      console.error('Accept update failed:', updateErr.message)
      return new Response(
        JSON.stringify({ error: 'Could not confirm — please try again' }),
        { status: 500, headers }
      )
    }

    console.log(`Consent accepted: ${member.email} (${member.name})`)

    return new Response(
      JSON.stringify({ success: true, action: 'accept', name: member.name, senderName }),
      { status: 200, headers }
    )
  }

  // ── DECLINE ─────────────────────────────────────────────────────
  // Idempotent: already declined → return success
  if (member.consent_status === 'declined') {
    return new Response(
      JSON.stringify({ success: true, action: 'decline', already_declined: true, name: member.name, senderName }),
      { status: 200, headers }
    )
  }

  // Don't overwrite 'blocked'
  if (member.consent_status === 'blocked') {
    return new Response(
      JSON.stringify({ success: true, action: 'decline', name: member.name, senderName }),
      { status: 200, headers }
    )
  }

  const { error: declineErr } = await supabase
    .from('family_members')
    .update({
      consent_status: 'declined',
    })
    .eq('id', member.id)

  if (declineErr) {
    console.error('Decline update failed:', declineErr.message)
    return new Response(
      JSON.stringify({ error: 'Could not process — please try again' }),
      { status: 500, headers }
    )
  }

  console.log(`Consent declined: ${member.email} (${member.name})`)

  return new Response(
    JSON.stringify({ success: true, action: 'decline', name: member.name, senderName }),
    { status: 200, headers }
  )
})
