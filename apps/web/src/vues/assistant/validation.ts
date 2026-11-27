import type { SourceSuivi } from "@rationarium/contracts";
import type { ActionAgent, CompteRenduValidation, MotifRefus } from "../../api/assistant.js";
import { nomDeLaCible } from "./difference.js";

/**
 * `RG-AST-21`, `RG-AST-22` — **la création d'un projet par l'agent, et elle
 * seule, attend la validation de son propriétaire.**
 *
 * Les actions du même passage qui désignent ce futur projet par `@reference`
 * (jalons, tâches…) attendent avec lui : elles portent `dependDeId`, l'action-
 * projet dont elles dépendent. Tout le reste est écrit directement, et se
 * défait comme avant.
 *
 * Isolé du rendu pour être vérifiable : c'est ce regroupement qui décide de ce
 * que l'utilisateur valide d'un geste. Une dépendante rangée sous le mauvais
 * projet serait créée — ou rejetée — sans qu'il l'ait regardée.
 */

/** Une création de projet en attente, et les actions qui attendent avec elle. */
export type CreationEnAttente = { projet: ActionAgent; dependantes: ActionAgent[] };

/** La racine d'une validation : une création de projet en attente, qui ne dépend de rien. */
export const estCreationEnAttente = (a: Pick<ActionAgent, "etat" | "type" | "dependDeId">): boolean =>
  a.etat === "a_valider" && a.type === "projet_creer" && !a.dependDeId;

/**
 * Les créations en attente, chacune avec ses dépendantes.
 *
 * - Les créations gardent l'ordre de la liste — celui du serveur, la plus
 *   récente d'abord.
 * - Les dépendantes suivent l'ordre de leur DÉPÔT, le plus ancien d'abord :
 *   c'est celui dans lequel le serveur les exécutera à la validation, et un
 *   jalon se lit avant la tâche qui s'y rattache.
 * - Une dépendante dont la création n'est pas dans la liste n'est rattachée à
 *   rien : elle n'est pas validable seule, et la ranger ailleurs mentirait.
 */
export function creationsEnAttente(actions: ActionAgent[]): CreationEnAttente[] {
  const creations = actions.filter(estCreationEnAttente).map((projet) => ({ projet, dependantes: [] as ActionAgent[] }));
  const parId = new Map(creations.map((c) => [c.projet.id, c]));
  for (const a of actions) {
    if (a.etat !== "a_valider" || !a.dependDeId) continue;
    parId.get(a.dependDeId)?.dependantes.push(a);
  }
  for (const c of creations) c.dependantes.sort((x, y) => Date.parse(x.creeLe) - Date.parse(y.creeLe));
  return creations;
}

/**
 * Les actions à montrer dans les groupes par projet, une fois la section
 * « À valider » posée au-dessus : une action en attente qu'elle porte déjà —
 * création ou dépendante — n'est pas montrée deux fois.
 *
 * Une action en attente que la section ne porte PAS reste dans la liste : si
 * la lecture des attentes a échoué, mieux vaut la voir une fois, marquée « en
 * attente de validation », que pas du tout.
 */
export function horsValidation(actions: ActionAgent[], creations: CreationEnAttente[]): ActionAgent[] {
  const portees = new Set(creations.map((c) => c.projet.id));
  return actions.filter(
    (a) => !(a.etat === "a_valider" && (portees.has(a.id) || (a.dependDeId !== null && portees.has(a.dependDeId)))),
  );
}

// ── Le projet proposé ───────────────────────────────────────────────────────

/** Ce que l'agent propose de créer, lu dans la charge de l'action (`projet_creer`). */
export type ProjetPropose = {
  nom: string | null;
  description: string | null;
  statut: string | null;
  priorite: string | null;
  dateDebut: string | null;
  dateFin: string | null;
  suivi: { consigne: string | null; sources: SourceSuivi[]; silenceJours: number | null } | null;
};

const estObjet = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const texte = (o: Record<string, unknown>, cle: string): string | null => {
  const v = o[cle];
  return typeof v === "string" && v !== "" ? v : null;
};

