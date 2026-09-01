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

const NOTIFICATIONS = {
  entrees: [
    {
      id: "n1", type: "conge_a_valider",
      titre: "Demande de congé à valider",
      contenu: "Une demande de congé de 5 jour(s) attend votre décision.",
      lien: "/conges", lue: false, creeLe: "2026-08-11T08:30:00.000Z",
    },
    {
      id: "n2", type: "tache_assignee",
      titre: "Nouvelle tâche : Rédiger la note",
      contenu: "La tâche « Rédiger la note » vous a été assignée.",
      lien: "/taches/t1", lue: false, creeLe: "2026-08-10T14:00:00.000Z",
    },
    {
      // Une notification lue reste VISIBLE : elle change d'apparence.
      id: "n3", type: "ajout_projet",
      titre: "Ajout au projet Portail citoyen",
      contenu: "Vous avez été ajouté au projet « Portail citoyen ».",
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
    await expect(page.getByText("Nouvelle tâche : Rédiger la note")).toBeVisible();
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
      page.getByRole("link", { name: "Nouvelle tâche : Rédiger la note" }),
    ).toHaveAttribute("href", "/taches/t1");
  });

  test("UNE NOTIFICATION LUE RESTE VISIBLE — elle ne disparaît pas", async ({ page }) => {
    await serveur(page, { session: SESSION, reponses });
    await page.goto("/profil");
    await page.getByRole("button", { name: "2 notifications non lues" }).click();

    // La faire disparaître ferait perdre ce qu'on vient de lire avant d'avoir
    // eu le temps d'agir dessus.
    await expect(page.getByText("Ajout au projet Portail citoyen")).toBeVisible();
    // Et elle n'offre plus le marquage : il n'y a plus rien à marquer.
    await expect(
      page.getByRole("button", { name: /Marquer « Ajout au projet/ }),
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
