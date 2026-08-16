import { appeler } from "./client.js";

/**
 * M17 — rapports et analytics. Vues 15 et 30.
 *
 * Chaque module rend une **conclusion**, pas seulement des nombres : le ratio
 * porte son interprétation, la charge porte ses surcharges, la tendance dit si
 * son historique suffit. C'est ce qui permet de comprendre en trente secondes.
 */

const params = (filtres: Record<string, string | undefined>) => {
  const q = new URLSearchParams();
  for (const [cle, valeur] of Object.entries(filtres)) {
    if (valeur !== undefined && valeur !== "") q.set(cle, valeur);
  }
  const s = q.toString();
  return s ? `?${s}` : "";
};

export type Periode = "semaine" | "mois" | "trimestre" | "annee";

export type FiltresRapport = {
  periode: Periode;
  projets?: string[];
  responsables?: string[];
};

export type SanteLigne = {
  id: string;
  nom: string;
  icone: string | null;
  completion: number;
  restantes: number;
  enRetard: number;
  jalons: number;
  jalonsAVenir: number;
  tachesActives: number;
  dateFin: string;
  chef: { id: string; prenom: string; nom: string } | null;
  service: string | null;
  sante: "good" | "warning" | "critical";
};

export type VueEnsemble = {
  periode: { nature: Periode; debut: string; fin: string };
  alerte: { tachesEnRetard: number };
  progression: {
    projets: { id: string; nom: string; icone: string | null; progression: number; taches: number }[];
    total: number;
    /** `RG-RPT-02` — annoncé, jamais silencieux. */
    tronque: boolean;
    plafond: number;
  };
  charge: {
    agents: { id: string; nom: string; taches: number; surcharge: boolean }[];
    moyenne: number;
    surcharges: number;
  };
  sante: SanteLigne[];
  tendance: {
    points: { date: string; progression: number }[];
    /** `RG-RPT-03` — sous le seuil, la courbe ne se dessine pas. */
    historiqueSuffisant: boolean;
    moyenne: number;
    gain: number;
    /** `RG-RPT-04` — calculée, pas laissée à l'œil. */
    stagnation: boolean;
  };
  jalons: { total: number; aTemps: number; enRetard: number; aVenir: number; echus: number };
  repartitions: {
    priorite: { cle: string; nombre: number }[];
    statut: { cle: string; nombre: number }[];
    actives: number;
  };
  activite: {
    terminees: number;
    creees: number;
    passeesEnRetard: number;
    /** `null` quand aucune tâche n'a été créée : le ratio n'existe pas. */
    ratio: number | null;
    interpretation: "resorbe" | "grossit" | null;
  };
};

export type LigneGantt = {
  id: string;
  nom: string;
  icone: string | null;
  statut: string;
  priorite: string;
  dateDebut: string;
  dateFin: string;
  progression: number;
  taches: number;
  enRetard: number;
  rag: "on_track" | "at_risk" | "late" | "upcoming" | "done";
  chef: { id: string; prenom: string; nom: string } | null;
  service: { id: string; nom: string } | null;
};

const query = (f: FiltresRapport) =>
  params({
    periode: f.periode,
    ...(f.projets?.length ? { projets: f.projets.join(",") } : {}),
    ...(f.responsables?.length ? { responsables: f.responsables.join(",") } : {}),
  });

export const vueEnsemble = (f: FiltresRapport) => appeler<VueEnsemble>(`/rapports${query(f)}`);

export const gantt = (f: FiltresRapport) =>
  appeler<{ lignes: LigneGantt[]; reference: string }>(`/rapports/gantt${query(f)}`);

/** L'adresse d'export : ouverte par le navigateur, pas lue en mémoire. */
export const adresseExport = (f: FiltresRapport, format: "csv" | "json") =>
  `/api/rapports/export${query(f)}&format=${format}`;
