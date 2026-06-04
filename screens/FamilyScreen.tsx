import { useState, useEffect } from 'react'
import { useNavigation } from '@react-navigation/native'
import { Text, View, TouchableOpacity, TextInput, ActivityIndicator,
  ScrollView, FlatList, Modal, KeyboardAvoidingView, Platform, Image,
  Alert, Linking } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import * as ImagePicker from 'expo-image-picker'
import * as FileSystem from 'expo-file-system/legacy'
import * as Contacts from 'expo-contacts'
import { supabase } from '../lib/supabase'
import { C, WARM, WM, PLUM, SUPABASE_URL, SUPABASE_ANON_KEY } from '../lib/constants'
import { OCCASIONS_MAP, getSuggestedOccasionKeys } from '../lib/occasions'
import { s } from '../lib/styles'
import ScreenWrap from '../components/ScreenWrap'
import { CalendarPicker } from '../components/CalendarPicker'
import { refreshEmergencyNotification } from '../lib/emergencyNotification'

// ─────────────────────────────────────────────────────────────────────────────
const RELATIONSHIPS = ['Husband', 'Wife', 'Partner', 'Child', 'Mother', 'Father', 'Brother', 'Sister', 'Friend', 'Other']

// Maps G1's label FOR G2 → the standard label G2 should see for G1.
// E.g. G1 called G2 "Husband" → G2 (husband) sees G1 as "Wife"
//      G1 called G2 "Mother"  → G2 sees G1 as "Child"
//      G1 called G2 "Child"   → G2 sees G1 as "Parent" (gender unknown)
// Returns null for unknown labels so no badge is shown rather than something confusing.
function getReciprocalLabel(label: string | null): string | null {
  if (!label) return null
  switch (label.toLowerCase().trim()) {
    case 'husband':
      return 'Wife'
    case 'wife':
      return 'Husband'
    case 'partner': case 'life partner':
      return 'Partner'
    case 'spouse':   // legacy — keep working for existing DB rows
      return 'Spouse'
    case 'child': case 'son': case 'daughter': case 'kid':
    case 'stepchild': case 'stepson': case 'stepdaughter':
      return 'Parent'
    case 'mother': case 'mom': case 'mum': case 'mama':
    case 'stepmother': case 'stepmom':
      return 'Child'
    case 'father': case 'dad': case 'papa':
    case 'stepfather': case 'stepdad':
      return 'Child'
    case 'parent':   // legacy — keep working for existing DB rows
      return 'Child'
    case 'brother': case 'bro': case 'stepbrother':
      return 'Sibling'
    case 'sister': case 'sis': case 'stepsister':
      return 'Sibling'
    case 'sibling':  // legacy — keep working for existing DB rows
      return 'Sibling'
    case 'friend': case 'best friend': case 'bestfriend': case 'bff':
      return 'Friend'
    case 'other':
      return 'Other'
    default:
      return null
  }
}

const MONTHS_LONG  = ['January','February','March','April','May','June',
                      'July','August','September','October','November','December']
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

