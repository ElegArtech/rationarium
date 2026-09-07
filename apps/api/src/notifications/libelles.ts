import type { TypeNotification } from "./notifications.service.js";

/**
 * Le vocabulaire des notifications — `cadrage/01 § M18`, `RG-NTF-01`.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * DEUX DÉFAUTS TROUVÉS EN RECETTE (P-18, P-19, P-20), et ils tiennent au même
 * geste : la phrase était **écrite à l'émission**.
 *
 *   1. En français, en dur. En session anglaise, le panneau rendait un cadre
 *      traduit et un contenu français (`RG-GEN-08`). Une phrase figée en base
 *      au moment de l'émission ne se rattrape jamais au changement de langue :
 *      c'est ce qui rend le défaut irréparable après coup, et c'est pourquoi
 *      le correctif porte sur le MOMENT du rendu, pas sur la traduction.
 *   2. Hors du vocabulaire fermé. Le produit écrivait « Échéance proche : X »,
 *      « En retard : X », « Nouvelle tâche : X » là où M18 énonce « Tâche à
 *      échéance proche », « Tâche en retard », « Nouvelle tâche assignée ».
 *      La liste des six déclencheurs est fermée ; leurs intitulés le sont
 *      aussi, sinon la fermeture ne porte que sur ce qu'on ne voit pas.
 *
 * Le titre ne se stocke donc plus : il **se déduit du type**, à la lecture, et
 * les six intitulés vivent ici. Le corps se compose d'une clé et de
 * paramètres, rendus dans la langue du lecteur.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * **Pourquoi le serveur rend le texte, alors que le produit envoie ailleurs
 * une clé au client.** Deux raisons, et la seconde décide : le courriel de
 * `EX-NTF-04` part du serveur, sans navigateur pour le traduire ; et la cloche
 * lit `titre`/`contenu` tels quels — un serveur qui n'enverrait qu'une clé y
 * afficherait « tache_en_retard ». La réponse porte donc **les deux** : le
 * texte rendu, et `cle`/`params` pour le client qui voudra le composer
 * lui-même. C'est le même contrat que `messages-metier.ts`, qui envoie une clé
 * et sa phrase de repli.
 */

export type Langue = "fr" | "en";

/** La langue du lecteur, ramenée à ce que ce module sait rendre. */
export const langueDe = (declaree: string | null | undefined): Langue =>
  declaree?.toLowerCase().startsWith("en") ? "en" : "fr";

/** Les six intitulés de `cadrage/01 § M18`. La liste est fermée. */
const TITRES: Record<TypeNotification, Record<Langue, string>> = {
  tache_assignee: { fr: "Nouvelle tâche assignée", en: "New task assigned" },
  conge_a_valider: { fr: "Demande de congé à valider", en: "Leave request to approve" },
  conge_decide: {
    fr: "Décision sur votre demande de congé",
    en: "Decision on your leave request",
  },
  tache_echeance_proche: { fr: "Tâche à échéance proche", en: "Task due soon" },
  tache_en_retard: { fr: "Tâche en retard", en: "Overdue task" },
  ajout_projet: { fr: "Ajout à un projet", en: "Added to a project" },
};

/**
 * Les corps composables — **les six types de M18, sans exception**.
 *
 * Un corps absent d'ici n'est pas une erreur de typage : l'émetteur passe
 * alors sa phrase et elle est rendue telle quelle, ce qui a permis aux
 * services de basculer un par un sans que la cloche cesse de dire quelque
 * chose. Mais un émetteur DÉJÀ converti dont la clé manque ici rend le corps
 * VIDE — c'est le défaut trouvé en recette : quatre types sur six émettaient
 * des paramètres que rien ne savait rendre, et le motif de refus d'un congé
 * était perdu à l'écran. `libelles.test.ts` compare désormais la liste des
 * types émis à celle des modèles rendus : les deux moitiés ne peuvent plus
 * diverger en silence.
 */
/**
 * Le pluriel d'un décompte de jours.
 *
 * **Le pluriel de zéro diffère entre le français et l'anglais** : « 0 jour »
 * mais « 0 days ». Un congé fait au moins un jour, donc le cas ne se présente
 * pas ici — la forme est juste quand même, sinon la règle serait recopiée
 * fausse le jour où un autre décompte l'emprunte. En français, le singulier
 * couvre 0 et 1 ; en anglais, 1 seul.
 */
