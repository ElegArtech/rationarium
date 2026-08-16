# ADR-0013 — Chaîne d'approvisionnement et construction hors ligne

- **Statut** : accepté — 2026-08-16
- **Source** : `cadrage/01 § 1.4` (C1), `cadrage/03 § 2` et `§ 6, R2`

## Contexte

`C1` — fonctionnement en réseau fermé, sans Internet sortant — est la contrainte la plus éliminatoire du cadrage. Elle a évincé des briques par ailleurs pertinentes.

Une distinction n'était pas explicite dans le cadrage et doit l'être : **`C1` s'applique à l'exécution du produit, pas à sa construction.** Le poste de développement et la chaîne d'intégration téléchargent des paquets, des navigateurs et des images de base. Ce qui doit fonctionner sans accès sortant, c'est l'image livrée et la machine cible.

Sans cette distinction, on aboutit soit à une interdiction ingérable, soit — plus dangereux — à une conformité supposée que rien ne vérifie.

## Décision

**Trois régimes réseau distincts, explicites, et un contrôle mécanique de la frontière.**

| Régime | Accès sortant | Ce qui s'y passe |
| --- | --- | --- |
| **Développement** | Autorisé | Installation des dépendances, navigateurs Playwright, images de base |
| **Construction de l'image** | Autorisé pour la récupération, **interdit pour la vérification** | Le lot est constitué, puis rejoué sans réseau pour prouver qu'il se suffit |
| **Exécution** | **Interdit** | Le produit livré, sur la machine cible |

### Règles permanentes

1. **Versions exactes.** `save-exact=true` et le fichier de verrouillage font foi. Une montée de version est une décision inscrite dans `cadrage/03 § 9`, jamais un effet de bord d'installation.
2. **Aucun script de post-installation n'est autorisé sans motif écrit.** Les autorisations vivent dans `allowBuilds` de `pnpm-workspace.yaml`, chacune commentée. Un script bloqué par défaut est le comportement voulu : c'est le point où une dépendance réseau s'introduit sans être vue.
3. **Aucune ressource distante dans le lot construit** : ni police, ni script, ni feuille de style, ni image. Les maquettes chargent IBM Plex depuis un service distant ; le portage les remplace par `@fontsource` embarqué (`03 § 7.1`).
4. **Le contrôle d'intégration continue s'exécute sur un réseau `--internal`**, où les services internes sont joignables et Internet ne l'est pas. Il porte sur ce que fait le produit — engendrer, migrer, démarrer, servir — jamais sur le seul succès de l'installation.

### Pourquoi le contrôle porte sur le comportement, pas sur l'installation

Établi par la vérification de R2 (voir `ADR-0006`) : le téléchargement du moteur de schéma Prisma échoue **silencieusement**. Une installation hors ligne se termine sans erreur et laisse un produit qui cassera à la première migration.

C'est le mode de défaillance à surveiller pour toute la chaîne : une dépendance réseau ne se signale pas, elle se découvre en production. Le contrôle doit donc exercer les fonctions, pas constater l'absence d'erreur.

## Conséquences

- Un travail de vendorisation est à prévoir pour toute brique qui télécharge à l'installation ou au premier usage : moteur de schéma Prisma, navigateurs Playwright, images de base.
- La cible de déploiement (`03 § 8.2`, arbitrage B5) devra préciser d'où viennent les images : registre interne, ou archives transportées.
- Toute nouvelle dépendance est confrontée à cette ADR avant adoption, et son éventuel script de post-installation est examiné, pas autorisé par défaut.
