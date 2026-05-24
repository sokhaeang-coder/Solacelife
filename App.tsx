import { useState, useEffect } from 'react'
import { ActivityIndicator, Text, View, AppState, Platform } from 'react-native'
import { NavigationContainer } from '@react-navigation/native'
import { createStackNavigator } from '@react-navigation/stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { LinearGradient } from 'expo-linear-gradient'
import * as Device from 'expo-device'
import * as Notifications from 'expo-notifications'
import { supabase } from './lib/supabase'
import { C, SKY } from './lib/constants'
import { s } from './lib/styles'
import { AuthContext } from './lib/AuthContext'
import { NavScaleProvider, useNavScale } from './lib/NavScaleContext'
import {
  refreshEmergencyNotification,
  handleEmergencyNotificationResponse,
} from './lib/emergencyNotification'

// ── Push notification handler (must be set before any Notifications call) ──
//  Controls how notifications behave when the app is in the foreground.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
})

// ── Screen imports ─────────────────────────────────────────────
import HomeScreen     from './screens/HomeScreen'
import VaultScreen    from './screens/VaultScreen'
import MemoriesScreen from './screens/MemoriesScreen'
import FamilyScreen   from './screens/FamilyScreen'
import SettingsScreen from './screens/SettingsScreen'
import AvatarScreen   from './screens/AvatarScreen'

import OnboardingProfileScreen         from './screens/onboarding/OnboardingProfileScreen'
import OnboardingOccasionsScreen       from './screens/onboarding/OnboardingOccasionsScreen'
import OnboardingEmergencyScreen       from './screens/onboarding/OnboardingEmergencyScreen'
import OnboardingTourScreen            from './screens/onboarding/OnboardingTourScreen'
import OnboardingEstateScreen          from './screens/onboarding/OnboardingEstateScreen'
import OnboardingInvitedScreen         from './screens/onboarding/OnboardingInvitedScreen'
import OnboardingConvertedScreen       from './screens/onboarding/OnboardingConvertedScreen'
import RecipientHomeScreen             from './screens/RecipientHomeScreen'
import RecipientFamilyScreen           from './screens/RecipientFamilyScreen'

import WelcomeScreen from './screens/auth/WelcomeScreen'
import SignUpScreen  from './screens/auth/SignUpScreen'
import SignInScreen  from './screens/auth/SignInScreen'

// ── Auto check-in (silent, fires on app open / foreground) ────
async function autoCheckin(userId: string) {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('checkin_frequency, vault_status')
      .eq('id', userId)
      .single()
    if (!profile || profile.vault_status === 'released') return
    const freq = profile.checkin_frequency || 'monthly'
    const days = freq === 'weekly' ? 7 : freq === 'quarterly' ? 90 : 30
    const now = new Date().toISOString()
    const nextDue = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
    await supabase.from('profiles').update({
      last_checkin_at: now,
      next_checkin_due: nextDue,
      missed_checkins: 0,
      vault_status: 'active',
    }).eq('id', userId)
    await supabase.from('check_ins').insert({ user_id: userId, source: 'app_session' })
  } catch (e) {
    console.warn('Auto check-in failed:', e)
  }
}

// ── Register push token with Expo and persist it to Supabase ──
//  Only runs on physical devices — simulators cannot receive
//  push notifications and Expo will throw if you ask them to.
async function registerPushToken(userId: string) {
  try {
    // Simulators cannot receive push notifications
    if (!Device.isDevice) {
      console.log('Push registration skipped: running on simulator')
      return
    }

    // Request notification permission from the OS
    const { status: existingStatus } = await Notifications.getPermissionsAsync()
    let finalStatus = existingStatus
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync()
      finalStatus = status
    }
    if (finalStatus !== 'granted') {
      console.log('Push notification permission denied')
      return
    }

    // Retrieve the Expo push token for this device
    const token = await Notifications.getExpoPushTokenAsync({
      projectId: '2fc26943-45b2-4a45-89b7-325db2d88248',
    })

    // Persist the token so Edge Functions can send targeted nudges
    const { error } = await supabase
      .from('profiles')
      .update({ push_token: token.data })
      .eq('id', userId)
    if (error) console.warn('Failed to save push token:', error.message)
    else console.log('Push token saved:', token.data)

    // Android requires explicit notification channels
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Solace Life',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#F5CEAA',
      })
      // Dedicated high-visibility channel for the emergency contact lock-screen tile
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
  } catch (e) {
    console.warn('Push token registration failed:', e)
  }
}

