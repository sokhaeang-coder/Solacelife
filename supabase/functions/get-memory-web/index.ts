// ═══════════════════════════════════════════════════════════════
//  SOLACE LIFE — get-memory-web Edge Function
//
//  Public endpoint — no auth required.
//  Called by the web memory viewer (landing/memory.html).
//
//  GET  /functions/v1/get-memory-web?token=<web_access_token>
//
//  Returns:
//    {
//      success: true,
//      memory: {
//        title, type, personal_note, scheduled_date,
//        sender_name, recipient_name,
//        media_url,        // signed URL if media exists (60 min expiry)
//        view_count,       // how many times this token has been viewed
//      }
//    }
//
//  Side effect: increments web_view_count on each call.
//  After 3 views the web viewer prompts the recipient to create a free account.
// ═══════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL           = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (req.method !== 'GET') {
    return json({ success: false, error: 'Method not allowed' }, 405)
  }

  // ── Extract token from query string ──────────────────────────
  const url   = new URL(req.url)
  const token = url.searchParams.get('token')

  if (!token) {
    return json({ success: false, error: 'Missing token' }, 400)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE)

  // ── Look up the delivery by web_access_token ─────────────────
  const { data: delivery, error: fetchError } = await supabase
    .from('scheduled_deliveries')
    .select(`
      id,
      user_id,
      web_view_count,
      message,
      scheduled_date,
      memories (
        id,
        title,
        type,
        file_path,
        content,
        created_at
      ),
      family_members (
        name
      )
    `)
    .eq('web_access_token', token)
    .eq('status', 'delivered')
    .single()

  if (fetchError || !delivery) {
    console.error('Token lookup failed:', fetchError?.message ?? 'no row')
    return json({ success: false, error: 'Memory not found or not yet delivered' }, 404)
  }

  // ── Fetch sender name separately (user_id → profiles) ────────
  const { data: profileData } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', delivery.user_id)
    .single()
  const senderName = profileData?.full_name ?? 'Someone who loves you'

  // ── Increment view count ──────────────────────────────────────
  const newViewCount = (delivery.web_view_count ?? 0) + 1
  await supabase
    .from('scheduled_deliveries')
    .update({ web_view_count: newViewCount })
    .eq('id', delivery.id)

  // ── Generate signed media URL if media exists ─────────────────
  let mediaUrl: string | null = null
  const filePath = (delivery.memories as any)?.file_path

  if (filePath) {
    const { data: signed } = await supabase.storage
      .from('memories')
      .createSignedUrl(filePath, 3600) // 1 hour expiry
    mediaUrl = signed?.signedUrl ?? null
  }

  // ── Build response ────────────────────────────────────────────
  const memory = delivery.memories as any
  const response = {
    success:   true,
    view_count: newViewCount,
    memory: {
      title:          memory?.title        ?? 'A memory for you',
      type:           memory?.type         ?? 'note',
      content:        memory?.content      ?? null,
      personal_note:  (delivery as any).message ?? null,
      scheduled_date: delivery.scheduled_date,
      recorded_date:  memory?.created_at   ?? null,
      sender_name:    senderName,
      recipient_name: (delivery.family_members as any)?.name   ?? 'You',
      media_url:      mediaUrl,
    }
  }

  return json(response, 200)
})


// ── Helpers ───────────────────────────────────────────────────
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
