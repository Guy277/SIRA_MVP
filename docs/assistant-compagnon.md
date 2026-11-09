# SIRA, assistant compagnon : plan et détail des étapes

> Décision du 2026-11-09 (Achille). Objectif : que « Discuter avec SIRA » devienne un compagnon de route à qui l'on
> parle naturellement, qui conseille, rassure et explique, sans jamais rien inventer. À livrer avant le pitch du
> 20 novembre (Orange Summer Challenge 2026).

## 1. Ce qu'on veut

Le voyageur doit pouvoir :

- **dialoguer comme avec un ami** qui connaît Abidjan : « Je suis fatigué, je dois aller au Plateau ce soir, je fais comment ? » ;
- **demander conseil** sur le trafic, le meilleur moment pour partir, le moins cher, le plus sûr ;
- **se confier** (stress, retard, fatigue, peur de se perdre) et recevoir de l'empathie **et** un conseil concret ;
- **être rassuré et convaincu**, avec des raisons et des sources : « d'après SIRA-MORE », « d'après 3 voyageurs il y a 20 min » ;
- **déclencher une action** quand c'est utile (lancer un trajet, voir les options, signaler), toujours après sa confirmation.

Et SIRA doit donner envie de continuer la conversation : réponses vivantes, relances à toucher, ton chaleureux.

## 2. Les règles qui ne bougent pas

1. **Rien n'est inventé.** Chaque prix, durée, heure, nombre ou numéro de ligne vient d'une source de SIRA. Le LLM
   écrit les phrases ; il ne fournit jamais un chiffre.
2. **Chaque affirmation a sa source** (SIRA-MORE, signalements des voyageurs, prix confirmés, FAQ, lieux du voyageur),
   montrée sous la réponse.
3. **Le voyageur décide.** SIRA propose une action par un bouton ; il ne la lance jamais seul.
4. **Rien n'est gardé sur le serveur.** La conversation vit dans l'application, comme l'historique et les favoris.
5. **SIRA reste dans son domaine** (se déplacer à Abidjan). Le hors sujet est ramené avec chaleur ; une situation de
   danger reçoit les numéros d'urgence, tirés d'une fiche sourcée.

## 3. Deux micros, deux rôles

| | Micro de l'accueil (« On va où ? ») | Discuter avec SIRA |
|---|---|---|
| But | aller quelque part, vite | parler, demander conseil, se confier |
| Qui décide | les règles d'abord (rapide), le LLM en secours | le LLM compose chaque réponse à partir des faits |
| Mémoire | une demande (et sa question en attente) | les derniers échanges de la conversation |
| Actions | lance la recherche tout de suite | propose une action par un bouton |
| Ton | court, efficace | chaleureux, au « tu », comme un ami |
| Voix | répond à voix haute et réécoute (mains libres) | écrit ; parle si la voix de SIRA est activée |

Les deux partagent l'écoute (Parakeet puis Whisper), CamemBERT, le répertoire de lieux, la FAQ, SIRA-MORE et les
signalements : le compagnon **réutilise** la chaîne du micro de l'accueil, il ne la remplace pas.

## 4. Comment SIRA répond (architecture)

```
message du voyageur (écrit, ou dit puis transcrit par /voice/hear)
   │
   ├─ 1. Comprendre et agir comme aujourd'hui : VoiceDialog.ask
   │     CamemBERT (intention, lieux) → FAQ / trajet en cours / SIRA-MORE / signalements, LLM-outil si besoin.
   │     Résultat : une réponse « sûre » (texte factuel), ses données (trajets…) et ses sources.
   │
   ├─ 2. Compléter la fiche de faits (sans LLM) :
   │     signalements près du lieu demandé · prix confirmés par les voyageurs · fiche FAQ la plus proche ·
   │     lieux du voyageur (Maison, Travail…) · heure locale · le trajet suivi s'il y en a un.
   │
   ├─ 3. Composer (LLM, une seule fois) : consignes du compagnon + derniers échanges + fiche de faits
   │     + réponse sûre → une réponse naturelle, ses sources, 2 ou 3 relances.
   │
   └─ 4. Vérifier : chaque nombre de la réponse doit figurer dans la fiche (ou dans le message du voyageur).
         Sinon, ou si le LLM ne répond pas à temps : la réponse sûre de l'étape 1. Les actions (boutons)
         sont calculées par les règles à partir des données, jamais laissées au LLM.
```

### Nouvel appel du service voix

`POST /voice/chat` (JSON) :

