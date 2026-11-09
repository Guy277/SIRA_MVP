import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  TouchableOpacity,
  ScrollView,
  Switch,
  Platform,
} from 'react-native';
import { Text } from '@/components/sira-text';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CustomBottomTabBar, useTabBarSpace } from '@/components/custom-bottom-tab-bar';
import { goBack } from '@/lib/navigation';

interface NotificationSettingItem {
  id: string;
  title: string;
  subtitle: string;
  defaultValue: boolean;
}

const SETTINGS_ITEMS: NotificationSettingItem[] = [
  {
    id: 'general',
    title: 'Notifications générales',
    subtitle: 'Recevoir toutes les notifications',
    defaultValue: false,
  },
  {
    id: 'traffic',
    title: 'Alertes trafic',
    subtitle: 'Accidents, embouteillages et routes bloquées',
    defaultValue: false,
  },
  {
    id: 'route',
    title: 'Alertes sur mon itinéraire',
    subtitle: 'Événements sur ton trajet',
    defaultValue: false,
  },
  {
    id: 'zones',
    title: 'Zones suivies',
    subtitle: 'Nouveaux événements dans tes zones',
    defaultValue: false,
  },
  {
    id: 'weather',
    title: 'Alertes météo',
    subtitle: 'Pluies importantes et inondations',
    defaultValue: false,
  },
  {
    id: 'reports',
    title: 'Signalements',
    subtitle: 'Informations liées aux signalements',
    defaultValue: false,
  },
  {
    id: 'dnd',
    title: 'Ne pas déranger',
    subtitle: 'Mode silencieux',
    defaultValue: false,
  },
];

export default function NotificationSettingsScreen() {
  // The list ends above the bottom bar (its last item stays reachable on small phones).
  const tabBarSpace = useTabBarSpace();
  const router = useRouter();

  const [settingsState, setSettingsState] = useState<Record<string, boolean>>(() => {
    const initialState: Record<string, boolean> = {};
    SETTINGS_ITEMS.forEach((item) => {
      initialState[item.id] = item.defaultValue;
    });
    return initialState;
  });

  const toggleSetting = (id: string) => {
    setSettingsState((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Top Header Bar */}
        <View style={styles.headerBar}>
          <TouchableOpacity
            style={styles.darkBackBtn}
            onPress={() => goBack(router)}
            activeOpacity={0.8}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="arrow-back" size={20} color="#000000" />
          </TouchableOpacity>

          <Text style={styles.headerTitle}>Notifications</Text>
          <View style={styles.headerRightSpacer} />
        </View>

        {/* Scrollable Cards List */}
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: tabBarSpace }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Push notifications are not built yet: the switches are shown, but honestly disabled. */}
          <View style={styles.comingSoon}>
            <Ionicons name="time-outline" size={18} color="#F26522" />
            <Text style={styles.comingSoonText}>
              Les notifications arrivent dans une prochaine version. En attendant, SIRA te prévient à la voix pendant tes trajets.
            </Text>
          </View>
          {SETTINGS_ITEMS.map((item) => {
            const isEnabled = !!settingsState[item.id];
            return (
              <View key={item.id} style={styles.settingCard}>
                <View style={styles.cardTextCol}>
                  <Text style={styles.cardTitle}>{item.title}</Text>
                  <Text style={styles.cardSubtitle}>{item.subtitle}</Text>
                </View>

                <Switch
                  trackColor={{ false: '#3F3F46', true: '#F26522' }}
                  thumbColor={Platform.OS === 'ios' ? '#FFFFFF' : isEnabled ? '#FFFFFF' : '#F4F3F4'}
                  ios_backgroundColor="#3F3F46"
                  onValueChange={() => toggleSetting(item.id)}
                  value={isEnabled}
                  disabled
                />
              </View>
            );
          })}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  safeArea: {
    flex: 1,
    backgroundColor: '#000000',
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#000000',
  },
  darkBackBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F26522',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#FFFFFF',
    marginLeft: 14,
    letterSpacing: -0.2,
  },
  headerRightSpacer: {
    width: 38,
  },
  scrollView: {
    flex: 1,
    backgroundColor: '#000000',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
  },
  comingSoon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(242,101,34,0.15)',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
  },
  comingSoonText: {
    flex: 1,
    fontSize: 13,
    color: '#FDBA74',
    lineHeight: 18,
  },
  settingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
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
    color: '#FFFFFF',
    marginBottom: 2,
    letterSpacing: -0.1,
  },
  cardSubtitle: {
    fontSize: 13,
    fontWeight: '400',
    color: '#BBBBBB',
    lineHeight: 17,
  },
});
