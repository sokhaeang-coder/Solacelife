import { useState, useEffect, useRef, useContext } from 'react'
import { Text, View, TouchableOpacity, TextInput, ActivityIndicator,
  ScrollView, Modal, KeyboardAvoidingView, Platform, Animated, Image } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Audio } from 'expo-av'
import { VideoView, useVideoPlayer } from 'expo-video'
import * as FileSystem from 'expo-file-system/legacy'
import * as ImagePicker from 'expo-image-picker'
import { supabase } from '../lib/supabase'
import { C, WARM, WM, PLUM } from '../lib/constants'
import { s } from '../lib/styles'
import ScreenWrap from '../components/ScreenWrap'
import { CalendarPicker } from '../components/CalendarPicker'
import { getUpcomingOccasions, buildOccasionNudge } from '../lib/occasions'
import { AuthContext } from '../lib/AuthContext'

const MEMORY_TYPES = [
  { key: 'written', label: 'Written Story',  icon: '📖', desc: 'Write a message or life story',     available: true  },
  { key: 'voice',   label: 'Voice Memo',     icon: '🎙️', desc: 'Record your voice for loved ones', available: true  },
  { key: 'video',   label: 'Video Message',  icon: '🎬', desc: 'Record or upload a video message',   available: true  },
  { key: 'photo',   label: 'Photo Album',    icon: '📸', desc: 'Preserve cherished photos',          available: true  },
]

const EMPTY_MEMORY_FORM = { title: '', type: 'written', description: '', content: '' }
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function defaultScheduleDate() {
  const d = new Date()
  // Default to today so testers can schedule same-day deliveries.
  // Change back to d.setDate(d.getDate() + 1) before production launch.
  return { month: d.getMonth() + 1, day: d.getDate(), year: d.getFullYear() }
}

function fmtDuration(secs: number) {
  const m = Math.floor(secs / 60)
  const sc = secs % 60
  return `${String(m).padStart(2, '0')}:${String(sc).padStart(2, '0')}`
}

// Pure-JS base64 → Uint8Array decoder.
// Does NOT rely on atob() or fetch(data:…) — both are unreliable on React
// Native / Hermes. Works in every JS environment with zero dependencies.
function base64ToBytes(base64: string): Uint8Array {
  const TABLE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  const lookup = new Uint8Array(256)
  for (let i = 0; i < TABLE.length; i++) lookup[TABLE.charCodeAt(i)] = i
  const clean  = base64.replace(/[^A-Za-z0-9+/]/g, '')   // strip padding / whitespace
  const outLen = Math.floor(clean.length * 3 / 4)
  const out    = new Uint8Array(outLen)
  let p = 0
  for (let i = 0; i < clean.length; i += 4) {
    const a = lookup[clean.charCodeAt(i)]
    const b = lookup[clean.charCodeAt(i + 1)]
    const c = lookup[clean.charCodeAt(i + 2)] ?? 0
    const d = lookup[clean.charCodeAt(i + 3)] ?? 0
    out[p++] = (a << 2) | (b >> 4)
    if (i + 2 < clean.length) out[p++] = ((b & 0xf) << 4) | (c >> 2)
    if (i + 3 < clean.length) out[p++] = ((c & 0x3) << 6) | d
  }
  return out.slice(0, p)
}

function Waveform({ playing }: { playing: boolean }) {
  const bars = [useRef(new Animated.Value(0.4)).current,
                useRef(new Animated.Value(0.6)).current,
                useRef(new Animated.Value(0.9)).current,
                useRef(new Animated.Value(0.5)).current,
                useRef(new Animated.Value(0.8)).current,
                useRef(new Animated.Value(0.3)).current,
                useRef(new Animated.Value(0.7)).current]

  useEffect(() => {
    if (playing) {
      const animations = bars.map((bar, i) =>
        Animated.loop(Animated.sequence([
          Animated.timing(bar, { toValue: 0.2 + Math.random() * 0.8, duration: 200 + i * 60, useNativeDriver: true }),
          Animated.timing(bar, { toValue: 0.2 + Math.random() * 0.6, duration: 200 + i * 60, useNativeDriver: true }),
        ]))
      )
      animations.forEach(a => a.start())
      return () => animations.forEach(a => a.stop())
    } else {
      bars.forEach((bar, i) => {
        Animated.timing(bar, { toValue: [0.4,0.6,0.9,0.5,0.8,0.3,0.7][i], duration: 200, useNativeDriver: true }).start()
      })
    }
  }, [playing])

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, height: 24 }}>
      {bars.map((bar, i) => (
        <Animated.View key={i} style={{
          width: 3, height: 24, borderRadius: 2,
          backgroundColor: playing ? C.accent : C.greyDim,
          transform: [{ scaleY: bar }],
        }} />
      ))}
    </View>
  )
}

// ── Standalone video player ───────────────────────────────────────────────
// Single persistent instance — player is never remounted between opens.
// replaceAsync loads the new source; pause() stops audio on close.
function VideoPlayerModal({
  visible, item, signedUrl, onClose,
}: { visible: boolean; item: any; signedUrl: string | null; onClose: () => void }) {
  // Always start with null source — replaceAsync loads it when ready
  const player = useVideoPlayer(null, p => { p.loop = false })
  const [playerError, setPlayerError] = useState(false)
  const [playerReady, setPlayerReady] = useState(false)

  // ── Stop playback whenever the modal is hidden ────────────────────────────
  useEffect(() => {
    if (!visible) {
      try { player.pause() } catch {}
      setPlayerReady(false)
      setPlayerError(false)
    }
  }, [visible, player])

  // ── Load source when the URI arrives ─────────────────────────────────────
  // replaceAsync resolves only after the source is fully loaded — safe to
  // call play() immediately after without a separate statusChange listener.
  useEffect(() => {
    if (!signedUrl || !visible) return
    setPlayerReady(false)
    setPlayerError(false)
    let cancelled = false
    ;(async () => {
      try {
        await player.replaceAsync(signedUrl)
        if (!cancelled) setPlayerReady(true)
      } catch (e: any) {
        if (!cancelled) {
          console.warn('VideoPlayer load error:', e?.message ?? e)
          setPlayerError(true)
        }
      }
    })()
    return () => { cancelled = true }
  }, [signedUrl, visible, player])

  // ── Play as soon as source is confirmed ready ────────────────────────────
  useEffect(() => {
    if (playerReady) { try { player.play() } catch {} }
  }, [playerReady, player])

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent>
      <View style={[s.videoPlayerOverlay, Platform.OS === 'web' && {
        position: 'fixed' as any, top: 0, left: 0, right: 0, bottom: 0, zIndex: 999,
        width: '100%' as any, height: '100%' as any,
      }]}>
        <View style={s.videoPlayerHeader}>
          <Text style={s.videoPlayerTitle} numberOfLines={2}>{item?.title}</Text>
          <TouchableOpacity
            onPress={onClose}
            style={s.videoPlayerCloseBtn}
            accessibilityLabel="Close video"
            accessibilityRole="button">
            <Text style={s.videoPlayerCloseIcon}>✕</Text>
          </TouchableOpacity>
        </View>

        {playerError ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 32 }}>
            <Text style={{ fontSize: 44 }}>⚠️</Text>
            <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700', textAlign: 'center' }}>
              Video could not be loaded
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, textAlign: 'center', lineHeight: 20 }}>
              There was a problem playing this video. Please try again.
            </Text>
            <TouchableOpacity onPress={onClose}
              style={{ marginTop: 8, paddingVertical: 12, paddingHorizontal: 28,
                backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 12 }}>
              <Text style={{ color: '#FFD07A', fontSize: 16, fontWeight: '700' }}>Close</Text>
            </TouchableOpacity>
          </View>
        ) : (
          /* Always render VideoView — it shows a blank frame until the player is ready */
          <VideoView
            player={player}
            style={[s.videoPlayerVideo, Platform.OS === 'web' && {
              width: '100%' as any, height: undefined, aspectRatio: 16 / 9,
            }]}
            contentFit="contain"
            nativeControls
          />
        )}
        {/* Loading spinner overlaid until player is ready */}
        {!playerReady && !playerError && (
          <ActivityIndicator
            color={C.amber} size="large"
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          />
        )}
      </View>
    </Modal>
  )
}

