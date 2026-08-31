import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { creerClient, type PrismaClient } from "@rationarium/db";
import { ActiviteService } from "./activite.service.js";
import { AuditService } from "../commun/audit.service.js";
import { PerimetreService } from "../commun/perimetre.service.js";

/**
 * L-19 — tâches prédéfinies, permanences, récurrences.
 *
 * **Ce fichier n'existait pas.** Le module se créait, se lisait, s'assignait et
 * engendrait — sans un seul contrôle d'intégration. Trois capacités y
 * manquaient d'ailleurs sans que rien ne le dise : modifier une tâche
 * prédéfinie, poser une règle de récurrence, arrêter cette règle. « Générer
 * les assignations » n'avait donc jamais rien à générer, sur aucune instance.
 */

const RACINE_DB = path.resolve(import.meta.dirname, "../../../../packages/db");
const utc = (s: string) => new Date(`${s}T00:00:00.000Z`);
const uuid = () => crypto.randomUUID();
/** Le nom d'une tâche prédéfinie est UNIQUE en base : chacune porte le sien. */
const nom = (quoi: string) => `${quoi} ${uuid().slice(0, 8)}`;

let pg: StartedPostgreSqlContainer;
let prisma: PrismaClient;
let activite: ActiviteService;

async function agent() {
  const id = uuid();
  await prisma.user.create({
    data: {
      id, login: `u-${id.slice(0, 8)}`, email: `${id.slice(0, 8)}@x.fr`,
      motDePasseHash: "x", prenom: "A", nom: "T",
    },
  });
  return id;
}

beforeAll(async () => {
  pg = await new PostgreSqlContainer("postgres:18-alpine").start();
  execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    cwd: RACINE_DB,
    env: { ...process.env, DATABASE_URL: pg.getConnectionUri() },
    stdio: "pipe",
  });
  prisma = creerClient(pg.getConnectionUri());
  activite = new ActiviteService(
    prisma as never,
    new AuditService(prisma as never),
    new PerimetreService(prisma as never),
  );
}, 900_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await pg?.stop();
});

describe("EX-ACT-02 — une tâche prédéfinie se MODIFIE, et se désactive", () => {
  /*
   * Elle se créait et se lisait ; rien ne la modifiait. Une permanence dont
   * l'horaire change devait donc être RECRÉÉE — ce qui détache ses
   * assignations passées de leur libellé, et fait perdre l'historique au
   * moment précis où on en aurait besoin.
   */
  it("le nom et l'horaire changent, l'objet reste le même", async () => {
    const acteur = await agent();
    const t = await activite.creerTache(
      { nom: nom("Accueil"), dureeParDefaut: "time_slot", heureDebut: "09:00", heureFin: "12:00" },
      acteur,
    );

    const apres = await activite.modifierTache(
      t.id,
      { nom: "Accueil du public", heureFin: "13:00" },
      acteur,
    );

    expect(apres.id).toBe(t.id);
    expect(apres.nom).toBe("Accueil du public");
    expect(apres.heureFin).toBe("13:00");
  });

  it("un créneau ne peut pas PERDRE ses horaires", async () => {
    // La règle vaut à la modification comme à la création : sans elle, on
    // fabrique un créneau qui ne dit pas quand.
    const acteur = await agent();
    const t = await activite.creerTache(
      { nom: nom("Astreinte"), dureeParDefaut: "time_slot", heureDebut: "18:00", heureFin: "08:00" },
      acteur,
    );
    await expect(
      activite.modifierTache(t.id, { heureDebut: null }, acteur),
    ).rejects.toMatchObject({ code: "creneau_sans_horaires" });
  });

  it("RG-GEN-10 — désactiver NE SUPPRIME RIEN, et se défait", async () => {
    const acteur = await agent();
    const t = await activite.creerTache({ nom: nom("Permanence") }, acteur);

    const eteinte = await activite.modifierTache(t.id, { actif: false }, acteur);
    expect(eteinte.actif).toBe(false);
    expect(await prisma.predefinedTask.count({ where: { id: t.id } })).toBe(1);

    const rendue = await activite.modifierTache(t.id, { actif: true }, acteur);
    expect(rendue.actif).toBe(true);
  });
});

