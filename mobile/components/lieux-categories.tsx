// Rangée de catégories au-dessus de la carte, comme Google Maps : « Autour de moi », « Saveurs du coin »,
// « Pharmacies de garde »… Un seul bouton actif ; le retoucher désactive le filtre.
import React from 'react';
import { ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Text } from '@/components/sira-text';
import type { CategorieCarte } from '@/lib/lieux';

type Props = {
  categories: CategorieCarte[];
  active: CategorieCarte | null;
  onChange: (categorie: CategorieCarte | null) => void;
};

export function LieuxCategories({ categories, active, onChange }: Props) {
  if (!categories.length) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.rangee} contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
      {categories.map((categorie) => {
        const actif = active?.id === categorie.id;
        return (
          <TouchableOpacity
            key={categorie.id}
            style={[styles.bouton, actif && styles.boutonActif]}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              onChange(actif ? null : categorie);
            }}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityState={{ selected: actif }}
            accessibilityLabel={actif ? `${categorie.libelle}, actif. Toucher pour revenir à l'accueil.` : categorie.libelle}
          >
            <MaterialCommunityIcons name={categorie.icone as keyof typeof MaterialCommunityIcons.glyphMap} size={17} color={actif ? '#FFFFFF' : '#F26522'} />
            <Text style={[styles.libelle, actif && styles.libelleActif]} numberOfLines={1}>{categorie.libelle}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

export const HAUTEUR_RANGEE = 48;

const styles = StyleSheet.create({
  rangee: { flexGrow: 0, marginTop: 10 },
  contenu: { paddingHorizontal: 16, gap: 8 },
  bouton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.14,
    shadowRadius: 5,
    elevation: 3,
  },
  boutonActif: { backgroundColor: '#1E1E1E' },
  libelle: { fontSize: 13.5, fontWeight: '700', color: '#1E1E1E' },
  libelleActif: { color: '#FFFFFF' },
});
