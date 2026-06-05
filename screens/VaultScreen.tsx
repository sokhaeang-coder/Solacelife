import { useState, useEffect, useRef } from 'react'
import { Text, View, TouchableOpacity, TextInput, ActivityIndicator,
  ScrollView, Modal, KeyboardAvoidingView, Platform, Image, Dimensions, Animated, Easing } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import * as DocumentPicker from 'expo-document-picker'
import * as ImagePicker from 'expo-image-picker'
import * as FileSystem from 'expo-file-system/legacy'
import { supabase } from '../lib/supabase'
import { C, WARM, WM, PLUM } from '../lib/constants'
import { s } from '../lib/styles'
import ScreenWrap from '../components/ScreenWrap'
import { encryptVaultPayload, decryptVaultItems } from '../lib/encryption'
// FacebookImportModal removed — users download individual photos to device first (natural curation filter)
import ProfessionalServicesModal from './ProfessionalServicesModal'

const MEDIA_CELL = (Dimensions.get('window').width - 40 - 4) / 3

const MEDICAL_TYPES = [
  { key: 'Medical Record',  icon: '🩺', titleLabel: 'Record name *',       providerLabel: 'Hospital / Clinic',     contactLabel: 'Phone number',    notesPlaceholder: 'Diagnosis, date, test results, provider notes…' },
  { key: 'Prescription',    icon: '💊', titleLabel: 'Medication name *',    providerLabel: 'Dosage',                contactLabel: 'Prescribing doctor',  notesPlaceholder: 'Pharmacy name, refill date, frequency, side effects to watch for…' },
  { key: 'Doctor Contact',  icon: '👨‍⚕️', titleLabel: 'Doctor name *',       providerLabel: 'Specialty',             contactLabel: 'Phone number',    notesPlaceholder: 'Clinic address, clinic name, best time to call…' },
  { key: 'Allergy',         icon: '🚨', titleLabel: 'Allergy name *',       providerLabel: 'Diagnosed by',          contactLabel: 'Emergency phone', notesPlaceholder: 'Reaction, severity (mild / severe), treatment, EpiPen required?…' },
  { key: 'Directive',       icon: '📋', titleLabel: 'Directive type *',     providerLabel: 'Healthcare proxy name', contactLabel: 'Proxy phone',     notesPlaceholder: 'Key instructions, location of original signed document, witnesses…' },
]

const LEGAL_TYPES = [
  { key: 'Will',              icon: '📜', titleLabel: 'Document title *',        titlePlaceholder: 'e.g. Last Will and Testament',     lawyerLabel: 'Prepared by (lawyer / firm)', contactLabel: "Lawyer's phone",    notesPlaceholder: 'Date signed, location of original, executor name, notarized by…' },
  { key: 'Power of Attorney', icon: '⚖️', titleLabel: 'Document title *',        titlePlaceholder: 'e.g. Financial Power of Attorney',  lawyerLabel: 'Attorney / Agent name',       contactLabel: "Attorney's phone",  notesPlaceholder: 'Scope of authority, effective date, expiry if any, witness names…' },
  { key: 'Trust',             icon: '🏦', titleLabel: 'Trust name *',            titlePlaceholder: 'e.g. The Smith Family Trust',        lawyerLabel: 'Trustee name',                contactLabel: "Trustee's phone",   notesPlaceholder: 'Trust type, beneficiaries, date established, managing institution…' },
  { key: 'Other Document',    icon: '📋', titleLabel: 'Document name *',         titlePlaceholder: 'e.g. Marriage Certificate',          lawyerLabel: 'Prepared by',                 contactLabel: 'Contact phone',     notesPlaceholder: 'Date signed, parties involved, location of original, key notes…' },
]

const FINANCIAL_TYPES = [
  { key: 'Bank Account',  icon: '🏦', titleLabel: 'Account name *',         titlePlaceholder: 'e.g. RBC Chequing',              institutionLabel: 'Bank / Institution',    accountLabel: 'Account number',      notesPlaceholder: 'Branch phone, joint holders, account type, branch address, auto-payments…' },
  { key: 'Investment',    icon: '📈', titleLabel: 'Account name *',         titlePlaceholder: 'e.g. TD RRSP / TFSA',            institutionLabel: 'Institution / Firm',    accountLabel: 'Account number',      notesPlaceholder: "Advisor phone, account type (RRSP/TFSA/non-reg), beneficiary name…" },
  { key: 'Insurance',     icon: '🛡️', titleLabel: 'Policy name *',          titlePlaceholder: 'e.g. Sun Life Life Insurance',   institutionLabel: 'Insurer',               accountLabel: 'Policy number',       notesPlaceholder: "Agent phone, coverage amount, beneficiary, premium, renewal date…" },
  { key: 'Pension / CPP', icon: '💰', titleLabel: 'Program name *',         titlePlaceholder: 'e.g. CPP / Company Pension',     institutionLabel: 'Administered by',       accountLabel: 'Member / SIN number', notesPlaceholder: 'Contact phone, monthly amount, survivor benefit, start date…' },
  { key: 'Beneficiary',   icon: '👨‍👩‍👧', titleLabel: 'Account / Policy name *', titlePlaceholder: 'e.g. Sun Life Policy #12345', institutionLabel: 'Institution / Insurer', accountLabel: 'Policy / Account #',  notesPlaceholder: 'Institution phone, beneficiary names, share percentages, contingent beneficiary…' },
  { key: 'Credit / Debt', icon: '💳', titleLabel: 'Account name *',         titlePlaceholder: 'e.g. Visa, Line of Credit',      institutionLabel: 'Bank / Lender',         accountLabel: 'Account / Card #',    notesPlaceholder: 'Lender phone, balance, limit, co-signer, auto-payment details…' },
]

const DIGITAL_TYPES = [
  { key: 'Social Media', icon: '💬', titleLabel: 'Platform name *',  titlePlaceholder: 'e.g. Facebook, Instagram, X',           userLabel: 'Username or email',    notesPlaceholder: 'Website: facebook.com · Recovery email, backup phone, 2FA details…' },
  { key: 'Email',        icon: '📧', titleLabel: 'Email service *',  titlePlaceholder: 'e.g. Gmail, Outlook, Yahoo Mail',        userLabel: 'Email address',        notesPlaceholder: 'Website: gmail.com · Recovery email or phone number, 2FA app used…' },
  { key: 'Streaming',    icon: '🎬', titleLabel: 'Service name *',   titlePlaceholder: "e.g. Netflix, Prime Video, Disney+",     userLabel: 'Email used to sign in', notesPlaceholder: 'Website: netflix.com · Devices signed in, plan type, shared with…' },
  { key: 'Shopping',     icon: '🛒', titleLabel: 'Service name *',   titlePlaceholder: 'e.g. Amazon, eBay, Costco.ca',           userLabel: 'Email used to sign in', notesPlaceholder: 'Website: amazon.ca · Saved card details, delivery address, membership…' },
  { key: 'Gov / Health', icon: '🏛️', titleLabel: 'Portal name *',   titlePlaceholder: 'e.g. CRA My Account, Service Canada',    userLabel: 'Username or SIN',      notesPlaceholder: 'Website URL · Security questions, SIN or health card on file…' },
  { key: 'Device / PIN', icon: '📱', titleLabel: 'Device name *',    titlePlaceholder: 'e.g. iPhone, iPad, Laptop, Smart TV',    userLabel: 'Device ID / username', notesPlaceholder: 'Device model, where it is kept, backup unlock method, Apple ID…' },
  { key: 'Other Login',  icon: '🔑', titleLabel: 'Service name *',   titlePlaceholder: 'e.g. Library Card, Pharmacy Portal',     userLabel: 'Username or email',    notesPlaceholder: 'Website URL · Recovery info, security questions, notes for family…' },
]

const VAULT_CATEGORIES = [
  { key: 'media',             label: 'Precious',        icon: '✨', desc: 'Your most meaningful photos and moments' },
  { key: 'personal_messages', label: 'Messages',        icon: '✉️', desc: 'Letters and video messages' },
  { key: 'legal',             label: 'Legal',           icon: '📜', desc: 'Will, power of attorney, trusts' },
  { key: 'financial',         label: 'Financial',       icon: '💰', desc: 'Accounts, insurance, investments' },
  { key: 'medical',           label: 'Medical',         icon: '🏥', desc: 'Records, directives, contacts' },
  { key: 'property',          label: 'Property',        icon: '🏠', desc: 'Deeds, titles, mortgages' },
  { key: 'digital_assets',    label: 'Passwords',       icon: '🔑', desc: 'Email, social media & streaming logins' },
]

function fileIcon(mimeType: string | null) {
  if (!mimeType) return '📄'
  if (mimeType.startsWith('image/'))                              return '🖼️'
  if (mimeType.startsWith('video/'))                              return '🎬'
  if (mimeType.startsWith('audio/'))                              return '🎙️'
  if (mimeType.includes('pdf'))                                   return '📑'
  if (mimeType.includes('word') || mimeType.includes('document')) return '📝'
  if (mimeType.includes('sheet') || mimeType.includes('excel'))   return '📊'
  return '📄'
}

function formatBytes(bytes: number | null) {
  if (!bytes) return ''
  if (bytes < 1024)    return bytes + ' B'
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1048576).toFixed(1) + ' MB'
}

const EMPTY_VAULT_FORM = { title: '', category: 'legal', description: '', content: '', username: '', password: '' }

type VaultCat = { key: string; label: string; icon: string; desc: string }

// Seeded once per tile mount — each tile gets its own random x-positions,
// rise durations, and phase offsets so no two cards look the same.
function makeEmberConfigs(tileIndex: number) {
  const PARTICLE_COUNT = 4
  // Divide the tile width into equal bands and jitter within each band
  // so particles are spread out but never perfectly evenly spaced.
  const bandW = 80 / PARTICLE_COUNT
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
    xPct:  8 + bandW * i + Math.random() * bandW * 0.9,   // jittered within band
    delay: tileIndex * 280 + Math.random() * 1200,         // tile offset + random phase
    dur:   1700 + Math.random() * 1100,                    // 1700–2800 ms rise cycle
    size:  2 + Math.random() * 1.5,                        // 2–3.5 px dot radius
    rise:  48 + Math.random() * 28,                        // 48–76 px travel distance
  }))
}

