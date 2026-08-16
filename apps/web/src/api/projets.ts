import { appeler } from "./client.js";

/**
 * Les appels du domaine projet — M4, M5.
 *
 * Les types décrivent ce que le serveur **renvoie**, pas ce que la base
 * contient : la fiche reçoit une progression et un budget consommé qui
 * n'existent nulle part en base, parce qu'ils sont calculés (`RG-PRJ-07`).
 */

export type Personne = { id: string; prenom: string; nom: string };

export type LigneProjet = {
  id: string;
  nom: string;
  description: string | null;
  statut: string;
  priorite: string;
  dateDebut: string;
  dateFin: string;
  budgetHeures: string | null;
  icone: string | null;
  archive: boolean;
  chef: Personne | null;
  progression: number;
  _count: { taches: number; membres: number };
};

/** `EX-PRJ-01` — le portefeuille sait dire « {n} sur {total} » quand il filtre. */
export type Portefeuille = { projets: LigneProjet[]; affiches: number; total: number };

export type Budget = {
  alloue: number | null;
  consomme: number;
  restant: number | null;
  depassement: boolean;
};

export type FicheProjet = {
  id: string;
  nom: string;
  description: string | null;
  statut: string;
  priorite: string;
  dateDebut: string;
  dateFin: string;
  budgetHeures: string | null;
  icone: string | null;
  archive: boolean;
  version: number;
  creeLe: string;
  chef: Personne | null;
  sponsor: Personne | null;
  createur: Personne | null;
  progression: number;
  budget: Budget;
  taches: { total: number; enCours: number; bloquees: number };
  equipe: { agents: number; tiers: number; clients: number };
  jalons: number;
  epopees: number;
  clients: { id: string; nom: string }[];
  dernierInstantane: { date: string; progression: number } | null;
};

export type TacheDeJalon = {
  id: string;
  titre: string;
  statut: string;
  priorite: string;
  avancement: number;
  dateFin: string | null;
  /** La charge estimée — la maquette la pose sur chaque ligne. */
  estimationHeures: string | number | null;
  /** Qui la porte. Sans eux, la feuille de route ne dit pas si un jalon tiendra. */
  assignes: { user: { id: string; prenom: string; nom: string } }[];
};

export type Jalon = {
  id: string;
  nom: string;
  description: string | null;
  dateEcheance: string | null;
  statut: "pending" | "doing" | "done";
  taches: TacheDeJalon[];
};

export type FeuilleDeRoute = {
  jalons: Jalon[];
  /** `RG-JAL-05` — les tâches détachées d'un jalon supprimé existent encore. */
  sansJalon: TacheDeJalon[];
  indicateurs: {
    total: number;
    termines: number;
    enCours: number;
    taches: number;
    sansJalon: number;
  };
};

export type Impact = {
  blocages: { objet: string; nombre: number }[];
  effacements: { objet: string; nombre: number }[];
  alternative: "archiver" | null;
};

const params = (filtres: Record<string, string | boolean | undefined>) => {
  const q = new URLSearchParams();
  for (const [cle, valeur] of Object.entries(filtres)) {
    if (valeur !== undefined && valeur !== "") q.set(cle, String(valeur));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
};

export const portefeuille = (filtres: {
  recherche?: string;
  statut?: string;
  priorite?: string;
  archive?: boolean;
}) => appeler<Portefeuille>(`/projets${params(filtres)}`);

export const fiche = (id: string) => appeler<FicheProjet>(`/projets/${id}`);

export const feuilleDeRoute = (id: string) =>
  appeler<FeuilleDeRoute>(`/projets/${id}/feuille-de-route`);

export const creerProjet = (donnees: {
  nom: string;
  description?: string;
  statut?: string;
  priorite?: string;
  dateDebut: string;
  dateFin: string;
  budgetHeures?: number;
  icone?: string;
  chefId?: string | null;
  sponsorId?: string | null;
  departementId?: string | null;
}) => appeler<{ id: string }>("/projets", { methode: "POST", corps: donnees });

export const archiverProjet = (id: string, archive: boolean) =>
  appeler<void>(`/projets/${id}/archiver`, { methode: "POST", corps: { archive } });

export const restaurerProjet = (id: string) =>
  appeler<void>(`/projets/${id}/restaurer`, { methode: "POST" });

/**
 * L'inventaire de ce que la suppression détruirait.
 *
 * Il est demandé **avant** d'ouvrir la confirmation, jamais après : la vue 11
 * montre les volumes dans la fenêtre, et un projet dont la suppression est
 * refusée doit l'annoncer plutôt que d'offrir un bouton qui échouera.
 */
export const impactSuppression = (id: string) => appeler<Impact>(`/projets/${id}/impact`);

export const supprimerProjet = (id: string) =>
  appeler<void>(`/projets/${id}`, { methode: "DELETE" });

export const creerJalon = (
  projectId: string,
  donnees: { nom: string; description?: string; dateEcheance?: string },
) => appeler<{ id: string }>(`/projets/${projectId}/jalons`, { methode: "POST", corps: donnees });

export const supprimerJalon = (id: string) =>
  appeler<void>(`/projets/jalons/${id}`, { methode: "DELETE" });

export const ajouterMembre = (
  projectId: string,
  donnees: { userId: string; roleProjet: string; tauxAllocation?: number },
) => appeler<unknown>(`/projets/${projectId}/membres`, { methode: "POST", corps: donnees });

/**
 * `EX-PRJ-09` — changer le rôle ou l'allocation d'un membre EN PLACE.
 *
 * Sans ce point d'entrée, corriger un rôle imposait de retirer la personne
 * puis de la rajouter : un lien rompu pour être refait, avec la notification
 * d'ajout qui prévient quelqu'un qu'il rejoint un projet qu'il n'a jamais
 * quitté.
 */
export const changerRoleMembre = (
  projectId: string,
  userId: string,
  donnees: { roleProjet?: string; tauxAllocation?: number | null },
) =>
  appeler<unknown>(`/projets/${projectId}/membres/${userId}`, {
    methode: "PATCH",
    corps: donnees,
  });
