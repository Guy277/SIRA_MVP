# Modèles de CSV des lieux

Copier le modèle dans `data/lieux/` (hors Git), le remplir, puis relancer `npm run data:lieux`.

- `sira_lieux_depart.csv` : lieux recensés par l'équipe (toutes catégories).
- `points_orange.csv` : agences Orange et points Orange Money, en attendant les données officielles d'Orange
  (colonne `categorie` vide = `point_orange`).

| Colonne | Contenu |
| --- | --- |
| `nom` | obligatoire |
| `categorie` | `saveurs`, `pharmacie`, `point_orange`, `marche`, `ecole`, `mosquee`, `eglise`, `sante` |
| `specialite` | pour `saveurs` : `choukouya`, `banane_braisee`, `alloco`, `garba`, `gbofloto`, `crecre`, `placali`, `maquis` ; vide = d'après le nom |
| `latitude`, `longitude` | en degrés décimaux (ex. 5.4410 et -4.0090). Sans coordonnées : le lieu reste « en attente » et n'apparaît pas sur la carte |
| `repere` | carrefour, rond-point, bâtiment connu |
| `horaires` | JSON (ex. `{"osm":"Mo-Sa 07:00-22:00"}`) ou texte libre |
| `prix_indicatif`, `prix_maj_le` | en FCFA, et date du relevé (AAAA-MM-JJ) |
| `photo` | adresse de la photo ; ignorée sans `consentement_photo` |
| `consentement_vendeur`, `consentement_photo` | `oui` / `non` |
| `statut` | `valide` (défaut), `en_attente`, `retire` |
| `source` | `equipe` (défaut), `uvci`, `presse`, `utilisateur` |
| `a_verifier` | `oui` : le lieu reste en attente |
| `telephones` | plusieurs numéros séparés par `/` |

Virgule ou point-virgule comme séparateur ; mettre entre guillemets une cellule qui contient une virgule.
