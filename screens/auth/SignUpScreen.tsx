import { useState, useContext } from 'react'
import { Text, View, TouchableOpacity, TextInput, ActivityIndicator,
  ScrollView, KeyboardAvoidingView, Platform, Animated, StatusBar } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { supabase } from '../../lib/supabase'
import { C, SKY, WM } from '../../lib/constants'
import { s } from '../../lib/styles'
import { AuthContext } from '../../lib/AuthContext'

function AuthWrapper({ children }: any) {
  const fadeAnim  = useState(() => new Animated.Value(1))[0]
  const slideAnim = useState(() => new Animated.Value(0))[0]
  return (
    <LinearGradient colors={SKY} style={s.flex}>
      <StatusBar barStyle="light-content" />
      <View style={s.orb1} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.flex}>
        <ScrollView contentContainerStyle={s.authScroll} keyboardShouldPersistTaps="handled">
          <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
            {children}
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  )
}

export default function SignUpScreen({ navigation }: any) {
  const { setSession } = useContext(AuthContext)
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [message, setMessage]   = useState('')
  const [isError, setIsError]   = useState(false)
  const [focused, setFocused]   = useState('')

  async function handleSignUp() {
    if (!email || !password) { setIsError(true); setMessage('Please enter your email and password.'); return }
    if (password.length < 6)  { setIsError(true); setMessage('Password must be at least 6 characters.'); return }
    setLoading(true); setMessage('')
    const { data, error } = await supabase.auth.signUp({ email, password })
    setLoading(false)
    if (error) { setIsError(true); setMessage(error.message) } else { setSession(data.session) }
  }

  return (
    <AuthWrapper>
      {/* Back */}
      <TouchableOpacity style={s.backBtn} onPress={() => navigation.navigate('Welcome')}>
        <Text style={[s.backText, { color: C.amberLight }]}>← Back</Text>
      </TouchableOpacity>

      {/* Heading */}
      <Text style={[s.authTitle, { color: C.offWhite }]}>Create Account</Text>
      <Text style={[s.authSubtitle, { color: C.grey }]}>Begin preserving your legacy today</Text>

      {/* Warm card */}
      <View style={[s.card, {
        backgroundColor: WM.cardBg,
        borderColor:     WM.border,
      }]}>
        <Text style={[s.fieldLabel, { color: WM.sub }]}>Email Address</Text>
        <TextInput
          style={[s.input, {
            backgroundColor: WM.inputBg,
            color:           WM.title,
            borderColor:     focused === 'email' ? WM.accent : WM.border,
          }]}
          placeholder="you@example.com"
          placeholderTextColor={WM.sub}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          onFocus={() => setFocused('email')}
          onBlur={() => setFocused('')}
        />

        <Text style={[s.fieldLabel, { color: WM.sub }]}>Password</Text>
        <TextInput
          style={[s.input, {
            backgroundColor: WM.inputBg,
            color:           WM.title,
            borderColor:     focused === 'pw' ? WM.accent : WM.border,
          }]}
          placeholder="Minimum 6 characters"
          placeholderTextColor={WM.sub}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          onFocus={() => setFocused('pw')}
          onBlur={() => setFocused('')}
        />

        {message ? (
          <View style={[s.msgBox, isError ? s.msgError : s.msgSuccess]}>
            <Text style={{ color: isError ? C.error : C.success, fontSize: 15 }}>{message}</Text>
          </View>
        ) : null}

        {/* Primary button */}
        <TouchableOpacity onPress={handleSignUp} disabled={loading} activeOpacity={0.85} style={{ marginTop: 8 }}>
          <View style={[s.btnPrimary, { backgroundColor: WM.title }]}>
            {loading
              ? <ActivityIndicator color="#FFD07A" />
              : <Text style={[s.btnPrimaryText, { color: '#FFD07A' }]}>Create Account</Text>}
          </View>
        </TouchableOpacity>
      </View>

      {/* Switch link */}
      <TouchableOpacity onPress={() => navigation.navigate('SignIn')} style={s.switchLink}>
        <Text style={[s.switchText, { color: C.grey }]}>
          Already have an account?{'  '}
          <Text style={[s.switchBold, { color: C.amberLight }]}>Sign In</Text>
        </Text>
      </TouchableOpacity>
    </AuthWrapper>
  )
}
