#!/usr/bin/env bash
# Serveur de test SIRA : installe Docker et lance toute la stack derrière Caddy (HTTPS automatique).
# Pour Ubuntu 24.04 sur EC2 (t3.large ou plus). Depuis la racine du projet copié sur le serveur :
#   sudo bash scripts/server/install.sh
# Le relancer est sans risque : il ne refait que ce qui manque, puis met la stack à jour.
# Procédure complète : docs/serveur-test-aws.md
set -euo pipefail

say() { printf '\n[SIRA] %s\n' "$*"; }
warn() { printf '\n[SIRA] ATTENTION : %s\n' "$*" >&2; }
die() { printf '\n[SIRA] ERREUR : %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "lance-le avec sudo : sudo bash scripts/server/install.sh"
[ -f infra/compose.yaml ] && [ -f infra/compose.server.yaml ] \
  || die "lance-le depuis la racine du projet SIRA (le dossier qui contient infra/)."

ENV_FILE=infra/server.env
COMPOSE=(docker compose --env-file "$ENV_FILE" -f infra/compose.yaml -f infra/compose.server.yaml)

# 1. Mémoire : Valhalla (tuiles) et la voix (Whisper, CamemBERT) en demandent beaucoup.
mem_mb=$(awk '/MemTotal/ { print int($2 / 1024) }' /proc/meminfo)
if [ "$mem_mb" -lt 7000 ]; then
  warn "${mem_mb} Mo de mémoire : il faut au moins 8 Go (t3.large). Valhalla et la voix risquent de s'arrêter."
fi
if ! swapon --show | grep -q .; then
  say "Création d'un swap de 4 Go (marge pour la construction des tuiles Valhalla)"
  fallocate -l 4G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# 2. Docker et Docker Compose (paquets Ubuntu, sans dépôt tiers).
if ! docker compose version >/dev/null 2>&1; then
  say "Installation de Docker"
  apt-get update -q
  DEBIAN_FRONTEND=noninteractive apt-get install -y -q docker.io docker-compose-v2 openssl curl
  systemctl enable --now docker
fi
# infra/compose.server.yaml retire le port 8080 de Nginx avec « !reset » : Compose 2.24 au moins.
compose_version=$(docker compose version --short | sed 's/^v//; s/[+-].*//')
if [ "$(printf '%s\n' 2.24.0 "$compose_version" | sort -V | head -1)" != 2.24.0 ]; then
  die "Docker Compose $compose_version trop ancien (2.24 minimum) : sudo apt-get install --only-upgrade docker-compose-v2"
fi

# 3. Secrets et adresse du serveur (infra/server.env, lisible par root seulement).
if [ ! -f "$ENV_FILE" ]; then
  cp infra/server.env.example "$ENV_FILE"
  say "infra/server.env créé à partir du modèle"
fi
chmod 600 "$ENV_FILE"

env_get() { sed -n "s/^$1=//p" "$ENV_FILE" | tail -1; }
env_set() {
  if grep -q "^$1=" "$ENV_FILE"; then sed -i "s|^$1=.*|$1=$2|" "$ENV_FILE"; else echo "$1=$2" >> "$ENV_FILE"; fi
}

for key in POSTGRES_PASSWORD COMMUNITY_JWT_SECRET; do
  if [ -z "$(env_get "$key")" ]; then
    env_set "$key" "$(openssl rand -hex 32)"
    say "$key généré"
  fi
done
# Le mot de passe entre tel quel dans DATABASE_URL : un « @ » ou un « / » casserait l'adresse.
[[ "$(env_get POSTGRES_PASSWORD)" =~ ^[A-Za-z0-9]+$ ]] \
  || die "POSTGRES_PASSWORD : lettres et chiffres seulement (vide-le pour qu'il soit généré)."

if [ -z "$(env_get SIRA_DOMAIN)" ]; then
  # Métadonnées EC2 (IMDSv2) : l'IP publique de l'instance, ou son Elastic IP.
  token=$(curl -fsS -m 3 -X PUT http://169.254.169.254/latest/api/token \
    -H 'X-aws-ec2-metadata-token-ttl-seconds: 60' || true)
  ip=$(curl -fsS -m 3 -H "X-aws-ec2-metadata-token: $token" \
    http://169.254.169.254/latest/meta-data/public-ipv4 || true)
  [ -n "$ip" ] || die "IP publique introuvable : renseigne SIRA_DOMAIN dans infra/server.env."
  env_set SIRA_DOMAIN "${ip//./-}.sslip.io"
  say "SIRA_DOMAIN = ${ip//./-}.sslip.io"
fi
domain=$(env_get SIRA_DOMAIN)

# Page de suivi /statut/ (utilisateur « sira ») : Caddy ne connaît que l'empreinte bcrypt du mot de passe,
# en base64 (un « $ » brut serait interprété par Docker Compose).
if [ -z "$(env_get SIRA_STATUS_PASSWORD)" ]; then
  env_set SIRA_STATUS_PASSWORD "$(openssl rand -hex 12)"
  env_set SIRA_STATUS_HASH ""
  say "SIRA_STATUS_PASSWORD généré (page /statut/)"
fi
if [ -z "$(env_get SIRA_STATUS_HASH)" ]; then
  env_set SIRA_STATUS_HASH "$(docker run --rm docker.io/library/caddy:2-alpine \
    caddy hash-password --plaintext "$(env_get SIRA_STATUS_PASSWORD)" | base64 -w0)"
fi

if [ "$(env_get SIRA_ENV)" = development ]; then
  warn "SIRA_ENV=development : le code SMS est renvoyé par l'API, n'importe qui peut créer un compte."
elif [ -z "$(env_get ORANGE_CLIENT_ID)" ]; then
  warn "SIRA_ENV=production sans ORANGE_* : la connexion par SMS ne marchera pas (le reste oui)."
fi

# 4. Fichiers qui ne sont pas dans Git : données de transport et modèles de la voix.
[ -d data/gtfs-demo ] || die "data/ manquant ou incomplet : copie le dossier data/ du PC (docs/serveur-test-aws.md)."
[ -d services/models/voice ] \
  || warn "services/models/voice absent : l'assistant vocal ne marchera pas (docs/serveur-test-aws.md)."

# Nginx sert l'appli web exportée (mobile/dist). Sans export, une page simple suffit :
# l'appli mobile ne parle qu'à /api/ et /socket.io/.
if [ ! -f mobile/dist/index.html ]; then
  mkdir -p mobile/dist
  cat > mobile/dist/index.html <<'HTML'
<!doctype html>
<html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>SIRA — serveur de test</title>
<body style="font-family: system-ui, sans-serif; margin: 2rem">
<h1>SIRA — serveur de test</h1>
<p>L'API est en ligne sur <code>/api/v1</code>. L'appli web n'est pas déployée sur ce serveur.</p>
</body></html>
HTML
fi

# 5. Construction et démarrage. Le premier démarrage attend Valhalla (tuiles de Côte d'Ivoire) :
# 10 à 30 minutes. Si le délai est dépassé, relancer simplement le script.
say "Construction et démarrage de la stack (premier démarrage : 10 à 30 minutes)"
mkdir -p /var/lib/sira-status
"${COMPOSE[@]}" up -d --build --remove-orphans
"${COMPOSE[@]}" ps

# Mesures de la page /statut/, chaque minute.
cat > /etc/cron.d/sira-status <<EOF
# SIRA : mesures de la page de suivi /statut/ (scripts/server/status.py)
* * * * * root cd $(pwd) && /usr/bin/python3 scripts/server/status.py >/dev/null 2>/var/lib/sira-status/error.log
EOF
python3 scripts/server/status.py || warn "première mesure de /statut/ en échec (voir /var/lib/sira-status/error.log)"

say "Vérification de https://$domain/api/v1/health"
if curl -fsS -m 30 "https://$domain/api/v1/health" >/dev/null; then
  say "SIRA est en ligne : https://$domain"
else
  warn "pas encore de réponse en HTTPS. Vérifie que les ports 80 et 443 sont ouverts (groupe de sécurité),"
  warn "puis regarde les journaux : sudo ${COMPOSE[*]} logs --tail 50 caddy api"
fi

cat <<EOF

[SIRA] Pour l'appli mobile, sur le PC :
  EXPO_PUBLIC_API_URL=https://$domain/api/v1
[SIRA] Journaux : sudo ${COMPOSE[*]} logs -f api
[SIRA] Arrêt    : sudo ${COMPOSE[*]} down   (les données restent dans les volumes)
EOF
