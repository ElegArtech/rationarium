import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { creerClient, type PrismaClient } from "@rationarium/db";
import type { StatutConge } from "@rationarium/contracts";
import { UtilisateursService } from "./utilisateurs.service.js";
import { AuditService } from "../commun/audit.service.js";
import { PerimetreService } from "../commun/perimetre.service.js";

/**
 * L-36 — le suivi individuel. Vue 28.
 *
 * Le point que ces tests protègent : **chaque chiffre a son étendue**. Les
 * heures et les jours de télétravail suivent la période demandée ; le solde de
 * congés suit l'année civile ; les tâches actives valent à l'instant. Un test
 * qui ne vérifierait que le total confondrait les trois.
 */

const RACINE_DB = path.resolve(import.meta.dirname, "../../../../packages/db");
const utc = (s: string) => new Date(`${s}T00:00:00.000Z`);

let pg: StartedPostgreSqlContainer;
let prisma: PrismaClient;
let utilisateurs: UtilisateursService;
let perimetres: PerimetreService;

/* Cette suite éprouve le CONTENU du suivi ; son cloisonnement a sa propre
 * suite. Elle passe donc un périmètre de gestion globale. */
const global = () => perimetres.resoudre(agent, new Set(["users:manage_any"]));
let agent: string;
let projet: string;

beforeAll(async () => {
  pg = await new PostgreSqlContainer("postgres:18-alpine").start();
  execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    cwd: RACINE_DB,
    env: { ...process.env, DATABASE_URL: pg.getConnectionUri() },
    stdio: "pipe",
  });
  prisma = creerClient(pg.getConnectionUri());
  perimetres = new PerimetreService(prisma as never);
  utilisateurs = new UtilisateursService(
    prisma as never,
    new AuditService(prisma as never),
    perimetres,
  );

  const u = await prisma.user.create({
    data: {
      login: "suivi.agent", email: "suivi.agent@x.fr", motDePasseHash: "x",
      prenom: "Suivie", nom: "Agente",
    },
  });
  agent = u.id;

  const p = await prisma.project.create({
    data: { nom: "Projet du suivi", dateDebut: utc("2026-01-01"), dateFin: utc("2026-12-31") },
  });
  projet = p.id;
}, 240_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await pg?.stop();
});

const AOUT = { debut: utc("2026-08-01"), fin: utc("2026-08-31") };

/*
 * Le titre citait `EX-USR-07`, qui est « réinitialiser le mot de passe d'un
 * utilisateur ». Cette suite n'en fait rien : elle exerce la **fiche de suivi
 * individuel**, c'est-à-dire `EX-USR-10`. La citation fausse comptait deux
 * fois : elle déclarait couverte une exigence que personne n'exerçait, et
 * laissait en dette celle que ces huit contrôles prouvent depuis toujours.
 */
