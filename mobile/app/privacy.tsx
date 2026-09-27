// Confidentialité : ce que SIRA sait du voyageur (lu sur le serveur), ce qu'il
// ne garde pas (et à qui la position est envoyée), l'état réel des
// autorisations du téléphone, et la suppression définitive du compte.
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { DeleteAccountModal } from '@/components/delete-account-modal';
import { goBack } from '@/lib/navigation';
import {
  canOpenSettings, openPhoneSettings, PERMISSION_LABELS, usePermissions, type PermissionKind, type PermissionState,
} from '@/lib/permissions';
import { privacySummary, type PrivacySummary } from '@/lib/sira-api';
import { useSession } from '@/lib/session';

type Icon = keyof typeof Ionicons.glyphMap;

// What SIRA does not keep, as the code does it (services/voice, services/community, API).
const NOT_KEPT: { icon: Icon; title: string; text: string }[] = [
  { icon: 'mic-off', title: 'Ta voix', text: "Elle sert seulement à comprendre ta demande, puis elle est effacée tout de suite, sur ton téléphone comme sur nos serveurs." },
  { icon: 'location', title: 'Ta position', text: "SIRA ne l'enregistre pas. Pour nommer l'endroit où tu es et chercher un lieu, elle est envoyée au service de cartes Photon (komoot, en Allemagne) ; pour un trajet en taxi, ton départ et ton arrivée passent par le service OSRM." },
  { icon: 'chatbubble-ellipses', title: 'Tes codes SMS', text: 'Ils sont effacés au bout de 24 heures.' },
  { icon: 'warning', title: 'Tes signalements', text: "Ils sont anonymes, visibles par tous les voyageurs, et disparaissent après quelques heures. N'y écris ni nom ni numéro de téléphone." },
];

const PERMISSIONS: { kind: PermissionKind; icon: Icon; title: string; why: string }[] = [
  { kind: 'location', icon: 'navigate', title: 'Position', why: 'Pour partir de là où tu es et te prévenir avant de descendre.' },
  { kind: 'microphone', icon: 'mic', title: 'Micro', why: 'Pour parler à SIRA. Ta voix n’est jamais gardée.' },
];

const formatDate = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
};

