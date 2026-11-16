import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  TouchableOpacity,
  Modal,
  ScrollView,
  Dimensions,
  Platform,
  SafeAreaView,
  Share,
  Alert,
} from 'react-native';
import { Text } from '@/components/sira-text';
import { ProfileAvatar } from '@/components/profile-avatar';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LogoutModal } from './logout-modal';
import { useSession } from '@/lib/session';
import { ACCOUNT_LINKS } from '@/lib/account-links';

const { width, height } = Dimensions.get('window');

interface SideMenuModalProps {
  visible: boolean;
  onClose: () => void;
}

export function SideMenuModal({ visible, onClose }: SideMenuModalProps) {
  const account = useSession()?.user;
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
  // The share card follows its design (512 px wide): k turns the design's pixels into the card's.
  const [shareWidth, setShareWidth] = useState(280);
  const k = shareWidth / 512;

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
                  <Image
                    source={require('@/assets/images/orange-pin-icon.png')}
                    style={styles.locationPinDecor}
                    contentFit="contain"
                  />
                </View>
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
                  <ProfileAvatar size={46} />
                </View>

                <View style={styles.profileTextInfo}>
                  <Text style={styles.userName}>{account?.full_name || (account ? 'Voyageur SIRA' : 'Invité')}</Text>
                  <Text style={styles.userPhone}>{account?.phone_number ?? 'Non connecté'}</Text>
                </View>

                <View style={styles.smallChevronCircle}>
                  <Ionicons name="chevron-forward" size={12} color="#FFFFFF" />
                </View>
              </TouchableOpacity>

              {/* The same pages as the Profil screen (lib/account-links.ts). */}
              {ACCOUNT_LINKS.map((group, index) => (
                <React.Fragment key={index}>
                  <View style={styles.divider} />
                  {group.map((link) => (
                    <TouchableOpacity
                      key={link.id}
                      style={styles.menuItemRow}
                      onPress={() => {
                        onClose();
                        router.push(link.href);
                      }}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                    >
                      <View style={styles.iconCircleBadge}>
                        <Ionicons name={link.icon} size={18} color="#F26522" />
                      </View>
                      <Text style={styles.menuItemText}>{link.title}</Text>
                    </TouchableOpacity>
                  ))}
                </React.Fragment>
              ))}

              <TouchableOpacity
                style={styles.menuItemRow}
                onPress={handleLogout}
                activeOpacity={0.7}
                accessibilityRole="button"
              >
                <View style={styles.iconCircleBadge}>
                  <Ionicons name="log-out-outline" size={18} color="#F26522" />
                </View>
                <Text style={styles.menuItemText}>Se déconnecter</Text>
              </TouchableOpacity>

              {/* « Partager SIRA » card of the Figma design (node 772-4971, drawn 512 × 258):
                  every size is that design's, scaled to the card's width (k). The orange band is
                  the button; the two friends stand over it, cut out of the design itself. */}
              <View style={styles.shareCard} onLayout={(event) => setShareWidth(event.nativeEvent.layout.width)}>
                <View style={[styles.shareTitleBlock, { left: 36 * k, top: 46 * k }]}>
                  {/* Sizes match the design's text widths in SIRA's font (Montserrat is wider than the design's). */}
                  <Text style={[styles.shareTitle, { fontSize: 31 * k, lineHeight: 42 * k }]}>Partager SIRA</Text>
                  <Text style={[styles.shareSubtitle, { fontSize: 31 * k, lineHeight: 42 * k }]}>à mes amis !</Text>
                </View>

                <TouchableOpacity
                  style={[styles.shareBand, { left: 14 * k, top: 144 * k, height: 76 * k, borderTopLeftRadius: 38 * k, borderBottomLeftRadius: 38 * k }]}
                  onPress={handleShareApp}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel="Partager SIRA à mes amis"
                >
                  <View style={[styles.shareIconCircle, { marginLeft: 10 * k, width: 50 * k, height: 50 * k, borderRadius: 25 * k }]}>
                    <Ionicons name="share-social" size={26 * k} color="#F26522" />
                  </View>
                  <Text style={[styles.shareButtonText, { marginLeft: 16 * k, fontSize: 26 * k }]}>Partager SIRA</Text>
                </TouchableOpacity>

                <Image
                  source={require('@/assets/images/share-sira-friends-card.png')}
                  style={[styles.shareFriends, { left: 262 * k, top: 28 * k, width: 250 * k, height: 192 * k }]}
                  contentFit="fill"
                  pointerEvents="none"
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
  // 40 px taller than at first, the road and slogan 40 px lower: the tilted slogan and its pin
  // used to stick out of the top and were cut. The close button stays up in the corner.
  headerBanner: {
    height: 130,
    paddingHorizontal: 14,
    position: 'relative',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  closeButtonCircle: {
    position: 'absolute',
    left: 14,
    top: 12,
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
    height: 130,
  },
  roadStripeImage: {
    position: 'absolute',
    top: 36,
    left: -20,
    width: 370,
    height: 85,
    opacity: 0.95,
  },
  sloganContainer: {
    position: 'absolute',
    top: 46,
    left: 48,
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
    width: 22,
    height: 28,
    marginLeft: 6,
    transform: [{ rotate: '14deg' }],
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
  // Positions and sizes are set in the JSX, from the design's pixels.
  shareCard: {
    width: '100%',
    aspectRatio: 512 / 258,
    marginTop: 18,
    backgroundColor: '#333333',
    borderRadius: 14,
    overflow: 'hidden',
  },
  shareTitleBlock: {
    position: 'absolute',
  },
  shareTitle: {
    fontWeight: '800',
    color: '#FFFFFF',
  },
  shareSubtitle: {
    fontWeight: '400',
    color: '#FFFFFF',
  },
  shareBand: {
    position: 'absolute',
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F26522',
  },
  shareIconCircle: {
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  shareButtonText: {
    fontWeight: '800',
    color: '#FFFFFF',
  },
  shareFriends: {
    position: 'absolute',
  },
});
