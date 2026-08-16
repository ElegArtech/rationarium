import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { creerClient, type PrismaClient } from "@trame/db";
import { TiersService, ErreurTiers } from "./tiers.service.js";
import { CompetencesService, ErreurCompetence } from "../competences/competences.service.js";
import { AuditService } from "../commun/audit.service.js";
import { PerimetreService } from "../commun/perimetre.service.js";

/** L-12 et L-13 — tiers, clients, compétences. */

const RACINE_DB = path.resolve(import.meta.dirname, "../../../../packages/db");
const utc = (s: string) => new Date(`${s}T00:00:00.000Z`);

let pg: StartedPostgreSqlContainer;
let prisma: PrismaClient;
let tiers: TiersService;
let competences: CompetencesService;
let perimetres: PerimetreService;
let acteur: string;

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
  const audit = new AuditService(prisma as never);
  perimetres = new PerimetreService(prisma as never);
  tiers = new TiersService(prisma as never, audit);
  competences = new CompetencesService(prisma as never, audit, perimetres);
  acteur = await agent();
}, 240_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await pg?.stop();
});

const globalP = () => perimetres.resoudre(acteur, new Set(["users:manage_any"]));

describe("RG-TRS-01 — une personne morale ne porte pas de contact nommé", () => {
  it("refuse le contact sur une organisation", async () => {
    await expect(
      tiers.creerTiers({ type: "organisation", organisation: "Société X", contactNom: "Jean" }, acteur),
    ).rejects.toMatchObject({ code: "contact_sur_personne_morale" });
  });

  it("l'accepte sur une personne physique", async () => {
    await expect(
      tiers.creerTiers({ type: "individual", contactNom: "Jean Dupont" }, acteur),
    ).resolves.toBeTruthy();
  });
});

describe("RG-TRS-02, RG-TRS-04 — assignation d'un tiers", () => {
  it("un tiers archivé n'est plus assignable", async () => {
    const t = await tiers.creerTiers({ type: "individual", contactNom: "Archivé" }, acteur);
    await prisma.thirdParty.update({ where: { id: t.id }, data: { actif: false } });
    const p = await projet();
    await expect(tiers.rattacherAuProjet(p, t.id, acteur)).rejects.toMatchObject({
      code: "tiers_archive",
    });
  });

  it("RG-TRS-03 — un tiers ne se rattache pas deux fois au même projet", async () => {
    const t = await tiers.creerTiers({ type: "individual", contactNom: "Double" }, acteur);
    const p = await projet();
    await tiers.rattacherAuProjet(p, t.id, acteur);
    await expect(tiers.rattacherAuProjet(p, t.id, acteur)).rejects.toMatchObject({
      code: "deja_rattache",
    });
  });

  it("RG-TRS-04 — assigner à une tâche exige le rattachement au projet parent", async () => {
    const t = await tiers.creerTiers({ type: "individual", contactNom: "Non rattaché" }, acteur);
    const p = await projet();
    const tache = await prisma.task.create({ data: { titre: "T", projectId: p } });

    // Sans cette règle, un prestataire apparaîtrait dans le planning sur un
    // projet auquel il n'a jamais été associé.
    await expect(tiers.assignerALaTache(tache.id, t.id, acteur)).rejects.toMatchObject({
      code: "non_rattache_au_projet",
    });

    await tiers.rattacherAuProjet(p, t.id, acteur);
    await expect(tiers.assignerALaTache(tache.id, t.id, acteur)).resolves.toBeUndefined();
  });

  it("une tâche hors projet ne réclame aucun rattachement préalable", async () => {
    const t = await tiers.creerTiers({ type: "individual", contactNom: "Libre" }, acteur);
    const tache = await prisma.task.create({ data: { titre: "Hors projet" } });
    await expect(tiers.assignerALaTache(tache.id, t.id, acteur)).resolves.toBeUndefined();
  });
});

