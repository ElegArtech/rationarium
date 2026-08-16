import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { creerClient, type PrismaClient } from "@trame/db";
import { ProjetsService, ErreurProjet } from "./projets.service.js";
import { AuditService } from "../commun/audit.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { FileService } from "../notifications/file.service.js";
import { PerimetreService } from "../commun/perimetre.service.js";

/** L-10 — projets, jalons, épopées, équipe. */

const RACINE_DB = path.resolve(import.meta.dirname, "../../../../packages/db");
const utc = (s: string) => new Date(`${s}T00:00:00.000Z`);

let pg: StartedPostgreSqlContainer;
let prisma: PrismaClient;
let projets: ProjetsService;
let perimetres: PerimetreService;
let chef: string;

const uuid = () => crypto.randomUUID();

async function agent(prenom = "A") {
  const id = uuid();
  await prisma.user.create({
    data: {
      id, login: `u-${id.slice(0, 8)}`, email: `${id.slice(0, 8)}@x.fr`,
      motDePasseHash: "x", prenom, nom: "T",
    },
  });
  return id;
}

const nouveauProjet = (o: Partial<Parameters<ProjetsService["creer"]>[0]> = {}) => ({
  nom: `Projet ${uuid().slice(0, 8)}`,
  dateDebut: utc("2026-01-01"),
  dateFin: utc("2026-12-31"),
  ...o,
});

beforeAll(async () => {
  pg = await new PostgreSqlContainer("postgres:18-alpine").start();
  execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    cwd: RACINE_DB,
    env: { ...process.env, DATABASE_URL: pg.getConnectionUri() },
    stdio: "pipe",
  });
  prisma = creerClient(pg.getConnectionUri());
  // `RG-NTF-04` — la file n'est PAS démarrée ici. C'est délibéré : ces suites
  // prouvent au passage que les actions métier aboutissent sans elle.
  const notifications = new NotificationsService(prisma as never, new FileService());
  perimetres = new PerimetreService(prisma as never);
  projets = new ProjetsService(
    prisma as never,
    new AuditService(prisma as never),
    perimetres,
    notifications,
  );
  chef = await agent("Driss");
}, 240_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await pg?.stop();
});

const global = () => perimetres.resoudre(chef, new Set(["projects:manage_any"]));
const toutes = new Set(["projects:manage_any"]);

describe("RG-PRJ-01 — cohérence des dates", () => {
  it("refuse une fin antérieure au début", async () => {
    await expect(
      projets.creer(nouveauProjet({ dateDebut: utc("2026-06-01"), dateFin: utc("2026-05-01") }), chef),
    ).rejects.toMatchObject({ code: "dates_incoherentes" });
  });
});

describe("RG-PRJ-07 — la progression est CALCULÉE, jamais saisie", () => {
  it("un projet sans tâche est à 0, pas à 100", async () => {
    // Une division vide mal gardée donnerait 100 %.
    const p = await projets.creer(nouveauProjet(), chef);
    expect(await projets.progression(p.id)).toBe(0);
  });

  it("moyenne des avancements, et non ratio de tâches terminées", async () => {
    const p = await projets.creer(nouveauProjet(), chef);
    await prisma.task.createMany({
      data: [
        { titre: "A", projectId: p.id, avancement: 90, statut: "doing" },
        { titre: "B", projectId: p.id, avancement: 10, statut: "doing" },
      ],
    });
    // Un ratio de terminées donnerait 0 %. Une tâche à 90 % vaut ce qu'elle vaut.
    expect(await projets.progression(p.id)).toBe(50);
  });

  it("toutes terminées donne 100", async () => {
    const p = await projets.creer(nouveauProjet(), chef);
    await prisma.task.createMany({
      data: [
        { titre: "A", projectId: p.id, avancement: 100, statut: "done" },
        { titre: "B", projectId: p.id, avancement: 100, statut: "done" },
      ],
    });
    expect(await projets.progression(p.id)).toBe(100);
  });
});

