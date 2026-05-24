import { useEffect, useRef } from 'react'
import { Animated, Easing, StatusBar } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { SKY } from '../lib/constants'
import { s } from '../lib/styles'

// ─── Color contrast map ────────────────────────────────────────────────────
// SKY gradient zones (top → bottom):
//   0 %  #1E1248  dark indigo  → warm amber orb contrasts
//  30 %  #2E1660  dark violet  → golden orb contrasts
//  65 %  #7A2850  deep rose    → cool mint/teal orb contrasts
// 100 %  #C07840  warm amber   → cool lavender orb contrasts

const ORB1_COLORS = [
  'rgba(245,206,170,0.28)',   // amber     — top (indigo bg)
  'rgba(255,208,122,0.24)',   // gold      — upper-mid (violet bg)
  'rgba(138,255,212,0.22)',   // mint      — mid (rose bg)
  'rgba(176,158,255,0.24)',   // lavender  — lower (amber bg)
] as const

const ORB2_COLORS = [
  'rgba(138,255,212,0.20)',   // mint      — mid (rose bg)
  'rgba(176,158,255,0.22)',   // lavender  — lower (amber bg)
  'rgba(245,206,170,0.18)',   // amber     — bottom (amber bg)
] as const

export default function ScreenWrap({ children }: any) {
  // Orb 1 — top-left, 320×320, base centre ≈ (y:60)
  const o1x = useRef(new Animated.Value(0)).current
  const o1y = useRef(new Animated.Value(0)).current
  // Orb 2 — mid-right, 250×250, base centre ≈ (y:325)
  const o2x = useRef(new Animated.Value(0)).current
  const o2y = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const ease = Easing.inOut(Easing.sin)

    // ── Orb 1 — slow, broad sweep ─────────────────────────────────────────
    const a1x = Animated.loop(Animated.sequence([
      Animated.timing(o1x, { toValue: 90,  duration: 9000,  easing: ease, useNativeDriver: false }),
      Animated.timing(o1x, { toValue: -50, duration: 11000, easing: ease, useNativeDriver: false }),
      Animated.timing(o1x, { toValue: 0,   duration: 8000,  easing: ease, useNativeDriver: false }),
    ]))
    const a1y = Animated.loop(Animated.sequence([
      Animated.timing(o1y, { toValue: 320, duration: 14000, easing: ease, useNativeDriver: false }),
      Animated.timing(o1y, { toValue: 100, duration: 10000, easing: ease, useNativeDriver: false }),
      Animated.timing(o1y, { toValue: 0,   duration: 12000, easing: ease, useNativeDriver: false }),
    ]))

    // ── Orb 2 — slightly faster, opposite phase ───────────────────────────
    const a2x = Animated.loop(Animated.sequence([
      Animated.timing(o2x, { toValue: -110, duration: 10000, easing: ease, useNativeDriver: false }),
      Animated.timing(o2x, { toValue: -30,  duration: 8000,  easing: ease, useNativeDriver: false }),
      Animated.timing(o2x, { toValue: 0,    duration: 9000,  easing: ease, useNativeDriver: false }),
    ]))
    const a2y = Animated.loop(Animated.sequence([
      Animated.timing(o2y, { toValue: 260, duration: 11000, easing: ease, useNativeDriver: false }),
      Animated.timing(o2y, { toValue: 80,  duration: 9000,  easing: ease, useNativeDriver: false }),
      Animated.timing(o2y, { toValue: 0,   duration: 10000, easing: ease, useNativeDriver: false }),
    ]))

    a1x.start()
    a1y.start()
    // Stagger orb 2 so they don't mirror each other
    const t = setTimeout(() => { a2x.start(); a2y.start() }, 3500)

    return () => {
      a1x.stop(); a1y.stop()
      a2x.stop(); a2y.stop()
      clearTimeout(t)
    }
  }, [])

  // ── Color interpolation — tied to Y position ────────────────────────────
  // Orb 1 drifts from y≈60 (top) down to y≈380 (mid-lower)
  const orb1Bg = o1y.interpolate({
    inputRange:  [0,   100,  220,  320],
    outputRange: ORB1_COLORS,
    extrapolate: 'clamp',
  })

  // Orb 2 drifts from y≈325 (mid) down to y≈585 (lower)
  const orb2Bg = o2y.interpolate({
    inputRange:  [0,   130,  260],
    outputRange: ORB2_COLORS,
    extrapolate: 'clamp',
  })

  return (
    <LinearGradient
      colors={SKY}
      locations={[0, 0.3, 0.65, 1.0]}
      start={{ x: 0.2, y: 0 }}
      end={{ x: 0.8, y: 1 }}
      style={s.flex}>
      <StatusBar barStyle="light-content" />

      <Animated.View style={[s.orb1, {
        transform: [{ translateX: o1x }, { translateY: o1y }],
        backgroundColor: orb1Bg,
      }]} />

      <Animated.View style={[s.orb2, {
        transform: [{ translateX: o2x }, { translateY: o2y }],
        backgroundColor: orb2Bg,
      }]} />

      {children}
    </LinearGradient>
  )
}
