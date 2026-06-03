import { useState, useEffect, useRef } from 'react'
import { Text, View, TouchableOpacity, TextInput, ActivityIndicator,
  ScrollView, KeyboardAvoidingView, Platform, Animated, StatusBar, Image, PanResponder } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import * as ImagePicker from 'expo-image-picker'
import { supabase } from '../../lib/supabase'
import { WARM, WM, SUPABASE_URL, SUPABASE_ANON_KEY } from '../../lib/constants'
import { OnboardingNavBar } from '../../components/OnboardingNavBar'

// ── Format DOB as user types: MM/DD/YYYY ──────────────────────────
function formatDOB(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8)
  if (digits.length <= 2) return digits
  if (digits.length <= 4) return `${digits.slice(0,2)}/${digits.slice(2)}`
  return `${digits.slice(0,2)}/${digits.slice(2,4)}/${digits.slice(4)}`
}

export default function OnboardingProfileScreen({ navigation }: any) {
  const track = 'remembrance'
  const [name,     setName]     = useState('')
  const [phone,    setPhone]    = useState('')
  const [dob,      setDob]      = useState('')
  const [photoUri, setPhotoUri] = useState<string | null>(null)
  const [saving,   setSaving]   = useState(false)
  const [focused,  setFocused]  = useState<'name'|'phone'|'dob'|null>(null)
  const fadeAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }).start()
    async function loadProfile() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, phone, date_of_birth')
          .eq('id', user.id)
          .single()
        if (profile?.full_name)      setName(profile.full_name)
        else if (user.user_metadata?.full_name) setName(user.user_metadata.full_name)
        if (profile?.phone)          setPhone(profile.phone)
        if (profile?.date_of_birth)  setDob(formatDOB(profile.date_of_birth.replace(/-/g, '')))
      } catch { /* non-fatal */ }
    }
    loadProfile()
  }, [])

  async function pickPhoto() {
    if (Platform.OS !== 'web') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (status !== 'granted') return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8,
    } as any)
    if (!result.canceled && result.assets?.[0]) setPhotoUri(result.assets[0].uri)
  }

  async function handleContinue() {
    if (!name.trim()) return
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        let avatar_url: string | null = null
        if (photoUri) {
          try {
            const ext        = photoUri.split('.').pop()?.split('?')[0]?.toLowerCase() || 'jpg'
            const mime       = `image/${ext === 'jpg' ? 'jpeg' : ext}`
            const uploadPath = `profiles/${user.id}/avatar.${ext}`
            const formData   = new FormData()
            formData.append('file', { uri: photoUri, name: `avatar.${ext}`, type: mime } as any)
            const { data: sessionData } = await supabase.auth.getSession()
            const token = sessionData.session?.access_token || ''
            const res = await fetch(
              `${SUPABASE_URL}/storage/v1/object/memories/${uploadPath}`,
              {
                method: 'PUT',
                headers: {
                  apikey:        SUPABASE_ANON_KEY,
                  Authorization: `Bearer ${token}`,
                  'x-upsert':    'true',
                },
                body: formData,
              }
            )
            if (res.ok) avatar_url = uploadPath
          } catch { /* photo upload non-fatal */ }
        }

        // Parse DOB from MM/DD/YYYY → YYYY-MM-DD for storage
        let date_of_birth: string | null = null
        const dobDigits = dob.replace(/\D/g, '')
        if (dobDigits.length === 8) {
          date_of_birth = `${dobDigits.slice(4)}-${dobDigits.slice(0,2)}-${dobDigits.slice(2,4)}`
        }

        await supabase.from('profiles').update({
          full_name: name.trim(),
          track,
          avatar_url,
          phone:          phone.trim() || null,
          date_of_birth,
        }).eq('id', user.id)
      }
      navigation.navigate('OnboardingEmergency')
    } catch (e) {
      console.warn('Profile save error:', e)
      navigation.navigate('OnboardingEmergency')
    } finally {
      setSaving(false)
    }
  }

  const canContinue = name.trim().length > 0

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, { dx, dy }) =>
        Math.abs(dx) > 20 && Math.abs(dx) > Math.abs(dy),
      onPanResponderRelease: (_, { dx }) => {
        if (dx < -60 && canContinue) handleContinue()
      },
    })
  ).current

  // ── Shared input style ──────────────────────────────────────────
  function inputStyle(field: 'name'|'phone'|'dob') {
    return {
      backgroundColor: WM.inputBg,
      borderWidth: 1.5,
      borderColor: focused === field ? WM.accent : WM.border,
      borderRadius: 14,
      padding: 17,
      color: WM.title,
      fontSize: 17,
      marginBottom: 20,
    }
  }

  return (
    <LinearGradient colors={WARM} style={{ flex: 1 }}>
      <StatusBar barStyle="dark-content" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={{ flex: 1 }} {...panResponder.panHandlers}>
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 28, paddingTop: 64, paddingBottom: 16 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Animated.View style={{ opacity: fadeAnim }}>

              {/* Header */}
              <View style={{ alignItems: 'center', marginBottom: 8 }}>
                <Image
                  source={require('../../assets/logos/logo-stacked.png')}
                  style={{ height: 64, width: 120, resizeMode: 'contain' }}
                />
              </View>

              <Text style={{ fontSize: 28, fontWeight: '800', color: WM.title,
                textAlign: 'center', marginTop: 16, marginBottom: 8, letterSpacing: -0.5 }}>
                Tell us about you
              </Text>
              <Text style={{ fontSize: 15, color: WM.sub, textAlign: 'center',
                lineHeight: 22, marginBottom: 32 }}>
                This is how you'll appear to your family.
              </Text>

              {/* Avatar picker */}
              <TouchableOpacity onPress={pickPhoto} activeOpacity={0.8}
                style={{ alignSelf: 'center', marginBottom: 32, position: 'relative' }}>
                {photoUri ? (
                  <Image source={{ uri: photoUri }}
                    style={{ width: 100, height: 100, borderRadius: 50,
                      borderWidth: 3, borderColor: WM.border }} />
                ) : (
                  <View style={{ width: 100, height: 100, borderRadius: 50,
                    backgroundColor: WM.cardBg, borderWidth: 2, borderColor: WM.border,
                    alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 36 }}>👤</Text>
                    <Text style={{ color: WM.sub, fontSize: 11, marginTop: 4 }}>Add photo</Text>
                  </View>
                )}
                <View style={{ position: 'absolute', bottom: 0, right: 0,
                  width: 32, height: 32, borderRadius: 16,
                  backgroundColor: WM.accent, alignItems: 'center', justifyContent: 'center',
                  borderWidth: 2, borderColor: '#fff' }}>
                  <Text style={{ fontSize: 14 }}>📷</Text>
                </View>
              </TouchableOpacity>

              {/* ── Full name ── */}
              <Text style={{ fontSize: 12, fontWeight: '700', color: WM.sub,
                letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 10 }}>
                Full name *
              </Text>
              <TextInput
                style={inputStyle('name')}
                placeholder="e.g. Maria Santos"
                placeholderTextColor={WM.sub}
                value={name}
                onChangeText={setName}
                onFocus={() => setFocused('name')}
                onBlur={() => setFocused(null)}
                autoCapitalize="words"
                returnKeyType="next"
              />

              {/* ── Phone number ── */}
              <Text style={{ fontSize: 12, fontWeight: '700', color: WM.sub,
                letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 10 }}>
                Phone number
              </Text>
              <TextInput
                style={inputStyle('phone')}
                placeholder="e.g. +1 (555) 000-0000"
                placeholderTextColor={WM.sub}
                value={phone}
                onChangeText={setPhone}
                onFocus={() => setFocused('phone')}
                onBlur={() => setFocused(null)}
                keyboardType="phone-pad"
                returnKeyType="next"
              />
              <Text style={{ fontSize: 12, color: WM.sub, marginTop: -14, marginBottom: 20, lineHeight: 17, opacity: 0.8 }}>
                Used by your trusted contacts to reach you in an emergency.
              </Text>

              {/* ── Date of birth ── */}
              <Text style={{ fontSize: 12, fontWeight: '700', color: WM.sub,
                letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 10 }}>
                Date of birth
              </Text>
              <TextInput
                style={inputStyle('dob')}
                placeholder="MM/DD/YYYY"
                placeholderTextColor={WM.sub}
                value={dob}
                onChangeText={raw => setDob(formatDOB(raw))}
                onFocus={() => setFocused('dob')}
                onBlur={() => setFocused(null)}
                keyboardType="numeric"
                maxLength={10}
                returnKeyType="done"
              />
              <Text style={{ fontSize: 12, color: WM.sub, marginTop: -14, marginBottom: 20, lineHeight: 17, opacity: 0.8 }}>
                Helps us personalise reminders and celebrate your special days.
              </Text>

            </Animated.View>
          </ScrollView>

          <OnboardingNavBar
            step={1}
            onContinue={handleContinue}
            canContinue={canContinue}
            saving={saving}
          />
        </View>
      </KeyboardAvoidingView>
    </LinearGradient>
  )
}
