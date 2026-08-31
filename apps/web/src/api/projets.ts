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
  /** `RG-GEN-07` — accompagne la modification du statut en ligne (vue 13). */
  version: number;
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
  version: number;
};

/**
 * `EX-JAL-07` — l'épopée : un regroupement THÉMATIQUE de tâches, là où le jalon
 * est une échéance. Les deux coexistent sur une tâche, et ne se remplacent pas.
 */
export type Epopee = {
  id: string;
  nom: string;
  description: string | null;
  /** Le nombre de tâches rattachées, pas celles du projet. */
  taches: number;
  version: number;
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
  /**
   * Maquette 10 — le bouton « Mes projets ». C'est un **confort de lecture**,
   * pas un contrôle : le périmètre s'applique de toute façon au serveur, et
   * ce drapeau ne fait que le resserrer sur les projets dont on est créateur,
   * chef, sponsor ou membre (`cadrage/02 § vue 10`, variantes).
   */
  mesProjets?: boolean;
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

/**
 * `EX-PRJ-05` — modifier un projet.
 *
 * La maquette 11 pose « Modifier » sur la fiche ; aucune route ne l'a jamais
 * servi. Tous les champs sont facultatifs sauf `version` : la fiche enregistre
 * bloc par bloc, et `RG-GEN-07` veut la version lue avec chaque écriture.
 */
export const modifierProjet = (
  id: string,
  donnees: {
    nom?: string;
    description?: string | null;
    statut?: string;
    priorite?: string;
    dateDebut?: string;
    dateFin?: string;
    budgetHeures?: number | null;
    version: number;
  },
) => appeler<{ id: string }>(`/projets/${id}`, { methode: "PATCH", corps: donnees });

export const archiverProjet = (id: string, archive: boolean) =>
  appeler<void>(`/projets/${id}/archiver`, { methode: "POST", corps: { archive } });

/**
 * `EX-PRJ-07`, `RG-PRJ-02` — l'annulation logique.
 *
 * « La suppression d'un projet est d'abord logique : le projet passe au statut
 * Annulé et reste restaurable. » La route existait depuis L-32 et rien ne
 * l'appelait : **l'état `cancelled` était géré partout en aval** — le bandeau
 * d'alerte, le bouton « Restaurer », le refus de modifier un projet annulé — et
 * rien dans le produit ne pouvait le produire. Le premier temps de `RG-GEN-10`
 * manquait, donc la suppression définitive était le seul chemin offert : perdre
 * les tâches, les jalons et l'équipe pour corriger une erreur de saisie.
 */
export const annulerProjet = (id: string) =>
  appeler<void>(`/projets/${id}/annuler`, { methode: "POST" });

export const restaurerProjet = (id: string) =>
  appeler<void>(`/projets/${id}/restaurer`, { methode: "POST" });

/**
 * `EX-PRJ-13`, `RG-PRJ-09` — figer l'avancement à une date.
 *
 * L'instantané est **écrit**, jamais recalculé : une courbe de tendance
 * compare le réel à ce qu'on voyait *à l'époque*. La clé `(projet, date)` est
 * unique et le serveur fait un `upsert` — capturer deux fois le même jour
 * rafraîchit la ligne du jour, il n'en empile pas une seconde.
 *
 * **La forme de la réponse a été relevée, pas devinée.** Le serveur rend la
 * ligne `ProjectSnapshot` telle quelle, `heuresConsommees` comprise — une
 * colonne `Decimal`, donc une **chaîne** en JSON, comme `budgetHeures` plus
 * haut. La lire comme un nombre marcherait à l'affichage et casserait à la
 * première comparaison.
 *
 * Deux réserves, tenues hors de ce lot et consignées :
 * — `RG-PRJ-09` veut une capture **périodique** (`cadrage/03 § 5.4`, `pg-boss`)
 *   et **aucun travail de fond ne l'exécute** : cet appel est aujourd'hui le
 *   seul producteur d'instantanés du produit ;
 * — `EX-PRJ-13` demande de **consulter l'historique**, et aucune route ne
 *   l'expose : `fiche()` ne rend que `dernierInstantane`.
 */
export type Instantane = {
  id: string;
  projectId: string;
  date: string;
  progression: number;
  tachesTotal: number;
  tachesFinies: number;
  /** `Decimal` en base — une CHAÎNE en JSON, jamais un nombre. */
  heuresConsommees: string;
};

export const capturerInstantane = (id: string, date: string) =>
  appeler<Instantane>(`/projets/${id}/instantane`, { methode: "POST", corps: { date } });

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

export const modifierJalon = (
  id: string,
  donnees: {
    nom?: string;
    description?: string | null;
    dateEcheance?: string | null;
    version: number;
  },
) => appeler<Jalon>(`/projets/jalons/${id}`, { methode: "PATCH", corps: donnees });

export const supprimerJalon = (id: string) =>
  appeler<void>(`/projets/jalons/${id}`, { methode: "DELETE" });

// ── Épopées — `EX-JAL-07` ──────────────────────────────────────────────────

export const epopees = (projectId: string) =>
  appeler<Epopee[]>(`/projets/${projectId}/epopees`);

export const creerEpopee = (projectId: string, donnees: { nom: string; description?: string }) =>
  appeler<Epopee>(`/projets/${projectId}/epopees`, { methode: "POST", corps: donnees });

export const modifierEpopee = (
  id: string,
  donnees: { nom?: string; description?: string | null; version: number },
) => appeler<Epopee>(`/projets/epopees/${id}`, { methode: "PATCH", corps: donnees });

export const supprimerEpopee = (id: string) =>
  appeler<{ tachesDetachees: number }>(`/projets/epopees/${id}`, { methode: "DELETE" });

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
