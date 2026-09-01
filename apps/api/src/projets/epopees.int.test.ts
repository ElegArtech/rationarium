import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { creerClient, type PrismaClient } from "@rationarium/db";
import { ProjetsService } from "./projets.service.js";
import { TachesService } from "../taches/taches.service.js";
import { AuditService } from "../commun/audit.service.js";
import { PerimetreService } from "../commun/perimetre.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { FileService } from "../notifications/file.service.js";

/**
 * `EX-JAL-07` — « Créer, modifier, supprimer une épopée » — et `EX-JAL-01` pour
 * la moitié qui manquait au jalon : **modifier**.
 *
 * **Ce que l'audit a trouvé.** L'épopée existait en base (`model Epic`, avec sa
 * contrainte d'unicité et sa colonne `version`), au catalogue de permissions
 * (`epics` avec le CRUD complet), dans quatre modèles de rôles, et dans le
 * schéma de création d'une tâche (`epicId`). Elle n'avait **aucun service et
 * aucune route** : rien ne pouvait en créer une, donc `epicId` ne pouvait
 * jamais valoir autre chose que `null`, et le compteur « 3 épopées » de la vue
 * 11 affichait un zéro perpétuel.
 *
 * Deux défauts se sont découverts en le portant, tous deux masqués par le
 * premier :
 *
 * 1. `RG-JAL-03` dit « un jalon **ou une épopée** du même projet » et seule la
 *    moitié « jalon » était contrôlée. Le trou s'ouvrait à la minute où la
 *    première épopée existerait.
 * 2. Ni le jalon ni l'épopée d'une tâche ne se changeaient **après coup** :
 *    `modifier` ne les acceptait pas. La feuille de route montrait un bloc
 *    « sans jalon » que rien ne permettait de vider.
 */

const RACINE_DB = path.resolve(import.meta.dirname, "../../../../packages/db");
const utc = (s: string) => new Date(`${s}T00:00:00.000Z`);
const uuid = () => crypto.randomUUID();

let pg: StartedPostgreSqlContainer;
let prisma: PrismaClient;
let projets: ProjetsService;
let taches: TachesService;
let perimetres: PerimetreService;

/*
 * `RG-TSK-02` et `RG-TSK-03` — la création d'une tâche exige désormais les
 * droits de l'acteur : deux droits distincts selon qu'elle a un projet ou non,
 * et l'appartenance au projet. Ces suites-ci n'éprouvent aucune des deux ; on
 * leur passe des droits sans réserve, dont `tasks:manage_any` qui lève
 * l'appartenance. Les deux règles ont leurs propres suites dans `src/taches`.
 */
const DROITS_TACHE = new Set([
  "tasks:create",
  "tasks:create_standalone",
  "tasks:manage_any",
]) as ReadonlySet<string>;
let acteur: string;

/* Cette suite éprouve les épopées, pas le cloisonnement du projet qui les
 * porte : elle passe donc un périmètre de gestion globale. */
const global = () => perimetres.resoudre(acteur, new Set(["projects:manage_any"]));
const toutes: ReadonlySet<string> = new Set(["projects:manage_any"]);

async function projet() {
  const p = await projets.creer(
    { nom: `Projet ${uuid().slice(0, 8)}`, dateDebut: utc("2026-01-01"), dateFin: utc("2026-12-31") },
    acteur,
    // `RG-SCOPE-02` — la création gouverne `chefId`/`sponsorId` comme la
    // modification. Ce projet n'en pose aucun ; l'ensemble reste vide.
    new Set<string>(),
  );
  return p.id;
}

const nouvelleTache = (projectId: string | null, o: Record<string, unknown> = {}) => ({
  titre: `T ${uuid().slice(0, 8)}`,
  projectId,
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
  const audit = new AuditService(prisma as never);
  perimetres = new PerimetreService(prisma as never);
  const notifications = new NotificationsService(prisma as never, new FileService());
  projets = new ProjetsService(prisma as never, audit, perimetres, notifications);
  taches = new TachesService(prisma as never, audit, perimetres, notifications);

  acteur = uuid();
  await prisma.user.create({
    data: {
      id: acteur, login: "a-epo", email: "a-epo@x.fr",
      motDePasseHash: "x", prenom: "A", nom: "T",
    },
  });
}, 180_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await pg?.stop();
});