describe("RG-PRJ-08 — le budget consommé inclut le temps des TÂCHES", () => {
  it("somme le temps déclaré sur le projet et sur ses tâches", async () => {
    const p = await projets.creer(nouveauProjet({ budgetHeures: 100 }), chef);
    const tache = await prisma.task.create({ data: { titre: "T", projectId: p.id } });

    await prisma.timeEntry.create({
      data: { userId: chef, projectId: p.id, date: utc("2026-03-02"), heures: 10 },
    });
    await prisma.timeEntry.create({
      data: { userId: chef, taskId: tache.id, date: utc("2026-03-03"), heures: 5 },
    });

    const b = await projets.budget(p.id);
    // Omettre les tâches donnerait 10 au lieu de 15 : un budget systématiquement
    // sous-évalué.
    expect(b.consomme).toBe(15);
    expect(b.restant).toBe(85);
    expect(b.depassement).toBe(false);
  });

  it("signale le dépassement", async () => {
    const p = await projets.creer(nouveauProjet({ budgetHeures: 4 }), chef);
    await prisma.timeEntry.create({
      data: { userId: chef, projectId: p.id, date: utc("2026-03-02"), heures: 6 },
    });
    const b = await projets.budget(p.id);
    expect(b.depassement).toBe(true);
    expect(b.restant).toBe(-2);
  });

  it("un projet sans budget alloué ne calcule pas de restant", async () => {
    const p = await projets.creer(nouveauProjet(), chef);
    const b = await projets.budget(p.id);
    expect(b.alloue).toBeNull();
    expect(b.restant).toBeNull();
  });
});

describe("RG-PRJ-02, RG-PRJ-04 — suppression logique et restauration", () => {
  it("annuler passe au statut Annulé, sans effacer", async () => {
    const p = await projets.creer(nouveauProjet(), chef);
    await projets.annuler(p.id, chef);
    const apres = await prisma.project.findUniqueOrThrow({ where: { id: p.id } });
    expect(apres.statut).toBe("cancelled");
  });

  it("un projet annulé refuse toute modification jusqu'à restauration", async () => {
    const p = await projets.creer(nouveauProjet(), chef);
    await projets.annuler(p.id, chef);

    const membre = await agent();
    await expect(
      projets.ajouterMembre(p.id, { userId: membre, roleProjet: "Membre" }, chef),
    ).rejects.toMatchObject({ code: "projet_annule" });

    await projets.restaurer(p.id, chef);
    await expect(
      projets.ajouterMembre(p.id, { userId: membre, roleProjet: "Membre" }, chef),
    ).resolves.toBeTruthy();
  });
});

describe("RG-PRJ-05 — archivage, deux refus DISTINCTS", () => {
  it("archiver deux fois est refusé, et le refus dit lequel des deux cas", async () => {
    const p = await projets.creer(nouveauProjet(), chef);
    await projets.archiver(p.id, true, chef);
    await expect(projets.archiver(p.id, true, chef)).rejects.toMatchObject({
      code: "deja_archive",
    });
  });

  it("désarchiver un projet non archivé est refusé, avec l'autre code", async () => {
    const p = await projets.creer(nouveauProjet(), chef);
    await expect(projets.archiver(p.id, false, chef)).rejects.toMatchObject({
      code: "pas_archive",
    });
  });
});

describe("RG-PRJ-03 — la suppression définitive PROPOSE une alternative", () => {
  it("du temps déclaré bloque, et l'archivage est proposé", async () => {
    const p = await projets.creer(nouveauProjet(), chef);
    await prisma.timeEntry.create({
      data: { userId: chef, projectId: p.id, date: utc("2026-03-02"), heures: 3 },
    });

    const impact = await projets.impactSuppression(p.id);
    expect(impact.blocages).toEqual([{ objet: "heures déclarées", nombre: 1 }]);
    // Un refus sans alternative pousse à contourner.
    expect(impact.alternative).toBe("archiver");

    const erreur = await projets.supprimerDefinitivement(p.id, chef).catch((e: ErreurProjet) => e);
    expect((erreur as ErreurProjet).detail?.alternative).toBe("archiver");
  });

  it("un projet sans historique se supprime, et l'effacement est annoncé", async () => {
    const p = await projets.creer(nouveauProjet(), chef);
    await prisma.task.create({ data: { titre: "T", projectId: p.id } });
    const impact = await projets.impactSuppression(p.id);
    expect(impact.blocages).toEqual([]);
    expect(impact.effacements).toContainEqual({ objet: "tâches", nombre: 1 });
    await expect(projets.supprimerDefinitivement(p.id, chef)).resolves.toBeUndefined();
  });
});

