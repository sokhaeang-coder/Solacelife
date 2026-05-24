# Solace Life — Codebase Rules for Claude

## ⚠️ Color Scheme — Read This First

**All modals, overlays, action sheets, and onboarding screens use the WARM gradient.**
The old dark burgundy/dark violet scheme is RETIRED. Never use it for new screens.

### Correct imports
```ts
import { C, SKY, WARM, WM } from '../lib/constants'
// or from '../../lib/constants' for screens in subdirectories
```

### Where each gradient is used
| Gradient | Used for |
|---|---|
| `SKY` | Main app tab screens background only (HomeScreen, MemoriesScreen, FamilyScreen, VaultScreen, SettingsScreen outer wrap) |
| `WARM` | Every modal, overlay, bottom sheet, onboarding screen, confirmation dialog |

### WARM modal template
```tsx
<Modal visible={...} animationType="slide" transparent>
  <View style={{ flex: 1, justifyContent: 'flex-end' }}>
    <LinearGradient colors={WARM} style={{ borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 }}>

      {/* Header */}
      <Text style={{ color: WM.title, fontSize: 20, fontWeight: '700' }}>Title</Text>
      <Text style={{ color: WM.sub, fontSize: 14 }}>Subtitle</Text>

      {/* Cards / tiles */}
      <View style={{ backgroundColor: WM.cardBg, borderColor: WM.border, borderWidth: 1, borderRadius: 14 }}>
        <Text style={{ color: WM.title }}>Card content</Text>
      </View>

      {/* Text input */}
      <TextInput
        style={{ backgroundColor: WM.inputBg, color: WM.title, borderColor: WM.border }}
        placeholderTextColor={WM.sub}
      />

      {/* Primary button */}
      <TouchableOpacity>
        <View style={{ backgroundColor: WM.accent, borderRadius: 14, padding: 16 }}>
          <Text style={{ color: WM.title, fontWeight: '700' }}>Save</Text>
        </View>
      </TouchableOpacity>

      {/* Cancel / secondary button */}
      <TouchableOpacity>
        <View style={{ backgroundColor: WM.cardBg, borderColor: WM.border, borderWidth: 1, borderRadius: 14 }}>
          <Text style={{ color: WM.title }}>Cancel</Text>
        </View>
      </TouchableOpacity>

    </LinearGradient>
  </View>
</Modal>
```

### WM token reference
| Token | Value | Use |
|---|---|---|
| `WM.title` | `#3D1020` | Headings, labels, primary text |
| `WM.sub` | `#7A3448` | Body text, subtitles, placeholders |
| `WM.cardBg` | `rgba(255,255,255,0.78)` | Card / tile backgrounds |
| `WM.cardBgAlt` | `rgba(255,255,255,0.35)` | Light pill / badge backgrounds |
| `WM.border` | `rgba(255,255,255,0.5)` | Card borders |
| `WM.inputBg` | `rgba(255,255,255,0.85)` | Text input backgrounds |
| `WM.accent` | `#F06292` | Primary button bg, selected borders |
| `WM.accentBg` | `rgba(240,98,146,0.12)` | Selected tile tint |
| `WM.btnText` | `#FFD07A` | Text on accent-colored buttons (optional) |
| `WM.footerBg` | `rgba(255,255,255,0.92)` | Sticky footer behind action buttons |

---

## Navigation Structure

- **Auth flow**: Welcome → SignUp / SignIn
- **Onboarding (organic sender)**: OnboardingTrack → OnboardingProfile → OnboardingOccasions → OnboardingEmergency → OnboardingTour → OnboardingEstate
- **Onboarding (invited recipient)**: Auto-detected in `applySession` (App.tsx) → OnboardingInvitedScreen only
- **Main (sender / both)**: MainTabs — Home, Memories, Vault, Family, Settings
- **Main (recipient only)**: RecipientTabs — My Vault, Settings

`OnboardingRoleScreen` is retired — do not use.

## Account Types
- `sender` — records memories (default for organic sign-ups)
- `recipient` — invited family member who receives memories
- `both` — started as recipient, also wants to send

Invited recipients are auto-detected by email match against `family_members` in `applySession` (App.tsx). Never show the role selection screen to new sign-ups.

## Database
- Supabase project: `yfthwahxahjabfbuntys`
- Migration files: `supabase/migrations/YYYYMMDDHHMMSS_name.sql` format (timestamp required)
- `handle_new_user` trigger: inserts profile row on auth signup — must include `account_type='sender'` and `onboarding_type='sender'` defaults
