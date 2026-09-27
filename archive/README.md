# Archive

Fichiers qui ne servent plus au projet mais qu'on garde pour référence.
**Rien ici n'est utilisé par le code** : ce dossier est exclu du typage, du lint et des images Docker.

| Dossier / fichier | Contenu | Pourquoi archivé |
| --- | --- | --- |
| `modele-web/` | Restes du modèle de départ du site web (connexion ChatGPT, base D1/Drizzle, exemple `notes`, icônes par défaut) | Jamais utilisés par SIRA |
| `modele-mobile/` | Écrans et composants d'exemple du modèle Expo (écran « modal », `hello-wave`, `parallax-scroll-view`, `collapsible`, textes « themed », script `reset-project`) | Remplacés par les écrans de la maquette |
| `ancien-code/sira-more.mjs` | Première version JavaScript de la classification des modes de transport | Remplacée par le moteur Python `services/ai` et le graphe de `services/api` |
| `SIRA_MVP_Source_Maquettes.zip` | Ancienne copie compressée des sources et maquettes | Doublon du dépôt ; l'historique git fait foi |

## Remettre un fichier en service

Chaque fichier a été déplacé avec `git mv` : son historique est conservé. Pour le remettre à sa place d'origine :

```bash
git mv archive/modele-mobile/components/hello-wave.tsx mobile/components/hello-wave.tsx
```

Si un fichier doit être supprimé définitivement, le faire depuis ce dossier après accord de l'équipe.
