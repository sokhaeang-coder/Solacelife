// ═══════════════════════════════════════════════════════════════
//  SOLACE LIFE — OnboardingInvitedScreen
//
//  Shown when a family member signs up after being invited by a
//  sender. Replaces the standard sender onboarding entirely.
//
//  Fetches the sender's name from the family_members row that was
//  already linked to this profile (recipient_profile_id = user.id).
//
//  On completion:
//    profiles.onboarding_completed = true
//    profiles.account_type         = 'recipient'  (already set by applySession)
//    profiles.onboarding_type      = 'invited'    (already set by applySession)
// ═══════════════════════════════════════════════════════════════

import { useEffect, useState, useContext } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  ActivityIndicator, Animated,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { supabase } from '../../lib/supabase'
import { AuthContext } from '../../lib/AuthContext'
import { C } from '../../lib/constants'
import { s } from '../../lib/styles'

const SLIDES = [
  {
    icon: '💌',
    title: 'A moment is waiting for you',
    body: 'Someone you love has recorded something just for you. It\'s safe here, and it\'s yours forever.',
  },
  {
    icon: '📬',
    title: 'Where to find it',
    body: 'Open the Moments tab at the bottom of your screen. Every moment sent to you lives there — now and in the future.',
  },
  {
    icon: '🔒',
    title: 'Private. Yours. Always.',
    body: 'Only you can see moments sent to you. No one else — not even us.',
  },
  {
    icon: '💛',
    title: 'You can send too',
    body: 'When you\'re ready, you can record moments for your own family. There\'s no rush — your vault is here whenever you need it.',
  },
]

export default function OnboardingInvitedScreen() {
  const { setOnboardingDone, setAccountType } = useContext(AuthContext) as any

  const [step, setStep]           = useState(0)
  const [senderName, setSenderName] = useState<string | null>(null)
  const [saving, setSaving]       = useState(false)
  const fadeAnim                  = useState(new Animated.Value(1))[0]

  // ── Fetch the sender's name ────────────────────────────────
  useEffect(() => {
    async function fetchSender() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Find the family_member row linked to this profile
      const { data: memberRows } = await supabase
        .from('family_members')
        .select('user_id')
        .eq('recipient_profile_id', user.id)
        .limit(1)

      if (!memberRows?.length) return

      // Get the sender's display name from their profile
      const senderId = memberRows[0].user_id
      const { data: senderProfile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', senderId)
        .single()

      if (senderProfile?.full_name) setSenderName(senderProfile.full_name)
    }
    fetchSender()
  }, [])

  function animateToNext(nextStep: number) {
    Animated.timing(fadeAnim, {
      toValue: 0, duration: 180, useNativeDriver: true,
    }).start(() => {
      setStep(nextStep)
      Animated.timing(fadeAnim, {
        toValue: 1, duration: 220, useNativeDriver: true,
      }).start()
    })
  }

  async function finish() {
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      await supabase.from('profiles').update({
        onboarding_completed: true,
        account_type:         'recipient',
        onboarding_type:      'invited',
      }).eq('id', user.id)

      setAccountType('recipient')
      setOnboardingDone(true)
    } catch (e) {
      console.warn('Invited onboarding finish error:', e)
    }
    setSaving(false)
  }

  const slide    = SLIDES[step]
  const isLast   = step === SLIDES.length - 1

  return (
    <LinearGradient colors={['#F06292', '#F48A5A', '#FFD07A']} style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 28, paddingBottom: 60 }}
        showsVerticalScrollIndicator={false}>

        {/* Sender greeting */}
        {senderName && (
          <View style={{
            backgroundColor: 'rgba(255,255,255,0.35)',
            borderRadius: 14, paddingVertical: 10, paddingHorizontal: 16,
            marginBottom: 32, alignSelf: 'center',
            borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)',
          }}>
            <Text style={{ color: '#3D1020', fontSize: 13, fontWeight: '600', textAlign: 'center' }}>
              {senderName} added you to their Solace Life 💌
            </Text>
          </View>
        )}

        {/* Slide content */}
        <Animated.View style={{ opacity: fadeAnim, alignItems: 'center' }}>
          <Text style={{ fontSize: 72, marginBottom: 24 }}>{slide.icon}</Text>

          <Text style={{
            fontSize: 26, fontWeight: '800', color: '#3D1020',
            textAlign: 'center', marginBottom: 16, letterSpacing: -0.5,
          }}>
            {slide.title}
          </Text>

          <Text style={{
            fontSize: 16, color: '#7A3448', textAlign: 'center',
            lineHeight: 24, maxWidth: 300,
          }}>
            {slide.body}
          </Text>
        </Animated.View>

        {/* Progress dots */}
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 40, marginBottom: 40 }}>
          {SLIDES.map((_, i) => (
            <View key={i} style={{
              width: i === step ? 20 : 8, height: 8,
              borderRadius: 4,
              backgroundColor: i === step ? '#3D1020' : 'rgba(61,16,32,0.25)',
              transition: 'width 0.2s',
            }} />
          ))}
        </View>

        {/* Action button */}
        <TouchableOpacity
          onPress={isLast ? finish : () => animateToNext(step + 1)}
          disabled={saving}
          activeOpacity={0.85}>
          <View style={{
            backgroundColor: '#3D1020',
            borderRadius: 16, paddingVertical: 18, alignItems: 'center',
          }}>
            {saving
              ? <ActivityIndicator color="#FFD07A" />
              : <Text style={{ color: '#FFD07A', fontSize: 16, fontWeight: '800' }}>
                  {isLast ? 'Open My Moments →' : 'Next'}
                </Text>}
          </View>
        </TouchableOpacity>

        {/* Skip to end */}
        {!isLast && (
          <TouchableOpacity
            onPress={() => animateToNext(SLIDES.length - 1)}
            style={{ marginTop: 16, alignItems: 'center' }}>
            <Text style={{ color: '#7A3448', fontSize: 13 }}>Skip to end</Text>
          </TouchableOpacity>
        )}

      </ScrollView>
    </LinearGradient>
  )
}
