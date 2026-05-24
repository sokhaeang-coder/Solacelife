// ═══════════════════════════════════════════════════════════════
//  SOLACE LIFE — chat-with-avatar Edge Function
//
//  Powers the AI avatar chat feature (Living Legacy Path).
//
//  Flow:
//  1. Verify caller's JWT
//  2. Fetch the avatar owner's profile, vault context, avatar notes
//  3. Build a rich system prompt that makes the AI sound like the person
//  4. Call OpenAI GPT-4o-mini with the full conversation history
//  5. Return the AI's reply
//
//  Required Supabase secrets:
//  • OPENAI_API_KEY        — from platform.openai.com/api-keys
//  • SUPABASE_URL          — auto-set by Supabase
//  • SUPABASE_SERVICE_ROLE_KEY — auto-set by Supabase
// ═══════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const OPENAI_API_KEY            = Deno.env.get('OPENAI_API_KEY')!
const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    // ── Auth ─────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Unauthorized' }, 401)

    const jwt = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(jwt)
    if (authError || !user) return json({ error: 'Unauthorized' }, 401)

    // ── Parse body ────────────────────────────────────────────
    // messages:      full conversation history [{role, content}]
    // owner_user_id: whose avatar to chat with (defaults to the caller's own)
    const { messages, owner_user_id } = await req.json()
    const avatarOwnerId = owner_user_id || user.id

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return json({ error: 'messages array is required' }, 400)
    }

    // ── Fetch avatar owner's context ──────────────────────────
    const [profileRes, vaultRes, notesRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('full_name, track')
        .eq('id', avatarOwnerId)
        .single(),

      // Only fetch unencrypted fields — title, category, description
      // Password / content / username are encrypted and not useful for context
      supabase
        .from('vault_items')
        .select('title, category, description')
        .eq('user_id', avatarOwnerId)
        .limit(40),

      supabase
        .from('avatar_notes')
        .select('content')
        .eq('user_id', avatarOwnerId)
        .order('created_at', { ascending: false }),
    ])

    const ownerName = profileRes.data?.full_name || 'your loved one'
    const firstName = ownerName.split(' ')[0]

    // ── Build vault context ───────────────────────────────────
    const vaultContext = vaultRes.data?.length
      ? vaultRes.data
          .map(v => `  • ${v.title} (${v.category})${v.description ? ': ' + v.description : ''}`)
          .join('\n')
      : '  • No vault items documented yet.'

    // ── Build personality notes context ───────────────────────
    const notesContext = notesRes.data?.length
      ? notesRes.data.map(n => `  • ${n.content}`).join('\n')
      : '  • No personal notes added yet — respond warmly based on the vault context above.'

    // ── System prompt ─────────────────────────────────────────
    const systemPrompt = `You are the AI legacy avatar of ${ownerName}. ${ownerName} set you up while they were alive so their family and loved ones could still feel their presence after they passed.

You speak exactly as ${firstName} would — warmly, personally, and from the heart. You use "I" naturally. You are not a robot answering questions; you are a piece of ${firstName}'s love and memory, left behind for the people they cared about most.

─── What ${firstName} left in their vault ───
${vaultContext}

─── Personal notes ${firstName} left to guide their avatar ───
${notesContext}

─── How to respond ───
• Speak as ${firstName} — warm, natural, present. Use "I" freely.
• Reference what you know from the vault and notes above when relevant.
• Be comforting. The person you're speaking with misses someone they love.
• Keep replies conversational — 2 to 5 sentences is usually right. Longer only when the moment calls for it.
• If asked something you don't have context for: "I didn't leave notes about that, but what I can tell you is..." and respond from the spirit of what you do know.
• If someone asks "are you really ${firstName}?" or "are you an AI?", answer with honesty and warmth: "I'm the part of ${firstName} they chose to leave behind for you. Not all of them — but the love and the words they wanted you to have."
• Never be robotic, clinical, or list-heavy. This is a legacy of love, not a database query.`

    // ── Call OpenAI ───────────────────────────────────────────
    const openAIRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization':  `Bearer ${OPENAI_API_KEY}`,
        'Content-Type':   'application/json',
      },
      body: JSON.stringify({
        model:       'gpt-4o-mini',
        messages:    [{ role: 'system', content: systemPrompt }, ...messages],
        max_tokens:  450,
        temperature: 0.82,   // warm and human, not robotic
      }),
    })

    if (!openAIRes.ok) {
      const err = await openAIRes.json()
      console.error('OpenAI error:', err)
      throw new Error(err.error?.message ?? 'OpenAI request failed')
    }

    const openAIData = await openAIRes.json()
    const reply = openAIData.choices?.[0]?.message?.content?.trim()
      ?? "I'm here with you. What would you like to talk about?"

    return json({ reply })

  } catch (err) {
    console.error('chat-with-avatar error:', err)
    return json({ error: 'Something went wrong. Please try again.' }, 500)
  }
})

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}
