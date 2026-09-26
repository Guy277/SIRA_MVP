// Text that writes itself, used for SIRA's first words of the day. Shown in
// full at once when `play` is false or the phone reduces animations.
import React, { useEffect, useState } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

type Props = { text: string; play: boolean; style?: StyleProp<TextStyle>; delayMs?: number; charMs?: number };

export function TypewriterText({ text, play, style, delayMs = 0, charMs = 32 }: Props) {
  const reduced = useReducedMotion();
  const animate = play && !reduced;
  const [shown, setShown] = useState(animate ? 0 : text.length);

  useEffect(() => {
    if (!animate) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const start = setTimeout(() => {
      timer = setInterval(() => setShown((count) => {
        if (count >= text.length && timer) clearInterval(timer);
        return Math.min(count + 1, text.length);
      }), charMs);
    }, delayMs);
    return () => { clearTimeout(start); if (timer) clearInterval(timer); };
  }, [animate, text, delayMs, charMs]);

  // The full sentence is read by screen readers from the start.
  return <Text style={style} accessibilityLabel={text}>{text.slice(0, animate ? shown : text.length)}</Text>;
}
