# Brief du correcteur

Tu corriges des défauts **constatés**, pas supposés. Chacun a été trouvé en jouant un
parcours de recette dans un navigateur réel, contre une pile réelle, et sa trace est au
dossier de preuves : `recette/preuves/<parcours>/<persona>/<langue>/` — `verdict.json`
dit ce qui a été vu, `incidents.json` ce que la console et le réseau ont rendu.

Commence par lire `CLAUDE.md` en entier. Les interdits structurels et les pièges connus
s'appliquent à ce que tu écris ; plusieurs des défauts que tu corriges y figurent déjà
comme famille.

## La règle qui prime sur toutes les autres

**Tu corriges dans ton périmètre de fichiers, et nulle part ailleurs.** Sept autres
correcteurs travaillent en même temps sur le même arbre de travail. Un fichier hors de
ton périmètre que tu modifies, c'est le travail d'un autre que tu écrases.

Si la correction juste exige un fichier hors de ton périmètre : **ne le touche pas**.
Écris ce que tu peux dans ton périmètre, et **rapporte** ce qui reste, en nommant le
fichier et la ligne. Un défaut à moitié corrigé et signalé vaut mieux qu'une collision.

Les catalogues de traduction (`apps/web/src/locales/{fr,en}/*.json`) sont partagés :
n'y touche que l'espace de noms de ton périmètre, relis le fichier **juste avant** de
l'éditer, et n'ajoute que les clés dont tu as besoin. La parité FR/EN est vérifiée.

## Ce que tu ne fais pas

- **`pnpm build`, `pnpm e2e`, `pnpm a11y`, `pnpm conformite`, `pnpm perf`** : interdits.
  Le lot construit est partagé, et une construction pendant qu'un autre écrit sert un
  lot incohérent. La preuve de ta correction n'est pas là (voir plus bas).
- Modifier `packages/db/prisma/schema.prisma` — le schéma passe par une tâche dédiée.
- Modifier `recette/09-parcours.json`, `recette/harnais/`, `recette/jeu2.mjs`, ou le
  dossier de preuves.
- Ajouter une dépendance.
- Amender un parcours, ou requalifier un rouge.

## Ce que tu fais

1. **Lis la trace avant le code.** Le `verdict.json` du parcours dit ce qui a été vu à
   l'écran ; c'est la spécification de ta correction.
2. **Trouve la forme, pas l'occurrence.** Un défaut de forme ne se corrige pas par
   occurrence trouvée mais par recherche de la forme. Si tu corriges un `<a href>` qui
   devrait être un `Link`, cherche les autres dans ton périmètre.
3. **Écris le contrôle qui l'aurait vu.** Une `EX-…`/`RG-…` = un test nommé qui la cite.
   Un test unitaire (Vitest) dans le paquet concerné, ou un test d'intégration
   (`*.int.test.ts`) quand la règle vit en base. **Vois-le échouer avant de corriger** :
   un test qu'on n'a pas vu rouge ne prouve pas ce qu'on croit.
4. **Vérifie ce que tu peux vérifier sans construire** :
   `pnpm --filter <ton paquet> typecheck`, `pnpm --filter <ton paquet> lint`,
   `pnpm --filter <ton paquet> test`, et `pnpm stylelint` / `pnpm i18n:check` si tu as
   touché du style ou un catalogue. Ces commandes peuvent échouer **sur des fichiers
   qui ne sont pas les tiens** : d'autres correcteurs sont en vol. Ne corrige jamais
   l'erreur d'un autre ; note-la et poursuis.
   `pnpm test:int` exige Docker et une base : ne le lance que si ta correction est
   serveur, et sache qu'il est long.

## La preuve de ta correction

Elle n'est pas dans ce que tu lances. **Les parcours seront rejoués après la vague**, en
navigateur, dans les deux langues, sur la pile entière. Un parcours qui passe du rouge au
vert est la preuve ; rien d'autre ne l'est. Écris donc pour que le parcours passe, pas
pour que ton test passe.

## Ce que tu rends

Une ligne par défaut de ta liste :

```
C-xx  corrigé | partiel | non corrigé
  Cause : la cause réelle, en une phrase, avec fichier:ligne.
  Geste : ce que tu as changé.
  Contrôle : le test que tu as écrit, et ce qu'il affirme.
  Reste : ce qui n'est pas corrigé et pourquoi (fichier hors périmètre, décision amont).
```

Puis, séparément : ce que tu as découvert en chemin et **n'as pas** corrigé.