describe("EX-USR-10 — la fiche de suivi individuel : chaque chiffre porte son étendue", () => {
  it("les heures saisies suivent la PÉRIODE, pas tout l'historique", async () => {
    await prisma.timeEntry.createMany({
      data: [
        { userId: agent, projectId: projet, date: utc("2026-08-05"), heures: 6 },
        { userId: agent, projectId: projet, date: utc("2026-08-06"), heures: 4 },
        // Hors période : ne doit pas être compté.
        { userId: agent, projectId: projet, date: utc("2026-07-15"), heures: 8 },
      ],
    });

    const suivi = await utilisateurs.suiviIndividuel(agent, AOUT, await global());
    expect(suivi.statistiques.heuresSaisies).toBe(10);
    expect(suivi.temps).toHaveLength(2);
  });

  it("les jours de télétravail suivent la PÉRIODE, et seulement l'état télétravail", async () => {
    await prisma.telework.createMany({
      data: [
        { userId: agent, date: utc("2026-08-04"), etat: "telework" },
        { userId: agent, date: utc("2026-08-11"), etat: "telework" },
        // Un jour au bureau n'est pas un jour de télétravail.
        { userId: agent, date: utc("2026-08-12"), etat: "office" },
        // Hors période.
        { userId: agent, date: utc("2026-09-01"), etat: "telework" },
      ],
    });

    const suivi = await utilisateurs.suiviIndividuel(agent, AOUT, await global());
    expect(suivi.statistiques.joursTeletravail).toBe(2);
  });

  it("le solde de congés suit l'ANNÉE CIVILE, pas la période", async () => {
    const type = await prisma.leaveType.create({
      data: { code: "CA_SUIVI", nom: "Congés annuels" },
    });
    const conge = await prisma.leave.create({
      data: {
        userId: agent, typeId: type.id,
        dateDebut: utc("2026-02-10"), dateFin: utc("2026-02-14"),
        statut: "approved", joursOuvres: 5,
      },
    });
    await prisma.leaveYearAllocation.create({
      data: { leaveId: conge.id, annee: 2026, jours: 5 },
    });

    // Février est HORS de la fenêtre d'août — et pourtant le congé compte :
    // un droit à congés ne se découpe pas en périodes glissantes.
    const suivi = await utilisateurs.suiviIndividuel(agent, AOUT, await global());
    expect(suivi.statistiques.congesAnnee).toBe(5);
    expect(suivi.periode.annee).toBe(2026);
  });

  /**
   * **`RG-CNG-20` — « Jours pris » ne compte que les jours consommés.**
   *
   * La somme portait sur TOUTES les répartitions de l'année, sans regarder le
   * statut : un refus et une annulation gonflaient le compteur de jours que
   * l'agent n'a jamais posés. `CongesService.solde` compte, lui, les seuls
   * `approved` et `cancellation_requested` — deux lectures d'un même fait qui
   * se contredisaient, et chacune avec ses tests au vert.
   *
   * Le contrôle affirme le NOMBRE, pas seulement l'écart : « moins qu'avant »
   * passerait aussi si l'approuvé avait disparu avec les autres.
   */
  it("RG-CNG-20 — les congés REFUSÉS et ANNULÉS ne comptent pas comme jours pris", async () => {
    const type = await prisma.leaveType.create({
      data: { code: "CA_STATUTS", nom: "Congés — statuts" },
    });
    const poser = async (
      statut: StatutConge, debut: string, fin: string, jours: number,
    ) => {
      const c = await prisma.leave.create({
        data: {
          userId: agent, typeId: type.id,
          dateDebut: utc(debut), dateFin: utc(fin),
          statut, joursOuvres: jours,
        },
      });
      await prisma.leaveYearAllocation.create({
        data: { leaveId: c.id, annee: 2026, jours },
      });
    };

    const avant = (await utilisateurs.suiviIndividuel(agent, AOUT, await global()))
      .statistiques.congesAnnee;

    await poser("refused", "2026-03-02", "2026-03-06", 5);
    await poser("cancelled", "2026-03-09", "2026-03-13", 5);
    await poser("approved", "2026-03-16", "2026-03-17", 2);

    const suivi = await utilisateurs.suiviIndividuel(agent, AOUT, await global());
    // Les dix jours refusés et annulés n'entrent pas ; les deux approuvés, si.
    expect(suivi.statistiques.congesAnnee).toBe(avant + 2);

    // Le refus et l'annulation restent LISIBLES dans l'historique : c'est le
    // compteur qui les écarte, pas la fiche.
    const statuts = suivi.conges.map((c) => c.statut);
    expect(statuts).toContain("refused");
    expect(statuts).toContain("cancelled");
  });

  it("RG-CNG-20 — une annulation DEMANDÉE reste un jour pris", async () => {
    /*
     * Tant qu'elle n'est pas accordée, le congé est posé. C'est la définition
     * de `CongesService.solde`, et les deux doivent la partager : un compteur
     * qui l'exclurait afficherait moins de jours pris que le solde n'en
     * décompte.
     */
    const type = await prisma.leaveType.create({
      data: { code: "CA_ANNUL", nom: "Congés — annulation demandée" },
    });
    const avant = (await utilisateurs.suiviIndividuel(agent, AOUT, await global()))
      .statistiques.congesAnnee;
    const c = await prisma.leave.create({
      data: {
        userId: agent, typeId: type.id,
        dateDebut: utc("2026-04-06"), dateFin: utc("2026-04-08"),
        statut: "cancellation_requested", joursOuvres: 3,
      },
    });
    await prisma.leaveYearAllocation.create({
      data: { leaveId: c.id, annee: 2026, jours: 3 },
    });

    expect(
      (await utilisateurs.suiviIndividuel(agent, AOUT, await global()))
        .statistiques.congesAnnee,
    ).toBe(avant + 3);
  });

  it("les tâches actives valent à L'INSTANT, quelle que soit la période", async () => {
    await prisma.task.create({
      data: {
        titre: "En cours", projectId: projet, statut: "doing",
        assignes: { create: { userId: agent } },
      },
    });
    await prisma.task.create({
      data: {
        titre: "Terminée", projectId: projet, statut: "done",
        assignes: { create: { userId: agent } },
      },
    });
    await prisma.task.create({
      data: {
        titre: "Bloquée", projectId: projet, statut: "blocked",
        assignes: { create: { userId: agent } },
      },
    });

    const suivi = await utilisateurs.suiviIndividuel(agent, AOUT, await global());
    expect(suivi.statistiques.tachesActives).toBe(2);
    expect(suivi.statistiques.tachesTerminees).toBe(1);
    expect(suivi.statistiques.tachesBloquees).toBe(1);
  });

  it("une période qui ne couvre rien ne casse pas les autres chiffres", async () => {
    const vide = { debut: utc("2020-01-01"), fin: utc("2020-01-31") };
    const suivi = await utilisateurs.suiviIndividuel(agent, vide, await global());

    expect(suivi.statistiques.heuresSaisies).toBe(0);
    expect(suivi.statistiques.joursTeletravail).toBe(0);
    // Les tâches actives ne dépendent pas de la période : elles restent là.
    expect(suivi.statistiques.tachesActives).toBe(2);
    // Le solde suit l'année de la FIN de période : 2020, donc rien.
    expect(suivi.statistiques.congesAnnee).toBe(0);
  });

  it("les projets actifs sont dédupliqués", async () => {
    await prisma.task.create({
      data: {
        titre: "Deuxième sur le même projet", projectId: projet, statut: "todo",
        assignes: { create: { userId: agent } },
      },
    });
    const suivi = await utilisateurs.suiviIndividuel(agent, AOUT, await global());
    // Trois tâches actives sur un seul projet : le compte de projets est 1.
    expect(suivi.statistiques.projetsActifs).toBe(1);
  });

  it("un agent inexistant est refusé, pas rendu vide", async () => {
    await expect(
      utilisateurs.suiviIndividuel(crypto.randomUUID(), AOUT, await global()),
    ).rejects.toMatchObject({ code: "introuvable" });
  });

  it("l'identité rassemble rôle, département et services", async () => {
    const dep = await prisma.departement.create({ data: { nom: "Département du suivi" } });
    const svc = await prisma.service.create({
      data: { nom: "Service du suivi", departementId: dep.id },
    });
    await prisma.user.update({ where: { id: agent }, data: { departementId: dep.id } });
    await prisma.userService.create({ data: { userId: agent, serviceId: svc.id } });

    const suivi = await utilisateurs.suiviIndividuel(agent, AOUT, await global());
    expect(suivi.agent.departement?.nom).toBe("Département du suivi");
    expect(suivi.agent.services.map((s) => s.nom)).toEqual(["Service du suivi"]);
  });
});

