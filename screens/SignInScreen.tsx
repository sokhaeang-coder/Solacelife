function SignInScreen({ navigation }: any) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [isError, setIsError] = useState(false)
  const [focused, setFocused] = useState('')

  async function handleSignIn() {
    if (!email || !password) { setIsError(true); setMessage('Please enter your email and password.'); return }
    setLoading(true); setMessage('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) {
      setIsError(true)
      setMessage(error.message)
    } else {
      setIsError(false)
      setMessage('✓  Welcome back to Solace Life.')
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
      <Text style={s.authTitle}>Welcome Back</Text>
      <Text style={s.authSubtitle}>Your legacy awaits you</Text>
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
          placeholder="Your password"
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
        <TouchableOpacity onPress={handleSignIn} disabled={loading} activeOpacity={0.85} style={{ marginTop: 8 }}>
          <LinearGradient colors={[C.amberLight, C.amber, '#C07840']} style={s.btnPrimary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
            {loading ? <ActivityIndicator color={C.bg1} /> : <Text style={s.btnPrimaryText}>Sign In</Text>}
          </LinearGradient>
        </TouchableOpacity>
      </View>
      <TouchableOpacity onPress={() => navigation.navigate('SignUp')} style={s.switchLink}>
        <Text style={s.switchText}>New to Solace Life?  <Text style={s.switchBold}>Create Account</Text></Text>
      </TouchableOpacity>
    </AuthWrapper>
  )
}