// « Signaler un lieu » : un voyageur place sur la carte un lieu absent des cartes (la vendeuse d'alloco du
// carrefour) et dit ce qu'il a vu, avec des faits (étiquettes, moment, prix vu), jamais une note sur 5.
// S'il existe déjà un lieu semblable tout près, SIRA demande « C'est bien celui-ci ? » : un seul lieu pour
// plusieurs signalements. Avec ?id= : « Moi aussi je l'ai vu », le voyageur complète un lieu existant.
// Pas de photo dans cette première version.
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Text, TextInput } from '@/components/sira-text';
import { MapLocationPicker } from '@/components/map-location-picker';
import { goBack } from '@/lib/navigation';
import { notify } from '@/lib/notify';
import { currentToken } from '@/lib/session';
import type { Coordinates } from '@/lib/sira-api';
import {
  LIBELLE_CATEGORIE, LIBELLE_SPECIALITE, categoriesLieux, distanceVolOiseau, signalerLieu, temoignerLieu,
  type CategorieLieu, type Doublon, type ReglesSignalement, type Temoignage,
} from '@/lib/lieux';

// Mêmes règles que le serveur (services/api/src/lieux/lieux-voyageurs.ts), si /lieux/categories ne répond pas.
const REGLES_PAR_DEFAUT: ReglesSignalement = {
  categories: ['saveurs', 'point_orange', 'marche', 'ecole', 'mosquee', 'eglise'],
  etiquettes: [
    { id: 'bien_fait', libelle: 'Bien fait', categories: ['saveurs'] },
    { id: 'copieux', libelle: 'Copieux', categories: ['saveurs'] },
    { id: 'pas_cher', libelle: 'Pas cher', categories: ['saveurs', 'marche'] },
    { id: 'propre', libelle: 'Propre', categories: null },
    { id: 'accueillant', libelle: 'Accueillant', categories: null },
    { id: 'rapide', libelle: 'Rapide', categories: null },
  ],
  moments: [{ id: 'matin', libelle: 'Le matin' }, { id: 'midi', libelle: 'À midi' }, { id: 'soir', libelle: 'Le soir' }, { id: 'nuit', libelle: 'La nuit' }],
  raisonsContenu: ['faux', 'choquant', 'publicite', 'commercant'],
};
const AVEC_PRIX: CategorieLieu[] = ['saveurs', 'marche'];
const SPECIALITES = Object.entries(LIBELLE_SPECIALITE);

