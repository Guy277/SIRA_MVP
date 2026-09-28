// Shown on every screen while SIRA talks by itself: one touch stops the sentence,
// the other button mutes SIRA (kept on this phone). WCAG 1.4.2: sound that starts
// alone can always be stopped. Gone as soon as SIRA is quiet.
import { Ionicons } from '@expo/vector-icons';
import { usePathname } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { setVoiceMode, stopSpeaking, useSpeaking } from '@/lib/voice';

// The guidance has its own speaker button, next to the map.
const OWN_VOICE_BUTTON = ['/navigation-active'];

export function SpeakingPill() {
  const speaking = useSpeaking();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  if (!speaking || OWN_VOICE_BUTTON.includes(pathname)) return null;

  return (
    <View style={[styles.layer, { top: insets.top + 8 }]} pointerEvents="box-none">
      <Animated.View entering={FadeInUp.duration(200)} exiting={FadeOutUp.duration(200)} style={styles.pill}>
        <TouchableOpacity
          style={styles.stop}
          onPress={stopSpeaking}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Arrêter la voix de SIRA"
        >
          <Ionicons name="volume-high" size={16} color="#F26522" />
          <Text style={styles.text}>SIRA parle</Text>
          <View style={styles.stopIcon}>
            <Ionicons name="stop" size={11} color="#FFFFFF" />
          </View>
        </TouchableOpacity>
        <View style={styles.separator} />
        <TouchableOpacity
          style={styles.mute}
          onPress={() => setVoiceMode('off')}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Couper la voix de SIRA"
        >
          <Ionicons name="volume-mute" size={17} color="#FFFFFF" />
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 1000,
    elevation: 20,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(18, 18, 18, 0.92)',
    borderRadius: 22,
    paddingHorizontal: 4,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
  },
  stop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 9,
    paddingLeft: 10,
    paddingRight: 8,
  },
  text: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  stopIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#F26522',
    justifyContent: 'center',
    alignItems: 'center',
  },
  separator: {
    width: 1,
    height: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  mute: {
    paddingVertical: 9,
    paddingHorizontal: 11,
  },
});
