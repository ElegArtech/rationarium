# Qualification de sécurité de la livraison

État du 3 octobre 2026. Cette analyse accompagne la candidate 1.0.0 ; elle ne remplace pas les rapports bruts.

## Règle de validation

L'audit npm de production refuse tout avis. L'audit complet et le scan système refusent toute alerte non qualifiée dans leur périmètre : tous les avis npm, et les niveaux HIGH/CRITICAL des images. Les autres gravités des images restent recensées. Une exception est liée à un avis, un paquet, une version installée et un contexte exact. Elle porte une source, une justification et une expiration ; il n'existe pas d'exclusion globale par paquet.

Les qualifications actuelles expirent le **3 novembre 2026**. Après cette date, une construction ne passe plus avec ces exceptions. Elles ne doivent pas être prolongées automatiquement. Le changement de version d'un paquet, l'arrivée d'un nouvel avis ou une modification des usages nécessitent une réévaluation.

## Exposition examinée

| Famille | Condition retenue | Vérification ou limite |
| --- | --- | --- |
| braces / Stylelint | Motifs de développement provenant du dépôt ; aucune entrée métier | Audit des chemins npm ; interdiction de braces et Stylelint dans l'image API |
| gosu / bibliothèque Go | Changement d'identité puis exécution ; fonctions réseau, XML, templates et TLS des avis inutilisées | Source gosu et politique de sécurité éditeur ; le binaire reste présent |
| OpenSSL | Avis visant DTLS ; PostgreSQL utilise TCP, sans DTLS | Configuration réelle ; cette qualification ne couvre pas un autre usage de la bibliothèque |
| libxml2 | Aucun traitement XML SQL dans les requêtes livrées ; aucun accès SQL offert aux utilisateurs | Recherche des usages, base sans port hôte ; la bibliothèque reste accessible à un administrateur SQL |
| Perl, SQLite, PCRE2 | Aucun traitement de données métier par les fonctions visées | PostgreSQL, API Node et scripts d'exploitation inspectés ; plperl absent, architecture 64 bits |
| util-linux, ACL | Outils de montage, nsenter et modifications ACL non appelés par le produit | Pas de privilège SYS_ADMIN ni mode privileged ; pas de montage fstab utilisateur, volume privé |
| ncurses | Pas de description de terminal fournie par les utilisateurs du produit | Services et scripts sans terminal interactif |
| systemd-homed | Service absent | Vérification dans l'image |
| MiniZip | Fonction vulnérable non fournie par zlib1g | Absence de libminizip dans l'image |
| gzip | Avis portant sur LZH/LZW ; sauvegardes gzip connues et vérifiées | Scripts de sauvegarde/restauration et vérification des empreintes |
| LDAP | Aucune authentification PostgreSQL LDAP configurée | Inspection effective des règles pg_hba pendant la recette |

Le fichier `deploiement/securite-exceptions.json` contient la liste exacte et les sources par avis. Une hypothèse de non-utilisation est une qualification d'exposition, pas une suppression de vulnérabilité. Les administrateurs du serveur peuvent modifier ces conditions : activer une extension, une console SQL, un montage privilégié ou un service supplémentaire impose de reprendre l'analyse.

## Reproduction

```bash
bash scripts/auditer-npm.sh .local/preuves-npm
bash scripts/installer-trivy.sh .local/outils
TRIVY_BIN=.local/outils/trivy bash scripts/scanner-images.sh REGISTRE 1.0.0 .local/preuves-images
bash scripts/recette-livraison.sh REGISTRE 1.0.0 .local/recette-neuve
```

La recette crée son projet et ses volumes propres ; son dossier doit être neuf. Elle conserve des secrets de test et des sauvegardes privées dans `.local`, à ne pas publier. Les rapports Trivy contiennent l'inventaire des paquets et les identifiants des images. Les archives sont produites ensuite à partir des mêmes images, sans reconstruction.

Les scans et tests ne prouvent pas l'absence de défaut inconnu et ne constituent pas une certification de sécurité ou d'accessibilité. Le bilan précise les contrôles réellement exécutés et leurs limites.