describe("RG-SCOPE-01 — le suivi individuel est borné au périmètre", () => {
  /*
   * C'est la lecture la plus indiscrète du produit : congés posés, jours de
   * télétravail, temps déclaré, tâche par tâche. Elle ne contrôlait AUCUN
   * périmètre — tout porteur de `users:read_individual_tracking` obtenait
   * celui de n'importe quel agent de l'instance en devinant son identifiant.
   *
   * La liste des utilisateurs, elle, filtrait bien. Même dissymétrie que sur
   * les projets : la liste tenait, l'adresse directe non — et c'est ce qui
   * rend la famille coûteuse, puisqu'un audit qui regarde la liste conclut que
   * le cloisonnement tient.
   */
  it("RG-SCOPE-01 — le suivi d'un agent HORS PÉRIMÈTRE est refusé", async () => {
    const dehors = await prisma.user.create({
      data: {
        login: `hors-${crypto.randomUUID().slice(0, 8)}`,
        email: `hors-${crypto.randomUUID().slice(0, 8)}@x.fr`,
        motDePasseHash: "x",
        prenom: "Hors",
        nom: "Périmètre",
      },
    });
    // Un périmètre qui ne contient QUE l'observateur : le cas d'un agent
    // ordinaire sans département commun.
    const etroit = await perimetres.resoudre(agent, new Set(["users:read"]));

    await expect(
      utilisateurs.suiviIndividuel(dehors.id, AOUT, etroit),
    ).rejects.toMatchObject({ code: "hors_perimetre" });
  });

  it("RG-SCOPE-01 — chacun voit le SIEN, c'est le cas nominal", async () => {
    const etroit = await perimetres.resoudre(agent, new Set(["users:read"]));
    await expect(utilisateurs.suiviIndividuel(agent, AOUT, etroit)).resolves.toBeDefined();
  });

  it("RG-SCOPE-03 — la gestion globale court-circuite le périmètre", async () => {
    const dehors = await prisma.user.create({
      data: {
        login: `large-${crypto.randomUUID().slice(0, 8)}`,
        email: `large-${crypto.randomUUID().slice(0, 8)}@x.fr`,
        motDePasseHash: "x",
        prenom: "Large",
        nom: "Vue",
      },
    });
    await expect(
      utilisateurs.suiviIndividuel(dehors.id, AOUT, await global()),
    ).resolves.toBeDefined();
  });
});

