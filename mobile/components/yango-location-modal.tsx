import React from 'react';
import {
  Modal,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { LocationSuggestionsList } from './location-suggestions-list';
import { MapLocationPicker } from './map-location-picker';
import { isOwnPosition } from '@/lib/places';

interface YangoLocationModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectLocation: (locationTitle: string) => void;
  currentLocationName?: string;
  initialQuery?: string;
  placeholder?: string;
  // What the chosen place is for: names the map button (« Partir d'ici »).
  purpose?: 'departure' | 'arrival';
  // Choosing a destination: the departure shown in the header (own position when
  // missing). Touching it lets the traveller pick another departure, as in Yango.
  departureName?: string;
  onSelectDeparture?: (locationTitle: string) => void;
}

export function YangoLocationModal(props: YangoLocationModalProps) {
  return (
    <Modal
      visible={props.visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={props.onClose}
    >
      {/* Mounted at each opening, so it starts from the given query, on the list. */}
      {props.visible && <PickerBody {...props} />}
    </Modal>
  );
}

function PickerBody({
  onClose,
  onSelectLocation,
  currentLocationName = 'Ma position',
  initialQuery = '',
  placeholder,
  purpose = 'arrival',
  departureName,
  onSelectDeparture,
}: YangoLocationModalProps) {
  const [query, setQuery] = React.useState(initialQuery);
  // The list, or the map to point at the place directly.
  const [onMap, setOnMap] = React.useState(false);
  // Choosing a destination, the traveller touched the departure: they pick it first,
  // then come back to « On va où ? » (the picker stays open).
  const [choosingDeparture, setChoosingDeparture] = React.useState(false);
  const departure = departureName ?? currentLocationName;
  const leavingFromHere = isOwnPosition(departure);

  const pickDeparture = (title: string) => {
    onSelectDeparture?.(title);
    setChoosingDeparture(false);
    setOnMap(false);
    setQuery('');
  };

  if (onMap) {
    return (
      <MapLocationPicker
        purpose={choosingDeparture ? 'departure' : purpose}
        onBack={() => setOnMap(false)}
        onConfirm={(title) => {
          if (choosingDeparture) {
            pickDeparture(title);
            return;
          }
          onSelectLocation(title);
          onClose();
        }}
      />
    );
  }

  if (choosingDeparture) {
    return (
      <SafeAreaView style={styles.modalSafeArea}>
        <KeyboardAvoidingView
          style={styles.keyboardContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {/* Header: back to one's own position. */}
          <LocationSuggestionsList
            query={query}
            onQueryChange={setQuery}
            currentLocationName={currentLocationName}
            headerLabel="Partir de là où je suis"
            placeholder="D’où pars-tu ?"
            showFullHeader={true}
            onBackPress={() => { setChoosingDeparture(false); setQuery(''); }}
            onOpenMap={() => setOnMap(true)}
            onSelectLocation={pickDeparture}
            onUseCurrentLocation={() => pickDeparture(currentLocationName)}
          />
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.modalSafeArea}>
      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <LocationSuggestionsList
          query={query}
          onQueryChange={setQuery}
          currentLocationName={onSelectDeparture ? departure : currentLocationName}
          headerLabel={onSelectDeparture && !leavingFromHere ? 'Je pars de' : 'Je suis ici'}
          placeholder={placeholder}
          showFullHeader={true}
          onBackPress={onClose}
          onOpenMap={() => setOnMap(true)}
          onSelectLocation={(title) => {
            onSelectLocation(title);
            onClose();
          }}
          onUseCurrentLocation={() => {
            // Choosing a destination: the header is the departure, touched to change it.
            if (onSelectDeparture) {
              setChoosingDeparture(true);
              setQuery('');
              return;
            }
            onSelectLocation(currentLocationName);
            onClose();
          }}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  modalSafeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  keyboardContainer: {
    flex: 1,
  },
});
