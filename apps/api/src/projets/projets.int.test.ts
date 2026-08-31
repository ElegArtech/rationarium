import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { creerClient, type PrismaClient } from "@rationarium/db";
import { ProjetsService, ErreurProjet } from "./projets.service.js";
/*
 * `EX-PRJ-04` — la bibliothèque d'icônes est un vocabulaire FERMÉ, et la
 * validation d'entrée vit au contrôleur. L'exercer au service prouverait une
 * garantie qui n'existe pas : le service écrit ce qu'on lui passe.
 */
import { ProjetsController } from "./projets.controller.js";
import type { ContexteDemande } from "../commun/permissions.garde.js";
import { AuditService } from "../commun/audit.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { FileService } from "../notifications/file.service.js";
import { PerimetreService } from "../commun/perimetre.service.js";
import { TiersService } from "../tiers/tiers.service.js";
import { ImportsService } from "../imports/imports.service.js";
import { CongesService } from "../conges/conges.service.js";
import { CalendrierService } from "../parametrage/calendrier.service.js";

/**
 * Les droits de l'acteur, désormais transmis au service.
 *
 * `projects:manage_members` y figure parce que `chefId` et `sponsorId` sont
 * gouvernés par elle : nommer un chef donne la visibilité du projet
 * (`RG-SCOPE-02`), c'est un geste d'appartenance. Un test qui ne la porte pas
 * doit échouer — c'est le sujet de « L-38 » plus bas.
 */
const TOUS_DROITS_PROJET: ReadonlySet<string> = new Set([
  "projects:update",
  "projects:manage_members",
]);

/** L-10 — projets, jalons, épopées, équipe. */

const RACINE_DB = path.resolve(import.meta.dirname, "../../../../packages/db");
const utc = (s: string) => new Date(`${s}T00:00:00.000Z`);

let pg: StartedPostgreSqlContainer;
let prisma: PrismaClient;
let projets: ProjetsService;
let perimetres: PerimetreService;
/** `EX-PRJ-10` — les clients et les tiers d'un projet vivent dans M14. */
let tiers: TiersService;
/** `EX-PRJ-11`, `EX-PRJ-12`, `RG-PRJ-11` — l'import et l'export vivent dans M21. */
let imports: ImportsService;
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
  const audit = new AuditService(prisma as never);
  projets = new ProjetsService(prisma as never, audit, perimetres, notifications);
  tiers = new TiersService(prisma as never, audit);
  // `ImportsService` dépend de `CongesService` depuis L-43 : l'import de congés
  // réemploie le contrôle de solde et de chevauchement plutôt que d'en écrire
  // une seconde version. Cette suite ne s'en sert pas, mais le service se
  // construit entier.
  imports = new ImportsService(
    prisma as never,
    audit,
    new CongesService(
      prisma as never,
      audit,
      perimetres,
      new CalendrierService(prisma as never, audit),
      notifications,
    ),
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
      projets.creer(nouveauProjet({ dateDebut: utc("2026-06-01"), dateFin: utc("2026-05-01") }), chef, TOUS_DROITS_PROJET),
    ).rejects.toMatchObject({ code: "dates_incoherentes" });
  });
});

describe("RG-PRJ-07 — la progression est CALCULÉE, jamais saisie", () => {
  it("un projet sans tâche est à 0, pas à 100", async () => {
    // Une division vide mal gardée donnerait 100 %.
    const p = await projets.creer(nouveauProjet(), chef, TOUS_DROITS_PROJET);
    expect(await projets.progression(p.id)).toBe(0);
  });

  it("moyenne des avancements, et non ratio de tâches terminées", async () => {
    const p = await projets.creer(nouveauProjet(), chef, TOUS_DROITS_PROJET);
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
    const p = await projets.creer(nouveauProjet(), chef, TOUS_DROITS_PROJET);
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
    const p = await projets.creer(nouveauProjet({ budgetHeures: 100 }), chef, TOUS_DROITS_PROJET);
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
    const p = await projets.creer(nouveauProjet({ budgetHeures: 4 }), chef, TOUS_DROITS_PROJET);
    await prisma.timeEntry.create({
      data: { userId: chef, projectId: p.id, date: utc("2026-03-02"), heures: 6 },
    });
    const b = await projets.budget(p.id);
    expect(b.depassement).toBe(true);
    expect(b.restant).toBe(-2);
  });

  it("un projet sans budget alloué ne calcule pas de restant", async () => {
    const p = await projets.creer(nouveauProjet(), chef, TOUS_DROITS_PROJET);
    const b = await projets.budget(p.id);
    expect(b.alloue).toBeNull();
    expect(b.restant).toBeNull();
  });
});

describe("RG-PRJ-02, RG-PRJ-04 — suppression logique et restauration", () => {
  it("annuler passe au statut Annulé, sans effacer", async () => {
    const p = await projets.creer(nouveauProjet(), chef, TOUS_DROITS_PROJET);
    await projets.annuler(p.id, chef);
    const apres = await prisma.project.findUniqueOrThrow({ where: { id: p.id } });
    expect(apres.statut).toBe("cancelled");
  });

  it("un projet annulé refuse toute modification jusqu'à restauration", async () => {
    const p = await projets.creer(nouveauProjet(), chef, TOUS_DROITS_PROJET);
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
    const p = await projets.creer(nouveauProjet(), chef, TOUS_DROITS_PROJET);
    await projets.archiver(p.id, true, chef);
    await expect(projets.archiver(p.id, true, chef)).rejects.toMatchObject({
      code: "deja_archive",
    });
  });

  it("désarchiver un projet non archivé est refusé, avec l'autre code", async () => {
    const p = await projets.creer(nouveauProjet(), chef, TOUS_DROITS_PROJET);
    await expect(projets.archiver(p.id, false, chef)).rejects.toMatchObject({
      code: "pas_archive",
    });
  });
});

describe("RG-PRJ-03 — la suppression définitive PROPOSE une alternative", () => {
  it("du temps déclaré bloque, et l'archivage est proposé", async () => {
    const p = await projets.creer(nouveauProjet(), chef, TOUS_DROITS_PROJET);
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
    const p = await projets.creer(nouveauProjet(), chef, TOUS_DROITS_PROJET);
    await prisma.task.create({ data: { titre: "T", projectId: p.id } });
    const impact = await projets.impactSuppression(p.id);
    expect(impact.blocages).toEqual([]);
    expect(impact.effacements).toContainEqual({ objet: "tâches", nombre: 1 });
    await expect(projets.supprimerDefinitivement(p.id, chef)).resolves.toBeUndefined();
  });
});

