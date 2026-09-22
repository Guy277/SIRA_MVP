import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

type ModalType = 'theme' | 'textSize' | 'mapStyle' | null;

export default function AppearanceSettingsScreen() {
  const router = useRouter();

  const [themeSetting, setThemeSetting] = useState('Thème par défaut du systhème');
  const [textSizeSetting, setTextSizeSetting] = useState('Standard');
  const [mapStyleSetting, setMapStyleSetting] = useState('Standard');

  const [activeModal, setActiveModal] = useState<ModalType>(null);

  const themeOptions = [
    'Thème par défaut du systhème',
    'Clair',
    'Sombre',
  ];

  const textSizeOptions = [
    'Standard',
    'Petit',
    'Grand',
  ];

  const mapStyleOptions = [
    'Standard',
    'Vue Satellite',
    'Relief',
  ];

  const handleSelectOption = (value: string) => {
    if (activeModal === 'theme') {
      setThemeSetting(value);
    } else if (activeModal === 'textSize') {
      setTextSizeSetting(value);
    } else if (activeModal === 'mapStyle') {
      setMapStyleSetting(value);
    }
    setActiveModal(null);
  };

  const getModalTitle = () => {
    if (activeModal === 'theme') return 'CHOISISSEZ UN THÈME';
    if (activeModal === 'textSize') return 'CHOISISSEZ LA TAILLE DU TEXTE';
    if (activeModal === 'mapStyle') return "CHOISISSEZ L'AFFICHAGE DE LA CARTE";
    return '';
  };

  const getModalOptions = () => {
    if (activeModal === 'theme') return themeOptions;
    if (activeModal === 'textSize') return textSizeOptions;
    if (activeModal === 'mapStyle') return mapStyleOptions;
    return [];
  };

  const getSelectedValue = () => {
    if (activeModal === 'theme') return themeSetting;
    if (activeModal === 'textSize') return textSizeSetting;
    if (activeModal === 'mapStyle') return mapStyleSetting;
    return '';
  };

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Top Header Bar */}
        <View style={styles.headerBar}>
          <TouchableOpacity
            style={styles.darkBackBtn}
            onPress={() => router.back()}
            activeOpacity={0.8}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="arrow-back" size={20} color="#FFFFFF" />
          </TouchableOpacity>

          <Text style={styles.headerTitle}>Apparence</Text>
          <View style={styles.headerRightSpacer} />
        </View>

        {/* Scrollable Cards List */}
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Card 1: Thème de l'application */}
          <TouchableOpacity
            style={styles.settingCard}
            onPress={() => setActiveModal('theme')}
            activeOpacity={0.8}
          >
            <View style={styles.cardTextCol}>
              <Text style={styles.cardTitle}>Thème de l'application</Text>
              <Text style={styles.cardSubtitle}>{themeSetting}</Text>
            </View>

            <View style={styles.orangeChevronCircle}>
              <Ionicons name="chevron-forward" size={14} color="#FFFFFF" />
            </View>
          </TouchableOpacity>

          {/* Card 2: Taille du texte */}
          <TouchableOpacity
            style={styles.settingCard}
            onPress={() => setActiveModal('textSize')}
            activeOpacity={0.8}
          >
            <View style={styles.cardTextCol}>
              <Text style={styles.cardTitle}>Taille du texte</Text>
              <Text style={styles.cardSubtitle}>{textSizeSetting}</Text>
            </View>

            <View style={styles.orangeChevronCircle}>
              <Ionicons name="chevron-forward" size={14} color="#FFFFFF" />
            </View>
          </TouchableOpacity>

          {/* Card 3: Affichage de la carte */}
          <TouchableOpacity
            style={styles.settingCard}
            onPress={() => setActiveModal('mapStyle')}
            activeOpacity={0.8}
          >
            <View style={styles.cardTextCol}>
              <Text style={styles.cardTitle}>Affichage de la carte</Text>
              <Text style={styles.cardSubtitle}>{mapStyleSetting}</Text>
            </View>

            <View style={styles.orangeChevronCircle}>
              <Ionicons name="chevron-forward" size={14} color="#FFFFFF" />
            </View>
          </TouchableOpacity>
        </ScrollView>

        {/* Custom Black Selection Popup Modal */}
        <Modal
          visible={activeModal !== null}
          transparent
          animationType="fade"
          onRequestClose={() => setActiveModal(null)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setActiveModal(null)}
          >
            <TouchableOpacity
              activeOpacity={1}
              style={styles.blackModalCard}
              onPress={(e) => e.stopPropagation()}
            >
              {/* Top Right Orange Close Button */}
              <TouchableOpacity
                style={styles.closeOrangeBtn}
                onPress={() => setActiveModal(null)}
                activeOpacity={0.8}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={14} color="#000000" />
              </TouchableOpacity>

              {/* Modal Title */}
              <Text style={styles.modalHeaderTitle}>{getModalTitle()}</Text>

              {/* Options Radio List */}
              <View style={styles.modalOptionsContainer}>
                {getModalOptions().map((option) => {
                  const isSelected = getSelectedValue() === option;
                  return (
                    <TouchableOpacity
                      key={option}
                      style={styles.radioOptionRow}
                      onPress={() => handleSelectOption(option)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.radioIconWrapper}>
                        <Ionicons
                          name={isSelected ? 'radio-button-on' : 'ellipse-outline'}
                          size={20}
                          color={isSelected ? '#F26522' : '#FFFFFF'}
                        />
                      </View>
                      <Text style={[styles.radioOptionText, isSelected && styles.selectedRadioText]}>
                        {option}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
  },
  darkBackBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#1E1E1E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#000000',
    marginLeft: 14,
    letterSpacing: -0.2,
  },
  headerRightSpacer: {
    width: 38,
  },
  scrollView: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
  },
  settingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.03,
        shadowRadius: 4,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  cardTextCol: {
    flex: 1,
    paddingRight: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#000000',
    marginBottom: 2,
    letterSpacing: -0.1,
  },
  cardSubtitle: {
    fontSize: 13,
    fontWeight: '400',
    color: '#64748B',
    lineHeight: 17,
  },
  orangeChevronCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#F26522',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  blackModalCard: {
    width: 320,
    backgroundColor: '#000000',
    borderRadius: 18,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 22,
    position: 'relative',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 10,
  },
  closeOrangeBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#F26522',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  modalHeaderTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: 0.5,
    marginBottom: 18,
  },
  modalOptionsContainer: {
    gap: 14,
  },
  radioOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
  },
  radioIconWrapper: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  radioOptionText: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  selectedRadioText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
});
