import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  Dimensions,
  Platform,
  SafeAreaView,
  Share,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LogoutModal } from './logout-modal';

const { width, height } = Dimensions.get('window');

interface SideMenuModalProps {
  visible: boolean;
  onClose: () => void;
}

export function SideMenuModal({ visible, onClose }: SideMenuModalProps) {
  const router = useRouter();

  const handleShareApp = async () => {
    try {
      await Share.share({
        message:
          'Découvre SIRA, l’application de mobilité intelligente ! Calcule tes trajets sans stress à Abidjan : https://sira-app.ci',
      });
    } catch (error) {
      console.log('Share error:', error);
    }
  };

  const [showLogoutModal, setShowLogoutModal] = useState(false);

  const handleLogout = () => {
    setShowLogoutModal(true);
  };

  const handleNavigateProfile = () => {
    onClose();
    router.push('/profile');
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlayContainer}>
        {/* Backdrop Touchable */}
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={onClose}
        />

        {/* Side Drawer Content */}
        <View style={styles.drawerContent}>
          <SafeAreaView style={styles.safeArea}>
            {/* Header Road Graphics Banner */}
            <View style={styles.headerBanner}>
              {/* Road Diagonal Stripe Graphic & Slogan */}
              <View style={styles.roadDecorWrapper}>
                <Image
                  source={require('@/assets/images/road-stripe.png')}
                  style={styles.roadStripeImage}
                  contentFit="fill"
                />
                <View style={styles.sloganContainer}>
                  <Text style={styles.sloganWhite}>ON TRACE, </Text>
                  <Text style={styles.sloganOrange}>SANS STRESS.</Text>
                </View>
                <Image
                  source={require('@/assets/images/orange-pin-icon.png')}
                  style={styles.locationPinDecor}
                  contentFit="contain"
                />
              </View>

              <TouchableOpacity
                style={styles.closeButtonCircle}
                onPress={onClose}
                activeOpacity={0.8}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={18} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              {/* User Profile Preview Row */}
              <TouchableOpacity
                style={styles.profileRow}
                onPress={handleNavigateProfile}
                activeOpacity={0.8}
              >
                <View style={styles.avatarRing}>
                  <Image
                    source={require('@/assets/images/sira-character-assistant.png')}
                    style={styles.avatarImage}
                    contentFit="cover"
                  />
                </View>

                <View style={styles.profileTextInfo}>
                  <Text style={styles.userName}>Diata</Text>
                  <Text style={styles.userPhone}>+225 0703352619</Text>
                </View>

                <View style={styles.smallChevronCircle}>
                  <Ionicons name="chevron-forward" size={12} color="#FFFFFF" />
                </View>
              </TouchableOpacity>

              <View style={styles.divider} />

              {/* Section 1: Historique */}
              <TouchableOpacity
                style={styles.menuItemRow}
                onPress={() => {
                  onClose();
                  router.push('/history');
                }}
                activeOpacity={0.7}
              >
                <View style={styles.iconCircleBadge}>
                  <Ionicons name="time-outline" size={18} color="#F26522" />
                </View>
                <Text style={styles.menuItemText}>Historique</Text>
              </TouchableOpacity>

              <View style={styles.divider} />

              {/* Section 2: Trafic & Signaler */}
              <TouchableOpacity
                style={styles.menuItemRow}
                onPress={() => {
                  onClose();
                  router.push('/(tabs)/explore');
                }}
                activeOpacity={0.7}
              >
                <View style={styles.iconCircleBadge}>
                  <Ionicons name="car-sport" size={18} color="#F26522" />
                </View>
                <Text style={styles.menuItemText}>Trafic</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.menuItemRow}
                onPress={() => {
                  onClose();
                  router.push('/notifications');
                }}
                activeOpacity={0.7}
              >
                <View style={styles.iconCircleBadge}>
                  <Ionicons name="warning" size={18} color="#F26522" />
                </View>
                <Text style={styles.menuItemText}>Signaler un évènement</Text>
              </TouchableOpacity>

              <View style={styles.divider} />

              {/* Section 3: Paramètres, À propos, Se déconnecter */}
              <TouchableOpacity
                style={styles.menuItemRow}
                onPress={() => {
                  onClose();
                  router.push('/settings');
                }}
                activeOpacity={0.7}
              >
                <View style={styles.iconCircleBadge}>
                  <Ionicons name="settings-outline" size={18} color="#F26522" />
                </View>
                <Text style={styles.menuItemText}>Paramètres</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.menuItemRow}
                onPress={() => {
                  onClose();
                }}
                activeOpacity={0.7}
              >
                <View style={styles.iconCircleBadge}>
                  <Ionicons name="information-circle-outline" size={18} color="#F26522" />
                </View>
                <Text style={styles.menuItemText}>À propos de SIRA</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.menuItemRow}
                onPress={handleLogout}
                activeOpacity={0.7}
              >
                <View style={styles.iconCircleBadge}>
                  <Ionicons name="log-out-outline" size={18} color="#F26522" />
                </View>
                <Text style={styles.menuItemText}>Se déconnecter</Text>
              </TouchableOpacity>

              {/* Bottom "Partager SIRA" Card Banner */}
              <View style={styles.promoCardContainer}>
                <View style={styles.promoCardContent}>
                  <Text style={styles.promoTitle}>Partager SIRA</Text>
                  <Text style={styles.promoSub}>à mes amis !</Text>

                  <TouchableOpacity
                    style={styles.shareButton}
                    onPress={handleShareApp}
                    activeOpacity={0.85}
                  >
                    <View style={styles.shareIconCircle}>
                      <Ionicons name="share-social" size={12} color="#F26522" />
                    </View>
                    <Text style={styles.shareButtonText}>Partager SIRA</Text>
                  </TouchableOpacity>
                </View>

                {/* Right Illustration */}
                <Image
                  source={require('@/assets/images/share-sira-friends.png')}
                  style={styles.promoIllustration}
                  contentFit="contain"
                />
              </View>
            </ScrollView>
          </SafeAreaView>
        </View>
      </View>

      {/* Logout Confirmation Modal */}
      <LogoutModal
        visible={showLogoutModal}
        onClose={() => setShowLogoutModal(false)}
        onConfirm={() => {
          setShowLogoutModal(false);
          onClose();
          router.replace('/login');
        }}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlayContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    flexDirection: 'row',
  },
  backdrop: {
    width: width * 0.15,
    height: '100%',
  },
  drawerContent: {
    width: width * 0.85,
    height: '100%',
    backgroundColor: '#000000',
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: -4, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 10,
      },
      android: {
        elevation: 10,
      },
    }),
  },
  safeArea: {
    flex: 1,
  },
  headerBanner: {
    height: 90,
    paddingHorizontal: 14,
    position: 'relative',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  closeButtonCircle: {
    position: 'absolute',
    left: 14,
    top: 18,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F26522',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20,
  },
  roadDecorWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 90,
  },
  roadStripeImage: {
    position: 'absolute',
    top: -4,
    left: -20,
    width: 370,
    height: 85,
    opacity: 0.95,
  },
  sloganContainer: {
    position: 'absolute',
    top: 14,
    left: 54,
    flexDirection: 'row',
    alignItems: 'center',
    transform: [{ rotate: '-11deg' }],
    zIndex: 10,
  },
  sloganWhite: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  sloganOrange: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#F26522',
    letterSpacing: 0.3,
  },
  locationPinDecor: {
    position: 'absolute',
    top: -4,
    right: 18,
    width: 28,
    height: 38,
    transform: [{ rotate: '13.89deg' }],
    zIndex: 10,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingBottom: 24,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 8,
  },
  avatarRing: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: '#F26522',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    marginRight: 12,
  },
  avatarImage: {
    width: 46,
    height: 46,
    borderRadius: 23,
  },
  profileTextInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  userPhone: {
    fontSize: 13,
    color: '#AAAAAA',
  },
  smallChevronCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#F26522',
    justifyContent: 'center',
    alignItems: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: '#1E1E1E',
    marginVertical: 8,
  },
  menuItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
  },
  iconCircleBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#1A1A1A',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  menuItemText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  promoCardContainer: {
    backgroundColor: '#262626',
    borderRadius: 14,
    padding: 12,
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  promoCardContent: {
    flex: 1,
    zIndex: 2,
  },
  promoTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  promoSub: {
    fontSize: 14,
    fontWeight: '600',
    color: '#E0E0E0',
    marginBottom: 8,
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F26522',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  shareIconCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
  },
  shareButtonText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  promoIllustration: {
    width: 110,
    height: 72,
    position: 'absolute',
    right: 0,
    bottom: 0,
    zIndex: 1,
  },
});
