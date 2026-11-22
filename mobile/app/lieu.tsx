// Fiche d'un lieu du quotidien (ouverte depuis la liste ou la carte de l'accueil) : où il est, s'il est
// ouvert, ses sources, puis « Y aller » (écrans d'itinéraire existants), « Appeler » et « Encore là ? ».
// Pas de note sur 5 : des faits et leurs sources. Lieu signalé par les voyageurs : SIRA n'affirme pas qu'il
// existe, il montre les preuves (combien de personnes, quand, ce qu'elles en disent) et chacun juge.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Text } from '@/components/sira-text';
import { OsmMapView } from '@/components/osm-map-view';
import type { MapPlace } from '@/components/osm-map-types';
import { appeler } from '@/components/lieux-panneau';
import { goBack } from '@/lib/navigation';
import { notify } from '@/lib/notify';
import { rememberPlace, useCurrentPlace } from '@/lib/places';
import { currentToken } from '@/lib/session';
import { viserLieu } from '@/lib/lieu-vise';
import {
  COULEUR_CATEGORIE, ICONE_CATEGORIE, LIBELLE_CATEGORIE, LIBELLE_SPECIALITE, OUVERTURE, RAISONS_CONTENU,
  confirmeParSources, dateCourte, ficheLieu, lignePreuves, nomsSources, repondreEncoreLa, signalerContenuLieu,
  type FicheLieu, type PreuvesVoyageurs, type RaisonContenu,
} from '@/lib/lieux';
import { formatPrice } from '@/lib/journey-format';

const CADRAGE = { top: 40, bottom: 40, left: 40, right: 40 };

