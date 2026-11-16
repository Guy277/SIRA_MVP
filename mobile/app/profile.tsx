import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  Platform,
} from 'react-native';
import { Text } from '@/components/sira-text';
import { ProfileAvatar } from '@/components/profile-avatar';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { DeleteAccountModal } from '@/components/delete-account-modal';
import { LogoutModal } from '@/components/logout-modal';
import { ACCOUNT_LINKS } from '@/lib/account-links';
import { ProfilePhotoModal } from '@/components/profile-photo-modal';
import { CustomBottomTabBar, useTabBarSpace } from '@/components/custom-bottom-tab-bar';
import { useSession } from '@/lib/session';

interface MenuItem {
  id: string;
  title: string;
  iconName: keyof typeof Ionicons.glyphMap;
  isDestructive?: boolean;
  onPress?: () => void;
}

export default function ProfileScreen() {
  // The list ends above the bottom bar (its last item stays reachable on small phones).
  const tabBarSpace = useTabBarSpace();
  const account = useSession()?.user;
  const router = useRouter();

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  // Camera, photos or an avatar: handled by the « Photo de profil » window itself.
  const [showProfilePhotoModal, setShowProfilePhotoModal] = useState(false);

  // The same pages as the side menu (lib/account-links.ts), then the account itself:
  // signing out, and deleting it (here only, confirmed first).
  const menuItems: MenuItem[] = [
    ...ACCOUNT_LINKS.flat().map((link) => ({
      id: link.id,
      title: link.title,
      iconName: link.icon,
      onPress: () => router.push(link.href),
    })),
    {
      id: 'logout',
      title: 'Se déconnecter',
      iconName: 'log-out-outline',
      onPress: () => setShowLogoutModal(true),
    },
    {
      id: 'delete',
      title: 'Supprimer mon compte',
      iconName: 'trash',
      isDestructive: true,
      onPress: () => setShowDeleteModal(true),
    },
  ];

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />

      <View style={styles.container}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: tabBarSpace }]}
          showsVerticalScrollIndicator={false}
        >
          {/* User Profile Avatar Section */}
          <View style={styles.avatarSection}>
            <TouchableOpacity
              style={styles.avatarRing}
              activeOpacity={0.85}
              onPress={() => setShowProfilePhotoModal(true)}
            >
              <ProfileAvatar size={112} />
              <TouchableOpacity
                style={styles.cameraBadge}
                activeOpacity={0.8}
                onPress={() => setShowProfilePhotoModal(true)}
              >
                <Ionicons name="camera" size={15} color="#F26522" />
              </TouchableOpacity>
            </TouchableOpacity>

            {/* Name & Chevron */}
            <TouchableOpacity
              style={styles.nameRow}
              onPress={() => router.push('/edit-profile')}
              activeOpacity={0.8}
            >
              <Text style={styles.userName}>{account?.full_name || (account ? 'Voyageur SIRA' : 'Invité')}</Text>
              <View style={styles.smallChevronCircle}>
                <Ionicons name="chevron-forward" size={14} color="#FFFFFF" />
              </View>
            </TouchableOpacity>

            {/* Phone Number */}
            <Text style={styles.userPhone}>{account?.phone_number ?? 'Non connecté'}</Text>
          </View>

          <View style={styles.divider} />

          {/* Menu Items List */}
          <View style={styles.menuContainer}>
            {menuItems.map((item) => {
              const isDestructive = item.isDestructive;

              return (
                <TouchableOpacity
                  key={item.id}
                  style={styles.menuRow}
                  onPress={item.onPress}
                  activeOpacity={0.7}
                >
                  {/* Left Icon Badge */}
                  <View
                    style={[
                      styles.iconCircle,
                      isDestructive ? styles.destructiveIconCircle : styles.defaultIconCircle,
                    ]}
                  >
                    <Ionicons
                      name={item.iconName}
                      size={20}
                      color={isDestructive ? '#FFFFFF' : '#F26522'}
                    />
                  </View>

                  {/* Title */}
                  <Text
                    style={[
                      styles.menuTitle,
                      isDestructive && styles.destructiveText,
                    ]}
                  >
                    {item.title}
                  </Text>

                  {/* Right Orange/Red Chevron Circle */}
                  <View
                    style={[
                      styles.actionChevron,
                      isDestructive ? styles.destructiveActionChevron : styles.defaultActionChevron,
                    ]}
                  >
                    <Ionicons name="chevron-forward" size={14} color="#FFFFFF" />
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* SolveGrid Branding Footer */}
          <View style={styles.brandingFooter}>
            <Text style={styles.brandingBy}>by</Text>
            <Text style={styles.brandingBrand}>SOLVEGRID</Text>
          </View>
        </ScrollView>
      </View>

      {/* Bottom Navigation Bar with Active Profile Tab */}
      <CustomBottomTabBar activeTab="profile" />

      {/* Account deletion, confirmed first (also in Confidentialité) */}
      <DeleteAccountModal
        visible={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
      />

      {/* Signing out, confirmed first (as in the side menu) */}
      <LogoutModal
        visible={showLogoutModal}
        onClose={() => setShowLogoutModal(false)}
        onConfirm={() => {
          setShowLogoutModal(false);
          router.replace('/login');
        }}
      />

      {/* « Photo de profil »: camera, photos or one of SIRA's avatars */}
      <ProfilePhotoModal
        visible={showProfilePhotoModal}
        onClose={() => setShowProfilePhotoModal(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#000000',
  },
  container: {
    flex: 1,
    backgroundColor: '#000000',
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
    marginTop: 28,
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
    backgroundColor: '#444444',
    borderWidth: 2,
    borderColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
  },
  userName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    marginRight: 8,
  },
  smallChevronCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#F26522',
    justifyContent: 'center',
    alignItems: 'center',
  },
  userPhone: {
    fontSize: 16,
    color: '#AAAAAA',
    marginTop: 4,
    fontWeight: '400',
    letterSpacing: 0.5,
  },
  divider: {
    width: '100%',
    height: 1,
    backgroundColor: '#1F1F1F',
    marginVertical: 24,
  },
  menuContainer: {
    width: '100%',
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  defaultIconCircle: {
    backgroundColor: '#1A1A1A',
  },
  destructiveIconCircle: {
    backgroundColor: '#E53E3E',
  },
  menuTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  destructiveText: {
    color: '#FF3333',
  },
  actionChevron: {
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
  },
  defaultActionChevron: {
    backgroundColor: '#F26522',
  },
  destructiveActionChevron: {
    backgroundColor: '#E53E3E',
  },
  brandingFooter: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 48,
    marginBottom: 16,
  },
  brandingBy: {
    fontSize: 12,
    color: '#777777',
    fontWeight: '400',
  },
  brandingBrand: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '900',
    letterSpacing: 1.5,
    marginTop: 1,
  },
  bottomNavContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: '#262626',
    height: 60,
    paddingHorizontal: 16,
  },
  navItem: {
    padding: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeNavItem: {
    justifyContent: 'center',
    alignItems: 'center',
    top: -12,
  },
  activeProfileBadge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#F26522',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#000000',
    ...Platform.select({
      ios: {
        shadowColor: '#F26522',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 6,
      },
      android: {
        elevation: 6,
      },
    }),
  },
});
