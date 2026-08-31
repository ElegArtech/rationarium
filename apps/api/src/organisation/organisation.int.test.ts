import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { creerClient, type PrismaClient } from "@rationarium/db";
import { OrganisationService, ErreurOrganisation } from "./organisation.service.js";
import { AuditService } from "../commun/audit.service.js";
import { PerimetreService } from "../commun/perimetre.service.js";

/** L-06 — structure organisationnelle. Une règle, un test qui la cite. */

const RACINE_DB = path.resolve(import.meta.dirname, "../../../../packages/db");

let pg: StartedPostgreSqlContainer;
let prisma: PrismaClient;
let orga: OrganisationService;
let perimetres: PerimetreService;
let acteur: string;

const uuid = () => crypto.randomUUID();
const unique = (p: string) => `${p} ${uuid().slice(0, 8)}`;

beforeAll(async () => {
  pg = await new PostgreSqlContainer("postgres:18-alpine").start();
  execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    cwd: RACINE_DB,
    env: { ...process.env, DATABASE_URL: pg.getConnectionUri() },
    stdio: "pipe",
  });
  prisma = creerClient(pg.getConnectionUri());
  perimetres = new PerimetreService(prisma as never);
  orga = new OrganisationService(prisma as never, new AuditService(prisma as never), perimetres);

  acteur = uuid();
  await prisma.user.create({
    data: {
      id: acteur, login: `admin-${acteur.slice(0, 6)}`, email: `${acteur.slice(0, 6)}@x.fr`,
      motDePasseHash: "x", prenom: "Karim", nom: "Admin",
    },
  });
}, 240_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await pg?.stop();
});

describe("RG-ORG-01 — une direction avec des départements ne se supprime pas", () => {
  it("le refus NOMME les départements à détacher", async () => {
    const d = await orga.creerDirection({ nom: unique("Direction") }, acteur);
    await orga.creerDepartement({ nom: unique("Informatique"), directionId: d.id }, acteur);
    await orga.creerDepartement({ nom: unique("Finances"), directionId: d.id }, acteur);

    const erreur = await orga.supprimerDirection(d.id, acteur).catch((e: ErreurOrganisation) => e);
    expect(erreur).toBeInstanceOf(ErreurOrganisation);
    expect((erreur as ErreurOrganisation).code).toBe("direction_a_des_departements");
    // Le refus est actionnable : il dit QUOI détacher.
    expect((erreur as ErreurOrganisation).detail?.departements).toHaveLength(2);
  });

  it("une direction vide se supprime", async () => {
    const d = await orga.creerDirection({ nom: unique("Éphémère") }, acteur);
    await expect(orga.supprimerDirection(d.id, acteur)).resolves.toBeUndefined();
  });
});

describe("RG-ORG-02 — supprimer un département supprime ses services", () => {
  it("l'impact est chiffré AVANT la confirmation", async () => {
    const dep = await orga.creerDepartement({ nom: unique("Technique") }, acteur);
    await orga.creerService({ nom: "Réseaux", departementId: dep.id }, acteur);
    await orga.creerService({ nom: "Postes", departementId: dep.id }, acteur);

    const impact = await orga.impactSuppressionDepartement(dep.id);
    expect([...impact.servicesSupprimes].sort()).toEqual(["Postes", "Réseaux"]);
    expect(impact.agentsDetaches).toBe(0);
  });

  it("la suppression emporte réellement les services", async () => {
    const dep = await orga.creerDepartement({ nom: unique("Provisoire") }, acteur);
    const svc = await orga.creerService({ nom: "Un service", departementId: dep.id }, acteur);
    await orga.supprimerDepartement(dep.id, acteur);
    expect(await prisma.service.findUnique({ where: { id: svc.id } })).toBeNull();
  });

  it("et l'avertissement est tracé, pas seulement affiché", async () => {
    const dep = await orga.creerDepartement({ nom: unique("Tracé") }, acteur);
    await orga.creerService({ nom: "Service tracé", departementId: dep.id }, acteur);
    await orga.supprimerDepartement(dep.id, acteur);
    const trace = await prisma.auditLog.findFirst({
      where: { action: "departement.delete", entiteId: dep.id },
    });
    expect(trace).not.toBeNull();
    expect(JSON.stringify(trace!.detail)).toContain("Service tracé");
  });
});

