import {
  PRIORITES,
  STATUTS_JALON,
  STATUTS_PROJET,
  STATUTS_TACHE,
  TYPES_ACTIVITE,
  TYPES_SOURCE_SUIVI,
  type Terme,
} from "@rationarium/contracts";
import type { ActionAgent, CibleAction } from "../../api/assistant.js";

/**
 * `docs/assistant/SPEC-PHASE-1.md § 11` — **ce qui a changé, avant → après,
 * champ par champ.**
 *
 * Le journal de l'agent garde deux instantanés de l'entité, et ils ne sont PAS
 * symétriques (`actions.service.ts`) : `avant` ne porte que les champs que
 * l'action touche (`champsTouches`), tandis que `apres` est l'entité entière
 * relue après l'écriture (`lireEntite`). Comparer l'union des clés ferait
 * passer pour « ajouté » chaque champ que l'action n'a jamais touché — le
 * titre d'une tâche dont on n'a changé que le statut. Les clés d'`avant` font
 * donc foi : ce sont celles que défaire rétablira, ni plus ni moins.
 *
 * Isolé du rendu pour être vérifiable : c'est ce calcul qui décide de ce que
 * l'utilisateur voit avant de défaire, et une différence fausse lui ferait
 * défaire ce qu'il n'a pas regardé.
 */

/** Un écart, valeurs brutes : la mise en forme vient ensuite, selon le champ. */
export type Ecart = { champ: string; avant: unknown; apres: unknown };

/**
 * `version` change à chaque écriture et ne dit rien à l'utilisateur : c'est le
 * jeton du verrouillage optimiste (`RG-GEN-07`), pas une donnée de l'entité.
 */
const IGNORES = new Set(["version"]);

/**
 * L'ordre de lecture : ce qui nomme l'entité d'abord, puis son état, puis ses
 * dates. Un champ inconnu de cette liste vient après, dans l'ordre alphabétique,
 * plutôt que de disparaître.
 */
const ORDRE = [
  "nom",
  "titre",
  "contenu",
  "statut",
  "avancement",
  "priorite",
  "dateDebut",
  "dateFin",
  "dateEcheance",
  "date",
  "journeeEntiere",
  "heureDebut",
  "heureFin",
  "heures",
  "typeActivite",
  "estimationHeures",
  "budgetHeures",
  "milestoneId",
  "projectId",
  "taskId",
  "chefId",
  "sponsorId",
  "departementId",
  "userId",
  "description",
  "consigne",
  "sources",
  "silenceJours",
  "actif",
  "icone",
];

const rang = (champ: string): number => {
  const i = ORDRE.indexOf(champ);
  return i === -1 ? ORDRE.length : i;
};

const trier = (a: string, b: string): number => rang(a) - rang(b) || a.localeCompare(b);

/**
 * Une valeur sous une forme comparable. Les clés d'objet sont triées : deux
 * sources identiques sérialisées dans deux ordres ne sont pas un changement.
 * `undefined` et `null` se confondent — un champ absent et un champ vidé
 * disent la même chose à l'écran.
 */
export const stable = (valeur: unknown): string => {
  if (valeur === undefined || valeur === null) return "null";
  if (Array.isArray(valeur)) return `[${valeur.map(stable).join(",")}]`;
  if (typeof valeur === "object") {
    const o = valeur as Record<string, unknown>;
    return `{${Object.keys(o)
      .sort()
      .filter((c) => o[c] !== undefined)
      .map((c) => `${JSON.stringify(c)}:${stable(o[c])}`)
      .join(",")}}`;
  }
  return JSON.stringify(valeur);
};

const estObjet = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Vide au sens de l'affichage : rien à montrer d'une création. */
const vide = (v: unknown): boolean =>
  v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);

/**
 * Les types d'action qui CRÉENT leur entité. Défaire l'un d'eux la supprime
 * (`RG-AST-18`) ; c'est ce qui change le texte de la confirmation.
 */
const CREATIONS = new Set([
  "projet_creer",
  "jalon_creer",
  "tache_creer",
  "evenement_creer",
  "temps_saisir",
  "commentaire_ajouter",
]);

export const estCreation = (type: string): boolean => CREATIONS.has(type);

