import { useRef, useEffect, useContext, useState } from 'react'
import { Text, View, ScrollView, Animated, StatusBar, PanResponder, Image } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { supabase } from '../../lib/supabase'
import { WARM, WM } from '../../lib/constants'
import { AuthContext } from '../../lib/AuthContext'
import { OnboardingNavBar } from '../../components/OnboardingNavBar'

const LOGO_STACKED = require('../../assets/logos/logo-stacked.png')

// ── Rose Bokeh — rising orbs in rose, lavender & amber ──────────────
const ORB_PALETTE = [
  (a: number) => `rgba(240,98,146,${a})`,   // rose
  (a: number) => `rgba(201,168,255,${a})`,  // lavender
  (a: number) => `rgba(255,176,80,${a})`,   // amber
]

function RoseBokeh() {
  const orbs = useRef(
    Array.from({ length: 10 }, () => {
      const colorFn = ORB_PALETTE[Math.floor(Math.random() * ORB_PALETTE.length)]
      const size    = 12 + Math.random() * 20
      return {
        leftPct:  `${8 + Math.random() * 84}%` as any,
        size,
        color:    colorFn(0.14 + Math.random() * 0.16),
        animY:    new Animated.Value(0),
        animO:    new Animated.Value(0),
        duration: 3000 + Math.random() * 3000,
        delay:    Math.random() * 4500,
      }
    })
  ).current

  useEffect(() => {
    orbs.forEach(orb => {
      setTimeout(() => {
        Animated.loop(
          Animated.parallel([
            Animated.timing(orb.animY, {
              toValue: 1,
              duration: orb.duration,
              useNativeDriver: true,
            }),
            Animated.sequence([
              Animated.timing(orb.animO, {
                toValue: 1,
                duration: orb.duration * 0.28,
                useNativeDriver: true,
              }),
              Animated.timing(orb.animO, {
                toValue: 0,
                duration: orb.duration * 0.72,
                useNativeDriver: true,
              }),
            ]),
          ])
        ).start()
      }, orb.delay)
    })
  }, [])

  return (
    <View pointerEvents="none"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      {orbs.map((orb, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute',
            left: orb.leftPct,
            bottom: -orb.size / 2,
            width:  orb.size,
            height: orb.size,
            borderRadius: orb.size / 2,
            backgroundColor: orb.color,
            opacity: orb.animO,
            transform: [{
              translateY: orb.animY.interpolate({
                inputRange:  [0, 1],
                outputRange: [0, -300],
              }),
            }],
          }}
        />
      ))}
    </View>
  )
}

