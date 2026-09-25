import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Dimensions,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CustomBottomTabBar } from '@/components/custom-bottom-tab-bar';

const { width, height } = Dimensions.get('window');

export default function ReportEventDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ categoryId?: string; title?: string }>();

  const [locationText, setLocationText] = useState('Abidjan, Boulevard Lagunaire');
  const [descriptionText, setDescriptionText] = useState('');
  const [timeText, setTimeText] = useState('');
  const [photoSelected, setPhotoSelected] = useState<string | null>(null);

  // Dynamic screen title based on selected category or default
  const headerTitle = params.title
    ? `${params.title} constaté`
    : 'Accident de la circulation constaté';

  const handleSubmitReport = () => {
    Alert.alert(
      'Signalement transmis !',
      'Votre signalement a été enregistré avec succès et transmis à la communauté SIRA.',
      [
        {
          text: 'Voir sur la carte',
          onPress: () => router.push('/traffic'),
        },
        {
          text: 'OK',
          onPress: () => router.push('/(tabs)'),
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Header Bar */}
        <View style={styles.headerBar}>
          <TouchableOpacity
            style={styles.backBtnWrapper}
            onPress={() => router.back()}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="arrow-back" size={24} color="#000000" />
          </TouchableOpacity>

          <Text style={styles.headerTitle} numberOfLines={1}>
            {headerTitle}
          </Text>

          <TouchableOpacity
            style={styles.headerIconButton}
            onPress={() => router.push('/notifications')}
            activeOpacity={0.8}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="notifications" size={22} color="#000000" />
            <View style={styles.notificationBadge}>
              <Text style={styles.badgeText}>5</Text>
            </View>
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView
          style={styles.flexOne}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Upper Map Section */}
            <View style={styles.mapContainer}>
              <Image
                source={require('@/assets/images/explore-map-bg.png')}
                style={styles.mapImage}
                contentFit="cover"
              />
              {/* Map Location Pulse Pin Pinpoint */}
              <View style={styles.mapCenterPin}>
                <View style={styles.pinPulseRing} />
                <View style={styles.pinBadgeCircle}>
                  <Ionicons name="location" size={20} color="#FFFFFF" />
                </View>
              </View>
            </View>

            {/* Bottom Form Sheet Card */}
            <View style={styles.sheetCard}>
              {/* Left Black Vertical Strip with White Dashed Line */}
              <View style={styles.dashedStripContainer}>
                <View style={styles.dashedStripLine} />
              </View>

              {/* Form Controls Content */}
              <View style={styles.formFieldsContainer}>
                {/* 1. Location Row */}
                <View style={styles.fieldRow}>
                  <View style={styles.orangeCircleIcon}>
                    <Ionicons name="location" size={18} color="#FFFFFF" />
                  </View>
                  <View style={styles.inputWrapper}>
                    <TextInput
                      style={styles.textInputBold}
                      value={locationText}
                      onChangeText={setLocationText}
                      placeholder="Localisation de l'événement"
                      placeholderTextColor="#888888"
                    />
                  </View>
                  <TouchableOpacity
                    style={styles.orangeChevronBtn}
                    onPress={() => Alert.alert('Localisation', 'Modifier la position sur la carte')}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="chevron-forward" size={14} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>

                {/* 2. Description Row */}
                <View style={styles.fieldRow}>
                  <View style={styles.orangeCircleIcon}>
                    <Ionicons name="chatbubble-ellipses" size={18} color="#FFFFFF" />
                  </View>
                  <View style={styles.inputWrapper}>
                    <TextInput
                      style={styles.textInputNormal}
                      value={descriptionText}
                      onChangeText={setDescriptionText}
                      placeholder="Décrivez brièvement la situation."
                      placeholderTextColor="#888888"
                    />
                  </View>
                </View>

                {/* 3. Time Row */}
                <View style={styles.fieldRow}>
                  <View style={styles.orangeCircleIcon}>
                    <Ionicons name="time" size={18} color="#FFFFFF" />
                  </View>
                  <View style={styles.inputWrapper}>
                    <TextInput
                      style={styles.textInputNormal}
                      value={timeText}
                      onChangeText={setTimeText}
                      placeholder="À quelle heure cela s'est-il produit ?"
                      placeholderTextColor="#888888"
                    />
                  </View>
                </View>

                {/* 4. Photo Row */}
                <TouchableOpacity
                  style={styles.fieldRow}
                  activeOpacity={0.7}
                  onPress={() => Alert.alert('Ajouter une photo', 'Prendre une photo ou choisir dans la galerie')}
                >
                  <View style={styles.orangeCircleIcon}>
                    <Ionicons name="camera" size={18} color="#FFFFFF" />
                  </View>
                  <View style={styles.inputWrapper}>
                    <Text style={[styles.textInputNormal, photoSelected ? styles.photoSelectedText : null]}>
                      {photoSelected ? photoSelected : 'Ajouter une image ou une photo'}
                    </Text>
                  </View>
                </TouchableOpacity>

                {/* Submit Pill Button */}
                <View style={styles.submitBtnContainer}>
                  <TouchableOpacity
                    style={styles.submitPillBtn}
                    onPress={handleSubmitReport}
                    activeOpacity={0.88}
                  >
                    <View style={styles.whiteWarningIconCircle}>
                      <Ionicons name="warning" size={16} color="#F26522" />
                    </View>
                    <Text style={styles.submitPillText}>Signaler l'événement</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>

        {/* Bottom Navigation Bar */}
        <CustomBottomTabBar activeTab="alerts" />
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
  flexOne: {
    flex: 1,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  backBtnWrapper: {
    padding: 4,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '800',
    color: '#000000',
    marginHorizontal: 8,
  },
  headerIconButton: {
    position: 'relative',
    padding: 4,
  },
  notificationBadge: {
    position: 'absolute',
    top: 0,
    right: -2,
    backgroundColor: '#F26522',
    borderRadius: 8,
    width: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  mapContainer: {
    height: Math.max(260, height * 0.38),
    width: '100%',
    position: 'relative',
    backgroundColor: '#EAEAEA',
  },
  mapImage: {
    width: '100%',
    height: '100%',
  },
  mapCenterPin: {
    position: 'absolute',
    top: '40%',
    left: '46%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinPulseRing: {
    position: 'absolute',
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(242, 101, 34, 0.25)',
  },
  pinBadgeCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F26522',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#F26522',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 6,
  },
  sheetCard: {
    marginTop: -24,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    flexDirection: 'row',
    paddingTop: 16,
    paddingBottom: 24,
    paddingRight: 16,
    minHeight: 280,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 8,
  },
  dashedStripContainer: {
    width: 14,
    backgroundColor: '#000000',
    marginRight: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
    overflow: 'hidden',
  },
  dashedStripLine: {
    width: 2,
    height: '90%',
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: '#FFFFFF',
    borderRadius: 1,
  },
  formFieldsContainer: {
    flex: 1,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#ECECEC',
  },
  orangeCircleIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F26522',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  inputWrapper: {
    flex: 1,
  },
  textInputBold: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000000',
    paddingVertical: 4,
  },
  textInputNormal: {
    fontSize: 13.5,
    fontWeight: '400',
    color: '#333333',
    paddingVertical: 4,
  },
  photoSelectedText: {
    color: '#F26522',
    fontWeight: '700',
  },
  orangeChevronBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#F26522',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  submitBtnContainer: {
    marginTop: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitPillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F26522',
    borderRadius: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
    gap: 10,
    shadowColor: '#F26522',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  whiteWarningIconCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitPillText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
});
