# Trame — contrat permanent

Plateforme de pilotage des projets et des ressources humaines, pour une collectivité territoriale organisée en Directions → Départements → Services. Principe directeur : **une seule grille temporelle réconcilie tout ce qui occupe une personne** — congé, télétravail, tâche de projet, tâche hors projet, permanence, réunion.

Le produit est un outil interne, en **réseau fermé**, bilingue FR/EN, conforme RGAA.

## Sources de vérité

Elles priment sur toute inférence. En cas de doute, on cite, on n'interprète pas.

| Question | Source |
| --- | --- |
| Ce que le produit doit faire | `cadrage/01` — exigences `EX-…`, règles `RG-…` |
| À quoi il ressemble et comment il se comporte | `cadrage/02` + `mockups/` (gelé) |
| Avec quoi on le construit | `cadrage/03` + `docs/adr/` |
| Comment et dans quel ordre | `cadrage/04` + `docs/dag.md` |
| Le contrat de style | `docs/design/DESIGN.md` + `apps/web/src/styles/socle.css` |
| Les états à couvrir par vue | `design/etats.json` |

**Si une information manque, elle remonte en question — elle ne s'invente pas.** Toute décision prise pendant l'exécution est le signal d'une spec incomplète.

## Commandes

```bash
pnpm install            # installation ; les scripts de post-installation sont bloqués par défaut
pnpm typecheck          # tsc sur tous les espaces de travail
pnpm lint               # ESLint, règles typées actives
pnpm stylelint          # aucune couleur littérale hors socle.css
pnpm i18n:check         # aucune clé manquante ni orpheline, aucune chaîne en dur
pnpm test               # unitaires (Vitest)
pnpm test:int           # intégration sur PostgreSQL réel (Testcontainers) — exige Docker
pnpm e2e                # bout en bout (Playwright)
pnpm a11y               # axe-core sur chaque vue, deux thèmes
pnpm ui:diff <vue>      # conformité de rendu contre la maquette gelée
pnpm perf               # budgets de performance, seuil bloquant
pnpm verif              # la passe rapide : typecheck + lint + stylelint + i18n + test
pnpm build              # construction
```

`pnpm verif` doit être vert **avant** toute demande de revue. Une boucle rouge se corrige seul, sans remonter.

## Interdits structurels

Ce sont des interdits, pas des recommandations. Plusieurs sont tenus par des hooks : les enfreindre échoue, ça ne se négocie pas.

- **Ne jamais modifier `mockups/`.** C'est la référence gelée. Procédure de dégel en `mockups/GEL.md`.
- **Ne jamais modifier `cadrage/`.** Le cadrage évolue par décision humaine tracée, jamais par effet de bord d'une session.
- **Ne jamais écrire de couleur littérale hors `socle.css`.** Employer un jeton.
- **Ne jamais écrire de chaîne visible en dur.** Tout passe par i18next (`RG-GEN-08`).
- **Ne jamais contrôler un droit côté client seul.** Le client masque ou désactive par courtoisie (`RG-GEN-06`) ; le contrôle est au serveur, permission **puis** périmètre (`cadrage/03 § 5.4`).
- **Ne jamais modifier `packages/db/prisma/schema.prisma` dans une tâche de fonctionnalité.** Le schéma passe par une tâche de schéma dédiée (`cadrage/04 § 5.3`).
- **Ne jamais ajouter une dépendance sans ADR.** Confronter à `C1` et à `ADR-0013`.
- **Ne jamais écrire « dernier arrivé gagne ».** Concurrence détectée, jamais écrasée (`RG-GEN-07`).
- **Ne jamais définir une énumération locale** pour un vocabulaire de `cadrage/01 § 4.1`. Une seule définition, dans `@trame/contracts`.

## Définition de terminé

Aucune tâche n'est terminée sans **toutes** ces conditions.

**Vue** — tous les états de `design/etats.json` implémentés · conformité de rendu · accessibilité sans violation dans les deux thèmes · aucune chaîne en dur · aucune couleur littérale · crédible en variante « droits minimaux » **et** « administrateur » (`02 § D.3`) · état vide rédigé avec sa sortie · impression traitée si la vue est concernée.

**Module serveur** — une `EX-…`/`RG-…` = un test nommé qui la cite · intégrité doublée en base quand `C15` l'exige · permission **et** périmètre sur chaque lecture et chaque écriture · journal d'audit alimenté pour les actions de `01 § M20` · aucune écriture « dernier arrivé gagne ».

**Schéma** — migration réversible · contraintes d'exclusion et unicités posées · index déterminants créés et justifiés · jeu de données de volumétrie mis à jour · mesure de performance rejouée.

## Pièges connus

Enrichi à chaque capitalisation. Un piège rencontré deux fois sans être consigné est un défaut de capitalisation.

