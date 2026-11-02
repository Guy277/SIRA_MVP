import React from 'react';
import { StyleSheet, View, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { Text } from '@/components/sira-text';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { goBack } from '@/lib/navigation';
import { chooseVoiceMode, useVoiceMode, VOICE_MODE_DETAILS, VOICE_MODE_LABELS, type VoiceMode } from '@/lib/voice';

// SIRA's voice is off until the traveller turns it on here (or with the speaker button).
const OPTIONS: VoiceMode[] = ['on', 'alerts', 'off'];

export default function VoiceSettingsScreen() {
  const router = useRouter();
  const mode = useVoiceMode();

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.headerBar}>
          <TouchableOpacity
            style={styles.darkBackBtn}
            onPress={() => goBack(router)}
            activeOpacity={0.8}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel="Retour"
          >
            <Ionicons name="arrow-back" size={20} color="#FFFFFF" />
          </TouchableOpacity>

          <Text style={styles.headerTitle}>Voix de SIRA</Text>
          <View style={styles.headerRightSpacer} />
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.intro}>
            Choisis si SIRA te parle. Ce réglage est gardé sur ce téléphone.
          </Text>

          <View accessibilityRole="radiogroup">
            {OPTIONS.map((option) => {
              const selected = mode === option;
              return (
                <TouchableOpacity
                  key={option}
                  style={[styles.settingCard, selected && styles.selectedCard]}
                  onPress={() => { if (!selected) chooseVoiceMode(option); }}
                  activeOpacity={0.8}
                  accessibilityRole="radio"
                  aria-checked={selected}
                  accessibilityLabel={`${VOICE_MODE_LABELS[option]}. ${VOICE_MODE_DETAILS[option]}`}
                >
                  <Ionicons
                    name={selected ? 'radio-button-on' : 'ellipse-outline'}
                    size={22}
                    color={selected ? '#F26522' : '#94A3B8'}
                    style={styles.radioIcon}
                  />
                  <View style={styles.cardTextCol}>
                    <Text style={styles.cardTitle}>{VOICE_MODE_LABELS[option]}</Text>
                    <Text style={styles.cardSubtitle}>{VOICE_MODE_DETAILS[option]}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.hint}>
            Le bouton haut-parleur de l’accueil et du trajet change aussi ce réglage.
          </Text>
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
    paddingTop: 8,
    paddingBottom: 24,
  },
  intro: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 19,
    marginBottom: 16,
  },
  settingCard: {
    flexDirection: 'row',
    alignItems: 'center',
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
  selectedCard: {
    borderColor: '#F26522',
    backgroundColor: '#FFF7F2',
  },
  radioIcon: {
    marginRight: 12,
  },
  cardTextCol: {
    flex: 1,
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
  hint: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
    marginTop: 4,
  },
});
