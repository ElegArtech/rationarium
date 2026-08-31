import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { creerClient, type PrismaClient } from "@rationarium/db";
import { ImportsService, ErreurImport, detecterSeparateur } from "./imports.service.js";
import { AuditService } from "../commun/audit.service.js";
import { CongesService } from "../conges/conges.service.js";
import { CalendrierService } from "../parametrage/calendrier.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { FileService } from "../notifications/file.service.js";
import { PerimetreService, type Perimetre } from "../commun/perimetre.service.js";

/**
 * L-24 — imports et exports, sur PostgreSQL réel.
 *
 * **`RG-IMP-06` est la règle dangereuse de ce module** : le mode Remplacer est
 * tout-ou-rien, et une seule ligne en erreur ne doit rien supprimer. Elle ne se
 * voit qu'au moment où elle manque, et il est alors trop tard — d'où un
 * contrôle qui compte ce qui reste en base après un import refusé.
 *
 * Les autres contrôles portent sur ce qui rend un import utilisable : le
 * séparateur du tableur français, l'ordre indifférent des lignes, et un compte
 * rendu qui distingue trois familles au lieu de deux.
 */

const RACINE_DB = path.resolve(import.meta.dirname, "../../../../packages/db");
const utc = (s: string) => new Date(`${s}T00:00:00.000Z`);
const uuid = () => crypto.randomUUID();

let pg: StartedPostgreSqlContainer;
let prisma: PrismaClient;
let imports: ImportsService;
let conges: CongesService;
let acteur: string;
let projet: string;

/**
 * Le périmètre d'un détenteur de permission de gestion globale (`RG-SCOPE-03`).
 * Les suites d'import s'en servent par défaut ; celle du cloisonnement en
 * fabrique un étroit, et c'est tout l'objet de son contrôle.
 */
const perimetreGlobal = (): Perimetre => ({
  userId: acteur,
  global: true,
  departements: new Set(),
  utilisateurs: new Set(),
  confidentiel: true,
});

const perimetreDe = (utilisateurs: string[]): Perimetre => ({
  userId: acteur,
  global: false,
  departements: new Set(),
  utilisateurs: new Set([acteur, ...utilisateurs]),
  confidentiel: false,
});

beforeAll(async () => {
  pg = await new PostgreSqlContainer("postgres:18-alpine").start();
  execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    cwd: RACINE_DB,
    env: { ...process.env, DATABASE_URL: pg.getConnectionUri() },
    stdio: "pipe",
  });
  prisma = creerClient(pg.getConnectionUri());
  const audit = new AuditService(prisma as never);
  // `RG-NTF-04` — la file n'est PAS démarrée : ces suites prouvent au passage
  // qu'un import aboutit sans elle.
  conges = new CongesService(
    prisma as never,
    audit,
    new PerimetreService(prisma as never),
    new CalendrierService(prisma as never, audit),
    new NotificationsService(prisma as never, new FileService()),
  );
  imports = new ImportsService(prisma as never, audit, conges);

  const id = uuid();
  await prisma.user.create({
    data: {
      id, login: `k-${id.slice(0, 8)}`, email: `${id.slice(0, 8)}@x.fr`,
      motDePasseHash: "x", prenom: "K", nom: "A",
    },
  });
  acteur = id;
}, 240_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await pg?.stop();
});

beforeEach(async () => {
  await prisma.subtask.deleteMany();
  await prisma.taskAssignee.deleteMany();
  await prisma.task.deleteMany();
  await prisma.milestone.deleteMany();
  await prisma.project.deleteMany();
  // L'ordre compte : un congé référence son type en `Restrict`, et une
  // compétence détenue empêche sa propre suppression (`RG-CMP-04`).
  await prisma.leave.deleteMany();
  await prisma.leaveBalance.deleteMany();
  await prisma.leaveType.deleteMany();
  await prisma.userSkill.deleteMany();
  await prisma.skill.deleteMany();
  await prisma.user.deleteMany({ where: { id: { not: acteur } } });

  const p = await prisma.project.create({
    data: { nom: `Projet ${uuid().slice(0, 6)}`, dateDebut: utc("2026-01-01"), dateFin: utc("2026-12-31") },
  });
  projet = p.id;
});

// ════════════════════════════════════════════════════════════════════════════

describe("RG-IMP-01 — virgule ET point-virgule", () => {
  it("LE POINT-VIRGULE EST ACCEPTÉ — c'est ce qu'exporte un tableur français", () => {
    // La virgule y est le séparateur décimal : refuser ce fichier reviendrait
    // à refuser le format que produisent les postes de l'organisation.
    expect(detecterSeparateur("name;description;dueDate")).toBe(";");
    expect(detecterSeparateur("name,description,dueDate")).toBe(",");
  });

  it("les deux séparateurs produisent le même aperçu", () => {
    const avecVirgule = "name,description,dueDate\nLancement,,2026-09-30\n";
    const avecPointVirgule = "name;description;dueDate\nLancement;;2026-09-30\n";

    expect(imports.analyser("jalons", avecVirgule).lignes).toEqual(
      imports.analyser("jalons", avecPointVirgule).lignes,
    );
  });
});

