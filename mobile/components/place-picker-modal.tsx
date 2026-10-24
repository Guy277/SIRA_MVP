// The address of one of the traveller's places (« Mes lieux »): picked from the search,
// on the map, or the current position. Only places with known coordinates are kept.
import React from 'react';
import { KeyboardAvoidingView, Modal, Platform, SafeAreaView, StyleSheet } from 'react-native';
import { LocationSuggestionsList } from '@/components/location-suggestions-list';
import { MapLocationPicker } from '@/components/map-location-picker';
import { ensureCurrentPlace, knownPlace, useCurrentPlace } from '@/lib/places';
import { notify } from '@/lib/notify';
import type { PlaceAddress } from '@/lib/saved-places';

type Props = {
  visible: boolean;
  // « Adresse de ta maison », « Adresse de « Chez Maman » ».
  prompt: string;
  onPick: (address: PlaceAddress) => void;
  onClose: () => void;
};

export function PlacePickerModal({ visible, prompt, onPick, onClose }: Props) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      {visible && <PickerBody prompt={prompt} onPick={onPick} onClose={onClose} />}
    </Modal>
  );
}

function PickerBody({ prompt, onPick, onClose }: Omit<Props, 'visible'>) {
  const [query, setQuery] = React.useState('');
  const [onMap, setOnMap] = React.useState(false);
  const here = useCurrentPlace();

  const pick = (address: PlaceAddress) => {
    onPick(address);
    onClose();
  };

  // « I am at home now »: the current position becomes the address.
  const pickCurrentPosition = async () => {
    const place = await ensureCurrentPlace();
    if (place.status !== 'ready') {
      notify('Position introuvable', place.status === 'unavailable' ? place.reason : 'Réessaie dans un instant.');
      return;
    }
    pick({ title: place.title, subtitle: place.subtitle, ...place.coordinates });
  };

  if (onMap) {
    return (
      <MapLocationPicker
        purpose="arrival"
        onBack={() => setOnMap(false)}
        onConfirm={(title) => {
          const coordinates = knownPlace(title);
          if (coordinates) pick({ title, subtitle: 'Choisi sur la carte', ...coordinates });
          else setOnMap(false);
        }}
      />
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <LocationSuggestionsList
          query={query}
          onQueryChange={setQuery}
          // Header: the current position, touched to use it as the address.
          currentLocationName={here.status === 'ready' ? here.title : 'Ma position'}
          headerLabel="Utiliser ma position actuelle"
          showFullHeader
          onBackPress={onClose}
          onUseCurrentLocation={() => void pickCurrentPosition()}
          onOpenMap={() => setOnMap(true)}
          onSelectLocation={() => { /* en mode adresse, chaque choix passe par pickAddress */ }}
          pickAddress={{ prompt, onPick: pick, onCancel: onClose }}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  container: {
    flex: 1,
  },
});