describe("EX-JAL-07 — créer, modifier, supprimer une épopée", () => {
  it("EX-JAL-07 — crée une épopée et la relit avec son décompte de tâches", async () => {
    const p = await projet();
    const e = await projets.creerEpopee(
      { nom: "Socle technique", description: "Les fondations", projectId: p },
      acteur,
    );
    expect(e.projectId).toBe(p);

    const liste = await projets.epopees(p, await global(), toutes);
    expect(liste).toHaveLength(1);
    expect(liste[0]).toMatchObject({ id: e.id, nom: "Socle technique", taches: 0 });
  });

  it("EX-JAL-07 — le décompte de tâches est CELUI de l'épopée, pas celui du projet", async () => {
    /*
     * Sans cette assertion, un `_count` posé sur la mauvaise relation rendrait
     * le même nombre partout et personne ne le verrait : c'est exactement le
     * genre de champ qu'on lit sans jamais le contredire.
     */
    const p = await projet();
    const a = await projets.creerEpopee({ nom: "A", projectId: p }, acteur);
    await projets.creerEpopee({ nom: "B", projectId: p }, acteur);
    await taches.creer(nouvelleTache(p, { epicId: a.id }), acteur, DROITS_TACHE);
    await taches.creer(nouvelleTache(p, { epicId: a.id }), acteur, DROITS_TACHE);
    await taches.creer(nouvelleTache(p), acteur, DROITS_TACHE);

    const liste = await projets.epopees(p, await global(), toutes);
    expect(liste.find((e) => e.nom === "A")?.taches).toBe(2);
    expect(liste.find((e) => e.nom === "B")?.taches).toBe(0);
  });

  it("EX-JAL-07 — REFUSE deux épopées homonymes dans le même projet", async () => {
    const p = await projet();
    await projets.creerEpopee({ nom: "Migration", projectId: p }, acteur);
    await expect(
      projets.creerEpopee({ nom: "Migration", projectId: p }, acteur),
    ).rejects.toMatchObject({ code: "epopee_en_double", detail: { nom: "Migration" } });
  });

  it("EX-JAL-07 — le même nom dans DEUX projets est licite", async () => {
    const a = await projet();
    const b = await projet();
    await projets.creerEpopee({ nom: "Migration", projectId: a }, acteur);
    await expect(
      projets.creerEpopee({ nom: "Migration", projectId: b }, acteur),
    ).resolves.toMatchObject({ nom: "Migration" });
  });

  it("EX-JAL-07 — modifie une épopée", async () => {
    const p = await projet();
    const e = await projets.creerEpopee({ nom: "Avant", projectId: p }, acteur);
    const modifiee = await projets.modifierEpopee(
      e.id,
      { nom: "Après", description: "Reformulée", version: e.version },
      acteur,
    );
    expect(modifiee.nom).toBe("Après");
    expect(modifiee.description).toBe("Reformulée");
    expect(modifiee.version).toBe(e.version + 1);
  });

  it("RG-GEN-07 — une modification d'épopée sur une version périmée est REFUSÉE", async () => {
    const p = await projet();
    const e = await projets.creerEpopee({ nom: "Concurrente", projectId: p }, acteur);
    await projets.modifierEpopee(e.id, { nom: "Premier", version: e.version }, acteur);
    await expect(
      projets.modifierEpopee(e.id, { nom: "Second", version: e.version }, acteur),
    ).rejects.toMatchObject({ code: "conflit_de_version" });

    // Et le premier écrit tient : le refus n'a rien écrasé.
    const apres = await prisma.epic.findUniqueOrThrow({ where: { id: e.id } });
    expect(apres.nom).toBe("Premier");
  });

  it("EX-JAL-07 — REFUSE de renommer une épopée sur le nom d'une autre du projet", async () => {
    const p = await projet();
    await projets.creerEpopee({ nom: "Prise", projectId: p }, acteur);
    const b = await projets.creerEpopee({ nom: "Libre", projectId: p }, acteur);
    await expect(
      projets.modifierEpopee(b.id, { nom: "Prise", version: b.version }, acteur),
    ).rejects.toMatchObject({ code: "epopee_en_double" });
  });

  it("EX-JAL-07 — supprimer une épopée DÉTACHE ses tâches sans les supprimer", async () => {
    const p = await projet();
    const e = await projets.creerEpopee({ nom: "À supprimer", projectId: p }, acteur);
    const t = await taches.creer(nouvelleTache(p, { epicId: e.id }), acteur, DROITS_TACHE);

    const { tachesDetachees } = await projets.supprimerEpopee(e.id, acteur);
    expect(tachesDetachees).toBe(1);

    const restee = await prisma.task.findUnique({ where: { id: t.id } });
    expect(restee).not.toBeNull();
    expect(restee?.epicId).toBeNull();
  });

  it("EX-JAL-07 — la suppression est tracée avec le nombre de tâches détachées", async () => {
    const p = await projet();
    const e = await projets.creerEpopee({ nom: "Tracée", projectId: p }, acteur);
    await taches.creer(nouvelleTache(p, { epicId: e.id }), acteur, DROITS_TACHE);
    await projets.supprimerEpopee(e.id, acteur);

    const trace = await prisma.auditLog.findFirst({
      where: { action: "epic.delete", entiteId: e.id },
    });
    expect((trace?.detail as { tachesDetachees?: number } | null)?.tachesDetachees).toBe(1);
  });

  it("EX-JAL-07 — REFUSE de créer une épopée dans un projet annulé", async () => {
    const p = await projet();
    await projets.annuler(p, acteur);
    await expect(
      projets.creerEpopee({ nom: "Trop tard", projectId: p }, acteur),
    ).rejects.toMatchObject({ code: "projet_annule" });
  });
});

