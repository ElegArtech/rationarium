import { test, expect } from "@playwright/test";
import { serveur, SESSION } from "./fixtures/projets.js";

/**
 * **L'horloge est figée.** Les jeux d'essai de ce fichier portent des dates en
 * dur d'août 2026, et les vues construisent leurs grilles, leurs retards et
 * leurs décomptes à partir d'« aujourd'hui ».
 *
 * Le piège est consigné — « un test vert le lundi tombe le mardi » — et il
 * s'est réveillé le 1er septembre 2026 sur `occupations.e2e.spec.ts` : trois
 * contrôles verts la veille cherchaient des cases d'août dans une grille de
 * septembre. Neuf suites figeaient déjà leur horloge ; les autres ne tenaient
 * que par la coïncidence du mois en cours.
 *
 * Le 11 août 2026 est un mardi, au milieu de la fenêtre des jeux d'essai.
 */
const MOMENT_FIGE = new Date("2026-08-11T09:00:00.000Z");

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(MOMENT_FIGE);
});


/**
 * L-23 — la cloche de notifications.
 *
 * Elle est le canal qui **ne dépend de rien d'extérieur** : elle fonctionne
 * quand la messagerie est en panne, et c'est ce que `RG-NTF-04` garantit côté
 * serveur. Les contrôles portent sur ce que l'utilisateur voit et peut faire,
 * pas sur l'envoi de courriel — qui n'a pas d'observable ici, et c'est voulu.
 */

/**
 * Le jeu d'essai se calque sur la SIGNATURE du service, jamais sur ce que le
 * client croit recevoir : `lister()` rend `titre` et `contenu` — la langue du
 * COMPTE — **et** `cle`/`params`, dont le panneau compose sa phrase dans la
 * langue de la SESSION (`RG-GEN-08`). Les titres sont ceux de `cadrage/01
 * § M18`, liste fermée : « Nouvelle tâche : X » n'en fait pas partie et le
 * serveur ne l'écrit plus depuis la vague 1.
 */
const NOTIFICATIONS = {
  entrees: [
    {
      id: "n1", type: "conge_a_valider",
      titre: "Demande de congé à valider",
      contenu: "Une demande de congé de 5 jours attend votre décision.",
      cle: "conge_a_valider", params: { jours: "5" },
      lien: "/conges", lue: false, creeLe: "2026-08-11T08:30:00.000Z",
    },
    {
      id: "n2", type: "tache_assignee",
      titre: "Nouvelle tâche assignée",
      contenu: "La tâche « Rédiger la note » vous a été assignée.",
      cle: "tache_assignee", params: { tache: "Rédiger la note" },
      lien: "/taches/t1", lue: false, creeLe: "2026-08-10T14:00:00.000Z",
    },
    {
      // Une notification lue reste VISIBLE : elle change d'apparence.
      id: "n3", type: "ajout_projet",
      titre: "Ajout à un projet",
      contenu: "Vous avez été ajouté au projet « Portail citoyen ».",
      cle: "ajout_projet", params: { projet: "Portail citoyen" },
      lien: "/projets/p1", lue: true, creeLe: "2026-08-09T09:00:00.000Z",
    },
  ],
  nonLues: 2,
};

const VIDE = { entrees: [], nonLues: 0 };

const reponses = { "/api/notifications": { corps: NOTIFICATIONS } };

