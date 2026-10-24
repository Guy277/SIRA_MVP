// « Mes lieux »: Maison, Travail and the places the traveller names (« Chez Maman »,
// « École »…). Add, rename, change the address or delete; everything stays on the phone.
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PlacePickerModal } from '@/components/place-picker-modal';
import { Text, TextInput } from '@/components/sira-text';
import { goBack } from '@/lib/navigation';
import { notify } from '@/lib/notify';
import {
  addPlace, FIXED_PLACES, MAX_CUSTOM_PLACES, MAX_LABEL_LENGTH, PLACE_ICON_LABELS, PLACE_ICONS, removePlace, setPlaceAddress, updatePlace,
  useSavedPlaces, type PlaceAddress, type SavedPlace,
} from '@/lib/saved-places';

type IconName = keyof typeof Ionicons.glyphMap;
type Editor = { id: string | null; fixed: boolean; label: string; icon: string; address: PlaceAddress | null; error: string | null };

const addressOf = (editor: Pick<Editor, 'id' | 'label'>) =>
  editor.id === 'home' ? 'ta maison' : editor.id === 'work' ? 'ton travail' : editor.label.trim() ? `« ${editor.label.trim()} »` : 'ce lieu';

export default function MyPlacesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ add?: string }>();
  const places = useSavedPlaces();
  const customs = places.filter((place) => place.kind === 'custom');
  const [editor, setEditor] = useState<Editor | null>(() => (params.add
    ? { id: null, fixed: false, label: '', icon: PLACE_ICONS[0], address: null, error: null }
    : null));
  const [picking, setPicking] = useState(false);

  const slots = [
    places.find((place) => place.id === 'home') ?? { ...FIXED_PLACES.home, kind: 'home' as const, title: '', subtitle: '' },
    places.find((place) => place.id === 'work') ?? { ...FIXED_PLACES.work, kind: 'work' as const, title: '', subtitle: '' },
    ...customs,
  ];

  const open = (place: (typeof slots)[number]) => setEditor({
    id: place.id,
    fixed: place.kind !== 'custom',
    label: place.label,
    icon: place.icon,
    address: place.title ? { title: place.title, subtitle: place.subtitle, latitude: (place as SavedPlace).latitude, longitude: (place as SavedPlace).longitude } : null,
    error: null,
  });

  const save = () => {
    if (!editor) return;
    if (!editor.address) {
      setEditor({ ...editor, error: `Choisis l’adresse de ${addressOf(editor)}.` });
      return;
    }
    let error: string | null = null;
    if (editor.fixed && editor.id) setPlaceAddress(editor.id, editor.address);
    else if (!editor.id) error = addPlace(editor.label, editor.icon, editor.address);
    else {
      error = updatePlace(editor.id, { label: editor.label, icon: editor.icon });
      if (!error) setPlaceAddress(editor.id, editor.address);
    }
    if (error) setEditor({ ...editor, error });
    else setEditor(null);
  };

  const remove = () => {
    if (!editor?.id) return;
    const { id, fixed } = editor;
    const label = fixed ? `l’adresse de ${addressOf(editor)}` : `« ${editor.label} »`;
    notify(fixed ? 'Retirer l’adresse ?' : 'Supprimer ce lieu ?', `SIRA oubliera ${label} sur ce téléphone.`, [
      { text: fixed ? 'Retirer' : 'Supprimer', style: 'destructive', onPress: () => { if (fixed) setPlaceAddress(id, null); else removePlace(id); setEditor(null); } },
      { text: 'Annuler', style: 'cancel', onPress: () => {} },
    ]);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <TouchableOpacity style={styles.closeButton} onPress={() => goBack(router)} activeOpacity={0.8} accessibilityLabel="Fermer"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="close" size={20} color="#000000" />
        </TouchableOpacity>
        <Text style={styles.title}>Mes lieux</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.intro}>
          Tes lieux en un toucher dans « On va où ? » et sur l’accueil. Dis aussi à SIRA « emmène-moi à la maison »
          ou le nom d’un de tes lieux : il comprend.
        </Text>

        <View style={styles.card}>
          {slots.map((place, index) => (
            <TouchableOpacity
              key={place.id}
              style={[styles.row, index > 0 && styles.rowBorder]}
              onPress={() => open(place)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={place.title ? `${place.label} : ${place.title}. Modifier.` : `${place.label} : ajouter une adresse`}
            >
              <View style={[styles.rowIcon, !place.title && styles.rowIconEmpty]}>
                <Ionicons name={place.icon as IconName} size={16} color={place.title ? '#FFFFFF' : '#F26522'} />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowLabel}>{place.label}</Text>
                <Text style={[styles.rowAddress, !place.title && styles.rowAddressEmpty]} numberOfLines={1}>
                  {place.title || 'Ajouter une adresse'}
                </Text>
              </View>
              <Ionicons name="create-outline" size={18} color="#9CA3AF" />
            </TouchableOpacity>
          ))}
        </View>

        {customs.length < MAX_CUSTOM_PLACES ? (
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => setEditor({ id: null, fixed: false, label: '', icon: PLACE_ICONS[0], address: null, error: null })}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
            <Ionicons name="add-circle" size={20} color="#FFFFFF" />
            <Text style={styles.addButtonText}>Ajouter un lieu</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.note}>{MAX_CUSTOM_PLACES} lieux au plus : supprime-en un pour en ajouter un autre.</Text>
        )}

        <Text style={styles.note}>
          Tes lieux restent sur ce téléphone. Ils partent seulement avec une question à SIRA, pour la comprendre,
          et ne sont pas gardés.
        </Text>
      </ScrollView>

      {/* Add or change a place */}
      {editor && (
        <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>
              {editor.fixed ? editor.label : editor.id ? 'Modifier le lieu' : 'Nouveau lieu'}
            </Text>

            {!editor.fixed && (
              <>
                <Text style={styles.fieldLabel}>Nom</Text>
                <TextInput
                  style={styles.input}
                  value={editor.label}
                  onChangeText={(label) => setEditor({ ...editor, label, error: null })}
                  placeholder="Chez Maman, École, Marché…"
                  placeholderTextColor="#6B7280"
                  maxLength={MAX_LABEL_LENGTH}
                  autoFocus={!editor.id}
                  accessibilityLabel="Nom du lieu"
                />
                <View style={styles.icons}>
                  {PLACE_ICONS.map((icon) => (
                    <TouchableOpacity
                      key={icon}
                      style={[styles.iconChoice, editor.icon === icon && styles.iconChoiceOn]}
                      onPress={() => setEditor({ ...editor, icon })}
                      accessibilityRole="button"
                      accessibilityState={{ selected: editor.icon === icon }}
                      accessibilityLabel={`Icône ${PLACE_ICON_LABELS[icon]}`}
                    >
                      <Ionicons name={icon as IconName} size={18} color={editor.icon === icon ? '#FFFFFF' : '#F26522'} />
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            <Text style={styles.fieldLabel}>Adresse</Text>
            <TouchableOpacity style={styles.addressRow} onPress={() => setPicking(true)} activeOpacity={0.85} accessibilityRole="button">
              <Ionicons name="location-sharp" size={18} color="#F26522" />
              <View style={styles.rowText}>
                <Text style={styles.addressTitle} numberOfLines={1}>{editor.address?.title ?? 'Choisir l’adresse'}</Text>
                {editor.address?.subtitle ? <Text style={styles.rowAddress} numberOfLines={1}>{editor.address.subtitle}</Text> : null}
              </View>
              <Text style={styles.link}>{editor.address ? 'Changer' : 'Choisir'}</Text>
            </TouchableOpacity>

            {editor.error && <Text style={styles.error}>{editor.error}</Text>}

            <View style={styles.actions}>
              <TouchableOpacity style={styles.primary} onPress={save} activeOpacity={0.85} accessibilityRole="button">
                <Text style={styles.primaryText}>Enregistrer</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondary} onPress={() => setEditor(null)} activeOpacity={0.85} accessibilityRole="button">
                <Text style={styles.secondaryText}>Annuler</Text>
              </TouchableOpacity>
            </View>
            {editor.id && (!editor.fixed || places.some((place) => place.id === editor.id)) && (
              <TouchableOpacity onPress={remove} style={styles.deleteLink} accessibilityRole="button">
                <Ionicons name="trash-outline" size={16} color="#EF5350" />
                <Text style={styles.deleteText}>{editor.fixed ? 'Retirer l’adresse' : 'Supprimer ce lieu'}</Text>
              </TouchableOpacity>
            )}
          </View>
        </KeyboardAvoidingView>
      )}

      <PlacePickerModal
        visible={picking}
        prompt={editor ? `Adresse de ${addressOf(editor)}` : 'Adresse'}
        onPick={(address) => setEditor((current) => (current ? { ...current, address, error: null } : current))}
        onClose={() => setPicking(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#000000' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  closeButton: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#F26522', justifyContent: 'center', alignItems: 'center' },
  title: { color: '#FFFFFF', fontSize: 22, fontWeight: '800' },
  content: { paddingHorizontal: 16, paddingBottom: 32 },
  intro: { color: '#BBBBBB', fontSize: 14, lineHeight: 20, marginTop: 8, marginBottom: 16, marginHorizontal: 4 },
  card: { backgroundColor: '#1E1E1E', borderRadius: 18, paddingHorizontal: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  rowBorder: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  rowIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#F26522', justifyContent: 'center', alignItems: 'center' },
  rowIconEmpty: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#F26522' },
  rowText: { flex: 1 },
  rowLabel: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', marginBottom: 2 },
  rowAddress: { color: '#9CA3AF', fontSize: 13 },
  rowAddressEmpty: { color: '#F26522' },
  addButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#F26522',
    borderRadius: 24, paddingVertical: 14, marginTop: 16,
  },
  addButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  note: { color: '#9CA3AF', fontSize: 12, lineHeight: 18, marginTop: 14, marginHorizontal: 4 },
  overlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#1E1E1E', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 28 },
  sheetTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '800', marginBottom: 12 },
  fieldLabel: { color: '#9CA3AF', fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 10, marginBottom: 6 },
  input: {
    backgroundColor: '#2A2A2A', color: '#FFFFFF', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15,
  },
  icons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  iconChoice: {
    width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: 'rgba(242,101,34,0.5)', justifyContent: 'center', alignItems: 'center',
  },
  iconChoiceOn: { backgroundColor: '#F26522', borderColor: '#F26522' },
  addressRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#2A2A2A', borderRadius: 14, padding: 12 },
  addressTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  link: { color: '#F26522', fontSize: 14, fontWeight: '800' },
  error: { color: '#FCA5A5', fontSize: 13, marginTop: 10 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  primary: { flex: 1, backgroundColor: '#F26522', borderRadius: 22, paddingVertical: 13, alignItems: 'center' },
  primaryText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  secondary: { flex: 1, borderRadius: 22, paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  secondaryText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  deleteLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 16 },
  deleteText: { color: '#EF5350', fontSize: 14, fontWeight: '700' },
});
