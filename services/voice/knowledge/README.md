# Base de connaissances de SIRA (FAQ)

Ce que SIRA répond aux questions qui ne sont pas des demandes de trajet (« c'est quoi un gbaka ? »,
« comment signaler un accident ? ») et aux questions sur le trajet en cours (« je descends où ? »).
Chargée par `app/knowledge.py` au démarrage du service vocal : **modifier un fichier puis relancer le service**.

## Format d'une fiche

```markdown
## modes.gbaka                      ← identifiant unique (renvoyé dans « sources »)
? C'est quoi un gbaka ?             ← une façon de poser la question (une par ligne, autant qu'on veut)
? Le gbaka c'est quoi ?
Le gbaka est un minibus…            ← la réponse lue par SIRA : 2 phrases maximum, en « tu », sans nouchi
```

- `action: trip_eta` à la place d'une réponse : la réponse est calculée sur le trajet en cours
  (SIRA-MORE, signalements des voyageurs), jamais écrite à la main. Actions : `trip_summary`, `trip_eta`,
  `trip_price`, `trip_stops`, `trip_transfer`, `trip_incidents`.
- Aucun prix, horaire ou durée inventé : les chiffres viennent du moteur. Les informations tirées des données
  de 2021 le disent (« d'après les données de 2021 »).
- Les lignes qui commencent par `#` (titres) ou `<!--` sont ignorées.

| Fichier | Contenu |
|---|---|
| `sira.md` | utiliser l'application, compte, voix, confidentialité |
| `modes.md` | gbaka, wôrô-wôrô, bus SOTRA, bateau-bus, taxi ; Coulé / Debout / Suspendu |
| `lexique.md` | mots d'Abidjan compris par SIRA (lexique fr-CI v0.4, onglet 04_Lexique) |
| `reseau.md` | bateau-bus et réseau (données data.gouv.ci 2021, à valider) |
| `trajet.md` | questions sur le trajet en cours (réponses calculées) |
| `echanges.md` | bonjour, merci, au revoir |