```json
{
  "text": "je suis fatigué, je veux rentrer à Yopougon sans trop dépenser",
  "history": [{"from": "me", "text": "…"}, {"from": "sira", "text": "…"}],
  "position": {"lat": 5.441, "lon": -4.009},
  "context": null, "trip": null, "places": [], "speak": false
}
```

Réponse : celle de `/voice/ask` (trajets, `context`, `kind`…) avec en plus :

- `reply_text` : la réponse du compagnon (ou la réponse sûre) ;
- `facts_sources` : les sources lisibles (« Calcul SIRA-MORE », « Signalements des voyageurs », « FAQ SIRA »…) ;
- `actions` : boutons proposés (`voir_trajets`, `demarrer`, `signaler`) ;
- `suggestions` : 2 ou 3 relances à toucher ;
- `companion` : `{"composed": true|false, "seconds": 7.2, "rejected": null|"chiffre absent des faits"|"délai"}`.

`POST /voice/hear` (audio) : la transcription seule, pour afficher tout de suite « ce que tu as dit » pendant que
SIRA compose (la composition dure plusieurs secondes : ici, les deux appels valent la peine, contrairement au micro
de l'accueil où la mesure du 2026-11-08 les a écartés).

## 5. Les étapes

### Étape 1 — Mode conversation

| # | Tâche | Où | Fait quand |
|---|---|---|---|
| 1.1 | Séparer les micros : l'accueil garde `/voice/query`, le chat passe par `/voice/hear` puis `/voice/chat` | `mobile/lib/use-companion.ts`, `app/chat.tsx` | le chat ne lance plus de trajet tout seul |
| 1.2 | Mémoire : l'application envoie les 6 derniers échanges ; rien n'est gardé côté serveur | `use-companion.ts`, `/voice/chat` | « et le moins cher ? » est compris après une question de trajet |
| 1.3 | Fiche de faits : réponse sûre + données SIRA-MORE + signalements proches + FAQ + lieux + heure | `services/voice/app/companion.py` | chaque fait porte sa source |
| 1.4 | Composition par le LLM à partir de la fiche, avec la conversation | `companion.py`, `llm.py` | réponse naturelle, au « tu », 2 à 4 phrases |
| 1.5 | Vérification des chiffres ; sinon la réponse sûre | `companion.py` | test : un chiffre absent des faits est refusé |
| 1.6 | Actions par boutons, calculées par les règles | `companion.py`, `chat.tsx` | « Voir les trajets », « Démarrer », « Signaler » |
| 1.7 | Relances à toucher (proposées par le LLM, vérifiées, sinon relances des règles) | `companion.py`, `chat.tsx` | 2 ou 3 relances sous chaque réponse |

### Étape 2 — Le ressenti

| # | Tâche | Fait quand |
|---|---|---|
| 2.1 | Réponse affichée au fur et à mesure (mot par mot) | la réponse « s'écrit » au lieu d'apparaître d'un bloc |
| 2.2 | Étapes de réflexion réelles : « je t'ai entendu », « je regarde les signalements », « je compare les trajets » | chaque étape correspond à un outil qui tourne vraiment |
| 2.3 | Personnalité : chaleureux, empathique, ivoirien sans caricature, toujours un conseil concret | consignes écrites dans `companion.py` |
| 2.4 | Fiches FAQ « confidences » (stress, retard, fatigue, se perdre) et « urgence » (numéros officiels, avec leur source) | fiches dans `services/voice/knowledge/` |
| 2.5 | LLM chauffé au démarrage (existe déjà) et délai porté de 20 à 30 s pour la composition | plus de retombée par simple lenteur au premier message |

### Étape 3 — Le contrôle

| # | Tâche | Fait quand |
|---|---|---|
| 3.1 | Banc d'essai d'une quarantaine de conversations (conseil, confidence, hors sujet, suites de questions, urgence) | `services/voice/scripts/bench_compagnon.py` |
| 3.2 | Note de chaque réponse : aucun chiffre inventé, source citée, bonne action, temps | rapport dans `services/voice/benchmarks/` |
| 3.3 | Trajets de jour (gbaka, bus, Coulé vraiment le moins cher) | questions avec une heure de départ en journée |
| 3.4 | Vitesse réelle sur le serveur AWS | après déploiement, sur signal d'Achille |

## 6. Limites connues

- **Puissance** : Ministral 3B sans carte graphique, 5 à 15 s par appel sur le PC de développement, davantage sur
  le serveur AWS (2 processeurs). La composition ajoute un appel : d'où l'affichage progressif et les étapes visibles.
- **Taille du modèle** : un modèle 8B écrirait plus finement mais serait trop lent sans carte graphique. Pour le 20,
  le 3B, bien encadré par la fiche de faits et la vérification.
- **Voix** : le vocabulaire d'Abidjan reste parfois mal entendu (gbaka → « Baka », Angré → « engager »).

## 7. Ce qui a été fait le 2026-11-09

### Décision : un compagnon hybride

Mesure du jour (PC de développement, Ministral 3B sans carte graphique, mémoire presque pleine) : la rédaction libre
par le LLM prenait **35 à 110 s** et **inventait malgré les consignes** (« taxis partagés via Uber, MyTaxi »,
« environ 2 500-3 000 FCFA », « Coulé, ce sont souvent les bus »). Le compagnon est donc construit ainsi :

- **SIRA rédige lui-même** des réponses naturelles et variées : phrase d'empathie quand le voyageur dit une émotion,
  les faits sourcés, une question de relance ; sources, boutons et relances décidés par ses règles.
- **Le LLM garde ce qu'il fait bien** : comprendre une phrase ambiguë, ramener le hors sujet (CAN, recette, météo).
- **La rédaction libre par le LLM est prête mais coupée** (`VOICE_COMPANION_COMPOSE=false`) : elle est vérifiée
  (chiffres et noms propres absents des faits = refus) et pourra être allumée sur une machine avec carte graphique.

### Où c'est

| Partie | Fichier |
|---|---|
| Compagnon (faits, empathie, urgence, suites, sources, boutons, relances, vérification) | `services/voice/app/companion.py` |
| Appels `/voice/chat` (avec étapes en direct) et `/voice/hear` | `services/voice/app/main.py` |
| Étapes réellement lancées (SIRA-MORE, signalements, FAQ, LLM) | `services/voice/app/dialog.py` (`step`) |
| Fiches confidences et urgence (numéros sourcés) | `services/voice/knowledge/compagnon.md` |
| Relais des étapes en direct | `services/api/src/voice/voice.controller.ts` |
| Conversation côté application | `mobile/lib/use-companion.ts`, `mobile/app/chat.tsx`, `mobile/lib/sira-api.ts` |
| Tests | `services/voice/tests/test_companion.py` |
| Banc d'essai | `services/voice/scripts/bench_compagnon.py` → `services/voice/benchmarks/<date>_compagnon/` |

### Résultats du banc d'essai (2026-11-09, PC de développement saturé : mémoire libre < 1 Go)

| Mesure | Résultat |
|---|---|
| Conversations conformes (1er passage, 42 réponses) | 41/42 |
| Conversations conformes (2e passage, après une règle trop large) | 37/42 ; les 5 écarts corrigés et revérifiés un par un |
| Réponses avec un chiffre sans source | 0 sur tous les passages |
| Temps médian d'une réponse | 4,2 à 4,5 s |
| Réponse qui passe par le LLM (hors sujet, phrase ambiguë) | 11 à 22 s ; jusqu'à 60 s quand la machine est saturée |
| Tests automatiques du service voix | 136 au vert (dont 16 du compagnon) |

**Constat de jour (étape 3.3)** : « le moins cher » donne bien le bus SOTRA 203 à 200 F pour le Plateau, mais le
trajet **recommandé** par SIRA-MORE reste presque toujours le taxi, même à 8 h ou 10 h. C'est le moteur, pas
l'assistant : à corriger dans SIRA-MORE avant la démo.

**Étape 3.4 (vitesse sur AWS)** : à faire après déploiement, sur signal d'Achille.

Numéros d'urgence (fiche `urgence.numeros`) : « Police 110, 111 ou 170 ; Pompiers 180 ; Ambulance 185 », d'après
le [SPF Affaires étrangères de Belgique](https://diplomatie.belgium.be/fr/pays/cote-divoire/voyager-en-cote-divoire-conseils-aux-voyageurs/securite-generale-en-cote-divoire),
confirmés par le Canada et l'Australie (lus le 2026-11-09).

## 8. Après le pitch

- Vocabulaire d'Abidjan pour l'écoute (gbaka, wôrô-wôrô, Coulé, noms de quartiers).
- Un modèle plus grand sur un serveur avec carte graphique.
- Mémoire des habitudes (trajets fréquents) proposée au voyageur, toujours gardée sur son téléphone.
