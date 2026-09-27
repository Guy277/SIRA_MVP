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

interface YangoLocationModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectLocation: (locationTitle: string) => void;
  currentLocationName?: string;
  initialQuery?: string;
  placeholder?: string;
  // What the chosen place is for: names the map button (« Partir d'ici »).
  purpose?: 'departure' | 'arrival';
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
}: YangoLocationModalProps) {
  const [query, setQuery] = React.useState(initialQuery);
  // The list, or the map to point at the place directly.
  const [onMap, setOnMap] = React.useState(false);

  if (onMap) {
    return (
      <MapLocationPicker
        purpose={purpose}
        onBack={() => setOnMap(false)}
        onConfirm={(title) => {
          onSelectLocation(title);
          onClose();
        }}
      />
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
          currentLocationName={currentLocationName}
          placeholder={placeholder}
          showFullHeader={true}
          onBackPress={onClose}
          onOpenMap={() => setOnMap(true)}
          onSelectLocation={(title) => {
            onSelectLocation(title);
            onClose();
          }}
          onUseCurrentLocation={() => {
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
