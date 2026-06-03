// Shared occasions/celebrations catalogue.
// Used by OnboardingOccasionsScreen, SettingsScreen, and the HomeScreen nudge engine.
//
// A Team design rules:
//   • All traditions presented with equal visual weight — no grouping by religion
//   • Selecting an occasion means "this matters to me or someone I love" — not a religious label
//   • Nudge copy is always family-inclusive: the prompt is about reaching loved ones, never about the user's identity
//   • 'other' key always present so no user feels excluded
//   • dates[] holds the next 2–3 occurrences (ISO YYYY-MM-DD) from Jan 2026 onward
//   • Variable/lunar dates are pre-calculated; update annually
//   • Occasions with no predictable fixed date (birthdays, anniversaries) omit dates[]
//     and are handled by the general rotating nudge engine instead

export interface Occasion {
  key:         string
  label:       string
  icon:        string
  sub:         string
  dates?:      string[]   // next 2–3 occurrences, ISO YYYY-MM-DD, ascending
  familyNudge: string     // shown on HomeScreen when occasion is upcoming — always family-inclusive
}

export const OCCASIONS: Occasion[] = [
  {
    key: 'anniversary', label: 'Anniversaries', icon: '💍',
    sub: 'Wedding, relationship & personal',
    familyNudge: 'An anniversary is coming — leave a message that says what words on the day never quite capture',
  },
  {
    key: 'baisakhi', label: 'Baisakhi', icon: '🌾',
    sub: 'Sikh harvest & new year',
    dates: ['2027-04-14', '2028-04-13'],
    familyNudge: 'Baisakhi is coming — the people in your life who celebrate it would treasure a message from you',
  },
  {
    key: 'birthday', label: 'Birthdays', icon: '🎂',
    sub: 'Celebrate every year',
    familyNudge: "A birthday is always around the corner — leave something they'll open and remember forever",
  },
  {
    key: 'christmas', label: 'Christmas', icon: '⭐',
    sub: 'December 25',
    dates: ['2026-12-25', '2027-12-25', '2028-12-25'],
    familyNudge: "Christmas is coming — the people you love deserve more than a gift. Leave them a message from the heart",
  },
  {
    key: 'dia_muertos', label: 'Día de los Muertos', icon: '🌺',
    sub: 'Honoring loved ones',
    dates: ['2026-11-01', '2027-11-01', '2028-11-01'],
    familyNudge: 'Día de los Muertos is coming — a beautiful time to record something for the people who will one day remember you',
  },
  {
    key: 'diwali', label: 'Diwali', icon: '✨',
    sub: 'Festival of Lights',
    dates: ['2026-10-20', '2027-11-08', '2028-10-28'],
    familyNudge: 'Diwali is coming — if the people you love celebrate the Festival of Lights, let them know you are thinking of them',
  },
  {
    key: 'dussehra', label: 'Dussehra', icon: '🏆',
    sub: 'Hindu — victory celebration',
    dates: ['2026-10-10', '2027-10-29', '2028-10-18'],
    familyNudge: 'Dussehra is coming — a moment of triumph worth marking for someone you love',
  },
  {
    key: 'easter', label: 'Easter', icon: '🌸',
    sub: 'Christian celebration',
    dates: ['2027-03-28', '2028-04-16', '2029-04-01'],
    familyNudge: "Easter is coming — the people in your life who celebrate it would love to hear from you",
  },
  {
    key: 'eid_adha', label: 'Eid al-Adha', icon: '🌙',
    sub: 'Islamic — Feast of Sacrifice',
    dates: ['2026-06-16', '2027-06-06', '2028-05-26'],
    familyNudge: 'Eid al-Adha is coming — leave a message of love and blessing for the people in your life who observe it',
  },
  {
    key: 'eid_fitr', label: 'Eid al-Fitr', icon: '🌟',
    sub: 'Islamic — end of Ramadan',
    dates: ['2027-03-09', '2028-02-26', '2029-02-15'],
    familyNudge: 'Eid al-Fitr is coming — a joyful end to Ramadan. Let the people you love know you are celebrating with them in spirit',
  },
  {
    key: 'fathers_day', label: "Father's Day", icon: '👔',
    sub: 'Honoring fathers & father figures',
    dates: ['2026-06-21', '2027-06-20', '2028-06-18'],
    familyNudge: "Father's Day is coming — leave a message for a father figure in your life before the moment passes",
  },
  {
    key: 'graduation', label: 'Graduation', icon: '🎓',
    sub: 'Academic & personal achievement',
    familyNudge: "Someone you love is reaching a milestone — don't let it pass without leaving them something to carry forward",
  },
  {
    key: 'hanukkah', label: 'Hanukkah', icon: '🕯️',
    sub: 'Jewish Festival of Lights',
    dates: ['2026-12-04', '2027-11-24', '2028-12-12'],
    familyNudge: 'Hanukkah is coming — eight nights of light. Leave a message for someone who celebrates it',
  },
  {
    key: 'just_because', label: 'Just Because', icon: '💛',
    sub: 'Unexpected moments of love',
    familyNudge: "The best messages arrive when no one is expecting them — leave something for someone you love, just because",
  },
  {
    key: 'kwanzaa', label: 'Kwanzaa', icon: '🌍',
    sub: 'African American cultural celebration',
    dates: ['2026-12-26', '2027-12-26', '2028-12-26'],
    familyNudge: 'Kwanzaa is coming — a celebration of heritage and community. Let someone you love know you honour what they honour',
  },
  {
    key: 'lohri', label: 'Lohri', icon: '🔥',
    sub: 'Punjabi winter harvest',
    dates: ['2027-01-13', '2028-01-13', '2029-01-13'],
    familyNudge: 'Lohri is coming — a warm celebration for someone you love who marks it',
  },
  {
    key: 'lunar_new_year', label: 'Lunar New Year', icon: '🏮',
    sub: 'Chinese, Korean, Vietnamese & others',
    dates: ['2027-01-26', '2028-02-13', '2029-02-02'],
    familyNudge: 'Lunar New Year is coming — a fresh start. Leave a message of joy and good wishes for someone who celebrates it',
  },
  {
    key: 'midsummer', label: 'Midsummer', icon: '☀️',
    sub: 'Scandinavian summer solstice',
    dates: ['2026-06-21', '2027-06-21', '2028-06-21'],
    familyNudge: 'Midsummer is coming — the longest days of the year. Leave a message full of warmth for someone you love',
  },
  {
    key: 'mothers_day', label: "Mother's Day", icon: '💐',
    sub: 'Honoring mothers & mother figures',
    dates: ['2027-05-09', '2028-05-14', '2029-05-13'],
    familyNudge: "Mother's Day is coming — the most important messages are the ones we mean to send but never do. Leave one now",
  },
  {
    key: 'navratri', label: 'Navratri', icon: '💃',
    sub: 'Hindu — nine nights of celebration',
    dates: ['2026-10-01', '2027-10-20', '2028-10-09'],
    familyNudge: 'Navratri is coming — nine nights of joy. A perfect time to leave a message for someone who celebrates it',
  },
  {
    key: 'new_baby', label: 'New Baby', icon: '👶',
    sub: 'Welcoming a new life',
    familyNudge: "A new life is a new reason to leave a message — record something for the little one who hasn't arrived yet",
  },
  {
    key: 'new_year', label: 'New Year', icon: '🎆',
    sub: 'January 1 celebration',
    dates: ['2027-01-01', '2028-01-01', '2029-01-01'],
    familyNudge: "New Year is coming — the best resolution is leaving the people you love something to carry into the year ahead",
  },
  {
    key: 'nowruz', label: 'Nowruz', icon: '🌱',
    sub: 'Persian New Year — spring equinox',
    dates: ['2027-03-20', '2028-03-20', '2029-03-20'],
    familyNudge: 'Nowruz is coming — Persian New Year and the first day of spring. Leave a message of renewal for someone you love',
  },
  {
    key: 'obon', label: 'Obon', icon: '🍃',
    sub: 'Japanese — honoring ancestors',
    dates: ['2026-08-13', '2027-08-13', '2028-08-13'],
    familyNudge: 'Obon is coming — a time to honour those who came before. Leave a message that will be treasured long after you are gone',
  },
  {
    key: 'passover', label: 'Passover', icon: '📜',
    sub: 'Jewish — liberation & freedom',
    dates: ['2027-04-01', '2028-04-20', '2029-04-09'],
    familyNudge: 'Passover is coming — a time of remembrance and freedom. Leave a message for someone in your life who observes it',
  },
  {
    key: 'personal', label: 'Personal Milestones', icon: '🌈',
    sub: 'Your own special moments',
    familyNudge: "Life's biggest moments deserve a message — leave something for someone you love before the milestone passes",
  },
  {
    key: 'pongal', label: 'Pongal', icon: '🌻',
    sub: 'Tamil harvest festival',
    dates: ['2027-01-14', '2028-01-14', '2029-01-14'],
    familyNudge: 'Pongal is coming — a harvest of gratitude. Leave a warm message for someone who celebrates it',
  },
  {
    key: 'raksha_bandhan', label: 'Raksha Bandhan', icon: '🪢',
    sub: 'Sibling bond celebration',
    dates: ['2026-08-09', '2027-08-28', '2028-08-17'],
    familyNudge: 'Raksha Bandhan is coming — a celebration of the bond between siblings. Leave a message for a brother or sister you love',
  },
  {
    key: 'retirement', label: 'Retirement', icon: '🌅',
    sub: "Honoring a life's work",
    familyNudge: "Someone you love has earned their rest — leave them a message that honours everything they have given",
  },
  {
    key: 'rosh_hashanah', label: 'Rosh Hashanah', icon: '🍎',
    sub: 'Jewish New Year',
    dates: ['2026-09-11', '2027-10-01', '2028-09-20'],
    familyNudge: 'Rosh Hashanah is coming — the Jewish New Year. Leave a message of blessing for someone who observes it',
  },
  {
    key: 'st_patricks', label: "St. Patrick's Day", icon: '🍀',
    sub: 'Irish cultural celebration',
    dates: ['2027-03-17', '2028-03-17', '2029-03-17'],
    familyNudge: "St. Patrick's Day is coming — leave a message full of warmth for someone with Irish roots or Irish heart",
  },
  {
    key: 'sukkot', label: 'Sukkot', icon: '🌿',
    sub: 'Jewish harvest festival',
    dates: ['2026-09-16', '2027-10-06', '2028-09-25'],
    familyNudge: 'Sukkot is coming — a time of harvest and gratitude. Leave a message for someone in your life who observes it',
  },
  {
    key: 'thanksgiving', label: 'Thanksgiving', icon: '🍂',
    sub: 'Harvest celebration',
    dates: ['2026-10-12', '2026-11-26', '2027-10-11', '2027-11-25'],
    familyNudge: 'Thanksgiving is coming — the people you are grateful for deserve to hear it. Leave them a message',
  },
  {
    key: 'valentines', label: "Valentine's Day", icon: '💌',
    sub: 'Love & friendship',
    dates: ['2027-02-14', '2028-02-14', '2029-02-14'],
    familyNudge: "Valentine's Day is coming — love isn't just for partners. Leave a message for anyone you cherish",
  },
  {
    key: 'vesak', label: 'Vesak / Buddha Day', icon: '🪷',
    sub: "Buddha's birth & enlightenment",
    dates: ['2026-05-23', '2027-05-12', '2028-05-01'],
    familyNudge: 'Vesak is coming — a day of peace and compassion. Leave a message of mindfulness for someone you love',
  },
  {
    key: 'yom_kippur', label: 'Yom Kippur', icon: '📖',
    sub: 'Jewish Day of Atonement',
    dates: ['2026-09-20', '2027-10-10', '2028-09-29'],
    familyNudge: 'Yom Kippur is coming — a day of reflection. Leave a message for someone in your life who observes it',
  },
]

