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
  /*
   * Les maquettes 11 à 15 montrent ce projet en priorité « Haute ». Sans
   * elle, tout projet naît « Normale » et le libellé n'existait nulle part —
   * cinq vues comptaient un texte manquant qui n'était qu'une donnée absente.
   */
  { cle: "portail", nom: "Refonte du portail citoyen", icone: "p-screen", avancement: 62, priorite: "high" },
  { cle: "sirh", nom: "Migration SIRH", icone: "p-database", avancement: 31 },
  { cle: "schema", nom: "Schéma directeur numérique", icone: "p-flow", avancement: 12 },
  /*
   * Un projet ANNULÉ. `is-cancelled` n'a aucune autre source : sans lui, la
   * classe reste inerte et le filtre « Annulés » du portefeuille ne montre
   * jamais rien — ni la vue, ni aucune boucle ne pouvait le dire.
   */
  { cle: "archives", nom: "Dématérialisation des archives", icone: "p-scroll", statut: "cancelled", avancement: 18 },
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
  /*
   * Le jeu se pose SUR une instance amorcée : il ne crée pas le premier
   * administrateur, sous peine d'en faire une seconde source de vérité à côté
   * de l'amorçage, qui pose aussi le référentiel des 26 rôles.
   *
   * `findUniqueOrThrow` rendait ici une trace Prisma illisible sur une base
   * neuve — un message technique là où `RG-GEN-03` veut une phrase qui dit
   * quoi faire.
   */
  const moi = await prisma.user.findUnique({ where: { login: compteConnecte } });
  if (!moi) {
    throw new Error(
      `Le compte « ${compteConnecte} » n'existe pas. Le jeu des maquettes se pose sur une instance déjà amorcée : amorcez-la d'abord, ou indiquez un compte existant.`,
    );
  }
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

  /*
   * ── Le rattachement organisationnel ──────────────────────────────────────
   *
   * Les cinq agents n'appartenaient à AUCUN service. Le sélecteur « Tous les
   * services » de la vue 09 et le filtre de la vue 07 n'avaient donc rien à
   * proposer : ils s'affichaient vides, ce qui se lit comme « il n'y a pas de
   * service » et non comme « personne n'y est rattaché ».
   */
  const direction = await prisma.direction.upsert({
    where: { id: idStable("D", 0) },
    create: { id: idStable("D", 0), nom: "Direction des systèmes d'information", responsableId: moi.id },
    update: { nom: "Direction des systèmes d'information" },
  });
  const departement = await prisma.departement.upsert({
    where: { id: idStable("E", 0) },
    create: {
      id: idStable("E", 0),
      nom: "Numérique et données",
      directionId: direction.id,
      responsableId: moi.id,
    },
    update: { nom: "Numérique et données", directionId: direction.id },
  });
  const services = [];
  for (const [i, nom] of ["Études et projets", "Exploitation"].entries()) {
    services.push(
      await prisma.service.upsert({
        where: { id: idStable("S", i) },
        create: { id: idStable("S", i), nom, departementId: departement.id, managerId: agents[i]!.id },
        update: { nom, departementId: departement.id },
      }),
    );
  }
  for (const [i, a] of agents.entries()) {
    const service = services[i % services.length]!;
    await prisma.user.update({ where: { id: a.id }, data: { departementId: departement.id } });
    await prisma.userService.upsert({
      where: { userId_serviceId: { userId: a.id, serviceId: service.id } },
      create: { userId: a.id, serviceId: service.id },
      update: {},
    });
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
        statut: "statut" in p ? p.statut : "active",
        priorite: "priorite" in p ? p.priorite : "normal",
        dateDebut: jour(-60),
        dateFin: jour(60 + i * 30),
        createurId: moi.id,
        chefId: agents[i % agents.length]!.id,
      },
      // Le statut est dans la mise à jour : sans lui, un projet qui change
      // d'état garde l'ancien à chaque rejeu du jeu de données.
      update: {
        nom: p.nom,
        icone: p.icone,
        statut: "statut" in p ? p.statut : "active",
        priorite: "priorite" in p ? p.priorite : "normal",
      },
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

    for (const j of JALONS) {
      await prisma.milestone.upsert({
        where: { projectId_nom: { projectId: projet.id, nom: j.nom } },
        create: { projectId: projet.id, nom: j.nom, dateEcheance: jour(j.dans) },
        update: { dateEcheance: jour(j.dans) },
      });
    }
  }

  // ── Les tâches ──────────────────────────────────────────────────────────
  // Chaque statut est représenté, plus les deux cas que la maquette montre et
  // que rien d'autre ne produit : une tâche EN RETARD (`badge-late`) et une
  // tâche HORS PROJET (`badge-indep`, `tchip-indep`).
  for (const [i, t] of TACHES.entries()) {
    const rang = t.projet ? PROJETS.findIndex((p) => p.cle === t.projet) : -1;
    const projet = rang >= 0 ? projets[rang] : null;
    /*
     * Le rattachement à un jalon n'est pas décoratif : sans lui, la feuille de
     * route de la vue 13 n'a aucune ligne de tâche — ni pile d'avatars, ni
     * charge, ni statut de jalon calculé. Le jalon vide est un état légitime,
     * mais ce ne peut pas être le SEUL que le jeu produise.
     */
    const jalon =
      projet && "jalon" in t && t.jalon
        ? await prisma.milestone.findUnique({
            where: { projectId_nom: { projectId: projet.id, nom: t.jalon } },
            select: { id: true },
          })
        : null;
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
        ...(jalon ? { milestoneId: jalon.id } : {}),
      },
      update: {
        titre: t.titre,
        statut: t.statut,
        dateDebut: jour(t.debut),
        dateFin: jour(t.fin),
        ...(jalon ? { milestoneId: jalon.id } : {}),
      },
    });
    /*
     * Le nombre d'assignés n'est pas anecdotique : la maquette montre une pile
     * de trois visages PUIS un compte (`avs-more`), et un « Personne » en
     * italique (`is-none`) quand la tâche n'est portée par personne. Ni l'un ni
     * l'autre ne se produit avec un assigné par tâche.
     */
    if (t.agent >= 0) {
      const porteurs = "equipe" in t && t.equipe ? agents : [agents[t.agent]!];
      for (const [k, a] of porteurs.entries()) {
        await prisma.taskAssignee.upsert({
          where: { taskId_userId: { taskId: tache.id, userId: a.id } },
          create: { taskId: tache.id, userId: a.id, porteur: k === 0 },
          update: {},
        });
      }
    }
  }

  /*
   * ── La fiche de tâche — vue 17 ─────────────────────────────────────────
   *
   * Elle montre des sous-tâches, des commentaires, des documents, des rôles
   * RACI et une dépendance INCOHÉRENTE — un prérequis qui finit après que la
   * tâche a commencé. Rien de tout cela n'existe dans le jeu de volumétrie :
   * 4 000 tâches ayant toutes projet, jalon et assigné, et pas une seule
   * sous-tâche. Il mesure la charge, il n'exerce aucune variante.
   */
  /*
   * Un tiers, rattaché à la tâche que mesure la vue 17.
   *
   * `dot-ind` et `is-indep` n'ont aucune autre source : ce sont les marques
   * d'un intervenant extérieur sur une tâche. Le jeu ne créait AUCUN
   * `TaskThirdParty`, donc la fiche ne pouvait pas les rendre — et l'écart se
   * lisait comme un défaut de balisage.
   *
   * Pas de `contactNom` : la contrainte `third_parties_contact_selon_type`
   * l'interdit sur un tiers de type `organisation` — l'identité vient du champ
   * `organisation`, le contact nominatif est réservé à la personne physique.
   * Un garde-fou `C15` que le code seul ne dit pas.
   */
  const tiers = await prisma.thirdParty.upsert({
    where: { id: idStable("T", 0) },
    create: {
      id: idStable("T", 0),
      type: "organisation",
      organisation: "Atelier Numérique SARL",
      contactEmail: "contact@atelier-numerique.fr",
    },
    update: { organisation: "Atelier Numérique SARL" },
  });

  const fiche = await prisma.task.findUniqueOrThrow({ where: { id: idStable("t", 0) } });
  await prisma.taskThirdParty.upsert({
    where: { taskId_thirdPartyId: { taskId: fiche.id, thirdPartyId: tiers.id } },
    create: { taskId: fiche.id, thirdPartyId: tiers.id },
    update: {},
  });
  const prerequis = await prisma.task.findUniqueOrThrow({ where: { id: idStable("t", 6) } });

  for (const [i, st] of SOUS_TACHES.entries()) {
    await prisma.subtask.upsert({
      where: { id: idStable("u", i) },
      create: { id: idStable("u", i), taskId: fiche.id, libelle: st.libelle, fait: st.fait, ordre: i },
      update: { libelle: st.libelle, fait: st.fait },
    });
  }

  for (const [i, c] of COMMENTAIRES.entries()) {
    await prisma.comment.upsert({
      where: { id: idStable("m", i) },
      create: {
        id: idStable("m", i),
        taskId: fiche.id,
        auteurId: agents[c.agent]!.id,
        contenu: c.contenu,
      },
      update: { contenu: c.contenu },
    });
  }

  for (const [i, d] of DOCUMENTS.entries()) {
    await prisma.document.upsert({
      where: { id: idStable("f", i) },
      create: {
        id: idStable("f", i),
        taskId: fiche.id,
        auteurId: moi.id,
        nom: d.nom,
        empreinte: `maq-${i}`,
        tailleOctets: d.octets,
        typeMime: d.type,
      },
      update: { nom: d.nom },
    });
  }

  for (const r of RACI) {
    await prisma.taskRaci.upsert({
      where: { taskId_userId_role: { taskId: fiche.id, userId: agents[r.agent]!.id, role: r.role } },
      create: { taskId: fiche.id, userId: agents[r.agent]!.id, role: r.role },
      update: {},
    });
  }

  // La dépendance, et son incohérence : le prérequis finit APRÈS le début de
  // la tâche. La maquette montre le bandeau d'alerte qui le dit.
  await prisma.taskDependency.upsert({
    where: { taskId_prerequisId: { taskId: fiche.id, prerequisId: prerequis.id } },
    create: { taskId: fiche.id, prerequisId: prerequis.id },
    update: {},
  });

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
    /*
     * Le repli `acell-more` exige une cellule à QUATRE agents au moins : la
     * grille montre trois visages puis « +n ». Le jeu posait un agent par
     * jour — une cellule n'en contenait jamais qu'un, et la classe était
     * inatteignable par construction, pas absente du balisage.
     *
     * La première permanence pose donc les cinq agents sur LE MÊME jour ;
     * les suivantes gardent l'étalement, sinon le cas « un seul » disparaît.
     */
    const etalees =
      i === 0
        ? agents.map((a, k) => ({ a, j: 0, k }))
        : agents.slice(0, 3).map((a, k) => ({ a, j: k, k }));
    for (const { a, j, k } of etalees) {
      await prisma.predefinedTaskAssignment.upsert({
        where: { id: idStable(String.fromCharCode(97 + i), 40 + k) },
        create: {
          id: idStable(String.fromCharCode(97 + i), 40 + k),
          predefinedTaskId: predefinie.id,
          userId: a.id,
          date: jour(j),
          periode: p.duree === "half_day" ? "morning" : "full_day",
          realisee: k === 0,
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
  /*
   * Les allocations, sans lesquelles `RG-CNG-20` refuse tout et la vue 19 n'a
   * rien à montrer. Un défaut global plus une allocation propre : les deux
   * chemins de `RG-CNG-24` sont exercés par le jeu, pas seulement décrits.
   */
  await prisma.leaveBalance.upsert({
    where: { id: idStable("s", 0) },
    create: {
      id: idStable("s", 0),
      userId: null,
      typeId: typeConge.id,
      annee: lundi.getUTCFullYear(),
      joursAttribues: 25,
    },
    update: { joursAttribues: 25 },
  });
  await prisma.leaveBalance.upsert({
    where: { id: idStable("s", 1) },
    create: {
      id: idStable("s", 1),
      userId: moi.id,
      typeId: typeConge.id,
      annee: lundi.getUTCFullYear(),
      joursAttribues: 28,
    },
    update: { joursAttribues: 28 },
  });

  /*
   * `RG-CNG-25` — la base refuse deux congés qui se chevauchent pour la même
   * personne, par contrainte d'exclusion `GiST`. Or **tout ce jeu est ancré
   * sur le lundi de la semaine courante** : rejoué une semaine plus tard, les
   * nouvelles dates chevauchent celles que le rejeu n'a pas encore réécrites,
   * et l'insertion est refusée à mi-parcours.
   *
   * L'idempotence ne valait donc qu'À DATE CONSTANTE — ce qu'un rejeu le même
   * jour ne peut pas révéler. Les congés du jeu sont effacés avant d'être
   * reposés : ils portent des identifiants stables et connus, donc rien
   * d'autre n'est touché.
   */
  await prisma.leave.deleteMany({
    where: { id: { in: CONGES.map((_, i) => idStable("c", i)) } },
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
      // Le titulaire fait partie de la reprise : les identifiants sont
      // stables, donc une entrée qui change de propriétaire garderait l'ancien
      // si l'`update` l'omettait — et le congé de la personne connectée
      // resterait celui de quelqu'un d'autre.
      update: {
        userId: agents[c.agent]!.id,
        dateDebut: jour(c.debut),
        dateFin: jour(c.fin),
        statut: c.statut,
      },
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

/**
 * Trois jalons, dans trois états — la maquette les distingue et le statut est
 * CALCULÉ (`RG-JAL-01`) : « Terminé » quand toutes ses tâches le sont, « En
 * retard » quand l'échéance est passée sans l'être.
 */
const JALONS = [
  { nom: "Cadrage", dans: -21 },
  { nom: "Recette", dans: 14 },
  { nom: "Comité de pilotage", dans: 60 },
] as const;

const TACHES = [
  { titre: "Maquettes portail", projet: "portail", jalon: "Recette", statut: "doing", agent: 0, debut: 0, fin: 1, avancement: 60, heures: 12 },
  // Cinq assignés : la pile montre trois visages, puis « +2 » (`avs-more`).
  { titre: "Recette portail", projet: "portail", jalon: "Recette", statut: "todo", agent: 0, equipe: true, debut: 4, fin: 4, heures: 8 },
  // Personne : `is-none`. Une tâche sans porteur est un état qui existe.
  { titre: "Cahier des charges", projet: "sirh", jalon: "Recette", statut: "review", agent: -1, debut: 0, fin: 1, avancement: 80 },
  { titre: "Reprise des données", projet: "sirh", statut: "doing", agent: 3, debut: 0, fin: 2, avancement: 45 },
  { titre: "Note de cadrage", projet: "schema", statut: "todo", agent: 4, debut: 0, fin: 2 },
  // Jalon « Cadrage » : échéance passée, tâche terminée → jalon TERMINÉ.
  { titre: "Plan de tests", projet: "portail", jalon: "Cadrage", statut: "done", agent: 0, debut: -7, fin: -3, avancement: 100 },
  // Jalon « Cadrage » du SIRH : échéance passée, tâche bloquée → EN RETARD.
  { titre: "Reprise des libellés", projet: "sirh", jalon: "Cadrage", statut: "blocked", agent: 0, debut: 1, fin: 3, priorite: "high" },
  // En retard : échéance dépassée, statut non terminé. C'est `badge-late`.
  // Échéance dépassée sur un jalon échu : le jalon passe EN RETARD (`ms-late`).
  { titre: "Comptes rendus de juillet", projet: "portail", jalon: "Cadrage", statut: "doing", agent: 0, debut: -14, fin: -5, priorite: "high" },
  // Hors projet : ni pastille ni projet. C'est `badge-indep` et `tchip-indep`.
  { titre: "Réunion de service", projet: null, statut: "todo", agent: 0, debut: 2, fin: 2 },
  { titre: "Accueil · matin", projet: null, statut: "doing", agent: 2, debut: 0, fin: 0 },
  /*
   * Les quatre priorités et les cinq statuts doivent TOUS exister sur le projet
   * que les vues 11, 13 et 15 mesurent — sinon « Basse », « Critique »,
   * « Bloqué » et « En revue » n'ont aucune donnée qui les porte, et la vue
   * paraît incomplète alors que c'est le jeu de données qui l'est.
   */
  { titre: "Reprise des contenus", projet: "portail", jalon: "Recette", statut: "blocked", agent: 1, debut: 1, fin: 6, priorite: "critical" },
  { titre: "Relecture juridique", projet: "portail", jalon: "Recette", statut: "review", agent: 3, debut: 2, fin: 5, avancement: 70, priorite: "low" },
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
  // La vue 19 montre d'abord les congés de la personne connectée : sans l'un
  // des siens, la liste est vide quoi que contienne la base.
  { agent: 0, debut: 8, fin: 9, jours: 2, statut: "approved" },
  { agent: 0, debut: 15, fin: 15, jours: 1, statut: "pending" },
  { agent: 2, debut: 1, fin: 2, jours: 2, statut: "pending" },
  // Demi-journée : `is-half`, `is-am`, `is-pm` n'ont aucune autre source.
  { agent: 4, debut: 3, fin: 3, jours: 0.5, statut: "approved", demiDebut: "afternoon" },
  { agent: 1, debut: 4, fin: 4, jours: 1, statut: "approved" },
] as const;

const SOUS_TACHES = [
  { libelle: "Arborescence des démarches", fait: true },
  { libelle: "Parcours de dépôt", fait: true },
  { libelle: "Écrans de suivi", fait: false },
] as const;

const COMMENTAIRES = [
  { agent: 1, contenu: "Les parcours de dépôt sont validés côté métier." },
  { agent: 3, contenu: "Il manque l'écran de confirmation après envoi." },
] as const;

const DOCUMENTS = [
  { nom: "Maquettes-portail-v3.pdf", octets: 1_248_000, type: "application/pdf" },
  { nom: "Compte-rendu-atelier.odt", octets: 42_300, type: "application/vnd.oasis.opendocument.text" },
] as const;

const RACI = [
  { agent: 0, role: "responsible" },
  { agent: 1, role: "accountable" },
  { agent: 3, role: "consulted" },
  { agent: 4, role: "informed" },
] as const;

const NOTIFICATIONS = [
  { type: "task.assigned", titre: "Nouvelle tâche assignée — Recette portail", contenu: "Refonte du portail citoyen" },
  { type: "leave.approved", titre: "Congé approuvé", contenu: "Du 24 au 28 août" },
  { type: "task.deadline", titre: "Échéance proche — Cahier des charges", contenu: "Migration SIRH" },
  { type: "project.member_added", titre: "Ajout au projet", contenu: "Schéma directeur numérique" },
] as const;
