# Migration PostgreSQL Debian vers Alpine

La candidate 1.0.0 remplace PostgreSQL 18.6 Bookworm par PostgreSQL 18.6 Alpine corrigé. **Ne pas lancer simplement `docker compose up` sur une installation rc.1.** Un volume Debian exige une restauration logique dans un volume neuf. Le démarrage direct est refusé avant l'ouverture de la base.

## Préparation

1. Réserver une fenêtre de maintenance et bloquer les accès utilisateurs. Disposer de place pour l'ancien volume, le nouveau et la sauvegarde complète.
2. Charger les trois images 1.0.0 depuis le kit, conserver les images rc.1 et une copie du kit/configuration précédents. Ne pas exécuter `docker image prune` ou `docker volume prune`.
3. Dans le répertoire de l'installation existante, remplacer les fichiers du kit par ceux de 1.0.0 **en préservant `.env`, certificats et sauvegardes**. Conserver le même `NOM_PROJET`. Ne pas démarrer les services à ce stade.
4. Dans `.env`, régler le registre et `VERSION_RATIONARIUM=1.0.0`, `MODE_IMAGES=never`. Ne pas exporter `VOLUME_POSTGRES` dans le shell. Intégrer les adaptations locales dans `compose.yaml` ; retirer les surcharges `compose.override.yaml` après les avoir sauvegardées. Le script refuse une surcharge implicite.

## Exécution

Depuis ce répertoire, avec la base source encore démarrée :

```bash
bash migrer-postgresql.sh ./migration-postgresql-1.0.0
```

Le script vérifie la majeure 18 et la source Debian, arrête API et web, crée une sauvegarde complète, puis calcule une empreinte logique et un nombre de lignes par table. Il conserve le volume source, crée un volume neuf et écrit son nom dans `VOLUME_POSTGRES` de `.env`. Il restaure rôles et base, compare toutes les empreintes, vérifie les index, puis démarre les migrations applicatives et les services. Les noms accentués restent stockés à l'identique ; l'ordre de tri SQL peut changer avec la bibliothèque de collation. Les index sont reconstruits lors de la restauration.

Examiner `VERDICT.txt`, `avant.txt`, `apres.txt` et `collation-index.txt`, puis vérifier connexion, planning et pièces jointes avant de rouvrir. Conserver le dossier privé : il contient configuration, sauvegardes et renseignements de retour. Il ne doit pas être publié.

## Échec et retour arrière

Un verrou de répertoire empêche deux migrations simultanées. Il est retiré à la sortie normale ou sur erreur ; après un arrêt brutal de la machine, vérifier qu’aucune migration ne tourne avant de retirer `.migration-postgresql.lock`.

Un échec laisse les services applicatifs arrêtés. Le volume source n'est jamais supprimé ni utilisé par Alpine. Avant toute réouverture aux utilisateurs :

```bash
bash ./migration-postgresql-1.0.0/retour.sh --avant-reouverture
```

Le retour remet le volume et les identifiants d'images sources, sans lancer les migrations de la candidate. **Les écritures réalisées après la bascule ne sont pas dans l'ancien volume.** Si les utilisateurs ont repris leur travail, arrêter et préparer une récupération de ces écritures avant tout retour.

Après retour, conserver `retour.yaml` comme surcharge explicite pour tout redémarrage, ou réinstaller le kit/configuration source sauvegardé. Le script de retour démarre lui-même les services avec cette surcharge ; un simple `docker compose up` sans elle reprendrait la configuration candidate. Aucun nettoyage automatique de l'ancien volume n'est prévu après succès : sa suppression appartient à une opération ultérieure, après validation et conservation des sauvegardes.
