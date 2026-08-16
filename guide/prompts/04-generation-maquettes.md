# Étape 4 — Génération des maquettes

**Régime : assisté.** Génération en webapp, itération conversationnelle jusqu'à épuisement des libertés. **C'est l'espace de divergence officiel du cycle** — la créativité s'épuise ici, pas pendant l'exécution.

**Entrée** : livrable 02 (§ A + § B + le brief de la vue).
**Sortie** : `mockups/NN-nom.html`, puis gel.

> **Trois corrections du pilote sont portées ici.** M4 : une correction de contraste appliquée à 9 fichiers sur 35 et jamais rétro-propagée. M5 : RGAA posé comme contractuel et jamais mesuré — 33 manquements graves dormaient dans la référence gelée. M6 : la structure cumulative des maquettes n'était documentée nulle part.

---

## Discipline de session

| Règle | Motif |
| --- | --- |
| **Les vues d'un même flux dans la même conversation** | Cohérence stylistique. Chaque nouvelle conversation repart de ses priors |
| **§ A injecté une fois** en tête, puis un brief par message | C'est le préambule commun qui empêche dix vues de ressembler à dix applications |
| **Wireframe pour toutes les vues, haute fidélité pour les trois ou quatre vues cœur** | L'intégralité en haute fidélité est le piège du travail solo : coût quadratique, valeur marginale |
| **Itérer jusqu'à épuisement des libertés** | Une liberté non épuisée ici sera prise par l'agent d'exécution, sans que personne ne la voie |

---

## Le prompt de génération

````markdown
[§ A — contexte commun, collé intégralement]

[§ B — coquille applicative, si la vue est authentifiée]

[Le brief de la vue]

---

# Contraintes de production

## Environnement cible
[Format, bibliothèques autorisées, interdits — repris du brief]

## Socle graphique
Cette vue emploie **exactement** le socle graphique fourni ci-dessous, recopié à
l'identique, sans ajout ni retrait de jeton.

[Le bloc de jetons, à partir de la deuxième vue]

Si tu as besoin d'une couleur qui n'existe pas dans les jetons, **arrête-toi et
demande** : soit c'est un jeton manquant à ajouter au socle et à propager, soit c'est
une réinterprétation qu'il ne faut pas faire.

## Panneau de revue — obligatoire
La vue embarque un panneau hors produit, visuellement distinct, qui pilote ses états.

- Une **fonction globale nommée par axe** : `setState(...)`, `setData(...)`, `setRole(...)`.
  Nommées et globales : elles seront appelées de l'extérieur pour capturer chaque état.
- Un bouton par valeur, groupé par axe, avec légende.
- Les axes universels : thème clair/sombre, langue.
- Marqué « hors produit », exclu du rendu final.

## Accessibilité — contractuelle, pas décorative
- Tout élément interactif a un **nom accessible** : `aria-label`, `label[for]`, ou
  imbrication dans un `<label>`. Une case à cocher nue dont le sens n'est porté que par un
  texte adjacent non associé est un défaut.
- Aucun élément focalisable à l'intérieur d'un `aria-hidden`.
- Toute zone défilante est atteignable au clavier.
- Contrastes : 4,5 pour le texte, 3,0 pour les éléments non textuels et les bordures de
  contrôles. **Les jetons du socle sont réputés conformes** — ne les altère pas localement.
- Piège de focus dans les fenêtres, retour au déclencheur à la fermeture.

## Ce que tu ne fais pas
- Inventer un état non listé dans le brief. S'il en manque un, tu le signales.
- Introduire une bibliothèque hors de la liste autorisée.
- Écrire une chaîne qui ne serait pas traduisible.
- Caler une largeur sur un libellé français — prévois l'anglais 30 % plus long.
````

---

## Le contrôle qui manquait — après chaque vue

**Correction de M5.** RGAA était posé comme contractuel dans le cadrage et n'a jamais été mesuré sur les maquettes. Résultat : 33 manquements graves ou critiques figés dans la référence, découverts au moment de porter — dont une zone défilante inatteignable au clavier, qui rendait du contenu littéralement inaccessible.

**Chaque maquette passe un contrôle automatisé avant d'être acceptée**, sur ses deux thèmes, panneau de revue exclu :

```bash
# axe-core sur le fichier, thème clair et thème sombre
# Aucune violation « serious » ou « critical » n'est acceptable.
```

Une maquette qui échoue retourne en itération. C'est trente secondes ici, contre une dette propagée dans toutes les vues sinon.

---

## Le contrôle qui manquait — sur le jeu complet

**Correction de M4 et M6.** Deux propriétés du *jeu* de maquettes, invisibles vue par vue, qui n'apparaissent qu'en les comparant entre elles.

### Cohérence des jetons

Extraire le bloc de jetons de chaque fichier et les diffter deux à deux. **Toute divergence est un défaut**, et il faut savoir lequel :

- soit une correction appliquée à certaines vues et pas aux autres — c'est le cas du pilote, où 9 fichiers sur 35 portaient les bonnes valeurs de contraste ;
- soit une dérive de génération d'une conversation à l'autre.

Dans les deux cas : identifier la valeur juste, la propager à tous les fichiers, regeler.

Sans ce contrôle, le portage prend un fichier au hasard comme source du design system, et fige les mauvaises valeurs.

### Structure du jeu

Documenter comment les fichiers se rapportent les uns aux autres, et **écrire cette structure quelque part**.

Sur le pilote, les maquettes se sont révélées **cumulatives** — chaque fichier embarquant les sections de style de tous les précédents, chacun n'en introduisant qu'une qui lui soit propre. C'est une excellente propriété : elle explique la cohérence obtenue. Mais elle n'était documentée nulle part, et elle change tout au portage : la feuille complète est celle de la **dernière** vue de la lignée, pas celle de la vue qu'on traite.

Produire une **carte section → vue → destination**, qui dira à chaque lot d'implémentation où est sa source.

---

## Contrôles de sortie — avant le gel

- [ ] **Chaque vue de l'inventaire a sa maquette.**
- [ ] **Chaque maquette embarque son panneau de revue**, avec toutes les fonctions nommées et globales.
- [ ] **Chaque état de `inventaire-etats.json` est atteignable** par son pilote. Test : appeler chaque pilote et vérifier que le rendu change.
- [ ] **axe-core sans violation grave** sur chaque vue, dans les deux thèmes.
- [ ] **Les jetons sont identiques dans tous les fichiers.** Test : diff des blocs de jetons deux à deux.
- [ ] **La structure du jeu est documentée**, avec la carte section → vue → destination.
- [ ] **Aucune ressource distante** si la cible l'interdit : polices, scripts, feuilles, images.
- [ ] **Les deux langues et les deux thèmes fonctionnent** sur chaque vue.

Ces contrôles passés, le jeu est **gelé** : rapatrié, versionné, daté, empreintes calculées, écriture verrouillée. Il devient la référence exécutable contre laquelle l'implémentation sera comparée.
