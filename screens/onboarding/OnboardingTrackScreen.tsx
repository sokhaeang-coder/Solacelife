import { useState, useEffect, useRef } from 'react'
import { Text, View, TouchableOpacity, ScrollView, Animated, StatusBar, Image } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { C, SKY } from '../../lib/constants'
import { s } from '../../lib/styles'

const LOGO_NAV = require('../../assets/logos/logo-nav.png')

export default function OnboardingTrackScreen({ navigation }: any) {
  const [selected, setSelected] = useState<'remembrance' | 'living_legacy' | null>(null)
  const fadeAnim = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }).start()
  }, [])

  return (
    <LinearGradient colors={SKY} style={s.flex}>
      <StatusBar barStyle="light-content" />
      <View style={s.orb1} /><View style={s.orb2} />
      <ScrollView contentContainerStyle={s.onboardScroll} showsVerticalScrollIndicator={false}>
        <Animated.View style={{ opacity: fadeAnim }}>

          <View style={s.onboardHeader}>
            <Image source={LOGO_NAV} style={{ height: 28, width: 120, resizeMode: 'contain' }} />
            <Text style={s.onboardStep}>Step 1 of 4</Text>
          </View>

          <Text style={s.onboardTitle}>Your love, delivered.</Text>
          <Text style={s.onboardSubtitle}>
            Choose how you'd like to share your story — for the people who matter most.
          </Text>

          {/* Track A card */}
          <TouchableOpacity
            activeOpacity={0.88}
            onPress={() => setSelected('remembrance')}
            style={[s.trackCard, { borderColor: selected === 'remembrance' ? C.amberLight : C.greyDim + '44',
              backgroundColor: selected === 'remembrance' ? '#2A1A0822' : C.mauveDim + '22' }]}>
            {selected === 'remembrance' && <View style={[s.trackCardGlow, { backgroundColor: C.amber + '18' }]} />}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 10 }}>
              <Text style={{ fontSize: 28 }}>🕊️</Text>
              <View style={{ flex: 1 }}>
                <Text style={[s.trackCardTitle, { color: C.amberLight }]}>The Legacy Path</Text>
                <Text style={[s.trackCardBadge, { color: C.amber, borderColor: C.amberDim }]}>Your words · Your voice · Your legacy</Text>
              </View>
              <View style={[s.trackRadio, selected === 'remembrance' && { borderColor: C.amberLight, backgroundColor: C.amberLight }]}>
                {selected === 'remembrance' && <View style={s.trackRadioInner} />}
              </View>
            </View>
            <Text style={[s.trackCardDesc, { color: C.offWhite }]}>
              Leave love letters, video messages, and recorded stories — delivered to your family on the days that mean the most.
            </Text>
            {['Time capsule messages for any occasion', 'Voice memos & video messages', 'Written stories & photo albums', 'Encrypted vault for important documents', 'Family access when they need it most'].map((f, i) => (
              <View key={i} style={s.trackFeatureRow}>
                <Text style={{ color: C.amber, fontSize: 13, width: 16 }}>✓</Text>
                <Text style={{ color: C.grey, fontSize: 13, flex: 1 }}>{f}</Text>
              </View>
            ))}
          </TouchableOpacity>

          {/* Track B card */}
          <TouchableOpacity
            activeOpacity={0.88}
            onPress={() => setSelected('living_legacy')}
            style={[s.trackCard, { borderColor: selected === 'living_legacy' ? C.accent : C.greyDim + '44',
              backgroundColor: selected === 'living_legacy' ? C.mauveDim + '55' : C.mauveDim + '22' }]}>
            {selected === 'living_legacy' && <View style={[s.trackCardGlow, { backgroundColor: C.accent + '18' }]} />}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 10 }}>
              <Text style={{ fontSize: 28 }}>✨</Text>
              <View style={{ flex: 1 }}>
                <Text style={[s.trackCardTitle, { color: C.accent }]}>The Living Legacy Path</Text>
                <Text style={[s.trackCardBadge, { color: C.accent, borderColor: C.mauveDim }]}>Everything in Legacy + AI presence</Text>
              </View>
              <View style={[s.trackRadio, selected === 'living_legacy' && { borderColor: C.accent, backgroundColor: C.accent }]}>
                {selected === 'living_legacy' && <View style={s.trackRadioInner} />}
              </View>
            </View>
            <Text style={[s.trackCardDesc, { color: C.offWhite }]}>
              Everything in Legacy, plus an AI avatar your family can have conversations with — trained on your personality, values, and stories.
            </Text>
            {['Everything in Legacy', 'AI avatar trained on your personality', 'Family can send messages to your avatar', 'Enhanced voice & personality (coming soon)'].map((f, i) => (
              <View key={i} style={s.trackFeatureRow}>
                <Text style={{ color: C.accent, fontSize: 13, width: 16 }}>✓</Text>
                <Text style={{ color: C.grey, fontSize: 13, flex: 1 }}>{f}</Text>
              </View>
            ))}
          </TouchableOpacity>

          <Text style={{ color: C.greyDim, fontSize: 12, textAlign: 'center', marginTop: 8, marginBottom: 20, lineHeight: 18 }}>
            You can change paths at any time in your profile settings.
          </Text>

          <TouchableOpacity
            onPress={() => selected && navigation.navigate('OnboardingProfile', { track: selected })}
            disabled={!selected}
            activeOpacity={0.85}>
            <LinearGradient
              colors={selected ? [C.amberLight, C.amber, '#C07840'] : [C.greyDim, C.greyDim]}
              style={s.btnPrimary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
              <Text style={[s.btnPrimaryText, !selected && { color: C.bg3 }]}>
                {selected ? 'This is my path →' : 'Select a path to continue'}
              </Text>
            </LinearGradient>
          </TouchableOpacity>

        </Animated.View>
      </ScrollView>
    </LinearGradient>
  )
}
