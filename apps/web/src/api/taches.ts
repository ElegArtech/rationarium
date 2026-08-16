import { appeler } from "./client.js";
import type { Personne } from "./projets.js";

/** Les appels du domaine tâche — M6. Vues 12, 16, 17. */

export type Assigne = { userId: string; porteur: boolean; user: { prenom: string; nom: string } };

export type LigneTache = {
  id: string;
  /** `RG-GEN-07` — la version voyage avec la ligne : toute écriture la reprend. */
  version: number;
  titre: string;
  description: string | null;
  statut: string;
  priorite: string;
  dateDebut: string | null;
  dateFin: string | null;
  estimationHeures: string | null;
  avancement: number;
  confidentielle: boolean;
  project: { id: string; nom: string; icone: string | null } | null;
  milestone: { id: string; nom: string } | null;
  assignes: Assigne[];
  _count: { sousTaches: number; dependances: number };
  enRetard: boolean;
  /** Le hors-projet est **nommé**, jamais déduit d'un champ vide. */
  horsProjet: boolean;
};

export type SousTache = { id: string; libelle: string; fait: boolean; ordre: number };

export type LienDependance = {
  id: string;
  titre: string;
  statut: string;
  dateFin?: string | null;
  dateDebut?: string | null;
};

export type FicheTache = LigneTache & {
  creeLe: string;
  modifieLe: string;
  heureDebut: string | null;
  heureFin: string | null;
  interventionExterieure: boolean;
  epic: { id: string; nom: string } | null;
  sousTaches: SousTache[];
  raci: { userId: string; role: string; user: { prenom: string; nom: string } }[];
  tiers: { id: string; organisation: string | null; contactNom: string | null }[];
  commentaires: {
    id: string;
    contenu: string;
    creeLe: string;
    auteur: Personne;
  }[];
  documents: {
    id: string;
    nom: string;
    tailleOctets: number;
    typeMime: string;
    creeLe: string;
    auteur: { prenom: string; nom: string } | null;
  }[];
  dependances: { dependDe: LienDependance[]; bloque: LienDependance[] };
  incoherences: { taches: { id: string; titre: string }[] } | { id: string; titre: string }[];
};

const params = (filtres: Record<string, string | boolean | undefined>) => {
  const q = new URLSearchParams();
  for (const [cle, valeur] of Object.entries(filtres)) {
    if (valeur !== undefined && valeur !== "" && valeur !== false) q.set(cle, String(valeur));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
};

export const lister = (filtres: {
  projectId?: string;
  horsProjet?: boolean;
  statut?: string;
  priorite?: string;
  enRetard?: boolean;
  assigneId?: string;
}) => appeler<LigneTache[]>(`/taches${params(filtres)}`);

export const fiche = (id: string) => appeler<FicheTache>(`/taches/${id}`);

export const creer = (donnees: {
  titre: string;
  description?: string;
  projectId?: string | null;
  milestoneId?: string | null;
  statut?: string;
  priorite?: string;
  dateDebut?: string | null;
  dateFin?: string | null;
  estimationHeures?: number;
  interventionExterieure?: boolean;
  assigneIds?: string[];
  serviceIds?: string[];
}) => appeler<{ id: string }>("/taches", { methode: "POST", corps: donnees });

/**
 * `RG-GEN-07` — la version lue accompagne **chaque** modification.
 *
 * Le serveur refuse en 409 si elle a bougé. Le client ne « réessaie » jamais
 * en silence : il recharge et rend la main.
 */
export const modifier = (
  id: string,
  donnees: {
    version: number;
    titre?: string;
    description?: string | null;
    statut?: string;
    priorite?: string;
    dateDebut?: string | null;
    dateFin?: string | null;
    estimationHeures?: number | null;
    avancement?: number;
  },
) => appeler<{ version: number }>(`/taches/${id}`, { methode: "PATCH", corps: donnees });

export const supprimer = (id: string) => appeler<void>(`/taches/${id}`, { methode: "DELETE" });

export const ajouterSousTache = (id: string, libelle: string) =>
  appeler<SousTache>(`/taches/${id}/sous-taches`, { methode: "POST", corps: { libelle } });

export const basculerSousTache = (sousTacheId: string, fait: boolean) =>
  appeler<SousTache>(`/taches/sous-taches/${sousTacheId}`, { methode: "PATCH", corps: { fait } });

export const supprimerSousTache = (sousTacheId: string) =>
  appeler<void>(`/taches/sous-taches/${sousTacheId}`, { methode: "DELETE" });

export const reordonnerSousTaches = (id: string, ids: string[]) =>
  appeler<SousTache[]>(`/taches/${id}/sous-taches/ordre`, { methode: "PUT", corps: { ids } });

export const ajouterDependance = (id: string, prerequisId: string) =>
  appeler<void>(`/taches/${id}/dependances`, { methode: "POST", corps: { prerequisId } });

export const retirerDependance = (id: string, prerequisId: string) =>
  appeler<void>(`/taches/${id}/dependances/${prerequisId}`, { methode: "DELETE" });

export const attribuerRaci = (id: string, userId: string, role: string) =>
  appeler<void>(`/taches/${id}/raci`, { methode: "POST", corps: { userId, role } });

export const retirerRaci = (id: string, userId: string, role: string) =>
  appeler<void>(`/taches/${id}/raci/${userId}/${role}`, { methode: "DELETE" });

export const commenter = (taskId: string, contenu: string) =>
  appeler<{ id: string }>("/documents/commentaires", {
    methode: "POST",
    corps: { contenu, taskId },
  });