export default function PrivacyScreen() {
  const router = useRouter();
  const [data, setData] = useState<PrivacySummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDelete, setShowDelete] = useState(false);
  const { states, request } = usePermissions();
  // Read once the stored session is back (after a reload it arrives a moment later).
  const token = useSession()?.token ?? null;

  useEffect(() => {
    if (!token) return;
    let alive = true;
    privacySummary()
      .then((summary) => { if (alive) { setData(summary); setError(null); } })
      .catch((reason) => { if (alive) setError(reason instanceof Error ? reason.message : 'Informations indisponibles pour le moment.'); });
    return () => { alive = false; };
  }, [token]);

  const permissionAction = (kind: PermissionKind, state: PermissionState) => {
    if (state === 'unknown' || state === 'denied') {
      return (
        <TouchableOpacity style={styles.smallButton} onPress={() => void request(kind)} activeOpacity={0.85}>
          <Text style={styles.smallButtonText}>Autoriser</Text>
        </TouchableOpacity>
      );
    }
    if ((state === 'granted' || state === 'blocked') && canOpenSettings) {
      return (
        <TouchableOpacity style={[styles.smallButton, styles.smallButtonOutline]} onPress={openPhoneSettings} activeOpacity={0.85}>
          <Text style={styles.smallButtonText}>Réglages</Text>
        </TouchableOpacity>
      );
    }
    return null;
  };

  const kept = data ? [
    { label: 'Numéro', value: data.phone_number },
    { label: 'Nom', value: data.full_name || 'Non renseigné' },
    { label: 'Compte créé le', value: formatDate(data.created_at) },
    { label: 'Prix partagés', value: data.fare_reports === 0 ? 'Aucun' : `${data.fare_reports}` },
  ] : [];

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <TouchableOpacity style={styles.closeButton} onPress={() => goBack(router)} activeOpacity={0.8} accessibilityLabel="Fermer"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="close" size={20} color="#000000" />
        </TouchableOpacity>
        <Text style={styles.title}>Confidentialité</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.section}>Ce que SIRA garde sur toi</Text>
        <View style={styles.card}>
          {!token && <Text style={styles.error}>Connecte-toi pour voir ce que SIRA garde sur toi.</Text>}
          {token && !data && !error && <ActivityIndicator color="#F26522" style={styles.loading} />}
          {error && <Text style={styles.error}>{error}</Text>}
          {kept.map((row, index) => (
            <View key={row.label} style={[styles.row, index > 0 && styles.rowBorder]}>
              <Text style={styles.rowLabel}>{row.label}</Text>
              <Text style={styles.rowValue}>{row.value}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.note}>C&apos;est tout ce que SIRA enregistre pour ton compte.</Text>

        <Text style={styles.section}>Ce que SIRA ne garde pas</Text>
        <View style={styles.card}>
          {NOT_KEPT.map((item, index) => (
            <View key={item.title} style={[styles.item, index > 0 && styles.rowBorder]}>
              <View style={styles.itemIcon}><Ionicons name={item.icon} size={16} color="#F26522" /></View>
              <View style={styles.itemText}>
                <Text style={styles.itemTitle}>{item.title}</Text>
                <Text style={styles.itemBody}>{item.text}</Text>
              </View>
            </View>
          ))}
        </View>

        <Text style={styles.section}>Autorisations du téléphone</Text>
        <View style={styles.card}>
          {PERMISSIONS.map((permission, index) => {
            const state = states[permission.kind];
            return (
              <View key={permission.kind} style={[styles.item, index > 0 && styles.rowBorder]}>
                <View style={styles.itemIcon}><Ionicons name={permission.icon} size={16} color="#F26522" /></View>
                <View style={styles.itemText}>
                  <View style={styles.permissionHead}>
                    <Text style={styles.itemTitle}>{permission.title}</Text>
                    <Text style={[styles.status, state === 'granted' ? styles.statusOn : styles.statusOff]}>{PERMISSION_LABELS[state]}</Text>
                  </View>
                  <Text style={styles.itemBody}>{permission.why}</Text>
                  {state === 'blocked' && !canOpenSettings && (
                    <Text style={styles.hint}>Pour changer ce choix, passe par les réglages de ton navigateur.</Text>
                  )}
                </View>
                {permissionAction(permission.kind, state)}
              </View>
            );
          })}
        </View>
        {!canOpenSettings && <Text style={styles.note}>Pour retirer une autorisation, passe par les réglages de ton navigateur.</Text>}

        {token && <Text style={styles.section}>Mon compte</Text>}
        {token && <TouchableOpacity style={[styles.card, styles.deleteRow]} onPress={() => setShowDelete(true)} activeOpacity={0.85}
          accessibilityLabel="Supprimer mon compte">
          <View style={styles.deleteIcon}><Ionicons name="trash" size={16} color="#FFFFFF" /></View>
          <View style={styles.itemText}>
            <Text style={styles.deleteTitle}>Supprimer mon compte</Text>
            <Text style={styles.itemBody}>Efface ton numéro, ton nom et tes prix partagés, pour de bon.</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#E53935" />
        </TouchableOpacity>}

        <Text style={styles.footer}>Tes données personnelles sont protégées par la loi ivoirienne n° 2013-450.</Text>
      </ScrollView>

      <DeleteAccountModal visible={showDelete} onClose={() => setShowDelete(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#000000' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  closeButton: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#F26522', justifyContent: 'center', alignItems: 'center' },
  title: { color: '#FFFFFF', fontSize: 22, fontWeight: '800' },
  content: { paddingHorizontal: 16, paddingBottom: 32 },
  section: {
    color: '#9CA3AF', fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 22, marginBottom: 8, marginLeft: 4,
  },
  card: { backgroundColor: '#1E1E1E', borderRadius: 18, paddingHorizontal: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  loading: { paddingVertical: 18 },
  error: { color: '#FCA5A5', fontSize: 14, paddingVertical: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, gap: 12 },
  rowBorder: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  rowLabel: { color: '#9CA3AF', fontSize: 14 },
  rowValue: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', flexShrink: 1, textAlign: 'right' },
  note: { color: '#9CA3AF', fontSize: 12, marginTop: 8, marginLeft: 4 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  itemIcon: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(242,101,34,0.15)', justifyContent: 'center', alignItems: 'center', alignSelf: 'flex-start',
  },
  itemText: { flex: 1 },
  itemTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', marginBottom: 3 },
  itemBody: { color: '#BBBBBB', fontSize: 13, lineHeight: 19 },
  permissionHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  status: { fontSize: 12, fontWeight: '800', marginBottom: 3 },
  statusOn: { color: '#4ADE80' },
  statusOff: { color: '#9CA3AF' },
  hint: { color: '#9CA3AF', fontSize: 12, marginTop: 4, fontStyle: 'italic' },
  smallButton: { backgroundColor: '#F26522', borderRadius: 16, paddingVertical: 7, paddingHorizontal: 12 },
  smallButtonOutline: { backgroundColor: 'transparent', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  smallButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  deleteRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderColor: 'rgba(229,57,53,0.35)' },
  deleteIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#E53935', justifyContent: 'center', alignItems: 'center' },
  deleteTitle: { color: '#EF5350', fontSize: 15, fontWeight: '800', marginBottom: 3 },
  footer: { color: '#6B7280', fontSize: 12, textAlign: 'center', marginTop: 26 },
});