function EmberTile({ cat, count, onPress, width, tileIndex }: {
  cat: VaultCat
  count: number
  onPress: () => void
  width: number
  tileIndex: number
}) {
  // Config and Animated.Values are both created once on mount via useRef
  const configs = useRef(makeEmberConfigs(tileIndex)).current
  const anims   = useRef(
    configs.map(() => ({
      y:       new Animated.Value(0),
      opacity: new Animated.Value(0),
    }))
  ).current
  const hueAnim = useRef(new Animated.Value(tileIndex * 0.25)).current

  const stopped = useRef(false)

  useEffect(() => {
    stopped.current = false

    function runEmber(
      anim: { y: Animated.Value; opacity: Animated.Value },
      cfg:  { dur: number; rise: number },
      initialDelay: number,
    ) {
      if (stopped.current) return
      anim.y.setValue(0)
      anim.opacity.setValue(0)
      Animated.sequence([
        Animated.delay(initialDelay),
        Animated.parallel([
          Animated.timing(anim.y, {
            toValue:  -cfg.rise,
            duration: cfg.dur,
            useNativeDriver: true,
          }),
          Animated.sequence([
            Animated.timing(anim.opacity, {
              toValue:  0.85,
              duration: cfg.dur * 0.18,
              useNativeDriver: true,
            }),
            Animated.timing(anim.opacity, {
              toValue:  0,
              duration: cfg.dur * 0.82,
              useNativeDriver: true,
            }),
          ]),
        ]),
      ]).start(({ finished }) => {
        if (finished && !stopped.current) runEmber(anim, cfg, 60 + Math.random() * 120)
      })
    }

    configs.forEach((cfg, i) => runEmber(anims[i], cfg, cfg.delay))

    const hueLoop = Animated.loop(
      Animated.timing(hueAnim, {
        toValue:  1 + tileIndex * 0.25,
        duration: 4000,
        easing:   Easing.linear,
        useNativeDriver: false,
      })
    )
    hueLoop.start()

    return () => { stopped.current = true; hueLoop.stop() }
  }, [])

  const hasItems = count > 0

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.82} style={{ width }}>
      <Animated.View style={{
        borderRadius: 18,
        padding: 18,
        borderWidth: 2,
        borderColor: hueAnim.interpolate({
          inputRange:  [0, 0.33, 0.66, 1, 1.33, 1.66, 2],
          outputRange: ['#F06292', '#F48A5A', '#FFD07A', '#F06292', '#F48A5A', '#FFD07A', '#F06292'],
        }),
        backgroundColor: C.mauveDim + '44',
        overflow: 'hidden',
        alignItems: 'center',
      }}>
        {/* Ember particles */}
        {configs.map((cfg, i) => (
          <Animated.View
            key={i}
            pointerEvents="none"
            style={{
              position:        'absolute',
              bottom:          6,
              left:            width * (cfg.xPct / 100),
              width:           cfg.size,
              height:          cfg.size,
              borderRadius:    cfg.size / 2,
              backgroundColor: '#FFB040',
              opacity:         anims[i].opacity,
              transform:       [{ translateY: anims[i].y }],
            }}
          />
        ))}

        <Text style={{ fontSize: 44, marginBottom: 12 }}>{cat.icon}</Text>
        <Text style={{ color: C.offWhite, fontSize: 21, fontWeight: '700', marginBottom: 10 }}>
          {cat.label}
        </Text>
        <View style={{
          backgroundColor: hasItems ? 'rgba(255,185,55,0.18)' : 'rgba(255,255,255,0.07)',
          borderRadius: 10,
          paddingHorizontal: 12,
          paddingVertical: 5,
        }}>
          <Text style={{ color: hasItems ? '#FFB040' : C.greyDim, fontSize: 14, fontWeight: '700' }}>
            {hasItems ? `${count} item${count !== 1 ? 's' : ''}` : 'Empty'}
          </Text>
        </View>
      </Animated.View>
    </TouchableOpacity>
  )
}