describe("RG-ORG-03 — hiérarchie", () => {
  it("un département peut exister hors direction", async () => {
    const dep = await orga.creerDepartement({ nom: unique("Autonome") }, acteur);
    expect(dep.directionId).toBeNull();
  });

  it("et il reste visible dans l'arborescence", async () => {
    const dep = await orga.creerDepartement({ nom: unique("Visible") }, acteur);
    const p = await perimetres.resoudre(acteur, new Set(["users:manage_any"]));
    const arbre = await orga.arborescence(p);
    expect(arbre.departementsSansDirection.map((d) => d.id)).toContain(dep.id);
  });

  it("un service ne peut PAS exister hors département", async () => {
    await expect(
      orga.creerService({ nom: "Orphelin", departementId: uuid() }, acteur),
    ).rejects.toMatchObject({ code: "service_hors_departement" });
  });
});

describe("RG-GEN-07 — concurrence détectée, jamais écrasée", () => {
  it("une écriture sur une version périmée est refusée", async () => {
    const dep = await orga.creerDepartement({ nom: unique("Concurrent") }, acteur);

    // Premier écrivain : passe, et fait passer la version de 1 à 2.
    await orga.mettreAJour("departement", dep.id, 1, { description: "Première" }, acteur);

    // Second écrivain, parti de la même lecture : refusé.
    const erreur = await orga
      .mettreAJour("departement", dep.id, 1, { description: "Seconde" }, acteur)
      .catch((e: ErreurOrganisation) => e);

    expect((erreur as ErreurOrganisation).code).toBe("conflit_de_version");
    expect((erreur as ErreurOrganisation).detail).toMatchObject({
      versionLue: 1,
      versionActuelle: 2,
    });

    // Et surtout : la première écriture n'a PAS été écrasée.
    const apres = await prisma.departement.findUniqueOrThrow({ where: { id: dep.id } });
    expect(apres.description).toBe("Première");
  });

  it("l'écriture avec la bonne version passe et incrémente", async () => {
    const dep = await orga.creerDepartement({ nom: unique("Séquentiel") }, acteur);
    await orga.mettreAJour("departement", dep.id, 1, { description: "A" }, acteur);
    await orga.mettreAJour("departement", dep.id, 2, { description: "B" }, acteur);
    const apres = await prisma.departement.findUniqueOrThrow({ where: { id: dep.id } });
    expect(apres.description).toBe("B");
    expect(apres.version).toBe(3);
  });
});

describe("Unicité et statistiques", () => {
  it("deux directions ne portent pas le même nom", async () => {
    const nom = unique("Doublon");
    await orga.creerDirection({ nom }, acteur);
    await expect(orga.creerDirection({ nom }, acteur)).rejects.toMatchObject({
      code: "nom_deja_pris",
    });
  });

  it("EX-ORG-06 — effectif et services rattachés", async () => {
    const dep = await orga.creerDepartement({ nom: unique("Compté") }, acteur);
    await orga.creerService({ nom: "S1", departementId: dep.id }, acteur);
    await prisma.user.update({ where: { id: acteur }, data: { departementId: dep.id } });

    const stats = await orga.statistiques(dep.id, "departement");
    expect(stats.services).toBe(1);
    expect(stats.effectif).toBe(1);

    await prisma.user.update({ where: { id: acteur }, data: { departementId: null } });
  });
});

describe("EX-ORG-04 — l'arborescence respecte le périmètre", () => {
  it("un agent ne voit pas les départements hors de son périmètre", async () => {
    const mien = await orga.creerDepartement({ nom: unique("Mien") }, acteur);
    await orga.creerDepartement({ nom: unique("Ailleurs") }, acteur);

    const agent = uuid();
    await prisma.user.create({
      data: {
        id: agent, login: `a-${agent.slice(0, 6)}`, email: `${agent.slice(0, 6)}@x.fr`,
        motDePasseHash: "x", prenom: "Camille", nom: "T", departementId: mien.id,
      },
    });

    const p = await perimetres.resoudre(agent, new Set());
    const arbre = await orga.arborescence(p);
    const vus = arbre.departementsSansDirection.map((d) => d.id);
    expect(vus).toEqual([mien.id]);
  });
});