describe("RG-IMP-02, RG-IMP-03 — le modèle et la prévisualisation", () => {
  it("le modèle porte UNE LIGNE D'EXEMPLE, pas seulement des en-têtes", () => {
    const modele = imports.modele("utilisateurs");
    // Un fichier vide laisse deviner le format des dates et des listes, et
    // c'est là que se perdent les imports.
    expect(modele).toContain("email;login;password");
    expect(modele).toContain("camille.roussel@exemple.fr");
    // Le BOM : sans lui, Excel lit en ANSI et les accents décrochent.
    expect(modele.charCodeAt(0)).toBe(0xfeff);
  });

  it("le modèle se réimporte tel quel — sinon il ne sert à rien", () => {
    const apercu = imports.analyser("jalons", imports.modele("jalons"));
    expect(apercu.total).toBe(1);
    expect(apercu.erreurs).toEqual([]);
  });

  it("L'APERÇU N'ÉCRIT RIEN — c'est tout son intérêt", async () => {
    const fichier = "name;description;dueDate\nLancement;;2026-09-30\n";
    const avant = await prisma.milestone.count();

    const apercu = imports.analyser("jalons", fichier);
    expect(apercu.total).toBe(1);
    expect(await prisma.milestone.count()).toBe(avant);
  });

  it("une colonne obligatoire absente est un MAUVAIS FICHIER, pas 40 lignes en erreur", () => {
    const sansEmail = "login;password;firstName;lastName\nx;y;A;B\n";
    const erreur = (() => {
      try {
        imports.analyser("utilisateurs", sansEmail);
        return null;
      } catch (e) {
        return e as ErreurImport;
      }
    })();

    expect(erreur?.code).toBe("colonnes_manquantes");
    // L'erreur NOMME ce qui manque : « fichier invalide » obligerait à
    // comparer le fichier au modèle, colonne par colonne.
    expect(erreur?.detail).toMatchObject({ colonnes: ["email"] });
  });

  it("une cellule obligatoire vide porte SON NUMÉRO DE LIGNE", () => {
    const fichier = "name;description;dueDate\nLancement;;2026-09-30\n;;2026-10-30\n";
    const apercu = imports.analyser("jalons", fichier);

    // Le numéro est celui du FICHIER, en-tête comprise : c'est le seul repère
    // que l'utilisateur puisse retrouver dans son tableur.
    expect(apercu.erreurs).toEqual([{ ligne: 3, message: 'colonne « name » vide' }]);
  });
});

describe("RG-IMP-04 — trois familles, jamais deux", () => {
  it("un compte déjà présent est IGNORÉ, pas mis en erreur", async () => {
    const fichier =
      "email;login;password;firstName;lastName\n" +
      "ana@exemple.fr;ana;secret;Ana;Berger\n" +
      "ana@exemple.fr;ana2;secret;Ana;Berger\n";

    const rendu = await imports.importerUtilisateurs(fichier, acteur);

    // Rejouer un fichier est un usage normal, pas un incident.
    expect(rendu).toMatchObject({ importes: 1, ignores: 1 });
    expect(rendu.erreurs).toEqual([]);
  });

  it("le rejeu complet n'importe rien et n'échoue pas", async () => {
    const fichier = "email;login;password;firstName;lastName\nbob@exemple.fr;bob;s;Bob;Costa\n";
    await imports.importerUtilisateurs(fichier, acteur);
    const second = await imports.importerUtilisateurs(fichier, acteur);

    expect(second).toMatchObject({ importes: 0, ignores: 1, erreurs: [] });
    expect(await prisma.user.count({ where: { email: "bob@exemple.fr" } })).toBe(1);
  });

  it("une ligne en erreur n'empêche pas les autres d'entrer", async () => {
    const fichier =
      "email;login;password;firstName;lastName\n" +
      "cle@exemple.fr;cle;s;Cle;Un\n" +
      ";sansmail;s;Sans;Mail\n" +
      "deux@exemple.fr;deux;s;Deux;Deux\n";

    const rendu = await imports.importerUtilisateurs(fichier, acteur);
    expect(rendu.importes).toBe(2);
    expect(rendu.erreurs).toHaveLength(1);
    expect(rendu.erreurs[0]?.ligne).toBe(3);
  });

  it("le compte importé porte l'obligation de changer son mot de passe", async () => {
    await imports.importerUtilisateurs(
      "email;login;password;firstName;lastName\nneuf@exemple.fr;neuf;Provisoire!1;Neuf;Compte\n",
      acteur,
    );
    const cree = await prisma.user.findUniqueOrThrow({ where: { email: "neuf@exemple.fr" } });
    // Le mot de passe du fichier est provisoire, et le produit le dit à la
    // première connexion plutôt que de le laisser vivre.
    expect(cree.motDePasseAChanger).toBe(true);
  });

  it("M20 — l'import d'utilisateurs est tracé", async () => {
    await prisma.auditLog.deleteMany({ where: { entiteId: "import-csv" } });
    await imports.importerUtilisateurs(
      "email;login;password;firstName;lastName\ntrace@exemple.fr;trace;s;T;R\n",
      acteur,
    );
    const trace = await prisma.auditLog.findFirst({ where: { entiteId: "import-csv" } });
    expect(trace?.detail).toMatchObject({ source: "csv", importes: 1 });
  });
});

