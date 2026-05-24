import { createContext } from 'react'

export interface AuthContextValue {
  setSession:           (s: any) => void
  userTrack:            string
  setUserTrack:         (t: string) => void
  accountType:          'sender' | 'recipient' | 'both'
  setAccountType:       (t: 'sender' | 'recipient' | 'both') => void
  onboardingType:       'sender' | 'invited' | 'converted'
  setOnboardingType:    (t: 'sender' | 'invited' | 'converted') => void
  onboardingDone:       boolean
  setOnboardingDone:    (v: boolean) => void
  subscriptionTier:     string
  setSubscriptionTier:  (t: string) => void
  subscriptionStatus:   string
  setSubscriptionStatus:(s: string) => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)
