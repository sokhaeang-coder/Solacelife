function SignUpScreen({ navigation }: any) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [isError, setIsError] = useState(false)
  const [focused, setFocused] = useState('')

  async function handleSignUp() {
    if (!email || !password) { setIsError(true); setMessage('Please enter your email and password.'); return }
    if (password.length < 6)  { setIsError(true); setMessage('Password must be at least 6 characters.'); return }
    setLoading(true); setMessage('')
    const { error } = await supabase.auth.signUp({ email, password })
    setLoading(false)
    if (error) {
      setIsError(true)
      setMessage(error.message)
    } else {
      setIsError(false)
      setMessage('✓  Account created! Signing you in...')
      setTimeout(() => {
        if (Platform.OS === 'web') {
          window.location.reload()
        }
      }, 800)
    }
  }

  return (
    <AuthWrapper>
      <TouchableOpacity style={s.backBtn} onPress={() => navigation.navigate('Welcome')}>
        <Text style={s.backText}>← Back</Text>
      </TouchableOpacity>
      <Text style={s.authTitle}>Create Account</Text>
      <Text style={s.authSubtitle}>Begin preserving your legacy today</Text>
      <View style={s.card}>
        <Text style={s.fieldLabel}>Email Address</Text>
        <TextInput
          style={[s.input, focused === 'email' && s.inputFocused]}
          placeholder="you@example.com"
          placeholderTextColor={C.greyDim}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          onFocus={() => setFocused('email')}
          onBlur={() => setFocused('')}
        />
        <Text style={s.fieldLabel}>Password</Text>
        <TextInput
          style={[s.input, focused === 'pw' && s.inputFocused]}
          placeholder="Minimum 6 characters"
          placeholderTextColor={C.greyDim}
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
        <TouchableOpacity onPress={handleSignUp} disabled={loading} activeOpacity={0.85} style={{ marginTop: 8 }}>
          <LinearGradient colors={[C.amberLight, C.amber, '#C07840']} style={s.btnPrimary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
            {loading ? <ActivityIndicator color={C.bg1} /> : <Text style={s.btnPrimaryText}>Create Account</Text>}
          </LinearGradient>
        </TouchableOpacity>
      </View>
      <TouchableOpacity onPress={() => navigation.navigate('SignIn')} style={s.switchLink}>
        <Text style={s.switchText}>Already have an account?  <Text style={s.switchBold}>Sign In</Text></Text>
      </TouchableOpacity>
    </AuthWrapper>
  )
}