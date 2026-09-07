import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { creerClient, type PrismaClient } from "@rationarium/db";
import { TableauService, ErreurTableau } from "./tableau.service.js";
import { PlanningService } from "../planning/planning.service.js";
import { TempsService } from "../temps/temps.service.js";
import { ActiviteService } from "../activite/activite.service.js";
import { CalendrierService } from "../parametrage/calendrier.service.js";
import { AuditService } from "../commun/audit.service.js";
import { PerimetreService } from "../commun/perimetre.service.js";

/**
 * L-21 — le tableau de bord, sur PostgreSQL réel.
 *
 * Deux familles de risque, et elles n'ont rien à voir l'une avec l'autre :
 *
 * - **Les compteurs.** Une tâche terminée en retard n'est pas « en retard » ;
 *   un pourcentage sur zéro tâche ne vaut pas NaN. Ce sont les deux façons
 *   dont un indicateur ment sans qu'on le voie.
 * - **La confidentialité des to-do.** `RG-DSH-01` les dit strictement privées :
 *   la seule chose à prouver est qu'on ne touche pas celles d'autrui, même en
 *   devinant un identifiant.
 */

const RACINE_DB = path.resolve(import.meta.dirname, "../../../../packages/db");
const utc = (s: string) => new Date(`${s}T00:00:00.000Z`);
const uuid = () => crypto.randomUUID();

/** Le mardi 11 août 2026. La semaine court du lundi 10 au dimanche 16. */
const MOMENT = utc("2026-08-11");

let pg: StartedPostgreSqlContainer;
let prisma: PrismaClient;
let tableau: TableauService;
let perimetres: PerimetreService;
let moi: string;
let autre: string;

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
  const audit = new AuditService(prisma as never);
  perimetres = new PerimetreService(prisma as never);
  const calendrier = new CalendrierService(prisma as never, audit);
  const activite = new ActiviteService(prisma as never, audit, perimetres);
  const planning = new PlanningService(prisma as never, calendrier, audit, activite);
  const temps = new TempsService(prisma as never, audit, perimetres);
  tableau = new TableauService(prisma as never, planning, temps, perimetres);

  moi = await agent();
  autre = await agent();
}, 240_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await pg?.stop();
});

const perimetre = () => perimetres.resoudre(moi, new Set(["users:manage_any"]));
const accueil = async (moment: Date = MOMENT) =>
  tableau.accueil(moi, await perimetre(), new Set(["planning:read"]), moment);

// ════════════════════════════════════════════════════════════════════════════