describe("RG-IMP-05 — L'ORDRE DES LIGNES EST INDIFFÉRENT", () => {
  it("une tâche peut référencer un jalon déclaré PLUS BAS dans le fichier", async () => {
    // Exiger un ordre reviendrait à demander à l'utilisateur de comprendre
    // notre ordre d'insertion — ce qui n'est pas son travail.
    const fichier =
      "rowType;name;dueDate;title;description;status;priority;assigneeEmail;milestoneName;estimatedHours;startDate;endDate;subtasks\n" +
      "TASK;;;Rédiger la note;;todo;normal;;Lancement;8;2026-09-01;2026-09-15;\n" +
      "MILESTONE;Lancement;2026-09-30;;;;;;;;;;\n";

    const rendu = await imports.importerProjet(projet, fichier, "ajouter", acteur);
    expect(rendu.importes).toBe(2);

    const tache = await prisma.task.findFirstOrThrow({
      where: { projectId: projet },
      include: { milestone: true },
    });
    expect(tache.milestone?.nom).toBe("Lancement");
  });

  it("une tâche peut aussi référencer un jalon DÉJÀ en base", async () => {
    await prisma.milestone.create({
      data: { nom: "Recette", projectId: projet, dateEcheance: utc("2026-11-30") },
    });

    const fichier =
      "rowType;name;dueDate;title;description;status;priority;assigneeEmail;milestoneName;estimatedHours;startDate;endDate;subtasks\n" +
      "TASK;;;Recetter;;todo;normal;;Recette;;;;\n";

    await imports.importerProjet(projet, fichier, "ajouter", acteur);
    const tache = await prisma.task.findFirstOrThrow({ include: { milestone: true } });
    expect(tache.milestone?.nom).toBe("Recette");
  });

  it("les sous-tâches voyagent dans leur colonne, séparées par des points-virgules", async () => {
    const fichier =
      "rowType,name,dueDate,title,description,status,priority,assigneeEmail,milestoneName,estimatedHours,startDate,endDate,subtasks\n" +
      'TASK,,,Préparer,,todo,normal,,,,,,"Réserver la salle;Écrire l\'ordre du jour"\n';

    await imports.importerProjet(projet, fichier, "ajouter", acteur);
    const sousTaches = await prisma.subtask.findMany({ orderBy: { ordre: "asc" } });
    expect(sousTaches.map((s) => s.libelle)).toEqual([
      "Réserver la salle",
      "Écrire l'ordre du jour",
    ]);
  });

  it("un jalon déjà présent est ignoré, pas dupliqué", async () => {
    await prisma.milestone.create({
      data: { nom: "Lancement", projectId: projet, dateEcheance: utc("2026-09-30") },
    });
    const fichier =
      "rowType;name;dueDate;title;description;status;priority;assigneeEmail;milestoneName;estimatedHours;startDate;endDate;subtasks\n" +
      "MILESTONE;Lancement;2026-09-30;;;;;;;;;;\n";

    const rendu = await imports.importerProjet(projet, fichier, "ajouter", acteur);
    expect(rendu).toMatchObject({ importes: 0, ignores: 1 });
    expect(await prisma.milestone.count({ where: { projectId: projet } })).toBe(1);
  });
});

describe("RG-IMP-06 — le mode Remplacer est TOUT-OU-RIEN", () => {
  beforeEach(async () => {
    await prisma.milestone.create({
      data: { nom: "Existant", projectId: projet, dateEcheance: utc("2026-06-30") },
    });
    await prisma.task.create({
      data: { titre: "Tâche existante", projectId: projet, statut: "doing" },
    });
  });

  it("UNE SEULE LIGNE EN ERREUR NE SUPPRIME RIEN", async () => {
    // C'est la règle la plus dangereuse du module : elle ne se voit qu'au
    // moment où elle manque, et il est alors trop tard.
    const fichier =
      "rowType;name;dueDate;title;description;status;priority;assigneeEmail;milestoneName;estimatedHours;startDate;endDate;subtasks\n" +
      "MILESTONE;Nouveau;2026-10-30;;;;;;;;;;\n" +
      ";;;;;;;;;;;;\n";

    const rendu = await imports.importerProjet(projet, fichier, "remplacer", acteur);

    expect(rendu.importes).toBe(0);
    expect(rendu.erreurs).toHaveLength(1);
    // Rien n'a bougé : ni supprimé, ni créé.
    expect(await prisma.milestone.count({ where: { projectId: projet } })).toBe(1);
    expect(await prisma.task.count({ where: { projectId: projet } })).toBe(1);
  });

  it("sans erreur, le remplacement remplace bien", async () => {
    const fichier =
      "rowType;name;dueDate;title;description;status;priority;assigneeEmail;milestoneName;estimatedHours;startDate;endDate;subtasks\n" +
      "MILESTONE;Nouveau;2026-10-30;;;;;;;;;;\n" +
      "TASK;;;Nouvelle tâche;;todo;normal;;Nouveau;;;;\n";

    const rendu = await imports.importerProjet(projet, fichier, "remplacer", acteur);
    expect(rendu.importes).toBe(2);

    const jalons = await prisma.milestone.findMany({ where: { projectId: projet } });
    const taches = await prisma.task.findMany({ where: { projectId: projet } });
    expect(jalons.map((j) => j.nom)).toEqual(["Nouveau"]);
    expect(taches.map((t) => t.titre)).toEqual(["Nouvelle tâche"]);
  });

  it("le mode Ajouter, lui, conserve l'existant", async () => {
    const fichier =
      "rowType;name;dueDate;title;description;status;priority;assigneeEmail;milestoneName;estimatedHours;startDate;endDate;subtasks\n" +
      "MILESTONE;Nouveau;2026-10-30;;;;;;;;;;\n";

    await imports.importerProjet(projet, fichier, "ajouter", acteur);
    expect(await prisma.milestone.count({ where: { projectId: projet } })).toBe(2);
    expect(await prisma.task.count({ where: { projectId: projet } })).toBe(1);
  });

  it("les VOLUMES sont connus avant la suppression, pas après", async () => {
    await prisma.subtask.create({
      data: {
        taskId: (await prisma.task.findFirstOrThrow({ where: { projectId: projet } })).id,
        libelle: "Une sous-tâche",
        ordre: 0,
      },
    });

    // Un « êtes-vous sûr ? » sans chiffres ne permet pas de décider.
    expect(await imports.volumesRemplacement(projet)).toEqual({
      jalons: 1,
      taches: 1,
      sousTaches: 1,
    });
  });
});

