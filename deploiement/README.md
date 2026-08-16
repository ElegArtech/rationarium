# Déploiement et exploitation de Trame

Ce dossier contient tout ce qu'il faut pour installer, sauvegarder, restaurer et
quitter Trame. Il vise **une machine unique en Docker Compose**, qui est
l'hypothèse retenue par `cadrage/03 § 3.1`. La question B5 — machine unique ou
orchestrateur existant — reste ouverte ; ce qu'elle changerait est au § 6.

Tout ce qui est écrit ici a été **exécuté**, pas seulement rédigé : construction
des deux images, démarrage complet, migration, sonde de disponibilité,
sauvegarde, restauration et export de réversibilité. Ce qui n'a pas pu l'être
est dit comme tel.

---

## 1. Ce qui tourne

| Service | Image | Rôle |
| --- | --- | --- |
| `base` | `postgres:18.6-bookworm` | La seule dépendance de données (`ADR-0007`) |
| `migrations` | construite | Applique les migrations, puis s'arrête |
| `api` | construite | Serveur applicatif (NestJS / Fastify) |
| `web` | construite | Caddy : TLS, fichiers statiques, relais `/api` |

Un seul état persistant : le volume `donnees`. Le volume `caddy` ne contient
que l'autorité de certification locale — perdable, au prix d'un avertissement
sur chaque poste.

---

## 2. Installation

```bash
cd deploiement
cp env.exemple .env
$EDITOR .env                       # les valeurs OBLIGATOIRE n'ont pas de défaut
docker compose up -d --build
```

Compose refuse de démarrer si `POSTGRES_MOTDEPASSE` ou `COOKIE_SECRET`
manquent : mieux vaut un refus qu'une instance avec un secret prévisible.

L'ordre est tenu par les conditions de démarrage, pas par des temporisations :
`base` doit être *saine*, `migrations` doit s'être *terminée avec succès*, et
`web` attend que `api` réponde à sa sonde de disponibilité.

**Vérification :**

```bash
curl -k https://$TRAME_HOTE/api/sante/pret
# {"etat":"pret","base":true,"schema":true,"file":true}
```

### Réseau fermé (`C1`)

La construction des images demande un accès sortant (registre npm, images de
base). Une machine de production sans accès sortant se sert d'images
construites ailleurs :

```bash
# sur la machine connectée
docker compose build
docker save trame-api trame-web postgres:18.6-bookworm | gzip > trame-images.tar.gz
# sur la machine cible
gunzip -c trame-images.tar.gz | docker load
docker compose up -d          # sans --build
```

Le point de vigilance est celui d'`ADR-0006` : l'image du serveur embarque le
**moteur de schéma** de Prisma (22 Mo) et l'épingle par
`PRISMA_SCHEMA_ENGINE_BINARY`. Sans lui, `prisma migrate deploy` tenterait de
le télécharger — et la migration échouerait au premier déploiement, pas à la
construction.

---

## 3. Sauvegarde

```bash
./sauvegarde.sh
```

Produit deux fichiers horodatés dans `$TRAME_SAUVEGARDES` :

- `trame-<horodatage>.dump` — la base, en format personnalisé compressé ;
- `trame-<horodatage>.roles.sql` — **les rôles et leurs privilèges**, que
  `pg_dump` n'emporte pas. `CREATE ROLE` est global à l'instance : une
  restauration sur une instance neuve sans ce fichier rendrait une base
  correcte à laquelle l'application ne peut pas se connecter, et dont le
  journal d'audit serait modifiable.

Chaque archive est **relue immédiatement** par `pg_restore --list`. Le mode de
défaillance visé est le disque plein, qui produit un fichier de taille
plausible et illisible.

Depuis `cron`, une fois par nuit :

```
30 2 * * * cd /opt/trame/deploiement && ./sauvegarde.sh >> /var/log/trame-sauvegarde.log 2>&1
```

**Ce que le script ne fait pas** : la copie hors machine. Une sauvegarde qui vit
sur le disque qu'elle protège ne protège que de l'erreur humaine. La fréquence,
la rétention et la destination hors site relèvent de la politique de sauvegarde
laissée ouverte par `cadrage/03 § 8.3`.

---

## 4. Restauration

