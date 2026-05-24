// ─────────────────────────────────────────────────────────────
//  Solace Life — OnboardingRecipientWelcomeScreen
//
//  Short, warm welcome for recipients (people who received a
//  memory from someone who loves them).
//
//  No subscription prompt. No feature pitch.
//  Just: "your memories are here, safe and waiting."
//
//  On completion: sets onboarding_completed = true and routes
//  to the main app, where account_type = 'recipient' triggers
//  the recipient tab layout.
// ─────────────────────────────────────────────────────────────

import { useState } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, SafeAreaView, ScrollView,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { supabase } from '../../lib/supabase'
import { C, SKY } from '../../lib/constants'
import { useContext } from 'react'
import { AuthContext } from '../../lib/AuthContext'

const STEPS = [
  {
    icon:     '💌',
    title:    'Your moment has arrived',
    body:     "Someone who loves you chose Solace Life to make sure this moment found you — no matter what.\n\nYour personal vault is waiting. Every moment sent your way lives here, safe and private.",
  },
  {
    icon:     '🔒',
    title:    'Private. Secure. Yours.',
    body:     "Only you can access your vault. Your moments are encrypted and stored securely.\n\nCheck back anytime — new moments appear here automatically as they're delivered.",
  },
  {
    icon:     '🕊️',
    title:    'You\'re all set',
    body:     "There's nothing to set up and nothing to pay.\n\nYour vault is ready. Open it whenever you're ready to listen.",
  },
]

export default function OnboardingRecipientWelcomeScreen({ navigation }: any) {
  const [step,   setStep]   = useState(0)
  const [saving, setSaving] = useState(false)
  const { setOnboardingDone } = useContext(AuthContext) as any

  const isLast = step === STEPS.length - 1
  const current = STEPS[step]

  async function handleNext() {
    if (!isLast) {
      setStep(s => s + 1)
      return
    }

    // Last step — mark onboarding complete
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not signed in')

      const { error } = await supabase
        .from('profiles')
        .update({ onboarding_completed: true })
        .eq('id', user.id)

      if (error) throw error
      setOnboardingDone(true)
      // App.tsx watches onboardingDone and will route to MainTabs automatically
    } catch (e: any) {
      Alert.alert('Something went wrong', e.message || 'Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <LinearGradient colors={SKY} style={styles.flex}>
      <SafeAreaView style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

          {/* Progress dots */}
          <View style={styles.dots}>
            {STEPS.map((_, i) => (
              <View key={i} style={[styles.dot, i === step && styles.dotActive]} />
            ))}
          </View>

          {/* Content */}
          <View style={styles.content}>
            <Text style={styles.icon}>{current.icon}</Text>
            <Text style={styles.title}>{current.title}</Text>
            <Text style={styles.body}>{current.body}</Text>
          </View>

          {/* CTA */}
          <TouchableOpacity
            style={[styles.ctaBtn, saving && styles.ctaBtnDisabled]}
            onPress={handleNext}
            disabled={saving}
            activeOpacity={0.8}
          >
            {saving
              ? <ActivityIndicator color={C.bg1} />
              : <Text style={styles.ctaText}>
                  {isLast ? 'Open My Vault' : 'Next →'}
                </Text>
            }
          </TouchableOpacity>

          {/* Skip to end */}
          {!isLast && (
            <TouchableOpacity
              style={styles.skipBtn}
              onPress={() => setStep(STEPS.length - 1)}
            >
              <Text style={styles.skipText}>Skip</Text>
            </TouchableOpacity>
          )}

        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  )
}

const styles = StyleSheet.create({
  flex:   { flex: 1 },
  scroll: {
    paddingHorizontal: 28,
    paddingTop:        48,
    paddingBottom:     40,
    flexGrow:          1,
    justifyContent:    'center',
  },

  dots: {
    flexDirection:  'row',
    justifyContent: 'center',
    gap:            8,
    marginBottom:   48,
  },
  dot: {
    width:           8,
    height:          8,
    borderRadius:    4,
    backgroundColor: C.mauveDim,
  },
  dotActive: {
    backgroundColor: C.amberLight,
    width:           24,
  },

  content: { alignItems: 'center', marginBottom: 44 },
  icon:    { fontSize: 62, marginBottom: 24 },
  title: {
    fontSize:    26,
    fontWeight:  '700',
    color:       C.offWhite,
    marginBottom: 16,
    textAlign:   'center',
  },
  body: {
    fontSize:   16,
    color:      C.grey,
    lineHeight: 25,
    textAlign:  'center',
  },

  ctaBtn: {
    backgroundColor: C.amber,
    borderRadius:    50,
    paddingVertical: 18,
    alignItems:      'center',
    marginBottom:    16,
  },
  ctaBtnDisabled: { opacity: 0.45 },
  ctaText: {
    fontSize:   16,
    fontWeight: '700',
    color:      C.bg1,
  },

  skipBtn: { alignItems: 'center', paddingVertical: 8 },
  skipText: { fontSize: 14, color: C.greyDim },
})
