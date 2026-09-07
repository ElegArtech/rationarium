/**
 * Les motifs **ligne à ligne** d'un compte rendu d'import — `RG-GEN-08`.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * **Le serveur nomme la situation, le client la formule.**
 *
 * C'est déjà la doctrine de `commun/messages-metier.ts` pour les échecs de
 * requête ; elle manquait au seul endroit du produit où le serveur rédige des
 * phrases destinées à l'écran plutôt qu'au journal. Les messages du compte
 * rendu d'import partaient donc en français figé, quelle que soit la langue de
 * la session : une session anglaise lisait « Row 6 — aucun compte ne porte
 * l'adresse « … » ».
 *
 * Chaque motif rend trois choses, et les trois comptent :
 *
 *   - `cle` — la clé du catalogue client, **préfixée de son espace de noms**
 *     (`imports:`), pour que `t(cle, params)` la résolve telle quelle ;
 *   - `params` — les valeurs à interpoler, nommées comme dans le catalogue.
 *     Elles ne sont jamais recopiées dans la phrase par le serveur : c'est la
 *     traduction qui décide de leur place, et l'ordre des compléments n'est
 *     pas le même d'une langue à l'autre ;
 *   - `message` — la phrase française, **en repli**. Elle sert au journal du
 *     serveur, aux tests d'intégration, et à un client dont le catalogue
 *     ignorerait la clé. Elle n'est pas la vérité affichable ; elle est le
 *     dernier recours.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `RG-GEN-03` — chaque message est **actionnable** : il dit quoi corriger dans
 * le fichier, pas seulement que la ligne a échoué. C'est la contrepartie du
 * numéro de ligne : savoir *où* sans savoir *quoi* oblige à deviner.
 */

export type Motif = {
  cle: string;
  params: Record<string, string | number>;
  message: string;
};

/** Un motif rattaché à sa ligne du fichier — en-tête comprise, base 1. */
export type LigneRendu = Motif & { ligne: number };

/**
 * Le préfixe est posé ici, une fois. Écrit à chaque appel, il finirait par
 * diverger d'un motif à l'autre, et une clé sans espace de noms se résout dans
 * le catalogue par défaut — donc jamais.
 */
const ESPACE = "imports:motifs.";

const motif = (
  nom: string,
  params: Record<string, string | number>,
  message: string,
): Motif => ({ cle: `${ESPACE}${nom}`, params, message });

