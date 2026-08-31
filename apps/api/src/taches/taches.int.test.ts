import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { creerClient, type PrismaClient } from "@rationarium/db";
import { HttpException } from "@nestjs/common";
import { STATUTS_TACHE } from "@rationarium/contracts";
import { TachesService, ErreurTache } from "./taches.service.js";
import { TachesController } from "./taches.controller.js";
import { AuditService } from "../commun/audit.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { FileService } from "../notifications/file.service.js";
import { PerimetreService } from "../commun/perimetre.service.js";

/*
 * Un périmètre GLOBAL et toutes les permissions : ces suites éprouvent la
 * fiche, pas le cloisonnement. Celui-ci a sa propre suite — sans quoi chaque
 * test porterait deux sujets et n'en prouverait aucun.
 */
const PERIMETRE_TOTAL = { userId: "00000000-0000-4000-8000-000000000000", global: true, confidentiel: true } as never;
const PERMISSIONS_TOTALES = new Set(["tasks:readAll", "tasks:manage_any"]) as ReadonlySet<string>;

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

/** Une tâche hors projet, avec ses assignés. */
async function creerTache(assignes: string[]) {
  const t = await taches.creer(
    {
      titre: "Tâche",
      horsProjet: true,
      ...(assignes.length > 0 ? { assigneIds: assignes } : {}),
    } as never,
    assignes[0] ?? (await agent()),
  );
  return t.id;
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

    const g = await taches.dependances(milieu.id, PERIMETRE_TOTAL, PERMISSIONS_TOTALES);
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

describe("EX-TSK-06 — la liste des assignés se FIXE depuis la fiche", () => {
  /*
   * Elle n'existait pas : on pouvait assigner à la création et déplacer une
   * assignation par glisser-déposer depuis le planning, mais pas ajouter ni
   * retirer quelqu'un depuis la fiche — que la maquette 17 dessine pourtant
   * avec sa liste et son bouton d'ajout.
   *
   * Trouvé par le portage de la vue, pas par un test. Aucun contrôle ne
   * pouvait le voir : ils fabriquaient tous leurs assignations en base.
   */
  it("la liste est posée EN ENTIER, le premier est le porteur", async () => {
    const a = await agent();
    const b = await agent();
    const t = await creerTache([a]);

    const r = await taches.definirAssignes(t, [b, a], a);

    expect(r.assignes).toEqual([b, a]);
    const lignes = await prisma.taskAssignee.findMany({
      where: { taskId: t },
      orderBy: { userId: "asc" },
    });
    expect(lignes).toHaveLength(2);
    expect(lignes.find((l) => l.userId === b)?.porteur).toBe(true);
    expect(lignes.find((l) => l.userId === a)?.porteur).toBe(false);
  });

  it("retirer quelqu'un le retire vraiment, sans toucher au reste", async () => {
    const a = await agent();
    const b = await agent();
    const t = await creerTache([a]);
    await taches.definirAssignes(t, [a, b], a);

    await taches.definirAssignes(t, [a], a);

    const restants = await prisma.taskAssignee.findMany({ where: { taskId: t } });
    expect(restants.map((l) => l.userId)).toEqual([a]);
  });

  it("un doublon dans la demande ne crée qu'une ligne", async () => {
    const a = await agent();
    const t = await creerTache([]);
    await taches.definirAssignes(t, [a, a], a);
    expect(await prisma.taskAssignee.count({ where: { taskId: t } })).toBe(1);
  });

  it("SEULS LES ARRIVANTS SONT PRÉVENUS — et jamais soi-même", async () => {
    // Renotifier ceux qui étaient déjà là ferait du bruit à chaque
    // réordonnancement, et le bruit finit par masquer le signal.
    const acteur = await agent();
    const deja = await agent();
    const arrivant = await agent();
    const t = await creerTache([]);
    await taches.definirAssignes(t, [deja], acteur);
    const avant = await prisma.notification.count({ where: { userId: deja } });

    await taches.definirAssignes(t, [deja, arrivant, acteur], acteur);

    expect(await prisma.notification.count({ where: { userId: deja } })).toBe(avant);
    expect(await prisma.notification.count({ where: { userId: arrivant } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: acteur } })).toBe(0);
  });

  it("une personne inconnue est refusée, et rien n'est écrit", async () => {
    const a = await agent();
    const t = await creerTache([a]);
    await expect(
      taches.definirAssignes(t, [a, "00000000-0000-4000-8000-000000000000"], a),
    ).rejects.toMatchObject({ code: "introuvable" });
    expect(await prisma.taskAssignee.count({ where: { taskId: t } })).toBe(1);
  });
});

describe("RG-SCOPE-04 — la confidentialité se change APRÈS COUP", () => {
  it("une tâche devient confidentielle, et cesse de l'être", async () => {
    // Elle n'était acceptée qu'à la création : une tâche devenue sensible ne
    // pouvait plus le devenir, et une tâche marquée par erreur restait
    // invisible pour toujours.
    const a = await agent();
    const t = await creerTache([a]);

    const apres = await taches.modifier(t, { version: 1, confidentielle: true }, a);
    expect(apres.confidentielle).toBe(true);

    const rendue = await taches.modifier(t, { version: apres.version, confidentielle: false }, a);
    expect(rendue.confidentielle).toBe(false);
  });
});

