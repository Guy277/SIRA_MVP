// The traveller's profile picture: a photo (camera or gallery) or one of SIRA's avatars, kept on
// this phone only. Never sent to SIRA's servers (they keep no picture), so it does not follow
// the traveller to another phone. Without a choice, SIRA's character stands in.
import { File, Paths } from 'expo-file-system';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

export type ProfilePicture = { kind: 'photo'; uri: string } | { kind: 'avatar'; id: string } | null;

// Avatars until the designer's illustrations come: an icon on a SIRA colour.
export const AVATARS: { id: string; icon: string; background: string; color: string }[] = [
  { id: 'homme', icon: 'face-man', background: '#F26522', color: '#FFFFFF' },
  { id: 'femme', icon: 'face-woman', background: '#111111', color: '#F26522' },
  { id: 'voyageur', icon: 'walk', background: '#333333', color: '#FFFFFF' },
  { id: 'bus', icon: 'bus-side', background: '#F26522', color: '#111111' },
  { id: 'woro', icon: 'car-side', background: '#111111', color: '#FFFFFF' },
  { id: 'moto', icon: 'motorbike', background: '#333333', color: '#F26522' },
];

const KEY = 'sira-photo-profil';
// A profile picture is shown at most ~120 pt wide: 320 px keeps it sharp and small to store.
const PHOTO_SIZE = 320;
let picture: ProfilePicture = null;
let loaded = false;
const listeners = new Set<() => void>();
const settingsFile = () => new File(Paths.document, `${KEY}.json`);

function publish(next: ProfilePicture) {
  picture = next;
  listeners.forEach((listener) => listener());
  const text = JSON.stringify(next);
  try {
    if (Platform.OS === 'web') window.localStorage.setItem(KEY, text);
    else void settingsFile().write(text).catch(() => {});
  } catch { /* stockage plein ou indisponible : gardée jusqu'à la fermeture de l'appli */ }
}

export async function loadProfilePicture() {
  if (loaded) return;
  loaded = true;
  try {
    let text: string | null = null;
    if (Platform.OS === 'web') text = window.localStorage.getItem(KEY);
    else if (settingsFile().exists) text = await settingsFile().text();
    const value = text ? (JSON.parse(text) as ProfilePicture) : null;
    if (value && (value.kind === 'photo' ? typeof value.uri === 'string' : AVATARS.some((avatar) => avatar.id === value.id))) {
      picture = value;
      listeners.forEach((listener) => listener());
    }
  } catch { /* illisible : la mascotte SIRA reste */ }
}

export const chooseAvatar = (id: string) => publish({ kind: 'avatar', id });
export const clearProfilePicture = () => publish(null);

export function useProfilePicture() {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    () => picture,
    () => picture,
  );
}

// On the web a photo is kept as a small JPEG in the browser: shrunk to PHOTO_SIZE first, a phone
// photo being far bigger than the browser's storage.
async function shrinkForWeb(uri: string) {
  const image = new window.Image();
  image.src = uri;
  await image.decode();
  const side = Math.min(image.width, image.height);
  const canvas = document.createElement('canvas');
  canvas.width = PHOTO_SIZE;
  canvas.height = PHOTO_SIZE;
  // Centred square, as the camera's own crop does on a phone.
  canvas.getContext('2d')?.drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, PHOTO_SIZE, PHOTO_SIZE);
  return canvas.toDataURL('image/jpeg', 0.8);
}

// On a phone the photo is copied into SIRA's own files (the picker's copy may be cleaned away).
async function keepOnPhone(uri: string) {
  const source = new File(uri);
  const target = new File(Paths.document, `${KEY}-${Date.now()}.jpg`);
  source.copy(target);
  return target.uri;
}

export type PickResult = 'done' | 'cancelled' | 'refused' | 'failed';

// « Caméra » or « Galerie »: the phone asks for permission the first time; a square crop.
export async function pickProfilePhoto(source: 'camera' | 'gallery'): Promise<PickResult> {
  try {
    if (Platform.OS !== 'web') {
      const permission = source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) return 'refused';
    }
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7 };
    const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    if (result.canceled || !result.assets?.[0]) return 'cancelled';
    const uri = result.assets[0].uri;
    const kept = Platform.OS === 'web' ? await shrinkForWeb(uri) : await keepOnPhone(uri);
    const previous = picture;
    publish({ kind: 'photo', uri: kept });
    // The photo it replaces is not kept on the phone.
    if (Platform.OS !== 'web' && previous?.kind === 'photo') {
      try { new File(previous.uri).delete(); } catch { /* déjà effacée */ }
    }
    return 'done';
  } catch {
    return 'failed';
  }
}