export const MOTIFS = {
  // ── Analyse : ce que le fichier dit de lui-même ─────────────────────────

  colonneVide: (colonne: string): Motif =>
    motif("colonneVide", { colonne }, `colonne « ${colonne} » vide`),

  nombreHorsBornes: (colonne: string, valeur: string, min: number, max: number): Motif =>
    motif(
      "nombreHorsBornes",
      { colonne, valeur, min, max },
      `colonne « ${colonne} » : « ${valeur} » n'est pas un entier de ${min} à ${max}`,
    ),

  /** `RG-TSK-17` — une tâche « done » est à cent, et l'écart est explicite. */
  avancementIncoherent: (attendu: number): Motif =>
    motif(
      "avancementIncoherent",
      // `done` est un CODE du vocabulaire, mais il paraît dans la phrase :
      // il y entre donc par un paramètre, comme tout le reste. Un mot recopié
      // dans le patron français ne survit pas à la traduction.
      { colonne: "progress", statut: "done", attendu },
      `colonne « progress » : une tâche « done » est à ${attendu}`,
    ),

  /** `cadrage/01 § M21` — une colonne d'énumération porte le CODE, pas le libellé. */
  valeurInconnue: (colonne: string, valeur: string, attendues: string): Motif =>
    motif(
      "valeurInconnue",
      { colonne, valeur, attendues },
      `colonne « ${colonne} » : « ${valeur} » inconnu, attendu ${attendues}`,
    ),

  // ── Utilisateurs — RG-USR-01 ────────────────────────────────────────────
  //
  // **Deux collisions, deux messages.** Une seule requête `OR` incrémentait
  // « ignorés » sans rien dire : deux lignes refusées pour deux causes
  // opposées — l'adresse d'un côté, l'identifiant de l'autre — et aucune
  // façon de savoir laquelle corriger.

  emailDejaPris: (email: string): Motif =>
    motif(
      "emailDejaPris",
      { email },
      `un compte porte déjà l'adresse « ${email} » : ligne ignorée.`,
    ),

  loginDejaPris: (login: string): Motif =>
    motif(
      "loginDejaPris",
      { login },
      `un compte porte déjà l'identifiant « ${login} » : ligne ignorée.`,
    ),

  // ── Compétences — EX-CMP-09, RG-CMP-05 ─────────────────────────────────

  categorieInconnue: (valeur: string, attendues: string): Motif =>
    motif(
      "categorieInconnue",
      { valeur, attendues },
      `catégorie « ${valeur} » inconnue. Valeurs attendues : ${attendues}.`,
    ),

  effectifInvalide: (valeur: string): Motif =>
    motif(
      "effectifInvalide",
      { valeur },
      `effectif requis « ${valeur} » invalide : un nombre entier positif ou nul est attendu.`,
    ),

  competenceDejaPresente: (nom: string): Motif =>
    motif(
      "competenceDejaPresente",
      { nom },
      `la compétence « ${nom} » existe déjà : ligne ignorée.`,
    ),

  // ── Jalons — RG-IMP-04 ─────────────────────────────────────────────────

  jalonDejaPresent: (nom: string): Motif =>
    motif("jalonDejaPresent", { nom }, `le jalon « ${nom} » existe déjà : ligne ignorée.`),

  // ── Congés — EX-CNG-14, RG-CNG-32 ──────────────────────────────────────

  compteInconnu: (email: string): Motif =>
    motif("compteInconnu", { email }, `aucun compte ne porte l'adresse « ${email} ».`),

  compteDesactive: (email: string): Motif =>
    motif(
      "compteDesactive",
      { email },
      `le compte « ${email} » est désactivé : aucun congé ne peut lui être ajouté.`,
    ),

  horsPerimetre: (email: string): Motif =>
    motif("horsPerimetre", { email }, `le compte « ${email} » est hors de votre périmètre.`),

  typeInconnu: (nom: string): Motif =>
    motif("typeInconnu", { nom }, `aucun type de congé ne s'appelle « ${nom} ».`),

  dateIllisible: (debut: string, fin: string): Motif =>
    motif(
      "dateIllisible",
      { debut, fin },
      `date illisible : « ${debut} » → « ${fin} ». Le format attendu est AAAA-MM-JJ.`,
    ),

  /** `RG-CNG-28` — la fin est postérieure ou égale au début. */
  datesInversees: (debut: string, fin: string): Motif =>
    motif(
      "datesInversees",
      { debut, fin },
      `la date de fin (${fin}) précède la date de début (${debut}) : inversez-les.`,
    ),

  demiJourneeInconnue: (valeur: string, attendues: string): Motif =>
    motif(
      "demiJourneeInconnue",
      { valeur, attendues },
      `demi-journée « ${valeur} » inconnue. Valeurs attendues : ${attendues}, ` +
        `ou la colonne laissée vide.`,
    ),

  /** `RG-CNG-18` — la demi-journée simple ne vaut que sur un seul jour. */
  demiJourneeSurPlusieursJours: (): Motif =>
    motif(
      "demiJourneeSurPlusieursJours",
      {},
      "une demi-journée ne s'applique qu'à un congé d'une seule journée : " +
        "laissez la colonne vide, ou ramenez les deux dates au même jour.",
    ),

  /** `RG-CNG-21` — le refus de solde est CHIFFRÉ, sinon il n'aide pas. */
  soldeInsuffisant: (
    annee: string,
    demandes: string,
    disponibles: string,
    manquants: string,
  ): Motif =>
    motif(
      "soldeInsuffisant",
      { annee, demandes, disponibles, manquants },
      `solde insuffisant pour ${annee} : ${demandes} jour(s) demandé(s), ` +
        `${disponibles} disponible(s), ${manquants} manquant(s).`,
    ),

  /** `RG-CNG-29` — un type désactivé n'est plus sélectionnable. */
  typeDesactive: (nom: string): Motif =>
    motif(
      "typeDesactive",
      { nom },
      `le type de congé « ${nom} » est désactivé : réactivez-le, ` +
        `ou choisissez un autre type sur cette ligne.`,
    ),

  /** `RG-CNG-32` — doublon et chevauchement sont un IGNORÉ, pas une erreur. */
  chevauchement: (): Motif =>
    motif(
      "chevauchement",
      {},
      "cette période chevauche un congé déjà enregistré : ligne ignorée.",
    ),

  // ── Le dernier recours ─────────────────────────────────────────────────

  /**
   * Ce qu'aucun contrôle n'a su nommer.
   *
   * Le détail technique reste en paramètre plutôt que fondu dans la phrase :
   * la traduction décide de l'y montrer ou non, et le journal du serveur le
   * garde dans tous les cas. Une occurrence de ce motif est le signal qu'un
   * contrôle manque en amont, à l'analyse — là où le numéro de ligne existe.
   */
  erreurTechnique: (detail: string): Motif =>
    motif(
      "erreurTechnique",
      { detail },
      `la ligne n'a pas pu être enregistrée : ${detail}`,
    ),
} as const;

/** Les noms de motifs, pour les contrôles de couverture du catalogue client. */
export const NOMS_MOTIFS = Object.keys(MOTIFS) as (keyof typeof MOTIFS)[];
