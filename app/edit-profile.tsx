import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { ProfilePhotoModal } from '@/components/profile-photo-modal';

export default function EditProfileScreen() {
  const router = useRouter();

  const [nom, setNom] = useState('Ouattara');
  const [prenom, setPrenom] = useState('Diata');
  const [numero, setNumero] = useState('+225 0703352619');
  const [adresse, setAdresse] = useState('Abobo samaké');
  const [email, setEmail] = useState('ninninouatt114@gmail.com');
  const [dateNaissance, setDateNaissance] = useState('04/11/1999');

  const [showPhotoModal, setShowPhotoModal] = useState(false);

  const handleSave = () => {
    Alert.alert('Succès', 'Vos modifications ont bien été enregistrées.', [
      { text: 'OK', onPress: () => router.back() },
    ]);
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Background Image with Dark Semi-transparent Overlay */}
      <Image
        source={require('@/assets/images/bridge-bg.jpg')}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
      />
      <View style={[StyleSheet.absoluteFill, styles.darkOverlay]} />

      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          style={styles.keyboardView}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {/* Header Bar */}
          <View style={styles.headerContainer}>
            <TouchableOpacity
              style={styles.backButtonCircle}
              onPress={() => router.back()}
              activeOpacity={0.8}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="arrow-back" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* User Profile Avatar Section */}
            <View style={styles.avatarSection}>
              <TouchableOpacity
                style={styles.avatarRing}
                activeOpacity={0.85}
                onPress={() => setShowPhotoModal(true)}
              >
                <Image
                  source={require('@/assets/images/sira-character-assistant.png')}
                  style={styles.avatarImage}
                  contentFit="cover"
                />
                <TouchableOpacity
                  style={styles.cameraBadge}
                  activeOpacity={0.8}
                  onPress={() => setShowPhotoModal(true)}
                >
                  <Ionicons name="camera" size={15} color="#F26522" />
                </TouchableOpacity>
              </TouchableOpacity>
            </View>

            {/* Form Fields List */}
            <View style={styles.formContainer}>
              {/* Field 1: Nom */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Nom</Text>
                <TextInput
                  style={styles.input}
                  value={nom}
                  onChangeText={setNom}
                  placeholderTextColor="#777777"
                />
              </View>

              {/* Field 2: Prenom */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Prenom</Text>
                <TextInput
                  style={styles.input}
                  value={prenom}
                  onChangeText={setPrenom}
                  placeholderTextColor="#777777"
                />
              </View>

              {/* Field 3: Numero */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Numero</Text>
                <TextInput
                  style={styles.input}
                  value={numero}
                  onChangeText={setNumero}
                  keyboardType="phone-pad"
                  placeholderTextColor="#777777"
                />
              </View>

              {/* Field 4: Adresse */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Adresse</Text>
                <TextInput
                  style={styles.input}
                  value={adresse}
                  onChangeText={setAdresse}
                  placeholderTextColor="#777777"
                />
              </View>

              {/* Field 5: Email */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Email</Text>
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  placeholderTextColor="#777777"
                />
              </View>

              {/* Field 6: Date de naissance */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Date de naissance</Text>
                <View style={styles.dateInputRow}>
                  <TextInput
                    style={styles.dateInput}
                    value={dateNaissance}
                    onChangeText={setDateNaissance}
                    placeholderTextColor="#777777"
                  />
                  <Ionicons name="calendar-outline" size={20} color="#FFFFFF" />
                </View>
              </View>
            </View>

            {/* Save Button */}
            <View style={styles.buttonWrapper}>
              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleSave}
                activeOpacity={0.85}
              >
                <Text style={styles.saveButtonText}>ENREGISTRER</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* Profile Photo Modal */}
      <ProfilePhotoModal
        visible={showPhotoModal}
        onClose={() => setShowPhotoModal(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  darkOverlay: {
    backgroundColor: 'rgba(0, 0, 0, 0.78)',
  },
  safeArea: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  headerContainer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButtonCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F26522',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 40,
    alignItems: 'center',
  },
  avatarSection: {
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  avatarRing: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 2.5,
    borderColor: '#F26522',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    backgroundColor: '#111111',
  },
  avatarImage: {
    width: 112,
    height: 112,
    borderRadius: 56,
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#333333',
    borderWidth: 2,
    borderColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  formContainer: {
    width: '100%',
    gap: 20,
  },
  inputGroup: {
    width: '100%',
  },
  label: {
    fontSize: 13,
    color: '#888888',
    marginBottom: 2,
    fontWeight: '400',
  },
  input: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#444444',
  },
  dateInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#444444',
    paddingVertical: 6,
  },
  dateInput: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    paddingVertical: 0,
  },
  buttonWrapper: {
    width: '100%',
    alignItems: 'center',
    marginTop: 36,
  },
  saveButton: {
    backgroundColor: '#F26522',
    paddingHorizontal: 48,
    paddingVertical: 12,
    borderRadius: 24,
    minWidth: 220,
    alignItems: 'center',
    shadowColor: '#F26522',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
});