describe("RG-TRS-05 — bilan d'impact avant suppression", () => {
  it("du temps déclaré bloque, et l'archivage est proposé", async () => {
    const t = await tiers.creerTiers({ type: "individual", contactNom: "Facturant" }, acteur);
    const p = await projet();
    await prisma.timeEntry.create({
      data: { thirdPartyId: t.id, projectId: p, date: utc("2026-03-02"), heures: 8 },
    });

    const impact = await tiers.impactSuppressionTiers(t.id);
    expect(impact.blocages).toEqual([{ objet: "heures déclarées", nombre: 1 }]);
    expect(impact.alternative).toBe("archiver");

    const erreur = await tiers.supprimerTiers(t.id, acteur).catch((e: ErreurTiers) => e);
    expect((erreur as ErreurTiers).code).toBe("suppression_bloquee");
  });

  it("un tiers sans historique se supprime", async () => {
    const t = await tiers.creerTiers({ type: "individual", contactNom: "Éphémère" }, acteur);
    await expect(tiers.supprimerTiers(t.id, acteur)).resolves.toBeUndefined();
  });
});

describe("RG-PRJ-10 — seuls les clients ACTIFS sont rattachables", () => {
  it("le refus NOMME les entrées fautives", async () => {
    const actif = await tiers.creerClient({ nom: `Actif ${uuid().slice(0, 6)}` }, acteur);
    const inactif = await tiers.creerClient({ nom: `Inactif ${uuid().slice(0, 6)}` }, acteur);
    await prisma.client.update({ where: { id: inactif.id }, data: { actif: false } });
    const p = await projet();

    const erreur = await tiers
      .rattacherClients(p, [actif.id, inactif.id], acteur)
      .catch((e: ErreurTiers) => e);
    expect((erreur as ErreurTiers).code).toBe("client_inactif");
    expect((erreur as ErreurTiers).detail?.inactifs).toHaveLength(1);
  });

  it("un identifiant introuvable est signalé, pas ignoré", async () => {
    const p = await projet();
    const fantome = uuid();
    const erreur = await tiers.rattacherClients(p, [fantome], acteur).catch((e: ErreurTiers) => e);
    // Rattacher ce qui existe et ignorer le reste laisserait croire que tout
    // a été fait.
    expect((erreur as ErreurTiers).detail?.introuvables).toEqual([fantome]);
  });

  it("les clients actifs se rattachent, sans doublonner", async () => {
    const c = await tiers.creerClient({ nom: `Client ${uuid().slice(0, 6)}` }, acteur);
    const p = await projet();
    const premier = await tiers.rattacherClients(p, [c.id], acteur);
    expect(premier.rattaches).toBe(1);
    const second = await tiers.rattacherClients(p, [c.id], acteur);
    expect(second.rattaches).toBe(0);
    expect(second.dejaRattaches).toBe(1);
  });
});

describe("RG-CMP-05, RG-CMP-04 — référentiel de compétences", () => {
  it("les noms sont uniques", async () => {
    const nom = `Compétence ${uuid().slice(0, 6)}`;
    await competences.creer({ nom, categorie: "technical" }, acteur);
    await expect(competences.creer({ nom, categorie: "business" }, acteur)).rejects.toMatchObject({
      code: "nom_deja_pris",
    });
  });

  it("une compétence détenue ne se supprime pas, et le refus chiffre", async () => {
    const c = await competences.creer(
      { nom: `Détenue ${uuid().slice(0, 6)}`, categorie: "technical" },
      acteur,
    );
    const u = await agent();
    await competences.definirNiveau(u, c.id, "expert", acteur);

    const erreur = await competences.supprimer(c.id, acteur).catch((e: ErreurCompetence) => e);
    expect((erreur as ErreurCompetence).code).toBe("competence_assignee");
    expect((erreur as ErreurCompetence).detail?.detenteurs).toBe(1);
  });
});

