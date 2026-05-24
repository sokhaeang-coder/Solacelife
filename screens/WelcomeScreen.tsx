import { StyleSheet, Text, View, TouchableOpacity, StatusBar } from 'react-native'

export default function WelcomeScreen({ navigation }: any) {
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Background glow */}
      <View style={styles.glowTop} />
      <View style={styles.glowBottom} />

      <View style={styles.hero}>
        {/* Icon with 3D ring effect */}
        <View style={styles.iconRing}>
          <View style={styles.iconInner}>
            <Text style={styles.iconHeart}>♡</Text>
          </View>
        </View>

        <Text style={styles.appName}>Solace Life</Text>
        <View style={styles.divider} />
        <Text style={styles.tagline}>Your legacy, preserved forever.</Text>
        <Text style={styles.subtitle}>
          A private sanctuary for the memories,{'\n'}
          messages, and moments that matter most.
        </Text>
      </View>

      <View style={styles.buttons}>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => navigation.navigate('SignUp')}
        >
          <Text style={styles.primaryButtonText}>Begin Your Legacy</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => navigation.navigate('SignIn')}
        >
          <Text style={styles.secondaryButtonText}>Sign In</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.footer}>Private · Secure · Yours</Text>
    </View>
  )
}

const NAVY = '#080F1E'
const NAVY2 = '#0D1828'
const GOLD = '#C8956C'
const GOLD_LIGHT = '#E8B48A'
const GOLD_DIM = '#8A5A3A'

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: NAVY,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 70,
    paddingHorizontal: 28,
  },
  glowTop: {
    position: 'absolute',
    top: -80,
    width: 340,
    height: 340,
    borderRadius: 170,
    backgroundColor: GOLD_DIM,
    opacity: 0.12,
  },
  glowBottom: {
    position: 'absolute',
    bottom: -100,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: GOLD_DIM,
    opacity: 0.08,
  },
  hero: {
    alignItems: 'center',
    marginTop: 40,
  },
  iconRing: {
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 1.5,
    borderColor: GOLD_DIM,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
    shadowColor: GOLD,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
  },
  iconInner: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: NAVY2,
    borderWidth: 1,
    borderColor: GOLD,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: GOLD,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
  },
  iconHeart: {
    fontSize: 34,
    color: GOLD_LIGHT,
  },
  appName: {
    fontSize: 38,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 2,
  },
  divider: {
    width: 50,
    height: 1,
    backgroundColor: GOLD_DIM,
    marginVertical: 16,
    opacity: 0.7,
  },
  tagline: {
    fontSize: 15,
    color: GOLD_LIGHT,
    letterSpacing: 1,
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 13,
    color: '#4A6080',
    textAlign: 'center',
    lineHeight: 20,
  },
  buttons: {
    width: '100%',
    gap: 12,
  },
  primaryButton: {
    backgroundColor: GOLD,
    borderRadius: 14,
    paddingVertical: 17,
    alignItems: 'center',
    shadowColor: GOLD,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
  },
  primaryButtonText: {
    color: '#0A0F1A',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: GOLD_DIM,
    borderRadius: 14,
    paddingVertical: 17,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: GOLD,
    fontSize: 16,
    fontWeight: '500',
    letterSpacing: 0.5,
  },
  footer: {
    color: '#2A3A4A',
    fontSize: 12,
    letterSpacing: 1.5,
  },
})