/**
 * `RG-SCOPE-04` — **permission PUIS périmètre, sur la fiche comme ailleurs.**
 *
 * Ces deux points d'entrée n'avaient que la permission. `tasks:read` suffisait
 * à lire n'importe quelle tâche par son identifiant, confidentielle comprise,
 * et la liste des dépendances nommait des tâches qu'on n'avait pas le droit de
 * voir. Le cloisonnement se contournait par une URL devinée.
 *
 * Aucune boucle ne pouvait le voir : les LISTES filtrent correctement, et
 * c'est ce qui rendait le trou invisible — on vérifiait ce qui marchait.
 */
describe("RG-SCOPE-04 — la fiche et les dépendances sont bornées au périmètre", () => {
  /** Un lecteur ordinaire : ni global, ni habilité au confidentiel. */
  const lecteur = (userId: string) =>
    ({ userId, global: false, confidentiel: false }) as never;
  const LECTURE = new Set(["tasks:read"]) as ReadonlySet<string>;

  it("REFUSE la fiche d'une tâche confidentielle à qui n'y est qu'assigné", async () => {
    const a = await agent();
    const t = await creerTache([a]);
    await taches.modifier(t, { version: 1, confidentielle: true }, a);

    // L'intuition dit qu'un assigné voit sa tâche. `RG-SCOPE-04` dit non.
    await expect(taches.fiche(t, lecteur(a), LECTURE)).rejects.toMatchObject({
      code: "hors_perimetre",
    });
  });

  it("la rend à qui détient la permission explicite", async () => {
    const a = await agent();
    const t = await creerTache([a]);
    await taches.modifier(t, { version: 1, confidentielle: true }, a);

    const habilite = { userId: a, global: false, confidentiel: true } as never;
    await expect(taches.fiche(t, habilite, LECTURE)).resolves.toBeTruthy();
  });

  it("NE NOMME PAS un prérequis hors périmètre — mais garde son entrée", async () => {
    /*
     * L'entrée demeure, sans son titre. La retirer changerait le compte
     * annoncé — « Dépend de (2) » avec une seule ligne — et laisserait croire
     * à un défaut d'affichage plutôt qu'à un cloisonnement.
     */
    const a = await agent();
    const amont = await creerTache([a]);
    const aval = await creerTache([a]);
    await taches.ajouterDependance(aval, amont, a);
    await taches.modifier(amont, { version: 1, confidentielle: true }, a);

    const g = await taches.dependances(aval, lecteur(a), LECTURE);
    expect(g.dependDe).toHaveLength(1);
    expect(g.dependDe[0]!.titre).toBeNull();
    expect(g.dependDe[0]!.lisible).toBe(false);
  });

  it("le nomme dès que le périmètre le permet — sinon le test ne prouverait rien", async () => {
    const a = await agent();
    const amont = await creerTache([a]);
    const aval = await creerTache([a]);
    await taches.ajouterDependance(aval, amont, a);

    const g = await taches.dependances(aval, PERIMETRE_TOTAL, PERMISSIONS_TOTALES);
    expect(g.dependDe[0]!.titre).toBe("Tâche");
    expect(g.dependDe[0]!.lisible).toBe(true);
  });
});

/**
 * `EX-TSK-10` — **la liste des tâches candidates, et la pose d'un ensemble.**
 *
 * Le serveur savait poser et retirer une dépendance, jamais dire lesquelles
 * étaient posables : la fenêtre « Modifier les dépendances » de la vue 17 n'a
 * donc jamais eu de quoi s'ouvrir, et son bouton a vécu plusieurs lots désactivé
 * derrière un motif exact — cinquième commande inerte du produit.
 *
 * Chaque refus est éprouvé DEUX FOIS : la tâche interdite n'est pas proposée,
 * ET une tâche comparable qui n'est pas interdite l'est. Sans le second volet,
 * une implémentation qui ne proposerait jamais rien passerait au vert.
 */
