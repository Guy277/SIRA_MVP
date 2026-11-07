// Point d'entrée pour un service externe (Max it, par exemple) : siraproj://y-aller?lat=5.4410&lng=-4.0090&nom=Pharmacie
// ouvre directement les itinéraires de SIRA vers ce lieu, depuis la position du voyageur.
// Max it dit QUOI (une pharmacie de garde…), SIRA dit COMMENT Y ALLER.
import React, { useEffect, useMemo } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/sira-text';
import { ABIDJAN_CENTRE, GRAND_ABIDJAN_RADIUS_M, distanceM, rememberPlace } from '@/lib/places';

// Destination lisible depuis les paramètres du lien, ou null si elle manque ou sort du Grand Abidjan.
export function destinationDuLien(params: { lat?: string; lng?: string; lon?: string; nom?: string }) {
  const latitude = Number(params.lat);
  const longitude = Number(params.lng ?? params.lon);
  if (!params.lat || !(params.lng ?? params.lon) || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const coordinates = { latitude, longitude };
  if (distanceM(coordinates, ABIDJAN_CENTRE) > GRAND_ABIDJAN_RADIUS_M) return null;
  const nom = (params.nom ?? '').trim().slice(0, 80) || 'Destination';
  return { nom, coordinates };
}

export default function YAllerScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ lat?: string; lng?: string; lon?: string; nom?: string }>();
  const { lat, lng, lon, nom } = params;
  const destination = useMemo(() => destinationDuLien({ lat, lng, lon, nom }), [lat, lng, lon, nom]);

  useEffect(() => {
    if (!destination) return;
    rememberPlace(destination.nom, destination.coordinates);
    // Les écrans d'itinéraire existants : propositions, puis décomposition du trajet choisi.
    router.replace({ pathname: '/(tabs)/explore', params: { destination: destination.nom, query: destination.nom } });
  }, [destination, router]);

  if (destination) return null;
  return (
    <View style={styles.ecran}>
      <Ionicons name="alert-circle-outline" size={34} color="#9CA3AF" />
      <Text style={styles.texte}>Ce lien ne donne pas de lieu dans le Grand Abidjan.</Text>
      <TouchableOpacity style={styles.bouton} onPress={() => router.replace('/(tabs)')} accessibilityRole="button">
        <Text style={styles.boutonTexte}>Aller à l’accueil</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  ecran: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 24, backgroundColor: '#FFFFFF' },
  texte: { fontSize: 15, color: '#374151', textAlign: 'center' },
  bouton: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20, backgroundColor: '#F26522' },
  boutonTexte: { color: '#FFFFFF', fontWeight: '700' },
});
