import { useState, useEffect, useRef } from 'react'
import { Text, View, TouchableOpacity, TextInput, ActivityIndicator,
  ScrollView, KeyboardAvoidingView, Platform, Animated, StatusBar, Image } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import * as ImagePicker from 'expo-image-picker'
import { supabase } from '../../lib/supabase'
import { WARM, WM, SUPABASE_URL, SUPABASE_ANON_KEY } from '../../lib/constants'

export default function OnboardingProfileScreen({ navigation }: any) {
  const track = 'remembrance'
  const [name, setName]         = useState('')
  const [photoUri, setPhotoUri] = useState<string | null>(null)
  const [saving, setSaving]     = useState(false)
  const [focused, setFocused]   = useState(false)
  const fadeAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }).start()
    async function loadName() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const { data: profile } = await supabase
          .from('profiles').select('full_name').eq('id', user.id).single()
        if (profile?.full_name) {
          setName(profile.full_name)
        } else if (user.user_metadata?.full_name) {
          setName(user.user_metadata.full_name)
        }
      } catch { /* non-fatal */ }
    }
    loadName()
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

            const formData = new FormData()
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
            if (res.ok) {
              // Store the storage PATH — never a signed URL (they expire)
              avatar_url = uploadPath
            }
          } catch { /* photo upload non-fatal */ }
        }
        await supabase.from('profiles').update({
          full_name: name.trim(),
          track,
          avatar_url,
        }).eq('id', user.id)
      }
      navigation.navigate('OnboardingOccasions')
    } catch (e) {
      console.warn('Profile save error:', e)
      navigation.navigate('OnboardingOccasions')
    } finally {
      setSaving(false)
    }
  }

  const canContinue = name.trim().length > 0

  return (
    <LinearGradient colors={WARM} style={{ flex: 1 }}>
      <StatusBar barStyle="dark-content" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 28, paddingTop: 64, paddingBottom: 48 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View style={{ opacity: fadeAnim }}>

            {/* Header */}
            <View style={{ alignItems: 'center', marginBottom: 8 }}>
              <Text style={{ fontSize: 36 }}>♡</Text>
              <Text style={{ fontSize: 12, color: WM.sub, letterSpacing: 1.5,
                textTransform: 'uppercase', marginTop: 4 }}>Step 1 of 4</Text>
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

            {/* Name input */}
            <Text style={{ fontSize: 12, fontWeight: '700', color: WM.sub,
              letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 10 }}>
              Your full name
            </Text>
            <TextInput
              style={{
                backgroundColor: WM.inputBg,
                borderWidth: 1.5,
                borderColor: focused ? WM.accent : WM.border,
                borderRadius: 14,
                padding: 17,
                color: WM.title,
                fontSize: 17,
                marginBottom: 8,
              }}
              placeholder="e.g. Maria Santos"
              placeholderTextColor={WM.sub}
              value={name}
              onChangeText={setName}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              autoCapitalize="words"
            />
            <Text style={{ color: WM.sub, fontSize: 12, marginBottom: 32, lineHeight: 17 }}>
              This name will appear on your vault and in messages to your family.
            </Text>

            {/* Continue button */}
            <TouchableOpacity
              onPress={handleContinue}
              disabled={!canContinue || saving}
              activeOpacity={0.85}>
              <View style={{
                backgroundColor: canContinue ? WM.title : 'rgba(61,16,32,0.25)',
                borderRadius: 16, paddingVertical: 18, alignItems: 'center',
              }}>
                {saving
                  ? <ActivityIndicator color="#FFD07A" />
                  : <Text style={{ color: '#FFD07A', fontSize: 16, fontWeight: '800' }}>
                      Continue →
                    </Text>
                }
              </View>
            </TouchableOpacity>

          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  )
}