describe("RG-JAL-03 / RG-JAL-04 — le rattachement d'une tâche", () => {
  it("RG-JAL-03 — REFUSE une tâche rattachée à une épopée d'un AUTRE projet", async () => {
    /*
     * La règle nomme « un jalon **ou une épopée** du même projet ». Seule la
     * moitié « jalon » était contrôlée, et rien ne le montrait parce qu'aucune
     * épopée ne pouvait exister.
     */
    const a = await projet();
    const b = await projet();
    const chezB = await projets.creerEpopee({ nom: "Chez B", projectId: b }, acteur);

    await expect(
      taches.creer(nouvelleTache(a, { epicId: chezB.id }), acteur, DROITS_TACHE),
    ).rejects.toMatchObject({ code: "jalon_autre_projet" });
  });

  it("RG-JAL-04 — REFUSE une tâche HORS PROJET rattachée à une épopée", async () => {
    const p = await projet();
    const e = await projets.creerEpopee({ nom: "Orpheline", projectId: p }, acteur);
    await expect(
      taches.creer(nouvelleTache(null, { epicId: e.id }), acteur, DROITS_TACHE),
    ).rejects.toMatchObject({ code: "hors_projet_avec_jalon" });
  });

  it("RG-JAL-03 — rattache une tâche à une épopée APRÈS COUP", async () => {
    /*
     * `modifier` n'acceptait ni `milestoneId` ni `epicId` : le rattachement se
     * décidait à la création et jamais ensuite. La feuille de route montrait
     * un bloc « sans jalon » que rien ne permettait de vider.
     */
    const p = await projet();
    const e = await projets.creerEpopee({ nom: "Après coup", projectId: p }, acteur);
    const t = await taches.creer(nouvelleTache(p), acteur, DROITS_TACHE);
    expect(t.epicId).toBeNull();

    const apres = await taches.modifier(t.id, { epicId: e.id, version: t.version }, acteur, DROITS_TACHE);
    expect(apres.epicId).toBe(e.id);
  });

  it("RG-JAL-03 — rattache une tâche à un JALON après coup, et l'en détache", async () => {
    const p = await projet();
    const j = await projets.creerJalon({ nom: "V1", projectId: p }, acteur);
    const t = await taches.creer(nouvelleTache(p), acteur, DROITS_TACHE);

    const rattachee = await taches.modifier(
      t.id,
      { milestoneId: j.id, version: t.version },
      acteur, DROITS_TACHE
    );
    expect(rattachee.milestoneId).toBe(j.id);

    const detachee = await taches.modifier(
      t.id,
      { milestoneId: null, version: rattachee.version },
      acteur, DROITS_TACHE
    );
    expect(detachee.milestoneId).toBeNull();
  });

  it("RG-JAL-03 — REFUSE de rattacher APRÈS COUP à un jalon d'un autre projet", async () => {
    const a = await projet();
    const b = await projet();
    const chezB = await projets.creerJalon({ nom: "Chez B", projectId: b }, acteur);
    const t = await taches.creer(nouvelleTache(a), acteur, DROITS_TACHE);

    await expect(
      taches.modifier(t.id, { milestoneId: chezB.id, version: t.version }, acteur, DROITS_TACHE),
    ).rejects.toMatchObject({ code: "jalon_autre_projet" });
  });

  it("RG-JAL-04 — REFUSE de rattacher APRÈS COUP une tâche hors projet", async () => {
    const p = await projet();
    const e = await projets.creerEpopee({ nom: "Cible", projectId: p }, acteur);
    const t = await taches.creer(nouvelleTache(null), acteur, DROITS_TACHE);

    await expect(
      taches.modifier(t.id, { epicId: e.id, version: t.version }, acteur, DROITS_TACHE),
    ).rejects.toMatchObject({ code: "hors_projet_avec_jalon" });
  });
});

