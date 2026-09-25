import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

interface InfoItem {
  id: string;
  title: string;
  subtitle: string;
  onPress: () => void;
}

export default function InfoSettingsScreen() {
  const router = useRouter();

  const infoList: InfoItem[] = [
    {
      id: 'about',
      title: 'À propos de SIRA',
      subtitle: 'Notre mission et notre vision',
      onPress: () =>
        Alert.alert(
          'À propos de SIRA',
          'SIRA est une plateforme de mobilité intelligente conçue pour optimiser vos déplacements urbains et interurbains à Abidjan.'
        ),
    },
    {
      id: 'terms',
      title: "Conditions d'utilisation",
      subtitle: "Règles d'utilisation de l'application",
      onPress: () =>
        Alert.alert(
          "Conditions d'utilisation",
          "Consultez l'ensemble des conditions générales et règles d'utilisation de la plateforme SIRA."
        ),
    },
    {
      id: 'privacy',
      title: 'Politique de confidentialité',
      subtitle: 'Comment nous protégeons vos données',
      onPress: () =>
        Alert.alert(
          'Politique de confidentialité',
          'SIRA s’engage à protéger vos données personnelles et votre vie privée conformément aux réglementations en vigueur.'
        ),
    },
    {
      id: 'contact',
      title: 'Nous contacter',
      subtitle: "Besoin d'aide ou une question ?",
      onPress: () =>
        Alert.alert(
          'Nous contacter',
          'Notre équipe support est à votre disposition 7j/7.\nEmail: support@sira.ci\nTél: +225 07 00 00 00 00'
        ),
    },
  ];

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Top Header Bar */}
        <View style={styles.headerBar}>
          <TouchableOpacity
            style={styles.darkBackBtn}
            onPress={() => router.back()}
            activeOpacity={0.8}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="arrow-back" size={20} color="#FFFFFF" />
          </TouchableOpacity>

          <Text style={styles.headerTitle}>Informations</Text>
          <View style={styles.headerRightSpacer} />
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Top Logo & Hero Text */}
          <View style={styles.heroSection}>
            <Image
              source={require('@/assets/images/sira-logo-official.png')}
              style={styles.siraLogoImage}
              contentFit="contain"
            />

            <Text style={styles.heroDesc}>
              <Text style={styles.boldText}>SIRA est une plateforme de mobilité intelligente</Text>{'\n'}
              pensée pour simplifier les déplacements à Abidjan.
            </Text>
          </View>

          {/* Info Cards List */}
          <View style={styles.cardsListContainer}>
            {infoList.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.settingCard}
                onPress={item.onPress}
                activeOpacity={0.8}
              >
                <View style={styles.cardTextCol}>
                  <Text style={styles.cardTitle}>{item.title}</Text>
                  <Text style={styles.cardSubtitle}>{item.subtitle}</Text>
                </View>

                <View style={styles.orangeChevronCircle}>
                  <Ionicons name="chevron-forward" size={14} color="#FFFFFF" />
                </View>
              </TouchableOpacity>
            ))}
          </View>

          {/* App Version Info Footer */}
          <View style={styles.versionContainer}>
            <Text style={styles.versionLabel}>Version de l'application</Text>
            <Text style={styles.versionNumber}>1.0.0</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
  },
  darkBackBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#1E1E1E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#000000',
    marginLeft: 14,
    letterSpacing: -0.2,
  },
  headerRightSpacer: {
    width: 38,
  },
  scrollView: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 32,
  },
  heroSection: {
    alignItems: 'center',
    marginBottom: 24,
    marginTop: 8,
  },
  siraLogoImage: {
    width: 170,
    height: 90,
    marginBottom: 16,
  },
  heroDesc: {
    fontSize: 14.5,
    color: '#333333',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 10,
  },
  boldText: {
    fontWeight: '900',
    color: '#000000',
  },
  cardsListContainer: {
    marginBottom: 16,
  },
  settingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.03,
        shadowRadius: 4,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  cardTextCol: {
    flex: 1,
    paddingRight: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#000000',
    marginBottom: 2,
    letterSpacing: -0.1,
  },
  cardSubtitle: {
    fontSize: 13,
    fontWeight: '400',
    color: '#64748B',
    lineHeight: 17,
  },
  orangeChevronCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#F26522',
    justifyContent: 'center',
    alignItems: 'center',
  },
  versionContainer: {
    marginTop: 4,
    paddingHorizontal: 4,
  },
  versionLabel: {
    fontSize: 12.5,
    color: '#64748B',
    marginBottom: 2,
  },
  versionNumber: {
    fontSize: 16,
    fontWeight: '900',
    color: '#000000',
  },
});
