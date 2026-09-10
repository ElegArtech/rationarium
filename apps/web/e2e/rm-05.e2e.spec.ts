import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Page } from "@playwright/test";
import { serveur } from "./fixtures/projets.js";
import { SESSION_ANA, SESSION_PLANNING, SEMAINE, GRILLE_ACTIVITE } from "./fixtures/planning.js";
import { HUGO, EVENEMENTS } from "./fixtures/occupations.js";

async function relever(page: Page, nom: string) {
  for (const sombre of [false,true]) for (const width of [1440,768]) {
    await page.evaluate(d => document.documentElement.classList.toggle("dark",d), sombre);
    await page.setViewportSize({width,height:1024});
    await page.evaluate(async () => { await Promise.all(document.getAnimations().map(a => a.finished.catch(() => undefined))); });
    expect((await new AxeBuilder({page}).include('[role="dialog"]').analyze()).violations).toEqual([]);
    await page.screenshot({path:`../../recette/remediation/rm-05/${nom}-${sombre?"sombre":"clair"}-${width}.png`});
  }
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-08-12T09:00:00Z"));
});
for (const langue of ["fr", "en"] as const) {
  test(`RM-05 P-40 ${langue} motif lecture seule accessible au clavier`, async ({page}) => {
    await page.addInitScript(l => localStorage.setItem("rationarium.langue", l), langue);
    await serveur(page, { session: SESSION_ANA, reponses: {"/api/planning": {corps: SEMAINE}} });
    await page.goto("/planning");
    const verrou = page.locator(".pres.is-locked").first();
    await verrou.focus();
    await expect(verrou).toBeFocused();
    await expect(page.getByRole("tooltip")).toContainText(langue === "fr" ? "Lecture seule" : "Read-only");
    await expect(verrou).toHaveAttribute("aria-disabled", "true");
  });
  test(`RM-05 P-65 ${langue} métadonnées création événement`, async ({page}) => {
    await page.addInitScript(l => localStorage.setItem("rationarium.langue", l), langue);
    await serveur(page, {session: {...HUGO, permissions: [...HUGO.permissions, "directions:read"]}, reponses: {"/api/evenements": {corps: EVENEMENTS}, "/api/projets": {corps: {projets: [], total: 0, affiches: 0}}, "/api/utilisateurs": {corps: []}, "/api/organisation": {corps: {directions: [], departementsSansDirection: [{services: [{id: "s1", nom: "Service test"}]}], departements: []}}}});
    await page.goto("/evenements");
    await page.getByRole("button", {name: langue === "fr" ? "Créer un événement" : "New event", exact:true}).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Description", {exact: true})).toBeVisible();
    await expect(dialog.getByLabel(langue === "fr" ? "Intervention extérieure" : "External work", {exact: true})).toBeVisible();
    await expect(dialog.getByLabel("Service test", {exact:true})).toBeVisible();
    for (const sombre of [false,true]) for (const width of [1440,768]) {
      await page.evaluate(d => document.documentElement.classList.toggle("dark",d), sombre);
      await page.setViewportSize({width,height:1024});
      await dialog.getByLabel("Service test",{exact:true}).scrollIntoViewIfNeeded();
      await page.evaluate(async () => { await Promise.all(document.getAnimations().map(a => a.finished.catch(() => undefined))); });
    expect((await new AxeBuilder({page}).include('[role="dialog"]').analyze()).violations).toEqual([]);
      await page.screenshot({path:`../../recette/remediation/rm-05/evenement-${langue}-${sombre?"sombre":"clair"}-${width}.png`});
    }
    await dialog.locator("#ev-titre").fill("Événement metadata");
    await dialog.locator("#ev-date").fill("2026-08-12");
    await dialog.getByLabel("Description",{exact:true}).fill("Description transmise");
    await dialog.getByLabel(langue === "fr" ? "Intervention extérieure" : "External work",{exact:true}).check();
    await dialog.getByLabel("Service test",{exact:true}).check();
    const envoi=page.waitForRequest(r => r.method() === "POST" && new URL(r.url()).pathname === "/api/evenements");
    await dialog.getByRole("button",{name: langue === "fr" ? "Créer l'événement" : "Create event",exact:true}).click();
    expect((await envoi).postDataJSON()).toMatchObject({description:"Description transmise",interventionExterieure:true,serviceIds:["s1"]});
  });
  test(`RM-05 P-64 ${langue} aperçu ICS sans mutation avant confirmation`, async ({page}) => {
    await page.addInitScript(l => localStorage.setItem("rationarium.langue", l), langue);
    await serveur(page, {session: {...SESSION_PLANNING, permissions: [...SESSION_PLANNING.permissions, "planning:import_ics"]}, reponses: {"/api/planning": {corps: SEMAINE}, "/api/planning/activite": {corps: GRILLE_ACTIVITE}}});
    let imports = 0;
    await page.route("**/api/planning/ics**", async route => {
      if (route.request().url().endsWith("/apercu")) await route.fulfill({json: {evenements: [{uid: "u1", titre: "Réunion ICS", description: null, date: "2026-08-12", journeeEntiere: true, heureDebut: null, heureFin: null, statut: "a_importer"}], crees: 1, existants: 2, ignores: 3}});
      else { imports++; await route.fulfill({json: {crees: 1, existants: 2, ignores: 3, erreurs: [
        {index: 7, titre: "Fuseau final", motif: "fuseau_non_pris_en_charge"},
        {index: 8, titre: "Récurrence finale", motif: "recurrence_non_prise_en_charge"},
        {index: 9, titre: "Date finale", motif: "date_invalide"},
      ]}}); }
    });
    await page.goto("/planning/activite");
    await expect(page.getByRole("link", {name: /ICS/})).toHaveAttribute("href", /debut=2026-08-10/);
    await page.getByRole("button", {name: langue === "fr" ? "Importer un ICS" : "Import ICS"}).click();
    await page.getByRole("dialog").locator('input[type="file"]').setInputFiles({name:"agenda.ics",mimeType:"text/calendar",buffer:Buffer.from("BEGIN:VCALENDAR\nEND:VCALENDAR")});
    await page.getByRole("button", {name: langue === "fr" ? "Prévisualiser" : "Preview", exact:true}).click();
    await expect(page.getByRole("dialog")).toContainText("Réunion ICS");
    expect(imports).toBe(0);
    if(langue === "fr") await relever(page,"ics-apercu");
    await page.getByRole("button", {name: langue === "fr" ? "Confirmer l’import" : "Confirm import", exact:true}).click();
    await expect.poll(() => imports).toBe(1);
    const dialogue = page.getByRole("dialog");
    const bilan = dialogue.getByRole("status");
    await expect(bilan.locator(".alert")).toHaveText(langue === "fr"
      ? "Import terminé : 1 créé · 2 existants · 3 ignorés."
      : "Import complete: 1 created · 2 existing · 3 ignored.");
    await expect(bilan.getByRole("listitem")).toHaveCount(3);
    await expect(bilan).toContainText("Fuseau final");
    await expect(bilan).toContainText("Récurrence finale");
    await expect(bilan).toContainText("Date finale");
    const ligneApercuObsolete = dialogue
      .getByRole("listitem")
      .filter({ hasText: "Réunion ICS" })
      .filter({ hasText: langue === "fr" ? "À importer" : "To import" });
    await expect(ligneApercuObsolete).toHaveCount(0);
    await relever(page, `reprise-ics/bilan-${langue}`);
  });

  test(`RM-05 P-135 ${langue} activité inactive conserve historique sans ajout`, async ({page}) => {
    await page.addInitScript(l => localStorage.setItem("rationarium.langue", l), langue);
    await serveur(page, {session: SESSION_PLANNING, reponses: {"/api/planning/activite": {corps: {...GRILLE_ACTIVITE, colonnes: GRILLE_ACTIVITE.colonnes.map(c => ({...c, actif:false}))}}}});
    await page.goto("/planning/activite");
    await expect(page.locator(".agent-name").first()).toBeVisible();
    await expect(page.locator(".acell-add")).toHaveCount(0);
  });
  test(`RM-05 P-66 ${langue} arrêt interdit sur enfant`, async ({page}) => {
    await page.addInitScript(l => localStorage.setItem("rationarium.langue", l), langue);
    await serveur(page, {session: {...HUGO, permissions:[...HUGO.permissions,"events:update"]}, reponses: {"/api/evenements": {corps: [{...EVENEMENTS[0], parentId:"parent"}]},"/api/projets": {corps:{projets:[],total:0,affiches:0}}}});
    await page.goto("/evenements");
    await page.getByText("Comité de pilotage", {exact:true}).click();
    await expect(page.locator(".drawer-serie")).toBeVisible();
    await expect(page.getByRole("button", {name: langue === "fr" ? "Arrêter la récurrence" : "Stop the recurrence", exact:true})).toHaveCount(0);
  });

  test(`RM-05 P-134 ${langue} icône du catalogue saisissable`, async ({page}) => {
    await page.addInitScript(l => localStorage.setItem("rationarium.langue", l), langue);
    await serveur(page, {session: {...HUGO, permissions:[...HUGO.permissions,"predefined_tasks:read","predefined_tasks:create"]}, reponses: {"/api/activite/taches": {corps:[]}}});
    await page.goto("/taches-predefinies");
    await page.locator(".pt-actions").getByRole("button", {name: langue === "fr" ? "Nouvelle tâche prédéfinie" : "New recurring activity", exact:true}).click();
    const groupe = page.getByRole("dialog").getByRole("group", {name: langue === "fr" ? "Icône" : "Icon", exact:true});
    await expect(groupe).toBeVisible();
    await groupe.getByRole("button").first().click();
    await expect(groupe.getByRole("button").first()).toHaveAttribute("aria-pressed","true");
    if(langue === "fr") await relever(page,"catalogue-icone");
    await page.locator("#pt-nom").fill("Permanence icône");
    const envoi=page.waitForRequest(r => r.method() === "POST" && new URL(r.url()).pathname === "/api/activite/taches");
    await page.getByRole("dialog").getByRole("button",{name:langue === "fr" ? "Enregistrer" : "Save",exact:true}).click();
    expect((await envoi).postDataJSON()).toMatchObject({nom:"Permanence icône",icone:expect.stringMatching(/^p-/)});
  });

  test(`RM-05 P-63 ${langue} invitation de service ajoute les non-doublons et nomme les doublons`, async ({page}) => {
    await page.addInitScript(l => localStorage.setItem("rationarium.langue", l), langue);
    const agents = [{id:"a1",prenom:"Camille",nom:"Roussel",services:[{service:{id:"s1",nom:"Service test"}}]}, {id:"a2",prenom:"Driss",nom:"Amrani",services:[{service:{id:"s1",nom:"Service test"}}]}];
    await serveur(page, {session: SESSION_PLANNING, reponses:{"/api/taches":{corps:[]},"/api/projets":{corps:{projets:[],affiches:0,total:0}},"/api/utilisateurs":{corps:agents}}});
    await page.goto("/taches");
    await page.getByRole("button", {name: langue === "fr" ? "Créer une tâche" : "New task", exact:true}).first().click();
    const dialog=page.getByRole("dialog");
    await dialog.getByLabel(langue === "fr" ? "Inviter un service entier" : "Invite a whole team").selectOption("s1");
    const ajouter = dialog.getByRole("button",{name:langue === "fr" ? "Ajouter le service" : "Add team",exact:true});
    await ajouter.click();
    await expect(dialog.getByLabel("Camille Roussel",{exact:true})).toBeChecked();
    await expect(dialog.getByLabel("Driss Amrani",{exact:true})).toBeChecked();
    await dialog.getByLabel("Driss Amrani",{exact:true}).uncheck();
    await ajouter.click();
    await expect(dialog.getByLabel("Driss Amrani",{exact:true})).toBeChecked();
    await expect(dialog.getByRole("alert")).toContainText("Camille Roussel");
    await expect(dialog.getByRole("alert")).not.toContainText("Driss Amrani");
    if(langue === "fr") { await ajouter.scrollIntoViewIfNeeded(); await relever(page,"tache-service"); }
    await dialog.locator("#tk-titre").fill("Tâche service");
    const envoi=page.waitForRequest(r => r.method() === "POST" && new URL(r.url()).pathname === "/api/taches");
    await dialog.getByRole("button",{name:langue === "fr" ? "Créer la tâche" : "Create task",exact:true}).click();
    expect((await envoi).postDataJSON()).toMatchObject({assigneIds:["a1","a2"]});
  });

  test(`RM-05 P-66 ${langue} arrêt parent date explicite et version`, async ({page}) => {
    await page.addInitScript(l => localStorage.setItem("rationarium.langue", l), langue);
    await serveur(page, {session: {...HUGO, permissions:[...HUGO.permissions,"events:update"]}, reponses: {"/api/evenements": {corps: EVENEMENTS},"/api/projets": {corps:{projets:[],total:0,affiches:0}},"/api/evenements/e1/arreter":{corps:{supprimees:2}}}});
    await page.goto("/evenements");
    await page.getByText("Comité de pilotage",{exact:true}).click();
    await page.getByRole("button",{name:langue === "fr" ? "Arrêter la récurrence" : "Stop the recurrence",exact:true}).click();
    await expect(page.getByRole("dialog").last()).toContainText("12/08/2026");
    const envoi=page.waitForRequest(r => r.method() === "POST" && r.url().endsWith("/evenements/e1/arreter"));
    await page.getByRole("dialog").last().getByRole("button",{name:langue === "fr" ? "Arrêter la récurrence" : "Stop the recurrence",exact:true}).click();
    expect((await envoi).postDataJSON()).toEqual({aPartirDe:"2026-08-12",version:1});
  });

  test(`RM-05 P-88 ${langue} réalisation transmet la version lue`, async ({page}) => {
    await page.addInitScript(l => localStorage.setItem("rationarium.langue", l), langue);
    const grille={...GRILLE_ACTIVITE,lignes:GRILLE_ACTIVITE.lignes.map(l => ({...l,cellules:l.cellules.map(c => ({...c,agents:c.agents.map(a => ({...a,version:7}))}))}))};
    await serveur(page,{session:SESSION_PLANNING,reponses:{"/api/planning/activite":{corps:grille},"/api/activite/assignations/realisation":{corps:{}}}});
    await page.goto("/planning/activite");
    const envoi=page.waitForRequest(r => r.method()==="POST" && r.url().endsWith("/activite/assignations/realisation"));
    await page.locator("button.agent-st").first().click();
    expect((await envoi).postDataJSON()).toMatchObject({version:7,assignationId:"as1",realisee:false});
  });

  test(`RM-05 P-66 ${langue} récurrence sans fin explicite conservée`, async ({page}) => {
    await page.addInitScript(l => localStorage.setItem("rationarium.langue", l), langue);
    await serveur(page,{session:HUGO,reponses:{"/api/evenements":{corps:[]},"/api/projets":{corps:{projets:[],total:0,affiches:0}},"/api/utilisateurs":{corps:[]}}});
    await page.goto("/evenements");
    await page.getByRole("button",{name:langue === "fr" ? "Créer un événement" : "New event",exact:true}).first().click();
    const dialog=page.getByRole("dialog");
    await dialog.locator("#ev-titre").fill("Série horizon");
    await dialog.locator("#ev-date").fill("2026-08-12");
    await dialog.getByLabel(langue === "fr" ? "Événement récurrent" : "Recurring event",{exact:true}).check();
    await expect(dialog).toContainText(langue === "fr" ? "Sans date de fin, la série" : "Without an end date, the series");
    const envoi=page.waitForRequest(r => r.method()==="POST" && new URL(r.url()).pathname === "/api/evenements");
    await dialog.getByRole("button",{name:langue === "fr" ? "Créer l'événement" : "Create event",exact:true}).click();
    expect((await envoi).postDataJSON()).toMatchObject({recurrence:{frequenceSemaines:1,jourSemaine:3}});
  });

}
