import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { creerClient, type PrismaClient } from "@trame/db";
import { TachesService, ErreurTache } from "./taches.service.js";
import { AuditService } from "../commun/audit.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { FileService } from "../notifications/file.service.js";
import { PerimetreService } from "../commun/perimetre.service.js";

/** L-11 — tâches, dépendances, RACI, cascade. Criticité haute. */

const RACINE_DB = path.resolve(import.meta.dirname, "../../../../packages/db");
const utc = (s: string) => new Date(`${s}T00:00:00.000Z`);

let pg: StartedPostgreSqlContainer;
let prisma: PrismaClient;
let taches: TachesService;
let perimetres: PerimetreService;
let acteur: string;
let projetA: string;
let projetB: string;

const uuid = () => crypto.randomUUID();

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

async function projet() {
  const id = uuid();
  await prisma.project.create({
    data: {
      id, nom: `P-${id.slice(0, 8)}`,
      dateDebut: utc("2026-01-01"), dateFin: utc("2026-12-31"),
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
  // `RG-NTF-04` — la file n'est PAS démarrée ici. C'est délibéré : ces suites
  // prouvent au passage que les actions métier aboutissent sans elle.
  const notifications = new NotificationsService(prisma as never, new FileService());
  perimetres = new PerimetreService(prisma as never);
  taches = new TachesService(
    prisma as never,
    new AuditService(prisma as never),
    perimetres,
    notifications,
  );
  acteur = await agent();
  projetA = await projet();
  projetB = await projet();
}, 240_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await pg?.stop();
});

const toutes = new Set(["tasks:manage_any", "tasks:read_confidential"]);
const globalP = () => perimetres.resoudre(acteur, new Set(["tasks:manage_any"]));

describe("RG-TSK-01 — le hors-projet est un CAS NOMINAL", () => {
  it("une tâche sans projet se crée sans réserve", async () => {
    const t = await taches.creer({ titre: "Réunion transverse" }, acteur);
    expect(t.projectId).toBeNull();
  });

  it("et elle est nommée comme telle, pas laissée vide", async () => {
    await taches.creer({ titre: "Sollicitation ponctuelle" }, acteur);
    const p = await globalP();
    const liste = await taches.lister(p, toutes, { horsProjet: true });
    expect(liste.length).toBeGreaterThan(0);
    expect(liste.every((t) => t.horsProjet)).toBe(true);
  });

  it("RG-JAL-04 — mais elle ne se rattache ni à un jalon ni à une épopée", async () => {
    const jalon = await prisma.milestone.create({
      data: { nom: "J", dateEcheance: utc("2026-06-30"), projectId: projetA },
    });
    await expect(
      taches.creer({ titre: "T", milestoneId: jalon.id }, acteur),
    ).rejects.toMatchObject({ code: "hors_projet_avec_jalon" });
  });

  it("RG-JAL-03 — un jalon d'un AUTRE projet est refusé", async () => {
    const jalon = await prisma.milestone.create({
      data: { nom: "J", dateEcheance: utc("2026-06-30"), projectId: projetB },
    });
    await expect(
      taches.creer({ titre: "T", projectId: projetA, milestoneId: jalon.id }, acteur),
    ).rejects.toMatchObject({ code: "jalon_autre_projet" });
  });
});

describe("RG-TSK-04 — les dépendances circulaires, à toute longueur", () => {
  it("refuse le cycle immédiat A → B → A", async () => {
    const a = await taches.creer({ titre: "A", projectId: projetA }, acteur);
    const b = await taches.creer({ titre: "B", projectId: projetA }, acteur);
    await taches.ajouterDependance(b.id, a.id, acteur);
    await expect(taches.ajouterDependance(a.id, b.id, acteur)).rejects.toMatchObject({
      code: "dependance_circulaire",
    });
  });

  it("refuse AUSSI un cycle long — c'est le point", async () => {
    // A → B → C → D → E, puis E → A fermerait un cycle de longueur 5. Un
    // contrôle limité au voisin immédiat le laisserait passer, et le graphe
    // deviendrait inexploitable sans que personne ne sache pourquoi.
    const ids: string[] = [];
    for (const titre of ["A", "B", "C", "D", "E"]) {
      ids.push((await taches.creer({ titre, projectId: projetA }, acteur)).id);
    }
    for (let i = 1; i < ids.length; i++) {
      await taches.ajouterDependance(ids[i]!, ids[i - 1]!, acteur);
    }
    await expect(taches.ajouterDependance(ids[0]!, ids[4]!, acteur)).rejects.toMatchObject({
      code: "dependance_circulaire",
    });
  });

  it("une tâche ne dépend pas d'elle-même", async () => {
    const a = await taches.creer({ titre: "Seule", projectId: projetA }, acteur);
    await expect(taches.ajouterDependance(a.id, a.id, acteur)).rejects.toMatchObject({
      code: "dependance_sur_soi",
    });
  });

  it("RG-TSK-05 — le doublon est refusé", async () => {
    const a = await taches.creer({ titre: "A", projectId: projetA }, acteur);
    const b = await taches.creer({ titre: "B", projectId: projetA }, acteur);
    await taches.ajouterDependance(b.id, a.id, acteur);
    await expect(taches.ajouterDependance(b.id, a.id, acteur)).rejects.toMatchObject({
      code: "dependance_en_double",
    });
  });

  it("RG-TSK-06 — deux tâches de projets différents ne se lient pas", async () => {
    const a = await taches.creer({ titre: "A", projectId: projetA }, acteur);
    const b = await taches.creer({ titre: "B", projectId: projetB }, acteur);
    await expect(taches.ajouterDependance(b.id, a.id, acteur)).rejects.toMatchObject({
      code: "dependance_autre_projet",
    });
  });
});

describe("EX-TSK-11, EX-TSK-12 — lire le graphe et ses incohérences", () => {
  it("dit ce dont on dépend ET ce qu'on bloque", async () => {
    const amont = await taches.creer({ titre: "Amont", projectId: projetA }, acteur);
    const milieu = await taches.creer({ titre: "Milieu", projectId: projetA }, acteur);
    const aval = await taches.creer({ titre: "Aval", projectId: projetA }, acteur);
    await taches.ajouterDependance(milieu.id, amont.id, acteur);
    await taches.ajouterDependance(aval.id, milieu.id, acteur);

    const g = await taches.dependances(milieu.id);
    expect(g.dependDe.map((t) => t.titre)).toEqual(["Amont"]);
    expect(g.bloque.map((t) => t.titre)).toEqual(["Aval"]);
  });

  it("signale une tâche qui commence avant la fin de son prérequis", async () => {
    const amont = await taches.creer(
      { titre: "Amont", projectId: projetA, dateDebut: utc("2026-03-01"), dateFin: utc("2026-03-20") },
      acteur,
    );
    const aval = await taches.creer(
      { titre: "Aval", projectId: projetA, dateDebut: utc("2026-03-10"), dateFin: utc("2026-03-30") },
      acteur,
    );
    await taches.ajouterDependance(aval.id, amont.id, acteur);

    const inc = await taches.incoherences(aval.id);
    expect(inc).toHaveLength(1);
    expect(inc[0]!.jours).toBe(10);
  });

  it("ne signale rien quand l'enchaînement est correct", async () => {
    const amont = await taches.creer(
      { titre: "Amont", projectId: projetA, dateDebut: utc("2026-04-01"), dateFin: utc("2026-04-10") },
      acteur,
    );
    const aval = await taches.creer(
      { titre: "Aval", projectId: projetA, dateDebut: utc("2026-04-11"), dateFin: utc("2026-04-20") },
      acteur,
    );
    await taches.ajouterDependance(aval.id, amont.id, acteur);
    expect(await taches.incoherences(aval.id)).toEqual([]);
  });
});

describe("RG-TSK-09 — le décalage en cascade ANNONCE son ampleur", () => {
  it("l'aperçu donne les tâches touchées avant d'agir", async () => {
    const a = await taches.creer({ titre: "A", projectId: projetA, dateDebut: utc("2026-05-01"), dateFin: utc("2026-05-05") }, acteur);
    const b = await taches.creer({ titre: "B", projectId: projetA, dateDebut: utc("2026-05-06"), dateFin: utc("2026-05-10") }, acteur);
    const c = await taches.creer({ titre: "C", projectId: projetA, dateDebut: utc("2026-05-11"), dateFin: utc("2026-05-15") }, acteur);
    await taches.ajouterDependance(b.id, a.id, acteur);
    await taches.ajouterDependance(c.id, b.id, acteur);

    // Décaler sans annoncer l'ampleur serait une action destructrice
    // silencieuse : deux tâches en aval bougeraient sans avertissement.
    const apercu = await taches.apercuCascade(a.id, 7);
    expect(apercu.map((t) => t.titre).sort()).toEqual(["B", "C"]);
  });

  it("le décalage déplace toute la chaîne, en conservant les durées", async () => {
    const a = await taches.creer({ titre: "A", projectId: projetA, dateDebut: utc("2026-06-01"), dateFin: utc("2026-06-05") }, acteur);
    const b = await taches.creer({ titre: "B", projectId: projetA, dateDebut: utc("2026-06-06"), dateFin: utc("2026-06-10") }, acteur);
    await taches.ajouterDependance(b.id, a.id, acteur);

    const r = await taches.decalerEnCascade(a.id, 7, acteur);
    expect(r.decalees).toBe(2);

    const apresA = await prisma.task.findUniqueOrThrow({ where: { id: a.id } });
    const apresB = await prisma.task.findUniqueOrThrow({ where: { id: b.id } });
    expect(apresA.dateDebut?.toISOString().slice(0, 10)).toBe("2026-06-08");
    expect(apresB.dateDebut?.toISOString().slice(0, 10)).toBe("2026-06-13");
    // Les durées sont préservées : 4 jours d'écart début–fin de part et d'autre.
    expect(apresB.dateFin!.getTime() - apresB.dateDebut!.getTime()).toBe(4 * 86_400_000);
  });
});

describe("RG-TSK-07 — une tâche dont d'autres dépendent ne se supprime pas", () => {
  it("le refus NOMME les dépendantes", async () => {
    const amont = await taches.creer({ titre: "Amont", projectId: projetA }, acteur);
    const aval = await taches.creer({ titre: "Aval bloquante", projectId: projetA }, acteur);
    await taches.ajouterDependance(aval.id, amont.id, acteur);

    const erreur = await taches.supprimer(amont.id, acteur).catch((e: ErreurTache) => e);
    expect((erreur as ErreurTache).code).toBe("supprimee_avec_dependantes");
    expect((erreur as ErreurTache).detail?.dependantes).toEqual(["Aval bloquante"]);
  });

  it("une tâche libre se supprime", async () => {
    const t = await taches.creer({ titre: "Libre", projectId: projetA }, acteur);
    await expect(taches.supprimer(t.id, acteur)).resolves.toBeUndefined();
  });
});

describe("RG-TSK-11 — glisser-déposer d'une tâche multi-assignée", () => {
  it("une tâche mono-assignée change bien de date", async () => {
    const u = await agent();
    const t = await taches.creer(
      { titre: "Mono", projectId: projetA, assigneIds: [u], dateDebut: utc("2026-07-01"), dateFin: utc("2026-07-03") },
      acteur,
    );
    const r = await taches.deplacerDepuisPlanning(t.id, { nouvelleDate: utc("2026-07-08") }, acteur);
    expect(r.dateModifiee).toBe(true);

    const apres = await prisma.task.findUniqueOrThrow({ where: { id: t.id } });
    expect(apres.dateDebut?.toISOString().slice(0, 10)).toBe("2026-07-08");
    // La durée est conservée.
    expect(apres.dateFin?.toISOString().slice(0, 10)).toBe("2026-07-10");
  });

  it("une tâche MULTI-assignée refuse le changement de date", async () => {
    const u1 = await agent();
    const u2 = await agent();
    const t = await taches.creer(
      { titre: "Multi", projectId: projetA, assigneIds: [u1, u2], dateDebut: utc("2026-07-01"), dateFin: utc("2026-07-03") },
      acteur,
    );
    const r = await taches.deplacerDepuisPlanning(t.id, { nouvelleDate: utc("2026-07-08") }, acteur);
    expect(r.dateModifiee).toBe(false);
    expect(r.avertissement).toBe("multi_assignee_date");

    // Déplacer la date depuis la ligne d'une personne la changerait pour tout
    // le monde, sans que l'auteur du geste le voie.
    const apres = await prisma.task.findUniqueOrThrow({ where: { id: t.id } });
    expect(apres.dateDebut?.toISOString().slice(0, 10)).toBe("2026-07-01");
  });

  it("mais le changement d'ASSIGNÉ passe, et il reste acquis", async () => {
    const u1 = await agent();
    const u2 = await agent();
    const u3 = await agent();
    const t = await taches.creer(
      { titre: "Multi", projectId: projetA, assigneIds: [u1, u2], dateDebut: utc("2026-07-01"), dateFin: utc("2026-07-03") },
      acteur,
    );

    const r = await taches.deplacerDepuisPlanning(
      t.id,
      { nouvelleDate: utc("2026-07-08"), nouvelAssigneId: u3, ancienAssigneId: u1 },
      acteur,
    );
    expect(r.assigneModifie).toBe(true);
    expect(r.dateModifiee).toBe(false);
    expect(r.avertissement).toBe("multi_assignee_assigne_seul");

    const assignes = await prisma.taskAssignee.findMany({ where: { taskId: t.id } });
    expect(assignes.map((a) => a.userId).sort()).toEqual([u2, u3].sort());
  });

  it("RG-PLN-06 — assigner un agent déjà affecté est refusé", async () => {
    const u1 = await agent();
    const t = await taches.creer({ titre: "T", projectId: projetA, assigneIds: [u1] }, acteur);
    await expect(
      taches.deplacerDepuisPlanning(t.id, { nouvelAssigneId: u1 }, acteur),
    ).rejects.toMatchObject({ code: "deja_assigne" });
  });
});

describe("RG-TSK-10 — RACI", () => {
  it("un même utilisateur ne porte pas deux fois le même rôle", async () => {
    const u = await agent();
    const t = await taches.creer({ titre: "T", projectId: projetA }, acteur);
    await taches.attribuerRaci(t.id, u, "responsible", acteur);
    await expect(taches.attribuerRaci(t.id, u, "responsible", acteur)).rejects.toMatchObject({
      code: "raci_en_double",
    });
  });

  it("mais il peut porter deux rôles différents", async () => {
    const u = await agent();
    const t = await taches.creer({ titre: "T", projectId: projetA }, acteur);
    await taches.attribuerRaci(t.id, u, "responsible", acteur);
    await expect(taches.attribuerRaci(t.id, u, "consulted", acteur)).resolves.toBeUndefined();
  });
});

describe("EX-TSK-06 — inviter des services entiers", () => {
  it("déplie les membres à la création, sans garder de lien vers le service", async () => {
    const dept = uuid();
    await prisma.departement.create({ data: { id: dept, nom: `D-${dept.slice(0, 6)}` } });
    const svc = uuid();
    await prisma.service.create({ data: { id: svc, nom: "Équipe", departementId: dept } });

    const u1 = await agent();
    const u2 = await agent();
    await prisma.userService.createMany({
      data: [{ userId: u1, serviceId: svc }, { userId: u2, serviceId: svc }],
    });

    const t = await taches.creer({ titre: "Pour l'équipe", projectId: projetA, serviceIds: [svc] }, acteur);
    const assignes = await prisma.taskAssignee.findMany({ where: { taskId: t.id } });
    expect(assignes.map((a) => a.userId).sort()).toEqual([u1, u2].sort());

    // Un service dont l'effectif change ne doit pas réassigner rétroactivement.
    const u3 = await agent();
    await prisma.userService.create({ data: { userId: u3, serviceId: svc } });
    const apres = await prisma.taskAssignee.findMany({ where: { taskId: t.id } });
    expect(apres).toHaveLength(2);
  });
});

describe("RG-TSK-12 — le retard est CALCULÉ", () => {
  it("une tâche dépassée non terminée est en retard", async () => {
    await taches.creer(
      { titre: "En retard", projectId: projetA, dateFin: utc("2020-01-01"), statut: "doing" },
      acteur,
    );
    const p = await globalP();
    const liste = await taches.lister(p, toutes, { enRetard: true });
    expect(liste.some((t) => t.titre === "En retard")).toBe(true);
  });

  it("une tâche dépassée mais TERMINÉE n'est pas en retard", async () => {
    await taches.creer(
      { titre: "Finie à temps", projectId: projetA, dateFin: utc("2020-01-01"), statut: "done" },
      acteur,
    );
    const p = await globalP();
    const liste = await taches.lister(p, toutes, { enRetard: true });
    expect(liste.some((t) => t.titre === "Finie à temps")).toBe(false);
  });
});

describe("EX-TSK-19, EX-TSK-20 — listes de rattrapage", () => {
  it("les orphelines : ni projet, ni assigné", async () => {
    await taches.creer({ titre: "Orpheline" }, acteur);
    const p = await globalP();
    const o = await taches.orphelines(p, toutes);
    expect(o.some((t) => t.titre === "Orpheline")).toBe(true);
  });

  it("les terminées sans temps déclaré", async () => {
    const u = await agent();
    const avec = await taches.creer(
      { titre: "Déclarée", projectId: projetA, assigneIds: [u], statut: "done" },
      acteur,
    );
    await taches.creer({ titre: "Non déclarée", projectId: projetA, assigneIds: [u], statut: "done" }, acteur);
    await prisma.timeEntry.create({
      data: { userId: u, taskId: avec.id, date: utc("2026-03-02"), heures: 2 },
    });

    const liste = await taches.terminesSansTemps(u);
    expect(liste.map((t) => t.titre)).toEqual(["Non déclarée"]);
  });
});
