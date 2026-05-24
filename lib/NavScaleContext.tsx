import { createContext, useContext, useState, useEffect } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'

const STORAGE_KEY = 'navIconScale'

export type NavScaleOption = 'small' | 'medium' | 'large'

// fontSize:     emoji font size
// wrapWidth:    tabIconWrap width  — must be > fontSize + pill paddingHorizontal (12+12=24)
// wrapHeight:   tabIconWrap height — must be > fontSize + pill paddingVertical   (4+4=8)
// tabBarHeight: overall tab bar height — grows so the label stays visible too
const NAV_SCALE_CONFIG: Record<NavScaleOption, { fontSize: number; wrapWidth: number; wrapHeight: number; tabBarHeight: number }> = {
  small:  { fontSize: 20, wrapWidth: 48, wrapHeight: 36, tabBarHeight: 78 },
  medium: { fontSize: 24, wrapWidth: 52, wrapHeight: 40, tabBarHeight: 82 },
  large:  { fontSize: 30, wrapWidth: 64, wrapHeight: 50, tabBarHeight: 92 },
}

interface NavScaleContextType {
  navScale: NavScaleOption
  setNavScale: (scale: NavScaleOption) => void
  fontSize: number
  wrapWidth: number
  wrapHeight: number
  tabBarHeight: number
}

const NavScaleContext = createContext<NavScaleContextType>({
  navScale: 'medium',
  setNavScale: () => {},
  ...NAV_SCALE_CONFIG.medium,
})

export function NavScaleProvider({ children }: { children: React.ReactNode }) {
  const [navScale, setNavScaleState] = useState<NavScaleOption>('medium')

  // Load persisted preference on mount
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(val => {
      if (val === 'small' || val === 'medium' || val === 'large') {
        setNavScaleState(val)
      }
    }).catch(() => {})
  }, [])

  const setNavScale = (scale: NavScaleOption) => {
    setNavScaleState(scale)
    AsyncStorage.setItem(STORAGE_KEY, scale).catch(() => {})
  }

  return (
    <NavScaleContext.Provider value={{ navScale, setNavScale, ...NAV_SCALE_CONFIG[navScale] }}>
      {children}
    </NavScaleContext.Provider>
  )
}

export function useNavScale() {
  return useContext(NavScaleContext)
}