const AVATAR_COLORS = [C.accent, C.amberLight, C.success, '#9B7FD4', '#D47F7F', '#7FA8D4']
function avatarColor(name: string) {
  let hash = 0
  for (const ch of name) hash = ch.charCodeAt(0) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

function formatDateObj(d: { month: number; day: number; year: number }) {
  return `${MONTHS_LONG[d.month - 1]} ${d.day}, ${d.year}`
}

function parseDateStr(dateStr: string | null): { month: number; day: number; year: number } | null {
  if (!dateStr) return null
  // Format: "March 15, 1958"
  const parts = dateStr.split(' ')
  if (parts.length < 3) return null
  const month = MONTHS_LONG.indexOf(parts[0]) + 1
  const day   = parseInt(parts[1].replace(',', ''), 10)
  const year  = parseInt(parts[2], 10)
  if (!month || isNaN(day) || isNaN(year)) return null
  return { month, day, year }
}

// ── Standalone avatar — defined outside component so React never remounts it ──
// fillHeight mode: a tall rectangular photo strip flush with the card edges (like
// iOS Contacts). Much more readable for seniors — face fills the entire left side.
// Circular mode: used in the Add Member modal preview where a small fixed size is fine.
function MemberAvatar({
  member, photoUrl, size = 46, fillHeight = false, onPress,
}: { member: any; photoUrl?: string | null; size?: number; fillHeight?: boolean; onPress: () => void }) {
  const color = avatarColor(member.name)
  const [imgError, setImgError] = useState(false)

  useEffect(() => { setImgError(false) }, [photoUrl])

  const showImage = !!photoUrl && !imgError

  if (fillHeight) {
    // ── Full-height strip mode ────────────────────────────────────────────────
    // The parent row must have padding:0 + overflow:'hidden' so this fills edge-to-edge.
    // Width is fixed at 130pt; minHeight on the parent card ensures portrait proportions.
    const W = 130
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.8}
        style={{ width: W, alignSelf: 'stretch' }}
        accessibilityLabel={`Change photo for ${member.name}`}
        accessibilityRole="button">
        {showImage ? (
          <Image
            key={photoUrl}
            source={{ uri: photoUrl }}
            style={{ width: W, flex: 1 }}
            resizeMode="cover"
            onError={() => {
              console.warn('MemberAvatar image failed to load:', photoUrl)
              setImgError(true)
            }}
          />
        ) : (
          <View style={{
            width: W, flex: 1,
            backgroundColor: color + '44',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Text style={{ fontSize: 40, fontWeight: '800', color }}>
              {member.name.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
        {/* Camera badge — clearly tappable, large enough for seniors */}
        <View style={{
          position: 'absolute', bottom: 10, right: 8,
          width: 32, height: 32, borderRadius: 16,
          backgroundColor: C.bg2 + 'ee',
          borderWidth: 1.5, borderColor: C.greyDim + '88',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Text style={{ fontSize: 16 }}>📷</Text>
        </View>
      </TouchableOpacity>
    )
  }

  // ── Circular mode (modal preview, etc.) ──────────────────────────────────
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8}
      style={{ width: size, height: size }}>
      {showImage ? (
        <Image
          key={photoUrl}
          source={{ uri: photoUrl }}
          style={{ width: size, height: size, borderRadius: size / 2,
            borderWidth: 2, borderColor: color + '88' }}
          resizeMode="cover"
          onError={() => {
            console.warn('MemberAvatar image failed to load:', photoUrl)
            setImgError(true)
          }}
        />
      ) : (
        <View style={{
          width: size, height: size, borderRadius: size / 2,
          backgroundColor: color + '33', borderWidth: 2, borderColor: color + '88',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Text style={{ fontSize: Math.round(size * 0.42), fontWeight: '700', color }}>
            {member.name.charAt(0).toUpperCase()}
          </Text>
        </View>
      )}
      <View style={{
        position: 'absolute', bottom: 0, right: 0,
        width: 18, height: 18, borderRadius: 9, backgroundColor: C.bg2,
        borderWidth: 1, borderColor: C.greyDim + '55',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Text style={{ fontSize: 9 }}>📷</Text>
      </View>
    </TouchableOpacity>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CalendarPicker is imported from ../components/CalendarPicker (shared with MemoriesScreen)
// ─────────────────────────────────────────────────────────────────────────────
const CURRENT_YEAR = new Date().getFullYear()

function defaultDob() { return { month: 1, day: 1, year: 1970 } }
function defaultAnniv() { return { month: 6, day: 1, year: 2000 } }

export default function FamilyScreen() {
  const navigation = useNavigation<any>()

  const [members, setMembers]         = useState<any[]>([])
  const [loading, setLoading]         = useState(true)
  const [viewingMemberMemoryCount, setViewingMemberMemoryCount] = useState<number | null>(null)

  // ── G1 senders — people who have added *this* user as a family member ──────
  const [senders, setSenders]         = useState<{
    familyMemberId:    string
    senderName:        string
    relationshipLabel: string | null
    avatarStoragePath: string | null   // profiles.avatar_url (storage path or full URL)
    senderEmail:       string | null
  }[]>([])
  // Resolved photo URIs for G1 sender avatars, keyed by familyMemberId
  const [senderPhotoUrls, setSenderPhotoUrls] = useState<Record<string, string>>({})
  // Tapped sender card — drives the detail bottom sheet
  const [selectedSender, setSelectedSender] = useState<{
    familyMemberId:    string
    senderName:        string
    relationshipLabel: string | null
    photoUrl:          string | null
    senderEmail:       string | null
  } | null>(null)

  const [viewingMember, setViewingMember] = useState<any | null>(null)
  const [showModal, setShowModal]     = useState(false)
  const [form, setForm]               = useState({
    name: '', email: '', phone: '', relationship: '', relationship_label: '', trusted: false,
  })
  const [editingMember, setEditingMember] = useState<any | null>(null)
  const [saving, setSaving]           = useState(false)
  const [saveMsg, setSaveMsg]         = useState('')
  const [confirmDelete, setConfirmDelete] = useState<any>(null)
  const [deleting, setDeleting]       = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [resendingId, setResendingId] = useState<string | null>(null)
  const [emergencyInEdit, setEmergencyInEdit] = useState(false)

  // ── Occasion suggestion state ──────────────────────────────────────────────
  const [showOccasionSuggest, setShowOccasionSuggest]   = useState(false)
  const [suggestMember, setSuggestMember]               = useState<{ name: string; relationship: string; isUpdate?: boolean } | null>(null)
  const [originalRelationship, setOriginalRelationship] = useState('')
  const [suggestAllKeys, setSuggestAllKeys]             = useState<string[]>([])
  const [suggestSelections, setSuggestSelections]       = useState<Set<string>>(new Set())
  const [suggestSaving, setSuggestSaving]               = useState(false)
  const [userOccasionKeys, setUserOccasionKeys]         = useState<string[]>([])
  const [showSuggestions, setShowSuggestions]           = useState(true)
  const [pendingSeed, setPendingSeed]                   = useState<Record<string, string>>({})

  // ── Medical ID guide ──────────────────────────────────────────────────────
  const [showMedicalIdGuide, setShowMedicalIdGuide] = useState(false)

  // ── Date picker state ──────────────────────────────────────────────────────
  const [showDobPicker, setShowDobPicker]     = useState(false)
  const [dobDate, setDobDate]                 = useState(defaultDob())
  const [hasDob, setHasDob]                   = useState(false)      // whether the user set a DOB
  const [showAnnivPicker, setShowAnnivPicker] = useState(false)
  const [annivDate, setAnnivDate]             = useState(defaultAnniv())
  const [hasAnniv, setHasAnniv]               = useState(false)

  // ── Photo state ────────────────────────────────────────────────────────────
  const [photoUri, setPhotoUri]                   = useState<string | null>(null)
  const [photoChanged, setPhotoChanged]           = useState(false)
  const [uploadingPhoto, setUploadingPhoto]       = useState(false)
  const [photoError, setPhotoError]               = useState('')
  // memberId → local URI or signed URL (local URI shown immediately for instant feedback)
  const [memberPhotoUrls, setMemberPhotoUrls]     = useState<Record<string, string>>({})
  // IDs of family members who are actively sending moments back to G1
  const [sendingBackIds, setSendingBackIds]       = useState<Set<string>>(new Set())

  useEffect(() => { loadMembers(); loadUserData(); loadSenders() }, [])

  useEffect(() => {
    if (!viewingMember) { setViewingMemberMemoryCount(null); return }
    supabase
      .from('scheduled_deliveries')
      .select('id', { count: 'exact', head: true })
      .eq('family_member_id', viewingMember.id)
      .then(({ count }) => setViewingMemberMemoryCount(count ?? 0))
  }, [viewingMember?.id])

  // ── Load G1 senders who have added this user as a family member ─────────
  async function loadSenders() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Step 1 — family_members rows where I am the linked recipient
      const { data: myRows, error } = await supabase
        .from('family_members')
        .select('id, user_id, relationship_label')
        .eq('recipient_profile_id', user.id)

      if (error || !myRows || myRows.length === 0) return

      // Step 1b — find profile IDs this user MANUALLY added as their own family member.
      // When G2 becomes "both" they create a row pointing at G1, which would make
      // G1 appear twice on G1's screen (once as G1's own member, once in "Connected with").
      // Only count manually-invited rows (email IS NOT NULL) — auto-created reciprocal
      // rows (email IS NULL) must not count, otherwise G2 running this same function
      // would incorrectly filter out G1 from their own "Connected with" section.
      const { data: myOwnRows } = await supabase
        .from('family_members')
        .select('recipient_profile_id')
        .eq('user_id', user.id)
        .not('recipient_profile_id', 'is', null)
        .not('email', 'is', null)

      const alreadyAddedByMe = new Set(
        (myOwnRows ?? []).map((r: any) => r.recipient_profile_id as string)
      )

      // Filter out senders G1 already knows as their own family member
      const filteredRows = myRows.filter((row: any) => !alreadyAddedByMe.has(row.user_id))
      if (filteredRows.length === 0) return

      const senderIds = filteredRows.map((r: any) => r.user_id)

      // Step 2 — sender names, avatar_url, and email from profiles
      const { data: profileRows } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url, email')
        .in('id', senderIds)

      const profileMap: Record<string, { name: string; avatarUrl: string | null; email: string | null }> = {}
      for (const p of profileRows ?? []) {
        profileMap[p.id] = {
          name:      p.full_name ?? 'Someone who loves you',
          avatarUrl: p.avatar_url ?? null,
          email:     p.email ?? null,
        }
      }

      const cards = filteredRows.map((row: any) => ({
        familyMemberId:    row.id,
        senderName:        profileMap[row.user_id]?.name ?? 'Someone who loves you',
        relationshipLabel: row.relationship_label ?? null,
        avatarStoragePath: profileMap[row.user_id]?.avatarUrl ?? null,
        senderEmail:       profileMap[row.user_id]?.email ?? null,
      }))
      setSenders(cards)

      // Step 3 — resolve signed URLs for sender avatars
      const urlMap: Record<string, string> = {}
      await Promise.all(cards.map(async (card) => {
        if (!card.avatarStoragePath) return
        if (card.avatarStoragePath.startsWith('http')) {
          urlMap[card.familyMemberId] = card.avatarStoragePath
        } else {
          const { data: signed } = await supabase.storage
            .from('memories')
            .createSignedUrl(card.avatarStoragePath, 3600)
          if (signed?.signedUrl) urlMap[card.familyMemberId] = signed.signedUrl
        }
      }))
      setSenderPhotoUrls(urlMap)
    } catch (e) {
      console.warn('FamilyScreen loadSenders error:', e)
    }
  }

  // seedUris: already-resolved local paths that must NOT be overwritten by CDN re-download.
  // Used after a fresh upload so the known-good local file path survives the reload.
  async function loadMembers(seedUris: Record<string, string> = {}) {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data } = await supabase.from('family_members').select('*')
      .eq('user_id', user.id).order('created_at', { ascending: false })
    // Exclude auto-created reciprocal rows — these are rows created by
    // loadFamilyMembersWithPhotos so G2 can send memories to G1 via the
    // Deliver To picker. Auto rows have email IS NULL AND no relationship_label.
    // Manually added contacts (via Family tab or onboarding Bridge) always have
    // a relationship_label, so they show even when added without an email address.
    const list = (data || []).filter(
      (m: any) => m.email !== null || m.relationship_label
    )
    setMembers(list)

    // ── Cross-populate G2 profile data into G1's member cards ────────────
    // For any member who has accepted the invite (recipient_profile_id is set),
    // fetch their profile avatar and check if they're sending moments back to G1.
    const connectedMembers = list.filter((m: any) => m.recipient_profile_id)
    const connectedProfileIds = connectedMembers.map((m: any) => m.recipient_profile_id as string)
    let profileAvatarMap: Record<string, string | null> = {}
    const newSendingBackIds = new Set<string>()

    if (connectedProfileIds.length > 0) {
      const [{ data: profileRows }, { data: reciprocalRows }] = await Promise.all([
        // G2's own profile avatar
        supabase.from('profiles').select('id, avatar_url').in('id', connectedProfileIds),
        // Rows where G2 is the sender and G1 is the recipient (G2 sending moments back)
        supabase.from('family_members')
          .select('user_id')
          .in('user_id', connectedProfileIds)
          .eq('recipient_profile_id', user.id),
      ])

      for (const p of profileRows ?? []) {
        profileAvatarMap[p.id] = p.avatar_url ?? null
      }

      const sendingBackProfileIds = new Set((reciprocalRows ?? []).map((r: any) => r.user_id as string))
      for (const m of connectedMembers) {
        if (sendingBackProfileIds.has(m.recipient_profile_id)) newSendingBackIds.add(m.id)
      }
    }
    setSendingBackIds(newSendingBackIds)

    // Start from the seed — skip CDN download for any member already in it
    const urlMap: Record<string, string> = { ...seedUris }
    await Promise.all(
      list
        .filter((m: any) => !seedUris[m.id])
        .map(async (m: any) => {
          if (m.photo_url) {
            // G1 explicitly uploaded a photo — prefer it
            const localUri = await resolvePhotoUri(m.photo_url, m.id)
            if (localUri) urlMap[m.id] = localUri
          } else if (m.recipient_profile_id && profileAvatarMap[m.recipient_profile_id]) {
            // No G1 upload — fall back to G2's own profile photo
            const avatarPath = profileAvatarMap[m.recipient_profile_id]!
            const localUri = await resolvePhotoUri(avatarPath, `profile_${m.recipient_profile_id}`)
            if (localUri) urlMap[m.id] = localUri
          }
        })
    )
    // Merge rather than replace — preserves any URLs set while this was in flight
    setMemberPhotoUrls(prev => ({ ...prev, ...urlMap }))
    setLoading(false)
  }

  // ── Load user occasions + suggestion toggle ────────────────────────────────
  async function loadUserData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const [{ data: occ }, { data: profile }] = await Promise.all([
      supabase.from('user_occasions').select('occasion_key').eq('user_id', user.id),
      supabase.from('profiles').select('show_occasion_suggestions').eq('id', user.id).single(),
    ])
    setUserOccasionKeys(occ?.map((r: any) => r.occasion_key) || [])
    setShowSuggestions(profile?.show_occasion_suggestions ?? true)
  }

  // ── Resolve a storage path to a displayable URI ──────────────────────────
  // On iOS, the Supabase CDN returns HTTP 200 with a small JSON error body
  // instead of the actual image bytes — FileSystem.downloadAsync can't tell the
  // difference. Fix: bypass the CDN entirely and use supabase.storage.download()
  // which goes through the authenticated API and always returns the real file.
  // The result is written to the local cache as base64 so Image can read it.
  // Cache is shared with MemoriesScreen (same filename), so whichever screen
  // loads first warms the cache for the other.
  async function resolvePhotoUri(
    storagePath: string, memberId: string, forceRefresh = false,
  ): Promise<string | null> {
    if (!storagePath) return null
    if (Platform.OS === 'web') {
      const { data } = await supabase.storage.from('memories').createSignedUrl(storagePath, 3600)
      return data?.signedUrl || null
    }
    try {
      // documentDirectory is never purged by the OS — photos persist across restarts
      const photosDir = FileSystem.documentDirectory + 'member_photos/'
      await FileSystem.makeDirectoryAsync(photosDir, { intermediates: true }).catch(() => {})
      const cachedPath = photosDir + `member_photo_${memberId}.jpg`
      if (!forceRefresh) {
        const existing = await FileSystem.getInfoAsync(cachedPath)
        if (existing.exists) return cachedPath
      }
      // Authenticated download — bypasses CDN, returns real image bytes.
      const { data: blob, error } = await supabase.storage.from('memories').download(storagePath)
      if (error || !blob || blob.size === 0) {
        console.warn('resolvePhotoUri download failed:', error?.message, 'size:', blob?.size)
        return null
      }
      // React Native's Blob does NOT implement .arrayBuffer() — use FileReader
      // (.readAsDataURL) which IS polyfilled in RN and works with RN Blobs.
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
          // result is "data:<mime>;base64,<data>" — we only want the data part
          const dataUrl = reader.result as string
          resolve(dataUrl.split(',')[1] ?? '')
        }
        reader.onerror = () => reject(new Error('FileReader failed'))
        reader.readAsDataURL(blob)
      })
      if (!base64) return null
      await FileSystem.writeAsStringAsync(cachedPath, base64, {
        encoding: FileSystem.EncodingType.Base64,
      })
      return cachedPath
    } catch (e: any) {
      console.warn('resolvePhotoUri failed:', e.message)
      return null
    }
  }

  // ── Image picker ───────────────────────────────────────────────────────────
  async function pickPhoto(): Promise<string | null> {
    if (Platform.OS !== 'web') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (status !== 'granted') return null
    }
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.75,
      } as any)
      if (!result.canceled && result.assets?.[0]) return result.assets[0].uri
    } catch (e: any) { console.warn('pickPhoto error:', e.message) }
    return null
  }

  // ── Storage upload — path starts with userId to match bucket policy ────────
  // On iOS, expo-image-picker URIs are ephemeral temp files. fetch() on them
  // can silently produce an empty blob. Fix: copy to cache dir first.
  // Returns { storagePath, localPath } so callers can show the local copy
  // directly on iOS without going back through the CDN (which fails on iOS).
  async function uploadPhoto(
    userId: string, memberId: string, uri: string,
  ): Promise<{ storagePath: string; localPath: string } | null> {
    try {
      let localPath = uri
      if (Platform.OS !== 'web') {
        // Copy to a stable local path for immediate display
        const cachedPath = FileSystem.cacheDirectory + `family_photo_${memberId}_${Date.now()}.jpg`
        await FileSystem.copyAsync({ from: uri, to: cachedPath })
        localPath = cachedPath
      }

      const storagePath = `${userId}/family-photos/${memberId}.jpg`

      if (Platform.OS === 'web') {
        // Web: SDK blob upload works correctly
        const response = await fetch(uri)
        const blob = await response.blob()
        if (blob.size === 0) { setPhotoError('Could not read photo.'); return null }
        const { error } = await supabase.storage.from('memories')
          .upload(storagePath, blob, { contentType: 'image/jpeg', upsert: true })
        if (error) { setPhotoError('Upload failed: ' + error.message); return null }
      } else {
        // iOS/Android: FormData with URI reference — the only reliable upload method.
        // fetch().blob() silently produces empty blobs on iOS file:// URIs causing
        // the SDK upload to store a 0-byte file despite returning success.
        const formData = new FormData()
        formData.append('file', { uri: localPath, name: 'photo.jpg', type: 'image/jpeg' } as any)
        const { data: sessionData } = await supabase.auth.getSession()
        const token = sessionData.session?.access_token || ''
        const res = await fetch(
          `${SUPABASE_URL}/storage/v1/object/memories/${storagePath}`,
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
        if (!res.ok) {
          const errText = await res.text()
          console.warn('uploadPhoto failed:', res.status, errText)
          setPhotoError('Upload failed')
          return null
        }
      }

      return { storagePath, localPath }
    } catch (e: any) {
      console.warn('uploadPhoto exception:', e.message)
      setPhotoError('Upload error: ' + e.message)
      return null
    }
  }

  // ── Tap existing member avatar to change photo ─────────────────────────────
  async function handleChangePhoto(member: any) {
    setPhotoError('')
    const uri = await pickPhoto()
    if (!uri) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Show the raw picker URI immediately for instant feedback
    setMemberPhotoUrls(prev => ({ ...prev, [member.id]: uri }))
    setUploadingPhoto(true)

    const result = await uploadPhoto(user.id, member.id, uri)
    if (result) {
      await supabase.from('family_members').update({ photo_url: result.storagePath }).eq('id', member.id)
      // On iOS: the local cached copy we already have is perfect — skip the CDN entirely.
      // On web: the signed URL works fine.
      if (Platform.OS !== 'web') {
        setMemberPhotoUrls(prev => ({ ...prev, [member.id]: result.localPath }))
      } else {
        const { data: sd } = await supabase.storage.from('memories').createSignedUrl(result.storagePath, 3600)
        if (sd?.signedUrl) {
          setMemberPhotoUrls(prev => ({ ...prev, [member.id]: sd.signedUrl }))
        }
      }
    } else {
      // Upload failed — clear and reload from DB
      setMemberPhotoUrls(prev => {
        const next = { ...prev }
        delete next[member.id]
        return next
      })
      await loadMembers()
    }
    setUploadingPhoto(false)
  }

  // ── Open edit modal pre-filled with existing member data ──────────────────
  function handleEditMember(member: any) {
    setEditingMember(member)
    // Normalize to the canonical pill label — older rows (e.g. from onboarding)
    // stored lowercase ("wife"), which wouldn't match the "Wife" pill.
    const relRaw = member.relationship || ''
    const rel = RELATIONSHIPS.find(r => r.toLowerCase() === relRaw.toLowerCase()) || relRaw
    setOriginalRelationship(rel)
    setForm({
      name:               member.name               || '',
      email:              member.email              || '',
      phone:              member.phone              || '',
      relationship:       rel,
      relationship_label: member.relationship_label || '',
      trusted:            member.is_trusted_contact || false,
    })
    const dob = parseDateStr(member.date_of_birth)
    if (dob) { setHasDob(true); setDobDate(dob) }
    else      { setHasDob(false); setDobDate(defaultDob()) }

    const anniv = parseDateStr(member.anniversary)
    if (anniv) { setHasAnniv(true); setAnnivDate(anniv) }
    else        { setHasAnniv(false); setAnnivDate(defaultAnniv()) }

    setEmergencyInEdit(member.is_emergency_contact || false)
    setPhotoUri(memberPhotoUrls[member.id] || null)
    setPhotoChanged(false)
    setPhotoError('')
    setSaveMsg('')
    setShowModal(true)
  }

  // ── Save new member ────────────────────────────────────────────────────────
  async function handleInvite() {
    if (!form.name.trim())         { setSaveMsg('Please enter a name.'); return }
    if (!form.email.trim())        { setSaveMsg('Please enter an email.'); return }
    if (!form.relationship.trim()) { setSaveMsg('Please select a relationship.'); return }
    setSaving(true); setSaveMsg('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaveMsg('Not signed in.'); setSaving(false); return }

    const sharedFields = {
      name:               form.name.trim(),
      email:              form.email.trim().toLowerCase(),
      phone:              form.phone.trim() || null,
      relationship:       form.relationship,
      relationship_label: form.relationship_label.trim() || null,
      is_trusted_contact: form.trusted,
      date_of_birth:      hasDob ? formatDateObj(dobDate) : null,
      anniversary:        ['Husband', 'Wife', 'Partner', 'Spouse'].includes(form.relationship) && hasAnniv ? formatDateObj(annivDate) : null,
    }

    let targetId: string | null = null

    if (editingMember) {
      // ── UPDATE existing member ──────────────────────────────
      const wasAlreadyTrusted = editingMember.is_trusted_contact === true
      const nowTrusted        = form.trusted === true
      const newEmail          = form.email.trim().toLowerCase()
      // Member previously had no email (e.g. added during onboarding by phone) —
      // consent could never be requested. Kick off the flow now that we have one.
      const emailJustAdded    = !editingMember.email && !!newEmail
      const needsConsentKickoff =
        (!wasAlreadyTrusted && nowTrusted) ||
        (emailJustAdded
          && (nowTrusted || editingMember.is_emergency_contact)
          && (editingMember.emergency_consent_status ?? 'none') === 'none')

      const updatePayload: any = { ...sharedFields }
      if (needsConsentKickoff) {
        updatePayload.emergency_consent_status = 'pending'
      }
      // If trusted contact is being turned OFF, clear consent status
      if (wasAlreadyTrusted && !nowTrusted) {
        updatePayload.emergency_consent_status = 'none'
      }

      const { error } = await supabase
        .from('family_members')
        .update(updatePayload)
        .eq('id', editingMember.id)

      if (error) {
        setSaveMsg(error.code === '23505' ? 'That email belongs to another member.' : 'Error: ' + error.message)
        setSaving(false); return
      }
      targetId = editingMember.id

      // Fire consent email when the role was just enabled OR an email was just
      // added for a member already holding the role (uses the NEW email — the
      // old editingMember.email may be stale or null)
      if (needsConsentKickoff && newEmail) {
        supabase.functions.invoke('send-emergency-contact-email', {
          body: { family_member_id: targetId, is_new_member: false },
        }).then(({ error: fnErr }) => {
          if (fnErr) console.warn('Emergency consent email failed:', fnErr.message)
          else console.log('Emergency consent email sent to', newEmail)
        })
      }

    } else {
      // ── INSERT new member ───────────────────────────────────
      const { data: inserted, error } = await supabase
        .from('family_members')
        .insert({ user_id: user.id, ...sharedFields })
        .select().single()

      if (error) {
        setSaveMsg(error.code === '23505' ? 'This email is already invited.' : 'Error: ' + error.message)
        setSaving(false); return
      }
      targetId = inserted?.id ?? null

      // Fire invite email only for new members (non-blocking)
      if (targetId) {
        supabase.functions.invoke('send-family-invite', {
          body: { family_member_id: targetId },
        }).then(({ error: fnErr }) => {
          if (fnErr) console.warn('Invite email failed:', fnErr.message)
          else console.log('Invite email sent to', form.email.trim().toLowerCase())
        })
      }

      // If new member is immediately marked as trusted contact, fire consent email too
      if (targetId && form.trusted && form.email.trim()) {
        supabase.functions.invoke('send-emergency-contact-email', {
          body: { family_member_id: targetId, is_new_member: true },
        }).then(({ error: fnErr }) => {
          if (fnErr) console.warn('Emergency consent email failed:', fnErr.message)
          else console.log('Emergency consent email sent to', form.email.trim().toLowerCase())
        })
      }
    }

    // Upload photo only if user picked a new one (not just the pre-populated existing photo)
    let resolvedPhotoUri: string | null = null
    if (photoUri && targetId && photoChanged) {
      setUploadingPhoto(true)
      const uploadResult = await uploadPhoto(user.id, targetId, photoUri)
      if (uploadResult) {
        await supabase.from('family_members').update({ photo_url: uploadResult.storagePath }).eq('id', targetId)
        if (Platform.OS !== 'web') {
          resolvedPhotoUri = uploadResult.localPath
        } else {
          const { data: sd } = await supabase.storage.from('memories').createSignedUrl(uploadResult.storagePath, 3600)
          resolvedPhotoUri = sd?.signedUrl ?? null
        }
      }
      setUploadingPhoto(false)
    }

    setSaving(false)

    // Build photo seed so loadMembers won't overwrite the known-good local URI
    const seed: Record<string, string> = {}
    if (targetId && resolvedPhotoUri) seed[targetId] = resolvedPhotoUri

    // Show occasion suggestions for:
    //   • New members (always, if setting is on)
    //   • Edits where the relationship type changed — recalculate what's relevant
    const isNewMember        = !editingMember
    const relationshipChanged = !!editingMember && form.relationship !== originalRelationship
    const shouldSuggest      = showSuggestions && (isNewMember || relationshipChanged)

    if (shouldSuggest) {
      const suggested = getSuggestedOccasionKeys(form.relationship, userOccasionKeys)
      setSuggestAllKeys(suggested)
      setSuggestSelections(new Set(suggested))
      setSuggestMember({
        name:         form.name.trim(),
        relationship: form.relationship,
        isUpdate:     relationshipChanged,
      })
      setPendingSeed(seed)
      setShowModal(false)
      resetForm()
      setShowOccasionSuggest(true)
    } else {
      setShowModal(false)
      resetForm()
      loadMembers(seed)
    }
  }

  // ── Save / dismiss occasion suggestions ────────────────────────────────────
  async function saveSuggestions() {
    setSuggestSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user && suggestSelections.size > 0) {
        const rows = Array.from(suggestSelections).map(key => ({
          user_id: user.id, occasion_key: key, is_active: true,
        }))
        const { error } = await supabase
          .from('user_occasions')
          .upsert(rows, { onConflict: 'user_id,occasion_key' })
        if (error) {
          console.warn('saveSuggestions upsert error:', error.message, error.code)
          // Non-fatal — dismiss anyway so member save isn't blocked
        } else {
          // Keep local state in sync so subsequent member additions use updated keys
          setUserOccasionKeys(prev => [...new Set([...prev, ...Array.from(suggestSelections)])])
        }
      }
    } catch (e: any) {
      console.warn('saveSuggestions error:', e.message)
    }
    setSuggestSaving(false)
    dismissSuggestions()
  }

  function dismissSuggestions() {
    setShowOccasionSuggest(false)
    setSuggestMember(null)
    setSuggestAllKeys([])
    setSuggestSelections(new Set())
    loadMembers(pendingSeed)
    setPendingSeed({})
  }

  // ── Open the native contact picker sheet ─────────────────────────────────
  // iOS blocks system permission dialogs when a Modal is already open.
  // Fix: close the Add/Edit modal first, request permission in clean air,
  // then show the contact picker. The modal re-opens when a contact is selected.
  async function openContactPicker() {
    // presentContactPickerAsync() must be called while a view is visible —
    // iOS needs an active view controller to present the native picker from.
    // So we keep the modal open, call the picker on top of it, then handle
    // the result afterwards (selectContact re-opens the modal with pre-filled data).
    try {
      const { status: existing } = await Contacts.getPermissionsAsync()

      if (existing === 'denied') {
        Alert.alert(
          'Contacts Access Blocked',
          'Solace Life needs access to your contacts. Open Settings to allow it.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ]
        )
        return
      }

      if (existing !== 'granted') {
        const { status } = await Contacts.requestPermissionsAsync()
        if (status !== 'granted') {
          Alert.alert('Permission Required', 'Please allow contacts access to use this feature.')
          return
        }
      }

      // Present native picker on top of the open modal
      const contact = await Contacts.presentContactPickerAsync()
      if (contact) {
        // selectContact pre-fills the form and re-opens the modal
        selectContact(contact)
      }
      // If null, user cancelled — modal is still open, nothing to do
    } catch (e) {
      console.warn('openContactPicker error:', e)
      Alert.alert('Error', 'Could not open contacts. Please try again.')
    }
  }

  // ── Pre-fill form from a selected contact ─────────────────────────────────
  function selectContact(contact: Contacts.Contact) {
    const fullName = contact.name
      || [contact.firstName, contact.lastName].filter(Boolean).join(' ')

    // Use the first available email / phone number
    const email = contact.emails?.[0]?.email || ''
    // Normalise phone to 1-604-5550123 format
    const rawPhone = (contact.phoneNumbers?.[0]?.number || '').replace(/\D/g, '') // digits only
    let phone = rawPhone
    if (rawPhone.length === 11 && rawPhone.startsWith('1')) {
      // 1 + 10-digit: 1-604-555-0123
      phone = `1-${rawPhone.slice(1, 4)}-${rawPhone.slice(4, 7)}-${rawPhone.slice(7)}`
    } else if (rawPhone.length === 10) {
      // 10-digit North American: prepend country code
      phone = `1-${rawPhone.slice(0, 3)}-${rawPhone.slice(3, 6)}-${rawPhone.slice(6)}`
    } else if (rawPhone.length > 0) {
      // International or unusual — keep digits as-is
      phone = rawPhone
    }

    setForm(f => ({
      ...f,
      name:  fullName || f.name,
      email: email    || f.email,
      phone: phone    || f.phone,
    }))
    // Reopen the Add/Edit modal with the pre-filled contact data
    setShowModal(true)
  }

  function resetForm() {
    setForm({ name: '', email: '', phone: '', relationship: '', relationship_label: '', trusted: false })
    setOriginalRelationship('')
    setEditingMember(null)
    setPhotoUri(null); setPhotoChanged(false); setPhotoError('')
    setHasDob(false); setDobDate(defaultDob())
    setShowDobPicker(false)
    setHasAnniv(false); setAnnivDate(defaultAnniv())
    setShowAnnivPicker(false)
    setSaveMsg('')
  }

  // ── Resend invite email (for unconfirmed members) ─────────────────────────
  async function handleResendInvite(member: any) {
    setResendingId(member.id)
    supabase.functions.invoke('send-family-invite', {
      body: { family_member_id: member.id },
    }).then(({ error: fnErr }) => {
      if (fnErr) console.warn('Resend invite failed:', fnErr.message)
      else console.log('Invite resent to', member.email)
      setResendingId(null)
    })
  }

  // ── Resend emergency consent request ─────────────────────────────────────
  async function handleResendEmergencyRequest(member: any) {
    setResendingId(member.id)
    supabase.functions.invoke('send-emergency-contact-email', {
      body: { family_member_id: member.id, is_new_member: false },
    }).then(({ error: fnErr }) => {
      if (fnErr) console.warn('Resend emergency request failed:', fnErr.message)
      else console.log('Emergency consent request resent to', member.email)
      setResendingId(null)
    })
  }

  async function handleDeleteMember() {
    if (!confirmDelete) return
    setDeleting(true)
    if (confirmDelete.photo_url) {
      await supabase.storage.from('memories').remove([confirmDelete.photo_url])
    }
    await supabase.from('family_members').delete().eq('id', confirmDelete.id)
    setMemberPhotoUrls(prev => { const n = { ...prev }; delete n[confirmDelete.id]; return n })
    setDeleting(false); setConfirmDelete(null); setDeleteConfirmText(''); loadMembers()
  }

  // ── Emergency contact toggle ───────────────────────────────────────────────
  // Up to 3 contacts can be designated. Priority is assigned automatically:
  // the next available slot (1, 2, 3) is used when enabling.
  async function handleToggleEmergency(member: any) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    if (member.is_emergency_contact) {
      // Remove designation — clear all emergency + consent fields
      await supabase.from('family_members')
        .update({
          is_emergency_contact:     false,
          emergency_priority:       null,
          emergency_consent_status: 'none',
        })
        .eq('id', member.id)
      // Re-pack priorities so there are no gaps (e.g. 1, 3 → 1, 2)
      const remaining = members
        .filter(m => m.is_emergency_contact && m.id !== member.id)
        .sort((a, b) => a.emergency_priority - b.emergency_priority)
      await Promise.all(remaining.map((m, i) =>
        supabase.from('family_members')
          .update({ emergency_priority: i + 1 })
          .eq('id', m.id)
      ))
    } else {
      // Add designation — count only accepted+pending slots (reserve the slot)
      const current = members.filter(m =>
        m.is_emergency_contact &&
        (m.emergency_consent_status === 'accepted' || m.emergency_consent_status === 'pending')
      )
      if (current.length >= 3) return // already at max
      if (!member.phone) {
        alert('Please add a phone number to this contact before designating them as an emergency contact.')
        return
      }
      const usedPriorities = current.map(m => m.emergency_priority)
      const nextPriority = [1, 2, 3].find(p => !usedPriorities.includes(p)) ?? 1
      await supabase.from('family_members')
        .update({
          is_emergency_contact:     true,
          emergency_priority:       nextPriority,
          // Consent can only be requested by email — stays 'none' until one is
          // added (the member card prompts for it), then edit-save kicks it off
          ...(member.email ? { emergency_consent_status: 'pending' } : {}),
        })
        .eq('id', member.id)

      // Send consent request email (fire-and-forget — don't block UI)
      if (member.email) {
        supabase.functions.invoke('send-emergency-contact-email', {
          body: { family_member_id: member.id, is_new_member: false },
        }).catch(e => console.warn('Emergency consent email send failed:', e))
      }
    }

    await loadMembers()
    // Refresh the lock screen notification with the new contact list
    refreshEmergencyNotification(user.id)
  }

  const statusColor = (status: string) =>
    status === 'accepted' ? C.success : status === 'declined' ? C.error : C.amber

  const founderMember  = members.find(m => m.is_founder_contact) ?? null
  const trustedMembers = members.filter(m => m.is_trusted_contact && !m.is_founder_contact)
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  const regularMembers = members.filter(m => !m.is_trusted_contact && !m.is_founder_contact)
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  // Only count accepted emergency contacts as "active" for display / limit purposes
  const emergencyCount        = members.filter(m => m.is_emergency_contact && m.emergency_consent_status === 'accepted').length
  const emergencyPendingCount = members.filter(m => m.is_emergency_contact && m.emergency_consent_status === 'pending').length
  const trustedCount          = members.filter(m => m.is_trusted_contact).length

  // ── Helpers for the date display fields ───────────────────────────────────
  function DateField({
    label, hasValue, value, open, onOpen, onClear,
    children,
  }: {
    label: string; hasValue: boolean; value: string; open: boolean
    onOpen: () => void; onClear: () => void; children: React.ReactNode
  }) {
    return (
      <>
        <Text style={[s.fieldLabel, { color: '#7A3448' }]}>{label}</Text>
        <TouchableOpacity
          onPress={onOpen}
          style={[s.input, {
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            paddingVertical: 14,
            backgroundColor: WM.inputBg,
            borderColor: WM.border,
          }]}>
          <Text style={{ color: hasValue ? WM.title : WM.sub, fontSize: 15 }}>
            {hasValue ? value : `Tap to set ${label.replace(' (optional)', '').toLowerCase()}`}
          </Text>
          {hasValue && (
            <TouchableOpacity onPress={onClear} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={{ color: WM.sub, fontSize: 16 }}>✕</Text>
            </TouchableOpacity>
          )}
        </TouchableOpacity>
        {open && children}
      </>
    )
  }

  return (
    <ScreenWrap>
      <ScrollView contentContainerStyle={s.screenScroll} showsVerticalScrollIndicator={true}>

        <View style={s.pageHeaderPlain}>
          <Text style={s.pageTitle}>Family</Text>
          <Text style={s.pageSubtitle}>The people who matter most</Text>
        </View>

        <TouchableOpacity activeOpacity={0.85} style={s.addBtn} onPress={() => setShowModal(true)}>
          <LinearGradient colors={[C.amberLight, C.amber, '#C07840']} style={s.btnPrimary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
            <Text style={s.btnPrimaryText}>+ Add a Family Member</Text>
          </LinearGradient>
        </TouchableOpacity>

        {/* Photo upload status / error */}
        {(uploadingPhoto && !showModal) ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
            marginHorizontal: 20, marginBottom: 12 }}>
            <ActivityIndicator color={C.amber} size="small" />
            <Text style={{ color: C.grey, fontSize: 13 }}>Updating photo…</Text>
          </View>
        ) : null}
        {(photoError !== '' && !showModal) ? (
          <TouchableOpacity
            onPress={() => setPhotoError('')}
            style={{ marginHorizontal: 20, marginBottom: 12, padding: 12, borderRadius: 12,
              backgroundColor: C.error + '22', borderWidth: 1, borderColor: C.error + '44',
              flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={{ fontSize: 16 }}>⚠️</Text>
            <Text style={{ color: C.error, fontSize: 13, flex: 1 }}>{photoError}</Text>
          </TouchableOpacity>
        ) : null}

        {loading ? (
          <ActivityIndicator color={C.amber} style={{ marginTop: 20 }} />
        ) : !founderMember && members.length === 0 && senders.length === 0 ? (
          // Truly empty — no Sokha, no members, no senders
          <View>
            <View style={s.tipCard}>
              <Text style={s.tipTitle}>👨‍👩‍👧 How Family Access Works</Text>
              <Text style={s.tipBody}>
                Invite family members by email. If your family ever needs it, your trusted contact can unlock access to everything you've preserved.
              </Text>
            </View>
            <View style={s.emptyState}>
              <Text style={s.emptyIcon}>💌</Text>
              <Text style={s.emptyTitle}>No family members yet</Text>
              <Text style={s.emptyDesc}>Invite your loved ones so they're always connected.</Text>
            </View>
          </View>
        ) : (
          <View>
            {/* ── Connected with — G1 senders who added this user ─────────── */}
            {senders.length > 0 ? (
              <View>
                <View style={s.sectionRow}>
                  <Text style={s.sectionTitle}>Connected with</Text>
                </View>
                {senders.map((sender) => {
                  const photoUrl = senderPhotoUrls[sender.familyMemberId] ?? null
                  const name = String(sender.senderName || 'Someone who loves you')
                  const label = getReciprocalLabel(sender.relationshipLabel)
                  return (
                    <TouchableOpacity
                      key={sender.familyMemberId}
                      activeOpacity={0.82}
                      onPress={() => setSelectedSender({ familyMemberId: sender.familyMemberId, senderName: name, relationshipLabel: sender.relationshipLabel, photoUrl, senderEmail: sender.senderEmail ?? null })}
                      style={[s.listRow, { padding: 0, overflow: 'hidden', alignItems: 'stretch', minHeight: 180 }]}
                    >
                      <MemberAvatar
                        member={{ name }}
                        photoUrl={photoUrl}
                        fillHeight
                        onPress={() => setSelectedSender({ familyMemberId: sender.familyMemberId, senderName: name, relationshipLabel: sender.relationshipLabel, photoUrl, senderEmail: sender.senderEmail ?? null })}
                      />
                      <View style={{ flex: 1, flexDirection: 'column', justifyContent: 'space-between', padding: 14 }}>
                        <View>
                          <Text style={s.listLabel}>{name}</Text>
                          {label !== null ? (
                            <Text style={[s.listDesc, { color: C.amberLight, fontWeight: '600' }]}>
                              {label}
                            </Text>
                          ) : null}
                          <View style={{ alignSelf: 'flex-start', marginTop: 8,
                            backgroundColor: 'rgba(240,98,146,0.12)', borderRadius: 20,
                            borderWidth: 1, borderColor: 'rgba(240,98,146,0.3)',
                            paddingHorizontal: 10, paddingVertical: 4 }}>
                            <Text style={{ fontSize: 11, fontWeight: '700', color: C.accent }}>
                              {'💜 Preserving moments for you'}
                            </Text>
                          </View>
                          {/* Tap hint */}
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 4 }}>
                            <Text style={{ fontSize: 11, color: C.grey, fontStyle: 'italic' }}>
                              {'Tap to learn more →'}
                            </Text>
                          </View>
                        </View>
                      </View>
                    </TouchableOpacity>
                  )
                })}
              </View>
            ) : null}

            {/* ── Founder card — Sokha Eang ─────────────────────────────────── */}
            {founderMember ? (
              <View style={{ marginHorizontal: 20, marginBottom: 20 }}>
                <View style={{ marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ color: C.grey, fontSize: 11, fontWeight: '700',
                    letterSpacing: 1.2, textTransform: 'uppercase' }}>From the Founder</Text>
                </View>
                {/* Gradient border card */}
                <LinearGradient
                  colors={['#F06292', '#F48A5A', '#FFD07A']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={{ borderRadius: 20, padding: 1.5 }}>
                  <View style={{ borderRadius: 19, backgroundColor: '#1A0A22',
                    flexDirection: 'row', alignItems: 'stretch', overflow: 'hidden' }}>
                    {/* Avatar */}
                    <View style={{ width: 110, alignItems: 'center', justifyContent: 'center',
                      backgroundColor: 'rgba(240,98,146,0.12)', borderRightWidth: 1,
                      borderRightColor: 'rgba(240,98,146,0.15)', paddingVertical: 22 }}>
                      <View style={{ width: 72, height: 72, borderRadius: 36,
                        backgroundColor: 'rgba(240,98,146,0.2)', borderWidth: 2,
                        borderColor: '#F06292AA',
                        alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 32, fontWeight: '800', color: '#F06292' }}>S</Text>
                      </View>
                      {/* Founder badge */}
                      <View style={{ marginTop: 8, backgroundColor: 'rgba(240,98,146,0.18)',
                        borderRadius: 20, borderWidth: 1, borderColor: 'rgba(240,98,146,0.4)',
                        paddingHorizontal: 8, paddingVertical: 3 }}>
                        <Text style={{ color: '#F06292', fontSize: 10, fontWeight: '800',
                          letterSpacing: 0.5 }}>FOUNDER</Text>
                      </View>
                    </View>
                    {/* Content */}
                    <View style={{ flex: 1, padding: 16, justifyContent: 'center', gap: 6 }}>
                      <Text style={{ color: '#FFEEF8', fontSize: 18, fontWeight: '700' }}>
                        Sokha Eang
                      </Text>
                      <Text style={{ color: 'rgba(240,98,146,0.8)', fontSize: 12,
                        fontStyle: 'italic', lineHeight: 18 }}>
                        "I built this for my own family first — happy you're here."
                      </Text>
                      <TouchableOpacity
                        onPress={() => setConfirmDelete(founderMember)}
                        activeOpacity={0.7}
                        style={{ marginTop: 6, alignSelf: 'flex-start' }}>
                        <Text style={{ color: 'rgba(255,255,255,0.2)', fontSize: 11 }}>
                          Remove
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </LinearGradient>
              </View>
            ) : null}

            {/* ── Nudge when Sokha is the only entry ── */}
            {founderMember && trustedMembers.length === 0 && regularMembers.length === 0 && senders.length === 0 ? (
              <View style={[s.tipCard, { marginTop: 0 }]}>
                <Text style={s.tipTitle}>👨‍👩‍👧 Add Your First Family Member</Text>
                <Text style={s.tipBody}>
                  Invite family members by email so they can receive your moments and stay connected.
                </Text>
              </View>
            ) : null}

            {/* ── Own members (Trusted Contacts + Family) — only when user has added people ── */}
            {members.length > 0 ? (<>

            {/* ── Trusted Contact Banner ── */}
            {trustedCount === 0 && emergencyCount === 0 && emergencyPendingCount === 0 ? (
              <View style={{ marginHorizontal: 20, marginBottom: 16, padding: 14, borderRadius: 14,
                backgroundColor: '#E8453C18', borderWidth: 1, borderColor: '#E8453C44',
                flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Text style={{ fontSize: 24 }}>⭐</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#E8453C', fontSize: 13, fontWeight: '700', marginBottom: 2 }}>
                    No Trusted Contact Set
                  </Text>
                  <Text style={{ color: C.grey, fontSize: 12, lineHeight: 17 }}>
                    Tap ✏️ on a family member and enable Trusted Contact so Solace can notify them if you miss your check-ins.
                  </Text>
                </View>
              </View>
            ) : emergencyCount === 0 && emergencyPendingCount === 0 ? (
              <View style={{ marginHorizontal: 20, marginBottom: 16, padding: 14, borderRadius: 14,
                backgroundColor: '#3dba6218', borderWidth: 1, borderColor: '#3dba6244',
                flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Text style={{ fontSize: 24 }}>⭐</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.success, fontSize: 13, fontWeight: '700', marginBottom: 2 }}>
                    {trustedCount} Trusted Contact{trustedCount > 1 ? 's' : ''} Set
                  </Text>
                  <Text style={{ color: C.grey, fontSize: 12, lineHeight: 17 }}>
                    They will be able to see your vault documents when the time comes. To also have Solace alert them if you ever miss your check-ins, tap ✏️ and turn on Emergency Contact.
                  </Text>
                </View>
              </View>
            ) : (
              <>
                <View style={{ marginHorizontal: 20, marginBottom: 12, padding: 14, borderRadius: 14,
                  backgroundColor: emergencyCount > 0 ? '#3dba6218' : 'rgba(255,184,0,0.08)',
                  borderWidth: 1,
                  borderColor: emergencyCount > 0 ? '#3dba6244' : 'rgba(255,184,0,0.30)',
                  flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Text style={{ fontSize: 24 }}>{emergencyCount > 0 ? '✅' : '⏳'}</Text>
                  <View style={{ flex: 1 }}>
                    {emergencyCount > 0 ? (
                      <Text style={{ color: C.success, fontSize: 13, fontWeight: '700', marginBottom: 2 }}>
                        {emergencyCount} Trusted Contact{emergencyCount > 1 ? 's' : ''} Confirmed
                      </Text>
                    ) : null}
                    {emergencyPendingCount > 0 ? (
                      <Text style={{ color: '#A32D2D', fontSize: 13, fontWeight: '600', marginBottom: 2 }}>
                        🚑 {emergencyPendingCount} emergency consent pending
                      </Text>
                    ) : null}
                    <Text style={{ color: C.grey, fontSize: 12, lineHeight: 17 }}>
                      {emergencyCount > 0
                        ? 'They will be notified if you miss check-ins, and will be able to see the vault documents you chose for them.'
                        : 'Consent request sent — waiting for their reply.'}
                    </Text>
                  </View>
                </View>

                {/* ── Phone emergency setup card (iOS & Android) ── */}
                {Platform.OS === 'ios' ? (
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => setShowMedicalIdGuide(true)}
                    style={{ marginHorizontal: 20, marginBottom: 16, borderRadius: 16,
                      backgroundColor: '#0A84FF14', borderWidth: 1.5, borderColor: '#0A84FF55',
                      overflow: 'hidden' }}>
                    {/* Header row */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12,
                      padding: 14, borderBottomWidth: 1, borderBottomColor: '#0A84FF22' }}>
                      <Text style={{ fontSize: 26 }}>🏥</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: '#0A84FF', fontSize: 14, fontWeight: '800', marginBottom: 2 }}>
                          Enable Phone Emergency Feature
                        </Text>
                        <Text style={{ color: C.grey, fontSize: 12 }}>
                          Add your trusted contacts to iPhone Medical ID so first responders can reach them
                        </Text>
                      </View>
                      <Text style={{ color: '#0A84FF', fontSize: 20 }}>›</Text>
                    </View>
                    {/* Icon pills */}
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12,
                      paddingVertical: 10, gap: 8 }}>
                      {[
                        { icon: '📱', label: 'Lock Screen' },
                        { icon: '🔓', label: 'No passcode' },
                        { icon: '📞', label: 'One tap call' },
                      ].map(pill => (
                        <View key={pill.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 5,
                          backgroundColor: '#0A84FF1A', borderWidth: 1, borderColor: '#0A84FF40',
                          borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 }}>
                          <Text style={{ fontSize: 13 }}>{pill.icon}</Text>
                          <Text style={{ color: '#0A84FF', fontSize: 12, fontWeight: '600' }}>{pill.label}</Text>
                        </View>
                      ))}
                    </View>
                    <View style={{ backgroundColor: '#0A84FF', paddingVertical: 10, alignItems: 'center' }}>
                      <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>
                        Show Me How to Set This Up →
                      </Text>
                    </View>
                  </TouchableOpacity>
                ) : null}

                {/* Android emergency contacts setup card */}
                {Platform.OS === 'android' ? (
                  <View style={{ marginHorizontal: 20, marginBottom: 16, borderRadius: 16,
                    backgroundColor: '#1DB95414', borderWidth: 1.5, borderColor: '#1DB95455',
                    overflow: 'hidden' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12,
                      padding: 14, borderBottomWidth: 1, borderBottomColor: '#1DB95422' }}>
                      <Text style={{ fontSize: 26 }}>🤖</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: '#1DB954', fontSize: 14, fontWeight: '800', marginBottom: 2 }}>
                          Enable Phone Emergency Feature
                        </Text>
                        <Text style={{ color: C.grey, fontSize: 12 }}>
                          Add your trusted contacts to Android's emergency settings
                        </Text>
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12,
                      paddingVertical: 10, gap: 8 }}>
                      {[
                        { icon: '⚙️', label: 'Settings' },
                        { icon: '🛡️', label: 'Safety & Emergency' },
                        { icon: '📞', label: 'Emergency contacts' },
                      ].map(pill => (
                        <View key={pill.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 5,
                          backgroundColor: '#1DB9541A', borderWidth: 1, borderColor: '#1DB95440',
                          borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 }}>
                          <Text style={{ fontSize: 13 }}>{pill.icon}</Text>
                          <Text style={{ color: '#1DB954', fontSize: 12, fontWeight: '600' }}>{pill.label}</Text>
                        </View>
                      ))}
                    </View>
                    <View style={{ backgroundColor: '#1DB954', paddingVertical: 10, alignItems: 'center' }}>
                      <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>
                        Open Android Settings →
                      </Text>
                    </View>
                  </View>
                ) : null}
              </>
            )}

            {trustedMembers.length > 0 ? (
              <>
                <View style={s.sectionRow}>
                  <Text style={s.sectionTitle}>Trusted Contact{trustedMembers.length > 1 ? 's' : ''}</Text>
                </View>
                {trustedMembers.map((tm) => (
                  <TouchableOpacity key={tm.id} activeOpacity={0.82}
                    onPress={() => setViewingMember(tm)}
                    accessibilityLabel={`View ${tm.name}`} accessibilityRole="button">
                    <View style={[s.listRow, s.trustedRow,
                      { padding: 0, overflow: 'hidden', alignItems: 'stretch', minHeight: 210 }]}>
                      <MemberAvatar
                        member={tm}
                        photoUrl={memberPhotoUrls[tm.id]}
                        fillHeight
                        onPress={() => setViewingMember(tm)}
                      />
                      {/* Right side — name, phone, badges only */}
                      <View style={{ flex: 1, padding: 16, justifyContent: 'center', gap: 8 }}>
                        <Text style={[s.listLabel, { fontSize: 20 }]}>{tm.name}</Text>
                        {tm.phone ? (
                          <Text style={[s.listDesc, { fontSize: 16 }]}>📞 {tm.phone}</Text>
                        ) : (
                          <Text style={[s.listDesc, { fontSize: 14, opacity: 0.5 }]}>No phone added</Text>
                        )}
                        <View style={{ gap: 5, marginTop: 2 }}>
                          <Text style={[s.trustedBadge, { fontSize: 13 }]}>★ Trusted Contact</Text>
                          {sendingBackIds.has(tm.id) ? (
                            <View style={{ alignSelf: 'flex-start',
                              backgroundColor: 'rgba(240,98,146,0.12)', borderRadius: 20,
                              borderWidth: 1, borderColor: 'rgba(240,98,146,0.3)',
                              paddingHorizontal: 10, paddingVertical: 4 }}>
                              <Text style={{ fontSize: 13, fontWeight: '700', color: C.accent }}>
                                💜 Preserving moments
                              </Text>
                            </View>
                          ) : null}
                          {tm.is_emergency_contact && tm.emergency_consent_status === 'accepted' ? (
                            <View style={{ alignSelf: 'flex-start', backgroundColor: '#0A84FF14', borderRadius: 8,
                              borderWidth: 1, borderColor: '#0A84FF44', paddingHorizontal: 8, paddingVertical: 4 }}>
                              <Text style={{ color: '#0A84FF', fontSize: 13, fontWeight: '700' }}>
                                📱 Emergency #{tm.emergency_priority}
                              </Text>
                            </View>
                          ) : tm.is_emergency_contact && tm.emergency_consent_status === 'pending' ? (
                            <View style={{ alignSelf: 'flex-start', backgroundColor: 'rgba(226,75,74,0.08)',
                              borderLeftWidth: 3, borderLeftColor: '#E24B4A',
                              borderTopWidth: 0.5, borderTopColor: 'rgba(226,75,74,0.25)',
                              borderRightWidth: 0.5, borderRightColor: 'rgba(226,75,74,0.25)',
                              borderBottomWidth: 0.5, borderBottomColor: 'rgba(226,75,74,0.25)',
                              borderTopRightRadius: 8, borderBottomRightRadius: 8,
                              paddingHorizontal: 10, paddingVertical: 5,
                              flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Text style={{ fontSize: 14 }}>🚑</Text>
                              <Text style={{ color: '#7A1F1F', fontSize: 13, fontWeight: '600' }}>Emergency consent pending</Text>
                            </View>
                          ) : tm.emergency_consent_status === 'declined' ? (
                            <View style={{ alignSelf: 'flex-start', backgroundColor: 'rgba(255,100,80,0.10)', borderRadius: 8,
                              borderWidth: 1, borderColor: 'rgba(255,100,80,0.30)', paddingHorizontal: 8, paddingVertical: 4 }}>
                              <Text style={{ color: '#FF6450', fontSize: 13, fontWeight: '700' }}>
                                ✗ Declined emergency role
                              </Text>
                            </View>
                          ) : null}
                          {!tm.email ? (
                            <Text style={{ color: '#FFB800', fontSize: 13, fontWeight: '600', lineHeight: 18 }}>
                              ✉️ Add their email (tap ✏️) so we can ask them to accept this role
                            </Text>
                          ) : !tm.email_confirmed ? (
                            <Text style={{ color: C.offWhite, fontSize: 13, fontWeight: '700' }}>⚠️ Not confirmed</Text>
                          ) : null}
                        </View>
                      </View>
                    </View>
                  </TouchableOpacity>
                ))}
              </>
            ) : null}

            {regularMembers.length > 0 ? (
              <>
                <View style={s.sectionRow}>
                  <Text style={s.sectionTitle}>Family Members</Text>
                </View>
                {regularMembers.map((m) => (
                  <TouchableOpacity key={m.id} activeOpacity={0.82}
                    onPress={() => setViewingMember(m)}
                    accessibilityLabel={`View ${m.name}`} accessibilityRole="button">
                    <View style={[s.listRow,
                      { padding: 0, overflow: 'hidden', alignItems: 'stretch', minHeight: 210 }]}>
                      <MemberAvatar
                        member={m}
                        photoUrl={memberPhotoUrls[m.id]}
                        fillHeight
                        onPress={() => setViewingMember(m)}
                      />
                      {/* Right side — name, phone, badges only */}
                      <View style={{ flex: 1, padding: 16, justifyContent: 'center', gap: 8 }}>
                        <Text style={[s.listLabel, { fontSize: 20 }]}>{m.name}</Text>
                        {m.phone ? (
                          <Text style={[s.listDesc, { fontSize: 16 }]}>📞 {m.phone}</Text>
                        ) : (
                          <Text style={[s.listDesc, { fontSize: 14, opacity: 0.5 }]}>No phone added</Text>
                        )}
                        <View style={{ gap: 5, marginTop: 2 }}>
                          {sendingBackIds.has(m.id) ? (
                            <View style={{ alignSelf: 'flex-start',
                              backgroundColor: 'rgba(240,98,146,0.12)', borderRadius: 20,
                              borderWidth: 1, borderColor: 'rgba(240,98,146,0.3)',
                              paddingHorizontal: 10, paddingVertical: 4 }}>
                              <Text style={{ fontSize: 13, fontWeight: '700', color: C.accent }}>
                                💜 Preserving moments
                              </Text>
                            </View>
                          ) : null}
                          {m.is_emergency_contact && m.emergency_consent_status === 'accepted' ? (
                            <View style={{ alignSelf: 'flex-start', backgroundColor: '#0A84FF14', borderRadius: 8,
                              borderWidth: 1, borderColor: '#0A84FF44', paddingHorizontal: 8, paddingVertical: 4 }}>
                              <Text style={{ color: '#0A84FF', fontSize: 13, fontWeight: '700' }}>
                                📱 Emergency #{m.emergency_priority}
                              </Text>
                            </View>
                          ) : m.is_emergency_contact && m.emergency_consent_status === 'pending' ? (
                            <View style={{ alignSelf: 'flex-start', backgroundColor: 'rgba(226,75,74,0.08)',
                              borderLeftWidth: 3, borderLeftColor: '#E24B4A',
                              borderTopWidth: 0.5, borderTopColor: 'rgba(226,75,74,0.25)',
                              borderRightWidth: 0.5, borderRightColor: 'rgba(226,75,74,0.25)',
                              borderBottomWidth: 0.5, borderBottomColor: 'rgba(226,75,74,0.25)',
                              borderTopRightRadius: 8, borderBottomRightRadius: 8,
                              paddingHorizontal: 10, paddingVertical: 5,
                              flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Text style={{ fontSize: 14 }}>🚑</Text>
                              <Text style={{ color: '#7A1F1F', fontSize: 13, fontWeight: '600' }}>Emergency consent pending</Text>
                            </View>
                          ) : m.emergency_consent_status === 'declined' ? (
                            <View style={{ alignSelf: 'flex-start', backgroundColor: 'rgba(150,150,150,0.10)', borderRadius: 8,
                              borderWidth: 1, borderColor: 'rgba(150,150,150,0.25)', paddingHorizontal: 8, paddingVertical: 4 }}>
                              <Text style={{ color: C.grey, fontSize: 13, fontWeight: '500' }}>
                                Not available as emergency contact
                              </Text>
                            </View>
                          ) : null}
                          {(m.is_trusted_contact || m.is_emergency_contact) && !m.email ? (
                            <Text style={{ color: '#FFB800', fontSize: 13, fontWeight: '600', lineHeight: 18 }}>
                              ✉️ Add their email (tap ✏️) so we can ask them to accept this role
                            </Text>
                          ) : !m.email_confirmed ? (
                            <Text style={{ color: C.offWhite, fontSize: 13, fontWeight: '700' }}>⚠️ Not confirmed</Text>
                          ) : null}
                        </View>
                      </View>
                    </View>
                  </TouchableOpacity>
                ))}
              </>
            ) : null}

            </>) : null}
          </View>
        )}
      </ScrollView>

      {/* ── Member Detail — read-only view modal ───────────────────────────── */}
      <Modal visible={!!viewingMember} transparent animationType="slide"
        onRequestClose={() => setViewingMember(null)}>
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setViewingMember(null)}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
          <View style={{ minHeight: '80%', maxHeight: '90%', borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden', width: '100%' }}>
            <LinearGradient colors={WARM} style={{ flex: 1, paddingHorizontal: 28, paddingTop: 40, paddingBottom: 28 }}>
              <View style={s.modalHandle} />
              {/* Header */}
              <View style={s.modalHeader}>
                <Text style={[s.modalTitle, { color: WM.title }]}>Profile</Text>
                <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                  <TouchableOpacity
                    onPress={() => { setViewingMember(null); handleEditMember(viewingMember) }}
                    accessibilityLabel="Edit member" accessibilityRole="button">
                    <View style={[s.modalCloseBtn, {
                      backgroundColor: WM.accent, paddingHorizontal: 14,
                      width: 'auto', flexDirection: 'row', alignItems: 'center', gap: 6,
                    }]}>
                      <Text style={{ fontSize: 15 }}>✏️</Text>
                      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Edit</Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setViewingMember(null)}>
                    <View style={s.modalCloseBtn}><Text style={s.modalCloseX}>✕</Text></View>
                  </TouchableOpacity>
                </View>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
                {viewingMember ? (() => {
                  const vm = viewingMember
                  const photoUrl = memberPhotoUrls[vm.id] || null
                  const initials = vm.name?.charAt(0).toUpperCase() ?? '?'
                  const color = avatarColor(vm.name)
                  return (
                    <>
                      {/* Large photo */}
                      <View style={{ alignItems: 'center', marginBottom: 20 }}>
                        {photoUrl ? (
                          <Image source={{ uri: photoUrl }}
                            style={{ width: 160, height: 160, borderRadius: 80,
                              borderWidth: 3, borderColor: color + '88' }}
                            resizeMode="cover" />
                        ) : (
                          <View style={{ width: 160, height: 160, borderRadius: 80,
                            backgroundColor: color + '33', borderWidth: 3, borderColor: color + '88',
                            alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ fontSize: 64, fontWeight: '800', color }}>
                              {initials}
                            </Text>
                          </View>
                        )}
                      </View>

                      {/* Name + relationship */}
                      <Text style={{ fontSize: 26, fontWeight: '700', color: WM.title, textAlign: 'center', marginBottom: 4 }}>
                        {vm.name}
                      </Text>
                      {vm.relationship_label ? (
                        <Text style={{ fontSize: 16, fontWeight: '600', color: C.amberLight, textAlign: 'center', marginBottom: 16 }}>
                          {vm.relationship_label}
                        </Text>
                      ) : vm.relationship ? (
                        <Text style={{ fontSize: 15, color: WM.sub, textAlign: 'center', marginBottom: 16 }}>
                          {vm.relationship}
                        </Text>
                      ) : <View style={{ marginBottom: 16 }} />}

                      {/* Detail rows */}
                      <View style={{ backgroundColor: WM.cardBg, borderRadius: 14, borderWidth: 1,
                        borderColor: WM.border, padding: 16, gap: 14, marginBottom: 16 }}>
                        {vm.email ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <Text style={{ fontSize: 20 }}>✉️</Text>
                            <Text style={{ fontSize: 16, color: WM.title, flex: 1 }}>{vm.email}</Text>
                          </View>
                        ) : null}
                        {vm.phone ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <Text style={{ fontSize: 20 }}>📞</Text>
                            <Text style={{ fontSize: 16, color: WM.title, flex: 1 }}>{vm.phone}</Text>
                          </View>
                        ) : (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <Text style={{ fontSize: 20 }}>📞</Text>
                            <Text style={{ fontSize: 15, color: WM.sub, flex: 1 }}>No phone number added</Text>
                          </View>
                        )}
                        {vm.date_of_birth ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <Text style={{ fontSize: 20 }}>🎂</Text>
                            <Text style={{ fontSize: 16, color: WM.title, flex: 1 }}>{vm.date_of_birth}</Text>
                          </View>
                        ) : null}
                        {vm.anniversary ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <Text style={{ fontSize: 20 }}>💍</Text>
                            <Text style={{ fontSize: 16, color: WM.title, flex: 1 }}>{vm.anniversary}</Text>
                          </View>
                        ) : null}
                      </View>

                      {/* Badges */}
                      <View style={{ gap: 10, marginBottom: 8 }}>
                        {vm.is_trusted_contact && vm.emergency_consent_status === 'accepted' ? (
                          <View style={{ backgroundColor: WM.cardBg, borderRadius: 12, borderWidth: 1,
                            borderColor: WM.border, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <Text style={{ fontSize: 22 }}>🔒</Text>
                            <View>
                              <Text style={{ fontSize: 15, fontWeight: '700', color: WM.title }}>Trusted Contact</Text>
                              <Text style={{ fontSize: 13, color: WM.sub }}>Can unlock your vault</Text>
                            </View>
                          </View>
                        ) : vm.is_trusted_contact && vm.emergency_consent_status === 'pending' ? (
                          <View style={{ backgroundColor: 'rgba(226,75,74,0.08)',
                            borderLeftWidth: 3, borderLeftColor: '#E24B4A',
                            borderTopWidth: 0.5, borderTopColor: 'rgba(226,75,74,0.25)',
                            borderRightWidth: 0.5, borderRightColor: 'rgba(226,75,74,0.25)',
                            borderBottomWidth: 0.5, borderBottomColor: 'rgba(226,75,74,0.25)',
                            borderTopRightRadius: 12, borderBottomRightRadius: 12,
                            padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <Text style={{ fontSize: 22 }}>🚑</Text>
                            <View>
                              <Text style={{ fontSize: 15, fontWeight: '600', color: '#501313' }}>Emergency contact · request sent</Text>
                              <Text style={{ fontSize: 13, color: '#A32D2D' }}>Waiting for their reply</Text>
                            </View>
                          </View>
                        ) : vm.emergency_consent_status === 'declined' ? (
                          <View style={{ backgroundColor: 'rgba(150,150,150,0.08)', borderRadius: 12, borderWidth: 1,
                            borderColor: 'rgba(150,150,150,0.25)', padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <Text style={{ fontSize: 22 }}>🔕</Text>
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 15, fontWeight: '600', color: C.grey }}>Not available as emergency contact</Text>
                              <TouchableOpacity onPress={() => { setViewingMember(null); handleResendEmergencyRequest(vm) }}>
                                <Text style={{ fontSize: 13, color: C.accent, fontWeight: '600', marginTop: 2 }}>Resend the request →</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        ) : null}
                        {vm.is_emergency_contact && vm.emergency_consent_status === 'accepted' ? (
                          <View style={{ backgroundColor: '#0A84FF14', borderRadius: 12, borderWidth: 1,
                            borderColor: '#0A84FF44', padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <Text style={{ fontSize: 22 }}>📱</Text>
                            <View>
                              <Text style={{ fontSize: 15, fontWeight: '700', color: '#0A84FF' }}>Emergency Contact #{vm.emergency_priority}</Text>
                              <Text style={{ fontSize: 13, color: WM.sub }}>Phone emergency list</Text>
                            </View>
                          </View>
                        ) : null}
                        {sendingBackIds.has(vm.id) ? (
                          <View style={{ backgroundColor: 'rgba(240,98,146,0.10)', borderRadius: 12, borderWidth: 1,
                            borderColor: 'rgba(240,98,146,0.3)', padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <Text style={{ fontSize: 22 }}>💜</Text>
                            <View>
                              <Text style={{ fontSize: 15, fontWeight: '700', color: C.accent }}>Preserving moments for you</Text>
                              <Text style={{ fontSize: 13, color: WM.sub }}>They're also sending you memories</Text>
                            </View>
                          </View>
                        ) : null}
                        {!vm.email_confirmed ? (
                          <View style={{ backgroundColor: 'rgba(200,120,0,0.10)', borderRadius: 12, borderWidth: 1,
                            borderColor: 'rgba(200,120,0,0.3)', padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <Text style={{ fontSize: 22 }}>⚠️</Text>
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 15, fontWeight: '700', color: WM.title }}>Invite not confirmed</Text>
                              <TouchableOpacity onPress={() => { setViewingMember(null); handleResendInvite(vm) }}>
                                <Text style={{ fontSize: 13, color: C.accent, fontWeight: '600' }}>Tap to resend invite →</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        ) : null}

                        {/* ── Moments bridge card ── */}
                        <TouchableOpacity
                          onPress={() => { setViewingMember(null); navigation.navigate('Memories', { openMemberId: vm.id }) }}
                          activeOpacity={0.8}
                          style={{ backgroundColor: WM.cardBg, borderColor: WM.border, borderWidth: 1, borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 }}>
                          <Text style={{ fontSize: 26 }}>💌</Text>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 15, fontWeight: '700', color: WM.title }}>
                              Moments recorded for {vm.name?.split(' ')[0]}
                            </Text>
                            <Text style={{ fontSize: 12, color: WM.sub, marginTop: 3 }}>
                              {viewingMemberMemoryCount === null
                                ? 'Tap to open in Moments tab'
                                : viewingMemberMemoryCount === 0
                                  ? 'No moments yet · tap to start recording'
                                  : `${viewingMemberMemoryCount} ${viewingMemberMemoryCount === 1 ? 'moment' : 'moments'} recorded · tap to open in Moments tab`}
                            </Text>
                          </View>
                          <Text style={{ color: WM.sub, fontSize: 22, fontWeight: '300' }}>›</Text>
                        </TouchableOpacity>

                      </View>
                    </>
                  )
                })() : null}
              </ScrollView>
            </LinearGradient>
          </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── Add / Edit Family Member Modal ──────────────────────────────────── */}
      <Modal visible={showModal} transparent animationType="slide"
        onRequestClose={() => { setShowModal(false); resetForm() }}
        >
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => { setShowModal(false); resetForm() }}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? undefined : 'height'} style={{ width: '100%' }}>
            <TouchableOpacity activeOpacity={1} onPress={() => {}}>
            <View style={s.modalSheet}>
              <LinearGradient colors={['#F06292', '#F48A5A', '#FFD07A']} style={[s.modalInner, { maxHeight: '94%', paddingBottom: 0, flexShrink: 1 }]}>
                <View style={s.modalHandle} />
                <View style={s.modalHeader}>
                  <Text style={[s.modalTitle, { color: '#3D1020' }]}>{editingMember ? 'Edit Member' : 'Add Family Member'}</Text>
                  <TouchableOpacity onPress={() => { setShowModal(false); resetForm() }}>
                    <View style={s.modalCloseBtn}><Text style={s.modalCloseX}>✕</Text></View>
                  </TouchableOpacity>
                </View>
                <ScrollView showsVerticalScrollIndicator={true} automaticallyAdjustKeyboardInsets keyboardShouldPersistTaps="handled" style={{ flexShrink: 1 }}>

                  {/* ── Import from Contacts ──────────────────────────────── */}
                  <TouchableOpacity
                    onPress={openContactPicker}
                    activeOpacity={0.85}
                    style={{ marginBottom: 20 }}>
                    <LinearGradient
                      colors={[C.amberLight, C.amber, '#C07840']}
                      start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                      style={[s.btnPrimary, { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }]}>
                      <Text style={{ fontSize: 20 }}>📱</Text>
                      <Text style={s.btnPrimaryText}>
                        {editingMember ? 'Update from Contacts' : 'Import from Contacts'}
                      </Text>
                    </LinearGradient>
                  </TouchableOpacity>

                  {/* ── Divider ───────────────────────────────────────────── */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                    <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(61,16,32,0.2)' }} />
                    <Text style={{ color: '#7A3448', fontSize: 12 }}>or fill in manually</Text>
                    <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(61,16,32,0.2)' }} />
                  </View>

                  {/* ── Circular photo picker ─────────────────────────────── */}
                  <View style={{ alignItems: 'center', marginBottom: 24 }}>
                    <TouchableOpacity
                      onPress={async () => {
                        const uri = await pickPhoto()
                        if (uri) { setPhotoUri(uri); setPhotoChanged(true) }
                      }}
                      activeOpacity={0.8}>
                      {photoUri ? (
                        <View>
                          <Image
                            source={{ uri: photoUri }}
                            style={{ width: 220, height: 220, borderRadius: 110,
                              borderWidth: 4, borderColor: 'rgba(61,16,32,0.35)' }}
                            resizeMode="cover"
                          />
                          <View style={{
                            position: 'absolute', bottom: 8, right: 8,
                            width: 48, height: 48, borderRadius: 24,
                            backgroundColor: '#F06292',
                            alignItems: 'center', justifyContent: 'center',
                          }}>
                            <Text style={{ fontSize: 22 }}>✏️</Text>
                          </View>
                        </View>
                      ) : (
                        <View style={{
                          width: 220, height: 220, borderRadius: 110,
                          backgroundColor: 'rgba(61,16,32,0.1)',
                          borderWidth: 2, borderColor: 'rgba(61,16,32,0.25)',
                          borderStyle: 'dashed',
                          alignItems: 'center', justifyContent: 'center', gap: 4,
                        }}>
                          <Text style={{ fontSize: 60 }}>📷</Text>
                          <Text style={{ color: '#7A3448', fontSize: 14, fontWeight: '600' }}>Add Photo</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                    <Text style={{ color: '#7A3448', fontSize: 13, marginTop: 8 }}>
                      {photoUri ? 'Tap to change' : 'Optional'}
                    </Text>
                  </View>

                  <Text style={[s.fieldLabel, { color: '#7A3448' }]}>Full Name *</Text>
                  <TextInput style={[s.input, { backgroundColor: 'rgba(61,16,32,0.08)', borderColor: 'rgba(61,16,32,0.2)', color: '#3D1020' }]}
                    placeholder="e.g. Sarah Johnson"
                    placeholderTextColor="rgba(61,16,32,0.35)"
                    value={form.name} onChangeText={v => setForm(f => ({ ...f, name: v }))} />

                  <Text style={[s.fieldLabel, { color: '#7A3448' }]}>Email Address *</Text>
                  <TextInput style={[s.input, { backgroundColor: 'rgba(61,16,32,0.08)', borderColor: 'rgba(61,16,32,0.2)', color: '#3D1020' }]}
                    placeholder="their@email.com"
                    placeholderTextColor="rgba(61,16,32,0.35)"
                    value={form.email} onChangeText={v => setForm(f => ({ ...f, email: v }))}
                    autoCapitalize="none" keyboardType="email-address" />

                  <Text style={[s.fieldLabel, { color: '#7A3448' }]}>Phone Number (optional)</Text>
                  <TextInput style={[s.input, { backgroundColor: 'rgba(61,16,32,0.08)', borderColor: 'rgba(61,16,32,0.2)', color: '#3D1020' }]}
                    placeholder="e.g. 1-604-555-0123"
                    placeholderTextColor="rgba(61,16,32,0.35)"
                    value={form.phone} onChangeText={v => setForm(f => ({ ...f, phone: v }))}
                    keyboardType="phone-pad" />

                  <Text style={[s.fieldLabel, { color: '#7A3448' }]}>Who is this person to you?</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {RELATIONSHIPS.map(rel => (
                        <TouchableOpacity key={rel}
                          onPress={() => setForm(f => ({ ...f, relationship: rel }))}
                          style={[s.chipBtn,
                            { borderColor: 'rgba(61,16,32,0.3)' },
                            form.relationship === rel && { borderColor: '#F06292', backgroundColor: 'rgba(240,98,146,0.18)' },
                          ]}>
                          <Text style={[s.chipText,
                            { color: '#7A3448' },
                            form.relationship === rel && { color: '#3D1020', fontWeight: '700' },
                          ]}>{rel}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>

                  {/* ── Personal label ───────────────────────────────────── */}
                  <Text style={[s.fieldLabel, { color: '#7A3448' }]}>What do you call them? (optional)</Text>
                  <TextInput
                    style={[s.modalInput, { marginBottom: 20, borderWidth: 2, borderColor: '#F06292' }]}
                    placeholder={`e.g. Dad, Grandma Rose, Little Sis`}
                    placeholderTextColor="rgba(61,16,32,0.35)"
                    value={form.relationship_label}
                    onChangeText={v => setForm(f => ({ ...f, relationship_label: v }))}
                    maxLength={40}
                  />

                  {/* ── Date of Birth picker ──────────────────────────────── */}
                  <DateField
                    label="Date of Birth (optional)"
                    hasValue={hasDob}
                    value={formatDateObj(dobDate)}
                    open={showDobPicker}
                    onOpen={() => { setShowDobPicker(v => !v); setShowAnnivPicker(false); setHasDob(true) }}
                    onClear={() => { setHasDob(false); setShowDobPicker(false); setDobDate(defaultDob()) }}>
                    <CalendarPicker
                      value={dobDate}
                      onChange={setDobDate}
                      maxYear={CURRENT_YEAR}
                      minYear={CURRENT_YEAR - 120}
                    />
                  </DateField>

                  {/* ── Anniversary (spouse only) ─────────────────────────── */}
                  {['Husband', 'Wife', 'Partner', 'Spouse'].includes(form.relationship) && (
                    <DateField
                      label="Anniversary (optional)"
                      hasValue={hasAnniv}
                      value={formatDateObj(annivDate)}
                      open={showAnnivPicker}
                      onOpen={() => { setShowAnnivPicker(v => !v); setShowDobPicker(false); setHasAnniv(true) }}
                      onClear={() => { setHasAnniv(false); setShowAnnivPicker(false); setAnnivDate(defaultAnniv()) }}>
                      <CalendarPicker
                        value={annivDate}
                        onChange={setAnnivDate}
                        maxYear={CURRENT_YEAR}
                        minYear={CURRENT_YEAR - 80}
                      />
                    </DateField>
                  )}

                  {/* ── Trusted contact toggle ────────────────────────────── */}
                  <TouchableOpacity
                    style={[s.listRow, { marginHorizontal: 0, marginBottom: 20,
                      backgroundColor: form.trusted ? 'rgba(240,98,146,0.18)' : 'rgba(61,16,32,0.08)',
                      borderWidth: 1, borderColor: form.trusted ? 'rgba(240,98,146,0.5)' : 'rgba(61,16,32,0.15)',
                    }]}
                    onPress={() => setForm(f => ({ ...f, trusted: !f.trusted }))}>
                    <View style={s.listInfo}>
                      <Text style={[s.listLabel, { color: '#3D1020' }]}>⭐ Trusted Contact</Text>
                      <Text style={[s.listDesc, { color: '#7A3448' }]}>This person can unlock your family's access</Text>
                    </View>
                    <View style={[s.checkBox,
                      { borderColor: 'rgba(61,16,32,0.3)' },
                      form.trusted && { backgroundColor: '#F06292', borderColor: '#F06292' },
                    ]}>
                      {form.trusted && <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>✓</Text>}
                    </View>
                  </TouchableOpacity>

                  {/* ── Phone emergency contact toggle (edit mode only) ────── */}
                  {editingMember && (
                    <TouchableOpacity
                      style={[s.listRow, { marginHorizontal: 0, marginBottom: 20,
                        backgroundColor: emergencyInEdit ? 'rgba(10,132,255,0.10)' : 'rgba(61,16,32,0.08)',
                        borderWidth: 1, borderColor: emergencyInEdit ? 'rgba(10,132,255,0.4)' : 'rgba(61,16,32,0.15)',
                        opacity: (!emergencyInEdit && !editingMember.is_emergency_contact && emergencyCount >= 3) ? 0.45 : 1,
                      }]}
                      activeOpacity={0.8}
                      onPress={async () => {
                        const phoneAvail = form.phone.trim() || editingMember.phone
                        if (!emergencyInEdit && !phoneAvail) {
                          setSaveMsg('A phone number is required for phone emergency access.')
                          return
                        }
                        if (!emergencyInEdit && !editingMember.is_emergency_contact && emergencyCount >= 3) {
                          setSaveMsg('You can set up to 3 phone emergency contacts. Remove one first.')
                          return
                        }
                        setSaveMsg('')
                        await handleToggleEmergency({ ...editingMember, is_emergency_contact: emergencyInEdit })
                        setEmergencyInEdit(v => !v)
                      }}>
                      <View style={s.listInfo}>
                        <Text style={[s.listLabel, { color: '#3D1020' }]}>📱 Phone Emergency Contact</Text>
                        <Text style={[s.listDesc, { color: '#7A3448' }]}>Add to phone lock screen so first responders can call</Text>
                        {!(form.phone.trim() || editingMember.phone) && (
                          <Text style={{ color: '#B05A00', fontSize: 11, marginTop: 2 }}>
                            ⚠️ Requires a phone number
                          </Text>
                        )}
                      </View>
                      <View style={[s.checkBox,
                        { borderColor: 'rgba(61,16,32,0.3)' },
                        emergencyInEdit && { backgroundColor: '#0A84FF', borderColor: '#0A84FF' },
                      ]}>
                        {emergencyInEdit && <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>✓</Text>}
                      </View>
                    </TouchableOpacity>
                  )}

                </ScrollView>

                {/* ── Sticky footer — always visible, never scrolls away ── */}
                <View style={{
                  paddingHorizontal: 20, paddingTop: 12, paddingBottom: Platform.OS === 'ios' ? 28 : 16,
                  borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.4)',
                  backgroundColor: 'transparent',
                }}>
                  {saveMsg ? <Text style={{ color: '#C0392B', fontSize: 14, marginBottom: 10 }}>{saveMsg}</Text> : null}

                  <TouchableOpacity onPress={handleInvite}
                    disabled={saving || uploadingPhoto} activeOpacity={0.85} style={{ marginBottom: 8 }}>
                    <LinearGradient colors={PLUM} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.btnPrimary}>
                      {saving || uploadingPhoto
                        ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <ActivityIndicator color="#fff" />
                            <Text style={[s.btnPrimaryText, { color: '#fff' }]}>{uploadingPhoto ? 'Uploading photo…' : 'Saving…'}</Text>
                          </View>
                        : <Text style={[s.btnPrimaryText, { color: '#fff' }]}>{editingMember ? 'Save Changes' : 'Send Invite'}</Text>}
                    </LinearGradient>
                  </TouchableOpacity>

                  {/* ── Delete — only shown when editing an existing member ── */}
                  {editingMember ? (
                    <TouchableOpacity
                      onPress={() => {
                        setShowModal(false)
                        setDeleteConfirmText('')
                        setConfirmDelete(editingMember)
                      }}
                      activeOpacity={0.85}>
                      <View style={[s.btnPrimary, {
                        backgroundColor: 'rgba(180,30,30,0.12)',
                        borderWidth: 1, borderColor: 'rgba(180,30,30,0.3)',
                        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
                      }]}>
                        <Text style={{ fontSize: 18 }}>🗑️</Text>
                        <Text style={[s.btnPrimaryText, { color: '#B41E1E' }]}>Remove {editingMember.name}</Text>
                      </View>
                    </TouchableOpacity>
                  ) : null}
                </View>

              </LinearGradient>
            </View>
            </TouchableOpacity>
          </KeyboardAvoidingView>
        </TouchableOpacity>
      </Modal>

      {/* ── Delete Confirmation ─────────────────────────────────────────────── */}
      <Modal visible={!!confirmDelete} transparent animationType="fade"
        onRequestClose={() => { setConfirmDelete(null); setDeleteConfirmText('') }}>
        <TouchableOpacity style={s.confirmOverlay} activeOpacity={1} onPress={() => { setConfirmDelete(null); setDeleteConfirmText('') }}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
          <View style={s.confirmBox}>
            <LinearGradient colors={WARM} style={[s.confirmInner, { paddingBottom: 28 }]}>

              {/* Icon + title — different for Sokha */}
              <Text style={[s.confirmIcon, { fontSize: 36 }]}>
                {confirmDelete?.is_founder_contact ? '👋' : '⚠️'}
              </Text>
              <Text style={[s.confirmTitle, { color: WM.title }]}>
                {confirmDelete?.is_founder_contact ? 'Remove Sokha?' : 'Remove Family Member?'}
              </Text>

              {/* Founder explanation OR standard warning */}
              {confirmDelete?.is_founder_contact ? (
                <View style={{
                  backgroundColor: 'rgba(240,98,146,0.08)', borderRadius: 14,
                  borderWidth: 1.5, borderColor: 'rgba(240,98,146,0.25)',
                  padding: 14, marginBottom: 20, width: '100%',
                }}>
                  <Text style={{ color: WM.title, fontSize: 14, fontWeight: '700', marginBottom: 6 }}>
                    About this contact
                  </Text>
                  <Text style={{ color: WM.sub, fontSize: 13, lineHeight: 20 }}>
                    Sokha is the founder of Solace Life. He added himself so you'd never feel alone getting started — and so you always had someone to reach out to.{'\n\n'}
                    You can remove him anytime. It won't affect your account.
                  </Text>
                </View>
              ) : (
                <View style={{
                  backgroundColor: 'rgba(240,98,146,0.10)', borderRadius: 14,
                  borderWidth: 1.5, borderColor: 'rgba(240,98,146,0.35)',
                  padding: 14, marginBottom: 20, width: '100%',
                }}>
                  <Text style={{ color: WM.title, fontSize: 14, fontWeight: '700', marginBottom: 6 }}>
                    This will permanently remove:
                  </Text>
                  <Text style={{ color: WM.sub, fontSize: 13, lineHeight: 20 }}>
                    {'• '}
                    <Text style={{ fontWeight: '700', color: WM.title }}>{confirmDelete?.name}</Text>
                    {' from your family list\n'}
                    {'• Their consent and invitation history\n'}
                    {'• All scheduled deliveries to them\n'}
                    {'• Any future messages planned for them'}
                  </Text>
                </View>
              )}

              {/* Name-verify prompt */}
              <Text style={{ color: WM.sub, fontSize: 13, marginBottom: 8, textAlign: 'center', lineHeight: 19 }}>
                To confirm, type the first{' '}
                <Text style={{ color: WM.title, fontWeight: '700' }}>
                  3 letters of {confirmDelete?.name?.split(' ')[0]}'s name
                </Text>
              </Text>
              <TextInput
                style={{
                  backgroundColor: WM.inputBg,
                  color: WM.title,
                  borderColor: deleteConfirmText.length >= 3
                    ? 'rgba(240,98,146,0.7)'
                    : WM.border,
                  borderWidth: 1.5,
                  borderRadius: 12,
                  padding: 14,
                  fontSize: 20,
                  fontWeight: '700',
                  letterSpacing: 4,
                  textAlign: 'center',
                  width: '100%',
                  marginBottom: 20,
                }}
                placeholder={confirmDelete?.name?.slice(0, 3).toUpperCase() ?? '???'}
                placeholderTextColor="rgba(122,52,72,0.35)"
                value={deleteConfirmText}
                onChangeText={v => setDeleteConfirmText(v.slice(0, 3))}
                autoCapitalize="characters"
                maxLength={3}
              />

              {/* Actions */}
              <View style={[s.confirmActions, { gap: 10 }]}>
                <TouchableOpacity
                  style={[s.confirmCancel, { borderColor: WM.border, backgroundColor: WM.cardBg, flex: 1 }]}
                  onPress={() => { setConfirmDelete(null); setDeleteConfirmText('') }}>
                  <Text style={[s.confirmCancelText, { color: WM.title }]}>
                    {confirmDelete?.is_founder_contact ? 'Keep Sokha' : 'Keep Them'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.confirmDelete, {
                    flex: 1,
                    backgroundColor: deleteConfirmText.toLowerCase() === (confirmDelete?.name?.slice(0, 3).toLowerCase() ?? '')
                      ? '#EF4444'
                      : 'rgba(180,180,180,0.4)',
                    borderColor: 'rgba(255,255,255,0.5)',
                  }]}
                  onPress={handleDeleteMember}
                  disabled={deleting || deleteConfirmText.toLowerCase() !== (confirmDelete?.name?.slice(0, 3).toLowerCase() ?? '')}>
                  {deleting
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={[s.confirmDeleteText, { color: '#fff' }]}>Remove</Text>}
                </TouchableOpacity>
              </View>

            </LinearGradient>
          </View>
          </TouchableOpacity>
          </KeyboardAvoidingView>
        </TouchableOpacity>
      </Modal>
      {/* ── Medical ID Setup Guide (iOS only) ────────────────────────────────── */}
      {Platform.OS === 'ios' && (
        <Modal
          visible={showMedicalIdGuide}
          transparent
          animationType="slide"
          onRequestClose={() => setShowMedicalIdGuide(false)}>
          <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setShowMedicalIdGuide(false)}>
            <TouchableOpacity activeOpacity={1} onPress={() => {}}>
            <View style={[s.modalSheet, { maxHeight: '92%' }]}>
              <LinearGradient colors={['#003087', '#0A84FF', '#40A9FF']} style={s.modalInner}>

                {/* Header */}
                <View style={s.modalHeader}>
                  <Text style={[s.modalTitle, { color: '#fff' }]}>🏥 Enable Phone Emergency Feature</Text>
                  <TouchableOpacity onPress={() => setShowMedicalIdGuide(false)} style={{ padding: 4 }}>
                    <View style={s.modalCloseBtn}><Text style={s.modalCloseX}>✕</Text></View>
                  </TouchableOpacity>
                </View>

                <ScrollView showsVerticalScrollIndicator={true}>

                  {/* Why this matters */}
                  <View style={{ backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 14, padding: 16, marginBottom: 20 }}>
                    <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700', marginBottom: 6 }}>
                      Two layers of protection
                    </Text>
                    <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, lineHeight: 20 }}>
                      Your trusted contacts are already set up in Solace Life — they'll be notified if you miss check-ins and will be able to see the vault documents you chose for them.{'\n\n'}
                      This optional step adds them to iPhone Medical ID so first responders can also call them directly from your locked screen — no passcode needed. Apple's security prevents apps from doing this automatically, so it must be set up manually.
                    </Text>
                  </View>

                  {/* Steps */}
                  <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '700',
                    letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 12 }}>
                    How a first responder calls your contacts
                  </Text>

                  {[
                    {
                      icon: '📱',
                      title: 'Press side button 5 times',
                      body: 'On any locked iPhone — no passcode, no Face ID. This opens the Emergency SOS screen.',
                    },
                    {
                      icon: '🏥',
                      title: 'Tap "Medical ID" bottom-left',
                      body: 'A button appears bottom-left of the Emergency SOS screen. Fully accessible without unlocking.',
                    },
                    {
                      icon: '📞',
                      title: 'Tap a contact to call',
                      body: 'Your trusted contacts appear with a green phone button next to each name. One tap dials.',
                    },
                  ].map((step, i) => (
                    <View key={i} style={{ flexDirection: 'row', gap: 14, marginBottom: 16,
                      backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 14, padding: 14 }}>
                      <View style={{ width: 44, height: 44, borderRadius: 22,
                        backgroundColor: 'rgba(255,255,255,0.2)',
                        alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Text style={{ fontSize: 22 }}>{step.icon}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <View style={{ width: 20, height: 20, borderRadius: 10,
                            backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ color: '#0A84FF', fontSize: 11, fontWeight: '800' }}>{i + 1}</Text>
                          </View>
                          <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>{step.title}</Text>
                        </View>
                        <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, lineHeight: 19 }}>
                          {step.body}
                        </Text>
                      </View>
                    </View>
                  ))}

                  {/* How to set up Medical ID */}
                  <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '700',
                    letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 12, marginTop: 4 }}>
                    Set it up now (takes 2 minutes)
                  </Text>

                  {[
                    'Open the Health app on your iPhone',
                    'Tap your profile photo (top-right)',
                    'Tap "Medical ID" → "Edit"',
                    'Add your trusted contacts by name & phone number',
                    'Turn on "Show When Locked" — critical step',
                    'Tap "Done" to save',
                  ].map((step, i) => (
                    <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start',
                      gap: 12, marginBottom: 10 }}>
                      <View style={{ width: 24, height: 24, borderRadius: 12,
                        borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.5)',
                        alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                        <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{i + 1}</Text>
                      </View>
                      <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14, flex: 1, lineHeight: 20,
                        fontWeight: step.includes('Show When Locked') ? '700' : '400' }}>
                        {step}
                      </Text>
                    </View>
                  ))}

                  {/* Open Health app button */}
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => Linking.openURL('x-apple-health://')}
                    style={{ backgroundColor: '#fff', borderRadius: 16,
                      paddingVertical: 16, alignItems: 'center', marginTop: 16, marginBottom: 8 }}>
                    <Text style={{ color: '#0A84FF', fontSize: 17, fontWeight: '700' }}>
                      Open Health App →
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => setShowMedicalIdGuide(false)}
                    style={{ paddingVertical: 14, alignItems: 'center', marginBottom: 4 }}>
                    <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14 }}>Done</Text>
                  </TouchableOpacity>

                </ScrollView>
              </LinearGradient>
            </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}

      {/* ── Occasion Suggestion Modal ───────────────────────────────────────── */}
      <Modal
        visible={showOccasionSuggest}
        transparent
        animationType="slide"
        onRequestClose={dismissSuggestions}>
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={dismissSuggestions}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
          <View style={[s.modalSheet, { maxHeight: '92%' }]}>
            <LinearGradient colors={['#F06292', '#F48A5A', '#FFD07A']} style={[s.modalInner, { maxHeight: '92%' }]}>

              {/* Drag handle */}
              <View style={{ alignItems: 'center', paddingTop: 8, paddingBottom: 4 }}>
                <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#3D102066' }} />
              </View>

              {/* Header */}
              <View style={[s.modalHeader, { paddingBottom: 8 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.upgradeModalTitle, { color: '#3D1020' }]}>
                    {suggestMember?.isUpdate ? '✨ Updated moments for ' : '💌 Moments to capture for '}{suggestMember?.name}
                  </Text>
                  <Text style={{ color: '#7A3448', fontSize: 13, marginTop: 2 }}>
                    {suggestMember?.isUpdate
                      ? `Relationship changed to ${suggestMember.relationship.toLowerCase()} — here are updated suggestions`
                      : `Suggested for ${suggestMember?.relationship.toLowerCase()} — tap to add or remove`}
                  </Text>
                </View>
                <TouchableOpacity onPress={dismissSuggestions} style={{ padding: 4 }}>
                  <View style={s.modalCloseBtn}><Text style={s.modalCloseX}>✕</Text></View>
                </TouchableOpacity>
              </View>

              {/* Soft explanation */}
              <View style={{
                marginHorizontal: 16, marginBottom: 12, padding: 12, borderRadius: 12,
                backgroundColor: 'rgba(255,255,255,0.45)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)',
                flexDirection: 'row', alignItems: 'flex-start', gap: 8,
              }}>
                <Text style={{ fontSize: 13 }}>💡</Text>
                <Text style={{ color: '#7A3448', fontSize: 12, lineHeight: 17, flex: 1 }}>
                  These reminders will prompt you to record a message for {suggestMember?.name} when each moment approaches. You can always edit your occasions in Settings.
                </Text>
              </View>

              {/* Occasion tiles */}
              <ScrollView showsVerticalScrollIndicator={true} style={{ flex: 1 }}>
                <View style={{
                  flexDirection: 'row', flexWrap: 'wrap', gap: 10,
                  paddingHorizontal: 16, paddingTop: 4, paddingBottom: 24,
                }}>
                  {suggestAllKeys.map(key => {
                    const occ     = OCCASIONS_MAP[key]
                    if (!occ) return null
                    const isSel      = suggestSelections.has(key)
                    const alreadyHad = userOccasionKeys.includes(key)
                    return (
                      <TouchableOpacity
                        key={key}
                        onPress={() => setSuggestSelections(prev => {
                          const next = new Set(prev)
                          if (next.has(key)) next.delete(key)
                          else next.add(key)
                          return next
                        })}
                        activeOpacity={0.8}
                        style={{
                          width: '47%',
                          borderRadius: 14, borderWidth: isSel ? 2 : 1,
                          borderColor: isSel ? '#F06292' : 'rgba(61,16,32,0.15)',
                          backgroundColor: isSel ? 'rgba(240,98,146,0.12)' : 'rgba(255,255,255,0.78)',
                          padding: 13, minHeight: 80, justifyContent: 'space-between',
                        }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                          <Text style={{ fontSize: 22 }}>{occ.icon}</Text>
                          {isSel ? (
                            <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: '#F06292',
                              alignItems: 'center', justifyContent: 'center' }}>
                              <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>✓</Text>
                            </View>
                          ) : null}
                        </View>
                        <Text style={{ color: '#3D1020', fontSize: 12, fontWeight: isSel ? '700' : '600', marginBottom: 2 }} numberOfLines={1}>
                          {occ.label}
                        </Text>
                        {alreadyHad && (
                          <Text style={{ color: '#F06292', fontSize: 9, fontWeight: '600' }}>already in your list</Text>
                        )}
                      </TouchableOpacity>
                    )
                  })}
                </View>
              </ScrollView>

              {/* Footer actions */}
              <View style={{
                paddingHorizontal: 16, paddingTop: 12,
                paddingBottom: Platform.OS === 'ios' ? 40 : 16,
                borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.4)',
                backgroundColor: 'rgba(255,255,255,0.92)',
                gap: 8,
              }}>
                <TouchableOpacity
                  onPress={saveSuggestions}
                  disabled={suggestSaving}
                  activeOpacity={0.85}>
                  <LinearGradient colors={PLUM} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.btnPrimary, { opacity: suggestSelections.size > 0 ? 1 : 0.35 }]}>
                    {suggestSaving
                      ? <ActivityIndicator color="#fff" />
                      : <Text style={[s.btnPrimaryText, { color: '#fff' }]}>
                          {suggestSelections.size > 0
                            ? `Save ${suggestSelections.size} moment${suggestSelections.size !== 1 ? 's' : ''}`
                            : 'No moments selected'}
                        </Text>}
                  </LinearGradient>
                </TouchableOpacity>
                <TouchableOpacity onPress={dismissSuggestions} activeOpacity={0.7}
                  style={{ paddingVertical: 12, alignItems: 'center' }}>
                  <Text style={{ color: '#7A3448', fontSize: 14 }}>Skip for now</Text>
                </TouchableOpacity>
              </View>

            </LinearGradient>
          </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── G1 Sender Detail Bottom Sheet ──────────────────────────────────── */}
      <Modal
        visible={selectedSender !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedSender(null)}
      >
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setSelectedSender(null)}>
          {/* Sheet: no flex — sizes to content, capped by maxHeight so ScrollView kicks in */}
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
          <View style={[s.modalSheet, { maxHeight: '90%', overflow: 'hidden' }]}>
            <LinearGradient
              colors={WARM}
              style={{ borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 24 }}
            >
              {/* Drag handle */}
              <View style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 6 }}>
                <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(61,16,32,0.3)' }} />
              </View>

              {/* Close button — absolute, always visible */}
              <TouchableOpacity
                onPress={() => setSelectedSender(null)}
                style={{ position: 'absolute', top: 16, right: 16, zIndex: 10 }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <View style={s.modalCloseBtn}><Text style={s.modalCloseX}>✕</Text></View>
              </TouchableOpacity>

              {/* All scrollable content */}
              <ScrollView
                showsVerticalScrollIndicator={true}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingBottom: Platform.OS === 'ios' ? 36 : 24 }}
              >
                {/* Avatar */}
                {selectedSender !== null ? (
                  <View style={{ alignItems: 'center', marginTop: 8, marginBottom: 16 }}>
                    {selectedSender.photoUrl ? (
                      <Image
                        source={{ uri: selectedSender.photoUrl }}
                        style={{ width: 160, height: 160, borderRadius: 80, borderWidth: 3, borderColor: 'rgba(255,255,255,0.7)' }}
                      />
                    ) : (
                      <View style={{ width: 160, height: 160, borderRadius: 80, borderWidth: 3,
                        borderColor: 'rgba(255,255,255,0.7)',
                        backgroundColor: avatarColor(selectedSender.senderName) + '33',
                        alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 56, fontWeight: '700', color: avatarColor(selectedSender.senderName) }}>
                          {selectedSender.senderName.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)}
                        </Text>
                      </View>
                    )}
                  </View>
                ) : null}

                {/* Name + relationship pill */}
                {selectedSender !== null ? (
                  <View style={{ alignItems: 'center', gap: 8, marginBottom: 20 }}>
                    <Text style={{ fontSize: 24, fontWeight: '800', color: WM.title, textAlign: 'center' }}>
                      {selectedSender.senderName}
                    </Text>
                    {getReciprocalLabel(selectedSender.relationshipLabel) !== null ? (
                      <View style={{ backgroundColor: WM.accentBg, borderRadius: 20, borderWidth: 1,
                        borderColor: WM.accent + '66', paddingHorizontal: 16, paddingVertical: 5 }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: WM.accent }}>
                          {getReciprocalLabel(selectedSender.relationshipLabel)}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}

                {/* Info cards */}
                <View style={{ gap: 12 }}>

                  <View style={{ backgroundColor: WM.cardBg, borderRadius: 16, borderWidth: 1,
                    borderColor: WM.border, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                    <Text style={{ fontSize: 26 }}>💜</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: WM.title, marginBottom: 3 }}>
                        Preserving moments for you
                      </Text>
                      <Text style={{ fontSize: 12, color: WM.sub, lineHeight: 17 }}>
                        They are recording stories, wisdom, and love to be delivered to you over time.
                      </Text>
                    </View>
                  </View>

                  <View style={{ backgroundColor: WM.cardBg, borderRadius: 16, borderWidth: 1,
                    borderColor: WM.border, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                    <Text style={{ fontSize: 26 }}>💌</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: WM.title, marginBottom: 3 }}>
                        Their messages live in Moments
                      </Text>
                      <Text style={{ fontSize: 12, color: WM.sub, lineHeight: 17 }}>
                        Open the Moments tab to replay every message they have sent you.
                      </Text>
                    </View>
                  </View>

                  {selectedSender?.senderEmail ? (
                    <View style={{ backgroundColor: WM.cardBg, borderRadius: 16, borderWidth: 1,
                      borderColor: WM.border, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                      <Text style={{ fontSize: 26 }}>✉️</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: WM.sub, marginBottom: 2 }}>Email</Text>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: WM.title }}>
                          {selectedSender.senderEmail}
                        </Text>
                      </View>
                    </View>
                  ) : null}

                </View>

                {/* Close button */}
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => setSelectedSender(null)}
                  style={{ marginTop: 20 }}>
                  <LinearGradient colors={PLUM} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 14, paddingVertical: 15, alignItems: 'center' }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>Close</Text>
                  </LinearGradient>
                </TouchableOpacity>

              </ScrollView>

            </LinearGradient>
          </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

    </ScreenWrap>
  )
}
