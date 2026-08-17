import { appeler } from "./client.js";

/**
 * M7 — le planning unifié. Vues 07, 08, 09.
 *
 * `RG-PLN-01` — **un seul appel** rapporte la période entière. Le type reflète
 * cette promesse : il n'y a pas six requêtes à coordonner côté vue, donc pas
 * six états de chargement à réconcilier, donc pas de grille qui se remplit par
 * morceaux.
 */

const params = (filtres: Record<string, string | boolean | undefined>) => {
  const q = new URLSearchParams();
  for (const [cle, valeur] of Object.entries(filtres)) {
    if (valeur !== undefined && valeur !== "" && valeur !== false) q.set(cle, String(valeur));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
};

export type PersonnePlanning = {
  id: string;
  prenom: string;
  nom: string;
  avatarFichier: string | null;
  avatarPredefini: string | null;
  departement: { id: string; nom: string } | null;
  services: { service: { id: string; nom: string } }[];
};

export type TachePlanning = {
  id: string;
  titre: string;
  statut: string;
  priorite: string;
  avancement: number;
  dateDebut: string | null;
  dateFin: string | null;
  heureDebut: string | null;
  heureFin: string | null;
  interventionExterieure: boolean;
  project: { id: string; nom: string; icone: string | null } | null;
  assignes: string[];
  /** Une tâche hors projet doit être **visuellement distincte** (vue 07). */
  horsProjet: boolean;
  /** `RG-TSK-11` — le glisser-déposer en date lui est refusé. */
  multiAssignee: boolean;
};

export type CongePlanning = {
  id: string;
  userId: string;
  dateDebut: string;
  dateFin: string;
  statut: string;
  demiJourneeDebut: string | null;
  demiJourneeFin: string | null;
  type: { id: string; nom: string; couleur: string | null; icone: string | null };
};

export type TeletravailPlanning = {
  id: string;
  userId: string;
  date: string;
  etat: string;
  issuDeRegle: boolean;
  version: number;
};

export type EvenementPlanning = {
  id: string;
  titre: string;
  date: string;
  journeeEntiere: boolean;
  heureDebut: string | null;
  heureFin: string | null;
  interventionExterieure: boolean;
  project: { id: string; nom: string } | null;
  participants: string[];
};

export type PermanencePlanning = {
  id: string;
  userId: string;
  date: string;
  periode: string;
  realisee: boolean;
  predefinedTask: {
    id: string;
    nom: string;
    couleur: string | null;
    icone: string | null;
    heureDebut: string | null;
    heureFin: string | null;
  };
};

export type Planning = {
  periode: { debut: string; fin: string; jours: string[] };
  groupes: { service: { id: string; nom: string } | null; personnes: PersonnePlanning[] }[];
  occupations: {
    taches: TachePlanning[];
    conges: CongePlanning[];
    teletravail: TeletravailPlanning[];
    evenements: EvenementPlanning[];
    /** `RG-PLN-07` — `null` signifie « pas le droit », pas « aucune ». */
    permanences: PermanencePlanning[] | null;
  };
  trame: {
    joursChomes: string[];
    vacances: { libelle: string; dateDebut: string; dateFin: string; zone: string }[];
  };
  synthese: { date: string; absents: number; total: number; pourcentage: number }[];
};

export type FiltresPlanning = {
  debut: string;
  fin: string;
  services?: string[];
  departementId?: string;
  ressourceId?: string;
  monPerimetre?: boolean;
};

export const planning = (f: FiltresPlanning) =>
  appeler<Planning>(
    `/planning${params({
      debut: f.debut,
      fin: f.fin,
      ...(f.services?.length ? { services: f.services.join(",") } : {}),
      ...(f.departementId ? { departementId: f.departementId } : {}),
      ...(f.ressourceId ? { ressourceId: f.ressourceId } : {}),
      ...(f.monPerimetre ? { monPerimetre: true } : {}),
    })}`,
  );

/**
 * `EX-PLN-10` — déplacer une tâche.
 *
 * La réponse dit ce qui a **effectivement** changé, et pourquoi le reste n'a
 * pas bougé : sur une tâche multi-assignée, la date ne suit pas l'assigné.
 */
export const deplacerTache = (donnees: {
  taskId: string;
  nouvelleDate?: string;
  nouvelAssigneId?: string;
  ancienAssigneId?: string;
}) =>
  appeler<{ dateModifiee: boolean; assigneModifie: boolean; avertissement?: string }>(
    "/planning/taches/deplacer",
    { methode: "PATCH", corps: donnees },
  );

/** `EX-PLN-09` — basculer le télétravail depuis la cellule. */
export const basculerTeletravail = (donnees: { userId: string; date: string; etat: string }) =>
  appeler<{ id: string; etat: string }>("/planning/teletravail", {
    methode: "PATCH",
    corps: donnees,
  });

export const importerIcs = (contenu: string) =>
  appeler<{ crees: number; existants: number; ignores: number }>("/planning/ics", {
    methode: "POST",
    corps: { contenu },
  });

/** L'adresse de l'export : ouverte par le navigateur, pas lue en mémoire. */
export const adresseExportIcs = (f: FiltresPlanning) =>
  `/api/planning/ics${params({
    debut: f.debut,
    fin: f.fin,
    ...(f.services?.length ? { services: f.services.join(",") } : {}),
    ...(f.monPerimetre ? { monPerimetre: true } : {}),
  })}`;

// ── Vue 09 — la grille d'activité ───────────────────────────────────────────

export type GrilleActivite = {
  colonnes: {
    id: string;
    nom: string;
    couleur: string | null;
    icone: string | null;
    heureDebut: string | null;
    heureFin: string | null;
  }[];
  lignes: {
    date: string;
    cellules: {
      tacheId: string;
      agents: {
        id: string;
        prenom: string;
        nom: string;
        /** `EX-ACT-06` — l'identifiant de l'assignation, pour déclarer sa
         *  réalisation sans une seconde requête. */
        assignationId: string;
        periode: string;
        realisee: boolean;
        /** Le rattachement de l'agent — une personne peut relever de plusieurs
         *  services. C'est ce qui rend le filtre « Service » de la vue 09
         *  possible sans un second appel. */
        services: { service: { id: string; nom: string } }[];
      }[];
    }[];
  }[];
  trame: {
    joursChomes: string[];
    vacances: { libelle: string; dateDebut: string; dateFin: string; zone: string }[];
  };
};

export const grilleActivite = (debut: string, fin: string) =>
  appeler<GrilleActivite>(`/planning/activite${params({ debut, fin })}`);

/**
 * `RG-PLN-08` — l'éligibilité, agent par agent.
 *
 * Le champ porteur est `motif` : `null` veut dire éligible. Le serveur nomme
 * la raison plutôt que de masquer l'agent — une liste courte sans explication
 * fait chercher qui manque, et pourquoi.
 */
export type Eligibilite = {
  userId: string;
  prenom: string;
  nom: string;
  motif: "deja_assigne" | "en_conge" | "en_teletravail" | null;
  /** Le type de congé, quand c'est lui qui bloque. */
  detail?: string | null;
};

export const eligibilite = (predefinedTaskId: string, date: string, periode = "full_day") =>
  appeler<Eligibilite[]>(
    `/activite/eligibilite${params({ predefinedTaskId, date, periode })}`,
  );

export const assignerPermanence = (donnees: {
  predefinedTaskId: string;
  userIds: string[];
  date: string;
  periode: string;
}) =>
  appeler<{ crees: number }>("/activite/assignations", { methode: "POST", corps: donnees });

export const declarerRealisation = (assignationId: string, realisee: boolean) =>
  appeler<void>("/activite/assignations/realisation", {
    methode: "POST",
    corps: { assignationId, realisee },
  });