describe("RG-PRJ-06 — un membre ne s'ajoute pas deux fois", () => {
  it("le second ajout est refusé", async () => {
    const p = await projets.creer(nouveauProjet(), chef, TOUS_DROITS_PROJET);
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
    const p = await projets.creer(nouveauProjet(), chef, TOUS_DROITS_PROJET);
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
    const p = await projets.creer(nouveauProjet(), chef, TOUS_DROITS_PROJET);
    const membre = await agent();
    await projets.ajouterMembre(p.id, { userId: membre, roleProjet: "Développeur" }, chef);
    const avant = await prisma.notification.count({ where: { userId: membre } });

    await projets.changerRoleMembre(p.id, membre, { roleProjet: "Testeur" }, chef);

    expect(await prisma.notification.count({ where: { userId: membre } })).toBe(avant);
  });

  it("RG-ADM — le changement est tracé, avec l'avant et l'après", async () => {
    const p = await projets.creer(nouveauProjet(), chef, TOUS_DROITS_PROJET);
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
    const p = await projets.creer(nouveauProjet(), chef, TOUS_DROITS_PROJET);
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
    const p = await projets.creer(nouveauProjet(), chef, TOUS_DROITS_PROJET);
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
    const p = await projets.creer(nouveauProjet(), chef, TOUS_DROITS_PROJET);
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
    const p = await projets.creer(nouveauProjet(), chef, TOUS_DROITS_PROJET);
    const j = await projets.creerJalon({ nom: "J1", dateEcheance: utc("2026-06-30"), projectId: p.id }, chef);
    expect(await projets.statutJalon(j.id)).toBe("pending");
  });

  it("toutes à faire : En attente", async () => {
    const p = await projets.creer(nouveauProjet(), chef, TOUS_DROITS_PROJET);
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
    const p = await projets.creer(nouveauProjet(), chef, TOUS_DROITS_PROJET);
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
    const p = await projets.creer(nouveauProjet(), chef, TOUS_DROITS_PROJET);
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
    const p = await projets.creer(nouveauProjet(), chef, TOUS_DROITS_PROJET);
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
    const p = await projets.creer(nouveauProjet(), chef, TOUS_DROITS_PROJET);
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
    await projets.creer(nouveauProjet({ statut: "active" }), chef, TOUS_DROITS_PROJET);
    await projets.creer(nouveauProjet({ statut: "draft" }), chef, TOUS_DROITS_PROJET);

    const tout = await projets.portefeuille(p, toutes);
    const filtre = await projets.portefeuille(p, toutes, { statut: "draft" });

    expect(filtre.affiches).toBeLessThan(tout.total);
    // Calculer le total depuis la liste reçue donnerait un total faux.
    expect(filtre.total).toBe(tout.total);
  });

  it("les projets archivés sont hors du portefeuille par défaut", async () => {
    const p = await global();
    const archive = await projets.creer(nouveauProjet(), chef, TOUS_DROITS_PROJET);
    await projets.archiver(archive.id, true, chef);

    const actifs = await projets.portefeuille(p, toutes);
    expect(actifs.projets.map((x) => x.id)).not.toContain(archive.id);

    const archives = await projets.portefeuille(p, toutes, { archive: true });
    expect(archives.projets.map((x) => x.id)).toContain(archive.id);
  });

  it("RG-SCOPE-02 — le portefeuille respecte la visibilité des projets", async () => {
    const etranger = await agent("Étrangère");
    await projets.creer(nouveauProjet(), chef, TOUS_DROITS_PROJET);

    const p = await perimetres.resoudre(etranger, new Set());
    const vus = await projets.portefeuille(p, new Set());
    expect(vus.projets).toEqual([]);
  });
});

describe("RG-PRJ-09 — instantanés d'avancement", () => {
  it("capture progression, tâches et heures", async () => {
    const p = await projets.creer(nouveauProjet({ budgetHeures: 50 }), chef, TOUS_DROITS_PROJET);
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
    const p = await projets.creer(nouveauProjet(), chef, TOUS_DROITS_PROJET);
    await projets.capturerInstantane(p.id, utc("2026-04-30"));
    await prisma.task.create({ data: { titre: "A", projectId: p.id, avancement: 100, statut: "done" } });
    await projets.capturerInstantane(p.id, utc("2026-04-30"));

    const snaps = await prisma.projectSnapshot.findMany({ where: { projectId: p.id } });
    expect(snaps).toHaveLength(1);
    expect(snaps[0]!.progression).toBe(100);
  });

  /*
   * La capture PÉRIODIQUE, qui n'existait pas : le bouton de la vue 11 était le
   * seul producteur d'instantanés du produit. Une instance en exploitation
   * gardait donc une courbe de tendance vide, et l'historique de `EX-PRJ-13`
   * n'aurait rien eu à montrer. Le travail `pg-boss` est déclaré par
   * `ProjetsModule` ; c'est son TRAITEMENT qui se vérifie ici.
   */
  it("RG-PRJ-09 — la capture périodique parcourt les projets vivants, et EUX SEULS", async () => {
    const vivant = await projets.creer(nouveauProjet(), chef, TOUS_DROITS_PROJET);
    const archive = await projets.creer(nouveauProjet(), chef, TOUS_DROITS_PROJET);
    const annule = await projets.creer(nouveauProjet(), chef, TOUS_DROITS_PROJET);
    await projets.archiver(archive.id, true, chef);
    await projets.annuler(annule.id, chef);

    const jour = utc("2026-05-14");
    const bilan = await projets.capturerInstantanesDuJour(jour);
    expect(bilan.echecs).toEqual([]);
    expect(bilan.captures).toBeGreaterThan(0);

    const pris = async (id: string) =>
      prisma.projectSnapshot.count({ where: { projectId: id, date: jour } });
    expect(await pris(vivant.id)).toBe(1);
    // Un projet mort n'avance plus : en capturer la ligne chaque nuit ferait
    // grossir la table d'un point identique par jour et par projet clos.
    expect(await pris(archive.id)).toBe(0);
    expect(await pris(annule.id)).toBe(0);
  });

  /*
   * HONNÊTETÉ SUR CE QUE CE TEST PROUVE : il ne rougit PAS si l'on retire la
   * troncature explicite de `capturerInstantanesDuJour`, parce que la colonne
   * est `@db.Date` et que PostgreSQL tronque de son côté. Ce qu'il pin, c'est
   * la propriété du TRAVAIL de nuit : une seconde exécution le même jour —
   * un rejeu après incident, deux instances mal verrouillées — rafraîchit la
   * ligne du jour au lieu d'en empiler une seconde. La troncature du service
   * reste écrite pour dire l'intention, pas pour être le seul rempart.
   */
  it("RG-PRJ-09 — deux exécutions du même jour rafraîchissent la ligne, elles ne l'empilent pas", async () => {
    const p = await projets.creer(nouveauProjet(), chef, TOUS_DROITS_PROJET);
    // Deux instants du même jour, à onze heures d'écart.
    await projets.capturerInstantanesDuJour(new Date("2026-05-15T06:30:00.000Z"));
    await projets.capturerInstantanesDuJour(new Date("2026-05-15T17:45:00.000Z"));

    const snaps = await prisma.projectSnapshot.findMany({ where: { projectId: p.id } });
    expect(snaps).toHaveLength(1);
    expect(snaps[0]!.date.toISOString().slice(0, 10)).toBe("2026-05-15");
  });
});

/**
 * `EX-PRJ-13` — « Consulter l'historique des instantanés d'avancement ».
 *
 * L'exigence porte DEUX verbes et un seul était servi. `fiche()` ne rend que
 * `dernierInstantane` — un point —, et la seule autre lecture du produit,
 * `tendance()` dans M17, moyenne `progression` par date sur un LOT de projets
 * en jetant `tachesTotal`, `tachesFinies` et `heuresConsommees`. Un projet
 * écrivait donc chaque nuit des colonnes que rien ne pouvait relire.
 */
