// « Photo de profil » (Profil and Modifier le profil): the phone's camera, its photos, or one of
// SIRA's avatars. The picture is kept on this phone (lib/profile-picture.ts).
import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  TouchableOpacity,
  Modal,
  Platform,
  TouchableWithoutFeedback,
} from 'react-native';
import { Text } from '@/components/sira-text';
import { Ionicons } from '@expo/vector-icons';
import { AvatarPickerModal } from '@/components/avatar-picker-modal';
import { pickProfilePhoto } from '@/lib/profile-picture';
import { notify } from '@/lib/notify';

interface ProfilePhotoModalProps {
  visible: boolean;
  onClose: () => void;
}

export function ProfilePhotoModal({ visible, onClose }: ProfilePhotoModalProps) {
  const [showAvatars, setShowAvatars] = useState(false);

  // Started in the same touch as the button: browsers only open the camera or the photos then.
  const pickPhoto = (source: 'camera' | 'gallery') => {
    onClose();
    void pickProfilePhoto(source).then((result) => {
      if (result === 'refused') {
        notify(
          source === 'camera' ? 'Appareil photo refusé' : 'Photos refusées',
          `Autorise ${source === 'camera' ? 'l’appareil photo' : 'l’accès aux photos'} pour SIRA dans les réglages du téléphone, puis réessaie.`,
        );
      } else if (result === 'failed') {
        notify('Photo impossible', 'La photo n’a pas pu être prise ou lue. Réessaie, ou choisis un avatar.');
      }
    });
  };
  const openAvatars = () => {
    onClose();
    setShowAvatars(true);
  };

  return (
    <>
    <AvatarPickerModal visible={showAvatars} onClose={() => setShowAvatars(false)} />
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlayContainer}>
          <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalCard}>
              {/* Header with Title & Close Button */}
              <View style={styles.headerRow}>
                <Text style={styles.titleText}>PHOTO DE PROFIL</Text>
                <TouchableOpacity
                  style={styles.closeButton}
                  onPress={onClose}
                  activeOpacity={0.8}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="close" size={16} color="#000000" />
                </TouchableOpacity>
              </View>

              {/* Options List */}
              <View style={styles.optionsList}>
                {/* 1. Caméra */}
                <TouchableOpacity
                  style={styles.optionRow}
                  onPress={() => pickPhoto('camera')}
                  accessibilityRole="button"
                  activeOpacity={0.7}
                >
                  <View style={styles.iconBadge}>
                    <Ionicons name="camera" size={20} color="#F26522" />
                  </View>
                  <Text style={styles.optionLabel}>Caméra</Text>
                </TouchableOpacity>

                {/* 2. Galerie */}
                <TouchableOpacity
                  style={styles.optionRow}
                  onPress={() => pickPhoto('gallery')}
                  accessibilityRole="button"
                  activeOpacity={0.7}
                >
                  <View style={styles.iconBadge}>
                    <Ionicons name="image" size={20} color="#F26522" />
                  </View>
                  <Text style={styles.optionLabel}>Galerie</Text>
                </TouchableOpacity>

                {/* 3. Utiliser un avatar */}
                <TouchableOpacity
                  style={styles.optionRow}
                  onPress={openAvatars}
                  accessibilityRole="button"
                  activeOpacity={0.7}
                >
                  <View style={styles.iconBadge}>
                    {/* Custom Woman/Hijab Avatar Silhouette Icon */}
                    <View style={styles.avatarSilhouetteOuter}>
                      <View style={styles.avatarSilhouetteInner} />
                    </View>
                  </View>
                  <Text style={styles.optionLabel}>Utiliser un avatar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  overlayContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 402,
    backgroundColor: '#050505',
    borderRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 24,
    borderWidth: 1,
    borderColor: '#1C1C1E',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginBottom: 20,
  },
  titleText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.8,
    textAlign: 'center',
  },
  closeButton: {
    position: 'absolute',
    right: 0,
    top: -2,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#F26522',
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionsList: {
    gap: 16,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
  },
  iconBadge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#242426',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  optionLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  avatarSilhouetteOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#F26522',
    justifyContent: 'flex-end',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatarSilhouetteInner: {
    width: 14,
    height: 12,
    borderTopLeftRadius: 7,
    borderTopRightRadius: 7,
    backgroundColor: '#242426',
  },
});
