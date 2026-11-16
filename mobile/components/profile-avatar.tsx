// The traveller's picture wherever it is shown (Profil, side menu, Modifier le profil): their
// photo, the avatar they chose, or SIRA's character when they chose nothing.
import React from 'react';
import { StyleSheet, View, type ImageStyle, type StyleProp } from 'react-native';
import { Image } from 'expo-image';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AVATARS, useProfilePicture } from '@/lib/profile-picture';

export function ProfileAvatar({ size, style }: { size: number; style?: StyleProp<ImageStyle> }) {
  const picture = useProfilePicture();
  const round = { width: size, height: size, borderRadius: size / 2 };

  if (picture?.kind === 'avatar') {
    const avatar = AVATARS.find((item) => item.id === picture.id);
    if (avatar) {
      return (
        <View style={[styles.center, round, { backgroundColor: avatar.background }]} accessibilityLabel="Avatar de profil">
          <MaterialCommunityIcons name={avatar.icon as keyof typeof MaterialCommunityIcons.glyphMap} size={size * 0.58} color={avatar.color} />
        </View>
      );
    }
  }
  return (
    <Image
      source={picture?.kind === 'photo' ? { uri: picture.uri } : require('@/assets/images/sira-character-assistant.png')}
      style={[round, style]}
      contentFit="cover"
      accessibilityLabel="Photo de profil"
    />
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