const jours = (valeur: string | undefined, langue: Langue): string => {
  const n = Number(valeur ?? "");
  const nombre = Number.isFinite(n) ? n : 0;
  if (langue === "fr") return `${nombre} ${Math.abs(nombre) < 2 ? "jour" : "jours"}`;
  return `${nombre} ${Math.abs(nombre) === 1 ? "day" : "days"}`;
};

const CORPS: Record<string, Record<Langue, (p: Record<string, string>) => string>> = {
  tache_assignee: {
    fr: (p) => `La tâche « ${p["tache"] ?? ""} » vous a été assignée.`,
    en: (p) => `Task “${p["tache"] ?? ""}” has been assigned to you.`,
  },
  conge_a_valider: {
    fr: (p) => `Une demande de congé de ${jours(p["jours"], "fr")} attend votre décision.`,
    en: (p) => `A leave request of ${jours(p["jours"], "en")} is awaiting your decision.`,
  },
  /*
   * Un seul type pour les deux faces de la décision — `cadrage/01 § M18` n'en
   * énonce qu'un —, donc `decision` porte laquelle. Le motif de refus est une
   * CITATION : il reste dans la langue où son auteur l'a écrit, seule la
   * phrase qui l'entoure se rend. Sans ce modèle, le refus s'affichait le
   * corps vide, et le motif — la première chose qu'on cherche — était perdu.
   */
  conge_decide: {
    fr: (p) => {
      if (p["decision"] === "refuse") {
        const motif = p["motif"];
        return motif
          ? `Votre demande de congé a été refusée. Motif : ${motif}`
          : "Votre demande de congé a été refusée.";
      }
      return "Votre demande de congé a été approuvée.";
    },
    en: (p) => {
      if (p["decision"] === "refuse") {
        const motif = p["motif"];
        return motif
          ? `Your leave request was declined. Reason: ${motif}`
          : "Your leave request was declined.";
      }
      return "Your leave request was approved.";
    },
  },
  ajout_projet: {
    fr: (p) => `Vous avez été ajouté au projet « ${p["projet"] ?? ""} ».`,
    en: (p) => `You have been added to the project “${p["projet"] ?? ""}”.`,
  },
  tache_echeance_proche: {
    fr: (p) => `La tâche « ${p["tache"] ?? ""} » arrive à échéance le ${p["date"] ?? ""}.`,
    en: (p) => `Task “${p["tache"] ?? ""}” is due on ${p["date"] ?? ""}.`,
  },
  tache_en_retard: {
    fr: (p) => `La tâche « ${p["tache"] ?? ""} » a dépassé son échéance du ${p["date"] ?? ""}.`,
    en: (p) => `Task “${p["tache"] ?? ""}” is past its due date of ${p["date"] ?? ""}.`,
  },
};

export const titreNotification = (type: string, langue: Langue): string | null =>
  (TITRES as Record<string, Record<Langue, string>>)[type]?.[langue] ?? null;

/**
 * La marque d'un corps composable, dans la colonne `contenu`.
 *
 * **Le schéma n'a pas de colonne pour cela** — ni `cle`, ni `params` —, et le
 * modifier relève d'une tâche de schéma dédiée. La marque est donc préfixée :
 * un corps qui ne la porte pas est une phrase déjà rédigée, rendue telle
 * quelle, ce qui garde compatibles les notifications déjà en base et les
 * émetteurs pas encore convertis. La forme durable est signalée au compte
 * rendu : deux colonnes, et cette marque disparaît.
 */
const MARQUE = "i18n:";

export const encoderCorps = (cle: string, params: Record<string, string>): string =>
  `${MARQUE}${JSON.stringify({ cle, params })}`;

/** Rend un corps stocké dans la langue du lecteur, avec sa clé et ses paramètres. */
export function rendreCorps(
  contenu: string,
  langue: Langue,
): { texte: string; cle: string | null; params: Record<string, string> } {
  if (!contenu.startsWith(MARQUE)) return { texte: contenu, cle: null, params: {} };
  try {
    const charge = JSON.parse(contenu.slice(MARQUE.length)) as {
      cle?: unknown;
      params?: unknown;
    };
    const cle = typeof charge.cle === "string" ? charge.cle : null;
    const params =
      charge.params && typeof charge.params === "object"
        ? (charge.params as Record<string, string>)
        : {};
    const modele = cle ? CORPS[cle]?.[langue] : undefined;
    // Une clé sans modèle rend une chaîne vide plutôt que du JSON : le panneau
    // affiche alors son titre seul, ce qui reste lisible.
    return { texte: modele ? modele(params) : "", cle, params };
  } catch {
    return { texte: "", cle: null, params: {} };
  }
}
