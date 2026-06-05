import { useState, useEffect, useRef } from 'react'
import { Text, View, TouchableOpacity, ScrollView, Animated, Image, StyleSheet, Modal } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as StoreReview from 'expo-store-review'
import { supabase } from '../lib/supabase'
import { C, WARM, WM, getTimeOfDay } from '../lib/constants'
import { s } from '../lib/styles'
import ScreenWrap from '../components/ScreenWrap'
import { getUpcomingOccasions, buildOccasionNudge, findMemberForOccasion } from '../lib/occasions'
import ProfessionalServicesModal from './ProfessionalServicesModal'

// ── Session flag — welcome modal shows once per app launch, never on tab re-focus ──
let welcomeShownThisSession = false

// ── Rotating warm prompts shown when user has family + memories ──────────────
const NUDGE_PROMPTS = [
  { icon: '💭', q: 'Who are you thinking about right now?',          cta: 'Add them to your family list',                  screen: 'Family' },
  { icon: '✉️', q: "Is there something you've been meaning to say?", cta: 'Write a letter — it only takes a minute',       screen: 'Memories' },
  { icon: '🎙️', q: "What's a story only you can tell?",             cta: 'Record a voice memo for the people you love',   screen: 'Memories' },
  { icon: '🎬', q: 'Have you told them lately?',                     cta: 'A video message says more than words',           screen: 'Memories' },
  { icon: '📸', q: "What's a moment worth preserving?",              cta: 'Add a photo album for someone you love',         screen: 'Memories' },
  { icon: '🎂', q: 'Whose birthday is coming up?',                   cta: "Leave them a message they'll treasure forever", screen: 'Memories' },
  { icon: '💍', q: 'Got an anniversary on the horizon?',             cta: 'Leave a love letter set to deliver on the day', screen: 'Memories' },
  { icon: '🎓', q: 'Is someone reaching a milestone soon?',          cta: 'Create a graduation or achievement message',     screen: 'Memories' },
]

