// ─────────────────────────────────────────────────────────────
//  Solace Life — OnboardingRoleScreen
//
//  First screen after sign-up. Asks the user which role they are:
//    A) Sender  — "I want to record memories for my loved ones"
//    B) Recipient — "Someone sent me a memory"
//
//  Senders continue to the existing OnboardingTrack → ... flow.
//  Recipients get a shorter welcome path (OnboardingRecipientWelcome).
// ─────────────────────────────────────────────────────────────

import { useState } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, ScrollView, SafeAreaView,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { supabase } from '../../lib/supabase'
import { C, SKY } from '../../lib/constants'
import { s } from '../../lib/styles'

export default function OnboardingRoleScreen({ navigation }: any) {
  const [selected, setSelected]   = useState<'sender' | 'recipient' | null>(null)
  const [saving,   setSaving]     = useState(false)

  async function handleContinue() {
    if (!selected) return
    setSaving(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not signed in')

      // Save account_type to profile
      const { error } = await supabase
        .from('profiles')
        .update({ account_type: selected })
        .eq('id', user.id)

      if (error) throw error

      if (selected === 'sender') {
        navigation.replace('OnboardingTrack')
      } else {
        navigation.replace('OnboardingRecipientWelcome')
      }
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

          {/* Brand */}
          <View style={styles.header}>
            <Text style={styles.dove}>🕊️</Text>
            <Text style={styles.brand}>Solace Life</Text>
          </View>

          {/* Headline */}
          <View style={styles.headline}>
            <Text style={styles.title}>How are you joining us?</Text>
            <Text style={styles.subtitle}>
              Tell us how you found Solace Life — your experience is tailored to you.
            </Text>
          </View>

          {/* Option A — Sender */}
          <TouchableOpacity
            style={[styles.card, selected === 'sender' && styles.cardSelected]}
            onPress={() => setSelected('sender')}
            activeOpacity={0.8}
          >
            <Text style={styles.cardIcon}>✍️</Text>
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>I want to record memories</Text>
              <Text style={styles.cardSub}>
                Leave voice memos, videos, letters, and stories for the people you love —
                delivered to them at the moments that matter most.
              </Text>
            </View>
            <View style={[styles.radio, selected === 'sender' && styles.radioSelected]}>
              {selected === 'sender' && <View style={styles.radioDot} />}
            </View>
          </TouchableOpacity>

          {/* Option B — Recipient */}
          <TouchableOpacity
            style={[styles.card, selected === 'recipient' && styles.cardSelected]}
            onPress={() => setSelected('recipient')}
            activeOpacity={0.8}
          >
            <Text style={styles.cardIcon}>💌</Text>
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>Someone sent me a memory</Text>
              <Text style={styles.cardSub}>
                A loved one chose Solace Life to share something with you.
                Access your personal vault — free, no subscription required.
              </Text>
            </View>
            <View style={[styles.radio, selected === 'recipient' && styles.radioSelected]}>
              {selected === 'recipient' && <View style={styles.radioDot} />}
            </View>
          </TouchableOpacity>

          {/* CTA */}
          <TouchableOpacity
            style={[styles.ctaBtn, (!selected || saving) && styles.ctaBtnDisabled]}
            onPress={handleContinue}
            disabled={!selected || saving}
            activeOpacity={0.8}
          >
            {saving
              ? <ActivityIndicator color={C.bg1} />
              : <Text style={styles.ctaText}>Continue →</Text>
            }
          </TouchableOpacity>

          {/* Reassurance */}
          <Text style={styles.footnote}>
            You can always record memories later — your vault, your choice.
          </Text>

        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  )
}

const styles = StyleSheet.create({
  flex:   { flex: 1 },
  scroll: { paddingHorizontal: 24, paddingTop: 48, paddingBottom: 40 },

  header: { alignItems: 'center', marginBottom: 36 },
  dove:   { fontSize: 44, marginBottom: 8 },
  brand:  { fontSize: 22, fontWeight: '700', color: C.offWhite },

  headline: { marginBottom: 28 },
  title:    { fontSize: 26, fontWeight: '700', color: C.offWhite, marginBottom: 10 },
  subtitle: { fontSize: 15, color: C.grey, lineHeight: 22 },

  card: {
    flexDirection:    'row',
    alignItems:       'flex-start',
    backgroundColor:  C.bg2,
    borderRadius:     18,
    borderWidth:      1.5,
    borderColor:      C.mauveDim,
    padding:          20,
    marginBottom:     14,
    gap:              14,
  },
  cardSelected: {
    borderColor:     C.amberLight,
    backgroundColor: 'rgba(245,206,170,0.06)',
  },
  cardIcon: { fontSize: 30, marginTop: 2 },
  cardText: { flex: 1 },
  cardTitle: {
    fontSize:    17,
    fontWeight:  '700',
    color:       C.offWhite,
    marginBottom: 6,
  },
  cardSub: {
    fontSize:  14,
    color:     C.grey,
    lineHeight: 20,
  },

  radio: {
    width:        22,
    height:       22,
    borderRadius: 11,
    borderWidth:  2,
    borderColor:  C.mauveDim,
    alignItems:   'center',
    justifyContent: 'center',
    marginTop:    4,
    flexShrink:   0,
  },
  radioSelected: { borderColor: C.amber },
  radioDot: {
    width:        11,
    height:       11,
    borderRadius: 6,
    backgroundColor: C.amber,
  },

  ctaBtn: {
    backgroundColor: C.amber,
    borderRadius:    50,
    paddingVertical: 18,
    alignItems:      'center',
    marginTop:       10,
    marginBottom:    20,
  },
  ctaBtnDisabled: { opacity: 0.45 },
  ctaText: {
    fontSize:   16,
    fontWeight: '700',
    color:      C.bg1,
  },

  footnote: {
    fontSize:  13,
    color:     C.greyDim,
    textAlign: 'center',
    lineHeight: 18,
  },
})
