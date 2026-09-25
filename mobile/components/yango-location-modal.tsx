import React from 'react';
import {
  Modal,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { LocationSuggestionsList } from './location-suggestions-list';

interface YangoLocationModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectLocation: (locationTitle: string) => void;
  currentLocationName?: string;
  initialQuery?: string;
  placeholder?: string;
}

export function YangoLocationModal({
  visible,
  onClose,
  onSelectLocation,
  currentLocationName = 'Ma position',
  initialQuery = '',
  placeholder,
}: YangoLocationModalProps) {
  const [query, setQuery] = React.useState(initialQuery);

  React.useEffect(() => {
    if (visible) {
      setQuery(initialQuery);
    }
  }, [visible, initialQuery]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
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
            onOpenMap={onClose}
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
    </Modal>
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
