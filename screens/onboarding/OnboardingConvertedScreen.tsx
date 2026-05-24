// ═══════════════════════════════════════════════════════════════
//  SOLACE LIFE — OnboardingConvertedScreen
//
//  Shown when a recipient taps "Want to preserve your own memories?"
//  Single welcome screen — one tap to unlock the full app.
//  Flips account_type='both', onboarding_type='converted'.
//  AuthContext change re-routes to MainTabs automatically.
// ═══════════════════════════════════════════════════════════════

import { useState, useContext } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { supabase } from '../../lib/supabase'
import { AuthContext } from '../../lib/AuthContext'
import { WARM, WM } from '../../lib/constants'

export default function OnboardingConvertedScreen() {
  const { setAccountType, setOnboardingType, setUserTrack } = useContext(AuthContext) as any
  const [saving, setSaving] = useState(false)

  async function finish() {
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      await supabase.from('profiles').update({
        account_type:    'both',
        onboarding_type: 'converted',
        track:           'remembrance',
      }).eq('id', user.id)

      setAccountType('both')
      setOnboardingType('converted')
      setUserTrack('remembrance')
    } catch (e) {
      console.warn('Converted onboarding finish error:', e)
    }
    setSaving(false)
  }

  return (
    <LinearGradient colors={WARM} style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 28, paddingBottom: 60 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={{ fontSize: 72, textAlign: 'center', marginBottom: 24 }}>✍️</Text>

        <Text style={{
          fontSize: 28, fontWeight: '800', color: WM.title,
          textAlign: 'center', marginBottom: 16, letterSpacing: -0.5,
        }}>
          Your family wants to hear from you too
        </Text>

        <Text style={{
          fontSize: 16, color: WM.sub, textAlign: 'center',
          lineHeight: 26, maxWidth: 300, alignSelf: 'center', marginBottom: 48,
        }}>
          You've been receiving moments. Now create your own — letters, stories, and moments delivered to the people you love exactly when they need them most.
        </Text>

        <TouchableOpacity onPress={finish} disabled={saving} activeOpacity={0.85}>
          <View style={{
            backgroundColor: WM.title, borderRadius: 16,
            paddingVertical: 18, alignItems: 'center',
          }}>
            {saving
              ? <ActivityIndicator color="#FFD07A" />
              : <Text style={{ color: '#FFD07A', fontSize: 16, fontWeight: '800' }}>
                  Open My Full Account →
                </Text>
            }
          </View>
        </TouchableOpacity>
      </ScrollView>
    </LinearGradient>
  )
}
