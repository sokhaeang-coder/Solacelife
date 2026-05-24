import { useState, useContext } from 'react'
import { Text, View, TouchableOpacity, ActivityIndicator, StatusBar, ScrollView } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { supabase } from '../../lib/supabase'
import { WARM, WM } from '../../lib/constants'
import { AuthContext } from '../../lib/AuthContext'

const FIRST_STEPS = [
  {
    icon: '💌',
    title: 'Write your first moment',
    desc: 'A story, a letter, something you want the people you love to always have.',
    color: '#C07840',
  },
  {
    icon: '👨‍👩‍👧',
    title: 'Add a trusted contact',
    desc: 'One person who will watch over your legacy when the time comes.',
    color: '#8C1848',
  },
  {
    icon: '🔐',
    title: "Build your vault — when you're ready",
    desc: 'Add documents, passwords, and instructions at your own pace. No rush.',
    color: '#2E7D6E',
  },
]

export default function OnboardingEstateScreen() {
  const track = 'remembrance'
  const { setUserTrack, setOnboardingDone } = useContext(AuthContext)
  const [saving, setSaving] = useState(false)

  async function finish() {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('profiles').update({
        track,
        onboarding_completed: true,
      }).eq('id', user.id)
    }
    setUserTrack(track)
    setOnboardingDone(true)
    setSaving(false)
  }

  return (
    <LinearGradient colors={WARM} style={{ flex: 1 }}>
      <StatusBar barStyle="dark-content" />
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 28, paddingTop: 60, paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
      >

        {/* Header */}
        <View style={{ alignItems: 'center', marginBottom: 8 }}>
          <Text style={{ fontSize: 36 }}>♡</Text>
          <Text style={{ fontSize: 12, color: WM.sub, letterSpacing: 1.5,
            textTransform: 'uppercase', marginTop: 4 }}>Step 4 of 4</Text>
        </View>

        {/* Hero */}
        <View style={{ alignItems: 'center', marginTop: 24, marginBottom: 32 }}>
          <View style={{
            width: 96, height: 96, borderRadius: 48,
            backgroundColor: WM.cardBg, borderWidth: 1.5,
            borderColor: WM.border, alignItems: 'center',
            justifyContent: 'center', marginBottom: 24,
          }}>
            <Text style={{ fontSize: 44 }}>🌿</Text>
          </View>
          <Text style={{ fontSize: 28, fontWeight: '800', color: WM.title,
            textAlign: 'center', marginBottom: 12, letterSpacing: -0.5 }}>
            Your legacy is ready
          </Text>
          <Text style={{ fontSize: 15, color: WM.sub, textAlign: 'center', lineHeight: 22, maxWidth: 300 }}>
            There's no checklist to complete. Solace grows with you — at your own pace, on your own terms.
          </Text>
        </View>

        {/* First steps (suggestions, not requirements) */}
        <View style={{ gap: 12, marginBottom: 36 }}>
          <Text style={{ color: WM.sub, fontSize: 13, fontWeight: '600', letterSpacing: 1,
            textTransform: 'uppercase', marginBottom: 4 }}>
            Where most people start
          </Text>
          {FIRST_STEPS.map((step, i) => (
            <View key={i} style={{
              flexDirection: 'row', alignItems: 'center', gap: 14,
              backgroundColor: WM.cardBg,
              borderRadius: 16, padding: 16,
              borderWidth: 1, borderColor: WM.border,
            }}>
              <Text style={{ fontSize: 28 }}>{step.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: WM.title, fontSize: 14, fontWeight: '600', marginBottom: 3 }}>
                  {step.title}
                </Text>
                <Text style={{ color: WM.sub, fontSize: 13, lineHeight: 18 }}>
                  {step.desc}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* CTA */}
        <TouchableOpacity onPress={finish} disabled={saving} activeOpacity={0.85}>
          <View style={{
            backgroundColor: WM.title, borderRadius: 16, paddingVertical: 18, alignItems: 'center',
          }}>
            {saving
              ? <ActivityIndicator color="#FFD07A" />
              : <Text style={{ color: '#FFD07A', fontSize: 16, fontWeight: '800' }}>Begin My Legacy →</Text>}
          </View>
        </TouchableOpacity>

      </ScrollView>
    </LinearGradient>
  )
}