describe("EX-DSH-02 — les quatre indicateurs", () => {
  beforeEach(async () => {
    await prisma.taskAssignee.deleteMany();
    await prisma.task.deleteMany();
    await prisma.project.deleteMany();
  });

  it("LA VUE RESTE DIGNE QUAND TOUT EST À ZÉRO — pas de NaN, pas de vide", async () => {
    // Le brief le demande pour une direction, dont les compteurs personnels
    // n'ont pas de sens. Un « NaN % complétées » serait le pire accueil
    // possible sur la page la plus consultée du produit.
    const page = await accueil();
    expect(page.indicateurs).toMatchObject({
      projets: { actifs: 0, total: 0 },
      tachesEnCours: { valeur: 0, total: 0 },
      tachesTerminees: { valeur: 0, pourcentage: 0 },
      tachesEnRetard: 0,
    });
  });

  it("chaque indicateur porte son dénominateur", async () => {
    const projet = await prisma.project.create({
      data: {
        nom: `Portail ${uuid().slice(0, 6)}`, statut: "active",
        dateDebut: utc("2026-01-01"), dateFin: utc("2026-12-31"), chefId: moi,
      },
    });
    await prisma.project.create({
      data: {
        nom: `Archivé ${uuid().slice(0, 6)}`, statut: "done",
        dateDebut: utc("2025-01-01"), dateFin: utc("2025-12-31"), chefId: moi,
      },
    });
    await prisma.task.create({
      data: {
        titre: "En cours", statut: "doing", projectId: projet.id,
        assignes: { create: [{ userId: moi }] },
      },
    });
    await prisma.task.create({
      data: {
        titre: "Terminée", statut: "done", projectId: projet.id,
        assignes: { create: [{ userId: moi }] },
      },
    });

    const page = await accueil();
    // « 1 projet actif » ne dit rien ; « 1 sur 2 » situe.
    expect(page.indicateurs.projets).toEqual({ actifs: 1, total: 2 });
    expect(page.indicateurs.tachesEnCours).toEqual({ valeur: 1, total: 2 });
    expect(page.indicateurs.tachesTerminees).toEqual({ valeur: 1, pourcentage: 50 });
  });

  it("RG-DSH-04 — UNE TÂCHE FINIE HIER N'EST PAS EN RETARD, elle est finie", async () => {
    await prisma.task.create({
      data: {
        titre: "Dépassée mais faite", statut: "done", dateFin: utc("2026-08-01"),
        assignes: { create: [{ userId: moi }] },
      },
    });
    await prisma.task.create({
      data: {
        titre: "Dépassée et ouverte", statut: "doing", dateFin: utc("2026-08-01"),
        assignes: { create: [{ userId: moi }] },
      },
    });
    await prisma.task.create({
      data: {
        titre: "À venir", statut: "todo", dateFin: utc("2026-09-01"),
        assignes: { create: [{ userId: moi }] },
      },
    });

    const page = await accueil();
    expect(page.indicateurs.tachesEnRetard).toBe(1);
    // Et le marqueur suit la même règle, tâche par tâche.
    const parTitre = new Map(page.taches.aVenir.map((t) => [t.titre, t]));
    expect(parTitre.get("Dépassée et ouverte")?.enRetard).toBe(true);
    expect(parTitre.get("À venir")?.enRetard).toBe(false);
  });

  /*
   * RG-DSH-04 — une tâche due AUJOURD'HUI n'est pas en retard.
   *
   * Ce cas manquait, et son absence n'était pas un oubli anodin : `MOMENT`
   * vaut minuit, or c'est la seule heure de la journée où l'ancien code
   * (`dateFin < aujourdhui`, instant contre instant) donnait la bonne réponse.
   * La suite était donc verte pendant que l'exploitation, qui appelle avec
   * `new Date()`, marquait en rouge tout le travail du jour dès la première
   * seconde. D'où l'heure de travail explicite ci-dessous : c'est elle qui
   * distingue une comparaison de jours d'une comparaison d'instants.
   */
  it("RG-DSH-04 — UNE TÂCHE DUE AUJOURD'HUI N'EST PAS EN RETARD, à aucune heure", async () => {
    await prisma.task.create({
      data: {
        titre: "Due aujourd'hui", statut: "doing", dateFin: utc("2026-08-11"),
        assignes: { create: [{ userId: moi }] },
      },
    });
    await prisma.task.create({
      data: {
        titre: "Due hier", statut: "doing", dateFin: utc("2026-08-10"),
        assignes: { create: [{ userId: moi }] },
      },
    });

    for (const heure of ["T00:00:00.000Z", "T09:30:00.000Z", "T23:59:59.000Z"]) {
      const page = await accueil(new Date(`2026-08-11${heure}`));
      const parTitre = new Map(page.taches.aVenir.map((t) => [t.titre, t]));

      expect(parTitre.get("Due aujourd'hui")?.enRetard).toBe(false);
      // Elle n'est pas silencieuse pour autant : c'est le dernier jour où
      // elle peut être tenue, et l'écran doit le dire — autrement.
      expect(parTitre.get("Due aujourd'hui")?.pourAujourdhui).toBe(true);

      expect(parTitre.get("Due hier")?.enRetard).toBe(true);
      expect(parTitre.get("Due hier")?.pourAujourdhui).toBe(false);

      // Le compteur compte la même chose que les marqueurs.
      expect(page.indicateurs.tachesEnRetard).toBe(1);
    }
  });

  it("les tâches d'autrui ne comptent pas dans MES indicateurs", async () => {
    await prisma.task.create({
      data: {
        titre: "La sienne", statut: "doing",
        assignes: { create: [{ userId: autre }] },
      },
    });
    const page = await accueil();
    expect(page.indicateurs.tachesEnCours.total).toBe(0);
  });
});

