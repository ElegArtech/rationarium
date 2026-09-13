#!/usr/bin/env bash
# Configure une installation neuve et la démarre avec Docker Compose.
set -euo pipefail
umask 077
DEPOT_RATIONARIUM=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
cd "$DEPOT_RATIONARIUM"
[[ ! -e .env ]] || { echo '.env existe déjà. Il est conservé ; utiliser docker compose up -d pour démarrer.' >&2; exit 1; }
command -v docker > /dev/null || { echo 'Installer Docker Engine et Docker Compose avant de continuer.' >&2; exit 1; }
docker info > /dev/null 2>&1 || { echo 'Docker doit être démarré et accessible à votre compte.' >&2; exit 1; }
docker compose version > /dev/null
for outil in od tr; do command -v "$outil" > /dev/null; done
exec 3<> /dev/tty
printf 'Installation de Rationarium\nDossier : %s\n\n' "$DEPOT_RATIONARIUM" >&3
read -r -p 'Adresse publique [http://localhost:8080] : ' ORIGINE <&3
ORIGINE=${ORIGINE:-http://localhost:8080}
ORIGINE=${ORIGINE%/}
if [[ ! "$ORIGINE" =~ ^(http|https)://([A-Za-z0-9.-]+)(:([0-9]+))?$ ]]; then
  echo 'Saisir une origine HTTP ou HTTPS, sans chemin, par exemple https://planning.example.org.' >&2; exit 1
fi
PROTOCOLE=${BASH_REMATCH[1]}
HOTE=${BASH_REMATCH[2]}
PORT_PUBLIC=${BASH_REMATCH[4]:-}
PORT_HTTP=${RATIONARIUM_PORT_HTTP:-80}
PORT_HTTPS=${RATIONARIUM_PORT_HTTPS:-8443}
if [[ "$PROTOCOLE" == http ]]; then PORT_HTTP=${PORT_PUBLIC:-80}; else PORT_HTTPS=${PORT_PUBLIC:-443}; fi
[[ "$PORT_HTTP" =~ ^[0-9]{1,5}$ && "$PORT_HTTPS" =~ ^[0-9]{1,5}$ ]] || { echo 'Le port doit être un nombre entre 1 et 65535.' >&2; exit 1; }
PORT_HTTP=$((10#$PORT_HTTP))
PORT_HTTPS=$((10#$PORT_HTTPS))
if (( PORT_HTTP < 1 || PORT_HTTP > 65535 || PORT_HTTPS < 1 || PORT_HTTPS > 65535 )); then echo 'Le port doit être compris entre 1 et 65535.' >&2; exit 1; fi
if [[ "$PROTOCOLE" == http && "$HOTE" != localhost && "$HOTE" != 127.0.0.1 ]]; then
  echo 'Pour un accès réseau, utiliser une adresse HTTPS afin de protéger la session.' >&2; exit 1
fi
DIRECTIVE_TLS=
if [[ "$PROTOCOLE" == https ]]; then
  read -r -p 'Certificat HTTPS : automatique, fourni ou interne [automatique] : ' TLS <&3
  case ${TLS:-automatique} in
    automatique) ;;
    fourni)
      [[ -f certificats/site.crt && -f certificats/site.key ]] || { echo 'Déposer site.crt et site.key dans certificats/, puis relancer.' >&2; exit 1; }
      DIRECTIVE_TLS='tls /etc/rationarium/certificats/site.crt /etc/rationarium/certificats/site.key' ;;
    interne) DIRECTIVE_TLS='tls internal' ;;
    *) echo 'Choisir automatique, fourni ou interne.' >&2; exit 1 ;;
  esac
fi
read -r -p 'Identifiant du premier administrateur [admin] : ' RATIONARIUM_ADMIN_LOGIN <&3
RATIONARIUM_ADMIN_LOGIN=${RATIONARIUM_ADMIN_LOGIN:-admin}
read -r -p 'Courriel de l’administrateur : ' RATIONARIUM_ADMIN_EMAIL <&3
[[ "$RATIONARIUM_ADMIN_EMAIL" == *@*.* ]] || { echo 'Renseigner un courriel valide.' >&2; exit 1; }
read -r -s -p 'Mot de passe de l’administrateur (12 caractères minimum) : ' RATIONARIUM_ADMIN_MOTDEPASSE <&3
printf '\n' >&3
read -r -s -p 'Confirmer le mot de passe : ' CONFIRMATION <&3
printf '\n' >&3
[[ ${#RATIONARIUM_ADMIN_MOTDEPASSE} -ge 12 && "$RATIONARIUM_ADMIN_MOTDEPASSE" == "$CONFIRMATION" ]] || { echo 'Les mots de passe doivent être identiques et contenir au moins 12 caractères.' >&2; exit 1; }
secret() { od -An -N32 -tx1 /dev/urandom | tr -d ' \n'; }
ecrire() {
  local valeur=$2
  valeur=${valeur//\\/\\\\}
  valeur=${valeur//\"/\\\"}
  valeur=${valeur//\$/\$\$}
  printf '%s="%s"\n' "$1" "$valeur"
}
CONFIG_TEMP=$(mktemp .env.XXXXXXXX)
trap 'rm -f -- "$CONFIG_TEMP"' EXIT
cat .env.example > "$CONFIG_TEMP"
{
  printf '\n# Configuration de cette installation\n'
  ecrire POSTGRES_MOTDEPASSE "$(secret)"
  ecrire COOKIE_SECRET "$(secret)"
  ecrire RATIONARIUM_HOTE "$PROTOCOLE://$HOTE"
  ecrire RATIONARIUM_URL_PUBLIQUE "$ORIGINE"
  ecrire RATIONARIUM_PORT_HTTP "$PORT_HTTP"
  ecrire RATIONARIUM_PORT_HTTPS "$PORT_HTTPS"
  ecrire DIRECTIVE_TLS "$DIRECTIVE_TLS"
  ecrire RATIONARIUM_ADMIN_LOGIN "$RATIONARIUM_ADMIN_LOGIN"
  ecrire RATIONARIUM_ADMIN_EMAIL "$RATIONARIUM_ADMIN_EMAIL"
  ecrire RATIONARIUM_ADMIN_MOTDEPASSE "$RATIONARIUM_ADMIN_MOTDEPASSE"
  ecrire NOM_PROJET "${NOM_PROJET:-rationarium}"
} >> "$CONFIG_TEMP"
docker compose --env-file "$CONFIG_TEMP" config --quiet
mv "$CONFIG_TEMP" .env
unset RATIONARIUM_ADMIN_MOTDEPASSE CONFIRMATION
printf '\nConfiguration créée. Préparation des images et démarrage…\n'
docker compose up -d --wait
printf '\nRationarium est prêt : %s\nConnectez-vous avec le compte %s.\n' "$ORIGINE" "$RATIONARIUM_ADMIN_LOGIN"
printf 'Le changement de mot de passe sera demandé à la première connexion. Retirer ensuite les paramètres RATIONARIUM_ADMIN_* de .env.\n'