- **Conteneurs et propriété des fichiers.** Un `docker run -v "$PWD":/w` laisse des fichiers appartenant à `root`, indélogeables sans privilèges. Toujours passer `--user $(id -u):$(id -g)`, ou réparer par `docker run --rm -v "$PWD":/w <image> chown -R 1000:1000 /w/<chemin>`.
- **Prisma hors ligne.** `prisma migrate` exige un binaire de moteur de schéma de 22 Mo, téléchargé en post-installation **en échec silencieux**. Une installation hors ligne paraît réussir et casse à la première migration. Conditions : OpenSSL 3 dans l'image, binaire embarqué et épinglé par `PRISMA_SCHEMA_ENGINE_BINARY`. Voir `ADR-0006`.
- **Prisma 7 et l'URL de connexion.** Elle vit dans `prisma.config.ts`, plus dans le bloc `datasource` du schéma. Un schéma portant `url = env(…)` est refusé (`P1012`).
- **TypeScript est en 6.0.3, pas 7.** `typescript-eslint` lève une erreur fatale sur TS 7.0. Ne pas « moderniser » la version : voir `ADR-0014` et ses conditions de bascule.
- **Les maquettes sont cumulatives.** Chaque fichier embarque les sections CSS des précédents. La feuille complète est celle de la dernière vue de la lignée, pas celle de la vue traitée.
- **26 maquettes sur 35 portent des jetons non conformes RGAA.** Une correction de contraste n'a pas été rétro-propagée. `socle.css` porte les valeurs conformes ; un écart de rendu sur `--placeholder`, `--line-strong` et `--leave-pending` contre ces 26 fichiers est **attendu**. Voir `mockups/GEL.md`, écart 5.
- **Les relevés de référence sont versionnés.** `design/references/` est régénérable depuis les maquettes gelées, mais il est commité : un relevé qui change sans que la maquette ait changé est un signal de dérive. Contrepartie : une montée de version de Chromium en régénère une partie. Un tel commit se fait **seul et étiqueté comme tel**, jamais mêlé à du travail de lot.
- **Un réglage qui s'enregistre n'est pas un réglage qui s'applique.** Le paramétrage d'affichage de la vue 31 a vécu deux lots complet, testé et vert, sans agir sur rien. Tout contrôle de réglage doit vérifier **l'effet**, pas la persistance.
- **`Number("")` vaut zéro.** Un réglage de liste vide, filtré après conversion, donnait « dimanche seulement » là où on attendait le défaut. Le filtre porte sur la chaîne.
- **Le pluriel de zéro diffère entre le français et l'anglais.** « 0 utilisateur » et « 0 users » : une règle ICU recopiée d'un catalogue à l'autre est fausse dans l'un des deux.
- **Un sélecteur CSS sans correspondance est inerte, jamais rouge.** Les feuilles d'impression recopiées des maquettes visaient `.side` et `.main` quand la coquille portée dit `.sidebar` et `.contenu` : rien ne s'imprimait comme prévu, et aucun contrôle ne pouvait le voir. Une feuille `@media print` s'exerce par `page.emulateMedia({ media: "print" })`, sinon on vérifie qu'elle existe, pas qu'elle s'applique.
- **`getByText` de Playwright est INSENSIBLE À LA CASSE.** « Ressource » correspond à « Planning des ressources ». Sur un texte court, `{ exact: true }` n'est pas une précaution : c'est la seule façon de viser ce qu'on croit viser.
- **Un contrôle sans fichier de contrôle passe au vert.** `pnpm perf` exécutait un projet Playwright vide : vert à chaque fois, mesurant zéro. Une suite doit **affirmer qu'elle a quelque chose à mesurer**, comme la suite d'accessibilité affirme désormais couvrir les 35 vues.
- **Un identifiant `uuid` n'accepte que `[0-9a-f]`.** Un préfixe lisible comme « u1 » produit une valeur syntaxiquement invalide que PostgreSQL refuse — utile à savoir pour tout jeu de données déterministe.
- **Le schéma ne pose aucun `@map` : les colonnes physiques sont en camelCase.** Tout SQL écrit à la main doit les mettre entre guillemets, sinon PostgreSQL plie en minuscules et ne trouve rien.
- **Une fenêtre modale doit prendre le focus sur son PREMIER ÉLÉMENT FOCALISABLE**, pas sur son conteneur. Le conteneur porte `tabindex="-1"` mais les gestionnaires de touches de la surcouche n'écoutent que depuis un descendant réellement focalisable : sans cela, Échap ne ferme pas et le clavier repart en tête de document — deux symptômes qu'`axe` ne voit pas.
- **`axe` ne voit rien de ce qui demande d'agir.** Lien d'évitement, ordre de tabulation, piège de focus, retour au déclencheur, titre de page : ces contrôles-là s'écrivent à part (`clavier.a11y.spec.ts`), et ce sont eux qui trouvent les défauts réels.
- **Un fichier peut lier deux espaces de noms i18n.** `const { t } = useTranslation("taches")` et `const { t: tImports } = useTranslation("imports")` cohabitent ; le contrôle attribue chaque appel à **sa** liaison. Nommer les deux `t` le rendrait aveugle, et l'attribution au premier `useTranslation` rencontré faisait dépendre le verdict de l'ordre des déclarations.
- **Un CSV valide peut n'avoir aucune ligne.** Déduire les colonnes du premier enregistrement déclare alors toutes les colonnes manquantes : les en-têtes se lisent sur la première ligne du fichier.
- **`pg-boss` 12 ne crée pas son schéma tout seul.** `createSchema` vaut `false` par défaut : `start()` réussit, et la première file échoue sur « schema "pgboss" does not exist ». Comme l'abonnement se fait dans un `onModuleInit`, l'échec fait tomber le serveur — un succès suivi d'une panne ailleurs, plus tard.
- **Un `onModuleInit` qui lève arrête l'application entière.** Tout ce qui touche une ressource extérieure — file, relais SMTP — s'y protège par un `try`. Le contrôle qui le voit est celui qui **assemble** l'application (`surface-http.int.test.ts`), pas les tests du module.
- **Un cadre défilant sans élément focalisable est inatteignable au clavier.** `axe` le refuse en « serious » (`scrollable-region-focusable`) : un `overflow:auto` dont le contenu n'est que du texte et des images accessibles veut `tabIndex={0}`, un `role="region"` et un libellé.
- **Playwright se lance depuis `apps/web`.** Depuis la racine, `testDir` et `baseURL` ne s'appliquent pas et **tous** les contrôles échouent sur « Cannot navigate to invalid URL » — un symptôme qui ne ressemble pas à sa cause.
- **`reuseExistingServer` sert un lot périmé.** Playwright réutilisait un aperçu resté vivant, donc une construction antérieure aux dernières modifications : les tests tombaient sur du code qui n'existait plus, et l'échec ressemblait à un défaut de test. Il vaut désormais `false` en toutes circonstances.
- **Le catalogue de permissions est fermé par le cadrage.** Les vingt-quatre domaines sont énumérés en `cadrage/01 § 3.2` ; une donnée strictement privée qui n'y trouve pas de domaine se déclare `@Personnel()` — session exigée, aucune permission — et non par un domaine inventé.
- **Un fournisseur React non monté ne casse rien — il se tait.** `FournisseurMessages` est resté six lots hors de l'arbre : `useMessages` ne lève pas hors contexte, donc aucune confirmation d'action ne s'affichait, et aucune boucle ne s'en apercevait. Tout composant à défaillance silencieuse veut **un test qui affirme sa présence**, pas seulement l'effet qu'il accompagne.
- **`aria-pressed` sur un lien est une violation critique.** Un lien navigue, il ne bascule pas : l'état courant se dit par `aria-current="page"`. Le groupe segmenté du socle porte donc deux styles, un pour ses boutons, un pour ses liens.
- **Le contrôle de bout en bout doit figer l'horloge.** `page.clock.setFixedTime` — sans elle, « aujourd'hui » se déplace et un test vert le lundi tombe le mardi.
- **Deux lectures d'une même donnée peuvent se contredire sans qu'aucune boucle ne le voie.** `joursFeries(annee)` listait les lignes stockées sur l'année ; `joursChomes` projette les fériés récurrents sur toutes. Une année jamais importée s'affichait vide au paramétrage pendant que le décompte des congés y voyait ses fériés. Chaque fonction avait ses tests, tous verts. **Quand deux fonctions lisent la même table, le test qui compte est celui qui les compare.**
- **Un point est un séparateur de niveau chez i18next.** Une clé construite depuis un code métier (`leave.approve`) devient une clé imbriquée et ne résout jamais. On aplatit (`replaceAll(".", "_")`) et on garde le code brut en valeur de repli.
- **Un libellé de la barre latérale peut voler un clic destiné à un onglet.** « Planning » existe dans la navigation *et* dans les onglets de la vue 31 : un `getByRole("link", { name })` nu navigue ailleurs, et l'échec se lit sur l'assertion suivante, pas sur le clic. **Un onglet se vise toujours dans sa barre de sections.**
- **pnpm 11 ne lit plus le champ `pnpm` de `package.json`.** Les surcharges et `allowBuilds` vivent dans `pnpm-workspace.yaml`.
- **Le datamodèle Prisma doit déclarer ce que les migrations écrites à la main posent.** `migrate dev` engendre ses migrations depuis le **datamodèle** : tout objet posé en SQL et absent du schéma est repris en `DROP` à la migration suivante — silencieusement, dans un diff qui portait sur autre chose. Ce qui est exprimable se déclare (index à opérateur, type `Brin`/`Gin`, `map:`, `dbgenerated`) ; ce qui ne l'est pas — index d'expression, index partiel, partitionnement, droits SQL — reste dans les migrations, et `migrate diff` ne le voit pas non plus, donc ne le détruit pas. Tenu par `sauvegarde.int.test.ts`. Les drapeaux ont changé en Prisma 7 : `--from-config-datasource` et `--to-schema`, `--from-url` n'existe plus.
- **NestJS initialise les fournisseurs d'un module EN PARALLÈLE** (`Promise.all`). Un `onModuleInit` ne peut donc rien supposer de l'état d'un autre fournisseur du même module. Le cas rencontré : l'abonnement à la file de courriel partait sur un schéma `pg-boss` pas encore créé, échouait, et l'échec était avalé — les courriels étaient mis en file et jamais consommés, sans une erreur après le démarrage. Ce qui doit être prêt s'**attend** par une promesse partagée, jamais par un ordre de déclaration.
- **PostgreSQL 18 a déplacé son répertoire de données.** Le volume se monte sur `/var/lib/postgresql`, plus sur `/var/lib/postgresql/data` : l'image range désormais les données dans un sous-répertoire par version majeure et **refuse de démarrer** si elle en trouve à l'ancien emplacement. Tout fichier Compose recopié d'une 17 échoue au premier démarrage.
- **`docker compose exec … < fichier` n'achemine pas une archive intacte.** `pg_restore --list /dev/stdin` rend « did not find magic string in file header » sur une archive parfaitement saine. Copier dans le conteneur (`docker compose cp`) et travailler sur un chemin, jamais sur un tube d'entrée.
- **Caddy : `not path_regexp X` lit `X` comme l'expression, pas comme un matcheur déjà nommé.** Un matcheur défini puis « référencé » par son nom devient un test sur la présence de ce mot dans le chemin — donc toujours vrai. Le motif s'écrit deux fois.
- **Une image ne se construit pas sans `.dockerignore`.** `COPY . .` recopie le `node_modules` de l'hôte par-dessus celui de l'image ; pnpm détecte l'incohérence, veut réinstaller, et s'arrête faute de terminal. `ENV CI=true` lève le second symptôme, pas la cause.
- **Le cache de Turborepo ignore les fichiers non suivis par git.** `packages/db/src/generated` est ignoré : régénérer le client Prisma ne change pas la clé de cache, et `typecheck` rejoue un résultat qui ne décrit plus l'arbre. Les fichiers générés sont déclarés en `inputs` dans `turbo.json` ; ne pas les en retirer.
- **`**/api/**` dans Playwright intercepte aussi les modules de Vite.** `/src/api/client.ts` reçoit alors du JSON là où le navigateur attend un module : page blanche, sans erreur parlante. Intercepter par prédicat ancré à la racine — `(url) => url.pathname.startsWith("/api/")`.
- **Le compte de tests Playwright se lit à l'état de sortie, pas à la dernière ligne.** Le rapporteur `line` réécrit sa ligne de progression : un `tail -1` peut attraper `[96/100]` sur une suite entièrement verte.
- **Les tests de bout en bout servent le lot CONSTRUIT, pas le serveur de développement.** Le serveur de développement transforme à la demande : sous onze ouvriers en parallèle et à froid, les dernières vues dépassaient cinq secondes et quatre tests tombaient — reproductible, mais seulement au premier lancement après un redémarrage. Un échec qui n'arrive qu'une fois sur trois apprend à relancer plutôt qu'à chercher.
- **Une année ne se formate pas comme un nombre.** `{annee, number}` en ICU rend « l'année 2 026 » en français, séparateur de milliers compris. Interpoler la chaîne telle quelle.
- **L'opacité ne sert jamais à atténuer du texte.** Les maquettes le font ; le contraste tombe sous le seuil AA à chaque fois. Employer un jeton, ou laisser le fond porter la distinction. Voir `docs/design/DESIGN.md § 4`.

## Convention de commit

```
<type>(L-xx/vue-NN): <objet> [EX-…][RG-…]
```

Exemples : `feat(L-15/vue-19): contrôle du solde au dépôt [EX-CNG-02][RG-CNG-20]` · `fix(L-20/vue-07): la tâche multi-assignée ne change que d'assigné [RG-TSK-11]`.

La chaîne de traçabilité doit rester vraie dans les deux sens : `EX-…` → vue → lot → tâche → commit. Toute découverte à l'implémentation remonte modifier l'amont, avec trace (`cadrage/04 § 8.4`).
