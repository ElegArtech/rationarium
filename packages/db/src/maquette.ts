import type { PrismaClient } from "./generated/client.js";

/**
 * **Le jeu de données des maquettes.**
 *
 * La boucle de conformité compare le rendu du produit à la maquette gelée. Sur
 * une vue de données, cette comparaison n'a de sens que si les deux montrent
 * **la même chose** : sinon le comparateur signale « Bonjour Camille » comme un
 * texte manquant, et la moitié des classes de la maquette — `badge-late`,
 * `tchip-indep`, `dot-badge`, `pgi` — comme absentes, alors qu'elles ne sont
 * qu'inatteignables faute d'une tâche en retard, d'une tâche hors projet,
 * d'une notification non lue ou d'un projet portant une icône.
 *
 * Deux agents de portage l'ont établi séparément, chiffres à l'appui : sur les
 * vues 06 et 10 à 15, l'essentiel du reliquat d'écarts venait du jeu de
 * volumétrie — « Projet 1 », « Prénom40 Nom40 » — et non du portage.
 *
 * Ce module reconstitue donc l'instance fictive des maquettes : la Ville de
 * Roqueville, ses cinq agents, ses trois projets. Il ne sert **qu'à mesurer**.
 * Il n'a rien à faire en production, et `peupler()` — le jeu de volumétrie de
 * L-26 — reste l'outil des mesures de performance.
 *
 * **Idempotent.** Il est rejoué avant chaque campagne de conformité.
 *
 * Ce qu'il ne prétend pas résoudre : la maquette du tableau de bord date son
 * écran au « jeudi 13 août 2026 » et celle du planning affiche « semaine du 17
 * au 21 novembre ». Aucune horloge unique ne satisfait les deux. Les textes
 * portant un chiffre sont écartés de la comparaison pour cette raison, et les
 * données ci-dessous sont posées **relativement au lundi courant**, là où la
 * maquette les pose en absolu.
 */

/** Les identités des maquettes. La première est celle du compte connecté. */
export const AGENTS = [
  { cle: "durand", prenom: "Camille", nom: "Durand" },
  { cle: "amrani", prenom: "Driss", nom: "Amrani" },
  { cle: "berthier", prenom: "Fatou", nom: "Berthier" },
  { cle: "nguyen", prenom: "Hugo", nom: "Nguyen" },
  { cle: "rocher", prenom: "Inès", nom: "Rocher" },
] as const;

/** Les trois projets du portefeuille, avec leur icône et leur santé. */
export const PROJETS = [
  { cle: "portail", nom: "Refonte du portail citoyen", icone: "p-screen", avancement: 62 },
  { cle: "sirh", nom: "Migration SIRH", icone: "p-database", avancement: 31 },
  { cle: "schema", nom: "Schéma directeur numérique", icone: "p-flow", avancement: 12 },
] as const;

const lundiDe = (reference: Date): Date => {
  const d = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d;
};

/**
 * Peuple l'instance avec le contenu des maquettes.
 *
 * `compteConnecte` est le login de la personne qui sert aux mesures : elle
 * reçoit l'identité de Camille Durand, ses projets, ses tâches, ses to-do et
 * ses notifications, parce que le tableau de bord et les listes « les miennes »
 * montrent l'activité de la personne connectée et de personne d'autre.
 */