describe("EX-TSK-10 — les candidats à une dépendance", () => {
  const titres = (l: { titre: string }[]) => l.map((c) => c.titre).sort();

  it("EX-TSK-10 — propose les tâches du même projet, non liées et hors cycle", async () => {
    const p = await projet();
    const socle = await taches.creer({ titre: "Socle", projectId: p }, acteur);
    const libre1 = await taches.creer({ titre: "Libre 1", projectId: p }, acteur);
    const libre2 = await taches.creer({ titre: "Libre 2", projectId: p }, acteur);

    const c = await taches.candidatsDependance(socle.id, PERIMETRE_TOTAL, PERMISSIONS_TOTALES);
    expect(titres(c)).toEqual(["Libre 1", "Libre 2"]);
    expect(c.map((x) => x.id).sort()).toEqual([libre1.id, libre2.id].sort());
  });

  it("RG-TSK-04 — un candidat qui FERMERAIT UN CYCLE n'est pas proposé", async () => {
    // A → B → C : « B dépend de A », « C dépend de B ». Poser « A dépend de C »
    // refermerait la boucle. `ajouterDependance` le refuse en aval ; la liste
    // doit l'écarter en amont, sinon on propose un clic qui échouera.
    const p = await projet();
    const a = await taches.creer({ titre: "A", projectId: p }, acteur);
    const b = await taches.creer({ titre: "B", projectId: p }, acteur);
    const c = await taches.creer({ titre: "C", projectId: p }, acteur);
    const d = await taches.creer({ titre: "D sans lien", projectId: p }, acteur);
    await taches.ajouterDependance(b.id, a.id, acteur);
    await taches.ajouterDependance(c.id, b.id, acteur);

    const liste = await taches.candidatsDependance(a.id, PERIMETRE_TOTAL, PERMISSIONS_TOTALES);

    // B est à un saut, C à deux : les deux sont interdits, à toute longueur.
    expect(titres(liste)).toEqual(["D sans lien"]);
    // Et le refus aval dit bien la même chose — les deux bouts se répondent.
    await expect(taches.ajouterDependance(a.id, c.id, acteur)).rejects.toMatchObject({
      code: "dependance_circulaire",
    });
    // Tandis que D, proposé, passe vraiment. Sans cela la liste pourrait être
    // vide par accident et le test resterait vert.
    await expect(taches.ajouterDependance(a.id, d.id, acteur)).resolves.toBeUndefined();
  });

  it("RG-TSK-06 — une tâche d'un AUTRE PROJET n'est pas proposée", async () => {
    const p1 = await projet();
    const p2 = await projet();
    const ici = await taches.creer({ titre: "Ici", projectId: p1 }, acteur);
    await taches.creer({ titre: "Voisine", projectId: p1 }, acteur);
    await taches.creer({ titre: "Ailleurs", projectId: p2 }, acteur);

    const liste = await taches.candidatsDependance(ici.id, PERIMETRE_TOTAL, PERMISSIONS_TOTALES);
    expect(titres(liste)).toEqual(["Voisine"]);
  });

  it("RG-TSK-05 — une tâche DÉJÀ LIÉE n'est plus proposée", async () => {
    const p = await projet();
    const aval = await taches.creer({ titre: "Aval", projectId: p }, acteur);
    const deja = await taches.creer({ titre: "Déjà liée", projectId: p }, acteur);
    const pas = await taches.creer({ titre: "Pas encore", projectId: p }, acteur);

    // Avant le lien, les deux sont proposées : c'est ce qui prouve que le
    // retrait qui suit vient bien du lien, et non d'une liste toujours vide.
    expect(
      titres(await taches.candidatsDependance(aval.id, PERIMETRE_TOTAL, PERMISSIONS_TOTALES)),
    ).toEqual(["Déjà liée", "Pas encore"]);

    await taches.ajouterDependance(aval.id, deja.id, acteur);

    const apres = await taches.candidatsDependance(aval.id, PERIMETRE_TOTAL, PERMISSIONS_TOTALES);
    expect(titres(apres)).toEqual(["Pas encore"]);
    expect(apres.map((c) => c.id)).toContain(pas.id);
  });

  it("RG-TSK-04 — la tâche ne se propose pas ELLE-MÊME", async () => {
    const p = await projet();
    const seule = await taches.creer({ titre: "Seule", projectId: p }, acteur);

    const liste = await taches.candidatsDependance(seule.id, PERIMETRE_TOTAL, PERMISSIONS_TOTALES);
    expect(liste.map((c) => c.id)).not.toContain(seule.id);
    expect(liste).toHaveLength(0);
  });

  it("RG-TSK-06 — deux tâches HORS PROJET se proposent entre elles", async () => {
    // `ajouterDependance` compare `projectId` à `projectId` : `null === null`
    // passe. La liste doit dire la même chose, sinon le hors-projet — parti pris
    // n° 2 du cadrage — perdrait ses dépendances sans qu'aucune règle le dise.
    const a = await taches.creer({ titre: "Hors projet A" }, acteur);
    const b = await taches.creer({ titre: "Hors projet B" }, acteur);

    const liste = await taches.candidatsDependance(a.id, PERIMETRE_TOTAL, PERMISSIONS_TOTALES);
    expect(liste.map((c) => c.id)).toContain(b.id);
  });

  /**
   * `RG-SCOPE-04` — **ici l'exclusion est pure, elle n'est pas un masquage.**
   *
   * `dependances()` garde l'entrée d'un prérequis invisible en lui retirant son
   * titre, pour ne pas fausser le compte annoncé. Ce n'est pas la même règle :
   * une liste de choix ne propose pas une case à cocher sans nom.
   */
  it("RG-SCOPE-04 — une tâche HORS PÉRIMÈTRE n'est pas proposée, ni même anonymement", async () => {
    const p = await projet();
    const a = await agent();
    const depuis = await taches.creer(
      { titre: "Depuis", projectId: p, assigneIds: [a] },
      acteur,
    );
    await taches.creer({ titre: "Ouverte", projectId: p, assigneIds: [a] }, acteur);
    const secrete = await taches.creer(
      { titre: "Secrète", projectId: p, assigneIds: [a] },
      acteur,
    );
    await taches.modifier(secrete.id, { version: 1, confidentielle: true }, acteur);

    const lecteur = { userId: a, global: false, confidentiel: false } as never;
    const liste = await taches.candidatsDependance(depuis.id, lecteur, new Set(["tasks:read"]));

    expect(titres(liste)).toEqual(["Ouverte"]);
    expect(liste.map((c) => c.id)).not.toContain(secrete.id);
    // Ni sous forme d'entrée anonyme : le masquage de `dependances()` ne
    // s'applique PAS ici, et recopier son `masquer()` serait un défaut.
    expect(liste.every((c) => typeof c.titre === "string" && c.titre.length > 0)).toBe(true);

    // Et l'habilité, lui, la voit — sans quoi le test prouverait seulement que
    // la liste est courte.
    const habilite = { userId: a, global: false, confidentiel: true } as never;
    const large = await taches.candidatsDependance(depuis.id, habilite, new Set(["tasks:read"]));
    expect(titres(large)).toEqual(["Ouverte", "Secrète"]);
  });

  it("RG-SCOPE-04 — et la liste elle-même est refusée sur une tâche hors périmètre", async () => {
    const a = await agent();
    const t = await creerTache([a]);
    await taches.modifier(t, { version: 1, confidentielle: true }, a);

    await expect(
      taches.candidatsDependance(
        t,
        { userId: a, global: false, confidentiel: false } as never,
        new Set(["tasks:read"]),
      ),
    ).rejects.toMatchObject({ code: "hors_perimetre" });
  });

  it("EX-TSK-12 — chaque candidat annonce son CONFLIT DE DATES", async () => {
    const p = await projet();
    const cible = await taches.creer(
      { titre: "Cible", projectId: p, dateDebut: utc("2026-09-10"), dateFin: utc("2026-09-20") },
      acteur,
    );
    const tardive = await taches.creer(
      { titre: "Finit après", projectId: p, dateFin: utc("2026-09-15") },
      acteur,
    );
    const propre = await taches.creer(
      { titre: "Finit avant", projectId: p, dateFin: utc("2026-09-01") },
      acteur,
    );

    const liste = await taches.candidatsDependance(cible.id, PERIMETRE_TOTAL, PERMISSIONS_TOTALES);
    expect(liste.find((c) => c.id === tardive.id)?.conflit).toBe(true);
    expect(liste.find((c) => c.id === propre.id)?.conflit).toBe(false);
  });
});

