import type { TypeActionAgent } from "@rationarium/contracts";
import type { PrismaService } from "../prisma.service.js";
import type { AppelInterne } from "./execution-interne.service.js";

/**
 * Pour chaque type d'action : la route existante qu'elle rejoue, l'entité
 * qu'elle touche, et comment la défaire (`docs/assistant/SPEC-PHASE-1.md § 9`).
 *
 * Une recette ne valide rien et n'écrit rien elle-même : elle traduit une
 * charge en appel de route. Ce que la route refuse, l'action le refuse.
 */

export type TypeCible = "Project" | "Milestone" | "Task" | "Event" | "TimeEntry" | "Comment" | "ProjetSuivi";

export type Instantane = Record<string, unknown>;

type Charge = Record<string, unknown>;

export type Recette = {
  cible: TypeCible;
  /** `true` : l'action crée l'entité ; `false` : elle modifie une entité existante. */
  creation: boolean;
  /** Le champ de la charge qui désigne l'entité modifiée. */
  champCible?: string;
  /** Le projet de l'action, pour le journal et l'onglet « Suivi » de la fiche. */
  projet: (charge: Charge, cibleId: string | null) => string | null;
  appel: (charge: Charge, proprietaireId: string) => AppelInterne;
  /** L'identifiant de l'entité créée, tiré de la réponse de la route. */
  creee?: (reponse: unknown) => string | null;
};

const sans = (charge: Charge, ...cles: string[]): Charge =>
  Object.fromEntries(Object.entries(charge).filter(([c]) => !cles.includes(c)));

const idDe = (reponse: unknown): string | null => {
  const r = reponse as { id?: unknown; evenement?: { id?: unknown } } | null;
  if (typeof r?.id === "string") return r.id;
  if (typeof r?.evenement?.id === "string") return r.evenement.id;
  return null;
};

const chaine = (v: unknown): string | null => (typeof v === "string" ? v : null);

export const RECETTES: Record<TypeActionAgent, Recette> = {
  projet_creer: {
    cible: "Project",
    creation: true,
    projet: (_c, id) => id,
    // Le chef par défaut est posé par `ActionsAgentService` : il dépend des droits du propriétaire.
    appel: (c) => ({ methode: "POST", chemin: "/projets", corps: sans(c, "suivi") }),
    creee: idDe,
  },
  projet_modifier: {
    cible: "Project",
    creation: false,
    champCible: "projectId",
    projet: (c) => chaine(c["projectId"]),
    appel: (c) => ({ methode: "PATCH", chemin: `/projets/${String(c["projectId"])}`, corps: sans(c, "projectId") }),
  },
  jalon_creer: {
    cible: "Milestone",
    creation: true,
    projet: (c) => chaine(c["projectId"]),
    appel: (c) => ({
      methode: "POST",
      chemin: `/projets/${String(c["projectId"])}/jalons`,
      corps: sans(c, "projectId"),
    }),
    creee: idDe,
  },
  jalon_modifier: {
    cible: "Milestone",
    creation: false,
    champCible: "milestoneId",
    projet: () => null,
    appel: (c) => ({
      methode: "PATCH",
      chemin: `/projets/jalons/${String(c["milestoneId"])}`,
      corps: sans(c, "milestoneId"),
    }),
  },
  tache_creer: {
    cible: "Task",
    creation: true,
    projet: (c) => chaine(c["projectId"]),
    appel: (c, proprietaireId) => {
      const assignes = Array.isArray(c["assigneIds"]) && c["assigneIds"].length > 0 ? c["assigneIds"] : [proprietaireId];
      return { methode: "POST", chemin: "/taches", corps: { ...c, assigneIds: assignes } };
    },
    creee: idDe,
  },
  tache_modifier: {
    cible: "Task",
    creation: false,
    champCible: "taskId",
    projet: () => null,
    appel: (c) => ({ methode: "PATCH", chemin: `/taches/${String(c["taskId"])}`, corps: sans(c, "taskId") }),
  },
  evenement_creer: {
    cible: "Event",
    creation: true,
    projet: (c) => chaine(c["projectId"]),
    appel: (c, proprietaireId) => {
      const participants =
        Array.isArray(c["participantIds"]) && c["participantIds"].length > 0 ? c["participantIds"] : [proprietaireId];
      return { methode: "POST", chemin: "/evenements", corps: { ...c, participantIds: participants } };
    },
    creee: idDe,
  },
  evenement_modifier: {
    cible: "Event",
    creation: false,
    champCible: "eventId",
    projet: (c) => chaine(c["projectId"]),
    appel: (c) => ({
      methode: "PATCH",
      chemin: `/evenements/${String(c["eventId"])}`,
      corps: { portee: "occurrence", ...sans(c, "eventId") },
    }),
  },
  temps_saisir: {
    cible: "TimeEntry",
    creation: true,
    projet: (c) => chaine(c["projectId"]),
    // Sans `userId`, la route impute la saisie à qui la fait : le propriétaire.
    appel: (c) => ({ methode: "POST", chemin: "/temps", corps: c }),
    creee: idDe,
  },
  commentaire_ajouter: {
    cible: "Comment",
    creation: true,
    projet: (c) => chaine(c["projectId"]),
    appel: (c) => ({ methode: "POST", chemin: "/documents/commentaires", corps: c }),
    creee: idDe,
  },
  suivi_modifier: {
    cible: "ProjetSuivi",
    creation: false,
    champCible: "projectId",
    projet: (c) => chaine(c["projectId"]),
    appel: (c) => ({
      methode: "PUT",
      chemin: `/assistant/suivis/${String(c["projectId"])}`,
      corps: sans(c, "projectId"),
    }),
  },
};

