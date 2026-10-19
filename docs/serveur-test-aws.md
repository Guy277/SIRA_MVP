# Serveur de test SIRA sur AWS (EC2, Stockholm)

But : un serveur en ligne, en HTTPS, auquel l'appli mobile parle (`https://<adresse>/api/v1`).
Toute la stack de `infra/compose.yaml` tourne sur une seule machine, derrière **Caddy** (certificat HTTPS
automatique). Fichiers : `infra/compose.server.yaml`, `infra/Caddyfile`, `infra/server.env.example`,
`scripts/server/install.sh`.

## Coût (estimation, prix à la demande, eu-north-1)

| Poste | Allumé 24 h/24 | Allumé 12 h par jour en semaine |
|---|---|---|
| t3.large (2 vCPU, 8 Go) | ≈ 63 USD | ≈ 22 USD |
| Disque 40 Go gp3 | ≈ 3 USD | ≈ 3 USD |
| Elastic IP | ≈ 4 USD | ≈ 4 USD |
| **Total** | **≈ 70 USD / mois** | **≈ 30 USD / mois** |

À confirmer dans le calculateur AWS (https://calculator.aws/). Une instance arrêtée ne coûte plus que le disque et l'IP.
Le quota du compte à Stockholm est de 5 vCPU : t3.large (2) ou t3.xlarge (4) passent sans demande.

## 1. Avant de créer quoi que ce soit (console AWS)

- **MFA** sur l'utilisateur IAM (IAM → Utilisateurs → ton utilisateur → Informations d'identification de sécurité).
- **Alerte budget** : Billing → Budgets → budget mensuel (ex. 50 USD) avec un e-mail à 80 %.
- Région en haut à droite : **Europe (Stockholm) eu-north-1**.

## 2. Créer le serveur (EC2 → Lancer une instance)

| Réglage | Valeur |
|---|---|
| Nom | `sira-test` |
| Image | Ubuntu Server 24.04 LTS, **x86 (64 bits)** (pas Arm : l'image PostGIS n'existe pas en Arm) |
| Type | `t3.large` (`t3.xlarge` si la voix est trop lente) |
| Paire de clés | `sira-test` : clé `ssh-keygen -t ed25519 -f $HOME\.ssh\sira-test` faite sur le PC, clé publique importée (EC2 → Paires de clés → Importer) ; la clé privée ne quitte jamais le PC |
| Groupe de sécurité | SSH (22) depuis **Mon IP** seulement ; HTTP (80) et HTTPS (443) depuis partout |
| Stockage | 40 Go gp3 |

Puis EC2 → **Adresses IP Elastic** → Allouer → Associer à `sira-test`. Sans IP fixe, l'adresse change à chaque
redémarrage de l'instance, et l'adresse `…sslip.io` de l'appli avec elle.

## 3. Copier le projet sur le serveur (PowerShell, sur le PC)

`data/` et `services/models/voice/` ne sont pas dans Git : on copie le dossier du PC tel quel.

```powershell
cd C:\Users\user\Desktop\SIRA
tar -czf ..\sira-serveur.tgz --exclude=node_modules --exclude=.git --exclude=.venv --exclude=__pycache__ --exclude=mobile/dist --exclude=data/abidjan-master.zip .
scp -i $HOME\.ssh\sira-test ..\sira-serveur.tgz ubuntu@<IP-ELASTIQUE>:~
ssh -i $HOME\.ssh\sira-test ubuntu@<IP-ELASTIQUE>
```

## 4. Installer et lancer (sur le serveur)

```bash
mkdir -p ~/sira && tar -xzf ~/sira-serveur.tgz -C ~/sira && cd ~/sira
sudo bash scripts/server/install.sh
```

Le script installe Docker, ajoute 4 Go de swap, crée `infra/server.env` (mot de passe Postgres et secret des
sessions générés, adresse `<ip-avec-tirets>.sslip.io` déduite de l'IP) puis lance la stack. Le premier démarrage
prend 10 à 30 minutes (Valhalla construit les tuiles de Côte d'Ivoire) ; si le délai est dépassé, relancer le script.

À la fin il affiche l'adresse, par exemple `https://13-51-20-30.sslip.io`. Test :
`https://13-51-20-30.sslip.io/api/v1/health`.

**Connexion par SMS** : `SIRA_ENV=production` par défaut, il faut alors les identifiants Orange dans
`infra/server.env`. `SIRA_ENV=development` renvoie le code SMS dans la réponse de l'API : pratique pour une démo,
mais n'importe qui peut alors créer un compte. Après un changement : relancer le script.

## 5. Brancher l'appli mobile (sur le PC)

```powershell
cd C:\Users\user\Desktop\SIRA\mobile
$env:EXPO_PUBLIC_API_URL = "https://16-16-129-62.sslip.io/api/v1"
npx expo start
```

Adresse **complète** avec `/api/v1` : l'appli en déduit aussi celle des signalements en direct.

## Tous les jours

- **Voir l'état du serveur** : `https://16-16-129-62.sslip.io/statut/`, utilisateur `sira`, mot de passe donné par
  `sudo grep SIRA_STATUS_PASSWORD infra/server.env` (sur le serveur). Services, vérifications (API, PostGIS,
  Valhalla, certificat), disque, mémoire, contenu de la base, réglages SMS. Mesures prises chaque minute par
  `scripts/server/status.py` (`/etc/cron.d/sira-status`) ; un bandeau rouge signale ce qui ne va pas. La console
  AWS (EC2 → `sira-test`) ne montre que la machine : allumée ou non, processeur, coût.

- **Arrêter / démarrer** : EC2 → Instances → `sira-test` → État de l'instance. La stack redémarre toute seule.
- **Mettre à jour** (depuis le PC) : `npm run server:update -- <cible>` envoie seulement les fichiers modifiés
  et relance le bon conteneur. `--dry-run` montre d'abord ce qui partirait.

  | Cible | Envoie | Puis |
  |---|---|---|
  | `api`, `engine`, `community`, `voice` | `services/<cible>` | reconstruit ce conteneur seul |
  | `models` | `services/models/voice` | redémarre la voix |
  | `data` | `data/` | redémarre l'API |
  | `infra` | `infra/`, `scripts/server/` | relance la stack, Nginx et Caddy |
  | `all` | tout ce qui précède | |

  Exemple après un nouvel entraînement : `npm run server:update -- models`. Plusieurs cibles à la fois :
  `npm run server:update -- api voice`. Les fichiers supprimés sur le PC le sont aussi sur le serveur (dans la
  cible seulement) ; `infra/server.env` et les données (volumes Docker) ne sont jamais touchés. Autre serveur :
  variables `SIRA_SERVER` (défaut `ubuntu@16.16.129.62`) et `SIRA_SERVER_KEY` (défaut `~/.ssh/sira-test`).
  Pour tout réinstaller : recopier l'archive (étape 3) et relancer `install.sh`.
- **Journaux** : `sudo docker compose --env-file infra/server.env -f infra/compose.yaml -f infra/compose.server.yaml logs -f api`

## Limites connues

- Une seule machine : les signalements et les compteurs anti-abus sont en mémoire et repartent de zéro au redémarrage.
- `sslip.io` est un service gratuit tiers. Si Let's Encrypt refuse le certificat (limite atteinte), passer à un
  domaine de l'entreprise : enregistrement DNS A vers l'IP Elastic, puis `SIRA_DOMAIN=test.<domaine>` et relancer.