test.describe("La cloche de notifications", () => {
  test("EX-NTF-01 — LE COMPTEUR EST ANNONCÉ EN TOUTES LETTRES", async ({ page }) => {
    await serveur(page, { session: SESSION, reponses });
    await page.goto("/profil");

    // Une pastille colorée seule ne dit rien à une assistance technique.
    await expect(page.getByRole("button", { name: "2 notifications non lues" })).toBeVisible();
  });

  test("le panneau liste les notifications, avec leur horodatage", async ({ page }) => {
    await serveur(page, { session: SESSION, reponses });
    await page.goto("/profil");
    await page.getByRole("button", { name: "2 notifications non lues" }).click();

    await expect(page.getByText("Demande de congé à valider")).toBeVisible();
    await expect(page.getByText("Nouvelle tâche assignée")).toBeVisible();
    await expect(page.getByText(/attend votre décision/)).toBeVisible();
  });

  test("chaque notification MÈNE À SON OBJET", async ({ page }) => {
    await serveur(page, { session: SESSION, reponses });
    await page.goto("/profil");
    await page.getByRole("button", { name: "2 notifications non lues" }).click();

    // Une notification qui ne mène nulle part oblige à retrouver l'objet.
    await expect(
      page.getByRole("link", { name: "Demande de congé à valider" }),
    ).toHaveAttribute("href", "/conges");
    await expect(
      page.getByRole("link", { name: "Nouvelle tâche assignée" }),
    ).toHaveAttribute("href", "/taches/t1");
  });

  test("UNE NOTIFICATION LUE RESTE VISIBLE — elle ne disparaît pas", async ({ page }) => {
    await serveur(page, { session: SESSION, reponses });
    await page.goto("/profil");
    await page.getByRole("button", { name: "2 notifications non lues" }).click();

    // La faire disparaître ferait perdre ce qu'on vient de lire avant d'avoir
    // eu le temps d'agir dessus.
    await expect(page.getByText("Ajout à un projet")).toBeVisible();
    // Et elle n'offre plus le marquage : il n'y a plus rien à marquer.
    await expect(
      page.getByRole("button", { name: /Marquer « Ajout à un projet/ }),
    ).toHaveCount(0);
  });

  test("EX-NTF-02 — une notification se marque comme lue, une par une", async ({ page }) => {
    await serveur(page, {
      session: SESSION,
      reponses: { ...reponses, "/api/notifications/n1": { corps: { lue: true } } },
    });
    await page.goto("/profil");
    await page.getByRole("button", { name: "2 notifications non lues" }).click();

    const marquer = page.getByRole("button", { name: /Marquer « Demande de congé à valider »/ });
    await expect(marquer).toBeVisible();
    await marquer.click();
  });

  test("EX-NTF-03 — tout marquer comme lu", async ({ page }) => {
    await serveur(page, {
      session: SESSION,
      reponses: { ...reponses, "/api/notifications/tout-lu": { corps: { marquees: 2 } } },
    });
    await page.goto("/profil");
    await page.getByRole("button", { name: "2 notifications non lues" }).click();

    await expect(page.getByRole("button", { name: "Tout marquer comme lu" })).toBeVisible();
  });

  test("aucune notification : l'état vide explique à quoi sert la cloche", async ({ page }) => {
    await serveur(page, {
      session: SESSION,
      reponses: { "/api/notifications": { corps: VIDE } },
    });
    await page.goto("/profil");
    await page.getByRole("button", { name: "aucune notification non lue" }).click();

    await expect(page.getByText("Aucune notification")).toBeVisible();
    await expect(
      page.getByText(/Vous serez prévenu ici des tâches, congés et projets/),
    ).toBeVisible();
    // Rien à marquer : le bouton n'est pas proposé pour être inerte.
    await expect(page.getByRole("button", { name: "Tout marquer comme lu" })).toHaveCount(0);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * `RG-GEN-08` — **le panneau parle la langue de la SESSION, pas celle du
 * compte.**
 *
 * Défaut constaté en seconde passe (P-18, P-19, P-20, P-166), sur quatre
 * parcours joués en anglais : le cadre rendait « Notifications / Mark all as
 * read » et les entrées « Décision sur votre demande de congé », « Ajout à un
 * projet », « Nouvelle tâche assignée ». Le serveur compose dans la langue de
 * `users.langue` ; l'interface, elle, suit la bascule FR/EN de l'en-tête.
 *
 * Le jeu d'essai rend donc, exprès, un `titre` et un `contenu` FRANÇAIS —
 * c'est ce que fait le serveur pour un compte français — accompagnés de `cle`
 * et `params`. Ce que le contrôle exige : qu'aucune de ces deux phrases
 * françaises n'atteigne l'écran en session anglaise.
 * ════════════════════════════════════════════════════════════════════════════
 */
test.describe("La cloche en session anglaise", () => {
  test("RG-GEN-08 — TITRE ET CORPS SONT EN ANGLAIS, pas seulement le cadre", async ({ page }) => {
    await serveur(page, { session: SESSION, reponses });
    await page.goto("/profil");

    await page.getByRole("button", { name: "EN", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");

    await page.getByRole("button", { name: "2 unread notifications" }).click();

    // Les trois intitulés de M18, en anglais.
    await expect(page.getByText("Leave request to approve", { exact: true })).toBeVisible();
    await expect(page.getByText("New task assigned", { exact: true })).toBeVisible();
    await expect(page.getByText("Added to a project", { exact: true })).toBeVisible();

    // Et les corps, composés depuis `cle`/`params` — pluriel ICU compris.
    await expect(
      page.getByText("A leave request of 5 days is awaiting your decision.", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Task “Rédiger la note” has been assigned to you.", { exact: true }),
    ).toBeVisible();

    /*
     * Le défaut, mot pour mot : la phrase du serveur affichée telle quelle.
     * `getByText` de Playwright est INSENSIBLE À LA CASSE et cherche une
     * sous-chaîne — sur des phrases entières, c'est ce qu'on veut ici.
     */
    const panneau = page.getByRole("dialog", { name: "Notifications" });
    for (const francais of [
      "Demande de congé à valider",
      "Nouvelle tâche assignée",
      "Ajout à un projet",
      "attend votre décision",
      "vous a été assignée",
    ]) {
      await expect(panneau.getByText(francais), francais).toHaveCount(0);
    }
  });
});
