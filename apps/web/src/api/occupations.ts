import { appeler } from "./client.js";
import type { Personne } from "./projets.js";

/**
 * Les appels des modules d'occupation — M9, M10, M11, M12.
 * Vues 18 (événements), 19 (congés), 20 (télétravail), 21 (temps passé).
 */

const params = (filtres: Record<string, string | number | boolean | undefined>) => {
  const q = new URLSearchParams();
  for (const [cle, valeur] of Object.entries(filtres)) {
    if (valeur !== undefined && valeur !== "" && valeur !== false) q.set(cle, String(valeur));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
};

// ── M9 — Événements, vue 18 ─────────────────────────────────────────────────

export type Evenement = {
  id: string;
  titre: string;
  description: string | null;
  date: string;
  journeeEntiere: boolean;
  heureDebut: string | null;
  heureFin: string | null;
  interventionExterieure: boolean;
  parentId: string | null;
  frequenceSemaines: number | null;
  jourSemaine: number | null;
  recurrenceJusqua: string | null;
  project: { id: string; nom: string } | null;
  participants: { userId: string; user: { prenom: string; nom: string } }[];
};

export const evenements = (filtres: { debut?: string; fin?: string; projectId?: string }) =>
  appeler<Evenement[]>(`/evenements${params(filtres)}`);

export const creerEvenement = (donnees: {
  titre: string;
  description?: string;
  date: string;
  journeeEntiere?: boolean;
  heureDebut?: string | null;
  heureFin?: string | null;
  projectId?: string | null;
  interventionExterieure?: boolean;
  participantIds?: string[];
  recurrence?: { frequenceSemaines: number; jourSemaine: number; jusqua: string };
}) => appeler<{ id: string }>("/evenements", { methode: "POST", corps: donnees });

export const arreterRecurrence = (id: string, aPartirDe: string) =>
  appeler<{ supprimees: number }>(`/evenements/${id}/arreter`, {
    methode: "POST",
    corps: { aPartirDe },
  });

// ── M10 — Congés, vue 19 ────────────────────────────────────────────────────

export type TypeConge = {
  id: string;
  code: string;
  nom: string;
  description: string | null;
  icone: string | null;
  couleur: string | null;
  remunere: boolean;
  validationRequise: boolean;
  limiteAnnuelle: number | null;
  actif: boolean;
  systeme: boolean;
  utilisations: number;
};

export type Solde = {
  annee: number;
  attribues: number;
  consommes: number;
  engages: number;
  disponibles: number;
};

export type SoldeParType = {
  type: {
    id: string;
    code: string;
    nom: string;
    couleur: string | null;
    icone: string | null;
    validationRequise: boolean;
  };
  solde: Solde;
};

export type DemandeConge = {
  id: string;
  statut: string;
  dateDebut: string;
  dateFin: string;
  demiJourneeDebut: string | null;
  demiJourneeFin: string | null;
  motif: string | null;
  motifRefus: string | null;
  joursOuvres: string;
  version: number;
  type: { id: string; nom: string; couleur: string | null; icone: string | null };
  user: Personne;
  validateur: Personne | null;
  /** `RG-CNG-19` — une demande à cheval sur deux ans se répartit par année. */
  repartitions: { annee: number; jours: string }[];
};

export type Delegation = {
  id: string;
  dateDebut: string;
  dateFin: string;
  active: boolean;
  delegue?: Personne;
  delegant?: Personne;
};

export const conges = (filtres: {
  userId?: string;
  aValider?: boolean;
  statut?: string;
  annee?: number;
}) => appeler<DemandeConge[]>(`/conges${params(filtres)}`);

export const typesDeConge = (inclureInactifs = false) =>
  appeler<TypeConge[]>(`/conges/types${params({ inclureInactifs })}`);

export const soldes = (annee: number, userId?: string) =>
  appeler<SoldeParType[]>(`/conges/soldes${params({ annee, ...(userId ? { userId } : {}) })}`);

export const delegations = () =>
  appeler<{ donnees: Delegation[]; recues: Delegation[] }>("/conges/delegations");

export const deposerConge = (donnees: {
  typeId: string;
  dateDebut: string;
  dateFin: string;
  demiJourneeDebut?: string | null;
  demiJourneeFin?: string | null;
  motif?: string;
  userId?: string;
}) => appeler<{ id: string }>("/conges", { methode: "POST", corps: donnees });

export const approuverConge = (id: string) =>
  appeler<void>(`/conges/${id}/approuver`, { methode: "POST" });

export const refuserConge = (id: string, motifRefus: string) =>
  appeler<void>(`/conges/${id}/refuser`, { methode: "POST", corps: { motifRefus } });

export const demanderAnnulation = (id: string) =>
  appeler<void>(`/conges/${id}/annulation`, { methode: "POST" });

export const supprimerConge = (id: string) =>
  appeler<void>(`/conges/${id}`, { methode: "DELETE" });

export const desactiverDelegation = (id: string) =>
  appeler<void>(`/conges/delegations/${id}`, { methode: "DELETE" });

export const creerDelegation = (donnees: {
  delegantId: string;
  delegueId: string;
  dateDebut: string;
  dateFin: string;
}) => appeler<{ id: string }>("/conges/delegations", { methode: "POST", corps: donnees });

// ── M11 — Télétravail, vue 20 ───────────────────────────────────────────────

export type JourTeletravail = { date: string; etat: string; issuDeRegle: boolean };
export type RegleTeletravail = {
  id: string;
  jourSemaine: number;
  dateDebut: string;
  dateFin: string | null;
  active: boolean;
};

export const planningTeletravail = (debut: string, fin: string, userId?: string) =>
  appeler<JourTeletravail[]>(
    `/teletravail${params({ debut, fin, ...(userId ? { userId } : {}) })}`,
  );

export const reglesTeletravail = (userId?: string) =>
  appeler<RegleTeletravail[]>(`/teletravail/regles${params(userId ? { userId } : {})}`);

export const basculerTeletravail = (date: string, etat: string, userId?: string) =>
  appeler<unknown>("/teletravail", {
    methode: "POST",
    corps: { date, etat, ...(userId ? { userId } : {}) },
  });

export const apercuRegle = (regle: {
  jourSemaine: number;
  dateDebut: string;
  dateFin?: string | null;
}) => appeler<{ dates: string[]; total: number }>("/teletravail/regles/apercu", {
  methode: "POST",
  corps: regle,
});

export const creerRegleTeletravail = (donnees: {
  jourSemaine: number;
  dateDebut: string;
  dateFin?: string | null;
}) => appeler<{ id: string }>("/teletravail/regles", { methode: "POST", corps: donnees });

export const genererTeletravail = (debut: string, fin: string) =>
  appeler<{ crees: number; ignores: number }>("/teletravail/generer", {
    methode: "POST",
    corps: { debut, fin },
  });

// ── M12 — Temps passé, vue 21 ───────────────────────────────────────────────

export type SaisieTemps = {
  id: string;
  date: string;
  heures: string;
  typeActivite: string;
  description: string | null;
  creeLe: string;
  project: { id: string; nom: string } | null;
  task: { id: string; titre: string } | null;
  user: Personne | null;
  thirdParty: { id: string; organisation: string | null; contactNom: string | null } | null;
};

export const temps = (filtres: {
  userId?: string;
  projectId?: string;
  debut?: string;
  fin?: string;
}) =>
  appeler<{ saisies: SaisieTemps[]; cumul: { entrees: number; heures: number } }>(
    `/temps${params(filtres)}`,
  );

export const saisirTemps = (donnees: {
  date: string;
  heures: number;
  typeActivite?: string;
  projectId?: string | null;
  taskId?: string | null;
  description?: string;
  userId?: string | null;
  thirdPartyId?: string | null;
}) => appeler<{ id: string }>("/temps", { methode: "POST", corps: donnees });

export const supprimerTemps = (id: string) =>
  appeler<void>(`/temps/${id}`, { methode: "DELETE" });