describe("EX-PRJ-13 — consulter l'historique des instantanés", () => {
  it("EX-PRJ-13 — rend la ligne ENTIÈRE, du plus récent au plus ancien", async () => {
    const p = await projets.creer(nouveauProjet({ budgetHeures: 100 }), chef, TOUS_DROITS_PROJET);
    await prisma.task.createMany({
      data: [
        { titre: "A", projectId: p.id, avancement: 100, statut: "done" },
        { titre: "B", projectId: p.id, avancement: 20, statut: "doing" },
      ],
    });
    await prisma.timeEntry.create({
      data: { userId: chef, projectId: p.id, date: utc("2026-02-03"), heures: 9 },
    });

    await projets.capturerInstantane(p.id, utc("2026-02-28"));
    await projets.capturerInstantane(p.id, utc("2026-01-31"));
    await projets.capturerInstantane(p.id, utc("2026-03-31"));

    const perimetre = await global();
    const histo = await projets.instantanes(p.id, perimetre, toutes);

    // L'ordre : le plus récent d'abord. Un historique long ne doit pas faire
    // descendre le point le plus utile en bas de tableau.
    expect(histo.map((i) => i.date.toISOString().slice(0, 10))).toEqual([
      "2026-03-31",
      "2026-02-28",
      "2026-01-31",
    ]);

    // LES TROIS COLONNES QUE `tendance()` JETTE. C'est tout le sujet de
    // l'exigence : sans elles, on ne sait pas si la progression a monté parce
    // qu'on a fini des tâches ou parce qu'on en a supprimé.
    const dernier = histo[0]!;
    expect(dernier.progression).toBe(60);
    expect(dernier.tachesTotal).toBe(2);
    expect(dernier.tachesFinies).toBe(1);
    expect(Number(dernier.heuresConsommees)).toBe(9);
  });

  it("EX-PRJ-13 — un projet sans instantané rend une liste vide, pas une erreur", async () => {
    const p = await projets.creer(nouveauProjet(), chef, TOUS_DROITS_PROJET);
    const perimetre = await global();
    expect(await projets.instantanes(p.id, perimetre, toutes)).toEqual([]);
  });

  /*
   * Permission PUIS périmètre. La garde a exigé `reports:read` ; elle ne dit
   * rien du projet visé. Sans ce contrôle, l'historique complet d'un projet
   * hors périmètre — sa progression, sa charge, son effort — se lisait de qui
   * en devinait l'identifiant.
   */
  it("EX-PRJ-13, RG-SCOPE-02 — l'historique d'un projet hors périmètre est REFUSÉ", async () => {
    const p = await projets.creer(nouveauProjet(), chef, TOUS_DROITS_PROJET);
    await projets.capturerInstantane(p.id, utc("2026-06-30"));

    const etranger = await agent("Étranger");
    const dehors = await perimetres.resoudre(etranger, new Set(["reports:read"]));

    await expect(projets.instantanes(p.id, dehors, new Set(["reports:read"]))).rejects.toMatchObject(
      { code: "hors_perimetre" },
    );

    // Le chef, lui, le voit : c'est le MÊME appel, et c'est ce qui prouve que
    // le refus tient au périmètre et non à l'appel lui-même.
    const dedans = await perimetres.resoudre(chef, new Set(["reports:read"]));
    expect(await projets.instantanes(p.id, dedans, new Set(["reports:read"]))).toHaveLength(1);
  });

  it("EX-PRJ-13 — un projet inexistant se dit introuvable, pas hors périmètre", async () => {
    const perimetre = await global();
    await expect(projets.instantanes(uuid(), perimetre, toutes)).rejects.toMatchObject({
      code: "introuvable",
    });
  });
});

/**
 * `EX-PRJ-04` — « Choisir une icône dans une bibliothèque thématique avec
 * recherche ».
 *
 * Les cinquante codes vivaient dans `@rationarium/contracts`, les cinquante
 * tracés dans le client, et **le serveur n'a jamais confronté les deux** :
 * `icone: z.string().max(20)` acceptait n'importe quoi. La pastille rendait
 * alors un `<use href="#nimportequoi">` que rien ne définit — une boîte vide,
 * sans erreur, sans avertissement.
 *
 * Le contrôle se fait au CONTRÔLEUR, parce que c'est là que vit la validation
 * d'entrée. L'exercer au service prouverait une garantie qui n'existe pas :
 * le service écrit ce qu'on lui passe.
 */
/**
 * `RG-SCOPE-02` à la CRÉATION — la moitié qui n'avait pas été alignée.
 *
 * `PATCH /projets/:id` refusait `chefId` à qui n'a que `projects:update` ;
 * `POST /projets` l'acceptait de qui n'a que `projects:create`. Le même champ,
 * la même règle, deux réponses selon le verbe : fermer une porte et laisser la
 * fenêtre. Un relecteur qui vérifie la modification en conclut que la règle
 * tient, et il a vérifié la mauvaise moitié.
 *
 * Un seul modèle de rôle est concerné — `PORTFOLIO_MANAGER`, seul à détenir
 * `projects:create` sans `projects:manage_members`. Il ne perd rien de
 * cohérent : il ne pouvait déjà pas changer le chef d'un projet existant.
 */
describe("RG-SCOPE-02 — nommer un chef ou un sponsor est gouverné DÈS LA CRÉATION", () => {
  const creation = new Set(["projects:create"]);

  it("RG-SCOPE-02 — `projects:create` seul REFUSE de nommer un chef à la création", async () => {
    await expect(
      projets.creer(nouveauProjet({ chefId: chef }), chef, creation),
    ).rejects.toMatchObject({
      code: "champ_hors_permission",
      detail: { champ: "chefId", permission: "projects:manage_members" },
    });
  });

  it("RG-SCOPE-02 — `projects:create` seul REFUSE aussi de nommer un sponsor", async () => {
    const sponsor = await agent("Sponsor refusé");
    await expect(
      projets.creer(nouveauProjet({ sponsorId: sponsor }), chef, creation),
    ).rejects.toMatchObject({
      code: "champ_hors_permission",
      detail: { champ: "sponsorId", permission: "projects:manage_members" },
    });
  });

  it("RG-SCOPE-02 — sans ces champs, `projects:create` seul crée sans entrave", async () => {
    // Le cas nominal doit rester ouvert : l'alignement ne ferme pas la
    // création, il ferme l'attribution d'un accès à autrui.
    const p = await projets.creer(nouveauProjet(), chef, creation);
    expect(p.id).toBeTruthy();
  });

  it("RG-SCOPE-02 — avec `projects:manage_members`, le chef se nomme à la création", async () => {
    const p = await projets.creer(
      nouveauProjet({ chefId: chef }),
      chef,
      new Set(["projects:create", "projects:manage_members"]),
    );
    const relu = await prisma.project.findUniqueOrThrow({ where: { id: p.id } });
    expect(relu.chefId).toBe(chef);
  });
});

