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

export type JalonEnRetard = {
  id: string;
  nom: string;
  projetId: string;
  projetNom: string;
  dateEcheance: string;
  joursDeRetard: number;
  tachesRestantes: number;
};

export type Periode = "semaine" | "mois" | "trimestre" | "annee";

export type FiltresRapport = {
  periode: Periode;
  projets?: string[];
  responsables?: string[];
  /**
   * `RG-GEN-08` — **la langue accompagne la demande d'export.**
   *
   * Le fichier produit porte des en-têtes et des libellés ; le serveur n'a pas
   * de session de langue à lire, il ne peut donc que la recevoir. Elle vit ici
   * plutôt qu'au point d'appel : concaténée à l'adresse déjà construite, elle
   * dépendait de la vigilance de chaque appelant, et le prochain export en
   * aurait fait l'économie sans que rien ne le dise. Elle ne part QUE sur
   * l'export — une lecture d'écran rend des codes, que le client formule.
   */
  langue?: string;
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
  /** Le budget d'heures du projet, quand il est renseigné. */
  budgetHeures: number | null;
  sante: "good" | "warning" | "critical";
};

export type VueEnsemble = {
  periode: { nature: Periode; debut: string; fin: string };
  alerte: { tachesEnRetard: number };
  progression: {
    projets: {
      id: string;
      nom: string;
      icone: string | null;
      progression: number;
      /** `EX-RPT-04` — l'avancement attendu au prorata de la durée écoulée. */
      attendu: number;
      /** Positif quand le réel est en retard sur l'attendu. */
      ecart: number;
      taches: number;
    }[];
    /** Tous les projets du périmètre — `RG-RPT-02` en fait l'exception. */
    total: number;
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
    /**
     * `RG-RPT-03`, `RG-GEN-05` — les relevés que la fenêtre d'analyse écarte.
     *
     * C'est le VRAI motif d'une tendance vide : le panneau annonçait
     * « historique en cours de construction » sur un projet qui porte six
     * relevés, dont aucun ne tombait dans la fenêtre. Le champ existait au
     * serveur et manquait ici, si bien que la vue élargissait le type dans son
     * coin — un contrat client qui décrit moins que ce que le serveur promet
     * est un contrat que personne ne peut opposer.
     */
    relevesHorsFenetre: number;
    /** Le seuil réellement appliqué : il se lit, il ne se recopie pas. */
    minimumRequis: number;
  };
  jalons: {
    total: number;
    aTemps: number;
    enRetard: number;
    aVenir: number;
    echus: number;
    /** Les jalons en retard, un à un, du plus ancien au plus récent. */
    retards: JalonEnRetard[];
    /** Ce que le plafond de lisibilité laisse hors de la liste. */
    retardsNonListes: number;
  };
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
  `/api/rapports/export${query(f)}&format=${format}` +
  (f.langue ? `&langue=${encodeURIComponent(f.langue)}` : "");
