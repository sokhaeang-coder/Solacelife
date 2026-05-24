// ═══════════════════════════════════════════════════════════════
//  SOLACE LIFE — Currency Detection & Price Display
//
//  Two plans, same nominal price in USD and CAD:
//    Annual  → $49 /year
//    Legacy  → $149 /year
//
//  Currency detection is used for the display label only (USD / CAD).
//  Both currencies charge the same dollar amount — simplified pricing
//  per A Team unanimous decision (May 2026).
// ═══════════════════════════════════════════════════════════════

import * as Localization from 'expo-localization'

export type Currency = 'usd' | 'cad'

// Canadian locale region codes
const CA_REGIONS = new Set(['CA'])

// Canadian timezones as a fallback signal
const CA_TIMEZONES = new Set([
  'America/Toronto', 'America/Vancouver', 'America/Edmonton',
  'America/Winnipeg', 'America/Halifax', 'America/St_Johns',
  'America/Regina', 'America/Whitehorse', 'America/Yellowknife',
  'America/Iqaluit', 'America/Moncton', 'America/Glace_Bay',
  'America/Goose_Bay', 'America/Creston', 'America/Dawson',
  'America/Dawson_Creek', 'America/Fort_Nelson', 'America/Rankin_Inlet',
  'America/Resolute', 'America/Swift_Current', 'America/Thunder_Bay',
])

/**
 * Detects the user's currency from device locale and timezone.
 * Returns 'cad' for Canadian users, 'usd' for everyone else.
 * Used for display label only — prices are identical in both currencies.
 */
export function detectCurrency(): Currency {
  try {
    const locales = Localization.getLocales()
    for (const locale of locales) {
      if (locale.regionCode && CA_REGIONS.has(locale.regionCode)) return 'cad'
    }
    const timezone = Localization.getCalendars()[0]?.timeZone ?? ''
    if (CA_TIMEZONES.has(timezone)) return 'cad'
  } catch {
    // expo-localization unavailable — default to USD
  }
  return 'usd'
}

export interface PlanPrice {
  display: string   // e.g. "$49"
  period:  string   // e.g. "/year"
  amount:  number   // numeric, in dollars
  label:   string   // "USD" or "CAD"
}

// Prices are identical in USD and CAD — same nominal amount, different label.
const PRICES: Record<string, PlanPrice> = {
  annual: { display: '$49',  period: '/year',    amount: 49,  label: '' },
  legacy: { display: '$149', period: 'one-time', amount: 149, label: '' },
}

/**
 * Returns display price for a plan key.
 * The label field is filled in dynamically based on detected currency.
 */
export function getPlanPrice(planKey: string, currency: Currency): PlanPrice {
  const base = PRICES[planKey]
  if (!base) return { display: '—', period: '', amount: 0, label: currency.toUpperCase() }
  return { ...base, label: currency.toUpperCase() }
}

/**
 * Returns a short currency tag, e.g. "USD" or "CAD".
 */
export function currencyTag(currency: Currency): string {
  return currency.toUpperCase()
}
