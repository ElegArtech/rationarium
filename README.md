# Rationarium

Plateforme de pilotage des projets et des ressources humaines, pour une
collectivité territoriale organisée en **Directions → Départements → Services**.

Principe directeur : *une seule grille temporelle réconcilie tout ce qui occupe
une personne* — congé, télétravail, tâche de projet, tâche hors projet,
permanence, réunion.

Outil interne, **réseau fermé**, bilingue FR/EN, conforme RGAA.

---

## Lancer en local

Trois commandes, dans trois terminaux, et une quatrième une seule fois.

**Prérequis** : Node 24, pnpm 11, Docker.

```bash
pnpm install

# 1. La base — la seule dépendance conteneurisée.
docker compose -f deploiement/compose.dev.yaml up -d

# 2. Le schéma.
export DATABASE_URL='postgres://rationarium:rationarium@localhost:55432/rationarium'
pnpm --filter @rationarium/db exec prisma migrate deploy

# 3. L'amorçage — UNE SEULE FOIS, et il est rejouable sans risque.
pnpm build
pnpm --filter @rationarium/api amorcer
#   → affiche l'identifiant et le mot de passe du premier administrateur.
#     Le mot de passe n'est montré qu'une fois ; il est à changer à la
#     première connexion.

# 4. Le serveur, puis le client, dans deux terminaux.
COOKIE_SECRET=dev pnpm --filter @rationarium/api dev     # http://localhost:3000
pnpm --filter @rationarium/web dev                       # http://localhost:5173
```

Puis <http://localhost:5173>, et la connexion avec les identifiants affichés à
l'étape 3.

**Pourquoi l'amorçage est indispensable.** Une base migrée est *vide* : aucun
rôle, aucun compte. Et le produit ne permet pas d'en sortir seul — la création
de compte autonome est désactivée par défaut, et l'initialisation du
référentiel exige une session qui exige un rôle qui n'existe pas encore. Sans
l'étape 3, l'application démarre et personne ne peut entrer.

**Le client passe par un relais.** Vite relaie `/api` vers le port 3000 : même
origine, pas de CORS, un seul cookie de session — exactement ce que fait Caddy
en production. Le serveur doit donc tourner pour que le client serve à quelque
chose.

### Repartir de zéro

```bash
docker compose -f deploiement/compose.dev.yaml down -v
```

### Jeu de données de volumétrie

Pour travailler sur des écrans réellement peuplés — 500 utilisateurs,
200 projets, 20 000 tâches, cinq ans d'historique :

```bash
node -e "
  const { creerClient, peupler, CIBLE } = await import('@rationarium/db');
  const p = creerClient(process.env.DATABASE_URL);
  await peupler(p, CIBLE);
  await p.\$disconnect();
" --input-type=module
```

C'est le jeu qui porte les budgets de performance de L-26.

---

## Les boucles de vérification

```bash
pnpm verif          # la passe rapide : typecheck + lint + stylelint + i18n + test
pnpm test:int       # intégration, PostgreSQL réel (Testcontainers) — exige Docker
pnpm e2e            # bout en bout (Playwright)
pnpm a11y           # axe-core sur chaque vue, deux thèmes
pnpm perf           # budgets de performance, seuils bloquants
pnpm ui:diff <vue>  # conformité de rendu contre la maquette gelée
```

`pnpm verif` doit être vert avant toute demande de revue.

**Playwright se lance depuis `apps/web`** : depuis la racine, `testDir` et
`baseURL` ne s'appliquent pas et tous les contrôles échouent sur une URL
invalide — un symptôme qui ne ressemble pas à sa cause.

---

## Le dépôt

| Chemin | Contenu |
| --- | --- |
| `apps/web` | Application monopage React — 35 vues |
| `apps/api` | Serveur NestJS sur Fastify |
| `packages/contracts` | Schémas Zod, 152 permissions, 26 modèles de rôles, vocabulaires |
| `packages/db` | Schéma Prisma, migrations, jeu de volumétrie, export de réversibilité |
| `deploiement/` | Compose, images, sauvegarde, restauration — voir son README |
| `cadrage/` | Les sources de vérité. **Ne se modifient pas** |
| `mockups/` | Les 35 maquettes gelées. **Ne se modifient pas** |
| `docs/adr/` | Décisions d'architecture |
| `docs/dag.md` | Le plan de réalisation, lot par lot, avec son état |
| `docs/audits/` | Ce que chaque audit a trouvé |

`CLAUDE.md` porte le contrat permanent : sources de vérité, interdits
structurels, définition de terminé, et la liste des pièges déjà payés une fois.

---

## Mise en production

Voir **`deploiement/README.md`** : une machine, Docker Compose, Caddy en
façade. Installation, sauvegarde, restauration éprouvée, export de
réversibilité, et ce que la question B5 — cible de déploiement — laisse encore
ouvert.