/**
 * Les écarts d'une action.
 *
 * - **Création** (`avant` absent) : l'état créé, champ par champ, sans les
 *   champs vides — « créée avec un jalon nul » n'apprend rien.
 * - **Modification** : les champs d'`avant` — ceux que l'action touche — dont
 *   la valeur diffère dans `apres`. Un champ touché mais inchangé (l'avancement
 *   retenu avec le statut, `RG-TSK-17`) ne fait pas une ligne.
 * - **Rien** : une action refusée n'a écrit ni avant ni après.
 */
export function ecarts(
  avant: Record<string, unknown> | null | undefined,
  apres: Record<string, unknown> | null | undefined,
): { creation: boolean; lignes: Ecart[] } {
  const a = estObjet(avant) ? avant : null;
  const b = estObjet(apres) ? apres : null;
  if (!a && !b) return { creation: false, lignes: [] };

  if (!a && b) {
    /* Les identifiants de rattachement (`projectId`, `chefId`…) ne se lisent
       pas : le groupe nomme déjà le projet, et un UUID n'apprend rien. */
    const lignes = Object.keys(b)
      .filter((c) => !IGNORES.has(c) && !vide(b[c]) && !/Id$/.test(c))
      .sort(trier)
      .map((c) => ({ champ: c, avant: undefined, apres: b[c] }));
    return { creation: true, lignes };
  }

  const gauche = a ?? {};
  const droite = b ?? {};
  const cles = Object.keys(gauche)
    .filter((c) => !IGNORES.has(c))
    .filter((c) => stable(gauche[c]) !== stable(droite[c]))
    .sort(trier);
  return {
    creation: false,
    lignes: cles.map((c) => ({ champ: c, avant: gauche[c], apres: droite[c] })),
  };
}

// ── Mise en forme ───────────────────────────────────────────────────────────

/** Ce dont la mise en forme a besoin, injecté pour rester une fonction pure. */
export type ContexteValeur = {
  cible: CibleAction | null;
  libelle: (code: string, vocabulaire: readonly Terme<string>[]) => string;
  formaterDate: (valeur: string) => string;
  oui: string;
  non: string;
  vide: string;
  pourcent: (n: number) => string;
  /** Un nombre selon la région réglée : « 1,5 » en français, « 1.5 » en anglais. */
  nombre: (n: number) => string;
};

const CHAMPS_DATE = new Set(["dateDebut", "dateFin", "dateEcheance", "date"]);

/** Le vocabulaire du statut dépend de l'entité : `done` n'a pas le même libellé partout. */
const vocabulaireDuStatut = (cible: CibleAction | null): readonly Terme<string>[] | null => {
  switch (cible) {
    case "Project":
      return STATUTS_PROJET;
    case "Task":
      return STATUTS_TACHE;
    case "Milestone":
      return STATUTS_JALON;
    default:
      return null;
  }
};

/** Au-delà, un texte libre est coupé : la ligne d'action n'est pas la fiche. */
export const LONGUEUR_AFFICHEE = 300;

const couper = (texte: string): string =>
  texte.length > LONGUEUR_AFFICHEE ? `${texte.slice(0, LONGUEUR_AFFICHEE - 1)}…` : texte;

/**
 * Une valeur, lisible. Un code de vocabulaire rend son libellé, une date son
 * format réglé (`RG-GEN-09`), un booléen « oui » ou « non », une liste de
 * sources ses désignations. Ce qui n'a pas de forme connue rend son texte
 * brut — mieux vaut un identifiant qu'une ligne vide.
 */