export default function LieuScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; from?: string }>();
  const here = useCurrentPlace();
  const [envoi, setEnvoi] = useState(false);
  const [essai, setEssai] = useState(0);
  const [raisons, setRaisons] = useState(false); // « Signaler ce contenu » ouvert
  // Réponse rangée avec la demande qui l'a produite : une autre demande en cours n'affiche rien de périmé.
  const id = params.id ?? '';
  const cle = `${id}#${essai}`;
  const [resultat, setResultat] = useState<{ cle: string; fiche: FicheLieu | null; erreur: string | null } | null>(null);
  const fiche = resultat?.cle === cle ? resultat.fiche : null;
  const erreur = resultat?.cle === cle ? resultat.erreur : null;
  const setFiche = (nouvelle: FicheLieu) => setResultat({ cle, fiche: nouvelle, erreur: null });

  useEffect(() => {
    if (!id) return;
    let annule = false;
    ficheLieu(id)
      .then((reponse) => { if (!annule) setResultat({ cle, fiche: reponse, erreur: null }); })
      .catch((error: unknown) => { if (!annule) setResultat({ cle, fiche: null, erreur: error instanceof Error ? error.message : 'Fiche indisponible.' }); });
    return () => { annule = true; };
  }, [id, cle]);

  // Retour de « Moi aussi je l'ai vu » : la fiche se recharge sans repasser par l'écran de chargement.
  const recharger = useRef(false);
  useFocusEffect(useCallback(() => {
    if (!recharger.current || !id) return;
    recharger.current = false;
    ficheLieu(id).then((reponse) => setResultat({ cle, fiche: reponse, erreur: null })).catch(() => {});
  }, [id, cle]));

  const places = useMemo<MapPlace[]>(() => (fiche?.lat != null && fiche.lon != null ? [{
    id: fiche.id, lat: fiche.lat, lon: fiche.lon, label: fiche.nom, highlighted: fiche.deGarde,
    color: COULEUR_CATEGORIE[fiche.categorie], icon: ICONE_CATEGORIE[fiche.categorie],
  }] : []), [fiche]);
  const position = here.status === 'ready' && !here.outside ? here.coordinates : null;

  // « Y aller » : les itinéraires de SIRA-MORE vers ce lieu, avec les écrans existants
  // (propositions Coulé / Debout / Suspendu, puis décomposition du trajet choisi).
  const yAller = () => {
    if (!fiche || fiche.lat == null || fiche.lon == null) return;
    rememberPlace(fiche.nom, { latitude: fiche.lat, longitude: fiche.lon });
    // À l'arrivée, le guidage demandera « Tu l'as trouvé ? ».
    viserLieu({ id: fiche.id, nom: fiche.nom, coordonnees: { latitude: fiche.lat, longitude: fiche.lon } });
    router.push({ pathname: '/(tabs)/explore', params: { destination: fiche.nom, query: fiche.nom, ...(params.from ? { from: params.from } : {}) } });
  };

  // Répondre, témoigner, signaler : un compte (un numéro Orange = une voix).
  const connecte = (pourquoi: string) => {
    if (currentToken()) return true;
    notify('Connexion requise', `Connecte-toi avec ton numéro Orange pour ${pourquoi}.`, [
      { text: 'Me connecter', onPress: () => router.push('/login') },
      { text: 'Plus tard', onPress: () => {} },
    ]);
    return false;
  };

  const encoreLa = async (reponse: boolean) => {
    if (!fiche || envoi) return;
    // Une réponse change l'ordre des lieux pour les autres : un compte, une réponse par jour.
    if (!connecte('dire si ce lieu est encore là')) return;
    setEnvoi(true);
    try {
      const { voyageurs, ...resume } = await repondreEncoreLa(fiche.id, reponse);
      setFiche({ ...fiche, ...resume, voyageurs: voyageurs ?? fiche.voyageurs, derniereConfirmation: resume.derniereConfirmation ?? fiche.derniereConfirmation });
      notify('Merci', reponse ? 'Ta confirmation aide les autres voyageurs.' : 'C’est noté : SIRA en tiendra compte.');
    } catch (error) {
      notify('Envoi impossible', error instanceof Error ? error.message : 'Réessaie dans un instant.');
    } finally {
      setEnvoi(false);
    }
  };

  // « Moi aussi je l'ai vu » : étiquettes, moment, prix vu, commentaire. La fiche se recharge au retour.
  const temoigner = () => {
    if (!fiche || !connecte('donner ton avis sur ce lieu')) return;
    recharger.current = true;
    router.push({ pathname: '/signaler-lieu', params: { id: fiche.id, nom: fiche.nom, categorie: fiche.categorie } });
  };

  const signalerContenu = (raison: RaisonContenu) => {
    if (!fiche || !connecte('signaler ce contenu')) return;
    notify(RAISONS_CONTENU[raison], raison === 'commercant'
      ? 'Le lieu sera retiré tout de suite de SIRA. L’équipe pourra te contacter pour vérifier.'
      : 'Si d’autres voyageurs le signalent aussi, le lieu sera masqué en attendant l’équipe SIRA.', [
      {
        text: 'Envoyer',
        onPress: () => {
          signalerContenuLieu(fiche.id, raison)
            .then(({ masque }) => {
              setRaisons(false);
              notify('Merci', masque ? 'Ce lieu n’apparaît plus sur SIRA.' : 'C’est noté.');
              if (masque) goBack(router);
            })
            .catch((error: unknown) => notify('Envoi impossible', error instanceof Error ? error.message : 'Réessaie dans un instant.'));
        },
      },
      { text: 'Annuler', onPress: () => {} },
    ]);
  };

  const ouverture = fiche ? OUVERTURE[fiche.ouverture] : null;
  const numero = fiche?.telephones[0];

  return (
    <SafeAreaView style={styles.ecran} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      <View style={styles.entete}>
        <TouchableOpacity style={styles.retour} onPress={() => goBack(router)} accessibilityLabel="Retour">
          <Ionicons name="arrow-back" size={20} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.enteteTitre} numberOfLines={1}>{fiche ? LIBELLE_CATEGORIE[fiche.categorie] : 'Lieu'}</Text>
        <View style={styles.retour} />
      </View>

      {!fiche ? (
        <View style={styles.centre}>
          {erreur ? (
            <>
              <Ionicons name="cloud-offline" size={28} color="#9CA3AF" />
              <Text style={styles.texteGris}>{erreur}</Text>
              <TouchableOpacity style={styles.boutonSecondaire} onPress={() => setEssai((n) => n + 1)}>
                <Text style={styles.boutonSecondaireTexte}>Réessayer</Text>
              </TouchableOpacity>
            </>
          ) : <ActivityIndicator color="#F26522" />}
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.contenu}>
            {places.length > 0 && (
              <View style={styles.carte}>
                <OsmMapView style={styles.carteInterne} places={places} userPosition={position} padding={CADRAGE} />
              </View>
            )}
            {fiche.photoUrl ? <Image source={{ uri: fiche.photoUrl }} style={styles.photo} contentFit="cover" accessibilityLabel={`Photo de ${fiche.nom}`} /> : null}

            <View style={styles.titreLigne}>
              <View style={[styles.pastille, { backgroundColor: COULEUR_CATEGORIE[fiche.categorie] }]}>
                <MaterialCommunityIcons name={ICONE_CATEGORIE[fiche.categorie] as keyof typeof MaterialCommunityIcons.glyphMap} size={20} color="#FFFFFF" />
              </View>
              <View style={styles.titreTexte}>
                <Text style={styles.nom}>{fiche.nom}</Text>
                <Text style={styles.texteGris}>
                  {[fiche.specialite ? LIBELLE_SPECIALITE[fiche.specialite] ?? fiche.specialite : null, fiche.commune].filter(Boolean).join(' · ') || LIBELLE_CATEGORIE[fiche.categorie]}
                </Text>
              </View>
            </View>

            <View style={styles.badges}>
              {fiche.voyageurs && <Text style={styles.badgeVoyageurs}>Signalé par des voyageurs SIRA</Text>}
              {fiche.deGarde && <Text style={styles.badgeGarde}>De garde</Text>}
              <Text style={[styles.badge, fiche.ouverture === 'ferme' && styles.badgeFerme, !ouverture && styles.badgeInconnu]}>
                {ouverture ?? 'Horaires inconnus'}
              </Text>
            </View>

            {fiche.repere ? <Info icone="location-outline" texte={fiche.repere} /> : null}
            {fiche.horaires?.osm ? <Info icone="time-outline" texte={`Horaires : ${fiche.horaires.osm}`} /> : null}
            {fiche.prixIndicatif != null ? (
              <Info icone="pricetag-outline" texte={`${formatPrice(fiche.prixIndicatif)} — indicatif${fiche.prixMajLe ? `, mis à jour le ${dateCourte(fiche.prixMajLe)}` : ''}`} />
            ) : null}
            {fiche.telephones.map((telephone) => (
              <TouchableOpacity key={telephone} onPress={() => appeler(telephone)} accessibilityRole="button" accessibilityLabel={`Appeler le ${telephone}`}>
                <Info icone="call-outline" texte={telephone} lien />
              </TouchableOpacity>
            ))}
            {fiche.garde ? (
              <Info icone="medkit-outline" texte={`Source : ${fiche.garde.source}, semaine du ${dateCourte(fiche.garde.debut)} au ${dateCourte(fiche.garde.fin)}`} />
            ) : null}
            {fiche.voyageurs ? (
              <Preuves preuves={fiche.voyageurs} onTemoigner={temoigner} />
            ) : (
              <Info icone="checkmark-done-outline" texte={`${confirmeParSources(fiche.nbSources)} : ${nomsSources(fiche.sources)}`} />
            )}
            {!fiche.voyageurs && fiche.trouvesAvecSira > 0 ? <Info icone="navigate-circle-outline" texte={trouvesAvecSira(fiche.trouvesAvecSira)} /> : null}

            <View style={styles.encoreLa}>
              <Text style={styles.encoreLaTitre}>Encore là ?</Text>
              <Text style={styles.texteGris}>
                {fiche.voyageurs
                  ? 'Ta réponse compte une fois, et aide les autres à juger.'
                  : fiche.encoreLaOui + fiche.encoreLaNon === 0
                  ? 'Personne n’a encore répondu.'
                  : `${fiche.encoreLaOui} oui · ${fiche.encoreLaNon} non${fiche.derniereConfirmation ? ` · confirmé le ${dateCourte(fiche.derniereConfirmation)}` : ''}`}
              </Text>
              <View style={styles.encoreLaBoutons}>
                <TouchableOpacity style={styles.boutonSecondaire} onPress={() => encoreLa(true)} disabled={envoi} accessibilityRole="button">
                  <Text style={styles.boutonSecondaireTexte}>Oui, toujours là</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.boutonSecondaire} onPress={() => encoreLa(false)} disabled={envoi} accessibilityRole="button">
                  <Text style={styles.boutonSecondaireTexte}>Non, plus là</Text>
                </TouchableOpacity>
              </View>
            </View>

            {fiche.voyageurs ? (
              <View style={styles.contenuSignale}>
                <TouchableOpacity onPress={() => setRaisons(!raisons)} accessibilityRole="button" accessibilityState={{ expanded: raisons }}>
                  <Text style={styles.lienDiscret}>Signaler ce contenu</Text>
                </TouchableOpacity>
                {raisons && (Object.keys(RAISONS_CONTENU) as RaisonContenu[]).map((raison) => (
                  <TouchableOpacity key={raison} style={styles.raison} onPress={() => signalerContenu(raison)} accessibilityRole="button">
                    <Text style={styles.raisonTexte}>{RAISONS_CONTENU[raison]}</Text>
                    <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}

            {fiche.attribution && !fiche.voyageurs ? <Text style={styles.attribution}>{fiche.attribution}</Text> : null}
          </ScrollView>

          <View style={styles.actions}>
            {numero ? (
              <TouchableOpacity style={styles.boutonAppeler} onPress={() => appeler(numero)} accessibilityRole="button" accessibilityLabel={`Appeler ${fiche.nom}`}>
                <Ionicons name="call" size={18} color="#16A34A" />
                <Text style={styles.boutonAppelerTexte}>Appeler</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={[styles.boutonPrincipal, fiche.lat == null && styles.desactive]} onPress={yAller} disabled={fiche.lat == null} accessibilityRole="button">
              <Ionicons name="navigate" size={18} color="#FFFFFF" />
              <Text style={styles.boutonPrincipalTexte}>Y aller</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

const trouvesAvecSira = (nb: number) => `${nb} voyageur${nb > 1 ? 's y sont allés' : ' y est allé'} avec SIRA et l’${nb > 1 ? 'ont' : 'a'} trouvé`;

// Les preuves d'un lieu signalé par les voyageurs : l'étiquette, les chiffres (négatifs compris), puis ce que
// les voyageurs en disent. Aucun nom : « un voyageur SIRA ».
function Preuves({ preuves, onTemoigner }: { preuves: PreuvesVoyageurs; onTemoigner: () => void }) {
  const fort = preuves.statut === 'verifie_recemment';
  return (
    <View style={styles.preuves}>
      <View style={styles.preuvesTitre}>
        <Ionicons name={fort ? 'shield-checkmark' : preuves.statut === 'confirme' ? 'people' : 'flag-outline'} size={18} color={fort ? '#15803D' : '#C2410C'} />
        <Text style={[styles.statut, fort && styles.statutFort]}>{preuves.libelleStatut}</Text>
      </View>
      <Text style={styles.texteGris}>{lignePreuves(preuves)}</Text>
      {preuves.trouvesAvecSira > 0 && (
        <Text style={styles.trouves}>{trouvesAvecSira(preuves.trouvesAvecSira)}</Text>
      )}
      {preuves.statut === 'signale' && (
        <Text style={styles.texteGris}>Une seule personne l’a signalé pour l’instant : à toi de juger.</Text>
      )}

      {preuves.etiquettes.length > 0 && (
        <View style={styles.etiquettes}>
          {preuves.etiquettes.map((e) => <Text key={e.id} style={styles.etiquette}>{e.libelle} · {e.nb}</Text>)}
        </View>
      )}
      {preuves.moments.length > 0 && (
        <Text style={styles.infoTexte}>Vu ouvert : {preuves.moments.map((m) => `${m.libelle.toLowerCase()} (${m.nb})`).join(', ')}</Text>
      )}
      {preuves.prix && (
        <Text style={styles.infoTexte}>
          {formatPrice(preuves.prix.medianeF)}, prix vu par {preuves.prix.nb} voyageur{preuves.prix.nb > 1 ? 's' : ''} (dernier le {dateCourte(preuves.prix.majLe)})
        </Text>
      )}
      {preuves.commentaires.map((c) => (
        <View key={`${c.le}-${c.texte}`} style={styles.commentaire}>
          <Text style={styles.infoTexte}>« {c.texte} »</Text>
          <Text style={styles.commentaireQui}>Un voyageur SIRA · {dateCourte(c.le)}</Text>
        </View>
      ))}

      <TouchableOpacity style={[styles.boutonSecondaire, styles.temoigner]} onPress={onTemoigner} accessibilityRole="button">
        <Text style={styles.boutonSecondaireTexte}>Moi aussi je l’ai vu</Text>
      </TouchableOpacity>
    </View>
  );
}

function Info({ icone, texte, lien = false }: { icone: keyof typeof Ionicons.glyphMap; texte: string; lien?: boolean }) {
  return (
    <View style={styles.info}>
      <Ionicons name={icone} size={18} color={lien ? '#16A34A' : '#6B7280'} />
      <Text style={[styles.infoTexte, lien && styles.infoLien]}>{texte}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  ecran: { flex: 1, backgroundColor: '#FFFFFF' },
  entete: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8 },
  retour: { width: 38, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center' },
  enteteTitre: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '800', color: '#111827' },
  centre: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10, padding: 24 },
  contenu: { paddingHorizontal: 16, paddingBottom: 24 },
  carte: { height: 190, borderRadius: 18, overflow: 'hidden', marginBottom: 14 },
  carteInterne: { flex: 1 },
  photo: { height: 180, borderRadius: 18, marginBottom: 14 },
  titreLigne: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pastille: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  titreTexte: { flex: 1 },
  nom: { fontSize: 21, fontWeight: '800', color: '#111827' },
  texteGris: { fontSize: 13.5, color: '#6B7280', textAlign: 'left' },
  badges: { flexDirection: 'row', gap: 8, marginTop: 12, marginBottom: 6 },
  badge: { fontSize: 12, fontWeight: '700', color: '#15803D', backgroundColor: '#DCFCE7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, overflow: 'hidden' },
  badgeFerme: { color: '#B91C1C', backgroundColor: '#FEE2E2' },
  badgeInconnu: { color: '#4B5563', backgroundColor: '#F3F4F6' },
  badgeVoyageurs: { fontSize: 12, fontWeight: '800', color: '#9A3412', backgroundColor: '#FFEDD5', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, overflow: 'hidden' },
  preuves: { marginTop: 8, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: '#FED7AA', backgroundColor: '#FFF7ED', gap: 6 },
  preuvesTitre: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statut: { fontSize: 15, fontWeight: '800', color: '#9A3412' },
  statutFort: { color: '#15803D' },
  trouves: { fontSize: 13.5, fontWeight: '700', color: '#15803D' },
  etiquettes: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  etiquette: { fontSize: 12.5, fontWeight: '700', color: '#374151', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, overflow: 'hidden' },
  commentaire: { paddingTop: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#FED7AA' },
  commentaireQui: { fontSize: 11.5, color: '#9CA3AF', marginTop: 2 },
  temoigner: { alignSelf: 'flex-start', marginTop: 4 },
  contenuSignale: { marginTop: 18, gap: 4 },
  lienDiscret: { fontSize: 13, color: '#6B7280', textDecorationLine: 'underline', textAlign: 'center' },
  raison: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 11, paddingHorizontal: 12, borderRadius: 12, backgroundColor: '#F9FAFB' },
  raisonTexte: { fontSize: 14, color: '#374151' },
  badgeGarde: { fontSize: 12, fontWeight: '800', color: '#713F12', backgroundColor: '#FACC15', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, overflow: 'hidden' },
  info: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 8 },
  infoTexte: { flex: 1, fontSize: 14, color: '#374151', lineHeight: 20 },
  infoLien: { color: '#15803D', fontWeight: '700' },
  encoreLa: { marginTop: 14, padding: 14, borderRadius: 16, backgroundColor: '#F9FAFB', gap: 6 },
  encoreLaTitre: { fontSize: 15, fontWeight: '800', color: '#111827' },
  encoreLaBoutons: { flexDirection: 'row', gap: 10, marginTop: 4 },
  boutonSecondaire: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18, borderWidth: 1, borderColor: '#F26522', backgroundColor: '#FFFFFF' },
  boutonSecondaireTexte: { color: '#C2410C', fontWeight: '700', fontSize: 13.5 },
  attribution: { marginTop: 16, fontSize: 10.5, color: '#9CA3AF', textAlign: 'center' },
  actions: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E5E7EB' },
  boutonPrincipal: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 50, borderRadius: 25, backgroundColor: '#F26522' },
  boutonPrincipalTexte: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  boutonAppeler: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 18, height: 50, borderRadius: 25, borderWidth: 1.5, borderColor: '#16A34A' },
  boutonAppelerTexte: { color: '#15803D', fontSize: 15, fontWeight: '800' },
  desactive: { opacity: 0.5 },
});