describe("EX-PRJ-04 — l'icône est choisie DANS la bibliothèque", () => {
  /** Le contrôleur nu, et le contexte que la garde y dépose une fois passée. */
  const controleur = () => new ProjetsController(projets);
  const contexte = async (): Promise<ContexteDemande> => ({
    userId: chef,
    permissions: TOUS_DROITS_PROJET,
    perimetre: await perimetres.resoudre(chef, new Set(["projects:manage_any"])),
  });
  const nouveau = (icone?: string) => ({
    nom: `Projet ${uuid().slice(0, 8)}`,
    dateDebut: "2026-01-01",
    dateFin: "2026-12-31",
    ...(icone === undefined ? {} : { icone }),
  });

  it("EX-PRJ-04 — la création REFUSE une icône hors bibliothèque", async () => {
    const d = await contexte();
    // `p-licorne` a la FORME d'un code : le préfixe, la longueur, la casse.
    // Seule la confrontation à la liste la refuse — un `max(20)` la laissait
    // passer, et la pastille rendait une boîte vide sans rien signaler.
    await expect(
      Promise.resolve().then(() => controleur().creer(nouveau("p-licorne"), d)),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("EX-PRJ-04 — la création ACCEPTE une icône du catalogue, et l'écrit", async () => {
    const d = await contexte();
    const cree = await controleur().creer(nouveau("p-recycle"), d);
    const relu = await prisma.project.findUniqueOrThrow({ where: { id: cree.id } });
    expect(relu.icone).toBe("p-recycle");
  });

  it("EX-PRJ-04 — la modification REFUSE aussi une icône hors bibliothèque", async () => {
    const d = await contexte();
    const p = await projets.creer(nouveauProjet({ icone: "p-folder" }), chef, TOUS_DROITS_PROJET);

    await expect(
      Promise.resolve().then(() =>
        controleur().modifier(p.id, { icone: "☂", version: p.version }, d),
      ),
    ).rejects.toMatchObject({ status: 400 });

    // Le refus n'a rien écrit : l'icône d'origine tient.
    const relu = await prisma.project.findUniqueOrThrow({ where: { id: p.id } });
    expect(relu.icone).toBe("p-folder");
  });

  it("EX-PRJ-04 — `null` RETIRE l'icône ; c'est l'état « Aucune icône », pas un refus", async () => {
    const d = await contexte();
    const p = await projets.creer(nouveauProjet({ icone: "p-leaf" }), chef, TOUS_DROITS_PROJET);

    await controleur().modifier(p.id, { icone: null, version: p.version }, d);

    const relu = await prisma.project.findUniqueOrThrow({ where: { id: p.id } });
    expect(relu.icone).toBeNull();
  });
});

/**
 * `EX-PRJ-05` — « Modifier un projet ».
 *
 * L'exigence est au cadrage depuis le premier lot et la maquette 11 pose le
 * bouton. Aucune route ne l'a jamais servi : corriger une date de fin ou un
 * chef de projet imposait de SUPPRIMER le projet, donc d'en perdre les
 * tâches, les jalons et l'équipe.
 *
 * Troisième occurrence du même trou après `EX-ORG-02` et `EX-CLI-02` : une
 * exigence « créer, modifier, supprimer » livrée sans son verbe du milieu.
 */
describe("EX-PRJ-05 — modifier un projet", () => {
  it("change le nom, les dates et le chef, et le relit depuis la base", async () => {
    const p = await projets.creer(nouveauProjet(), chef, TOUS_DROITS_PROJET);
    const r = await projets.modifier(
      p.id,
      { nom: "Refonte du portail", dateFin: utc("2027-06-30"), chefId: chef, version: p.version },
      chef,
      TOUS_DROITS_PROJET,
    );
    expect(r.nom).toBe("Refonte du portail");

    const relu = await prisma.project.findUniqueOrThrow({ where: { id: p.id } });
    expect(relu.nom).toBe("Refonte du portail");
    expect(relu.chefId).toBe(chef);
  });

  it("REFUSE une fin antérieure au début DÉJÀ EN BASE, pas seulement dans le corps reçu", async () => {
    /*
     * Le cas qu'un contrôle sur le seul corps reçu ne peut pas voir : ne
     * changer que `dateFin` est licite requête par requête, et interdit en
     * résultat. Le contrôle porte donc sur l'état résultant.
     */
    const p = await projets.creer(
      nouveauProjet({ dateDebut: utc("2026-06-01"), dateFin: utc("2026-12-31") }),
      chef,
      TOUS_DROITS_PROJET,
    );
    await expect(
      projets.modifier(p.id, { dateFin: utc("2026-03-01"), version: p.version }, chef, TOUS_DROITS_PROJET),
    ).rejects.toMatchObject({ code: "dates_incoherentes" });
  });

  it("RG-PRJ-04 — REFUSE de modifier un projet annulé, mais laisse le RESTAURER", async () => {
    const p = await projets.creer(nouveauProjet(), chef, TOUS_DROITS_PROJET);
    await projets.annuler(p.id, chef);
    const annule = await prisma.project.findUniqueOrThrow({ where: { id: p.id } });

    await expect(
      projets.modifier(p.id, { nom: "Tentative", version: annule.version }, chef, TOUS_DROITS_PROJET),
    ).rejects.toMatchObject({ code: "projet_annule" });

    // Sans cette exception, restaurer serait lui-même refusé — la règle
    // enfermerait le projet dans l'état qu'elle prétend protéger.
    await expect(
      projets.modifier(p.id, { statut: "active", version: annule.version }, chef, TOUS_DROITS_PROJET),
    ).resolves.toBeTruthy();
  });

  it("RG-GEN-07 — deux écritures concurrentes ne s'écrasent pas en silence", async () => {
    const p = await projets.creer(nouveauProjet(), chef, TOUS_DROITS_PROJET);
    await projets.modifier(p.id, { nom: "Première", version: p.version }, chef, TOUS_DROITS_PROJET);
    await expect(
      projets.modifier(p.id, { nom: "Seconde", version: p.version }, chef, TOUS_DROITS_PROJET),
    ).rejects.toMatchObject({ code: "conflit_de_version" });

    const relu = await prisma.project.findUniqueOrThrow({ where: { id: p.id } });
    expect(relu.nom).toBe("Première");
  });

  it("M20 — la modification est tracée au journal d'audit", async () => {
    const p = await projets.creer(nouveauProjet(), chef, TOUS_DROITS_PROJET);
    await projets.modifier(p.id, { nom: "Tracée", version: p.version }, chef, TOUS_DROITS_PROJET);
    const traces = await prisma.auditLog.findMany({
      where: { entiteId: p.id, action: "project.update" },
    });
    expect(traces).toHaveLength(1);
  });
});

/**
 * **L-38 — le même motif, sur les projets.**
 *
 * `PATCH /projets/:id` est gardé par `projects:update` et acceptait `chefId` et
 * `sponsorId`. Or `RG-SCOPE-02` dit qu'un projet est visible par son créateur,
 * son chef, son sponsor et ses membres : nommer un chef **donne un accès**,
 * exactement comme ajouter un membre — lequel exige `projects:manage_members`.
 * Le contournement était direct et ne demandait aucune ruse.
 */
describe("L-38 — RG-SCOPE-02 : nommer un chef est un geste d'appartenance", () => {
  const SANS_MEMBRES: ReadonlySet<string> = new Set(["projects:update"]);

  it("REFUSE d'écrire chefId sans projects:manage_members", async () => {
    const p = await projets.creer(nouveauProjet(), chef, TOUS_DROITS_PROJET);
    const avant = await prisma.project.findUniqueOrThrow({ where: { id: p.id } });
    const intrus = crypto.randomUUID();

    await expect(
      projets.modifier(p.id, { chefId: intrus, version: p.version }, chef, SANS_MEMBRES),
    ).rejects.toMatchObject({
      code: "champ_hors_permission",
      detail: { champ: "chefId", permission: "projects:manage_members" },
    });

    // Rien n'a été écrit : le projet garde le chef qu'il avait, et sa version.
    const relu = await prisma.project.findUniqueOrThrow({ where: { id: p.id } });
    expect(relu.chefId).toBe(avant.chefId);
    expect(relu.version).toBe(p.version);
  });

  it("REFUSE de même sponsorId — les deux donnent la visibilité", async () => {
    const p = await projets.creer(nouveauProjet(), chef, TOUS_DROITS_PROJET);
    await expect(
      projets.modifier(
        p.id,
        { sponsorId: crypto.randomUUID(), version: p.version },
        chef,
        SANS_MEMBRES,
      ),
    ).rejects.toMatchObject({ code: "champ_hors_permission", detail: { champ: "sponsorId" } });
  });

  it("laisse passer le reste — le refus est CIBLÉ, pas un verrou sur la route", async () => {
    const p = await projets.creer(nouveauProjet(), chef, TOUS_DROITS_PROJET);
    const apres = await projets.modifier(
      p.id,
      { nom: "Refonte", version: p.version },
      chef,
      SANS_MEMBRES,
    );
    expect(apres.nom).toBe("Refonte");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Vague 7-4 — dette de traçabilité. M4 et M5.
// ════════════════════════════════════════════════════════════════════════════

describe("EX-PRJ-03 — créer un projet : nom, description, statut, priorité, dates, chef de projet, sponsor, département, budget heures, icône", () => {
  it("les dix éléments de l'exigence arrivent en base, aucun n'est perdu en route", async () => {
    const sponsor = await agent("Sponsor");
    const departement = uuid();
    await prisma.departement.create({ data: { id: departement, nom: `Dep ${departement.slice(0, 6)}` } });

    const p = await projets.creer(
      {
        nom: "Refonte du portail citoyen",
        description: "Remplacement du portail de 2014",
        statut: "active",
        priorite: "high",
        dateDebut: utc("2026-02-01"),
        dateFin: utc("2026-11-30"),
        budgetHeures: 1200,
        icone: "p-screen",
        chefId: chef,
        sponsorId: sponsor,
        departementId: departement,
      },
      chef,
      TOUS_DROITS_PROJET,
    );

    const relu = await prisma.project.findUniqueOrThrow({ where: { id: p.id } });
    expect(relu.nom).toBe("Refonte du portail citoyen");
    expect(relu.description).toBe("Remplacement du portail de 2014");
    expect(relu.statut).toBe("active");
    expect(relu.priorite).toBe("high");
    expect(relu.dateDebut.toISOString().slice(0, 10)).toBe("2026-02-01");
    expect(relu.dateFin.toISOString().slice(0, 10)).toBe("2026-11-30");
    expect(Number(relu.budgetHeures)).toBe(1200);
    expect(relu.icone).toBe("p-screen");
    expect(relu.chefId).toBe(chef);
    expect(relu.sponsorId).toBe(sponsor);
    expect(relu.departementId).toBe(departement);
  });

  it("un projet naît EN BROUILLON et EN PRIORITÉ NORMALE — les défauts sont explicites", async () => {
    /*
     * Le statut initial n'est pas cosmétique : `RG-PRJ-02` distingue « Annulé »
     * du reste, et un projet qui naîtrait « actif » sans qu'on l'ait décidé
     * apparaîtrait dans le portefeuille de tout le monde le jour de sa
     * création.
     */
    const p = await projets.creer(nouveauProjet(), chef, TOUS_DROITS_PROJET);
    const relu = await prisma.project.findUniqueOrThrow({ where: { id: p.id } });
    expect(relu.statut).toBe("draft");
    expect(relu.priorite).toBe("normal");
    expect(relu.archive).toBe(false);
    expect(relu.budgetHeures).toBeNull();
    expect(relu.icone).toBeNull();
  });

  it("le CRÉATEUR est enregistré, distinct du chef de projet", async () => {
    const autre = await agent("Créateur");
    const p = await projets.creer(nouveauProjet({ chefId: chef }), autre, TOUS_DROITS_PROJET);
    const relu = await prisma.project.findUniqueOrThrow({ where: { id: p.id } });
    expect(relu.createurId).toBe(autre);
    expect(relu.chefId).toBe(chef);
  });

  it("la création est tracée", async () => {
    const p = await projets.creer(nouveauProjet(), chef, TOUS_DROITS_PROJET);
    const trace = await prisma.auditLog.findFirst({
      where: { action: "project.create", entiteId: p.id },
    });
    expect(trace).not.toBeNull();
    expect(trace!.acteurId).toBe(chef);
  });
});

describe("EX-PRJ-06 — archiver / désarchiver un projet", () => {
  it("archiver SORT du portefeuille sans rien effacer, désarchiver l'y remet", async () => {
    /*
     * C'est la différence avec `RG-PRJ-02` (annulation) et avec la suppression
     * définitive : l'archivage ne change pas le statut, il change la vitrine.
     */
    const p = await projets.creer(nouveauProjet({ statut: "active" }), chef, TOUS_DROITS_PROJET);
    await prisma.task.create({ data: { titre: "Un reste", projectId: p.id } });

    await projets.archiver(p.id, true, chef);

    const range = await prisma.project.findUniqueOrThrow({ where: { id: p.id } });
    expect(range.archive).toBe(true);
    expect(range.statut).toBe("active");
    expect(await prisma.task.count({ where: { projectId: p.id } })).toBe(1);

    const portefeuille = await projets.portefeuille(await global(), toutes, {});
    expect(portefeuille.projets.map((x) => x.id)).not.toContain(p.id);

    await projets.archiver(p.id, false, chef);

    expect((await prisma.project.findUniqueOrThrow({ where: { id: p.id } })).archive).toBe(false);
    const revenu = await projets.portefeuille(await global(), toutes, {});
    expect(revenu.projets.map((x) => x.id)).toContain(p.id);
  });

  it("les archivés RESTENT DEMANDABLES — masquer sans moyen de retrouver ferait croire à une suppression", async () => {
    const p = await projets.creer(nouveauProjet(), chef, TOUS_DROITS_PROJET);
    await projets.archiver(p.id, true, chef);

    const archives = await projets.portefeuille(await global(), toutes, { archive: true });

    expect(archives.projets.map((x) => x.id)).toContain(p.id);
    // Et le compteur total suit le filtre, sinon « 1 sur 12 » serait faux.
    expect(archives.total).toBe(archives.projets.length);
  });

  it("les deux gestes sont tracés SOUS DES ACTIONS DISTINCTES", async () => {
    const p = await projets.creer(nouveauProjet(), chef, TOUS_DROITS_PROJET);
    await projets.archiver(p.id, true, chef);
    await projets.archiver(p.id, false, chef);

    const actions = (
      await prisma.auditLog.findMany({ where: { entiteId: p.id }, select: { action: true } })
    ).map((a) => a.action);
    expect(actions).toContain("project.archive");
    expect(actions).toContain("project.unarchive");
  });

  it("un projet inconnu est refusé, il n'est pas archivé en silence", async () => {
    await expect(
      projets.archiver("00000000-0000-4000-8000-000000000000", true, chef),
    ).rejects.toMatchObject({ code: "introuvable" });
  });
});

describe("EX-PRJ-10 — rattacher des clients et des tiers au projet", () => {
  it("les deux populations se rattachent, et la fiche les distingue", async () => {
    /*
     * Un bénéficiaire n'est pas un intervenant : les fondre dans une liste
     * unique obligerait le client à reconstituer la distinction depuis la
     * forme des données.
     */
    const p = await projets.creer(nouveauProjet(), chef, TOUS_DROITS_PROJET);
    const client = await tiers.creerClient({ nom: `Ville ${uuid().slice(0, 6)}` }, chef);
    const presta = await tiers.creerTiers(
      { type: "organisation", organisation: `Presta ${uuid().slice(0, 6)}` },
      chef,
    );

    await tiers.rattacherClients(p.id, [client.id], chef);
    await tiers.rattacherAuProjet(p.id, presta.id, chef);

    const fiche = await projets.fiche(p.id);
    expect(fiche.clients.map((c) => c.id)).toEqual([client.id]);
    expect(fiche.equipe).toMatchObject({ clients: 1, tiers: 1, agents: 0 });

    const equipe = await projets.equipe(p.id);
    expect(equipe.clients.map((c) => c.id)).toEqual([client.id]);
    expect(equipe.tiers.map((t) => t.id)).toEqual([presta.id]);
    // Un tiers ne consomme pas la charge des services.
    expect(equipe.allocationCumulee).toBe(0);
  });

  it("le rattachement d'un client est TRACÉ sur le projet — c'est une décision, pas un détail", async () => {
    const p = await projets.creer(nouveauProjet(), chef, TOUS_DROITS_PROJET);
    const client = await tiers.creerClient({ nom: `Tracé ${uuid().slice(0, 6)}` }, chef);
    await tiers.rattacherClients(p.id, [client.id], chef);

    const trace = await prisma.auditLog.findFirst({
      where: { action: "client.attach_project", entiteId: p.id },
    });
    expect(trace).not.toBeNull();
  });

  it("un tiers archivé n'est PAS rattachable — RG-TRS-02 vaut aussi depuis le projet", async () => {
    const p = await projets.creer(nouveauProjet(), chef, TOUS_DROITS_PROJET);
    const t = await tiers.creerTiers({ type: "individual", contactNom: "Retiré" }, chef);
    await prisma.thirdParty.update({ where: { id: t.id }, data: { actif: false } });

    await expect(tiers.rattacherAuProjet(p.id, t.id, chef)).rejects.toMatchObject({
      code: "tiers_archive",
    });
    expect((await projets.fiche(p.id)).equipe.tiers).toBe(0);
  });
});

describe("EX-PRJ-11 — importer jalons et tâches depuis un CSV UNIQUE", () => {
  const enTete =
    "rowType;name;dueDate;title;description;status;priority;assigneeEmail;milestoneName;estimatedHours;startDate;endDate;subtasks";

  it("un seul fichier porte les deux natures, et L'ORDRE DES LIGNES EST INDIFFÉRENT", async () => {
    /*
     * La tâche précède son jalon dans le fichier. Exiger l'ordre inverse
     * reviendrait à demander à l'utilisateur de comprendre notre ordre
     * d'insertion — ce qui n'est pas son travail.
     */
    const p = await projets.creer(nouveauProjet(), chef, TOUS_DROITS_PROJET);
    const csv = [
      enTete,
      // Les sous-tâches voyagent dans UNE colonne, séparées par des
      // points-virgules — donc entre guillemets, sinon elles fabriquent des
      // colonnes et le fichier devient illisible.
      'TASK;;;Reprise des libellés;;todo;high;;Cadrage;8;2026-03-01;2026-03-15;"Relire;Corriger"',
      "MILESTONE;Cadrage;2026-04-30;;;;;;;;;;",
    ].join("\n");

    const rendu = await imports.importerProjet(p.id, csv, "ajouter", chef);

    expect(rendu.erreurs).toEqual([]);
    expect(rendu.importes).toBe(2);

    const jalon = await prisma.milestone.findFirstOrThrow({ where: { projectId: p.id } });
    expect(jalon.nom).toBe("Cadrage");
    expect(jalon.dateEcheance?.toISOString().slice(0, 10)).toBe("2026-04-30");

    const tache = await prisma.task.findFirstOrThrow({ where: { projectId: p.id } });
    expect(tache.titre).toBe("Reprise des libellés");
    // La tâche a retrouvé un jalon créé APRÈS elle dans le fichier.
    expect(tache.milestoneId).toBe(jalon.id);
    expect(tache.priorite).toBe("high");
    expect(Number(tache.estimationHeures)).toBe(8);
  });

  it("le mode « Ajouter » CONSERVE l'existant, et un jalon homonyme est IGNORÉ, pas mis en erreur", async () => {
    /*
     * Rejouer un fichier est un usage normal, pas un incident : fondre les
     * doublons dans les erreurs ferait paniquer sur un fichier rejoué.
     */
    const p = await projets.creer(nouveauProjet(), chef, TOUS_DROITS_PROJET);
    const dejaLa = await projets.creerJalon({ nom: "Existant", projectId: p.id }, chef);
    const csv = [enTete, "MILESTONE;Existant;2026-05-31;;;;;;;;;;", "MILESTONE;Nouveau;2026-06-30;;;;;;;;;;"].join("\n");

    const rendu = await imports.importerProjet(p.id, csv, "ajouter", chef);

    expect(rendu.importes).toBe(1);
    expect(rendu.ignores).toBe(1);
    expect(rendu.erreurs).toEqual([]);
    const jalons = await prisma.milestone.findMany({ where: { projectId: p.id } });
    expect(jalons.map((j) => j.nom).sort()).toEqual(["Existant", "Nouveau"]);
    expect(jalons.find((j) => j.nom === "Existant")!.id).toBe(dejaLa.id);
  });

  it("l'import n'écrit QUE dans le projet visé", async () => {
    const cible = await projets.creer(nouveauProjet(), chef, TOUS_DROITS_PROJET);
    const voisin = await projets.creer(nouveauProjet(), chef, TOUS_DROITS_PROJET);
    await imports.importerProjet(
      cible.id,
      [enTete, "MILESTONE;Isolé;2026-07-31;;;;;;;;;;"].join("\n"),
      "ajouter",
      chef,
    );
    expect(await prisma.milestone.count({ where: { projectId: voisin.id } })).toBe(0);
  });
});

describe("RG-PRJ-11 — les deux modes de l'import projet ; le blocage sur données rattachées est un DÉFAUT CONSIGNÉ", () => {
  const enTete =
    "rowType;name;dueDate;title;description;status;priority;assigneeEmail;milestoneName;estimatedHours;startDate;endDate;subtasks";

  it("les VOLUMES sont chiffrés avant la confirmation — « êtes-vous sûr ? » sans chiffres ne permet pas de décider", async () => {
    const p = await projets.creer(nouveauProjet(), chef, TOUS_DROITS_PROJET);
    const jalon = await projets.creerJalon({ nom: "À remplacer", projectId: p.id }, chef);
    const tache = await prisma.task.create({
      data: { titre: "À remplacer", projectId: p.id, milestoneId: jalon.id },
    });
    await prisma.subtask.createMany({
      data: [
        { taskId: tache.id, libelle: "Une", ordre: 0 },
        { taskId: tache.id, libelle: "Deux", ordre: 1 },
      ],
    });

    expect(await imports.volumesRemplacement(p.id)).toEqual({ jalons: 1, taches: 1, sousTaches: 2 });
  });

  it("« Remplacer » supprime jalons, tâches ET sous-tâches, puis pose le contenu du fichier", async () => {
    const p = await projets.creer(nouveauProjet(), chef, TOUS_DROITS_PROJET);
    const ancien = await projets.creerJalon({ nom: "Ancien", projectId: p.id }, chef);
    const ancienne = await prisma.task.create({
      data: { titre: "Ancienne", projectId: p.id, milestoneId: ancien.id },
    });
    await prisma.subtask.create({ data: { taskId: ancienne.id, libelle: "Vieille", ordre: 0 } });

    await imports.importerProjet(
      p.id,
      [enTete, "MILESTONE;Neuf;2026-09-30;;;;;;;;;;"].join("\n"),
      "remplacer",
      chef,
    );

    expect((await prisma.milestone.findMany({ where: { projectId: p.id } })).map((j) => j.nom)).toEqual([
      "Neuf",
    ]);
    expect(await prisma.task.count({ where: { projectId: p.id } })).toBe(0);
    expect(await prisma.subtask.count({ where: { taskId: ancienne.id } })).toBe(0);
  });

  it("EN TOUT-OU-RIEN : une seule ligne fautive annule l'ensemble ET NE SUPPRIME RIEN", async () => {
    /*
     * C'est la règle la plus dangereuse du module : elle ne se voit qu'au
     * moment où elle manque, et il est alors trop tard. Découvrir l'erreur
     * après la suppression est exactement ce qu'elle interdit.
     */
    const p = await projets.creer(nouveauProjet(), chef, TOUS_DROITS_PROJET);
    const survivant = await projets.creerJalon({ nom: "Survivant", projectId: p.id }, chef);
    // `rowType` est obligatoire : la seconde ligne est en erreur.
    const csv = [enTete, "MILESTONE;Bon;2026-09-30;;;;;;;;;;", ";;;;;;;;;;;;"].join("\n");

    const rendu = await imports.importerProjet(p.id, csv, "remplacer", chef);

    expect(rendu.erreurs.length).toBeGreaterThan(0);
    expect(rendu.importes).toBe(0);
    const restants = await prisma.milestone.findMany({ where: { projectId: p.id } });
    expect(restants.map((j) => j.id)).toEqual([survivant.id]);
  });

  it("chaque erreur porte SON NUMÉRO DE LIGNE — « 3 erreurs » oblige sinon à relire tout le fichier", async () => {
    const p = await projets.creer(nouveauProjet(), chef, TOUS_DROITS_PROJET);
    const csv = [enTete, "MILESTONE;Bon;2026-09-30;;;;;;;;;;", ";;;;;;;;;;;;"].join("\n");

    const rendu = await imports.importerProjet(p.id, csv, "remplacer", chef);

    // Ligne 3 du fichier : en-tête, première donnée, puis la fautive.
    expect(rendu.erreurs.map((e) => e.ligne)).toEqual([3]);
    expect(rendu.erreurs[0]!.message).toContain("rowType");
  });

  /*
   * ────────────────────────────────────────────────────────────────────────
   * DÉFAUT CONSIGNÉ, NON CORRIGÉ — ce lot n'écrit pas de code de production.
   *
   * `RG-PRJ-11` finit par « et est bloqué si des données rattachées
   * l'empêchent ». **Rien ne l'implémente**, et le code d'erreur qui devrait
   * porter ce refus existe pourtant, complet et inutilisé :
   * `EchecImport.remplacement_impossible`, avec son message rédigé en
   * `messages-metier.ts` — « Des données rattachées au projet empêchent le
   * remplacement. » (409). Aucune ligne ne le lève.
   *
   * Ce que fait le produit à la place dépend de la forme de la saisie de
   * temps, et les deux issues sont mauvaises :
   *
   *   — saisie rattachée à la TÂCHE SEULE : `task.deleteMany` déclenche le
   *     `ON DELETE SET NULL` de `time_entries.taskId`, la ligne se retrouve
   *     sans tâche ni projet, et la contrainte `time_entries_rattachement_requis`
   *     (RG-TMP-01, doublée en base par `C15`) la refuse. L'import échoue —
   *     mais sur une **erreur PostgreSQL brute (23514)**, pas sur un refus
   *     métier. `RG-GEN-03` veut un message en langue naturelle, actionnable ;
   *     l'utilisateur reçoit un code de contrainte.
   *
   *   — saisie rattachée à la tâche ET au projet : `SET NULL` passe, et les
   *     heures déclarées perdent leur tâche **en silence**. C'est exactement
   *     la donnée que `RG-PRJ-03` protège ailleurs (« la suppression
   *     définitive est refusée si des données historiques y sont rattachées,
   *     le temps déclaré notamment ») : deux chemins mènent au même
   *     effacement, un seul le refuse.
   *
   * Les deux contrôles ci-dessous énoncent la règle, pas le comportement
   * observé. `RG-PRJ-11` reste en dette dans `design/tracabilite.json`.
   * ────────────────────────────────────────────────────────────────────────
   */
  it(
    "RG-PRJ-11 — « BLOQUÉ SI DES DONNÉES RATTACHÉES L'EMPÊCHENT », par un code métier",
    async () => {
      const p = await projets.creer(nouveauProjet(), chef, TOUS_DROITS_PROJET);
      const jalon = await projets.creerJalon({ nom: "Avec heures", projectId: p.id }, chef);
      const tache = await prisma.task.create({
        data: { titre: "Déclarée", projectId: p.id, milestoneId: jalon.id },
      });
      const auteur = await agent("Déclarant");
      await prisma.timeEntry.create({
        // Rattachée à la tâche SEULE : c'est le cas qui casse.
        data: { userId: auteur, taskId: tache.id, date: utc("2026-05-05"), heures: 6 },
      });

      const erreur = await imports
        .importerProjet(
          p.id,
          [enTete, "MILESTONE;Neuf;2026-09-30;;;;;;;;;;"].join("\n"),
          "remplacer",
          chef,
        )
        .catch((e: unknown) => e);

      expect(erreur).toMatchObject({ code: "remplacement_impossible" });
    },
  );

  it(
    "RG-PRJ-11 — la saisie qui porte AUSSI le projet bloque de même, elle n'est plus détachée en silence",
    async () => {
      const p = await projets.creer(nouveauProjet(), chef, TOUS_DROITS_PROJET);
      const tache = await prisma.task.create({ data: { titre: "Déclarée", projectId: p.id } });
      const auteur = await agent("Déclarant");
      const saisie = await prisma.timeEntry.create({
        data: {
          userId: auteur,
          taskId: tache.id,
          projectId: p.id,
          date: utc("2026-05-06"),
          heures: 6,
        },
      });

      /*
       * **C'était le cas le plus dangereux des deux.** Rattachée à la tâche ET
       * au projet, la saisie survivait à la suppression de la tâche — la
       * contrainte `time_entries_rattachement_requis` était satisfaite par le
       * projet restant — donc rien ne bloquait, et les heures étaient
       * **détachées en silence**. Le premier cas au moins échouait bruyamment.
       */
      const erreur = await imports
        .importerProjet(
          p.id,
          [enTete, "MILESTONE;Neuf;2026-09-30;;;;;;;;;;"].join("\n"),
          "remplacer",
          chef,
        )
        .catch((e: unknown) => e);

      expect(erreur).toMatchObject({
        code: "remplacement_impossible",
        detail: { saisiesDeTemps: 1 },
      });

      // Ce que la règle exige : la saisie garde sa tâche, parce que le
      // remplacement a été refusé AVANT toute écriture.
      expect(
        (await prisma.timeEntry.findUniqueOrThrow({ where: { id: saisie.id } })).taskId,
      ).toBe(tache.id);
      expect(await prisma.task.count({ where: { projectId: p.id } })).toBe(1);
    },
  );

  it("RG-PRJ-11 — sans temps déclaré, le remplacement passe : le refus est CIBLÉ", async () => {
    /*
     * Un refus trop large aurait rendu le mode Remplacer inutilisable, ce qui
     * est une autre façon de ne pas tenir la règle.
     */
    const p = await projets.creer(nouveauProjet(), chef, TOUS_DROITS_PROJET);
    await prisma.task.create({ data: { titre: "Sans heures", projectId: p.id } });

    const rendu = await imports.importerProjet(
      p.id,
      [enTete, "MILESTONE;Neuf;2026-09-30;;;;;;;;;;"].join("\n"),
      "remplacer",
      chef,
    );
    expect(rendu.importes).toBe(1);
    expect(await prisma.task.count({ where: { projectId: p.id } })).toBe(0);
  });
});

describe("EX-PRJ-12 — exporter le contenu du projet", () => {
  it("l'export des tâches porte les COLONNES DE L'IMPORT, et une ligne par tâche", async () => {
    /*
     * Un export qui ne se réimporte pas n'est pas de la réversibilité, c'est
     * une capture d'écran en texte. Les en-têtes sont donc ceux du fichier
     * d'entrée, pas les libellés de l'interface.
     */
    const p = await projets.creer(nouveauProjet(), chef, TOUS_DROITS_PROJET);
    const jalon = await projets.creerJalon({ nom: "Cadrage", projectId: p.id }, chef);
    const porteur = await agent("Porteur");
    const email = (await prisma.user.findUniqueOrThrow({ where: { id: porteur } })).email;
    await prisma.task.create({
      data: {
        titre: "Ateliers usagers",
        description: "Trois séances",
        projectId: p.id,
        milestoneId: jalon.id,
        statut: "doing",
        priorite: "high",
        estimationHeures: 12,
        dateDebut: utc("2026-03-02"),
        dateFin: utc("2026-03-20"),
        assignes: { create: { userId: porteur, porteur: true } },
      },
    });

    const csv = await imports.exporterTaches(p.id);
    const lignes = csv.trim().split("\n");

    expect(lignes[0]!.replace(/^\uFEFF/g, "")).toBe(
      "title;description;status;priority;assigneeEmail;milestoneName;estimatedHours;startDate;endDate",
    );
    expect(lignes).toHaveLength(2);
    expect(lignes[1]).toContain("Ateliers usagers");
    expect(lignes[1]).toContain("Cadrage");
    expect(lignes[1]).toContain(email);
    expect(lignes[1]).toContain("2026-03-20");
  });

  it("l'export des jalons porte les siennes, ordonnées par échéance", async () => {
    const p = await projets.creer(nouveauProjet(), chef, TOUS_DROITS_PROJET);
    await projets.creerJalon({ nom: "Second", dateEcheance: utc("2026-08-31"), projectId: p.id }, chef);
    await projets.creerJalon({ nom: "Premier", dateEcheance: utc("2026-04-30"), projectId: p.id }, chef);

    const lignes = (await imports.exporterJalons(p.id)).trim().split("\n");

    expect(lignes[0]!.replace(/^\uFEFF/g, "")).toBe("name;description;dueDate");
    expect(lignes[1]).toContain("Premier");
    expect(lignes[2]).toContain("Second");
  });

  it("un projet vide s'exporte quand même : les EN-TÊTES SEULS, jamais un fichier nu", async () => {
    /*
     * Un fichier de zéro octet ne se distingue pas d'un échec de
     * téléchargement, et il n'est pas réimportable.
     */
    const p = await projets.creer(nouveauProjet(), chef, TOUS_DROITS_PROJET);
    const csv = (await imports.exporterTaches(p.id)).trim();
    expect(csv.replace(/^\uFEFF/g, "")).toBe(
      "title;description;status;priority;assigneeEmail;milestoneName;estimatedHours;startDate;endDate",
    );
  });

  it("l'export ÉCHAPPE ce qui casserait les colonnes", async () => {
    const p = await projets.creer(nouveauProjet(), chef, TOUS_DROITS_PROJET);
    await prisma.task.create({
      data: { titre: 'Refonte; "urgente"', projectId: p.id },
    });
    const csv = await imports.exporterTaches(p.id);
    const donnees = csv.trim().split("\n")[1]!;
    // Le point-virgule du titre ne doit pas fabriquer une colonne de plus.
    expect(donnees.startsWith('"Refonte; ""urgente"""')).toBe(true);
  });
});

describe("EX-JAL-03, EX-JAL-04 — la feuille de route chronologique et ses indicateurs", () => {
  it("les jalons sortent DANS L'ORDRE DES ÉCHÉANCES, pas dans celui de la création", async () => {
    const p = await projets.creer(nouveauProjet(), chef, TOUS_DROITS_PROJET);
    await projets.creerJalon({ nom: "Livraison", dateEcheance: utc("2026-11-30"), projectId: p.id }, chef);
    await projets.creerJalon({ nom: "Cadrage", dateEcheance: utc("2026-03-31"), projectId: p.id }, chef);
    await projets.creerJalon({ nom: "Recette", dateEcheance: utc("2026-09-30"), projectId: p.id }, chef);

    const route = await projets.feuilleDeRoute(p.id);

    expect(route.jalons.map((j) => j.nom)).toEqual(["Cadrage", "Recette", "Livraison"]);
  });

  it("les quatre indicateurs comptent ce qu'ils annoncent : total, terminés, en cours, tâches", async () => {
    const p = await projets.creer(nouveauProjet(), chef, TOUS_DROITS_PROJET);
    const fini = await projets.creerJalon({ nom: "Fini", dateEcheance: utc("2026-03-31"), projectId: p.id }, chef);
    const enCours = await projets.creerJalon({ nom: "En cours", dateEcheance: utc("2026-06-30"), projectId: p.id }, chef);
    await projets.creerJalon({ nom: "À venir", dateEcheance: utc("2026-09-30"), projectId: p.id }, chef);
    await prisma.task.createMany({
      data: [
        { titre: "T1", projectId: p.id, milestoneId: fini.id, statut: "done" },
        { titre: "T2", projectId: p.id, milestoneId: enCours.id, statut: "doing" },
        { titre: "T3", projectId: p.id, milestoneId: enCours.id, statut: "todo" },
        { titre: "T4", projectId: p.id, statut: "todo" },
      ],
    });

    const { indicateurs } = await projets.feuilleDeRoute(p.id);

    expect(indicateurs.total).toBe(3);
    expect(indicateurs.termines).toBe(1);
    expect(indicateurs.enCours).toBe(1);
    // « Nombre de tâches » compte AUSSI celles qui ne pendent à aucun jalon :
    // un compteur qui les oublierait serait démenti par l'onglet Tâches.
    expect(indicateurs.taches).toBe(4);
    expect(indicateurs.sansJalon).toBe(1);
  });

  it("un projet sans jalon rend une feuille VIDE et des indicateurs à zéro, jamais une erreur", async () => {
    const p = await projets.creer(nouveauProjet(), chef, TOUS_DROITS_PROJET);
    const route = await projets.feuilleDeRoute(p.id);
    expect(route.jalons).toEqual([]);
    expect(route.indicateurs).toMatchObject({ total: 0, termines: 0, enCours: 0, taches: 0 });
  });

  it("un jalon SANS échéance ne disparaît pas de la feuille — il passe en fin de chronologie", async () => {
    const p = await projets.creer(nouveauProjet(), chef, TOUS_DROITS_PROJET);
    await projets.creerJalon({ nom: "Daté", dateEcheance: utc("2026-05-31"), projectId: p.id }, chef);
    await projets.creerJalon({ nom: "Sans date", projectId: p.id }, chef);

    const route = await projets.feuilleDeRoute(p.id);

    expect(route.jalons.map((j) => j.nom)).toEqual(["Daté", "Sans date"]);
    expect(route.indicateurs.total).toBe(2);
  });
});

describe("RG-JAL-02 — un jalon appartient à un et un seul projet", () => {
  it("le jalon naît dans SON projet, et n'apparaît dans la feuille d'aucun autre", async () => {
    const a = await projets.creer(nouveauProjet(), chef, TOUS_DROITS_PROJET);
    const b = await projets.creer(nouveauProjet(), chef, TOUS_DROITS_PROJET);

    const jalon = await projets.creerJalon({ nom: "Exclusif", projectId: a.id }, chef);

    expect(jalon.projectId).toBe(a.id);
    expect((await projets.feuilleDeRoute(a.id)).jalons.map((j) => j.id)).toEqual([jalon.id]);
    expect((await projets.feuilleDeRoute(b.id)).jalons).toEqual([]);
  });

  it("LE RATTACHEMENT EST DOUBLÉ EN BASE : la colonne est NON NULLE, un jalon orphelin est impossible", async () => {
    /*
     * `C15` — un contrôle applicatif seul se contourne. La règle « un et un
     * seul projet » ne tient que si la base refuse le zéro ; l'unicité du nom
     * est elle aussi portée par le couple (projet, nom), et pas par le nom
     * seul, sinon deux projets ne pourraient pas avoir chacun leur « Cadrage ».
     */
    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO milestones (id, nom, "projectId") VALUES (gen_random_uuid(), 'Orphelin', NULL)`,
      ),
    ).rejects.toThrow();
  });

  it("deux projets peuvent avoir chacun leur « Cadrage » — l'unicité porte sur le COUPLE", async () => {
    const a = await projets.creer(nouveauProjet(), chef, TOUS_DROITS_PROJET);
    const b = await projets.creer(nouveauProjet(), chef, TOUS_DROITS_PROJET);

    await projets.creerJalon({ nom: "Cadrage", projectId: a.id }, chef);
    await expect(projets.creerJalon({ nom: "Cadrage", projectId: b.id }, chef)).resolves.toBeTruthy();
    // Mais pas deux fois dans le même.
    await expect(projets.creerJalon({ nom: "Cadrage", projectId: a.id }, chef)).rejects.toThrow();
  });

  it("supprimer un projet emporte SES jalons, et eux seuls", async () => {
    const a = await projets.creer(nouveauProjet(), chef, TOUS_DROITS_PROJET);
    const b = await projets.creer(nouveauProjet(), chef, TOUS_DROITS_PROJET);
    const sien = await projets.creerJalon({ nom: "Le sien", projectId: a.id }, chef);
    const autre = await projets.creerJalon({ nom: "L'autre", projectId: b.id }, chef);

    await projets.supprimerDefinitivement(a.id, chef);

    expect(await prisma.milestone.findUnique({ where: { id: sien.id } })).toBeNull();
    expect(await prisma.milestone.findUnique({ where: { id: autre.id } })).not.toBeNull();
  });
});