/**
 * **LE PIÈGE DE CE LOT : N candidats ne font pas N parcours.**
 *
 * `fermeraitUnCycle` répond pour UN candidat en remontant le graphe. Filtrer la
 * liste avec lui coûterait un parcours par candidat — sur un projet fourni, des
 * centaines d'allers-retours pour ouvrir une fenêtre, et une lenteur qui grandit
 * avec le projet sans qu'aucun test ne la voie.
 *
 * Le graphe est cantonné au projet (`RG-TSK-06`) : une seule fermeture
 * transitive DESCENDANTE depuis la tâche courante donne l'ensemble interdit en
 * entier. Le nombre de requêtes suit alors la PROFONDEUR du graphe, jamais le
 * nombre de candidats.
 *
 * Ce test compte les lectures de `taskDependency` et le prouve par
 * l'indépendance : à profondeur égale, cinq candidats et trente coûtent le même
 * nombre de requêtes. Une implémentation par candidat ferait sextupler le compte.
 */
describe("EX-TSK-10 — la fermeture transitive tient en UN SEUL parcours", () => {
  /** Un projet, une chaîne descendante de `profondeur` liens, `largeur` tâches libres. */
  async function graphe(profondeur: number, largeur: number) {
    const p = await projet();
    const racine = await taches.creer({ titre: "Racine", projectId: p }, acteur);
    let precedent = racine.id;
    for (let i = 0; i < profondeur; i++) {
      const suivant = await taches.creer({ titre: `Chaîne ${i}`, projectId: p }, acteur);
      // « suivant dépend de precedent » : la chaîne DESCEND depuis la racine.
      await taches.ajouterDependance(suivant.id, precedent, acteur);
      precedent = suivant.id;
    }
    for (let i = 0; i < largeur; i++) {
      await taches.creer({ titre: `Libre ${i}`, projectId: p }, acteur);
    }
    return racine.id;
  }

  /** Le nombre de lectures de la table des liens pendant un appel. */
  async function requetes(fn: () => Promise<unknown>) {
    const vraie = prisma.taskDependency.findMany.bind(prisma.taskDependency);
    let n = 0;
    const espion = vi.spyOn(prisma.taskDependency, "findMany").mockImplementation(((
      a: never,
    ) => {
      n++;
      return vraie(a);
    }) as never);
    try {
      await fn();
    } finally {
      espion.mockRestore();
    }
    return n;
  }

  it("EX-TSK-10 — le coût suit la PROFONDEUR du graphe, pas le nombre de candidats", async () => {
    const petit = await graphe(4, 5);
    const grand = await graphe(4, 30);

    const nPetit = await requetes(() =>
      taches.candidatsDependance(petit, PERIMETRE_TOTAL, PERMISSIONS_TOTALES),
    );
    const nGrand = await requetes(() =>
      taches.candidatsDependance(grand, PERIMETRE_TOTAL, PERMISSIONS_TOTALES),
    );

    // Six fois plus de candidats, exactement le même nombre de lectures.
    expect(nGrand).toBe(nPetit);
    // Et ce nombre est celui d'UN parcours : les quatre tours de la chaîne, le
    // tour à vide qui le clôt, plus la lecture des liens déjà posés. Un parcours
    // par candidat en ferait au moins trente.
    expect(nGrand).toBeLessThanOrEqual(4 + 1 + 1);
    expect(nGrand).toBeLessThan(30);

    // Le graphe porte bien ses trente candidats : sans cela on mesurerait un
    // parcours vide, et n'importe quelle implémentation passerait.
    const candidats = await taches.candidatsDependance(
      grand, PERIMETRE_TOTAL, PERMISSIONS_TOTALES,
    );
    expect(candidats).toHaveLength(30);
  });

  it("EX-TSK-10 — la pose d'un ENSEMBLE ne parcourt pas non plus par candidat", async () => {
    const p = await projet();
    const cible = await taches.creer({ titre: "Cible", projectId: p }, acteur);
    const ids: string[] = [];
    for (let i = 0; i < 12; i++) {
      ids.push((await taches.creer({ titre: `P${i}`, projectId: p }, acteur)).id);
    }

    const n = await requetes(() =>
      taches.definirDependances(cible.id, ids, 1, acteur, PERIMETRE_TOTAL, PERMISSIONS_TOTALES),
    );
    // Un parcours (un seul tour, à vide) plus la lecture des liens actuels.
    // Douze parcours en feraient au moins vingt-quatre.
    expect(n).toBeLessThanOrEqual(4);
    expect(await prisma.taskDependency.count({ where: { taskId: cible.id } })).toBe(12);
  });
});