```bash
./restauration.sh /var/sauvegardes/trame/trame-20260816T023000Z.dump
```

La procédure arrête l'application, restaure les rôles, recrée la base, restaure
les données, **vérifie** — nombre d'utilisateurs, présence de la contrainte
d'exclusion des congés, privilèges de `trame_app` sur le journal d'audit — puis
redémarre. Elle nomme ce qu'elle va détruire et demande confirmation.

Le cycle complet est **rejoué à chaque boucle de vérification**, sur PostgreSQL
réel : `apps/api/src/exploitation/sauvegarde.int.test.ts`. Une procédure de
restauration jamais rejouée n'est pas une sauvegarde, c'est une intention.

---

## 5. Réversibilité (`C14`)

`cadrage/01 § 7` : « Toutes les données sont exportables dans des formats
ouverts. »

```bash
docker compose exec api node /trame/packages/db/dist/reversibilite-cli.js /tmp/export
docker compose cp api:/tmp/export ./export-trame
```

Produit, pour **chacune des 48 tables** :

- `<table>.jsonl` — une ligne JSON par enregistrement. C'est le format de
  reprise : il distingue `null` de la chaîne vide et garde les objets JSON.
- `<table>.csv` — le même contenu, lisible par un tableur (indicateur d'ordre
  UTF-8, fins de ligne CRLF, guillemets doublés).
- `manifeste.json` — la liste des tables, leurs comptes, et la migration
  appliquée.

La liste des tables n'est écrite nulle part : elle est lue dans le catalogue de
PostgreSQL. Une table ajoutée demain y entre sans qu'on touche au code.
`apps/api/src/exploitation/reversibilite.int.test.ts` vérifie la couverture
**contre le fichier de schéma**, puis relit l'export intégralement dans une base
neuve — un export qu'on ne sait pas relire n'a jamais été vérifié.

---

## 6. Ce que la question B5 changerait

`cadrage/03 § 8.2` laisse ouverte la cible de déploiement. Ce dossier couvre la
machine unique. Passer à plusieurs exemplaires applicatifs **ne se règle pas en
ajoutant `deploy: replicas: 2`** : quatre points sont à décider puis à éprouver.

| Point | État aujourd'hui | À éprouver si plusieurs exemplaires |
| --- | --- | --- |
| Sessions | Opaques, en base (`ADR-0008`) — déjà partagées | Rien à changer ; à vérifier sous répartition |
| Verrou d'instance unique | `singletonKey` de `pg-boss` (`RG-NTF-02`) | Deux exemplaires ne doivent envoyer qu'une fois : à mesurer, pas à supposer |
| Migrations | Service à part, exécuté une fois | Une seule exécution, jamais concurrente |
| Terminaison TLS | Caddy, sur la machine | Répartiteur en amont, en-têtes `X-Forwarded-*` (`trustProxy` est déjà actif) |

La conception les supporte. Aucun n'est **vérifié** sous répartition, et
l'écrire ici sans l'avoir mesuré serait exactement le genre d'affirmation que
`cadrage/04` interdit.

---

## 7. Exploitation courante

```bash
docker compose ps                     # état des services
docker compose logs -f api            # journaux du serveur
docker compose exec base psql -U "$POSTGRES_UTILISATEUR" -d "$POSTGRES_BASE"
docker compose up -d --build          # mise à jour après un git pull
```

**Sondes.** `/api/sante` répond à « ce processus vit-il ? » sans toucher la
base ; `/api/sante/pret` répond à « puis-je lui envoyer du trafic ? » et rend
`503` si la base est injoignable ou si une migration est en cours. Ne pas
brancher une sonde de *vivacité* sur la base : un redémarrage ne répare pas une
base en panne, il ajoute une panne à une panne.

**Partitions du journal d'audit.** Le journal est partitionné par mois avec une
partition par défaut qui rattrape tout. Créer les partitions à l'avance :

```sql
SELECT creer_partition_audit((CURRENT_DATE + interval '1 month')::date);
```

La rétention du journal (`cadrage/03 § 8.4`) n'est pas arbitrée : sans décision,
aucune partition n'est détachée et le journal croît indéfiniment. C'est un choix
conservateur — on ne détruit pas une trace par défaut.