describe("EX-DSH-05, EX-DSH-06 — les tâches, et de quoi agir", () => {
  beforeEach(async () => {
    await prisma.timeEntry.deleteMany();
    await prisma.taskTimeWaiver.deleteMany();
    await prisma.taskAssignee.deleteMany();
    await prisma.task.deleteMany();
  });

  it("RG-TMP-07 — la saisie rapide dit le temps DÉJÀ déclaré, tous contributeurs confondus", async () => {
    const tache = await prisma.task.create({
      data: {
        titre: "Partagée", statut: "doing",
        assignes: { create: [{ userId: moi }, { userId: autre }] },
      },
    });
    await prisma.timeEntry.createMany({
      data: [
        { taskId: tache.id, userId: autre, date: utc("2026-08-10"), heures: 3 },
        { taskId: tache.id, userId: moi, date: utc("2026-08-10"), heures: 1.5 },
      ],
    });

    const page = await accueil();
    // Saisir trois heures de plus parce que le collègue l'avait déjà fait est
    // exactement l'erreur que ce chiffre évite.
    expect(page.taches.aVenir[0]?.heuresDeclarees).toBe(4.5);
  });

  it("EX-DSH-06 — une tâche validée SANS déclaration sort de la liste", async () => {
    const tache = await prisma.task.create({
      data: {
        titre: "Terminée non déclarée", statut: "done",
        assignes: { create: [{ userId: moi }] },
      },
    });

    expect((await accueil()).taches.nonDeclarees.map((t) => t.id)).toContain(tache.id);

    await prisma.taskTimeWaiver.create({ data: { taskId: tache.id, userId: moi } });

    // La règle vit dans M12 : la réécrire ici en aurait oublié la moitié.
    expect((await accueil()).taches.nonDeclarees).toEqual([]);
  });

  it("une tâche terminée n'apparaît pas dans « à venir »", async () => {
    await prisma.task.create({
      data: {
        titre: "Close", statut: "done",
        assignes: { create: [{ userId: moi }] },
      },
    });
    expect((await accueil()).taches.aVenir).toEqual([]);
  });
});

describe("EX-DSH-03 — l'extrait de planning", () => {
  it("porte la semaine COURANTE, du lundi au dimanche", async () => {
    // Le 11 août 2026 est un mardi ; la semaine court du 10 au 16.
    const page = await accueil();
    expect(page.planning.periode).toMatchObject({ debut: "2026-08-10", fin: "2026-08-16" });
    expect(page.planning.periode.jours).toHaveLength(7);
  });

  it("est réduit à SA seule ligne — le tableau de bord est personnel", async () => {
    const page = await accueil();
    const vus = page.planning.groupes.flatMap((g) => g.personnes.map((p) => p.id));
    expect(vus).toEqual([moi]);
  });
});

describe("EX-DSH-07 — mes projets, et où ils en sont", () => {
  beforeEach(async () => {
    await prisma.taskAssignee.deleteMany();
    await prisma.task.deleteMany();
    await prisma.project.deleteMany();
  });

  it("RG-PRJ-07 — la progression est la MOYENNE des avancements, pas le ratio de tâches terminées", async () => {
    // Le piège que cette assertion garde : deux tâches sur trois terminées
    // donnerait 67 % au ratio. La règle dit 97 % — (100 + 100 + 90) / 3 —
    // parce qu'une tâche à 90 % compte pour ce qu'elle vaut. Les deux
    // formules se ressemblent assez pour qu'on ne voie pas la différence
    // sans un jeu qui les sépare.
    const projet = await prisma.project.create({
      data: {
        nom: `Portail ${uuid().slice(0, 6)}`, statut: "active",
        dateDebut: utc("2026-01-01"), dateFin: utc("2026-12-31"), chefId: moi,
      },
    });
    await prisma.task.createMany({
      data: [
        { titre: "A", projectId: projet.id, statut: "done", avancement: 100 },
        { titre: "B", projectId: projet.id, statut: "done", avancement: 100 },
        { titre: "C", projectId: projet.id, statut: "doing", avancement: 90 },
      ],
    });

    const ligne = (await accueil()).projets.find((p) => p.id === projet.id);
    expect(ligne?.progression).toBe(97);
  });

  it("RG-PRJ-07 — un projet SANS TÂCHE est à 0, pas à 100", async () => {
    // Une moyenne vide mal gardée rend `null`, et la jauge de la maquette 06
    // annoncerait un projet terminé le jour de son ouverture.
    const projet = await prisma.project.create({
      data: {
        nom: `Vide ${uuid().slice(0, 6)}`, statut: "active",
        dateDebut: utc("2026-01-01"), dateFin: utc("2026-12-31"), chefId: moi,
      },
    });
    const ligne = (await accueil()).projets.find((p) => p.id === projet.id);
    expect(ligne?.progression).toBe(0);
  });
});

