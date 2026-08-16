import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { creerClient, type PrismaClient } from "@trame/db";
import { ImportsService, ErreurImport, detecterSeparateur } from "./imports.service.js";
import { AuditService } from "../commun/audit.service.js";

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
let acteur: string;
let projet: string;

beforeAll(async () => {
  pg = await new PostgreSqlContainer("postgres:18-alpine").start();
  execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    cwd: RACINE_DB,
    env: { ...process.env, DATABASE_URL: pg.getConnectionUri() },
    stdio: "pipe",
  });
  prisma = creerClient(pg.getConnectionUri());
  imports = new ImportsService(prisma as never, new AuditService(prisma as never));

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
