import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { creerClient, type PrismaClient } from "@rationarium/db";
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

describe("EX-TRS-02, RG-TRS-02, RG-TRS-04 — rattacher au projet, assigner à la tâche", () => {
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

/*
 * Le titre citait « EX-TRS-02 et EX-CLI-02 ». Les deux étaient faux, et de deux
 * façons différentes : IL N'EXISTE AUCUN DOMAINE « CLI » au cadrage — les
 * clients vivent dans M14 avec les tiers, et « Gérer les clients » est
 * `EX-TRS-04` ; quant à `EX-TRS-02`, il dit « rattacher un tiers à un projet,
 * l'assigner à une tâche », ce que cette suite ne fait pas. Modifier un tiers
 * relève de `EX-TRS-01`, « gérer les tiers ». Une citation fausse fait croire à
 * une couverture qui n'existe pas : `EX-TRS-02` est recité plus haut, sur la
 * suite qui l'exerce réellement.
 */
describe("EX-TRS-01 et EX-TRS-04 — un tiers et un client se MODIFIENT", () => {
  /*
   * Ils se créaient, se lisaient et se supprimaient ; rien ne les modifiait.
   * Les maquettes 23 à 26 posent pourtant « Modifier » sur la liste ET sur la
   * fiche — et corriger un numéro de téléphone imposait de SUPPRIMER le tiers,
   * donc de rompre ses rattachements de projet et de perdre le temps déclaré
   * pour lui.
   *
   * Trouvé par la conformité de rendu : « Modifier » manquait sur cinq vues.
   */
  it("le contact d'une personne physique se corrige, l'objet reste le même", async () => {
    const acteur = await agent();
    const t = await tiers.creerTiers(
      { type: "individual", contactNom: "Jean Dupont", contactTelephone: "0102030405" },
      acteur,
    );

    const apres = await tiers.modifierTiers(t.id, { contactTelephone: "0607080910" }, acteur);

    expect(apres.id).toBe(t.id);
    expect(apres.contactTelephone).toBe("0607080910");
    expect(apres.contactNom).toBe("Jean Dupont");
  });

  it("RG-TRS-01 — LA RÈGLE VAUT AUSSI À LA MODIFICATION", async () => {
    /*
     * Sans ce contrôle ici, il suffisait de créer une personne physique puis de
     * la basculer en organisation pour contourner la règle : une personne
     * morale se serait retrouvée avec un contact nommé.
     */
    const acteur = await agent();
    const t = await tiers.creerTiers({ type: "individual", contactNom: "Jean Dupont" }, acteur);

    await expect(
      tiers.modifierTiers(t.id, { type: "organisation" }, acteur),
    ).rejects.toMatchObject({ code: "contact_sur_personne_morale" });
  });

  it("un client se renomme et se rend inactif, sans rien effacer", async () => {
    const acteur = await agent();
    const c = await tiers.creerClient({ nom: "Ville de X" }, acteur);

    const renomme = await tiers.modifierClient(c.id, { nom: "Ville de Y", actif: false }, acteur);

    expect(renomme.nom).toBe("Ville de Y");
    expect(renomme.actif).toBe(false);
    expect(await prisma.client.count({ where: { id: c.id } })).toBe(1);
  });

  it("un tiers ou un client inconnu est refusé, pas créé en douce", async () => {
    const acteur = await agent();
    const inconnu = "00000000-0000-4000-8000-000000000000";
    await expect(tiers.modifierTiers(inconnu, { notes: "x" }, acteur)).rejects.toMatchObject({
      code: "introuvable",
    });
    await expect(tiers.modifierClient(inconnu, { nom: "x" }, acteur)).rejects.toMatchObject({
      code: "introuvable",
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Vague 7-4 — dette de traçabilité. M13 et M14.
// ════════════════════════════════════════════════════════════════════════════

describe("EX-CMP-02 — assigner des compétences à un agent avec un niveau", () => {
  it("l'assignation porte le niveau, et le niveau est celui qui a été demandé", async () => {
    const c = await competences.creer(
      { nom: `Assignée ${uuid().slice(0, 6)}`, categorie: "technical" },
      acteur,
    );
    const u = await agent();

    await competences.definirNiveau(u, c.id, "intermediate", acteur);

    const detention = await prisma.userSkill.findUniqueOrThrow({
      where: { userId_skillId: { userId: u, skillId: c.id } },
    });
    expect(detention.niveau).toBe("intermediate");
  });

  it("un agent porte PLUSIEURS compétences, chacune à son propre niveau", async () => {
    const a = await competences.creer({ nom: `A ${uuid().slice(0, 6)}`, categorie: "technical" }, acteur);
    const b = await competences.creer({ nom: `B ${uuid().slice(0, 6)}`, categorie: "business" }, acteur);
    const u = await agent();

    await competences.definirNiveau(u, a.id, "beginner", acteur);
    await competences.definirNiveau(u, b.id, "master", acteur);

    const siennes = await prisma.userSkill.findMany({ where: { userId: u } });
    expect(siennes).toHaveLength(2);
    expect(siennes.find((s) => s.skillId === a.id)!.niveau).toBe("beginner");
    expect(siennes.find((s) => s.skillId === b.id)!.niveau).toBe("master");
  });

  it("l'assignation est tracée, avec l'agent et le niveau", async () => {
    const c = await competences.creer({ nom: `Tracée ${uuid().slice(0, 6)}`, categorie: "technical" }, acteur);
    const u = await agent();
    await competences.definirNiveau(u, c.id, "expert", acteur);

    const trace = await prisma.auditLog.findFirst({
      where: { action: "skill.set_level", entiteId: c.id },
      orderBy: { horodatage: "desc" },
    });
    expect(trace).not.toBeNull();
    expect(JSON.stringify(trace!.detail)).toContain(u);
    expect(JSON.stringify(trace!.detail)).toContain("expert");
  });
});

describe("EX-CMP-03 — modifier un niveau, retirer une compétence", () => {
  it("le niveau se corrige en place, et l'ancien ne subsiste nulle part", async () => {
    const c = await competences.creer({ nom: `Évolue ${uuid().slice(0, 6)}`, categorie: "technical" }, acteur);
    const u = await agent();
    await competences.definirNiveau(u, c.id, "beginner", acteur);

    await competences.definirNiveau(u, c.id, "expert", acteur);

    // `RG-CMP-06` : il y a LE niveau courant, pas un historique de niveaux.
    const lignes = await prisma.userSkill.findMany({ where: { userId: u, skillId: c.id } });
    expect(lignes).toHaveLength(1);
    expect(lignes[0]!.niveau).toBe("expert");
  });

  it("retirer une compétence défait la détention SANS toucher au référentiel", async () => {
    /*
     * La distinction compte : retirer une compétence à quelqu'un et supprimer
     * la compétence de l'organisation sont deux gestes que `RG-CMP-04` sépare
     * précisément — le second est refusé tant qu'il reste des détenteurs.
     */
    const c = await competences.creer({ nom: `Retirée ${uuid().slice(0, 6)}`, categorie: "technical" }, acteur);
    const u = await agent();
    await competences.definirNiveau(u, c.id, "expert", acteur);

    await competences.retirerCompetence(u, c.id, acteur);

    expect(
      await prisma.userSkill.findUnique({ where: { userId_skillId: { userId: u, skillId: c.id } } }),
    ).toBeNull();
    expect(await prisma.skill.findUnique({ where: { id: c.id } })).not.toBeNull();
  });

  it("et le retrait LIBÈRE la suppression que RG-CMP-04 bloquait", async () => {
    const c = await competences.creer({ nom: `Libérée ${uuid().slice(0, 6)}`, categorie: "technical" }, acteur);
    const u = await agent();
    await competences.definirNiveau(u, c.id, "expert", acteur);
    await expect(competences.supprimer(c.id, acteur)).rejects.toMatchObject({
      code: "competence_assignee",
    });

    await competences.retirerCompetence(u, c.id, acteur);

    await expect(competences.supprimer(c.id, acteur)).resolves.toBeUndefined();
  });
});

describe("EX-CMP-04 — consulter la matrice collaborateurs × compétences", () => {
  it("chaque ligne est un agent, chaque colonne une compétence, et les niveaux sont À L'INTERSECTION", async () => {
    /*
     * L'ordre des niveaux d'une ligne suit l'ordre des colonnes : c'est le
     * seul contrat qui permette au client de rendre un tableau. Une liste de
     * paires obligerait chaque cellule à chercher sa valeur.
     */
    const c = await competences.creer({ nom: `Aaa ${uuid().slice(0, 6)}`, categorie: "methodology" }, acteur);
    const d = await competences.creer({ nom: `Zzz ${uuid().slice(0, 6)}`, categorie: "methodology" }, acteur);
    const u = await agent();
    await competences.definirNiveau(u, c.id, "expert", acteur);

    const p = await globalP();
    const m = await competences.matrice(p, { categorie: "methodology" });

    const iC = m.colonnes.findIndex((x) => x.id === c.id);
    const iD = m.colonnes.findIndex((x) => x.id === d.id);
    const ligne = m.lignes.find((l) => l.agent.id === u)!;

    expect(ligne.niveaux).toHaveLength(m.colonnes.length);
    expect(ligne.niveaux[iC]).toBe("expert");
    // Une case vide est `null`, pas une chaîne vide : « pas de niveau » et
    // « niveau vide » ne se ressemblent qu'à l'affichage.
    expect(ligne.niveaux[iD]).toBeNull();
  });

  it("un agent désactivé sort de la matrice — elle décrit l'effectif en poste", async () => {
    const c = await competences.creer({ nom: `Partie ${uuid().slice(0, 6)}`, categorie: "methodology" }, acteur);
    const parti = await agent();
    await competences.definirNiveau(parti, c.id, "expert", acteur);
    await prisma.user.update({ where: { id: parti }, data: { actif: false } });

    const p = await globalP();
    const m = await competences.matrice(p, { categorie: "methodology" });

    expect(m.lignes.map((l) => l.agent.id)).not.toContain(parti);
    // Et il ne compte plus dans la couverture non plus.
    expect(m.colonnes.find((x) => x.id === c.id)!.detenteurs).toBe(0);
  });

  it("le filtre par catégorie ne ramène QUE ses colonnes", async () => {
    const methode = await competences.creer(
      { nom: `Filtrée ${uuid().slice(0, 6)}`, categorie: "methodology" },
      acteur,
    );
    const technique = await competences.creer(
      { nom: `Filtrée ${uuid().slice(0, 6)}`, categorie: "technical" },
      acteur,
    );

    const p = await globalP();
    const m = await competences.matrice(p, { categorie: "methodology" });

    expect(m.colonnes.map((c) => c.id)).toContain(methode.id);
    expect(m.colonnes.map((c) => c.id)).not.toContain(technique.id);
    expect(m.colonnes.every((c) => c.categorie === "methodology")).toBe(true);
  });
});

describe("EX-CMP-05 — modifier un niveau directement depuis une cellule de la matrice", () => {
  it("l'écriture d'une cellule se relit DANS LA MATRICE, pas seulement en base", async () => {
    /*
     * Une cellule qui s'enregistre sans que la matrice change est le piège que
     * ce dépôt connaît sous « un réglage qui s'enregistre n'est pas un réglage
     * qui s'applique ». Le contrôle relit donc la matrice, pas la table.
     */
    const c = await competences.creer({ nom: `Cellule ${uuid().slice(0, 6)}`, categorie: "methodology" }, acteur);
    const u = await agent();
    const p = await globalP();

    const avant = await competences.matrice(p, { categorie: "methodology" });
    const iAvant = avant.colonnes.findIndex((x) => x.id === c.id);
    expect(avant.lignes.find((l) => l.agent.id === u)!.niveaux[iAvant]).toBeNull();

    await competences.definirNiveau(u, c.id, "intermediate", acteur);

    const apres = await competences.matrice(p, { categorie: "methodology" });
    const iApres = apres.colonnes.findIndex((x) => x.id === c.id);
    expect(apres.lignes.find((l) => l.agent.id === u)!.niveaux[iApres]).toBe("intermediate");
  });

  it("et la cellule se VIDE : le retrait depuis la matrice la ramène à null", async () => {
    const c = await competences.creer({ nom: `Vidée ${uuid().slice(0, 6)}`, categorie: "methodology" }, acteur);
    const u = await agent();
    await competences.definirNiveau(u, c.id, "master", acteur);

    await competences.retirerCompetence(u, c.id, acteur);

    const p = await globalP();
    const m = await competences.matrice(p, { categorie: "methodology" });
    const i = m.colonnes.findIndex((x) => x.id === c.id);
    expect(m.lignes.find((l) => l.agent.id === u)!.niveaux[i]).toBeNull();
  });

  it("la cellule d'une compétence CHANGE le manque de sa colonne, immédiatement", async () => {
    const c = await competences.creer(
      { nom: `Manque ${uuid().slice(0, 6)}`, categorie: "methodology", effectifRequis: 2 },
      acteur,
    );
    const p = await globalP();
    expect((await competences.matrice(p, { categorie: "methodology" })).colonnes.find((x) => x.id === c.id)!.manque)
      .toBe(2);

    await competences.definirNiveau(await agent(), c.id, "expert", acteur);

    expect((await competences.matrice(p, { categorie: "methodology" })).colonnes.find((x) => x.id === c.id)!.manque)
      .toBe(1);
  });
});

describe("EX-CMP-06 — consulter la couverture moyenne et les écarts de compétence", () => {
  it("la synthèse compte les écarts et donne une couverture moyenne en pourcentage", async () => {
    /*
     * Isolé sur une catégorie afin que la synthèse porte sur un ensemble
     * connu : sur la matrice entière elle dépendrait de tout ce que les autres
     * contrôles ont semé.
     */
    const couverte = await competences.creer(
      { nom: `Couverte ${uuid().slice(0, 6)}`, categorie: "soft_skill", effectifRequis: 1 },
      acteur,
    );
    const beante = await competences.creer(
      { nom: `Béante ${uuid().slice(0, 6)}`, categorie: "soft_skill", effectifRequis: 4 },
      acteur,
    );
    await competences.definirNiveau(await agent(), couverte.id, "expert", acteur);
    await competences.definirNiveau(await agent(), beante.id, "beginner", acteur);

    const p = await globalP();
    const { synthese, colonnes } = await competences.matrice(p, { categorie: "soft_skill" });

    expect(colonnes).toHaveLength(2);
    expect(synthese.competences).toBe(2);
    expect(synthese.avecEcart).toBe(1);
    // (100 % + 25 %) / 2 = 62,5 arrondi. La moyenne n'est PAS le ratio global
    // des détenteurs sur les requis (2/5 = 40 %) : chaque compétence pèse
    // pareil, sinon celle qui demande beaucoup de monde écraserait les autres.
    expect(synthese.couvertureMoyenne).toBe(63);
  });

  it("un sur-effectif ne fait pas dépasser 100 % — la couverture d'une compétence est PLAFONNÉE", async () => {
    /*
     * Sans le plafond, trois détenteurs pour un requis rendraient 300 % et
     * compenseraient arithmétiquement une lacune ailleurs : la synthèse
     * annoncerait « couvert » sur une organisation qui ne l'est pas.
     */
    const c = await competences.creer(
      { nom: `Pléthore ${uuid().slice(0, 6)}`, categorie: "technical", effectifRequis: 1 },
      acteur,
    );
    for (let i = 0; i < 3; i += 1) {
      await competences.definirNiveau(await agent(), c.id, "expert", acteur);
    }

    const p = await globalP();
    const colonne = (await competences.matrice(p, { categorie: "technical" })).colonnes.find(
      (x) => x.id === c.id,
    )!;
    expect(colonne.ratio).toBe("3/1");
    expect(colonne.detenteurs).toBe(3);
    // Le manque est plancher à zéro, jamais négatif.
    expect(colonne.manque).toBe(0);
    expect(colonne.couverture).toBe("complete");
  });
});

describe("EX-TRS-03 — consulter la fiche d'un tiers et ses rattachements", () => {
  it("la fiche rassemble projets, tâches, heures et période d'intervention", async () => {
    const t = await tiers.creerTiers(
      { type: "organisation", organisation: `Presta ${uuid().slice(0, 6)}` },
      acteur,
    );
    const p = await projet();
    await tiers.rattacherAuProjet(p, t.id, acteur);
    const tache = await prisma.task.create({ data: { titre: "Audit", projectId: p } });
    await tiers.assignerALaTache(tache.id, t.id, acteur);
    await prisma.timeEntry.createMany({
      data: [
        { thirdPartyId: t.id, projectId: p, date: utc("2026-02-10"), heures: 7 },
        { thirdPartyId: t.id, projectId: p, date: utc("2026-05-20"), heures: 3.5 },
      ],
    });

    const fiche = await tiers.ficheTiers(t.id);

    expect(fiche.projets.map((x) => x.id)).toEqual([p]);
    expect(fiche.taches.map((x) => x.id)).toEqual([tache.id]);
    // HEURES et NOMBRE DE SAISIES sont deux grandeurs distinctes : la vue 24
    // les affichait toutes deux depuis un seul nombre, faux dans l'un des cas.
    expect(fiche.heuresDeclarees).toBe(10.5);
    expect(fiche.saisies).toBe(2);
    expect(fiche.premiereIntervention).toBe("2026-02-10");
    expect(fiche.derniereIntervention).toBe("2026-05-20");
  });

  it("le détail des saisies est PLAFONNÉ, et le reste est annoncé", async () => {
    const t = await tiers.creerTiers(
      { type: "organisation", organisation: `Prolixe ${uuid().slice(0, 6)}` },
      acteur,
    );
    const p = await projet();
    await prisma.timeEntry.createMany({
      data: Array.from({ length: 8 }, (_, i) => ({
        thirdPartyId: t.id,
        projectId: p,
        date: utc(`2026-03-${String(i + 1).padStart(2, "0")}`),
        heures: 1,
      })),
    });

    const fiche = await tiers.ficheTiers(t.id);

    // Un panneau latéral qui déverserait tout l'historique cesserait d'être
    // lisible au premier tiers actif.
    expect(fiche.saisiesRecentes).toHaveLength(5);
    expect(fiche.saisiesRestantes).toBe(3);
    // Les plus RÉCENTES, pas les premières venues.
    expect(fiche.saisiesRecentes[0]!.date).toBe("2026-03-08");
  });

  it("un tiers sans aucun rattachement rend des listes vides et des dates nulles, jamais une erreur", async () => {
    const t = await tiers.creerTiers({ type: "individual", contactNom: "Solitaire" }, acteur);
    const fiche = await tiers.ficheTiers(t.id);
    expect(fiche.projets).toEqual([]);
    expect(fiche.taches).toEqual([]);
    expect(fiche.heuresDeclarees).toBe(0);
    expect(fiche.premiereIntervention).toBeNull();
    expect(fiche.derniereIntervention).toBeNull();
  });

  it("un tiers inconnu est refusé, pas rendu vide", async () => {
    await expect(
      tiers.ficheTiers("00000000-0000-4000-8000-000000000000"),
    ).rejects.toMatchObject({ code: "introuvable" });
  });
});

describe("EX-TRS-06 — consulter l'impact d'une suppression AVANT de la confirmer", () => {
  it("l'impact du tiers distingue ce qui BLOQUE de ce qui S'EFFACE, et propose l'archivage", async () => {
    const t = await tiers.creerTiers(
      { type: "organisation", organisation: `Impact ${uuid().slice(0, 6)}` },
      acteur,
    );
    const p = await projet();
    await tiers.rattacherAuProjet(p, t.id, acteur);
    const tache = await prisma.task.create({ data: { titre: "Reprise", projectId: p } });
    await tiers.assignerALaTache(tache.id, t.id, acteur);
    await prisma.timeEntry.create({
      data: { thirdPartyId: t.id, projectId: p, date: utc("2026-04-01"), heures: 6 },
    });

    const impact = await tiers.impactSuppressionTiers(t.id);

    expect(impact.blocages).toEqual([{ objet: "heures déclarées", nombre: 1 }]);
    expect(impact.effacements).toContainEqual({ objet: "rattachements de projet", nombre: 1 });
    expect(impact.effacements).toContainEqual({ objet: "assignations de tâche", nombre: 1 });
    // Un refus sans alternative pousse l'utilisateur à contourner.
    expect(impact.alternative).toBe("archiver");
  });

  it("sans historique, l'impact est vide ET n'annonce aucune alternative", async () => {
    const t = await tiers.creerTiers({ type: "individual", contactNom: "Neuf" }, acteur);
    const impact = await tiers.impactSuppressionTiers(t.id);
    expect(impact.blocages).toEqual([]);
    expect(impact.alternative).toBeNull();
  });

  it("l'impact ANNONCE ce que la suppression fera, et la suppression le fait", async () => {
    const t = await tiers.creerTiers(
      { type: "organisation", organisation: `Cohérent ${uuid().slice(0, 6)}` },
      acteur,
    );
    const p = await projet();
    await tiers.rattacherAuProjet(p, t.id, acteur);

    const impact = await tiers.impactSuppressionTiers(t.id);
    expect(impact.blocages).toEqual([]);
    expect(impact.effacements).toContainEqual({ objet: "rattachements de projet", nombre: 1 });

    await tiers.supprimerTiers(t.id, acteur);

    expect(await prisma.projectThirdParty.count({ where: { thirdPartyId: t.id } })).toBe(0);
    // Le projet, lui, survit : ce qui disparaît est le lien, pas le travail.
    expect(await prisma.project.findUnique({ where: { id: p } })).not.toBeNull();
  });

  it("l'impact d'un CLIENT chiffre ses projets et propose la désactivation", async () => {
    const c = await tiers.creerClient({ nom: `Ville ${uuid().slice(0, 6)}` }, acteur);
    const p = await projet();
    await tiers.rattacherClients(p, [c.id], acteur);

    const impact = await tiers.impactSuppressionClient(c.id);

    expect(impact.blocages).toEqual([{ objet: "projets rattachés", nombre: 1 }]);
    expect(impact.alternative).toBe("desactiver");
  });
});

/**
 * `EX-TRS-02` — les tiers assignables à une tâche.
 *
 * La liste applique **en amont** les refus que l'écriture applique en aval : sans
 * elle, l'écran proposerait ce que le serveur refuse. C'est le même manque que
 * L-45 a comblé pour les dépendances — un geste sans liste de candidats n'est
 * pas un geste.
 */
describe("EX-TRS-02 — les tiers assignables à une tâche", () => {
  it("RG-TRS-04 — seuls les tiers RATTACHÉS AU PROJET PARENT sont proposés", async () => {
    const p = await prisma.project.create({
      data: { nom: "Refonte", dateDebut: utc("2026-01-01"), dateFin: utc("2026-12-31") },
    });
    const tache = await prisma.task.create({ data: { titre: "Atelier", projectId: p.id } });
    const rattache = await prisma.thirdParty.create({
      data: { type: "organisation", organisation: "Cabinet Vallée" },
    });
    const etranger = await prisma.thirdParty.create({
      data: { type: "organisation", organisation: "Ailleurs" },
    });
    await prisma.projectThirdParty.create({
      data: { projectId: p.id, thirdPartyId: rattache.id },
    });

    const candidats = await tiers.candidatsPourTache(tache.id);
    expect(candidats.map((c) => c.id)).toEqual([rattache.id]);
    expect(candidats.map((c) => c.id)).not.toContain(etranger.id);
  });

  it("RG-TRS-03 — un tiers DÉJÀ assigné n'est plus proposé", async () => {
    const p = await prisma.project.create({
      data: { nom: "Refonte 2", dateDebut: utc("2026-01-01"), dateFin: utc("2026-12-31") },
    });
    const tache = await prisma.task.create({ data: { titre: "Atelier", projectId: p.id } });
    const tp = await prisma.thirdParty.create({
      data: { type: "organisation", organisation: "Déjà là" },
    });
    await prisma.projectThirdParty.create({ data: { projectId: p.id, thirdPartyId: tp.id } });

    expect((await tiers.candidatsPourTache(tache.id)).map((c) => c.id)).toEqual([tp.id]);
    await prisma.taskThirdParty.create({ data: { taskId: tache.id, thirdPartyId: tp.id } });
    expect(await tiers.candidatsPourTache(tache.id)).toEqual([]);
  });

  it("RG-TRS-02 — un tiers ARCHIVÉ n'est pas proposé", async () => {
    const p = await prisma.project.create({
      data: { nom: "Refonte 3", dateDebut: utc("2026-01-01"), dateFin: utc("2026-12-31") },
    });
    const tache = await prisma.task.create({ data: { titre: "Atelier", projectId: p.id } });
    const tp = await prisma.thirdParty.create({
      data: { type: "organisation", organisation: "Archivé", actif: false },
    });
    await prisma.projectThirdParty.create({ data: { projectId: p.id, thirdPartyId: tp.id } });

    expect(await tiers.candidatsPourTache(tache.id)).toEqual([]);
  });

  it("hors projet, la règle de rattachement N'A PAS DE PRISE : tout tiers actif est candidat", async () => {
    /*
     * `RG-TRS-04` dit « rattaché à la tâche ou à son projet parent » : sans
     * projet parent, il n'y a rien à interroger. `assignerALaTache` laisse
     * passer, et la liste doit dire la MÊME chose — deux lectures divergentes
     * rendraient l'écran incohérent avec son propre serveur.
     */
    const tache = await prisma.task.create({ data: { titre: "Hors projet" } });
    const tp = await prisma.thirdParty.create({
      data: { type: "individual", contactNom: "Indépendant" },
    });
    expect((await tiers.candidatsPourTache(tache.id)).map((c) => c.id)).toContain(tp.id);
  });
});