describe("EX-DSH-04 — gérer une liste de to-do personnelles (RG-DSH-01 à RG-DSH-03)", () => {
  beforeEach(async () => {
    await prisma.todo.deleteMany();
    await prisma.setting.deleteMany({ where: { cle: "dashboard.todoLimit" } });
  });

  it("RG-DSH-03 — les complétées sont regroupées à part, avec leur compte", async () => {
    const a = await tableau.ajouterTodo(moi, "Relire la note");
    await tableau.ajouterTodo(moi, "Appeler le prestataire");
    await tableau.modifierTodo(moi, a.id, { fait: true });

    const lues = await tableau.todos(moi);
    expect(lues.actives.map((t) => t.libelle)).toEqual(["Appeler le prestataire"]);
    // Mêlées aux autres elles allongent la liste ; supprimées d'office elles
    // feraient perdre la trace de ce qu'on vient de faire.
    expect(lues.faites.map((t) => t.libelle)).toEqual(["Relire la note"]);
  });

  it("RG-DSH-01 — le plafond est PARAMÉTRÉ, et son atteinte est signalée", async () => {
    await prisma.setting.create({
      data: { cle: "dashboard.todoLimit", valeur: "2", public: true },
    });

    await tableau.ajouterTodo(moi, "Une");
    const apres = await tableau.todos(moi);
    expect(apres.limite).toBe(2);
    expect(apres.limiteAtteinte).toBe(false);

    await tableau.ajouterTodo(moi, "Deux");
    // Le signal précède le refus : découvrir la limite sur un champ qui ne
    // répond plus serait l'apprendre au pire moment.
    expect((await tableau.todos(moi)).limiteAtteinte).toBe(true);

    await expect(tableau.ajouterTodo(moi, "Trois")).rejects.toMatchObject({
      code: "limite_todos",
      detail: { limite: 2 },
    });
  });

  it("le plafond compte AUSSI les complétées — sinon il ne plafonne rien", async () => {
    await prisma.setting.create({
      data: { cle: "dashboard.todoLimit", valeur: "1", public: true },
    });
    const a = await tableau.ajouterTodo(moi, "Faite");
    await tableau.modifierTodo(moi, a.id, { fait: true });

    await expect(tableau.ajouterTodo(moi, "Encore une")).rejects.toBeInstanceOf(ErreurTableau);
  });

  it("LES TO-DO D'AUTRUI SONT INTOUCHABLES, même en devinant l'identifiant", async () => {
    const sienne = await tableau.ajouterTodo(autre, "Secrète");

    // `RG-DSH-01` — « strictement privées ». Le filtre porte sur `id` ET sur
    // `userId` : sans le second, deviner un identifiant suffirait.
    await expect(
      tableau.modifierTodo(moi, sienne.id, { libelle: "Détournée" }),
    ).rejects.toMatchObject({ code: "introuvable" });
    await expect(tableau.supprimerTodo(moi, sienne.id)).rejects.toMatchObject({
      code: "introuvable",
    });

    const intacte = await prisma.todo.findUniqueOrThrow({ where: { id: sienne.id } });
    expect(intacte.libelle).toBe("Secrète");
  });

  it("et elles n'apparaissent pas non plus dans ma liste", async () => {
    await tableau.ajouterTodo(autre, "La sienne");
    await tableau.ajouterTodo(moi, "La mienne");
    const lues = await tableau.todos(moi);
    expect(lues.actives.map((t) => t.libelle)).toEqual(["La mienne"]);
  });

  it("RG-DSH-02 — l'édition ne touche que le champ transmis", async () => {
    const t = await tableau.ajouterTodo(moi, "Libellé d'origine");
    await tableau.modifierTodo(moi, t.id, { fait: true });
    const apres = await prisma.todo.findUniqueOrThrow({ where: { id: t.id } });
    expect(apres.libelle).toBe("Libellé d'origine");
    expect(apres.fait).toBe(true);
  });

  it("une limite mal réglée ne bloque pas tout : le défaut reprend la main", async () => {
    await prisma.setting.create({
      data: { cle: "dashboard.todoLimit", valeur: "zéro", public: true },
    });
    // Un réglage illisible ferait sinon un plafond à NaN, qui refuse tout.
    expect((await tableau.todos(moi)).limite).toBe(20);
    await expect(tableau.ajouterTodo(moi, "Passe")).resolves.toBeDefined();
  });

  /*
   * « Gérer une liste » : les trois verbes, pas seulement les deux qui se
   * voient. La suppression n'avait aucun contrôle — ni le cas nominal, ni le
   * refus sur la to-do d'autrui, qui est pourtant le geste destructeur.
   */
  it("le libellé se corrige EN PLACE, sans repasser par « supprimer puis recréer »", async () => {
    const t = await tableau.ajouterTodo(moi, "Rappeler la DSI");
    const apres = await tableau.modifierTodo(moi, t.id, { libelle: "Rappeler la DGS" });
    expect(apres.id).toBe(t.id);
    expect(apres.libelle).toBe("Rappeler la DGS");
    expect(apres.fait).toBe(false);
  });

  it("une to-do SE SUPPRIME, et la place se libère au plafond", async () => {
    await prisma.setting.create({
      data: { cle: "dashboard.todoLimit", valeur: "1", public: true },
    });
    const t = await tableau.ajouterTodo(moi, "Unique");
    await expect(tableau.ajouterTodo(moi, "De trop")).rejects.toMatchObject({
      code: "limite_todos",
    });

    await tableau.supprimerTodo(moi, t.id);

    expect((await tableau.todos(moi)).actives).toEqual([]);
    await expect(tableau.ajouterTodo(moi, "La suivante")).resolves.toBeDefined();
  });

  it("LA SUPPRESSION DE LA TO-DO D'AUTRUI EST REFUSÉE, même en devinant l'identifiant", async () => {
    const sienne = await tableau.ajouterTodo(autre, "La sienne");

    await expect(tableau.supprimerTodo(moi, sienne.id)).rejects.toMatchObject({
      code: "introuvable",
    });
    // « Refusé » doit vouloir dire « rien n'a bougé ».
    expect(await prisma.todo.findUnique({ where: { id: sienne.id } })).not.toBeNull();
  });
});

