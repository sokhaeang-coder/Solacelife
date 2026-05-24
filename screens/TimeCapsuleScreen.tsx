import { useState, useEffect, useRef } from 'react'
import {
  Text, View, TouchableOpacity, ScrollView, Modal,
  TextInput, Animated, KeyboardAvoidingView, Platform,
  ActivityIndicator, Alert,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { supabase } from '../lib/supabase'
import { C } from '../lib/constants'
import { s } from '../lib/styles'
import ScreenWrap from '../components/ScreenWrap'
import { CalendarPicker } from '../components/CalendarPicker'

// ── Occasions ─────────────────────────────────────────────────
const OCCASIONS = [
  { id: 'birthday',    label: 'Birthday',          icon: '🎂' },
  { id: 'wedding',     label: 'Wedding Day',        icon: '💍' },
  { id: 'anniversary', label: 'Anniversary',        icon: '🌹' },
  { id: 'graduation',  label: 'Graduation',         icon: '🎓' },
  { id: 'newbaby',     label: 'New Baby',           icon: '👶' },
  { id: 'holiday',     label: 'Holiday',            icon: '🕊️' },
  { id: 'justbecause', label: 'Just Because',       icon: '💛' },
  { id: 'custom',      label: 'A Date I Choose',    icon: '📅' },
]

function defaultDateObj() {
  const d = new Date(); d.setFullYear(d.getFullYear() + 1)
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() }
}

// Given a stored date string like "April 1, 2016" or "October 3, 1982",
// return the next upcoming occurrence: same month/day, current year if not yet
// passed, next year if it already has. Returns null if no date is stored.
function nextOccurrence(dateStr: string | null | undefined): { year: number; month: number; day: number } | null {
  if (!dateStr) return null
  const parsed = new Date(dateStr)
  if (isNaN(parsed.getTime())) return null
  const month = parsed.getMonth() + 1
  const day   = parsed.getDate()
  const now   = new Date()
  const thisYear = now.getFullYear()
  // If this year's date is still in the future (or today), use it; otherwise next year
  const thisOccurrence = new Date(thisYear, month - 1, day)
  const year = thisOccurrence >= now ? thisYear : thisYear + 1
  return { month, day, year }
}

// For a given occasion + member, try to auto-fill the delivery date
function autoDateForOccasion(member: any | null, occasionId: string): { year: number; month: number; day: number } | null {
  if (!member) return null
  if (occasionId === 'anniversary') return nextOccurrence(member.anniversary)
  if (occasionId === 'birthday')    return nextOccurrence(member.date_of_birth)
  return null
}