describe("EX-ACT-04 — les règles de récurrence SE POSENT", () => {
  /*
   * Elles étaient lues et exploitées par `genererDepuisRecurrences`, mais rien
   * ne permettait d'en créer une. « Générer les assignations » n'avait donc
   * jamais rien à générer, sur aucune instance.
   */
  it("une règle hebdomadaire engendre les assignations attendues", async () => {
    const acteur = await agent();
    const porteur = await agent();
    const t = await activite.creerTache({ nom: nom("Accueil") }, acteur);

    // Le lundi, à partir du 1er juin 2026 — un lundi.
    await activite.creerRecurrence(
      t.id,
      { type: "weekly", jourSemaine: 1, dateDebut: utc("2026-06-01") },
      acteur,
    );

    const bilan = await activite.genererDepuisRecurrences(
      t.id,
      utc("2026-06-01"),
      utc("2026-06-30"),
      [porteur],
      acteur,
    );
    expect(bilan.crees).toBeGreaterThan(0);
  });

  it("une date de fin antérieure au début est REFUSÉE", async () => {
    const acteur = await agent();
    const t = await activite.creerTache({ nom: nom("Astreinte") }, acteur);
    await expect(
      activite.creerRecurrence(
        t.id,
        { type: "weekly", dateDebut: utc("2026-06-10"), dateFin: utc("2026-06-01") },
        acteur,
      ),
    ).rejects.toMatchObject({ code: "dates_incoherentes" });
  });

  it("une règle S'ARRÊTE sans s'effacer — ce qu'elle a engendré reste", async () => {
    const acteur = await agent();
    const t = await activite.creerTache({ nom: nom("Accueil") }, acteur);
    const regle = await activite.creerRecurrence(
      t.id,
      { type: "weekly", jourSemaine: 1, dateDebut: utc("2026-06-01") },
      acteur,
    );

    const arretee = await activite.basculerRecurrence(regle.id, false, acteur);

    expect(arretee.active).toBe(false);
    expect(await prisma.predefinedTaskRecurrence.count({ where: { id: regle.id } })).toBe(1);
  });

  /**
   * `RG-ACT-04` — les trois types de `cadrage/02` doivent tous ENGENDRER.
   *
   * Le point d'entrée de création n'acceptait que `daily`, `weekly` et
   * `monthly` ; le moteur ne lit que `weekly`, `monthly_fixed` et
   * `monthly_ordinal`. Une règle mensuelle se créait donc sans erreur et ne
   * produisait rien. Chaque type avait son test — mais aucun ne CONFRONTAIT
   * la valeur écrite à celle que le moteur relit, et c'est là qu'était le
   * défaut.
   */
  it.each([
    ["monthly_fixed", { jourMois: 15 }],
    ["monthly_ordinal", { jourSemaine: 2, ordinal: 3 }],
  ] as const)("le type %s est accepté ET engendre des assignations", async (type, champs) => {
    const acteur = await agent();
    const porteur = await agent();
    const t = await activite.creerTache({ nom: nom("Guichet") }, acteur);

    const regle = await activite.creerRecurrence(
      t.id,
      { type, ...champs, dateDebut: utc("2026-06-01") },
      acteur,
    );
    // La valeur relue en base est celle que le moteur reconnaît, à la lettre.
    expect(regle.type).toBe(type);

    const bilan = await activite.genererDepuisRecurrences(
      t.id,
      utc("2026-06-01"),
      utc("2026-08-31"),
      [porteur],
      acteur,
    );
    expect(bilan.crees).toBeGreaterThan(0);
  });

  it("RG-ACT-04 — un 31 dans un mois court est ramené au dernier jour, jamais sauté", async () => {
    const acteur = await agent();
    const porteur = await agent();
    const t = await activite.creerTache({ nom: nom("Régie") }, acteur);

    await activite.creerRecurrence(
      t.id,
      { type: "monthly_fixed", jourMois: 31, dateDebut: utc("2026-02-01") },
      acteur,
    );
    // Février n'a pas de 31 : la règle doit tout de même produire une date.
    const bilan = await activite.genererDepuisRecurrences(
      t.id,
      utc("2026-02-01"),
      utc("2026-02-28"),
      [porteur],
      acteur,
    );
    expect(bilan.crees).toBe(1);
  });
});

