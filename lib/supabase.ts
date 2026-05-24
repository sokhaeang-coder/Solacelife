import 'react-native-url-polyfill/auto'
import { createClient } from '@supabase/supabase-js'
import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'

const SUPABASE_URL = 'https://yfthwahxahjabfbuntys.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlmdGh3YWh4YWhqYWJmYnVudHlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2MTE4MzAsImV4cCI6MjA5NDE4NzgzMH0.VfnjNTjE7RRux6s4-3icNLQoyhTl_mGYrW3Zlz9e_kE'

const NativeStorage = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
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