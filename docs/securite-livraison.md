# Sécurité de la livraison

État du 3 octobre 2026, après reprise des alertes PostgreSQL. Cette analyse accompagne la candidate 1.0.0 ; les rapports bruts restent la preuve des images effectivement construites.

## Règle de validation

- npm production : zéro avis, sans exception.
- PostgreSQL : **zéro avis, toutes gravités confondues, sans exception**. Une ancienne qualification, même ajoutée au fichier, ne permet plus de faire passer un avis de cette image.
- API et web : refus des alertes HIGH/CRITICAL non qualifiées ; les autres gravités restent recensées.
- npm de développement : exceptions exactes par avis, paquet, version et chemin, avec source, justification et expiration.

## Correction PostgreSQL

L'image Bookworm conservait 487 occurrences, dont 118 HIGH/CRITICAL correspondant à 54 avis distincts. Leur qualification comme fonctions inutilisées a été abandonnée. PostgreSQL 18.6 est reconstruit depuis les sources officielles vérifiées, sans XML/XSLT/LLVM ; l’étape finale Alpine ne contient ni libxml2 ni gosu, et le démarrage emploie su-exec. Les 118 exceptions PostgreSQL sont supprimées du fichier de politique. Le scan de la nouvelle image mesure zéro avis de toute gravité. Il est complété par le contrôle des versions corrigées et de l’absence matérielle des composants retirés : le premier prototype Alpine, pourtant scanné à zéro, est refusé car il gardait libxml2 2.13.

La migration est logique, vers un volume neuf. Le démarrage d'un ancien volume Debian est refusé. L'ancien volume est conservé pour un retour arrière avant réouverture ; les données et les index sont vérifiés après restauration. Voir [la décision technique](adr/ADR-20261003-postgresql-alpine.md) et [la procédure de migration](migration-postgresql.md).

## Avis restant hors PostgreSQL

L'avis braces de Stylelint concerne les motifs de développement du dépôt ; le paquet n'est pas embarqué dans l'API. Ses quatre chemins qualifiés expirent le **3 novembre 2026**, sans prolongation automatique. L'image web conserve l'avis UNKNOWN GO-2026-5932 sur le module OpenPGP ; il reste visible. Ces avis ne sont pas corrigés par le travail PostgreSQL. L'API ne présente pas d'alerte dans le scan courant.

## Reproduction

```bash
bash scripts/auditer-npm.sh .local/preuves-npm
bash scripts/installer-trivy.sh .local/outils
TRIVY_BIN=.local/outils/trivy bash scripts/scanner-images.sh REGISTRE 1.0.0 .local/preuves-images
bash scripts/recette-livraison.sh REGISTRE 1.0.0 .local/recette-neuve
bash scripts/recette-livraison.sh REGISTRE 1.0.0 .local/recette-migration --depuis-rc
```

Chaque recette exige son dossier neuf, crée ses propres ressources et conserve ses secrets temporaires dans `.local`, jamais dans les artefacts publics. Les scans comprennent les inventaires et identifiants des images. Les archives exportent les mêmes images contrôlées. L'absence d'avis connus ne prouve pas l'absence de défaut inconnu ; ces essais ne constituent pas une certification de sécurité ou RGAA.