export default function MemoriesScreen({ navigation }: any) {
  const { accountType } = useContext(AuthContext) as any

  // ── Received memories (sent TO this user by others) ──
  const [receivedGroups, setReceivedGroups]   = useState<{
    senderName: string; senderId: string; deliveries: any[]
  }[]>([])
  const [receivedLoading, setReceivedLoading] = useState(false)
  const [viewReceivedItem, setViewReceivedItem] = useState<any>(null)

  // ── Written story state ──
  const [memories, setMemories]       = useState<any[]>([])
  const [loading, setLoading]         = useState(true)
  const [userOccasionKeys, setUserOccasionKeys] = useState<string[]>([])
  const [showModal, setShowModal]     = useState(false)
  const [editingItem, setEditingItem] = useState<any>(null)
  const [form, setForm]               = useState({ ...EMPTY_MEMORY_FORM })
  // storyHeight removed — TextInput uses minHeight only, grows naturally with content
  const [saving, setSaving]           = useState(false)
  const [saveMsg, setSaveMsg]         = useState('')
  const [createStep, setCreateStep]   = useState<1 | 2>(1)
  const stepFade = useRef(new Animated.Value(1)).current
  const [confirmDelete, setConfirmDelete] = useState<any>(null)
  const [deleting, setDeleting]           = useState(false)
  const [viewItem, setViewItem]       = useState<any>(null)

  // ── Voice memo state ──
  const [showVoiceModal, setShowVoiceModal]   = useState(false)
  const [isRecording, setIsRecording]         = useState(false)
  const [recDuration, setRecDuration]         = useState(0)
  const [recordedUri, setRecordedUri]         = useState<string | null>(null)
  const [voiceTitle, setVoiceTitle]           = useState('')
  const [uploadingVoice, setUploadingVoice]   = useState(false)
  const [voiceMsg, setVoiceMsg]               = useState('')
  const recordingRef  = useRef<Audio.Recording | null>(null)
  const recTimerRef   = useRef<any>(null)
  const pulseAnim     = useRef(new Animated.Value(1)).current

  // ── Video state ──
  const [showVideoModal, setShowVideoModal]   = useState(false)
  const [videoUri, setVideoUri]               = useState<string | null>(null)
  const [videoTitle, setVideoTitle]           = useState('')
  const [uploadingVideo, setUploadingVideo]   = useState(false)
  const [videoMsg, setVideoMsg]               = useState('')
  const [videoDuration, setVideoDuration]     = useState(0)
  const [viewVideoItem, setViewVideoItem]     = useState<any>(null)
  const [videoSignedUrl, setVideoSignedUrl]   = useState<string | null>(null)
  const videoOpeningRef = useRef(false)   // guard against double-tap

  // ── Photo album state ──
  const [showPhotoModal, setShowPhotoModal]     = useState(false)
  const [photoDraft, setPhotoDraft]             = useState<{ uri: string, caption: string }[]>([])
  const [photoAlbumTitle, setPhotoAlbumTitle]   = useState('')
  const [photoAlbumDesc, setPhotoAlbumDesc]     = useState('')
  const [uploadingPhoto, setUploadingPhoto]     = useState(false)
  const [photoUploadPct, setPhotoUploadPct]     = useState(0)
  const [photoMsg, setPhotoMsg]                 = useState('')
  const [viewAlbum, setViewAlbum]               = useState<any>(null)
  const [albumPhotos, setAlbumPhotos]           = useState<{ signedUrl: string, caption: string }[]>([])
  const [albumLoading, setAlbumLoading]         = useState(false)
  const [albumDebug, setAlbumDebug]             = useState('')
  const [fullscreenPhoto, setFullscreenPhoto]   = useState<{ url: string, caption: string } | null>(null)

  // ── Audio playback state ──
  const [playingId, setPlayingId]   = useState<string | null>(null)
  const [playError, setPlayError]   = useState<string | null>(null)
  const soundRef = useRef<Audio.Sound | null>(null)

  // ── Abuse report state ──
  type ReportTarget = {
    deliveryId:     string
    familyMemberId: string
    senderId:       string
    senderName:     string
    memoryTitle:    string
  }
  const [showReportModal, setShowReportModal]   = useState(false)
  const [reportTarget, setReportTarget]         = useState<ReportTarget | null>(null)
  const [reportReason, setReportReason]         = useState<string>('')
  const [reportDetails, setReportDetails]       = useState('')
  const [reportSubmitting, setReportSubmitting] = useState(false)
  const [reportMsg, setReportMsg]               = useState('')

  const REPORT_REASONS = [
    { key: 'harassment',  label: 'Harassment' },
    { key: 'threatening', label: 'Threatening' },
    { key: 'unwanted',    label: 'Unwanted contact' },
    { key: 'defamation',  label: 'Defamation' },
    { key: 'abuse',       label: 'Abuse' },
    { key: 'other',       label: 'Other' },
  ]

  async function handleReport() {
    if (!reportTarget)      return
    if (!reportReason)      { setReportMsg('Please select a reason.'); return }
    setReportSubmitting(true); setReportMsg('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setReportSubmitting(false); return }
    try {
      // 1. Insert the abuse report
      const { error: reportErr } = await supabase.from('abuse_reports').insert({
        reporter_id: user.id,
        sender_id:   reportTarget.senderId,
        delivery_id: reportTarget.deliveryId,
        reason:      reportReason,
        details:     reportDetails.trim() || null,
      })
      if (reportErr) throw reportErr

      // 2. Block the sender — consent_status = 'blocked'
      await supabase
        .from('family_members')
        .update({ consent_status: 'blocked' })
        .eq('id', reportTarget.familyMemberId)

      setReportMsg('Report submitted. This sender has been blocked.')
      setTimeout(() => {
        setShowReportModal(false)
        setReportTarget(null)
        setReportReason('')
        setReportDetails('')
        setReportMsg('')
      }, 2000)
    } catch (e: any) {
      setReportMsg('Could not submit report — please try again.')
    }
    setReportSubmitting(false)
  }


  // ── Time capsule state ──
  const [capsules, setCapsules]                     = useState<any[]>([])
  const [showScheduleModal, setShowScheduleModal]   = useState(false)
  const [schedulingMemory, setSchedulingMemory]     = useState<any>(null)
  const [familyMembers, setFamilyMembers]           = useState<any[]>([])
  const [selectedMemberIds, setSelectedMemberIds]   = useState<string[]>([])
  const [scheduleDate, setScheduleDate]             = useState(defaultScheduleDate)
  const [scheduleNote, setScheduleNote]             = useState('')
  const [scheduleSaving, setScheduleSaving]         = useState(false)
  const [scheduleMsg, setScheduleMsg]               = useState('')
  const [scheduleIsAutoTriggered, setScheduleIsAutoTriggered] = useState(false)
  const [repeatMode, setRepeatMode]                 = useState<'none' | 'next_year' | '3_years'>('none')

  // ── Family member cards state ──
  const [allFamilyMembers, setAllFamilyMembers]       = useState<any[]>([])
  const [memberPhotoUrls, setMemberPhotoUrls]         = useState<Record<string, string>>({})
  // Resolved photo URLs for G1 senders (keyed by sender user_id)
  const [receivedSenderPhotoUrls, setReceivedSenderPhotoUrls] = useState<Record<string, string>>({})
  const [selectedMemberGroup, setSelectedMemberGroup] = useState<{
    memberId:            string
    memberName:          string
    memoryIds:           string[]
    capsuleByMemory:     Record<string, any>
    receivedDeliveries?: any[]   // deliveries sent TO this user FROM this person
    overridePhotoUrl?:   string | null  // explicit photo URL (for received groups)
  } | null>(null)

  // When a viewer is opened from inside the person detail card, we save the group
  // here and clear it from selectedMemberGroup (avoids stacking two transparent modals
  // on iOS). When all viewers close, the useEffect below restores the card automatically
  // so the user lands back in that person's memory list — not the main page.
  const [suspendedGroup, setSuspendedGroup] = useState<typeof selectedMemberGroup>(null)

  useEffect(() => {
    if (
      suspendedGroup &&
      !viewItem && !showVideoModal && !viewAlbum &&
      !showModal && !showScheduleModal
    ) {
      setSelectedMemberGroup(suspendedGroup)
      setSuspendedGroup(null)
    }
  }, [viewItem, showVideoModal, viewAlbum, showModal, showScheduleModal])

  useEffect(() => {
    // Prime the iOS audio session at mount so playback works immediately
    Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true }).catch(() => {})
    loadMemories()
    loadCapsules()
    loadFamilyMembersWithPhotos()
    loadReceivedMemories()
  }, [])

  // Reload when the user navigates back to this tab (e.g. after adding a family member)
  useEffect(() => {
    if (!navigation) return
    const unsubscribe = navigation.addListener('focus', () => {
      loadMemories()
      loadCapsules()
      loadFamilyMembersWithPhotos()
      loadReceivedMemories()
    })
    return unsubscribe
  }, [navigation])

  useEffect(() => {
    return () => {
      soundRef.current?.unloadAsync()
      clearInterval(recTimerRef.current)
    }
  }, [])

  async function loadMemories() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const [memoriesRes, occasionsRes] = await Promise.all([
      supabase.from('memories').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('user_occasions').select('occasion_key').eq('user_id', user.id),
    ])
    setMemories(memoriesRes.data || [])
    if (occasionsRes.data) setUserOccasionKeys(occasionsRes.data.map((r: any) => r.occasion_key))
    setLoading(false)
  }

  // ── Load memories sent TO this user ───────────────────────────
  // Finds family_member rows where recipient_profile_id = user.id,
  // then fetches their scheduled deliveries grouped by sender.
  async function loadReceivedMemories() {
    setReceivedLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setReceivedLoading(false); return }

      // 1. Find which family_member rows belong to this profile
      const { data: memberRows } = await supabase
        .from('family_members')
        .select('id, user_id')
        .eq('recipient_profile_id', user.id)

      if (!memberRows?.length) { setReceivedGroups([]); setReceivedLoading(false); return }

      const memberIds  = memberRows.map((r: any) => r.id)
      const senderIds  = [...new Set(memberRows.map((r: any) => r.user_id))] as string[]

      // 2. Fetch deliveries + the memory they reference
      const { data: deliveries } = await supabase
        .from('scheduled_deliveries')
        .select('*, memories(*)')
        .in('family_member_id', memberIds)
        .order('created_at', { ascending: false })

      // 3. Fetch sender display names + avatar_url (requires migration 029 for cross-user read)
      const { data: senderProfiles } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .in('id', senderIds)

      const senderMap: Record<string, string> = {}
      const senderAvatarMap: Record<string, string | null> = {}
      senderProfiles?.forEach((p: any) => {
        senderMap[p.id]       = p.full_name || 'Someone you love'
        senderAvatarMap[p.id] = p.avatar_url ?? null
      })

      // Build a memberID → senderID lookup
      const memberSenderMap: Record<string, string> = {}
      memberRows.forEach((r: any) => { memberSenderMap[r.id] = r.user_id })

      // 4. Group deliveries by sender
      const grouped: Record<string, any[]> = {}
      deliveries?.forEach((d: any) => {
        const senderId = memberSenderMap[d.family_member_id]
        if (!senderId) return
        if (!grouped[senderId]) grouped[senderId] = []
        grouped[senderId].push(d)
      })

      const groups = senderIds
        .filter(id => grouped[id]?.length)
        .map(id => ({
          senderId:   id,
          senderName: senderMap[id] || 'Someone you love',
          deliveries: grouped[id],
        }))

      setReceivedGroups(groups)

      // 5. Resolve signed photo URLs for each sender
      //    (requires migration 030: storage cross-user read for profiles/ prefix)
      const photoUrlMap: Record<string, string> = {}
      await Promise.all(senderIds.map(async (sid) => {
        const rawPath = senderAvatarMap[sid]
        if (!rawPath) return
        try {
          if (rawPath.startsWith('http')) {
            photoUrlMap[sid] = rawPath
          } else {
            const { data: signed } = await supabase.storage
              .from('memories').createSignedUrl(rawPath, 3600)
            if (signed?.signedUrl) photoUrlMap[sid] = signed.signedUrl
          }
        } catch { /* non-fatal — fall back to initials */ }
      }))
      setReceivedSenderPhotoUrls(photoUrlMap)
    } catch (e) {
      console.warn('loadReceivedMemories error:', e)
    }
    setReceivedLoading(false)
  }

  function openAddModal() {
    setEditingItem(null)
    setForm({ ...EMPTY_MEMORY_FORM })
    setSaveMsg('')
    setScheduleMsg('')
    setCreateStep(1)
    stepFade.setValue(1)
    setSelectedMemberIds([])
    setScheduleDate(defaultScheduleDate())
    setScheduleNote('')
    setRepeatMode('none')
    setFamilyMembers(allFamilyMembers)
    setShowModal(true)
  }
  function openEditModal(item: any) {
    setEditingItem(item)
    setForm({ title: item.title || '', type: item.type || 'written',
      description: item.description || '', content: item.content || '' })
    setSaveMsg(''); setShowModal(true)
  }
  function closeModal() {
    setShowModal(false)
    setEditingItem(null)
    setSaveMsg('')
    setScheduleMsg('')
    setForm({ ...EMPTY_MEMORY_FORM })
    setCreateStep(1)
    stepFade.setValue(1)
  }

  // ── Step navigation for the unified create flow ───────────────────────────
  function goToStep2() {
    if (!form.title.trim())   { setSaveMsg('Give this moment a title.'); return }
    if (!form.content.trim()) { setSaveMsg('Write your story before continuing.'); return }
    setSaveMsg('')
    Animated.timing(stepFade, { toValue: 0, duration: 120, useNativeDriver: true }).start(() => {
      setCreateStep(2)
      Animated.timing(stepFade, { toValue: 1, duration: 180, useNativeDriver: true }).start()
    })
  }

  function goBackToStep1() {
    Animated.timing(stepFade, { toValue: 0, duration: 120, useNativeDriver: true }).start(() => {
      setCreateStep(1)
      Animated.timing(stepFade, { toValue: 1, duration: 180, useNativeDriver: true }).start()
    })
  }

  // New memory: save memory + scheduled delivery in one go
  async function handleSaveAndSchedule() {
    if (selectedMemberIds.length === 0) { setScheduleMsg('Select at least one recipient.'); return }
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const picked = new Date(scheduleDate.year, scheduleDate.month - 1, scheduleDate.day)
    // Allow today for same-day testing. Change back to <= before production launch.
    if (picked < today) { setScheduleMsg('Please choose today or a future date.'); return }
    setSaving(true); setScheduleMsg('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    // 1. Insert the memory
    const { data: newMem, error: memErr } = await supabase
      .from('memories')
      .insert({ user_id: user.id, title: form.title.trim(), type: form.type,
        description: form.description.trim() || null, content: form.content.trim() })
      .select('id').single()
    if (memErr) { setSaving(false); setScheduleMsg('Error saving moment: ' + memErr.message); return }
    // 2. Insert scheduled deliveries
    const yearOffsets = repeatMode === '3_years' ? [0, 1, 2] : repeatMode === 'next_year' ? [0, 1] : [0]
    const rows: any[] = []
    for (const offset of yearOffsets) {
      const dateStr = `${scheduleDate.year + offset}-${String(scheduleDate.month).padStart(2, '0')}-${String(scheduleDate.day).padStart(2, '0')}`
      for (const memberId of selectedMemberIds) {
        rows.push({ user_id: user.id, memory_id: newMem.id,
          family_member_id: memberId, scheduled_date: dateStr,
          message: scheduleNote.trim() || null })
      }
    }
    const { error: schedErr } = await supabase.from('scheduled_deliveries').insert(rows)
    setSaving(false)
    if (schedErr) { setScheduleMsg('Error scheduling: ' + schedErr.message); return }
    closeModal(); loadMemories(); loadCapsules()
  }

  // New memory: save only (no schedule) — escape hatch from step 2
  async function handleSaveOnly() {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    const { error } = await supabase.from('memories').insert({
      user_id: user.id, title: form.title.trim(), type: form.type,
      description: form.description.trim() || null, content: form.content.trim(),
    })
    setSaving(false)
    if (error) { setScheduleMsg('Error saving: ' + error.message); return }
    closeModal(); loadMemories()
  }

  // Edit existing memory (unchanged single-step flow)
  async function handleSave() {
    if (!form.title.trim())   { setSaveMsg('Please enter a title.'); return }
    if (!form.content.trim()) { setSaveMsg('Please write something in the story field.'); return }
    setSaving(true); setSaveMsg('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaveMsg('Not signed in.'); setSaving(false); return }
    const payload = { title: form.title.trim(), type: form.type,
      description: form.description.trim() || null, content: form.content.trim() }
    const { error } = await supabase.from('memories').update(payload).eq('id', editingItem.id)
    setSaving(false)
    if (error) { setSaveMsg('Error saving: ' + error.message) }
    else { closeModal(); loadMemories() }
  }

  function openVoiceModal() {
    setShowVoiceModal(true); setRecordedUri(null); setVoiceTitle('')
    setRecDuration(0); setVoiceMsg(''); setIsRecording(false)
  }

  function closeVoiceModal() {
    if (isRecording) stopRecording()
    setShowVoiceModal(false); setRecordedUri(null); setVoiceTitle('')
    setRecDuration(0); setVoiceMsg(''); setIsRecording(false)
  }

  async function loadCapsules() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase
      .from('scheduled_deliveries')
      .select('*, memories(id, title, type), family_members(id, name, recipient_profile_id)')
      .eq('user_id', user.id)
      .order('scheduled_date', { ascending: true })
    setCapsules(data || [])
  }

  // ── Resolve a Supabase storage path to a displayable URI ────────────────
  // Identical logic to FamilyScreen.resolvePhotoUri — both screens share the
  // same on-disk cache (member_photo_<id>.jpg) so whichever loads first warms
  // the cache for the other.
  // Key fix: use supabase.storage.download() (authenticated API) instead of
  // FileSystem.downloadAsync (CDN) — the CDN returns HTTP 200 with a small JSON
  // error body on iOS, making downloadAsync think it succeeded when it didn't.
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

  async function loadFamilyMembersWithPhotos() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Step 1: G2's own family members (rows where G2 is the sender)
    const { data: ownData } = await supabase.from('family_members').select('*')
      .eq('user_id', user.id).order('created_at', { ascending: false })
    let list = ownData || []

    // Step 2: Auto-create reciprocal G2→G1 rows so G2 can send memories back.
    // Find every G1 sender who has G2 as a linked recipient but doesn't yet have
    // a forward G2→G1 family_members row (which is needed to appear in "Deliver to").
    const { data: senderLinks } = await supabase.from('family_members')
      .select('user_id').eq('recipient_profile_id', user.id)

    if (senderLinks?.length) {
      const existingRecipientIds = new Set(list.map((m: any) => m.recipient_profile_id).filter(Boolean))
      const missingSenderIds = [...new Set(senderLinks.map((r: any) => r.user_id))]
        .filter((sid: any) => sid && !existingRecipientIds.has(sid)) as string[]

      if (missingSenderIds.length > 0) {
        // Fetch sender display names + avatar for the new rows
        const { data: senderProfiles } = await supabase.from('profiles')
          .select('id, full_name, avatar_url').in('id', missingSenderIds)

        const inserts = (senderProfiles || []).map((p: any) => ({
          user_id:              user.id,
          recipient_profile_id: p.id,
          name:                 p.full_name || 'Your sender',
          relationship_label:   null,
          photo_url:            p.avatar_url || null,
          // G1 is an active Supabase user — their email was verified at sign-up.
          // Mark the row as accepted/confirmed so no "⚠️ Email not confirmed" warning shows.
          status:               'accepted',
          email_confirmed:      true,
          accepted_at:          new Date().toISOString(),
          // Auto-approve: G1 is already a verified app user who added G2 themselves.
          // No website confirmation flow needed — mark as consented immediately.
          consent_status:       'consented',
          consent_at:           new Date().toISOString(),
        }))

        if (inserts.length > 0) {
          // Use upsert with ignoreDuplicates so concurrent calls (mount + focus)
          // don't create duplicate rows. Migration 035 adds the unique index on
          // (user_id, recipient_profile_id) that makes ON CONFLICT work.
          await supabase
            .from('family_members')
            .upsert(inserts, { onConflict: 'user_id,recipient_profile_id', ignoreDuplicates: true })

          // IMPORTANT: ignoreDuplicates:true returns an empty array even for rows
          // that were successfully inserted. Never rely on the upsert return value —
          // always fetch the actual rows from DB so they land in allFamilyMembers
          // and appear in the "Deliver to" picker.
          const recipientIds = inserts.map((i: any) => i.recipient_profile_id)
          const { data: reciprocalRows } = await supabase
            .from('family_members')
            .select('*')
            .eq('user_id', user.id)
            .in('recipient_profile_id', recipientIds)

          if (reciprocalRows?.length) {
            const existingIds = new Set(list.map((m: any) => m.id))
            list = [...list, ...reciprocalRows.filter((r: any) => !existingIds.has(r.id))]
          }
        }
      }

      // Backfill existing auto-linked rows (email IS NULL, recipient_profile_id IS NOT NULL)
      // that were created before we set status/email_confirmed/photo_url correctly.
      const needsBackfill = list.filter((m: any) =>
        !m.email && m.recipient_profile_id &&
        (!m.photo_url || m.status !== 'accepted' || !m.email_confirmed)
      )
      if (needsBackfill.length > 0) {
        const profileIds = needsBackfill.map((m: any) => m.recipient_profile_id)
        const { data: backfillProfiles } = await supabase.from('profiles')
          .select('id, avatar_url').in('id', profileIds)
        for (const row of needsBackfill) {
          const bp = backfillProfiles?.find((p: any) => p.id === row.recipient_profile_id)
          const updates: any = {
            status:          'accepted',
            email_confirmed: true,
            accepted_at:     row.accepted_at ?? new Date().toISOString(),
            consent_status:  'consented',
            consent_at:      row.consent_at ?? new Date().toISOString(),
          }
          if (bp?.avatar_url && !row.photo_url) updates.photo_url = bp.avatar_url
          await supabase.from('family_members').update(updates).eq('id', row.id)
          Object.assign(row, updates)  // update local copy so UI reflects immediately
        }
      }
    }

    setAllFamilyMembers(list)
    setFamilyMembers(list)  // also prime the schedule modal list

    // Step 3: Resolve signed photo URLs for member avatars
    const urlMap: Record<string, string> = {}
    await Promise.all(
      list.filter(m => m.photo_url).map(async (m) => {
        // Use signed URL directly — avoids the Supabase SDK download() issue
        // where fetch().blob() on iOS produces empty blobs.
        // Signed URLs work natively with React Native's Image component.
        const { data: signed } = await supabase.storage
          .from('memories').createSignedUrl(m.photo_url, 43200) // 12-hour session URL
        if (signed?.signedUrl) urlMap[m.id] = signed.signedUrl
      })
    )
    // Merge with previous state — never wipe photos that loaded correctly before
    setMemberPhotoUrls(prev => ({ ...prev, ...urlMap }))
  }

  // ── Fetch all people G2 can send memories to ────────────────────────────
  // Combines G2's own family_members with any G1 senders who have G2 as a
  // linked recipient. Auto-creates G2→G1 reciprocal rows so future calls
  // are instant. Does NOT rely on allFamilyMembers state to avoid stale-
  // closure and timing issues.
  async function fetchMembersForPicker(): Promise<any[]> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    // Step 1: G2's own family_members (manually added + previously auto-created)
    const { data: ownMembers } = await supabase
      .from('family_members').select('*').eq('user_id', user.id)
    let members = ownMembers || []

    // Step 2: Find G1 senders not yet in G2's own rows
    // Requires Migration 038 SELECT policy: recipient_profile_id = auth.uid()
    const { data: senderRows } = await supabase
      .from('family_members')
      .select('user_id')
      .eq('recipient_profile_id', user.id)

    if (senderRows?.length) {
      const ownRecipientIds = new Set(members.map((m: any) => m.recipient_profile_id).filter(Boolean))
      const missingSenderIds = [...new Set(
        senderRows.map((r: any) => r.user_id).filter((id: string) => id && !ownRecipientIds.has(id))
      )] as string[]

      if (missingSenderIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles').select('id, full_name, avatar_url').in('id', missingSenderIds)

        const inserts = (profiles || []).map((p: any) => ({
          user_id:              user.id,
          recipient_profile_id: p.id,
          name:                 p.full_name || 'Your sender',
          relationship_label:   null,
          photo_url:            p.avatar_url || null,
          status:               'accepted',
          email_confirmed:      true,
          accepted_at:          new Date().toISOString(),
          consent_status:       'consented',
          consent_at:           new Date().toISOString(),
        }))

        if (inserts.length > 0) {
          // Use plain INSERT instead of upsert — the unique index on family_members
          // is a partial index (WHERE recipient_profile_id IS NOT NULL), which
          // Supabase's onConflict helper cannot resolve by column names alone, causing
          // the upsert to fail silently. A plain insert + 23505 guard is more reliable.
          const { error: insertError } = await supabase
            .from('family_members')
            .insert(inserts)

          // 23505 = unique_violation (row already exists) — treat as success
          if (insertError && insertError.code !== '23505') {
            console.warn('fetchMembersForPicker insert error:', insertError.message)
          }

          // Always fetch after insert attempt to get the rows (new or pre-existing)
          const { data: upserted } = await supabase
            .from('family_members').select('*')
            .eq('user_id', user.id)
            .in('recipient_profile_id', missingSenderIds)

          if (upserted?.length) {
            const existingIds = new Set(members.map((m: any) => m.id))
            members = [...members, ...upserted.filter((r: any) => !existingIds.has(r.id))]
          }
        }
      }
    }

    return members
  }

  async function openScheduleModal(mem: any) {
    const alreadyScheduled = capsules.some((c: any) => c.memory_id === mem.id)
    if (alreadyScheduled) return
    const members = await fetchMembersForPicker()
    setFamilyMembers(members)
    setSchedulingMemory(mem)
    setSelectedMemberIds([])
    setScheduleDate(defaultScheduleDate())
    setScheduleNote('')
    setScheduleMsg('')
    setShowScheduleModal(true)
  }

  function closeScheduleModal() {
    setShowScheduleModal(false); setSchedulingMemory(null)
    setSelectedMemberIds([]); setScheduleNote(''); setScheduleMsg('')
    setScheduleIsAutoTriggered(false); setRepeatMode('none')
  }

  // Called automatically after any memory type saves — skips the manual 📅 tap.
  async function autoOpenScheduleModal(mem: { id: string; title: string; type: string }) {
    const members = await fetchMembersForPicker()
    setFamilyMembers(members)
    setSchedulingMemory(mem)
    setSelectedMemberIds([])
    setScheduleDate(defaultScheduleDate())
    setScheduleNote('')
    setScheduleMsg('')
    setScheduleIsAutoTriggered(true)
    setShowScheduleModal(true)
  }

  async function saveScheduledDelivery() {
    if (selectedMemberIds.length === 0) { setScheduleMsg('Please select at least one recipient.'); return }
    const today = new Date(); today.setHours(0,0,0,0)
    const picked = new Date(scheduleDate.year, scheduleDate.month - 1, scheduleDate.day)
    // Allow today for same-day testing. Change back to <= before production launch.
    if (picked < today) { setScheduleMsg('Please choose today or a future date.'); return }
    setScheduleSaving(true); setScheduleMsg('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setScheduleSaving(false); return }

    // Build delivery dates based on repeat mode
    const yearOffsets = repeatMode === '3_years' ? [0, 1, 2] : repeatMode === 'next_year' ? [0, 1] : [0]
    const rows: any[] = []
    for (const offset of yearOffsets) {
      const dateStr = `${scheduleDate.year + offset}-${String(scheduleDate.month).padStart(2,'0')}-${String(scheduleDate.day).padStart(2,'0')}`
      for (const memberId of selectedMemberIds) {
        rows.push({
          user_id:          user.id,
          memory_id:        schedulingMemory.id,
          family_member_id: memberId,
          scheduled_date:   dateStr,
          message:          scheduleNote.trim() || null,
        })
      }
    }

    const { error } = await supabase.from('scheduled_deliveries').insert(rows)
    setScheduleSaving(false)
    if (error) { setScheduleMsg('Error: ' + error.message); return }
    closeScheduleModal(); loadCapsules()
  }

  async function cancelCapsule(id: string) {
    await supabase.from('scheduled_deliveries').delete().eq('id', id)
    loadCapsules()
  }

  function formatDeliveryDate(iso: string) {
    if (!iso) return ''
    const d = new Date(iso + 'T12:00:00')
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  }

  async function startRecording() {
    try {
      const { granted } = await Audio.requestPermissionsAsync()
      if (!granted) { setVoiceMsg('Microphone permission is required.'); return }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true })
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY)
      recordingRef.current = recording
      setIsRecording(true)
      setRecDuration(0)
      setRecordedUri(null)
      recTimerRef.current = setInterval(() => setRecDuration(d => d + 1), 1000)
      Animated.loop(Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.25, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 700, useNativeDriver: true }),
      ])).start()
    } catch (e: any) { setVoiceMsg('Could not start recording: ' + e.message) }
  }

  async function stopRecording() {
    clearInterval(recTimerRef.current)
    pulseAnim.stopAnimation()
    Animated.timing(pulseAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start()
    if (!recordingRef.current) return
    try {
      await recordingRef.current.stopAndUnloadAsync()
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true })
      const uri = recordingRef.current.getURI()
      setRecordedUri(uri ?? null)
    } catch (e: any) { setVoiceMsg('Error stopping recording: ' + e.message) }
    recordingRef.current = null
    setIsRecording(false)
  }

  async function saveVoiceMemo() {
    if (!voiceTitle.trim()) { setVoiceMsg('Please enter a title.'); return }
    if (!recordedUri)       { setVoiceMsg('Please record a voice memo first.'); return }
    setUploadingVoice(true); setVoiceMsg('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setVoiceMsg('Not signed in.'); setUploadingVoice(false); return }
    try {
      // fetch(file://).blob() → empty on iOS.
      // fetch(data:…).blob()  → unreliable on React Native / Hermes.
      // Safe path: FileSystem.readAsStringAsync → pure-JS base64 decode → Uint8Array.
      const base64 = await FileSystem.readAsStringAsync(recordedUri, {
        encoding: FileSystem.EncodingType.Base64,
      })
      const bytes    = base64ToBytes(base64)
      const fileSize = bytes.byteLength
      if (fileSize === 0) { setVoiceMsg('Recording is empty — please try again.'); setUploadingVoice(false); return }

      const fileName = `${Date.now()}_voice.m4a`
      const path = `${user.id}/${fileName}`
      const { error: uploadErr } = await supabase.storage.from('memories')
        .upload(path, bytes, { contentType: 'audio/m4a' })
      if (uploadErr) { setVoiceMsg('Upload failed: ' + uploadErr.message); setUploadingVoice(false); return }
      const { data: newVoiceMem, error: dbErr } = await supabase.from('memories').insert({
        user_id:   user.id,
        title:     voiceTitle.trim(),
        type:      'voice',
        duration:  recDuration,
        file_path: path,
        file_name: fileName,
        file_type: 'audio/m4a',
        file_size: fileSize,
      }).select('id, title, type').single()
      if (dbErr) { setVoiceMsg('Error saving: ' + dbErr.message); setUploadingVoice(false); return }
      setUploadingVoice(false)
      closeVoiceModal()
      loadMemories()
      if (newVoiceMem) autoOpenScheduleModal(newVoiceMem)
    } catch (e: any) { setVoiceMsg('Error: ' + e.message); setUploadingVoice(false) }
  }

  function openVideoModal() {
    setShowVideoModal(true); setVideoUri(null); setVideoTitle('')
    setVideoMsg(''); setVideoDuration(0)
  }

  function closeVideoModal() {
    setShowVideoModal(false); setVideoUri(null); setVideoTitle('')
    setVideoMsg(''); setVideoDuration(0)
  }

  async function recordVideo() {
    if (Platform.OS === 'web') {
      setVideoMsg('📱 Camera recording requires the Solace Life mobile app. Use "Choose from Library" to upload a video file from your computer.')
      return
    }
    const { status } = await ImagePicker.requestCameraPermissionsAsync()
    if (status !== 'granted') { setVideoMsg('Camera permission is required.'); return }
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['videos'],
        videoMaxDuration: 300,
        allowsEditing: false,
      } as any)
      if (!result.canceled && result.assets?.[0]) {
        setVideoUri(result.assets[0].uri)
        setVideoDuration(Math.round((result.assets[0].duration || 0) / 1000))
        setVideoMsg('')
      }
    } catch (e: any) { setVideoMsg('Could not open camera: ' + e.message) }
  }

  async function pickVideoFromLibrary() {
    if (Platform.OS !== 'web') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (status !== 'granted') { setVideoMsg('Photo library permission is required.'); return }
    }
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['videos'],
        videoMaxDuration: 300,
        allowsEditing: false,
      } as any)
      if (!result.canceled && result.assets?.[0]) {
        setVideoUri(result.assets[0].uri)
        setVideoDuration(Math.round((result.assets[0].duration || 0) / 1000))
        setVideoMsg('')
      }
    } catch (e: any) { setVideoMsg('Could not open library: ' + e.message) }
  }

  async function saveVideoMemory() {
    if (!videoTitle.trim()) { setVideoMsg('Please enter a title.'); return }
    if (!videoUri)          { setVideoMsg('Please record or select a video first.'); return }
    setUploadingVideo(true); setVideoMsg('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setVideoMsg('Not signed in.'); setUploadingVideo(false); return }
    try {
      const ext = videoUri.split('.').pop()?.toLowerCase().split('?')[0] || 'mp4'
      const fileName = `${Date.now()}_video.${ext}`
      const path = `${user.id}/${fileName}`
      const videoContentType = ext === 'mov' ? 'video/quicktime' : 'video/mp4'

      // fetch().blob() produces corrupt data for large video files on iOS —
      // use a Supabase signed upload URL + FileSystem.uploadAsync instead,
      // which streams the file from disk without buffering into memory.
      const { data: uploadUrlData, error: signErr } = await supabase.storage
        .from('memories').createSignedUploadUrl(path)
      if (signErr || !uploadUrlData?.signedUrl) {
        setVideoMsg('Upload failed: could not create upload URL')
        setUploadingVideo(false)
        return
      }

      const uploadResult = await FileSystem.uploadAsync(uploadUrlData.signedUrl, videoUri, {
        httpMethod: 'PUT',
        headers: { 'Content-Type': videoContentType },
      })
      if (uploadResult.status < 200 || uploadResult.status >= 300) {
        setVideoMsg(`Upload failed (${uploadResult.status})`)
        setUploadingVideo(false)
        return
      }

      // Get file size for the DB record
      const fileInfo = await FileSystem.getInfoAsync(videoUri, { size: true })
      const fileSize = fileInfo.exists ? (fileInfo as any).size ?? 0 : 0

      const { data: newVideoMem, error: dbErr } = await supabase.from('memories').insert({
        user_id:   user.id,
        title:     videoTitle.trim(),
        type:      'video',
        duration:  videoDuration,
        file_path: path,
        file_name: fileName,
        file_type: videoContentType,
        file_size: fileSize,
      }).select('id, title, type').single()
      if (dbErr) { setVideoMsg('Error saving: ' + dbErr.message); setUploadingVideo(false); return }
      setUploadingVideo(false)
      closeVideoModal()
      loadMemories()
      if (newVideoMem) autoOpenScheduleModal(newVideoMem)
    } catch (e: any) { setVideoMsg('Error: ' + e.message); setUploadingVideo(false) }
  }

  async function openVideoPlayer(mem: any) {
    if (videoOpeningRef.current) return   // ignore tap while already opening
    videoOpeningRef.current = true
    setViewVideoItem(mem)
    setVideoSignedUrl(null)

    const { data, error } = await supabase.storage.from('memories')
      .createSignedUrl(mem.file_path, 3600)
    if (error || !data?.signedUrl) {
      console.warn('Video signed URL error:', error?.message)
      setViewVideoItem(null)
      videoOpeningRef.current = false
      return
    }

    // iOS AVPlayer cannot stream .mov files from Supabase CDN — the moov atom sits
    // at the end of the file and AVPlayer requires it up front for remote streams.
    // Download the full file to local cache first, then play from file://.
    // (Same technique used for voice memos.)
    let playUri = data.signedUrl
    if (Platform.OS === 'ios') {
      try {
        const ext  = (mem.file_path as string)?.split('.').pop() || 'mp4'
        const dest = FileSystem.cacheDirectory + `video_${mem.id}.${ext}`
        const info = await FileSystem.getInfoAsync(dest)
        if (!info.exists) {
          await FileSystem.downloadAsync(data.signedUrl, dest)
        }
        playUri = dest
      } catch (dlErr) {
        console.warn('Video cache download failed:', dlErr)
        // keep playUri = remote URL; player will show error state if it can't stream
      }
    }

    setVideoSignedUrl(playUri)
    videoOpeningRef.current = false
  }

  async function togglePlayback(mem: any) {
    if (playingId === mem.id) {
      await soundRef.current?.pauseAsync()
      setPlayingId(null)
      return
    }
    if (soundRef.current) {
      await soundRef.current.unloadAsync()
      soundRef.current = null
      setPlayingId(null)
    }
    try {
      const { data, error } = await supabase.storage.from('memories')
        .createSignedUrl(mem.file_path, 3600)
      if (error || !data?.signedUrl) { return }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true })

      // iOS AVPlayer (-11850 AVErrorServerIncorrectlyConfigured) rejects Supabase signed
      // URLs because their CDN doesn't handle AVPlayer's byte-range streaming requests.
      // Fix: download the file to the device cache first, then play from file://.
      // On web, Audio.Sound handles remote URLs natively so we skip the download step.
      if (!mem.file_path) {
        setPlayError('No audio file path — tap to dismiss.')
        return
      }

      // Web: play directly from signed URL — browser handles streaming natively.
      // Native: the Supabase CDN can return HTTP 200 with a JSON error body instead of
      // real audio bytes (same issue as profile photos). AVFoundation then fails with
      // -11829 "file failed to parse". Fix: use supabase.storage.download() (authenticated
      // API, bypasses CDN) to get real bytes, convert via FileReader, write to local cache.
      // This is the same pattern used in resolvePhotoUri for profile photos.
      let playUri = data.signedUrl
      if (Platform.OS !== 'web') {
        const localPath = FileSystem.cacheDirectory + `audio_${mem.id}.m4a`
        const cached = await FileSystem.getInfoAsync(localPath)
        const isGoodCache = cached.exists && (cached as any).size > 1024
        if (!isGoodCache) {
          if (cached.exists) await FileSystem.deleteAsync(localPath, { idempotent: true })
          const { data: blob, error: dlErr } = await supabase.storage
            .from('memories').download(mem.file_path)
          if (dlErr || !blob) {
            setPlayError(`Download failed: ${dlErr?.message ?? 'no data'} — tap to dismiss.`)
            return
          }
          // A 0-byte blob means the original upload failed (old bug).
          // Tell the user to delete and re-record rather than showing a cryptic error.
          if (blob.size === 0) {
            setPlayError('This recording is empty — please delete it and record again.')
            return
          }
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '')
            reader.onerror = () => reject(new Error('FileReader failed'))
            reader.readAsDataURL(blob)
          })
          if (!base64) {
            setPlayError('Could not read audio data — tap to dismiss.')
            return
          }
          await FileSystem.writeAsStringAsync(localPath, base64, {
            encoding: FileSystem.EncodingType.Base64,
          })
        }
        playUri = localPath
      }

      const { sound } = await Audio.Sound.createAsync(
        { uri: playUri },
        { shouldPlay: true },
        (status) => {
          if (status.isLoaded && status.didJustFinish) {
            setPlayingId(null)
          }
        }
      )
      soundRef.current = sound
      setPlayingId(mem.id)
    } catch (e: any) {
      console.warn('Playback error:', e)
      setPlayError(`Audio error: ${e.message} — tap to dismiss.`)
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return
    setDeleting(true)
    // Step 1: Remove any scheduled deliveries linked to this memory first.
    // Without this, a missing ON DELETE CASCADE in the live DB would silently
    // block the memory deletion with a FK violation.
    await supabase.from('scheduled_deliveries').delete().eq('memory_id', confirmDelete.id)
    // Step 2: Remove the file from storage
    if (confirmDelete.type === 'photo' && confirmDelete.content) {
      try {
        const photos: { path: string }[] = JSON.parse(confirmDelete.content)
        const paths = photos.map((p: any) => p.path).filter(Boolean)
        if (paths.length > 0) await supabase.storage.from('memories').remove(paths)
      } catch { /* malformed JSON — skip */ }
    } else if (confirmDelete.file_path) {
      await supabase.storage.from('memories').remove([confirmDelete.file_path])
    }
    // Step 3: Delete the memory row itself
    await supabase.from('memories').delete().eq('id', confirmDelete.id)
    setDeleting(false); setConfirmDelete(null); loadMemories(); loadCapsules()
  }

  function formatDate(iso: string) {
    if (!iso) return ''
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }
  function wordCount(text: string) {
    return text.trim() ? text.trim().split(/\s+/).length : 0
  }
  function parsePhotoCount(content: string | null) {
    try { return JSON.parse(content || '[]').length } catch { return 0 }
  }

  function openPhotoModal() {
    setShowPhotoModal(true); setPhotoDraft([]); setPhotoAlbumTitle('')
    setPhotoAlbumDesc(''); setPhotoMsg(''); setPhotoUploadPct(0)
  }

  function closePhotoModal() {
    setShowPhotoModal(false); setPhotoDraft([]); setPhotoAlbumTitle('')
    setPhotoAlbumDesc(''); setPhotoMsg(''); setPhotoUploadPct(0)
  }

  async function pickPhotos() {
    if (Platform.OS !== 'web') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (status !== 'granted') { setPhotoMsg('Photo library permission is required.'); return }
    }
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        quality: 0.8,
      } as any)
      if (!result.canceled && result.assets) {
        const newPhotos = result.assets.map((a: any) => ({ uri: a.uri, caption: '' }))
        setPhotoDraft(prev => [...prev, ...newPhotos])
        setPhotoMsg('')
      }
    } catch (e: any) { setPhotoMsg('Could not open library: ' + e.message) }
  }

  async function takePhoto() {
    if (Platform.OS === 'web') { setPhotoMsg('📱 Camera is only available on the mobile app.'); return }
    const { status } = await ImagePicker.requestCameraPermissionsAsync()
    if (status !== 'granted') { setPhotoMsg('Camera permission is required.'); return }
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        allowsEditing: true,
      } as any)
      if (!result.canceled && result.assets?.[0]) {
        setPhotoDraft(prev => [...prev, { uri: result.assets[0].uri, caption: '' }])
        setPhotoMsg('')
      }
    } catch (e: any) { setPhotoMsg('Could not open camera: ' + e.message) }
  }

  async function savePhotoAlbum() {
    if (!photoAlbumTitle.trim()) { setPhotoMsg('Please enter a title for the album.'); return }
    if (photoDraft.length === 0) { setPhotoMsg('Please add at least one photo.'); return }
    setUploadingPhoto(true); setPhotoMsg(''); setPhotoUploadPct(0)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setPhotoMsg('Not signed in.'); setUploadingPhoto(false); return }
    try {
      const albumId = Date.now()
      const uploaded: { path: string; caption: string }[] = []
      let totalSize = 0
      for (let i = 0; i < photoDraft.length; i++) {
        const photo = photoDraft[i]
        const response = await fetch(photo.uri)
        const blob = await response.blob()
        const ext = photo.uri.split('.').pop()?.toLowerCase().split('?')[0] || 'jpg'
        const fileName = `photo_${i}.${ext}`
        const path = `${user.id}/albums/${albumId}/${fileName}`
        const { error: uploadErr } = await supabase.storage.from('memories')
          .upload(path, blob, { contentType: 'image/jpeg' })
        if (uploadErr) { setPhotoMsg(`Photo ${i + 1} upload failed: ${uploadErr.message}`); setUploadingPhoto(false); return }
        uploaded.push({ path, caption: photo.caption })
        totalSize += blob.size
        setPhotoUploadPct(Math.round(((i + 1) / photoDraft.length) * 100))
      }
      const { data: newPhotoMem, error: dbErr } = await supabase.from('memories').insert({
        user_id:     user.id,
        title:       photoAlbumTitle.trim(),
        type:        'photo',
        description: photoAlbumDesc.trim() || null,
        content:     JSON.stringify(uploaded),
        file_path:   uploaded[0].path,
        file_name:   `album_${albumId}`,
        file_type:   'image/album',
        file_size:   totalSize,
      }).select('id, title, type').single()
      if (dbErr) { setPhotoMsg('Error saving album: ' + dbErr.message); setUploadingPhoto(false); return }
      setUploadingPhoto(false); closePhotoModal(); loadMemories()
      if (newPhotoMem) autoOpenScheduleModal(newPhotoMem)
    } catch (e: any) { setPhotoMsg('Error: ' + e.message); setUploadingPhoto(false) }
  }

  async function openAlbumDetail(mem: any) {
    setViewAlbum(mem); setAlbumLoading(true); setAlbumPhotos([]); setAlbumDebug('')
    try {
      const photos: { path: string; caption: string }[] = JSON.parse(mem.content || '[]')
      if (photos.length === 0) {
        setAlbumDebug('No photos stored in this album.')
        setAlbumLoading(false)
        return
      }
      const withUrls = await Promise.all(
        photos.map(async (p, i) => {
          try {
            // Step 1: get a signed URL — works for own files (self-read policy) and
            // received files (migration 032 recipient-read policy).
            const { data, error: urlErr } = await supabase.storage
              .from('memories').createSignedUrl(p.path, 3600)
            if (urlErr || !data?.signedUrl) {
              const msg = `Photo ${i + 1}: URL error — ${urlErr?.message ?? 'no URL returned'}. Path: ${p.path}`
              console.warn('[Album]', msg)
              setAlbumDebug(msg)
              return { signedUrl: '', caption: p.caption }
            }

            // Web: signed URL loads fine in browser <img>
            if (Platform.OS === 'web') {
              return { signedUrl: data.signedUrl, caption: p.caption }
            }

            // Native: download signed URL to local cache so <Image> loads from file://.
            // Supabase CDN URLs can fail inside React Native's Image component on iOS,
            // but FileSystem.downloadAsync reliably fetches and caches them.
            // (Same pattern used for voice memos and video files.)
            const ext = (p.path.split('.').pop() ?? 'jpg').split('?')[0]
            const localPath = FileSystem.cacheDirectory + `album_${mem.id}_${i}.${ext}`
            const existing = await FileSystem.getInfoAsync(localPath)
            if (!existing.exists) {
              const dlResult = await FileSystem.downloadAsync(data.signedUrl, localPath)
              if (dlResult.status !== 200) {
                const msg = `Photo ${i + 1}: download status ${dlResult.status}. Path: ${p.path}`
                console.warn('[Album]', msg)
                setAlbumDebug(msg)
                return { signedUrl: '', caption: p.caption }
              }
            }
            return { signedUrl: localPath, caption: p.caption }
          } catch (e: any) {
            const msg = `Photo ${i + 1} exception: ${e.message}`
            console.warn('[Album]', msg)
            setAlbumDebug(msg)
            return { signedUrl: '', caption: p.caption }
          }
        })
      )
      setAlbumPhotos(withUrls)
    } catch (e: any) {
      setAlbumDebug(`Failed to read album: ${e.message}`)
    }
    setAlbumLoading(false)
  }

  function openMemoryType(key: string) {
    if (key === 'written')      openAddModal()
    else if (key === 'voice')   openVoiceModal()
    else if (key === 'video')   openVideoModal()
    else if (key === 'photo')   openPhotoModal()
  }

  // ── Group memories by family member from scheduled_deliveries ─────────────
  // Each family member who has at least one scheduled delivery gets a section.
  // Memories not yet scheduled appear in the "Ready to Send" section below.
  const familyGroupMap: Record<string, {
    memberId:           string
    memberName:         string
    memoryIds:          string[]
    capsuleByMemory:    Record<string, any>
    recipientProfileId: string | null
  }> = {}
  for (const cap of capsules) {
    const mid = cap.family_member_id
    if (!familyGroupMap[mid]) {
      familyGroupMap[mid] = {
        memberId:           mid,
        memberName:         cap.family_members?.name || 'Someone',
        memoryIds:          [],
        capsuleByMemory:    {},
        recipientProfileId: cap.family_members?.recipient_profile_id ?? null,
      }
    }
    if (!familyGroupMap[mid].memoryIds.includes(cap.memory_id)) {
      familyGroupMap[mid].memoryIds.push(cap.memory_id)
    }
    familyGroupMap[mid].capsuleByMemory[cap.memory_id] = cap
  }
  const familyGroups = Object.values(familyGroupMap)
    .sort((a, b) => a.memberName.localeCompare(b.memberName))
  const scheduledMemoryIds = new Set(capsules.map((c: any) => c.memory_id))
  const unscheduledMemories = memories.filter(m => !scheduledMemoryIds.has(m.id))

  // Avatar color per member — cycle through a palette
  const AVATAR_COLORS = [C.accent, C.amberLight, C.success, '#9B7FD4', '#D47F7F', '#7FA8D4']
  function avatarColor(name: string) {
    let hash = 0
    for (const c of name) hash = c.charCodeAt(0) + ((hash << 5) - hash)
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
  }

  // Renders a single memory row — used in both grouped and unscheduled sections
  function renderMemoryRow(mem: any, cap?: any) {
    return (
      <View key={mem.id} style={[s.listRow, { marginLeft: 0 }]}>
        <View style={s.listIconWrap}>
          <Text style={s.listIcon}>{MEMORY_TYPES.find(t => t.key === mem.type)?.icon || '📖'}</Text>
        </View>

        {mem.type === 'voice' ? (
          <View style={s.listInfo}>
            <Text style={s.listLabel}>{mem.title}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 }}>
              <TouchableOpacity onPress={() => togglePlayback(mem)} style={s.playBtn} activeOpacity={0.75}>
                <Text style={s.playBtnIcon}>{playingId === mem.id ? '⏸' : '▶'}</Text>
              </TouchableOpacity>
              <Waveform playing={playingId === mem.id} />
              <Text style={s.durationText}>{fmtDuration(mem.duration || 0)}</Text>
            </View>
            {cap && <Text style={[s.listDesc, { marginTop: 4, color: C.amberLight }]}>📅 Delivers {formatDeliveryDate(cap.scheduled_date)}</Text>}
            <Text style={[s.listDesc, { marginTop: 2, color: C.greyDim }]}>{formatDate(mem.created_at)}</Text>
          </View>
        ) : mem.type === 'video' ? (
          <TouchableOpacity style={s.listInfo} onPress={() => { setSuspendedGroup(selectedMemberGroup); setSelectedMemberGroup(null); openVideoPlayer(mem) }} activeOpacity={0.75}>
            <Text style={s.listLabel}>{mem.title}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 }}>
              <View style={s.videoPlayBtn}><Text style={s.playBtnIcon}>▶</Text></View>
              <Text style={{ color: C.grey, fontSize: 13 }}>Tap to watch</Text>
              {mem.duration ? <Text style={s.durationText}>{fmtDuration(mem.duration)}</Text> : null}
            </View>
            {cap && <Text style={[s.listDesc, { marginTop: 4, color: C.amberLight }]}>📅 Delivers {formatDeliveryDate(cap.scheduled_date)}</Text>}
            <Text style={[s.listDesc, { marginTop: 2, color: C.greyDim }]}>{formatDate(mem.created_at)}</Text>
          </TouchableOpacity>
        ) : mem.type === 'photo' ? (
          <TouchableOpacity style={s.listInfo} onPress={() => { setSuspendedGroup(selectedMemberGroup); setSelectedMemberGroup(null); openAlbumDetail(mem) }} activeOpacity={0.75}>
            <Text style={s.listLabel}>{mem.title}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <View style={s.photoCountBadge}><Text style={s.photoCountText}>📸 {parsePhotoCount(mem.content)}</Text></View>
              <Text style={{ color: C.grey, fontSize: 13 }}>Tap to view album</Text>
            </View>
            {cap && <Text style={[s.listDesc, { marginTop: 4, color: C.amberLight }]}>📅 Delivers {formatDeliveryDate(cap.scheduled_date)}</Text>}
            <Text style={[s.listDesc, { marginTop: 2, color: C.greyDim }]}>{formatDate(mem.created_at)}</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={s.listInfo} onPress={() => { setSuspendedGroup(selectedMemberGroup); setSelectedMemberGroup(null); setViewItem(mem) }} activeOpacity={0.75}>
            <Text style={s.listLabel}>{mem.title}</Text>
            <Text style={s.listDesc} numberOfLines={2}>
              {mem.content ? mem.content.slice(0, 80) + (mem.content.length > 80 ? '…' : '') : ''}
            </Text>
            {cap && <Text style={[s.listDesc, { marginTop: 4, color: C.amberLight }]}>📅 Delivers {formatDeliveryDate(cap.scheduled_date)}</Text>}
            <Text style={[s.listDesc, { marginTop: 2, color: C.greyDim }]}>
              {formatDate(mem.created_at)}{mem.content ? `  ·  ${wordCount(mem.content)} words` : ''}
            </Text>
          </TouchableOpacity>
        )}

        <View style={s.rowActions}>
          {cap ? (
            <View style={s.scheduledBadge}><Text style={s.scheduledBadgeIcon}>🔒</Text></View>
          ) : (
            <TouchableOpacity onPress={() => { setSuspendedGroup(selectedMemberGroup); setSelectedMemberGroup(null); openScheduleModal(mem) }} style={s.scheduleBtn}>
              <Text style={s.scheduleBtnIcon}>📅</Text>
            </TouchableOpacity>
          )}
          {mem.type === 'written' && (
            <TouchableOpacity onPress={() => { setSuspendedGroup(selectedMemberGroup); setSelectedMemberGroup(null); openEditModal(mem) }} style={s.editBtn}
              accessibilityLabel="Edit moment" accessibilityRole="button">
              <Text style={s.editBtnIcon}>✏️</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => setConfirmDelete(mem)} style={s.deleteBtn}
            accessibilityLabel="Delete moment" accessibilityRole="button">
            <Text style={s.deleteBtnIcon}>🗑️</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  return (
    <ScreenWrap>
      <ScrollView contentContainerStyle={s.screenScroll} showsVerticalScrollIndicator={true}>

        <View style={s.pageHeaderPlain}>
          <Text style={s.pageTitle}>Moments</Text>
          <Text style={s.pageSubtitle}>
            {'Leave something behind'}
          </Text>
        </View>

        {/* Received memories are integrated into the "Memories by Person" cards below */}

        {/* ── Occasion banner — shown when a user-selected occasion is within 30 days ── */}
        {(() => {
          const upcoming = getUpcomingOccasions(userOccasionKeys, 30)
          if (!upcoming.length) return null
          const nudge = buildOccasionNudge(upcoming[0])
          const urgent = upcoming[0].daysUntil <= 7
          return (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => {/* open new memory modal */}}
              style={{
                marginHorizontal: 20, marginBottom: 16,
                padding: 16, borderRadius: 16,
                backgroundColor: urgent ? C.amber + '18' : C.accent + '14',
                borderWidth: 1.5,
                borderColor: urgent ? C.amberLight + '88' : C.accent + '55',
                flexDirection: 'row', alignItems: 'center', gap: 14,
              }}>
              <View style={{
                width: 44, height: 44, borderRadius: 22,
                backgroundColor: urgent ? C.amber + '22' : C.accent + '22',
                borderWidth: 1, borderColor: urgent ? C.amberLight + '66' : C.accent + '44',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Text style={{ fontSize: 22 }}>{nudge.icon}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: urgent ? C.amberLight : C.offWhite, fontSize: 13, fontWeight: '700', marginBottom: 3, lineHeight: 18 }}>
                  {nudge.q}
                </Text>
                <Text style={{ color: C.greyDim, fontSize: 12 }}>{nudge.cta}</Text>
              </View>
              <Text style={{ color: urgent ? C.amberLight : C.accent, fontSize: 20 }}>›</Text>
            </TouchableOpacity>
          )
        })()}

        {/* Playback error toast */}
        {playError && (
          <TouchableOpacity
            onPress={() => setPlayError(null)}
            style={{
              marginHorizontal: 20, marginBottom: 12, padding: 12, borderRadius: 12,
              backgroundColor: C.error + '22', borderWidth: 1, borderColor: C.error + '44',
              flexDirection: 'row', alignItems: 'center', gap: 10,
            }}>
            <Text style={{ fontSize: 16 }}>⚠️</Text>
            <Text style={{ color: C.error, fontSize: 13, flex: 1 }}>{playError}</Text>
          </TouchableOpacity>
        )}

        {/* Memory type tiles */}
        <View style={s.sectionRow}>
          <Text style={s.sectionTitle}>Add a Moment</Text>
        </View>
        <View style={s.memoryTypeGrid}>
          {MEMORY_TYPES.map((t) => (
            <TouchableOpacity key={t.key} style={[s.memoryTypeTile, !t.available && s.memoryTypeTileDim]}
              onPress={() => t.available ? openMemoryType(t.key) : null} activeOpacity={t.available ? 0.75 : 1}>
              <Text style={s.memoryTypeIcon}>{t.icon}</Text>
              <Text style={s.memoryTypeLabel}>{t.label}</Text>
              {!t.available && (
                <View style={s.comingSoonBadge}>
                  <Text style={s.comingSoonText}>Soon</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Memories by family member — card view ── */}
        {loading ? (
          <ActivityIndicator color={C.amber} style={{ marginTop: 20 }} />
        ) : memories.length === 0 && receivedGroups.length === 0 ? (
          <View style={s.emptyState}>
            <Text style={s.emptyIcon}>📖</Text>
            <Text style={s.emptyTitle}>No moments yet</Text>
            <Text style={s.emptyDesc}>Write a story, record a voice memo, capture a video, or create a photo album for your loved ones.</Text>
          </View>
        ) : (
          <>
            {/* ── Memories by Person — one card per person, merging outgoing + incoming ── */}
            {(familyGroups.length > 0 || receivedGroups.length > 0) && (() => {
              // Build a lookup: recipientProfileId → receivedGroup
              const receivedByProfileId: Record<string, typeof receivedGroups[0]> = {}
              for (const rg of receivedGroups) receivedByProfileId[rg.senderId] = rg

              // Merged cards: one per familyGroup, absorbing the matching receivedGroup if found
              const mergedCards = familyGroups
                .map(fg => {
                  const groupMemories = fg.memoryIds
                    .map(id => memories.find(m => m.id === id))
                    .filter(Boolean)
                  if (groupMemories.length === 0) return null
                  const matched = fg.recipientProfileId ? receivedByProfileId[fg.recipientProfileId] : null
                  return { fg, groupMemories, matched }
                })
                .filter(Boolean) as { fg: typeof familyGroups[0]; groupMemories: any[]; matched: typeof receivedGroups[0] | null }[]

              // Track which receivedGroups were already merged into a familyGroup card
              const mergedSenderIds = new Set(
                mergedCards.map(c => c.fg.recipientProfileId).filter(Boolean)
              )
              // Remaining received-only groups (sender has no outgoing card here)
              const soloReceivedGroups = receivedGroups.filter(rg => !mergedSenderIds.has(rg.senderId))

              const allCards = [
                ...mergedCards.map(c => ({ type: 'merged' as const, ...c })),
                ...soloReceivedGroups.map(rg => ({ type: 'received' as const, rg })),
              ]

              if (allCards.length === 0) return null

              return (
                <>
                  <View style={s.sectionRow}>
                    <Text style={s.sectionTitle}>💌 Moments by Person</Text>
                  </View>

                  {allCards.map((card) => {
                    if (card.type === 'merged') {
                      const { fg, groupMemories, matched } = card
                      const color      = avatarColor(fg.memberName)
                      const photoUrl   = matched
                        ? (receivedSenderPhotoUrls[matched.senderId] ?? memberPhotoUrls[fg.memberId] ?? null)
                        : memberPhotoUrls[fg.memberId]
                      const outCount   = groupMemories.length
                      const recCount   = matched?.deliveries.length ?? 0
                      const hasBoth    = outCount > 0 && recCount > 0

                      // Pill items: up to 3 outgoing + up to 2 incoming (or up to 3 if no outgoing mix)
                      const outPills   = groupMemories.slice(0, hasBoth ? 2 : 3)
                      const recPills   = matched ? matched.deliveries.slice(0, hasBoth ? 1 : 0) : []

                      return (
                        <TouchableOpacity
                          key={fg.memberId}
                          onPress={() => setSelectedMemberGroup({
                            memberId:           fg.memberId,
                            memberName:         fg.memberName,
                            memoryIds:          fg.memoryIds,
                            capsuleByMemory:    fg.capsuleByMemory,
                            receivedDeliveries: matched?.deliveries ?? [],
                            overridePhotoUrl:   photoUrl ?? null,
                          })}
                          activeOpacity={0.82}
                          style={[s.listRow, {
                            padding: 0, overflow: 'hidden', alignItems: 'stretch',
                            borderColor: hasBoth ? C.accent + '55' : C.success + '44',
                          }]}>
                          {/* Full-height photo strip */}
                          <View style={{ width: 110, alignSelf: 'stretch', overflow: 'hidden' }}>
                            {photoUrl ? (
                              <Image
                                source={{ uri: photoUrl }}
                                style={{ width: 110, flex: 1 }}
                                resizeMode="cover"
                                onError={() => setMemberPhotoUrls(prev => {
                                  const n = { ...prev }; delete n[fg.memberId]; return n
                                })}
                              />
                            ) : (
                              <View style={{
                                width: 110, flex: 1,
                                backgroundColor: color + '44',
                                alignItems: 'center', justifyContent: 'center',
                              }}>
                                <Text style={{ fontSize: 36, fontWeight: '800', color }}>
                                  {fg.memberName.charAt(0).toUpperCase()}
                                </Text>
                              </View>
                            )}
                          </View>

                          {/* Info */}
                          <View style={[s.listInfo, { padding: 14 }]}>
                            <Text style={s.listLabel}>{fg.memberName}</Text>
                            <Text style={s.listDesc}>
                              {outCount > 0 ? `${outCount} scheduled` : ''}
                              {hasBoth ? ' · ' : ''}
                              {recCount > 0 ? `${recCount} received` : ''}
                            </Text>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                              {outPills.map((mem: any) => (
                                <View key={mem.id} style={{
                                  flexDirection: 'row', alignItems: 'center', gap: 4,
                                  backgroundColor: C.mauveDim + '55',
                                  borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3,
                                }}>
                                  <Text style={{ fontSize: 12 }}>
                                    {MEMORY_TYPES.find(t => t.key === mem.type)?.icon || '📖'}
                                  </Text>
                                  <Text style={{ color: C.grey, fontSize: 11 }} numberOfLines={1}>
                                    {mem.title?.slice(0, 18)}{(mem.title?.length ?? 0) > 18 ? '…' : ''}
                                  </Text>
                                </View>
                              ))}
                              {recPills.map((d: any) => {
                                const mem = d.memories
                                if (!mem) return null
                                return (
                                  <View key={d.id} style={{
                                    flexDirection: 'row', alignItems: 'center', gap: 4,
                                    backgroundColor: C.accent + '22',
                                    borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3,
                                    borderWidth: 1, borderColor: C.accent + '33',
                                  }}>
                                    <Text style={{ fontSize: 12 }}>📥</Text>
                                    <Text style={{ color: C.grey, fontSize: 11 }} numberOfLines={1}>
                                      {mem.title?.slice(0, 14)}{(mem.title?.length ?? 0) > 14 ? '…' : ''}
                                    </Text>
                                  </View>
                                )
                              })}
                              {(outCount + recCount) > 3 && (
                                <Text style={{ color: C.greyDim, fontSize: 12, alignSelf: 'center' }}>
                                  +{outCount + recCount - 3} more
                                </Text>
                              )}
                            </View>
                          </View>

                          {/* Right — badges + chevron */}
                          <View style={{ alignItems: 'flex-end', justifyContent: 'center',
                            gap: 6, paddingVertical: 14, paddingRight: 14 }}>
                            {outCount > 0 && (
                              <View style={{
                                backgroundColor: C.success + '22', borderRadius: 12,
                                paddingHorizontal: 10, paddingVertical: 4,
                                borderWidth: 1, borderColor: C.success + '44',
                              }}>
                                <Text style={{ color: C.success, fontSize: 11, fontWeight: '700' }}>
                                  🔒 {outCount}
                                </Text>
                              </View>
                            )}
                            {recCount > 0 && (
                              <View style={{
                                backgroundColor: C.accent + '22', borderRadius: 12,
                                paddingHorizontal: 10, paddingVertical: 4,
                                borderWidth: 1, borderColor: C.accent + '44',
                              }}>
                                <Text style={{ color: C.accent, fontSize: 11, fontWeight: '700' }}>
                                  📥 {recCount}
                                </Text>
                              </View>
                            )}
                            <Text style={{ color: C.accent, fontSize: 24 }}>›</Text>
                          </View>
                        </TouchableOpacity>
                      )
                    }

                    // Received-only card (no outgoing memories for this sender)
                    const { rg } = card
                    const color        = avatarColor(rg.senderName)
                    const senderPhoto  = receivedSenderPhotoUrls[rg.senderId] ?? null
                    const recCount     = rg.deliveries.length
                    return (
                      <TouchableOpacity
                        key={`received-${rg.senderId}`}
                        onPress={() => setSelectedMemberGroup({
                          memberId:           rg.senderId,
                          memberName:         rg.senderName,
                          memoryIds:          [],
                          capsuleByMemory:    {},
                          receivedDeliveries: rg.deliveries,
                          overridePhotoUrl:   senderPhoto,
                        })}
                        activeOpacity={0.82}
                        style={[s.listRow, {
                          padding: 0, overflow: 'hidden', alignItems: 'stretch',
                          borderColor: C.accent + '44',
                        }]}>
                        <View style={{ width: 110, alignSelf: 'stretch', overflow: 'hidden' }}>
                          {senderPhoto ? (
                            <Image source={{ uri: senderPhoto }} style={{ width: 110, flex: 1 }} resizeMode="cover" />
                          ) : (
                            <View style={{ width: 110, flex: 1, backgroundColor: color + '33',
                              alignItems: 'center', justifyContent: 'center' }}>
                              <Text style={{ fontSize: 36, fontWeight: '800', color }}>
                                {rg.senderName.charAt(0).toUpperCase()}
                              </Text>
                            </View>
                          )}
                        </View>
                        <View style={[s.listInfo, { padding: 14 }]}>
                          <Text style={s.listLabel}>{rg.senderName}</Text>
                          <Text style={s.listDesc}>
                            {recCount} {recCount === 1 ? 'moment' : 'moments'} received
                          </Text>
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                            {rg.deliveries.slice(0, 3).map((d: any) => {
                              const mem = d.memories
                              if (!mem) return null
                              return (
                                <View key={d.id} style={{
                                  flexDirection: 'row', alignItems: 'center', gap: 4,
                                  backgroundColor: C.mauveDim + '55',
                                  borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3,
                                }}>
                                  <Text style={{ fontSize: 12 }}>
                                    {MEMORY_TYPES.find(t => t.key === mem.type)?.icon || '📖'}
                                  </Text>
                                  <Text style={{ color: C.grey, fontSize: 11 }} numberOfLines={1}>
                                    {mem.title?.slice(0, 18)}{(mem.title?.length ?? 0) > 18 ? '…' : ''}
                                  </Text>
                                </View>
                              )
                            })}
                            {recCount > 3 && (
                              <Text style={{ color: C.greyDim, fontSize: 12, alignSelf: 'center' }}>
                                +{recCount - 3} more
                              </Text>
                            )}
                          </View>
                        </View>
                        <View style={{ alignItems: 'flex-end', justifyContent: 'center',
                          gap: 8, paddingVertical: 14, paddingRight: 14 }}>
                          <View style={{
                            backgroundColor: C.accent + '22', borderRadius: 12,
                            paddingHorizontal: 10, paddingVertical: 4,
                            borderWidth: 1, borderColor: C.accent + '44',
                          }}>
                            <Text style={{ color: C.accent, fontSize: 11, fontWeight: '700' }}>
                              📥 {recCount}
                            </Text>
                          </View>
                          <Text style={{ color: C.accent, fontSize: 24 }}>›</Text>
                        </View>
                      </TouchableOpacity>
                    )
                  })}
                </>
              )
            })()}

            {/* ── Unassigned memories — needs attention ── */}
            {unscheduledMemories.length > 0 && (
              <View style={{ marginTop: (familyGroups.length > 0 || receivedGroups.length > 0) ? 16 : 0 }} /* unassigned */>
                <View style={[s.sectionRow, { marginTop: 4 }]}>
                  <Text style={[s.sectionTitle, { color: C.amberLight }]}>
                    ⚠️ Not Yet Assigned
                  </Text>
                  <View style={{
                    backgroundColor: C.amber + '33', borderRadius: 10,
                    paddingHorizontal: 8, paddingVertical: 3,
                    borderWidth: 1, borderColor: C.amberLight + '66',
                  }}>
                    <Text style={{ color: C.amberLight, fontSize: 12, fontWeight: '700' }}>
                      {unscheduledMemories.length}
                    </Text>
                  </View>
                </View>

                {/* Attention card */}
                <View style={{
                  marginHorizontal: 20, marginBottom: 14,
                  padding: 14, borderRadius: 14,
                  backgroundColor: C.amber + '15',
                  borderWidth: 1.5, borderColor: C.amberLight + '55',
                }}>
                  <Text style={{ color: C.amberLight, fontSize: 14, fontWeight: '700', marginBottom: 4 }}>
                    These moments haven't been assigned yet
                  </Text>
                  <Text style={{ color: C.grey, fontSize: 13, lineHeight: 19 }}>
                    Tap 📅 on any moment below to choose who receives it and when it delivers.
                  </Text>
                </View>

                {unscheduledMemories.map(mem => renderMemoryRow(mem))}
              </View>
            )}
          </>
        )}

      </ScrollView>

      {/* ── Member Detail Modal ── tap a family card to open ── */}
      <Modal
        visible={!!selectedMemberGroup}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedMemberGroup(null)}>
        <View style={s.modalOverlay}>
          {/* Explicit height bypasses s.modalSheet (no size) and s.modalInner (maxHeight:640).
              overflow:hidden keeps the rounded corners. LinearGradient flex:1 fills it. */}
          <View style={{ height: '80%', borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden' }}>
            <LinearGradient colors={['#F06292', '#F48A5A', '#FFD07A']} style={{ flex: 1, paddingHorizontal: 28, paddingTop: 24, paddingBottom: 28 }}>
              {selectedMemberGroup && (() => {
                const group = selectedMemberGroup
                const color = avatarColor(group.memberName)
                // overridePhotoUrl is set for received (G1 sender) groups;
                // fall back to memberPhotoUrls for outgoing family member groups
                const photoUrl = group.overridePhotoUrl !== undefined
                  ? group.overridePhotoUrl
                  : memberPhotoUrls[group.memberId]
                const groupMemories = group.memoryIds
                  .map(id => memories.find(m => m.id === id))
                  .filter(Boolean)
                const hasReceived = (group.receivedDeliveries?.length ?? 0) > 0
                const hasSent     = groupMemories.length > 0
                const totalCount  = groupMemories.length + (group.receivedDeliveries?.length ?? 0)
                return (
                  <View style={{ flex: 1 }}>
                    {/* ── Header ── */}
                    <View style={{
                      flexDirection: 'row', alignItems: 'stretch',
                      borderRadius: 16, overflow: 'hidden', marginBottom: 16,
                      borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)',
                      backgroundColor: 'rgba(255,255,255,0.78)',
                      height: 120,
                    }}>
                      {/* Photo / avatar strip */}
                      <View style={{ width: 110, alignSelf: 'stretch' }}>
                        {photoUrl ? (
                          <Image
                            source={{ uri: photoUrl }}
                            style={{ width: 110, flex: 1 }}
                            resizeMode="cover"
                            onError={() => setMemberPhotoUrls(prev => {
                              const n = { ...prev }; delete n[group.memberId]; return n
                            })}
                          />
                        ) : (
                          <View style={{
                            width: 110, flex: 1,
                            backgroundColor: color + '44',
                            alignItems: 'center', justifyContent: 'center',
                          }}>
                            <Text style={{ fontSize: 44, fontWeight: '800', color }}>
                              {group.memberName.charAt(0).toUpperCase()}
                            </Text>
                          </View>
                        )}
                      </View>
                      {/* Name + summary */}
                      <View style={{ flex: 1, padding: 14, justifyContent: 'center' }}>
                        <Text style={{ color: '#3D1020', fontSize: 20, fontWeight: '800' }}>
                          {group.memberName}
                        </Text>
                        <Text style={{ color: '#7A3448', fontSize: 13, marginTop: 4 }}>
                          {totalCount} {totalCount === 1 ? 'moment' : 'moments'}
                        </Text>
                        <View style={{ flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                          {hasSent ? (
                            <View style={{
                              backgroundColor: C.success + '22', borderRadius: 10,
                              paddingHorizontal: 8, paddingVertical: 3,
                              borderWidth: 1, borderColor: C.success + '44',
                            }}>
                              <Text style={{ color: C.success, fontSize: 11, fontWeight: '700' }}>
                                📤 {groupMemories.length} sent
                              </Text>
                            </View>
                          ) : null}
                          {hasReceived ? (
                            <View style={{
                              backgroundColor: C.accent + '18', borderRadius: 10,
                              paddingHorizontal: 8, paddingVertical: 3,
                              borderWidth: 1, borderColor: C.accent + '44',
                            }}>
                              <Text style={{ color: C.accent, fontSize: 11, fontWeight: '700' }}>
                                📥 {group.receivedDeliveries!.length} received
                              </Text>
                            </View>
                          ) : null}
                        </View>
                      </View>
                      {/* Close button */}
                      <TouchableOpacity
                        onPress={() => setSelectedMemberGroup(null)}
                        style={{ padding: 4, alignSelf: 'flex-start' }}>
                        <View style={s.modalCloseBtn}><Text style={s.modalCloseX}>✕</Text></View>
                      </TouchableOpacity>
                    </View>

                    {/* ── Memory list ── flex:1 lets it fill available height inside the sheet */}
                    <ScrollView showsVerticalScrollIndicator={true} style={{ flex: 1 }}>

                      {/* Sent memories (this user recorded for this person) */}
                      {hasSent ? (
                        <>
                          {(hasSent && hasReceived) ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8, paddingHorizontal: 4 }}>
                              <Text style={{ fontSize: 13, fontWeight: '700', color: '#3D1020' }}>📤 You recorded for them</Text>
                            </View>
                          ) : null}
                          {groupMemories.map((mem: any) =>
                            renderMemoryRow(mem, group.capsuleByMemory[mem.id])
                          )}
                        </>
                      ) : null}

                      {/* Received memories (sent to this user from this person) */}
                      {hasReceived ? (
                        <>
                          {(hasSent && hasReceived) ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, marginBottom: 8, gap: 8, paddingHorizontal: 4 }}>
                              <Text style={{ fontSize: 13, fontWeight: '700', color: '#3D1020' }}>📥 They sent to you</Text>
                            </View>
                          ) : null}
                          {group.receivedDeliveries!.map((delivery: any) => {
                            const mem = delivery.memories
                            if (!mem) return null
                            const typeIcon = mem.type === 'voice' ? '🎙️' : mem.type === 'video' ? '🎬' : mem.type === 'photo' ? '📷' : '📖'
                            const typeLabel = mem.type === 'voice' ? 'Voice Memo' : mem.type === 'video' ? 'Video' : mem.type === 'photo' ? 'Photo Album' : 'Written Story'
                            const deliveredDate = delivery.scheduled_date
                              ? new Date(delivery.scheduled_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                              : null
                            return (
                              <TouchableOpacity
                                key={delivery.id}
                                activeOpacity={0.75}
                                style={[s.listRow, { marginLeft: 0 }]}
                                onPress={() => {
                                  if (mem.type === 'voice') {
                                    // Voice plays inline — keep the detail modal open
                                    togglePlayback(mem)
                                  } else {
                                    // Close the detail modal first to avoid stacking two modals at once,
                                    // then open the appropriate viewer
                                    setSelectedMemberGroup(null)
                                    if (mem.type === 'video')      openVideoPlayer(mem)
                                    else if (mem.type === 'photo') openAlbumDetail(mem)
                                    else                           setViewItem(mem)
                                  }
                                }}
                              >
                                {/* Direction indicator */}
                                <View style={{ justifyContent: 'flex-start', paddingTop: 14, paddingLeft: 4, width: 28 }}>
                                  <Text style={{ fontSize: 14 }}>📥</Text>
                                </View>
                                <View style={[s.listIconWrap, { backgroundColor: C.accent + '18', borderColor: C.accent + '44' }]}>
                                  <Text style={s.listIcon}>{typeIcon}</Text>
                                </View>
                                <View style={s.listInfo}>
                                  <Text style={s.listLabel}>{mem.title}</Text>
                                  {mem.description ? (
                                    <Text style={s.listDesc} numberOfLines={1}>{mem.description}</Text>
                                  ) : null}
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                                    <View style={{ backgroundColor: C.accent + '22', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
                                      <Text style={{ color: C.accent, fontSize: 10, fontWeight: '600' }}>{typeLabel}</Text>
                                    </View>
                                    {deliveredDate ? (
                                      <Text style={{ color: C.greyDim, fontSize: 10 }}>{deliveredDate}</Text>
                                    ) : null}
                                    <Text style={{ color: C.accent, fontSize: 10, fontWeight: '600' }}>
                                      {mem.type === 'voice' ? (playingId === mem.id ? '⏸ Playing…' : '▶ Play') : 'Tap to open →'}
                                    </Text>
                                  </View>
                                </View>
                                {/* 🚩 Report — nested TouchableOpacity intercepts its own touch
                                    so the outer row tap (open memory) never fires for this button */}
                                <TouchableOpacity
                                  onPress={() => {
                                    setReportTarget({
                                      deliveryId:     delivery.id,
                                      familyMemberId: delivery.family_member_id,
                                      senderId:       delivery.user_id,
                                      senderName:     group.memberName,
                                      memoryTitle:    mem.title,
                                    })
                                    setReportReason('')
                                    setReportDetails('')
                                    setReportMsg('')
                                    setShowReportModal(true)
                                  }}
                                  style={{ paddingHorizontal: 12, paddingVertical: 12, alignSelf: 'center' }}
                                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                                  activeOpacity={0.7}>
                                  <Text style={{ fontSize: 15 }}>🚩</Text>
                                </TouchableOpacity>
                              </TouchableOpacity>
                            )
                          })}
                        </>
                      ) : null}

                    </ScrollView>
                  </View>
                )
              })()}
            </LinearGradient>
          </View>
        </View>
      </Modal>

      {/* ── Schedule / Time Capsule Modal ── */}
      <Modal visible={showScheduleModal} transparent animationType="slide" onRequestClose={closeScheduleModal}>
        <View style={s.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? undefined : 'height'} style={{ width: '100%' }}>
            {/* On web: constrain to a centred dialog so the recipient chips + calendar
                are both visible without the calendar floating in a sea of whitespace */}
            <View style={[s.modalSheet, Platform.OS === 'web' && {
              maxWidth: 560, alignSelf: 'center', width: '100%',
            }]}>
              <LinearGradient colors={['#F06292', '#F48A5A', '#FFD07A']} style={[s.modalInner, { maxHeight: '90%' }]}>
                <View style={s.modalHeader}>
                  <Text style={[s.modalTitle, { color: '#3D1020' }]}>
                    {scheduleIsAutoTriggered ? '💌 Who is this for?' : '📅 Schedule Time Capsule'}
                  </Text>
                  <TouchableOpacity onPress={closeScheduleModal}><View style={s.modalCloseBtn}><Text style={s.modalCloseX}>✕</Text></View></TouchableOpacity>
                </View>
                <ScrollView showsVerticalScrollIndicator={true} automaticallyAdjustKeyboardInsets keyboardShouldPersistTaps="handled">

                  {scheduleIsAutoTriggered && (
                    <Text style={{ color: '#7A3448', fontSize: 13, textAlign: 'center', marginBottom: 14, lineHeight: 19 }}>
                      Saved! Choose who receives this moment and when to deliver it.
                    </Text>
                  )}

                  <View style={[s.scheduleMemPreview, { backgroundColor: 'rgba(255,255,255,0.78)', borderColor: 'rgba(255,255,255,0.5)' }]}>
                    <Text style={s.scheduleMemIcon}>
                      {MEMORY_TYPES.find(t => t.key === schedulingMemory?.type)?.icon || '📖'}
                    </Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.scheduleMemTitle, { color: '#3D1020' }]}>{schedulingMemory?.title}</Text>
                      <Text style={[s.scheduleMemType, { color: '#7A3448' }]}>
                        {schedulingMemory?.type === 'voice' ? 'Voice Memo'
                          : schedulingMemory?.type === 'video' ? 'Video Message'
                          : schedulingMemory?.type === 'photo' ? 'Photo Album'
                          : 'Written Story'}
                      </Text>
                    </View>
                  </View>

                  {/* ── Delivery date FIRST — user picks the date, then scrolls
                      down to pick recipients. Previously the chips were above the
                      calendar so they'd scroll off-screen while picking a date. ── */}
                  <Text style={[s.fieldLabel, { color: '#3D1020' }]}>Delivery Date *</Text>
                  <CalendarPicker
                    value={scheduleDate}
                    onChange={setScheduleDate}
                    minYear={new Date().getFullYear()}
                    maxYear={new Date().getFullYear() + 50}
                  />

                  {/* ── Recipients BELOW the calendar ── */}
                  <Text style={[s.fieldLabel, { marginTop: 8, color: '#3D1020' }]}>
                    Deliver to *{selectedMemberIds.length > 0 ? `  ·  ${selectedMemberIds.length} selected` : '  (select one or more)'}
                  </Text>
                  {familyMembers.length === 0 ? (
                    <View style={s.scheduleEmptyFam}>
                      <Text style={{ color: '#3D1020', fontSize: 14 }}>No family members added yet.</Text>
                      <Text style={{ color: '#7A3448', fontSize: 12, marginTop: 4 }}>Add family members in the Family tab first.</Text>
                    </View>
                  ) : (
                    <>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                      {familyMembers.map(m => {
                          const isSelected = selectedMemberIds.includes(m.id)
                          const unconfirmed = !m.email_confirmed
                          return (
                            <TouchableOpacity key={m.id}
                              style={[s.famChip, isSelected && s.famChipActive,
                                unconfirmed && { borderColor: C.amber + '88', borderWidth: 1.5 }]}
                              onPress={() => setSelectedMemberIds(prev =>
                                isSelected ? prev.filter(id => id !== m.id) : [...prev, m.id]
                              )}
                              accessibilityLabel={`${isSelected ? 'Remove' : 'Add'} ${m.name}`}
                              accessibilityRole="checkbox"
                              accessibilityState={{ checked: isSelected }}
                            >
                              {isSelected && (
                                <Text style={s.famChipCheck}>✓</Text>
                              )}
                              {memberPhotoUrls[m.id] ? (
                                <Image
                                  source={{ uri: memberPhotoUrls[m.id] }}
                                  style={{ width: 40, height: 40, borderRadius: 20, marginRight: 4 }}
                                  resizeMode="cover"
                                  onError={() => setMemberPhotoUrls(prev => {
                                    const n = { ...prev }; delete n[m.id]; return n
                                  })}
                                />
                              ) : (
                                <Text style={s.famChipAvatar}>{m.name.charAt(0).toUpperCase()}</Text>
                              )}
                              <Text style={[s.famChipName, isSelected && s.famChipNameActive]}>
                                {m.name.split(' ')[0]}
                              </Text>
                              {unconfirmed && (
                                <Text style={{ fontSize: 10, marginLeft: 2 }}>⚠️</Text>
                              )}
                            </TouchableOpacity>
                          )
                        })}
                    </View>
                    {/* Warn if any selected recipient hasn't confirmed their email yet */}
                    {selectedMemberIds.some(id => {
                      const m = familyMembers.find(fm => fm.id === id)
                      return m && !m.email_confirmed
                    }) && (
                      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8,
                        backgroundColor: C.amber + '18', borderRadius: 12, padding: 12,
                        borderWidth: 1, borderColor: C.amber + '44', marginBottom: 16 }}>
                        <Text style={{ fontSize: 16 }}>⚠️</Text>
                        <Text style={{ color: '#3D1020', fontSize: 13, flex: 1, lineHeight: 18, fontWeight: '600' }}>
                          One or more recipients haven't confirmed their email yet. Your moment will still be scheduled — remind them to check their inbox and tap the confirmation link.
                        </Text>
                      </View>
                    )}
                    </>
                  )}

                  <Text style={[s.fieldLabel, { marginTop: 16, color: '#3D1020' }]}>Personal Note (optional)</Text>
                  <TextInput
                    style={[s.input, { height: 80, textAlignVertical: 'top', backgroundColor: 'rgba(255,255,255,0.85)', color: '#3D1020', borderColor: 'rgba(255,255,255,0.5)' }]}
                    placeholder="Add a short note to accompany this delivery…"
                    placeholderTextColor="#7A3448"
                    value={scheduleNote}
                    onChangeText={setScheduleNote}
                    multiline />

                  {/* ── Repeat options ── */}
                  <Text style={[s.fieldLabel, { marginTop: 16, color: '#3D1020' }]}>Repeat this moment?</Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                    {([
                      { key: 'none',      label: 'Once only',   icon: '📅' },
                      { key: 'next_year', label: 'Next year too', icon: '🔁' },
                      { key: '3_years',   label: '3 years',     icon: '📆' },
                    ] as const).map(opt => {
                      const active = repeatMode === opt.key
                      return (
                        <TouchableOpacity
                          key={opt.key}
                          onPress={() => setRepeatMode(opt.key)}
                          activeOpacity={0.8}
                          style={{
                            flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12,
                            backgroundColor: active ? 'rgba(240,98,146,0.18)' : 'rgba(255,255,255,0.78)',
                            borderWidth: active ? 2 : 1,
                            borderColor: active ? '#F06292' : 'rgba(255,255,255,0.5)',
                          }}>
                          <Text style={{ fontSize: 18, marginBottom: 3 }}>{opt.icon}</Text>
                          <Text style={{ fontSize: 11, fontWeight: active ? '700' : '500', color: active ? '#F06292' : '#7A3448', textAlign: 'center' }}>
                            {opt.label}
                          </Text>
                        </TouchableOpacity>
                      )
                    })}
                  </View>

                  {/* Nudge shown when repeat is selected */}
                  {repeatMode !== 'none' && (
                    <View style={{
                      backgroundColor: 'rgba(255,255,255,0.78)', borderRadius: 12,
                      borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)',
                      padding: 12, marginBottom: 14, flexDirection: 'row', gap: 10,
                    }}>
                      <Text style={{ fontSize: 18 }}>✨</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: '#3D1020', fontSize: 13, fontWeight: '700', marginBottom: 3 }}>
                          Each year is its own story
                        </Text>
                        <Text style={{ color: '#7A3448', fontSize: 12, lineHeight: 17 }}>
                          This moment will repeat as-is. For something more personal, consider recording a fresh message next year — a new chapter just for them.
                        </Text>
                      </View>
                    </View>
                  )}

                  {scheduleMsg ? <Text style={{ color: C.error, fontSize: 13, marginBottom: 12 }}>{scheduleMsg}</Text> : null}

                  <TouchableOpacity onPress={saveScheduledDelivery} disabled={scheduleSaving || selectedMemberIds.length === 0}
                    activeOpacity={0.85} style={{ marginBottom: 8 }}>
                    <LinearGradient colors={PLUM} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.btnPrimary}>
                      {scheduleSaving
                        ? <ActivityIndicator color="#fff" />
                        : <Text style={[s.btnPrimaryText, { color: '#fff' }]}>
                            {repeatMode === '3_years'
                              ? 'Schedule for 3 Years'
                              : repeatMode === 'next_year'
                              ? 'Schedule for 2 Years'
                              : 'Schedule Delivery'}
                          </Text>}
                    </LinearGradient>
                  </TouchableOpacity>

                  {scheduleIsAutoTriggered && (
                    <TouchableOpacity onPress={closeScheduleModal} activeOpacity={0.7}
                      style={{ alignItems: 'center', paddingVertical: 14 }}>
                      <Text style={{ color: '#7A3448', fontSize: 14 }}>Skip — I'll assign this later</Text>
                    </TouchableOpacity>
                  )}

                  <Text style={[s.scheduleDisclaimer, { color: '#7A3448' }]}>
                    📬 On the scheduled date, each selected recipient will receive an email with access to this moment. Once scheduled, this moment is claimed and cannot be re-scheduled.
                  </Text>

                </ScrollView>
              </LinearGradient>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* ── Photo Album Creation Modal ── */}
      <Modal visible={showPhotoModal} transparent animationType="slide" onRequestClose={closePhotoModal}>
        <View style={s.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? undefined : 'height'} style={{ width: '100%' }}>
            <View style={s.modalSheet}>
              <LinearGradient colors={['#F06292', '#F48A5A', '#FFD07A']} style={[s.modalInner, { maxHeight: '92%' }]}>
                <View style={s.modalHeader}>
                  <Text style={[s.modalTitle, { color: '#3D1020' }]}>📸 Photo Album</Text>
                  <TouchableOpacity onPress={closePhotoModal}><View style={s.modalCloseBtn}><Text style={s.modalCloseX}>✕</Text></View></TouchableOpacity>
                </View>
                <ScrollView showsVerticalScrollIndicator={true} automaticallyAdjustKeyboardInsets keyboardShouldPersistTaps="handled">

                  <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
                    <TouchableOpacity onPress={pickPhotos} style={[s.photoAddBtn, { backgroundColor: 'rgba(61,16,32,0.12)', borderColor: 'rgba(61,16,32,0.2)' }]} activeOpacity={0.8}>
                      <Text style={s.photoAddBtnIcon}>🖼️</Text>
                      <Text style={[s.photoAddBtnLabel, { color: '#3D1020' }]}>Add from Library</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={takePhoto}
                      style={[s.photoAddBtn, { backgroundColor: 'rgba(61,16,32,0.12)', borderColor: 'rgba(61,16,32,0.2)' }, Platform.OS === 'web' && { opacity: 0.45 }]}
                      activeOpacity={0.8}>
                      <Text style={s.photoAddBtnIcon}>📷</Text>
                      <Text style={[s.photoAddBtnLabel, { color: '#3D1020' }]}>{Platform.OS === 'web' ? 'Mobile only' : 'Take a Photo'}</Text>
                    </TouchableOpacity>
                  </View>

                  {photoDraft.length > 0 && (
                    <>
                      <Text style={[s.fieldLabel, { marginBottom: 10, color: '#7A3448' }]}>
                        {photoDraft.length} photo{photoDraft.length !== 1 ? 's' : ''} selected — tap caption to add one
                      </Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
                        <View style={{ flexDirection: 'row', gap: 10 }}>
                          {photoDraft.map((photo, i) => (
                            <View key={i} style={s.photoDraftCard}>
                              <Image source={{ uri: photo.uri }} style={s.photoDraftThumb} />
                              <TouchableOpacity
                                onPress={() => setPhotoDraft(prev => prev.filter((_, idx) => idx !== i))}
                                style={s.photoDraftRemove}>
                                <Text style={{ color: C.white, fontSize: 10, fontWeight: '700' }}>✕</Text>
                              </TouchableOpacity>
                              <TextInput
                                style={s.photoDraftCaption}
                                placeholder="Caption…"
                                placeholderTextColor={C.greyDim}
                                value={photo.caption}
                                onChangeText={v => setPhotoDraft(prev =>
                                  prev.map((p, idx) => idx === i ? { ...p, caption: v } : p)
                                )}
                              />
                            </View>
                          ))}
                        </View>
                      </ScrollView>
                    </>
                  )}

                  <Text style={[s.fieldLabel, { color: '#7A3448' }]}>Album Title *</Text>
                  <TextInput
                    style={s.input}
                    placeholder="e.g. Our Family Summer, Wedding Day"
                    placeholderTextColor={C.greyDim}
                    value={photoAlbumTitle}
                    onChangeText={setPhotoAlbumTitle}
                  />

                  <Text style={[s.fieldLabel, { color: '#7A3448' }]}>Description (optional)</Text>
                  <TextInput
                    style={[s.input, { height: 70, textAlignVertical: 'top' }]}
                    placeholder="A few words about this album…"
                    placeholderTextColor={C.greyDim}
                    value={photoAlbumDesc}
                    onChangeText={setPhotoAlbumDesc}
                    multiline
                  />

                  {photoMsg ? <Text style={{ color: C.error, fontSize: 13, marginBottom: 10 }}>{photoMsg}</Text> : null}

                  {uploadingPhoto && photoUploadPct > 0 && (
                    <View style={s.uploadProgressWrap}>
                      <View style={[s.uploadProgressBar, { width: `${photoUploadPct}%` as any }]} />
                      <Text style={s.uploadProgressText}>Uploading… {photoUploadPct}%</Text>
                    </View>
                  )}

                  <TouchableOpacity
                    onPress={savePhotoAlbum}
                    disabled={uploadingPhoto}
                    activeOpacity={0.85}
                    style={{ marginBottom: 8 }}>
                    <LinearGradient colors={[C.amberLight, C.amber, '#C07840']} style={s.btnPrimary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                      {uploadingPhoto
                        ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <ActivityIndicator color={C.bg1} />
                            <Text style={s.btnPrimaryText}>Saving Album…</Text>
                          </View>
                        : <Text style={s.btnPrimaryText}>Save Photo Album</Text>
                      }
                    </LinearGradient>
                  </TouchableOpacity>
                </ScrollView>
              </LinearGradient>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* ── Album Detail Viewer Modal ── */}
      <Modal
        visible={!!viewAlbum}
        transparent
        animationType="slide"
        onRequestClose={() => { setViewAlbum(null); setAlbumPhotos([]); setAlbumDebug('') }}>
        <View style={s.albumDetailOverlay}>
          <View style={s.albumDetailHeader}>
            <View style={{ flex: 1 }}>
              <Text style={s.albumDetailTitle} numberOfLines={2}>{viewAlbum?.title}</Text>
              {viewAlbum?.description ? (
                <Text style={s.albumDetailDesc} numberOfLines={2}>{viewAlbum.description}</Text>
              ) : null}
            </View>
            <TouchableOpacity
              onPress={() => { setViewAlbum(null); setAlbumPhotos([]); setAlbumDebug('') }}
              style={s.videoPlayerCloseBtn}
              accessibilityLabel="Close album"
              accessibilityRole="button">
              <Text style={s.videoPlayerCloseIcon}>✕</Text>
            </TouchableOpacity>
          </View>

          {albumLoading ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
              <ActivityIndicator color={C.amber} size="large" />
              <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14 }}>Loading photos…</Text>
            </View>
          ) : albumPhotos.length === 0 ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 }}>
              <Text style={{ fontSize: 44 }}>📷</Text>
              <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700', textAlign: 'center' }}>
                No photos found
              </Text>
              <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 14, textAlign: 'center', lineHeight: 20 }}>
                The photos in this album couldn't be loaded. They may still be uploading, or try reopening the album.
              </Text>
              {!!albumDebug && (
                <Text style={{ color: '#FFD07A', fontSize: 13, textAlign: 'center', marginTop: 12, lineHeight: 18, paddingHorizontal: 8 }}>
                  {albumDebug}
                </Text>
              )}
            </View>
          ) : (
            <ScrollView contentContainerStyle={s.albumGrid}>
              {albumPhotos.map((photo, i) => (
                <TouchableOpacity
                  key={i}
                  style={s.albumGridCell}
                  onPress={() => photo.signedUrl ? setFullscreenPhoto({ url: photo.signedUrl, caption: photo.caption }) : null}
                  activeOpacity={0.85}>
                  {photo.signedUrl ? (
                    <Image
                      source={{ uri: photo.signedUrl }}
                      style={s.albumGridImg}
                      resizeMode="cover"
                      onError={() => {
                        // Replace broken URL with empty string so the placeholder renders
                        setAlbumPhotos(prev => prev.map((p, idx) =>
                          idx === i ? { ...p, signedUrl: '' } : p
                        ))
                      }}
                    />
                  ) : (
                    <View style={[s.albumGridImg, { backgroundColor: C.mauveDim, alignItems: 'center', justifyContent: 'center' }]}>
                      <Text style={{ fontSize: 28 }}>📸</Text>
                      {!!albumDebug && (
                        <Text style={{ color: '#FFD07A', fontSize: 11, textAlign: 'center', marginTop: 4, paddingHorizontal: 4, lineHeight: 14 }}>
                          {albumDebug}
                        </Text>
                      )}
                    </View>
                  )}
                  {photo.caption ? (
                    <View style={s.albumGridCaption}>
                      <Text style={s.albumGridCaptionText} numberOfLines={2}>{photo.caption}</Text>
                    </View>
                  ) : null}
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
      </Modal>

      {/* ── Fullscreen Photo Viewer ── */}
      <Modal
        visible={!!fullscreenPhoto}
        transparent
        animationType="fade"
        onRequestClose={() => setFullscreenPhoto(null)}
        statusBarTranslucent>
        <View style={s.fullscreenOverlay}>
          <TouchableOpacity
            style={s.fullscreenClose}
            onPress={() => setFullscreenPhoto(null)}
            accessibilityLabel="Close photo"
            accessibilityRole="button">
            <Text style={s.videoPlayerCloseIcon}>✕</Text>
          </TouchableOpacity>
          {fullscreenPhoto?.url ? (
            <Image
              source={{ uri: fullscreenPhoto.url }}
              style={s.fullscreenImg}
              resizeMode="contain"
            />
          ) : null}
          {fullscreenPhoto?.caption ? (
            <View style={s.fullscreenCaption}>
              <Text style={s.fullscreenCaptionText}>{fullscreenPhoto.caption}</Text>
            </View>
          ) : null}
        </View>
      </Modal>

      {/* ── Video Capture / Upload Modal ── */}
      <Modal visible={showVideoModal} transparent animationType="slide" onRequestClose={closeVideoModal}>
        <View style={s.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? undefined : 'height'} style={{ width: '100%' }}>
            <View style={s.modalSheet}>
              <LinearGradient colors={['#F06292', '#F48A5A', '#FFD07A']} style={s.modalInner}>
                <View style={s.modalHeader}>
                  <Text style={[s.modalTitle, { color: '#3D1020' }]}>🎬 Video Message</Text>
                  <TouchableOpacity onPress={closeVideoModal}><View style={s.modalCloseBtn}><Text style={s.modalCloseX}>✕</Text></View></TouchableOpacity>
                </View>

                {!videoUri ? (
                  <View style={s.videoPickWrap}>
                    <Text style={[s.videoPickHint, { color: '#7A3448' }]}>Record a new video or choose one from your library. Maximum 5 minutes.</Text>

                    <TouchableOpacity
                      onPress={recordVideo}
                      style={[s.videoPickBtn, { backgroundColor: 'rgba(61,16,32,0.12)', borderColor: 'rgba(61,16,32,0.2)' }, Platform.OS === 'web' && s.videoPickBtnDisabled]}
                      activeOpacity={0.8}>
                      <Text style={s.videoPickBtnIcon}>🎥</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.videoPickBtnLabel, { color: Platform.OS === 'web' ? '#7A3448' : '#3D1020' }]}>
                          Record a Video
                        </Text>
                        <Text style={[s.videoPickBtnSub, { color: '#7A3448' }]}>
                          {Platform.OS === 'web' ? 'Mobile app only' : 'Opens your camera'}
                        </Text>
                      </View>
                      <Text style={{ color: '#3D1020', fontSize: 20 }}>›</Text>
                    </TouchableOpacity>

                    <TouchableOpacity onPress={pickVideoFromLibrary} style={[s.videoPickBtn, { backgroundColor: 'rgba(61,16,32,0.12)', borderColor: 'rgba(61,16,32,0.2)' }]} activeOpacity={0.8}>
                      <Text style={s.videoPickBtnIcon}>📁</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.videoPickBtnLabel, { color: '#3D1020' }]}>Choose from Library</Text>
                        <Text style={[s.videoPickBtnSub, { color: '#7A3448' }]}>
                          {Platform.OS === 'web' ? 'Select a video file from your computer' : 'Select an existing video'}
                        </Text>
                      </View>
                      <Text style={{ color: '#3D1020', fontSize: 20 }}>›</Text>
                    </TouchableOpacity>

                    {videoMsg ? <Text style={{ color: C.error, fontSize: 13, marginTop: 12, textAlign: 'center' }}>{videoMsg}</Text> : null}
                  </View>
                ) : (
                  <View style={{ width: '100%' }}>
                    <View style={[s.videoReadyBadge, { backgroundColor: 'rgba(61,16,32,0.10)', borderColor: 'rgba(61,16,32,0.2)' }]}>
                      <Text style={s.videoReadyIcon}>✅</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.videoReadyText, { color: '#3D1020' }]}>Video ready</Text>
                        {videoDuration > 0 && (
                          <Text style={[s.videoReadyDur, { color: '#7A3448' }]}>{fmtDuration(videoDuration)}</Text>
                        )}
                      </View>
                      <TouchableOpacity onPress={() => { setVideoUri(null); setVideoDuration(0) }}>
                        <Text style={[s.recRetake, { color: '#3D1020' }]}>↺ Re-select</Text>
                      </TouchableOpacity>
                    </View>

                    <Text style={[s.fieldLabel, { marginTop: 20, color: '#7A3448' }]}>Title *</Text>
                    <TextInput
                      style={[s.input, { width: '100%' }]}
                      placeholder="e.g. A message to my grandchildren"
                      placeholderTextColor={C.greyDim}
                      value={videoTitle}
                      onChangeText={setVideoTitle} />

                    {videoMsg ? <Text style={{ color: C.error, fontSize: 13, marginBottom: 8 }}>{videoMsg}</Text> : null}

                    <TouchableOpacity onPress={saveVideoMemory} disabled={uploadingVideo} activeOpacity={0.85} style={{ width: '100%', marginTop: 8 }}>
                      <LinearGradient colors={[C.amberLight, C.amber, '#C07840']} style={s.btnPrimary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                        {uploadingVideo
                          ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                              <ActivityIndicator color={C.bg1} />
                              <Text style={s.btnPrimaryText}>Uploading…</Text>
                            </View>
                          : <Text style={s.btnPrimaryText}>Save Video Moment</Text>
                        }
                      </LinearGradient>
                    </TouchableOpacity>
                  </View>
                )}
              </LinearGradient>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* ── Full-Screen Video Player Modal ── */}
      <VideoPlayerModal
        visible={!!viewVideoItem}
        item={viewVideoItem}
        signedUrl={videoSignedUrl}
        onClose={() => { setViewVideoItem(null); setVideoSignedUrl(null); videoOpeningRef.current = false }}
      />

      {/* ── Voice Memo Modal ── */}
      <Modal visible={showVoiceModal} transparent animationType="slide" onRequestClose={closeVoiceModal}>
        <View style={s.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ width: '100%' }}>
          <View style={s.modalSheet}>
            <LinearGradient colors={['#F06292', '#F48A5A', '#FFD07A']} style={s.modalInner}>
              <View style={s.modalHeader}>
                <Text style={[s.modalTitle, { color: '#3D1020' }]}>Voice Memo</Text>
                <TouchableOpacity onPress={closeVoiceModal}><View style={s.modalCloseBtn}><Text style={s.modalCloseX}>✕</Text></View></TouchableOpacity>
              </View>

              <View style={s.voiceCenter}>
                {!recordedUri ? (
                  <>
                    <TouchableOpacity
                      onPress={isRecording ? stopRecording : startRecording}
                      activeOpacity={0.8}>
                      <Animated.View style={[s.recRingOuter, { backgroundColor: 'rgba(61,16,32,0.15)', transform: [{ scale: pulseAnim }] }]}>
                        <View style={[s.recBtn, isRecording && s.recBtnActive]}>
                          <Text style={s.recBtnIcon}>{isRecording ? '⏹' : '🎙️'}</Text>
                        </View>
                      </Animated.View>
                    </TouchableOpacity>
                    <Text style={[s.recTimer, { color: '#3D1020' }]}>{fmtDuration(recDuration)}</Text>
                    <Text style={[s.recHint, { color: '#7A3448' }]}>
                      {isRecording ? 'Recording… tap to stop' : 'Tap to start recording'}
                    </Text>
                  </>
                ) : (
                  <>
                    <View style={s.recDoneWrap}>
                      <Text style={s.recDoneIcon}>✅</Text>
                      <Text style={[s.recDoneText, { color: '#3D1020' }]}>Recorded — {fmtDuration(recDuration)}</Text>
                      <TouchableOpacity onPress={() => { setRecordedUri(null); setRecDuration(0) }}>
                        <Text style={[s.recRetake, { color: '#3D1020' }]}>↺ Record again</Text>
                      </TouchableOpacity>
                    </View>
                    <Text style={[s.fieldLabel, { alignSelf: 'flex-start', marginTop: 20, color: '#7A3448' }]}>Title *</Text>
                    <TextInput
                      style={[s.input, { width: '100%' }]}
                      placeholder="e.g. Message to my family"
                      placeholderTextColor={C.greyDim}
                      value={voiceTitle}
                      onChangeText={setVoiceTitle} />
                    {voiceMsg ? <Text style={{ color: C.error, fontSize: 13, marginBottom: 8 }}>{voiceMsg}</Text> : null}
                    <TouchableOpacity onPress={saveVoiceMemo} disabled={uploadingVoice} activeOpacity={0.85} style={{ width: '100%', marginTop: 4 }}>
                      <LinearGradient colors={[C.amberLight, C.amber, '#C07840']} style={s.btnPrimary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                        {uploadingVoice
                          ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                              <ActivityIndicator color={C.bg1} />
                              <Text style={s.btnPrimaryText}>Uploading…</Text>
                            </View>
                          : <Text style={s.btnPrimaryText}>Save Voice Memo</Text>
                        }
                      </LinearGradient>
                    </TouchableOpacity>
                  </>
                )}
                {voiceMsg && !recordedUri ? <Text style={{ color: C.error, fontSize: 13, marginTop: 12, textAlign: 'center' }}>{voiceMsg}</Text> : null}
              </View>

            </LinearGradient>
          </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* ── Written Story Create / Edit Modal ── */}
      <Modal visible={showModal} transparent animationType="slide" onRequestClose={closeModal}>
        <View style={s.modalOverlay}>
          {/* Sized View MUST be a direct child of the flex:1 overlay — only then does
              height:'92%' resolve to a real pixel value (92% of screen height).
              Putting it inside KeyboardAvoidingView breaks percentage resolution. */}
          <View style={{ height: '92%', width: '100%', borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden' }}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={{ flex: 1 }}
            >
              {/* Parchment gradient on step 1 (write), warm pink on step 2 (deliver) */}
              <LinearGradient
                colors={createStep === 1 ? ['#EDD9A3', '#F5EDCC', '#FDF6E3'] : ['#F06292', '#F48A5A', '#FFD07A']}
                style={{ flex: 1, paddingHorizontal: 28, paddingTop: 20, paddingBottom: 28 }}
              >
                {/* Handle pill — override margin for the taller modal (paddingTop:20 vs global 40) */}
                <View style={[s.modalHandle, { marginTop: -8, marginBottom: 14,
                  backgroundColor: createStep === 1 ? 'rgba(139,98,40,0.25)' : 'rgba(61,16,32,0.2)' }]} />

                {/* ── Header ── */}
                <View style={s.modalHeader}>
                  <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    {!editingItem && createStep === 2 && (
                      <TouchableOpacity onPress={goBackToStep1} style={{ padding: 4 }}>
                        <Text style={{ color: '#3D1020', fontSize: 18 }}>‹</Text>
                      </TouchableOpacity>
                    )}
                    <Text style={[s.modalTitle, { color: '#3D1E05' }]}>
                      {editingItem ? 'Edit Moment' : createStep === 1 ? '✍️ Write' : '💌 Deliver'}
                    </Text>
                  </View>
                  {/* Step dots (new memories only) */}
                  {!editingItem && (
                    <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginRight: 12 }}>
                      {[1, 2].map(n => (
                        <View key={n} style={{
                          width: createStep === n ? 20 : 8, height: 8, borderRadius: 4,
                          backgroundColor: createStep === n ? '#3D1E05' : 'rgba(61,30,5,0.2)',
                        }} />
                      ))}
                    </View>
                  )}
                  <TouchableOpacity onPress={closeModal}>
                    <View style={[s.modalCloseBtn, {
                      backgroundColor: 'rgba(139,98,40,0.15)',
                      borderColor: 'rgba(139,98,40,0.2)',
                    }]}>
                      <Text style={[s.modalCloseX, { color: '#8B6228' }]}>✕</Text>
                    </View>
                  </TouchableOpacity>
                </View>

                {/* ── Step content (fades between steps) ── */}
                {/* flex:1 on both Animated.View + ScrollView constrains the scroll area to
                    the space left after the header — no empty gradient bleed-through below */}
                <Animated.View style={{ opacity: stepFade, flex: 1 }}>
                  <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={true} automaticallyAdjustKeyboardInsets keyboardShouldPersistTaps="handled">

                    {createStep === 1 ? (
                      /* ── Step 1: Write — parchment style ──────────────────── */
                      <>
                        {/* Decorative rule under header */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 18 }}>
                          <View style={{ flex: 1, height: 1, backgroundColor: '#C9A85C' }} />
                          <Text style={{ color: '#C9A85C', fontSize: 11 }}>✦</Text>
                          <View style={{ flex: 1, height: 1, backgroundColor: '#C9A85C' }} />
                        </View>

                        <Text style={[s.fieldLabel, { color: '#8B6228', fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif' }]}>
                          Title *
                        </Text>
                        <TextInput
                          style={{
                            backgroundColor: '#FFFDF5', borderWidth: 1, borderColor: '#D4B483',
                            borderRadius: 10, padding: 14, color: '#3D1E05', fontSize: 16,
                            marginBottom: 14,
                            fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
                          }}
                          placeholder="e.g. Letter to my children, My life story"
                          placeholderTextColor="#B8975A"
                          value={form.title} onChangeText={v => setForm(f => ({ ...f, title: v }))} />

                        <Text style={[s.fieldLabel, { color: '#8B6228', fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif' }]}>
                          Short Description (optional)
                        </Text>
                        <TextInput
                          style={{
                            backgroundColor: '#FFFDF5', borderWidth: 1, borderColor: '#D4B483',
                            borderRadius: 10, padding: 14, color: '#3D1E05', fontSize: 16,
                            marginBottom: 14,
                            fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
                          }}
                          placeholder="What is this moment about?"
                          placeholderTextColor="#B8975A"
                          value={form.description} onChangeText={v => setForm(f => ({ ...f, description: v }))} />

                        <Text style={[s.fieldLabel, { color: '#8B6228', fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif' }]}>
                          Your Story *
                        </Text>
                        {/* Auto-expanding cream writing area — grows with content, no hard cap */}
                        <View style={{
                          backgroundColor: '#FFFDF5', borderWidth: 1, borderColor: '#D4B483',
                          borderRadius: 10, marginBottom: 12, overflow: 'hidden',
                        }}>
                          {/* Red margin line */}
                          <View style={{
                            position: 'absolute', left: 42, top: 0, bottom: 0,
                            width: 1.5, backgroundColor: 'rgba(200,60,60,0.18)', zIndex: 1,
                          }} />
                          <TextInput
                            style={{
                              minHeight: 112,   // 4 lines × 28px — grows naturally, no state needed
                              textAlignVertical: 'top',
                              paddingLeft: 52, paddingRight: 16, paddingTop: 10, paddingBottom: 10,
                              color: '#3D1E05', fontSize: 16, lineHeight: 28,
                              fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
                            }}
                            placeholder="Start writing your story here…"
                            placeholderTextColor="#B8975A"
                            value={form.content}
                            onChangeText={v => setForm(f => ({ ...f, content: v }))}
                            multiline
                            textAlignVertical="top"
                            scrollEnabled={false}
                          />
                        </View>

                        {/* ── Keyboard dictation tip ── */}
                        <View style={{
                          flexDirection: 'row', alignItems: 'center', gap: 12,
                          backgroundColor: 'rgba(255,253,245,0.9)',
                          borderRadius: 12, borderWidth: 1,
                          borderColor: '#D4B483',
                          paddingVertical: 12, paddingHorizontal: 14, marginBottom: 6,
                        }}>
                          <Text style={{ fontSize: 24 }}>🎤</Text>
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: '#3D1E05', fontSize: 14, fontWeight: '700', fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif' }}>
                              Can't type? Use your voice!
                            </Text>
                            <Text style={{ color: '#8B6228', fontSize: 12, marginTop: 2, lineHeight: 17 }}>
                              Tap the story box, then tap the{' '}
                              <Text style={{ fontWeight: '700' }}>🎤 microphone</Text> on your keyboard to speak.
                            </Text>
                          </View>
                        </View>

                        <View style={[s.wordCountRow, { flexDirection: 'row', justifyContent: 'space-between' }]}>
                          <Text style={{
                            color: '#8B6228', fontSize: 12, fontStyle: 'italic',
                            fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
                          }}>
                            ✦ {form.content.trim() ? form.content.trim().split(/\s+/).length : 0} words
                          </Text>
                          <Text style={{
                            color: '#B8975A', fontSize: 11,
                            fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
                          }}>
                            {form.content.length.toLocaleString()} characters · no limit
                          </Text>
                        </View>
                        {saveMsg ? <Text style={{ color: C.error, fontSize: 14, marginBottom: 12 }}>{saveMsg}</Text> : null}
                        <TouchableOpacity
                          onPress={editingItem ? handleSave : goToStep2}
                          disabled={saving} activeOpacity={0.85} style={{ marginBottom: 8 }}>
                          <View style={{ backgroundColor: '#3D1E05', borderRadius: 12, paddingVertical: 15,
                            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                            {saving
                              ? <ActivityIndicator color="#FFD07A" />
                              : <>
                                  <Text style={{ color: '#FFD07A', fontSize: 16, fontWeight: '800', fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif' }}>
                                    {editingItem ? 'Save Changes' : 'Next: Who & When'}
                                  </Text>
                                  {!editingItem && <Text style={{ color: '#FFD07A', fontSize: 18 }}>→</Text>}
                                </>
                            }
                          </View>
                        </TouchableOpacity>
                      </>
                    ) : (
                      /* ── Step 2: Deliver ───────────────────────────────── */
                      <>
                        {/* Memory preview pill */}
                        <View style={[s.scheduleMemPreview, { backgroundColor: 'rgba(255,255,255,0.78)',
                          borderColor: 'rgba(255,255,255,0.5)', marginBottom: 16 }]}>
                          <Text style={s.scheduleMemIcon}>📖</Text>
                          <View style={{ flex: 1 }}>
                            <Text style={[s.scheduleMemTitle, { color: '#3D1020' }]} numberOfLines={1}>
                              {form.title || 'Your moment'}
                            </Text>
                            <Text style={[s.scheduleMemType, { color: '#7A3448' }]}>Written Story</Text>
                          </View>
                        </View>

                        {/* Delivery date */}
                        <Text style={[s.fieldLabel, { color: '#3D1020' }]}>Delivery Date *</Text>
                        <CalendarPicker
                          value={scheduleDate}
                          onChange={setScheduleDate}
                          minYear={new Date().getFullYear()}
                          maxYear={new Date().getFullYear() + 50}
                        />

                        {/* Recipients */}
                        <Text style={[s.fieldLabel, { marginTop: 8, color: '#3D1020' }]}>
                          Deliver to *{selectedMemberIds.length > 0 ? `  ·  ${selectedMemberIds.length} selected` : '  (select one or more)'}
                        </Text>
                        {familyMembers.length === 0 ? (
                          <View style={s.scheduleEmptyFam}>
                            <Text style={{ color: '#3D1020', fontSize: 14 }}>No family members added yet.</Text>
                            <Text style={{ color: '#7A3448', fontSize: 12, marginTop: 4 }}>Add family members in the Family tab first.</Text>
                          </View>
                        ) : (
                          <>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                              {familyMembers.map(m => {
                                const isSelected = selectedMemberIds.includes(m.id)
                                const unconfirmed = !m.email_confirmed
                                return (
                                  <TouchableOpacity key={m.id}
                                    style={[s.famChip, isSelected && s.famChipActive,
                                      unconfirmed && { borderColor: C.amber + '88', borderWidth: 1.5 }]}
                                    onPress={() => setSelectedMemberIds(prev =>
                                      isSelected ? prev.filter(id => id !== m.id) : [...prev, m.id]
                                    )}>
                                    {isSelected && <Text style={s.famChipCheck}>✓</Text>}
                                    {memberPhotoUrls[m.id] ? (
                                      <Image source={{ uri: memberPhotoUrls[m.id] }}
                                        style={{ width: 40, height: 40, borderRadius: 20, marginRight: 4 }}
                                        resizeMode="cover" />
                                    ) : (
                                      <Text style={s.famChipAvatar}>{m.name.charAt(0).toUpperCase()}</Text>
                                    )}
                                    <Text style={[s.famChipName, isSelected && s.famChipNameActive]}>
                                      {m.name.split(' ')[0]}
                                    </Text>
                                    {unconfirmed && <Text style={{ fontSize: 10, marginLeft: 2 }}>⚠️</Text>}
                                  </TouchableOpacity>
                                )
                              })}
                            </View>
                            {selectedMemberIds.some(id => {
                              const m = familyMembers.find(fm => fm.id === id)
                              return m && !m.email_confirmed
                            }) && (
                              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8,
                                backgroundColor: C.amber + '18', borderRadius: 12, padding: 12,
                                borderWidth: 1, borderColor: C.amber + '44', marginBottom: 16 }}>
                                <Text style={{ fontSize: 16 }}>⚠️</Text>
                                <Text style={{ color: '#3D1020', fontSize: 13, flex: 1, lineHeight: 18, fontWeight: '600' }}>
                                  One or more recipients haven't confirmed their email yet. Your moment will still be scheduled — remind them to check their inbox.
                                </Text>
                              </View>
                            )}
                          </>
                        )}

                        {/* Repeat options */}
                        <Text style={[s.fieldLabel, { marginTop: 16, color: '#3D1020' }]}>Repeat this moment?</Text>
                        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                          {([
                            { key: 'none',      label: 'Once only',    icon: '📅' },
                            { key: 'next_year', label: 'Next year too', icon: '🔁' },
                            { key: '3_years',   label: '3 years',       icon: '📆' },
                          ] as const).map(opt => {
                            const active = repeatMode === opt.key
                            return (
                              <TouchableOpacity key={opt.key} onPress={() => setRepeatMode(opt.key)}
                                activeOpacity={0.8} style={{
                                  flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12,
                                  backgroundColor: active ? 'rgba(240,98,146,0.18)' : 'rgba(255,255,255,0.78)',
                                  borderWidth: active ? 2 : 1,
                                  borderColor: active ? '#F06292' : 'rgba(255,255,255,0.5)',
                                }}>
                                <Text style={{ fontSize: 18, marginBottom: 3 }}>{opt.icon}</Text>
                                <Text style={{ fontSize: 11, fontWeight: active ? '700' : '500',
                                  color: active ? '#F06292' : '#7A3448', textAlign: 'center' }}>
                                  {opt.label}
                                </Text>
                              </TouchableOpacity>
                            )
                          })}
                        </View>
                        {repeatMode !== 'none' && (
                          <View style={{ backgroundColor: 'rgba(255,255,255,0.78)', borderRadius: 12,
                            borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)',
                            padding: 12, marginBottom: 14, flexDirection: 'row', gap: 10 }}>
                            <Text style={{ fontSize: 18 }}>✨</Text>
                            <View style={{ flex: 1 }}>
                              <Text style={{ color: '#3D1020', fontSize: 13, fontWeight: '700', marginBottom: 3 }}>
                                Each year is its own story
                              </Text>
                              <Text style={{ color: '#7A3448', fontSize: 12, lineHeight: 17 }}>
                                This moment will repeat as-is. Consider recording a fresh message next year — a new chapter just for them.
                              </Text>
                            </View>
                          </View>
                        )}

                        {/* Personal note */}
                        <Text style={[s.fieldLabel, { marginTop: 4, color: '#3D1020' }]}>Personal Note (optional)</Text>
                        <TextInput
                          style={[s.input, { height: 80, textAlignVertical: 'top',
                            backgroundColor: 'rgba(255,255,255,0.85)', color: '#3D1020',
                            borderColor: 'rgba(255,255,255,0.5)' }]}
                          placeholder="Add a short note to accompany this delivery…"
                          placeholderTextColor="#7A3448"
                          value={scheduleNote}
                          onChangeText={setScheduleNote}
                          multiline />

                        {scheduleMsg ? <Text style={{ color: C.error, fontSize: 13, marginBottom: 12 }}>{scheduleMsg}</Text> : null}

                        <TouchableOpacity onPress={handleSaveAndSchedule}
                          disabled={saving || selectedMemberIds.length === 0}
                          activeOpacity={0.85}
                          style={{ marginBottom: 8, opacity: selectedMemberIds.length === 0 ? 0.5 : 1 }}>
                          <LinearGradient colors={PLUM} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 14, paddingVertical: 16,
                            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                            {saving
                              ? <ActivityIndicator color="#FFD07A" />
                              : <>
                                  <Text style={{ fontSize: 18 }}>📅</Text>
                                  <Text style={{ color: '#FFD07A', fontSize: 16, fontWeight: '800' }}>Schedule Moment</Text>
                                </>
                            }
                          </LinearGradient>
                        </TouchableOpacity>

                        <TouchableOpacity onPress={handleSaveOnly} disabled={saving}
                          activeOpacity={0.7} style={{ alignItems: 'center', paddingVertical: 12, marginBottom: 8 }}>
                          <Text style={{ color: '#7A3448', fontSize: 14 }}>Save without scheduling</Text>
                        </TouchableOpacity>
                      </>
                    )}

                  </ScrollView>
                </Animated.View>

              </LinearGradient>
            </KeyboardAvoidingView>
          </View>
        </View>
      </Modal>

      {/* ── View / Read Modal ── */}
      {/* ── Written Memory Viewer — Letter on paper ── */}
      <Modal visible={!!viewItem} transparent animationType="slide" onRequestClose={() => setViewItem(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }}>
          <View style={{
            height: '92%',
            borderTopLeftRadius: 28, borderTopRightRadius: 28,
            overflow: 'hidden',
            backgroundColor: '#FDF6E3',
          }}>
            {/* ── Letterhead ── */}
            <LinearGradient
              colors={['#EDD9A3', '#F5EDCC', '#FDF6E3']}
              style={{
                paddingHorizontal: 28, paddingTop: 22, paddingBottom: 18,
                borderBottomWidth: 1.5, borderBottomColor: '#D4B483',
              }}
            >
              {/* Top row: envelope icon + date + close */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                <Text style={{ fontSize: 20, marginRight: 8 }}>✉️</Text>
                <Text style={{
                  flex: 1, color: '#8B6228', fontSize: 12,
                  fontStyle: 'italic',
                  fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
                }}>
                  {formatDate(viewItem?.created_at)}
                </Text>
                <TouchableOpacity onPress={() => setViewItem(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <View style={{
                    width: 30, height: 30, borderRadius: 15,
                    backgroundColor: 'rgba(139,98,40,0.15)',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Text style={{ color: '#8B6228', fontSize: 14, fontWeight: '700' }}>✕</Text>
                  </View>
                </TouchableOpacity>
              </View>

              {/* Title — the letter's subject */}
              <Text style={{
                color: '#3D1E05', fontSize: 22, fontWeight: '800',
                lineHeight: 28, letterSpacing: 0.2,
                fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
              }}>
                {viewItem?.title}
              </Text>

              {/* Decorative rule */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 8 }}>
                <View style={{ flex: 1, height: 1, backgroundColor: '#C9A85C' }} />
                <Text style={{ color: '#C9A85C', fontSize: 12 }}>✦</Text>
                <View style={{ flex: 1, height: 1, backgroundColor: '#C9A85C' }} />
              </View>
            </LinearGradient>

            {/* ── Lined paper body ── */}
            <ScrollView
              style={{ flex: 1, backgroundColor: '#FDF6E3' }}
              contentContainerStyle={{ paddingBottom: 60 }}
              showsVerticalScrollIndicator={false}
            >
              {/* Paper area with margin line + content */}
              <View style={{ position: 'relative', minHeight: 500 }}>
                {/* Red margin line */}
                <View style={{
                  position: 'absolute', left: 52, top: 0, bottom: 0,
                  width: 1.5, backgroundColor: 'rgba(200, 60, 60, 0.2)', zIndex: 1,
                }} />

                {/* Ruled lines — 35px apart, scroll with content */}
                {Array.from({ length: 60 }).map((_, i) => (
                  <View key={i} style={{
                    position: 'absolute', left: 0, right: 0,
                    top: 35 + i * 35,
                    height: 1,
                    backgroundColor: 'rgba(165, 140, 90, 0.18)',
                  }} />
                ))}

                {/* Letter body text */}
                <Text style={{
                  color: '#2D1505',
                  fontSize: 16.5,
                  lineHeight: 35,           // snaps exactly to ruled lines
                  paddingLeft: 64,
                  paddingRight: 28,
                  paddingTop: 8,
                  fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
                  letterSpacing: 0.15,
                }}>
                  {viewItem?.content}
                </Text>
              </View>

              {/* Closing signature area */}
              <View style={{
                marginHorizontal: 28, marginTop: 8,
                paddingTop: 16, borderTopWidth: 1,
                borderTopColor: 'rgba(165, 140, 90, 0.25)',
                alignItems: 'flex-end',
              }}>
                <Text style={{
                  color: '#8B6228', fontSize: 13, fontStyle: 'italic',
                  fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
                }}>
                  With love 💛
                </Text>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Delete Confirmation ── */}
      <Modal visible={!!confirmDelete} transparent animationType="fade" onRequestClose={() => setConfirmDelete(null)}>
        <View style={s.confirmOverlay}>
          <View style={s.confirmBox}>
            <LinearGradient colors={['#F06292', '#F48A5A', '#FFD07A']} style={s.confirmInner}>
              <Text style={s.confirmIcon}>🗑️</Text>
              <Text style={[s.confirmTitle, { color: '#3D1020' }]}>Delete Moment?</Text>
              <Text style={[s.confirmBody, { color: '#7A3448' }]}>
                "{confirmDelete?.title}" will be permanently deleted.{'\n'}This cannot be undone.
              </Text>
              <View style={s.confirmActions}>
                <TouchableOpacity style={[s.confirmCancel, { borderColor: 'rgba(255,255,255,0.5)', backgroundColor: 'rgba(255,255,255,0.78)' }]} onPress={() => setConfirmDelete(null)}>
                  <Text style={[s.confirmCancelText, { color: '#3D1020' }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.confirmDelete, { backgroundColor: '#F06292', borderColor: '#F06292' }]} onPress={handleDelete} disabled={deleting}>
                  {deleting ? <ActivityIndicator color={C.white} /> : <Text style={[s.confirmDeleteText, { color: '#3D1020' }]}>Delete</Text>}
                </TouchableOpacity>
              </View>
            </LinearGradient>
          </View>
        </View>
      </Modal>

      {/* ── Abuse Report Modal ── */}
      <Modal visible={showReportModal} transparent animationType="slide" onRequestClose={() => setShowReportModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end' }}>
          <View style={{ borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' }}>
            <LinearGradient colors={['#F06292', '#F48A5A', '#FFD07A']} style={{ padding: 24 }}>

              {/* Handle */}
              <View style={{ alignItems: 'center', marginBottom: 16 }}>
                <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(61,16,32,0.3)' }} />
              </View>

              <Text style={{ color: WM.title, fontSize: 20, fontWeight: '700', marginBottom: 4 }}>
                🚩 Report Content
              </Text>
              <Text style={{ color: WM.sub, fontSize: 13, marginBottom: 20 }}>
                {reportTarget ? `From: ${reportTarget.senderName} · "${reportTarget.memoryTitle}"` : ''}
              </Text>

              {/* Reason selection */}
              <Text style={{ color: WM.title, fontSize: 14, fontWeight: '700', marginBottom: 10 }}>
                Why are you reporting this?
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                {REPORT_REASONS.map(r => (
                  <TouchableOpacity
                    key={r.key}
                    onPress={() => setReportReason(r.key)}
                    style={{
                      paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
                      borderWidth: reportReason === r.key ? 2 : 1,
                      borderColor: reportReason === r.key ? WM.accent : WM.border,
                      backgroundColor: reportReason === r.key ? WM.accentBg : WM.cardBg,
                    }}>
                    <Text style={{ color: WM.title, fontSize: 13, fontWeight: reportReason === r.key ? '700' : '500' }}>
                      {r.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Optional details */}
              <Text style={{ color: WM.title, fontSize: 14, fontWeight: '700', marginBottom: 8 }}>
                Additional details (optional)
              </Text>
              <TextInput
                style={{
                  backgroundColor: WM.inputBg, color: WM.title, borderColor: WM.border,
                  borderWidth: 1, borderRadius: 12, padding: 12, minHeight: 70,
                  textAlignVertical: 'top', fontSize: 14, marginBottom: 16,
                }}
                placeholder="Tell us more about what happened…"
                placeholderTextColor={WM.sub}
                value={reportDetails}
                onChangeText={setReportDetails}
                multiline
              />

              {reportMsg ? (
                <Text style={{ color: WM.title, fontSize: 13, marginBottom: 12, textAlign: 'center', fontWeight: '600' }}>
                  {reportMsg}
                </Text>
              ) : null}

              {/* Info box */}
              <View style={{
                backgroundColor: WM.cardBg, borderColor: WM.border, borderWidth: 1,
                borderRadius: 12, padding: 12, marginBottom: 16,
              }}>
                <Text style={{ color: WM.sub, fontSize: 12, lineHeight: 18 }}>
                  Submitting a report will immediately block this sender. No more moments will be delivered from them. Your report will be reviewed by our team. Your identity is kept private.
                </Text>
              </View>

              {/* Submit */}
              <TouchableOpacity
                onPress={handleReport}
                disabled={reportSubmitting || !reportReason}
                activeOpacity={0.85}
                style={{ marginBottom: 10, opacity: !reportReason ? 0.5 : 1 }}>
                <View style={{ backgroundColor: '#EF4444', borderRadius: 14, padding: 16, alignItems: 'center' }}>
                  {reportSubmitting
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Submit Report & Block Sender</Text>}
                </View>
              </TouchableOpacity>

              {/* Cancel */}
              <TouchableOpacity
                onPress={() => setShowReportModal(false)}
                activeOpacity={0.75}>
                <View style={{ backgroundColor: WM.cardBg, borderColor: WM.border, borderWidth: 1, borderRadius: 14, padding: 14, alignItems: 'center' }}>
                  <Text style={{ color: WM.title, fontWeight: '600' }}>Cancel</Text>
                </View>
              </TouchableOpacity>

            </LinearGradient>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </ScreenWrap>
  )
}