export default function SignalerLieuScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ categorie?: string; id?: string; nom?: string }>();
  const completer = params.id ?? null; // « Moi aussi je l'ai vu » sur ce lieu
  const [regles, setRegles] = useState<ReglesSignalement>(REGLES_PAR_DEFAUT);
  const [position, setPosition] = useState<{ titre: string; coordonnees: Coordinates } | null>(null);
  const [choisirPosition, setChoisirPosition] = useState(!completer);
  const [categorie, setCategorie] = useState<CategorieLieu>(() =>
    REGLES_PAR_DEFAUT.categories.includes(params.categorie as CategorieLieu) ? params.categorie as CategorieLieu : 'saveurs');
  const [specialite, setSpecialite] = useState<string | null>(null);
  const [nom, setNom] = useState('');
  const [repere, setRepere] = useState('');
  const [moments, setMoments] = useState<string[]>([]);
  const [etiquettes, setEtiquettes] = useState<string[]>([]);
  const [prix, setPrix] = useState('');
  const [commentaire, setCommentaire] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [doublons, setDoublons] = useState<Doublon[] | null>(null);

  useEffect(() => {
    let annule = false;
    categoriesLieux().then((reponse) => { if (!annule && reponse.signalement) setRegles(reponse.signalement); }).catch(() => {});
    return () => { annule = true; };
  }, []);

  // Un lieu signalé se voit de tous : il faut un compte (un numéro Orange = une voix).
  useEffect(() => {
    if (currentToken()) return;
    notify('Connexion requise', 'Connecte-toi avec ton numéro Orange pour signaler un lieu : chaque voyageur compte une fois.', [
      { text: 'Me connecter', onPress: () => router.replace('/login') },
      { text: 'Plus tard', onPress: () => goBack(router) },
    ]);
  }, [router]);

  const etiquettesPermises = useMemo(
    () => regles.etiquettes.filter((e) => e.categories === null || e.categories.includes(categorie)),
    [regles, categorie],
  );
  const basculer = (liste: string[], id: string) => (liste.includes(id) ? liste.filter((x) => x !== id) : [...liste, id]);
  const temoignage = (): Temoignage => ({
    etiquettes: etiquettes.filter((id) => etiquettesPermises.some((e) => e.id === id)),
    moments,
    prixF: AVEC_PRIX.includes(categorie) && prix ? Number(prix) : null,
    commentaire: commentaire.trim() || null,
  });
  const nomValide = nom.trim().length >= 3;
  const pret = completer ? true : nomValide && position !== null;

  const ouvrirFiche = (id: string) => router.replace({ pathname: '/lieu', params: { id } });

  const envoyer = async (forcer = false) => {
    if (envoi || !pret) return;
    setEnvoi(true);
    try {
      if (completer) {
        await temoignerLieu(completer, temoignage());
        notify('Merci', 'Ton avis compte pour les autres voyageurs.');
        goBack(router);
        return;
      }
      const reponse = await signalerLieu({
        nom: nom.trim(), categorie, specialite: categorie === 'saveurs' ? specialite : null,
        lat: position!.coordonnees.latitude, lon: position!.coordonnees.longitude,
        repere: repere.trim() || null, ...temoignage(), ...(forcer ? { forcer: true } : {}),
      });
      if (!reponse.cree) { setDoublons(reponse.doublons); return; }
      notify('Merci', 'Ton lieu est sur la carte, marqué « Signalé » tant que d’autres voyageurs ne l’ont pas confirmé.');
      ouvrirFiche(reponse.id);
    } catch (error) {
      notify('Envoi impossible', error instanceof Error ? error.message : 'Réessaie dans un instant.');
    } finally {
      setEnvoi(false);
    }
  };

  // « C'est bien celui-ci » : le témoignage va au lieu existant, aucune nouvelle épingle.
  const cestCeluiCi = async (doublon: Doublon) => {
    if (envoi) return;
    setEnvoi(true);
    try {
      await temoignerLieu(doublon.id, temoignage());
      notify('Merci', `Ton avis s’ajoute à « ${doublon.nom} ».`);
      ouvrirFiche(doublon.id);
    } catch (error) {
      notify('Envoi impossible', error instanceof Error ? error.message : 'Réessaie dans un instant.');
    } finally {
      setEnvoi(false);
    }
  };

  if (choisirPosition) {
    return (
      <MapLocationPicker
        purpose="lieu"
        onConfirm={(titre, coordonnees) => { setPosition({ titre, coordonnees }); setChoisirPosition(false); }}
        onBack={() => (position ? setChoisirPosition(false) : goBack(router))}
      />
    );
  }

  return (
    <SafeAreaView style={styles.ecran} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      <View style={styles.entete}>
        <TouchableOpacity style={styles.retour} onPress={() => goBack(router)} accessibilityLabel="Retour">
          <Ionicons name="arrow-back" size={20} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.enteteTitre} numberOfLines={1}>{completer ? 'Moi aussi je l’ai vu' : 'Signaler un lieu'}</Text>
        <View style={styles.retour} />
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
          {doublons ? (
            <View style={styles.bloc}>
              <Text style={styles.titre}>C’est bien celui-ci ?</Text>
              <Text style={styles.aide}>Un lieu semblable est déjà sur la carte tout près. Si c’est le même, ton avis s’y ajoute.</Text>
              {doublons.map((doublon) => (
                <TouchableOpacity key={doublon.id} style={styles.doublon} onPress={() => cestCeluiCi(doublon)} disabled={envoi} accessibilityRole="button">
                  <View style={styles.flex}>
                    <Text style={styles.doublonNom}>{doublon.nom}</Text>
                    <Text style={styles.aide}>à {distanceVolOiseau(doublon.distanceM)}{doublon.voyageurs ? ' · signalé par des voyageurs' : ''}</Text>
                  </View>
                  <Text style={styles.lien}>Oui, c’est lui</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={styles.boutonSecondaire} onPress={() => { setDoublons(null); void envoyer(true); }} disabled={envoi} accessibilityRole="button">
                <Text style={styles.boutonSecondaireTexte}>Non, c’est un autre lieu</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {completer ? (
                <Text style={styles.aide}>Ce que tu as vu à « {params.nom ?? 'ce lieu'} ». Tu comptes une seule fois : ton nouvel avis remplace l’ancien.</Text>
              ) : (
                <>
                  <Champ titre="Où ?">
                    <TouchableOpacity style={styles.position} onPress={() => setChoisirPosition(true)} accessibilityRole="button">
                      <Ionicons name="location" size={18} color="#F26522" />
                      <Text style={[styles.flex, styles.positionTexte]} numberOfLines={1}>{position?.titre ?? 'Placer sur la carte'}</Text>
                      <Text style={styles.lien}>Changer</Text>
                    </TouchableOpacity>
                  </Champ>

                  <Champ titre="C’est quoi ?">
                    <Puces
                      options={regles.categories.map((id) => ({ id, libelle: LIBELLE_CATEGORIE[id] }))}
                      choisis={[categorie]}
                      onChoisir={(id) => { setCategorie(id as CategorieLieu); setSpecialite(null); }}
                    />
                    {categorie === 'saveurs' && <Text style={styles.aide}>Spécialité (facultatif)</Text>}
                    {categorie === 'saveurs' && (
                      <Puces options={SPECIALITES.map(([id, libelle]) => ({ id, libelle }))} choisis={specialite ? [specialite] : []} onChoisir={(id) => setSpecialite(specialite === id ? null : id)} />
                    )}
                  </Champ>

                  <Champ titre="Son nom, ou comment on l’appelle">
                    <TextInput style={styles.champ} value={nom} onChangeText={setNom} maxLength={60} placeholder="ex. Alloco de Tantie Awa" placeholderTextColor="#9CA3AF" />
                  </Champ>

                  <Champ titre="Repère (facultatif)">
                    <TextInput style={styles.champ} value={repere} onChangeText={setRepere} maxLength={120} placeholder="ex. sous le grand manguier, face à la gare" placeholderTextColor="#9CA3AF" />
                  </Champ>
                </>
              )}

              <Champ titre="Quand l’as-tu vu ouvert ?">
                <Puces options={regles.moments} choisis={moments} onChoisir={(id) => setMoments(basculer(moments, id))} />
              </Champ>

              <Champ titre="Ce que tu en dis">
                <Puces options={etiquettesPermises} choisis={etiquettes} onChoisir={(id) => setEtiquettes(basculer(etiquettes, id))} />
              </Champ>

              {AVEC_PRIX.includes(categorie) && (
                <Champ titre="Prix vu sur place (facultatif)">
                  <TextInput
                    style={styles.champ}
                    value={prix}
                    onChangeText={(texte) => setPrix(texte.replace(/[^0-9]/g, '').slice(0, 6))}
                    keyboardType="number-pad"
                    placeholder="ex. 500 (en francs CFA)"
                    placeholderTextColor="#9CA3AF"
                  />
                </Champ>
              )}

              <Champ titre="Un mot pour les autres (facultatif)">
                <TextInput
                  style={[styles.champ, styles.commentaire]}
                  value={commentaire}
                  onChangeText={setCommentaire}
                  maxLength={200}
                  multiline
                  placeholder="ex. Le soir il y a du monde, viens avant 19 h."
                  placeholderTextColor="#9CA3AF"
                />
              </Champ>

              <Text style={styles.regle}>
                Pas de nom ni de numéro de personne, pas de lien. Ton avis s’affiche sans ton nom, comme « un voyageur SIRA ».
              </Text>
            </>
          )}
        </ScrollView>

        {!doublons && (
          <View style={styles.actions}>
            <TouchableOpacity style={[styles.boutonPrincipal, (!pret || envoi) && styles.desactive]} onPress={() => envoyer()} disabled={!pret || envoi} accessibilityRole="button">
              {envoi ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.boutonPrincipalTexte}>{completer ? 'Envoyer mon avis' : 'Signaler ce lieu'}</Text>}
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Champ({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <View style={styles.bloc}>
      <Text style={styles.titre}>{titre}</Text>
      {children}
    </View>
  );
}

function Puces({ options, choisis, onChoisir }: { options: { id: string; libelle: string }[]; choisis: string[]; onChoisir: (id: string) => void }) {
  return (
    <View style={styles.puces}>
      {options.map((option) => {
        const actif = choisis.includes(option.id);
        return (
          <TouchableOpacity
            key={option.id}
            style={[styles.puce, actif && styles.puceActive]}
            onPress={() => onChoisir(option.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: actif }}
          >
            <Text style={[styles.puceTexte, actif && styles.puceTexteActive]}>{option.libelle}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  ecran: { flex: 1, backgroundColor: '#FFFFFF' },
  flex: { flex: 1 },
  entete: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8 },
  retour: { width: 38, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center' },
  enteteTitre: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '800', color: '#111827' },
  contenu: { paddingHorizontal: 16, paddingBottom: 24, gap: 4 },
  bloc: { paddingVertical: 10, gap: 8 },
  titre: { fontSize: 15, fontWeight: '800', color: '#111827' },
  aide: { fontSize: 13.5, color: '#6B7280', lineHeight: 19 },
  regle: { marginTop: 8, fontSize: 12.5, color: '#6B7280', lineHeight: 18 },
  champ: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: '#111827', backgroundColor: '#F9FAFB' },
  commentaire: { minHeight: 80, textAlignVertical: 'top' },
  position: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#F9FAFB' },
  positionTexte: { fontSize: 15, color: '#111827' },
  lien: { color: '#C2410C', fontWeight: '700', fontSize: 13.5 },
  puces: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  puce: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#FFFFFF' },
  puceActive: { backgroundColor: '#F26522', borderColor: '#F26522' },
  puceTexte: { fontSize: 13.5, fontWeight: '600', color: '#374151' },
  puceTexteActive: { color: '#FFFFFF' },
  doublon: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 16, backgroundColor: '#F9FAFB' },
  doublonNom: { fontSize: 15, fontWeight: '700', color: '#111827' },
  boutonSecondaire: { alignSelf: 'flex-start', marginTop: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18, borderWidth: 1, borderColor: '#F26522', backgroundColor: '#FFFFFF' },
  boutonSecondaireTexte: { color: '#C2410C', fontWeight: '700', fontSize: 13.5 },
  actions: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E5E7EB' },
  boutonPrincipal: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 50, borderRadius: 25, backgroundColor: '#F26522' },
  boutonPrincipalTexte: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  desactive: { opacity: 0.5 },
});
