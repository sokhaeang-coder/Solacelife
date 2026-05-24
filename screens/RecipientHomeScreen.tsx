// ─────────────────────────────────────────────────────────────
//  Solace Life — RecipientHomeScreen
//
//  The main experience for account_type = 'recipient'.
//  Shows all delivered memories addressed to this user,
//  grouped by sender.
//
//  Recipients do not see memory creation flows. A soft "upgrade"
//  prompt in Settings lets them become senders when ready.
// ─────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, SafeAreaView,
  Alert, Linking,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { supabase } from '../lib/supabase'
import { C, SKY, WM } from '../lib/constants'
import { s } from '../lib/styles'

// ── Types ────────────────────────────────────────────────────
interface ReceivedMemory {
  id:             string
  scheduled_date: string
  delivered_at:   string | null
  personal_note:  string | null
  web_access_token: string | null
  memory: {
    id:    string
    title: string
    type:  string
  } | null
  sender_name: string
}

// ── Helpers ──────────────────────────────────────────────────
function typeIcon(type: string): string {
  switch (type) {
    case 'voice': return '🎙️'
    case 'video': return '🎬'
    case 'photo': return '📷'
    default:      return '📖'
  }
}

function typeLabel(type: string): string {
  switch (type) {
    case 'voice': return 'Voice Memo'
    case 'video': return 'Video Moment'
    case 'photo': return 'Photo Moment'
    default:      return 'Written Story'
  }
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  })
}

// ── Screen ───────────────────────────────────────────────────
export default function RecipientHomeScreen({ navigation }: any) {
  const [memories,   setMemories]   = useState<ReceivedMemory[]>([])
  const [loading,    setLoading]    = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  async function fetchMemories() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Find this user's email to match against family_members
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .single()

      // Get delivered memories for this recipient via family_members.email = user email
      const { data, error } = await supabase
        .from('scheduled_deliveries')
        .select(`
          id,
          scheduled_date,
          delivered_at,
          message,
          web_access_token,
          memories (
            id,
            title,
            type
          ),
          family_members (
            name,
            email
          ),
          profiles (
            full_name
          )
        `)
        .eq('status', 'delivered')
        .eq('family_members.email', user.email)
        .order('delivered_at', { ascending: false })

      if (error) throw error

      const mapped: ReceivedMemory[] = (data || []).map((d: any) => ({
        id:               d.id,
        scheduled_date:   d.scheduled_date,
        delivered_at:     d.delivered_at,
        personal_note:    d.message,
        web_access_token: d.web_access_token,
        memory:           d.memories ?? null,
        sender_name:      d.profiles?.full_name ?? 'Someone who loves you',
      }))

      setMemories(mapped)
    } catch (e) {
      console.warn('RecipientHome fetch error:', e)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => { fetchMemories() }, [])

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    fetchMemories()
  }, [])

  function openMemory(item: ReceivedMemory) {
    if (item.web_access_token) {
      const url = `https://solacelife.ca/memory.html?token=${item.web_access_token}`
      Linking.openURL(url).catch(() =>
        Alert.alert('Unable to open', 'Could not open the moment viewer in your browser.')
      )
    } else {
      Alert.alert('Coming soon', 'In-app moment playback is coming in a future update.')
    }
  }

  // ── Empty state ───────────────────────────────────────────
  function EmptyState() {
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.emptyIcon}>💌</Text>
        <Text style={styles.emptyTitle}>Your vault is ready</Text>
        <Text style={styles.emptySub}>
          Moments sent to you will appear here automatically
          as they arrive. Check back soon.
        </Text>
      </View>
    )
  }

  // ── Memory card ───────────────────────────────────────────
  function MemoryCard({ item }: { item: ReceivedMemory }) {
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => openMemory(item)}
        activeOpacity={0.8}
      >
        <View style={styles.cardLeft}>
          <Text style={styles.cardIcon}>
            {item.memory ? typeIcon(item.memory.type) : '📖'}
          </Text>
        </View>
        <View style={styles.cardBody}>
          <Text style={styles.cardSender}>From {item.sender_name}</Text>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {item.memory?.title ?? 'A Special Moment'}
          </Text>
          {item.memory && (
            <Text style={styles.cardType}>{typeLabel(item.memory.type)}</Text>
          )}
          {item.personal_note ? (
            <Text style={styles.cardNote} numberOfLines={2}>
              "{item.personal_note}"
            </Text>
          ) : null}
          <Text style={styles.cardDate}>
            Arrived {formatDate(item.delivered_at ?? item.scheduled_date)}
          </Text>
        </View>
        <Text style={styles.cardArrow}>›</Text>
      </TouchableOpacity>
    )
  }

  // ── Header ────────────────────────────────────────────────
  function Header() {
    return (
      <View style={styles.headerWrap}>
        <Text style={styles.headerDove}>🕊️</Text>
        <Text style={styles.headerTitle}>Your Vault</Text>
        <Text style={styles.headerSub}>
          {memories.length === 0
            ? 'Moments sent to you will appear here'
            : `${memories.length} moment${memories.length === 1 ? '' : 's'} waiting for you`
          }
        </Text>

        {/* ── Start Sending banner ─────────────────────── */}
        <TouchableOpacity
          onPress={() => navigation.navigate('OnboardingConverted')}
          activeOpacity={0.85}
          style={styles.upgradeBanner}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.upgradeTitle}>Want to preserve your own moments?</Text>
            <Text style={styles.upgradeSub}>Create stories and messages for your family — free to start.</Text>
          </View>
          <Text style={styles.upgradeArrow}>→</Text>
        </TouchableOpacity>
      </View>
    )
  }

  if (loading) {
    return (
      <LinearGradient colors={SKY} style={styles.loadingWrap}>
        <ActivityIndicator color={C.amber} size="large" />
      </LinearGradient>
    )
  }

  return (
    <LinearGradient colors={SKY} style={styles.flex}>
      <SafeAreaView style={styles.flex}>
        <FlatList
          data={memories}
          keyExtractor={i => i.id}
          renderItem={({ item }) => <MemoryCard item={item} />}
          ListHeaderComponent={<Header />}
          ListEmptyComponent={<EmptyState />}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={true}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={C.amber}
            />
          }
        />
      </SafeAreaView>
    </LinearGradient>
  )
}

