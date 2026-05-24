// OnboardingOccasionsScreen
// "Which occasions do you celebrate?"
//
// A Team design rules enforced here:
//   1. Ask about occasions, never religion
//   2. All tiles presented with equal visual weight (same size, same border)
//   3. Multi-select — selecting Christmas does NOT deselect Hanukkah
//   4. 'Other' and 'Personal Milestones' always included
//   5. Skip is always available — no gate on proceeding
//   6. No religious inference stored — occasion_keys only
//
// iOS note: uses FlatList numColumns={2} instead of View+flexWrap.
// flexWrap on RN iOS has inconsistent gap/width behaviour;
// FlatList allocates columns via UICollectionView internally — reliable & fast.

import { useState, useEffect, useRef } from 'react'
import { Text, View, TouchableOpacity, ActivityIndicator,
  FlatList, Platform, Animated, StatusBar } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { supabase } from '../../lib/supabase'
import { WARM, WM } from '../../lib/constants'
import { OCCASIONS } from '../../lib/occasions'
import type { Occasion } from '../../lib/occasions'

export default function OnboardingOccasionsScreen({ navigation }: any) {
  const track = 'remembrance'
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [saving, setSaving]     = useState(false)
  const fadeAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }).start()
    loadExisting()
  }, [])

  async function loadExisting() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('user_occasions')
        .select('occasion_key')
        .eq('user_id', user.id)
      if (data && data.length > 0) {
        setSelected(new Set(data.map((r: any) => r.occasion_key)))
      }
    } catch { /* non-fatal */ }
  }

  function toggleOccasion(key: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function handleContinue(skip = false) {
    setSaving(true)
    if (!skip && selected.size > 0) {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          // Delete all existing then insert fresh — avoids upsert/onConflict dependency
          await supabase.from('user_occasions').delete().eq('user_id', user.id)

          const rows = Array.from(selected).map(key => ({
            user_id: user.id, occasion_key: key, is_active: true,
          }))
          const { error } = await supabase.from('user_occasions').insert(rows)
          if (error) throw error
        }
      } catch (e) {
        console.warn('Occasions save error:', e)
      }
    }
    setSaving(false)
    navigation.navigate('OnboardingEmergency')
  }

  const selCount = selected.size

  // ── ListHeaderComponent — everything above the grid ──────────
  const ListHeader = (
    <Animated.View style={{ opacity: fadeAnim, paddingHorizontal: 24, paddingTop: 56 }}>

      <View style={{ alignItems: 'center', marginBottom: 8 }}>
        <Text style={{ fontSize: 36 }}>♡</Text>
        <Text style={{ fontSize: 12, color: WM.sub, letterSpacing: 1.5,
          textTransform: 'uppercase', marginTop: 4 }}>Step 2 of 4</Text>
      </View>

      <Text style={{ fontSize: 28, fontWeight: '800', color: WM.title,
        textAlign: 'center', marginTop: 16, marginBottom: 8, letterSpacing: -0.5 }}>
        Which occasions matter to you?
      </Text>
      <Text style={{ fontSize: 15, color: WM.sub, textAlign: 'center',
        lineHeight: 22, marginBottom: 20 }}>
        We'll help you remember and celebrate the moments that mean the most.
        Select all that apply — you can always change this later.
      </Text>

      {/* Privacy note */}
      <View style={{
        marginBottom: 20, padding: 14, borderRadius: 14,
        backgroundColor: WM.cardBg,
        borderWidth: 1, borderColor: WM.border,
        flexDirection: 'row', alignItems: 'flex-start', gap: 10,
      }}>
        <Text style={{ fontSize: 16, marginTop: 1 }}>🔒</Text>
        <Text style={{ color: WM.sub, fontSize: 12, lineHeight: 17, flex: 1 }}>
          Your selections are used only to personalise reminders and suggestions.
          We never store or infer your religion or beliefs.
        </Text>
      </View>

      {/* Selection count badge */}
      {selCount > 0 && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <View style={{
            backgroundColor: WM.accentBg,
            borderRadius: 12, paddingHorizontal: 12, paddingVertical: 4,
            borderWidth: 1, borderColor: WM.accent + '66',
          }}>
            <Text style={{ color: WM.accent, fontSize: 13, fontWeight: '700' }}>
              {selCount} selected
            </Text>
          </View>
          <TouchableOpacity onPress={() => setSelected(new Set())} activeOpacity={0.7}>
            <Text style={{ color: WM.sub, fontSize: 13, textDecorationLine: 'underline' }}>
              Clear all
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </Animated.View>
  )

  // ── renderItem — each occasion tile ─────────────────────────
  function renderTile({ item: occ }: { item: Occasion }) {
    const isSel = selected.has(occ.key)
    return (
      <TouchableOpacity
        onPress={() => toggleOccasion(occ.key)}
        activeOpacity={0.8}
        accessibilityLabel={`${isSel ? 'Deselect' : 'Select'} ${occ.label}`}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: isSel }}
        style={{
          flex: 1,
          borderRadius: 14,
          borderWidth: isSel ? 2 : 1,
          borderColor: isSel ? WM.accent : WM.border,
          backgroundColor: isSel ? WM.accentBg : WM.cardBg,
          padding: 14,
          minHeight: 90,
          justifyContent: 'space-between',
        }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
          <Text style={{ fontSize: 26 }}>{occ.icon}</Text>
          {isSel && (
            <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: WM.accent, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>✓</Text>
            </View>
          )}
        </View>
        <Text style={{ color: WM.title, fontSize: 13, fontWeight: isSel ? '700' : '600', marginBottom: 3 }} numberOfLines={1}>
          {occ.label}
        </Text>
        <Text style={{ color: isSel ? WM.accent : WM.sub, fontSize: 10, lineHeight: 13 }} numberOfLines={2}>
          {occ.sub}
        </Text>
      </TouchableOpacity>
    )
  }

  return (
    <LinearGradient colors={WARM} style={{ flex: 1 }}>
      <StatusBar barStyle="dark-content" />

      <FlatList
        data={OCCASIONS}
        numColumns={2}
        keyExtractor={(item) => item.key}
        extraData={selected}
        renderItem={renderTile}
        ListHeaderComponent={ListHeader}
        ListFooterComponent={<View style={{ height: 20 }} />}
        columnWrapperStyle={{ paddingHorizontal: 24, gap: 10 }}
        contentContainerStyle={{ paddingBottom: 140 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      />

      {/* ── Fixed bottom CTA — always visible so user can skip ── */}
      <View style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        paddingHorizontal: 24,
        paddingBottom: Platform.OS === 'ios' ? 40 : 24,
        paddingTop: 16,
        backgroundColor: WM.footerBg,
        borderTopWidth: 1, borderColor: WM.border,
        ...(Platform.OS === 'web' ? { maxWidth: 480, alignSelf: 'center' as any, width: '100%' as any } : {}),
      }}>
        <TouchableOpacity
          onPress={() => handleContinue(false)}
          disabled={saving}
          activeOpacity={0.85}
          style={{ marginBottom: 12 }}>
          <View style={{
            backgroundColor: selCount > 0 ? WM.title : 'rgba(61,16,32,0.25)',
            borderRadius: 16, paddingVertical: 18, alignItems: 'center',
          }}>
            {saving
              ? <ActivityIndicator color="#FFD07A" />
              : <Text style={{ color: '#FFD07A', fontSize: 16, fontWeight: '800' }}>
                  {selCount > 0 ? `Continue with ${selCount} occasion${selCount !== 1 ? 's' : ''}` : 'Continue'}
                </Text>}
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => handleContinue(true)}
          disabled={saving}
          activeOpacity={0.7}
          style={{ alignItems: 'center', paddingVertical: 6 }}>
          <Text style={{ color: WM.sub, fontSize: 14 }}>
            Skip for now — I'll set this up later
          </Text>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  )
}
