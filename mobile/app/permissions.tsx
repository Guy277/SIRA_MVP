// Autorisations : l'état réel des deux autorisations que SIRA utilise (position et micro), avec de quoi les
// accorder ou ouvrir les réglages du téléphone, et l'interrupteur de SIRA lui-même (lib/usage.ts) : coupé,
// SIRA ne s'en sert plus, même si le téléphone l'autorise toujours (seuls ses réglages peuvent la retirer).
// Ouvert depuis Paramètres. Une autorisation n'apparaît ici que si une fonction de SIRA s'en sert vraiment.
import React from 'react';
import { ScrollView, StyleSheet, Switch, TouchableOpacity, View } from 'react-native';
import { Text } from '@/components/sira-text';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { goBack } from '@/lib/navigation';
import {
  canOpenSettings, openPhoneSettings, PERMISSION_LABELS, usePermissions, type PermissionKind, type PermissionState,
} from '@/lib/permissions';
import { refreshCurrentPlace } from '@/lib/places';
import { MIC_NEEDS_HTTPS, POSITION_NEEDS_HTTPS } from '@/lib/secure-context';
import { setUsage, useUsage } from '@/lib/usage';

type Icon = keyof typeof Ionicons.glyphMap;

const PERMISSIONS: { kind: PermissionKind; icon: Icon; title: string; why: string; use: string; off: string }[] = [
  {
    kind: 'location', icon: 'navigate', title: 'Position', why: 'Pour partir de là où tu es et te prévenir avant de descendre.',
    use: 'Utiliser ma position', off: 'SIRA n’utilise plus ta position : tu choisis ton départ toi-même et tu avances le guidage en touchant l’écran.',
  },
  {
    kind: 'microphone', icon: 'mic', title: 'Micro', why: 'Pour parler à SIRA. Ta voix n’est jamais gardée.',
    use: 'Utiliser le micro', off: 'SIRA n’utilise plus le micro : tu écris tes questions et ta destination.',
  },
];

export default function PermissionsScreen() {
  const router = useRouter();
  const { states, request } = usePermissions();
  const usage = useUsage();

  // SIRA's own switch; « Ma position » is looked up again (or dropped) at once.
  const toggle = (kind: PermissionKind, on: boolean) => {
    setUsage(kind, on);
    if (kind === 'location') void refreshCurrentPlace();
  };

  const action = (kind: PermissionKind, state: PermissionState, title: string) => {
    if (state === 'unknown' || state === 'denied') {
      return (
        <TouchableOpacity style={styles.button} onPress={() => void request(kind)} activeOpacity={0.85}
          accessibilityRole="button" accessibilityLabel={`Autoriser : ${title}`}>
          <Text style={styles.buttonText}>Autoriser</Text>
        </TouchableOpacity>
      );
    }
    if ((state === 'granted' || state === 'blocked') && canOpenSettings) {
      return (
        <TouchableOpacity style={[styles.button, styles.buttonOutline]} onPress={openPhoneSettings} activeOpacity={0.85}
          accessibilityRole="button" accessibilityLabel={`Réglages du téléphone : ${title}`}>
          <Text style={[styles.buttonText, styles.buttonOutlineText]}>Réglages</Text>
        </TouchableOpacity>
      );
    }
    return null;
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => goBack(router, '/settings')} activeOpacity={0.8}
          accessibilityLabel="Retour" hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={20} color="#000000" />
        </TouchableOpacity>
        <Text style={styles.title}>Autorisations</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.intro}>Ce que SIRA peut utiliser sur ton téléphone, et pourquoi. L’interrupteur arrête ou reprend son utilisation dans SIRA, sans toucher aux réglages du téléphone.</Text>
        <View style={styles.card}>
          {PERMISSIONS.map((permission, index) => {
            const state = states[permission.kind];
            return (
              <View key={permission.kind} style={[styles.item, index > 0 && styles.rowBorder]}>
                <View style={styles.itemIcon}><Ionicons name={permission.icon} size={18} color="#F26522" /></View>
                <View style={styles.itemText}>
                  <View style={styles.itemHead}>
                    <Text style={styles.itemTitle}>{permission.title}</Text>
                    <Text style={[styles.status, state === 'granted' ? styles.statusOn : styles.statusOff]}>{PERMISSION_LABELS[state]}</Text>
                    <View style={styles.headAction}>{action(permission.kind, state, permission.title)}</View>
                  </View>
                  <Text style={styles.itemBody}>{permission.why}</Text>
                  {state === 'blocked' && !canOpenSettings && (
                    <Text style={styles.hint}>Pour changer ce choix, passe par les réglages de ton navigateur.</Text>
                  )}
                  {state === 'insecure' && (
                    <Text style={styles.hint}>{permission.kind === 'microphone' ? MIC_NEEDS_HTTPS : POSITION_NEEDS_HTTPS}</Text>
                  )}
                  <View style={styles.switchRow}>
                    <Text style={styles.switchLabel}>{permission.use}</Text>
                    <Switch
                      value={usage[permission.kind]}
                      onValueChange={(on) => toggle(permission.kind, on)}
                      trackColor={{ false: '#3F3F46', true: '#F26522' }}
                      thumbColor="#FFFFFF"
                      {...({ activeThumbColor: '#FFFFFF' } as object)}
                      accessibilityLabel={permission.use}
                    />
                  </View>
                  {!usage[permission.kind] && <Text style={styles.offNote}>{permission.off}</Text>}
                </View>
              </View>
            );
          })}
        </View>
        {!canOpenSettings && <Text style={styles.note}>Pour retirer une autorisation, passe par les réglages de ton navigateur.</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#000000' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  backButton: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#F26522', justifyContent: 'center', alignItems: 'center' },
  title: { color: '#FFFFFF', fontSize: 22, fontWeight: '800' },
  content: { paddingHorizontal: 16, paddingBottom: 32 },
  intro: { color: '#9CA3AF', fontSize: 13, marginTop: 10, marginBottom: 12, marginLeft: 4 },
  card: { backgroundColor: '#1E1E1E', borderRadius: 18, paddingHorizontal: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16 },
  rowBorder: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  itemIcon: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(242,101,34,0.15)', justifyContent: 'center', alignItems: 'center', alignSelf: 'flex-start',
  },
  itemText: { flex: 1 },
  itemHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3, minHeight: 32 },
  headAction: { marginLeft: 'auto' },
  itemTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  itemBody: { color: '#BBBBBB', fontSize: 13, lineHeight: 19 },
  status: { fontSize: 12, fontWeight: '800' },
  statusOn: { color: '#4ADE80' },
  statusOff: { color: '#9CA3AF' },
  hint: { color: '#9CA3AF', fontSize: 12, marginTop: 4, fontStyle: 'italic' },
  note: { color: '#9CA3AF', fontSize: 12, marginTop: 10, marginLeft: 4 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 10 },
  switchLabel: { color: '#FFFFFF', fontSize: 14, fontWeight: '600', flexShrink: 1 },
  offNote: { color: '#FDBA74', fontSize: 12, lineHeight: 17, marginTop: 6 },
  button: { backgroundColor: '#F26522', borderRadius: 16, paddingVertical: 7, paddingHorizontal: 12 },
  buttonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  buttonOutline: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#F26522' },
  buttonOutlineText: { color: '#F26522' },
});