export async function peuplerMaquette(
  prisma: PrismaClient,
  compteConnecte = "admin",
  aujourdhui = new Date(),
): Promise<Record<string, number>> {
  const lundi = lundiDe(aujourdhui);
  const jour = (n: number) => {
    const d = new Date(lundi);
    d.setUTCDate(d.getUTCDate() + n);
    return d;
  };

  // ── Les personnes ───────────────────────────────────────────────────────
  const moi = await prisma.user.findUniqueOrThrow({ where: { login: compteConnecte } });
  await prisma.user.update({
    where: { id: moi.id },
    data: { prenom: AGENTS[0].prenom, nom: AGENTS[0].nom },
  });

  const agents = [moi];
  for (const a of AGENTS.slice(1)) {
    const login = `${a.prenom[0]!.toLowerCase()}.${a.nom.toLowerCase()}`;
    agents.push(
      await prisma.user.upsert({
        where: { login },
        create: {
          login,
          email: `${login}@roqueville.fr`,
          motDePasseHash: moi.motDePasseHash,
          prenom: a.prenom,
          nom: a.nom,
          motDePasseAChanger: false,
        },
        update: { prenom: a.prenom, nom: a.nom },
      }),
    );
  }

  // ── Les projets ─────────────────────────────────────────────────────────
  const projets = [];
  for (const [i, p] of PROJETS.entries()) {
    // Le projet n'a pas de code unique au schéma : l'idempotence passe par un
    // identifiant stable, comme pour les tâches.
    const projet = await prisma.project.upsert({
      where: { id: idStable("p", i) },
      create: {
        id: idStable("p", i),
        nom: p.nom,
        icone: p.icone,
        statut: "active",
        dateDebut: jour(-60),
        dateFin: jour(60 + i * 30),
        createurId: moi.id,
        chefId: agents[i % agents.length]!.id,
      },
      update: { nom: p.nom, icone: p.icone },
    });
    projets.push(projet);

    for (const [j, a] of agents.entries()) {
      await prisma.projectMember.upsert({
        where: { projectId_userId: { projectId: projet.id, userId: a.id } },
        create: {
          projectId: projet.id,
          userId: a.id,
          roleProjet: j === 0 ? "responsable" : j === 1 ? "contributeur" : "observateur",
          tauxAllocation: [40, 30, 20, 10, 10][j] ?? 10,
        },
        update: {},
      });
    }

    await prisma.milestone.upsert({
      where: { projectId_nom: { projectId: projet.id, nom: JALONS[i]!.nom } },
      create: { projectId: projet.id, nom: JALONS[i]!.nom, dateEcheance: jour(JALONS[i]!.dans) },
      update: {},
    });
  }

  // ── Les tâches ──────────────────────────────────────────────────────────
  // Chaque statut est représenté, plus les deux cas que la maquette montre et
  // que rien d'autre ne produit : une tâche EN RETARD (`badge-late`) et une
  // tâche HORS PROJET (`badge-indep`, `tchip-indep`).
  for (const [i, t] of TACHES.entries()) {
    const rang = t.projet ? PROJETS.findIndex((p) => p.cle === t.projet) : -1;
    const projet = rang >= 0 ? projets[rang] : null;
    const tache = await prisma.task.upsert({
      where: { id: idStable("t", i) },
      create: {
        id: idStable("t", i),
        titre: t.titre,
        statut: t.statut,
        priorite: "priorite" in t ? t.priorite : "normal",
        dateDebut: jour(t.debut),
        dateFin: jour(t.fin),
        avancement: "avancement" in t ? t.avancement : 0,
        estimationHeures: "heures" in t ? t.heures : null,
        ...(projet ? { projectId: projet.id } : {}),
      },
      update: {
        titre: t.titre,
        statut: t.statut,
        dateDebut: jour(t.debut),
        dateFin: jour(t.fin),
      },
    });
    await prisma.taskAssignee.upsert({
      where: { taskId_userId: { taskId: tache.id, userId: agents[t.agent]!.id } },
      create: { taskId: tache.id, userId: agents[t.agent]!.id, porteur: true },
      update: {},
    });
  }

  // ── Les à-faire personnels — `RG-DSH-01` ────────────────────────────────
  for (const [i, libelle] of TODOS.entries()) {
    await prisma.todo.upsert({
      where: { id: idStable("d", i) },
      create: { id: idStable("d", i), userId: moi.id, libelle, ordre: i, fait: i === 2 },
      update: { libelle },
    });
  }

  // ── Les événements ──────────────────────────────────────────────────────
  for (const [i, e] of EVENEMENTS.entries()) {
    const evenement = await prisma.event.upsert({
      where: { id: idStable("e", i) },
      create: {
        id: idStable("e", i),
        titre: e.titre,
        date: jour(e.jour),
        heureDebut: e.debut,
        heureFin: e.fin,
        interventionExterieure: "externe" in e ? e.externe : false,
      },
      update: { titre: e.titre, date: jour(e.jour) },
    });
    await prisma.eventParticipant.upsert({
      where: { eventId_userId: { eventId: evenement.id, userId: moi.id } },
      create: { eventId: evenement.id, userId: moi.id },
      update: {},
    });
  }

  // ── Les notifications — sans elles, `dot-badge` est inatteignable ───────
  for (const [i, n] of NOTIFICATIONS.entries()) {
    await prisma.notification.upsert({
      where: { id: idStable("n", i) },
      create: {
        id: idStable("n", i),
        userId: moi.id,
        type: n.type,
        titre: n.titre,
        contenu: n.contenu,
        lue: i > 2,
      },
      update: { titre: n.titre, contenu: n.contenu },
    });
  }

  // ── La présence déclarée sur la semaine ─────────────────────────────────
  const presence = ["office", "telework", "office", "office", "telework"] as const;
  for (const [i, etat] of presence.entries()) {
    await prisma.telework.upsert({
      where: { userId_date: { userId: moi.id, date: jour(i) } },
      create: { userId: moi.id, date: jour(i), etat },
      update: { etat },
    });
  }

  // ── Le calendrier — sans lui, `col-ferie` et `is-vac` sont inatteignables ─
  await prisma.holiday.upsert({
    where: { id: idStable("h", 0) },
    create: { id: idStable("h", 0), date: jour(3), libelle: "Jour férié", type: "legal" },
    update: { date: jour(3) },
  });
  await prisma.schoolVacation.upsert({
    where: { id: idStable("v", 0) },
    create: {
      id: idStable("v", 0),
      libelle: "Vacances de la Toussaint",
      dateDebut: jour(2),
      dateFin: jour(6),
      zone: "A",
      anneeScolaire: `${lundi.getUTCFullYear()}-${lundi.getUTCFullYear() + 1}`,
    },
    update: { dateDebut: jour(2), dateFin: jour(6) },
  });

  // ── Les permanences — la vue 09 est vide sans tâche prédéfinie ──────────
  for (const [i, p] of PERMANENCES.entries()) {
    const predefinie = await prisma.predefinedTask.upsert({
      where: { id: idStable("q", i) },
      create: {
        id: idStable("q", i),
        nom: p.nom,
        dureeParDefaut: p.duree,
        heureDebut: p.debut,
        heureFin: p.fin,
        poids: p.poids,
      },
      update: { nom: p.nom },
    });
    for (const [j, a] of agents.slice(0, 3).entries()) {
      await prisma.predefinedTaskAssignment.upsert({
        where: { id: idStable(String.fromCharCode(97 + i), 40 + j) },
        create: {
          id: idStable(String.fromCharCode(97 + i), 40 + j),
          predefinedTaskId: predefinie.id,
          userId: a.id,
          date: jour(j),
          periode: p.duree === "half_day" ? "morning" : "full_day",
          realisee: j === 0,
        },
        update: {},
      });
    }
  }

  // ── Les congés — dont une DEMI-JOURNÉE, que rien d'autre ne produit ─────
  const typeConge = await prisma.leaveType.upsert({
    where: { code: "CA" },
    create: { code: "CA", nom: "Congé annuel", couleur: "#6A4BA6", ordre: 1 },
    update: {},
  });
  for (const [i, c] of CONGES.entries()) {
    await prisma.leave.upsert({
      where: { id: idStable("c", i) },
      create: {
        id: idStable("c", i),
        userId: agents[c.agent]!.id,
        typeId: typeConge.id,
        dateDebut: jour(c.debut),
        dateFin: jour(c.fin),
        joursOuvres: c.jours,
        statut: c.statut,
        ...("demiDebut" in c ? { demiJourneeDebut: c.demiDebut } : {}),
      },
      update: { dateDebut: jour(c.debut), dateFin: jour(c.fin), statut: c.statut },
    });
  }

  return {
    agents: agents.length,
    projets: projets.length,
    taches: TACHES.length,
    todos: TODOS.length,
    evenements: EVENEMENTS.length,
    notifications: NOTIFICATIONS.length,
    permanences: PERMANENCES.length,
    conges: CONGES.length,
  };
}

