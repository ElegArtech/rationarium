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
  /** `RG-DSH-04` — échéance dépassée ET pas terminée. */
  enRetard: boolean;
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

export const listerTodos = () => appeler<Todos>("/tableau-de-bord/todos");

export const ajouterTodo = (libelle: string) =>
  appeler<Todo>("/tableau-de-bord/todos", { methode: "POST", corps: { libelle } });

export const modifierTodo = (id: string, donnees: { libelle?: string; fait?: boolean }) =>
  appeler<Todo>(`/tableau-de-bord/todos/${id}`, { methode: "PATCH", corps: donnees });

export const supprimerTodo = (id: string) =>
  appeler<{ supprime: boolean }>(`/tableau-de-bord/todos/${id}`, { methode: "DELETE" });