export default function HomeScreen({ navigation }: any) {
  const insets = useSafeAreaInsets()

  const [userEmail, setUserEmail]       = useState('')
  const [fullName, setFullName]         = useState('')
  const [profilePhone, setProfilePhone] = useState('')
  const [avatarUrl, setAvatarUrl]       = useState<string | null>(null)
  const [userTrack, setUserTrack]       = useState<string>('remembrance')
  const [counts, setCounts]             = useState({ vault: 0, memories: 0, family: 0 })
  const [vaultStatus, setVaultStatus]   = useState<string>('active')
  const [userOccasionKeys, setUserOccasionKeys] = useState<string[]>([])
  const [familyMembers, setFamilyMembers]       = useState<{ name: string; relationship: string; photo_url: string | null; date_of_birth: string | null }[]>([])
  const [activeAvatarUrls, setNudgeAvatarUrls]   = useState<(string | null)[]>([])
  const [nudgeIndex, setNudgeIndex]     = useState(0)
  const [receivedCount, setReceivedCount] = useState(0)
  const [avatarResponse, setAvatarResponse] = useState<boolean | null | undefined>(undefined)
  const [showReviewCard, setShowReviewCard] = useState(false)
  const [reviewTrigger, setReviewTrigger]   = useState<'trusted_contact' | 'memories'>('memories')
  const [showPartners, setShowPartners]       = useState(false)
  const [showWelcomeModal, setShowWelcomeModal] = useState(false)
  const [welcomeDontShow, setWelcomeDontShow]   = useState(false)
  const fadeAnim    = useRef(new Animated.Value(0)).current
  const nudgeFade   = useRef(new Animated.Value(1)).current
  // Banner animation: gradShift crossfades the two gradient layers (native driver ok — it's opacity)
  // glowAnim drives the shadow pulse (non-native — shadow props can't use native driver)
  const gradShift   = useRef(new Animated.Value(0)).current
  const glowAnim    = useRef(new Animated.Value(0)).current
  const btnShift    = useRef(new Animated.Value(0)).current
  const auroraAnim  = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }).start()
    loadData()

    // Gradient crossfade: 0→1→0 every 4s
    Animated.loop(
      Animated.sequence([
        Animated.timing(gradShift, { toValue: 1, duration: 2000, useNativeDriver: true }),
        Animated.timing(gradShift, { toValue: 0, duration: 2000, useNativeDriver: true }),
      ])
    ).start()

    // Glow pulse: 0→1→0 every 3s (non-native because shadow props live on JS thread)
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 1500, useNativeDriver: false }),
        Animated.timing(glowAnim, { toValue: 0, duration: 1500, useNativeDriver: false }),
      ])
    ).start()

    // Button inner gradient — 5x faster than the banner (400ms per direction vs 2s)
    Animated.loop(
      Animated.sequence([
        Animated.timing(btnShift, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(btnShift, { toValue: 0, duration: 400, useNativeDriver: true }),
      ])
    ).start()

    // Aurora border: slowly cycles gradient colours on the nudge card (pink→gold→purple flow)
    Animated.loop(
      Animated.sequence([
        Animated.timing(auroraAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
        Animated.timing(auroraAnim, { toValue: 0, duration: 1500, useNativeDriver: true }),
      ])
    ).start()
    // Rotate the prompt every 8 seconds
    const interval = setInterval(() => {
      Animated.timing(nudgeFade, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
        setNudgeIndex(i => i + 1)
        Animated.timing(nudgeFade, { toValue: 1, duration: 400, useNativeDriver: true }).start()
      })
    }, 8000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', loadData)
    return unsubscribe
  }, [navigation])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserEmail(user.email || '')
    const [vaultRes, memoriesRes, familyRes, profileRes, occasionsRes, trustedRes] = await Promise.all([
      supabase.from('vault_items').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase.from('memories').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase.from('family_members').select('name, relationship, photo_url, date_of_birth').eq('user_id', user.id),
      supabase.from('profiles').select('vault_status, track, full_name, avatar_url, ai_avatar_interested, phone').eq('id', user.id).single(),
      supabase.from('user_occasions').select('occasion_key').eq('user_id', user.id),
      // Check if any trusted contact has accepted — highest-value review trigger
      supabase.from('family_members')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_trusted_contact', true)
        .eq('consent_status', 'consented'),
    ])
    const memoriesCount        = memoriesRes.count ?? 0
    const trustedAcceptedCount = trustedRes.count  ?? 0
    const familyData = (familyRes.data ?? []) as { name: string; relationship: string; photo_url: string | null; date_of_birth: string | null }[]
    setCounts({ vault: vaultRes.count ?? 0, memories: memoriesCount, family: familyData.length })
    setFamilyMembers(familyData)

    // ── Resolve nudge avatars — occasions + birthdays in pool order ──
    if (familyData.length > 0 && memoriesCount > 0) {
      const occKeys  = (occasionsRes.data ?? []).map((r: any) => r.occasion_key)
      const upcoming = getUpcomingOccasions(occKeys, 90)
      const top3     = upcoming.slice(0, 3)

      // Birthday members within 30 days (same logic as render)
      const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']
      const today = new Date(); today.setHours(0,0,0,0)
      const bdayMembers: typeof familyData = []
      for (const m of familyData) {
        if (!m.date_of_birth) continue
        const parts = m.date_of_birth.split(' ')
        const month = MONTH_NAMES.indexOf(parts[0])
        const day   = parseInt((parts[1] || '').replace(',',''))
        if (month === -1 || isNaN(day)) continue
        let bday = new Date(today.getFullYear(), month, day); bday.setHours(0,0,0,0)
        if (bday < today) bday = new Date(today.getFullYear() + 1, month, day)
        if (Math.round((bday.getTime() - today.getTime()) / 86400000) <= 30) bdayMembers.push(m)
      }

      // Build pool order: [occ0, occ1, occ2, bday0, bday1, ...]
      const poolMembers: (typeof familyData[0] | null)[] = [
        ...top3.map(occ => {
          const name = findMemberForOccasion(occ.occasion.key, familyData)
          return name ? familyData.find(m => m.name === name) ?? null : null
        }),
        ...bdayMembers,
      ]

      const resolvedUrls: (string | null)[] = []
      for (const member of poolMembers) {
        if (member?.photo_url) {
          const { data: signed } = await supabase.storage
            .from('memories').createSignedUrl(member.photo_url, 3600)
          resolvedUrls.push(signed?.signedUrl || null)
        } else {
          resolvedUrls.push(null)
        }
      }
      setNudgeAvatarUrls(resolvedUrls)
    }

    // ── Review card trigger ───────────────────────────────────────────────────
    //  Two conditions, in priority order:
    //  1. Trusted contact accepted + ≥1 memory → highest emotional peak
    //  2. ≥3 memories → engagement floor (fallback)
    //  AsyncStorage ensures the card never re-appears once dismissed.
    // Welcome helper modal — once per session only (module flag resets on app restart)
    if (!welcomeShownThisSession) {
      const welcomeDismissed = await AsyncStorage.getItem('solace_welcome_helper_dismissed')
      if (!welcomeDismissed) {
        welcomeShownThisSession = true
        setShowWelcomeModal(true)
      } else {
        welcomeShownThisSession = true // already permanently dismissed — skip forever this session
      }
    }

    const dismissed = await AsyncStorage.getItem('solace_review_card_dismissed')
    if (!dismissed) {
      if (trustedAcceptedCount > 0 && memoriesCount >= 1) {
        setReviewTrigger('trusted_contact')
        setShowReviewCard(true)
      } else if (memoriesCount >= 3) {
        setReviewTrigger('memories')
        setShowReviewCard(true)
      }
    }
    if (profileRes.data) {
      setVaultStatus(profileRes.data.vault_status || 'active')
      setUserTrack(profileRes.data.track || 'remembrance')
      // Fall back to auth user_metadata if profiles.full_name hasn't been saved yet
      setFullName(profileRes.data.full_name || user.user_metadata?.full_name || '')
      setProfilePhone(profileRes.data.phone || '')
      setAvatarResponse(profileRes.data.ai_avatar_interested ?? null)
      if (profileRes.data.avatar_url) {
        const raw = profileRes.data.avatar_url
        if (raw.startsWith('http')) {
          // Legacy: signed URL stored directly — use as-is until it expires
          setAvatarUrl(raw)
        } else {
          // Current: storage path — generate a fresh signed URL
          const { data: signed } = await supabase.storage
            .from('memories').createSignedUrl(raw, 3600)
          setAvatarUrl(signed?.signedUrl || null)
        }
      } else {
        setAvatarUrl(null)
      }
    }
    if (occasionsRes.data) {
      setUserOccasionKeys(occasionsRes.data.map((r: any) => r.occasion_key))
    }

    // Count received memories — family_members rows where I am the recipient,
    // then scheduled_deliveries for those rows with a date <= today
    const { data: recipientRows } = await supabase
      .from('family_members')
      .select('id')
      .eq('recipient_profile_id', user.id)
    if (recipientRows && recipientRows.length > 0) {
      const memberIds = recipientRows.map((r: any) => r.id)
      const today = new Date().toISOString().split('T')[0]
      const { count } = await supabase
        .from('scheduled_deliveries')
        .select('id', { count: 'exact', head: true })
        .in('family_member_id', memberIds)
        .lte('scheduled_date', today)
      setReceivedCount(count ?? 0)
    } else {
      setReceivedCount(0)
    }
  }

  async function handleAvatarResponse(interested: boolean) {
    setAvatarResponse(interested)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await supabase.from('profiles').update({
          ai_avatar_interested:    interested,
          ai_avatar_interested_at: new Date().toISOString(),
        }).eq('id', user.id)
      }
    } catch (e) {
      console.warn('Avatar response save error:', e)
    }
  }

  const displayName = (fullName && fullName.split(' ')[0]) || 'Friend'
  const timeOfDay = getTimeOfDay()

  // ── Legacy garden — weighted point system ───────────────────────────────────
  // First moment is the hardest step — worth a bonus burst of points.
  // Moments carry the most cumulative weight (soul of the app).
  // Family + vault + profile signals round out the score.
  const firstMemoryPts  = counts.memories >= 1 ? 10 : 0
  const extraMemoryPts  = counts.memories > 1  ? (counts.memories - 1) * 3 : 0
  const firstFamilyPts  = counts.family >= 1   ? 8  : 0
  const extraFamilyPts  = counts.family > 1    ? (counts.family - 1) * 4  : 0
  const vaultPts        = counts.vault * 5
  const photoPts        = avatarUrl     ? 5 : 0
  const namePts         = fullName      ? 2 : 0
  const phonePts        = profilePhone  ? 1 : 0
  const occasionPts     = userOccasionKeys.length > 0 ? 2 : 0
  const activityScore   = firstMemoryPts + extraMemoryPts + firstFamilyPts + extraFamilyPts
                        + vaultPts + photoPts + namePts + phonePts + occasionPts

  const plantStage = activityScore === 0
    ? { emoji: '🌱', stage: 'Just planted',  desc: 'Add your first moment and watch your garden grow' }
    : activityScore < 15
    ? { emoji: '🌿', stage: 'Sprouting',     desc: 'Your legacy is beginning to take root' }
    : activityScore < 35
    ? { emoji: '🌸', stage: 'In bloom',      desc: 'Beautiful — your love letters are flourishing' }
    : activityScore < 65
    ? { emoji: '🌺', stage: 'Full bloom',    desc: 'Your garden is alive with meaning' }
    : { emoji: '🌳', stage: 'Deeply rooted', desc: 'A legacy that will stand for generations' }

  const homeMilestone: { text: string; icon: string; label: string; screen: string } = (() => {
    if (!fullName)            return { text: 'Add your name',                icon: '✍️', label: 'Go to Profile',  screen: 'Settings' }
    if (!avatarUrl)           return { text: 'Add a profile photo',           icon: '📸', label: 'Go to Profile',  screen: 'Settings' }
    if (counts.family === 0)  return { text: 'Add your first family member',  icon: '🫂', label: 'Go to Family',   screen: 'Family' }
    if (counts.memories < 3)  return { text: `Record ${3 - counts.memories} more moment${3 - counts.memories !== 1 ? 's' : ''}`, icon: '🌱', label: 'Go to Moments', screen: 'Memories' }
    if (counts.vault === 0)   return { text: 'Add your first vault file',     icon: '📦', label: 'Go to Vault',    screen: 'Vault' }
    if (counts.memories < 10) return { text: `${10 - counts.memories} moments until your garden blooms`, icon: '🌸', label: 'Go to Moments', screen: 'Memories' }
    return { text: 'Your legacy is growing beautifully', icon: '🌳', label: 'Keep going', screen: 'Memories' }
  })()

  // ── Birthday helpers ──────────────────────────────────────────────────────────
  function upcomingBirthdays(members: typeof familyMembers, daysAhead = 30) {
    const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']
    const today = new Date(); today.setHours(0,0,0,0)
    const results: { member: typeof members[0]; daysUntil: number }[] = []
    for (const m of members) {
      if (!m.date_of_birth) continue
      const parts = m.date_of_birth.split(' ')
      if (parts.length < 2) continue
      const month = MONTH_NAMES.indexOf(parts[0])
      const day   = parseInt(parts[1].replace(',',''))
      if (month === -1 || isNaN(day)) continue
      let bday = new Date(today.getFullYear(), month, day); bday.setHours(0,0,0,0)
      if (bday < today) bday = new Date(today.getFullYear() + 1, month, day)
      const daysUntil = Math.round((bday.getTime() - today.getTime()) / 86400000)
      if (daysUntil <= daysAhead) results.push({ member: m, daysUntil })
    }
    return results.sort((a,b) => a.daysUntil - b.daysUntil)
  }

  function buildBirthdayNudge(name: string, daysUntil: number) {
    const q = daysUntil === 0  ? `Today is ${name}'s birthday — have they heard from you?`
            : daysUntil === 1  ? `${name}'s birthday is tomorrow — leave them a message tonight`
            : daysUntil <= 7   ? `${name}'s birthday is in ${daysUntil} days — leave something they'll treasure forever`
            : `${name}'s birthday is coming up in ${daysUntil} days — don't let it sneak up on you`
    return { icon: '🎂', q, cta: `Leave ${name} a birthday message`, screen: 'Memories' }
  }

  // Which nudge to show:
  // 1. No family yet → onboard them first
  // 2. No memories yet → get them started
  // 3. Up to 3 upcoming occasions (90-day window) → rotate through them
  // 4. Fallback → general rotating prompts
  const upcomingOccasions = counts.family > 0 && counts.memories > 0
    ? getUpcomingOccasions(userOccasionKeys, 90)
    : []
  const occasionNudges = upcomingOccasions.slice(0, 3).map(occ => buildOccasionNudge(occ, familyMembers))
  const bdayNudges     = upcomingBirthdays(familyMembers, 30).map(({ member, daysUntil }) => buildBirthdayNudge(member.name, daysUntil))
  const combinedNudges = [...occasionNudges, ...bdayNudges]
  const nudgePool      = combinedNudges.length > 0 ? combinedNudges : NUDGE_PROMPTS
  const activeNudge    = counts.family === 0
    ? { icon: '💭', q: 'Who are you thinking about right now?', cta: 'Add them — it takes 30 seconds', screen: 'Family' }
    : counts.memories === 0
    ? { icon: '✉️', q: "Is there something you've been meaning to say?", cta: 'Write your first message for someone you love', screen: 'Memories' }
    : nudgePool[nudgeIndex % nudgePool.length]
  const activeAvatarUrl = activeAvatarUrls[nudgeIndex % Math.max(activeAvatarUrls.length, 1)] ?? null

  return (
    <ScreenWrap>
      <ScrollView contentContainerStyle={s.screenScroll} showsVerticalScrollIndicator={true}>
        <Animated.View style={{ opacity: fadeAnim }}>

          {/* ── Compact Hero ── */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: insets.top + 8, paddingBottom: 8 }}>
            {/* Left — greeting, name, pill */}
            <View style={{ flex: 1, marginRight: 14 }}>
              <Text style={{ fontSize: 14, color: C.grey, marginBottom: 2 }}>Good {timeOfDay},</Text>
              <Text style={{ fontSize: 24, fontWeight: '800', color: C.white, marginBottom: 8 }}>{displayName}</Text>
              <View style={{
                alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4,
                borderRadius: 10, borderWidth: 1,
                backgroundColor: vaultStatus === 'escalated' ? C.amber + '22' : C.success + '18',
                borderColor:     vaultStatus === 'escalated' ? C.amber + '66' : C.success + '55',
              }}>
                <Text style={{ fontSize: 11, fontWeight: '600', color: vaultStatus === 'escalated' ? C.amber : C.success }}>
                  {vaultStatus === 'escalated' ? '⚠️ Alert Active' : '🔒 Protected'}
                </Text>
              </View>
            </View>
            {/* Right — rounded square avatar */}
            <TouchableOpacity onPress={() => navigation.navigate('Settings')} activeOpacity={0.85}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={{ width: 84, height: 84, borderRadius: 20, borderWidth: 2, borderColor: C.accent + '88' }} />
              ) : (
                <LinearGradient colors={[C.mauveDim, C.bg3]} style={{ width: 84, height: 84, borderRadius: 20, borderWidth: 2, borderColor: C.mauve + '80', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 36 }}>👤</Text>
                </LinearGradient>
              )}
            </TouchableOpacity>
          </View>

          {/* ── New Memory Banner OR Smart Guidance Nudge ── */}
          <View style={{ height: 164 }}>
          {receivedCount > 0 ? (
            <Animated.View style={{
              marginHorizontal: 20, marginBottom: 10, borderRadius: 20,
              borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.45)',
              shadowColor: '#F06292',
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.65] }),
              shadowRadius:  glowAnim.interpolate({ inputRange: [0, 1], outputRange: [8, 22] }),
              elevation: 8,
            }}>
              <TouchableOpacity activeOpacity={0.88} onPress={() => navigation.navigate('Memories')} style={{ borderRadius: 20, overflow: 'hidden' }}>
                <View>
                  <LinearGradient colors={['#F06292', '#F48A5A', '#FFD07A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFillObject} />
                  <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { opacity: gradShift }]}>
                    <LinearGradient colors={['#FFD07A', '#F06292', '#F48A5A']} start={{ x: 1, y: 1 }} end={{ x: 0, y: 0 }} style={{ flex: 1 }} />
                  </Animated.View>
                  <View style={{ padding: 18 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 }}>
                      <View style={{ width: 54, height: 54, borderRadius: 27, flexShrink: 0, backgroundColor: 'rgba(255,255,255,0.28)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.55)', alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 28 }}>📬</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: WM.title, fontSize: 11, fontWeight: '700', letterSpacing: 1.1, marginBottom: 4, opacity: 0.65 }}>
                          {receivedCount === 1 ? 'NEW MOMENT' : `${receivedCount} NEW MOMENTS`}
                        </Text>
                        <Text style={{ color: WM.title, fontSize: 17, fontWeight: '900', lineHeight: 23 }}>
                          {receivedCount === 1 ? 'Someone recorded\na moment for you' : 'Moments have been\nleft just for you'}
                        </Text>
                      </View>
                    </View>
                    <View style={{ borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.45)' }}>
                      <LinearGradient colors={['#FFD07A', '#F48A5A', '#F06292']} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFillObject} />
                      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { opacity: btnShift }]}>
                        <LinearGradient colors={['#F06292', '#F48A5A', '#FFD07A']} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }} style={{ flex: 1 }} />
                      </Animated.View>
                      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(255,255,255,0.15)' }]} pointerEvents="none" />
                      <View style={{ paddingVertical: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Text style={{ color: WM.title, fontSize: 14, fontWeight: '700' }}>Open {receivedCount === 1 ? 'your moment' : 'your moments'}</Text>
                        <Text style={{ color: WM.title, fontSize: 20, fontWeight: '600' }}>›</Text>
                      </View>
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            </Animated.View>
          ) : (
            <Animated.View style={{ opacity: counts.family === 0 || counts.memories === 0 ? 1 : nudgeFade }}>
              <View style={{ marginHorizontal: 20, marginBottom: 10, borderRadius: 20, padding: 2, overflow: 'hidden' }}>
                <LinearGradient colors={['#F06292', '#FFD07A', '#C9A8FF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFillObject} />
                <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { opacity: auroraAnim }]}>
                  <LinearGradient colors={['#FFD07A', '#C9A8FF', '#F06292']} start={{ x: 1, y: 1 }} end={{ x: 0, y: 0 }} style={{ flex: 1 }} />
                </Animated.View>
                <TouchableOpacity activeOpacity={0.85} onPress={() => navigation.navigate(activeNudge.screen)} style={{ borderRadius: 18, backgroundColor: C.mauveDim, padding: 14 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, height: 88 }}>
                    <View style={{ width: 88, height: 88, justifyContent: 'center' }}>
                      {activeAvatarUrl ? (
                        <>
                          <Image source={{ uri: activeAvatarUrl }} style={{ width: 88, height: 88, borderRadius: 14 }} />
                          <View style={{ position: 'absolute', bottom: -4, right: -6, backgroundColor: C.bg1, borderRadius: 14, padding: 2 }}>
                            <Text style={{ fontSize: 20, lineHeight: 24 }}>{activeNudge.icon}</Text>
                          </View>
                        </>
                      ) : (
                        <View style={{ width: 88, height: 88, alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ fontSize: 52 }}>{activeNudge.icon}</Text>
                        </View>
                      )}
                    </View>
                    <View style={{ flex: 1, overflow: 'hidden' }}>
                      <Text style={{ color: C.offWhite, fontSize: 15, fontWeight: '700', marginBottom: 4, lineHeight: 21 }} numberOfLines={2}>{activeNudge.q}</Text>
                      <Text style={{ color: C.grey, fontSize: 13, lineHeight: 18 }} numberOfLines={2}>{activeNudge.cta}</Text>
                    </View>
                    <Text style={{ color: counts.family === 0 ? C.amberLight : C.accent, fontSize: 22 }}>›</Text>
                  </View>
                </TouchableOpacity>
              </View>
            </Animated.View>
          )}
          </View>

          {/* ── Legacy Garden + Milestone ── */}
          <View style={{ marginHorizontal: 20, marginBottom: 8 }}>

            {/* Garden card — Option 6: frosted gradient border */}
            <View style={{ marginBottom: 6, borderRadius: 22 }}>
              <LinearGradient
                colors={['#F06292', '#F48A5A', '#FFD07A']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={{ borderRadius: 22, padding: 2 }}>
                <View style={{ borderRadius: 20, backgroundColor: '#180A1E', padding: 14 }}>

                  {/* Header row — taps to Memories */}
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => navigation.navigate('Memories')}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                    <View style={{
                      width: 58, height: 58, borderRadius: 29,
                      backgroundColor: 'rgba(255,208,122,0.1)',
                      borderWidth: 1.5, borderColor: 'rgba(240,98,146,0.35)',
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Text style={{ fontSize: 28 }}>{plantStage.emoji}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: '#F48A5A', fontSize: 10, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase', marginBottom: 2, opacity: 0.9 }}>
                        Your Legacy Garden
                      </Text>
                      <Text style={{ color: '#FFEEF8', fontSize: 16, fontWeight: '800', marginBottom: 2 }}>
                        {plantStage.stage}
                      </Text>
                      <Text style={{ color: '#BFA0B8', fontSize: 11, lineHeight: 15 }}>
                        {plantStage.desc}
                      </Text>
                    </View>
                  </TouchableOpacity>

                  {/* Activity mini-stats — each navigates independently */}
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {[
                      { icon: '💌',      count: counts.memories, label: 'Moments', screen: 'Memories', border: '#F06292',  labelColor: '#F06292'  },
                      { icon: '👨‍👩‍👧', count: counts.family,   label: 'Family',  screen: 'Family',   border: '#AFA9EC',  labelColor: '#AFA9EC'  },
                      { icon: '📦',      count: counts.vault,    label: 'Vault',   screen: 'Vault',    border: '#FFD07A',  labelColor: '#FFD07A'  },
                    ].map(item => (
                      <TouchableOpacity
                        key={item.label}
                        activeOpacity={0.75}
                        onPress={() => navigation.navigate(item.screen as any)}
                        style={{
                          flex: 1, backgroundColor: '#1E0A2A',
                          borderRadius: 12, paddingVertical: 18, alignItems: 'center',
                          borderWidth: 2, borderColor: item.border, gap: 4,
                        }}>
                        <Text style={{ fontSize: 32 }}>{item.icon}</Text>
                        <Text style={{ color: '#FFEEF8', fontSize: 32, fontWeight: '800', lineHeight: 36 }}>{item.count}</Text>
                        <Text style={{ color: item.labelColor, fontSize: 13, fontWeight: '700', marginTop: 3 }}>{item.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                </View>
              </LinearGradient>
            </View>

            {/* Milestone card */}
            <TouchableOpacity
              onPress={() => navigation.navigate(homeMilestone.screen as any)}
              activeOpacity={0.8}
              style={{
                backgroundColor: 'rgba(255,255,255,0.05)',
                borderRadius: 16, borderWidth: 1,
                borderColor: 'rgba(240,98,146,0.2)',
                padding: 10, flexDirection: 'row', alignItems: 'center',
              }}>
              <Text style={{ fontSize: 24, marginRight: 14 }}>{homeMilestone.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.grey, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 3 }}>
                  Next milestone
                </Text>
                <Text style={{ color: C.offWhite, fontSize: 13, fontWeight: '600', marginBottom: 6 }}>
                  {homeMilestone.text}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', backgroundColor: 'rgba(240,98,146,0.15)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 }}>
                  <Text style={{ color: '#F06292', fontSize: 11, fontWeight: '700' }}>{homeMilestone.label} →</Text>
                </View>
              </View>
            </TouchableOpacity>

          </View>

          {/* ── Review card — Option 2: story card ── */}
          {showReviewCard && (
            <View style={{
              marginHorizontal: 20, marginBottom: 8,
              backgroundColor: '#1C0A2A',
              borderRadius: 18,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.07)',
              padding: 14,
            }}>
              {/* Dismiss */}
              <TouchableOpacity
                onPress={async () => {
                  setShowReviewCard(false)
                  await AsyncStorage.setItem('solace_review_card_dismissed', '1')
                }}
                activeOpacity={0.7}
                hitSlop={{ top: 16, right: 16, bottom: 16, left: 16 }}
                accessibilityRole="button" accessibilityLabel="Dismiss"
                style={{ position: 'absolute', top: 12, right: 14, zIndex: 1 }}>
                <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 16 }}>✕</Text>
              </TouchableOpacity>

              {/* Opening quote mark */}
              <Text style={{ color: 'rgba(240,98,146,0.35)', fontSize: 32, lineHeight: 28, marginBottom: 2, fontFamily: 'serif' }}>"</Text>

              {/* Headline */}
              <Text style={{ color: '#FFEEF8', fontSize: 15, fontWeight: '600', lineHeight: 22, marginBottom: 8, paddingRight: 20 }}>
                {reviewTrigger === 'trusted_contact'
                  ? 'Your family is protected. Another family could be too.'
                  : 'Another family could have this peace of mind too.'}
              </Text>

              {/* Body */}
              <Text style={{ color: '#8A6080', fontSize: 12, lineHeight: 19, marginBottom: 16 }}>
                {reviewTrigger === 'trusted_contact'
                  ? 'Your trusted contact just said yes. That took courage — and so does sharing. A 30-second review could help another family find the same peace.'
                  : 'If Solace has meant something to you, a moment of your time could mean everything to someone else.'}
              </Text>

              {/* Actions */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={async () => {
                    setShowReviewCard(false)
                    await AsyncStorage.setItem('solace_review_card_dismissed', '1')
                    const isAvailable = await StoreReview.isAvailableAsync()
                    if (isAvailable) await StoreReview.requestReview()
                  }}
                  style={{ flex: 1 }}>
                  <LinearGradient
                    colors={['#F06292', '#F48A5A']}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={{ borderRadius: 16, paddingVertical: 11, alignItems: 'center' }}>
                    <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>
                      {reviewTrigger === 'trusted_contact' ? 'Help another family →' : 'Share a kind word →'}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={async () => {
                    setShowReviewCard(false)
                    await AsyncStorage.setItem('solace_review_card_dismissed', '1')
                  }}
                  activeOpacity={0.6}
                  hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}>
                  <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14 }}>Maybe later</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}


          {/* ── Trusted Partners Card ── */}
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => setShowPartners(true)}
            style={{
              marginHorizontal: 20, marginBottom: 8, borderRadius: 16,
              overflow: 'hidden', borderWidth: 1, borderColor: C.mauve + '44',
            }}>
            <LinearGradient
              colors={['#2A1A2E', '#1E1535', C.bg3]}
              style={{ padding: 14 }}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Text style={{ fontSize: 22 }}>🤝</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.offWhite, fontSize: 14, fontWeight: '700' }}>
                    Trusted Partners
                  </Text>
                  <Text style={{ color: C.grey, fontSize: 12 }}>
                    Counsellors, lawyers, advisors & more
                  </Text>
                </View>
                <Text style={{ color: C.accent, fontSize: 18 }}>›</Text>
              </View>
            </LinearGradient>
          </TouchableOpacity>

          {/* ── Quick Start Actions (shown until user has both family + memories) ── */}
          {(counts.family === 0 || counts.memories === 0) && (
            <View style={{ marginHorizontal: 20, marginBottom: 16 }}>
              <Text style={{ color: C.offWhite, fontSize: 15, fontWeight: '700', marginBottom: 12 }}>
                Get started in 3 steps
              </Text>
              {[
                {
                  done: counts.family > 0,
                  icon: '👤', number: '1',
                  title: 'Add someone you love',
                  desc: 'A partner, child, parent, or friend',
                  screen: 'Family',
                },
                {
                  done: counts.memories > 0,
                  icon: '✍️', number: '2',
                  title: 'Leave a message for someone you love',
                  desc: 'A letter, voice memo, or video',
                  screen: 'Memories',
                },
                {
                  done: false,
                  icon: '📅', number: '3',
                  title: 'Choose when it gets delivered',
                  desc: 'A birthday, milestone, or any moment',
                  screen: 'Memories',
                },
              ].map((step) => (
                <TouchableOpacity
                  key={step.number}
                  onPress={() => !step.done && navigation.navigate(step.screen)}
                  activeOpacity={step.done ? 1 : 0.75}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 14,
                    paddingVertical: 12, paddingHorizontal: 16,
                    marginBottom: 8, borderRadius: 14,
                    backgroundColor: step.done ? C.success + '12' : C.bg2,
                    borderWidth: 1,
                    borderColor: step.done ? C.success + '44' : C.greyDim + '33',
                  }}>
                  <View style={{
                    width: 32, height: 32, borderRadius: 16,
                    backgroundColor: step.done ? C.success + '33' : C.accent + '22',
                    borderWidth: 1,
                    borderColor: step.done ? C.success + '66' : C.accent + '44',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Text style={{ color: step.done ? C.success : C.accent, fontSize: 14, fontWeight: '800' }}>
                      {step.done ? '✓' : step.number}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: step.done ? C.grey : C.offWhite, fontSize: 14, fontWeight: '600' }}>
                      {step.title}
                    </Text>
                    <Text style={{ color: '#BFA8B8', fontSize: 12, marginTop: 1 }}>{step.desc}</Text>
                  </View>
                  {!step.done && <Text style={{ color: C.accent, fontSize: 18 }}>›</Text>}
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* ── AI Avatar Interest Card — hidden once user responds ── */}
          {avatarResponse === null && (
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 14,
              paddingVertical: 12, paddingHorizontal: 16,
              marginHorizontal: 20, marginBottom: 8, borderRadius: 14,
              backgroundColor: C.bg2,
              borderWidth: 1, borderColor: C.greyDim + '33',
            }}>
              <Text style={{ fontSize: 18 }}>✨</Text>
              <Text style={{ color: C.offWhite, fontSize: 14, fontWeight: '600', flex: 1 }}>
                Does a future AI Avatar model interest you?
              </Text>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <TouchableOpacity onPress={() => handleAvatarResponse(true)} activeOpacity={0.75}
                  accessibilityRole="button" accessibilityLabel="Yes, the AI Avatar interests me">
                  <View style={{
                    paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10,
                    borderWidth: 1.5, borderColor: C.accent + '88',
                    backgroundColor: C.bg3,
                  }}>
                    <Text style={{ color: C.offWhite, fontSize: 14, fontWeight: '700' }}>✓ Yes</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleAvatarResponse(false)} activeOpacity={0.75}
                  accessibilityRole="button" accessibilityLabel="No, not interested in the AI Avatar">
                  <View style={{
                    paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10,
                    borderWidth: 1, borderColor: C.greyDim + '55',
                    backgroundColor: C.bg3,
                  }}>
                    <Text style={{ color: C.offWhite, fontSize: 14, fontWeight: '600' }}>No</Text>
                  </View>
                </TouchableOpacity>
              </View>
            </View>
          )}

        </Animated.View>
      </ScrollView>
      {/* ── Welcome Helper Modal ─────────────────────────────────────────── */}
      <Modal visible={showWelcomeModal} transparent animationType="slide" onRequestClose={() => setShowWelcomeModal(false)}>
        <TouchableOpacity
          style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000077' }}
          activeOpacity={1}
          onPress={async () => {
            if (welcomeDontShow) await AsyncStorage.setItem('solace_welcome_helper_dismissed', '1')
            setShowWelcomeModal(false)
          }}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
          <LinearGradient colors={WARM} style={{ borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 36 }}>
            <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: 'rgba(61,16,32,0.2)', alignSelf: 'center', marginBottom: 20 }} />

            {/* Header */}
            <Text style={{ color: WM.title, fontSize: 22, fontWeight: '800', marginBottom: 4 }}>
              👋 What would you like to do today?
            </Text>
            <Text style={{ color: WM.sub, fontSize: 14, marginBottom: 20 }}>
              Pick where you'd like to start — you can always come back here.
            </Text>

            {/* Option cards */}
            {[
              { icon: '👨‍👩‍👧', title: 'Add a family member', desc: 'Start by adding someone you love', screen: 'Family' },
              { icon: '💌', title: 'Create a moment', desc: 'Record a voice memo, write a letter, or capture a video', screen: 'Memories' },
              { icon: '🔐', title: 'Add to your Vault', desc: 'Store documents, passwords, and medical information securely', screen: 'Vault' },
            ].map(option => (
              <TouchableOpacity
                key={option.screen}
                onPress={async () => {
                  if (welcomeDontShow) await AsyncStorage.setItem('solace_welcome_helper_dismissed', '1')
                  setShowWelcomeModal(false)
                  navigation.navigate(option.screen as any)
                }}
                activeOpacity={0.8}
                style={{
                  backgroundColor: WM.cardBg, borderColor: WM.border, borderWidth: 1,
                  borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center',
                  gap: 14, marginBottom: 10,
                }}>
                <Text style={{ fontSize: 30 }}>{option.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: WM.title, fontSize: 15, fontWeight: '700', marginBottom: 2 }}>{option.title}</Text>
                  <Text style={{ color: WM.sub, fontSize: 12, lineHeight: 17 }}>{option.desc}</Text>
                </View>
                <Text style={{ color: WM.sub, fontSize: 20 }}>›</Text>
              </TouchableOpacity>
            ))}

            {/* Don't show again checkbox */}
            <TouchableOpacity
              onPress={() => setWelcomeDontShow(v => !v)}
              activeOpacity={0.7}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6, marginBottom: 18 }}>
              <View style={{
                width: 22, height: 22, borderRadius: 6, borderWidth: 2,
                borderColor: welcomeDontShow ? WM.accent : 'rgba(61,16,32,0.3)',
                backgroundColor: welcomeDontShow ? WM.accent : 'transparent',
                alignItems: 'center', justifyContent: 'center',
              }}>
                {welcomeDontShow && <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800', lineHeight: 16 }}>✓</Text>}
              </View>
              <Text style={{ color: WM.sub, fontSize: 13 }}>Don't show me this again</Text>
            </TouchableOpacity>

            {/* Maybe later */}
            <TouchableOpacity
              onPress={async () => {
                if (welcomeDontShow) await AsyncStorage.setItem('solace_welcome_helper_dismissed', '1')
                setShowWelcomeModal(false)
              }}
              activeOpacity={0.7}
              style={{ alignItems: 'center' }}>
              <Text style={{ color: WM.sub, fontSize: 13, opacity: 0.7 }}>Maybe later</Text>
            </TouchableOpacity>
          </LinearGradient>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <ProfessionalServicesModal
        visible={showPartners}
        onClose={() => setShowPartners(false)}
      />
    </ScreenWrap>
  )
}
