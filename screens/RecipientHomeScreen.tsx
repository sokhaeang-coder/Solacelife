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
import { isEncrypted } from '../lib/encryption'

// Vault category display (matches VAULT_CATEGORIES in VaultScreen)
const VAULT_CAT_LABELS: Record<string, { label: string; icon: string }> = {
  media:             { label: 'Precious',  icon: '✨' },
  personal_messages: { label: 'Messages',  icon: '✉️' },
  legal:             { label: 'Legal',     icon: '📜' },
  financial:         { label: 'Financial', icon: '💰' },
  medical:           { label: 'Medical',   icon: '🏥' },
  property:          { label: 'Property',  icon: '🏠' },
  digital_assets:    { label: 'Passwords', icon: '🔑' },
}

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
  const [vaultItems, setVaultItems] = useState<any[]>([])

  // Released legacy-vault items shared with this recipient.
  // RLS does the filtering: only items from released vaults whose
  // category rules include this member come back.
  async function fetchReleasedVault() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('vault_items')
        .select('id, user_id, title, category, description, content, file_path, file_name, file_type')
        .neq('user_id', user.id)
        .order('category')
      setVaultItems(data || [])
    } catch (e) {
      console.warn('Released vault fetch error:', e)
    }
  }

  async function openVaultFile(item: any) {
    if (!item.file_path) return
    const { data } = await supabase.storage.from('vault-files').createSignedUrl(item.file_path, 3600)
    if (data?.signedUrl) {
      Linking.openURL(data.signedUrl).catch(() =>
        Alert.alert('Unable to open', 'Could not open this document.'))
    } else {
      Alert.alert('Unable to open', 'Could not open this document.')
    }
  }

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

  useEffect(() => { fetchMemories(); fetchReleasedVault() }, [])

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    fetchMemories()
    fetchReleasedVault()
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

  // ── Legacy Vault (released vault items shared with this member) ──
  function LegacyVaultSection() {
    if (vaultItems.length === 0) return null

    // Group by category, preserving VAULT_CAT_LABELS order
    const grouped: Record<string, any[]> = {}
    vaultItems.forEach(item => {
      grouped[item.category] = [...(grouped[item.category] || []), item]
    })

    return (
      <View style={styles.vaultWrap}>
        <Text style={styles.vaultHeaderIcon}>🔐</Text>
        <Text style={styles.vaultHeaderTitle}>Shared Documents</Text>
        <Text style={styles.vaultHeaderSub}>
          Copies of documents and information they chose to share with you
        </Text>

        {Object.keys(VAULT_CAT_LABELS).filter(k => grouped[k]).map(catKey => (
          <View key={catKey} style={styles.vaultCatBlock}>
            <View style={styles.vaultCatHeader}>
              <Text style={styles.vaultCatIcon}>{VAULT_CAT_LABELS[catKey].icon}</Text>
              <Text style={styles.vaultCatLabel}>{VAULT_CAT_LABELS[catKey].label}</Text>
            </View>

            {grouped[catKey].map(item => (
              <View key={item.id} style={styles.vaultCard}>
                <Text style={styles.vaultCardTitle}>{item.title}</Text>
                {item.description ? (
                  <Text style={styles.vaultCardDesc}>{item.description}</Text>
                ) : null}
                {item.content ? (
                  isEncrypted(item.content)
                    ? <Text style={styles.vaultCardLocked}>🔒 Some details are locked — they were encrypted on the sender's device</Text>
                    : <Text style={styles.vaultCardDesc}>{item.content}</Text>
                ) : null}
                {item.file_path ? (
                  <TouchableOpacity
                    onPress={() => openVaultFile(item)}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={`Open document ${item.file_name || item.title}`}
                    style={styles.vaultFileBtn}>
                    <Text style={styles.vaultFileBtnIcon}>📑</Text>
                    <Text style={styles.vaultFileBtnText} numberOfLines={1}>
                      Open {item.file_name || 'document'}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ))}
          </View>
        ))}
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
          ListFooterComponent={<LegacyVaultSection />}
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

  // ── Legacy Vault section ──
  vaultWrap: {
    marginTop:    28,
    paddingTop:   24,
    borderTopWidth: 1,
    borderTopColor: C.mauveDim,
    alignItems:   'center',
  },
  vaultHeaderIcon:  { fontSize: 40, marginBottom: 8 },
  vaultHeaderTitle: { fontSize: 24, fontWeight: '700', color: C.offWhite, marginBottom: 4 },
  vaultHeaderSub:   { fontSize: 14, color: C.grey, textAlign: 'center', marginBottom: 18, lineHeight: 20 },
  vaultCatBlock:    { width: '100%', marginBottom: 18 },
  vaultCatHeader:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  vaultCatIcon:     { fontSize: 24 },
  vaultCatLabel:    { fontSize: 18, fontWeight: '700', color: C.offWhite },
  vaultCard: {
    backgroundColor: C.bg2,
    borderRadius:    16,
    borderWidth:     1,
    borderColor:     C.mauveDim,
    padding:         16,
    marginBottom:    10,
    gap:             6,
  },
  vaultCardTitle:  { fontSize: 16, fontWeight: '700', color: C.offWhite, lineHeight: 22 },
  vaultCardDesc:   { fontSize: 14, color: C.grey, lineHeight: 20 },
  vaultCardLocked: { fontSize: 13, color: C.greyDim, fontStyle: 'italic', lineHeight: 18 },
  vaultFileBtn: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             8,
    minHeight:       48,
    marginTop:       4,
    backgroundColor: 'rgba(240,98,146,0.15)',
    borderWidth:     1,
    borderColor:     'rgba(240,98,146,0.4)',
    borderRadius:    12,
    paddingHorizontal: 14,
  },
  vaultFileBtnIcon: { fontSize: 22 },
  vaultFileBtnText: { fontSize: 15, fontWeight: '600', color: '#F5CEAA', flexShrink: 1 },

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
