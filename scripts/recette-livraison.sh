#!/usr/bin/env bash
# Recette destructive uniquement sur un projet neuf, créé ici puis supprimé.
set -Eeuo pipefail
trap 'printf "Recette interrompue à la ligne %s.\n" "$LINENO" >&2' ERR
umask 077
racine=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd "$racine"
registre=${1:?Usage : recette-livraison.sh registre version dossier-neuf [--depuis-rc]}
version=${2:?Version manquante}
sortie=${3:?Dossier manquant}
mode=${4:-}
[[ -z "$mode" || "$mode" == --depuis-rc || "$mode" == --kit ]] || { echo 'Mode de recette inconnu.' >&2; exit 1; }
# Une configuration exportée par l'appelant ne doit jamais détourner la recette
# vers ses ports, ses secrets, son projet ou ses volumes existants.
unset NOM_PROJET COMPOSE_PROJECT_NAME COMPOSE_FILE COMPOSE_ENV_FILES
unset REGISTRE_RATIONARIUM VERSION_RATIONARIUM MODE_IMAGES RESEAU_INTERNE
unset POSTGRES_UTILISATEUR POSTGRES_BASE POSTGRES_MOTDEPASSE COOKIE_SECRET
unset RATIONARIUM_ADMIN_LOGIN RATIONARIUM_ADMIN_EMAIL RATIONARIUM_ADMIN_MOTDEPASSE
unset RATIONARIUM_HOTE RATIONARIUM_PORT_HTTP RATIONARIUM_PORT_HTTPS RATIONARIUM_URL_PUBLIQUE
unset DIRECTIVE_TLS COURRIEL_ACME SMTP_HOTE SMTP_PORT SMTP_TLS SMTP_UTILISATEUR SMTP_MOTDEPASSE
unset RATIONARIUM_SAUVEGARDES RATIONARIUM_RETENTION
[[ ! -e "$sortie" ]] || { echo 'La recette exige un dossier neuf.' >&2; exit 1; }
mkdir -p "$sortie"
sortie=$(cd "$sortie" && pwd)
if [[ "$mode" == --kit ]]; then
  archive=${5:?Le mode --kit exige une archive hors ligne}
  mkdir "$sortie/extraction"
  tar -xzf "$archive" -C "$sortie/extraction"
  mapfile -t kits < <(find "$sortie/extraction" -mindepth 1 -maxdepth 1 -type d)
  [[ ${#kits[@]} == 1 && -f "${kits[0]}/charger-images.sh" ]]
  mv "${kits[0]}" "$sortie/kit"
  bash "$sortie/kit/charger-images.sh"
else
  bash deploiement/preparer-compose.sh "$sortie/kit"
fi
export RECETTE_REGISTRE="$registre" RECETTE_VERSION="$version" RECETTE_SORTIE="$sortie"
python3 - <<'PY'
import os,secrets,socket
from pathlib import Path
with socket.socket() as s:
 s.bind(('127.0.0.1',0)); port=s.getsockname()[1]
with socket.socket() as s:
 s.bind(('127.0.0.1',0)); tls=s.getsockname()[1]
e={'NOM_PROJET':'rationarium-recette-'+secrets.token_hex(5),'REGISTRE_RATIONARIUM':os.environ['RECETTE_REGISTRE'],'VERSION_RATIONARIUM':os.environ['RECETTE_VERSION'],'MODE_IMAGES':'never','RESEAU_INTERNE':'true','POSTGRES_MOTDEPASSE':secrets.token_hex(24),'COOKIE_SECRET':secrets.token_hex(32),'RATIONARIUM_ADMIN_MOTDEPASSE':'Recette!'+secrets.token_hex(16),'RATIONARIUM_ADMIN_EMAIL':'admin@recette.invalid','RATIONARIUM_HOTE':'http://localhost','RATIONARIUM_PORT_HTTP':'127.0.0.1:'+str(port),'RATIONARIUM_PORT_HTTPS':'127.0.0.1:'+str(tls),'RATIONARIUM_URL_PUBLIQUE':'http://localhost:'+str(port),'SMTP_HOTE':'smtp-recette','SMTP_PORT':'2525'}
Path(os.environ['RECETTE_SORTIE']+'/kit/.env').write_text(''.join(k+'='+v+'\n' for k,v in e.items()))
PY
compose=(docker compose --project-directory "$sortie/kit")
smtp=''
nettoyer() {
  resultat=$?
  "${compose[@]}" logs --no-color > "$sortie/services.log" 2>&1 || true
  if [[ -n "$smtp" ]]; then docker rm -f "$smtp" > /dev/null 2>&1 || true; fi
  "${compose[@]}" down --volumes --remove-orphans > "$sortie/nettoyage.log" 2>&1 || true
  exit "$resultat"
}
trap nettoyer EXIT
if [[ "$mode" == --depuis-rc ]]; then
  cp "$sortie/kit/.env" "$sortie/candidate.env"
  sed -i 's|^REGISTRE_RATIONARIUM=.*|REGISTRE_RATIONARIUM=ghcr.io/elegartech|;s|^VERSION_RATIONARIUM=.*|VERSION_RATIONARIUM=1.0.0-rc.1|' "$sortie/kit/.env"
  printf 'services:\n  base:\n    image: postgres:18.6-bookworm\n' > "$sortie/kit/compose.override.yaml"
fi
"${compose[@]}" up -d --wait --wait-timeout 180
node scripts/recette-navigateur.mjs "$sortie" initiale
"${compose[@]}" exec -T api sh -c 'printf temoin-initial > /var/lib/rationarium/documents/recette-migration.txt'
if [[ "$mode" == --depuis-rc ]]; then
  bash "$sortie/kit/sauvegarde.sh" "$sortie/sauvegardes-rc"
  cp "$sortie/candidate.env" "$sortie/kit/.env"
  rm "$sortie/kit/compose.override.yaml"
  "${compose[@]}" up -d --wait --wait-timeout 180
  node scripts/recette-navigateur.mjs "$sortie" migration
  [[ $("${compose[@]}" exec -T api cat /var/lib/rationarium/documents/recette-migration.txt) == temoin-initial ]]
fi
reseau=$(docker inspect "$("${compose[@]}" ps -q base)" --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}')
smtp=$(docker run -d --rm --network "$reseau" --network-alias smtp-recette --user "$(id -u):$(id -g)" --mount "type=bind,src=$sortie,dst=/recette" --mount "type=bind,src=$racine/scripts/recette-smtp.cjs,dst=/smtp.cjs,readonly" --entrypoint node "$registre/rationarium-api:$version" /smtp.cjs)
node scripts/recette-navigateur.mjs "$sortie" courriel
node scripts/recette-parcours.cjs "$sortie"
node scripts/recette-droits.cjs "$sortie"
# Vérifier les hypothèses de configuration de la qualification système.
"${compose[@]}" exec -T base psql -U rationarium -d rationarium -At -v ON_ERROR_STOP=1 -c "SELECT current_setting('ssl'); SELECT extname FROM pg_extension; SELECT auth_method FROM pg_hba_file_rules WHERE auth_method = 'ldap';" > "$sortie/postgresql-contexte.txt"
[[ $(head -n 1 "$sortie/postgresql-contexte.txt") == off ]]
! grep -Eq '^(ldap|plperl)$' "$sortie/postgresql-contexte.txt"
docker inspect "$("${compose[@]}" ps -q base)" --format '{{json .NetworkSettings.Ports}}' | node -e '
  const ports = JSON.parse(require("node:fs").readFileSync(0, "utf8"));
  if (Object.values(ports).some(bindings => bindings?.length)) throw Error("La base publie un port hôte.");
'
"${compose[@]}" exec -T api sh -c 'printf recette-document > /var/lib/rationarium/documents/recette.txt'
bash "$sortie/kit/sauvegarde.sh" "$sortie/sauvegardes"
"${compose[@]}" exec -T base psql -U rationarium -d rationarium -v ON_ERROR_STOP=1 -c "UPDATE users SET prenom = 'Corrompu' WHERE login = 'admin';"
"${compose[@]}" exec -T api sh -c 'printf corrompu > /var/lib/rationarium/documents/recette.txt'
mapfile -t archives < <(find "$sortie/sauvegardes" -name '*.dump')
[[ ${#archives[@]} == 1 ]]
bash "$sortie/kit/restauration.sh" "${archives[0]}" --sans-confirmation
"${compose[@]}" up -d --wait --wait-timeout 180
[[ $("${compose[@]}" exec -T api cat /var/lib/rationarium/documents/recette.txt) == recette-document ]]
node scripts/recette-navigateur.mjs "$sortie" restauration
python3 - <<'PYHTTPS'
import os
from pathlib import Path
p=Path(os.environ['RECETTE_SORTIE']+'/kit/.env')
s=p.read_text(); e=dict(l.split('=',1) for l in s.splitlines() if '=' in l)
s=s.replace('RATIONARIUM_HOTE=http://localhost','RATIONARIUM_HOTE=localhost')
s=s.replace(e['RATIONARIUM_URL_PUBLIQUE'],'https://localhost:'+e['RATIONARIUM_PORT_HTTPS'].split(':')[-1])
p.write_text(s+'DIRECTIVE_TLS=tls internal\n')
PYHTTPS
"${compose[@]}" up -d --wait --wait-timeout 180
"${compose[@]}" cp web:/data/caddy/pki/authorities/local/root.crt "$sortie/autorite.crt"
url=$(sed -n 's/^RATIONARIUM_URL_PUBLIQUE=//p' "$sortie/kit/.env")
curl --fail --silent --show-error --cacert "$sortie/autorite.crt" "$url/api/sante/pret" > "$sortie/https.json"
node scripts/recette-navigateur.mjs "$sortie" https
printf 'Installation, connexion, SMTP, sauvegarde, restauration et HTTPS : OK\n'  > "$sortie/VERDICT.txt"
