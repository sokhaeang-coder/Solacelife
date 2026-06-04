/**
 * OnboardingBridgeScreen
 *
 * Bridges onboarding → first real action.
 * Phases: intro → confirm → moment → done
 *
 * Contact selection uses Contacts.selectContactAsync() — the native iOS
 * contact picker.  This bypasses any "limited contacts" permission the user
 * may have previously granted, showing their full address book every time.
 * No custom contact list UI needed.
 *
 * Family save: FamilyScreen filters `email !== null` to exclude auto-generated
 * reciprocal rows. We save email as '' (empty string, never null) so manually
 * added contacts always appear in the Family tab.
 *
 * Keyboard: phases render Animated.View INLINE — no child component wrapper —
 * to prevent remount-on-render keyboard dismissal.
 */
import { useState, useEffect, useRef, useContext } from 'react'
import {
  Text, View, TouchableOpacity, TextInput,
  ActivityIndicator, Animated, StatusBar, KeyboardAvoidingView,
  Platform, ScrollView,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import * as Contacts from 'expo-contacts'
import * as Notifications from 'expo-notifications'
import DateTimePicker from '@react-native-community/datetimepicker'
import { supabase } from '../../lib/supabase'
import { WARM, WM, SUPABASE_URL, SUPABASE_ANON_KEY } from '../../lib/constants'
import { AuthContext } from '../../lib/AuthContext'

// ── Types ────────────────────────────────────────────────────────
// No 'contacts' phase — native picker replaces it
type Phase = 'intro' | 'confirm' | 'moment' | 'done'

const RELATIONSHIPS = [
  { label: 'Husband', icon: '💍' },
  { label: 'Wife',    icon: '💍' },
  { label: 'Partner', icon: '💑' },
  { label: 'Child',   icon: '👶' },
  { label: 'Mother',  icon: '👩' },
  { label: 'Father',  icon: '👨' },
  { label: 'Brother', icon: '🤝' },
  { label: 'Sister',  icon: '🤝' },
  { label: 'Friend',  icon: '😊' },
  { label: 'Other',   icon: '🌿' },
]

// ── Contact display helpers ───────────────────────────────────────
function initials(contact: Contacts.Contact): string {
  return (contact.name || contact.firstName || '?')
    .split(' ').map((w: string) => w[0] || '').join('').slice(0, 2).toUpperCase()
}
function displayName(contact: Contacts.Contact): string {
  return contact.name || contact.firstName || 'this person'
}
function firstNameOf(contact: Contacts.Contact): string {
  return contact.firstName || (contact.name || '').split(' ')[0] || 'them'
}

// ── Screen ───────────────────────────────────────────────────────
export default function OnboardingBridgeScreen() {
  const { setOnboardingDone } = useContext(AuthContext)

  const [phase,          setPhase]          = useState<Phase>('intro')
  const [picking,        setPicking]        = useState(false)   // native picker open
  const [picked,         setPicked]         = useState<Contacts.Contact | null>(null)
  const [relationship,   setRelationship]   = useState('')
  const [contactEmail,   setContactEmail]   = useState('')      // typed if no device email
  const [savedMemberId,  setSavedMemberId]  = useState<string | null>(null)
  const [momentTitle,    setMomentTitle]    = useState('')
  const [momentBody,     setMomentBody]     = useState('')
  const [momentDate,     setMomentDate]     = useState<Date>(() => {
    const d = new Date(); d.setDate(d.getDate() + 30); return d
  })
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [saving,         setSaving]         = useState(false)

  // Inline animation values — applied directly on each phase's Animated.View
  const fadeAnim  = useRef(new Animated.Value(0)).current
  const slideAnim = useRef(new Animated.Value(30)).current
  const doneScale = useRef(new Animated.Value(0)).current

  const animStyle = {
    flex: 1,
    opacity: fadeAnim,
    transform: [{ translateY: slideAnim }],
  }

  function animateIn() {
    fadeAnim.setValue(0)
    slideAnim.setValue(30)
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 360, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 360, useNativeDriver: true }),
    ]).start()
  }

  useEffect(() => { animateIn() }, [phase])

  useEffect(() => {
    if (phase !== 'done') return
    Animated.spring(doneScale, {
      toValue: 1, friction: 5, tension: 80, useNativeDriver: true,
    }).start()
    const t = setTimeout(finish, 2400)
    return () => clearTimeout(t)
  }, [phase])

  function finish() { setOnboardingDone(true) }

  // ── Shared style objects (not components) ────────────────────
  const labelStyle = {
    fontSize: 12, fontWeight: '700' as const, color: WM.sub,
    letterSpacing: 1.2, textTransform: 'uppercase' as const, marginBottom: 8,
  }
  const inputBase = {
    backgroundColor: WM.inputBg, borderWidth: 1.5, borderColor: WM.border,
    borderRadius: 14, padding: 17, color: WM.title, fontSize: 16,
  }

  // ── Open native iOS contact picker ───────────────────────────
  // selectContactAsync shows the system contact picker — bypasses any
  // "limited contacts" permission the user may have previously set.
  async function openContactPicker() {
    setPicking(true)
    try {
      // Ask for notifications first (non-blocking, best-effort)
      if (Platform.OS !== 'web') {
        await Notifications.requestPermissionsAsync().catch(() => {})
      }

      const contact = await Contacts.presentContactPickerAsync()

      if (contact) {
        setPicked(contact)
        setRelationship('')
        setContactEmail(contact.emails?.[0]?.email || '')
        setPhase('confirm')
      }
      // If user cancels the picker, contact is undefined — stay on intro
    } catch (e: any) {
      // User dismissed the picker or permissions hard-denied — stay on intro
      console.log('Contact picker closed:', e?.message)
    }
    setPicking(false)
  }

  const pickedHasEmail = !!(picked?.emails?.[0]?.email)

  // ── Save family member to Supabase ───────────────────────────
  // email: null (not '') — empty string hits the partial unique index
  // (user_id, email) WHERE email IS NOT NULL. FamilyScreen shows rows
  // with relationship_label even when email IS NULL so this is safe.
  async function saveContact() {
    if (!picked || !relationship) return
    setSaving(true)
    try {
      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession()
      const user = sessionData?.session?.user
      if (sessionErr || !user) { setSaving(false); goToMoment(null); return }

      const phone = picked.phoneNumbers?.[0]?.number?.replace(/\s/g, '') || null
      const email = picked.emails?.[0]?.email || contactEmail.trim() || null
      const name  = displayName(picked)

      // Defensive: ensure profile exists (handle_new_user trigger may have failed)
      await supabase.from('profiles').upsert(
        { id: user.id, email: user.email, account_type: 'sender', onboarding_type: 'sender' },
        { onConflict: 'id', ignoreDuplicates: true }
      )

      const { data: member, error } = await supabase
        .from('family_members')
        .insert({
          user_id:            user.id,
          name,
          email,
          phone,
          relationship:       relationship,   // canonical capitalized label — must match FamilyScreen RELATIONSHIPS pills
          relationship_label: relationship,
          is_trusted_contact: false,
        })
        .select('id')
        .single()

      if (error || !member?.id) {
        console.warn('Family member insert error:', error?.message, error?.code)
        setSaving(false)
        goToMoment(null)
        return
      }

      setSavedMemberId(member.id)

      // Send invite only if we have an email address
      if (email) {
        fetch(`${SUPABASE_URL}/functions/v1/send-family-invite`, {
          method:  'POST',
          headers: {
            'Content-Type':  'application/json',
            Authorization:   `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ family_member_id: member.id }),
        }).catch(e => console.warn('Invite send failed:', e))
      }

      setSaving(false)
      goToMoment(member.id)
    } catch (e: any) {
      console.warn('Contact save error:', e?.message)
      setSaving(false)
      goToMoment(null)
    }
  }

  function goToMoment(memberId: string | null) {
    if (picked) setMomentTitle(`Birthday message for ${firstNameOf(picked)}`)
    setPhase('moment')
  }

  // ── Save moment + scheduled delivery ────────────────────────
  async function saveMoment() {
    if (!momentTitle.trim() || !momentBody.trim()) return
    setSaving(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const user = sessionData?.session?.user
      if (!user) { setSaving(false); setPhase('done'); return }

      const { data: memory, error: memErr } = await supabase
        .from('memories')
        .insert({
          user_id: user.id,
          title:   momentTitle.trim(),
          type:    'text',
          content: momentBody.trim(),
        })
        .select('id')
        .single()

      if (memErr || !memory?.id) {
        console.warn('Memory insert error:', memErr?.message)
        setSaving(false)
        setPhase('done')
        return
      }

      // Prefer the member saved earlier in this session; fall back to most recent
      let familyMemberId = savedMemberId
      if (!familyMemberId) {
        const { data: members } = await supabase
          .from('family_members')
          .select('id')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
        familyMemberId = members?.[0]?.id || null
      }

      if (familyMemberId) {
        const { error: delErr } = await supabase
          .from('scheduled_deliveries')
          .insert({
            user_id:          user.id,
            memory_id:        memory.id,
            family_member_id: familyMemberId,
            scheduled_date:   momentDate.toISOString().slice(0, 10),
            message:          momentBody.trim(),
          })
        if (delErr) console.warn('Delivery insert error:', delErr.message)
      }
    } catch (e: any) {
      console.warn('Moment save error:', e?.message)
    }
    setSaving(false)
    setPhase('done')
  }

  // ════════════════════════════════════════════════════════════
  //  RENDER
  // ════════════════════════════════════════════════════════════
  return (
    <LinearGradient colors={WARM} style={{ flex: 1 }}>
      <StatusBar barStyle="dark-content" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >

        {/* ══════════ INTRO ══════════ */}
        {phase === 'intro' && (
          <Animated.View style={animStyle}>
            <ScrollView
              contentContainerStyle={{ flexGrow: 1, justifyContent: 'center',
                paddingHorizontal: 28, paddingTop: 64, paddingBottom: 32 }}
              showsVerticalScrollIndicator={false}
            >
              <View style={{ alignItems: 'center', marginBottom: 8 }}>
                <Text style={{ fontSize: 56, marginBottom: 8 }}>🌱</Text>
                <Text style={{ fontSize: 28, fontWeight: '800', color: WM.title,
                  textAlign: 'center', letterSpacing: -0.5, marginBottom: 12 }}>
                  One person.{'\n'}One moment.
                </Text>
                <Text style={{ fontSize: 15, color: WM.sub, textAlign: 'center',
                  lineHeight: 24, maxWidth: 300, marginBottom: 32 }}>
                  Think of someone you love — a birthday, an anniversary, a note
                  you'd want them to have.{'\n\n'}Let's create it together, right now.
                </Text>
              </View>

              {/* Permission explain banner */}
              <View style={{
                backgroundColor: WM.cardBg, borderRadius: 16,
                borderWidth: 1, borderColor: WM.border,
                padding: 16, marginBottom: 28,
                flexDirection: 'row', gap: 12, alignItems: 'flex-start',
              }}>
                <Text style={{ fontSize: 28 }}>🔔</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: WM.title, marginBottom: 4 }}>
                    We'll need a couple of permissions
                  </Text>
                  <Text style={{ fontSize: 12, color: WM.sub, lineHeight: 19 }}>
                    Notifications let us check in with you so your trusted contacts
                    know you're okay. Your contact picker will open so you can
                    choose one person from your full address book.
                  </Text>
                </View>
              </View>

              {/* Primary CTA — opens native iOS picker */}
              <TouchableOpacity
                onPress={openContactPicker}
                disabled={picking}
                activeOpacity={0.85}
                style={{
                  backgroundColor: WM.accent, borderRadius: 16,
                  padding: 18, alignItems: 'center', marginBottom: 16,
                  shadowColor: WM.accent, shadowOpacity: 0.35,
                  shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6,
                  opacity: picking ? 0.7 : 1,
                }}
              >
                {picking ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700' }}>
                    Choose from my contacts  →
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity onPress={finish} activeOpacity={0.7}
                style={{ alignItems: 'center', paddingVertical: 12 }}>
                <Text style={{ color: WM.sub, fontSize: 14 }}>
                  Skip — I'll set this up later
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </Animated.View>
        )}

        {/* ══════════ CONFIRM ══════════ */}
        {phase === 'confirm' && picked && (
          <Animated.View style={animStyle}>
            <ScrollView
              contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24,
                paddingTop: 60, paddingBottom: 32 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              keyboardDismissMode="none"
            >
              <Text style={{ fontSize: 22, fontWeight: '800', color: WM.title, marginBottom: 4 }}>
                Is this who you meant?
              </Text>
              <Text style={{ fontSize: 14, color: WM.sub, marginBottom: 24 }}>
                We'll add them to your Family and send a warm invitation.
              </Text>

              {/* Contact card */}
              <View style={{
                backgroundColor: WM.cardBg, borderRadius: 18,
                borderWidth: 1.5, borderColor: WM.border, padding: 20,
                flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 24,
              }}>
                <View style={{
                  width: 56, height: 56, borderRadius: 28, backgroundColor: WM.accentBg,
                  alignItems: 'center', justifyContent: 'center',
                  borderWidth: 1.5, borderColor: 'rgba(240,98,146,0.3)',
                }}>
                  <Text style={{ fontSize: 20, fontWeight: '700', color: WM.accent }}>
                    {initials(picked)}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 18, fontWeight: '700', color: WM.title, marginBottom: 3 }}>
                    {displayName(picked)}
                  </Text>
                  {picked.phoneNumbers?.[0]?.number && (
                    <Text style={{ fontSize: 13, color: WM.sub }}>
                      📞 {picked.phoneNumbers[0].number}
                    </Text>
                  )}
                  {picked.emails?.[0]?.email ? (
                    <Text style={{ fontSize: 13, color: WM.sub }}>
                      ✉️ {picked.emails[0].email}
                    </Text>
                  ) : (
                    <Text style={{ fontSize: 12, color: WM.accent }}>No email on file</Text>
                  )}
                </View>
              </View>

              {/* Optional email input — shown when contact has no email */}
              {!pickedHasEmail && (
                <View style={{ marginBottom: 20 }}>
                  <Text style={labelStyle}>Their email address (optional)</Text>
                  <TextInput
                    style={[inputBase, { marginBottom: 6 }]}
                    placeholder="e.g. mum@example.com"
                    placeholderTextColor={WM.sub}
                    value={contactEmail}
                    onChangeText={setContactEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="done"
                    blurOnSubmit={false}
                  />
                  <Text style={{ fontSize: 12, color: WM.sub, opacity: 0.8, lineHeight: 17 }}>
                    Used to send them a Solace invitation. You can add this later in the Family tab.
                  </Text>
                </View>
              )}

              {/* Relationship pills */}
              <Text style={labelStyle}>Who is this person to you?</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 28 }}>
                {RELATIONSHIPS.map(r => {
                  const active = relationship === r.label
                  return (
                    <TouchableOpacity
                      key={r.label}
                      onPress={() => setRelationship(r.label)}
                      activeOpacity={0.8}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 6,
                        paddingHorizontal: 16, paddingVertical: 10, borderRadius: 24,
                        backgroundColor: active ? WM.accentBg : WM.cardBg,
                        borderWidth: 1.5,
                        borderColor: active ? WM.accent : WM.border,
                      }}
                    >
                      <Text style={{ fontSize: 16 }}>{r.icon}</Text>
                      <Text style={{
                        fontSize: 14, fontWeight: active ? '700' : '500',
                        color: active ? WM.accent : WM.sub,
                      }}>
                        {r.label}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </View>

              {/* Pick a different contact */}
              <TouchableOpacity
                onPress={openContactPicker}
                disabled={picking}
                activeOpacity={0.7}
                style={{
                  backgroundColor: WM.cardBg, borderRadius: 14,
                  borderWidth: 1, borderColor: WM.border,
                  padding: 16, alignItems: 'center', marginBottom: 12,
                }}
              >
                <Text style={{ color: WM.sub, fontSize: 15, fontWeight: '600' }}>
                  ← Choose someone else
                </Text>
              </TouchableOpacity>

              {/* Confirm & add */}
              <TouchableOpacity
                onPress={saveContact}
                disabled={!relationship || saving}
                activeOpacity={0.85}
                style={{
                  backgroundColor: relationship ? WM.accent : 'rgba(200,180,190,0.4)',
                  borderRadius: 16, padding: 18, alignItems: 'center',
                  shadowColor: WM.accent, shadowOpacity: relationship ? 0.35 : 0,
                  shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
                  elevation: relationship ? 6 : 0,
                }}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700' }}>
                    Add {firstNameOf(picked)} & continue  →
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity onPress={finish} activeOpacity={0.7}
                style={{ alignItems: 'center', paddingVertical: 14 }}>
                <Text style={{ color: WM.sub, fontSize: 13 }}>Skip — I'll add family later</Text>
              </TouchableOpacity>
            </ScrollView>
          </Animated.View>
        )}

        {/* ══════════ MOMENT ══════════ */}
        {phase === 'moment' && (
          <Animated.View style={animStyle}>
            <ScrollView
              contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24,
                paddingTop: 60, paddingBottom: 32 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              keyboardDismissMode="none"
            >
              <View style={{ alignItems: 'center', marginBottom: 6 }}>
                <Text style={{ fontSize: 36, marginBottom: 8 }}>💌</Text>
              </View>
              <Text style={{ fontSize: 22, fontWeight: '800', color: WM.title,
                textAlign: 'center', marginBottom: 8 }}>
                Write your first moment
              </Text>
              <Text style={{ fontSize: 14, color: WM.sub, textAlign: 'center',
                lineHeight: 22, marginBottom: 28 }}>
                This message will go out automatically on the date you choose —
                even if you're not around.
              </Text>

              {/* Title */}
              <Text style={labelStyle}>Message title</Text>
              <TextInput
                style={[inputBase, { marginBottom: 16 }]}
                placeholder="e.g. Birthday message for Mum"
                placeholderTextColor={WM.sub}
                value={momentTitle}
                onChangeText={setMomentTitle}
                returnKeyType="next"
                autoCapitalize="sentences"
                blurOnSubmit={false}
              />

              {/* Body */}
              <Text style={labelStyle}>Your message</Text>
              <TextInput
                style={[inputBase, {
                  height: 130, textAlignVertical: 'top',
                  paddingTop: 14, marginBottom: 20,
                }]}
                placeholder="Write what you'd want them to hear…"
                placeholderTextColor={WM.sub}
                value={momentBody}
                onChangeText={setMomentBody}
                multiline
                autoCapitalize="sentences"
                blurOnSubmit={false}
              />

              {/* Date row */}
              <Text style={labelStyle}>Send date</Text>
              <TouchableOpacity
                onPress={() => setShowDatePicker(v => !v)}
                activeOpacity={0.8}
                style={{
                  backgroundColor: WM.cardBg, borderRadius: 14,
                  borderWidth: 1.5,
                  borderColor: showDatePicker ? WM.accent : WM.border,
                  padding: 16, flexDirection: 'row', alignItems: 'center',
                  gap: 12, marginBottom: 12,
                }}
              >
                <Text style={{ fontSize: 22 }}>📅</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: WM.title }}>
                    {momentDate.toLocaleDateString('en-US', {
                      month: 'long', day: 'numeric', year: 'numeric',
                    })}
                  </Text>
                  <Text style={{ fontSize: 12, color: WM.sub, marginTop: 2 }}>
                    {showDatePicker ? 'Tap to close' : 'Tap to change date'}
                  </Text>
                </View>
                <Text style={{ fontSize: 16, color: WM.sub }}>
                  {showDatePicker ? '▲' : '›'}
                </Text>
              </TouchableOpacity>

              {showDatePicker && (
                <View style={{ marginBottom: 16 }}>
                  <DateTimePicker
                    value={momentDate}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'inline' : 'default'}
                    minimumDate={new Date()}
                    onChange={(_event: any, selectedDate?: Date) => {
                      if (Platform.OS !== 'ios') setShowDatePicker(false)
                      if (selectedDate) setMomentDate(selectedDate)
                    }}
                    themeVariant="light"
                  />
                  {Platform.OS === 'ios' && (
                    <TouchableOpacity
                      onPress={() => setShowDatePicker(false)}
                      activeOpacity={0.8}
                      style={{
                        backgroundColor: WM.accent, borderRadius: 14,
                        padding: 14, alignItems: 'center', marginTop: 8,
                      }}
                    >
                      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>
                        Confirm date
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {/* Schedule CTA */}
              <TouchableOpacity
                onPress={saveMoment}
                disabled={!momentTitle.trim() || !momentBody.trim() || saving}
                activeOpacity={0.85}
                style={{
                  backgroundColor: (momentTitle.trim() && momentBody.trim())
                    ? WM.accent : 'rgba(200,180,190,0.4)',
                  borderRadius: 16, padding: 18, alignItems: 'center',
                  marginTop: 8, marginBottom: 12,
                  shadowColor: WM.accent,
                  shadowOpacity: (momentTitle.trim() && momentBody.trim()) ? 0.35 : 0,
                  shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
                  elevation: (momentTitle.trim() && momentBody.trim()) ? 6 : 0,
                }}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700' }}>
                    Schedule this moment  →
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity onPress={finish} activeOpacity={0.7}
                style={{ alignItems: 'center', paddingVertical: 12 }}>
                <Text style={{ color: WM.sub, fontSize: 13 }}>Skip — I'll write moments later</Text>
              </TouchableOpacity>
            </ScrollView>
          </Animated.View>
        )}

        {/* ══════════ DONE ══════════ */}
        {phase === 'done' && (
          <Animated.View style={[animStyle, { alignItems: 'center',
            justifyContent: 'center', paddingHorizontal: 32 }]}>
            <Animated.Text style={{ fontSize: 72, marginBottom: 16,
              transform: [{ scale: doneScale }] }}>
              🌸
            </Animated.Text>
            <Text style={{ fontSize: 26, fontWeight: '800', color: WM.title,
              textAlign: 'center', marginBottom: 16 }}>
              You've started something beautiful.
            </Text>

            {/* Consent hold explanation */}
            <View style={{
              backgroundColor: WM.cardBg, borderRadius: 18,
              borderWidth: 1, borderColor: WM.border,
              padding: 20, marginBottom: 8,
            }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: WM.title,
                marginBottom: 8, textAlign: 'center' }}>
                🔒  Held safely until they're ready
              </Text>
              <Text style={{ fontSize: 13, color: WM.sub, textAlign: 'center', lineHeight: 21 }}>
                Your moment is saved and waiting.{' '}
                {savedMemberId
                  ? 'We\'ve sent them an invitation — once they accept, your message will arrive automatically on the date you chose.'
                  : 'Add their email from the Family tab to send them an invitation to receive your moments.'}
              </Text>
            </View>

            <Text style={{ fontSize: 12, color: WM.sub, textAlign: 'center',
              opacity: 0.6, lineHeight: 18, marginTop: 8 }}>
              They will never know the message exists until they accept.
            </Text>
          </Animated.View>
        )}

      </KeyboardAvoidingView>
    </LinearGradient>
  )
}