// ── Navigation instances ───────────────────────────────────────
const Stack = createStackNavigator()
const Tab   = createBottomTabNavigator()

function TabIcon({ icon, focused }: any) {
  const { fontSize, wrapWidth, wrapHeight } = useNavScale()
  return (
    <View style={[s.tabIconWrap, { width: wrapWidth, height: wrapHeight }]}>
      <View style={[s.tabIconPill, focused && s.tabIconPillActive]}>
        <Text style={[s.tabIconEmoji, { fontSize, lineHeight: fontSize + 2 }]}>{icon}</Text>
      </View>
    </View>
  )
}

function MainTabs() {
  const { tabBarHeight } = useNavScale()
  return (
    <Tab.Navigator screenOptions={{ headerShown: false, tabBarStyle: [s.tabBar, { height: tabBarHeight }], tabBarLabelStyle: s.tabLabel,
      tabBarActiveTintColor: C.accent, tabBarInactiveTintColor: C.greyDim }}>
      <Tab.Screen name="Home"     component={HomeScreen}     options={{ tabBarIcon: ({ focused }) => <TabIcon icon="🏠"  focused={focused} />, tabBarLabel: 'Home' }} />
      <Tab.Screen name="Memories" component={MemoriesScreen} options={{ tabBarIcon: ({ focused }) => <TabIcon icon="💌"  focused={focused} />, tabBarLabel: 'Moments' }} />
      <Tab.Screen name="Vault"    component={VaultScreen}    options={{ tabBarIcon: ({ focused }) => <TabIcon icon="🔐"  focused={focused} />, tabBarLabel: 'Vault' }} />
      <Tab.Screen name="Family"   component={FamilyScreen}   options={{ tabBarIcon: ({ focused }) => <TabIcon icon="👨‍👩‍👧" focused={focused} />, tabBarLabel: 'Family' }} />
      <Tab.Screen name="Settings" component={SettingsScreen} options={{ tabBarIcon: ({ focused }) => <TabIcon icon="⚙️"  focused={focused} />, tabBarLabel: 'Profile' }} />
    </Tab.Navigator>
  )
}

// Recipient tab layout — vault-first, no memory creation tabs
function RecipientTabs() {
  const { tabBarHeight } = useNavScale()
  return (
    <Tab.Navigator screenOptions={{ headerShown: false, tabBarStyle: [s.tabBar, { height: tabBarHeight }], tabBarLabelStyle: s.tabLabel,
      tabBarActiveTintColor: C.accent, tabBarInactiveTintColor: C.greyDim }}>
      <Tab.Screen name="Vault"    component={RecipientHomeScreen}   options={{ tabBarIcon: ({ focused }) => <TabIcon icon="💌"  focused={focused} />, tabBarLabel: 'My Vault' }} />
      <Tab.Screen name="Family"   component={RecipientFamilyScreen} options={{ tabBarIcon: ({ focused }) => <TabIcon icon="👨‍👩‍👧" focused={focused} />, tabBarLabel: 'Family' }} />
      <Tab.Screen name="Settings" component={SettingsScreen}        options={{ tabBarIcon: ({ focused }) => <TabIcon icon="⚙️"  focused={focused} />, tabBarLabel: 'Profile' }} />
    </Tab.Navigator>
  )
}

