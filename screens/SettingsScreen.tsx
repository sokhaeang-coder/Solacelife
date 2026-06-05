import { useState, useEffect, useContext, useMemo } from 'react'
import { Text, View, TouchableOpacity, ActivityIndicator,
  ScrollView, FlatList, Modal, Platform, Linking, Image, TextInput,
  Dimensions, Alert } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { supabase } from '../lib/supabase'
import { C, WARM, WM, PLUM, SUPABASE_URL, SUPABASE_ANON_KEY } from '../lib/constants'
import { s } from '../lib/styles'
import ScreenWrap from '../components/ScreenWrap'
import { AuthContext } from '../lib/AuthContext'
import { detectCurrency, getPlanPrice, currencyTag, type Currency } from '../lib/currency'
import { OCCASIONS, OCCASIONS_MAP } from '../lib/occasions'
import ProfessionalServicesModal from './ProfessionalServicesModal'
import { useNavScale, type NavScaleOption } from '../lib/NavScaleContext'

// ── v4 Pricing Model ─────────────────────────────────────────
// Two clean annual plans. Same price in USD and CAD.
// 30-day free trial on both — no card required until trial ends.

const PLANS = [
  {
    key: 'annual',
    label: 'Solace Life',
    tagline: 'One membership — your family never pays to receive what you leave them.',
    icon: '💌',
    badge: '30 Days Free',
    highlight: false,
    features: [
      'Unlimited moments — voice, video, written & photos',
      'Unlimited family members',
      'Scheduled delivery for any occasion, any date',
      'Secure vault with per-person sharing',
      'Trusted contact & check-in protection',
      'After your passing: stays with your family at no cost, 25+ years guaranteed',
    ],
  },
]

