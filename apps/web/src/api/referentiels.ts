import { appeler } from "./client.js";

/**
 * Les appels des référentiels — M13 (compétences), M14 (tiers et clients).
 * Vues 22, 23, 24, 25, 26.
 */

const params = (filtres: Record<string, string | boolean | undefined>) => {
  const q = new URLSearchParams();
  for (const [cle, valeur] of Object.entries(filtres)) {
    if (valeur !== undefined && valeur !== "" && valeur !== false) q.set(cle, String(valeur));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
};

// ── M13 — Compétences, vue 22 ───────────────────────────────────────────────

export type Competence = {
  id: string;
  nom: string;
  categorie: string;
  description: string | null;
  effectifRequis: number;
  detenteurs: number;
  /** L'écart entre requis et détenteurs : l'information qu'on vient chercher. */
  manque: number;
};

export type ColonneMatrice = {
  id: string;
  nom: string;
  categorie: string;
  effectifRequis: number;
  detenteurs: number;
  manque: number;
  ecart: boolean;
  couverture: "complete" | "partielle";
  ratio: string;
};

/** Les niveaux sont un tableau PARALLÈLE aux colonnes, pas une carte : la
 *  matrice se lit par position, et l'ordre des colonnes fait foi. */
export type LigneMatrice = {
  agent: { id: string; prenom: string; nom: string };
  niveaux: (string | null)[];
};

export type Matrice = {
  colonnes: ColonneMatrice[];
  lignes: LigneMatrice[];
  synthese: { competences: number; avecEcart: number; couvertureMoyenne: number };
};

export const referentiel = (filtres: { categorie?: string; recherche?: string }) =>
  appeler<Competence[]>(`/competences${params(filtres)}`);

export const matrice = (filtres: { categorie?: string }) =>
  appeler<Matrice>(`/competences/matrice${params(filtres)}`);

export const creerCompetence = (donnees: {
  nom: string;
  categorie: string;
  description?: string;
  effectifRequis?: number;
}) => appeler<{ id: string }>("/competences", { methode: "POST", corps: donnees });

export const supprimerCompetence = (id: string) =>
  appeler<void>(`/competences/${id}`, { methode: "DELETE" });

export const definirNiveau = (userId: string, skillId: string, niveau: string) =>
  appeler<void>(`/competences/agents/${userId}/${skillId}`, {
    methode: "PUT",
    corps: { niveau },
  });

export const retirerCompetence = (userId: string, skillId: string) =>
  appeler<void>(`/competences/agents/${userId}/${skillId}`, { methode: "DELETE" });

// ── M14 — Tiers et clients, vues 23 à 26 ────────────────────────────────────

export type Tiers = {
  id: string;
  type: string;
  organisation: string | null;
  contactNom: string | null;
  contactEmail: string | null;
  contactTelephone: string | null;
  notes: string | null;
  /** `actif: false` est ce que le produit appelle « archivé ». */
  actif: boolean;
  _count: { projets: number; taches: number };
};

export type FicheTiers = Omit<Tiers, "_count"> & {
  projets: { id: string; nom: string; statut: string }[];
  taches: { id: string; titre: string; statut: string }[];
  heuresDeclarees: number;
  creeLe: string;
  modifieLe: string;
};

export type Client = {
  id: string;
  nom: string;
  contactNom: string | null;
  contactEmail: string | null;
  contactTelephone: string | null;
  adresse: string | null;
  notes: string | null;
  actif: boolean;
  projets: { project: { id: string; nom: string } }[];
  _count: { projets: number };
};

export type FicheClient = {
  id: string;
  nom: string;
  contactNom: string | null;
  contactEmail: string | null;
  contactTelephone: string | null;
  adresse: string | null;
  notes: string | null;
  actif: boolean;
  /** `dateFin` sert la prochaine échéance de la fiche client (vue 26). */
  projets: { id: string; nom: string; statut: string; dateFin: string | null }[];
  creeLe: string;
  modifieLe: string;
};

export type Impact = {
  blocages: { objet: string; nombre: number }[];
  effacements: { objet: string; nombre: number }[];
  alternative: "archiver" | null;
};

export const listerTiers = (filtres: { recherche?: string; type?: string; archive?: boolean }) =>
  appeler<Tiers[]>(`/tiers${params(filtres)}`);

export const ficheTiers = (id: string) => appeler<FicheTiers>(`/tiers/${id}`);

export const impactTiers = (id: string) => appeler<Impact>(`/tiers/${id}/impact`);

export const creerTiers = (donnees: {
  type: string;
  organisation?: string | null;
  contactNom?: string | null;
  contactEmail?: string | null;
  contactTelephone?: string | null;
  notes?: string;
}) => appeler<{ id: string }>("/tiers", { methode: "POST", corps: donnees });

/**
 * `EX-TRS-02` — modifier un tiers, ou l'archiver.
 *
 * Corriger un numéro de téléphone imposait jusqu'ici de SUPPRIMER le tiers,
 * donc de rompre ses rattachements de projet et de perdre le temps déclaré
 * pour lui.
 */
export const modifierTiers = (
  id: string,
  donnees: {
    type?: string;
    organisation?: string | null;
    contactNom?: string | null;
    contactEmail?: string | null;
    contactTelephone?: string | null;
    notes?: string | null;
    actif?: boolean;
  },
) => appeler<{ id: string }>(`/tiers/${id}`, { methode: "PATCH", corps: donnees });

/** `EX-TRS-02` — rattacher un tiers à un projet, préalable à toute assignation. */
export const rattacherTiersAuProjet = (projetId: string, thirdPartyId: string) =>
  appeler<void>(`/tiers/projets/${projetId}/rattacher`, {
    methode: "POST",
    corps: { thirdPartyId },
  });

export const supprimerTiers = (id: string) => appeler<void>(`/tiers/${id}`, { methode: "DELETE" });

export const listerClients = (filtres: { recherche?: string; actif?: boolean }) =>
  appeler<Client[]>(`/clients${params(filtres)}`);

export const ficheClient = (id: string) => appeler<FicheClient>(`/clients/${id}`);

export const impactClient = (id: string) => appeler<Impact>(`/clients/${id}/impact`);

export const supprimerClient = (id: string) =>
  appeler<void>(`/clients/${id}`, { methode: "DELETE" });

/**
 * `RG-PRJ-10` — les clients d'un projet sont **remplacés en bloc**.
 *
 * Rattacher ou détacher se fait donc en relisant la liste courante et en
 * renvoyant celle qu'on veut : une écriture incrémentale exposerait un état
 * intermédiaire sans bénéficiaire.
 */
export const definirClientsDuProjet = (projetId: string, clientIds: string[]) =>
  appeler<{ rattaches: number; dejaRattaches: number }>(`/clients/projets/${projetId}`, {
    methode: "POST",
    corps: { clientIds },
  });

export const creerClient = (donnees: {
  nom: string;
  contactNom?: string | null;
  contactEmail?: string | null;
  contactTelephone?: string | null;
  adresse?: string | null;
  notes?: string;
}) => appeler<{ id: string }>("/clients", { methode: "POST", corps: donnees });

/** `EX-CLI-02` — modifier un client, ou le rendre inactif. Réversible. */
export const modifierClient = (
  id: string,
  donnees: {
    nom?: string;
    contactNom?: string | null;
    contactEmail?: string | null;
    contactTelephone?: string | null;
    adresse?: string | null;
    notes?: string | null;
    actif?: boolean;
  },
) => appeler<{ id: string }>(`/clients/${id}`, { methode: "PATCH", corps: donnees });
