// One short sentence at a time instead of a paragraph: the phrases take
// turns with a cross-fade. Reanimated skips the motion when the phone asks
// for reduced animations.
import React, { useEffect, useState } from 'react';
import { StyleSheet, View, type StyleProp, type TextStyle } from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';

type Props = { phrases: string[]; style?: StyleProp<TextStyle>; intervalMs?: number; lines?: number };

export function RotatingText({ phrases, style, intervalMs = 3200, lines = 2 }: Props) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (phrases.length < 2) return;
    const timer = setInterval(() => setIndex((current) => (current + 1) % phrases.length), intervalMs);
    return () => clearInterval(timer);
  }, [phrases.length, intervalMs]);

  const lineHeight = StyleSheet.flatten(style)?.lineHeight ?? 20;
  return (
    // Fixed height so the layout below does not jump between phrases.
    <View style={[styles.frame, { height: lineHeight * lines }]} accessibilityLiveRegion="polite">
      <Animated.Text
        key={index}
        entering={FadeInDown.duration(350)}
        exiting={FadeOutUp.duration(250)}
        style={[style, styles.phrase]}
        numberOfLines={lines}
      >
        {phrases[index % phrases.length]}
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: '100%', justifyContent: 'center', overflow: 'hidden' },
  phrase: { position: 'absolute', left: 0, right: 0 },
});
