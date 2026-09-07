# Recette par persona — le harnais

Ce dossier n'est **pas** du produit. Rien de ce qu'il contient n'est construit, ni
servi, ni livré : `apps/web/dist` et `apps/api/dist` l'ignorent, et aucune source de
`apps/` ni de `packages/` ne l'importe. C'est la condition posée par l'étape de
recette — le mécanisme de recette et les valeurs des jeux d'illustration ne doivent
pas apparaître dans les sources livrées.

## Ce que la recette ajoute à ce qui existait

Les huit boucles du produit vérifient le produit **vue par vue et état par état**.
Aucune ne joue un **trajet**, et aucune — c'est le point — ne parle à un serveur
réel : les vingt-trois suites de `apps/web/e2e` interceptent `/api` et servent leurs
propres jeux d'essai. C'est légitime pour un contrôle de routage. Ça ne l'est pas
pour une recette, dont l'objet est justement le raccord entre les deux moitiés.

Le harnais monte donc la pile entière : PostgreSQL, le serveur applicatif, le lot
construit du client servi derrière un relais `/api`, et la politique de sécurité de
contenu du `Caddyfile`. La connexion passe par le formulaire.

## Les pièces

| Fichier | Rôle |
| --- | --- |
| `jeu2.mjs` | **Le second jeu d'illustration.** Une autre collectivité, d'autres gens, d'autres projets — aucune valeur commune avec `packages/db/src/maquette.ts`. Six comptes de persona, avec leur rôle système. |
| `harnais/pile.mjs` | La base modèle, les bases d'ouvrier clonées, l'instantané, la remise à zéro, le serveur applicatif. |
| `harnais/serveur-web.mjs` | Le lot construit + relais `/api` + CSP du `Caddyfile`. Comble ce que `vite preview` ne fait pas : il ne lit pas `server.proxy`. |
| `harnais/pilote.mjs` | Ouvrir le produit sous une persona, dans une langue ; relever incidents, violations de CSP et fuites du premier jeu ; écrire trace, vidéo et captures. |
| `harnais/couverture.mjs` | Les quatre règles de couverture du § 2, avant toute exécution. |
| `harnais/BRIEF-EXECUTANT.md` | Ce que reçoit un exécutant de parcours. |
| `09-parcours.json` | Les parcours, **dérivés à l'aveugle** du seul cahier des charges et de la seule carte de navigation. |
| `09-rapport-de-recette.md` | Le rapport. |
| `preuves/` | Une trace par parcours, par persona et par langue. Un vert sans trace n'est pas un vert. |

## La marche

```bash
# 1. Le serveur de recette (une fois)
docker run -d --name rationarium-recette-db \
  -e POSTGRES_USER=rationarium -e POSTGRES_PASSWORD=rationarium \
  -e POSTGRES_DB=rationarium -e TZ=Europe/Paris \
  -p 55433:5432 postgres:18.6-bookworm

# 2. Le lot construit
pnpm build

# 3. La base modèle : migration, amorçage, second jeu, instantané
node recette/harnais/preparer.mjs

# 4. La couverture des parcours
node recette/harnais/couverture.mjs

# 5. Les parcours, en vague
#    (un exécutant par lot de parcours, chacun sur son emplacement)
```

## Ce qu'on ne fait jamais ici

- Ouvrir une porte dérobée dans le produit pour ouvrir une session ou remettre à zéro.
- Amender un parcours parce que le produit ne le passe pas.
- Tolérer un rouge. Il n'existe pas de liste d'exceptions.