/**
 * `EX-ACT-04` — « Définir des règles de récurrence », le verbe du milieu
 * compris.
 *
 * **Une règle se posait et s'arrêtait ; elle ne se corrigeait pas.** La route
 * `PATCH /activite/recurrences/:id` n'acceptait que `{ active }` et aucun
 * `@Delete` n'existait. Décaler un jour ou repousser une échéance imposait
 * d'arrêter la règle et d'en poser une seconde, l'ancienne restant dans la
 * liste, arrêtée, à côté de sa remplaçante. Les deux commandes de la vue 22
 * étaient désactivées derrière ce motif — exact, et laissant la commande
 * inerte pour autant.
 *
 * Même trou, même endroit du raisonnement que `EX-TLT-04` sur les règles de
 * télétravail : le catalogue savait poser et arrêter, pas réécrire.
 */
describe("EX-ACT-04 — modifier et supprimer une règle de récurrence", () => {
  it("EX-ACT-04 — MODIFIER le jour change ce que la règle engendre", async () => {
    const acteur = await agent();
    const porteur = await agent();
    const t = await activite.creerTache({ nom: nom("Permanence") }, acteur);
    const regle = await activite.creerRecurrence(
      t.id,
      { type: "weekly", jourSemaine: 1, dateDebut: utc("2026-06-01") },
      acteur,
    );

    // Le mardi, désormais.
    const modifiee = await activite.modifierRecurrence(
      regle.id,
      { jourSemaine: 2, version: regle.version },
      acteur,
    );
    expect(modifiee.jourSemaine).toBe(2);

    // Et le moteur suit : les jours engendrés sont des mardis.
    await activite.genererDepuisRecurrences(
      t.id,
      utc("2026-06-01"),
      utc("2026-06-30"),
      [porteur],
      acteur,
    );
    const jours = await prisma.predefinedTaskAssignment.findMany({
      where: { predefinedTaskId: t.id },
      select: { date: true },
    });
    expect(jours.length).toBeGreaterThan(0);
    expect(jours.every((j) => j.date.getUTCDay() === 2)).toBe(true);
  });

  it("EX-ACT-04 — la date de fin s'EFFACE par null, et son absence la laisse", async () => {
    const acteur = await agent();
    const t = await activite.creerTache({ nom: nom("Astreinte") }, acteur);
    const regle = await activite.creerRecurrence(
      t.id,
      { type: "weekly", jourSemaine: 1, dateDebut: utc("2026-06-01"), dateFin: utc("2026-12-31") },
      acteur,
    );

    // Ne rien dire de la date de fin la laisse en place.
    const inchangee = await activite.modifierRecurrence(
      regle.id,
      { frequence: 2, version: regle.version },
      acteur,
    );
    expect(inchangee.dateFin).not.toBeNull();

    // `null` la retire : l'absence d'échéance est un état, pas un oubli.
    const sansFin = await activite.modifierRecurrence(
      regle.id,
      { dateFin: null, version: inchangee.version },
      acteur,
    );
    expect(sansFin.dateFin).toBeNull();
  });

  it("EX-ACT-04 — une fin qui précède le début est refusée sur l'état RÉSULTANT", async () => {
    /*
     * Ne changer que `dateDebut` pour le faire passer après une `dateFin` déjà
     * en base est licite requête par requête, et interdit en résultat.
     */
    const acteur = await agent();
    const t = await activite.creerTache({ nom: nom("Renfort") }, acteur);
    const regle = await activite.creerRecurrence(
      t.id,
      { type: "weekly", jourSemaine: 1, dateDebut: utc("2026-06-01"), dateFin: utc("2026-06-30") },
      acteur,
    );

    await expect(
      activite.modifierRecurrence(regle.id, { dateDebut: utc("2026-07-15"), version: regle.version }, acteur),
    ).rejects.toMatchObject({ code: "dates_incoherentes" });
  });

  it("RG-GEN-07 — une modification sur une version périmée est REFUSÉE", async () => {
    /*
     * Une règle engendre des assignations pour tout un service : deux
     * corrections concurrentes qui s'écraseraient produiraient un planning que
     * personne n'a demandé.
     */
    const acteur = await agent();
    const t = await activite.creerTache({ nom: nom("Concurrence") }, acteur);
    const regle = await activite.creerRecurrence(
      t.id,
      { type: "weekly", jourSemaine: 1, dateDebut: utc("2026-06-01") },
      acteur,
    );

    await activite.modifierRecurrence(regle.id, { frequence: 2, version: regle.version }, acteur);
    await expect(
      activite.modifierRecurrence(regle.id, { frequence: 3, version: regle.version }, acteur),
    ).rejects.toMatchObject({ code: "conflit_de_version" });

    // Le premier écrit tient : le refus n'a rien écrasé.
    const apres = await prisma.predefinedTaskRecurrence.findUniqueOrThrow({ where: { id: regle.id } });
    expect(apres.frequence).toBe(2);
  });

  it("EX-ACT-04 — SUPPRIMER la règle laisse les assignations qu'elle a engendrées", async () => {
    const acteur = await agent();
    const porteur = await agent();
    const t = await activite.creerTache({ nom: nom("Effacement") }, acteur);
    const regle = await activite.creerRecurrence(
      t.id,
      { type: "weekly", jourSemaine: 1, dateDebut: utc("2026-06-01") },
      acteur,
    );
    await activite.genererDepuisRecurrences(
      t.id,
      utc("2026-06-01"),
      utc("2026-06-30"),
      [porteur],
      acteur,
    );
    const avant = await prisma.predefinedTaskAssignment.count({ where: { predefinedTaskId: t.id } });
    expect(avant).toBeGreaterThan(0);

    const { assignationsConservees } = await activite.supprimerRecurrence(regle.id, acteur);
    expect(assignationsConservees).toBe(avant);

    // La règle disparaît, le travail reste : quelqu'un l'a peut-être déjà tenu.
    expect(await prisma.predefinedTaskRecurrence.count({ where: { id: regle.id } })).toBe(0);
    expect(await prisma.predefinedTaskAssignment.count({ where: { predefinedTaskId: t.id } })).toBe(avant);
  });

  it("EX-ACT-04 — la suppression est TRACÉE, avec ce qu'elle conserve", async () => {
    const acteur = await agent();
    const t = await activite.creerTache({ nom: nom("Trace") }, acteur);
    const regle = await activite.creerRecurrence(
      t.id,
      { type: "weekly", jourSemaine: 1, dateDebut: utc("2026-06-01") },
      acteur,
    );
    await activite.supprimerRecurrence(regle.id, acteur);

    const trace = await prisma.auditLog.findFirst({
      where: { action: "predefined_task.recurrence_delete", entiteId: t.id },
      orderBy: { horodatage: "desc" },
    });
    expect((trace?.detail as { regle?: string } | null)?.regle).toBe(regle.id);
  });

  it("EX-ACT-04 — une règle inexistante se dit introuvable, des deux côtés", async () => {
    const acteur = await agent();
    await expect(
      activite.supprimerRecurrence(crypto.randomUUID(), acteur),
    ).rejects.toMatchObject({ code: "introuvable" });
    await expect(
      activite.modifierRecurrence(crypto.randomUUID(), { version: 1 }, acteur),
    ).rejects.toMatchObject({ code: "introuvable" });
  });
});
