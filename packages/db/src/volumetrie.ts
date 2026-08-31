import type { PrismaClient } from "./index.js";

/**
 * Le jeu de données de **volumétrie cible** — `cadrage/01 § 7`.
 *
 *   500 utilisateurs · 200 projets actifs · 20 000 tâches · 5 ans d'historique
 *
 * Il n'existait pas avant L-26, alors que la définition de terminé d'une tâche
 * de schéma l'exige (`cadrage/04 § 5.3`) : « jeu de données de volumétrie mis à
 * jour · mesure de performance rejouée ». Sans lui, tous les contrôles
 * d'intégration tournaient sur une poignée de lignes — c'est-à-dire sur une
 * base où **aucun plan d'exécution ne ressemble à celui de production**.
 *
 * **Déterministe, sans aléa.** Un jeu de données qui change d'un lancement à
 * l'autre rend une mesure de performance incomparable : on ne saurait plus si
 * un écart vient du code ou du tirage. Tout est dérivé de l'indice de boucle.
 *
 * **Écrit en lots**, jamais ligne à ligne : 20 000 `INSERT` unitaires prennent
 * des minutes et mesurent l'aller-retour réseau, pas le schéma.
 */

export type CibleVolumetrie = {
  utilisateurs: number;
  projets: number;
  taches: number;
  /** Années d'historique — congés, saisies de temps, instantanés. */
  annees: number;
};

export const CIBLE: CibleVolumetrie = {
  utilisateurs: 500,
  projets: 200,
  taches: 20_000,
  annees: 5,
};

/** Une cible réduite, pour les suites qui veulent du volume sans l'attente. */
export const CIBLE_REDUITE: CibleVolumetrie = {
  utilisateurs: 120,
  projets: 40,
  taches: 4_000,
  annees: 2,
};

const LOT = 2_000;

/**
 * Un identifiant stable pour un indice donné : rejouable, comparable.
 *
 * Le préfixe est **hexadécimal** : PostgreSQL refuse un `uuid` contenant une
 * lettre hors de `[0-9a-f]`, et un préfixe lisible comme « u1 » produisait un
 * identifiant syntaxiquement invalide. Le préfixe reste distinct par entité,
 * ce qui suffit à éviter toute collision entre familles.
 */
const uuidDe = (prefixe: string, i: number): string => {
  const n = i.toString(16).padStart(12, "0");
  return `${prefixe.padStart(8, "0").slice(-8)}-0000-4000-8000-${n}`;
};

const jour = (base: Date, decalage: number): Date => {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + decalage);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};

/** Insère par lots, pour ne pas mesurer l'aller-retour réseau. */
async function parLots<T>(donnees: T[], ecrire: (lot: T[]) => Promise<unknown>): Promise<void> {
  for (let i = 0; i < donnees.length; i += LOT) {
    await ecrire(donnees.slice(i, i + LOT));
  }
}

/**
 * Peuple une base vide à la volumétrie demandée.
 *
 * L'ordre suit les dépendances : organisation, comptes, projets, jalons,
 * tâches, puis ce qui s'y rattache. Rien n'est aléatoire, tout est dérivé.
 */
