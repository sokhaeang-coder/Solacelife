// ─────────────────────────────────────────────────────────────────────────────
//  Solace Life — RecipientFamilyScreen
//
//  The Family tab for account_type = 'recipient' (G2 users).
//  Shows every G1 sender who has added this person to their family list,
//  along with the relationship they assigned, how many memories they've sent,
//  and when the last one arrived.
//
//  Data flow:
//    1. family_members WHERE recipient_profile_id = user.id   → the G1 rows
//    2. profiles WHERE id IN [g1 user_ids]                    → G1 display names
//    3. scheduled_deliveries WHERE family_member_id IN [rows] → delivery stats
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, SafeAreaView,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { supabase } from '../lib/supabase'
import { C, SKY, WARM, WM } from '../lib/constants'

// ── Types ─────────────────────────────────────────────────────────────────────
interface SenderCard {
  familyMemberId:    string   // family_members.id
  senderUserId:      string   // family_members.user_id (the G1)
  senderName:        string   // profiles.full_name
  relationshipLabel: string | null
  memoriesDelivered: number
  lastDeliveredAt:   string | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  })
}

function avatarInitials(name: string): string {
  return name
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

const AVATAR_COLORS = [C.accent, C.amberLight, C.success, '#9B7FD4', '#D47F7F', '#7FA8D4']
function avatarColor(name: string): string {
  let hash = 0
  for (const ch of name) hash = ch.charCodeAt(0) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

// ── Screen ────────────────────────────────────────────────────────────────────
export default function RecipientFamilyScreen({ navigation }: any) {
  const [senders,    setSenders]    = useState<SenderCard[]>([])
  const [loading,    setLoading]    = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // ── Data loader ─────────────────────────────────────────────────────────────
  async function loadSenders() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Step 1 — find every family_members row where I am the linked recipient
      const { data: myRows, error: rowErr } = await supabase
        .from('family_members')
        .select('id, user_id, relationship_label')
        .eq('recipient_profile_id', user.id)

      if (rowErr) { console.warn('RecipientFamily row error:', rowErr.message); return }
      if (!myRows || myRows.length === 0) { setSenders([]); return }

      const senderIds      = myRows.map(r => r.user_id)
      const familyMemberIds = myRows.map(r => r.id)

      // Step 2 — fetch sender names from profiles
      const { data: profileRows } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', senderIds)

      const profileMap: Record<string, string> = {}
      for (const p of profileRows ?? []) {
        profileMap[p.id] = p.full_name ?? 'Someone who loves you'
      }

      // Step 3 — fetch delivery stats for each family_member row
      const { data: deliveryRows } = await supabase
        .from('scheduled_deliveries')
        .select('family_member_id, delivered_at')
        .in('family_member_id', familyMemberIds)
        .eq('status', 'delivered')
        .order('delivered_at', { ascending: false })

      // Build per-row stats: count + most-recent delivered_at
      const statsMap: Record<string, { count: number; lastAt: string | null }> = {}
      for (const d of deliveryRows ?? []) {
        const fid = d.family_member_id
        if (!statsMap[fid]) statsMap[fid] = { count: 0, lastAt: null }
        statsMap[fid].count += 1
        if (!statsMap[fid].lastAt) statsMap[fid].lastAt = d.delivered_at // first = most recent
      }

      // Assemble final cards
      const cards: SenderCard[] = myRows.map(row => ({
        familyMemberId:    row.id,
        senderUserId:      row.user_id,
        senderName:        profileMap[row.user_id] ?? 'Someone who loves you',
        relationshipLabel: row.relationship_label ?? null,
        memoriesDelivered: statsMap[row.id]?.count ?? 0,
        lastDeliveredAt:   statsMap[row.id]?.lastAt ?? null,
      }))

      setSenders(cards)
    } catch (e) {
      console.warn('RecipientFamily load error:', e)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => { loadSenders() }, [])

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    loadSenders()
  }, [])

  // ── Sender card ─────────────────────────────────────────────────────────────
  function SenderCardView({ item }: { item: SenderCard }) {
    const color    = avatarColor(item.senderName)
    const initials = avatarInitials(item.senderName)
    const hasMemories = item.memoriesDelivered > 0

    return (
      <View style={styles.card}>
        {/* Avatar */}
        <View style={[styles.avatar, { backgroundColor: color + '33', borderColor: color + '66' }]}>
          <Text style={[styles.avatarText, { color }]}>{initials}</Text>
        </View>

        {/* Details */}
        <View style={styles.cardBody}>
          <Text style={styles.senderName}>{item.senderName}</Text>

          {item.relationshipLabel ? (
            <View style={styles.relBadge}>
              <Text style={styles.relText}>{item.relationshipLabel}</Text>
            </View>
          ) : null}

          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statNumber}>{item.memoriesDelivered}</Text>
              <Text style={styles.statLabel}>
                {item.memoriesDelivered === 1 ? 'moment\nsent' : 'moments\nsent'}
              </Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={styles.statNumber} numberOfLines={2}>
                {hasMemories ? formatDate(item.lastDeliveredAt) : '—'}
              </Text>
              <Text style={styles.statLabel}>last{'\n'}arrived</Text>
            </View>
          </View>

          {hasMemories ? (
            <Text style={styles.tapHint}>
              Open My Vault to replay their moments →
            </Text>
          ) : (
            <Text style={styles.tapHintPending}>
              Their first moment is on its way 💌
            </Text>
          )}
        </View>
      </View>
    )
  }

  // ── Empty state ─────────────────────────────────────────────────────────────
  function EmptyState() {
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.emptyIcon}>🕊️</Text>
        <Text style={styles.emptyTitle}>No connections yet</Text>
        <Text style={styles.emptySub}>
          When someone adds you to their Solace Life family and links
          your account, they'll appear here. Ask your loved one to add
          your email address to their family list.
        </Text>
      </View>
    )
  }

  // ── Header ──────────────────────────────────────────────────────────────────
  function Header() {
    return (
      <View style={styles.headerWrap}>
        <Text style={styles.headerDove}>👨‍👩‍👧</Text>
        <Text style={styles.headerTitle}>
          {senders.length === 0 ? 'Your Family' : 'People Who Love You'}
        </Text>
        <Text style={styles.headerSub}>
          {senders.length === 0
            ? 'This is where your family connections will appear'
            : `${senders.length} ${senders.length === 1 ? 'person is' : 'people are'} preserving moments for you`}
        </Text>

        {/* Upgrade banner — soft CTA to become a sender */}
        <TouchableOpacity
          style={styles.upgradeBanner}
          activeOpacity={0.85}
          onPress={() => navigation.navigate('OnboardingConverted')}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.upgradeTitle}>Want to send moments too?</Text>
            <Text style={styles.upgradeSub}>
              Start preserving your own stories for the people you love — free to begin.
            </Text>
          </View>
          <Text style={styles.upgradeArrow}>→</Text>
        </TouchableOpacity>
      </View>
    )
  }

  // ── Loading ──────────────────────────────────────────────────────────────────
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
          data={senders}
          keyExtractor={i => i.familyMemberId}
          renderItem={({ item }) => <SenderCardView item={item} />}
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

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  flex:        { flex: 1 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list:        { paddingHorizontal: 20, paddingBottom: 40 },

  // Header
  headerWrap: {
    paddingTop:    32,
    paddingBottom: 24,
    alignItems:    'center',
  },
  headerDove:  { fontSize: 44, marginBottom: 10 },
  headerTitle: { fontSize: 26, fontWeight: '700', color: C.offWhite, marginBottom: 6 },
  headerSub:   { fontSize: 14, color: C.grey, textAlign: 'center', lineHeight: 20, paddingHorizontal: 10 },

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

  // Sender card
  card: {
    flexDirection:   'row',
    alignItems:      'flex-start',
    backgroundColor: C.bg2,
    borderRadius:    20,
    borderWidth:     1,
    borderColor:     C.mauveDim,
    padding:         20,
    marginBottom:    14,
    gap:             16,
  },

  // Avatar
  avatar: {
    width:        56,
    height:       56,
    borderRadius: 28,
    borderWidth:  1.5,
    alignItems:   'center',
    justifyContent: 'center',
    flexShrink:   0,
    marginTop:    2,
  },
  avatarText: {
    fontSize:   20,
    fontWeight: '700',
  },

  // Card body
  cardBody: { flex: 1, gap: 8 },
  senderName: {
    fontSize:   18,
    fontWeight: '700',
    color:      C.offWhite,
    lineHeight: 24,
  },

  // Relationship badge
  relBadge: {
    alignSelf:       'flex-start',
    backgroundColor: 'rgba(212,120,154,0.18)',
    borderRadius:    20,
    borderWidth:     1,
    borderColor:     'rgba(212,120,154,0.35)',
    paddingHorizontal: 12,
    paddingVertical:   4,
  },
  relText: {
    fontSize:   12,
    fontWeight: '600',
    color:      C.mauve,
    letterSpacing: 0.3,
  },

  // Stats row
  statsRow: {
    flexDirection:   'row',
    alignItems:      'stretch',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius:    12,
    borderWidth:     1,
    borderColor:     C.mauveDim,
    marginTop:       4,
    overflow:        'hidden',
  },
  stat: {
    flex:       1,
    padding:    12,
    alignItems: 'center',
    gap:        4,
  },
  statDivider: {
    width:           1,
    backgroundColor: C.mauveDim,
    marginVertical:  8,
  },
  statNumber: {
    fontSize:   13,
    fontWeight: '700',
    color:      C.offWhite,
    textAlign:  'center',
    lineHeight: 18,
  },
  statLabel: {
    fontSize:   10,
    fontWeight: '600',
    color:      C.greyDim,
    textAlign:  'center',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    lineHeight: 13,
  },

  tapHint: {
    fontSize:  12,
    color:     C.amber,
    fontStyle: 'italic',
    marginTop: 2,
  },
  tapHintPending: {
    fontSize:  12,
    color:     C.grey,
    fontStyle: 'italic',
    marginTop: 2,
  },

  // Empty state
  emptyWrap: { alignItems: 'center', paddingTop: 40, paddingHorizontal: 20 },
  emptyIcon:  { fontSize: 52, marginBottom: 18 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: C.offWhite, marginBottom: 10, textAlign: 'center' },
  emptySub:   { fontSize: 15, color: C.grey, textAlign: 'center', lineHeight: 22 },
})
