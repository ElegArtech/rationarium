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
  /** `EX-TSK-14` — la tâche confiée à un prestataire porte sa marque « EXT ». */
  interventionExterieure: boolean;
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
  /** `null` quand le lien pointe une tâche que le lecteur ne peut pas voir. */
  titre: string | null;
  statut: string | null;
  dateFin?: string | null;
  dateDebut?: string | null;
  /** `RG-SCOPE-04` — la tâche liée est-elle nommable pour ce lecteur ? */
  lisible: boolean;
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
  /**
   * `EX-TSK-12` — les prérequis qui finissent APRÈS le début de cette tâche.
   *
   * Le type déclaré ici disait `{ id, titre }` ; le service rend le prérequis
   * complet et le nombre de jours de recouvrement. La vue affichait donc une
   * liste dont elle ne pouvait pas lire les champs.
   */
  incoherences: {
    prerequis: { id: string; titre: string; dateFin: string | null };
    jours: number;
  }[];
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

/**
 * `EX-TSK-05` — fixer la liste des assignés.
 *
 * La liste est posée **en entier**, jamais par différence : un ajout et un
 * retrait simultanés depuis deux écrans laisseraient sinon un état que
 * personne n'a voulu. Le premier de la liste est le porteur.
 *
 * La route existait depuis L-33 ; la fiche ne l'appelait pas, son bouton « + »
 * restant désactivé derrière un commentaire affirmant qu'« l'ajout d'un
 * assigné n'a pas de point d'entrée ». Quatrième commentaire de ce genre à se
 * révéler faux.
 */
export const definirAssignes = (id: string, userIds: string[]) =>
  appeler<{ assignes: string[] }>(`/taches/${id}/assignes`, {
    methode: "PUT",
    corps: { userIds },
  });

export const supprimer = (id: string) => appeler<void>(`/taches/${id}`, { methode: "DELETE" });

export const ajouterSousTache = (id: string, libelle: string) =>
  appeler<SousTache>(`/taches/${id}/sous-taches`, { methode: "POST", corps: { libelle } });

export const basculerSousTache = (sousTacheId: string, fait: boolean) =>
  appeler<SousTache>(`/taches/sous-taches/${sousTacheId}`, { methode: "PATCH", corps: { fait } });

export const supprimerSousTache = (sousTacheId: string) =>
  appeler<void>(`/taches/sous-taches/${sousTacheId}`, { methode: "DELETE" });

export const reordonnerSousTaches = (id: string, ids: string[]) =>
  appeler<SousTache[]>(`/taches/${id}/sous-taches/ordre`, { methode: "PUT", corps: { ids } });

/**
 * Les liens d'une tâche, sans sa fiche complète.
 *
 * Le Gantt en a besoin pour **toutes** les tâches datées à la fois, afin de
 * dresser le bandeau d'incohérences : passer par `fiche()` rapporterait
 * assignés, sous-tâches, commentaires et documents pour n'en lire que deux
 * tableaux. L'appel n'est fait que sur les tâches dont `_count.dependances`
 * annonce au moins un prérequis.
 */
export const dependances = (id: string) =>
  appeler<{ dependDe: LienDependance[]; bloque: LienDependance[] }>(`/taches/${id}/dependances`);

export const ajouterDependance = (id: string, prerequisId: string) =>
  appeler<void>(`/taches/${id}/dependances`, { methode: "POST", corps: { prerequisId } });

/**
 * `EX-TSK-10` — les tâches **posables** en prérequis de celle-ci.
 *
 * Le serveur écarte en amont les cinq refus qu'il prononcerait en aval —
 * soi-même, introuvable, autre projet, déjà liée, cycle — et exclut ce qui est
 * hors périmètre : une case à cocher qu'on ne peut pas nommer n'est pas un
 * choix. La fenêtre n'a donc jamais à filtrer elle-même, et ne peut pas
 * proposer un clic qui échouera.
 */
export type CandidatDependance = {
  id: string;
  titre: string;
  statut: string;
  dateFin: string | null;
  /** `EX-TSK-12` — ce prérequis finirait après le début de la tâche. */
  conflit: boolean;
};

export const candidatsDependance = (id: string) =>
  appeler<CandidatDependance[]>(`/taches/${id}/dependances/candidats`);

/**
 * `EX-TSK-12` — les prérequis dont la fin dépasse le début de la tâche.
 *
 * La fiche les reçoit déjà dans son chargement complet ; la fenêtre de
 * sélection les relit à l'ouverture, parce qu'elle marque `.dep-warn` sur des
 * lignes qu'on est en train de modifier — et une fiche ouverte depuis dix
 * minutes ne dit plus l'état du graphe.
 */
export const incoherences = (id: string) =>
  appeler<{ prerequis: { id: string; titre: string; dateFin: string | null }; jours: number }[]>(
    `/taches/${id}/incoherences`,
  );

/**
 * `EX-TSK-10` — fixer l'**ensemble** des prérequis, comme la fenêtre les
 * enregistre.
 *
 * L'ensemble part entier, jamais par différence : deux fenêtres ouvertes en
 * même temps laisseraient sinon un état que personne n'a voulu. `RG-GEN-07` en
 * plus — la version lue accompagne l'écriture, et un écart lève un 409 que le
 * client ne réessaie jamais en silence.
 */
export const definirDependances = (id: string, version: number, prerequisIds: string[]) =>
  appeler<{ version: number; ajoutees: string[]; retirees: string[] }>(
    `/taches/${id}/dependances`,
    { methode: "PUT", corps: { version, prerequisIds } },
  );

/**
 * `EX-TSK-13` — l'aperçu du décalage en cascade, **avant** de l'exécuter.
 *
 * Le brief de la vue 15 exige « Décaler aussi {n} tâche(s) dépendante(s) ? » :
 * la question ne peut se poser qu'avec le nombre en main.
 */
export const apercuCascade = (id: string, jours: number) =>
  appeler<{ id: string; titre: string }[]>(
    `/taches/${id}/cascade${params({ jours: String(jours) })}`,
  );

/** Décale la tâche **et** ses dépendantes, en une seule transaction serveur. */
export const decalerEnCascade = (id: string, jours: number) =>
  appeler<{ decalees: number; touchees: { id: string; titre: string }[] }>(
    `/taches/${id}/cascade`,
    { methode: "POST", corps: { jours } },
  );

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
