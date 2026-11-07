// Panneau sous la carte quand une catégorie est active : recherche dans la catégorie, sous-filtres,
// les 5 lieux classés par le serveur avec le résumé de leur trajet, puis l'attribution des sources.
import React from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Text, TextInput } from '@/components/sira-text';
import {
  COULEUR_CATEGORIE, ICONE_CATEGORIE, OUVERTURE, dateCourte, distanceVolOiseau, resumeTrajet,
  type CategorieCarte, type LieuClasse, type LieuProche, type PharmacieSansPosition,
} from '@/lib/lieux';
import type { useLieux } from '@/lib/use-lieux';

type Props = {
  categorie: CategorieCarte;
  lieux: ReturnType<typeof useLieux>;
  attribution: string;
  // Pas de position (GPS refusé ou indisponible) : choisir un point sur la carte.
  sansPosition: string | null;
  onChoisirPosition: () => void;
  onOuvrir: (id: string) => void;
  hauteur: number;
};

export const appeler = (numero: string) => Linking.openURL(`tel:${numero.replace(/[^\d+]/g, '')}`).catch(() => {});

export function LieuxPanneau({ categorie, lieux, attribution, sansPosition, onChoisirPosition, onOuvrir, hauteur }: Props) {
  const { points, classement, etat } = lieux;
  // Les 5 lieux classés dès qu'ils arrivent ; avant, les 5 plus proches avec « Calcul du trajet… ».
  const liste: (LieuProche | LieuClasse)[] = classement?.lieux ?? points?.lieux.slice(0, 5) ?? [];
  const garde = points?.garde ?? classement?.garde;
  const pharmaciesSansPosition = points?.sansPosition ?? [];

  return (
    <View style={[styles.panneau, { height: hauteur }]}>
      <View style={styles.poignee} />
      <View style={styles.recherche}>
        <Ionicons name="search" size={18} color="#6B7280" />
        <TextInput
          style={styles.champ}
          value={lieux.recherche}
          onChangeText={lieux.chercher}
          placeholder={`Chercher dans « ${categorie.libelle} »`}
          placeholderTextColor="#9CA3AF"
          returnKeyType="search"
          accessibilityLabel={`Chercher un lieu par son nom dans ${categorie.libelle}`}
        />
        {lieux.recherche ? (
          <TouchableOpacity onPress={() => lieux.chercher('')} accessibilityLabel="Effacer la recherche">
            <Ionicons name="close-circle" size={18} color="#9CA3AF" />
          </TouchableOpacity>
        ) : null}
      </View>

      {categorie.sousFiltres.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.puces} contentContainerStyle={styles.pucesContenu} keyboardShouldPersistTaps="handled">
          {categorie.sousFiltres.map((filtre) => {
            const actif = lieux.sousFiltre === filtre.id;
            return (
              <TouchableOpacity
                key={filtre.id}
                style={[styles.puce, actif && styles.puceActive]}
                // Pharmacies : toujours un des deux (« De garde » ou « Toutes ») ; ailleurs, retoucher enlève le filtre.
                onPress={() => lieux.choisirSousFiltre(actif && categorie.id !== 'pharmacie' ? null : filtre.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: actif }}
              >
                <Text style={[styles.puceTexte, actif && styles.puceTexteActive]}>{filtre.libelle}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      <ScrollView style={styles.corps} contentContainerStyle={styles.corpsContenu} keyboardShouldPersistTaps="handled">
        {garde?.debut && garde.fin && (
          <Text style={styles.infoGarde}>De garde du {dateCourte(garde.debut)} au {dateCourte(garde.fin)} · Source : {garde.source}</Text>
        )}

        {sansPosition ? (
          <Etat icone="locate" texte={sansPosition} action="Choisir un point sur la carte" onAction={onChoisirPosition} />
        ) : etat === 'erreur' ? (
          <Etat icone="cloud-offline" texte="Pas de réseau : les lieux n’ont pas pu être chargés." action="Réessayer" onAction={lieux.reessayer} />
        ) : etat === 'chargement' ? (
          [0, 1, 2].map((i) => <Squelette key={i} />)
        ) : !liste.length ? (
          <Etat
            icone="search"
            texte={pharmaciesSansPosition.length ? 'Aucune pharmacie de garde placée sur la carte près d’ici.' : 'Rien trouvé ici.'}
            action={lieux.elargi ? undefined : 'Élargir la zone ?'}
            onAction={lieux.elargir}
          />
        ) : (
          liste.map((lieu) => <Ligne key={lieu.id} lieu={lieu} onPress={() => onOuvrir(lieu.id)} />)
        )}

        {!sansPosition && pharmaciesSansPosition.length > 0 && (
          <View style={styles.sansPosition}>
            <Text style={styles.sousTitre}>Aussi de garde{points?.commune ? ` à ${points.commune}` : ''}, sans position sur la carte</Text>
            {pharmaciesSansPosition.map((pharmacie) => <PharmacieAppel key={`${pharmacie.nom}-${pharmacie.adresse}`} pharmacie={pharmacie} />)}
          </View>
        )}

        {attribution ? <Text style={styles.attribution}>{attribution}</Text> : null}
      </ScrollView>
    </View>
  );
}

function Ligne({ lieu, onPress }: { lieu: LieuProche | LieuClasse; onPress: () => void }) {
  const classe = 'etat' in lieu ? lieu : null;
  const ouverture = classe ? OUVERTURE[classe.ouverture] : null;
  const ou = [lieu.repere ?? lieu.commune, `à ${distanceVolOiseau(lieu.distanceM)}`].filter(Boolean).join(' · ');
  return (
    <TouchableOpacity style={styles.ligne} onPress={onPress} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={`${lieu.nom}, ${ou}`}>
      <View style={[styles.pastille, { backgroundColor: COULEUR_CATEGORIE[lieu.categorie] }]}>
        <MaterialCommunityIcons name={ICONE_CATEGORIE[lieu.categorie] as keyof typeof MaterialCommunityIcons.glyphMap} size={18} color="#FFFFFF" />
      </View>
      <View style={styles.ligneTexte}>
        <View style={styles.ligneTitre}>
          <Text style={styles.nom} numberOfLines={1}>{lieu.nom}</Text>
          {lieu.deGarde && <Text style={styles.badgeGarde} numberOfLines={1}>De garde</Text>}
          {ouverture && <Text style={[styles.badge, classe?.ouverture === 'ferme' && styles.badgeFerme]} numberOfLines={1}>{ouverture}</Text>}
        </View>
        <Text style={styles.ou} numberOfLines={1}>{ou}</Text>
        <Text style={styles.trajet} numberOfLines={1}>
          {!classe || classe.etat === 'en_cours' ? 'Calcul du trajet…'
            : classe.etat === 'calcule' ? resumeTrajet(classe.trajet)
            : `Trajet indisponible · ${distanceVolOiseau(lieu.distanceM)} à vol d’oiseau`}
        </Text>
      </View>
      {(!classe || classe.etat === 'en_cours') ? <ActivityIndicator size="small" color="#F26522" /> : <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />}
    </TouchableOpacity>
  );
}

function PharmacieAppel({ pharmacie }: { pharmacie: PharmacieSansPosition }) {
  const numero = pharmacie.telephones[0];
  return (
    <View style={styles.ligne}>
      <View style={[styles.pastille, { backgroundColor: COULEUR_CATEGORIE.pharmacie }]}>
        <MaterialCommunityIcons name="medical-bag" size={18} color="#FFFFFF" />
      </View>
      <View style={styles.ligneTexte}>
        <Text style={styles.nom} numberOfLines={1}>{pharmacie.nom}</Text>
        {pharmacie.adresse ? <Text style={styles.ou} numberOfLines={2}>{pharmacie.adresse}</Text> : null}
      </View>
      {numero ? (
        <TouchableOpacity style={styles.appeler} onPress={() => appeler(numero)} accessibilityRole="button" accessibilityLabel={`Appeler ${pharmacie.nom} au ${numero}`}>
          <Ionicons name="call" size={16} color="#FFFFFF" />
          <Text style={styles.appelerTexte}>Appeler</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function Etat({ icone, texte, action, onAction }: { icone: keyof typeof Ionicons.glyphMap; texte: string; action?: string; onAction: () => void }) {
  return (
    <View style={styles.etat}>
      <Ionicons name={icone} size={26} color="#9CA3AF" />
      <Text style={styles.etatTexte}>{texte}</Text>
      {action ? (
        <TouchableOpacity style={styles.etatBouton} onPress={onAction} accessibilityRole="button">
          <Text style={styles.etatBoutonTexte}>{action}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function Squelette() {
  return (
    <View style={styles.ligne} accessibilityLabel="Chargement">
      <View style={[styles.pastille, styles.gris]} />
      <View style={styles.ligneTexte}>
        <View style={[styles.barre, { width: '60%' }]} />
        <View style={[styles.barre, { width: '40%' }]} />
        <View style={[styles.barre, { width: '75%' }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panneau: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingTop: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 12,
    zIndex: 40,
  },
  poignee: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', marginBottom: 10 },
  recherche: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, paddingHorizontal: 14, height: 42,
    borderRadius: 21, backgroundColor: '#F3F4F6',
  },
  champ: { flex: 1, fontSize: 14.5, color: '#111827', paddingVertical: 0 },
  puces: { flexGrow: 0, marginTop: 10 },
  pucesContenu: { paddingHorizontal: 16, gap: 8 },
  puce: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#FFFFFF' },
  puceActive: { backgroundColor: '#FFF1E8', borderColor: '#F26522' },
  puceTexte: { fontSize: 12.5, fontWeight: '600', color: '#374151' },
  puceTexteActive: { color: '#C2410C' },
  corps: { flex: 1, marginTop: 8 },
  corpsContenu: { paddingHorizontal: 16, paddingBottom: 24 },
  infoGarde: { fontSize: 12, color: '#15803D', fontWeight: '600', marginBottom: 6 },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E7EB' },
  pastille: { width: 38, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center' },
  ligneTexte: { flex: 1, gap: 2 },
  ligneTitre: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  nom: { flexShrink: 1, fontSize: 15, fontWeight: '700', color: '#111827' },
  ou: { fontSize: 12.5, color: '#6B7280' },
  trajet: { fontSize: 13, fontWeight: '600', color: '#C2410C' },
  badge: { flexShrink: 0, fontSize: 10.5, fontWeight: '700', color: '#15803D', backgroundColor: '#DCFCE7', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, overflow: 'hidden' },
  badgeFerme: { color: '#B91C1C', backgroundColor: '#FEE2E2' },
  badgeGarde: { flexShrink: 0, fontSize: 10.5, fontWeight: '800', color: '#713F12', backgroundColor: '#FACC15', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, overflow: 'hidden' },
  sansPosition: { marginTop: 14 },
  sousTitre: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 2 },
  appeler: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#16A34A', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18 },
  appelerTexte: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  etat: { alignItems: 'center', paddingVertical: 22, gap: 8 },
  etatTexte: { fontSize: 14, color: '#4B5563', textAlign: 'center' },
  etatBouton: { marginTop: 4, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20, backgroundColor: '#F26522' },
  etatBoutonTexte: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  gris: { backgroundColor: '#E5E7EB' },
  barre: { height: 10, borderRadius: 5, backgroundColor: '#E5E7EB', marginVertical: 2 },
  attribution: { marginTop: 14, fontSize: 10.5, color: '#9CA3AF', textAlign: 'center' },
});