describe("EX-JAL-01 — modifier un jalon", () => {
  it("EX-JAL-01 — modifie le nom, la description et l'échéance d'un jalon", async () => {
    const p = await projet();
    const j = await projets.creerJalon(
      { nom: "Avant", dateEcheance: utc("2026-06-30"), projectId: p },
      acteur,
    );
    const modifie = await projets.modifierJalon(
      j.id,
      { nom: "Après", description: "Repoussé", dateEcheance: utc("2026-09-30"), version: j.version },
      acteur,
    );
    expect(modifie.nom).toBe("Après");
    expect(modifie.description).toBe("Repoussé");
    expect(modifie.dateEcheance?.toISOString()).toBe("2026-09-30T00:00:00.000Z");
  });

  it("EX-JAL-01 — retirer l'échéance d'un jalon est licite : elle est facultative", async () => {
    const p = await projet();
    const j = await projets.creerJalon(
      { nom: "Sans date", dateEcheance: utc("2026-06-30"), projectId: p },
      acteur,
    );
    const modifie = await projets.modifierJalon(
      j.id,
      { dateEcheance: null, version: j.version },
      acteur,
    );
    expect(modifie.dateEcheance).toBeNull();
  });

  it("RG-GEN-07 — une modification de jalon sur une version périmée est REFUSÉE", async () => {
    const p = await projet();
    const j = await projets.creerJalon({ nom: "Concurrent", projectId: p }, acteur);
    await projets.modifierJalon(j.id, { nom: "Premier", version: j.version }, acteur);
    await expect(
      projets.modifierJalon(j.id, { nom: "Second", version: j.version }, acteur),
    ).rejects.toMatchObject({ code: "conflit_de_version" });
  });

  it("RG-JAL-02 — modifier un jalon ne change JAMAIS son projet", async () => {
    const p = await projet();
    const j = await projets.creerJalon({ nom: "Ancré", projectId: p }, acteur);
    const modifie = await projets.modifierJalon(j.id, { nom: "Ancré II", version: j.version }, acteur);
    expect(modifie.projectId).toBe(p);
  });
});

