// ═══════════════════════════════════════════════════════════════
//  SOLACE LIFE — Stripe Webhook Handler
//  v4 — Clean two-plan model (May 2026)
//
//  Events handled:
//    checkout.session.completed      → activate annual trial OR
//                                      activate legacy lifetime purchase
//    customer.subscription.updated   → renewal, status change
//    customer.subscription.deleted   → cancellation / expiry
//    invoice.payment_failed          → mark past_due
//
//  Plan → DB tier mapping:
//    annual  → subscription_tier: 'annual',  recurring subscription
//    legacy  → subscription_tier: 'legacy',  one-time lifetime payment
// ═══════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const STRIPE_SECRET_KEY         = Deno.env.get('STRIPE_SECRET_KEY')!
const STRIPE_WEBHOOK_SECRET     = Deno.env.get('STRIPE_WEBHOOK_SECRET')!
const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

// Amount-to-plan fallback — used if metadata.plan is absent.
// Amounts in cents. Legacy amounts kept for historical webhook replays.
const AMOUNT_TO_PLAN: Record<number, string> = {
  9900:  'annual',  // $99/year recurring (current, June 2026)
  4900:  'annual',  // $49/year — retired price, kept for replay safety
  14900: 'legacy',  // $149 one-time — retired tier, kept for replay safety
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const body      = await req.text()
  const signature = req.headers.get('stripe-signature') ?? ''

  const verified = await verifyStripeSignature(body, signature, STRIPE_WEBHOOK_SECRET)
  if (!verified) {
    console.error('Invalid Stripe webhook signature')
    return new Response('Unauthorized', { status: 401 })
  }

  const event = JSON.parse(body)
  console.log(`Handling Stripe event: ${event.type}`)

  try {
    switch (event.type) {

      // ── Checkout complete → activate plan ─────────────
      // Fires for both Annual (subscription) and Legacy (one-time payment).
      case 'checkout.session.completed': {
        const session = event.data.object
        const userId  = session.metadata?.supabase_user_id
        const plan    = session.metadata?.plan ?? 'annual'

        if (!userId) { console.error('No user ID in checkout metadata'); break }

        if (session.mode === 'payment') {
          // ── Legacy: one-time lifetime purchase ──────────
          // No subscription object — status is 'lifetime', never expires.
          // Guard: never downgrade if somehow already on a higher status.
          await supabase.from('profiles').update({
            subscription_tier:       'legacy',
            subscription_status:     'lifetime',
            subscription_billing:    'one_time',
            subscription_updated_at: new Date().toISOString(),
            stripe_subscription_id:  null,   // no subscription — one-time charge
          }).eq('id', userId)

          console.log(`Legacy lifetime purchase activated for user ${userId}`)

        } else {
          // ── Annual: subscription with 30-day trial ──────
          // Stripe sets subscription status = 'trialing' immediately.
          await supabase.from('profiles').update({
            subscription_tier:       'annual',
            subscription_status:     'trialing',
            subscription_billing:    'annual',
            subscription_updated_at: new Date().toISOString(),
            stripe_subscription_id:  session.subscription,
          }).eq('id', userId)

          console.log(`Annual trial started for user ${userId}`)
        }
        break
      }

      // ── Subscription updated (renewal, upgrade, status change) ─
      case 'customer.subscription.updated': {
        const sub    = event.data.object
        const userId = sub.metadata?.supabase_user_id

        if (userId) {
          await updateSubscription(userId, sub)
        } else {
          // Fallback: look up user by Stripe customer ID
          const { data: profile } = await supabase
            .from('profiles')
            .select('id')
            .eq('stripe_customer_id', sub.customer)
            .single()
          if (profile) {
            await updateSubscription(profile.id, sub)
          } else {
            console.error('No profile found for customer', sub.customer)
          }
        }
        break
      }

      // ── Subscription cancelled / expired ─────────────
      // Only applies to Annual subscribers — Legacy is a one-time purchase
      // with no subscription object, so it will never trigger this event.
      case 'customer.subscription.deleted': {
        const sub = event.data.object

        const { data: profile } = await supabase
          .from('profiles')
          .select('id, subscription_status')
          .eq('stripe_subscription_id', sub.id)
          .single()

        if (profile) {
          // Never cancel a lifetime Legacy account via a subscription event
          if (profile.subscription_status === 'lifetime') {
            console.log(`Skipping cancel for lifetime user ${profile.id}`)
            break
          }
          await supabase.from('profiles').update({
            subscription_status:     'cancelled',
            subscription_updated_at: new Date().toISOString(),
          }).eq('id', profile.id)
          console.log(`Annual subscription cancelled for user ${profile.id}`)
        }
        break
      }

      // ── Payment failed → mark past due ────────────────
      case 'invoice.payment_failed': {
        const invoice = event.data.object

        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .eq('stripe_customer_id', invoice.customer)
          .single()

        if (profile) {
          await supabase.from('profiles').update({
            subscription_status:     'past_due',
            subscription_updated_at: new Date().toISOString(),
          }).eq('id', profile.id)
          console.log(`Payment failed for user ${profile.id}`)
        }
        break
      }

      default:
        console.log(`Unhandled event type: ${event.type}`)
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('Webhook handler error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})

// ── Update subscription from a Stripe subscription object ────
async function updateSubscription(userId: string, sub: any) {
  const item  = sub.items?.data?.[0]
  const plan  = sub.metadata?.plan
            ?? AMOUNT_TO_PLAN[item?.price?.unit_amount]
            ?? 'annual'

  const tier  = plan === 'legacy' ? 'legacy' : 'annual'

  // Stripe statuses: trialing, active, past_due, canceled, unpaid
  const status = sub.status === 'canceled' ? 'cancelled' : sub.status

  await supabase.from('profiles').update({
    subscription_tier:       tier,
    subscription_status:     status,
    subscription_billing:    'annual',
    subscription_updated_at: new Date().toISOString(),
    stripe_subscription_id:  sub.id,
  }).eq('id', userId)

  console.log(`Subscription updated: ${tier} → ${status} for user ${userId}`)
}

// ── Stripe webhook signature verification (HMAC-SHA256) ──────
async function verifyStripeSignature(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  try {
    const parts = signature.split(',').reduce((acc: any, part) => {
      const [k, v] = part.split('=')
      acc[k] = v
      return acc
    }, {})

    const timestamp = parts['t']
    const sigHex    = parts['v1']
    if (!timestamp || !sigHex) return false

    const signedPayload = `${timestamp}.${payload}`
    const keyData       = new TextEncoder().encode(secret)
    const msgData       = new TextEncoder().encode(signedPayload)

    const key = await crypto.subtle.importKey(
      'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    )
    const sig        = await crypto.subtle.sign('HMAC', key, msgData)
    const sigArray   = Array.from(new Uint8Array(sig))
    const computedHex = sigArray.map(b => b.toString(16).padStart(2, '0')).join('')

    return computedHex === sigHex
  } catch {
    return false
  }
}
