// ─── Design Tokens ────────────────────────────────────────────
// Sky gradient — indigo → violet → rose → amber (Option A, May 2026)
export const SKY: string[] = [
  '#1E1248', '#2E1660', '#7A2850', '#C07840',
]

// Warm gradient — used for ALL modals, overlays, and onboarding screens
// pink → orange → golden yellow
// Text on WARM backgrounds: WM.title (#3D1020) or WM.sub (#7A3448)
export const WARM: string[] = ['#F06292', '#F48A5A', '#FFD07A']

// Plum gradient — primary CTA buttons across all modals
// deep plum → violet → soft purple (135° diagonal)
// Button text: '#FFFFFF'
export const PLUM: string[] = ['#2D1052', '#5B2D8E', '#8B4FC8']

// Warm modal design tokens — import alongside WARM for consistent modals
export const WM = {
  title:    '#3D1020',   // dark rose — headings, card titles
  sub:      '#7A3448',   // medium rose — body text, subtitles
  cardBg:   'rgba(255,255,255,0.78)',   // card/tile background
  cardBgAlt:'rgba(255,255,255,0.35)',   // lighter pill / badge
  border:   'rgba(255,255,255,0.5)',    // card border
  inputBg:  'rgba(255,255,255,0.85)',   // text inputs
  accent:   '#F06292',                  // selected state border / button bg
  accentBg: 'rgba(240,98,146,0.12)',    // selected tile tint
  btnText:  '#FFD07A',                  // text on dark rose buttons
  footerBg: 'rgba(255,255,255,0.92)',   // sticky footer behind buttons
}

export const C = {
  // Backgrounds — deep violet tones for elevated surfaces (modals, cards)
  bg1: '#1E1248', bg2: '#231050', bg3: '#180C3A',
  // Rose-mauve family
  mauve: '#D4789A', mauveDim: '#2A1448', mauveGlow: '#6A28A840',
  // Accent — warm amber (works beautifully against the rose/crimson sky)
  accent: '#F5CEAA',
  amber: '#E8A87C', amberLight: '#F5CEAA', amberDim: '#8A5A3A',
  white: '#FFFFFF', offWhite: '#F5EAF0',
  grey: '#C490A0', greyDim: '#6A2840',
  error: '#FF8A8A', success: '#8AFFD4',
}

// ─── Supabase credentials ─────────────────────────────────────
export const SUPABASE_URL      = 'https://yfthwahxahjabfbuntys.supabase.co'
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlmdGh3YWh4YWhqYWJmYnVudHlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2MTE4MzAsImV4cCI6MjA5NDE4NzgzMH0.VfnjNTjE7RRux6s4-3icNLQoyhTl_mGYrW3Zlz9e_kE'

// ─── Time-of-day helper ───────────────────────────────────────
export function getTimeOfDay() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}