// ── Screen ───────────────────────────────────────────────────────────
export default function OnboardingTourScreen({ navigation }: any) {
  const { setUserTrack } = useContext(AuthContext)
  const [saving, setSaving] = useState(false)

  const anim0      = useRef(new Animated.Value(0)).current
  const anim1      = useRef(new Animated.Value(0)).current
  const anim2      = useRef(new Animated.Value(0)).current
  const headerAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const make = (val: Animated.Value, delay: number) =>
      Animated.timing(val, { toValue: 1, duration: 480, delay, useNativeDriver: true })

    Animated.parallel([
      make(headerAnim,   0),
      make(anim0,      200),
      make(anim1,      460),
      make(anim2,      720),
    ]).start()
  }, [])

  function animStyle(val: Animated.Value) {
    return {
      opacity: val,
      transform: [{
        translateY: val.interpolate({ inputRange: [0, 1], outputRange: [22, 0] }),
      }],
    }
  }

  async function handleFinish() {
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await supabase.from('profiles').update({
          track: 'remembrance',
          onboarding_completed: true,
        }).eq('id', user.id)
      }
      setUserTrack('remembrance')
      navigation.navigate('OnboardingBridge')
    } catch (e) {
      console.warn('Onboarding finish error:', e)
      navigation.navigate('OnboardingBridge')
    } finally {
      setSaving(false)
    }
  }

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, { dx, dy }) =>
        Math.abs(dx) > 20 && Math.abs(dx) > Math.abs(dy),
      onPanResponderRelease: (_, { dx }) => {
        if (dx < -60) handleFinish()
        else if (dx > 60) navigation.goBack()
      },
    })
  ).current

  return (
    <LinearGradient colors={WARM} style={{ flex: 1 }}>
      <StatusBar barStyle="dark-content" />

      <View style={{ flex: 1 }} {...panResponder.panHandlers}>
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: 24,
            paddingTop: 56,
            paddingBottom: 16,
          }}
          showsVerticalScrollIndicator={false}
        >

          {/* ── Header ── */}
          <Animated.View style={[{ alignItems: 'center', marginBottom: 28 }, animStyle(headerAnim)]}>
            <Image source={LOGO_STACKED} style={{ height: 52, width: 100, resizeMode: 'contain', marginBottom: 10 }} />
            <Text style={{ fontSize: 40, marginBottom: 6 }}>✨</Text>
            <Text style={{
              fontSize: 10, color: WM.sub, letterSpacing: 1.5,
              textTransform: 'uppercase', marginBottom: 8,
            }}>Step 3 of 3</Text>
            <Text style={{
              fontSize: 26, fontWeight: '800', color: WM.title,
              textAlign: 'center', marginBottom: 8,
            }}>
              Two things. Very different.
            </Text>
            <Text style={{
              fontSize: 14, color: WM.sub, textAlign: 'center',
              lineHeight: 22, maxWidth: 300,
            }}>
              Solace is built around a simple idea — but it's important to understand how the two halves work.
            </Text>
          </Animated.View>

          {/* ── Card 1: Moments ── */}
          <Animated.View style={[{ marginBottom: 14 }, animStyle(anim0)]}>
            <View style={{
              borderRadius: 18,
              borderWidth: 1,
              borderColor: WM.border,
              backgroundColor: WM.cardBg,
              overflow: 'hidden',
            }}>
              <View style={{ height: 4, backgroundColor: '#FFB347' }} />
              <View style={{ padding: 16 }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: '#C07840', marginBottom: 6 }}>
                  💌  Moments — for the living
                </Text>
                <Text style={{ fontSize: 13, color: WM.sub, lineHeight: 21 }}>
                  Schedule a birthday message, a wedding day note, an anniversary video. They go out automatically on the exact date — whether you're there or not.{'\n\n'}Your family never wonders if you remembered.
                </Text>
              </View>
            </View>
          </Animated.View>

          {/* ── Card 2: Vault ── */}
          <Animated.View style={[{ marginBottom: 14 }, animStyle(anim1)]}>
            <View style={{
              borderRadius: 18,
              borderWidth: 1,
              borderColor: WM.border,
              backgroundColor: WM.cardBg,
              overflow: 'hidden',
            }}>
              <View style={{ height: 4, backgroundColor: '#2E7D6E' }} />
              <View style={{ padding: 16 }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: '#2E7D6E', marginBottom: 6 }}>
                  🔐  Vault — for when it matters most
                </Text>
                <Text style={{ fontSize: 13, color: WM.sub, lineHeight: 21 }}>
                  Passwords, documents, heartfelt letters, digital keepsakes. Locked away safely.{'\n\n'}Your trusted contact — your trusted guardian — is the only one who can open it when your family needs it.
                </Text>
              </View>
            </View>
          </Animated.View>

          {/* ── Card 3: Your first contact — the founder ── */}
          <Animated.View style={[{ marginBottom: 14 }, animStyle(anim2)]}>
            <View style={{
              borderRadius: 18,
              borderWidth: 1,
              borderColor: WM.border,
              backgroundColor: WM.cardBg,
              overflow: 'hidden',
            }}>
              <View style={{ height: 4, backgroundColor: '#F06292' }} />
              <View style={{ padding: 16 }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: '#C2395A', marginBottom: 6 }}>
                  👋  You won't start alone
                </Text>
                <Text style={{ fontSize: 13, color: WM.sub, lineHeight: 21 }}>
                  When you open your Family page, one friendly face is already there: Sokha, the founder of Solace Life. He's your first point of support while you find your feet — questions, ideas, or just to say hello.{'\n\n'}This is your space. He can't see anything you save unless you choose to send it to him, and you can remove him anytime — no hard feelings.
                </Text>
              </View>
            </View>
          </Animated.View>

          {/* ── Card 4: Invitation + rose bokeh orbs ── */}
          <Animated.View style={[{ marginBottom: 8 }, animStyle(anim2)]}>
            <LinearGradient
              colors={['rgba(240,98,146,0.12)', 'rgba(255,176,80,0.10)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                borderRadius: 18,
                borderWidth: 1.5,
                borderColor: 'rgba(240,98,146,0.3)',
                overflow: 'hidden',
              }}
            >
              <RoseBokeh />
              <View style={{ padding: 16 }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: WM.title, marginBottom: 6 }}>
                  🌱  One moment. That's the whole job right now.
                </Text>
                <Text style={{ fontSize: 13, color: WM.sub, lineHeight: 21 }}>
                  Don't think about the vault. Don't think about everything you want to record.{'\n\n'}Just think of one birthday, one person, one thing you'd want them to hear.
                </Text>
              </View>
            </LinearGradient>
          </Animated.View>

        </ScrollView>

        <OnboardingNavBar
          step={3}
          onBack={() => navigation.goBack()}
          onContinue={handleFinish}
          continueLabel="Let's get started"
          saving={saving}
        />
      </View>
    </LinearGradient>
  )
}
