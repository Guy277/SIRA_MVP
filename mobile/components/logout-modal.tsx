import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Modal,
  SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';

interface LogoutModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm?: () => void;
}

import { logoutUser } from '@/hooks/use-auth';
import { setSession } from '@/lib/session';

export function LogoutModal({ visible, onClose, onConfirm }: LogoutModalProps) {
  const router = useRouter();

  const handleConfirmLogout = () => {
    logoutUser();
    setSession(null);
    onClose();
    if (onConfirm) {
      onConfirm();
    } else {
      router.replace('/onboarding');
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={false}
      onRequestClose={onClose}
    >
      {/* Solid Single-Color Background (#000000) */}
      <View style={styles.modalContainer}>
        <StatusBar style="light" />

        <SafeAreaView style={styles.safeArea}>
          {/* Header Bar with Back Button */}
          <View style={styles.headerContainer}>
            <TouchableOpacity
              style={styles.backButtonCircle}
              onPress={onClose}
              activeOpacity={0.8}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="arrow-back" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          {/* Main Content Area - Clean & Centered */}
          <View style={styles.contentBody}>
            <View style={styles.confirmationCard}>
              <Text style={styles.questionText}>
                ÊTES-VOUS SÛR DE{'\n'}VOULOIR VOUS{'\n'}DÉCONNECTER ?
              </Text>

              <View style={styles.buttonsRow}>
                <TouchableOpacity
                  style={styles.actionPillButton}
                  onPress={handleConfirmLogout}
                  activeOpacity={0.85}
                >
                  <Text style={styles.pillText}>OUI</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.actionPillButton}
                  onPress={onClose}
                  activeOpacity={0.85}
                >
                  <Text style={styles.pillText}>NON</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  safeArea: {
    flex: 1,
  },
  headerContainer: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButtonCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F26522',
    justifyContent: 'center',
    alignItems: 'center',
  },
  contentBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  confirmationCard: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#1E1E1E',
    borderRadius: 22,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
  questionText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 26,
    letterSpacing: 0.5,
  },
  buttonsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginTop: 24,
  },
  actionPillButton: {
    backgroundColor: '#F26522',
    paddingHorizontal: 32,
    paddingVertical: 10,
    borderRadius: 20,
    minWidth: 90,
    alignItems: 'center',
  },
  pillText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
