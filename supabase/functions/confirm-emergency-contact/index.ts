// ═══════════════════════════════════════════════════════════════
//  SOLACE LIFE — Confirm Emergency Contact Edge Function
//
//  Handles G2's accept/decline response to being designated as
//  an emergency contact by G1.
//
//  GET /confirm-emergency-contact?token=<emergency_consent_token>&action=accept
//    → sets emergency_consent_status='accepted'
//    → activates is_trusted_contact = true (and is_emergency_contact
//      if it was set to true during designation)
//
//  GET /confirm-emergency-contact?token=<emergency_consent_token>&action=decline
//    → sets emergency_consent_status='declined'
//    → clears is_trusted_contact=false, is_emergency_contact=false,
//      emergency_priority=null
//
//  Both actions are idempotent — clicking twice is safe.
// ═══════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

Deno.serve(async (req) => {
  const url    = new URL(req.url)
  const token  = url.searchParams.get('token')
  const action = url.searchParams.get('action') ?? 'accept'

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

  // ── Find the family member by their emergency consent token ───
  const { data: member, error: fetchErr } = await supabase
    .from('family_members')
    .select('id, name, email, emergency_consent_status, is_emergency_contact, is_trusted_contact, user_id')
    .eq('emergency_consent_token', token)
    .single()

  if (fetchErr || !member) {
    console.error('Emergency consent token not found:', fetchErr?.message)
    return new Response(
      JSON.stringify({ error: 'Invalid or expired link' }),
      { status: 404, headers }
    )
  }

  // ── Fetch sender name for the confirm page ────────────────────
  let senderName: string | null = null
  if (member.user_id) {
    const { data: senderProfile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', member.user_id)
      .single()
    senderName = senderProfile?.full_name ?? null
  }

  // ── ACCEPT ───────────────────────────────────────────────────
  if (action === 'accept') {
    // Idempotent — already accepted
    if (member.emergency_consent_status === 'accepted') {
      return new Response(
        JSON.stringify({
          success: true, action: 'accept',
          already_accepted: true,
          name: member.name, senderName,
        }),
        { status: 200, headers }
      )
    }

    // Activate the flags — is_trusted_contact always set on accept.
    // is_emergency_contact is kept as G1 set it (may be true or false).
    const { error: updateErr } = await supabase
      .from('family_members')
      .update({
        emergency_consent_status: 'accepted',
        is_trusted_contact:       true,
      })
      .eq('id', member.id)

    if (updateErr) {
      console.error('Accept update failed:', updateErr.message)
      return new Response(
        JSON.stringify({ error: 'Could not confirm — please try again' }),
        { status: 500, headers }
      )
    }

    console.log(`Emergency consent accepted: ${member.email} (${member.name})`)

    return new Response(
      JSON.stringify({ success: true, action: 'accept', name: member.name, senderName }),
      { status: 200, headers }
    )
  }

  // ── DECLINE ──────────────────────────────────────────────────
  // Idempotent — already declined
  if (member.emergency_consent_status === 'declined') {
    return new Response(
      JSON.stringify({
        success: true, action: 'decline',
        already_declined: true,
        name: member.name, senderName,
      }),
      { status: 200, headers }
    )
  }

  // Clear all emergency/trusted flags
  const { error: declineErr } = await supabase
    .from('family_members')
    .update({
      emergency_consent_status: 'declined',
      is_trusted_contact:       false,
      is_emergency_contact:     false,
      emergency_priority:       null,
    })
    .eq('id', member.id)

  if (declineErr) {
    console.error('Decline update failed:', declineErr.message)
    return new Response(
      JSON.stringify({ error: 'Could not process — please try again' }),
      { status: 500, headers }
    )
  }

  console.log(`Emergency consent declined: ${member.email} (${member.name})`)

  return new Response(
    JSON.stringify({ success: true, action: 'decline', name: member.name, senderName }),
    { status: 200, headers }
  )
})
