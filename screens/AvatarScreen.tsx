// ═══════════════════════════════════════════════════════════════
//  SOLACE LIFE — AvatarScreen
//
//  The Living Legacy AI avatar feature.
//
//  Two sections:
//  1. Avatar Personality — owner adds notes while alive so the
//     avatar sounds authentically like them
//  2. Preview / Chat — live OpenAI-powered chat so the owner can
//     test how their avatar responds, and so family can connect
//     after the event
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect, useRef } from 'react'
import {
  Text, View, TouchableOpacity, TextInput, ScrollView,
  ActivityIndicator, KeyboardAvoidingView, Platform, Modal, Animated,
  Dimensions, useWindowDimensions,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { supabase } from '../lib/supabase'
import { C, WARM, WM, PLUM, SUPABASE_URL } from '../lib/constants'
import { s } from '../lib/styles'
import ScreenWrap from '../components/ScreenWrap'

type Message = { role: 'user' | 'assistant'; content: string }

const NOTE_PROMPTS = [
  'e.g. "I always say \'love you to the moon\' to my kids"',
  'e.g. "I believe hard work and kindness are all you need"',
  'e.g. "My favourite moment is camping in Whistler with the family"',
  'e.g. "When things got hard, I always said: this too shall pass"',
]

export default function AvatarScreen({ navigation }: any) {
  const { height: windowHeight } = useWindowDimensions()
  const [profile, setProfile]         = useState<any>(null)
  const [notes, setNotes]             = useState<any[]>([])
  const [messages, setMessages]       = useState<Message[]>([{
    role: 'assistant',
    content: `Hi — I'm your avatar. Ask me anything and I'll respond as you would. Add personality notes above to make me sound more like you.`,
  }])
  const [inputText, setInputText]     = useState('')
  const [sending, setSending]         = useState(false)
  const [showNoteModal, setShowNoteModal] = useState(false)
  const [newNote, setNewNote]         = useState('')
  const [savingNote, setSavingNote]   = useState(false)
  const [loadingData, setLoadingData] = useState(true)
  const scrollRef = useRef<ScrollView>(null)
  const fadeAnim  = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }).start()
    loadData()
  }, [])

  async function loadData() {
    setLoadingData(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const [profileRes, notesRes] = await Promise.all([
        supabase.from('profiles').select('full_name, track').eq('id', user.id).single(),
        supabase.from('avatar_notes').select('*').eq('user_id', user.id)
          .order('created_at', { ascending: false }),
      ])

      if (profileRes.data) setProfile(profileRes.data)
      if (notesRes.data)   setNotes(notesRes.data)

      // Update greeting with the real name once profile loads
      if (profileRes.data?.full_name) {
        const first = profileRes.data.full_name.split(' ')[0]
        setMessages([{
          role: 'assistant',
          content: `Hi — I'm ${first}'s avatar. Ask me anything, and I'll respond the way ${first} would have. The more personality notes you add above, the more like them I'll sound.`,
        }])
      }
    } finally {
      setLoadingData(false)
    }
  }

  async function addNote() {
    if (!newNote.trim()) return
    setSavingNote(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data, error } = await supabase
        .from('avatar_notes')
        .insert({ user_id: user.id, content: newNote.trim() })
        .select().single()
      if (!error && data) {
        setNotes(prev => [data, ...prev])
        setNewNote('')
        setShowNoteModal(false)
      }
    } finally {
      setSavingNote(false)
    }
  }

  async function deleteNote(id: string) {
    await supabase.from('avatar_notes').delete().eq('id', id)
    setNotes(prev => prev.filter(n => n.id !== id))
  }

  async function sendMessage() {
    if (!inputText.trim() || sending) return
    const userMsg: Message = { role: 'user', content: inputText.trim() }
    const history = [...messages, userMsg]
    setMessages(history)
    setInputText('')
    setSending(true)
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: Platform.OS !== 'web' }), 80)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${SUPABASE_URL}/functions/v1/chat-with-avatar`, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          messages: history.map(m => ({ role: m.role, content: m.content })),
        }),
      })
      const data = await res.json()
      const reply = data.reply || "I'm here with you."
      setMessages(prev => [...prev, { role: 'assistant', content: reply }])
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: Platform.OS !== 'web' }), 80)
    } catch (e) {
      console.warn('Avatar chat error:', e)
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: "I couldn't connect just now. Try again in a moment.",
      }])
    } finally {
      setSending(false)
    }
  }

  const firstName = profile?.full_name?.split(' ')[0] || '...'
  const initials  = profile?.full_name
    ?.split(' ').map((w: string) => w[0]).slice(0, 2).join('')
    ?? '?'

  const randomPrompt = NOTE_PROMPTS[notes.length % NOTE_PROMPTS.length]

  return (
    <ScreenWrap>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        enabled={Platform.OS === 'ios'}
        style={{ flex: 1 }}>

        {/* On web, set an explicit pixel height so the flex layout properly
            constrains the ScrollView and pins the input bar at the bottom
            without needing position:fixed (which causes overlap) */}
        <Animated.View style={{
          opacity: fadeAnim,
          flex: 1,
          overflow: 'hidden',
          ...(Platform.OS === 'web' ? { height: windowHeight } : {}),
        }}>

          {/* ── Header ── */}
          <View style={{
            flexDirection: 'row', alignItems: 'center',
            paddingHorizontal: 20, paddingTop: 60, paddingBottom: 12,
          }}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginRight: 14 }}>
              <Text style={{ color: C.accent, fontSize: 16 }}>← Back</Text>
            </TouchableOpacity>
            <Text style={{ color: C.offWhite, fontSize: 20, fontWeight: '700', flex: 1 }}>
              ✨ My Avatar
            </Text>
            <View style={{ backgroundColor: C.accent + '33', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1, borderColor: C.accent + '55' }}>
              <Text style={{ color: C.accent, fontSize: 11, fontWeight: '800', letterSpacing: 0.5 }}>EARLY ACCESS</Text>
            </View>
          </View>

          {/* ── Coming Soon banner ── */}
          <View style={{
            marginHorizontal: 20, marginBottom: 8, borderRadius: 14,
            backgroundColor: C.accent + '18', borderWidth: 1, borderColor: C.accent + '44',
            padding: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 10,
          }}>
            <Text style={{ fontSize: 20 }}>🚀</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.offWhite, fontSize: 14, fontWeight: '700', marginBottom: 3 }}>
                Enhanced Avatar Coming Soon
              </Text>
              <Text style={{ color: C.grey, fontSize: 12, lineHeight: 18 }}>
                We're adding voice cloning and richer personality training so your avatar sounds truly like you. For now, add personality notes and try the preview below.
              </Text>
            </View>
          </View>

          <ScrollView
            ref={scrollRef}
            contentContainerStyle={{ paddingBottom: 20 }}
            showsVerticalScrollIndicator={true}
            keyboardShouldPersistTaps="handled"
            style={{ flex: 1 }}>

            {/* ── Avatar identity card ── */}
            <View style={{ alignItems: 'center', paddingVertical: 24, paddingHorizontal: 20 }}>
              <LinearGradient
                colors={[C.mauve, C.accent + 'AA']}
                style={{
                  width: 88, height: 88, borderRadius: 44,
                  alignItems: 'center', justifyContent: 'center', marginBottom: 14,
                }}>
                <Text style={{ color: C.white, fontSize: 30, fontWeight: '800' }}>{initials}</Text>
              </LinearGradient>
              <Text style={{ color: C.offWhite, fontSize: 22, fontWeight: '700', marginBottom: 8 }}>
                {profile?.full_name || '...'}
              </Text>
              <View style={{
                paddingHorizontal: 16, paddingVertical: 5, borderRadius: 20,
                backgroundColor: C.accent + '20', borderWidth: 1, borderColor: C.accent + '55',
              }}>
                <Text style={{ color: C.accent, fontSize: 12, fontWeight: '600' }}>
                  ✨ Living Legacy
                </Text>
              </View>
              <Text style={{
                color: C.grey, fontSize: 13, textAlign: 'center',
                marginTop: 12, lineHeight: 20, maxWidth: 280,
              }}>
                Your avatar is trained on what you add below.{'\n'}
                The more you share, the more like you it sounds.
              </Text>
            </View>

            {/* ── Personality Notes ── */}
            <View style={{ marginHorizontal: 20, marginBottom: 28 }}>
              <View style={{
                flexDirection: 'row', alignItems: 'center',
                justifyContent: 'space-between', marginBottom: 12,
              }}>
                <View>
                  <Text style={{ color: C.offWhite, fontSize: 16, fontWeight: '700' }}>
                    Avatar Personality
                  </Text>
                  <Text style={{ color: C.grey, fontSize: 12, marginTop: 2 }}>
                    Help your avatar sound like you
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setShowNoteModal(true)}
                  style={{
                    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
                    backgroundColor: C.accent + '22', borderWidth: 1, borderColor: C.accent + '55',
                  }}>
                  <Text style={{ color: C.accent, fontSize: 13, fontWeight: '600' }}>+ Add note</Text>
                </TouchableOpacity>
              </View>

              {loadingData ? (
                <ActivityIndicator color={C.accent} style={{ marginTop: 8 }} />
              ) : notes.length === 0 ? (
                <View style={{
                  padding: 20, borderRadius: 16, borderWidth: 1,
                  borderStyle: 'dashed', borderColor: C.greyDim + '88',
                  alignItems: 'center',
                }}>
                  <Text style={{ fontSize: 28, marginBottom: 10 }}>✍️</Text>
                  <Text style={{ color: C.greyDim, fontSize: 13, textAlign: 'center', lineHeight: 22 }}>
                    No notes yet.{'\n'}Add favourite sayings, values, moments — anything{'\n'}you'd want your family to hear from you.
                  </Text>
                </View>
              ) : (
                notes.map(note => (
                  <View key={note.id} style={{
                    flexDirection: 'row', alignItems: 'flex-start',
                    backgroundColor: C.mauveDim + '66', borderRadius: 14,
                    padding: 14, marginBottom: 8,
                    borderWidth: 1, borderColor: C.accent + '25',
                  }}>
                    <Text style={{ color: C.accent, fontSize: 14, marginRight: 10, marginTop: 1 }}>✨</Text>
                    <Text style={{ color: C.offWhite, fontSize: 13, flex: 1, lineHeight: 21 }}>
                      {note.content}
                    </Text>
                    <TouchableOpacity
                      onPress={() => deleteNote(note.id)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                      <Text style={{ color: C.greyDim, fontSize: 16, marginLeft: 8 }}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </View>

            {/* ── Divider ── */}
            <View style={{
              height: 1, backgroundColor: C.greyDim + '33',
              marginHorizontal: 20, marginBottom: 24,
            }} />

            {/* ── Chat Preview ── */}
            <View style={{ marginHorizontal: 20 }}>
              <Text style={{ color: C.offWhite, fontSize: 16, fontWeight: '700', marginBottom: 4 }}>
                Preview Your Avatar
              </Text>
              <Text style={{ color: C.grey, fontSize: 12, marginBottom: 20 }}>
                This is what your family will experience — powered by AI
              </Text>

              {messages.map((msg, i) => (
                <View key={i} style={{
                  alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '82%',
                  marginBottom: 14,
                }}>
                  {msg.role === 'assistant' ? (
                    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
                      {/* Avatar icon */}
                      <LinearGradient
                        colors={[C.mauve + 'CC', C.accent + '77']}
                        style={{
                          width: 30, height: 30, borderRadius: 15,
                          alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        }}>
                        <Text style={{ color: C.white, fontSize: 11, fontWeight: '700' }}>
                          {initials}
                        </Text>
                      </LinearGradient>
                      {/* Bubble */}
                      <View style={{
                        backgroundColor: C.mauveDim,
                        borderRadius: 20, borderBottomLeftRadius: 4,
                        padding: 14, flexShrink: 1,
                        borderWidth: 1, borderColor: C.accent + '33',
                      }}>
                        <Text style={{ color: C.offWhite, fontSize: 14, lineHeight: 22 }}>
                          {msg.content}
                        </Text>
                      </View>
                    </View>
                  ) : (
                    <View style={{
                      backgroundColor: C.amber + '33',
                      borderRadius: 20, borderBottomRightRadius: 4,
                      padding: 14,
                      borderWidth: 1, borderColor: C.amber + '44',
                    }}>
                      <Text style={{ color: C.offWhite, fontSize: 14, lineHeight: 22 }}>
                        {msg.content}
                      </Text>
                    </View>
                  )}
                </View>
              ))}

              {/* Typing indicator */}
              {sending && (
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 14 }}>
                  <LinearGradient
                    colors={[C.mauve + 'CC', C.accent + '77']}
                    style={{
                      width: 30, height: 30, borderRadius: 15,
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                    <Text style={{ color: C.white, fontSize: 11, fontWeight: '700' }}>{initials}</Text>
                  </LinearGradient>
                  <View style={{
                    backgroundColor: C.mauveDim, borderRadius: 20, borderBottomLeftRadius: 4,
                    paddingHorizontal: 18, paddingVertical: 14,
                    borderWidth: 1, borderColor: C.accent + '33',
                  }}>
                    <ActivityIndicator size="small" color={C.accent} />
                  </View>
                </View>
              )}
            </View>

          </ScrollView>

          {/* ── Chat input bar ── */}
          <View style={{
            flexDirection: 'row', alignItems: 'flex-end', gap: 10,
            paddingHorizontal: 16, paddingTop: 12,
            paddingBottom: Platform.OS === 'ios' ? 30 : 16,
            borderTopWidth: 1, borderTopColor: C.greyDim + '33',
            backgroundColor: C.bg2 + 'EE',
          }}>
            <TextInput
              style={{
                flex: 1, backgroundColor: C.mauveDim + '99',
                color: C.offWhite, borderRadius: 24,
                paddingHorizontal: 18, paddingVertical: 11,
                fontSize: 14, lineHeight: 20,
                borderWidth: 1, borderColor: C.greyDim + '55',
                maxHeight: 110,
              }}
              placeholder={`Message ${firstName}'s avatar...`}
              placeholderTextColor={C.greyDim}
              value={inputText}
              onChangeText={setInputText}
              multiline
              returnKeyType="send"
              blurOnSubmit={false}
              onSubmitEditing={sendMessage}
            />
            <TouchableOpacity
              onPress={sendMessage}
              disabled={!inputText.trim() || sending}
              activeOpacity={0.8}
              style={{
                width: 46, height: 46, borderRadius: 23,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: inputText.trim() && !sending ? C.accent : C.greyDim + '55',
              }}>
              <Text style={{ fontSize: 20, color: C.white }}>↑</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>

      {/* ── Add Note Modal ── */}
      <Modal
        visible={showNoteModal}
        transparent
        animationType="slide"
        onRequestClose={() => { setShowNoteModal(false); setNewNote('') }}>
        <View style={s.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? undefined : 'height'}
            style={{ width: '100%' }}>
            <View style={s.modalSheet}>
              <LinearGradient colors={['#F06292', '#F48A5A', '#FFD07A']} style={s.modalInner}>
                <View style={s.modalHandle} />
                <View style={s.modalHeader}>
                  <Text style={[s.modalTitle, { color: '#3D1020' }]}>Add Avatar Note</Text>
                  <TouchableOpacity onPress={() => { setShowNoteModal(false); setNewNote('') }}>
                    <View style={s.modalCloseBtn}><Text style={s.modalCloseX}>✕</Text></View>
                  </TouchableOpacity>
                </View>

                <Text style={{ color: '#7A3448', fontSize: 13, marginBottom: 16, lineHeight: 21 }}>
                  Write something personal — a favourite phrase, a value, a moment, something
                  you'd want your family to hear in your voice.
                </Text>

                <TextInput
                  style={[s.input, { height: 130, textAlignVertical: 'top', backgroundColor: 'rgba(255,255,255,0.85)', color: '#3D1020', borderColor: 'rgba(255,255,255,0.5)' }]}
                  placeholder={randomPrompt}
                  placeholderTextColor='#7A3448'
                  value={newNote}
                  onChangeText={setNewNote}
                  multiline
                  numberOfLines={5}
                  autoFocus
                />

                <TouchableOpacity
                  onPress={addNote}
                  disabled={!newNote.trim() || savingNote}
                  activeOpacity={0.85}
                  style={{ marginTop: 16 }}>
                  <LinearGradient colors={PLUM} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.btnPrimary, { opacity: newNote.trim() ? 1 : 0.35 }]}>
                    {savingNote
                      ? <ActivityIndicator color='#fff' />
                      : <Text style={[s.btnPrimaryText, { color: '#fff' }]}>Save Note</Text>}
                  </LinearGradient>
                </TouchableOpacity>

              </LinearGradient>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </ScreenWrap>
  )
}