/**
 * `EX-TSK-10` — **la pose d'un ensemble**, comme la fenêtre l'enregistre.
 *
 * La maquette 17 pose une sélection (`saveDeps`), pas une suite de gestes
 * unitaires. Les cinq refus s'appliquent à l'ensemble, et le refus est TOTAL :
 * enregistrer les lignes saines et taire les autres laisserait l'utilisateur
 * devant une sélection à moitié écrite, sans savoir laquelle.
 */
describe("EX-TSK-10 — la pose d'un ensemble de dépendances", () => {
  it("EX-TSK-10 — l'ensemble remplace : ce qui sort est retiré, ce qui entre est posé", async () => {
    const p = await projet();
    const cible = await taches.creer({ titre: "Cible", projectId: p }, acteur);
    const a = await taches.creer({ titre: "A", projectId: p }, acteur);
    const b = await taches.creer({ titre: "B", projectId: p }, acteur);
    const c = await taches.creer({ titre: "C", projectId: p }, acteur);
    await taches.ajouterDependance(cible.id, a.id, acteur);
    await taches.ajouterDependance(cible.id, b.id, acteur);

    const r = await taches.definirDependances(
      cible.id, [b.id, c.id], 1, acteur, PERIMETRE_TOTAL, PERMISSIONS_TOTALES,
    );

    expect(r.ajoutees).toEqual([c.id]);
    expect(r.retirees).toEqual([a.id]);
    const liens = await prisma.taskDependency.findMany({ where: { taskId: cible.id } });
    expect(liens.map((l) => l.prerequisId).sort()).toEqual([b.id, c.id].sort());
  });

  it("EX-TSK-10 — un ensemble VIDE retire tout", async () => {
    const p = await projet();
    const cible = await taches.creer({ titre: "Cible", projectId: p }, acteur);
    const a = await taches.creer({ titre: "A", projectId: p }, acteur);
    await taches.ajouterDependance(cible.id, a.id, acteur);

    await taches.definirDependances(cible.id, [], 1, acteur, PERIMETRE_TOTAL, PERMISSIONS_TOTALES);
    expect(await prisma.taskDependency.count({ where: { taskId: cible.id } })).toBe(0);
  });

  it("RG-TSK-04 — un ensemble qui contient un CYCLE est refusé EN ENTIER, rien n'est écrit", async () => {
    const p = await projet();
    const amont = await taches.creer({ titre: "Amont", projectId: p }, acteur);
    const aval = await taches.creer({ titre: "Aval", projectId: p }, acteur);
    const sain1 = await taches.creer({ titre: "Sain 1", projectId: p }, acteur);
    const sain2 = await taches.creer({ titre: "Sain 2", projectId: p }, acteur);
    // « aval dépend de amont ». Poser « amont dépend de aval » fermerait la boucle.
    await taches.ajouterDependance(aval.id, amont.id, acteur);

    await expect(
      taches.definirDependances(
        amont.id, [sain1.id, aval.id, sain2.id], 1, acteur, PERIMETRE_TOTAL, PERMISSIONS_TOTALES,
      ),
    ).rejects.toMatchObject({ code: "dependance_circulaire" });

    // Rien n'est écrit — pas même les deux lignes saines qui précédaient la
    // fautive dans la demande. C'est tout l'enjeu : une pose partielle laisserait
    // un état que personne n'a choisi.
    expect(await prisma.taskDependency.count({ where: { taskId: amont.id } })).toBe(0);

    // Et sans la ligne fautive, les deux saines passent — sinon le test ne
    // prouverait que l'incapacité d'écrire.
    await taches.definirDependances(
      amont.id, [sain1.id, sain2.id], 1, acteur, PERIMETRE_TOTAL, PERMISSIONS_TOTALES,
    );
    expect(await prisma.taskDependency.count({ where: { taskId: amont.id } })).toBe(2);
  });

  it("RG-TSK-06 — un ensemble contenant une tâche d'un AUTRE projet est refusé en entier", async () => {
    const p1 = await projet();
    const p2 = await projet();
    const cible = await taches.creer({ titre: "Cible", projectId: p1 }, acteur);
    const bonne = await taches.creer({ titre: "Bonne", projectId: p1 }, acteur);
    const etrangere = await taches.creer({ titre: "Étrangère", projectId: p2 }, acteur);

    await expect(
      taches.definirDependances(
        cible.id, [bonne.id, etrangere.id], 1, acteur, PERIMETRE_TOTAL, PERMISSIONS_TOTALES,
      ),
    ).rejects.toMatchObject({ code: "dependance_autre_projet" });
    expect(await prisma.taskDependency.count({ where: { taskId: cible.id } })).toBe(0);
  });

  it("RG-TSK-05 — un identifiant RÉPÉTÉ dans la demande est refusé, rien n'est écrit", async () => {
    const p = await projet();
    const cible = await taches.creer({ titre: "Cible", projectId: p }, acteur);
    const a = await taches.creer({ titre: "A", projectId: p }, acteur);

    await expect(
      taches.definirDependances(
        cible.id, [a.id, a.id], 1, acteur, PERIMETRE_TOTAL, PERMISSIONS_TOTALES,
      ),
    ).rejects.toMatchObject({ code: "dependance_en_double" });
    expect(await prisma.taskDependency.count({ where: { taskId: cible.id } })).toBe(0);
  });

  it("RG-TSK-04 — la tâche ne peut pas se mettre ELLE-MÊME dans l'ensemble", async () => {
    const p = await projet();
    const cible = await taches.creer({ titre: "Cible", projectId: p }, acteur);

    await expect(
      taches.definirDependances(
        cible.id, [cible.id], 1, acteur, PERIMETRE_TOTAL, PERMISSIONS_TOTALES,
      ),
    ).rejects.toMatchObject({ code: "dependance_sur_soi" });
  });

  it("EX-TSK-10 — une tâche inexistante dans l'ensemble est refusée en entier", async () => {
    const p = await projet();
    const cible = await taches.creer({ titre: "Cible", projectId: p }, acteur);
    const a = await taches.creer({ titre: "A", projectId: p }, acteur);

    await expect(
      taches.definirDependances(
        cible.id, [a.id, "00000000-0000-4000-8000-0000000000ff"], 1, acteur,
        PERIMETRE_TOTAL, PERMISSIONS_TOTALES,
      ),
    ).rejects.toMatchObject({ code: "introuvable" });
    expect(await prisma.taskDependency.count({ where: { taskId: cible.id } })).toBe(0);
  });

  it("RG-SCOPE-04 — poser un lien vers une tâche HORS PÉRIMÈTRE est refusé", async () => {
    const p = await projet();
    const a = await agent();
    const cible = await taches.creer({ titre: "Cible", projectId: p, assigneIds: [a] }, acteur);
    const secrete = await taches.creer(
      { titre: "Secrète", projectId: p, assigneIds: [a] },
      acteur,
    );
    await taches.modifier(secrete.id, { version: 1, confidentielle: true }, acteur);

    const lecteur = { userId: a, global: false, confidentiel: false } as never;
    await expect(
      taches.definirDependances(cible.id, [secrete.id], 1, a, lecteur, new Set(["tasks:read"])),
    ).rejects.toMatchObject({ code: "hors_perimetre" });
  });

  /**
   * `RG-SCOPE-04` — **le lien invisible n'est ni ajouté, ni RETIRÉ.**
   *
   * L'utilisateur ne peut pas le renvoyer dans sa sélection : ni
   * `candidatsDependance` ni `dependances()` ne le lui nomment. Une pose
   * d'ensemble naïve le supprimerait donc au premier enregistrement — une
   * destruction silencieuse d'une donnée que l'auteur du geste n'a jamais vue.
   */
  it("RG-SCOPE-04 — un prérequis invisible SURVIT à une pose d'ensemble qui l'ignore", async () => {
    const p = await projet();
    const a = await agent();
    const cible = await taches.creer({ titre: "Cible", projectId: p, assigneIds: [a] }, acteur);
    const visible = await taches.creer(
      { titre: "Visible", projectId: p, assigneIds: [a] },
      acteur,
    );
    const secrete = await taches.creer(
      { titre: "Secrète", projectId: p, assigneIds: [a] },
      acteur,
    );
    await taches.ajouterDependance(cible.id, secrete.id, acteur);
    await taches.modifier(secrete.id, { version: 1, confidentielle: true }, acteur);

    const lecteur = { userId: a, global: false, confidentiel: false } as never;
    const avant = await prisma.task.findUniqueOrThrow({ where: { id: cible.id } });
    await taches.definirDependances(
      cible.id, [visible.id], avant.version, a, lecteur, new Set(["tasks:read"]),
    );

    const liens = await prisma.taskDependency.findMany({ where: { taskId: cible.id } });
    expect(liens.map((l) => l.prerequisId).sort()).toEqual([secrete.id, visible.id].sort());
  });

  it("RG-GEN-07 — une version périmée lève un conflit, elle n'écrase pas", async () => {
    const p = await projet();
    const cible = await taches.creer({ titre: "Cible", projectId: p }, acteur);
    const a = await taches.creer({ titre: "A", projectId: p }, acteur);
    const b = await taches.creer({ titre: "B", projectId: p }, acteur);

    await taches.definirDependances(
      cible.id, [a.id], 1, acteur, PERIMETRE_TOTAL, PERMISSIONS_TOTALES,
    );

    // Une seconde fenêtre, ouverte avant la première et qui enregistre après :
    // elle porte encore la version 1.
    await expect(
      taches.definirDependances(cible.id, [b.id], 1, acteur, PERIMETRE_TOTAL, PERMISSIONS_TOTALES),
    ).rejects.toMatchObject({ code: "conflit_de_version" });

    // Le travail du premier tient : « dernier arrivé gagne » n'a pas eu lieu.
    const liens = await prisma.taskDependency.findMany({ where: { taskId: cible.id } });
    expect(liens.map((l) => l.prerequisId)).toEqual([a.id]);
  });

  it("EX-TSK-10 — le journal d'audit nomme CHAQUE lien posé et retiré", async () => {
    const p = await projet();
    const cible = await taches.creer({ titre: "Cible", projectId: p }, acteur);
    const a = await taches.creer({ titre: "A", projectId: p }, acteur);
    const b = await taches.creer({ titre: "B", projectId: p }, acteur);
    await taches.definirDependances(
      cible.id, [a.id], 1, acteur, PERIMETRE_TOTAL, PERMISSIONS_TOTALES,
    );

    await taches.definirDependances(
      cible.id, [b.id], 2, acteur, PERIMETRE_TOTAL, PERMISSIONS_TOTALES,
    );

    const journal = await prisma.auditLog.findMany({
      where: {
        entiteId: cible.id,
        action: { in: ["task.dependency_add", "task.dependency_remove"] },
      },
    });
    // Deux ajouts et un retrait : le journal dit ce qui a bougé, pas « ensemble
    // défini », qui ne se relit pas.
    expect(journal.filter((l) => l.action === "task.dependency_add")).toHaveLength(2);
    expect(journal.filter((l) => l.action === "task.dependency_remove")).toHaveLength(1);
    expect(journal.find((l) => l.action === "task.dependency_remove")?.detail).toMatchObject({
      prerequisId: a.id,
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Les règles du cadrage qu'aucun test ne citait — domaine TSK.
//
// Ce bloc n'ajoute aucun code de production : il éprouve ce que le module
// prétend déjà tenir. Chaque suite part du TEXTE du cadrage, jamais de la
// signature du service — c'est la seule façon qu'un test a de trouver ce qui
// manque plutôt que de confirmer ce qui est là.
// ════════════════════════════════════════════════════════════════════════════

describe("EX-TSK-01 — la liste ET le kanban à CINQ colonnes", () => {
  /*
   * Le kanban de la vue 16 n'a pas de représentation propre au serveur : ses
   * colonnes SONT les statuts du vocabulaire fermé, et son contenu sort de
   * `lister`. L'exigence tient donc à deux choses vérifiables ici — que le
   * vocabulaire porte exactement cinq valeurs, et qu'une carte tombe dans une
   * colonne et une seule. Un statut de plus, ou une carte présente dans deux
   * colonnes, et le tableau cesse d'être le kanban que l'exigence décrit.
   */
  it("EX-TSK-01 — le vocabulaire des statuts porte EXACTEMENT cinq colonnes", () => {
    expect(STATUTS_TACHE.map((s) => s.code)).toEqual([
      "todo",
      "doing",
      "review",
      "done",
      "blocked",
    ]);
  });

  it("EX-TSK-01 — chaque carte tombe dans UNE colonne, et la liste les recompose", async () => {
    const projet16 = await projet();
    for (const s of STATUTS_TACHE) {
      await taches.creer({ titre: `K-${s.code}`, projectId: projet16, statut: s.code }, acteur);
    }
    const p = await globalP();

    for (const s of STATUTS_TACHE) {
      const colonne = await taches.lister(p, toutes, { projectId: projet16, statut: s.code });
      // La colonne ne contient QUE son statut : sans cela la même carte
      // s'afficherait dans deux colonnes, et le tableau compterait double.
      expect(colonne.map((t) => t.titre)).toEqual([`K-${s.code}`]);
    }

    // Et la vue « liste » de la même exigence rend l'union exacte des cinq
    // colonnes — ni une carte de moins, ni une carte de plus.
    const liste = await taches.lister(p, toutes, { projectId: projet16 });
    expect(liste.map((t) => t.titre).toSorted()).toEqual(
      STATUTS_TACHE.map((s) => `K-${s.code}`).toSorted(),
    );
  });
});

describe("EX-TSK-03 — les quatre filtres, chacun avec son témoin exclu", () => {
  /*
   * Un filtre se prouve par ce qu'il ÉCARTE, jamais par ce qu'il rend : une
   * clause oubliée rend toujours la ligne attendue — avec toutes les autres.
   */
  let projetC: string;
  let idHorsProjet: string;

  beforeAll(async () => {
    projetC = await projet();
    await taches.creer({ titre: "F-projet", projectId: projetC, priorite: "critical" }, acteur);
    const hp = await taches.creer({ titre: "F-hors-projet", priorite: "low" }, acteur);
    idHorsProjet = hp.id;
    await taches.creer(
      {
        titre: "F-en-retard",
        projectId: projetC,
        dateDebut: utc("2020-01-01"),
        dateFin: utc("2020-01-02"),
        statut: "doing",
      },
      acteur,
    );
    await taches.creer(
      {
        titre: "F-a-lheure",
        projectId: projetC,
        dateDebut: utc("2099-01-01"),
        dateFin: utc("2099-01-02"),
        statut: "doing",
      },
      acteur,
    );
  });

  it("EX-TSK-03 — par projet : les tâches d'un AUTRE projet sont écartées", async () => {
    const p = await globalP();
    const liste = await taches.lister(p, toutes, { projectId: projetC });
    expect(liste.every((t) => t.projectId === projetC)).toBe(true);
    expect(liste.map((t) => t.titre)).toContain("F-projet");
    expect(liste.map((t) => t.titre)).not.toContain("F-hors-projet");
  });

  it("EX-TSK-03 — par priorité : « critique » n'attrape pas « basse »", async () => {
    const p = await globalP();
    const liste = await taches.lister(p, toutes, { projectId: projetC, priorite: "critical" });
    expect(liste.map((t) => t.titre)).toEqual(["F-projet"]);
  });

  it("EX-TSK-03 — par retard : une échéance À VENIR n'est pas retenue", async () => {
    const p = await globalP();
    const liste = await taches.lister(p, toutes, { projectId: projetC, enRetard: true });
    const titres = liste.map((t) => t.titre);
    expect(titres).toContain("F-en-retard");
    expect(titres).not.toContain("F-a-lheure");
    expect(liste.every((t) => t.enRetard)).toBe(true);
  });

  it("EX-TSK-03 — « hors projet » ISOLE : aucune tâche de projet ne s'y glisse", async () => {
    const p = await globalP();
    const liste = await taches.lister(p, toutes, { horsProjet: true });
    expect(liste.map((t) => t.id)).toContain(idHorsProjet);
    expect(liste.every((t) => t.projectId === null)).toBe(true);
  });
});

describe("EX-TSK-07 — modifier depuis la FICHE : ce que la fiche rend compose la requête", () => {
  /*
   * Le piège consigné au CLAUDE.md, dans sa forme exacte : deux moitiés justes
   * qui ne se raccordent pas. `profil()` ne rendait pas `version`, que le
   * schéma de modification exige au titre de `RG-GEN-07` — la route existait,
   * aucune requête n'était composable, et le diagnostic tiré fut « la route
   * n'existe pas ».
   *
   * Ce test prend donc la SORTIE de la lecture et en compose l'ENTRÉE de
   * l'écriture, sans jamais aller chercher la version en base.
   */
  it("EX-TSK-07 — la version LUE SUR LA FICHE suffit à écrire, et la fiche relue le montre", async () => {
    const a = await agent();
    const t = await creerTache([a]);
    const p = await globalP();

    const avant = await taches.fiche(t, p, toutes);
    expect(avant.version).toBeTypeOf("number");

    await taches.modifier(
      t,
      { version: avant.version, titre: "Titre corrigé", priorite: "high" },
      a,
    );

    const apres = await taches.fiche(t, p, toutes);
    expect(apres.titre).toBe("Titre corrigé");
    expect(apres.priorite).toBe("high");
    expect(apres.version).toBe(avant.version + 1);
  });

  it("EX-TSK-07 — rejouer la version PÉRIMÉE de la fiche est refusé, jamais écrasé", async () => {
    const a = await agent();
    const t = await creerTache([a]);
    const p = await globalP();
    const lue = await taches.fiche(t, p, toutes);

    await taches.modifier(t, { version: lue.version, titre: "Premier" }, a);
    await expect(
      taches.modifier(t, { version: lue.version, titre: "Second" }, a),
    ).rejects.toMatchObject({ code: "conflit_de_version" });

    expect((await taches.fiche(t, p, toutes)).titre).toBe("Premier");
  });
});

describe("EX-TSK-08 — le pourcentage d'avancement", () => {
  it("EX-TSK-08 — l'avancement s'écrit et se relit sur la fiche", async () => {
    const a = await agent();
    const t = await creerTache([a]);
    const p = await globalP();

    expect((await taches.fiche(t, p, toutes)).avancement).toBe(0);
    await taches.modifier(t, { version: 1, avancement: 40 }, a);
    expect((await taches.fiche(t, p, toutes)).avancement).toBe(40);
  });

  it("EX-TSK-08 — c'est un POURCENTAGE : 0 et 100 passent, 101 et -1 sont refusés", async () => {
    /*
     * La borne vit dans le schéma du point d'entrée, pas dans le service : le
     * test passe donc par le contrôleur. Vérifier le service seul laisserait
     * croire que « pourcentage » est tenu alors que rien ne le tiendrait.
     */
    const a = await agent();
    const t = await creerTache([a]);
    const controleur = new TachesController(taches);
    const d = { userId: a, permissions: toutes, perimetre: await globalP() } as never;

    await controleur.modifier(t, { version: 1, avancement: 100 }, d);
    await controleur.modifier(t, { version: 2, avancement: 0 }, d);

    /*
     * Le refus est SYNCHRONE — `valider` lève avant que le contrôleur ne rende
     * sa promesse. Un `rejects` n'attraperait rien et le test passerait sur la
     * mauvaise raison : c'est exactement l'assertion faussement robuste que le
     * dépôt a déjà payée.
     */
    let refuses = 0;
    for (const hors of [101, -1, 1000]) {
      try {
        await controleur.modifier(t, { version: 3, avancement: hors }, d);
      } catch (e) {
        expect(e).toBeInstanceOf(HttpException);
        expect((e as HttpException).getStatus()).toBe(400);
        refuses += 1;
      }
    }
    expect(refuses).toBe(3);
    // Rien n'a été écrit par les trois refus : la tâche est restée à zéro.
    expect((await taches.fiche(t, await globalP(), toutes)).avancement).toBe(0);
  });
});