/** Identifiants stables : le jeu doit être rejouable sans doublon. */
const idStable = (prefixe: string, n: number): string => {
  const code = prefixe.charCodeAt(0).toString(16).padStart(2, "0");
  return `0000${code}0a-0000-4000-8000-${String(n).padStart(12, "0")}`;
};

const JALONS = [
  { nom: "Recette", dans: 14 },
  { nom: "Reprise des données", dans: 35 },
  { nom: "Comité de pilotage", dans: 60 },
] as const;

const TACHES = [
  { titre: "Maquettes portail", projet: "portail", statut: "doing", agent: 0, debut: 0, fin: 1, avancement: 60, heures: 12 },
  { titre: "Recette portail", projet: "portail", statut: "todo", agent: 0, debut: 4, fin: 4, heures: 8 },
  { titre: "Cahier des charges", projet: "sirh", statut: "review", agent: 1, debut: 0, fin: 1, avancement: 80 },
  { titre: "Reprise des données", projet: "sirh", statut: "doing", agent: 3, debut: 0, fin: 2, avancement: 45 },
  { titre: "Note de cadrage", projet: "schema", statut: "todo", agent: 4, debut: 0, fin: 2 },
  { titre: "Plan de tests", projet: "portail", statut: "done", agent: 0, debut: -7, fin: -3, avancement: 100 },
  { titre: "Reprise des libellés", projet: "sirh", statut: "blocked", agent: 0, debut: 1, fin: 3, priorite: "high" },
  // En retard : échéance dépassée, statut non terminé. C'est `badge-late`.
  { titre: "Comptes rendus de juillet", projet: "portail", statut: "doing", agent: 0, debut: -14, fin: -5, priorite: "high" },
  // Hors projet : ni pastille ni projet. C'est `badge-indep` et `tchip-indep`.
  { titre: "Réunion de service", projet: null, statut: "todo", agent: 0, debut: 2, fin: 2 },
  { titre: "Accueil · matin", projet: null, statut: "doing", agent: 2, debut: 0, fin: 0 },
] as const;

