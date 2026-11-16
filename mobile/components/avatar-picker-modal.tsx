// « Utiliser un avatar »: SIRA's avatars in a grid, in the dark style of « Photo de profil ».
// Touching one makes it the profile picture; SIRA's character can be taken back too.
import React from 'react';
import { Modal, Platform, Pressable, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Text } from '@/components/sira-text';
import { AVATARS, chooseAvatar, clearProfilePicture, useProfilePicture } from '@/lib/profile-picture';

export function AvatarPickerModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const picture = useProfilePicture();
  const chosenId = picture?.kind === 'avatar' ? picture.id : null;
  const pick = (choose: () => void) => { choose(); onClose(); };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.card} onPress={(event) => event.stopPropagation()}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>CHOISIS UN AVATAR</Text>
            <TouchableOpacity style={styles.close} onPress={onClose} hitSlop={10} accessibilityLabel="Fermer">
              <Ionicons name="close" size={16} color="#000000" />
            </TouchableOpacity>
          </View>

          <View style={styles.grid}>
            {AVATARS.map((avatar) => (
              <TouchableOpacity
                key={avatar.id}
                style={[styles.avatar, { backgroundColor: avatar.background }, chosenId === avatar.id && styles.chosen]}
                onPress={() => pick(() => chooseAvatar(avatar.id))}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityState={{ selected: chosenId === avatar.id }}
                accessibilityLabel={`Avatar ${avatar.id}`}
              >
                <MaterialCommunityIcons name={avatar.icon as keyof typeof MaterialCommunityIcons.glyphMap} size={38} color={avatar.color} />
              </TouchableOpacity>
            ))}
          </View>

          {/* Back to SIRA's character, the picture of a traveller who chose nothing. */}
          <TouchableOpacity style={styles.mascotRow} onPress={() => pick(clearProfilePicture)} activeOpacity={0.7} accessibilityRole="button">
            <Image source={require('@/assets/images/sira-character-assistant.png')} style={[styles.mascot, !picture && styles.chosen]} contentFit="cover" />
            <Text style={styles.mascotText}>Garder la mascotte SIRA</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const AVATAR = 68;

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
  },
  card: {
    width: '100%',
    maxWidth: 402,
    backgroundColor: '#050505',
    borderRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 22,
    borderWidth: 1,
    borderColor: '#1C1C1E',
  },
  headerRow: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.8,
  },
  close: {
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
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 16,
  },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'transparent',
  },
  // The picture in use: an orange ring.
  chosen: {
    borderColor: '#F26522',
  },
  mascotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 20,
  },
  mascot: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  mascotText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