/**
 * `RG-SCOPE-02` — « mes projets » veut dire la même chose partout.
 *
 * DÉFAUT TROUVÉ EN RECETTE. Le tableau de bord décrivait « mes projets » par
 * (chef | membre) là où `filtreMesProjets` — la définition unique du produit —
 * dit (créateur | chef | sponsor | membre). Le portefeuille annonçait « 2
 * projets », l'accueil « 1 sur 1 ». Chaque lecture avait ses tests, tous verts,
 * et elles se contredisaient : quand deux fonctions lisent la même table, le
 * contrôle qui compte est celui qui les compare.
 */
describe("RG-SCOPE-02 — le tableau de bord compte les projets comme le portefeuille", () => {
  beforeEach(async () => {
    await prisma.taskAssignee.deleteMany();
    await prisma.task.deleteMany();
    await prisma.project.deleteMany();
  });

  it("un projet dont je suis SPONSOR est un de mes projets", async () => {
    await prisma.project.create({
      data: {
        nom: `Sponsorisé ${uuid().slice(0, 6)}`, statut: "active",
        dateDebut: utc("2026-01-01"), dateFin: utc("2026-12-31"), sponsorId: moi,
      },
    });

    const r = await accueil();
    expect(r.indicateurs.projets).toEqual({ actifs: 1, total: 1 });
    expect(r.projets).toHaveLength(1);
  });

  it("un projet que j'ai CRÉÉ sans en être chef en est un aussi", async () => {
    await prisma.project.create({
      data: {
        nom: `Créé ${uuid().slice(0, 6)}`, statut: "active",
        dateDebut: utc("2026-01-01"), dateFin: utc("2026-12-31"), createurId: moi,
      },
    });

    const r = await accueil();
    expect(r.indicateurs.projets.total).toBe(1);
    expect(r.projets).toHaveLength(1);
  });

  it("le compte de l'accueil est EXACTEMENT celui du prédicat partagé", async () => {
    // Le contrôle qui compare les deux lectures, plutôt que d'en décrire une.
    await prisma.project.create({
      data: {
        nom: `A ${uuid().slice(0, 6)}`, statut: "active",
        dateDebut: utc("2026-01-01"), dateFin: utc("2026-12-31"), chefId: moi,
      },
    });
    await prisma.project.create({
      data: {
        nom: `B ${uuid().slice(0, 6)}`, statut: "active",
        dateDebut: utc("2026-01-01"), dateFin: utc("2026-12-31"), sponsorId: moi,
      },
    });
    await prisma.project.create({
      data: {
        nom: `C ${uuid().slice(0, 6)}`, statut: "active",
        dateDebut: utc("2026-01-01"), dateFin: utc("2026-12-31"), chefId: autre,
      },
    });

    const attendu = await prisma.project.count({ where: perimetres.filtreMesProjets(moi) });
    const r = await accueil();
    expect(attendu).toBe(2);
    expect(r.indicateurs.projets.total).toBe(attendu);
  });
});

