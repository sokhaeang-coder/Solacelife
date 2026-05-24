/**
 * OnboardingEmergencyScreen
 *
 * Asks the user to designate an emergency contact during setup.
 * Shown after OnboardingOccasions, before OnboardingTour.
 *
 * If the user has no family members yet, we show a clear explanation
 * and let them skip — they can set it up later in the Family tab.
 * If they do have family members, they pick up to 3 in priority order.
 */
import { useState, useEffect } from 'react'
import { Text, View, TouchableOpacity, ScrollView,
         ActivityIndicator, StatusBar } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { supabase } from '../../lib/supabase'
import { WARM, WM, SUPABASE_URL, SUPABASE_ANON_KEY } from '../../lib/constants'
import { refreshEmergencyNotification } from '../../lib/emergencyNotification'

const PRIORITY_LABEL = ['1st', '2nd', '3rd']
const PRIORITY_COLOR = ['#E8453C', '#F5833A', '#F5A623']

export default function OnboardingEmergencyScreen({ navigation }: any) {
  const [members, setMembers]   = useState<any[]>([])
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  // selected: ordered array of member IDs (index = priority - 1)
  const [selected, setSelected] = useState<string[]>([])

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      const { data } = await supabase
        .from('family_members')
        .select('id, name, phone, relationship')
        .eq('user_id', user.id)
        .order('name')
      setMembers(data || [])
      setLoading(false)
    }
    load()
  }, [])

  function toggleMember(id: string) {
    setSelected(prev => {
      if (prev.includes(id)) {
        return prev.filter(x => x !== id)
      }
      if (prev.length >= 3) return prev
      return [...prev, id]
    })
  }

  async function handleSave() {
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { goNext(); return }

      await supabase.from('family_members')
        .update({ is_emergency_contact: false, emergency_priority: null })
        .eq('user_id', user.id)

      await Promise.all(
        selected.map((id, i) =>
          supabase.from('family_members')
            .update({ is_emergency_contact: true, emergency_priority: i + 1 })
            .eq('id', id)
        )
      )

      await refreshEmergencyNotification(user.id)

      // Fire emergency contact emails for each designated person (fire-and-forget)
      // is_new_member = true because onboarding means they were just added as a
      // family member AND designated at the same time — the email covers both facts.
      selected.forEach(id => {
        fetch(`${SUPABASE_URL}/functions/v1/send-emergency-contact-email`, {
          method: 'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ family_member_id: id, is_new_member: true }),
        }).catch(e => console.warn('Emergency email send failed:', e))
      })
    } catch (e) {
      console.warn('Emergency contact save error:', e)
    }
    goNext()
  }

  function goNext() {
    setSaving(false)
    navigation.navigate('OnboardingTour')
  }

  if (loading) {
    return (
      <LinearGradient colors={WARM} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={WM.accent} size="large" />
      </LinearGradient>
    )
  }

  return (
    <LinearGradient colors={WARM} style={{ flex: 1 }}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingTop: 64, paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={{ alignItems: 'center', marginBottom: 8 }}>
          <Text style={{ fontSize: 36 }}>♡</Text>
          <Text style={{ fontSize: 12, color: WM.sub, letterSpacing: 1.5,
            textTransform: 'uppercase', marginTop: 4 }}>Step 3 of 4</Text>
        </View>

        <View style={{ alignItems: 'center', marginTop: 8, marginBottom: 28 }}>
          <Text style={{ fontSize: 52, marginBottom: 12 }}>⭐</Text>
          <Text style={{ fontSize: 26, fontWeight: '800', color: WM.title, textAlign: 'center', marginBottom: 10 }}>
            Trusted Contacts
          </Text>
          <Text style={{ fontSize: 15, color: WM.sub, textAlign: 'center', lineHeight: 24, maxWidth: 320 }}>
            Choose who Solace Life notifies if you stop checking in — and who receives your vault when the time comes.
          </Text>
        </View>

        {/* How it works card */}
        <View style={{
          backgroundColor: WM.cardBg, borderRadius: 16, borderWidth: 1,
          borderColor: WM.border, padding: 16, marginBottom: 28,
        }}>
          <Text style={{ color: WM.title, fontSize: 13, fontWeight: '700', marginBottom: 8 }}>How it works</Text>
          <Text style={{ color: WM.sub, fontSize: 13, lineHeight: 20 }}>
            {'🔔  Solace notifies them if you miss your check-ins\n'}
            {'📦  They receive your vault messages when the time comes\n'}
            {'📱  Optional: add them to your phone\'s emergency settings too'}
          </Text>
        </View>

        {members.length === 0 ? (
          /* No family members yet */
          <View style={{
            backgroundColor: WM.cardBg, borderRadius: 16,
            borderWidth: 1, borderColor: WM.border, padding: 20, alignItems: 'center', marginBottom: 28,
          }}>
            <Text style={{ fontSize: 32, marginBottom: 10 }}>👨‍👩‍👧</Text>
            <Text style={{ color: WM.title, fontSize: 15, fontWeight: '600', textAlign: 'center', marginBottom: 8 }}>
              No family members added yet
            </Text>
            <Text style={{ color: WM.sub, fontSize: 13, textAlign: 'center', lineHeight: 20 }}>
              You can add family members after setup and designate your trusted contacts from the Family tab.
            </Text>
          </View>
        ) : (
          <>
            <Text style={{ color: WM.sub, fontSize: 13, fontWeight: '600',
              letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>
              Choose up to 3 — in priority order
            </Text>

            {members.map(m => {
              const idx = selected.indexOf(m.id)
              const isSelected = idx >= 0
              const hasPhone = !!m.phone

              return (
                <TouchableOpacity
                  key={m.id}
                  onPress={() => hasPhone && toggleMember(m.id)}
                  activeOpacity={0.8}
                  disabled={!hasPhone}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 14,
                    backgroundColor: isSelected ? '#E8453C12' : WM.cardBg,
                    borderRadius: 16, padding: 16, marginBottom: 10,
                    borderWidth: 1.5,
                    borderColor: isSelected ? PRIORITY_COLOR[idx] + 'AA' : WM.border,
                    opacity: hasPhone ? 1 : 0.45,
                  }}>
                  {/* Priority badge or placeholder */}
                  <View style={{
                    width: 38, height: 38, borderRadius: 19,
                    backgroundColor: isSelected ? PRIORITY_COLOR[idx] + '22' : WM.cardBgAlt,
                    alignItems: 'center', justifyContent: 'center',
                    borderWidth: isSelected ? 1.5 : 1,
                    borderColor: isSelected ? PRIORITY_COLOR[idx] : WM.border,
                  }}>
                    <Text style={{
                      fontSize: isSelected ? 13 : 18, fontWeight: '700',
                      color: isSelected ? PRIORITY_COLOR[idx] : WM.sub,
                    }}>
                      {isSelected ? PRIORITY_LABEL[idx] : '○'}
                    </Text>
                  </View>

                  {/* Name / relationship */}
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: WM.title, fontSize: 16, fontWeight: '600', marginBottom: 2 }}>
                      {m.name}
                    </Text>
                    <Text style={{ color: WM.sub, fontSize: 13 }}>
                      {m.relationship}
                      {hasPhone ? `  ·  📞 ${m.phone}` : '  ·  No phone number'}
                    </Text>
                  </View>

                  {isSelected && (
                    <Text style={{ fontSize: 20, color: PRIORITY_COLOR[idx] }}>✓</Text>
                  )}
                </TouchableOpacity>
              )
            })}

            <Text style={{ color: WM.sub, fontSize: 12, textAlign: 'center',
              marginTop: 8, marginBottom: 24, lineHeight: 18 }}>
              Contacts without a phone number can't be trusted contacts.{'\n'}
              Add a number in the Family tab after setup.
            </Text>
          </>
        )}

        {/* CTA buttons */}
        <TouchableOpacity
          onPress={selected.length > 0 ? handleSave : goNext}
          disabled={saving}
          activeOpacity={0.85}
          style={{ marginBottom: 12 }}>
          <View style={{
            backgroundColor: selected.length > 0 ? '#E8453C' : WM.title,
            borderRadius: 16, paddingVertical: 18,
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
            {saving
              ? <ActivityIndicator color="#FFD07A" />
              : <>
                  <Text style={{ fontSize: 18 }}>{selected.length > 0 ? '⭐' : '➡️'}</Text>
                  <Text style={{ color: '#FFD07A', fontSize: 16, fontWeight: '800' }}>
                    {selected.length > 0
                      ? `Set ${selected.length} Trusted Contact${selected.length > 1 ? 's' : ''}`
                      : 'Skip for Now'}
                  </Text>
                </>
            }
          </View>
        </TouchableOpacity>

        {selected.length > 0 && (
          <TouchableOpacity onPress={goNext} activeOpacity={0.7}
            style={{ alignItems: 'center', paddingVertical: 12 }}>
            <Text style={{ color: WM.sub, fontSize: 14 }}>Skip for now — set up later in Family tab</Text>
          </TouchableOpacity>
        )}

      </ScrollView>
    </LinearGradient>
  )
}