export default function SettingsScreen({ navigation }: any) {
  const [showPartnersModal, setShowPartnersModal] = useState(false)
  const { userTrack, subscriptionTier, subscriptionStatus, setSubscriptionTier, setSubscriptionStatus } = useContext(AuthContext)
  const { navScale, setNavScale } = useNavScale()
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [paymentResult,   setPaymentResult]   = useState<'success' | 'cancel' | null>(null)

  useEffect(() => {
    // Native: deep link handler
    const handleUrl = ({ url }: { url: string }) => {
      if (url.startsWith('solacelife://payment-success')) {
        handlePaymentSuccess()
      } else if (url.startsWith('solacelife://payment-cancel')) {
        setPaymentResult('cancel')
      }
    }
    const sub = Linking.addEventListener('url', handleUrl)

    // Web: check query string on mount (Stripe redirects back with ?payment=success)
    if (Platform.OS === 'web') {
      const params = new URLSearchParams((window as any).location.search)
      if (params.get('payment') === 'success') {
        handlePaymentSuccess()
        // Clean up URL
        ;(window as any).history.replaceState({}, '', (window as any).location.pathname)
      } else if (params.get('payment') === 'cancelled') {
        setPaymentResult('cancel')
        ;(window as any).history.replaceState({}, '', (window as any).location.pathname)
      }
    }

    return () => sub.remove()
  }, [])

  async function handlePaymentSuccess() {
    setPaymentResult('success')
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data } = await supabase.from('profiles')
        .select('subscription_tier, subscription_status')
        .eq('id', user.id)
        .single()
      if (data) {
        setSubscriptionTier(data.subscription_tier || 'free')
        setSubscriptionStatus(data.subscription_status || 'inactive')
      }
    }
  }

  async function handleCheckout(plan: string, _billing?: string) {
    setCheckoutLoading(true)
    setUpgradeMsg('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setUpgradeMsg('Not signed in. Please sign out and back in.'); return }

      const res = await fetch(`${SUPABASE_URL}/functions/v1/create-checkout-session`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey':        SUPABASE_ANON_KEY,
        },
        // Pass currency so the Edge Function selects the correct Stripe price ID
        body: JSON.stringify({ plan, platform: Platform.OS, currency }),
      })

      const json = await res.json()
      console.log('Checkout response:', JSON.stringify(json))

      if (json.error) {
        console.error('Checkout error:', json.error)
        setUpgradeMsg('Unable to start checkout. Please try again or contact support.')
        return
      }
      if (!json.url) {
        setUpgradeMsg('No checkout URL returned. Please try again.')
        return
      }

      if (Platform.OS === 'web') {
        (window as any).location.href = json.url
      } else {
        const WebBrowser = await import('expo-web-browser')
        await WebBrowser.openBrowserAsync(json.url)
      }
    } catch (e: any) {
      console.error('handleCheckout error:', e)
      setUpgradeMsg('Unable to start checkout. Please try again.')
    } finally {
      setCheckoutLoading(false)
    }
  }

  const [userEmail, setUserEmail]           = useState('')
  const [fullName, setFullName]             = useState('')
  const [avatarUrl, setAvatarUrl]           = useState<string | null>(null)
  const [plan, setPlan]                     = useState<string>('free')
  const [profileLoading, setProfileLoading] = useState(true)
  const [checkinProfile, setCheckinProfile] = useState<any>(null)

  // ── Profile editing ──
  const [showEditProfile, setShowEditProfile] = useState(false)
  const [editName, setEditName]               = useState('')
  const [editEmail, setEditEmail]             = useState('')
  const [editPhone, setEditPhone]             = useState('')
  const [profilePhone, setProfilePhone]       = useState('')
  const [editPhotoUri, setEditPhotoUri]       = useState<string | null>(null)
  const [profileSaving, setProfileSaving]     = useState(false)
  const [profileMsg, setProfileMsg]           = useState('')
  const [memoriesCount, setMemoriesCount]     = useState(0)
  const [familyCount, setFamilyCount]         = useState(0)
  const [vaultCount, setVaultCount]           = useState(0)

  // ── Occasions / celebrations ──
  const [userOccasionKeys, setUserOccasionKeys]   = useState<string[]>([])
  const [showEditOccasions, setShowEditOccasions] = useState(false)
  const [editOccasions, setEditOccasions]         = useState<Set<string>>(new Set())
  const [occasionsSaving, setOccasionsSaving]     = useState(false)
  const [occasionSearch, setOccasionSearch]       = useState('')

  const filteredOccasions = useMemo(() =>
    occasionSearch.trim()
      ? OCCASIONS.filter(o =>
          o.label.toLowerCase().includes(occasionSearch.toLowerCase()) ||
          o.sub.toLowerCase().includes(occasionSearch.toLowerCase())
        )
      : OCCASIONS,
    [occasionSearch]
  )

  const [showOccasionSuggestions, setShowOccasionSuggestions] = useState(true)

  const [showUpgrade, setShowUpgrade]       = useState(false)
  const [upgrading, setUpgrading]           = useState(false)
  const [upgradingKey, setUpgradingKey]     = useState<string | null>(null)
  const [upgradeMsg, setUpgradeMsg]         = useState('')

  // Tile width for 2-column occasions grid inside the modal
  const screenWidth  = Dimensions.get('window').width
  const modalWidth   = Math.min(screenWidth, 560)
  const occ_tileW    = Math.min((modalWidth - 48 - 10) / 2, 200)

  // Detect user's currency from device locale (CAD for Canada, USD everywhere else).
  // Memoised so it only runs once per component mount — locale doesn't change mid-session.
  const currency: Currency = useMemo(() => detectCurrency(), [])

  useEffect(() => { loadProfile(); loadOccasions() }, [])
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadProfile()
      loadOccasions()
    })
    return unsubscribe
  }, [navigation])

  async function loadProfile() {
    setProfileLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setProfileLoading(false); return }
    setUserEmail(user.email || '')
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    if (data) {
      // Fall back to auth user_metadata if profiles.full_name hasn't been saved yet
      setFullName(data.full_name || user.user_metadata?.full_name || '')
      // Resolve avatar: new records store a storage path; legacy records store a signed URL
      if (data.avatar_url) {
        if (data.avatar_url.startsWith('http')) {
          // Legacy signed URL — use as-is (will eventually expire but works for now)
          setAvatarUrl(data.avatar_url)
        } else {
          // Storage path — generate a fresh signed URL valid for 1 hour
          const { data: signed } = await supabase.storage
            .from('memories').createSignedUrl(data.avatar_url, 3600)
          setAvatarUrl(signed?.signedUrl || null)
        }
      } else {
        setAvatarUrl(null)
      }
      setPlan(data.plan || 'free')
      setCheckinProfile(data)
      setShowOccasionSuggestions(data.show_occasion_suggestions ?? true)
      setProfilePhone(data.phone || '')
    }
    // Fetch activity counts for progress ring + milestone card
    const [mRes, fRes, vRes] = await Promise.all([
      supabase.from('memories').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase.from('family_members').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase.from('vault_items').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
    ])
    setMemoriesCount(mRes.count ?? 0)
    setFamilyCount(fRes.count ?? 0)
    setVaultCount(vRes.count ?? 0)
    setProfileLoading(false)
  }

  async function loadOccasions() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase
      .from('user_occasions')
      .select('occasion_key')
      .eq('user_id', user.id)
    setUserOccasionKeys(data?.map((r: any) => r.occasion_key) || [])
  }

  async function pickProfilePhoto() {
    if (Platform.OS !== 'web') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (status !== 'granted') return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8,
    } as any)
    if (!result.canceled && result.assets?.[0]) setEditPhotoUri(result.assets[0].uri)
  }

  async function saveProfile() {
    if (!editName.trim()) { setProfileMsg('Please enter your name.'); return }
    setProfileSaving(true); setProfileMsg('')

    // Capture before any state resets — these values will be lost once modal closes
    const localUri        = editPhotoUri
    const prevAvatarUrl   = avatarUrl

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setProfileSaving(false); return }

      // 1. Update display immediately — don't make user wait for upload
      setFullName(editName.trim())
      if (localUri) setAvatarUrl(localUri)   // show local photo right away
      setShowEditProfile(false)
      setEditPhotoUri(null)

      // 2. Upload photo to Supabase in background (modal already closed)
      // Uses FormData + direct REST instead of blob() — blob() drops the content-type
      // on React Native iOS file:// URIs, causing Supabase to silently reject the upload.
      let cloudUrl: string | null = prevAvatarUrl
      if (localUri) {
        try {
          const ext        = localUri.split('.').pop()?.split('?')[0]?.toLowerCase() || 'jpg'
          const mime       = `image/${ext === 'jpg' ? 'jpeg' : ext}`
          const uploadPath = `profiles/${user.id}/avatar.${ext}`

          const formData = new FormData()
          formData.append('file', { uri: localUri, name: `avatar.${ext}`, type: mime } as any)

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
            // Store the storage PATH in the DB — never store the signed URL itself,
            // as signed URL tokens expire and will drop the photo on future loads.
            cloudUrl = uploadPath
            // Generate a short-lived signed URL just for immediate on-screen display
            const { data: signed } = await supabase.storage
              .from('memories').createSignedUrl(uploadPath, 3600)
            if (signed?.signedUrl) {
              setAvatarUrl(signed.signedUrl)   // swap local → cloud URL once ready
            }
          } else {
            console.warn('Avatar upload failed:', res.status, await res.text())
          }
        } catch (uploadEx) {
          console.warn('Avatar upload exception:', uploadEx)
        }
      }

      // 3. Persist to DB — only write avatar_url if we have a new cloud URL,
      // never overwrite an existing avatar with null if upload failed
      const dbPayload: Record<string, any> = {
        full_name: editName.trim(),
        email:     editEmail.trim() || null,
        phone:     editPhone.trim() || null,
      }
      if (cloudUrl && cloudUrl !== prevAvatarUrl) dbPayload.avatar_url = cloudUrl
      await supabase.from('profiles').update(dbPayload).eq('id', user.id)

      // 4. Sync contact info back to any family_members rows that reference
      // this user as a recipient — so other users' Family lists stay current
      await supabase
        .from('family_members')
        .update({
          name:  editName.trim(),
          email: editEmail.trim() || null,
          phone: editPhone.trim() || null,
        })
        .eq('recipient_profile_id', user.id)

      // 5. Reflect phone in local state
      setProfilePhone(editPhone.trim())

    } catch (e: any) {
      setProfileMsg('Error saving: ' + e.message)
    }
    setProfileSaving(false)
  }

  function openEditOccasions() {
    setEditOccasions(new Set(userOccasionKeys))
    setOccasionSearch('')
    setShowEditOccasions(true)
  }

  async function saveOccasions() {
    setOccasionsSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setOccasionsSaving(false); return }
    try {
      // Delete all existing then insert fresh — avoids upsert/onConflict dependency
      const { error: deleteErr } = await supabase
        .from('user_occasions')
        .delete()
        .eq('user_id', user.id)
      if (deleteErr) throw deleteErr

      if (editOccasions.size > 0) {
        const rows = Array.from(editOccasions).map(key => ({
          user_id: user.id, occasion_key: key, is_active: true,
        }))
        const { error: insertErr } = await supabase
          .from('user_occasions')
          .insert(rows)
        if (insertErr) throw insertErr
      }

      setUserOccasionKeys(Array.from(editOccasions))
      setShowEditOccasions(false)
    } catch (e: any) {
      console.warn('Occasions save error:', e)
      Alert.alert('Could not save', 'Your celebrations could not be saved. Please try again.')
    }
    setOccasionsSaving(false)
  }

  async function toggleOccasionSuggestions(val: boolean) {
    setShowOccasionSuggestions(val)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('profiles').update({ show_occasion_suggestions: val }).eq('id', user.id)
  }

  async function handleUpgrade(planKey: string) {
    setShowUpgrade(false)
    await handleCheckout(planKey, 'annual')
  }

  async function handleSignOut() { await supabase.auth.signOut() }

  // ── Support / issue reporting ──────────────────────────────────────────────
  //  Opens the user's mail app with diagnostic context pre-filled so Sokha
  //  gets actionable reports instead of blank "it's broken" messages.
  function openSupportReport() {
    const version     = '1.0.0'
    const platform    = Platform.OS
    const accountType = checkinProfile?.account_type || 'unknown'
    const planLabel   = subscriptionTier || plan || 'free'
    const subStatus   = subscriptionStatus || 'inactive'

    const subject = encodeURIComponent(
      `[Solace Life Issue] v${version} · ${platform}`
    )
    const body = encodeURIComponent(
      `App Version: ${version}\n` +
      `Platform: ${platform}\n` +
      `Account Type: ${accountType}\n` +
      `Plan: ${planLabel} (${subStatus})\n` +
      `Email: ${userEmail}\n` +
      `\n---\nDescribe what happened:\n\n`
    )
    Linking.openURL(`mailto:sokhaeang@gmail.com?subject=${subject}&body=${body}`)
  }

  function openFeedback() {
    const subject = encodeURIComponent('[Solace Life Feedback]')
    const body    = encodeURIComponent('Hi Sokha,\n\n')
    Linking.openURL(`mailto:sokhaeang@gmail.com?subject=${subject}&body=${body}`)
  }

  // ── Manage Senders (G2 view) ─────────────────────────────────────────────
  type SenderEntry = {
    id: string
    senderProfileId: string
    senderName: string
    senderAvatarUrl: string | null
    consentStatus: string
  }
  const [senders, setSenders]                             = useState<SenderEntry[]>([])
  const [sendersLoading, setSendersLoading]               = useState(false)
  const [showManageSenders, setShowManageSenders]         = useState(false)
  const [selectedSenderEntry, setSelectedSenderEntry]     = useState<SenderEntry | null>(null)
  const [showSenderActionModal, setShowSenderActionModal] = useState(false)
  const [senderActionLoading, setSenderActionLoading]     = useState(false)
  const [senderActionMsg, setSenderActionMsg]             = useState('')

  async function loadSenders() {
    setSendersLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSendersLoading(false); return }

    const { data, error } = await supabase
      .from('family_members')
      .select('id, user_id, consent_status, profiles:user_id(id, full_name, avatar_url)')
      .eq('recipient_profile_id', user.id)

    if (error || !data) { setSendersLoading(false); return }

    const entries: SenderEntry[] = []
    for (const row of data) {
      const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles as any
      let avatarResolved: string | null = null
      if (profile?.avatar_url) {
        if (profile.avatar_url.startsWith('http')) {
          avatarResolved = profile.avatar_url
        } else {
          const { data: signed } = await supabase.storage
            .from('memories').createSignedUrl(profile.avatar_url, 3600)
          avatarResolved = signed?.signedUrl || null
        }
      }
      entries.push({
        id:              row.id,
        senderProfileId: row.user_id,
        senderName:      profile?.full_name || 'Unknown',
        senderAvatarUrl: avatarResolved,
        consentStatus:   row.consent_status ?? 'pending',
      })
    }
    setSenders(entries)
    setSendersLoading(false)
  }

  async function handleSenderConsent(entry: SenderEntry, newStatus: 'revoked' | 'blocked') {
    setSenderActionLoading(true)
    setSenderActionMsg('')
    const { error } = await supabase
      .from('family_members')
      .update({
        consent_status: newStatus,
        ...(newStatus === 'revoked' ? { revoked_at: new Date().toISOString() } : {}),
      })
      .eq('id', entry.id)
    if (error) {
      setSenderActionMsg('Could not update — please try again.')
    } else {
      setSenders(prev => prev.map(s => s.id === entry.id ? { ...s, consentStatus: newStatus } : s))
      setSelectedSenderEntry(e => e?.id === entry.id ? { ...e, consentStatus: newStatus } : e)
      setSenderActionMsg(newStatus === 'revoked' ? 'Consent revoked.' : 'Sender blocked and reported.')
    }
    setSenderActionLoading(false)
  }

  async function handleRestoreConsent(entry: SenderEntry) {
    setSenderActionLoading(true)
    setSenderActionMsg('')
    const { error } = await supabase
      .from('family_members')
      .update({ consent_status: 'consented', revoked_at: null })
      .eq('id', entry.id)
    if (error) {
      setSenderActionMsg('Could not update — please try again.')
    } else {
      setSenders(prev => prev.map(s => s.id === entry.id ? { ...s, consentStatus: 'consented' } : s))
      setSelectedSenderEntry(e => e?.id === entry.id ? { ...e, consentStatus: 'consented' } : e)
      setSenderActionMsg('Consent restored.')
    }
    setSenderActionLoading(false)
  }

  const isRecipient = checkinProfile?.account_type === 'recipient' || checkinProfile?.account_type === 'both'

  // ── Test: manually fire the delivery edge function ────────────────────────
  const [triggeringDelivery, setTriggeringDelivery] = useState(false)
  const [deliveryResult, setDeliveryResult]         = useState<string | null>(null)

  async function handleTriggerDelivery() {
    setTriggeringDelivery(true)
    setDeliveryResult(null)
    try {
      // 15-second timeout so the button never hangs indefinitely
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Request timed out — check Supabase edge function is deployed.')), 15000)
      )
      const invoke = supabase.functions.invoke('deliver-time-capsules', { body: {} })
      const { data, error } = await Promise.race([invoke, timeout]) as any

      if (error) {
        setDeliveryResult(`⚠️ ${error.message}`)
      } else {
        const count = data?.processed ?? 0
        setDeliveryResult(
          count > 0
            ? `✅ ${count} delivery${count !== 1 ? 'ies' : ''} sent! Check your inbox.`
            : `📭 No pending deliveries due today.`
        )
      }
    } catch (e: any) {
      setDeliveryResult(`⚠️ ${e.message}`)
    } finally {
      setTriggeringDelivery(false)
    }
  }

  const isOnPaid = plan && plan !== 'free'
  const track    = userTrack || 'remembrance'

  function planBadge(p: string, _status?: string) {
    if (p === 'legacy') return { label: 'Legacy',  color: C.amberLight, icon: '🛡️' }
    if (p === 'annual') return { label: 'Annual',  color: C.accent,     icon: '💌' }
    // Legacy tier names for backwards compatibility
    if (p === 'essentials')         return { label: 'Annual',  color: C.accent,     icon: '💌' }
    if (p === 'living_legacy_plus') return { label: 'Legacy',  color: C.amberLight, icon: '🛡️' }
    if (p === 'preservation')       return { label: 'Legacy',  color: C.amberLight, icon: '🛡️' }
    return null
  }
  const badge = planBadge(subscriptionTier || plan, subscriptionStatus)

  // ── Profile completion (0–100 in steps of 20) ──────────────────
  const profileCompletion = [
    !!fullName,
    !!userEmail,
    !!profilePhone,
    !!avatarUrl,
    familyCount > 0,
  ].filter(Boolean).length * 20

  const openEditModal = () => {
    setEditName(fullName); setEditEmail(userEmail); setEditPhone(profilePhone)
    setEditPhotoUri(null); setProfileMsg(''); setShowEditProfile(true)
  }

  return (
    <ScreenWrap>
      <ScrollView contentContainerStyle={s.screenScroll} showsVerticalScrollIndicator={true}>

        {/* ── Profile Card — Option 2: side-by-side XL avatar ── */}
        <View style={{ paddingTop: 48, paddingBottom: 24, paddingHorizontal: 20 }}>
          {profileLoading ? (
            <ActivityIndicator color={C.accent} style={{ marginVertical: 32 }} />
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>

              {/* Avatar — 140px with gradient ring + % badge */}
              <TouchableOpacity onPress={openEditModal} activeOpacity={0.85} style={{ position: 'relative', flexShrink: 0 }}>
                <LinearGradient
                  colors={['#F06292', '#F48A5A', '#FFD07A']}
                  start={{ x: 0, y: 1 }}
                  end={{ x: 1, y: 0 }}
                  style={{ width: 140, height: 140, borderRadius: 70, padding: 3 }}>
                  <View style={{ flex: 1, borderRadius: 67, overflow: 'hidden', backgroundColor: C.bg1 }}>
                    {avatarUrl ? (
                      <Image source={{ uri: avatarUrl }} style={{ width: '100%', height: '100%' }} />
                    ) : (
                      <LinearGradient
                        colors={[C.mauveDim, C.bg3]}
                        style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 56 }}>👤</Text>
                      </LinearGradient>
                    )}
                  </View>
                </LinearGradient>
                {/* Completion badge */}
                <View style={{
                  position: 'absolute', bottom: 0, right: -2,
                  backgroundColor: C.bg1, borderRadius: 12,
                  paddingHorizontal: 7, paddingVertical: 3,
                  borderWidth: 1, borderColor: 'rgba(255,208,122,0.5)',
                }}>
                  <Text style={{ color: '#FFD07A', fontSize: 10, fontWeight: '800' }}>{profileCompletion}%</Text>
                </View>
              </TouchableOpacity>

              {/* Info stack */}
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.white, fontSize: 22, fontWeight: '800', letterSpacing: -0.4, marginBottom: 4 }}>
                  {fullName || 'Your Name'}
                </Text>
                <Text style={{ color: C.grey, fontSize: 13, marginBottom: 12 }}>{userEmail}</Text>

                {/* Completion bar */}
                <View style={{ marginBottom: 4 }}>
                  <Text style={{ color: '#FFD07A', fontSize: 11, fontWeight: '700', marginBottom: 6 }}>
                    ✦ {profileCompletion}% complete
                  </Text>
                  <View style={{ height: 5, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.08)' }}>
                    <View style={{
                      height: 5, borderRadius: 4,
                      width: `${profileCompletion}%` as any,
                      backgroundColor: '#F06292',
                    }} />
                  </View>
                </View>

                {/* Edit pill */}
                <TouchableOpacity
                  onPress={openEditModal}
                  activeOpacity={0.75}
                  style={{
                    marginTop: 12, alignSelf: 'flex-start',
                    flexDirection: 'row', alignItems: 'center', gap: 6,
                    backgroundColor: 'rgba(240,98,146,0.12)',
                    borderRadius: 20, borderWidth: 1,
                    borderColor: 'rgba(240,98,146,0.28)',
                    paddingHorizontal: 14, paddingVertical: 7,
                  }}>
                  <Text style={{ color: '#F06292', fontSize: 13, fontWeight: '700' }}>✏️  Edit Profile</Text>
                </TouchableOpacity>
              </View>

            </View>
          )}
        </View>

        {!profileLoading && (
          <View style={{ marginHorizontal: 20, marginBottom: 12 }}>
            <View style={[s.trackPill, { backgroundColor: track === 'living_legacy' ? C.mauveDim : '#3A200A22', borderColor: track === 'living_legacy' ? C.accent + '66' : C.amberDim + '66' }]}>
              <Text style={{ fontSize: 16 }}>{track === 'living_legacy' ? '✨' : '🕊️'}</Text>
              <Text style={{ color: track === 'living_legacy' ? C.accent : C.amberLight, fontSize: 13, fontWeight: '700', marginLeft: 8 }}>
                {track === 'living_legacy' ? 'Living Legacy Path' : 'Legacy Path'}
              </Text>
            </View>
          </View>
        )}

        {!profileLoading && (
          isOnPaid && badge ? (
            <View style={s.premiumBanner}>
              <LinearGradient colors={['#6B1848', '#8C1828']} style={s.premiumBannerInner} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                <View style={s.premiumBannerLeft}>
                  <Text style={s.premiumBannerCrown}>{badge.icon}</Text>
                  <View>
                    <Text style={s.premiumBannerTitle}>{badge.label}</Text>
                    <Text style={s.premiumBannerSub}>
                      {subscriptionTier === 'legacy'
                        ? 'Legacy plan active · Full estate features'
                        : 'Annual plan active'}
                    </Text>
                  </View>
                </View>
                <View style={[s.premiumActivePill, { backgroundColor: badge.color + '33', borderColor: badge.color + '66' }]}>
                  <Text style={[s.premiumActivePillText, { color: badge.color }]}>Active</Text>
                </View>
              </LinearGradient>
            </View>
          ) : null
        )}

        {/* ── My Celebrations ── */}
        <View style={s.sectionSpacer} />
        <View style={[s.sectionRow, { justifyContent: 'space-between', alignItems: 'center', paddingRight: 16 }]}>
          <Text style={s.sectionTitle}>My Celebrations</Text>
          <TouchableOpacity onPress={openEditOccasions} activeOpacity={0.7}>
            <Text style={{ color: C.accent, fontSize: 13 }}>Edit ✏️</Text>
          </TouchableOpacity>
        </View>

        {userOccasionKeys.length > 0 ? (
          <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {userOccasionKeys.slice(0, 3).map(key => {
                const occ = OCCASIONS_MAP[key]
                if (!occ) return null
                return (
                  <View key={key} style={{
                    flexDirection: 'row', alignItems: 'center', gap: 6,
                    paddingHorizontal: 12, paddingVertical: 7,
                    borderRadius: 20, backgroundColor: C.mauveDim,
                    borderWidth: 1, borderColor: C.accent + '44',
                  }}>
                    <Text style={{ fontSize: 15 }}>{occ.icon}</Text>
                    <Text style={{ color: C.offWhite, fontSize: 12, fontWeight: '600' }}>{occ.label}</Text>
                  </View>
                )
              })}
              {userOccasionKeys.length > 3 && (
                <TouchableOpacity
                  onPress={openEditOccasions}
                  activeOpacity={0.75}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 6,
                    paddingHorizontal: 12, paddingVertical: 7,
                    borderRadius: 20, backgroundColor: C.mauveDim,
                    borderWidth: 1, borderColor: C.accent + '88',
                  }}>
                  <Text style={{ fontSize: 15 }}>🎉</Text>
                  <Text style={{ color: C.accent, fontSize: 12, fontWeight: '700' }}>
                    +{userOccasionKeys.length - 3} more
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        ) : (
          <TouchableOpacity onPress={openEditOccasions} activeOpacity={0.75} style={s.listRow}>
            <View style={s.listIconWrap}><Text style={s.listIcon}>🎉</Text></View>
            <View style={s.listInfo}>
              <Text style={s.listLabel}>Add Your Celebrations</Text>
              <Text style={s.listDesc}>Holidays, occasions & personal milestones</Text>
            </View>
            <Text style={s.chevron}>›</Text>
          </TouchableOpacity>
        )}

        {/* ── Occasion suggestion toggle ── */}
        <TouchableOpacity
          onPress={() => toggleOccasionSuggestions(!showOccasionSuggestions)}
          activeOpacity={0.75}
          style={[s.listRow, {
            marginBottom: 8,
            backgroundColor: showOccasionSuggestions ? 'rgba(240,98,146,0.06)' : 'transparent',
          }]}>
          <View style={s.listIconWrap}><Text style={s.listIcon}>💌</Text></View>
          <View style={s.listInfo}>
            <Text style={s.listLabel}>Suggest moments after adding family</Text>
            <Text style={s.listDesc}>
              {showOccasionSuggestions
                ? 'On — Solace suggests occasions when you add someone new'
                : 'Off — no suggestions shown when adding family members'}
            </Text>
          </View>
          <View style={[s.checkBox,
            { borderColor: 'rgba(255,255,255,0.3)' },
            showOccasionSuggestions && { backgroundColor: C.accent, borderColor: C.accent },
          ]}>
            {showOccasionSuggestions && <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>✓</Text>}
          </View>
        </TouchableOpacity>

        <View style={s.sectionRow}><Text style={s.sectionTitle}>Account</Text></View>

        <TouchableOpacity style={s.listRow} activeOpacity={0.75} onPress={() => setShowUpgrade(true)}>
          <View style={s.listIconWrap}><Text style={s.listIcon}>{isOnPaid ? '👑' : '⭐'}</Text></View>
          <View style={s.listInfo}>
            <Text style={s.listLabel}>Subscription Plan</Text>
            <Text style={s.listDesc}>{badge ? badge.label + ' — Active' : 'Free — Limited features'}</Text>
          </View>
          <Text style={s.chevron}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.listRow} activeOpacity={0.75}>
          <View style={s.listIconWrap}><Text style={s.listIcon}>🔔</Text></View>
          <View style={s.listInfo}><Text style={s.listLabel}>Notifications</Text><Text style={s.listDesc}>On</Text></View>
          <Text style={s.chevron}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.listRow} activeOpacity={0.75}>
          <View style={s.listIconWrap}><Text style={s.listIcon}>🔒</Text></View>
          <View style={s.listInfo}><Text style={s.listLabel}>Privacy & Security</Text></View>
          <Text style={s.chevron}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.listRow} activeOpacity={0.75} onPress={openSupportReport}>
          <View style={s.listIconWrap}><Text style={s.listIcon}>🚨</Text></View>
          <View style={s.listInfo}>
            <Text style={s.listLabel}>Something Not Right?</Text>
            <Text style={s.listDesc}>Report an issue — Sokha reads every message</Text>
          </View>
          <Text style={s.chevron}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.listRow} activeOpacity={0.75} onPress={openFeedback}>
          <View style={s.listIconWrap}><Text style={s.listIcon}>💬</Text></View>
          <View style={s.listInfo}>
            <Text style={s.listLabel}>Share Feedback</Text>
            <Text style={s.listDesc}>Ideas, suggestions, or a kind word</Text>
          </View>
          <Text style={s.chevron}>›</Text>
        </TouchableOpacity>

        {/* ── Manage Senders (G2 only) ── */}
        {isRecipient && (
          <>
            <View style={s.sectionSpacer} />
            <View style={s.sectionRow}><Text style={s.sectionTitle}>My Senders</Text></View>
            <TouchableOpacity
              style={s.listRow}
              activeOpacity={0.75}
              onPress={() => {
                loadSenders()
                setShowManageSenders(true)
              }}>
              <View style={s.listIconWrap}><Text style={s.listIcon}>🛡️</Text></View>
              <View style={s.listInfo}>
                <Text style={s.listLabel}>Manage Who Sends to You</Text>
                <Text style={s.listDesc}>Review, pause, or block moment senders</Text>
              </View>
              <Text style={s.chevron}>›</Text>
            </TouchableOpacity>
          </>
        )}

        {/* ── Testing — dev builds only ── */}
        {__DEV__ && (
          <>
            <View style={s.sectionSpacer} />
            <View style={s.sectionRow}><Text style={[s.sectionTitle, { color: C.amber }]}>🧪 Testing</Text></View>
            <View style={[s.listRow, { flexDirection: 'column', alignItems: 'flex-start', gap: 10 }]}>
              <Text style={s.listLabel}>Trigger Delivery Now</Text>
              <Text style={[s.listDesc, { marginTop: 0 }]}>
                Sends all pending deliveries scheduled for today or earlier. Use this after scheduling a moment with today's date to receive the email immediately.
              </Text>
              <TouchableOpacity
                onPress={handleTriggerDelivery}
                disabled={triggeringDelivery}
                activeOpacity={0.8}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 8,
                  backgroundColor: C.amber, borderRadius: 10,
                  paddingVertical: 10, paddingHorizontal: 18, alignSelf: 'flex-start',
                  opacity: triggeringDelivery ? 0.6 : 1,
                }}>
                {triggeringDelivery
                  ? <ActivityIndicator color="#000" size="small" />
                  : <Text style={{ fontSize: 15 }}>📬</Text>}
                <Text style={{ color: '#000', fontWeight: '700', fontSize: 14 }}>
                  {triggeringDelivery ? 'Sending…' : 'Send Now'}
                </Text>
              </TouchableOpacity>
              {deliveryResult ? (
                <Text style={{ fontSize: 13, color: deliveryResult.startsWith('✅') ? C.accent : C.error, marginTop: 2 }}>
                  {deliveryResult}
                </Text>
              ) : null}
            </View>
          </>
        )}

        <View style={s.sectionSpacer} />
        <TouchableOpacity onPress={handleSignOut} activeOpacity={0.82} style={{ marginHorizontal: 16, marginVertical: 4 }}>
          <LinearGradient
            colors={WARM}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ borderRadius: 14, paddingVertical: 16, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }}
          >
            <Ionicons name="log-out-outline" size={22} color={WM.title} />
            <Text style={{ color: WM.title, fontSize: 19, fontWeight: '700', letterSpacing: 0.3 }}>Sign Out</Text>
          </LinearGradient>
        </TouchableOpacity>

        {/* ── Display Settings ── */}
        <View style={s.sectionSpacer} />
        <View style={s.sectionRow}><Text style={s.sectionTitle}>Display</Text></View>
        <View style={[s.listRow, { flexDirection: 'column', alignItems: 'flex-start', gap: 12 }]}>
          <Text style={[s.fieldLabel, { marginBottom: 2 }]}>Navigation Icon Size</Text>
          <Text style={[s.listDesc, { color: C.grey, lineHeight: 18, marginBottom: 4 }]}>
            Adjust the size of the icons along the bottom of the screen.
          </Text>

          {/* Size selector pills */}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {([
              { key: 'small',  label: 'Small',  emoji: '🏠', size: 18 },
              { key: 'medium', label: 'Medium', emoji: '🏠', size: 24 },
              { key: 'large',  label: 'Large',  emoji: '🏠', size: 30 },
            ] as const).map(opt => {
              const active = navScale === opt.key
              return (
                <TouchableOpacity
                  key={opt.key}
                  onPress={() => setNavScale(opt.key as NavScaleOption)}
                  style={{
                    flex: 1,
                    alignItems: 'center',
                    paddingVertical: 12,
                    borderRadius: 14,
                    borderWidth: active ? 2 : 1,
                    borderColor: active ? WM.accent : WM.border,
                    backgroundColor: active ? WM.accentBg : WM.cardBg,
                  }}
                  activeOpacity={0.75}
                >
                  <Text style={{ fontSize: opt.size, lineHeight: opt.size + 6 }}>{opt.emoji}</Text>
                  <Text style={{
                    fontSize: 12,
                    fontWeight: active ? '700' : '500',
                    color: active ? WM.accent : WM.sub,
                    marginTop: 4,
                  }}>{opt.label}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>

        {/* ── Check-in Settings ── */}
        <View style={s.sectionSpacer} />
        <View style={s.sectionRow}><Text style={s.sectionTitle}>Check-in Settings</Text></View>
        <View style={[s.listRow, { flexDirection: 'column', alignItems: 'flex-start', gap: 12 }]}>
          <Text style={[s.listDesc, { color: C.grey, lineHeight: 20 }]}>
            Solace will send you periodic reminders to confirm you are well.
            If you miss {checkinProfile?.checkin_threshold ?? 3} check-ins, your trusted contacts will be notified.
          </Text>

          <Text style={[s.fieldLabel, { marginBottom: 4 }]}>Reminder Frequency</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['weekly', 'monthly', 'quarterly'] as const).map(freq => (
              <TouchableOpacity
                key={freq}
                style={[s.checkinFreqBtn, checkinProfile?.checkin_frequency === freq && s.checkinFreqBtnActive]}
                onPress={async () => {
                  const { data: { user } } = await supabase.auth.getUser()
                  if (!user) return
                  const days = freq === 'weekly' ? 7 : freq === 'quarterly' ? 90 : 30
                  const nextDue = checkinProfile?.last_checkin_at
                    ? new Date(new Date(checkinProfile.last_checkin_at).getTime() + days * 86400000).toISOString()
                    : new Date(Date.now() + days * 86400000).toISOString()
                  await supabase.from('profiles').update({ checkin_frequency: freq, next_checkin_due: nextDue }).eq('id', user.id)
                  setCheckinProfile((p: any) => ({ ...p, checkin_frequency: freq, next_checkin_due: nextDue }))
                }}
                activeOpacity={0.75}>
                <Text style={[s.checkinFreqText, checkinProfile?.checkin_frequency === freq && s.checkinFreqTextActive]}>
                  {freq.charAt(0).toUpperCase() + freq.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[s.fieldLabel, { marginBottom: 4 }]}>Escalate after missed check-ins</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[2, 3, 4].map(n => (
              <TouchableOpacity
                key={n}
                style={[s.checkinFreqBtn, checkinProfile?.checkin_threshold === n && s.checkinFreqBtnActive]}
                onPress={async () => {
                  const { data: { user } } = await supabase.auth.getUser()
                  if (!user) return
                  await supabase.from('profiles').update({ checkin_threshold: n }).eq('id', user.id)
                  setCheckinProfile((p: any) => ({ ...p, checkin_threshold: n }))
                }}
                activeOpacity={0.75}>
                <Text style={[s.checkinFreqText, checkinProfile?.checkin_threshold === n && s.checkinFreqTextActive]}>{n}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={s.checkinStatusRow}>
            <Text style={s.checkinStatusDot}>●</Text>
            <Text style={s.listDesc}>
              Status: {checkinProfile?.vault_status === 'escalated' ? '🚨 Escalated — contacts notified'
                      : checkinProfile?.vault_status === 'released'  ? '🔓 Vault Released'
                      : checkinProfile?.missed_checkins > 0          ? `⚠️  ${checkinProfile.missed_checkins} missed`
                      : '✅  Active'}
            </Text>
          </View>
        </View>

        {/* ── Trusted Partners ── */}
        <View style={s.sectionSpacer} />

        <TouchableOpacity style={s.listRow} activeOpacity={0.75} onPress={() => setShowPartnersModal(true)}>
          <View style={s.listIconWrap}><Text style={s.listIcon}>🤝</Text></View>
          <View style={s.listInfo}>
            <Text style={s.listLabel}>Trusted Partners</Text>
            <Text style={s.listDesc}>Connect with estate lawyers, financial advisors & more</Text>
          </View>
          <Text style={s.chevron}>›</Text>
        </TouchableOpacity>

        <Text style={s.versionText}>Solace Life · Version 1.0.0</Text>
      </ScrollView>

      {paymentResult === 'success' && (
        <View style={s.paymentToast}>
          <Text style={s.paymentToastText}>
            {subscriptionStatus === 'trialing'
              ? `🎉 30-day free trial started! Enjoy ${subscriptionTier === 'legacy' ? 'Legacy' : 'Annual'}.`
              : `🎉 Subscription active! Welcome to ${subscriptionTier === 'legacy' ? 'Legacy' : 'Annual'}.`}
          </Text>
          <TouchableOpacity onPress={() => setPaymentResult(null)}><Text style={{ color: C.grey }}>✕</Text></TouchableOpacity>
        </View>
      )}
      {paymentResult === 'cancel' && (
        <View style={[s.paymentToast, { borderColor: C.error + '44', backgroundColor: C.error + '11' }]}>
          <Text style={[s.paymentToastText, { color: C.error }]}>Payment was not completed.</Text>
          <TouchableOpacity onPress={() => setPaymentResult(null)}><Text style={{ color: C.grey }}>✕</Text></TouchableOpacity>
        </View>
      )}

      {/* ── Edit Profile Modal ── */}
      {showEditProfile && (
      <Modal
        visible={showEditProfile}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowEditProfile(false)}>
        <LinearGradient colors={['#F06292', '#F48A5A', '#FFD07A']} style={{ flex: 1 }}>
          {/* Handle */}
          <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 4 }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#3D102066' }} />
          </View>

          <View style={s.modalHeader}>
            <Text style={[s.upgradeModalTitle, { color: '#3D1020' }]}>✏️ Edit Profile</Text>
            <TouchableOpacity onPress={() => setShowEditProfile(false)}>
              <View style={s.modalCloseBtn}><Text style={s.modalCloseX}>✕</Text></View>
            </TouchableOpacity>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={true} automaticallyAdjustKeyboardInsets>
            {/* Avatar picker */}
            <TouchableOpacity onPress={pickProfilePhoto} activeOpacity={0.8} style={{ alignItems: 'center', marginTop: 16, marginBottom: 32 }}>
              <View style={{ position: 'relative' }}>
                {editPhotoUri ? (
                  <Image source={{ uri: editPhotoUri }} style={{ width: 160, height: 160, borderRadius: 80, borderWidth: 2.5, borderColor: '#F06292' }} />
                ) : avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={{ width: 160, height: 160, borderRadius: 80, borderWidth: 2.5, borderColor: '#F06292' }} />
                ) : (
                  <View style={{ width: 160, height: 160, borderRadius: 80, borderWidth: 2, borderColor: '#F06292', backgroundColor: 'rgba(255,255,255,0.5)', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 68 }}>👤</Text>
                  </View>
                )}
                <View style={{ position: 'absolute', bottom: 6, right: 6, width: 44, height: 44, borderRadius: 22, backgroundColor: '#F06292', alignItems: 'center', justifyContent: 'center', borderWidth: 2.5, borderColor: '#fff' }}>
                  <Text style={{ fontSize: 22 }}>📷</Text>
                </View>
              </View>
              <Text style={{ color: '#7A3448', fontSize: 15, marginTop: 12 }}>Tap to change photo</Text>
            </TouchableOpacity>

            {/* Name field */}
            <View style={{ paddingHorizontal: 24, marginBottom: 20 }}>
              <Text style={[s.fieldLabel, { color: '#7A3448' }]}>Full Name</Text>
              <TextInput
                style={[s.input, { marginTop: 8, backgroundColor: 'rgba(255,255,255,0.85)', borderColor: '#F06292', color: '#3D1020' }]}
                placeholder="Your full name"
                placeholderTextColor="#7A344888"
                value={editName}
                onChangeText={setEditName}
                autoCapitalize="words"
              />
            </View>

            {/* Email field */}
            <View style={{ paddingHorizontal: 24, marginBottom: 20 }}>
              <Text style={[s.fieldLabel, { color: '#7A3448' }]}>Email</Text>
              <TextInput
                style={[s.input, { marginTop: 8, backgroundColor: 'rgba(255,255,255,0.85)', borderColor: '#F06292', color: '#3D1020' }]}
                placeholder="your@email.com"
                placeholderTextColor="#7A344888"
                value={editEmail}
                onChangeText={setEditEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {/* Phone field */}
            <View style={{ paddingHorizontal: 24, marginBottom: 28 }}>
              <Text style={[s.fieldLabel, { color: '#7A3448' }]}>Phone Number</Text>
              <TextInput
                style={[s.input, { marginTop: 8, backgroundColor: 'rgba(255,255,255,0.85)', borderColor: '#F06292', color: '#3D1020' }]}
                placeholder="+1 (555) 000-0000"
                placeholderTextColor="#7A344888"
                value={editPhone}
                onChangeText={setEditPhone}
                keyboardType="phone-pad"
              />
              {profileMsg ? (
                <Text style={{ color: C.error, fontSize: 12, marginTop: 6 }}>{profileMsg}</Text>
              ) : null}
            </View>

            {/* Save */}
            <TouchableOpacity
              onPress={saveProfile}
              disabled={profileSaving || !editName.trim()}
              activeOpacity={0.85}
              style={{ marginHorizontal: 24, marginBottom: 40 }}>
              <LinearGradient colors={PLUM} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.btnPrimary, { opacity: editName.trim() ? 1 : 0.5 }]}>
                {profileSaving
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={[s.btnPrimaryText, { color: '#fff' }]}>Save Changes</Text>}
              </LinearGradient>
            </TouchableOpacity>
          </ScrollView>
        </LinearGradient>
      </Modal>
      )}

      {/* ── Edit Occasions Modal ── */}
      {showEditOccasions && (
      <Modal
        visible={showEditOccasions}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowEditOccasions(false)}>
        <LinearGradient colors={['#F06292', '#F48A5A', '#FFD07A']} style={{ flex: 1 }}>

          {/* Handle */}
          <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 4 }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#3D102066' }} />
          </View>

          {/* Header */}
          <View style={[s.modalHeader, { paddingBottom: 12 }]}>
            <View style={{ flex: 1 }}>
              <Text style={[s.upgradeModalTitle, { color: '#3D1020' }]}>🎉 My Celebrations</Text>
              <Text style={[s.pageSubtitle, { marginTop: 2, color: '#7A3448' }]}>
                {editOccasions.size > 0 ? `${editOccasions.size} selected` : 'Select all that apply'}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setShowEditOccasions(false)}>
              <View style={s.modalCloseBtn}><Text style={s.modalCloseX}>✕</Text></View>
            </TouchableOpacity>
          </View>

          {/* Search bar */}
          <View style={{ paddingHorizontal: 16, marginBottom: 10 }}>
            <TextInput
              placeholder="Search occasions…"
              placeholderTextColor="#7A344888"
              value={occasionSearch}
              onChangeText={setOccasionSearch}
              style={[s.input, { fontSize: 14, backgroundColor: 'rgba(255,255,255,0.85)', borderColor: '#F06292', color: '#3D1020' }]}
              clearButtonMode="while-editing"
              returnKeyType="search"
            />
          </View>

          {/* Privacy note */}
          <View style={{
            marginHorizontal: 16, marginBottom: 10,
            padding: 10, borderRadius: 10,
            backgroundColor: 'rgba(255,255,255,0.40)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)',
            flexDirection: 'row', alignItems: 'flex-start', gap: 8,
          }}>
            <Text style={{ fontSize: 13, marginTop: 1 }}>🔒</Text>
            <Text style={{ color: '#7A3448', fontSize: 11, lineHeight: 16, flex: 1 }}>
              Used only to personalise reminders. We never store or infer your religion or beliefs.
            </Text>
          </View>

          {/* 2-column FlatList grid */}
          <FlatList
            data={filteredOccasions}
            numColumns={2}
            keyExtractor={(item) => item.key}
            extraData={editOccasions}
            style={{ flex: 1 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={true}
            columnWrapperStyle={{ paddingHorizontal: 16, gap: 10 }}
            contentContainerStyle={{ paddingTop: 4, paddingBottom: 120, gap: 10 }}
            ListEmptyComponent={
              <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                <Text style={{ fontSize: 32, marginBottom: 10 }}>🔍</Text>
                <Text style={{ color: '#7A3448', fontSize: 14 }}>No occasions match "{occasionSearch}"</Text>
              </View>
            }
            renderItem={({ item: occ }) => {
              const isSel = editOccasions.has(occ.key)
              return (
                <TouchableOpacity
                  onPress={() => setEditOccasions(prev => {
                    const next = new Set(prev)
                    if (next.has(occ.key)) next.delete(occ.key)
                    else next.add(occ.key)
                    return next
                  })}
                  activeOpacity={0.8}
                  accessibilityLabel={`${isSel ? 'Deselect' : 'Select'} ${occ.label}`}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isSel }}
                  style={{
                    flex: 1,
                    borderRadius: 14, borderWidth: isSel ? 2 : 1,
                    borderColor: isSel ? '#F06292' : 'rgba(0,0,0,0.12)',
                    backgroundColor: isSel ? 'rgba(240,98,146,0.12)' : 'rgba(255,255,255,0.78)',
                    padding: 14, minHeight: 90, justifyContent: 'space-between',
                  }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <Text style={{ fontSize: 26 }}>{occ.icon}</Text>
                    {isSel && (
                      <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#F06292', alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>✓</Text>
                      </View>
                    )}
                  </View>
                  <Text style={{ color: '#3D1020', fontSize: 13, fontWeight: isSel ? '700' : '600', marginBottom: 3 }} numberOfLines={1}>
                    {occ.label}
                  </Text>
                  <Text style={{ color: isSel ? '#F06292' : '#7A3448', fontSize: 10, lineHeight: 13 }} numberOfLines={2}>
                    {occ.sub}
                  </Text>
                </TouchableOpacity>
              )
            }}
          />

          {/* Save button */}
          <View style={{
            paddingHorizontal: 16,
            paddingBottom: Platform.OS === 'ios' ? 40 : 16, paddingTop: 12,
            borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.4)',
            backgroundColor: 'rgba(255,255,255,0.92)',
          }}>
            <TouchableOpacity onPress={saveOccasions} disabled={occasionsSaving} activeOpacity={0.85}>
              <LinearGradient colors={PLUM} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.btnPrimary, { opacity: editOccasions.size > 0 ? 1 : 0.35 }]}>
                {occasionsSaving
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={[s.btnPrimaryText, { color: '#fff' }]}>
                      {editOccasions.size > 0
                        ? `Save ${editOccasions.size} celebration${editOccasions.size !== 1 ? 's' : ''}`
                        : 'Save'}
                    </Text>}
              </LinearGradient>
            </TouchableOpacity>
          </View>

        </LinearGradient>
      </Modal>
      )}

      {/* ── Trusted Partners Modal ── */}
      <ProfessionalServicesModal
        visible={showPartnersModal}
        onClose={() => setShowPartnersModal(false)}
      />

      {/* ── Manage Senders Modal (G2 list view) ── */}
      <Modal visible={showManageSenders} transparent animationType="slide" onRequestClose={() => setShowManageSenders(false)}>
        <TouchableOpacity style={{ flex: 1, justifyContent: 'flex-end' }} activeOpacity={1} onPress={() => setShowManageSenders(false)}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
          <View style={{ maxHeight: '90%', borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' }}>
            <LinearGradient colors={['#F06292', '#F48A5A', '#FFD07A']} style={{ padding: 24 }}>

              {/* Handle */}
              <View style={{ alignItems: 'center', marginBottom: 16 }}>
                <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(61,16,32,0.3)' }} />
              </View>

              {/* Header */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <View>
                  <Text style={{ color: WM.title, fontSize: 20, fontWeight: '700' }}>🛡️ My Senders</Text>
                  <Text style={{ color: WM.sub, fontSize: 13, marginTop: 2 }}>Control who can send moments to you</Text>
                </View>
                <TouchableOpacity onPress={() => setShowManageSenders(false)} activeOpacity={0.7}>
                  <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(61,16,32,0.12)', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: WM.title, fontSize: 15, fontWeight: '700' }}>✕</Text>
                  </View>
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={true} style={{ maxHeight: 420 }}>
                {sendersLoading ? (
                  <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                    <ActivityIndicator color={WM.accent} />
                  </View>
                ) : senders.length === 0 ? (
                  <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                    <Text style={{ fontSize: 40, marginBottom: 12 }}>💌</Text>
                    <Text style={{ color: WM.title, fontSize: 16, fontWeight: '600', marginBottom: 6 }}>No senders yet</Text>
                    <Text style={{ color: WM.sub, fontSize: 13, textAlign: 'center', lineHeight: 18 }}>
                      When someone adds you to their Solace Life, they'll appear here.
                    </Text>
                  </View>
                ) : (
                  senders.map(entry => {
                    const statusColor = entry.consentStatus === 'consented' ? '#22C55E'
                      : entry.consentStatus === 'revoked'  ? '#F59E0B'
                      : entry.consentStatus === 'blocked'  ? '#EF4444'
                      : entry.consentStatus === 'declined' ? '#94A3B8'
                      : '#94A3B8'
                    const statusLabel = entry.consentStatus === 'consented' ? 'Accepting'
                      : entry.consentStatus === 'revoked'  ? 'Paused'
                      : entry.consentStatus === 'blocked'  ? 'Blocked'
                      : entry.consentStatus === 'declined' ? 'Declined'
                      : 'Pending'

                    return (
                      <TouchableOpacity
                        key={entry.id}
                        onPress={() => { setSelectedSenderEntry(entry); setSenderActionMsg(''); setShowSenderActionModal(true) }}
                        activeOpacity={0.8}
                        style={{
                          flexDirection: 'row', alignItems: 'center', gap: 12,
                          backgroundColor: WM.cardBg, borderColor: WM.border, borderWidth: 1,
                          borderRadius: 14, padding: 14, marginBottom: 10,
                        }}>
                        {/* Avatar */}
                        {entry.senderAvatarUrl ? (
                          <Image source={{ uri: entry.senderAvatarUrl }} style={{ width: 48, height: 48, borderRadius: 24 }} />
                        ) : (
                          <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: WM.accentBg, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: WM.border }}>
                            <Text style={{ fontSize: 22 }}>👤</Text>
                          </View>
                        )}
                        {/* Name + status */}
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: WM.title, fontSize: 15, fontWeight: '700' }}>{entry.senderName}</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 }}>
                            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: statusColor }} />
                            <Text style={{ color: statusColor, fontSize: 12, fontWeight: '600' }}>{statusLabel}</Text>
                          </View>
                        </View>
                        <Text style={{ color: WM.sub, fontSize: 18 }}>›</Text>
                      </TouchableOpacity>
                    )
                  })
                )}
              </ScrollView>

            </LinearGradient>
          </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── Sender Action Modal (revoke / block / restore) ── */}
      <Modal visible={showSenderActionModal} transparent animationType="slide" onRequestClose={() => setShowSenderActionModal(false)}>
        <TouchableOpacity style={{ flex: 1, justifyContent: 'flex-end' }} activeOpacity={1} onPress={() => setShowSenderActionModal(false)}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
          <View style={{ borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' }}>
            <LinearGradient colors={['#F06292', '#F48A5A', '#FFD07A']} style={{ padding: 24 }}>

              {/* Handle */}
              <View style={{ alignItems: 'center', marginBottom: 16 }}>
                <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(61,16,32,0.3)' }} />
              </View>

              {selectedSenderEntry && (
                <>
                  {/* Sender name */}
                  <Text style={{ color: WM.title, fontSize: 20, fontWeight: '700', marginBottom: 4 }}>
                    {selectedSenderEntry.senderName}
                  </Text>
                  <Text style={{ color: WM.sub, fontSize: 13, marginBottom: 24 }}>
                    Manage moments from this person
                  </Text>

                  {/* Info card */}
                  <View style={{ backgroundColor: WM.cardBg, borderColor: WM.border, borderWidth: 1, borderRadius: 14, padding: 16, marginBottom: 20 }}>
                    <Text style={{ color: WM.sub, fontSize: 13, lineHeight: 19 }}>
                      Current status: <Text style={{ color: WM.title, fontWeight: '700' }}>
                        {selectedSenderEntry.consentStatus === 'consented' ? 'Accepting moments'
                          : selectedSenderEntry.consentStatus === 'revoked'  ? 'Paused — no deliveries'
                          : selectedSenderEntry.consentStatus === 'blocked'  ? 'Blocked — no deliveries'
                          : selectedSenderEntry.consentStatus === 'declined' ? 'Declined'
                          : 'Pending your acceptance'}
                      </Text>
                    </Text>
                    {(selectedSenderEntry.consentStatus === 'revoked' || selectedSenderEntry.consentStatus === 'declined') && (
                      <Text style={{ color: WM.sub, fontSize: 12, marginTop: 6, lineHeight: 17 }}>
                        No moments will be delivered while paused. You can restore anytime.
                      </Text>
                    )}
                    {selectedSenderEntry.consentStatus === 'blocked' && (
                      <Text style={{ color: '#EF4444', fontSize: 12, marginTop: 6, lineHeight: 17 }}>
                        This sender is blocked. No moments will be delivered.
                      </Text>
                    )}
                  </View>

                  {senderActionMsg ? (
                    <Text style={{ color: WM.title, fontSize: 13, marginBottom: 16, textAlign: 'center', fontWeight: '600' }}>
                      {senderActionMsg}
                    </Text>
                  ) : null}

                  {/* Restore button — shown when revoked/declined */}
                  {(selectedSenderEntry.consentStatus === 'revoked' || selectedSenderEntry.consentStatus === 'declined') && (
                    <TouchableOpacity
                      onPress={() => handleRestoreConsent(selectedSenderEntry)}
                      disabled={senderActionLoading}
                      activeOpacity={0.85}
                      style={{ marginBottom: 10 }}>
                      <LinearGradient colors={PLUM} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 14, padding: 16, alignItems: 'center', opacity: senderActionLoading ? 0.6 : 1 }}>
                        {senderActionLoading
                          ? <ActivityIndicator color="#fff" />
                          : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>✓ Restore — Accept Moments Again</Text>}
                      </LinearGradient>
                    </TouchableOpacity>
                  )}

                  {/* Revoke button — shown when currently consented */}
                  {selectedSenderEntry.consentStatus === 'consented' && (
                    <TouchableOpacity
                      onPress={() => handleSenderConsent(selectedSenderEntry, 'revoked')}
                      disabled={senderActionLoading}
                      activeOpacity={0.85}
                      style={{ marginBottom: 10 }}>
                      <View style={{ backgroundColor: WM.cardBg, borderColor: WM.border, borderWidth: 1, borderRadius: 14, padding: 16, alignItems: 'center', opacity: senderActionLoading ? 0.6 : 1 }}>
                        {senderActionLoading
                          ? <ActivityIndicator color={WM.title} />
                          : <Text style={{ color: WM.title, fontWeight: '600', fontSize: 15 }}>⏸ Pause — Stop Receiving Moments</Text>}
                      </View>
                    </TouchableOpacity>
                  )}

                  {/* Block button — shown unless already blocked */}
                  {selectedSenderEntry.consentStatus !== 'blocked' && (
                    <TouchableOpacity
                      onPress={() => {
                        Alert.alert(
                          'Block Sender',
                          `Are you sure you want to block ${selectedSenderEntry.senderName}? No moments will ever be delivered from them again. This action will be reviewed by our team.`,
                          [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Block', style: 'destructive', onPress: () => handleSenderConsent(selectedSenderEntry, 'blocked') },
                          ]
                        )
                      }}
                      disabled={senderActionLoading}
                      activeOpacity={0.85}
                      style={{ marginBottom: 10 }}>
                      <View style={{ backgroundColor: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.3)', borderWidth: 1, borderRadius: 14, padding: 16, alignItems: 'center' }}>
                        <Text style={{ color: '#EF4444', fontWeight: '600', fontSize: 15 }}>🚫 Block This Sender</Text>
                      </View>
                    </TouchableOpacity>
                  )}

                  {/* Cancel */}
                  <TouchableOpacity onPress={() => setShowSenderActionModal(false)} activeOpacity={0.75} style={{ marginTop: 4 }}>
                    <View style={{ backgroundColor: WM.cardBg, borderColor: WM.border, borderWidth: 1, borderRadius: 14, padding: 14, alignItems: 'center' }}>
                      <Text style={{ color: WM.title, fontWeight: '600' }}>Close</Text>
                    </View>
                  </TouchableOpacity>
                </>
              )}

            </LinearGradient>
          </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── Plan Upgrade Modal (v4 — warm gradient) ── */}
      <Modal visible={showUpgrade} transparent animationType="slide" onRequestClose={() => setShowUpgrade(false)}>
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setShowUpgrade(false)}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
          <View style={[s.modalSheet, { maxHeight: '96%' }]}>
            <LinearGradient colors={['#F06292', '#F48A5A', '#FFD07A']} style={[s.modalInner, { maxHeight: '96%' }]}>

              {/* Header */}
              <View style={s.modalHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.upgradeModalTitle, { color: '#3D1020' }]}>💌 Choose Your Plan</Text>
                  <Text style={[s.pageSubtitle, { marginTop: 2, color: '#7A3448' }]}>
                    One plan — {currencyTag(currency)} $99/year. Receiving is always free for your family.
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setShowUpgrade(false)}>
                  <View style={s.modalCloseBtn}><Text style={s.modalCloseX}>✕</Text></View>
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={true}>

                {/* Free trial banner */}
                <View style={{
                  marginHorizontal: 16, marginBottom: 16,
                  padding: 14, borderRadius: 14,
                  backgroundColor: 'rgba(255,255,255,0.45)', borderWidth: 1, borderColor: 'rgba(61,16,32,0.15)',
                  flexDirection: 'row', alignItems: 'center', gap: 10,
                }}>
                  <Text style={{ fontSize: 22 }}>🎁</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#3D1020', fontSize: 14, fontWeight: '700' }}>
                      30 days free, full access
                    </Text>
                    <Text style={{ color: '#7A3448', fontSize: 12, lineHeight: 17, marginTop: 2 }}>
                      Create your first moments, set up trusted contacts. No card needed until you're ready.
                    </Text>
                  </View>
                </View>

                {upgradeMsg ? (
                  <Text style={{ color: '#B91C1C', fontSize: 13, textAlign: 'center', marginBottom: 12 }}>
                    {upgradeMsg}
                  </Text>
                ) : null}

                {/* Plan cards */}
                {PLANS.map((p) => {
                  const isActivePlan =
                    subscriptionTier === p.key &&
                    (subscriptionStatus === 'active' || subscriptionStatus === 'trialing' || subscriptionStatus === 'lifetime')

                  const planPrice = getPlanPrice(p.key, currency)

                  if (p.highlight) {
                    // Legacy — elevated white card with rose border
                    return (
                      <View key={p.key} style={{
                        marginHorizontal: 16, marginBottom: 12, borderRadius: 18,
                        backgroundColor: 'rgba(255,255,255,0.92)',
                        borderWidth: 2, borderColor: isActivePlan ? '#3D1020' : '#F06292',
                        padding: 18,
                        shadowColor: '#3D1020', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
                      }}>
                        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                            <Text style={{ fontSize: 20 }}>{p.icon}</Text>
                            <View style={{ flex: 1 }}>
                              <Text style={{ color: '#3D1020', fontSize: 16, fontWeight: '800' }}>{p.label}</Text>
                              <View style={{ backgroundColor: '#F06292' + '22', alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, marginTop: 3 }}>
                                <Text style={{ color: '#F06292', fontSize: 11, fontWeight: '700' }}>{p.badge}</Text>
                              </View>
                            </View>
                          </View>
                          <View style={{ alignItems: 'flex-end' }}>
                            <Text style={{ color: '#3D1020', fontSize: 26, fontWeight: '800' }}>{planPrice.display}</Text>
                            <Text style={{ color: '#7A3448', fontSize: 11 }}>{planPrice.period} · {planPrice.label}</Text>
                          </View>
                        </View>
                        <Text style={{ color: '#7A3448', fontSize: 13, marginBottom: 12, fontStyle: 'italic' }}>{p.tagline}</Text>
                        {p.features.map((f, i) => (
                          <View key={i} style={s.featureRow}>
                            <Text style={[s.featureCheck, { color: '#F06292' }]}>✓</Text>
                            <Text style={[s.featureLabel, { color: '#3D1020' }]}>{f}</Text>
                          </View>
                        ))}
                        {isActivePlan ? (
                          <View style={{ marginTop: 14, padding: 10, borderRadius: 10, backgroundColor: '#F06292' + '18', borderWidth: 1, borderColor: '#F06292' + '55', alignItems: 'center' }}>
                            <Text style={{ color: '#F06292', fontWeight: '700', fontSize: 14 }}>✓ Your current plan</Text>
                          </View>
                        ) : (
                          <TouchableOpacity onPress={() => handleUpgrade(p.key)} disabled={checkoutLoading} activeOpacity={0.85} style={{ marginTop: 14 }}>
                            <LinearGradient colors={PLUM} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.btnPrimary, { paddingVertical: 13 }]}>
                              {checkoutLoading
                                ? <ActivityIndicator color="#fff" />
                                : <Text style={[s.btnPrimaryText, { color: '#fff', fontSize: 15 }]}>Get Legacy — {currencyTag(currency)} $149</Text>}
                            </LinearGradient>
                          </TouchableOpacity>
                        )}
                      </View>
                    )
                  }

                  // Annual — standard white card
                  return (
                    <View key={p.key} style={{
                      marginHorizontal: 16, marginBottom: 12, borderRadius: 18,
                      backgroundColor: 'rgba(255,255,255,0.80)',
                      borderWidth: 1.5, borderColor: isActivePlan ? '#3D1020' : 'rgba(61,16,32,0.18)',
                      padding: 18,
                    }}>
                      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                          <Text style={{ fontSize: 20 }}>{p.icon}</Text>
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: '#3D1020', fontSize: 16, fontWeight: '800' }}>{p.label}</Text>
                            <View style={{ backgroundColor: 'rgba(61,16,32,0.10)', alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, marginTop: 3 }}>
                              <Text style={{ color: '#7A3448', fontSize: 11, fontWeight: '700' }}>{p.badge}</Text>
                            </View>
                          </View>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={{ color: '#3D1020', fontSize: 26, fontWeight: '800' }}>{planPrice.display}</Text>
                          <Text style={{ color: '#7A3448', fontSize: 11 }}>{planPrice.period} · {planPrice.label}</Text>
                        </View>
                      </View>
                      <Text style={{ color: '#7A3448', fontSize: 13, marginBottom: 12, fontStyle: 'italic' }}>{p.tagline}</Text>
                      {p.features.map((f, i) => (
                        <View key={i} style={s.featureRow}>
                          <Text style={[s.featureCheck, { color: '#F06292' }]}>✓</Text>
                          <Text style={[s.featureLabel, { color: '#3D1020' }]}>{f}</Text>
                        </View>
                      ))}
                      {isActivePlan ? (
                        <View style={{ marginTop: 14, padding: 10, borderRadius: 10, backgroundColor: 'rgba(61,16,32,0.08)', borderWidth: 1, borderColor: 'rgba(61,16,32,0.2)', alignItems: 'center' }}>
                          <Text style={{ color: '#3D1020', fontWeight: '700', fontSize: 14 }}>✓ Your current plan</Text>
                        </View>
                      ) : (
                        <TouchableOpacity onPress={() => handleUpgrade(p.key)} disabled={checkoutLoading} activeOpacity={0.85} style={{ marginTop: 14 }}>
                          <LinearGradient colors={PLUM} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.btnPrimary, { paddingVertical: 13 }]}>
                            {checkoutLoading
                              ? <ActivityIndicator color="#fff" />
                              : <Text style={[s.btnPrimaryText, { color: '#fff', fontSize: 15 }]}>Start Free Trial — Annual</Text>}
                          </LinearGradient>
                        </TouchableOpacity>
                      )}
                    </View>
                  )
                })}

                {/* ── Continuity explainer ── */}
                <View style={{
                  marginHorizontal: 16, marginTop: 8, marginBottom: 8,
                  padding: 16, borderRadius: 14,
                  backgroundColor: 'rgba(255,255,255,0.40)', borderWidth: 1, borderColor: 'rgba(61,16,32,0.12)',
                }}>
                  <Text style={{ color: '#3D1020', fontSize: 14, fontWeight: '700', marginBottom: 6 }}>
                    💛 Your love keeps showing up
                  </Text>
                  <Text style={{ color: '#7A3448', fontSize: 13, lineHeight: 19 }}>
                    After your passing, your account stays with your family at{' '}
                    <Text style={{ color: '#3D1020', fontWeight: '600' }}>no cost to them — guaranteed for 25+ years</Text>. Scheduled messages keep arriving exactly as you planned, and everything can be exported anytime. Your family never touches a billing screen.
                  </Text>
                </View>

                <Text style={[s.upgradeDisclaimer, { marginTop: 4, color: '#7A3448' }]}>
                  🔒 Secure checkout via Stripe · Cancel anytime before trial ends
                </Text>

              </ScrollView>
            </LinearGradient>
          </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

    </ScreenWrap>
  )
}