const styles = StyleSheet.create({
  flex:        { flex: 1 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list:        { paddingHorizontal: 20, paddingBottom: 40 },

  headerWrap: {
    paddingTop:    32,
    paddingBottom: 28,
    alignItems:    'center',
  },
  headerDove:  { fontSize: 44, marginBottom: 10 },
  headerTitle: { fontSize: 26, fontWeight: '700', color: C.offWhite, marginBottom: 6 },
  headerSub:   { fontSize: 14, color: C.grey, textAlign: 'center', lineHeight: 20 },

  upgradeBanner: {
    flexDirection:   'row',
    alignItems:      'center',
    backgroundColor: 'rgba(240,98,146,0.15)',
    borderRadius:    16,
    borderWidth:     1.5,
    borderColor:     'rgba(240,98,146,0.4)',
    padding:         16,
    marginTop:       20,
    gap:             12,
    width:           '100%',
  },
  upgradeTitle: { fontSize: 14, fontWeight: '700', color: '#F5CEAA', marginBottom: 3 },
  upgradeSub:   { fontSize: 12, color: C.grey, lineHeight: 17 },
  upgradeArrow: { fontSize: 20, color: '#F5CEAA', flexShrink: 0 },

  emptyWrap:  { alignItems: 'center', paddingTop: 40, paddingHorizontal: 20 },
  emptyIcon:  { fontSize: 52, marginBottom: 18 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: C.offWhite, marginBottom: 10, textAlign: 'center' },
  emptySub:   { fontSize: 15, color: C.grey, textAlign: 'center', lineHeight: 22 },

  card: {
    flexDirection:    'row',
    alignItems:       'center',
    backgroundColor:  C.bg2,
    borderRadius:     18,
    borderWidth:      1,
    borderColor:      C.mauveDim,
    padding:          18,
    marginBottom:     12,
    gap:              14,
  },
  cardLeft:   { alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  cardIcon:   { fontSize: 34 },
  cardBody:   { flex: 1, gap: 3 },
  cardSender: { fontSize: 12, color: C.greyDim, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8 },
  cardTitle:  { fontSize: 16, fontWeight: '700', color: C.offWhite, lineHeight: 22 },
  cardType:   { fontSize: 12, color: C.mauve, fontWeight: '600' },
  cardNote:   { fontSize: 13, color: C.grey, fontStyle: 'italic', lineHeight: 18, marginTop: 2 },
  cardDate:   { fontSize: 12, color: C.greyDim, marginTop: 4 },
  cardArrow:  { fontSize: 22, color: C.greyDim, flexShrink: 0 },
})