describe("RG-PRJ-06 — un membre ne s'ajoute pas deux fois", () => {
  it("le second ajout est refusé", async () => {
    const p = await projets.creer(nouveauProjet(), chef);
    const membre = await agent();
    await projets.ajouterMembre(p.id, { userId: membre, roleProjet: "Développeur" }, chef);
    await expect(
      projets.ajouterMembre(p.id, { userId: membre, roleProjet: "Testeur" }, chef),
    ).rejects.toMatchObject({ code: "membre_en_double" });
  });
});


describe("EX-PRJ-09 — le rôle d'un membre se change SANS le retirer", () => {
  /*
   * Le point d'entrée n'existait pas, et son absence se voyait à l'écran : la
   * maquette de la vue 14 pose un sélecteur de rôle sur chaque ligne d'équipe.
   * Sans lui, corriger un rôle imposait de retirer la personne puis de la
   * rajouter — un lien rompu pour être refait, avec sa notification d'ajout.
   *
   * Trouvé par la boucle de conformité de rendu : elle signalait `mini-select`
   * absente de la vue, et la cause était en amont.
   */
  it("le rôle et l'allocation changent, l'appartenance ne bouge pas", async () => {
    const p = await projets.creer(nouveauProjet(), chef);
    const membre = await agent();
    await projets.ajouterMembre(p.id, { userId: membre, roleProjet: "Développeur", tauxAllocation: 50 }, chef);

    const modifie = await projets.changerRoleMembre(
      p.id,
      membre,
      { roleProjet: "Chef de projet", tauxAllocation: 80 },
      chef,
    );

    expect(modifie.roleProjet).toBe("Chef de projet");
    expect(modifie.tauxAllocation).toBe(80);
    // L'appartenance est la même ligne : ni retrait, ni doublon.
    expect(await prisma.projectMember.count({ where: { projectId: p.id } })).toBe(1);
  });

  it("changer le rôle N'ENVOIE PAS de notification d'ajout", async () => {
    // C'est tout l'intérêt du point d'entrée : le contournement par
    // retrait-puis-ajout prévenait la personne qu'elle rejoignait un projet
    // qu'elle n'avait jamais quitté.
    const p = await projets.creer(nouveauProjet(), chef);
    const membre = await agent();
    await projets.ajouterMembre(p.id, { userId: membre, roleProjet: "Développeur" }, chef);
    const avant = await prisma.notification.count({ where: { userId: membre } });

    await projets.changerRoleMembre(p.id, membre, { roleProjet: "Testeur" }, chef);

    expect(await prisma.notification.count({ where: { userId: membre } })).toBe(avant);
  });

  it("RG-ADM — le changement est tracé, avec l'avant et l'après", async () => {
    const p = await projets.creer(nouveauProjet(), chef);
    const membre = await agent();
    await projets.ajouterMembre(p.id, { userId: membre, roleProjet: "Développeur" }, chef);
    await projets.changerRoleMembre(p.id, membre, { roleProjet: "Architecte" }, chef);

    const trace = await prisma.auditLog.findFirst({
      where: { action: "project.member_update", entiteId: p.id },
      orderBy: { horodatage: "desc" },
    });
    expect(trace).not.toBeNull();
    expect(JSON.stringify(trace?.detail)).toContain("Développeur");
    expect(JSON.stringify(trace?.detail)).toContain("Architecte");
  });

  it("une personne qui n'est pas membre est refusée, pas ajoutée en douce", async () => {
    const p = await projets.creer(nouveauProjet(), chef);
    const etranger = await agent();
    await expect(
      projets.changerRoleMembre(p.id, etranger, { roleProjet: "Testeur" }, chef),
    ).rejects.toMatchObject({ code: "membre_introuvable" });
    expect(await prisma.projectMember.count({ where: { projectId: p.id } })).toBe(0);
  });
});

