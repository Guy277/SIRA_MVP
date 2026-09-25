import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import {
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Designer canvas reference metrics (406px x 874px)
const DESIGN_CANVAS_WIDTH = 406;
const DESIGN_CANVAS_HEIGHT = 874;

// City Wave Image specs: Width 481px, Height 388px, Top 149px, Left -39px
const CITY_IMAGE_WIDTH = (481 / DESIGN_CANVAS_WIDTH) * SCREEN_WIDTH;
const CITY_IMAGE_HEIGHT = (388 / DESIGN_CANVAS_HEIGHT) * SCREEN_HEIGHT;
const CITY_IMAGE_TOP = (149 / DESIGN_CANVAS_HEIGHT) * SCREEN_HEIGHT;
const CITY_IMAGE_LEFT = (-39 / DESIGN_CANVAS_WIDTH) * SCREEN_WIDTH;

// Phone Mockup specs: Width 120px, Height 245px, Top 292px, Left 11px
const PHONE_MOCKUP_WIDTH = (120 / DESIGN_CANVAS_WIDTH) * SCREEN_WIDTH;
const PHONE_MOCKUP_HEIGHT = (245 / DESIGN_CANVAS_HEIGHT) * SCREEN_HEIGHT;
const PHONE_MOCKUP_TOP = (292 / DESIGN_CANVAS_HEIGHT) * SCREEN_HEIGHT;
const PHONE_MOCKUP_LEFT = (11 / DESIGN_CANVAS_WIDTH) * SCREEN_WIDTH;

import { useOtpLogin } from '@/lib/use-otp-login';
import { goBack } from '@/lib/navigation';

export default function SignupScreen() {
  const router = useRouter();
  const [firstName, setFirstName] = useState('');
  const [phone, setPhone] = useState('');

  const otp = useOtpLogin();

  // Same SMS flow as login; the first name is saved on the new account.
  const handleSignup = async () => {
    if (await otp.submit(phone, firstName)) router.replace('/(tabs)');
  };

  const handleGoToLogin = () => {
    router.push('/login');
  };

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      {/* Full Screen Light Map Watermark Background */}
      <Image
        source={require('@/assets/images/signup-map-bg.png')}
        style={styles.bgWatermarkDecor}
        contentFit="cover"
      />

      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            bounces={false}
            showsVerticalScrollIndicator={false}
          >
            {/* Top Navigation Row with Circular Back Arrow and Sira Brand Logo */}
            <View style={styles.topNavHeader}>
              <TouchableOpacity
                style={styles.backButton}
                onPress={() => goBack(router)}
                activeOpacity={0.8}
              >
                <Ionicons name="arrow-back" size={18} color="#FFFFFF" />
              </TouchableOpacity>

              <View style={styles.headerLogoContainer}>
                <Image
                  source={require('@/assets/images/sira-logo-vector.png')}
                  style={styles.headerLogoImage}
                  contentFit="contain"
                />
                <View style={styles.headerTaglineRow}>
                  <Text style={styles.taglineBlack}>ON TRACE, </Text>
                  <Text style={styles.taglineOrange}>SANS STRESS.</Text>
                </View>
              </View>

              {/* Balance spacer */}
              <View style={styles.spacerRight} />
            </View>

            {/* Middle Wave City Picture with iPhone Mockup on the Left */}
            <View style={styles.heroSection}>
              <Image
                source={require('@/assets/images/signup-wave-city-pure.png')}
                style={styles.waveCityImage}
                contentFit="contain"
              />

              {/* Front-facing iPhone Mockup on the left side of the wave */}
              <View style={styles.mockupContainer}>
                <Image
                  source={require('@/assets/images/sira-phone-vertical-straight.png')}
                  style={styles.mockupImage}
                  contentFit="contain"
                />
              </View>
            </View>

            {/* Bottom Form Section */}
            <View style={styles.bottomSection}>
              <View style={styles.titleContainer}>
                <Text style={styles.welcomeTitle}>
                  BIENVENUE SUR <Text style={styles.orangeText}>SIRA</Text>
                </Text>
                <Text style={styles.welcomeSubtitle}>
                  L'application qui simplifie{'\n'}vos déplacements à Abidjan.
                </Text>
              </View>

              {/* Input 1: Prénom */}
              <View style={styles.inputWrapper}>
                <View style={styles.iconCircle}>
                  <Ionicons name="person" size={17} color="#FFFFFF" />
                </View>
                <TextInput
                  style={styles.textInput}
                  placeholder="Prenom"
                  placeholderTextColor="#B0B0B0"
                  value={firstName}
                  onChangeText={setFirstName}
                />
              </View>

              {/* Input 2: Numéro Orange */}
              <View style={styles.inputWrapper}>
                <View style={styles.iconCircle}>
                  <Ionicons name="person" size={17} color="#FFFFFF" />
                </View>
                <TextInput
                  style={styles.textInput}
                  placeholder={otp.step === 'phone' ? 'Entrez votre numéro Orange' : 'Code reçu par SMS'}
                  placeholderTextColor="#B0B0B0"
                  keyboardType={otp.step === 'phone' ? 'phone-pad' : 'number-pad'}
                  value={otp.step === 'phone' ? phone : otp.code}
                  onChangeText={otp.step === 'phone' ? setPhone : otp.setCode}
                />
              </View>
              {otp.info && (
                <Text style={styles.otpInfo} onPress={otp.changeNumber}>
                  {otp.info} · Changer de numéro
                </Text>
              )}

              {/* Orange Inscription Button */}
              <TouchableOpacity
                style={styles.signupButton}
                onPress={handleSignup}
                disabled={otp.busy}
                activeOpacity={0.85}
              >
                <Text style={styles.signupButtonText}>{otp.busy ? 'PATIENTEZ…' : otp.step === 'phone' ? 'RECEVOIR MON CODE' : 'CRÉER MON COMPTE'}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  otpInfo: {
    color: '#F26522',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 6,
  },
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
    position: 'relative',
  },
  safeArea: {
    flex: 1,
  },
  bgWatermarkDecor: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
    opacity: 0.30,
    zIndex: 0,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 25,
  },
  topNavHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 4,
    paddingBottom: 4,
    zIndex: 5,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  spacerRight: {
    width: 36,
  },
  headerLogoContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerLogoImage: {
    width: 145,
    height: 68,
  },
  headerTaglineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  taglineBlack: {
    color: '#111111',
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 15,
    letterSpacing: 0,
    fontVariant: ['small-caps'],
    textTransform: 'uppercase',
  },
  taglineOrange: {
    color: '#F26522',
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 15,
    letterSpacing: 0,
    fontVariant: ['small-caps'],
    textTransform: 'uppercase',
  },
  heroSection: {
    width: '100%',
    height: CITY_IMAGE_HEIGHT,
    position: 'relative',
    marginVertical: 4,
    overflow: 'visible',
  },
  waveCityImage: {
    position: 'absolute',
    left: CITY_IMAGE_LEFT,
    top: 0,
    width: CITY_IMAGE_WIDTH,
    height: CITY_IMAGE_HEIGHT,
  },
  mockupContainer: {
    position: 'absolute',
    left: PHONE_MOCKUP_LEFT,
    bottom: 12,
    width: PHONE_MOCKUP_WIDTH,
    height: PHONE_MOCKUP_HEIGHT,
    zIndex: 15,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.32,
    shadowRadius: 10,
    elevation: 10,
  },
  mockupImage: {
    width: '100%',
    height: '100%',
  },
  bottomSection: {
    paddingHorizontal: 28,
    paddingTop: 10,
    alignItems: 'center',
  },
  titleContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  welcomeTitle: {
    color: '#000000',
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 28,
    letterSpacing: 0,
    textAlign: 'center',
    textTransform: 'uppercase',
    fontVariant: ['small-caps'],
  },
  orangeText: {
    color: '#F26522',
  },
  welcomeSubtitle: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '500',
    lineHeight: 20,
    letterSpacing: 0,
    textAlign: 'center',
    marginTop: 6,
  },
  inputWrapper: {
    width: '100%',
    backgroundColor: '#333333',
    borderRadius: 25,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginBottom: 14,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F26522',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  textInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 20,
    letterSpacing: 0,
    paddingVertical: 8,
  },
  signupButton: {
    backgroundColor: '#F26522',
    minWidth: 140,
    paddingHorizontal: 36,
    paddingVertical: 12,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    shadowColor: '#F26522',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 5,
  },
  signupButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
});
