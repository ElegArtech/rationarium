import { COUCHES_PAR_DEFAUT, type Couches } from "./grille.js";

/**
 * **L'état du planning vit dans l'adresse, pas dans le composant.**
 *
 * « Semaine / Mois / Activité » n'est pas trois vues : c'est un mode
 * d'affichage d'une même vue, avec une seule barre de filtres. Tout l'état
 * était pourtant en `useState` local dans chacune des deux pages — si bien
 * qu'après cinq « Semaine suivante », passer en Mois revenait au mois courant
 * et le filtre de service revenait à « Tous les services ». Rien de ce qui
 * était posé ne survivait au changement de mode, et rien ne le disait.
 *
 * Trois conséquences, et la troisième n'est pas la moindre :
 *
 *  1. le mode se change sans rien perdre — c'est le défaut relevé ;
 *  2. une période et un filtre se **mettent en signet** et se transmettent ;
 *  3. le retour arrière du navigateur redevient une navigation, pas un saut.
 *
 * Les routes de `app/routeur.tsx` ne déclarent aucun schéma de recherche : ces
 * fonctions prennent donc les paramètres tels qu'ils arrivent, et ne retiennent
 * que ce qui a une forme. Un paramètre absurde ne vide pas la grille, il est
 * ignoré — une vue vide ressemble à une panne.
 */

export type EtatPlanning = {
  /** Le jour d'ancrage de la période affichée, en ISO. */
  ancre: string;
  services: string[];
  departementId: string;
  recherche: string;
  monPerimetre: boolean;
  couches: Couches;
};

const EST_UNE_DATE = /^\d{4}-\d{2}-\d{2}$/;

const chaine = (v: unknown): string => (typeof v === "string" ? v : "");

/**
 * Une liste séparée par des virgules.
 *
 * Le filtre porte sur **la chaîne**, jamais sur une valeur convertie : c'est
 * la leçon de `Number("")`, qui vaut zéro et faisait passer une entrée vide
 * pour un identifiant.
 */
const liste = (v: unknown): string[] =>
  chaine(v)
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x !== "");

const CLES_COUCHES = Object.keys(COUCHES_PAR_DEFAUT) as (keyof Couches)[];

export function lirePlanning(
  brut: Record<string, unknown>,
  ancreParDefaut: string,
): EtatPlanning {
  const ancre = chaine(brut["ancre"]);
  const demandees = liste(brut["couches"]);
  const couches = brut["couches"] === undefined
    ? COUCHES_PAR_DEFAUT
    : (Object.fromEntries(CLES_COUCHES.map((c) => [c, demandees.includes(c)])) as Couches);

  return {
    ancre: EST_UNE_DATE.test(ancre) ? ancre : ancreParDefaut,
    services: liste(brut["services"]),
    departementId: chaine(brut["departement"]),
    recherche: chaine(brut["q"]),
    monPerimetre: chaine(brut["perimetre"]) === "1",
    couches,
  };
}

/**
 * L'adresse d'un état — **les valeurs par défaut n'y figurent pas.**
 *
 * Une adresse qui porterait tous ses paramètres, même inertes, serait
 * illisible et impartageable ; et une période qui s'écrirait à chaque
 * affichage empilerait une entrée d'historique par rendu.
 */
export function adressePlanning(
  etat: EtatPlanning,
  ancreParDefaut: string,
): Record<string, string> {
  const s: Record<string, string> = {};
  if (etat.ancre !== ancreParDefaut) s["ancre"] = etat.ancre;
  if (etat.services.length > 0) s["services"] = etat.services.join(",");
  if (etat.departementId) s["departement"] = etat.departementId;
  if (etat.recherche) s["q"] = etat.recherche;
  if (etat.monPerimetre) s["perimetre"] = "1";
  const actives = CLES_COUCHES.filter((c) => etat.couches[c]);
  if (actives.length !== CLES_COUCHES.length) s["couches"] = actives.join(",");
  return s;
}
