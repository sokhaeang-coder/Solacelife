import { useState, useEffect, useRef } from 'react'
import { Text, View, TouchableOpacity, ScrollView, Animated, Image, StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { supabase } from '../lib/supabase'
import { C, WARM, WM, getTimeOfDay } from '../lib/constants'
import { s } from '../lib/styles'
import ScreenWrap from '../components/ScreenWrap'
import { getUpcomingOccasions, buildOccasionNudge } from '../lib/occasions'
import ProfessionalServicesModal from './ProfessionalServicesModal'

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
  const [userEmail, setUserEmail]       = useState('')
  const [fullName, setFullName]         = useState('')
  const [avatarUrl, setAvatarUrl]       = useState<string | null>(null)
  const [userTrack, setUserTrack]       = useState<string>('remembrance')
  const [counts, setCounts]             = useState({ vault: 0, memories: 0, family: 0 })
  const [vaultStatus, setVaultStatus]   = useState<string>('active')
  const [userOccasionKeys, setUserOccasionKeys] = useState<string[]>([])
  const [nudgeIndex, setNudgeIndex]     = useState(0)
  const [receivedCount, setReceivedCount] = useState(0)
  const [avatarResponse, setAvatarResponse] = useState<boolean | null | undefined>(undefined)
  const [showPartners, setShowPartners]     = useState(false)
  const fadeAnim    = useRef(new Animated.Value(0)).current
  const nudgeFade   = useRef(new Animated.Value(1)).current
  // Banner animation: gradShift crossfades the two gradient layers (native driver ok — it's opacity)
  // glowAnim drives the shadow pulse (non-native — shadow props can't use native driver)
  const gradShift   = useRef(new Animated.Value(0)).current
  const glowAnim    = useRef(new Animated.Value(0)).current
  const btnShift    = useRef(new Animated.Value(0)).current

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
    // Rotate the prompt every 8 seconds
    const interval = setInterval(() => {
      Animated.timing(nudgeFade, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
        setNudgeIndex(i => (i + 1) % NUDGE_PROMPTS.length)
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
    const [vaultRes, memoriesRes, familyRes, profileRes, occasionsRes] = await Promise.all([
      supabase.from('vault_items').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase.from('memories').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase.from('family_members').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase.from('profiles').select('vault_status, track, full_name, avatar_url, ai_avatar_interested').eq('id', user.id).single(),
      supabase.from('user_occasions').select('occasion_key').eq('user_id', user.id),
    ])
    setCounts({ vault: vaultRes.count ?? 0, memories: memoriesRes.count ?? 0, family: familyRes.count ?? 0 })
    if (profileRes.data) {
      setVaultStatus(profileRes.data.vault_status || 'active')
      setUserTrack(profileRes.data.track || 'remembrance')
      if (profileRes.data.full_name) setFullName(profileRes.data.full_name)
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

  const displayName = (fullName && fullName.split(' ')[0]) || userEmail.split('@')[0] || 'Friend'
  const timeOfDay = getTimeOfDay()

  // Which nudge to show:
  // 1. No family yet → onboard them first
  // 2. No memories yet → get them started
  // 3. Occasion coming up within 60 days → occasion-aware nudge (highest priority for engaged users)
  // 4. Fallback → general rotating prompts
  const upcomingOccasions = counts.family > 0 && counts.memories > 0
    ? getUpcomingOccasions(userOccasionKeys, 60)
    : []
  const activeNudge = counts.family === 0
    ? { icon: '💭', q: 'Who are you thinking about right now?', cta: 'Add them — it takes 30 seconds', screen: 'Family' }
    : counts.memories === 0
    ? { icon: '✉️', q: "Is there something you've been meaning to say?", cta: 'Write your first message for someone you love', screen: 'Memories' }
    : upcomingOccasions.length > 0
    ? buildOccasionNudge(upcomingOccasions[0])
    : NUDGE_PROMPTS[nudgeIndex]

  return (
    <ScreenWrap>
      <ScrollView contentContainerStyle={s.screenScroll} showsVerticalScrollIndicator={true}>
        <Animated.View style={{ opacity: fadeAnim }}>

          {/* Hero */}
          <View style={s.heroWrap}>
            <TouchableOpacity
              onPress={() => navigation.navigate('Settings')}
              activeOpacity={0.85}
              style={{ marginBottom: 24 }}>
              {avatarUrl ? (
                <Image
                  source={{ uri: avatarUrl }}
                  style={{ width: 210, height: 210, borderRadius: 105, borderWidth: 2.5, borderColor: C.accent + '88' }}
                />
              ) : (
                <LinearGradient
                  colors={[C.mauveDim, C.bg3]}
                  style={{ width: 210, height: 210, borderRadius: 105, borderWidth: 2.5, borderColor: C.mauve + '80', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 84 }}>👤</Text>
                </LinearGradient>
              )}
            </TouchableOpacity>
            <Text style={s.homeGreeting}>Good {timeOfDay},</Text>
            <Text style={s.homeName}>{displayName}</Text>
            <Text style={s.homeSubtitle}>Your love letters are ready to send</Text>

            {/* Vault status pill */}
            <View style={{
              marginTop: 14,
              paddingHorizontal: 16, paddingVertical: 7,
              borderRadius: 20, borderWidth: 1,
              backgroundColor: vaultStatus === 'escalated' ? C.amber + '22' : C.success + '18',
              borderColor:     vaultStatus === 'escalated' ? C.amber + '66' : C.success + '55',
            }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: vaultStatus === 'escalated' ? C.amber : C.success }}>
                {vaultStatus === 'escalated'
                  ? '⚠️ Alert Active — please contact your trusted person'
                  : '🔒 Protected'}
              </Text>
            </View>
          </View>

          {/* Stats */}
          <View style={s.statsRow}>
            {[
              { label: 'Vault',    value: String(counts.vault) },
              { label: 'Moments', value: String(counts.memories) },
              { label: 'Family',   value: String(counts.family) },
            ].map((stat) => (
              <TouchableOpacity
                key={stat.label}
                style={s.statCard}
                onPress={() => navigation.navigate(
                  stat.label === 'Vault' ? 'Vault' : stat.label === 'Moments' ? 'Memories' : 'Family'
                )}
                activeOpacity={0.75}>
                <Text style={s.statValue}>{stat.value}</Text>
                <Text style={s.statLabel}>{stat.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ── New Memory Banner OR Smart Guidance Nudge ── */}
          {receivedCount > 0 ? (
            // Animated WARM banner — two gradient layers crossfade, outer glow pulses
            <Animated.View style={{
              marginHorizontal: 20, marginBottom: 16, borderRadius: 20,
              borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.45)',
              shadowColor: '#F06292',
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.65] }),
              shadowRadius:  glowAnim.interpolate({ inputRange: [0, 1], outputRange: [8, 22] }),
              elevation: 8,
            }}>
              <TouchableOpacity
                activeOpacity={0.88}
                onPress={() => navigation.navigate('Memories')}
                style={{ borderRadius: 20, overflow: 'hidden' }}>
                <View>
                  {/* Layer 1 — base: pink → orange → gold */}
                  <LinearGradient
                    colors={['#F06292', '#F48A5A', '#FFD07A']}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFillObject}
                  />
                  {/* Layer 2 — shift: gold → pink (crossfades in/out with gradShift) */}
                  <Animated.View
                    pointerEvents="none"
                    style={[StyleSheet.absoluteFillObject, { opacity: gradShift }]}>
                    <LinearGradient
                      colors={['#FFD07A', '#F06292', '#F48A5A']}
                      start={{ x: 1, y: 1 }} end={{ x: 0, y: 0 }}
                      style={{ flex: 1 }}
                    />
                  </Animated.View>

                  {/* Content */}
                  <View style={{ padding: 18 }}>
                    {/* Icon + title row */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 }}>
                      {/* Frosted circle icon */}
                      <View style={{
                        width: 54, height: 54, borderRadius: 27, flexShrink: 0,
                        backgroundColor: 'rgba(255,255,255,0.28)',
                        borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.55)',
                        alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Text style={{ fontSize: 28 }}>📬</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: WM.title, fontSize: 11, fontWeight: '700', letterSpacing: 1.1, marginBottom: 4, opacity: 0.65 }}>
                          {receivedCount === 1 ? 'NEW MOMENT' : `${receivedCount} NEW MOMENTS`}
                        </Text>
                        <Text style={{ color: WM.title, fontSize: 17, fontWeight: '900', lineHeight: 23 }}>
                          {receivedCount === 1
                            ? 'Someone recorded\na moment for you'
                            : 'Moments have been\nleft just for you'}
                        </Text>
                      </View>
                    </View>

                    {/* Button — counter-direction animated gradient + frosted overlay */}
                    <View style={{ borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.45)' }}>
                      {/* Base: gold→pink (opposite to banner base pink→gold) */}
                      <LinearGradient
                        colors={['#FFD07A', '#F48A5A', '#F06292']}
                        start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }}
                        style={StyleSheet.absoluteFillObject}
                      />
                      {/* Overlay: pink→gold — flashes at 2x banner speed via btnShift */}
                      <Animated.View
                        pointerEvents="none"
                        style={[StyleSheet.absoluteFillObject, { opacity: btnShift }]}>
                        <LinearGradient
                          colors={['#F06292', '#F48A5A', '#FFD07A']}
                          start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }}
                          style={{ flex: 1 }}
                        />
                      </Animated.View>
                      {/* Frosted white tint keeps the Option A glass feel */}
                      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(255,255,255,0.15)' }]} pointerEvents="none" />
                      {/* Label */}
                      <View style={{ paddingVertical: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Text style={{ color: WM.title, fontSize: 14, fontWeight: '700' }}>
                          Open {receivedCount === 1 ? 'your moment' : 'your moments'}
                        </Text>
                        <Text style={{ color: WM.title, fontSize: 20, fontWeight: '600' }}>›</Text>
                      </View>
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            </Animated.View>
          ) : (
            // Existing rotating nudge when no received memories
            <Animated.View style={{ opacity: counts.family === 0 || counts.memories === 0 ? 1 : nudgeFade }}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => navigation.navigate(activeNudge.screen)}
                style={{
                  marginHorizontal: 20, marginBottom: 16,
                  padding: 18, borderRadius: 18,
                  backgroundColor: C.mauveDim,
                  borderWidth: 1.5,
                  borderColor: counts.family === 0 ? C.amberLight + '88' : C.accent + '55',
                }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                  <View style={{
                    width: 48, height: 48, borderRadius: 24,
                    backgroundColor: counts.family === 0 ? C.amber + '22' : C.accent + '22',
                    borderWidth: 1, borderColor: counts.family === 0 ? C.amberLight + '66' : C.accent + '55',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Text style={{ fontSize: 24 }}>{activeNudge.icon}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: C.offWhite, fontSize: 15, fontWeight: '700', marginBottom: 4, lineHeight: 21 }}>
                      {activeNudge.q}
                    </Text>
                    <Text style={{ color: C.grey, fontSize: 13 }}>{activeNudge.cta}</Text>
                  </View>
                  <Text style={{ color: counts.family === 0 ? C.amberLight : C.accent, fontSize: 22 }}>›</Text>
                </View>
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* ── Memories Hero Card ── */}
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => navigation.navigate('Memories')}
            style={{
              marginHorizontal: 20, marginBottom: 16, borderRadius: 20,
              overflow: 'hidden', borderWidth: 1.5, borderColor: C.amberLight + '66',
            }}>
            <LinearGradient
              colors={['#1E1535', '#2A1A42', C.bg3]}
              style={{ padding: 20 }}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <View style={{
                  width: 56, height: 56, borderRadius: 28,
                  backgroundColor: C.amber + '22',
                  borderWidth: 1.5, borderColor: C.amberLight + '66',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Text style={{ fontSize: 28 }}>💌</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.amberLight, fontSize: 17, fontWeight: '800', marginBottom: 4 }}>
                    Love Letters for the Future
                  </Text>
                  <Text style={{ color: C.grey, fontSize: 13, lineHeight: 19 }}>
                    Leave a message for someone you love — delivered exactly when it matters most
                  </Text>
                </View>
                <Text style={{ color: C.amberLight, fontSize: 20 }}>›</Text>
              </View>
              <View style={{ marginTop: 14, flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {['🎂 Birthday', '💍 Anniversary', '🎓 Graduation', '💛 Just Because'].map(tag => (
                  <View key={tag} style={{
                    backgroundColor: C.amber + '22', borderRadius: 20,
                    paddingHorizontal: 10, paddingVertical: 5,
                    borderWidth: 1, borderColor: C.amberLight + '33',
                  }}>
                    <Text style={{ color: C.amberLight, fontSize: 12 }}>{tag}</Text>
                  </View>
                ))}
              </View>
            </LinearGradient>
          </TouchableOpacity>

          {/* ── Trusted Partners Card ── */}
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => setShowPartners(true)}
            style={{
              marginHorizontal: 20, marginBottom: 16, borderRadius: 20,
              overflow: 'hidden', borderWidth: 1.5, borderColor: C.mauve + '55',
            }}>
            <LinearGradient
              colors={['#2A1A2E', '#1E1535', C.bg3]}
              style={{ padding: 20 }}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <View style={{
                  width: 56, height: 56, borderRadius: 28,
                  backgroundColor: C.accent + '22',
                  borderWidth: 1.5, borderColor: C.accent + '55',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Text style={{ fontSize: 28 }}>🤝</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.offWhite, fontSize: 17, fontWeight: '800', marginBottom: 4 }}>
                    Trusted Partners
                  </Text>
                  <Text style={{ color: C.grey, fontSize: 13, lineHeight: 19 }}>
                    Connect with estate lawyers, financial advisors, real estate agents & more
                  </Text>
                </View>
                <Text style={{ color: C.accent, fontSize: 20 }}>›</Text>
              </View>
              <View style={{ marginTop: 14, flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {['⚖️ Legal', '💰 Financial', '🏠 Real Estate', '📋 Probate'].map(tag => (
                  <View key={tag} style={{
                    backgroundColor: C.accent + '18', borderRadius: 20,
                    paddingHorizontal: 10, paddingVertical: 5,
                    borderWidth: 1, borderColor: C.accent + '33',
                  }}>
                    <Text style={{ color: C.mauve, fontSize: 12 }}>{tag}</Text>
                  </View>
                ))}
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
                    <Text style={{ color: C.greyDim, fontSize: 12, marginTop: 1 }}>{step.desc}</Text>
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
                <TouchableOpacity onPress={() => handleAvatarResponse(true)} activeOpacity={0.75}>
                  <View style={{
                    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8,
                    borderWidth: 1, borderColor: C.greyDim + '55',
                    backgroundColor: C.bg3,
                  }}>
                    <Text style={{ color: C.offWhite, fontSize: 13, fontWeight: '600' }}>Yes</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleAvatarResponse(false)} activeOpacity={0.75}>
                  <View style={{
                    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8,
                    borderWidth: 1, borderColor: C.greyDim + '55',
                    backgroundColor: C.bg3,
                  }}>
                    <Text style={{ color: C.offWhite, fontSize: 13, fontWeight: '600' }}>No</Text>
                  </View>
                </TouchableOpacity>
              </View>
            </View>
          )}

        </Animated.View>
      </ScrollView>
      <ProfessionalServicesModal
        visible={showPartners}
        onClose={() => setShowPartners(false)}
      />
    </ScreenWrap>
  )
}