export async function peupler(
  prisma: PrismaClient,
  cible: CibleVolumetrie = CIBLE,
  /**
   * Le catalogue de permissions, injecté plutôt qu'importé : `@rationarium/db` ne
   * dépend pas de `@rationarium/contracts`, et l'inverser pour un jeu de données
   * serait payer une dépendance pour une commodité.
   */
  permissions: readonly string[] = [],
): Promise<{ duree: number; cible: CibleVolumetrie }> {
  const depart = Date.now();
  const aujourdhui = new Date(Date.UTC(2026, 7, 16));

  // ── Organisation ────────────────────────────────────────────────────────
  // Dix directions, cinquante départements, deux cents services : une
  // collectivité de cette taille a cette forme, et le nombre de services
  // conditionne le coût du regroupement du planning.
  const directions = Array.from({ length: 10 }, (_, i) => ({
    id: uuidDe("a1", i),
    nom: `Direction ${i + 1}`,
  }));
  await prisma.direction.createMany({ data: directions });

  const departements = Array.from({ length: 50 }, (_, i) => ({
    id: uuidDe("a2", i),
    nom: `Département ${i + 1}`,
    directionId: directions[i % directions.length]!.id,
  }));
  await prisma.departement.createMany({ data: departements });

  const services = Array.from({ length: 200 }, (_, i) => ({
    id: uuidDe("a3", i),
    nom: `Service ${i + 1}`,
    departementId: departements[i % departements.length]!.id,
  }));
  await prisma.service.createMany({ data: services });

  // ── Comptes ─────────────────────────────────────────────────────────────
  const utilisateurs = Array.from({ length: cible.utilisateurs }, (_, i) => ({
    id: uuidDe("b1", i),
    login: `agent${i}`,
    email: `agent${i}@exemple.fr`,
    motDePasseHash: "x",
    prenom: `Prénom${i}`,
    nom: `Nom${i}`,
    departementId: departements[i % departements.length]!.id,
  }));
  await parLots(utilisateurs, (lot) => prisma.user.createMany({ data: lot }));

  // Chaque agent dans deux services : c'est le cas qui fait apparaître une
  // personne dans deux groupes du planning, et il doit peser dans la mesure.
  const appartenances = utilisateurs.flatMap((u, i) => [
    { userId: u.id, serviceId: services[i % services.length]!.id },
    { userId: u.id, serviceId: services[(i + 37) % services.length]!.id },
  ]);
  await parLots(appartenances, (lot) => prisma.userService.createMany({ data: lot }));

  // ── Projets et jalons ───────────────────────────────────────────────────
  const projets = Array.from({ length: cible.projets }, (_, i) => ({
    id: uuidDe("c1", i),
    nom: `Projet ${i + 1}`,
    statut: (i % 10 === 0 ? "done" : "active") as never,
    dateDebut: jour(aujourdhui, -400 + (i % 300)),
    dateFin: jour(aujourdhui, 100 + (i % 400)),
    chefId: utilisateurs[i % utilisateurs.length]!.id,
    departementId: departements[i % departements.length]!.id,
  }));
  await parLots(projets, (lot) => prisma.project.createMany({ data: lot }));

  const jalons = projets.flatMap((p, i) =>
    Array.from({ length: 5 }, (_, j) => ({
      id: uuidDe("d1", i * 5 + j),
      nom: `Jalon ${j + 1}`,
      projectId: p.id,
      dateEcheance: jour(aujourdhui, -200 + j * 90 + (i % 60)),
    })),
  );
  await parLots(jalons, (lot) => prisma.milestone.createMany({ data: lot }));

  const membres = projets.flatMap((p, i) =>
    Array.from({ length: 8 }, (_, j) => ({
      projectId: p.id,
      userId: utilisateurs[(i * 8 + j) % utilisateurs.length]!.id,
      roleProjet: (["contributeur", "responsable", "observateur"] as const)[j % 3]!,
    })),
  );
  await parLots(membres, (lot) => prisma.projectMember.createMany({ data: lot }));

  // ── Tâches ──────────────────────────────────────────────────────────────
  // Étalées sur l'historique demandé : une base dont toutes les tâches
  // tombent dans la même semaine ne mesure aucun index de date.
  const etendue = cible.annees * 365;
  const taches = Array.from({ length: cible.taches }, (_, i) => {
    const debut = jour(aujourdhui, -etendue + ((i * 7) % etendue));
    return {
      id: uuidDe("e1", i),
      titre: `Tâche ${i + 1}`,
      projectId: projets[i % projets.length]!.id,
      milestoneId: jalons[i % jalons.length]!.id,
      statut: (["todo", "doing", "review", "done", "blocked"] as const)[i % 5]! as never,
      priorite: (["low", "normal", "high", "critical"] as const)[i % 4]! as never,
      dateDebut: debut,
      dateFin: jour(debut, 1 + (i % 9)),
      avancement: (i * 7) % 101,
      confidentielle: i % 97 === 0,
    };
  });
  await parLots(taches, (lot) => prisma.task.createMany({ data: lot }));

  // Deux assignés sur une tâche sur cinq : le multi-assigné est un cas
  // nominal (`RG-TSK-11`), il doit peser dans les jointures.
  const assignations = taches.flatMap((t, i) => {
    const premier = { taskId: t.id, userId: utilisateurs[i % utilisateurs.length]!.id, porteur: true };
    return i % 5 === 0
      ? [premier, { taskId: t.id, userId: utilisateurs[(i + 13) % utilisateurs.length]!.id, porteur: false }]
      : [premier];
  });
  await parLots(assignations, (lot) => prisma.taskAssignee.createMany({ data: lot }));

  // ── Occupations : congés, télétravail, événements ───────────────────────
  const typeConge = await prisma.leaveType.create({
    data: { code: "CA-VOL", nom: "Congés annuels" },
  });

  // Vingt congés par agent sur l'historique : c'est ce qui remplit la table la
  // plus consultée par le planning après les tâches.
  const conges = utilisateurs.flatMap((u, i) =>
    Array.from({ length: 20 }, (_, j) => {
      const debut = jour(aujourdhui, -etendue + ((i * 11 + j * 61) % etendue));
      return {
        userId: u.id,
        typeId: typeConge.id,
        dateDebut: debut,
        dateFin: jour(debut, 4),
        joursOuvres: 5,
        statut: (j % 4 === 0 ? "pending" : "approved") as never,
      };
    }),
  );
  await parLots(conges, (lot) => prisma.leave.createMany({ data: lot, skipDuplicates: true }));

  // Le télétravail sur l'année écoulée seulement : au-delà, il n'est plus lu.
  const teletravail = utilisateurs.flatMap((u, i) =>
    Array.from({ length: 40 }, (_, j) => ({
      userId: u.id,
      date: jour(aujourdhui, -300 + ((i + j * 7) % 300)),
      etat: (j % 3 === 0 ? "telework" : "office") as never,
    })),
  );
  await parLots(teletravail, (lot) =>
    prisma.telework.createMany({ data: lot, skipDuplicates: true }),
  );

  const evenements = Array.from({ length: 2_000 }, (_, i) => ({
    id: uuidDe("f1", i),
    titre: `Événement ${i + 1}`,
    date: jour(aujourdhui, -etendue + ((i * 13) % etendue)),
    journeeEntiere: i % 3 === 0,
    projectId: projets[i % projets.length]!.id,
  }));
  await parLots(evenements, (lot) => prisma.event.createMany({ data: lot }));

  const participants = evenements.flatMap((e, i) =>
    Array.from({ length: 6 }, (_, j) => ({
      eventId: e.id,
      userId: utilisateurs[(i * 6 + j) % utilisateurs.length]!.id,
    })),
  );
  await parLots(participants, (lot) =>
    prisma.eventParticipant.createMany({ data: lot, skipDuplicates: true }),
  );

  // ── Historique : saisies de temps et instantanés ────────────────────────
  const saisies = Array.from({ length: 20_000 }, (_, i) => ({
    userId: utilisateurs[i % utilisateurs.length]!.id,
    taskId: taches[i % taches.length]!.id,
    projectId: projets[i % projets.length]!.id,
    date: jour(aujourdhui, -etendue + ((i * 3) % etendue)),
    heures: 1 + (i % 7),
  }));
  await parLots(saisies, (lot) => prisma.timeEntry.createMany({ data: lot }));

  // `RG-RPT-03` — la tendance s'appuie sur les instantanés : sans historique,
  // la mesure du rapport ne mesure rien.
  const instantanes = projets.flatMap((p, i) =>
    Array.from({ length: 60 }, (_, j) => ({
      projectId: p.id,
      date: jour(aujourdhui, -j * 7),
      progression: (i + j) % 101,
      tachesTotal: 100,
      tachesFinies: (i + j) % 100,
      heuresConsommees: 10 + j,
    })),
  );
  await parLots(instantanes, (lot) =>
    prisma.projectSnapshot.createMany({ data: lot, skipDuplicates: true }),
  );

  // ── Rôles et permissions — vue 32, matrice 26 × 30 ──────────────────────
  // Sans rôle, la mesure de la matrice de permissions n'a rien à mesurer, et
  // un audit qui saute une vue n'est plus exhaustif. Les permissions sont
  // celles du catalogue, prises telles quelles.
  const role = await prisma.role.create({
    data: { code: "VOL-ADMIN", nom: "Rôle de volumétrie", systeme: false },
  });
  await parLots(
    permissions.map((permission) => ({ roleId: role.id, permission })),
    (lot) => prisma.rolePermission.createMany({ data: lot, skipDuplicates: true }),
  );
  await prisma.user.updateMany({
    where: { id: utilisateurs[0]!.id },
    data: { roleId: role.id },
  });

  // ── Compétences — vue 22, matrice dense ─────────────────────────────────
  const competences = Array.from({ length: 60 }, (_, i) => ({
    id: uuidDe("0c", i),
    nom: `Compétence ${i + 1}`,
    categorie: (["technical", "methodology", "soft_skill", "business"] as const)[i % 4]!,
  }));
  await prisma.skill.createMany({ data: competences });

  const detentions = utilisateurs.flatMap((u, i) =>
    Array.from({ length: 6 }, (_, j) => ({
      userId: u.id,
      skillId: competences[(i + j * 11) % competences.length]!.id,
      niveau: (["beginner", "intermediate", "expert", "master"] as const)[(i + j) % 4]! as never,
    })),
  );
  await parLots(detentions, (lot) =>
    prisma.userSkill.createMany({ data: lot, skipDuplicates: true }),
  );

  return { duree: Date.now() - depart, cible };
}
