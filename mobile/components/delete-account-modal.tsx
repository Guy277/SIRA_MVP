// « Supprimer mon compte » : real deletion on the server (account, shared
// fares, SMS codes), then nothing about the traveller stays on the phone.
// Without a valid session (expired, or refused by the server) nothing can be
// deleted: the traveller is asked to sign in again first.
import React, { useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { deleteAccount } from '@/lib/sira-api';
import { currentToken, forgetTraveller, useSession } from '@/lib/session';

type Props = { visible: boolean; onClose: () => void };

export function DeleteAccountModal({ visible, onClose }: Props) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signedIn = Boolean(useSession());

  const close = () => {
    if (deleting) return;
    setError(null);
    onClose();
  };

  const confirm = async () => {
    setDeleting(true);
    setError(null);
    try {
      await deleteAccount();
    } catch (reason) {
      // A refused session is cleared by the API client: the « reconnecte-toi » view then shows.
      if (currentToken()) setError(reason instanceof Error ? reason.message : 'Suppression impossible pour le moment. Réessaie dans un instant.');
      setDeleting(false);
      return;
    }
    setDeleting(false);
    onClose();
    forgetTraveller();
    router.replace('/onboarding');
  };

  const signInAgain = () => {
    setError(null);
    onClose();
    router.push('/login');
  };

  return (
    <Modal visible={visible} animationType="fade" transparent={false} onRequestClose={close}>
      <View style={styles.container}>
        <StatusBar style="light" />
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.backButton} onPress={close} activeOpacity={0.8} accessibilityLabel="Annuler"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="arrow-back" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          <View style={styles.body}>
            <View style={styles.card}>
              <View style={styles.icon}><Ionicons name="trash" size={26} color="#FFFFFF" /></View>
              {signedIn ? (
                <>
                  <Text style={styles.title}>Supprimer ton compte ?</Text>
                  <Text style={styles.text}>C&apos;est définitif.</Text>
                  {error && <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text>}
                  <TouchableOpacity style={styles.deleteButton} onPress={confirm} disabled={deleting} activeOpacity={0.85}
                    accessibilityLabel="Oui, supprimer mon compte">
                    {deleting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.deleteText}>Oui, supprimer</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.cancelButton} onPress={close} disabled={deleting} activeOpacity={0.85}>
                    <Text style={styles.cancelText}>Non, garder mon compte</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={styles.title}>Reconnecte-toi d&apos;abord</Text>
                  <Text style={styles.text}>Ta session a expiré. Pour supprimer ton compte, reconnecte-toi avec ton numéro.</Text>
                  <TouchableOpacity style={styles.signInButton} onPress={signInAgain} activeOpacity={0.85}>
                    <Text style={styles.deleteText}>Me reconnecter</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.cancelButton} onPress={close} activeOpacity={0.85}>
                    <Text style={styles.cancelText}>Annuler</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  safeArea: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 10 },
  backButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F26522', justifyContent: 'center', alignItems: 'center' },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  card: {
    width: '100%', maxWidth: 340, backgroundColor: '#1E1E1E', borderRadius: 22, paddingVertical: 28, paddingHorizontal: 24,
    alignItems: 'center', borderWidth: 1, borderColor: '#2A2A2A',
  },
  icon: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#E53935', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  title: { color: '#FFFFFF', fontSize: 20, fontWeight: '800', textAlign: 'center', marginBottom: 10 },
  text: { color: '#CCCCCC', fontSize: 15, lineHeight: 22, textAlign: 'center', marginBottom: 20 },
  error: { color: '#FCA5A5', fontSize: 14, textAlign: 'center', marginBottom: 14 },
  deleteButton: { width: '100%', backgroundColor: '#E53935', borderRadius: 24, paddingVertical: 14, alignItems: 'center', marginBottom: 10 },
  deleteText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  signInButton: { width: '100%', backgroundColor: '#F26522', borderRadius: 24, paddingVertical: 14, alignItems: 'center', marginBottom: 10 },
  cancelButton: { width: '100%', borderRadius: 24, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  cancelText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
