import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { CustomBottomTabBar } from '@/components/custom-bottom-tab-bar';
import { goBack } from '@/lib/navigation';

interface SettingItem {
  id: string;
  title: string;
  subtitle: string;
  iconName: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
}

export default function SettingsScreen() {
  const router = useRouter();

  const settingsList: SettingItem[] = [
    {
      id: 'account',
      title: 'Compte',
      subtitle: 'Modifier le nom et le numéro de téléphone',
      iconName: 'person',
      onPress: () => router.push('/edit-profile'),
    },
    {
      id: 'notifications',
      title: 'Notifications',
      subtitle: 'Alertes trafic, itinéraire et zones suivies',
      iconName: 'notifications',
      onPress: () => router.push('/notification-settings'),
    },
    {
      id: 'location',
      title: 'Localisation',
      subtitle: 'Gérer l’accès à votre position',
      iconName: 'location',
      onPress: () => router.push('/location-settings'),
    },
    {
      id: 'appearance',
      title: 'Apparence',
      subtitle: 'Thème et affichage de l’application',
      iconName: 'color-palette',
      onPress: () => router.push('/appearance-settings'),
    },
    {
      id: 'privacy',
      title: 'Confidentialité et sécurité',
      subtitle: 'Données personnelles et sécurité du compte',
      iconName: 'lock-closed',
      onPress: () => {},
    },
    {
      id: 'info',
      title: 'Informations',
      subtitle: 'À propos de SIRA, conditions et contact',
      iconName: 'information',
      onPress: () => router.push('/info-settings'),
    },
  ];

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />

      <View style={styles.container}>
        {/* Top Header Bar */}
        <View style={styles.headerContainer}>
          <TouchableOpacity
            style={styles.headerIconButton}
            onPress={() => goBack(router)}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="arrow-back" size={24} color="#000000" />
          </TouchableOpacity>

          <Text style={styles.headerTitle}>Paramètres</Text>

          <TouchableOpacity
            style={styles.headerIconButton}
            onPress={() => {}}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="search" size={24} color="#000000" />
          </TouchableOpacity>
        </View>

        {/* Settings Cards List */}
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {settingsList.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={styles.settingCard}
              onPress={item.onPress}
              activeOpacity={0.8}
            >
              {/* Left Orange Icon Circle */}
              <View style={styles.iconBadge}>
                <Ionicons name={item.iconName} size={22} color="#FFFFFF" />
              </View>

              {/* Title & Subtitle */}
              <View style={styles.textContainer}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={styles.cardSubtitle}>{item.subtitle}</Text>
              </View>

              {/* Right Small Orange Chevron Circle */}
              <View style={styles.actionChevron}>
                <Ionicons name="chevron-forward" size={14} color="#FFFFFF" />
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Bottom Navigation Bar */}
      <CustomBottomTabBar activeTab="profile" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  headerContainer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#000000',
    letterSpacing: 0.2,
  },
  headerIconButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 24,
  },
  settingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#ECECEC',
    padding: 14,
    marginBottom: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  iconBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F26522',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  textContainer: {
    flex: 1,
    paddingRight: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#000000',
    marginBottom: 2,
  },
  cardSubtitle: {
    fontSize: 12.5,
    fontWeight: '400',
    color: '#666666',
    lineHeight: 16,
  },
  actionChevron: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#F26522',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
