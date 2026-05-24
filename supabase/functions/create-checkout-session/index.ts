// ═══════════════════════════════════════════════════════════════
//  SOLACE LIFE — Create Stripe Checkout Session
//  v4 — Clean two-plan model (May 2026)
//
//  Plans:
//    annual  → $49/year recurring, 30-day free trial (USD or CAD)
//    legacy  → $149 one-time lifetime payment          (USD or CAD)
//
//  No monthly billing. No bundles. No add-ons.
// ═══════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const STRIPE_SECRET_KEY         = Deno.env.get('STRIPE_SECRET_KEY')!
const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// ── Stripe Price IDs ─────────────────────────────────────────
// Create four price objects in Stripe Dashboard:
//   Annual USD:  $49/year  → STRIPE_PRICE_ANNUAL_USD
//   Annual CAD:  $49/year  → STRIPE_PRICE_ANNUAL_CAD
//   Legacy USD:  $149/year → STRIPE_PRICE_LEGACY_USD
//   Legacy CAD:  $149/year → STRIPE_PRICE_LEGACY_CAD
// Add each as a Supabase Edge Function secret.
const PRICE_IDS: Record<string, Record<string, string>> = {
  usd: {
    annual: Deno.env.get('STRIPE_PRICE_ANNUAL_USD') ?? 'price_annual_usd_dev',
    legacy: Deno.env.get('STRIPE_PRICE_LEGACY_USD') ?? 'price_legacy_usd_dev',
  },
  cad: {
    annual: Deno.env.get('STRIPE_PRICE_ANNUAL_CAD') ?? 'price_annual_cad_dev',
    legacy: Deno.env.get('STRIPE_PRICE_LEGACY_CAD') ?? 'price_legacy_cad_dev',
  },
}

// ── Return URLs ───────────────────────────────────────────────
const APP_WEB_URL        = Deno.env.get('APP_URL') ?? 'http://localhost:8083'
const NATIVE_SUCCESS_URL = 'solacelife://payment-success?session_id={CHECKOUT_SESSION_ID}'
const NATIVE_CANCEL_URL  = 'solacelife://payment-cancel'
const WEB_SUCCESS_URL    = `${APP_WEB_URL}?payment=success&session_id={CHECKOUT_SESSION_ID}`
const WEB_CANCEL_URL     = `${APP_WEB_URL}?payment=cancelled`

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

Deno.serve(async (req) => {
  // ── CORS ─────────────────────────────────────────────────
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin':  '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  try {
    // ── Auth ──────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Unauthorized' }, 401)

    const jwt = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(jwt)
    if (authError || !user) return json({ error: 'Unauthorized' }, 401)

    // ── Parse request ─────────────────────────────────────
    // plan:     'annual' | 'legacy'
    // platform: 'web' | 'ios' | 'android'
    // currency: 'usd' | 'cad' — detected by app from device locale
    const { plan, platform, currency: rawCurrency } = await req.json()

    const currency: 'usd' | 'cad' = rawCurrency === 'cad' ? 'cad' : 'usd'

    const priceId = PRICE_IDS[currency]?.[plan]
    if (!priceId) return json({ error: `Unknown plan or currency: ${plan}/${currency}` }, 400)

    const successUrl = platform === 'web' ? WEB_SUCCESS_URL : NATIVE_SUCCESS_URL
    const cancelUrl  = platform === 'web' ? WEB_CANCEL_URL  : NATIVE_CANCEL_URL

    // ── Get or create Stripe customer ─────────────────────
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id, full_name')
      .eq('id', user.id)
      .single()

    let customerId: string = profile?.stripe_customer_id

    if (!customerId) {
      const customerRes = await stripePost('customers', {
        email:    user.email,
        name:     profile?.full_name ?? '',
        metadata: { supabase_user_id: user.id },
      })
      customerId = customerRes.id
      await supabase.from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', user.id)
    }

    // ── Build Checkout Session ────────────────────────────
    // Legacy = one-time payment (lifetime access, no recurring billing)
    // Annual = recurring subscription with 30-day free trial
    const isLegacy = plan === 'legacy'

    const sessionParams: Record<string, any> = {
      customer:              customerId,
      mode:                  isLegacy ? 'payment' : 'subscription',
      line_items:            [{ price: priceId, quantity: 1 }],
      success_url:           successUrl,
      cancel_url:            cancelUrl,
      allow_promotion_codes: true,
      metadata: {
        supabase_user_id: user.id,
        plan,
        currency,
      },
    }

    if (isLegacy) {
      // One-time payment: attach metadata to payment intent for webhook lookup
      sessionParams.payment_intent_data = {
        metadata: { supabase_user_id: user.id, plan },
      }
    } else {
      // Annual subscription: 30-day free trial, passed at session level
      // (not on the Price object — Stripe no longer recommends that)
      sessionParams.subscription_data = {
        trial_period_days: 30,
        metadata: { supabase_user_id: user.id, plan, currency },
      }
    }

    const session = await stripePost('checkout/sessions', sessionParams)

    return json({ url: session.url, session_id: session.id })

  } catch (err) {
    console.error('create-checkout-session error:', err)
    return json({ error: String(err) }, 500)
  }
})

// ── Helpers ───────────────────────────────────────────────────
async function stripePost(endpoint: string, body: Record<string, any>) {
  const params = new URLSearchParams()
  flattenForStripe(body, '', params)

  const res = await fetch(`https://api.stripe.com/v1/${endpoint}`, {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  })

  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.message ?? JSON.stringify(data))
  return data
}

function flattenForStripe(obj: any, prefix: string, params: URLSearchParams) {
  for (const [key, value] of Object.entries(obj)) {
    const paramKey = prefix ? `${prefix}[${key}]` : key
    if (value === null || value === undefined) continue
    if (typeof value === 'object' && !Array.isArray(value)) {
      flattenForStripe(value, paramKey, params)
    } else if (Array.isArray(value)) {
      value.forEach((item, i) => {
        if (typeof item === 'object') {
          flattenForStripe(item, `${paramKey}[${i}]`, params)
        } else {
          params.append(`${paramKey}[${i}]`, String(item))
        }
      })
    } else {
      params.append(paramKey, String(value))
    }
  }
}

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type':                'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