export const OCCASIONS_MAP: Record<string, Occasion> =
  Object.fromEntries(OCCASIONS.map(o => [o.key, o]))

// ── Relationship-based occasion suggestions ───────────────────────────────────
// Returns occasion keys recommended for a given relationship type.
// Relationship-specific occasions come first, then universals, then anything
// the user has already selected in their own profile (so the suggestion modal
// gives a complete, personalised picture of what's relevant for this person).

const UNIVERSAL_OCCASION_KEYS = ['birthday', 'christmas', 'new_year', 'just_because']

const RELATIONSHIP_OCCASION_KEYS: Record<string, string[]> = {
  Husband: ['anniversary', 'valentines', 'fathers_day', 'thanksgiving', 'christmas', 'new_year'],
  Wife:    ['anniversary', 'valentines', 'mothers_day', 'thanksgiving', 'christmas', 'new_year'],
  Partner: ['anniversary', 'valentines', 'thanksgiving', 'christmas', 'new_year'],
  Child:   ['graduation', 'personal', 'thanksgiving'],
  Mother:  ['mothers_day', 'birthday', 'christmas', 'new_year', 'just_because', 'thanksgiving'],
  Father:  ['fathers_day', 'birthday', 'christmas', 'new_year', 'just_because', 'thanksgiving'],
  Brother: ['raksha_bandhan', 'personal', 'birthday', 'christmas', 'new_year'],
  Sister:  ['raksha_bandhan', 'valentines', 'personal', 'birthday', 'christmas', 'new_year'],
  Friend:  ['valentines', 'personal'],
  Other:   ['personal'],
  // Backward compatibility — existing DB rows with old values still get suggestions
  Spouse:  ['anniversary', 'valentines', 'mothers_day', 'fathers_day', 'thanksgiving'],
  Parent:  ['mothers_day', 'fathers_day', 'thanksgiving'],
  Sibling: ['raksha_bandhan', 'personal'],
}

