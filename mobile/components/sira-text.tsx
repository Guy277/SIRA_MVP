// Text and TextInput of SIRA: Montserrat, the font of the mockups, everywhere.
// A custom font has one file per weight and Android does not pick the bold file
// from `fontWeight`, so each weight is turned into its own Montserrat file here.
// Screens keep writing `fontWeight: '800'` as usual.
import { createContext, forwardRef, useContext } from 'react';
import {
  Platform,
  StyleSheet,
  Text as NativeText,
  TextInput as NativeTextInput,
  type StyleProp,
  type TextProps,
  type TextInputProps,
  type TextStyle,
} from 'react-native';
import Animated from 'react-native-reanimated';
import {
  Montserrat_400Regular,
  Montserrat_500Medium,
  Montserrat_600SemiBold,
  Montserrat_700Bold,
  Montserrat_800ExtraBold,
  Montserrat_900Black,
} from '@expo-google-fonts/montserrat';

// Loaded once by the root layout (useFonts).
export const MONTSERRAT_FONTS = {
  'Montserrat-Regular': Montserrat_400Regular,
  'Montserrat-Medium': Montserrat_500Medium,
  'Montserrat-SemiBold': Montserrat_600SemiBold,
  'Montserrat-Bold': Montserrat_700Bold,
  'Montserrat-ExtraBold': Montserrat_800ExtraBold,
  'Montserrat-Black': Montserrat_900Black,
};

// On the web the browser downloads a font file only when a text first uses it: the first
// title of each weight then showed in a serif font while it downloaded. Started at launch.
export async function loadWebFonts() {
  if (Platform.OS !== 'web' || typeof document === 'undefined' || !document.fonts) return;
  await Promise.all(Object.keys(MONTSERRAT_FONTS).map((family) => document.fonts.load(`16px "${family}"`))).catch(() => {});
}

const FAMILY_BY_WEIGHT: Record<string, keyof typeof MONTSERRAT_FONTS> = {
  '100': 'Montserrat-Regular', '200': 'Montserrat-Regular', '300': 'Montserrat-Regular',
  '400': 'Montserrat-Regular', normal: 'Montserrat-Regular',
  '500': 'Montserrat-Medium',
  '600': 'Montserrat-SemiBold',
  '700': 'Montserrat-Bold', bold: 'Montserrat-Bold',
  '800': 'Montserrat-ExtraBold',
  '900': 'Montserrat-Black',
};

export function montserratFamily(weight: TextStyle['fontWeight']) {
  return FAMILY_BY_WEIGHT[String(weight ?? '400')] ?? 'Montserrat-Regular';
}

// A nested <Text> without its own weight inherits its parent's font, as in React Native.
const InsideText = createContext(false);

function withFont(style: StyleProp<TextStyle>, inherits: boolean): StyleProp<TextStyle> {
  const flat = StyleSheet.flatten(style) ?? {};
  if (flat.fontFamily || (inherits && flat.fontWeight == null)) return style;
  // The weight is in the file: a weight on top would make Android fake a bolder font.
  return [style, { fontFamily: montserratFamily(flat.fontWeight), fontWeight: 'normal' }];
}

export const Text = forwardRef<NativeText, TextProps>(function Text({ style, ...props }, ref) {
  const nested = useContext(InsideText);
  const text = <NativeText ref={ref} {...props} style={withFont(style, nested)} />;
  return nested ? text : <InsideText.Provider value>{text}</InsideText.Provider>;
});

// Reanimated's Animated.Text wraps React Native's own Text: this one keeps Montserrat.
export const AnimatedText = Animated.createAnimatedComponent(Text);

export const TextInput = forwardRef<NativeTextInput, TextInputProps>(function TextInput({ style, ...props }, ref) {
  return <NativeTextInput ref={ref} {...props} style={withFont(style, false)} />;
});
