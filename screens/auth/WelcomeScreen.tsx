import { useState, useEffect, useRef } from 'react'
import { Text, View, TouchableOpacity, Animated, StatusBar } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { C, SKY, WARM, WM } from '../../lib/constants'
import { s } from '../../lib/styles'

export default function WelcomeScreen({ navigation }: any) {
  const fadeAnim  = useRef(new Animated.Value(0)).current
  const slideAnim = useRef(new Animated.Value(40)).current
  const pulseAnim = useRef(new Animated.Value(1)).current
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 1200, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 900,  useNativeDriver: true }),
    ]).start()
    Animated.loop(Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1.2, duration: 2500, useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1,   duration: 2500, useNativeDriver: true }),
    ])).start()
  }, [])
  return (
    <LinearGradient colors={SKY} style={s.flex}>
      <StatusBar barStyle="light-content" />
      <View style={s.orb1} /><View style={s.orb2} /><View style={s.orb3} />
      <Animated.View style={[s.heroSection, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
        <View style={s.logoArea}>
          <Animated.View style={[s.glowOrb, { transform: [{ scale: pulseAnim }] }]} />
          <View style={s.logoRing}>
            <LinearGradient colors={['#F06292', '#F48A5A']} style={s.logoCircle}>
              <Text style={s.logoIcon}>♡</Text>
            </LinearGradient>
          </View>
        </View>
        <Text style={s.heroTitle}>Solace Life</Text>
        <Text style={s.heroTagline}>Your legacy,{'\n'}preserved forever.</Text>
        <LinearGradient colors={['transparent', C.amber, 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.heroDivider} />
        <Text style={s.heroBody}>A private sanctuary for the moments and messages that matter most.</Text>
      </Animated.View>
      <Animated.View style={[s.ctaCard, { opacity: fadeAnim }]}>
        <LinearGradient colors={WARM} style={s.ctaGradient}>
          <TouchableOpacity onPress={() => navigation.navigate('SignUp')} activeOpacity={0.85}>
            <View style={[s.btnPrimary, { backgroundColor: WM.title }]}>
              <Text style={[s.btnPrimaryText, { color: '#FFD07A' }]}>Begin Your Legacy</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.btnSecondary, { backgroundColor: WM.cardBg, borderColor: WM.border }]}
            onPress={() => navigation.navigate('SignIn')}
            activeOpacity={0.75}>
            <Text style={[s.btnSecondaryText, { color: WM.title }]}>I already have an account</Text>
          </TouchableOpacity>
          <Text style={[s.footerText, { color: WM.sub }]}>Private  ·  Secure  ·  Encrypted</Text>
        </LinearGradient>
      </Animated.View>
    </LinearGradient>
  )
}