describe("EX-JAL-02, RG-JAL-06 — marquer un jalon SANS TÂCHE comme atteint", () => {
  /*
   * **L'arbitrage du 2026-08-31.** `EX-JAL-02` — « marquer un jalon comme
   * atteint » — et `RG-JAL-01` — « le statut est calculé, il n'est pas
   * saisi » — se contredisaient depuis l'origine. Le produit avait tranché
   * pour le calcul, et le geste n'existait nulle part.
   *
   * Un jalon SANS TÂCHE est le cas que le calcul ne sait pas trancher : il
   * restait « en attente » pour toujours, échéance tenue comprise. C'est cette
   * borne-là, et elle seule, qui ouvre la saisie. La règle du calcul n'est pas
   * assouplie, elle est complétée là où elle n'a rien à dire.
   */
  it("EX-JAL-02 — un jalon sans tâche se marque atteint, et se rouvre", async () => {
    const p = await projet();
    const j = await projets.creerJalon({ nom: "Comité de lancement", projectId: p }, acteur);
    expect(await projets.statutJalon(j.id)).toBe("pending");

    const marque = await projets.marquerJalon(j.id, true, j.version, acteur);
    expect(await projets.statutJalon(j.id)).toBe("done");

    await projets.marquerJalon(j.id, false, marque.version, acteur);
    expect(await projets.statutJalon(j.id)).toBe("pending");
  });

  it("RG-JAL-01 — un jalon QUI PORTE DES TÂCHES refuse d'être marqué, et dit pourquoi", async () => {
    const p = await projet();
    const j = await projets.creerJalon({ nom: "Recette", projectId: p }, acteur);
    const t = await taches.creer(nouvelleTache(p, { milestoneId: j.id }), acteur, DROITS_TACHE);
    expect(t.milestoneId).toBe(j.id);

    const relu = await prisma.milestone.findUniqueOrThrow({ where: { id: j.id } });
    await expect(projets.marquerJalon(j.id, true, relu.version, acteur)).rejects.toMatchObject({
      code: "jalon_calcule",
    });
  });

  it("RG-JAL-06 — rattacher une tâche EFFACE la marque, elle ne dort pas dessous", async () => {
    /*
     * Le cas qui décide de la conception. Conservée en sommeil sous le calcul,
     * la marque reparaîtrait au premier détachement : le jalon redeviendrait
     * « atteint » sans que personne n'ait rien fait.
     */
    const p = await projet();
    const j = await projets.creerJalon({ nom: "Jalon marqué", projectId: p }, acteur);
    await projets.marquerJalon(j.id, true, j.version, acteur);
    expect(await projets.statutJalon(j.id)).toBe("done");

    // Une tâche arrive : le calcul reprend, et le jalon repart « en attente ».
    const t = await taches.creer(nouvelleTache(p, { milestoneId: j.id }), acteur, DROITS_TACHE);
    expect(await projets.statutJalon(j.id)).toBe("pending");

    // Puis elle repart : le jalon ne doit PAS redevenir « atteint ».
    await taches.modifier(t.id, { milestoneId: null, version: t.version }, acteur, DROITS_TACHE);
    expect(await projets.statutJalon(j.id)).toBe("pending");
  });

  it("RG-JAL-06 — le rattachement APRÈS COUP efface la marque, lui aussi", async () => {
    const p = await projet();
    const j = await projets.creerJalon({ nom: "Marqué puis peuplé", projectId: p }, acteur);
    await projets.marquerJalon(j.id, true, j.version, acteur);
    const t = await taches.creer(nouvelleTache(p), acteur, DROITS_TACHE);

    await taches.modifier(t.id, { milestoneId: j.id, version: t.version }, acteur, DROITS_TACHE);
    expect(await projets.statutJalon(j.id)).toBe("pending");
  });

  it("RG-JAL-01 — la marque ne perturbe JAMAIS un jalon qui porte des tâches", async () => {
    /*
     * La colonne est lue au seul cas où le calcul n'a rien à dire. Un jalon
     * dont la base porterait « done » par accident — un import, une reprise —
     * doit rester gouverné par ses tâches.
     */
    const p = await projet();
    const j = await projets.creerJalon({ nom: "Gouverné", projectId: p }, acteur);
    await taches.creer(nouvelleTache(p, { milestoneId: j.id }), acteur, DROITS_TACHE);
    // On corrompt la colonne à la main, sous le calcul.
    await prisma.milestone.update({ where: { id: j.id }, data: { statut: "done" } });

    expect(await projets.statutJalon(j.id)).toBe("pending");
  });

  it("RG-GEN-07 — marquer sur une version périmée est REFUSÉ", async () => {
    const p = await projet();
    const j = await projets.creerJalon({ nom: "Concurrent", projectId: p }, acteur);
    await projets.marquerJalon(j.id, true, j.version, acteur);
    await expect(projets.marquerJalon(j.id, false, j.version, acteur)).rejects.toMatchObject({
      code: "conflit_de_version",
    });
  });

  it("EX-JAL-02 — la feuille de route rend le statut MARQUÉ, pas un calcul aveugle", async () => {
    // Le raccord : ce que la vue 13 lit vient bien de la même fonction.
    const p = await projet();
    const j = await projets.creerJalon({ nom: "Vu de la feuille", projectId: p }, acteur);
    await projets.marquerJalon(j.id, true, j.version, acteur);

    const route = await projets.feuilleDeRoute(p, await global(), toutes);
    expect(route.jalons.find((x) => x.id === j.id)?.statut).toBe("done");
    expect(route.indicateurs.termines).toBe(1);
  });
});

