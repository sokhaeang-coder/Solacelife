import 'react-native-url-polyfill/auto'
import { createClient } from '@supabase/supabase-js'
import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'

const SUPABASE_URL = 'https://yfthwahxahjabfbuntys.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlmdGh3YWh4YWhqYWJmYnVudHlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2MTE4MzAsImV4cCI6MjA5NDE4NzgzMH0.VfnjNTjE7RRux6s4-3icNLQoyhTl_mGYrW3Zlz9e_kE'

// SecureStore has a 2048-byte limit per value. Supabase session tokens easily exceed this,
// causing silent write failures and broken auth on subsequent requests.
// This adapter chunks large values across multiple SecureStore keys.
const CHUNK_SIZE = 1900
async function secureGet(key: string): Promise<string | null> {
  const meta = await SecureStore.getItemAsync(`${key}__n`)
  if (meta) {
    const n = parseInt(meta, 10)
    const parts = await Promise.all(
      Array.from({ length: n }, (_, i) => SecureStore.getItemAsync(`${key}__${i}`))
    )
    return parts.some(p => p === null) ? null : parts.join('')
  }
  return SecureStore.getItemAsync(key) // legacy single-key fallback
}
async function secureSet(key: string, value: string): Promise<void> {
  const chunks: string[] = []
  for (let i = 0; i < value.length; i += CHUNK_SIZE) chunks.push(value.slice(i, i + CHUNK_SIZE))
  await SecureStore.setItemAsync(`${key}__n`, String(chunks.length))
  await Promise.all(chunks.map((c, i) => SecureStore.setItemAsync(`${key}__${i}`, c)))
}
async function secureRemove(key: string): Promise<void> {
  const meta = await SecureStore.getItemAsync(`${key}__n`)
  if (meta) {
    const n = parseInt(meta, 10)
    await Promise.all([
      SecureStore.deleteItemAsync(`${key}__n`),
      ...Array.from({ length: n }, (_, i) => SecureStore.deleteItemAsync(`${key}__${i}`)),
    ])
  }
  await SecureStore.deleteItemAsync(key).catch(() => {}) // legacy cleanup
}

const NativeStorage = {
  getItem:    (key: string) => secureGet(key),
  setItem:    (key: string, value: string) => secureSet(key, value),
  removeItem: (key: string) => secureRemove(key),
}

const WebStorage = {
  getItem: (key: string) => Promise.resolve(localStorage.getItem(key)),
  setItem: (key: string, value: string) => Promise.resolve(localStorage.setItem(key, value)),
  removeItem: (key: string) => Promise.resolve(localStorage.removeItem(key)),
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: Platform.OS === 'web' ? WebStorage : NativeStorage as any,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})