// ── Lecture des entités ─────────────────────────────────────────────────────

const CHAMPS: Record<TypeCible, string[]> = {
  Project: [
    "nom", "description", "statut", "priorite", "dateDebut", "dateFin", "budgetHeures",
    "icone", "chefId", "sponsorId", "departementId", "version",
  ],
  Milestone: ["projectId", "nom", "description", "dateEcheance", "statut", "version"],
  Task: [
    "projectId", "milestoneId", "titre", "description", "statut", "priorite", "dateDebut", "dateFin",
    "heureDebut", "heureFin", "estimationHeures", "avancement", "version",
  ],
  Event: ["projectId", "titre", "description", "date", "journeeEntiere", "heureDebut", "heureFin", "version"],
  TimeEntry: ["userId", "projectId", "taskId", "date", "heures", "typeActivite", "description"],
  Comment: ["projectId", "taskId", "contenu", "version"],
  ProjetSuivi: ["consigne", "sources", "silenceJours", "actif", "version"],
};

/** Les dates métier n'ont ni heure ni fuseau (`@db.Date`) : elles se rendent en `AAAA-MM-JJ`. */
const normaliser = (valeur: unknown): unknown => {
  if (valeur instanceof Date) return valeur.toISOString().slice(0, 10);
  if (valeur && typeof valeur === "object" && "toNumber" in valeur && typeof valeur.toNumber === "function") {
    return (valeur as { toNumber: () => number }).toNumber();
  }
  return valeur;
};

/**
 * L'état d'une entité, champ par champ, ou `null` si elle n'existe pas. Le plan
 * de suivi se désigne par son projet.
 */
export async function lireEntite(prisma: PrismaService, cible: TypeCible, id: string): Promise<Instantane | null> {
  const select = Object.fromEntries(CHAMPS[cible].map((c) => [c, true]));
  const ligne: Record<string, unknown> | null = await (() => {
    switch (cible) {
      case "Project":
        return prisma.project.findUnique({ where: { id }, select });
      case "Milestone":
        return prisma.milestone.findUnique({ where: { id }, select });
      case "Task":
        return prisma.task.findUnique({ where: { id }, select });
      case "Event":
        return prisma.event.findUnique({ where: { id }, select });
      case "TimeEntry":
        return prisma.timeEntry.findUnique({ where: { id }, select });
      case "Comment":
        return prisma.comment.findUnique({ where: { id }, select });
      case "ProjetSuivi":
        return prisma.projetSuivi.findUnique({ where: { projectId: id }, select });
    }
  })();
  if (!ligne) return null;
  return Object.fromEntries(Object.entries(ligne).map(([c, v]) => [c, normaliser(v)]));
}