// ── Root App ───────────────────────────────────────────────────
export default function App() {
  const [session, setSession]             = useState<any>(null)
  const [loading, setLoading]             = useState(true)
  const [onboardingDone, setOnboardingDone] = useState(false)
  const [userTrack, setUserTrack]           = useState('remembrance')
  const [accountType, setAccountType]       = useState<'sender' | 'recipient' | 'both'>('sender')
  const [onboardingType, setOnboardingType] = useState<'sender' | 'invited' | 'converted'>('sender')
  const [subscriptionTier, setSubscriptionTier]     = useState('free')
  const [subscriptionStatus, setSubscriptionStatus] = useState('inactive')

  // ── Boot: single auth source of truth ────────────────────
  // onAuthStateChange fires INITIAL_SESSION immediately on both
  // web and native — safer than a separate getSession() call
  // which can hang on web if the stored token needs refreshing.
  useEffect(() => {
    let initialised = false

    async function applySession(sess: any) {
      setSession(sess)
      if (sess) {
        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('onboarding_completed, track, account_type, onboarding_type, subscription_tier, subscription_status')
            .eq('id', sess.user.id)
            .single()

          if (profile) {
            // ── Invited family member detection ──────────────────
            // If the profile hasn't completed onboarding yet and has no
            // onboarding_type set, check whether this user's email matches
            // an existing family_members row. If it does, they were invited —
            // mark them as a recipient and link the rows so the rest of the
            // app can find their memories.
            //
            // This check is cheap (indexed on email) and idempotent — if
            // onboarding_type is already set we skip it entirely.
            let resolvedAccountType   = profile.account_type    || 'sender'
            let resolvedOnboardingType = profile.onboarding_type || 'sender'

            // ── Link any unlinked family_members rows for this email ──────────
            // Runs for ALL users on every sign-in — idempotent because we filter
            // recipient_profile_id IS NULL (already-linked rows are ignored).
            // This ensures existing senders who were later added as a G2 by someone
            // else get their row linked even though they already completed onboarding.
            const email = sess.user.email
            if (email) {
              const { data: memberRows } = await supabase
                .from('family_members')
                .select('id, user_id')
                .eq('email', email)
                .is('recipient_profile_id', null)   // only unlinked rows
                .limit(10)                           // could be added by multiple senders

              if (memberRows && memberRows.length > 0) {
                const ids = memberRows.map((r: any) => r.id)

                // Link all unlinked rows to this user's auth account
                await supabase.from('family_members').update({
                  recipient_profile_id: sess.user.id,
                  linked_at:            new Date().toISOString(),
                }).in('id', ids)

                console.log('Linked family member rows for', email, '— count:', ids.length)

                // Only change account_type for fresh (not-yet-onboarded) accounts
                if (!profile.onboarding_completed && !profile.onboarding_type) {
                  resolvedAccountType    = 'recipient'
                  resolvedOnboardingType = 'invited'

                  await supabase.from('profiles').update({
                    account_type:    'recipient',
                    onboarding_type: 'invited',
                  }).eq('id', sess.user.id)

                  console.log('Invited family member detected and linked:', email)
                }
              }
            }

            setOnboardingDone(profile.onboarding_completed || false)
            setUserTrack(profile.track || 'remembrance')
            setAccountType(resolvedAccountType as any)
            setOnboardingType(resolvedOnboardingType as any)
            setSubscriptionTier(profile.subscription_tier || 'free')
            setSubscriptionStatus(profile.subscription_status || 'inactive')
          }
        } catch (e) {
          console.warn('Profile load error:', e)
        }
      } else {
        setOnboardingDone(false)
        setUserTrack('remembrance')
        setAccountType('sender')
        setOnboardingType('sender')
        setSubscriptionTier('free')
        setSubscriptionStatus('inactive')
      }
      // Only dismiss the splash on the first event (INITIAL_SESSION)
      if (!initialised) {
        initialised = true
        setLoading(false)
      }
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, sess) => { applySession(sess) }
    )

    // Safety net: if INITIAL_SESSION never fires (edge case), stop loading after 5s
    const timeout = setTimeout(() => {
      if (!initialised) { initialised = true; setLoading(false) }
    }, 5000)

    return () => { subscription.unsubscribe(); clearTimeout(timeout) }
  }, [])

  // ── Auto check-in + push token + emergency notification on session change ──
  useEffect(() => {
    if (session?.user?.id) {
      autoCheckin(session.user.id)
      registerPushToken(session.user.id)
      refreshEmergencyNotification(session.user.id)
    } else {
      // Logged out — clear the lock screen notification
      refreshEmergencyNotification(null)
    }
  }, [session?.user?.id])

  // ── Auto check-in + re-post emergency notification on app foreground ────────
  // iOS can dismiss notifications; re-posting on foreground keeps it visible.
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active' && session?.user?.id) {
        autoCheckin(session.user.id)
        // Re-post silently — replaces the existing one if still there
        refreshEmergencyNotification(session.user.id)
      }
    })
    return () => sub.remove()
  }, [session?.user?.id])

  // ── Handle emergency contact call action from notification ─
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(response => {
      const { data } = response.notification.request.content
      if ((data as any)?.type === 'emergency_contact') {
        handleEmergencyNotificationResponse(response)
      }
    })
    return () => sub.remove()
  }, [])

  if (loading) {
    return (
      <LinearGradient colors={SKY} style={[s.flex, { alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ fontSize: 36, color: C.amberLight, marginBottom: 16 }}>♡</Text>
        <ActivityIndicator color={C.amber} size="large" />
      </LinearGradient>
    )
  }

  return (
    <NavScaleProvider>
    <AuthContext.Provider value={{ setSession, userTrack, setUserTrack, accountType, setAccountType, onboardingType, setOnboardingType, onboardingDone, setOnboardingDone, subscriptionTier, setSubscriptionTier, subscriptionStatus, setSubscriptionStatus }}>
      <NavigationContainer>
        {session ? (
          onboardingDone ? (
            // ── Post-onboarding routing ──────────────────────────
            // 'recipient' → vault-only layout (no creation tabs)
            // 'both'      → full app (they send AND receive)
            // 'sender'    → full app (default)
            accountType === 'recipient' ? (
              // Recipient stack — includes conversion screen so the banner
              // in RecipientHomeScreen can navigate to it
              <Stack.Navigator screenOptions={{ headerShown: false }}>
                <Stack.Screen name="Main"                component={RecipientTabs} />
                <Stack.Screen name="OnboardingConverted" component={OnboardingConvertedScreen} />
              </Stack.Navigator>
            ) : (
              <Stack.Navigator screenOptions={{ headerShown: false }}>
                <Stack.Screen name="Main"   component={MainTabs} />
                <Stack.Screen name="Avatar" component={AvatarScreen} />
              </Stack.Navigator>
            )
          ) : (
            // ── Onboarding routing ───────────────────────────────
            // Invited family members go directly to the invited welcome
            // screen — they skip role selection, track, occasions, etc.
            // Everyone else starts at the Role screen as before.
            onboardingType === 'invited' ? (
              <Stack.Navigator screenOptions={{ headerShown: false }}>
                <Stack.Screen name="OnboardingInvited" component={OnboardingInvitedScreen} />
              </Stack.Navigator>
            ) : (
              // Organic sign-ups are senders — skip role selection entirely.
              // Invited recipients are detected in applySession and routed to
              // OnboardingInvitedScreen above before reaching this branch.
              <Stack.Navigator screenOptions={{ headerShown: false }}>
                <Stack.Screen name="OnboardingProfile"   component={OnboardingProfileScreen} />
                <Stack.Screen name="OnboardingOccasions" component={OnboardingOccasionsScreen} />
                <Stack.Screen name="OnboardingEmergency" component={OnboardingEmergencyScreen} />
                <Stack.Screen name="OnboardingTour"      component={OnboardingTourScreen} />
                <Stack.Screen name="OnboardingEstate"    component={OnboardingEstateScreen} />
              </Stack.Navigator>
            )
          )
        ) : (
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Welcome" component={WelcomeScreen} />
            <Stack.Screen name="SignUp"  component={SignUpScreen} />
            <Stack.Screen name="SignIn"  component={SignInScreen} />
          </Stack.Navigator>
        )}
      </NavigationContainer>
    </AuthContext.Provider>
    </NavScaleProvider>
  )
}