/**
 * `RG-TMP-07`, `EX-TMP-06` — « aucune heure déclarée » est une AFFIRMATION.
 *
 * DÉFAUT TROUVÉ EN RECETTE (P-35) : la charge utile ne transportait aucun
 * nombre d'heures, et le client rendait la mention sans condition. Trois heures
 * déclarées par un autre contributeur, et la ligne affirmait quand même le
 * contraire — en poussant à ressaisir ce qui était déjà saisi.
 */
describe("RG-TMP-07 — la tâche non déclarée dit ce qui a DÉJÀ été déclaré", () => {
  beforeEach(async () => {
    await prisma.timeEntry.deleteMany();
    await prisma.taskAssignee.deleteMany();
    await prisma.task.deleteMany();
  });

  it("porte les heures des AUTRES contributeurs, pas seulement les miennes", async () => {
    const tache = await prisma.task.create({
      data: {
        titre: "Rédiger le marché", statut: "done", dateFin: utc("2026-08-05"),
        assignes: { create: [{ userId: moi }] },
      },
    });
    await prisma.timeEntry.create({
      data: { userId: autre, taskId: tache.id, date: utc("2026-08-04"), heures: 3 },
    });

    const r = await accueil();
    const ligne = r.taches.nonDeclarees.find((t) => t.id === tache.id);
    // Elle reste « non déclarée » — je n'ai rien saisi, moi — mais elle ne
    // peut plus prétendre que personne ne l'a fait.
    expect(ligne).toBeDefined();
    expect(ligne?.heuresDeclarees).toBe(3);
  });

  it("zéro veut dire zéro, et le dit", async () => {
    const tache = await prisma.task.create({
      data: {
        titre: "Classer les offres", statut: "done", dateFin: utc("2026-08-05"),
        assignes: { create: [{ userId: moi }] },
      },
    });

    const r = await accueil();
    expect(r.taches.nonDeclarees.find((t) => t.id === tache.id)?.heuresDeclarees).toBe(0);
  });

  it("l'onglet voisin « À venir » et celui-ci comptent la même chose", async () => {
    // Deux moitiés de la même règle : elles divergeaient, et c'est la
    // comparaison qui le voit — aucune des deux prise seule.
    const encours = await prisma.task.create({
      data: {
        titre: "Instruire", statut: "doing", dateFin: utc("2026-08-20"),
        assignes: { create: [{ userId: moi }] },
      },
    });
    await prisma.timeEntry.create({
      data: { userId: autre, taskId: encours.id, date: utc("2026-08-04"), heures: 2.5 },
    });
    const finie = await prisma.task.create({
      data: {
        titre: "Instruire (fin)", statut: "done", dateFin: utc("2026-08-05"),
        assignes: { create: [{ userId: moi }] },
      },
    });
    await prisma.timeEntry.create({
      data: { userId: autre, taskId: finie.id, date: utc("2026-08-04"), heures: 2.5 },
    });

    const r = await accueil();
    expect(r.taches.aVenir.find((t) => t.id === encours.id)?.heuresDeclarees).toBe(2.5);
    expect(r.taches.nonDeclarees.find((t) => t.id === finie.id)?.heuresDeclarees).toBe(2.5);
  });
});
