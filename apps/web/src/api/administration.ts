import { appeler } from "./client.js";
import type { Personne } from "./projets.js";

/**
 * Les appels d'administration — M2 (organisation), M3 (comptes).
 * Vues 27, 28, 29.
 */

const params = (filtres: Record<string, string | boolean | undefined>) => {
  const q = new URLSearchParams();
  for (const [cle, valeur] of Object.entries(filtres)) {
    if (valeur !== undefined && valeur !== "" && valeur !== false) q.set(cle, String(valeur));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
};

// ── M3 — Utilisateurs, vues 27 et 28 ────────────────────────────────────────

export type Utilisateur = {
  id: string;
  prenom: string;
  nom: string;
  email: string;
  login: string;
  actif: boolean;
  derniereConnexion: string | null;
  version: number;
  role: { id: string; code: string; nom: string } | null;
  departement: { id: string; nom: string } | null;
  services: { service: { id: string; nom: string } }[];
};

export type Impact = {
  nom: string;
  blocages: { objet: string; nombre: number }[];
  effacements: { objet: string; nombre: number }[];
};

export const utilisateurs = (filtres: {
  recherche?: string;
  departementId?: string;
  serviceId?: string;
  roleId?: string;
  actif?: boolean;
}) => appeler<{ utilisateurs: Utilisateur[] }>(`/utilisateurs${params(filtres)}`);

export const creerUtilisateur = (donnees: {
  prenom: string;
  nom: string;
  email: string;
  login: string;
  motDePasse: string;
  roleId?: string | null;
  departementId?: string | null;
  serviceIds?: string[];
}) => appeler<{ id: string }>("/utilisateurs", { methode: "POST", corps: donnees });

export const desactiverUtilisateur = (id: string) =>
  appeler<void>(`/utilisateurs/${id}/desactiver`, { methode: "POST" });

export const reactiverUtilisateur = (id: string) =>
  appeler<void>(`/utilisateurs/${id}/reactiver`, { methode: "POST" });

export const impactUtilisateur = (id: string) => appeler<Impact>(`/utilisateurs/${id}/impact`);

export const supprimerUtilisateur = (id: string) =>
  appeler<void>(`/utilisateurs/${id}`, { methode: "DELETE" });

export const reinitialiserMotDePasse = (id: string, nouveau: string) =>
  appeler<void>(`/utilisateurs/${id}/mot-de-passe`, { methode: "POST", corps: { nouveau } });

/**
 * Le suivi individuel — vue 28.
 *
 * **Chaque bloc porte son étendue** : les heures et les jours de télétravail
 * suivent la période demandée, le solde de congés suit l'année civile, les
 * tâches actives valent à l'instant. Les confondre sous un même en-tête
 * donnerait des nombres justes séparément et faux ensemble.
 */
export type Suivi = {
  agent: {
    id: string;
    prenom: string;
    nom: string;
    email: string;
    login: string;
    actif: boolean;
    creeLe: string;
    derniereConnexion: string | null;
    role: { code: string; nom: string } | null;
    departement: { id: string; nom: string } | null;
    services: { id: string; nom: string }[];
  };
  periode: { debut: string; fin: string; annee: number };
  taches: {
    id: string;
    titre: string;
    statut: string;
    priorite: string;
    avancement: number;
    dateFin: string | null;
    project: { id: string; nom: string } | null;
  }[];
  conges: {
    id: string;
    statut: string;
    dateDebut: string;
    dateFin: string;
    joursOuvres: string;
    type: { id: string; nom: string; couleur: string | null };
    repartitions: { annee: number; jours: string }[];
  }[];
  teletravail: { date: string; etat: string; issuDeRegle: boolean }[];
  temps: {
    id: string;
    date: string;
    heures: string;
    typeActivite: string;
    description: string | null;
    project: { id: string; nom: string } | null;
  }[];
  competences: { id: string; nom: string; categorie: string; niveau: string }[];
  statistiques: {
    tachesActives: number;
    tachesTerminees: number;
    tachesBloquees: number;
    joursTeletravail: number;
    heuresSaisies: number;
    congesAnnee: number;
    projetsActifs: number;
    competences: number;
  };
};

export const suivi = (id: string, debut: string, fin: string) =>
  appeler<Suivi>(`/utilisateurs/${id}/suivi${params({ debut, fin })}`);

// ── M2 — Organisation, vue 29 ───────────────────────────────────────────────

export type Service = {
  id: string;
  nom: string;
  description: string | null;
  manager: Personne | null;
  _count: { membres: number };
};

export type Departement = {
  id: string;
  nom: string;
  description: string | null;
  creeLe: string;
  responsable: Personne | null;
  services: Service[];
  _count: { membres: number; services: number };
};

export type Direction = {
  id: string;
  nom: string;
  description: string | null;
  responsable: Personne | null;
  departements: Departement[];
};

export type Arborescence = {
  directions: Direction[];
  /** `RG-ORG-03` — un département peut exister hors direction. */
  departementsSansDirection: Departement[];
};

export const arborescence = () => appeler<Arborescence>("/organisation");

export const creerDirection = (donnees: {
  nom: string;
  description?: string;
  responsableId?: string | null;
}) => appeler<{ id: string }>("/organisation/directions", { methode: "POST", corps: donnees });

export const supprimerDirection = (id: string) =>
  appeler<void>(`/organisation/directions/${id}`, { methode: "DELETE" });

export const creerDepartement = (donnees: {
  nom: string;
  description?: string;
  directionId?: string | null;
  responsableId?: string | null;
}) => appeler<{ id: string }>("/organisation/departements", { methode: "POST", corps: donnees });

export const impactDepartement = (id: string) =>
  appeler<{ nom: string; servicesSupprimes: string[]; agentsDetaches: number }>(
    `/organisation/departements/${id}/impact`,
  );

export const supprimerDepartement = (id: string) =>
  appeler<void>(`/organisation/departements/${id}`, { methode: "DELETE" });

export const creerService = (donnees: {
  nom: string;
  description?: string;
  departementId: string;
  managerId?: string | null;
}) => appeler<{ id: string }>("/organisation/services", { methode: "POST", corps: donnees });

// ── M19 — Paramétrage, vue 31 ───────────────────────────────────────────────

export type JourFerie = {
  id: string;
  date: string;
  libelle: string;
  type: string;
  /** `RG-PRM-02` — un férié ouvré compte comme travaillé dans les congés. */
  ouvre: boolean;
  recurrent: boolean;
};

export type Vacances = {
  id: string;
  libelle: string;
  dateDebut: string;
  dateFin: string;
  zone: string;
  anneeScolaire: string;
  importee: boolean;
};

export const reglages = () => appeler<Record<string, string>>("/parametrage");

export const enregistrerReglages = (valeurs: Record<string, string>) =>
  appeler<Record<string, string>>("/parametrage", {
    methode: "PUT",
    corps: { reglages: valeurs },
  });

export const joursFeries = (annee: number) =>
  appeler<{
    feries: JourFerie[];
    statistiques: { total: number; chomes: number; ouvres: number; legaux: number };
  }>(`/parametrage/feries${params({ annee: String(annee) })}`);

export const importerFeries = (annee: number) =>
  appeler<{ crees: number; existants: number }>("/parametrage/feries/importer", {
    methode: "POST",
    corps: { annee },
  });

export const vacancesScolaires = (anneeScolaire?: string) =>
  appeler<{
    vacances: Vacances[];
    statistiques: { total: number; importees: number; manuelles: number };
  }>(`/parametrage/vacances${params(anneeScolaire ? { anneeScolaire } : {})}`);

// ── M20 — Rôles et audit, vues 32 et 33 ─────────────────────────────────────

export type Role = {
  id: string;
  code: string;
  nom: string;
  description: string | null;
  systeme: boolean;
  version: number;
  nombrePermissions: number;
  nombreUtilisateurs: number;
};

/**
 * La matrice, telle que le serveur la construit.
 *
 * `detenue: null` signifie que le croisement **n'existe pas** au catalogue —
 * on n'« approuve » pas un département. C'est le serveur qui le sait, à partir
 * du catalogue de `@trame/contracts` ; le reconstruire côté client créerait une
 * seconde source de vérité qui divergerait au premier ajout de permission.
 */
export type Matrice = {
  role: { id: string; code: string; nom: string; systeme: boolean; version: number };
  actions: string[];
  lignes: {
    domaine: string;
    cases: { action: string; permission: string; detenue: boolean | null }[];
  }[];
};

export const roles = () => appeler<Role[]>("/administration/roles");

export const catalogue = () =>
  appeler<{ permissions: string[]; modeles: { code: string; nom: string }[] }>(
    "/administration/catalogue",
  );

export const matriceRole = (id: string) => appeler<Matrice>(`/administration/roles/${id}/matrice`);

export const definirPermissions = (id: string, permissions: string[]) =>
  appeler<void>(`/administration/roles/${id}/permissions`, {
    methode: "PUT",
    corps: { permissions },
  });

export type EvenementAudit = {
  id: string;
  horodatage: string;
  action: string;
  typeEntite: string;
  entiteId: string;
  /** `RG-ADM-09` — une action système n'est pas une action humaine. */
  systeme: boolean;
  /** Un acteur supprimé laisse sa trace : l'entrée survit à la personne. */
  acteur: { id: string; prenom?: string; nom?: string; supprime?: boolean } | null;
  detail: unknown;
};

export type Curseur = { horodatage: string; id: string };

export const journal = (filtres: {
  acteurId?: string;
  action?: string;
  typeEntite?: string;
  entiteId?: string;
  depuis?: string;
  jusqua?: string;
  curseurHorodatage?: string;
  curseurId?: string;
}) =>
  appeler<{ entrees: EvenementAudit[]; curseurSuivant: Curseur | null }>(
    `/administration/audit${params(filtres)}`,
  );

export const facettesAudit = () =>
  appeler<{ actions: string[]; typesEntite: string[] }>("/administration/audit/facettes");

// ── M8 — Tâches prédéfinies, vue 34 ─────────────────────────────────────────

export type RecurrencePredefinie = {
  id: string;
  type: string;
  frequence: number;
  jourSemaine: number | null;
  jourMois: number | null;
  ordinal: number | null;
  dateDebut: string;
  dateFin: string | null;
  active: boolean;
};

export type TachePredefinie = {
  id: string;
  nom: string;
  description: string | null;
  couleur: string | null;
  icone: string | null;
  dureeParDefaut: string;
  heureDebut: string | null;
  heureFin: string | null;
  teletravailAutorise: boolean;
  /** Pondération de la charge, de 1 (très légère) à 5 (très lourde). */
  poids: number;
  actif: boolean;
  recurrences: RecurrencePredefinie[];
  _count: { assignations: number };
};

export const cataloguePredefini = (inclureInactives = false) =>
  appeler<TachePredefinie[]>(`/activite/taches${params({ inclureInactives })}`);