function formatDate(d: { year: number; month: number; day: number }) {
  return new Date(d.year, d.month - 1, d.day)
    .toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function formatRelative(iso: string) {
  if (!iso) return ''
  const d = new Date(iso + 'T12:00:00')
  const now = new Date()
  const diff = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  if (diff < 0) return 'Delivered'
  if (diff === 0) return 'Delivers today'
  if (diff === 1) return 'Delivers tomorrow'
  if (diff < 30) return `In ${diff} days`
  if (diff < 365) return `In ${Math.round(diff / 30)} months`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function isPast(iso: string) {
  return new Date(iso + 'T12:00:00') < new Date()
}

// ── Capsule card ──────────────────────────────────────────────
function CapsuleCard({ item, onCancel }: { item: any; onCancel: () => void }) {
  const past = isPast(item.scheduled_date)
  const occ = OCCASIONS.find(o => o.id === item.occasion_id)
  return (
    <View style={{
      marginHorizontal: 20, marginBottom: 12, borderRadius: 18,
      backgroundColor: past ? C.mauveDim + '33' : C.mauveDim + '55',
      borderWidth: 1, borderColor: past ? C.greyDim + '33' : C.accent + '44',
      padding: 16,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {/* Icon */}
        <View style={{
          width: 46, height: 46, borderRadius: 23,
          backgroundColor: past ? C.greyDim + '33' : C.accent + '22',
          borderWidth: 1, borderColor: past ? C.greyDim + '33' : C.accent + '55',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Text style={{ fontSize: 22 }}>{occ?.icon ?? '💌'}</Text>
        </View>

        {/* Text */}
        <View style={{ flex: 1 }}>
          <Text style={{ color: past ? C.grey : C.offWhite, fontSize: 15, fontWeight: '700', marginBottom: 2 }}>
            {item.memories?.title || 'My Message'}
          </Text>
          <Text style={{ color: C.grey, fontSize: 13 }}>
            To {item.family_members?.name || 'Family'} · {occ?.label ?? 'Special Date'}
          </Text>
          <Text style={{
            color: past ? C.greyDim : C.amberLight,
            fontSize: 12, fontWeight: '600', marginTop: 4,
          }}>
            {formatRelative(item.scheduled_date)}
          </Text>
        </View>

        {/* Cancel (only for future) */}
        {!past && (
          <TouchableOpacity
            onPress={onCancel}
            style={{ padding: 8 }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ color: C.greyDim, fontSize: 18 }}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Message preview */}
      {item.message && (
        <Text style={{
          color: C.grey, fontSize: 13, lineHeight: 19,
          marginTop: 10, fontStyle: 'italic',
          borderTopWidth: 1, borderTopColor: C.greyDim + '33', paddingTop: 10,
        }} numberOfLines={2}>
          "{item.message}"
        </Text>
      )}
    </View>
  )
}

// ── Step indicator ────────────────────────────────────────────
function StepDots({ total, current }: { total: number; current: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginBottom: 20 }}>
      {Array.from({ length: total }).map((_, i) => (
        <View key={i} style={{
          width: i === current ? 20 : 7, height: 7, borderRadius: 4,
          backgroundColor: i === current ? C.accent : i < current ? C.accent + '55' : C.greyDim + '44',
        }} />
      ))}
    </View>
  )
}

// ── Main screen ───────────────────────────────────────────────
export default function TimeCapsuleScreen({ navigation }: any) {
  const [capsules, setCapsules]         = useState<any[]>([])
  const [familyMembers, setFamilyMembers] = useState<any[]>([])
  const [loading, setLoading]           = useState(true)
  const [tab, setTab]                   = useState<'upcoming' | 'sent'>('upcoming')
  const [showComposer, setShowComposer] = useState(false)

  // Composer state
  const [step, setStep]                 = useState(0)
  const [selectedMember, setSelectedMember] = useState<any>(null)
  const [selectedOccasion, setSelectedOccasion] = useState<any>(null)
  const [msgTitle, setMsgTitle]         = useState('')
  const [msgBody, setMsgBody]           = useState('')
  const [deliveryDate, setDeliveryDate] = useState(defaultDateObj())
  const [saving, setSaving]             = useState(false)
  const [saveMsg, setSaveMsg]           = useState('')

  const fadeAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 700, useNativeDriver: true }).start()
    load()
  }, [])

  useEffect(() => {
    const unsub = navigation.addListener('focus', load)
    return unsub
  }, [navigation])

  async function load() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const [capRes, famRes] = await Promise.all([
      supabase
        .from('scheduled_deliveries')
        .select('*, memories(id, title, type), family_members(id, name)')
        .eq('user_id', user.id)
        .order('scheduled_date', { ascending: true }),
      supabase
        .from('family_members')
        .select('*')
        .eq('user_id', user.id)
        .order('name'),
    ])
    setCapsules(capRes.data || [])
    setFamilyMembers(famRes.data || [])
    setLoading(false)
  }

  function openComposer() {
    setStep(0)
    setSelectedMember(null)
    setSelectedOccasion(null)
    setMsgTitle('')
    setMsgBody('')
    setDeliveryDate(defaultDateObj())
    setSaveMsg('')
    setShowComposer(true)
  }

  async function saveCapsule() {
    if (!msgBody.trim()) { setSaveMsg('Please write your message.'); return }
    setSaving(true); setSaveMsg('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    // 1. Create the memory (type: written)
    const title = msgTitle.trim() || `Message for ${selectedMember?.name || 'my loved one'}`
    const { data: memory, error: memErr } = await supabase
      .from('memories')
      .insert({ user_id: user.id, type: 'written', title, content: msgBody.trim() })
      .select()
      .single()
    if (memErr || !memory) {
      setSaveMsg('Could not save message. Please try again.')
      setSaving(false); return
    }

    // 2. Create the scheduled delivery.
    // occasion_id requires migration 008 to be run in Supabase. We try with it
    // first; if Supabase's schema cache doesn't know the column yet we retry
    // without it so the message still schedules successfully.
    const dateStr = `${deliveryDate.year}-${String(deliveryDate.month).padStart(2,'0')}-${String(deliveryDate.day).padStart(2,'0')}`
    const deliveryPayload: Record<string, any> = {
      user_id:          user.id,
      memory_id:        memory.id,
      family_member_id: selectedMember?.id || null,
      scheduled_date:   dateStr,
      message:          msgBody.trim(),
      occasion_id:      selectedOccasion?.id || 'custom',
    }
    let { error: delErr } = await supabase.from('scheduled_deliveries').insert(deliveryPayload)
    if (delErr?.message?.includes('occasion_id')) {
      // Migration 008 not yet applied — retry without the column so it doesn't block
      const { occasion_id: _dropped, ...payloadWithout } = deliveryPayload
      const retry = await supabase.from('scheduled_deliveries').insert(payloadWithout)
      delErr = retry.error ?? null
    }
    setSaving(false)
    if (delErr) { setSaveMsg('Message saved but scheduling failed: ' + delErr.message); return }
    setShowComposer(false)
    load()
  }

  async function cancelCapsule(id: string) {
    Alert.alert('Cancel Message', 'This will permanently delete this scheduled message. Are you sure?', [
      { text: 'Keep It', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        await supabase.from('scheduled_deliveries').delete().eq('id', id)
        load()
      }},
    ])
  }

  const upcoming = capsules.filter(c => !isPast(c.scheduled_date))
  const sent     = capsules.filter(c => isPast(c.scheduled_date))

  // ── Render ─────────────────────────────────────────────────
  return (
    <ScreenWrap>
      <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={true}>

          {/* ── Hero ── */}
          <LinearGradient
            colors={[C.bg2, C.mauveDim + '44', C.bg1]}
            style={{ paddingTop: 56, paddingBottom: 28, paddingHorizontal: 24, alignItems: 'center' }}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
            <Text style={{ fontSize: 52, marginBottom: 12 }}>💌</Text>
            <Text style={{ fontSize: 26, fontWeight: '800', color: C.white, textAlign: 'center', marginBottom: 8 }}>
              Love Letters for the Future
            </Text>
            <Text style={{ fontSize: 15, color: C.grey, textAlign: 'center', lineHeight: 22, maxWidth: 300 }}>
              Record a message for someone you love. Set the day it arrives.{'\n'}
              They'll receive it — exactly when it matters most.
            </Text>
          </LinearGradient>

          {/* ── Create button ── */}
          <View style={{ paddingHorizontal: 20, marginTop: 20, marginBottom: 24 }}>
            <TouchableOpacity onPress={openComposer} activeOpacity={0.85}>
              <LinearGradient
                colors={[C.accent, '#5A3A8A']}
                style={{ borderRadius: 18, paddingVertical: 18, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 10 }}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                <Text style={{ fontSize: 20 }}>✍️</Text>
                <Text style={{ color: C.white, fontSize: 18, fontWeight: '700' }}>Create a Message</Text>
              </LinearGradient>
            </TouchableOpacity>

            {familyMembers.length === 0 && (
              <TouchableOpacity
                onPress={() => navigation.navigate('Family')}
                style={{ marginTop: 10, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: C.amber + '55', backgroundColor: C.amber + '11', alignItems: 'center' }}>
                <Text style={{ color: C.amberLight, fontSize: 13 }}>
                  👨‍👩‍👧 Add family members first so you can address messages to them →
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* ── Tabs ── */}
          {capsules.length > 0 && (
            <>
              <View style={{ flexDirection: 'row', marginHorizontal: 20, marginBottom: 16, backgroundColor: C.mauveDim + '44', borderRadius: 14, padding: 4 }}>
                {(['upcoming', 'sent'] as const).map(t => (
                  <TouchableOpacity
                    key={t}
                    onPress={() => setTab(t)}
                    style={[{ flex: 1, paddingVertical: 10, borderRadius: 11, alignItems: 'center' },
                      tab === t && { backgroundColor: C.accent }]}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: tab === t ? C.white : C.grey }}>
                      {t === 'upcoming' ? `Scheduled  ${upcoming.length > 0 ? `(${upcoming.length})` : ''}` : `Delivered  ${sent.length > 0 ? `(${sent.length})` : ''}`}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {loading ? (
                <ActivityIndicator color={C.accent} style={{ marginTop: 40 }} />
              ) : tab === 'upcoming' ? (
                upcoming.length === 0 ? (
                  <View style={{ alignItems: 'center', paddingTop: 20, paddingHorizontal: 32 }}>
                    <Text style={{ fontSize: 36, marginBottom: 12 }}>📬</Text>
                    <Text style={{ color: C.grey, textAlign: 'center', fontSize: 15, lineHeight: 22 }}>
                      No messages scheduled yet.{'\n'}Create your first one above.
                    </Text>
                  </View>
                ) : (
                  upcoming.map(c => <CapsuleCard key={c.id} item={c} onCancel={() => cancelCapsule(c.id)} />)
                )
              ) : (
                sent.length === 0 ? (
                  <View style={{ alignItems: 'center', paddingTop: 20, paddingHorizontal: 32 }}>
                    <Text style={{ fontSize: 36, marginBottom: 12 }}>✉️</Text>
                    <Text style={{ color: C.grey, textAlign: 'center', fontSize: 15, lineHeight: 22 }}>
                      No messages delivered yet.{'\n'}Your scheduled messages will appear here after they're sent.
                    </Text>
                  </View>
                ) : (
                  sent.map(c => <CapsuleCard key={c.id} item={c} onCancel={() => {}} />)
                )
              )}
            </>
          )}

          {/* ── Empty state (no capsules at all) ── */}
          {!loading && capsules.length === 0 && (
            <View style={{ alignItems: 'center', paddingTop: 8, paddingHorizontal: 32 }}>
              <Text style={{ color: C.grey, textAlign: 'center', fontSize: 14, lineHeight: 22, marginBottom: 20 }}>
                Imagine your daughter opening her phone on her wedding day and finding a message you wrote her — just for that moment.{'\n\n'}That's what this is.
              </Text>
              {/* Occasion chips — visual inspiration */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                {OCCASIONS.slice(0, 6).map(o => (
                  <TouchableOpacity
                    key={o.id}
                    onPress={openComposer}
                    style={{ backgroundColor: C.mauveDim + '55', borderWidth: 1, borderColor: C.accent + '44', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ fontSize: 16 }}>{o.icon}</Text>
                    <Text style={{ color: C.offWhite, fontSize: 13 }}>{o.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* ── Tips ── */}
          <View style={[s.tipCard, { marginTop: 28 }]}>
            <Text style={s.tipTitle}>🎥 Want to record a video message?</Text>
            <Text style={s.tipBody}>
              Head to the Moments tab to record a video, voice memo, or build a photo album — then schedule it for delivery from there.
            </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Memories')}>
              <Text style={s.tipLink}>Go to Moments →</Text>
            </TouchableOpacity>
          </View>

        </ScrollView>
      </Animated.View>

      {/* ══ Composer Modal ══════════════════════════════════════ */}
      <Modal visible={showComposer} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView
          style={{ flex: 1, backgroundColor: C.bg1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            contentContainerStyle={[
              { flexGrow: 1, padding: 24, paddingTop: 20 },
              // On web: centre the form in a readable column so the calendar
              // and form fields appear together without excessive whitespace
              Platform.OS === 'web' && { maxWidth: 560, alignSelf: 'center', width: '100%' },
            ]}
            keyboardShouldPersistTaps="handled">

            {/* Header */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <Text style={{ color: C.white, fontSize: 22, fontWeight: '800' }}>Create a Message</Text>
              <TouchableOpacity onPress={() => setShowComposer(false)} style={{ padding: 8 }}>
                <Text style={{ color: C.grey, fontSize: 24 }}>✕</Text>
              </TouchableOpacity>
            </View>

            <StepDots total={4} current={step} />

            {/* ── Step 0: Who is this for? ── */}
            {step === 0 && (
              <View>
                <Text style={{ color: C.white, fontSize: 20, fontWeight: '700', marginBottom: 6 }}>Who is this for?</Text>
                <Text style={{ color: C.grey, fontSize: 14, marginBottom: 20 }}>
                  Choose the person who will receive this message.
                </Text>
                {familyMembers.length === 0 ? (
                  <View style={{ backgroundColor: C.amber + '11', borderWidth: 1, borderColor: C.amber + '44', borderRadius: 14, padding: 16, alignItems: 'center' }}>
                    <Text style={{ color: C.amberLight, fontSize: 14, textAlign: 'center', lineHeight: 22 }}>
                      You haven't added any family members yet.{'\n'}Add them in the Family tab, then come back here.
                    </Text>
                    <TouchableOpacity
                      style={{ marginTop: 12, backgroundColor: C.amber + '33', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 9 }}
                      onPress={() => { setShowComposer(false); navigation.navigate('Family') }}>
                      <Text style={{ color: C.amberLight, fontWeight: '700' }}>Go to Family →</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  familyMembers.map(m => (
                    <TouchableOpacity
                      key={m.id}
                      onPress={() => setSelectedMember(m)}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 14,
                        backgroundColor: selectedMember?.id === m.id ? C.accent + '33' : C.mauveDim + '44',
                        borderWidth: 1, borderColor: selectedMember?.id === m.id ? C.accent : C.greyDim + '44',
                        borderRadius: 14, padding: 16, marginBottom: 10,
                      }}>
                      <View style={{
                        width: 44, height: 44, borderRadius: 22,
                        backgroundColor: C.accent + '22', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Text style={{ fontSize: 20 }}>👤</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: C.offWhite, fontSize: 16, fontWeight: '600' }}>{m.name}</Text>
                        {m.relationship && <Text style={{ color: C.grey, fontSize: 13 }}>{m.relationship}</Text>}
                      </View>
                      {selectedMember?.id === m.id && <Text style={{ color: C.accent, fontSize: 22 }}>✓</Text>}
                    </TouchableOpacity>
                  ))
                )}
              </View>
            )}

            {/* ── Step 1: What occasion? ── */}
            {step === 1 && (
              <View>
                <Text style={{ color: C.white, fontSize: 20, fontWeight: '700', marginBottom: 6 }}>What's the occasion?</Text>
                <Text style={{ color: C.grey, fontSize: 14, marginBottom: 20 }}>
                  This helps set the tone of when this message will mean the most.
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                  {OCCASIONS.map(o => (
                    <TouchableOpacity
                      key={o.id}
                      onPress={() => setSelectedOccasion(o)}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 8,
                        backgroundColor: selectedOccasion?.id === o.id ? C.accent + '44' : C.mauveDim + '44',
                        borderWidth: 1, borderColor: selectedOccasion?.id === o.id ? C.accent : C.greyDim + '44',
                        borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11,
                      }}>
                      <Text style={{ fontSize: 18 }}>{o.icon}</Text>
                      <Text style={{ color: selectedOccasion?.id === o.id ? C.white : C.offWhite, fontSize: 14, fontWeight: '500' }}>
                        {o.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* ── Step 2: Write the message ── */}
            {step === 2 && (
              <View>
                <Text style={{ color: C.white, fontSize: 20, fontWeight: '700', marginBottom: 6 }}>Write your message</Text>
                <Text style={{ color: C.grey, fontSize: 14, marginBottom: 20, lineHeight: 20 }}>
                  Write from the heart. This is yours — raw, honest, and exactly as you'd say it.
                </Text>

                <Text style={s.fieldLabel}>Give it a title (optional)</Text>
                <TextInput
                  style={[s.input, { marginBottom: 16 }]}
                  placeholder={`e.g. "To ${selectedMember?.name || 'you'}, on your ${selectedOccasion?.label ?? 'special day'}"`}
                  placeholderTextColor={C.greyDim}
                  value={msgTitle}
                  onChangeText={setMsgTitle}
                  maxLength={80}
                />

                <Text style={s.fieldLabel}>Your message</Text>
                <TextInput
                  style={[s.input, { height: 200, textAlignVertical: 'top', paddingTop: 16 }]}
                  placeholder="Dear [name],&#10;&#10;I wanted you to know..."
                  placeholderTextColor={C.greyDim}
                  value={msgBody}
                  onChangeText={setMsgBody}
                  multiline
                  maxLength={2000}
                />
                <Text style={{ color: C.greyDim, fontSize: 12, textAlign: 'right', marginTop: 4 }}>
                  {msgBody.length}/2000
                </Text>
              </View>
            )}

            {/* ── Step 3: Set delivery date ── */}
            {step === 3 && (
              <View>
                <Text style={{ color: C.white, fontSize: 20, fontWeight: '700', marginBottom: 6 }}>When should it arrive?</Text>
                <Text style={{ color: C.grey, fontSize: 14, marginBottom: 24, lineHeight: 20 }}>
                  Choose the exact date your message will be delivered to{' '}
                  <Text style={{ color: C.offWhite, fontWeight: '600' }}>{selectedMember?.name || 'your loved one'}</Text>.
                </Text>

                {/* Auto-fill hint — shown when the date was pulled from member's stored dates */}
                {(() => {
                  const auto = autoDateForOccasion(selectedMember, selectedOccasion?.id)
                  if (!auto) return null
                  const label = selectedOccasion?.id === 'birthday' ? `${selectedMember?.name}'s birthday` : `${selectedMember?.name}'s anniversary`
                  return (
                    <View style={{
                      flexDirection: 'row', alignItems: 'center', gap: 10,
                      backgroundColor: C.success + '18', borderWidth: 1,
                      borderColor: C.success + '44', borderRadius: 12,
                      padding: 12, marginBottom: 16,
                    }}>
                      <Text style={{ fontSize: 18 }}>✨</Text>
                      <Text style={{ color: C.success, fontSize: 13, flex: 1, lineHeight: 18 }}>
                        Date auto-filled from {label}. Change it below if you'd like a different year.
                      </Text>
                    </View>
                  )
                })()}

                {/* Shared calendar grid — same as Family DOB/anniversary picker */}
                <CalendarPicker
                  value={deliveryDate}
                  onChange={setDeliveryDate}
                  minYear={new Date().getFullYear()}
                  maxYear={new Date().getFullYear() + 50}
                />

                {/* Preview */}
                <View style={{ backgroundColor: C.accent + '22', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: C.accent + '44' }}>
                  <Text style={{ color: C.grey, fontSize: 13, marginBottom: 4 }}>Your message will be delivered on:</Text>
                  <Text style={{ color: C.white, fontSize: 18, fontWeight: '700' }}>{formatDate(deliveryDate)}</Text>
                  <Text style={{ color: C.accent, fontSize: 13, marginTop: 4 }}>
                    {selectedOccasion?.icon} {selectedOccasion?.label || 'Special Day'} · for {selectedMember?.name || 'your loved one'}
                  </Text>
                </View>

                {saveMsg ? (
                  <View style={[s.msgBox, s.msgError, { marginTop: 12 }]}>
                    <Text style={{ color: '#FF8A8A', fontSize: 14 }}>{saveMsg}</Text>
                  </View>
                ) : null}
              </View>
            )}

            {/* ── Navigation buttons ── */}
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 28 }}>
              {step > 0 && (
                <TouchableOpacity
                  onPress={() => setStep(s => s - 1)}
                  style={{ flex: 1, borderWidth: 1, borderColor: C.greyDim + '55', borderRadius: 14, paddingVertical: 15, alignItems: 'center' }}>
                  <Text style={{ color: C.grey, fontSize: 16 }}>← Back</Text>
                </TouchableOpacity>
              )}
              {step < 3 ? (
                <TouchableOpacity
                  onPress={() => {
                    if (step === 0 && !selectedMember && familyMembers.length > 0) return
                    if (step === 1 && !selectedOccasion) return
                    // Moving from occasion step → auto-populate delivery date from member's stored dates
                    if (step === 1 && selectedOccasion) {
                      const auto = autoDateForOccasion(selectedMember, selectedOccasion.id)
                      if (auto) setDeliveryDate(auto)
                    }
                    setStep(s => s + 1)
                  }}
                  disabled={
                    (step === 0 && !selectedMember && familyMembers.length > 0) ||
                    (step === 1 && !selectedOccasion)
                  }
                  style={{ flex: 1 }}
                  activeOpacity={0.85}>
                  <LinearGradient
                    colors={(step === 0 && !selectedMember && familyMembers.length > 0) || (step === 1 && !selectedOccasion)
                      ? [C.greyDim, C.greyDim] : [C.accent, '#5A3A8A']}
                    style={{ borderRadius: 14, paddingVertical: 15, alignItems: 'center' }}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                    <Text style={{ color: C.white, fontSize: 16, fontWeight: '700' }}>Continue →</Text>
                  </LinearGradient>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity onPress={saveCapsule} disabled={saving} style={{ flex: 1 }} activeOpacity={0.85}>
                  <LinearGradient
                    colors={saving ? [C.greyDim, C.greyDim] : [C.amberLight, C.amber, '#C07840']}
                    style={{ borderRadius: 14, paddingVertical: 15, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                    {saving ? <ActivityIndicator color={C.bg1} size="small" /> : <Text style={{ fontSize: 18 }}>💌</Text>}
                    <Text style={{ color: C.bg1, fontSize: 16, fontWeight: '700' }}>
                      {saving ? 'Scheduling…' : 'Schedule Message'}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              )}
            </View>

          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </ScreenWrap>
  )
}
