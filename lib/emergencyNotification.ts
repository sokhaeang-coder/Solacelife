/**
 * emergencyNotification.ts
 *
 * Manages the persistent lock-screen notification that lets strangers or
 * medical personnel call a user's emergency contacts without unlocking the phone.
 *
 * Android: posts an ongoing (non-dismissable) notification with up to 3
 *          "📞 Call [Name]" action buttons that dial directly.
 * iOS:     posts a high-priority notification showing names + numbers.
 *          Tapping it opens the app which auto-dials the primary contact.
 *          We also guide users to set up Apple Medical ID as a true lock-screen backup.
 *
 * Call refreshEmergencyNotification() whenever:
 *   - The app starts (App.tsx useEffect)
 *   - A family member's emergency status changes (FamilyScreen)
 *   - The user logs out (pass userId = null to clear it)
 */

import * as Notifications from 'expo-notifications'
import { Linking, Platform } from 'react-native'
import { supabase } from './supabase'

// ── Ensure the Android emergency channel exists before posting ───────────────
// Safe to call multiple times — Android is idempotent for existing channels.
async function ensureAndroidEmergencyChannel() {
  if (Platform.OS !== 'android') return
  await Notifications.setNotificationChannelAsync('emergency', {
    name: 'Emergency Contacts',
    description: 'Persistent lock-screen tile showing who to call in an emergency',
    importance: Notifications.AndroidImportance.MAX,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    showBadge: false,
    enableLights: true,
    lightColor: '#E8453C',
  })
}

// Stable identifier so we replace rather than stack notifications.
const NOTIFICATION_ID_KEY = 'solace_emergency_v1'

export interface EmergencyContact {
  id: string
  name: string
  phone: string | null
  relationship: string
  emergency_priority: number
}

// ── Fetch emergency contacts from DB ────────────────────────────────────────
export async function fetchEmergencyContacts(userId: string): Promise<EmergencyContact[]> {
  const { data, error } = await supabase
    .from('family_members')
    .select('id, name, phone, relationship, emergency_priority')
    .eq('user_id', userId)
    .eq('is_emergency_contact', true)
    .order('emergency_priority', { ascending: true })

  if (error || !data) return []
  return data.filter(c => c.phone) // only contacts with a phone number are useful
}

// ── Register notification category with call actions (Android + iOS) ────────
async function registerEmergencyCategory(contacts: EmergencyContact[]) {
  const actions = contacts.slice(0, 3).map((c, i) => ({
    identifier: `call_${i + 1}`,
    buttonTitle: `📞 Call ${c.name}`,
    options: {
      opensAppToForeground: true,
    },
  }))

  await Notifications.setNotificationCategoryAsync('emergency_call', actions)
}

// ── Build the notification body text ────────────────────────────────────────
function buildNotificationBody(contacts: EmergencyContact[]): string {
  if (contacts.length === 0) return 'No emergency contacts set.'
  return contacts
    .map((c, i) => {
      const num = i + 1
      return `${num}. ${c.name}\n    📞 ${c.phone}`
    })
    .join('\n')
}

// ── Post (or refresh) the persistent lock-screen notification ───────────────
export async function refreshEmergencyNotification(userId: string | null) {
  // Always cancel the previous one first so we don't stack
  await cancelEmergencyNotification()

  if (!userId) return // logged out — nothing to show

  // Guard: don't attempt to post if the user hasn't granted notification
  // permission yet. On first install, registerPushToken (in App.tsx) runs
  // concurrently and may not have completed the permission request yet.
  // We check-only here (no prompt) — registerPushToken handles the prompt.
  const { status } = await Notifications.getPermissionsAsync()
  if (status !== 'granted') return

  const contacts = await fetchEmergencyContacts(userId)
  if (contacts.length === 0) return // no contacts designated yet

  // Set up the Android channel first — must exist before the notification is posted
  await ensureAndroidEmergencyChannel()

  await registerEmergencyCategory(contacts)

  const primaryPhone = contacts[0]?.phone ?? null

  const title = contacts.length === 1
    ? `🆘 Emergency Contact — ${contacts[0].name}`
    : `🆘 Emergency Contacts (${contacts.length})`

  await Notifications.scheduleNotificationAsync({
    identifier: NOTIFICATION_ID_KEY,
    content: {
      title,
      subtitle: Platform.OS === 'ios' ? 'Tap to call · Solace Life' : undefined,
      body: buildNotificationBody(contacts),
      data: {
        type: 'emergency_contact',
        primaryPhone,
        contacts: contacts.map(c => ({ name: c.name, phone: c.phone })),
      },
      categoryIdentifier: 'emergency_call',
      ...(Platform.OS === 'android' ? {
        channelId: 'emergency',
        // ongoing = non-dismissable so first responders can't accidentally swipe it away
        sticky: true,
        autoDismiss: false,
      } : {}),
      color: '#E8453C',
      priority: Notifications.AndroidNotificationPriority.MAX,
      sound: false, // silent — this is a status tile, not an alert
    },
    trigger: null, // show immediately
  })
}

// ── Cancel the notification (on logout or if user removes all contacts) ──────
export async function cancelEmergencyNotification() {
  // Cancel any pending (scheduled but not yet shown) notification
  try {
    await Notifications.cancelScheduledNotificationAsync(NOTIFICATION_ID_KEY)
  } catch (_) { /* already gone */ }

  // Dismiss any already-presented notification with our identifier.
  // dismissNotificationAsync requires the OS-assigned notification ID, not our
  // custom identifier — so we search presented notifications by identifier.
  try {
    const presented = await Notifications.getPresentedNotificationsAsync()
    const ours = presented.find(n => n.request.identifier === NOTIFICATION_ID_KEY)
    if (ours) {
      await Notifications.dismissNotificationAsync(ours.request.identifier)
    }
  } catch (_) { /* not critical */ }
}

// ── Handle a notification action tap (user tapped "Call [Name]") ─────────────
// Wire this into Notifications.addNotificationResponseReceivedListener in App.tsx
export function handleEmergencyNotificationResponse(
  response: Notifications.NotificationResponse
) {
  const { actionIdentifier, notification } = response
  const { contacts } = notification.request.content.data as {
    contacts: { name: string; phone: string }[]
    primaryPhone: string | null
  }

  let phoneToCall: string | null = null

  if (actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER) {
    // Tapped the notification body itself — call the primary contact
    phoneToCall = contacts?.[0]?.phone ?? null
  } else if (actionIdentifier.startsWith('call_')) {
    const idx = parseInt(actionIdentifier.replace('call_', ''), 10) - 1
    phoneToCall = contacts?.[idx]?.phone ?? null
  }

  if (phoneToCall) {
    // Strip everything except digits so 1-604-555-0123 dials correctly
    const digits = phoneToCall.replace(/\D/g, '')
    Linking.openURL(`tel:+${digits}`).catch(console.warn)
  }
}

// ── Utility: check if notification permission is granted ────────────────────
export async function hasNotificationPermission(): Promise<boolean> {
  const { status } = await Notifications.getPermissionsAsync()
  if (status === 'granted') return true
  const { status: asked } = await Notifications.requestPermissionsAsync()
  return asked === 'granted'
}
