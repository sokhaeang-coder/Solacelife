import React, { createContext, useContext, useState, useCallback } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'

// ── Unread Moments Context ─────────────────────────────────────────────────
//
//  Tracks whether the current user has received memories they haven't seen.
//  Used to drive the pulsing badge on the Moments tab icon.
//
//  Flow:
//    1. On login (App.tsx / applySession): query scheduled_deliveries where
//       the user is the recipient → checkUnread(ids) → hasUnread = true if any
//       are new (not in AsyncStorage seen list)
//    2. MemoriesScreen: on focus → setHasUnread(false) clears the badge immediately
//       At end of loadReceivedMemories → markRead(ids) persists the seen IDs
//
//  AsyncStorage key: 'solace_moments_seen_ids' — JSON array of delivery IDs
// ─────────────────────────────────────────────────────────────────────────────

interface UnreadMomentsCtx {
  hasUnread: boolean
  setHasUnread: (v: boolean) => void
  checkUnread: (deliveryIds: string[]) => Promise<void>
  markRead: (deliveryIds: string[]) => Promise<void>
}

const UnreadMomentsContext = createContext<UnreadMomentsCtx>({
  hasUnread: false,
  setHasUnread: () => {},
  checkUnread: async () => {},
  markRead: async () => {},
})

export function UnreadMomentsProvider({ children }: { children: React.ReactNode }) {
  const [hasUnread, setHasUnread] = useState(false)

  // Compare incoming delivery IDs against what's already been seen.
  // Sets hasUnread = true if any ID is new.
  const checkUnread = useCallback(async (deliveryIds: string[]) => {
    if (!deliveryIds.length) return
    try {
      const raw = await AsyncStorage.getItem('solace_moments_seen_ids')
      const seen: string[] = raw ? JSON.parse(raw) : []
      const hasNew = deliveryIds.some(id => !seen.includes(id))
      if (hasNew) setHasUnread(true)
    } catch (e) {
      console.warn('UnreadMomentsContext checkUnread error:', e)
    }
  }, [])

  // Clear the badge and persist all current delivery IDs as "seen".
  const markRead = useCallback(async (deliveryIds: string[]) => {
    setHasUnread(false)
    if (!deliveryIds.length) return
    try {
      const raw = await AsyncStorage.getItem('solace_moments_seen_ids')
      const seen: string[] = raw ? JSON.parse(raw) : []
      const merged = Array.from(new Set([...seen, ...deliveryIds]))
      await AsyncStorage.setItem('solace_moments_seen_ids', JSON.stringify(merged))
    } catch (e) {
      console.warn('UnreadMomentsContext markRead error:', e)
    }
  }, [])

  return (
    <UnreadMomentsContext.Provider value={{ hasUnread, setHasUnread, checkUnread, markRead }}>
      {children}
    </UnreadMomentsContext.Provider>
  )
}

export function useUnreadMoments() {
  return useContext(UnreadMomentsContext)
}