export default function VaultScreen() {
  const insets = useSafeAreaInsets()
  const [counts, setCounts]           = useState<Record<string, number>>({})
  const [recentItems, setRecentItems] = useState<any[]>([])
  const [loading, setLoading]         = useState(true)
  const [showModal, setShowModal]     = useState(false)
  const [editingItem, setEditingItem] = useState<any>(null)
  const [form, setForm]               = useState({ ...EMPTY_VAULT_FORM })
  const [pickedFile, setPickedFile]   = useState<any>(null)
  const [removeExistingFile, setRemoveExistingFile] = useState(false)
  const [saving, setSaving]           = useState(false)
  const [uploading, setUploading]     = useState(false)
  const [saveMsg, setSaveMsg]         = useState('')
  const [confirmDelete, setConfirmDelete] = useState<any>(null)
  const [deleting, setDeleting]           = useState(false)
  const [activeFilter, setActiveFilter]   = useState<string | null>(null)
  const [showPassword, setShowPassword]   = useState(false)
  const [showPartnersModal, setShowPartnersModal] = useState(false)
  const [mediaItems, setMediaItems]           = useState<any[]>([])
  const [mediaUrls, setMediaUrls]             = useState<Record<string, string>>({})
  const [loadingMedia, setLoadingMedia]       = useState(false)
  const [viewingMedia, setViewingMedia]       = useState<{ item: any, url: string } | null>(null)
  const [uploadingMedia, setUploadingMedia]   = useState(false)
  const [mediaMsg, setMediaMsg]               = useState('')
  const [prescriptionImageUri, setPrescriptionImageUri] = useState<string | null>(null)
  const [legalScanUri, setLegalScanUri]                 = useState<string | null>(null)
  const [financialScanUri, setFinancialScanUri]         = useState<string | null>(null)
  // ── "Who can see what" per-category access control ──
  const [showAccessModal, setShowAccessModal] = useState(false)
  const [accessLoading, setAccessLoading]     = useState(false)
  const [accessMembers, setAccessMembers]     = useState<any[]>([])
  const [accessRules, setAccessRules]         = useState<Record<string, string[]>>({})
  const [savingAccess, setSavingAccess]       = useState(false)
  const [accessMsg, setAccessMsg]             = useState('')

  useEffect(() => { loadAll() }, [])

  useEffect(() => {
    if (activeFilter === 'media') loadMediaGrid()
  }, [activeFilter])

  const screenWidth = Dimensions.get('window').width
  const TILE_SIZE   = (screenWidth - 40 - 12) / 2   // 2-col grid, 12px gap, 20px h-padding each side

  async function loadAll() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const [catRes, recentRes] = await Promise.all([
      supabase.from('vault_items').select('category').eq('user_id', user.id),
      supabase.from('vault_items').select('*').eq('user_id', user.id)
        .order('created_at', { ascending: false }).limit(20),
    ])
    const tally: Record<string, number> = {}
    catRes.data?.forEach(row => { tally[row.category] = (tally[row.category] || 0) + 1 })
    setCounts(tally)
    setRecentItems(await decryptVaultItems(recentRes.data || []))
    setLoading(false)
  }

  async function openAccessModal() {
    setShowAccessModal(true)
    setAccessLoading(true)
    setAccessMsg('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setAccessLoading(false); return }
    const [memRes, ruleRes, sealRes] = await Promise.all([
      supabase.from('family_members')
        .select('id, name, relationship, is_trusted_contact, status')
        .eq('user_id', user.id)
        .order('created_at'),
      supabase.from('vault_category_access')
        .select('category, family_member_id')
        .eq('user_id', user.id),
      supabase.from('vault_category_sealed')
        .select('category')
        .eq('user_id', user.id),
    ])
    const allMembers = memRes.data || []
    setAccessMembers(allMembers)
    const sealed = (sealRes.data || []).map((r: any) => r.category)
    const map: Record<string, string[]> = {}
    ;(ruleRes.data || []).forEach((r: any) => {
      map[r.category] = [...(map[r.category] || []), r.family_member_id]
    })
    // Never-configured categories start with all trusted contacts visibly
    // pre-selected — no hidden defaults. Sealed categories start empty.
    const trustedIds = allMembers.filter((m: any) => m.is_trusted_contact).map((m: any) => m.id)
    VAULT_CATEGORIES.forEach(cat => {
      if (!map[cat.key]) map[cat.key] = sealed.includes(cat.key) ? [] : [...trustedIds]
    })
    setAccessRules(map)
    setAccessLoading(false)
  }

  function toggleAccess(category: string, memberId: string) {
    setAccessRules(prev => {
      const cur = prev[category] || []
      return {
        ...prev,
        [category]: cur.includes(memberId)
          ? cur.filter(id => id !== memberId)
          : [...cur, memberId],
      }
    })
  }

  async function saveAccessRules() {
    setSavingAccess(true)
    setAccessMsg('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSavingAccess(false); return }
    await Promise.all([
      supabase.from('vault_category_access').delete().eq('user_id', user.id),
      supabase.from('vault_category_sealed').delete().eq('user_id', user.id),
    ])
    const rows = Object.entries(accessRules).flatMap(([category, ids]) =>
      ids.map(family_member_id => ({ user_id: user.id, category, family_member_id })))
    // Zero people selected = a deliberate seal — no one receives that section
    const sealedRows = VAULT_CATEGORIES
      .filter(cat => (accessRules[cat.key] || []).length === 0)
      .map(cat => ({ user_id: user.id, category: cat.key }))
    const [rulesRes, sealRes] = await Promise.all([
      rows.length       ? supabase.from('vault_category_access').insert(rows)       : Promise.resolve({ error: null } as any),
      sealedRows.length ? supabase.from('vault_category_sealed').insert(sealedRows) : Promise.resolve({ error: null } as any),
    ])
    if (rulesRes.error || sealRes.error) {
      setAccessMsg('Could not save your choices. Please try again.')
      setSavingAccess(false)
      return
    }
    setSavingAccess(false)
    setShowAccessModal(false)
  }

  async function loadMediaGrid() {
    setLoadingMedia(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoadingMedia(false); return }
    const { data } = await supabase.from('vault_items')
      .select('*').eq('user_id', user.id).eq('category', 'media')
      .order('created_at', { ascending: false })
    const items = data || []
    setMediaItems(items)
    const urlMap: Record<string, string> = {}
    await Promise.all(items.map(async (item) => {
      if (item.file_path) {
        const { data: ud } = await supabase.storage.from('vault-files').createSignedUrl(item.file_path, 3600)
        if (ud?.signedUrl) urlMap[item.id] = ud.signedUrl
      }
    }))
    setMediaUrls(urlMap)
    setLoadingMedia(false)
  }

  async function addMediaFromDevice() {
    if (Platform.OS !== 'web') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (status !== 'granted') { setMediaMsg('Photo library permission required.'); return }
    }
    setMediaMsg('')
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        quality: 0.85,
      } as any)
      if (result.canceled || !result.assets?.length) return
      setUploadingMedia(true)

      // Get a fresh JWT — bypass the Supabase client's session cache entirely
      const { data: refreshed } = await supabase.auth.refreshSession()
      const session   = refreshed?.session
      const user      = session?.user
      const jwt       = session?.access_token
      const SUPA_URL  = 'https://yfthwahxahjabfbuntys.supabase.co'
      const SUPA_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlmdGh3YWh4YWhqYWJmYnVudHlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2MTE4MzAsImV4cCI6MjA5NDE4NzgzMH0.VfnjNTjE7RRux6s4-3icNLQoyhTl_mGYrW3Zlz9e_kE'

      if (!user || !jwt) { setUploadingMedia(false); return }

      let uploaded = 0
      let failed = 0
      let lastErr = ''

      for (const asset of result.assets) {
        try {
          // Detect actual MIME type — iOS often returns HEIC, not JPEG
          const mimeType = (asset as any).mimeType || 'image/jpeg'
          const rawExt   = asset.uri.split('.').pop()?.toLowerCase().split('?')[0] || 'jpg'
          const safeExt  = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif'].includes(rawExt)
            ? (rawExt === 'jpeg' ? 'jpg' : rawExt)
            : 'jpg'
          const fileName    = `${Date.now()}_${uploaded}.${safeExt}`
          const storagePath = `${user.id}/media/${fileName}`

          // Read file into blob
          const fileRes = await fetch(asset.uri)
          const blob    = await fileRes.blob()

          // Upload to Supabase Storage via raw REST — explicit JWT, no client session layer
          const storageRes = await fetch(
            `${SUPA_URL}/storage/v1/object/vault-files/${storagePath}`,
            {
              method:  'POST',
              headers: {
                'Authorization': `Bearer ${jwt}`,
                'apikey':        SUPA_ANON,
                'Content-Type':  mimeType,
              },
              body: blob,
            }
          )
          const storageBody = await storageRes.text()

          if (!storageRes.ok) {
            lastErr = `[storage ${storageRes.status}] ${storageBody.slice(0, 80)}`
            failed++; continue
          }

          // Insert DB record via raw PostgREST — same explicit JWT
          const dbRes = await fetch(
            `${SUPA_URL}/rest/v1/vault_items`,
            {
              method:  'POST',
              headers: {
                'Authorization': `Bearer ${jwt}`,
                'apikey':        SUPA_ANON,
                'Content-Type':  'application/json',
                'Prefer':        'return=minimal',
              },
              body: JSON.stringify({
                user_id:     user.id,
                title:       (asset as any).fileName || fileName,
                category:    'media',
                description: '',
                file_path:   storagePath,
                file_name:   fileName,
                file_size:   (asset as any).fileSize || 0,
                file_type:   mimeType,
              }),
            }
          )
          const dbBody = await dbRes.text()

          if (!dbRes.ok) {
            lastErr = `[db ${dbRes.status}] ${dbBody.slice(0, 80)}`
            failed++; continue
          }

          uploaded++
        } catch (assetErr: any) {
          lastErr = `[exception] ${assetErr?.message || 'Unknown error'}`
          failed++
        }
      }

      setUploadingMedia(false)
      if (uploaded === 0 && failed > 0) {
        setMediaMsg(`Upload failed: ${lastErr}`)
      } else if (failed > 0) {
        setMediaMsg(`${uploaded} saved, ${failed} failed: ${lastErr}`)
      }
      await loadMediaGrid()
      loadAll()
    } catch (e: any) { setMediaMsg('Could not open photo library: ' + e.message); setUploadingMedia(false) }
  }

  function openAddModal() {
    const category = activeFilter ?? VAULT_CATEGORIES[0].key
    setEditingItem(null); setForm({ ...EMPTY_VAULT_FORM, category })
    setPickedFile(null); setRemoveExistingFile(false); setSaveMsg(''); setShowModal(true)
  }

  function openEditModal(item: any) {
    setEditingItem(item)
    setForm({ title: item.title || '', category: item.category || 'legal',
      description: item.description || '', content: item.content || '',
      username: item.username || '', password: item.password || '' })
    setPickedFile(null); setRemoveExistingFile(false); setSaveMsg(''); setShowModal(true)
  }

  function closeModal() {
    setShowModal(false); setEditingItem(null); setPickedFile(null)
    setRemoveExistingFile(false); setSaveMsg(''); setForm({ ...EMPTY_VAULT_FORM })
    setShowPassword(false); setPrescriptionImageUri(null); setLegalScanUri(null); setFinancialScanUri(null)
  }

  async function handlePickFile() {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true })
      if (!result.canceled && result.assets?.length > 0) {
        setPickedFile(result.assets[0]); setRemoveExistingFile(false)
      }
    } catch (e: any) { setSaveMsg('Could not open file picker: ' + e.message) }
  }

  async function handlePickPrescriptionImage(useCamera: boolean) {
    try {
      if (Platform.OS !== 'web') {
        if (useCamera) {
          const { status } = await ImagePicker.requestCameraPermissionsAsync()
          if (status !== 'granted') { setSaveMsg('Camera permission required.'); return }
        } else {
          const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
          if (status !== 'granted') { setSaveMsg('Photo library permission required.'); return }
        }
      }
      const result = useCamera
        ? await ImagePicker.launchCameraAsync({ quality: 0.85, mediaTypes: ['images'] } as any)
        : await ImagePicker.launchImageLibraryAsync({ quality: 0.85, mediaTypes: ['images'] } as any)
      if (result.canceled || !result.assets?.length) return
      const asset = result.assets[0]
      setPrescriptionImageUri(asset.uri)
      setPickedFile({
        uri: asset.uri,
        name: asset.fileName || `prescription_${Date.now()}.jpg`,
        mimeType: asset.mimeType || 'image/jpeg',
        size: asset.fileSize || 0,
      })
      setRemoveExistingFile(false)
    } catch (e: any) { setSaveMsg('Could not open camera: ' + e.message) }
  }

  async function handlePickLegalScan() {
    try {
      if (Platform.OS !== 'web') {
        const { status } = await ImagePicker.requestCameraPermissionsAsync()
        if (status !== 'granted') { setSaveMsg('Camera permission required.'); return }
      }
      const result = await ImagePicker.launchCameraAsync({ quality: 0.9, mediaTypes: ['images'] } as any)
      if (result.canceled || !result.assets?.length) return
      const asset = result.assets[0]
      setLegalScanUri(asset.uri)
      setPickedFile({
        uri: asset.uri,
        name: asset.fileName || `legal_scan_${Date.now()}.jpg`,
        mimeType: asset.mimeType || 'image/jpeg',
        size: asset.fileSize || 0,
      })
      setRemoveExistingFile(false)
    } catch (e: any) { setSaveMsg('Could not open camera: ' + e.message) }
  }

  async function handlePickFinancialScan() {
    try {
      if (Platform.OS !== 'web') {
        const { status } = await ImagePicker.requestCameraPermissionsAsync()
        if (status !== 'granted') { setSaveMsg('Camera permission required.'); return }
      }
      const result = await ImagePicker.launchCameraAsync({ quality: 0.9, mediaTypes: ['images'] } as any)
      if (result.canceled || !result.assets?.length) return
      const asset = result.assets[0]
      setFinancialScanUri(asset.uri)
      setPickedFile({
        uri: asset.uri,
        name: asset.fileName || `financial_scan_${Date.now()}.jpg`,
        mimeType: asset.mimeType || 'image/jpeg',
        size: asset.fileSize || 0,
      })
      setRemoveExistingFile(false)
    } catch (e: any) { setSaveMsg('Could not open camera: ' + e.message) }
  }

  async function handleSave() {
    if (!form.title.trim()) { setSaveMsg('Please enter a title.'); return }
    setSaving(true); setSaveMsg('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaveMsg('Not signed in.'); setSaving(false); return }

    let file_path = editingItem?.file_path ?? null
    let file_name = editingItem?.file_name ?? null
    let file_size = editingItem?.file_size ?? null
    let file_type = editingItem?.file_type ?? null

    if ((removeExistingFile || pickedFile) && editingItem?.file_path) {
      await supabase.storage.from('vault-files').remove([editingItem.file_path])
      file_path = null; file_name = null; file_size = null; file_type = null
    }

    if (pickedFile) {
      setUploading(true)
      try {
        const response = await fetch(pickedFile.uri)
        const blob = await response.blob()
        const path = `${user.id}/${Date.now()}_${pickedFile.name}`
        const { error: uploadError } = await supabase.storage.from('vault-files')
          .upload(path, blob, { contentType: pickedFile.mimeType || 'application/octet-stream' })
        if (uploadError) { setSaveMsg('File upload failed: ' + uploadError.message); setSaving(false); setUploading(false); return }
        file_path = path; file_name = pickedFile.name; file_size = pickedFile.size; file_type = pickedFile.mimeType
      } catch (e: any) { setSaveMsg('Upload error: ' + e.message); setSaving(false); setUploading(false); return }
      setUploading(false)
    }

    const rawPayload = { title: form.title.trim(), category: form.category,
      description: form.description.trim() || null, content: form.content.trim() || null,
      username: form.username.trim() || null, password: form.password.trim() || null,
      file_path, file_name, file_size, file_type }

    // Encrypt sensitive fields (password, content, username) before storing
    const payload = await encryptVaultPayload(rawPayload)

    let error: any = null
    if (editingItem) {
      const res = await supabase.from('vault_items').update(payload).eq('id', editingItem.id)
      error = res.error
    } else {
      const res = await supabase.from('vault_items').insert({ user_id: user.id, ...payload })
      error = res.error
    }
    setSaving(false)
    if (error) { setSaveMsg('Error saving: ' + error.message) }
    else { closeModal(); loadAll() }
  }

  async function handleDeleteItem() {
    if (!confirmDelete) return
    const wasMedia = confirmDelete.category === 'media'
    setDeleting(true)
    if (confirmDelete.file_path) await supabase.storage.from('vault-files').remove([confirmDelete.file_path])
    await supabase.from('vault_items').delete().eq('id', confirmDelete.id)
    setDeleting(false); setConfirmDelete(null); loadAll()
    if (wasMedia) loadMediaGrid()
  }

  const existingFile = editingItem && !removeExistingFile && !pickedFile
    ? { name: editingItem.file_name, size: editingItem.file_size, mimeType: editingItem.file_type } : null

  const filteredItems = activeFilter
    ? recentItems.filter(i => i.category === activeFilter)
    : recentItems

  return (
    <ScreenWrap>

      {/* ── Safe-area category nav header — sits above ScrollView so it never scrolls away ── */}
      {activeFilter !== null && (
        <View style={{
          paddingTop: insets.top + 10,
          paddingBottom: 14,
          paddingHorizontal: 20,
          backgroundColor: 'rgba(0,0,0,0.22)',
          borderBottomWidth: 1,
          borderBottomColor: 'rgba(255,255,255,0.06)',
        }}>
          {/* Pink pill back button — safely below the iOS status bar clock */}
          <TouchableOpacity
            onPress={() => setActiveFilter(null)}
            activeOpacity={0.7}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 5,
              alignSelf: 'flex-start',
              backgroundColor: 'rgba(240,98,146,0.15)',
              borderWidth: 1, borderColor: C.accent + '55',
              borderRadius: 20, paddingHorizontal: 13, paddingVertical: 6,
              marginBottom: 12,
            }}>
            <Text style={{ color: C.accent, fontSize: 17, lineHeight: 19 }}>‹</Text>
            <Text style={{ color: C.accent, fontSize: 13, fontWeight: '600' }}>My Vault</Text>
          </TouchableOpacity>
          {/* Category title row */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={{ fontSize: 26 }}>
              {VAULT_CATEGORIES.find(c => c.key === activeFilter)?.icon}
            </Text>
            <Text style={s.pageTitle}>
              {VAULT_CATEGORIES.find(c => c.key === activeFilter)?.label}
            </Text>
          </View>
        </View>
      )}

      <ScrollView contentContainerStyle={s.screenScroll} showsVerticalScrollIndicator={true}>

        {/* Landing header — only on category grid view */}
        {activeFilter === null && (
          <View style={s.pageHeaderPlain}>
            <Text style={s.pageTitle}>My Vault</Text>
            <Text style={s.pageSubtitle}>Your secure documents</Text>
          </View>
        )}

        {activeFilter === 'media' ? (
          /* ── Media source buttons ── */
          <View style={{ paddingHorizontal: 20, gap: 10, marginBottom: 4 }}>

            {/* Purpose banner */}
            <View style={{
              backgroundColor: C.amber + '12', borderRadius: 16,
              borderWidth: 1, borderColor: C.amber + '33', padding: 16, gap: 6,
            }}>
              <Text style={{ color: C.amberLight, fontSize: 15, fontWeight: '700' }}>
                ✨ Your Most Precious Moments
              </Text>
              <Text style={{ color: C.grey, fontSize: 13, lineHeight: 20 }}>
                Your family will one day sort through thousands of photos — help them find the ones that truly mattered.
                Save the moments you never want forgotten: the day a new baby arrived, the first day of school, a graduation, a wedding, a last family photo together.
              </Text>
            </View>

            <TouchableOpacity
              onPress={addMediaFromDevice}
              disabled={uploadingMedia}
              activeOpacity={0.85}
              style={{ backgroundColor: C.mauve, borderRadius: 14, padding: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 10 }}>
              {uploadingMedia
                ? <ActivityIndicator color={C.offWhite} size="small" />
                : <Text style={{ fontSize: 22 }}>📱</Text>}
              <Text style={{ color: C.offWhite, fontSize: 15, fontWeight: '600' }}>
                {uploadingMedia ? 'Uploading…' : 'Choose from Device'}
              </Text>
            </TouchableOpacity>
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 10,
              backgroundColor: C.mauveDim, borderRadius: 12, padding: 12,
            }}>
              <Text style={{ fontSize: 20 }}>📸</Text>
              <Text style={{ color: C.grey, fontSize: 13, flex: 1, lineHeight: 18 }}>
                Already in <Text style={{ color: C.offWhite, fontWeight: '600' }}>Moments</Text>? Tap the{' '}
                <Text style={{ color: C.amber, fontWeight: '700' }}>🔐</Text> button on any photo to save it here.
              </Text>
            </View>
            {!!mediaMsg && <Text style={{ color: C.error, fontSize: 13 }}>{mediaMsg}</Text>}
          </View>
        ) : activeFilter !== null ? (
          <TouchableOpacity activeOpacity={0.85} style={s.addBtn} onPress={openAddModal}>
            <LinearGradient colors={[C.amberLight, C.amber, '#C07840']} style={s.btnPrimary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
              <Text style={s.btnPrimaryText}>+ Add Item to Vault</Text>
            </LinearGradient>
          </TouchableOpacity>
        ) : null}

        {/* ── Category Landing Grid ── */}
        {activeFilter === null && (
          <View style={{ paddingHorizontal: 20, paddingBottom: 24 }}>
            {/* Empty vault nudge */}
            {!loading && recentItems.length === 0 && (
              <View style={{
                backgroundColor: C.amber + '0E', borderRadius: 14,
                borderWidth: 1, borderColor: C.amber + '33',
                padding: 14, marginBottom: 16,
              }}>
                <Text style={{ color: C.amberLight, fontSize: 13, fontWeight: '600', marginBottom: 2 }}>
                  🏛️ Build your vault when you're ready
                </Text>
                <Text style={{ color: C.grey, fontSize: 12, lineHeight: 18 }}>
                  Most people start with one thing — a will, an insurance policy, or a list of account passwords. No rush, no right order.
                </Text>
              </View>
            )}
            {/* ── Who can see what — per-person vault access (kept above the
                   tiles so seniors see it without scrolling) ── */}
            <TouchableOpacity
              onPress={openAccessModal}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Choose which family member can see each section of your vault documents"
              style={{
                marginBottom: 16, minHeight: 60,
                flexDirection: 'row', alignItems: 'center', gap: 12,
                backgroundColor: C.mauveDim, borderRadius: 16,
                borderWidth: 1.5, borderColor: C.accent + '66',
                paddingHorizontal: 16, paddingVertical: 12,
              }}>
              <Text style={{ fontSize: 28 }}>🔐</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.offWhite, fontSize: 16, fontWeight: '700' }}>Who Can See My Documents</Text>
                <Text style={{ color: C.grey, fontSize: 13, lineHeight: 18 }}>
                  Choose which family member can see each section of your vault
                </Text>
              </View>
              <Text style={{ fontSize: 22, color: C.grey }}>›</Text>
            </TouchableOpacity>

            {/* 2-column category tiles — rising embers effect */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
              {VAULT_CATEGORIES.map((cat, idx) => (
                <EmberTile
                  key={cat.key}
                  cat={cat}
                  count={counts[cat.key] || 0}
                  onPress={() => setActiveFilter(cat.key)}
                  width={TILE_SIZE}
                  tileIndex={idx}
                />
              ))}
            </View>
          </View>
        )}

        {/* ── Contextual partner nudge for Legal, Financial & Property categories ── */}
        {(activeFilter === 'legal' || activeFilter === 'financial' || activeFilter === 'property') && (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => setShowPartnersModal(true)}
            style={{
              marginHorizontal: 20, marginBottom: 16, borderRadius: 16,
              borderWidth: 1, borderColor: C.accent + '44',
              backgroundColor: C.accent + '0E', padding: 16,
              flexDirection: 'row', alignItems: 'center', gap: 14,
            }}>
            <Text style={{ fontSize: 26 }}>
              {activeFilter === 'legal' ? '⚖️' : activeFilter === 'financial' ? '💰' : '🏠'}
            </Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.offWhite, fontSize: 14, fontWeight: '700', marginBottom: 2 }}>
                Want help from a professional?
              </Text>
              <Text style={{ color: C.grey, fontSize: 12 }}>
                {activeFilter === 'legal'
                  ? 'Connect with a trusted estate lawyer in your area'
                  : activeFilter === 'financial'
                  ? 'Connect with a trusted financial advisor in your area'
                  : 'Connect with a trusted real estate agent in your area'}
              </Text>
            </View>
            <Text style={{ color: C.accent, fontSize: 18 }}>›</Text>
          </TouchableOpacity>
        )}

        {activeFilter === 'media' ? (
          /* ── Media photo grid ── */
          loadingMedia ? (
            <ActivityIndicator color={C.amber} style={{ marginTop: 24 }} />
          ) : mediaItems.length === 0 ? (
            <View style={s.emptyState}>
              <Text style={s.emptyIcon}>✨</Text>
              <Text style={s.emptyTitle}>No precious moments yet</Text>
              <Text style={s.emptyDesc}>Add the photos your family should never lose — a new baby, a graduation, a last family photo. From your device, Facebook, or tap 🔐 on any Moment.</Text>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 20, gap: 2, marginTop: 8 }}>
              {mediaItems.map(item => (
                <TouchableOpacity
                  key={item.id}
                  onPress={() => { if (mediaUrls[item.id]) setViewingMedia({ item, url: mediaUrls[item.id] }) }}
                  activeOpacity={0.8}
                  style={{ width: MEDIA_CELL, height: MEDIA_CELL }}>
                  {mediaUrls[item.id] ? (
                    <Image
                      source={{ uri: mediaUrls[item.id] }}
                      style={{ width: '100%', height: '100%', borderRadius: 4 }}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={{ width: '100%', height: '100%', backgroundColor: C.mauveDim, borderRadius: 4, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 26 }}>🖼️</Text>
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )
        ) : activeFilter !== null ? (
          /* ── Standard list view — only shown when a category is selected ── */
          loading ? <ActivityIndicator color={C.amber} style={{ marginTop: 20 }} /> : (
            filteredItems.length === 0 ? (
              <View style={s.emptyState}>
                <Text style={s.emptyIcon}>🔐</Text>
                <Text style={s.emptyTitle}>Nothing here yet</Text>
                <Text style={s.emptyDesc}>Tap "+ Add Item to Vault" above to get started.</Text>
              </View>
            ) : (
              filteredItems.map((item) => (
                <View key={item.id} style={s.listRow}>
                  <View style={s.listIconWrap}>
                    <Text style={s.listIcon}>{item.file_name ? fileIcon(item.file_type) : (VAULT_CATEGORIES.find(c => c.key === item.category)?.icon || '📝')}</Text>
                  </View>
                  <View style={s.listInfo}>
                    <Text style={s.listLabel}>{item.title}</Text>
                    <Text style={s.listDesc}>
                      {VAULT_CATEGORIES.find(c => c.key === item.category)?.label || item.category}
                      {(item.username || item.password) ? '  ·  🔒 login saved' : ''}
                      {item.file_name ? `  ·  📎 ${item.file_name}` : ''}
                      {item.file_size ? `  ·  ${formatBytes(item.file_size)}` : ''}
                    </Text>
                  </View>
                  <View style={s.rowActions}>
                    <TouchableOpacity onPress={() => openEditModal(item)} style={s.editBtn} accessibilityLabel="Edit item" accessibilityRole="button">
                      <Text style={s.editBtnIcon}>✏️</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setConfirmDelete(item)} style={s.deleteBtn} accessibilityLabel="Delete item" accessibilityRole="button">
                      <Text style={s.deleteBtnIcon}>🗑️</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )
          )
        ) : null}

      </ScrollView>

      {/* Add / Edit Modal */}
      <Modal visible={showModal} transparent animationType="slide" onRequestClose={closeModal}>
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={closeModal}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? undefined : 'height'} style={{ width: '100%' }}>
            <TouchableOpacity activeOpacity={1} onPress={() => {}}>
            <View style={{ minHeight: '80%', maxHeight: '92%', borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden', width: '100%' }}>
              <LinearGradient colors={['#F06292', '#F48A5A', '#FFD07A']} style={{ flex: 1, paddingHorizontal: 28, paddingTop: 40, paddingBottom: 28 }}>
                <View style={s.modalHandle} />
                <View style={s.modalHeader}>
                  <Text style={[s.modalTitle, { color: '#3D1020' }]}>
                    {editingItem
                      ? (form.category === 'medical' ? 'Edit Medical Record' : form.category === 'legal' ? 'Edit Legal Document' : form.category === 'financial' ? 'Edit Financial Record' : form.category === 'digital_assets' ? 'Edit Login' : 'Edit Item')
                      : form.category === 'medical'
                        ? (form.description === 'Prescription' ? 'Prescription Information' : 'Medical Record')
                        : form.category === 'legal'
                          ? (form.description || 'Legal Document')
                          : form.category === 'financial'
                            ? (form.description || 'Financial Record')
                            : form.category === 'digital_assets'
                              ? (form.description || 'Password / Login')
                              : 'Add to Vault'}
                  </Text>
                  <TouchableOpacity onPress={closeModal}><View style={s.modalCloseBtn}><Text style={s.modalCloseX}>✕</Text></View></TouchableOpacity>
                </View>
                <ScrollView showsVerticalScrollIndicator={true} automaticallyAdjustKeyboardInsets keyboardShouldPersistTaps="handled" style={{ flex: 1 }}>

                  {form.category === 'medical' ? (
                    /* ── Custom Medical form ── */
                    <>
                      {/* Type picker */}
                      <Text style={[s.fieldLabel, { color: '#7A3448' }]}>Type of record *</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
                        {MEDICAL_TYPES.map(mt => {
                          const selected = form.description === mt.key
                          return (
                            <TouchableOpacity
                              key={mt.key}
                              onPress={() => setForm(f => ({ ...f, description: mt.key }))}
                              activeOpacity={0.8}
                              style={{
                                flexDirection: 'row', alignItems: 'center', gap: 6,
                                paddingHorizontal: 14, paddingVertical: 9,
                                borderRadius: 20, borderWidth: 1.5,
                                backgroundColor: selected ? 'rgba(61,16,32,0.15)' : 'rgba(61,16,32,0.05)',
                                borderColor: selected ? '#3D1020' : 'rgba(61,16,32,0.2)',
                              }}>
                              <Text style={{ fontSize: 16 }}>{mt.icon}</Text>
                              <Text style={{ fontSize: 13, fontWeight: selected ? '700' : '500', color: selected ? '#3D1020' : '#7A3448' }}>{mt.key}</Text>
                            </TouchableOpacity>
                          )
                        })}
                      </View>

                      {/* Adaptive fields based on selected type */}
                      {(() => {
                        const mt = MEDICAL_TYPES.find(t => t.key === form.description) ?? MEDICAL_TYPES[0]
                        return (
                          <>
                            <Text style={[s.fieldLabel, { color: '#7A3448' }]}>{mt.titleLabel}</Text>
                            <TextInput
                              style={[s.input, { backgroundColor: 'rgba(61,16,32,0.08)', borderColor: 'rgba(61,16,32,0.2)', color: '#3D1020' }]}
                              placeholder={`e.g. ${mt.key === 'Prescription' ? 'Metformin 500mg' : mt.key === 'Doctor Contact' ? 'Dr. Sarah Chen' : mt.key === 'Allergy' ? 'Penicillin' : mt.key === 'Directive' ? 'Do Not Resuscitate (DNR)' : 'Annual blood panel'}`}
                              placeholderTextColor="rgba(61,16,32,0.35)"
                              value={form.title}
                              onChangeText={v => setForm(f => ({ ...f, title: v }))}
                            />

                            <Text style={[s.fieldLabel, { color: '#7A3448' }]}>{mt.providerLabel} (optional)</Text>
                            <TextInput
                              style={[s.input, { backgroundColor: 'rgba(61,16,32,0.08)', borderColor: 'rgba(61,16,32,0.2)', color: '#3D1020' }]}
                              placeholder={`Enter ${mt.providerLabel.toLowerCase()}`}
                              placeholderTextColor="rgba(61,16,32,0.35)"
                              value={form.username}
                              onChangeText={v => setForm(f => ({ ...f, username: v }))}
                            />

                            <Text style={[s.fieldLabel, { color: '#7A3448' }]}>{mt.contactLabel} (optional)</Text>
                            <TextInput
                              style={[s.input, { backgroundColor: 'rgba(61,16,32,0.08)', borderColor: 'rgba(61,16,32,0.2)', color: '#3D1020' }]}
                              placeholder="e.g. (604) 555-0192"
                              placeholderTextColor="rgba(61,16,32,0.35)"
                              value={form.password}
                              onChangeText={v => setForm(f => ({ ...f, password: v }))}
                              keyboardType={mt.key === 'Prescription' ? 'default' : 'phone-pad'}
                            />

                            <Text style={[s.fieldLabel, { color: '#7A3448' }]}>Details &amp; Notes (optional)</Text>
                            <TextInput
                              style={[s.input, { height: 120, textAlignVertical: 'top', backgroundColor: 'rgba(61,16,32,0.08)', borderColor: 'rgba(61,16,32,0.2)', color: '#3D1020' }]}
                              placeholder={mt.notesPlaceholder}
                              placeholderTextColor="rgba(61,16,32,0.35)"
                              value={form.content}
                              onChangeText={v => setForm(f => ({ ...f, content: v }))}
                              multiline
                              numberOfLines={5}
                            />

                            {/* Prescription photo attachment — only shown for Prescription type */}
                            {mt.key === 'Prescription' && (
                              <>
                                <Text style={[s.fieldLabel, { color: '#7A3448', marginTop: 4 }]}>Photo of label (optional)</Text>
                                <Text style={{ fontSize: 13, color: '#7A3448', opacity: 0.75, marginBottom: 12, marginTop: -4 }}>
                                  Snap a photo of the bottle or prescription slip — easiest way to save it.
                                </Text>

                                {/* Buttons row */}
                                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
                                  <TouchableOpacity
                                    onPress={() => handlePickPrescriptionImage(true)}
                                    activeOpacity={0.8}
                                    style={{
                                      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                                      gap: 7, paddingVertical: 14, borderRadius: 14,
                                      backgroundColor: 'rgba(61,16,32,0.12)', borderWidth: 1.5,
                                      borderColor: 'rgba(61,16,32,0.25)',
                                    }}>
                                    <Text style={{ fontSize: 22 }}>📷</Text>
                                    <Text style={{ fontSize: 15, fontWeight: '600', color: '#3D1020' }}>Take Photo</Text>
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    onPress={() => handlePickPrescriptionImage(false)}
                                    activeOpacity={0.8}
                                    style={{
                                      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                                      gap: 7, paddingVertical: 14, borderRadius: 14,
                                      backgroundColor: 'rgba(61,16,32,0.06)', borderWidth: 1.5,
                                      borderColor: 'rgba(61,16,32,0.15)',
                                    }}>
                                    <Text style={{ fontSize: 22 }}>🖼️</Text>
                                    <Text style={{ fontSize: 15, fontWeight: '600', color: '#3D1020' }}>Choose Photo</Text>
                                  </TouchableOpacity>
                                </View>

                                {/* Preview thumbnail */}
                                {(prescriptionImageUri || (editingItem?.file_type?.startsWith('image/') && editingItem?.file_path && !removeExistingFile)) && (
                                  <View style={{ marginBottom: 14, alignItems: 'flex-start' }}>
                                    <View style={{ position: 'relative' }}>
                                      <Image
                                        source={{ uri: prescriptionImageUri || undefined }}
                                        style={{ width: 120, height: 120, borderRadius: 12, borderWidth: 1.5, borderColor: 'rgba(61,16,32,0.2)' }}
                                        resizeMode="cover"
                                      />
                                      <TouchableOpacity
                                        onPress={() => { setPrescriptionImageUri(null); setPickedFile(null) }}
                                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                        accessibilityRole="button" accessibilityLabel="Remove photo"
                                        style={{
                                          position: 'absolute', top: -10, right: -10,
                                          backgroundColor: '#3D1020', borderRadius: 18,
                                          width: 36, height: 36, alignItems: 'center', justifyContent: 'center',
                                        }}>
                                        <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>✕</Text>
                                      </TouchableOpacity>
                                    </View>
                                    <Text style={{ fontSize: 12, color: '#7A3448', marginTop: 6, opacity: 0.7 }}>Photo will be saved with this prescription</Text>
                                  </View>
                                )}
                              </>
                            )}

                            {/* Encryption note */}
                            <Text style={[s.passwordHint, { color: '#7A3448', marginTop: -8 }]}>🔒 All medical details are AES-256 encrypted — only you can read this</Text>
                          </>
                        )
                      })()}
                    </>
                  ) : form.category === 'legal' ? (
                    /* ── Custom Legal form ── */
                    <>
                      {/* Type picker */}
                      <Text style={[s.fieldLabel, { color: '#7A3448' }]}>Document type *</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
                        {LEGAL_TYPES.map(lt => {
                          const selected = form.description === lt.key
                          return (
                            <TouchableOpacity
                              key={lt.key}
                              onPress={() => setForm(f => ({ ...f, description: lt.key }))}
                              activeOpacity={0.8}
                              style={{
                                flexDirection: 'row', alignItems: 'center', gap: 6,
                                paddingHorizontal: 14, paddingVertical: 9,
                                borderRadius: 20, borderWidth: 1.5,
                                backgroundColor: selected ? 'rgba(61,16,32,0.15)' : 'rgba(61,16,32,0.05)',
                                borderColor: selected ? '#3D1020' : 'rgba(61,16,32,0.2)',
                              }}>
                              <Text style={{ fontSize: 16 }}>{lt.icon}</Text>
                              <Text style={{ fontSize: 13, fontWeight: selected ? '700' : '500', color: selected ? '#3D1020' : '#7A3448' }}>{lt.key}</Text>
                            </TouchableOpacity>
                          )
                        })}
                      </View>

                      {/* Adaptive fields */}
                      {(() => {
                        const lt = LEGAL_TYPES.find(t => t.key === form.description) ?? LEGAL_TYPES[0]
                        return (
                          <>
                            <Text style={[s.fieldLabel, { color: '#7A3448' }]}>{lt.titleLabel}</Text>
                            <TextInput
                              style={[s.input, { backgroundColor: 'rgba(61,16,32,0.08)', borderColor: 'rgba(61,16,32,0.2)', color: '#3D1020' }]}
                              placeholder={lt.titlePlaceholder}
                              placeholderTextColor="rgba(61,16,32,0.35)"
                              value={form.title}
                              onChangeText={v => setForm(f => ({ ...f, title: v }))}
                            />

                            <Text style={[s.fieldLabel, { color: '#7A3448' }]}>{lt.lawyerLabel} (optional)</Text>
                            <TextInput
                              style={[s.input, { backgroundColor: 'rgba(61,16,32,0.08)', borderColor: 'rgba(61,16,32,0.2)', color: '#3D1020' }]}
                              placeholder={`Enter ${lt.lawyerLabel.toLowerCase()}`}
                              placeholderTextColor="rgba(61,16,32,0.35)"
                              value={form.username}
                              onChangeText={v => setForm(f => ({ ...f, username: v }))}
                            />

                            <Text style={[s.fieldLabel, { color: '#7A3448' }]}>{lt.contactLabel} (optional)</Text>
                            <TextInput
                              style={[s.input, { backgroundColor: 'rgba(61,16,32,0.08)', borderColor: 'rgba(61,16,32,0.2)', color: '#3D1020' }]}
                              placeholder="e.g. (604) 555-0192"
                              placeholderTextColor="rgba(61,16,32,0.35)"
                              value={form.password}
                              onChangeText={v => setForm(f => ({ ...f, password: v }))}
                              keyboardType="phone-pad"
                            />

                            <Text style={[s.fieldLabel, { color: '#7A3448' }]}>Notes (optional)</Text>
                            <TextInput
                              style={[s.input, { height: 120, textAlignVertical: 'top', backgroundColor: 'rgba(61,16,32,0.08)', borderColor: 'rgba(61,16,32,0.2)', color: '#3D1020' }]}
                              placeholder={lt.notesPlaceholder}
                              placeholderTextColor="rgba(61,16,32,0.35)"
                              value={form.content}
                              onChangeText={v => setForm(f => ({ ...f, content: v }))}
                              multiline
                              numberOfLines={5}
                            />

                            {/* Scan physical document with camera */}
                            <Text style={[s.fieldLabel, { color: '#7A3448', marginTop: 4 }]}>Scan physical document (optional)</Text>
                            <Text style={{ fontSize: 13, color: '#7A3448', opacity: 0.75, marginBottom: 12, marginTop: -4 }}>
                              Have the signed paper in front of you? Take a photo to store it here.
                            </Text>
                            <TouchableOpacity
                              onPress={handlePickLegalScan}
                              activeOpacity={0.8}
                              style={{
                                flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                                gap: 8, paddingVertical: 14, borderRadius: 14, marginBottom: 14,
                                backgroundColor: 'rgba(61,16,32,0.12)', borderWidth: 1.5,
                                borderColor: 'rgba(61,16,32,0.25)',
                              }}>
                              <Text style={{ fontSize: 22 }}>📷</Text>
                              <Text style={{ fontSize: 15, fontWeight: '600', color: '#3D1020' }}>Scan with Camera</Text>
                            </TouchableOpacity>

                            {/* Scan preview */}
                            {legalScanUri ? (
                              <View style={{ marginBottom: 14, alignItems: 'flex-start' }}>
                                <View style={{ position: 'relative' }}>
                                  <Image
                                    source={{ uri: legalScanUri }}
                                    style={{ width: 140, height: 100, borderRadius: 10, borderWidth: 1.5, borderColor: 'rgba(61,16,32,0.2)' }}
                                    resizeMode="cover"
                                  />
                                  <TouchableOpacity
                                    onPress={() => { setLegalScanUri(null); setPickedFile(null) }}
                                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                    accessibilityRole="button" accessibilityLabel="Remove scan"
                                    style={{
                                      position: 'absolute', top: -10, right: -10,
                                      backgroundColor: '#3D1020', borderRadius: 18,
                                      width: 36, height: 36, alignItems: 'center', justifyContent: 'center',
                                    }}>
                                    <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>✕</Text>
                                  </TouchableOpacity>
                                </View>
                                <Text style={{ fontSize: 12, color: '#7A3448', marginTop: 6, opacity: 0.7 }}>Scan will be saved with this document</Text>
                              </View>
                            ) : null}

                            {/* Encryption note */}
                            <Text style={[s.passwordHint, { color: '#7A3448', marginTop: -4 }]}>🔒 All legal documents are AES-256 encrypted — only you can read this</Text>
                          </>
                        )
                      })()}
                    </>
                  ) : form.category === 'financial' ? (
                    /* ── Custom Financial form ── */
                    <>
                      {/* Type picker */}
                      <Text style={[s.fieldLabel, { color: '#7A3448' }]}>Account type *</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
                        {FINANCIAL_TYPES.map(ft => {
                          const selected = form.description === ft.key
                          return (
                            <TouchableOpacity
                              key={ft.key}
                              onPress={() => setForm(f => ({ ...f, description: ft.key }))}
                              activeOpacity={0.8}
                              style={{
                                flexDirection: 'row', alignItems: 'center', gap: 6,
                                paddingHorizontal: 14, paddingVertical: 9,
                                borderRadius: 20, borderWidth: 1.5,
                                backgroundColor: selected ? 'rgba(61,16,32,0.15)' : 'rgba(61,16,32,0.05)',
                                borderColor: selected ? '#3D1020' : 'rgba(61,16,32,0.2)',
                              }}>
                              <Text style={{ fontSize: 16 }}>{ft.icon}</Text>
                              <Text style={{ fontSize: 13, fontWeight: selected ? '700' : '500', color: selected ? '#3D1020' : '#7A3448' }}>{ft.key}</Text>
                            </TouchableOpacity>
                          )
                        })}
                      </View>

                      {/* Adaptive fields */}
                      {(() => {
                        const ft = FINANCIAL_TYPES.find(t => t.key === form.description) ?? FINANCIAL_TYPES[0]
                        return (
                          <>
                            <Text style={[s.fieldLabel, { color: '#7A3448' }]}>{ft.titleLabel}</Text>
                            <TextInput
                              style={[s.input, { backgroundColor: 'rgba(61,16,32,0.08)', borderColor: 'rgba(61,16,32,0.2)', color: '#3D1020' }]}
                              placeholder={ft.titlePlaceholder}
                              placeholderTextColor="rgba(61,16,32,0.35)"
                              value={form.title}
                              onChangeText={v => setForm(f => ({ ...f, title: v }))}
                            />

                            <Text style={[s.fieldLabel, { color: '#7A3448' }]}>{ft.institutionLabel} (optional)</Text>
                            <TextInput
                              style={[s.input, { backgroundColor: 'rgba(61,16,32,0.08)', borderColor: 'rgba(61,16,32,0.2)', color: '#3D1020' }]}
                              placeholder={`Enter ${ft.institutionLabel.toLowerCase()}`}
                              placeholderTextColor="rgba(61,16,32,0.35)"
                              value={form.username}
                              onChangeText={v => setForm(f => ({ ...f, username: v }))}
                            />

                            <Text style={[s.fieldLabel, { color: '#7A3448' }]}>{ft.accountLabel} (optional)</Text>
                            <TextInput
                              style={[s.input, { backgroundColor: 'rgba(61,16,32,0.08)', borderColor: 'rgba(61,16,32,0.2)', color: '#3D1020' }]}
                              placeholder={`Enter ${ft.accountLabel.toLowerCase()}`}
                              placeholderTextColor="rgba(61,16,32,0.35)"
                              value={form.password}
                              onChangeText={v => setForm(f => ({ ...f, password: v }))}
                              autoCapitalize="none"
                              autoCorrect={false}
                            />

                            <Text style={[s.fieldLabel, { color: '#7A3448' }]}>Notes (optional)</Text>
                            <TextInput
                              style={[s.input, { height: 100, textAlignVertical: 'top', backgroundColor: 'rgba(61,16,32,0.08)', borderColor: 'rgba(61,16,32,0.2)', color: '#3D1020' }]}
                              placeholder={ft.notesPlaceholder}
                              placeholderTextColor="rgba(61,16,32,0.35)"
                              value={form.content}
                              onChangeText={v => setForm(f => ({ ...f, content: v }))}
                              multiline
                              numberOfLines={4}
                            />

                            {/* Scan statement / card with camera */}
                            <Text style={[s.fieldLabel, { color: '#7A3448', marginTop: 4 }]}>Scan statement or card (optional)</Text>
                            <Text style={{ fontSize: 13, color: '#7A3448', opacity: 0.75, marginBottom: 12, marginTop: -4 }}>
                              Take a photo of a statement, card, or letter to store alongside this record.
                            </Text>
                            <TouchableOpacity
                              onPress={handlePickFinancialScan}
                              activeOpacity={0.8}
                              style={{
                                flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                                gap: 8, paddingVertical: 14, borderRadius: 14, marginBottom: 14,
                                backgroundColor: 'rgba(61,16,32,0.12)', borderWidth: 1.5,
                                borderColor: 'rgba(61,16,32,0.25)',
                              }}>
                              <Text style={{ fontSize: 22 }}>📷</Text>
                              <Text style={{ fontSize: 15, fontWeight: '600', color: '#3D1020' }}>Scan with Camera</Text>
                            </TouchableOpacity>

                            {/* Scan preview */}
                            {financialScanUri ? (
                              <View style={{ marginBottom: 14, alignItems: 'flex-start' }}>
                                <View style={{ position: 'relative' }}>
                                  <Image
                                    source={{ uri: financialScanUri }}
                                    style={{ width: 140, height: 100, borderRadius: 10, borderWidth: 1.5, borderColor: 'rgba(61,16,32,0.2)' }}
                                    resizeMode="cover"
                                  />
                                  <TouchableOpacity
                                    onPress={() => { setFinancialScanUri(null); setPickedFile(null) }}
                                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                    accessibilityRole="button" accessibilityLabel="Remove scan"
                                    style={{
                                      position: 'absolute', top: -10, right: -10,
                                      backgroundColor: '#3D1020', borderRadius: 18,
                                      width: 36, height: 36, alignItems: 'center', justifyContent: 'center',
                                    }}>
                                    <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>✕</Text>
                                  </TouchableOpacity>
                                </View>
                                <Text style={{ fontSize: 12, color: '#7A3448', marginTop: 6, opacity: 0.7 }}>Scan will be saved with this record</Text>
                              </View>
                            ) : null}

                            {/* Encryption note */}
                            <Text style={[s.passwordHint, { color: '#7A3448', marginTop: -4 }]}>🔒 Account numbers and details are AES-256 encrypted — only you can read this</Text>
                          </>
                        )
                      })()}
                    </>
                  ) : form.category === 'digital_assets' ? (
                    /* ── Custom Passwords / Logins form ── */
                    <>
                      {/* Type picker */}
                      <Text style={[s.fieldLabel, { color: '#7A3448' }]}>Account type *</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
                        {DIGITAL_TYPES.map(dt => {
                          const selected = form.description === dt.key
                          return (
                            <TouchableOpacity
                              key={dt.key}
                              onPress={() => setForm(f => ({ ...f, description: dt.key }))}
                              activeOpacity={0.8}
                              style={{
                                flexDirection: 'row', alignItems: 'center', gap: 6,
                                paddingHorizontal: 14, paddingVertical: 9,
                                borderRadius: 20, borderWidth: 1.5,
                                backgroundColor: selected ? 'rgba(61,16,32,0.15)' : 'rgba(61,16,32,0.05)',
                                borderColor: selected ? '#3D1020' : 'rgba(61,16,32,0.2)',
                              }}>
                              <Text style={{ fontSize: 16 }}>{dt.icon}</Text>
                              <Text style={{ fontSize: 13, fontWeight: selected ? '700' : '500', color: selected ? '#3D1020' : '#7A3448' }}>{dt.key}</Text>
                            </TouchableOpacity>
                          )
                        })}
                      </View>

                      {/* Adaptive fields */}
                      {(() => {
                        const dt = DIGITAL_TYPES.find(t => t.key === form.description) ?? DIGITAL_TYPES[0]
                        return (
                          <>
                            {/* Service / platform name */}
                            <Text style={[s.fieldLabel, { color: '#7A3448' }]}>{dt.titleLabel}</Text>
                            <TextInput
                              style={[s.input, { backgroundColor: 'rgba(61,16,32,0.08)', borderColor: 'rgba(61,16,32,0.2)', color: '#3D1020' }]}
                              placeholder={dt.titlePlaceholder}
                              placeholderTextColor="rgba(61,16,32,0.35)"
                              value={form.title}
                              onChangeText={v => setForm(f => ({ ...f, title: v }))}
                            />

                            {/* Username / email */}
                            <Text style={[s.fieldLabel, { color: '#7A3448' }]}>{dt.userLabel} (optional)</Text>
                            <TextInput
                              style={[s.input, { backgroundColor: 'rgba(61,16,32,0.08)', borderColor: 'rgba(61,16,32,0.2)', color: '#3D1020' }]}
                              placeholder={dt.key === 'Device / PIN' ? 'e.g. johndoe or device name' : 'e.g. john@gmail.com'}
                              placeholderTextColor="rgba(61,16,32,0.35)"
                              value={form.username}
                              onChangeText={v => setForm(f => ({ ...f, username: v }))}
                              autoCapitalize="none"
                              autoCorrect={false}
                              keyboardType={dt.key === 'Device / PIN' ? 'default' : 'email-address'}
                            />

                            {/* Password / PIN — with show/hide toggle */}
                            <Text style={[s.fieldLabel, { color: '#7A3448' }]}>
                              {dt.key === 'Device / PIN' ? 'PIN / Passcode (optional)' : 'Password (optional)'}
                            </Text>
                            <View style={s.passwordRow}>
                              <TextInput
                                style={[s.input, { flex: 1, marginBottom: 0, backgroundColor: 'rgba(61,16,32,0.08)', borderColor: 'rgba(61,16,32,0.2)', color: '#3D1020' }]}
                                placeholder={dt.key === 'Device / PIN' ? 'e.g. 6-digit PIN or Face ID note' : 'Enter password'}
                                placeholderTextColor="rgba(61,16,32,0.35)"
                                value={form.password}
                                onChangeText={v => setForm(f => ({ ...f, password: v }))}
                                secureTextEntry={!showPassword}
                                autoCapitalize="none"
                                autoCorrect={false}
                              />
                              <TouchableOpacity
                                onPress={() => setShowPassword(p => !p)}
                                style={[s.passwordToggle, { backgroundColor: 'rgba(61,16,32,0.12)' }]}
                                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}>
                                <Text style={s.passwordToggleIcon}>{showPassword ? '🙈' : '👁️'}</Text>
                              </TouchableOpacity>
                            </View>

                            {/* Notes */}
                            <Text style={[s.fieldLabel, { color: '#7A3448' }]}>Notes (optional)</Text>
                            <TextInput
                              style={[s.input, { height: 100, textAlignVertical: 'top', backgroundColor: 'rgba(61,16,32,0.08)', borderColor: 'rgba(61,16,32,0.2)', color: '#3D1020' }]}
                              placeholder={dt.notesPlaceholder}
                              placeholderTextColor="rgba(61,16,32,0.35)"
                              value={form.content}
                              onChangeText={v => setForm(f => ({ ...f, content: v }))}
                              multiline
                              numberOfLines={4}
                            />

                            {/* Encryption note */}
                            <Text style={[s.passwordHint, { color: '#7A3448', marginTop: -4 }]}>🔒 Username and password are AES-256 encrypted — only you can read this</Text>
                          </>
                        )
                      })()}
                    </>
                  ) : (
                    /* ── Generic form for all other categories ── */
                    <>
                  <Text style={[s.fieldLabel, { color: '#7A3448' }]}>Title *</Text>
                  <TextInput style={[s.input, { backgroundColor: 'rgba(61,16,32,0.08)', borderColor: 'rgba(61,16,32,0.2)', color: '#3D1020' }]}
                    placeholder="e.g. My Will, Facebook Login" placeholderTextColor="rgba(61,16,32,0.35)"
                    value={form.title} onChangeText={v => setForm(f => ({ ...f, title: v }))} />

                  <Text style={[s.fieldLabel, { color: '#7A3448' }]}>Description (optional)</Text>
                  <TextInput style={[s.input, { backgroundColor: 'rgba(61,16,32,0.08)', borderColor: 'rgba(61,16,32,0.2)', color: '#3D1020' }]}
                    placeholder="Brief description" placeholderTextColor="rgba(61,16,32,0.35)"
                    value={form.description} onChangeText={v => setForm(f => ({ ...f, description: v }))} />

                  {form.category !== 'personal_messages' && form.category !== 'property' && (
                    <>
                      <Text style={[s.fieldLabel, { color: '#7A3448' }]}>Username / Email (optional)</Text>
                      <TextInput
                        style={[s.input, { backgroundColor: 'rgba(61,16,32,0.08)', borderColor: 'rgba(61,16,32,0.2)', color: '#3D1020' }]}
                        placeholder="e.g. john@email.com or username"
                        placeholderTextColor="rgba(61,16,32,0.35)"
                        value={form.username}
                        onChangeText={v => setForm(f => ({ ...f, username: v }))}
                        autoCapitalize="none"
                        autoCorrect={false}
                        keyboardType="email-address"
                      />

                      <Text style={[s.fieldLabel, { color: '#7A3448' }]}>Password / PIN (optional)</Text>
                      <View style={s.passwordRow}>
                        <TextInput
                          style={[s.input, { flex: 1, marginBottom: 0, backgroundColor: 'rgba(61,16,32,0.08)', borderColor: 'rgba(61,16,32,0.2)', color: '#3D1020' }]}
                          placeholder="Enter password or PIN"
                          placeholderTextColor="rgba(61,16,32,0.35)"
                          value={form.password}
                          onChangeText={v => setForm(f => ({ ...f, password: v }))}
                          secureTextEntry={!showPassword}
                          autoCapitalize="none"
                          autoCorrect={false}
                        />
                        <TouchableOpacity
                          onPress={() => setShowPassword(p => !p)}
                          style={[s.passwordToggle, { backgroundColor: 'rgba(61,16,32,0.12)' }]}
                          accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                        >
                          <Text style={s.passwordToggleIcon}>{showPassword ? '🙈' : '👁️'}</Text>
                        </TouchableOpacity>
                      </View>
                      <Text style={[s.passwordHint, { color: '#7A3448' }]}>🔒 AES-256 encrypted — only you can read this</Text>
                    </>
                  )}

                  <Text style={[s.fieldLabel, { color: '#7A3448' }]}>Notes / Content (optional)</Text>
                  <TextInput style={[s.input, { height: 100, textAlignVertical: 'top', backgroundColor: 'rgba(61,16,32,0.08)', borderColor: 'rgba(61,16,32,0.2)', color: '#3D1020' }]}
                    placeholder="Website address, app name, any helpful notes..." placeholderTextColor="rgba(61,16,32,0.35)"
                    value={form.content} onChangeText={v => setForm(f => ({ ...f, content: v }))} multiline numberOfLines={4} />
                    </>
                  )}

                  <Text style={[s.fieldLabel, { color: '#7A3448' }]}>{existingFile ? 'Current File' : 'Attach File (optional)'}</Text>
                  {existingFile ? (
                    <View style={[s.filePickerBtn, { borderStyle: 'solid', backgroundColor: 'rgba(61,16,32,0.08)', borderColor: 'rgba(61,16,32,0.2)' }]}>
                      <View style={s.filePickerContent}>
                        <Text style={s.filePickerIcon}>{fileIcon(existingFile.mimeType)}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={[s.filePickerName, { color: '#3D1020' }]} numberOfLines={1}>{existingFile.name}</Text>
                          <Text style={[s.filePickerSize, { color: '#7A3448' }]}>{formatBytes(existingFile.size)}</Text>
                        </View>
                        <TouchableOpacity onPress={() => setRemoveExistingFile(true)}
                          style={[s.removeFileBtn, { backgroundColor: 'rgba(61,16,32,0.12)', borderColor: 'rgba(61,16,32,0.25)' }]}>
                          <Text style={[s.removeFileBtnText, { color: '#3D1020' }]}>Remove</Text>
                        </TouchableOpacity>
                      </View>
                      <TouchableOpacity onPress={handlePickFile} style={[s.replaceFileLink, { borderTopColor: 'rgba(61,16,32,0.15)' }]}>
                        <Text style={[s.replaceFileLinkText, { color: '#7A3448' }]}>↑ Replace with a different file</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity onPress={handlePickFile}
                      style={[s.filePickerBtn, { backgroundColor: 'rgba(61,16,32,0.08)', borderColor: 'rgba(61,16,32,0.2)' }]}
                      activeOpacity={0.75}>
                      {pickedFile ? (
                        <View style={s.filePickerContent}>
                          <Text style={s.filePickerIcon}>{fileIcon(pickedFile.mimeType)}</Text>
                          <View style={{ flex: 1 }}>
                            <Text style={[s.filePickerName, { color: '#3D1020' }]} numberOfLines={1}>{pickedFile.name}</Text>
                            <Text style={[s.filePickerSize, { color: '#7A3448' }]}>{formatBytes(pickedFile.size)}</Text>
                          </View>
                          <TouchableOpacity onPress={() => setPickedFile(null)} style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ color: '#7A3448', fontSize: 16 }}>✕</Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <View style={s.filePickerContent}>
                          <Text style={s.filePickerIcon}>📎</Text>
                          <Text style={[s.filePickerPlaceholder, { color: 'rgba(61,16,32,0.45)' }]}>
                            {removeExistingFile ? 'File removed — tap to attach a new one' : 'Tap to attach a file'}
                          </Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  )}
                  {saveMsg ? <Text style={{ color: '#C0392B', fontSize: 14, marginBottom: 12 }}>{saveMsg}</Text> : null}
                  <TouchableOpacity onPress={handleSave} disabled={saving || uploading} activeOpacity={0.85} style={{ marginBottom: 8 }}>
                    <LinearGradient colors={PLUM} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.btnPrimary}>
                      {saving || uploading
                        ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <ActivityIndicator color="#fff" />
                            <Text style={[s.btnPrimaryText, { color: '#fff' }]}>{uploading ? 'Uploading file…' : 'Saving…'}</Text>
                          </View>
                        : <Text style={[s.btnPrimaryText, { color: '#fff' }]}>{editingItem ? 'Save Changes' : 'Save to Vault'}</Text>
                      }
                    </LinearGradient>
                  </TouchableOpacity>
                </ScrollView>
              </LinearGradient>
            </View>
            </TouchableOpacity>
          </KeyboardAvoidingView>
        </TouchableOpacity>
      </Modal>

      {/* Trusted Partners Modal (contextual from Legal/Financial categories) */}
      <ProfessionalServicesModal
        visible={showPartnersModal}
        onClose={() => setShowPartnersModal(false)}
      />

      {/* ── Who Can See What Modal ── */}
      <Modal visible={showAccessModal} animationType="slide" transparent onRequestClose={() => setShowAccessModal(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' }}>
          <LinearGradient colors={WARM} style={{ borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '88%' }}>

            <Text style={{ color: WM.title, fontSize: 20, fontWeight: '700' }}>Who Can See My Documents</Text>
            <Text style={{ color: WM.sub, fontSize: 14, marginTop: 4, marginBottom: 10, lineHeight: 20 }}>
              Your trusted contacts are already selected for each section. Tap a name
              to remove or add someone. If you remove everyone from a section, it stays
              sealed — no one will be able to see it.
            </Text>
            <View style={{ backgroundColor: WM.cardBgAlt, borderColor: WM.border, borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 14 }}>
              <Text style={{ color: WM.sub, fontSize: 12, lineHeight: 17 }}>
                This shares copies of your documents and information only. It does not
                give away money, property, or belongings, and it is not a legal will.
              </Text>
            </View>

            {accessLoading ? (
              <ActivityIndicator color={WM.accent} style={{ marginVertical: 30 }} />
            ) : accessMembers.length === 0 ? (
              <View style={{ backgroundColor: WM.cardBg, borderColor: WM.border, borderWidth: 1, borderRadius: 14, padding: 16, marginBottom: 14 }}>
                <Text style={{ color: WM.title, fontSize: 15, lineHeight: 22 }}>
                  Add family members first — then you can choose who receives each part of your vault.
                </Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={true} style={{ flexGrow: 0 }}>
                {VAULT_CATEGORIES.map(cat => {
                  const chosen = accessRules[cat.key] || []
                  return (
                    <View key={cat.key} style={{ backgroundColor: WM.cardBg, borderColor: WM.border, borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 12 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={{ fontSize: 24 }}>{cat.icon}</Text>
                        <Text style={{ color: WM.title, fontSize: 17, fontWeight: '700' }}>{cat.label}</Text>
                      </View>
                      <Text style={{
                        color: chosen.length === 0 ? '#C0392B' : WM.sub,
                        fontSize: 13, marginTop: 2, marginBottom: 10,
                        fontWeight: chosen.length === 0 ? '700' : '400',
                      }}>
                        {chosen.length === 0
                          ? '⚠️ Sealed — no one will be able to see this section'
                          : `${chosen.length} ${chosen.length === 1 ? 'person' : 'people'} will be able to see these documents`}
                      </Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        {accessMembers.map(m => {
                          const on = chosen.includes(m.id)
                          return (
                            <TouchableOpacity
                              key={m.id}
                              onPress={() => toggleAccess(cat.key, m.id)}
                              activeOpacity={0.8}
                              accessibilityRole="button"
                              accessibilityLabel={`${on ? 'Remove' : 'Give'} ${m.name} access to ${cat.label}`}
                              style={{
                                minHeight: 48, justifyContent: 'center',
                                paddingHorizontal: 16, paddingVertical: 10,
                                borderRadius: 24, borderWidth: 2,
                                backgroundColor: on ? WM.accentBg : WM.cardBgAlt,
                                borderColor: on ? WM.accent : WM.border,
                              }}>
                              <Text style={{ color: WM.title, fontSize: 16, fontWeight: on ? '700' : '500' }}>
                                {on ? '✓ ' : ''}{m.name}
                              </Text>
                            </TouchableOpacity>
                          )
                        })}
                      </View>
                    </View>
                  )
                })}
              </ScrollView>
            )}

            {accessMsg ? <Text style={{ color: '#C0392B', fontSize: 14, marginTop: 8 }}>{accessMsg}</Text> : null}

            {accessMembers.length > 0 && !accessLoading && (
              <TouchableOpacity onPress={saveAccessRules} disabled={savingAccess} activeOpacity={0.85} style={{ marginTop: 12 }}>
                <View style={{ backgroundColor: WM.accent, borderRadius: 14, padding: 16, alignItems: 'center', minHeight: 52, justifyContent: 'center' }}>
                  {savingAccess
                    ? <ActivityIndicator color={WM.title} />
                    : <Text style={{ color: WM.title, fontSize: 17, fontWeight: '700' }}>Save</Text>}
                </View>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => setShowAccessModal(false)} activeOpacity={0.85} style={{ marginTop: 10, marginBottom: 6 }}>
              <View style={{ backgroundColor: WM.cardBg, borderColor: WM.border, borderWidth: 1, borderRadius: 14, padding: 16, alignItems: 'center', minHeight: 52, justifyContent: 'center' }}>
                <Text style={{ color: WM.title, fontSize: 17 }}>Cancel</Text>
              </View>
            </TouchableOpacity>

          </LinearGradient>
        </View>
      </Modal>

      {/* ── Media Lightbox ── */}
      <Modal visible={!!viewingMedia} transparent animationType="fade" onRequestClose={() => setViewingMedia(null)}>
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <View style={{
            paddingTop: Platform.OS === 'ios' ? 56 : 24,
            paddingHorizontal: 20, paddingBottom: 12,
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            backgroundColor: 'rgba(0,0,0,0.5)',
          }}>
            <Text style={{ color: '#fff', fontSize: 14, flex: 1, marginRight: 12 }} numberOfLines={1}>
              {viewingMedia?.item.title}
            </Text>
            <TouchableOpacity onPress={() => setViewingMedia(null)} style={{ padding: 8 }}>
              <Text style={{ color: '#fff', fontSize: 20 }}>✕</Text>
            </TouchableOpacity>
          </View>
          <Image
            source={{ uri: viewingMedia?.url ?? '' }}
            style={{ flex: 1, width: '100%' }}
            resizeMode="contain"
          />
          <View style={{
            flexDirection: 'row', justifyContent: 'center',
            paddingVertical: 16, paddingBottom: Platform.OS === 'ios' ? 36 : 16,
            borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.15)',
            backgroundColor: 'rgba(0,0,0,0.7)',
          }}>
            <TouchableOpacity
              onPress={() => { setConfirmDelete(viewingMedia?.item); setViewingMedia(null) }}
              style={{ alignItems: 'center', paddingHorizontal: 40 }}
              accessibilityLabel="Delete photo" accessibilityRole="button">
              <Text style={{ fontSize: 26 }}>🗑️</Text>
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 4 }}>Delete</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Delete Confirmation */}
      <Modal visible={!!confirmDelete} transparent animationType="fade" onRequestClose={() => setConfirmDelete(null)}>
        <TouchableOpacity style={s.confirmOverlay} activeOpacity={1} onPress={() => setConfirmDelete(null)}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
          <View style={s.confirmBox}>
            <LinearGradient colors={WARM} style={s.confirmInner}>
              <Text style={s.confirmIcon}>🗑️</Text>
              <Text style={[s.confirmTitle, { color: WM.title }]}>Delete Item?</Text>
              <Text style={[s.confirmBody, { color: WM.sub }]}>
                "{confirmDelete?.title}" will be permanently deleted
                {confirmDelete?.file_name ? ', including the attached file' : ''}.{'\n'}This cannot be undone.
              </Text>
              <View style={s.confirmActions}>
                <TouchableOpacity
                  style={[s.confirmCancel, { borderColor: WM.border, backgroundColor: WM.cardBg }]}
                  onPress={() => setConfirmDelete(null)}>
                  <Text style={[s.confirmCancelText, { color: WM.title }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.confirmDelete, { backgroundColor: '#F06292', borderColor: 'rgba(255,255,255,0.5)' }]}
                  onPress={handleDeleteItem} disabled={deleting}>
                  {deleting ? <ActivityIndicator color={WM.title} /> : <Text style={[s.confirmDeleteText, { color: WM.title }]}>Delete</Text>}
                </TouchableOpacity>
              </View>
            </LinearGradient>
          </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </ScreenWrap>
  )
}
