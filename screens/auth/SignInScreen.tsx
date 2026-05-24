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

export default function SignInScreen({ navigation }: any) {
  const { setSession } = useContext(AuthContext)
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [message, setMessage]   = useState('')
  const [isError, setIsError]   = useState(false)
  const [focused, setFocused]   = useState('')

  async function handleSignIn() {
    if (!email || !password) { setIsError(true); setMessage('Please enter your email and password.'); return }
    setLoading(true); setMessage('')
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
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
      <Text style={[s.authTitle, { color: C.offWhite }]}>Welcome Back</Text>
      <Text style={[s.authSubtitle, { color: C.grey }]}>Your legacy awaits you</Text>

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
          placeholder="Your password"
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
        <TouchableOpacity onPress={handleSignIn} disabled={loading} activeOpacity={0.85} style={{ marginTop: 8 }}>
          <View style={[s.btnPrimary, { backgroundColor: WM.title }]}>
            {loading
              ? <ActivityIndicator color="#FFD07A" />
              : <Text style={[s.btnPrimaryText, { color: '#FFD07A' }]}>Sign In</Text>}
          </View>
        </TouchableOpacity>
      </View>

      {/* Switch link */}
      <TouchableOpacity onPress={() => navigation.navigate('SignUp')} style={s.switchLink}>
        <Text style={[s.switchText, { color: C.grey }]}>
          New to Solace Life?{'  '}
          <Text style={[s.switchBold, { color: C.amberLight }]}>Create Account</Text>
        </Text>
      </TouchableOpacity>
    </AuthWrapper>
  )
}