describe("EX-TSK-08 — un projet chargé avec son historique n'affiche plus zéro", () => {
  /*
   * Le symptôme qui a ouvert la fiche : un projet dont toutes les tâches sont
   * créées terminées affichait `progression: 0`. `RG-PRJ-07` moyenne
   * l'`avancement` des tâches, et la création ne l'écrivait pas — le champ
   * était déclaré au contrat, retiré en silence par le schéma de la route.
   *
   * Les deux calculs sont justes ; c'étaient leurs entrées qui manquaient.
   */
  it("RG-PRJ-07 — trois tâches créées à 100 rendent une progression de 100", async () => {
    const p = await projet();
    for (const titre of ["Cadrage", "Développement", "Recette"]) {
      await taches.creer(nouvelleTache(p, { titre, statut: "done", avancement: 100 }), acteur, DROITS_TACHE);
    }
    expect(await projets.progression(p)).toBe(100);
  });

  it("RG-PRJ-07 — la moyenne est bien une MOYENNE, pas un tout-ou-rien", async () => {
    // Sans cette assertion, un code qui rendrait 100 dès qu'une tâche est
    // terminée passerait le test précédent.
    const p = await projet();
    await taches.creer(nouvelleTache(p, { avancement: 100 }), acteur, DROITS_TACHE);
    await taches.creer(nouvelleTache(p, { avancement: 50 }), acteur, DROITS_TACHE);
    await taches.creer(nouvelleTache(p, { avancement: 0 }), acteur, DROITS_TACHE);
    expect(await projets.progression(p)).toBe(50);
  });

  it("RG-JAL-01 — un jalon dont les tâches sont créées TERMINÉES est « done » sans marquage", async () => {
    /*
     * Ce contrôle-ci tenait DÉJÀ avant le correctif : `RG-JAL-01` lit le
     * `statut` des tâches, pas leur `avancement`, et `statut` était accepté à
     * la création. Il est écrit quand même parce que la fiche le demande, et
     * parce qu'il pose le raccord : le jalon ne doit pas dépendre du champ
     * qu'on vient de réparer.
     */
    const p = await projet();
    const j = await projets.creerJalon({ nom: "Livraison", projectId: p }, acteur);
    for (const titre of ["Un", "Deux"]) {
      await taches.creer(
        nouvelleTache(p, { titre, statut: "done", avancement: 100, milestoneId: j.id }),
        acteur,
        DROITS_TACHE,
      );
    }
    expect(await projets.statutJalon(j.id)).toBe("done");
  });
});
