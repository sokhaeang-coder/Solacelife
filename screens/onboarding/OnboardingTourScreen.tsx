import { useState, useRef, useContext } from 'react'
import { Text, View, TouchableOpacity, Animated, StatusBar } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { WARM, WM } from '../../lib/constants'
import { AuthContext } from '../../lib/AuthContext'

const TOUR_SLIDES = [
  { icon: '🔐', title: 'Your Vault', color: '#8C1848',
    body: 'Store the things that matter most — letters to loved ones, important documents, passwords, and digital keepsakes. Locked and protected, only yours.' },
  { icon: '💌', title: 'Your Voice & Moments', color: '#C07840',
    body: 'Record voice memos, create photo albums, write stories, and leave video messages. Everything preserved in your own words — exactly as you made it.' },
  { icon: '👨‍👩‍👧', title: "Your Family's Inheritance", color: '#2E7D6E',
    body: 'When the time comes, your trusted contact unlocks everything for your family. Time capsules arrive on the days that matter most — birthdays, anniversaries, milestones.' },
]

export default function OnboardingTourScreen({ navigation }: any) {
  const { setUserTrack, setOnboardingDone } = useContext(AuthContext)
  const slides    = TOUR_SLIDES
  const [current, setCurrent] = useState(0)
  const slideAnim = useRef(new Animated.Value(0)).current
  const fadeAnim  = useRef(new Animated.Value(1)).current

  function goSlide(next: number) {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: -30, duration: 180, useNativeDriver: true }),
    ]).start(() => {
      setCurrent(next)
      slideAnim.setValue(30)
      Animated.parallel([
        Animated.timing(fadeAnim,  { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]).start()
    })
  }

  async function handleFinish() {
    navigation.navigate('OnboardingEstate')
  }

  const slide = slides[current]

  return (
    <LinearGradient colors={WARM} style={{ flex: 1 }}>
      <StatusBar barStyle="dark-content" />

      <View style={{ flex: 1, paddingHorizontal: 28, paddingTop: 60, paddingBottom: 40 }}>

        {/* Header */}
        <View style={{ alignItems: 'center', marginBottom: 8 }}>
          <Text style={{ fontSize: 36 }}>♡</Text>
          <Text style={{ fontSize: 12, color: WM.sub, letterSpacing: 1.5,
            textTransform: 'uppercase', marginTop: 4 }}>Step 3 of 4</Text>
        </View>

        {/* Slide content */}
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }], alignItems: 'center' }}>
            <View style={{
              width: 120, height: 120, borderRadius: 60, marginBottom: 28,
              backgroundColor: slide.color + '18',
              borderWidth: 2, borderColor: slide.color + '44',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Text style={{ fontSize: 52 }}>{slide.icon}</Text>
            </View>
            <Text style={{ fontSize: 26, fontWeight: '800', color: slide.color,
              textAlign: 'center', marginBottom: 16, letterSpacing: -0.5 }}>
              {slide.title}
            </Text>
            <Text style={{ fontSize: 16, color: WM.sub, textAlign: 'center',
              lineHeight: 26, maxWidth: 300, alignSelf: 'center' }}>
              {slide.body}
            </Text>
          </Animated.View>
        </View>

        {/* Dot indicators */}
        <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginBottom: 28 }}>
          {slides.map((_, i) => (
            <TouchableOpacity key={i} onPress={() => i < current + 1 && goSlide(i)}>
              <View style={{
                width: i === current ? 20 : 8,
                height: 8, borderRadius: 4,
                backgroundColor: i === current ? slide.color : WM.sub + '55',
              }} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Navigation button */}
        {current < slides.length - 1 ? (
          <TouchableOpacity onPress={() => goSlide(current + 1)} activeOpacity={0.85}>
            <View style={{
              backgroundColor: WM.title, borderRadius: 16, paddingVertical: 18, alignItems: 'center',
            }}>
              <Text style={{ color: '#FFD07A', fontSize: 16, fontWeight: '800' }}>Next →</Text>
            </View>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={handleFinish} activeOpacity={0.85}>
            <View style={{
              backgroundColor: WM.title, borderRadius: 16, paddingVertical: 18, alignItems: 'center',
            }}>
              <Text style={{ color: '#FFD07A', fontSize: 16, fontWeight: '800' }}>Continue →</Text>
            </View>
          </TouchableOpacity>
        )}

      </View>
    </LinearGradient>
  )
}
