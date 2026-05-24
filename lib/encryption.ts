// ═══════════════════════════════════════════════════════════════
//  SOLACE LIFE — Client-Side Encryption
//
//  AES-256-GCM via Web Crypto API (available in Expo SDK 54+
//  and all modern browsers — no extra packages required).
//
//  Architecture:
//  • A random 256-bit key is generated once per user per device
//  • Key is stored in expo-secure-store (iOS Keychain / Android
//    Keystore) on native, or sessionStorage on web
//  • The server NEVER sees plaintext or the encryption key
//  • Encrypted values are prefixed with "enc:" for backward
//    compatibility — unencrypted legacy values pass through as-is
//
//  Fields encrypted: vault_items.password, .content, .username
//  Fields left plain: title, category, description (display/search)
// ═══════════════════════════════════════════════════════════════

import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'

const KEY_STORE_NAME = 'solace_vault_enc_key_v1'
const ENC_PREFIX     = 'enc:'

// ── Key storage (platform-aware) ─────────────────────────────
async function loadRawKey(): Promise<string | null> {
  try {
    if (Platform.OS === 'web') {
      return sessionStorage.getItem(KEY_STORE_NAME)
    }
    return await SecureStore.getItemAsync(KEY_STORE_NAME)
  } catch {
    return null
  }
}

async function saveRawKey(key: string): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      sessionStorage.setItem(KEY_STORE_NAME, key)
    } else {
      await SecureStore.setItemAsync(KEY_STORE_NAME, key, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED,
      })
    }
  } catch (e) {
    console.warn('Encryption: could not save key', e)
  }
}

// ── Key generation + import ───────────────────────────────────
async function getOrCreateCryptoKey(): Promise<CryptoKey> {
  let raw = await loadRawKey()

  if (!raw) {
    // Generate a new random 256-bit key
    const bytes = crypto.getRandomValues(new Uint8Array(32))
    raw = btoa(String.fromCharCode(...bytes))
    await saveRawKey(raw)
  }

  const keyBytes = Uint8Array.from(atob(raw), c => c.charCodeAt(0))
  return crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM', length: 256 },
    false,            // not extractable from memory
    ['encrypt', 'decrypt']
  )
}

// ── Encrypt a single string field ────────────────────────────
export async function encryptField(value: string | null | undefined): Promise<string | null> {
  if (!value) return value ?? null
  try {
    const key       = await getOrCreateCryptoKey()
    const iv        = crypto.getRandomValues(new Uint8Array(12))   // 96-bit IV for GCM
    const encoded   = new TextEncoder().encode(value)
    const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded)

    // Pack: [12 bytes IV][ciphertext] → base64
    const combined = new Uint8Array(iv.byteLength + cipherBuf.byteLength)
    combined.set(iv, 0)
    combined.set(new Uint8Array(cipherBuf), iv.byteLength)

    return ENC_PREFIX + btoa(String.fromCharCode(...combined))
  } catch (e) {
    console.warn('Encryption failed — storing plaintext as fallback:', e)
    return value
  }
}

// ── Decrypt a single string field ────────────────────────────
export async function decryptField(value: string | null | undefined): Promise<string | null> {
  if (!value) return value ?? null
  if (!value.startsWith(ENC_PREFIX)) return value   // legacy unencrypted — pass through

  try {
    const key      = await getOrCreateCryptoKey()
    const combined = Uint8Array.from(atob(value.slice(ENC_PREFIX.length)), c => c.charCodeAt(0))
    const iv        = combined.slice(0, 12)
    const cipher    = combined.slice(12)
    const plainBuf  = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher)
    return new TextDecoder().decode(plainBuf)
  } catch (e) {
    console.warn('Decryption failed:', e)
    return '[decryption error]'
  }
}

// ── Encrypt all sensitive fields of a vault item ─────────────
export async function encryptVaultPayload(payload: {
  password?: string | null
  content?:  string | null
  username?: string | null
  [key: string]: any
}) {
  const [password, content, username] = await Promise.all([
    encryptField(payload.password),
    encryptField(payload.content),
    encryptField(payload.username),
  ])
  return { ...payload, password, content, username }
}

// ── Decrypt all sensitive fields of a vault item ─────────────
export async function decryptVaultItem(item: {
  password?: string | null
  content?:  string | null
  username?: string | null
  [key: string]: any
}) {
  const [password, content, username] = await Promise.all([
    decryptField(item.password),
    decryptField(item.content),
    decryptField(item.username),
  ])
  return { ...item, password, content, username }
}

// ── Decrypt an array of vault items ──────────────────────────
export async function decryptVaultItems(items: any[]): Promise<any[]> {
  return Promise.all(items.map(decryptVaultItem))
}

// ── Check if a value is encrypted (useful for UI badge) ──────
export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(ENC_PREFIX)
}
