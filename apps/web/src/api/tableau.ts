import { appeler } from "./client.js";
import type { Planning } from "./planning.js";

/**
 * M16 — le tableau de bord. Vue 06.
 *
 * Un seul appel rapporte la page entière. Sept blocs chargés séparément se
 * remplissent dans un ordre imprévisible, et c'est la page la plus consultée
 * du produit — celle qui clignoterait plusieurs fois par jour, pour tout le
 * monde.
 */

export type TacheAVenir = {
  id: string;
  titre: string;
  statut: string;
  priorite: string;
  dateDebut: string | null;
  dateFin: string | null;
  estimationHeures: number | null;
  version: number;
  project: { id: string; nom: string; icone: string | null } | null;
  /** `RG-DSH-04` — échéance DÉPASSÉE ET pas terminée. Aujourd'hui ne l'est pas. */
  enRetard: boolean;
  /** L'échéance tombe aujourd'hui : un signal, jamais une alerte. */
  pourAujourdhui: boolean;
  /** `RG-TMP-07` — tous contributeurs confondus, pour éviter la double saisie. */
  heuresDeclarees: number;
};

export type TacheNonDeclaree = {
  id: string;
  titre: string;
  dateFin: string | null;
  projet: string | null;
};

export type Todo = {
  id: string;
  libelle: string;
  fait: boolean;
  ordre: number;
};

export type Todos = {
  actives: Todo[];
  /** `RG-DSH-03` — regroupées à part, avec leur compte. */
  faites: Todo[];
  limite: number;
  limiteAtteinte: boolean;
};

export type ProjetTableau = {
  id: string;
  nom: string;
  statut: string;
  icone: string | null;
  dateFin: string;
  /** `RG-PRJ-07` — moyenne des avancements de tâches, en pourcentage entier. */
  progression: number;
  _count: { taches: number };
};

export type TableauDeBord = {
  indicateurs: {
    projets: { actifs: number; total: number };
    tachesEnCours: { valeur: number; total: number };
    tachesTerminees: { valeur: number; pourcentage: number };
    tachesEnRetard: number;
  };
  taches: { aVenir: TacheAVenir[]; nonDeclarees: TacheNonDeclaree[] };
  todos: Todos;
  projets: ProjetTableau[];
  planning: Planning;
};

export const tableauDeBord = () => appeler<TableauDeBord>("/tableau-de-bord");

/**
 * `EX-USR-09` — la présence du jour : qui est là, en congé, en télétravail.
 *
 * **Elle ne voyage pas dans `/tableau-de-bord`**, contrairement à tout le
 * reste de la vue 06. Deux raisons, et aucune n'est de commodité :
 *
 * 1. La route est gardée par `users:read`, que le socle ne porte pas — la
 *    plupart des comptes n'y ont pas droit. La fondre dans la charge unique
 *    obligerait le serveur à rendre un champ vide pour eux, ou à changer de
 *    forme selon l'appelant : deux mauvaises réponses à une question de droit.
 * 2. Le serveur est en lecture seule sur ce lot ; `/tableau-de-bord` ne peut
 *    pas apprendre à la servir.
 *
 * **`jour` est TOUJOURS transmis, et ce n'est pas une précaution.** La route
 * l'accepte en option et retombe sinon sur `new Date()` — un instant, avec
 * son heure. Or elle compare cet instant à `telework.date` par **égalité
 * stricte** et à `leave.dateFin` par `>=`, deux colonnes `date` stockées à
 * minuit. Sans `jour`, aucun télétravail n'est jamais trouvé et tout congé
 * qui finit aujourd'hui est manqué : la réponse serait « tout le monde est
 * présent », à toute heure sauf minuit pile. On envoie donc la date nue
 * `AAAA-MM-JJ`, que `z.coerce.date()` relit à minuit.
 */
export type PresenceAgent = {
  id: string;
  prenom: string;
  nom: string;
  /** Trois états exclusifs — le congé l'emporte sur le lieu. */
  etat: "present" | "conge" | "teletravail";
  /** Le nom du type de congé ; non nul seulement quand `etat` vaut `conge`. */
  typeConge: string | null;
};

export const presenceDuJour = (jour: string) =>
  appeler<PresenceAgent[]>(`/utilisateurs/presence?jour=${jour}`);

export const listerTodos = () => appeler<Todos>("/tableau-de-bord/todos");

export const ajouterTodo = (libelle: string) =>
  appeler<Todo>("/tableau-de-bord/todos", { methode: "POST", corps: { libelle } });

export const modifierTodo = (id: string, donnees: { libelle?: string; fait?: boolean }) =>
  appeler<Todo>(`/tableau-de-bord/todos/${id}`, { methode: "PATCH", corps: donnees });

export const supprimerTodo = (id: string) =>
  appeler<{ supprime: boolean }>(`/tableau-de-bord/todos/${id}`, { methode: "DELETE" });
