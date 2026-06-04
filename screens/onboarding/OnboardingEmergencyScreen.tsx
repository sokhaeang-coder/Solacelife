/**
 * OnboardingEmergencyScreen — Step 3 of 4
 *
 * Animated timeline that explains what trusted contacts do,
 * then lets the user designate up to 3 (if family members exist).
 *
 * Two states:
 *   - No family members yet → 3rd node shows "add family first" (dashed/faded)
 *   - Has family members   → 3rd node opens the priority picker
 */
import { useState, useEffect, useRef } from 'react'
import {
  Text, View, TouchableOpacity, ScrollView,
  ActivityIndicator, StatusBar, Animated, PanResponder, Image,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { supabase } from '../../lib/supabase'
import { WARM, WM, SUPABASE_URL, SUPABASE_ANON_KEY } from '../../lib/constants'

const LOGO_STACKED = require('../../assets/logos/logo-stacked.png')
import { refreshEmergencyNotification } from '../../lib/emergencyNotification'
import { OnboardingNavBar } from '../../components/OnboardingNavBar'

const PRIORITY_LABEL = ['1st', '2nd', '3rd']
const PRIORITY_COLOR = ['#E8453C', '#F5833A', '#F5A623']

export default function OnboardingEmergencyScreen({ navigation }: any) {
  const [members, setMembers]   = useState<any[]>([])
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [selected, setSelected] = useState<string[]>([])

  // ── Animation values ─────────────────────────────────────────
  const anim0    = useRef(new Animated.Value(0)).current  // node 1
  const anim1    = useRef(new Animated.Value(0)).current  // node 2
  const anim2    = useRef(new Animated.Value(0)).current  // node 3
  const lineAnim = useRef(new Animated.Value(0)).current  // spine opacity

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      const { data } = await supabase
        .from('family_members')
        .select('id, name, phone, relationship, email')
        .eq('user_id', user.id)
        .order('name')
      setMembers(data || [])
      setLoading(false)
    }
    load()
  }, [])

  // Staggered entrance once data is ready
  useEffect(() => {
    if (loading) return
    const make = (val: Animated.Value, delay: number) =>
      Animated.timing(val, { toValue: 1, duration: 480, delay, useNativeDriver: true })

    Animated.parallel([
      make(anim0,    200),
      make(lineAnim, 400),
      make(anim1,    620),
      make(anim2,   1040),
    ]).start()
  }, [loading])

  function animStyle(val: Animated.Value) {
    return {
      opacity: val,
      transform: [{
        translateY: val.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }),
      }],
    }
  }

  function toggleMember(id: string) {
    setSelected(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id)
      if (prev.length >= 3) return prev
      return [...prev, id]
    })
  }

  async function handleSave() {
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { goNext(); return }

      await supabase.from('family_members')
        .update({ is_emergency_contact: false, emergency_priority: null })
        .eq('user_id', user.id)

      await Promise.all(
        selected.map((id, i) => {
          const m = members.find(x => x.id === id)
          return supabase.from('family_members')
            .update({
              is_emergency_contact: true,
              emergency_priority:   i + 1,
              // Consent can only be requested by email — members added with
              // phone only stay 'none' until an email is added in Family tab
              ...(m?.email ? { emergency_consent_status: 'pending' } : {}),
            })
            .eq('id', id)
        })
      )

      await refreshEmergencyNotification(user.id)

      // Fire consent emails — is_new_member=true because they were just
      // added AND designated in the same onboarding flow. Skip members
      // without an email address; the Family tab will prompt for it.
      selected.forEach(id => {
        const m = members.find(x => x.id === id)
        if (!m?.email) return
        fetch(`${SUPABASE_URL}/functions/v1/send-emergency-contact-email`, {
          method:  'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ family_member_id: id, is_new_member: true }),
        }).catch(e => console.warn('Emergency email send failed:', e))
      })
    } catch (e) {
      console.warn('Emergency contact save error:', e)
    }
    goNext()
  }

  function goNext() {
    setSaving(false)
    navigation.navigate('OnboardingTour')
  }

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, { dx, dy }) =>
        Math.abs(dx) > 20 && Math.abs(dx) > Math.abs(dy),
      onPanResponderRelease: (_, { dx }) => {
        if (dx < -60) selected.length > 0 ? handleSave() : goNext()
        else if (dx > 60) navigation.goBack()
      },
    })
  ).current

  // ── Loading spinner ──────────────────────────────────────────
  if (loading) {
    return (
      <LinearGradient colors={WARM} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={WM.accent} size="large" />
      </LinearGradient>
    )
  }

  // ── Helpers ──────────────────────────────────────────────────
  function NodeDone() {
    return (
      <View style={{
        width: 28, height: 28, borderRadius: 14, flexShrink: 0,
        backgroundColor: '#F06292',
        alignItems: 'center', justifyContent: 'center',
        shadowColor: '#F06292', shadowOpacity: 0.45,
        shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
        elevation: 4,
      }}>
        <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800' }}>✓</Text>
      </View>
    )
  }

  function NodePending() {
    return (
      <View style={{
        width: 28, height: 28, borderRadius: 14, flexShrink: 0,
        backgroundColor: '#F06292',
        alignItems: 'center', justifyContent: 'center',
        shadowColor: '#F06292', shadowOpacity: 0.45,
        shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
        elevation: 4,
      }}>
        <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800' }}>✓</Text>
      </View>
    )
  }

  // ── Screen ───────────────────────────────────────────────────
  return (
    <LinearGradient colors={WARM} style={{ flex: 1 }}>
      <StatusBar barStyle="dark-content" />

      <View style={{ flex: 1 }} {...panResponder.panHandlers}>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: 24,
          paddingTop: 56,
          paddingBottom: 16,
        }}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Header ── */}
        <View style={{ alignItems: 'center', marginBottom: 32 }}>
          <Image source={LOGO_STACKED} style={{ height: 52, width: 100, resizeMode: 'contain', marginBottom: 10 }} />
          <Text style={{ fontSize: 40, marginBottom: 6 }}>🛡️</Text>
          <Text style={{
            fontSize: 10, color: WM.sub, letterSpacing: 1.5,
            textTransform: 'uppercase', marginBottom: 8,
          }}>Step 2 of 3</Text>
          <Text style={{
            fontSize: 26, fontWeight: '800', color: WM.title,
            textAlign: 'center', marginBottom: 10,
          }}>
            Trusted Contacts
          </Text>
          <Text style={{
            fontSize: 14, color: WM.sub, textAlign: 'center',
            lineHeight: 22, maxWidth: 300,
          }}>
            Here's what happens when you choose someone you trust.
          </Text>
        </View>

        {/* ── Animated timeline ── */}
        <View style={{ position: 'relative', paddingLeft: 4, marginBottom: 28 }}>

          {/* Vertical spine */}
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: 17, top: 28, bottom: 28,
              width: 2, opacity: lineAnim,
            }}
          >
            <LinearGradient
              colors={['#F06292', 'rgba(240,98,146,0.12)']}
              style={{ flex: 1, width: 2 }}
            />
          </Animated.View>

          {/* ── Node 1: Check-in alerts ── */}
          <Animated.View style={[{
            flexDirection: 'row', alignItems: 'flex-start', gap: 14, marginBottom: 18,
          }, animStyle(anim0)]}>
            <NodeDone />
            <View style={{
              flex: 1, backgroundColor: WM.cardBg, borderRadius: 16,
              borderWidth: 1, borderColor: WM.border, padding: 14,
            }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: WM.title, marginBottom: 4 }}>
                🔔  They keep an eye out for you
              </Text>
              <Text style={{ fontSize: 13, color: WM.sub, lineHeight: 20 }}>
                Solace checks in with you regularly. If you go quiet, your trusted contact gets a gentle heads-up — so someone who cares always knows you're okay.
              </Text>
            </View>
          </Animated.View>

          {/* ── Node 2: Vault released ── */}
          <Animated.View style={[{
            flexDirection: 'row', alignItems: 'flex-start', gap: 14, marginBottom: 18,
          }, animStyle(anim1)]}>
            <NodeDone />
            <View style={{
              flex: 1, backgroundColor: WM.cardBg, borderRadius: 16,
              borderWidth: 1, borderColor: WM.border, padding: 14,
            }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: WM.title, marginBottom: 4 }}>
                💌  Your scheduled moments deliver themselves
              </Text>
              <Text style={{ fontSize: 13, color: WM.sub, lineHeight: 20 }}>
                Birthday messages, anniversary notes, time capsules — these go out automatically to the people you chose, on the exact dates you set. Your trusted contact doesn't touch these.
              </Text>
            </View>
          </Animated.View>

          {/* ── Node 3: conditional ── */}
          <Animated.View style={[{
            flexDirection: 'row', alignItems: 'flex-start', gap: 14,
          }, animStyle(anim2)]}>

            {members.length === 0 ? <NodePending /> : <NodeDone />}

            {members.length === 0 ? (
              /* ── No members: faded "add first" card ── */
              <View style={{
                flex: 1,
                backgroundColor: WM.cardBg,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: WM.border,
                padding: 14,
              }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: WM.title, marginBottom: 4 }}>
                  🔐  Your vault needs a trusted hand
                </Text>
                <Text style={{ fontSize: 13, color: WM.sub, lineHeight: 20 }}>
                  Your vault holds the deeper things — important documents, passwords, and records. After setup, add family members and designate up to 3 trusted contacts from the Family tab. They become your trusted guardians.
                </Text>
              </View>

            ) : (
              /* ── Has members: priority picker ── */
              <View style={{ flex: 1 }}>
                <View style={{
                  backgroundColor: WM.cardBg, borderRadius: 16,
                  borderWidth: 1, borderColor: WM.border, padding: 14, marginBottom: 10,
                }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: WM.title, marginBottom: 4 }}>
                    🔐  Choose your trusted guardians
                  </Text>
                  <Text style={{ fontSize: 13, color: WM.sub, lineHeight: 20 }}>
                    Select up to 3 people below — in the order you'd want them to be contacted.
                  </Text>
                </View>

                {members.map(m => {
                  const idx       = selected.indexOf(m.id)
                  const isSelected = idx >= 0
                  const hasPhone  = !!m.phone

                  return (
                    <TouchableOpacity
                      key={m.id}
                      onPress={() => hasPhone && toggleMember(m.id)}
                      activeOpacity={0.8}
                      disabled={!hasPhone}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 12,
                        backgroundColor: isSelected ? PRIORITY_COLOR[idx] + '12' : WM.cardBg,
                        borderRadius: 14, padding: 14, marginBottom: 8,
                        borderWidth: 1.5,
                        borderColor: isSelected ? PRIORITY_COLOR[idx] + 'BB' : WM.border,
                        opacity: hasPhone ? 1 : 0.4,
                      }}
                    >
                      <View style={{
                        width: 36, height: 36, borderRadius: 18,
                        backgroundColor: isSelected ? PRIORITY_COLOR[idx] + '22' : WM.cardBgAlt,
                        alignItems: 'center', justifyContent: 'center',
                        borderWidth: isSelected ? 1.5 : 1,
                        borderColor: isSelected ? PRIORITY_COLOR[idx] : WM.border,
                      }}>
                        <Text style={{
                          fontSize: isSelected ? 12 : 18, fontWeight: '700',
                          color: isSelected ? PRIORITY_COLOR[idx] : WM.sub,
                        }}>
                          {isSelected ? PRIORITY_LABEL[idx] : '○'}
                        </Text>
                      </View>

                      <View style={{ flex: 1 }}>
                        <Text style={{ color: WM.title, fontSize: 15, fontWeight: '600', marginBottom: 2 }}>
                          {m.name}
                        </Text>
                        <Text style={{ color: WM.sub, fontSize: 12 }}>
                          {m.relationship}
                          {hasPhone ? `  ·  📞 ${m.phone}` : '  ·  No phone number'}
                        </Text>
                      </View>

                      {isSelected && (
                        <Text style={{ fontSize: 20, color: PRIORITY_COLOR[idx] }}>✓</Text>
                      )}
                    </TouchableOpacity>
                  )
                })}

                {members.some(m => !m.phone) && (
                  <Text style={{
                    color: WM.sub, fontSize: 12, marginTop: 4,
                    lineHeight: 18, opacity: 0.75, textAlign: 'center',
                  }}>
                    Contacts without a phone number can't be trusted contacts.{'\n'}
                    Add a number in the Family tab after setup.
                  </Text>
                )}
              </View>
            )}

          </Animated.View>
        </View>

      </ScrollView>

      <OnboardingNavBar
        step={2}
        onBack={() => navigation.goBack()}
        onContinue={selected.length > 0 ? handleSave : goNext}
        continueLabel={selected.length > 0
          ? `Set ${selected.length} Trusted Contact${selected.length > 1 ? 's' : ''}`
          : 'Continue'}
        saving={saving}
        onSkip={selected.length > 0 ? goNext : undefined}
        skipLabel="Skip for now — set up later in Family tab"
      />
      </View>
    </LinearGradient>
  )
}