describe("RG-JAL-05 — la feuille de route NOMME les tâches sans jalon", () => {
  /*
   * `RG-JAL-05` détache les tâches d'un jalon supprimé sans les supprimer :
   * elles existent donc, et la feuille de route ne les montrait nulle part.
   * Une tâche rattachée à rien est précisément celle qu'on oublie.
   */
  it("elles sont rendues à part, et comptées", async () => {
    const p = await projets.creer(nouveauProjet(), chef);
    const j = await projets.creerJalon(
      { nom: "Jalon", dateEcheance: utc("2026-06-30"), projectId: p.id },
      chef,
    );
    await prisma.task.createMany({
      data: [
        { titre: "Rattachée", projectId: p.id, milestoneId: j.id, statut: "todo" },
        { titre: "Orpheline", projectId: p.id, statut: "doing" },
      ],
    });

    const feuille = await projets.feuilleDeRoute(p.id);

    expect(feuille.sansJalon.map((t) => t.titre)).toEqual(["Orpheline"]);
    expect(feuille.indicateurs.sansJalon).toBe(1);
    // Le compte total les inclut : une tâche sans jalon reste une tâche du projet.
    expect(feuille.indicateurs.taches).toBe(2);
  });

  it("la ligne porte QUI et COMBIEN, pas seulement quoi et quand", async () => {
    // La maquette pose une pile d'avatars et une charge sur chaque ligne.
    // Sans elles, la feuille de route ne dit pas si un jalon tiendra.
    const p = await projets.creer(nouveauProjet(), chef);
    const j = await projets.creerJalon(
      { nom: "Jalon", dateEcheance: utc("2026-06-30"), projectId: p.id },
      chef,
    );
    const membre = await agent();
    const t = await prisma.task.create({
      data: { titre: "Chiffrée", projectId: p.id, milestoneId: j.id, statut: "todo", estimationHeures: 12 },
    });
    await prisma.taskAssignee.create({ data: { taskId: t.id, userId: membre } });

    const feuille = await projets.feuilleDeRoute(p.id);
    const ligne = feuille.jalons[0]?.taches[0];

    expect(Number(ligne?.estimationHeures)).toBe(12);
    expect(ligne?.assignes).toHaveLength(1);
    expect(ligne?.assignes[0]?.user.id).toBe(membre);
  });
});

describe("RG-JAL-01 — le statut d'un jalon est CALCULÉ", () => {
  it("sans tâche : En attente", async () => {
    const p = await projets.creer(nouveauProjet(), chef);
    const j = await projets.creerJalon({ nom: "J1", dateEcheance: utc("2026-06-30"), projectId: p.id }, chef);
    expect(await projets.statutJalon(j.id)).toBe("pending");
  });

  it("toutes à faire : En attente", async () => {
    const p = await projets.creer(nouveauProjet(), chef);
    const j = await projets.creerJalon({ nom: "J", dateEcheance: utc("2026-06-30"), projectId: p.id }, chef);
    await prisma.task.createMany({
      data: [
        { titre: "A", projectId: p.id, milestoneId: j.id, statut: "todo" },
        { titre: "B", projectId: p.id, milestoneId: j.id, statut: "todo" },
      ],
    });
    expect(await projets.statutJalon(j.id)).toBe("pending");
  });

  it("une seule en cours suffit : En cours", async () => {
    const p = await projets.creer(nouveauProjet(), chef);
    const j = await projets.creerJalon({ nom: "J", dateEcheance: utc("2026-06-30"), projectId: p.id }, chef);
    await prisma.task.createMany({
      data: [
        { titre: "A", projectId: p.id, milestoneId: j.id, statut: "todo" },
        { titre: "B", projectId: p.id, milestoneId: j.id, statut: "doing" },
      ],
    });
    expect(await projets.statutJalon(j.id)).toBe("doing");
  });

  it("toutes terminées : Terminé", async () => {
    const p = await projets.creer(nouveauProjet(), chef);
    const j = await projets.creerJalon({ nom: "J", dateEcheance: utc("2026-06-30"), projectId: p.id }, chef);
    await prisma.task.createMany({
      data: [
        { titre: "A", projectId: p.id, milestoneId: j.id, statut: "done" },
        { titre: "B", projectId: p.id, milestoneId: j.id, statut: "done" },
      ],
    });
    expect(await projets.statutJalon(j.id)).toBe("done");
  });

  it("il n'est PAS stocké : changer une tâche change le statut, sans rafraîchissement", async () => {
    const p = await projets.creer(nouveauProjet(), chef);
    const j = await projets.creerJalon({ nom: "J", dateEcheance: utc("2026-06-30"), projectId: p.id }, chef);
    const t = await prisma.task.create({
      data: { titre: "A", projectId: p.id, milestoneId: j.id, statut: "todo" },
    });
    expect(await projets.statutJalon(j.id)).toBe("pending");
    await prisma.task.update({ where: { id: t.id }, data: { statut: "done" } });
    // Un statut stocké se désynchroniserait ici.
    expect(await projets.statutJalon(j.id)).toBe("done");
  });
});

