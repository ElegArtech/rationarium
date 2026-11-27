import type {
  BilanPassage,
  DeclenchementPassage,
  EtatActionAgent,
  EtatPassage,
  ReglagesAssistant,
  SourceSuivi,
  TypeActionAgent,
} from "@rationarium/contracts";
import { appeler } from "./client.js";

/**
 * M22 — l'assistant de suivi, côté interface (`docs/assistant/SPEC-PHASE-1.md § 13`).
 *
 * Les formes ci-dessous sont celles que `apps/api/src/assistant/` rend
 * réellement — `jetons.service.ts`, `passages.service.ts`,
 * `actions.service.ts`, `suivis.service.ts` — et non celles que l'écran
 * aimerait recevoir. Un jeu d'essai se calque sur la signature du service.
 *
 * **Le module désactivé répond 404 partout sauf sur les réglages et la sonde**
 * (`RG-AST-01`). `GET /assistant/etat` rend alors `{ actif: false }` : c'est elle
 * qui décide si l'entrée de navigation et l'onglet « Suivi » existent.
 */

/**
 * Ce que l'agent a écrit dans un passage, tel que l'historique le décompte.
 *
 * `aValider` et `rejetees` comptent TOUTES les actions dans cet état, les
 * dépendantes d'une création de projet comprises (`RG-AST-22`) : c'est un
 * décompte d'actions, pas de projets.
 */
export type DecompteActions = {
  effectuees: number;
  refusees: number;
  defaites: number;
  aValider: number;
  rejetees: number;
};

export type Passage = {
  id: string;
  proprietaireId: string;
  declenchement: DeclenchementPassage;
  demandeurId: string | null;
  projectIds: string[];
  etat: EtatPassage;
  jetonId: string | null;
  progression: string | null;
  signeDeVie: string | null;
  priseLe: string | null;
  finLe: string | null;
  bilan: BilanPassage | null;
  erreur: string | null;
  creeLe: string;
  /** Présent dans les listes (`GET /assistant/passages`, `GET /assistant/etat`). */
  actions?: DecompteActions;
};

/** Le module désactivé ne dit rien d'autre que son état. */
export type EtatAssistantDesactive = { actif: false; mode: "desactive" };

export type EtatAssistant = {
  actif: true;
  mode: ReglagesAssistant["mode"];
  planification: string;
  agent: { joignable: boolean; dernierContact: string | null };
  jetonsValides: number;
  dernierPassage: Passage | null;
  /** `RG-AST-21` — les créations de projet qui attendent leur propriétaire (racines seules). */
  aValider: number;
};

export type EtatJeton = "valide" | "expire" | "revoque";

export type JetonAgent = {
  id: string;
  libelle: string;
  typesAutorises: TypeActionAgent[];
  creeLe: string;
  expireLe: string;
  dernierUsage: string | null;
  revoqueLe: string | null;
  etat: EtatJeton;
};

/** La réponse de création : la SEULE où le jeton figure en clair (`RG-AST-02`). */
export type JetonCree = Omit<JetonAgent, "dernierUsage" | "revoqueLe" | "etat"> & { jeton: string };

export type PlanDeSuivi = {
  projectId: string;
  consigne: string | null;
  sources: SourceSuivi[];
  silenceJours: number | null;
  actif: boolean;
  /** `0` : aucun plan encore. Toute écriture suivante porte la version lue (`RG-GEN-07`). */
  version: number;
};

export type PreuveAction = {
  source: string;
  reference: string;
  date: string;
  lien?: string;
  extrait?: string;
};

export type MotifRefus = {
  regle?: string;
  cle: string;
  message: string;
  statut: number;
  details?: unknown;
};

export type CibleAction =
  | "Project"
  | "Milestone"
  | "Task"
  | "Event"
  | "TimeEntry"
  | "Comment"
  | "ProjetSuivi";

export type ActionAgent = {
  id: string;
  passageId: string;
  projectId: string | null;
  projetNom: string | null;
  type: string;
  reference: string | null;
  cibleType: CibleAction | null;
  cibleId: string | null;
  charge: unknown;
  /** Absent ou nul pour une création : `apres` porte alors l'état créé. */
  avant?: Record<string, unknown> | null;
  apres?: Record<string, unknown> | null;
  justification: string;
  preuves: PreuveAction[];
  etat: EtatActionAgent;
  motifRefus: MotifRefus | null;
  defaiteLe: string | null;
  /** Le nom de qui a défait, déjà composé par le serveur. */
  defaitePar: string | null;
  /**
   * `RG-AST-22` — l'action-projet en attente dont celle-ci dépend : elle désigne
   * le futur projet par `@reference` et attend avec lui. Nul pour toute autre.
   */
  dependDeId: string | null;
  /** `RG-AST-21` — qui a validé ou rejeté, nom déjà composé par le serveur. */
  decidePar: string | null;
  decideLe: string | null;
  creeLe: string;
};