/** Le projet auquel une entité appartient, pour celles dont la charge ne le dit pas. */
export async function projetDeLEntite(prisma: PrismaService, cible: TypeCible, id: string): Promise<string | null> {
  switch (cible) {
    case "Project":
    case "ProjetSuivi":
      return id;
    case "Milestone":
      return (await prisma.milestone.findUnique({ where: { id }, select: { projectId: true } }))?.projectId ?? null;
    case "Task":
      return (await prisma.task.findUnique({ where: { id }, select: { projectId: true } }))?.projectId ?? null;
    case "Event":
      return (await prisma.event.findUnique({ where: { id }, select: { projectId: true } }))?.projectId ?? null;
    case "TimeEntry":
      return (await prisma.timeEntry.findUnique({ where: { id }, select: { projectId: true } }))?.projectId ?? null;
    case "Comment":
      return (await prisma.comment.findUnique({ where: { id }, select: { projectId: true } }))?.projectId ?? null;
  }
}

/**
 * Les champs qu'une modification touche, et que défaire devra rétablir.
 *
 * `RG-TSK-17` lie le statut et l'avancement d'une tâche : terminer impose cent
 * pour cent. Une modification qui touche l'un des deux retient donc les deux,
 * sans quoi défaire rouvrirait la tâche en la laissant à cent pour cent.
 */
export function champsTouches(cible: TypeCible, charge: Charge, champCible: string | undefined): string[] {
  const touches = new Set(Object.keys(charge).filter((c) => c !== champCible && c !== "version" && c !== "portee"));
  if (cible === "Task" && (touches.has("statut") || touches.has("avancement"))) {
    touches.add("statut");
    touches.add("avancement");
  }
  return [...touches].filter((c) => CHAMPS[cible].includes(c));
}

/** L'appel qui supprime une entité créée par l'agent (`RG-AST-18`). */
export function appelSuppression(cible: TypeCible, id: string, version: number | null): AppelInterne | null {
  switch (cible) {
    case "Project":
      return { methode: "DELETE", chemin: `/projets/${id}` };
    case "Milestone":
      return { methode: "DELETE", chemin: `/projets/jalons/${id}` };
    case "Task":
      return { methode: "DELETE", chemin: `/taches/${id}` };
    case "Event":
      return { methode: "DELETE", chemin: `/evenements/${id}?version=${version ?? 1}&portee=occurrence` };
    case "TimeEntry":
      return { methode: "DELETE", chemin: `/temps/${id}` };
    case "Comment":
      return { methode: "DELETE", chemin: `/documents/commentaires/${id}` };
    case "ProjetSuivi":
      return null;
  }
}

/** L'appel qui rétablit l'état d'avant d'une modification (`RG-AST-18`). */
export function appelRetablissement(
  cible: TypeCible,
  id: string,
  avant: Instantane,
  versionActuelle: number | null,
): AppelInterne {
  const corps = { ...avant, ...(versionActuelle === null ? {} : { version: versionActuelle }) };
  switch (cible) {
    case "Project":
      return { methode: "PATCH", chemin: `/projets/${id}`, corps };
    case "Milestone":
      return { methode: "PATCH", chemin: `/projets/jalons/${id}`, corps };
    case "Task":
      return { methode: "PATCH", chemin: `/taches/${id}`, corps };
    case "Event":
      return { methode: "PATCH", chemin: `/evenements/${id}`, corps: { portee: "occurrence", ...corps } };
    case "ProjetSuivi":
      return { methode: "PUT", chemin: `/assistant/suivis/${id}`, corps };
    case "TimeEntry":
    case "Comment":
      // Aucune action de l'agent ne modifie une saisie de temps ou un commentaire.
      throw new Error(`aucun rétablissement pour ${cible}`);
  }
}