describe("RG-CMP-06 — un agent détient une compétence à UN SEUL niveau", () => {
  it("redéfinir remplace, sans empiler", async () => {
    const c = await competences.creer(
      { nom: `Niveau ${uuid().slice(0, 6)}`, categorie: "technical" },
      acteur,
    );
    const u = await agent();
    await competences.definirNiveau(u, c.id, "beginner", acteur);
    await competences.definirNiveau(u, c.id, "master", acteur);

    const lignes = await prisma.userSkill.findMany({ where: { userId: u, skillId: c.id } });
    // Empiler des lignes créerait deux vérités sur le même agent.
    expect(lignes).toHaveLength(1);
    expect(lignes[0]!.niveau).toBe("master");
  });
});

describe("RG-CMP-01, RG-CMP-02, RG-CMP-03 — couverture et écarts", () => {
  it("chiffre le manque, et ne dit pas seulement « partielle »", async () => {
    const c = await competences.creer(
      { nom: `Rare ${uuid().slice(0, 6)}`, categorie: "technical", effectifRequis: 3 },
      acteur,
    );
    const u = await agent();
    await competences.definirNiveau(u, c.id, "expert", acteur);

    const p = await globalP();
    const m = await competences.matrice(p);
    const colonne = m.colonnes.find((x) => x.id === c.id)!;

    expect(colonne.detenteurs).toBe(1);
    expect(colonne.manque).toBe(2);
    expect(colonne.ecart).toBe(true);
    expect(colonne.couverture).toBe("partielle");
    // Dire « partielle » sans dire combien il manque ne permet pas d'agir.
    expect(colonne.ratio).toBe("1/3");
  });

  it("une compétence couverte n'a pas d'écart", async () => {
    const c = await competences.creer(
      { nom: `Couverte ${uuid().slice(0, 6)}`, categorie: "business", effectifRequis: 1 },
      acteur,
    );
    await competences.definirNiveau(await agent(), c.id, "intermediate", acteur);

    const p = await globalP();
    const colonne = (await competences.matrice(p)).colonnes.find((x) => x.id === c.id)!;
    expect(colonne.ecart).toBe(false);
    expect(colonne.couverture).toBe("complete");
  });

  it("la couverture se compte sur l'instance, pas sur le périmètre visible", async () => {
    // Une compétence est couverte ou non pour l'ORGANISATION. La compter sur
    // le seul périmètre du lecteur donnerait des écarts fantômes.
    const dept = uuid();
    await prisma.departement.create({ data: { id: dept, nom: `D-${dept.slice(0, 6)}` } });
    const c = await competences.creer(
      { nom: `Ailleurs ${uuid().slice(0, 6)}`, categorie: "technical", effectifRequis: 1 },
      acteur,
    );
    const lointain = await agent();
    await prisma.user.update({ where: { id: lointain }, data: { departementId: dept } });
    await competences.definirNiveau(lointain, c.id, "expert", acteur);

    const restreint = await perimetres.resoudre(acteur, new Set());
    const colonne = (await competences.matrice(restreint)).colonnes.find((x) => x.id === c.id)!;
    expect(colonne.detenteurs).toBe(1);
    expect(colonne.ecart).toBe(false);
  });

  it("EX-CMP-10 — recherche des détenteurs par niveau minimum", async () => {
    const c = await competences.creer(
      { nom: `Recherche ${uuid().slice(0, 6)}`, categorie: "technical" },
      acteur,
    );
    const debutant = await agent();
    const expert = await agent();
    await competences.definirNiveau(debutant, c.id, "beginner", acteur);
    await competences.definirNiveau(expert, c.id, "expert", acteur);

    const tous = await competences.detenteurs(c.id);
    expect(tous).toHaveLength(2);

    const confirmes = await competences.detenteurs(c.id, "expert");
    expect(confirmes.map((d) => d.userId)).toEqual([expert]);
  });

  it("EX-CMP-08 — l'export porte les agents en lignes et les compétences en colonnes", async () => {
    const p = await globalP();
    const csv = await competences.exporterMatrice(p);
    expect(csv.split("\n")[0]!.startsWith("Agent;")).toBe(true);
  });
});