/** Ce que devient une action à la validation de la création dont elle dépend. */
export type ResultatDecision = {
  actionId: string;
  etat: EtatActionAgent;
  cibleId: string | null;
  motif: MotifRefus | null;
};

/** `POST /assistant/actions/:id/valider` — le projet, puis ses dépendantes dans leur ordre. */
export type CompteRenduValidation = {
  projet: ResultatDecision;
  dependantes: ResultatDecision[];
};

export type CompteRenduDefaire = {
  defaites: string[];
  restees: { actionId: string; message: string }[];
};

const requete = (filtres: Record<string, string | number | undefined>): string => {
  const q = new URLSearchParams();
  for (const [cle, valeur] of Object.entries(filtres)) {
    if (valeur !== undefined && valeur !== "") q.set(cle, String(valeur));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
};

// ── Réglages — EX-AST-01, EX-AST-05 ─────────────────────────────────────────

export const reglages = () => appeler<ReglagesAssistant>("/assistant/reglages");

export const enregistrerReglages = (valeurs: ReglagesAssistant) =>
  appeler<ReglagesAssistant>("/assistant/reglages", { methode: "PUT", corps: valeurs });

// ── État ────────────────────────────────────────────────────────────────────

export const etat = () => appeler<EtatAssistant | EtatAssistantDesactive>("/assistant/etat");

// ── Jetons — EX-AST-02 ──────────────────────────────────────────────────────

export const jetons = () => appeler<JetonAgent[]>("/assistant/jetons");

export const creerJeton = (donnees: {
  libelle: string;
  typesAutorises?: TypeActionAgent[];
  joursValidite?: number;
}) => appeler<JetonCree>("/assistant/jetons", { methode: "POST", corps: donnees });

export const revoquerJeton = (id: string) =>
  appeler<{ id: string; revoqueLe: string }>(`/assistant/jetons/${id}/revoquer`, {
    methode: "POST",
    corps: {},
  });

// ── Plans de suivi — EX-AST-03 ──────────────────────────────────────────────

export const planDeSuivi = (projectId: string) =>
  appeler<PlanDeSuivi>(`/assistant/suivis/${projectId}`);

export const enregistrerPlanDeSuivi = (
  projectId: string,
  donnees: {
    consigne: string | null;
    sources: SourceSuivi[];
    silenceJours: number | null;
    actif: boolean;
    version: number;
  },
) => appeler<PlanDeSuivi>(`/assistant/suivis/${projectId}`, { methode: "PUT", corps: donnees });

// ── Passages — EX-AST-04, EX-AST-09 ─────────────────────────────────────────

export const passages = (filtres: { etat?: EtatPassage | ""; limite?: number } = {}) =>
  appeler<(Passage & { actions: DecompteActions })[]>(`/assistant/passages${requete(filtres)}`);

export const passage = (id: string) => appeler<Passage>(`/assistant/passages/${id}`);

export const lancerPassage = (projectIds?: string[]) =>
  appeler<Passage>("/assistant/passages", {
    methode: "POST",
    corps: projectIds && projectIds.length > 0 ? { projectIds } : {},
  });

export const annulerPassage = (id: string) =>
  appeler<Passage>(`/assistant/passages/${id}/annuler`, { methode: "POST", corps: {} });

export const defairePassage = (id: string) =>
  appeler<CompteRenduDefaire>(`/assistant/passages/${id}/defaire`, { methode: "POST", corps: {} });

// ── Actions — EX-AST-06, EX-AST-07 ──────────────────────────────────────────

export const actions = (
  filtres: {
    passageId?: string;
    projectId?: string;
    etat?: EtatActionAgent;
    limite?: number;
    avant?: string;
  } = {},
) => appeler<ActionAgent[]>(`/assistant/actions${requete(filtres)}`);

export const defaireAction = (id: string) =>
  appeler<{ actionId: string; etat: "defaite" }>(`/assistant/actions/${id}/defaire`, {
    methode: "POST",
    corps: {},
  });

/**
 * `RG-AST-21` — valider une création de projet de l'agent : le projet est créé
 * avec l'identité de qui valide, puis ses actions dépendantes (`RG-AST-22`).
 */
export const valider = (id: string) =>
  appeler<CompteRenduValidation>(`/assistant/actions/${id}/valider`, { methode: "POST", corps: {} });

/** Rejeter une création de projet : rien n'est écrit, dépendantes comprises. */
export const rejeter = (id: string, motif?: string) =>
  appeler<{ actionId: string; rejetees: number }>(`/assistant/actions/${id}/rejeter`, {
    methode: "POST",
    corps: motif && motif.trim() !== "" ? { motif: motif.trim() } : {},
  });