describe("RG-JAL-05 — supprimer un jalon DÉTACHE ses tâches", () => {
  it("les tâches survivent, sans jalon", async () => {
    const p = await projets.creer(nouveauProjet(), chef);
    const j = await projets.creerJalon({ nom: "J", dateEcheance: utc("2026-06-30"), projectId: p.id }, chef);
    const t = await prisma.task.create({
      data: { titre: "Survivante", projectId: p.id, milestoneId: j.id },
    });

    const r = await projets.supprimerJalon(j.id, chef);
    expect(r.tachesDetachees).toBe(1);

    const apres = await prisma.task.findUniqueOrThrow({ where: { id: t.id } });
    expect(apres.milestoneId).toBeNull();
    expect(apres.titre).toBe("Survivante");
  });
});

describe("EX-PRJ-01 — portefeuille : compteur ET compteur filtré", () => {
  it("le total n'est pas déductible de la liste filtrée", async () => {
    const p = await global();
    await projets.creer(nouveauProjet({ statut: "active" }), chef);
    await projets.creer(nouveauProjet({ statut: "draft" }), chef);

    const tout = await projets.portefeuille(p, toutes);
    const filtre = await projets.portefeuille(p, toutes, { statut: "draft" });

    expect(filtre.affiches).toBeLessThan(tout.total);
    // Calculer le total depuis la liste reçue donnerait un total faux.
    expect(filtre.total).toBe(tout.total);
  });

  it("les projets archivés sont hors du portefeuille par défaut", async () => {
    const p = await global();
    const archive = await projets.creer(nouveauProjet(), chef);
    await projets.archiver(archive.id, true, chef);

    const actifs = await projets.portefeuille(p, toutes);
    expect(actifs.projets.map((x) => x.id)).not.toContain(archive.id);

    const archives = await projets.portefeuille(p, toutes, { archive: true });
    expect(archives.projets.map((x) => x.id)).toContain(archive.id);
  });

  it("RG-SCOPE-02 — le portefeuille respecte la visibilité des projets", async () => {
    const etranger = await agent("Étrangère");
    await projets.creer(nouveauProjet(), chef);

    const p = await perimetres.resoudre(etranger, new Set());
    const vus = await projets.portefeuille(p, new Set());
    expect(vus.projets).toEqual([]);
  });
});

describe("RG-PRJ-09 — instantanés d'avancement", () => {
  it("capture progression, tâches et heures", async () => {
    const p = await projets.creer(nouveauProjet({ budgetHeures: 50 }), chef);
    await prisma.task.createMany({
      data: [
        { titre: "A", projectId: p.id, avancement: 100, statut: "done" },
        { titre: "B", projectId: p.id, avancement: 50, statut: "doing" },
      ],
    });
    await prisma.timeEntry.create({
      data: { userId: chef, projectId: p.id, date: utc("2026-03-02"), heures: 7 },
    });

    const snap = await projets.capturerInstantane(p.id, utc("2026-03-31"));
    expect(snap.progression).toBe(75);
    expect(snap.tachesTotal).toBe(2);
    expect(snap.tachesFinies).toBe(1);
    expect(Number(snap.heuresConsommees)).toBe(7);
  });

  it("recapturer le même jour met à jour, sans doublonner", async () => {
    const p = await projets.creer(nouveauProjet(), chef);
    await projets.capturerInstantane(p.id, utc("2026-04-30"));
    await prisma.task.create({ data: { titre: "A", projectId: p.id, avancement: 100, statut: "done" } });
    await projets.capturerInstantane(p.id, utc("2026-04-30"));

    const snaps = await prisma.projectSnapshot.findMany({ where: { projectId: p.id } });
    expect(snaps).toHaveLength(1);
    expect(snaps[0]!.progression).toBe(100);
  });
});