export function getSuggestedOccasionKeys(
  relationship: string,
  userOccasionKeys: string[] = [],
): string[] {
  const relSpecific = RELATIONSHIP_OCCASION_KEYS[relationship] ?? []
  // Merge: relationship-specific → universals → user's existing occasions
  const combined = [...new Set([...relSpecific, ...UNIVERSAL_OCCASION_KEYS, ...userOccasionKeys])]
  // Guard: only return keys that exist in the catalogue
  return combined.filter(k => !!OCCASIONS_MAP[k])
}

// ── Upcoming occasion helper ──────────────────────────────────────────────────
// Returns occasions from the user's selected keys that fall within `daysAhead`,
// sorted by proximity (soonest first).
// Occasions without dates[] (birthdays, anniversaries, etc.) are excluded —
// they are handled by the general rotating nudge engine.

export interface UpcomingOccasion {
  occasion:  Occasion
  nextDate:  string   // ISO YYYY-MM-DD
  daysUntil: number
}

export function getUpcomingOccasions(
  userKeys: string[],
  daysAhead = 60,
): UpcomingOccasion[] {
  const today     = new Date()
  today.setHours(0, 0, 0, 0)
  const cutoff    = new Date(today.getTime() + daysAhead * 24 * 60 * 60 * 1000)
  const results: UpcomingOccasion[] = []

  for (const key of userKeys) {
    const occ = OCCASIONS_MAP[key]
    if (!occ || !occ.dates?.length) continue

    for (const iso of occ.dates) {
      const d = new Date(iso + 'T00:00:00')
      if (d >= today && d <= cutoff) {
        const daysUntil = Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
        results.push({ occasion: occ, nextDate: iso, daysUntil })
        break   // only the nearest occurrence per occasion
      }
    }
  }

  return results.sort((a, b) => a.daysUntil - b.daysUntil)
}