// ── RG-SCOPE-04 — la confidentialité vaut aussi par cette porte-ci ───────────

/**
 * Trouvé le 2026-09-07, à côté du défaut de recette sur `PATCH /taches/:id`.
 *
 * Le suivi listait le TITRE de toutes les tâches assignées à l'agent, les
 * confidentielles comprises : tout porteur de `users:read_individual_tracking`
 * lisait donc par la vue 28 ce que `RG-SCOPE-04` interdit sur `/taches`. C'est
 * la dissymétrie déjà consignée — la liste des tâches filtre, l'agrégat d'un
 * autre module non —, et elle survit à toutes les boucles vertes parce que les
 * deux moitiés sont justes séparément.
 */
describe("RG-SCOPE-04, RG-TSK-13 — le suivi individuel n'expose pas les tâches confidentielles", () => {
  /*
   * Le lecteur n'a PAS de permission de gestion globale : `users:manage_any` et
   * `tasks:manage_any` court-circuitent le cloisonnement par `RG-SCOPE-03`, et
   * un test qui les emploierait passerait avec comme sans le correctif. Il
   * détient exactement `users:read_individual_tracking`, et voit le porteur
   * parce qu'ils partagent un département.
   */
  const SUIVI = new Set(["users:read_individual_tracking"]) as ReadonlySet<string>;
  const INITIE = new Set([
    "users:read_individual_tracking",
    "tasks:read_confidential",
  ]) as ReadonlySet<string>;

  let porteur: string;
  let lecteurId: string;
  const lecteur = () => perimetres.resoudre(lecteurId, SUIVI);
  const initie = () => perimetres.resoudre(lecteurId, INITIE);

  beforeAll(async () => {
    const dept = await prisma.departement.create({
      data: { nom: `Dept confid ${crypto.randomUUID().slice(0, 8)}` },
    });
    const l = await prisma.user.create({
      data: {
        login: `lect-${crypto.randomUUID().slice(0, 8)}`,
        email: `lect-${crypto.randomUUID().slice(0, 8)}@x.fr`,
        motDePasseHash: "x", prenom: "Lect", nom: "Rice", departementId: dept.id,
      },
    });
    lecteurId = l.id;
    const u = await prisma.user.create({
      data: {
        login: `confid-${crypto.randomUUID().slice(0, 8)}`,
        email: `confid-${crypto.randomUUID().slice(0, 8)}@x.fr`,
        motDePasseHash: "x", prenom: "Porte", nom: "Secret", departementId: dept.id,
      },
    });
    porteur = u.id;
    await prisma.task.create({
      data: {
        titre: "Dossier disciplinaire", confidentielle: true, projectId: projet,
        assignes: { create: { userId: porteur, porteur: true } },
      },
    });
    await prisma.task.create({
      data: {
        titre: "Réunion d'équipe", projectId: projet,
        assignes: { create: { userId: porteur, porteur: true } },
      },
    });
  });

  it("RG-SCOPE-04 — sans `tasks:read_confidential`, le titre secret n'est PAS rendu", async () => {
    const suivi = await utilisateurs.suiviIndividuel(porteur, AOUT, await lecteur());
    const titres = suivi.taches.map((t) => t.titre);

    expect(titres).toContain("Réunion d'équipe");
    expect(titres).not.toContain("Dossier disciplinaire");
  });

  it("RG-SCOPE-04 — et le COMPTE d'activité ne la trahit pas non plus", async () => {
    // Un chiffre qui inclut ce que la liste cache dit la même chose, en plus
    // discret : deux tâches actives annoncées pour une seule nommée.
    const suivi = await utilisateurs.suiviIndividuel(porteur, AOUT, await lecteur());
    expect(suivi.statistiques.tachesActives).toBe(1);
  });

  it("RG-SCOPE-04 — avec la permission explicite, elle est rendue", async () => {
    // Le contre-témoin : sans lui, un filtre qui masquerait TOUT passerait
    // aussi, et l'on aurait remplacé une fuite par une amputation.
    const suivi = await utilisateurs.suiviIndividuel(porteur, AOUT, await initie());
    expect(suivi.taches.map((t) => t.titre)).toContain("Dossier disciplinaire");
    expect(suivi.statistiques.tachesActives).toBe(2);
  });
});
