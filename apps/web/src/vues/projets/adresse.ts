/**
 * **Les filtres du portefeuille vivent dans l'adresse.**
 *
 * Le défaut relevé en recette : un filtre posé sur « Actif », un projet ouvert,
 * « ← Retour aux projets » — et le portefeuille revenait à « Tous les
 * statuts », **sans le dire**. `RG-GEN-04` demande qu'un écran explique ce
 * qu'il montre ; un filtre qui se défait tout seul fait exactement le
 * contraire, puisque le compteur « n sur total » redevient « total » sans
 * qu'aucun geste l'ait demandé.
 *
 * Conséquence au moins aussi utile que la correction : **une liste filtrée a
 * désormais une adresse.** Elle se met en signet et se transmet — « les
 * projets à risque de la direction », c'est un lien.
 *
 * Les routes de `app/routeur.tsx` ne déclarent aucun schéma de recherche : ces
 * fonctions prennent les paramètres tels qu'ils arrivent et n'en retiennent que
 * la forme. Un paramètre absurde est ignoré, jamais appliqué — une liste vide
 * ressemble à une panne.
 */

export type EtatPortefeuille = {
  recherche: string;
  statut: string;
  priorite: string;
  mesProjets: boolean;
  archives?: boolean;
};

export const PORTEFEUILLE_VIDE: EtatPortefeuille = {
  recherche: "",
  statut: "",
  priorite: "",
  mesProjets: false,
};

/** Les paramètres qui appartiennent au portefeuille, et eux seuls. */
export const CLES_PORTEFEUILLE = ["q", "statut", "priorite", "miens", "archives"] as const;

const chaine = (v: unknown): string => (typeof v === "string" ? v : "");

export function lirePortefeuille(brut: Record<string, unknown>): EtatPortefeuille {
  return {
    recherche: chaine(brut["q"]),
    statut: chaine(brut["statut"]),
    priorite: chaine(brut["priorite"]),
    mesProjets: chaine(brut["miens"]) === "1",
    ...(chaine(brut["archives"]) === "1" ? { archives: true } : {}),
  };
}

/** L'adresse d'un état — les valeurs par défaut n'y figurent pas. */
export function adressePortefeuille(etat: EtatPortefeuille): Record<string, string> {
  const s: Record<string, string> = {};
  if (etat.recherche) s["q"] = etat.recherche;
  if (etat.statut) s["statut"] = etat.statut;
  if (etat.priorite) s["priorite"] = etat.priorite;
  if (etat.mesProjets) s["miens"] = "1";
  if (etat.archives) s["archives"] = "1";
  return s;
}

/**
 * Ce qu'une fiche projet doit RENVOYER au portefeuille.
 *
 * La fiche reçoit l'adresse du portefeuille en la traversant, et ne la
 * comprend pas : elle en retient les clés du portefeuille, telles quelles, et
 * les rend au retour. Recopier ici la lecture puis l'écriture ferait perdre en
 * chemin tout paramètre ajouté d'un seul côté.
 */
export function retourAuPortefeuille(brut: Record<string, unknown>): Record<string, string> {
  const s: Record<string, string> = {};
  for (const cle of CLES_PORTEFEUILLE) {
    const v = brut[cle];
    if (typeof v === "string" && v !== "") s[cle] = v;
  }
  return s;
}