const TODOS = [
  "Archiver les comptes rendus de juillet",
  "Relire la note de cadrage",
  "Préparer le comité de pilotage",
] as const;

const EVENEMENTS = [
  { titre: "Comité · EXT", jour: 2, debut: "14:00", fin: "16:00", externe: true },
  { titre: "Bureau municipal", jour: 1, debut: "09:00", fin: "10:30" },
  { titre: "Réunion de service", jour: 4, debut: "11:00", fin: "12:00" },
] as const;

const PERMANENCES = [
  { nom: "Accueil du public", duree: "half_day", debut: "09:00", fin: "12:00", poids: 3 },
  { nom: "Astreinte technique", duree: "full_day", debut: null, fin: null, poids: 5 },
] as const;

const CONGES = [
  { agent: 2, debut: 1, fin: 2, jours: 2, statut: "pending" },
  // Demi-journée : `is-half`, `is-am`, `is-pm` n'ont aucune autre source.
  { agent: 4, debut: 3, fin: 3, jours: 0.5, statut: "approved", demiDebut: "afternoon" },
  { agent: 1, debut: 4, fin: 4, jours: 1, statut: "approved" },
] as const;

const NOTIFICATIONS = [
  { type: "task.assigned", titre: "Nouvelle tâche assignée — Recette portail", contenu: "Refonte du portail citoyen" },
  { type: "leave.approved", titre: "Congé approuvé", contenu: "Du 24 au 28 août" },
  { type: "task.deadline", titre: "Échéance proche — Cahier des charges", contenu: "Migration SIRH" },
  { type: "project.member_added", titre: "Ajout au projet", contenu: "Schéma directeur numérique" },
] as const;