export function texteValeur(champ: string, valeur: unknown, ctx: ContexteValeur): string {
  if (vide(valeur)) return ctx.vide;
  if (typeof valeur === "boolean") return valeur ? ctx.oui : ctx.non;
  if (typeof valeur === "string") {
    if (CHAMPS_DATE.has(champ) && /^\d{4}-\d{2}-\d{2}/.test(valeur)) return ctx.formaterDate(valeur);
    if (champ === "statut") {
      const vocabulaire = vocabulaireDuStatut(ctx.cible);
      if (vocabulaire) return ctx.libelle(valeur, vocabulaire);
    }
    if (champ === "priorite") return ctx.libelle(valeur, PRIORITES);
    if (champ === "typeActivite") return ctx.libelle(valeur, TYPES_ACTIVITE);
    return couper(valeur);
  }
  if (typeof valeur === "number") {
    return champ === "avancement" ? ctx.pourcent(valeur) : ctx.nombre(valeur);
  }
  if (champ === "sources" && Array.isArray(valeur)) {
    return couper(
      valeur
        .map((s) => {
          if (!estObjet(s)) return stable(s);
          const type = typeof s["type"] === "string" ? ctx.libelle(s["type"], TYPES_SOURCE_SUIVI) : "";
          const nom = typeof s["libelle"] === "string" && s["libelle"] ? s["libelle"] : s["designation"];
          return `${type} · ${typeof nom === "string" ? nom : ""}`;
        })
        .join(" ; "),
    );
  }
  if (Array.isArray(valeur)) return couper(valeur.map((v) => (typeof v === "string" ? v : stable(v))).join(", "));
  return couper(JSON.stringify(valeur));
}

// ── L'entité visée ──────────────────────────────────────────────────────────

const champTexte = (o: unknown, cle: string): string | null =>
  estObjet(o) && typeof o[cle] === "string" && o[cle] !== "" ? (o[cle] as string) : null;

/**
 * Le nom de l'entité, tel que l'action le connaît : l'état d'après, sinon
 * celui d'avant, sinon ce que l'agent a demandé. Le serveur ne joint pas de
 * libellé à la cible ; on ne l'invente pas non plus — sans nom, la ligne dit
 * seulement la nature de l'entité.
 */
export function nomDeLaCible(action: Pick<ActionAgent, "avant" | "apres" | "charge">): string | null {
  for (const source of [action.apres, action.avant, action.charge]) {
    const nom = champTexte(source, "nom") ?? champTexte(source, "titre");
    if (nom) return couper(nom);
  }
  const contenu = champTexte(action.apres, "contenu") ?? champTexte(action.charge, "contenu");
  return contenu ? couper(contenu) : null;
}

/**
 * Le chemin qui mène à l'entité, ou `null` quand il n'en mène à aucune.
 *
 * Une création défaite a supprimé son entité (`RG-AST-18`), et une action
 * refusée n'a rien écrit : le nom affiché est celui que l'agent demandait, et
 * un lien sous ce nom mènerait ailleurs que là où il prétend. Le projet, lui,
 * reste joignable par l'en-tête de son groupe.
 */
export function cheminDeLaCible(
  action: Pick<ActionAgent, "type" | "etat" | "cibleType" | "cibleId" | "projectId" | "apres" | "charge">,
): string | null {
  if (action.etat === "refusee" || !action.cibleId || !action.cibleType) return null;
  if (action.etat === "defaite" && estCreation(action.type)) return null;
  const projet = action.projectId ?? champTexte(action.apres, "projectId");
  const versProjet = projet ? `/projets/${projet}` : null;
  switch (action.cibleType) {
    case "Project":
      return `/projets/${action.cibleId}`;
    case "ProjetSuivi":
      return `/projets/${action.cibleId}/suivi`;
    case "Milestone":
      return projet ? `/projets/${projet}/jalons` : null;
    case "Task":
      return `/taches/${action.cibleId}`;
    case "Event":
      return "/evenements";
    case "TimeEntry":
      return "/temps";
    case "Comment": {
      const tache = champTexte(action.apres, "taskId") ?? champTexte(action.charge, "taskId");
      return tache ? `/taches/${tache}` : versProjet;
    }
  }
}

/**
 * **Une preuve ne mène qu'à une adresse sûre.**
 *
 * Le lien d'une preuve est écrit par l'agent, qui lit des courriels et des
 * pages : c'est la donnée la plus exposée à l'injection du produit
 * (`docs/assistant/SPEC-PHASE-1.md § 15`). Le contrat le valide comme URL, et
 * `javascript:…` EST une URL valide. Seuls `http`, `https` et `mailto`
 * deviennent un lien ; le reste s'affiche en texte, sans rien perdre de
 * l'information.
 */
export function lienSur(lien: string | null | undefined): string | null {
  if (!lien) return null;
  try {
    const url = new URL(lien);
    return ["http:", "https:", "mailto:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