// ── Occasion → relevant relationships (for name injection) ────────────────────
// Lists which family relationships are most meaningful for each occasion key.
// First match wins — priority order matters.
const OCCASION_RELATIONSHIPS: Record<string, string[]> = {
  valentines:      ['Husband', 'Wife', 'Partner', 'Spouse', 'Sister', 'Friend'],
  anniversary:     ['Husband', 'Wife', 'Partner', 'Spouse'],
  mothers_day:     ['Mother', 'Parent', 'Wife', 'Spouse'],
  fathers_day:     ['Father', 'Parent', 'Husband', 'Spouse'],
  raksha_bandhan:  ['Brother', 'Sister', 'Sibling'],
  graduation:      ['Child'],
  birthday:        ['Husband', 'Wife', 'Partner', 'Spouse', 'Child', 'Mother', 'Father', 'Parent', 'Brother', 'Sister', 'Sibling', 'Friend'],
  christmas:       ['Husband', 'Wife', 'Partner', 'Spouse', 'Child', 'Mother', 'Father', 'Parent', 'Brother', 'Sister', 'Sibling', 'Friend'],
  new_year:        ['Husband', 'Wife', 'Partner', 'Spouse', 'Child', 'Mother', 'Father', 'Parent', 'Brother', 'Sister', 'Sibling', 'Friend'],
  thanksgiving:    ['Husband', 'Wife', 'Partner', 'Spouse', 'Child', 'Mother', 'Father', 'Parent'],
  hanukkah:        ['Husband', 'Wife', 'Partner', 'Spouse', 'Child', 'Mother', 'Father', 'Parent', 'Brother', 'Sister', 'Sibling'],
  diwali:          ['Husband', 'Wife', 'Partner', 'Spouse', 'Child', 'Mother', 'Father', 'Parent', 'Brother', 'Sister', 'Sibling'],
  eid_fitr:        ['Husband', 'Wife', 'Partner', 'Spouse', 'Child', 'Mother', 'Father', 'Parent', 'Brother', 'Sister', 'Sibling'],
  eid_adha:        ['Husband', 'Wife', 'Partner', 'Spouse', 'Child', 'Mother', 'Father', 'Parent', 'Brother', 'Sister', 'Sibling'],
  lunar_new_year:  ['Husband', 'Wife', 'Partner', 'Spouse', 'Child', 'Mother', 'Father', 'Parent', 'Brother', 'Sister', 'Sibling'],
}

