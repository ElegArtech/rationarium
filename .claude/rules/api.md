---
paths:
  - "apps/api/**/*.ts"
---

# Règles du serveur applicatif

Chargées dès qu'un fichier du serveur est ouvert. Elles portent les exigences non fonctionnelles transverses : elles ne sont **jamais** recopiées dans un contrat de tâche.

## L'ordre du contrôle d'accès, sans exception

Deux mécanismes distincts, appliqués dans cet ordre, **jamais côté client** :

1. **La permission** — décorateur `@RequirePermission('domaine:action')`. Liste blanche stricte : toute permission absente est refusée (`RG-DROITS-03`).
2. **Le périmètre** — prédicat construit à partir de l'utilisateur, injecté dans **chaque requête de lecture**. Les détenteurs d'une permission de gestion globale le court-circuitent (`RG-SCOPE-03`). Les tâches confidentielles sont exclues sauf permission explicite (`RG-SCOPE-04`).

Un point d'entrée qui vérifie la permission mais pas le périmètre est un défaut de cloisonnement, pas une optimisation.

## Journal d'audit

- L'intercepteur d'audit s'exécute **après** la garde de permission **et sur son échec** : l'accès refusé au journal est lui-même tracé (`RG-ADM-03`).
- Le rôle SQL applicatif n'a que `INSERT` et `SELECT` sur `audit_log`. Aucun code n'y écrit autrement que par l'intercepteur.
- Les actions à tracer sont énumérées en `cadrage/01 § M20`. La liste est fermée : y ajouter une action est une décision, pas une initiative.

## Concurrence

- Toute entité modifiable porte une colonne `version`. Toute mise à jour transmet la version lue ; un écart lève l'erreur métier rédigée et se traduit en `409` (`RG-GEN-07`).
- Le recontrôle de solde à l'approbation d'un congé s'exécute en `REPEATABLE READ` avec verrou sur la ligne d'allocation (`RG-CNG-22`).
- **Jamais d'écriture « dernier arrivé gagne ».**

## Courriel et travaux planifiés

- L'envoi de courriel est **toujours** une tâche de file, jamais un appel synchrone dans une transaction métier. L'indisponibilité de la messagerie ne doit jamais empêcher l'action métier d'aboutir (`RG-NTF-04`).
- Les travaux périodiques passent par `pg-boss`, avec `singletonKey` pour le verrou d'instance unique (`RG-NTF-02`).

## Messages d'erreur

Rédigés en langue naturelle, jamais en code technique (`RG-GEN-03`), et **actionnables** : ils disent quoi faire. Quand `cadrage/02` donne le texte exact d'un message, c'est ce texte-là, à la lettre — il est contractuel et vérifié par la boucle visuelle.
