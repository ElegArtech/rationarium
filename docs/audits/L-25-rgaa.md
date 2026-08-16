# L-25 — Audit RGAA

**Périmètre** : les 35 vues de `design/etats.json`, dans les deux thèmes, plus les
surfaces qui n'ont pas d'adresse propre — fenêtres modales, panneaux, onglets.

**Méthode** : un audit **balaie exhaustivement, jamais par échantillon**
(`cadrage/04`). Deux instruments, complémentaires et non redondants :

| Instrument | Ce qu'il voit | Ce qu'il ne voit pas |
| --- | --- | --- |
| `application.a11y.spec.ts` — `axe-core` | Rôles, libellés, contrastes, attributs ARIA | Tout ce qui demande d'**agir** : focus, ordre de tabulation, touches |
| `clavier.a11y.spec.ts` — parcours réels | Lien d'évitement, piège de focus, retour au déclencheur, menus, grilles denses, titre de page | Le contraste et la sémantique, couverts par le premier |

> **Le second instrument est né de l'audit.** Les trois défauts les plus graves
> trouvés ici étaient tous invisibles à `axe` : rien n'est *incorrect* dans une
> page sans lien d'évitement, elle est seulement plus longue à traverser.

---

## Ce que l'audit a trouvé

### 1. La vue 05 n'avait jamais été auditée — **corrigé**

La liste des vues balayées était tenue **à la main**. La vue 05 (« mot de passe
imposé ») n'y figurait pas : elle vit hors de la coquille, elle avait été portée
au L-04, et personne ne l'avait ajoutée.

Le correctif ne se limite pas à l'ajouter. La couverture est désormais **dérivée
de l'inventaire gelé** et vérifiée par un test dédié : ajouter une vue sans
l'auditer fait échouer la suite. C'est la seule façon qu'un audit reste
exhaustif après le jour où il a été écrit.

### 2. Le lien d'évitement était stylé mais jamais rendu — **corrigé**

`.skip` existait dans `socle.css`, avec son `:focus` qui le fait descendre :
la classe était portée, l'élément non. RGAA 12.7.

Conséquence pratique : un utilisateur au clavier devait traverser la barre
latérale — dix-huit entrées au maximum — avant d'atteindre le contenu, sur
**chaque** vue.

### 3. La fenêtre modale ne prenait pas le focus à l'ouverture — **corrigé**

À l'ouverture, `document.activeElement` restait `BODY`. L'arrière-plan devient
inerte, le déclencheur perd le focus, et rien ne le reprenait. Trois
conséquences, dont deux qu'aucun contrôle statique ne pouvait voir :

1. **Échap ne fermait pas** — l'événement n'atteignait pas la surcouche ;
2. l'utilisateur au clavier était renvoyé en tête de document ;
3. un lecteur d'écran n'annonçait pas l'ouverture.

Le diagnostic a demandé de distinguer deux hypothèses qui produisent le même
symptôme : « Échap n'est pas branché » et « le focus n'est pas dans la
fenêtre ». Forcer le focus sur un champ à la main a tranché — Échap fermait
aussitôt. Le composant pose donc le focus sur le **premier élément focalisable**
et non sur le conteneur : le conteneur porte bien `tabindex="-1"`, mais les
gestionnaires de touches de la surcouche n'écoutent que depuis un descendant
réellement focalisable.

### 4. Le titre de page ne distinguait pas les vues — **corrigé**

Les 35 vues s'appelaient « Trame ». RGAA 8.6. L'historique du navigateur
affichait trente-cinq entrées identiques, et un lecteur d'écran n'annonçait
rien de distinctif au changement de vue.

Le titre est **dérivé du `h1` affiché** plutôt que déclaré vue par vue : une
liste parallèle finirait par diverger, et une vue nouvelle l'oublierait.

---

## Ce que l'audit a confirmé

- **Aucune violation `axe` grave** — `critical` ou `serious` — sur les 35 vues,
  dans les deux thèmes, ni sur les six surfaces sans adresse propre.
- **L'attribut `lang` suit la langue de l'interface.** Il était déjà correct ;
  un contrôle le tient désormais, parce qu'une régression y est silencieuse —
  le texte reste juste, seule la voix est fausse.
- **`C6` est tenu** : le planning se manipule au clavier par un menu explicite,
  et le kanban de même. Les deux sont vérifiés depuis les lots d'origine ;
  l'audit les rejoue depuis le clavier plutôt que depuis le clic.
- **Aucune grille dense ne piège le focus** — cinquante tabulations en sortent.

## Ce qui reste ouvert

- **B4 — périmètre mobile.** L'arbitrage n'est pas rendu. Les contrôles
  s'exécutent à 1600 × 1000 ; le comportement sous 900 px est décrit par les
  maquettes mais n'est pas audité. À rouvrir quand B4 sera tranché.
- **Lecteurs d'écran réels.** `axe` et les parcours clavier ne remplacent pas
  un essai sous NVDA ou Orca. Rien dans cette chaîne ne peut le simuler, et
  prétendre le contraire serait le pire résultat de cet audit.
