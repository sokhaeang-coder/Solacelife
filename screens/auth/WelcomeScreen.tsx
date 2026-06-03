import { useState, useContext, useRef, useEffect } from 'react'
import {
  Text, View, TouchableOpacity, Animated, StatusBar, Image,
  StyleSheet, TextInput, ActivityIndicator, KeyboardAvoidingView,
  Platform, Modal,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Video, ResizeMode } from 'expo-av'
import { supabase } from '../../lib/supabase'
import { WARM, WM } from '../../lib/constants'
import { AuthContext } from '../../lib/AuthContext'

const LOGO_NAV  = require('../../assets/logos/logo-nav.png')
const SKY_VIDEO = require('../../assets/videos/sky_background.mp4')

type Sheet = null | 'signin' | 'signup'

// ─── Sign-in form ─────────────────────────────────────────────────────────────
function SignInForm({ onSwitch, setSession }: any) {
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
    if (error) { setIsError(true); setMessage(error.message) }
    else { setSession(data.session) }
  }

  return (
    <>
      <Text style={sh.title}>Welcome Back</Text>
      <Text style={sh.subtitle}>Your legacy awaits you</Text>
      <View style={sh.card}>
        <Text style={sh.label}>Email Address</Text>
        <TextInput
          style={[sh.input, { borderColor: focused === 'em' ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.25)' }]}
          placeholder="you@example.com" placeholderTextColor="rgba(255,255,255,0.45)"
          value={email} onChangeText={setEmail}
          autoCapitalize="none" keyboardType="email-address"
          onFocus={() => setFocused('em')} onBlur={() => setFocused('')}
        />
        <Text style={sh.label}>Password</Text>
        <TextInput
          style={[sh.input, { borderColor: focused === 'pw' ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.25)' }]}
          placeholder="Your password" placeholderTextColor="rgba(255,255,255,0.45)"
          value={password} onChangeText={setPassword} secureTextEntry
          onFocus={() => setFocused('pw')} onBlur={() => setFocused('')}
        />
        {message ? (
          <View style={[sh.msgBox, isError ? sh.msgErr : sh.msgOk]}>
            <Text style={{ color: isError ? '#FF8A80' : '#B9F6CA', fontSize: 13 }}>{message}</Text>
          </View>
        ) : null}
        <TouchableOpacity onPress={handleSignIn} disabled={loading} activeOpacity={0.88} style={{ marginTop: 10 }}>
          <LinearGradient colors={WARM} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={sh.btn}>
            {loading ? <ActivityIndicator color={WM.title} /> : <Text style={sh.btnText}>Sign In</Text>}
          </LinearGradient>
        </TouchableOpacity>
      </View>
      <TouchableOpacity onPress={onSwitch} style={sh.switchRow}>
        <Text style={sh.switchText}>
          New to Solace Life?{'  '}<Text style={sh.switchBold}>Create Account</Text>
        </Text>
      </TouchableOpacity>
    </>
  )
}

// ─── Sign-up form ─────────────────────────────────────────────────────────────
function SignUpForm({ onSwitch, setSession }: any) {
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
    if (error) { setIsError(true); setMessage(error.message) }
    else { setSession(data.session) }
  }

  return (
    <>
      <Text style={sh.title}>Create Account</Text>
      <Text style={sh.subtitle}>Begin preserving your legacy today</Text>
      <View style={sh.card}>
        <Text style={sh.label}>Email Address</Text>
        <TextInput
          style={[sh.input, { borderColor: focused === 'em' ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.25)' }]}
          placeholder="you@example.com" placeholderTextColor="rgba(255,255,255,0.45)"
          value={email} onChangeText={setEmail}
          autoCapitalize="none" keyboardType="email-address"
          onFocus={() => setFocused('em')} onBlur={() => setFocused('')}
        />
        <Text style={sh.label}>Password</Text>
        <TextInput
          style={[sh.input, { borderColor: focused === 'pw' ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.25)' }]}
          placeholder="Minimum 6 characters" placeholderTextColor="rgba(255,255,255,0.45)"
          value={password} onChangeText={setPassword} secureTextEntry
          onFocus={() => setFocused('pw')} onBlur={() => setFocused('')}
        />
        {message ? (
          <View style={[sh.msgBox, isError ? sh.msgErr : sh.msgOk]}>
            <Text style={{ color: isError ? '#FF8A80' : '#B9F6CA', fontSize: 13 }}>{message}</Text>
          </View>
        ) : null}
        <TouchableOpacity onPress={handleSignUp} disabled={loading} activeOpacity={0.88} style={{ marginTop: 10 }}>
          <LinearGradient colors={WARM} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={sh.btn}>
            {loading ? <ActivityIndicator color={WM.title} /> : <Text style={sh.btnText}>Create Account</Text>}
          </LinearGradient>
        </TouchableOpacity>
      </View>
      <TouchableOpacity onPress={onSwitch} style={sh.switchRow}>
        <Text style={sh.switchText}>
          Already have an account?{'  '}<Text style={sh.switchBold}>Sign In</Text>
        </Text>
      </TouchableOpacity>
    </>
  )
}

// ─── Welcome screen ───────────────────────────────────────────────────────────
export default function WelcomeScreen() {
  const { setSession }          = useContext(AuthContext)
  const [activeSheet, setSheet] = useState<Sheet>(null)
  const [sheetContent, setContent] = useState<Sheet>(null) // holds content while modal animates out

  const contentOpac  = useRef(new Animated.Value(0)).current
  const contentSlide = useRef(new Animated.Value(30)).current
  // Entrance animation on mount
  useEffect(() => {
    Animated.parallel([
      Animated.timing(contentOpac,  { toValue: 1, duration: 1400, useNativeDriver: true }),
      Animated.timing(contentSlide, { toValue: 0, duration: 1000, useNativeDriver: true }),
    ]).start()
  }, [])

  function openSheet(sheet: Sheet) {
    setContent(sheet)  // set form content before modal opens
    setSheet(sheet)    // triggers Modal visible = true → native slide-up
    // Dissolve welcome content
    Animated.timing(contentOpac, { toValue: 0, duration: 250, useNativeDriver: true }).start()
  }

  function closeSheet() {
    setSheet(null)  // triggers Modal visible = false → native slide-down
    // Fade welcome content back in after sheet starts leaving
    Animated.sequence([
      Animated.delay(150),
      Animated.timing(contentOpac, { toValue: 1, duration: 380, useNativeDriver: true }),
    ]).start()
  }

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* ── Video — always playing, never unmounts ── */}
      <Video
        source={SKY_VIDEO}
        style={StyleSheet.absoluteFill}
        resizeMode={ResizeMode.COVER}
        isLooping shouldPlay isMuted
      />

      {/* ── Permanent scrim ── */}
      <View style={s.scrim} />

      {/* ── Welcome content — dissolves when sheet opens ── */}
      <Animated.View style={[
        s.content,
        { opacity: contentOpac, transform: [{ translateY: contentSlide }] },
      ]}>
        {/* Logo — white glow shadow */}
        <View style={s.logoGlow}>
          <Image source={LOGO_NAV} style={s.logo} />
        </View>
        <View style={s.heroCard}>
          <Text style={s.tag}>LEGACY  ·  MEMORY  ·  LOVE</Text>
          <Text style={s.headline}>Preserve{'\n'}what matters{'\n'}most.</Text>
          <View style={s.divider} />
          <Text style={s.sub}>
            Leave your voice, your stories, your love — for the ones who will miss you most.
          </Text>
          <TouchableOpacity onPress={() => openSheet('signup')} activeOpacity={0.88}>
            <LinearGradient colors={WARM} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.btn1}>
              <Text style={s.btn1Text}>Begin your legacy</Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => openSheet('signin')} activeOpacity={0.75} style={s.btn2}>
            <Text style={s.btn2Text}>I already have an account</Text>
          </TouchableOpacity>
          <Text style={s.footer}>Private  ·  Secure  ·  Encrypted</Text>
        </View>
      </Animated.View>

      {/* ── Native transparent modal — slides on the UI thread, video shows through ── */}
      <Modal
        visible={activeSheet !== null}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={closeSheet}
      >
        {/* Tap backdrop to dismiss */}
        <TouchableOpacity
          style={s.modalBackdrop}
          activeOpacity={1}
          onPress={closeSheet}
        />

        {/* Glass sheet */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={s.sheetWrap}
        >
          <View style={s.sheet}>
            {/* Handle */}
            <View style={s.handle} />

            {/* Close pill */}
            <TouchableOpacity onPress={closeSheet} style={s.closeRow}>
              <View style={s.closePill}>
                <Text style={s.closeText}>✕  close</Text>
              </View>
            </TouchableOpacity>

            {/* Form content — no scroll, everything fits */}
            <View style={s.sheetBody}>
              {sheetContent === 'signin' && (
                <SignInForm
                  onSwitch={() => setContent('signup')}
                  setSession={setSession}
                />
              )}
              {sheetContent === 'signup' && (
                <SignUpForm
                  onSwitch={() => setContent('signin')}
                  setSession={setSession}
                />
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:  { flex: 1, backgroundColor: '#1565C0' },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.28)' },

  content: {
    flex: 1, paddingTop: 72,
    paddingHorizontal: 22, paddingBottom: 36,
    justifyContent: 'space-between',
  },
  // Logo glow + shimmer
  logoGlow: {
    alignSelf: 'flex-start',
    // White drop-shadow — follows transparent PNG pixels on iOS
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.75,
    shadowRadius: 14,
    elevation: 6,
  },
  logo: {
    width: 200,
    height: 52,
    resizeMode: 'contain',
  },

  heroCard: {
    backgroundColor: 'rgba(255,255,255,0.84)',
    borderRadius: 24, padding: 24,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.65)',
  },
  tag:      { fontSize: 9, letterSpacing: 2.5, color: '#C49A3C', marginBottom: 10 },
  headline: { fontSize: 30, fontWeight: '800', color: WM.title, lineHeight: 36, letterSpacing: -0.5 },
  divider:  { width: 24, height: 2, backgroundColor: '#C49A3C', marginTop: 14, marginBottom: 12 },
  sub:      { fontSize: 13, color: WM.sub, lineHeight: 20, marginBottom: 22 },
  btn1:     { borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginBottom: 10 },
  btn1Text: { fontSize: 15, fontWeight: '700', color: WM.title, letterSpacing: 0.2 },
  btn2: {
    backgroundColor: WM.cardBg, borderRadius: 14, paddingVertical: 13,
    alignItems: 'center', borderWidth: 1, borderColor: WM.border, marginBottom: 14,
  },
  btn2Text: { fontSize: 14, color: WM.title, fontWeight: '500' },
  footer:   { fontSize: 11, color: WM.sub, textAlign: 'center', letterSpacing: 0.5 },

  // Modal layout
  modalBackdrop: { flex: 1 },
  sheetWrap:     { justifyContent: 'flex-end' },

  // Glass sheet — tall enough that nothing scrolls
  sheet: {
    backgroundColor: 'rgba(10,20,40,0.55)',
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    height: '92%',
    borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
  sheetBody: { flex: 1, paddingHorizontal: 24, paddingBottom: 24 },
  handle: {
    width: 40, height: 4, backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 6,
  },
  closeRow:  { alignItems: 'flex-end', paddingHorizontal: 24, marginBottom: 6 },
  closePill: {
    backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 5,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  closeText: { fontSize: 12, color: 'rgba(255,255,255,0.7)', letterSpacing: 0.5 },
})

// ─── Sheet form styles ────────────────────────────────────────────────────────
const sh = StyleSheet.create({
  title:    { fontSize: 28, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.4, marginBottom: 4 },
  subtitle: { fontSize: 14, color: 'rgba(255,255,255,0.65)', marginBottom: 16 },
  card: {
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: 18, padding: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.20)', marginBottom: 14,
  },
  label: { fontSize: 12, color: 'rgba(255,255,255,0.6)', fontWeight: '600', marginBottom: 5, marginTop: 8 },
  input: {
    backgroundColor: 'rgba(255,255,255,0.10)', color: '#FFFFFF',
    borderRadius: 10, borderWidth: 1,
    paddingHorizontal: 14, paddingVertical: 13, fontSize: 15,
  },
  msgBox: { borderRadius: 8, padding: 9, marginTop: 8 },
  msgErr: { backgroundColor: 'rgba(255,100,100,0.20)' },
  msgOk:  { backgroundColor: 'rgba(100,255,150,0.15)' },
  btn:     { borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  btnText: { fontSize: 15, fontWeight: '700', color: WM.title },
  switchRow:  { alignItems: 'center', paddingTop: 10 },
  switchText: { fontSize: 13, color: 'rgba(255,255,255,0.55)' },
  switchBold: { color: 'rgba(255,200,120,0.95)', fontWeight: '700' },
})
