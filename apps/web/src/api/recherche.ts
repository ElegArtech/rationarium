import { appeler } from "./client.js";

/** D-RM-07 — résultats de la recherche globale, déjà filtrés par le serveur. */
export type ResultatsRecherche = {
  terme: string;
  total: number;
  projets: { id: string; nom: string; destination: string }[];
  taches: {
    id: string;
    titre: string;
    destination: string;
    projet: { id: string; nom: string } | null;
  }[];
};

export const rechercher = (terme: string) =>
  appeler<ResultatsRecherche>(`/recherche?${new URLSearchParams({ terme })}`);
