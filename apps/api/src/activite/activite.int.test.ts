import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { creerClient, type PrismaClient } from "@trame/db";
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

describe("RG-ACT-08 — les règles de récurrence SE POSENT", () => {
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
});
