# Vague remédiation — préparation de clôture du 10 septembre 2026

> Entrée préparatoire au gabarit de `cadrage/04` annexe D. La campagne finale et la revue humaine restent ouvertes ; le titre ne prononce donc pas la clôture.

## Lots livrés

Aucun lot n’est déclaré livré au sens du protocole final tant que les 342 exécutions n’ont pas été attestées. Les quatorze lots sont toutefois au stade suivant :

| Lots | Tâches | Criticité | Mode | Durée | Allers-retours avant vert |
| --- | --- | --- | --- | --- | --- |
| RM-00 à RM-04 | mesure, confidentialité, accès, droits, notifications | haute | pair / supervisé | non instrumentée de manière fiable | plusieurs témoins rouges ; total non agrégé |
| RM-05 à RM-08 | planning, projet, RH, documents/conditionnement | haute | porteurs + revues indépendantes | non instrumentée de manière fiable | consignés par rapports de lot, total non agrégé |
| RM-09 à RM-13 | administration, calendrier, rapports, profil, recherche | moyenne à haute | porteurs + gardiens | non instrumentée de manière fiable | témoins ciblés et corrections ; total non agrégé |

Le travail s’est déroulé dans un checkout partagé avec plusieurs interventions concurrentes. Les durées de tâches et jetons ne sont pas disponibles sous une forme attribuable et vérifiable ; les inventer rendrait l’instrumentation moins utile que l’absence explicitée.

## Vérification

Point intégré antérieur aux derniers correctifs visuels : `verif` sans cache vert avec 583 unitaires, build vert, intégration DB 34/34 et API 1199/1199 sur 43 fichiers, E2E 836/836, a11y 183/183, perf 10/10. Cycle Compose API+web réel vert avec restauration octet pour octet du document.

Profondeur appliquée : tests unitaires et d’intégration sur les modules serveur modifiés ; E2E FR/EN et captures ciblées pour les vues ; contrôles directs HTTP sur permissions/périmètres ; cycle d’exploitation réel pour RM-08. La revue visuelle corrigée est acceptée. Écart à la règle de clôture : les sorties brutes finales et la campagne 342 manquent encore.

Heures de vérification humaine : **non mesurées**. Une revue indépendante a ouvert 236 captures ; cette quantité ne permet pas de déduire une durée.

## Diff retour

Mises à jour proposées et retenues au cours de la reprise : D-RM-01 à D-RM-21, avec D-RM-20 pour la compatibilité CSV des rapports et D-RM-21 pour le catalogue local d’avatars prédéfinis. Les décisions fonctionnelles retenues ont pour destination le cadrage ; les choix d’exploitation sont portés par ADR-0016/0017.

Nombre proposé/retenu/refusé : **à recalculer lors de la revue à partir de la table de décisions**. Le présent journal évite de compter comme « retenue » une entrée seulement documentée mais non synchronisée dans corpus, oracle et tests.

Coût du diff retour : non chronométré. La consolidation a néanmoins retrouvé un manque normatif réel — le catalogue d’avatars prédéfinis — avant la campagne, ce qui démontre l’utilité de la passe.

## Boucle visuelle

- Faux positifs étage 1 : non mesurés ; `ui:diff` n’est plus opposable depuis le dégel.
- Écarts réels rattrapés à l’étage 2 ou par gardien : focus détruit dans le filtre calendrier, bilan ICS affichant encore l’aperçu, états/volumétrie Gantt, puis avatar prédéfini.
- Écarts vus seulement à l’œil lors de la revue consolidée : grille Utilisateurs comprimée à 768 px et pictogrammes date/heure noirs sur fond sombre.
- Captures actuellement présentes dans les dossiers RM ciblés : 278. Captures ouvertes dans la première revue consolidée : 236. Les 42 autres ne deviennent pas « revues » par soustraction.

## Capitalisation

- `AGENTS.md` : pièges rencontrés sur contrôles inopérants, serveur ou build périmé, configuration d’exploitation, données de recette et assertions trop larges.
- ADR-0016 : documents, conditionnement, magasins et sauvegarde/restauration.
- ADR-0017 : calendrier scolaire officiel embarqué en réseau fermé.
- Décisions/cadrage : historique restreint, présence commune, ICS, récurrence, CSV de compatibilité et avatars prédéfinis.
- Contrat de style : région défilante focalisable et correction transverse des contrôles natifs à confirmer avant éventuelle entrée DESIGN.

## Instrumentation du pilote

| Point ouvert | Mesure de la vague |
| --- | --- |
| 1. Granularité des contrats | 14 contrats RM, mais statistiques fichiers/lignes/durée non consolidées ; le découpage par lot a limité les conflits sans fournir une télémétrie fiable. |
| 2. Coût du diff retour | non chronométré ; au moins un manque produit bloquant détecté avant campagne, RG-AUTH-09. |
| 3. Seuils de criticité | confidentialité, droits, sauvegarde et session traités en haute ; aucun incident de gravité supérieure à la criticité déclarée n’est actuellement consigné. |
| 4. Dérive du design system | stylelint vert au point intégré ; deux écarts visuels transverses ont néanmoins échappé à la boucle automatique. |
| 5. Fiabilité visuelle | faux positifs non mesurés ; revue humaine indispensable, car elle a trouvé 768 px et pictogrammes natifs. |
| 6. Charge humaine | 236 captures ouvertes ; heures non mesurées, donc ratio non calculable. |

## Auto-audit

Signaux d’érosion à cocher en revue :

- [ ] Je ne relis plus vraiment les diffs de criticité haute.
- [ ] Je ne saurais pas réexpliquer tel module sans le rouvrir.
- [ ] La profondeur de revue a baissé « parce que ça marchait ».
- [ ] `01` et `02` n’ont pas bougé depuis plusieurs vagues alors que le code, si.
- [ ] J’accepte des propositions sans savoir dire pourquoi elles sont justes.

Décision d’autonomie : **à rendre après réponse**. Temps de localisation à froid, sans agent, module `apps/api/src/rapports` : **à mesurer**.

## Conditions restantes avant clôture

Suites globales finales sur arbre gelé, images et cycle Compose alignés sur le commit, matrice de couverture complète, puis 342 sessions et gate final. Les identifiants de campagne, commit, manifeste et sorties seront renseignés hors de ce commit après preuve ; aucune valeur n’est anticipée.