describe("EX-ORG-02 — les trois niveaux SE RENOMMENT", () => {
  /*
   * Ils se créaient et se supprimaient ; aucun ne se modifiait. La maquette 29
   * pose « Modifier » sur les trois — et corriger une faute dans un nom de
   * service imposait de le SUPPRIMER, donc d'en détacher les agents.
   */
  it("une direction se renomme et change de responsable", async () => {
    const d = await orga.creerDirection({ nom: unique("Direction") }, acteur);

    const apres = await orga.renommer("direction", d.id, { nom: unique("Renommée") }, acteur);

    expect(apres.id).toBe(d.id);
    expect(apres.nom).not.toBe(d.nom);
  });

  it("RG-ORG-04 — LE NOM RESTE UNIQUE À LA MODIFICATION", async () => {
    /*
     * Sans ce contrôle, il suffisait de créer puis de renommer pour fabriquer
     * deux directions homonymes — la règle n'était tenue qu'à la création.
     */
    const nom = unique("Occupée");
    await orga.creerDirection({ nom }, acteur);
    const autre = await orga.creerDirection({ nom: unique("Autre") }, acteur);

    await expect(
      orga.renommer("direction", autre.id, { nom }, acteur),
    ).rejects.toMatchObject({ code: "nom_deja_pris" });
  });

  it("un niveau inconnu est refusé, pas créé en douce", async () => {
    await expect(
      orga.renommer("direction", "00000000-0000-4000-8000-000000000000", { nom: "X" }, acteur),
    ).rejects.toMatchObject({ code: "introuvable" });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Vague 7-4 — dette de traçabilité.
// ════════════════════════════════════════════════════════════════════════════

describe("EX-ORG-01 — créer, modifier, supprimer une direction ; lui désigner un responsable", () => {
  /** Un agent réel : le responsable est une clé étrangère, pas une étiquette. */
  const responsable = async (prenom: string) => {
    const id = uuid();
    await prisma.user.create({
      data: {
        id, login: `r-${id.slice(0, 8)}`, email: `${id.slice(0, 8)}@x.fr`,
        motDePasseHash: "x", prenom, nom: "Responsable",
      },
    });
    return id;
  };

  it("les quatre verbes de l'exigence, dans l'ordre où on les emploie", async () => {
    const marie = await responsable("Marie");
    const paul = await responsable("Paul");

    // Créer, avec son responsable dès l'origine.
    const d = await orga.creerDirection(
      { nom: unique("Direction"), description: "Systèmes d'information", responsableId: marie },
      acteur,
    );
    expect(d.responsableId).toBe(marie);
    expect(d.description).toBe("Systèmes d'information");

    // Modifier — le nom ET le responsable, sans changer d'identité.
    const apres = await orga.renommer(
      "direction",
      d.id,
      { nom: unique("Numérique"), responsableId: paul },
      acteur,
    );
    expect(apres.id).toBe(d.id);
    const relu = await prisma.direction.findUniqueOrThrow({ where: { id: d.id } });
    expect(relu.responsableId).toBe(paul);
    expect(relu.nom).toBe(apres.nom);

    // Supprimer.
    await orga.supprimerDirection(d.id, acteur);
    expect(await prisma.direction.findUnique({ where: { id: d.id } })).toBeNull();
  });

  it("le responsable se RETIRE, il n'est pas seulement remplaçable", async () => {
    /*
     * Un responsable qui quitte la collectivité doit pouvoir être détaché sans
     * qu'on lui invente un successeur. `null` est donc une valeur, pas une
     * absence de valeur : le service distingue les deux.
     */
    const marie = await responsable("Marie");
    const d = await orga.creerDirection({ nom: unique("Détachable"), responsableId: marie }, acteur);

    await orga.renommer("direction", d.id, { responsableId: null }, acteur);

    expect(
      (await prisma.direction.findUniqueOrThrow({ where: { id: d.id } })).responsableId,
    ).toBeNull();
  });

  it("la création et la suppression sont tracées, l'une et l'autre", async () => {
    const d = await orga.creerDirection({ nom: unique("Tracée") }, acteur);
    await orga.supprimerDirection(d.id, acteur);

    const actions = (
      await prisma.auditLog.findMany({ where: { entiteId: d.id }, select: { action: true } })
    ).map((a) => a.action);
    expect(actions).toContain("direction.create");
    expect(actions).toContain("direction.delete");
  });
});

describe("EX-ORG-03 — créer, modifier un service ; le rattacher à un département, lui désigner un manager — SUPPRIMER manque, défaut consigné", () => {
  /*
   * L'exigence dit « Créer, modifier, supprimer un service ». Le verbe du
   * milieu existe (`renommer`), le troisième **n'existe pas** : ni
   * `OrganisationService.supprimerService`, ni route `DELETE
   * /organisation/services/:id`. `EX-ORG-03` reste donc en dette, et le
   * contrôle ci-dessous en fait la preuve plutôt qu'une note dans un rapport.
   *
   * C'est le quatrième membre d'une famille que ce dépôt connaît :
   * `EX-ORG-02`, `EX-CLI-02` et `EX-PRJ-05` étaient trois exigences
   * « créer, modifier, supprimer » livrées sans un de leurs verbes.
   */
  it("le service se crée avec son département et son manager", async () => {
    const id = uuid();
    await prisma.user.create({
      data: {
        id, login: `m-${id.slice(0, 8)}`, email: `${id.slice(0, 8)}@x.fr`,
        motDePasseHash: "x", prenom: "Manager", nom: "M",
      },
    });
    const dep = await orga.creerDepartement({ nom: unique("Porteur") }, acteur);

    const svc = await orga.creerService(
      { nom: "Réseaux et télécoms", departementId: dep.id, managerId: id },
      acteur,
    );

    expect(svc.departementId).toBe(dep.id);
    expect(svc.managerId).toBe(id);
  });

  it("le service se renomme, et son manager change", async () => {
    const dep = await orga.creerDepartement({ nom: unique("Renommeur") }, acteur);
    const svc = await orga.creerService({ nom: "Acceuil", departementId: dep.id }, acteur);

    const apres = await orga.renommer("service", svc.id, { nom: "Accueil" }, acteur);

    expect(apres.id).toBe(svc.id);
    expect(apres.nom).toBe("Accueil");
  });

  /*
   * **Le marqueur de défaut a fait son travail.** Ce test était un `it.fails` :
   * il affirmait que `supprimerService` devait exister, et échouait — le
   * référentiel se créait et se modifiait, il ne se supprimait pas. Quatrième
   * occurrence de la famille « le verbe du milieu manque », après `EX-PRJ-05`,
   * `EX-USR-04` et `EX-EVT-06`.
   *
   * Le lot qui l'a posé n'écrivait pas de code de production ; celui-ci l'écrit,
   * et le marqueur est repris en tests ordinaires.
   */
  it("EX-ORG-03 — un service se supprime, et son impact est rendu AVANT", async () => {
    const dep = await orga.creerDepartement({ nom: `D-${uuid().slice(0, 6)}` }, acteur);
    const svc = await orga.creerService(
      { nom: `S-${uuid().slice(0, 6)}`, departementId: dep.id },
      acteur,
    );
    const membre = uuid();
    await prisma.user.create({
      data: {
        id: membre, login: `m-${membre.slice(0, 6)}`, email: `${membre.slice(0, 6)}@x.fr`,
        motDePasseHash: "x", prenom: "M", nom: "T",
      },
    });
    await prisma.userService.create({ data: { userId: membre, serviceId: svc.id } });

    // L'impact chiffre ce qui sera détaché, et ne supprime rien.
    const impact = await orga.impactSuppressionService(svc.id);
    expect(impact).toMatchObject({ agentsDetaches: 1 });
    expect(await prisma.service.count({ where: { id: svc.id } })).toBe(1);

    await orga.supprimerService(svc.id, acteur);
    expect(await prisma.service.count({ where: { id: svc.id } })).toBe(0);
    // L'agent survit, détaché : supprimer un service ne supprime personne.
    expect(await prisma.user.count({ where: { id: membre } })).toBe(1);
  });

  it("EX-ORG-03 — la suppression est portée au journal d'audit", async () => {
    const dep = await orga.creerDepartement({ nom: `D-${uuid().slice(0, 6)}` }, acteur);
    const svc = await orga.creerService(
      { nom: `S-${uuid().slice(0, 6)}`, departementId: dep.id },
      acteur,
    );
    await orga.supprimerService(svc.id, acteur);

    const trace = await prisma.auditLog.findFirst({
      where: { action: "service.delete", entiteId: svc.id },
    });
    expect(trace?.acteurId).toBe(acteur);
  });

  it("EX-ORG-03 — un service inconnu est refusé, pas silencieusement ignoré", async () => {
    await expect(orga.impactSuppressionService(crypto.randomUUID())).rejects.toMatchObject({
      code: "introuvable",
    });
  });
});