describe("Les exports CSV — la réversibilité, pas la capture d'écran", () => {
  it("L'EXPORT DES TÂCHES SE RÉIMPORTE : c'est le critère", async () => {
    const jalon = await prisma.milestone.create({
      data: { nom: "Lancement", projectId: projet, dateEcheance: utc("2026-09-30") },
    });
    await prisma.task.create({
      data: {
        titre: "Rédiger la note", projectId: projet, milestoneId: jalon.id,
        statut: "doing", priorite: "high", estimationHeures: 8,
        dateDebut: utc("2026-09-01"), dateFin: utc("2026-09-15"),
      },
    });

    const csv = await imports.exporterTaches(projet);

    // Un export qui ne se réimporte pas n'est pas de la réversibilité.
    const apercu = imports.analyser("taches", csv);
    expect(apercu.erreurs).toEqual([]);
    expect(apercu.lignes[0]).toMatchObject({
      title: "Rédiger la note",
      status: "doing",
      milestoneName: "Lancement",
      startDate: "2026-09-01",
    });
  });

  it("l'export des jalons aussi", async () => {
    await prisma.milestone.create({
      data: { nom: "Recette", projectId: projet, dateEcheance: utc("2026-11-30") },
    });
    const apercu = imports.analyser("jalons", await imports.exporterJalons(projet));
    expect(apercu.erreurs).toEqual([]);
    expect(apercu.lignes[0]).toMatchObject({ name: "Recette", dueDate: "2026-11-30" });
  });

  it("un projet vide s'exporte quand même, avec ses seuls en-têtes", async () => {
    const csv = await imports.exporterTaches(projet);
    // Un fichier vide serait pris pour un échec d'export.
    expect(csv).toContain("title;description;status");
    expect(imports.analyser("taches", csv).total).toBe(0);
  });

  it("les compétences s'exportent avec leur effectif requis", async () => {
    await prisma.skill.create({
      data: { nom: "PostgreSQL", categorie: "technical", effectifRequis: 3 },
    });
    const apercu = imports.analyser("competences", await imports.exporterCompetences());
    expect(apercu.lignes[0]).toMatchObject({ name: "PostgreSQL", requiredCount: "3" });
  });

  it("un nom contenant le séparateur ne casse pas les colonnes", async () => {
    await prisma.task.create({
      data: { titre: "Refonte ; phase 2", projectId: projet, statut: "todo" },
    });
    const apercu = imports.analyser("taches", await imports.exporterTaches(projet));
    // Sans échappement, la ligne se décalerait et le fichier paraîtrait valide.
    expect(apercu.lignes[0]?.["title"]).toBe("Refonte ; phase 2");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// L-43 — l'EXÉCUTION des imports de compétences et de congés.
//
// Les deux aperçus fonctionnaient depuis L-24 ; seule l'écriture manquait.
// Ces suites portent donc sur ce que l'écriture, elle seule, peut casser :
// la contrainte d'exclusion des congés, l'unicité des noms de compétences,
// le contrôle de solde, et le périmètre.
// ════════════════════════════════════════════════════════════════════════════

const ENTETE_CMP = "name;category;description;requiredCount\n";

describe("EX-CMP-09 — importer le référentiel de compétences depuis un CSV", () => {
  it("EX-CMP-09 — trois lignes deviennent trois compétences, avec catégorie et effectif", async () => {
    const rendu = await imports.importerCompetences(
      ENTETE_CMP +
        "PostgreSQL;technical;Administration et requêtage;3\n" +
        "Conduite de réunion;soft_skill;;2\n" +
        "Marché public;business;;\n",
      acteur,
    );

    expect(rendu).toMatchObject({ importes: 3, ignores: 0 });
    expect(rendu.erreurs).toEqual([]);

    const creees = await prisma.skill.findMany({ orderBy: { nom: "asc" } });
    expect(creees.map((c) => [c.nom, c.categorie, c.effectifRequis])).toEqual([
      ["Conduite de réunion", "soft_skill", 2],
      ["Marché public", "business", 1],
      ["PostgreSQL", "technical", 3],
    ]);
    expect(creees.find((c) => c.nom === "PostgreSQL")?.description).toBe(
      "Administration et requêtage",
    );
  });

  it("RG-CMP-05 — un nom déjà pris est IGNORÉ, et la compétence en base n'est pas touchée", async () => {
    await prisma.skill.create({
      data: { nom: "PostgreSQL", categorie: "technical", effectifRequis: 7 },
    });

    const rendu = await imports.importerCompetences(
      ENTETE_CMP + "PostgreSQL;business;Écrasée ?;1\n" + "Kubernetes;technical;;2\n",
      acteur,
    );

    // Rejouer un référentiel enrichi de deux lignes est l'usage normal.
    expect(rendu).toMatchObject({ importes: 1, ignores: 1 });
    expect(rendu.erreurs).toEqual([]);

    // « Ignoré » veut dire ignoré : un import n'écrase pas en silence. Sans
    // cette assertion, un `upsert` passerait le test précédent sans être vu.
    const existante = await prisma.skill.findUniqueOrThrow({ where: { nom: "PostgreSQL" } });
    expect(existante.effectifRequis).toBe(7);
    expect(existante.categorie).toBe("technical");
    expect(existante.description).toBeNull();
  });

  it("RG-CMP-05 — deux fois le même nom DANS LE MÊME FICHIER n'en crée qu'une", async () => {
    const rendu = await imports.importerCompetences(
      ENTETE_CMP + "Terraform;technical;;1\n" + "Terraform;technical;;9\n",
      acteur,
    );

    expect(rendu).toMatchObject({ importes: 1, ignores: 1, erreurs: [] });
    expect(await prisma.skill.count({ where: { nom: "Terraform" } })).toBe(1);
  });

  it("EX-CMP-09 — UN EXPORT DE COMPÉTENCES SE RÉIMPORTE TEL QUEL", async () => {
    /*
     * Le contrôle du piège arbitré dans ce lot : `modele()` proposait
     * « Technique » (libellé) quand `exporterCompetences()` écrivait
     * `technical` (code). Un export n'était donc PAS réimportable, ce que le
     * commentaire de `exporterTaches` promet pourtant pour tout le module.
     * Les quatre catégories sont exercées : une seule non réversible suffirait
     * à perdre la moitié d'un référentiel au premier aller-retour.
     */
    await prisma.skill.createMany({
      data: [
        { nom: "PostgreSQL", categorie: "technical", description: "SQL", effectifRequis: 3 },
        { nom: "Scrum", categorie: "methodology", effectifRequis: 2 },
        { nom: "Écoute active", categorie: "soft_skill", effectifRequis: 4 },
        { nom: "Marché public", categorie: "business", effectifRequis: 1 },
      ],
    });
    const attendu = await prisma.skill.findMany({
      orderBy: { nom: "asc" },
      select: { nom: true, categorie: true, description: true, effectifRequis: true },
    });

    const csv = await imports.exporterCompetences();

    /*
     * L'aller-retour seul ne suffit PAS à prouver l'arbitrage : l'import
     * accepte aussi les libellés, donc un export en « Technique » se
     * réimporterait tout aussi bien et le contrôle resterait vert sur la
     * contradiction qu'il est censé fermer. On épingle donc la forme ÉCRITE —
     * strict en sortie, tolérant en entrée, et les deux moitiés vérifiées.
     */
    expect(csv).toContain(";technical;");
    expect(csv).toContain(";soft_skill;");
    expect(csv).not.toContain("Technique");
    expect(csv).not.toContain("Savoir-être");

    await prisma.skill.deleteMany();

    const rendu = await imports.importerCompetences(csv, acteur);
    expect(rendu).toMatchObject({ importes: 4, ignores: 0, erreurs: [] });

    const rejouees = await prisma.skill.findMany({
      orderBy: { nom: "asc" },
      select: { nom: true, categorie: true, description: true, effectifRequis: true },
    });
    // Aller-retour à l'identique, colonne par colonne.
    expect(rejouees).toEqual(attendu);
  });

  it("RG-IMP-02 — LE MODÈLE DE COMPÉTENCES S'IMPORTE, catégorie comprise", async () => {
    // L'autre moitié du même piège : le modèle est ce qu'on télécharge pour
    // savoir quoi écrire. S'il porte une catégorie que l'import refuse, il
    // enseigne l'erreur.
    const modele = imports.modele("competences");
    // La forme épinglée, pour la même raison que dans l'aller-retour : la
    // tolérance en entrée rendrait ce contrôle aveugle au libellé.
    expect(modele).toContain("PostgreSQL;technical;");

    const rendu = await imports.importerCompetences(modele, acteur);
    expect(rendu).toMatchObject({ importes: 1, ignores: 0, erreurs: [] });
    expect(
      (await prisma.skill.findUniqueOrThrow({ where: { nom: "PostgreSQL" } })).categorie,
    ).toBe("technical");
  });

  it("EX-CMP-09 — le libellé français d'une catégorie est accepté en lecture", async () => {
    // Tolérant en entrée : une personne qui remplit un tableau à la main
    // écrit « Savoir-être », pas `soft_skill`.
    const rendu = await imports.importerCompetences(
      ENTETE_CMP + "Médiation;Savoir-être;;1\n" + "Cadrage;MÉTHODOLOGIE;;1\n",
      acteur,
    );
    expect(rendu).toMatchObject({ importes: 2, erreurs: [] });
    expect(
      (await prisma.skill.findUniqueOrThrow({ where: { nom: "Médiation" } })).categorie,
    ).toBe("soft_skill");
    expect((await prisma.skill.findUniqueOrThrow({ where: { nom: "Cadrage" } })).categorie).toBe(
      "methodology",
    );
  });

  it("RG-IMP-04 — une catégorie inconnue part en ERREUR, avec son numéro de ligne", async () => {
    const rendu = await imports.importerCompetences(
      ENTETE_CMP + "Bonne;technical;;1\n" + "Douteuse;magie;;1\n" + "Autre;business;;1\n",
      acteur,
    );

    // Une ligne en erreur n'empêche pas les autres d'entrer.
    expect(rendu.importes).toBe(2);
    expect(rendu.ignores).toBe(0);
    expect(rendu.erreurs).toHaveLength(1);
    // Le numéro est celui du FICHIER, en-tête comprise.
    expect(rendu.erreurs[0]?.ligne).toBe(3);
    // Le message ÉNUMÈRE les valeurs attendues : deviner coûte plus cher.
    expect(rendu.erreurs[0]?.message).toContain("magie");
    expect(rendu.erreurs[0]?.message).toContain("soft_skill");
    expect(await prisma.skill.count({ where: { nom: "Douteuse" } })).toBe(0);
  });

  it("RG-CMP-01 — un effectif requis VIDE vaut 1, pas zéro ; un effectif non entier est refusé", async () => {
    /*
     * `Number("")` vaut zéro : le filtre porte sur la CHAÎNE. Un effectif à 0
     * ne produirait jamais d'écart de compétence (`RG-CMP-02`), donc une
     * colonne laissée vide effacerait silencieusement toute la couverture.
     */
    const rendu = await imports.importerCompetences(
      ENTETE_CMP + "Sans effectif;technical;;\n" + "Deux et demi;technical;;2,5\n",
      acteur,
    );

    expect(rendu.importes).toBe(1);
    expect(rendu.erreurs).toHaveLength(1);
    expect(rendu.erreurs[0]?.ligne).toBe(3);
    expect(
      (await prisma.skill.findUniqueOrThrow({ where: { nom: "Sans effectif" } })).effectifRequis,
    ).toBe(1);
  });

  it("M20 — l'import de compétences est tracé, avec son bilan", async () => {
    await prisma.auditLog.deleteMany({ where: { typeEntite: "Skill" } });
    await imports.importerCompetences(ENTETE_CMP + "Tracée;technical;;1\n", acteur);

    const trace = await prisma.auditLog.findFirst({
      where: { typeEntite: "Skill", entiteId: "import-csv" },
    });
    expect(trace?.acteurId).toBe(acteur);
    expect(trace?.detail).toMatchObject({ source: "csv", importes: 1, ignores: 0 });
  });
});

// ────────────────────────────────────────────────────────────────────────────

const ENTETE_CNG = "userEmail;leaveTypeName;startDate;endDate;halfDay;comment\n";

describe("EX-CNG-14, RG-CNG-32 — importer des congés en masse", () => {
  let typeAvecValidation: string;
  let ana: string;
  let bob: string;

  /** Un agent, et un solde généreux pour l'année du jeu d'essai. */
  async function agent(email: string, typeId: string, jours = 40) {
    const id = crypto.randomUUID();
    await prisma.user.create({
      data: {
        id, login: `l-${id.slice(0, 8)}`, email,
        motDePasseHash: "x", prenom: "A", nom: "B",
      },
    });
    await prisma.leaveBalance.create({
      data: { userId: id, typeId, annee: 2026, joursAttribues: jours },
    });
    return id;
  }

  beforeEach(async () => {
    const t = await prisma.leaveType.create({
      data: { code: "CA", nom: "Congés annuels", validationRequise: true },
    });
    typeAvecValidation = t.id;
    ana = await agent("ana@exemple.fr", t.id);
    bob = await agent("bob@exemple.fr", t.id);
  });

  it("EX-CNG-14 — un fichier de congés entre en masse, avec ses jours et son motif", async () => {
    const rendu = await imports.importerConges(
      ENTETE_CNG +
        "ana@exemple.fr;Congés annuels;2026-03-02;2026-03-06;;Vacances d'hiver\n" +
        "bob@exemple.fr;Congés annuels;2026-04-06;2026-04-08;;\n",
      acteur,
      perimetreGlobal(),
    );

    expect(rendu).toMatchObject({ importes: 2, ignores: 0, erreurs: [] });

    const dAna = await prisma.leave.findFirstOrThrow({ where: { userId: ana } });
    // Lundi 2 au vendredi 6 mars 2026 : cinq jours ouvrés (`RG-CNG-16`).
    expect(Number(dAna.joursOuvres)).toBe(5);
    expect(dAna.motif).toBe("Vacances d'hiver");
    expect(await prisma.leave.count({ where: { userId: bob } })).toBe(1);
  });

  it("RG-CNG-32 — UN FICHIER DE 3 LIGNES DONT UNE CHEVAUCHE EN IMPORTE 2 ET EN IGNORE 1", async () => {
    /*
     * ══════════════════════════════════════════════════════════════════════
     * LE contrôle de ce lot. `leaves_pas_de_chevauchement` est une contrainte
     * d'EXCLUSION GiST : dans une transaction unique, la troisième ligne
     * ferait échouer les deux premières — donc « 0 importé » sur un fichier
     * dont deux tiers sont bons. `RG-CNG-32` veut le chevauchement en
     * **ignoré**, ce qui n'est tenable que ligne à ligne.
     *
     * La deuxième ligne chevauche la première du MÊME FICHIER : c'est le cas
     * qu'une pré-analyse ne verrait pas, puisque rien n'est encore en base au
     * moment de l'aperçu.
     * ══════════════════════════════════════════════════════════════════════
     */
    const rendu = await imports.importerConges(
      ENTETE_CNG +
        "ana@exemple.fr;Congés annuels;2026-03-02;2026-03-06;;\n" +
        "ana@exemple.fr;Congés annuels;2026-03-04;2026-03-10;;\n" +
        "bob@exemple.fr;Congés annuels;2026-05-11;2026-05-13;;\n",
      acteur,
      perimetreGlobal(),
    );

    expect(rendu.importes).toBe(2);
    expect(rendu.ignores).toBe(1);
    // Un chevauchement N'EST PAS une erreur : le compte rendu ne doit pas
    // faire paniquer sur un fichier dont deux tiers sont entrés.
    expect(rendu.erreurs).toEqual([]);

    // Et les deux bonnes lignes sont bien EN BASE : le compte rendu pourrait
    // mentir, la base non.
    expect(await prisma.leave.count()).toBe(2);
    expect(await prisma.leave.count({ where: { userId: ana } })).toBe(1);
    expect(await prisma.leave.count({ where: { userId: bob } })).toBe(1);
  });

  it("RG-CNG-32 — le rejeu du même fichier n'importe rien et n'échoue pas", async () => {
    const fichier =
      ENTETE_CNG + "ana@exemple.fr;Congés annuels;2026-03-02;2026-03-06;;\n";

    await imports.importerConges(fichier, acteur, perimetreGlobal());
    const second = await imports.importerConges(fichier, acteur, perimetreGlobal());

    // Le doublon exact est un chevauchement parfait : même compteur.
    expect(second).toMatchObject({ importes: 0, ignores: 1, erreurs: [] });
    expect(await prisma.leave.count({ where: { userId: ana } })).toBe(1);
  });

  it("RG-CNG-32 — une ligne chevauchant un congé DÉJÀ en base est ignorée", async () => {
    await conges.deposer(
      {
        userId: ana, typeId: typeAvecValidation,
        dateDebut: new Date("2026-03-02T00:00:00.000Z"),
        dateFin: new Date("2026-03-06T00:00:00.000Z"),
      },
      acteur,
    );

    const rendu = await imports.importerConges(
      ENTETE_CNG + "ana@exemple.fr;Congés annuels;2026-03-05;2026-03-11;;\n",
      acteur,
      perimetreGlobal(),
    );

    expect(rendu).toMatchObject({ importes: 0, ignores: 1, erreurs: [] });
    expect(await prisma.leave.count({ where: { userId: ana } })).toBe(1);
  });

  it("RG-CNG-14, RG-CNG-33 — un congé importé est DIRECTEMENT APPROUVÉ, l'importateur validateur", async () => {
    // Un import est par nature « pour autrui » : ce qu'on importe est un état
    // constaté, pas une intention. Deux cents demandes en attente noieraient
    // le validateur et ne diraient rien de plus.
    await imports.importerConges(
      ENTETE_CNG + "ana@exemple.fr;Congés annuels;2026-03-02;2026-03-06;;\n",
      acteur,
      perimetreGlobal(),
    );

    const conge = await prisma.leave.findFirstOrThrow({ where: { userId: ana } });
    expect(conge.statut).toBe("approved");
    expect(conge.validateurId).toBe(acteur);
    expect(conge.decideLe).not.toBeNull();
  });

  it("RG-CNG-09, RG-CNG-33 — la ligne qui désigne L'IMPORTATEUR LUI-MÊME n'est pas auto-approuvée", async () => {
    /*
     * L'exception volontaire à la décision ci-dessus. Approuver cette
     * ligne-là ferait de l'import un contournement de `RG-CNG-09`, qui
     * interdit d'approuver sa propre demande sans permission explicite : une
     * route d'import ne doit pas offrir ce qu'une route de validation refuse.
     */
    const moi = await prisma.user.findUniqueOrThrow({ where: { id: acteur } });
    await prisma.leaveBalance.create({
      data: { userId: acteur, typeId: typeAvecValidation, annee: 2026, joursAttribues: 25 },
    });

    const rendu = await imports.importerConges(
      ENTETE_CNG + `${moi.email};Congés annuels;2026-03-02;2026-03-06;;\n`,
      acteur,
      perimetreGlobal(),
    );

    expect(rendu).toMatchObject({ importes: 1, erreurs: [] });
    expect(
      (await prisma.leave.findFirstOrThrow({ where: { userId: acteur } })).statut,
    ).toBe("pending");
  });

  it("RG-CNG-21 — au-delà du disponible, la ligne part en ERREUR AVEC LES CHIFFRES", async () => {
    // Le solde est CONTRÔLÉ, pas contourné : `RG-CNG-32` n'énumère que deux
    // cas d'ignoré, et écrire au-delà du droit produirait un référentiel de
    // soldes que rien, ensuite, ne signale.
    await prisma.leaveBalance.updateMany({
      where: { userId: ana, typeId: typeAvecValidation, annee: 2026 },
      data: { joursAttribues: 2 },
    });

    const rendu = await imports.importerConges(
      ENTETE_CNG +
        "ana@exemple.fr;Congés annuels;2026-03-02;2026-03-06;;\n" +
        "bob@exemple.fr;Congés annuels;2026-03-02;2026-03-06;;\n",
      acteur,
      perimetreGlobal(),
    );

    // Une ligne refusée n'empêche pas les autres d'entrer.
    expect(rendu.importes).toBe(1);
    expect(rendu.ignores).toBe(0);
    expect(rendu.erreurs).toHaveLength(1);
    expect(rendu.erreurs[0]?.ligne).toBe(2);
    // « Solde insuffisant » sans chiffres oblige à aller les chercher ailleurs.
    expect(rendu.erreurs[0]?.message).toContain("2026");
    expect(rendu.erreurs[0]?.message).toContain("5 jour(s)");
    expect(rendu.erreurs[0]?.message).toContain("2 disponible(s)");
    expect(rendu.erreurs[0]?.message).toContain("3 manquant(s)");
    expect(await prisma.leave.count({ where: { userId: ana } })).toBe(0);
  });

  it("RG-CNG-28 — une date de fin antérieure au début est une ERREUR, pas un ignoré", async () => {
    const rendu = await imports.importerConges(
      ENTETE_CNG + "ana@exemple.fr;Congés annuels;2026-03-06;2026-03-02;;\n",
      acteur,
      perimetreGlobal(),
    );

    expect(rendu.importes).toBe(0);
    // Fondre une incohérence de dates dans « ignoré » la rendrait invisible :
    // l'agent croirait à un doublon et ne corrigerait jamais sa ligne.
    expect(rendu.ignores).toBe(0);
    expect(rendu.erreurs).toEqual([
      { ligne: 2, message: expect.stringContaining("précède la date de début") },
    ]);
    expect(await prisma.leave.count()).toBe(0);
  });

  it("EX-CNG-14 — un agent inconnu part en erreur, avec le numéro de ligne du fichier", async () => {
    const rendu = await imports.importerConges(
      ENTETE_CNG +
        "ana@exemple.fr;Congés annuels;2026-03-02;2026-03-06;;\n" +
        "fantome@exemple.fr;Congés annuels;2026-03-02;2026-03-06;;\n",
      acteur,
      perimetreGlobal(),
    );

    expect(rendu.importes).toBe(1);
    expect(rendu.erreurs).toHaveLength(1);
    expect(rendu.erreurs[0]?.ligne).toBe(3);
    expect(rendu.erreurs[0]?.message).toContain("fantome@exemple.fr");
  });

  it("EX-CNG-14 — un type de congé inconnu part en erreur, et le nomme", async () => {
    const rendu = await imports.importerConges(
      ENTETE_CNG + "ana@exemple.fr;Congé sabbatique;2026-03-02;2026-03-06;;\n",
      acteur,
      perimetreGlobal(),
    );

    expect(rendu).toMatchObject({ importes: 0, ignores: 0 });
    expect(rendu.erreurs[0]?.message).toContain("Congé sabbatique");
  });

  it("EX-CNG-14 — le CODE du type est accepté quand le nom ne l'est pas", async () => {
    // Un fichier venu d'un autre outil RH porte « CA » plus souvent que
    // « Congés annuels ».
    const rendu = await imports.importerConges(
      ENTETE_CNG + "ana@exemple.fr;CA;2026-03-02;2026-03-06;;\n",
      acteur,
      perimetreGlobal(),
    );
    expect(rendu).toMatchObject({ importes: 1, erreurs: [] });
  });

  it("RG-CNG-29 — un type désactivé est refusé à l'import comme au dépôt", async () => {
    await prisma.leaveType.update({
      where: { id: typeAvecValidation },
      data: { actif: false },
    });

    const rendu = await imports.importerConges(
      ENTETE_CNG + "ana@exemple.fr;Congés annuels;2026-03-02;2026-03-06;;\n",
      acteur,
      perimetreGlobal(),
    );

    expect(rendu.importes).toBe(0);
    expect(rendu.erreurs[0]?.message).toContain("désactivé");
  });

  it("RG-SCOPE-01 — UN AGENT HORS PÉRIMÈTRE EST REFUSÉ, permission d'importer comprise", async () => {
    /*
     * Permission PUIS périmètre. La garde a laissé passer `leaves:import` ;
     * sans ce refus ligne à ligne, cette permission deviendrait une écriture
     * globale déguisée — un manager de service pourrait poser des congés sur
     * toute l'instance avec un fichier de deux colonnes.
     */
    const rendu = await imports.importerConges(
      ENTETE_CNG +
        "ana@exemple.fr;Congés annuels;2026-03-02;2026-03-06;;\n" +
        "bob@exemple.fr;Congés annuels;2026-03-02;2026-03-06;;\n",
      acteur,
      perimetreDe([ana]),
    );

    expect(rendu.importes).toBe(1);
    expect(rendu.erreurs).toHaveLength(1);
    expect(rendu.erreurs[0]?.message).toContain("hors de votre périmètre");
    expect(await prisma.leave.count({ where: { userId: bob } })).toBe(0);
  });

  it("RG-CNG-15 — un compte désactivé ne reçoit pas de congé importé", async () => {
    await prisma.user.update({ where: { id: bob }, data: { actif: false } });

    const rendu = await imports.importerConges(
      ENTETE_CNG + "bob@exemple.fr;Congés annuels;2026-03-02;2026-03-06;;\n",
      acteur,
      perimetreGlobal(),
    );

    expect(rendu.importes).toBe(0);
    expect(rendu.erreurs[0]?.message).toContain("désactivé");
    expect(await prisma.leave.count({ where: { userId: bob } })).toBe(0);
  });

  it("RG-CNG-17, RG-CNG-18 — la demi-journée compte pour 0,5 sur un congé d'un seul jour", async () => {
    const rendu = await imports.importerConges(
      ENTETE_CNG + "ana@exemple.fr;Congés annuels;2026-03-02;2026-03-02;morning;\n",
      acteur,
      perimetreGlobal(),
    );

    expect(rendu).toMatchObject({ importes: 1, erreurs: [] });
    const conge = await prisma.leave.findFirstOrThrow({ where: { userId: ana } });
    expect(Number(conge.joursOuvres)).toBe(0.5);
    expect(conge.demiJourneeDebut).toBe("morning");
  });

  it("RG-CNG-18 — une demi-journée sur PLUSIEURS jours est refusée, et l'explique", async () => {
    const rendu = await imports.importerConges(
      ENTETE_CNG + "ana@exemple.fr;Congés annuels;2026-03-02;2026-03-06;Matin;\n",
      acteur,
      perimetreGlobal(),
    );

    expect(rendu.importes).toBe(0);
    // Le message dit QUOI FAIRE, pas seulement ce qui a échoué (`RG-GEN-03`).
    expect(rendu.erreurs[0]?.message).toContain("une seule journée");
    expect(await prisma.leave.count()).toBe(0);
  });

  it("RG-CNG-19 — un congé à cheval sur deux années est réparti par année", async () => {
    await prisma.leaveBalance.create({
      data: { userId: ana, typeId: typeAvecValidation, annee: 2027, joursAttribues: 25 },
    });

    await imports.importerConges(
      ENTETE_CNG + "ana@exemple.fr;Congés annuels;2026-12-28;2027-01-05;;\n",
      acteur,
      perimetreGlobal(),
    );

    const parts = await prisma.leaveYearAllocation.findMany({ orderBy: { annee: "asc" } });
    expect(parts.map((p) => p.annee)).toEqual([2026, 2027]);
  });

  it("RG-IMP-04 — une cellule obligatoire vide est une erreur, et n'interrompt pas le fichier", async () => {
    const rendu = await imports.importerConges(
      ENTETE_CNG +
        "ana@exemple.fr;Congés annuels;2026-03-02;2026-03-06;;\n" +
        ";Congés annuels;2026-03-02;2026-03-06;;\n" +
        "bob@exemple.fr;Congés annuels;2026-03-02;2026-03-06;;\n",
      acteur,
      perimetreGlobal(),
    );

    expect(rendu.importes).toBe(2);
    expect(rendu.erreurs).toEqual([{ ligne: 3, message: "colonne « userEmail » vide" }]);
  });

  it("RG-IMP-03 — l'aperçu des congés N'ÉCRIT RIEN", async () => {
    const fichier = ENTETE_CNG + "ana@exemple.fr;Congés annuels;2026-03-02;2026-03-06;;\n";
    expect(imports.analyser("conges", fichier).total).toBe(1);
    expect(await prisma.leave.count()).toBe(0);
  });

  it("M20 — l'import de congés est tracé, avec son bilan", async () => {
    await prisma.auditLog.deleteMany({ where: { entiteId: "import-csv" } });
    await imports.importerConges(
      ENTETE_CNG + "ana@exemple.fr;Congés annuels;2026-03-02;2026-03-06;;\n",
      acteur,
      perimetreGlobal(),
    );

    const trace = await prisma.auditLog.findFirst({
      where: { typeEntite: "Leave", entiteId: "import-csv" },
    });
    expect(trace?.acteurId).toBe(acteur);
    expect(trace?.detail).toMatchObject({ source: "csv", importes: 1, ignores: 0 });
  });
});
