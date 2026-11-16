// SIRA's on/off switch, as in the design: light grey when off, SIRA orange when on, a white
// knob sliding from one side to the other. The same on iPhone, Android and the web (React
// Native's own Switch changes size and shape from one to the other).
import React, { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, interpolateColor, ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

const TRACK_WIDTH = 52;
const TRACK_HEIGHT = 30;
const KNOB = 24;
const PADDING = (TRACK_HEIGHT - KNOB) / 2;
const OFF_COLOR = '#D9D9D9';
const ON_COLOR = '#F26522';

type Props = {
  value: boolean;
  onValueChange?: (value: boolean) => void;
  disabled?: boolean;
  // What the switch turns on (« Accès à la position »), read by screen readers.
  accessibilityLabel?: string;
};

export function SiraSwitch({ value, onValueChange, disabled = false, accessibilityLabel }: Props) {
  const progress = useSharedValue(value ? 1 : 0);
  useEffect(() => {
    progress.value = withTiming(value ? 1 : 0, { duration: 180, easing: Easing.out(Easing.quad), reduceMotion: ReduceMotion.System });
  }, [value, progress]);

  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], [OFF_COLOR, ON_COLOR]),
  }));
  const knobStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * (TRACK_WIDTH - KNOB - PADDING * 2) }],
  }));

  return (
    <Pressable
      onPress={() => onValueChange?.(!value)}
      disabled={disabled}
      hitSlop={10}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      // The web reads the state from aria-* (accessibilityState alone does not reach it).
      aria-checked={value}
      aria-disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      style={disabled ? styles.disabled : undefined}
    >
      <Animated.View style={[styles.track, trackStyle]}>
        <Animated.View style={[styles.knob, knobStyle]}>
          <View />
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    width: TRACK_WIDTH,
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    padding: PADDING,
    justifyContent: 'center',
  },
  knob: {
    width: KNOB,
    height: KNOB,
    borderRadius: KNOB / 2,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  // Not available yet (notifications to come): dimmed, still readable.
  disabled: {
    opacity: 0.55,
  },
});
