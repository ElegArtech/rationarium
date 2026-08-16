# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: apps/web/e2e/application.a11y.spec.ts >> 01 — connexion — thème clair
- Location: apps/web/e2e/application.a11y.spec.ts:287:5

# Error details

```
Error: page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL
Call log:
  - navigating to "/connexion", waiting until "load"

```

# Test source

```ts
  189 |     nom: "09 — fenêtre d'ajout d'agents",
  190 |     chemin: "/planning/activite",
  191 |     session: "valide",
  192 |     // La fenêtre porte le piège d'accessibilité de la vue : une liste de
  193 |     // cases dont certaines sont désactivées avec leur raison.
  194 |     apres: (page) =>
  195 |       page.getByRole("button", { name: /Ajouter des agents à/ }).first().click(),
  196 |   },
  197 |   { nom: "31 — paramètres", chemin: "/parametres", session: "valide" },
  198 |   {
  199 |     nom: "31 — paramètres, onglet jours fériés",
  200 |     chemin: "/parametres",
  201 |     session: "valide",
  202 |     apres: (page) => page.getByRole("link", { name: "Jours fériés" }).click(),
  203 |   },
  204 |   { nom: "32 — rôles et permissions", chemin: "/roles", session: "valide" },
  205 |   {
  206 |     nom: "32 — matrice des permissions dépliée",
  207 |     chemin: "/roles",
  208 |     session: "valide",
  209 |     // La grille la plus dense du produit : 26 modules × 30 actions.
  210 |     apres: (page) => page.getByRole("button", { name: "Ouvrir la matrice" }).nth(1).click(),
  211 |   },
  212 |   { nom: "33 — journal d'audit", chemin: "/audit", session: "valide" },
  213 |   { nom: "34 — tâches prédéfinies", chemin: "/taches-predefinies", session: "valide" },
  214 |   { nom: "adresse inconnue", chemin: "/adresse-inexistante", session: "valide" },
  215 | ];
  216 | 
  217 | async function preparer(page: Page, session: "valide" | "absente", theme: "clair" | "sombre") {
  218 |   if (session === "valide") {
  219 |     await serveur(page, {
  220 |       session: SESSION_COMPLETE,
  221 |       reponses: {
  222 |         "/api/projets": { corps: { projets: [LIGNE_PROJET], affiches: 1, total: 1 } },
  223 |         [`/api/projets/${PROJET.id}`]: { corps: PROJET },
  224 |         "/feuille-de-route": { corps: ROUTE },
  225 |         "/equipe": { corps: EQUIPE },
  226 |         "/api/taches": { corps: LISTE },
  227 |         [`/api/taches/${FICHE.id}`]: { corps: FICHE },
  228 |         "/utilisateurs": { corps: { utilisateurs: [] } },
  229 |         "/api/evenements": { corps: EVENEMENTS },
  230 |         "/api/conges/soldes": { corps: SOLDES },
  231 |         "/api/conges/types": { corps: TYPES_CONGE },
  232 |         "/api/conges/delegations": { corps: DELEGATIONS },
  233 |         "/api/conges": { corps: DEMANDES },
  234 |         "/api/teletravail/regles": { corps: REGLES_TELETRAVAIL },
  235 |         "/api/teletravail": { corps: PLANNING_TELETRAVAIL },
  236 |         "/api/temps": { corps: SAISIES },
  237 |         "/api/competences/matrice": { corps: MATRICE },
  238 |         "/api/competences": { corps: REFERENTIEL },
  239 |         "/api/tiers": { corps: LISTE_TIERS },
  240 |         [`/api/tiers/${FICHE_TIERS.id}`]: { corps: FICHE_TIERS },
  241 |         "/api/clients": { corps: CLIENTS },
  242 |         [`/api/clients/${FICHE_CLIENT.id}`]: { corps: FICHE_CLIENT },
  243 |         "/api/utilisateurs": { corps: UTILISATEURS },
  244 |         "/suivi": { corps: SUIVI },
  245 |         "/api/organisation": { corps: ARBORESCENCE },
  246 |         "/api/parametrage": { corps: REGLAGES },
  247 |         "/api/parametrage/feries": { corps: FERIES },
  248 |         "/api/parametrage/vacances": { corps: VACANCES },
  249 |         "/api/administration/roles": { corps: ROLES },
  250 |         "/api/administration/roles/r-agent/matrice": { corps: MATRICE_PERSONNALISE },
  251 |         "/api/administration/audit": { corps: AUDIT },
  252 |         "/api/administration/audit/facettes": { corps: FACETTES_AUDIT },
  253 |         "/api/activite/taches": { corps: PREDEFINIES },
  254 |         "/api/planning": { corps: SEMAINE },
  255 |         "/api/tableau-de-bord": { corps: TABLEAU },
  256 |         "/api/rapports": { corps: VUE_ENSEMBLE },
  257 |         "/api/rapports/gantt": { corps: GANTT },
  258 |         [`/api/projets/${PROJET_GANTT.id}`]: { corps: PROJET_GANTT },
  259 |         [`/api/projets/${PROJET_GANTT.id}/feuille-de-route`]: { corps: ROUTE_GANTT },
  260 |         // Le motif porte sa chaîne de requête : la vue 15 demande les tâches
  261 |         // d'un projet, pas la liste globale servie plus haut.
  262 |         [`/api/taches?projectId=${PROJET_GANTT.id}`]: { corps: TACHES_GANTT },
  263 |         "/api/planning/activite": { corps: GRILLE_ACTIVITE },
  264 |         "/api/activite/eligibilite": { corps: ELIGIBILITE_A11Y },
  265 |       },
  266 |     });
  267 |   } else {
  268 |     await page.route(
  269 |       (url) => url.pathname.startsWith("/api/"),
  270 |       (route) =>
  271 |         route.fulfill({
  272 |           status: 401,
  273 |           contentType: "application/json",
  274 |           body: JSON.stringify({ cle: "auth:erreurs.sessionRequise", message: "Session requise" }),
  275 |         }),
  276 |     );
  277 |   }
  278 |   // Le thème est mémorisé avant le premier rendu : l'appliquer après ferait
  279 |   // mesurer axe sur la palette claire pendant un instant.
  280 |   await page.addInitScript((t: string) => {
  281 |     window.localStorage.setItem("trame.theme", t);
  282 |   }, theme === "sombre" ? "sombre" : "clair");
  283 | }
  284 | 
  285 | for (const vue of VUES) {
  286 |   for (const theme of ["clair", "sombre"] as const) {
  287 |     test(`${vue.nom} — thème ${theme}`, async ({ page }) => {
  288 |       await preparer(page, vue.session, theme);
> 289 |       await page.goto(vue.chemin);
      |                  ^ Error: page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL
  290 |       await page.waitForLoadState("networkidle");
  291 |       if (vue.apres) {
  292 |         await vue.apres(page);
  293 |         await page.waitForLoadState("networkidle");
  294 |       }
  295 | 
  296 |       const resultat = await new AxeBuilder({ page })
  297 |         .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
  298 |         .analyze();
  299 | 
  300 |       const graves = resultat.violations.filter(
  301 |         (v) => v.impact === "critical" || v.impact === "serious",
  302 |       );
  303 | 
  304 |       if (graves.length) {
  305 |         console.log(
  306 |           `\n${vue.nom} (${theme}) — ${graves.length} violation(s) :\n` +
  307 |             graves
  308 |               .map(
  309 |                 (v) =>
  310 |                   `  · [${v.impact}] ${v.id} — ${v.help}\n` +
  311 |                   v.nodes
  312 |                     .slice(0, 3)
  313 |                     .map((n) => `      ${n.target.join(" ")}`)
  314 |                     .join("\n"),
  315 |               )
  316 |               .join("\n"),
  317 |         );
  318 |       }
  319 |       expect(graves.map((v) => v.id)).toEqual([]);
  320 |     });
  321 |   }
  322 | }
  323 | 
```