const estSource = (s: unknown): s is SourceSuivi =>
  estObjet(s) && typeof s["type"] === "string" && typeof s["designation"] === "string";

/**
 * La charge est écrite par l'agent et validée par le contrat au dépôt ; on la
 * relit quand même sans rien supposer : un champ inattendu s'ignore, il ne
 * fait pas tomber l'écran où l'on décide.
 */
export function projetPropose(charge: unknown): ProjetPropose {
  const c = estObjet(charge) ? charge : {};
  const s = estObjet(c["suivi"]) ? c["suivi"] : null;
  return {
    nom: texte(c, "nom"),
    description: texte(c, "description"),
    statut: texte(c, "statut"),
    priorite: texte(c, "priorite"),
    dateDebut: texte(c, "dateDebut"),
    dateFin: texte(c, "dateFin"),
    suivi: s
      ? {
          consigne: texte(s, "consigne"),
          sources: Array.isArray(s["sources"]) ? s["sources"].filter(estSource) : [],
          silenceJours: typeof s["silenceJours"] === "number" ? s["silenceJours"] : null,
        }
      : null,
  };
}

// ── Le compte rendu d'une validation ────────────────────────────────────────

export type LigneCompteRendu = {
  actionId: string;
  /** Le type de l'action, tel que l'agent l'a déposée ; `null` si on ne la connaissait pas. */
  type: string | null;
  nom: string | null;
  effectuee: boolean;
  motif: MotifRefus | null;
};

/**
 * Le compte rendu d'une validation, ligne à ligne, comme un import
 * (`RG-IMP-04`) : le projet créé ou non, puis chaque dépendante effectuée ou
 * refusée avec son motif.
 *
 * Le serveur ne rend que des identifiants : le type et le nom viennent des
 * actions qu'on avait sous les yeux au moment de valider. Une dépendante que
 * le serveur a exécutée sans qu'on l'ait vue est rendue quand même, sans nom.
 */
export function compteRenduValidation(
  reponse: CompteRenduValidation,
  creation: CreationEnAttente,
): { projet: LigneCompteRendu & { cibleId: string | null }; dependantes: LigneCompteRendu[] } {
  const connues = new Map([creation.projet, ...creation.dependantes].map((a) => [a.id, a]));
  const ligne = (r: CompteRenduValidation["projet"]): LigneCompteRendu => {
    const a = connues.get(r.actionId);
    return {
      actionId: r.actionId,
      type: a?.type ?? null,
      nom: a ? nomDeLaCible(a) : null,
      effectuee: r.etat === "effectuee",
      motif: r.etat === "effectuee" ? null : r.motif,
    };
  };
  return {
    projet: { ...ligne(reponse.projet), cibleId: reponse.projet.etat === "effectuee" ? reponse.projet.cibleId : null },
    dependantes: reponse.dependantes.map(ligne),
  };
}

// ── L'état d'une ligne d'action ─────────────────────────────────────────────

/**
 * Ce que la ligne d'action dit de son état, et ce qu'elle permet.
 *
 * - `defaisable` : seule une action EFFECTUÉE se défait. Une action en attente
 *   n'a rien écrit ; une action rejetée non plus.
 * - `attente` : la ligne dit qu'elle attend la validation de son projet.
 * - `decision` : qui a validé ou rejeté, et quand. Une action validée peut
 *   être effectuée, refusée par sa route, ou défaite depuis : la validation
 *   reste un fait, la mention la garde.
 */
export type EtatLigne = {
  defaisable: boolean;
  attente: boolean;
  decision: { nature: "validee" | "rejetee"; qui: string | null; quand: string | null } | null;
};

export function etatDeLaLigne(action: Pick<ActionAgent, "etat" | "decidePar" | "decideLe">): EtatLigne {
  const decidee = Boolean(action.decidePar ?? action.decideLe);
  return {
    defaisable: action.etat === "effectuee",
    attente: action.etat === "a_valider",
    decision:
      action.etat === "rejetee"
        ? { nature: "rejetee", qui: action.decidePar, quand: action.decideLe }
        : decidee && action.etat !== "a_valider"
          ? { nature: "validee", qui: action.decidePar, quand: action.decideLe }
          : null,
  };
}