// Personalized nudge copy — uses {name} when a family member is matched.
// Keys must map 1-to-1 with occasion keys where name injection makes sense.
const PERSONALIZED_NUDGE: Record<string, {
  today: (n: string) => string
  tomorrow: (n: string) => string
  week: (n: string, d: number) => string
  month: (n: string) => string
  general: (n: string) => string
}> = {
  valentines: {
    today:   n => `Today is Valentine's Day — have you sent something to ${n} yet?`,
    tomorrow: n => `Valentine's Day is tomorrow — ${n} would love to hear from you`,
    week:    (n, d) => `Valentine's Day is in ${d} days — leave a love note for ${n} before the moment passes`,
    month:   n => `Valentine's Day is coming — send something special to ${n}`,
    general: n => `Valentine's Day is on its way — ${n} would treasure a message from you`,
  },
  anniversary: {
    today:   n => `Today is your anniversary with ${n} — have they heard from you?`,
    tomorrow: n => `Your anniversary with ${n} is tomorrow — leave them a message tonight`,
    week:    (n, d) => `Your anniversary with ${n} is in ${d} days — start something meaningful now`,
    month:   n => `Your anniversary with ${n} is coming — leave a message that says what words on the day never quite capture`,
    general: n => `An anniversary with ${n} is on the horizon — the best messages take a little time`,
  },
  mothers_day: {
    today:   n => `Today is Mother's Day — has ${n} heard from you?`,
    tomorrow: n => `Mother's Day is tomorrow — leave something for ${n} before the day arrives`,
    week:    (n, d) => `Mother's Day is in ${d} days — ${n} would treasure a message from you`,
    month:   n => `Mother's Day is coming — the most important messages are the ones we mean to send to ${n} but never do`,
    general: n => `Mother's Day is on its way — leave something for ${n} before the moment passes`,
  },
  fathers_day: {
    today:   n => `Today is Father's Day — has ${n} heard from you?`,
    tomorrow: n => `Father's Day is tomorrow — leave a message for ${n} tonight`,
    week:    (n, d) => `Father's Day is in ${d} days — ${n} would love to hear from you`,
    month:   n => `Father's Day is coming — leave ${n} a message before the day sneaks up on you`,
    general: n => `Father's Day is on its way — ${n} deserves to hear how much they mean to you`,
  },
  raksha_bandhan: {
    today:   n => `Today is Raksha Bandhan — have you left something for ${n}?`,
    tomorrow: n => `Raksha Bandhan is tomorrow — leave a message for ${n} tonight`,
    week:    (n, d) => `Raksha Bandhan is in ${d} days — leave something for ${n} before the moment passes`,
    month:   n => `Raksha Bandhan is coming — a perfect time to record something for ${n}`,
    general: n => `Raksha Bandhan is on its way — ${n} would treasure a message from you`,
  },
  graduation: {
    today:   n => `Today is ${n}'s big day — have they heard from you?`,
    tomorrow: n => `${n}'s graduation is tomorrow — leave them something to carry forward`,
    week:    (n, d) => `${n}'s graduation is in ${d} days — leave something they'll keep forever`,
    month:   n => `${n} is reaching a milestone — don't let it pass without leaving them something to carry forward`,
    general: n => `${n} has a big moment coming — the best messages take a little time to write`,
  },
}

