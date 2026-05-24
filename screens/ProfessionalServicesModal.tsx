import { useState, useEffect } from 'react'
import {
  Modal, View, Text, TouchableOpacity, ScrollView,
  TextInput, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { supabase } from '../lib/supabase'
import { WARM, WM, PLUM } from '../lib/constants'

// ── Service catalogue ────────────────────────────────────────────────────────
const SERVICES = [
  { key: 'estate_lawyer',    label: 'Estate Lawyer',      icon: '⚖️',  desc: 'Wills, trusts, power of attorney' },
  { key: 'real_estate',      label: 'Real Estate',        icon: '🏠',  desc: 'Listing, buying, property transfers' },
  { key: 'financial',        label: 'Financial Advisor',  icon: '💰',  desc: 'Investments, retirement, estate planning' },
  { key: 'tax_cpa',          label: 'Tax & CPA',          icon: '📊',  desc: 'Estate taxes, capital gains, filings' },
  { key: 'grief_counsellor', label: 'Grief Counsellor',   icon: '💙',  desc: 'Support through loss and transition' },
  { key: 'senior_living',    label: 'Senior Living',      icon: '🏡',  desc: 'Care homes and placement options' },
  { key: 'funeral',          label: 'Funeral Services',   icon: '🕊️',  desc: 'Pre-planning and arrangements' },
  { key: 'probate',          label: 'Probate Services',   icon: '📋',  desc: 'Estate administration and probate' },
]

// ── Category-specific message placeholders (A Team recommendation) ───────────
const MESSAGE_PLACEHOLDERS: Record<string, string> = {
  estate_lawyer:    "Briefly describe the type of estate matter — e.g., 'updating a will' or 'help with probate.' Share the full details directly with the lawyer in your first consultation.",
  real_estate:      "Briefly describe your situation — e.g., 'selling a property from an estate' or 'property transfer to family.'",
  financial:        "Briefly describe your planning goal — e.g., 'retirement planning' or 'estate transfer.' Please do not include specific account, asset, or investment details here.",
  tax_cpa:          "Briefly describe your need — e.g., 'estate tax filing' or 'capital gains guidance.'",
  grief_counsellor: "Briefly describe what you're looking for — e.g., 'grief support after a loss' or 'family counselling.'",
  senior_living:    "Briefly describe your situation — e.g., 'exploring care options for a parent' or 'assisted living placement.'",
  funeral:          "Briefly describe what you're looking for — e.g., 'pre-planning arrangements' or 'immediate assistance.'",
  probate:          "Briefly describe the estate matter — e.g., 'estate administration assistance' or 'probate filing help.'",
}

type Step = 'select' | 'inquiry' | 'sent'

interface Props {
  visible: boolean
  onClose: () => void
}

export default function ProfessionalServicesModal({ visible, onClose }: Props) {
  const [step,          setStep]          = useState<Step>('select')
  const [selected,      setSelected]      = useState<typeof SERVICES[0] | null>(null)
  const [name,          setName]          = useState('')
  const [email,         setEmail]         = useState('')
  const [phone,         setPhone]         = useState('')
  const [message,       setMessage]       = useState('')
  const [consented,     setConsented]     = useState(false)
  const [saving,        setSaving]        = useState(false)
  const [error,         setError]         = useState('')

  // Pre-fill contact info from user profile
  useEffect(() => {
    if (visible) loadProfile()
  }, [visible])

  async function loadProfile() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase
      .from('profiles')
      .select('full_name, phone')
      .eq('id', user.id)
      .single()
    setEmail(user.email || '')
    if (data?.full_name) setName(data.full_name)
    if (data?.phone)     setPhone(data.phone)
  }

  function handleSelectService(svc: typeof SERVICES[0]) {
    setSelected(svc)
    setMessage('')
    setError('')
    setConsented(false)
    setStep('inquiry')
  }

  async function handleSubmit() {
    if (!message.trim()) { setError('Please describe what you need help with.'); return }
    if (!email.trim())   { setError('Please provide your email so we can connect you.'); return }
    if (!consented)      { setError('Please check the consent box below before submitting.'); return }
    setSaving(true)
    setError('')

    const { data: { user } } = await supabase.auth.getUser()

    const { error: dbErr } = await supabase.from('service_inquiries').insert({
      user_id:      user?.id ?? null,
      service_type: selected!.key,
      service_label: selected!.label,
      message:      message.trim(),
      contact_name:  name.trim() || null,
      contact_email: email.trim(),
      contact_phone: phone.trim() || null,
      status:        'pending',
    })

    setSaving(false)
    if (dbErr) {
      setError('Something went wrong. Please try again.')
    } else {
      setStep('sent')
    }
  }

  function handleClose() {
    setStep('select')
    setSelected(null)
    setMessage('')
    setError('')
    setConsented(false)
    onClose()
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? undefined : 'height'} style={{ width: '100%' }}>
          <LinearGradient colors={WARM} style={{
            borderTopLeftRadius: 24, borderTopRightRadius: 24,
            padding: 24, maxHeight: '92%',
          }}>

            {/* ── Header ── */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {step === 'inquiry' && (
                  <TouchableOpacity onPress={() => setStep('select')} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                    <Text style={{ color: WM.sub, fontSize: 18 }}>‹</Text>
                  </TouchableOpacity>
                )}
                <Text style={{ color: WM.title, fontSize: 20, fontWeight: '700' }}>
                  {step === 'select'  && '🤝 Trusted Partners'}
                  {step === 'inquiry' && selected?.label}
                  {step === 'sent'    && '✅ You\'re Connected'}
                </Text>
              </View>
              <TouchableOpacity onPress={handleClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Text style={{ color: WM.sub, fontSize: 20, fontWeight: '600' }}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={{ color: WM.sub, fontSize: 14, marginBottom: 20, lineHeight: 20 }}>
              {step === 'select'  && 'Connect with a trusted professional in your area — vetted partners who understand the journey you\'re on.'}
              {step === 'inquiry' && `${selected?.icon}  ${selected?.desc}`}
              {step === 'sent'    && 'A Solace Life partner will be in touch within 24 hours.'}
            </Text>

            {/* ── SERVICE SELECTION GRID ── */}
            {step === 'select' && (
              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 480 }}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                  {SERVICES.map(svc => (
                    <TouchableOpacity
                      key={svc.key}
                      onPress={() => handleSelectService(svc)}
                      activeOpacity={0.82}
                      style={{ width: '47%' }}>
                      <View style={{
                        backgroundColor: WM.cardBg,
                        borderColor: WM.border, borderWidth: 1,
                        borderRadius: 16, padding: 16,
                        minHeight: 100, justifyContent: 'space-between',
                      }}>
                        <Text style={{ fontSize: 28, marginBottom: 8 }}>{svc.icon}</Text>
                        <Text style={{ color: WM.title, fontSize: 15, fontWeight: '700', marginBottom: 4 }}>
                          {svc.label}
                        </Text>
                        <Text style={{ color: WM.sub, fontSize: 12, lineHeight: 17 }}>
                          {svc.desc}
                        </Text>
                        <View style={{ alignSelf: 'flex-end', marginTop: 10 }}>
                          <Text style={{ color: WM.accent, fontSize: 18 }}>›</Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            )}

            {/* ── INQUIRY FORM ── */}
            {step === 'inquiry' && (
              <ScrollView showsVerticalScrollIndicator={true} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>

                {/* Message box */}
                <Text style={{ color: WM.title, fontSize: 14, fontWeight: '700', marginBottom: 8 }}>
                  What do you need help with? *
                </Text>
                <TextInput
                  style={{
                    backgroundColor: WM.inputBg,
                    borderColor: WM.border, borderWidth: 1,
                    borderRadius: 14, padding: 14,
                    color: WM.title, fontSize: 14, lineHeight: 22,
                    height: 110, textAlignVertical: 'top', marginBottom: 16,
                  }}
                  placeholder={selected ? (MESSAGE_PLACEHOLDERS[selected.key] ?? `Briefly describe what you need help with — ${selected.label.toLowerCase()}.`) : ''}
                  placeholderTextColor={WM.sub}
                  value={message}
                  onChangeText={setMessage}
                  multiline
                  numberOfLines={5}
                />

                {/* Contact info card */}
                <View style={{
                  backgroundColor: WM.cardBg, borderColor: WM.border, borderWidth: 1,
                  borderRadius: 14, padding: 16, marginBottom: 16,
                }}>
                  <Text style={{ color: WM.title, fontSize: 14, fontWeight: '700', marginBottom: 12 }}>
                    📋 Your contact information
                  </Text>
                  <Text style={{ color: WM.sub, fontSize: 12, marginBottom: 14, lineHeight: 18 }}>
                    This will be shared with the partner so they can reach you directly.
                  </Text>

                  <Text style={{ color: WM.sub, fontSize: 13, fontWeight: '600', marginBottom: 6 }}>Name</Text>
                  <TextInput
                    style={{
                      backgroundColor: WM.inputBg, borderColor: WM.border, borderWidth: 1,
                      borderRadius: 10, padding: 12, color: WM.title, fontSize: 14, marginBottom: 12,
                    }}
                    placeholder="Your full name"
                    placeholderTextColor={WM.sub}
                    value={name}
                    onChangeText={setName}
                  />

                  <Text style={{ color: WM.sub, fontSize: 13, fontWeight: '600', marginBottom: 6 }}>Email *</Text>
                  <TextInput
                    style={{
                      backgroundColor: WM.inputBg, borderColor: WM.border, borderWidth: 1,
                      borderRadius: 10, padding: 12, color: WM.title, fontSize: 14, marginBottom: 12,
                    }}
                    placeholder="your@email.com"
                    placeholderTextColor={WM.sub}
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />

                  <Text style={{ color: WM.sub, fontSize: 13, fontWeight: '600', marginBottom: 6 }}>
                    Phone (optional)
                  </Text>
                  <TextInput
                    style={{
                      backgroundColor: WM.inputBg, borderColor: WM.border, borderWidth: 1,
                      borderRadius: 10, padding: 12, color: WM.title, fontSize: 14,
                    }}
                    placeholder="Best number to reach you"
                    placeholderTextColor={WM.sub}
                    value={phone}
                    onChangeText={setPhone}
                    keyboardType="phone-pad"
                  />
                </View>

                {error ? (
                  <Text style={{ color: '#C0392B', fontSize: 13, marginBottom: 12 }}>{error}</Text>
                ) : null}

                {/* ── 3. Connect button ── */}
                <TouchableOpacity
                  onPress={handleSubmit}
                  disabled={saving}
                  activeOpacity={0.85}
                  style={{ marginBottom: 12 }}>
                  <LinearGradient colors={PLUM} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 14, padding: 16, alignItems: 'center' }}>
                    {saving
                      ? <ActivityIndicator color="#fff" />
                      : <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>
                          Connect with a {selected?.label} Partner
                        </Text>
                    }
                  </LinearGradient>
                </TouchableOpacity>

                {/* ── 4. Standalone consent checkbox ── */}
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => { setConsented(v => !v); setError('') }}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 12,
                    backgroundColor: WM.cardBg, borderColor: consented ? WM.accent : WM.border,
                    borderWidth: consented ? 1.5 : 1,
                    borderRadius: 14, padding: 14, marginBottom: 12,
                  }}>
                  <View style={{
                    width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                    borderWidth: 2, borderColor: consented ? WM.accent : WM.sub,
                    backgroundColor: consented ? WM.accent : 'transparent',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    {consented && <Text style={{ color: '#fff', fontSize: 12, fontWeight: '900', lineHeight: 15 }}>✓</Text>}
                  </View>
                  <Text style={{ color: WM.title, fontSize: 13, fontWeight: '600', flex: 1, lineHeight: 19 }}>
                    I have read and I consent to the privacy terms below
                  </Text>
                </TouchableOpacity>

                {/* ── 5. Disclaimer ── */}
                <View style={{
                  backgroundColor: WM.cardBg, borderColor: WM.border, borderWidth: 1,
                  borderRadius: 14, padding: 14, marginBottom: 8, gap: 10,
                }}>
                  {/* Confidentiality badges */}
                  <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                    {[
                      { icon: '🔒', label: 'Confidential' },
                      { icon: '⚖️', label: 'Not legal advice' },
                      { icon: '🚫', label: 'No spam' },
                    ].map(b => (
                      <View key={b.label} style={{
                        flexDirection: 'row', alignItems: 'center', gap: 4,
                        backgroundColor: WM.cardBgAlt, borderRadius: 20,
                        paddingHorizontal: 10, paddingVertical: 4,
                      }}>
                        <Text style={{ fontSize: 11 }}>{b.icon}</Text>
                        <Text style={{ color: WM.sub, fontSize: 11, fontWeight: '600' }}>{b.label}</Text>
                      </View>
                    ))}
                  </View>

                  {/* Disclosure text */}
                  <Text style={{ color: WM.sub, fontSize: 11, lineHeight: 17 }}>
                    By tapping the button above, you consent to Solace Life sharing your name, email, and phone (if provided) with one vetted {selected?.label.toLowerCase()} partner solely to arrange an introductory consultation. Your message is not retained by Solace Life after delivery. To withdraw consent contact{' '}
                    <Text style={{ color: WM.accent }}>privacy@solacelife.ca</Text>
                    {'  ·  '}
                    <Text style={{ color: WM.accent }}>Privacy Policy</Text>
                  </Text>
                </View>

              </ScrollView>
            )}

            {/* ── SENT CONFIRMATION ── */}
            {step === 'sent' && (
              <View style={{ alignItems: 'center', paddingVertical: 16 }}>
                <Text style={{ fontSize: 56, marginBottom: 16 }}>🤝</Text>
                <Text style={{ color: WM.title, fontSize: 17, fontWeight: '700', textAlign: 'center', marginBottom: 10 }}>
                  You're connected
                </Text>
                <Text style={{ color: WM.sub, fontSize: 14, textAlign: 'center', lineHeight: 22, marginBottom: 8 }}>
                  A trusted {selected?.label.toLowerCase()} partner from the Solace Life network will reach out at{' '}
                  <Text style={{ fontWeight: '700', color: WM.title }}>{email}</Text>
                  {phone ? ` or ${phone}` : ''} within 24 hours.{'\n\n'}
                  Solace Life makes the introduction — your professional relationship is entirely your own.
                </Text>
                <Text style={{ color: WM.sub, fontSize: 13, textAlign: 'center', lineHeight: 20, marginBottom: 24 }}>
                  You can also email us directly at{'\n'}
                  <Text style={{ color: WM.accent, fontWeight: '600' }}>partners@solacelife.ca</Text>
                </Text>
                <TouchableOpacity onPress={handleClose} activeOpacity={0.85} style={{ width: '100%' }}>
                  <LinearGradient colors={PLUM} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 14, padding: 16, alignItems: 'center' }}>
                    <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Done</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            )}

          </LinearGradient>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  )
}
