import React from 'react';
import {
  StyleSheet,
  View,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import { Text } from '@/components/sira-text';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { CustomBottomTabBar, useTabBarSpace } from '@/components/custom-bottom-tab-bar';
import { goBack } from '@/lib/navigation';
import { useVoiceMode, VOICE_MODE_ICONS, VOICE_MODE_LABELS } from '@/lib/voice';

interface SettingItem {
  id: string;
  title: string;
  subtitle: string;
  iconName: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
}

export default function SettingsScreen() {
  // The list ends above the bottom bar (its last item stays reachable on small phones).
  const tabBarSpace = useTabBarSpace();
  const router = useRouter();
  const voiceMode = useVoiceMode();

  // How SIRA behaves (the traveller's own things and the chat with SIRA are in the Profil).
  // Notifications and Apparence come back here once they really work.
  const settingsList: SettingItem[] = [
    {
      // SIRA starts silent: the traveller turns its voice on here.
      id: 'voice',
      title: 'Voix de SIRA',
      subtitle: VOICE_MODE_LABELS[voiceMode],
      iconName: VOICE_MODE_ICONS[voiceMode],
      onPress: () => router.push('/voice-settings'),
    },
    {
      id: 'permissions',
      title: 'Autorisations',
      subtitle: 'Position et micro : ce que SIRA utilise',
      iconName: 'shield-checkmark',
      onPress: () => router.push('/permissions'),
    },
    {
      id: 'privacy',
      title: 'Confidentialité',
      subtitle: 'Ce que SIRA garde sur toi, et ce qu’il ne garde pas',
      iconName: 'lock-closed',
      onPress: () => router.push('/privacy'),
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
      <StatusBar style="light" />

      <View style={styles.container}>
        {/* Top Header Bar */}
        <View style={styles.headerContainer}>
          <TouchableOpacity
            style={styles.headerIconButton}
            onPress={() => goBack(router)}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>

          <Text style={styles.headerTitle}>Paramètres</Text>

          <TouchableOpacity
            style={styles.headerIconButton}
            onPress={() => {}}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="search" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {/* Settings Cards List */}
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: tabBarSpace }]}
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
    backgroundColor: '#000000',
  },
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  headerContainer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#000000',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
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
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
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
    color: '#FFFFFF',
    marginBottom: 2,
  },
  cardSubtitle: {
    fontSize: 12.5,
    fontWeight: '400',
    color: '#BBBBBB',
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