// ── Find the best-matching family member name for an occasion ─────────────────
export function findMemberForOccasion(
  occasionKey: string,
  familyMembers: { name: string; relationship: string }[],
): string | null {
  const preferred = OCCASION_RELATIONSHIPS[occasionKey]
  if (!preferred || familyMembers.length === 0) return null
  for (const rel of preferred) {
    const match = familyMembers.find(m => m.relationship === rel)
    if (match) return match.name
  }
  return null
}

// ── Proximity-aware nudge builder ─────────────────────────────────────────────
// Returns a HomeScreen nudge object for the closest upcoming occasion.
// Tone escalates as the occasion approaches.
// Pass familyMembers to enable name-personalised copy.

export function buildOccasionNudge(
  upcoming: UpcomingOccasion,
  familyMembers: { name: string; relationship: string }[] = [],
): {
  icon: string; q: string; cta: string; screen: string
} {
  const { occasion, daysUntil } = upcoming
  const label = occasion.label
  const name  = findMemberForOccasion(occasion.key, familyMembers)
  const tmpl  = name ? PERSONALIZED_NUDGE[occasion.key] : null

  let q: string
  if (tmpl && name) {
    if      (daysUntil === 0) q = tmpl.today(name)
    else if (daysUntil === 1) q = tmpl.tomorrow(name)
    else if (daysUntil <= 7)  q = tmpl.week(name, daysUntil)
    else if (daysUntil <= 30) q = tmpl.month(name)
    else                      q = tmpl.general(name)
  } else {
    if      (daysUntil === 0) q = `Today is ${label} — have the people you love heard from you?`
    else if (daysUntil === 1) q = `${label} is tomorrow — is there a message waiting to be sent?`
    else if (daysUntil <= 7)  q = `${label} is in ${daysUntil} days — the people who matter most deserve to hear from you`
    else if (daysUntil <= 30) q = occasion.familyNudge
    else                      q = `${label} is coming up — a perfect time to leave a message for someone you love`
  }

  const cta =
    name && daysUntil <= 7  ? `Leave ${name} a message before the moment passes` :
    daysUntil <= 7          ? 'Leave a message before the moment passes' :
    name && daysUntil <= 30 ? `Record something special for ${name}` :
    daysUntil <= 30         ? 'Record something special for someone you love' :
                              'Start early — the best messages take a little time'

  return { icon: occasion.icon, q, cta, screen: 'Memories' }
}
