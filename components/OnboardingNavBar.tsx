/**
 * OnboardingNavBar
 *
 * Shared bottom navigation bar used across all 3 onboarding steps.
 * Renders:
 *   • Slim gradient progress bar + step labels
 *   • Optional "‹ Back" pill (hidden on step 1)
 *   • Aurora-bordered amber → pink gradient "Continue ›" button
 *   • Optional "Skip for now" text link above the buttons
 *   • "or swipe left / right" hint at the very bottom
 */
import { useRef, useEffect } from 'react'
import { View, Text, TouchableOpacity, ActivityIndicator, Animated, StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { WM } from '../lib/constants'

const STEP_LABELS = ['Profile', 'Contacts', 'Tour']

interface OnboardingNavBarProps {
  step:            1 | 2 | 3
  onContinue:      () => void
  continueLabel?:  string
  canContinue?:    boolean
  saving?:         boolean
  onBack?:         () => void   // omit on step 1
  onSkip?:         () => void   // shows a "Skip for now" link when provided
  skipLabel?:      string
}

export function OnboardingNavBar({
  step,
  onContinue,
  continueLabel = 'Continue',
  canContinue   = true,
  saving        = false,
  onBack,
  onSkip,
  skipLabel     = 'Skip for now',
}: OnboardingNavBarProps) {
  const fillPct  = `${(step / 3) * 100}%`
  const auroraAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(auroraAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
        Animated.timing(auroraAnim, { toValue: 0, duration: 1500, useNativeDriver: true }),
      ])
    ).start()
  }, [])

  return (
    <View style={{ paddingHorizontal: 24, paddingTop: 12, paddingBottom: 40 }}>

      {/* ── Progress bar ── */}
      <View style={{ marginBottom: 16 }}>
        <View style={{
          height: 4, borderRadius: 2,
          backgroundColor: 'rgba(61,16,32,0.12)',
          overflow: 'hidden', marginBottom: 7,
        }}>
          <LinearGradient
            colors={['#F06292', '#E8453C']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ height: 4, width: fillPct, borderRadius: 2 }}
          />
        </View>

        {/* Step label row */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {STEP_LABELS.map((label, i) => {
            const isActive  = i + 1 === step
            const isDone    = i + 1 < step
            return (
              <Text key={label} style={{
                fontSize: 10,
                fontWeight: isActive ? '700' : '500',
                color: isActive
                  ? '#F06292'
                  : isDone
                    ? 'rgba(61,16,32,0.5)'
                    : 'rgba(61,16,32,0.25)',
              }}>
                {label}
              </Text>
            )
          })}
        </View>
      </View>

      {/* ── Optional skip link ── */}
      {onSkip && (
        <TouchableOpacity
          onPress={onSkip}
          activeOpacity={0.7}
          style={{ alignItems: 'center', marginBottom: 12 }}
        >
          <Text style={{ fontSize: 12, color: WM.sub, opacity: 0.65 }}>
            {skipLabel}
          </Text>
        </TouchableOpacity>
      )}

      {/* ── Back pill + Continue button row ── */}
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>

        {/* Back pill — only shown when onBack is provided */}
        {onBack && (
          <TouchableOpacity
            onPress={onBack}
            activeOpacity={0.8}
            style={{
              height: 54, paddingHorizontal: 18, borderRadius: 14, flexShrink: 0,
              backgroundColor: 'rgba(255,255,255,0.55)',
              borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.65)',
              flexDirection: 'row', alignItems: 'center', gap: 4,
            }}
          >
            <Text style={{ fontSize: 18, color: WM.sub, fontWeight: '700', lineHeight: 22 }}>‹</Text>
            <Text style={{ fontSize: 14, color: WM.sub, fontWeight: '600' }}>Back</Text>
          </TouchableOpacity>
        )}

        {/* Continue — aurora border + amber→pink gradient button */}
        <TouchableOpacity
          onPress={onContinue}
          disabled={!canContinue || saving}
          activeOpacity={0.85}
          style={{ flex: 1 }}
        >
          {/* Aurora border wrapper — only active when button is enabled */}
          <View style={{ borderRadius: 16, padding: 2, overflow: 'hidden' }}>
            {canContinue ? (
              <>
                {/* Layer 1: base aurora gradient */}
                <LinearGradient
                  colors={['#F06292', '#FFD07A', '#C9A8FF']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFillObject}
                />
                {/* Layer 2: shifted aurora that cross-fades */}
                <Animated.View
                  pointerEvents="none"
                  style={[StyleSheet.absoluteFillObject, { opacity: auroraAnim }]}
                >
                  <LinearGradient
                    colors={['#FFD07A', '#C9A8FF', '#F06292']}
                    start={{ x: 1, y: 1 }}
                    end={{ x: 0, y: 0 }}
                    style={{ flex: 1 }}
                  />
                </Animated.View>
              </>
            ) : null}

            {/* Inner button */}
            <LinearGradient
              colors={canContinue
                ? ['#FFB347', '#F06292']
                : ['rgba(61,16,32,0.12)', 'rgba(61,16,32,0.12)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{
                height: 54, borderRadius: 14,
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={{
                  fontSize: 16, fontWeight: '800',
                  color: canContinue ? '#fff' : 'rgba(61,16,32,0.3)',
                }}>
                  {continueLabel} ›
                </Text>
              )}
            </LinearGradient>
          </View>
        </TouchableOpacity>
      </View>

      {/* ── Swipe hint ── */}
      <View style={{
        flexDirection: 'row', alignItems: 'center',
        justifyContent: 'center', gap: 8, marginTop: 11,
      }}>
        <View style={{ height: 1.5, width: 28, backgroundColor: 'rgba(122,52,72,0.18)', borderRadius: 1 }} />
        <Text style={{ fontSize: 10, color: 'rgba(122,52,72,0.38)' }}>or swipe left / right</Text>
        <View style={{ height: 1.5, width: 28, backgroundColor: 'rgba(122,52,72,0.18)', borderRadius: 1 }} />
      </View>

    </View>
  )
}
