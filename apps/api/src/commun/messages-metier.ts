/**
 * Traduction des situations d'échec métier en réponse HTTP.
 *
 * **Le serveur envoie une clé, pas un texte affichable** — même principe que
 * `auth/messages.ts`, étendu à tous les modules. Le `message` accompagne la
 * clé comme repli, pour les journaux et pour un client sans catalogue.
 *
 * **Pourquoi une table unique et non une par module.** Une trentaine de codes
 * sont partagés — `introuvable`, `conflit_de_version`, `hors_perimetre` — et
 * les dupliquer par module produirait, à terme, trente formulations
 * divergentes de la même situation. Le prix à payer est que la table doit
 * rester exhaustive : un code de service absent d'ici tombe en 500 générique,
 * ce que le test `messages-metier.test.ts` interdit.
 *
 * `RG-GEN-03` — en langue naturelle, jamais en code technique, et
 * **actionnable** : le message dit quoi faire, pas seulement ce qui a échoué.
 */

export type Message = { statut: number; cle: string; message: string };


const m = (statut: number, cle: string, message: string): Message => ({ statut, cle, message });

export const MESSAGES_METIER: Record<string, Message> = {
  // ── Transverses ──────────────────────────────────────────────────────────
  introuvable: m(404, "erreurs:introuvable", "Cet élément n'existe pas ou plus."),
  /*
   * `RG-DROITS-03` — la liste blanche vaut aussi À L'INTÉRIEUR d'un point
   * d'entrée. La garde protège la route ; ce refus protège le champ. Le message
   * nomme la permission manquante : « refusé » sans dire laquelle oblige à
   * deviner qui demander.
   */
  champ_hors_permission: m(
    403,
    "erreurs:champHorsPermission",
    "Ce champ demande une permission que vous n'avez pas. Le reste de votre modification n'a pas été enregistré.",
  ),
  role_systeme_non_modifiable: m(
    403,
    "erreurs:roleSystemeNonModifiable",
    "Les permissions d'un rôle système sont fixées par son modèle et ne se modifient pas. Dupliquez-le pour obtenir un rôle ajustable.",
  ),
  autrui_sans_permission: m(
    403,
    "erreurs:autruiSansPermission",
    "Agir sur le compte d'une autre personne demande une permission que vous n'avez pas. Vous pouvez le faire pour vous-même.",
  ),
  conflit_de_version: m(
    409,
    "erreurs:conflitDeVersion",
    "Quelqu'un a modifié cet élément pendant votre saisie. Rechargez pour voir la version à jour, puis reprenez votre modification.",
  ),
  hors_perimetre: m(
    403,
    "erreurs:horsPerimetre",
    "Cet élément est hors de votre périmètre.",
  ),
  nom_deja_pris: m(409, "erreurs:nomDejaPris", "Ce nom est déjà utilisé. Choisissez-en un autre."),
  code_deja_pris: m(409, "erreurs:codeDejaPris", "Ce code est déjà utilisé. Choisissez-en un autre."),
  email_deja_pris: m(
    409,
    "erreurs:emailDejaPris",
    "Cette adresse électronique est déjà associée à un compte.",
  ),
  login_deja_pris: m(409, "erreurs:loginDejaPris", "Cet identifiant est déjà pris."),
  dates_incoherentes: m(
    422,
    "erreurs:datesIncoherentes",
    "La date de fin précède la date de début.",
  ),
  suppression_bloquee: m(
    409,
    "erreurs:suppressionBloquee",
    "Cet élément est encore rattaché à d'autres. Détachez-les d'abord, ou archivez plutôt que supprimer.",
  ),
  rattachement_requis: m(
    422,
    "erreurs:rattachementRequis",
    "Rattachez cet élément à un projet ou à une tâche.",
  ),
  deja_assigne: m(409, "erreurs:dejaAssigne", "Cette personne est déjà assignée."),

  // ── Organisation — M2 ────────────────────────────────────────────────────
  direction_a_des_departements: m(
    409,
    "erreurs:directionADesDepartements",
    "Cette direction contient encore des départements. Déplacez-les ou supprimez-les d'abord.",
  ),
  service_hors_departement: m(
    422,
    "erreurs:serviceHorsDepartement",
    "Ce service n'appartient pas au département choisi.",
  ),

  // ── Utilisateurs — M3 ────────────────────────────────────────────────────
  soi_meme_interdit: m(
    422,
    "erreurs:soiMemeInterdit",
    "Vous ne pouvez pas effectuer cette action sur votre propre compte.",
  ),

  // ── Rôles et permissions — M20 ───────────────────────────────────────────
  role_systeme_non_supprimable: m(
    409,
    "erreurs:roleSystemeNonSupprimable",
    "Ce rôle est fourni avec le produit : il ne peut pas être supprimé. Dupliquez-le pour en créer une variante.",
  ),
  role_systeme_non_renommable: m(
    409,
    "erreurs:roleSystemeNonRenommable",
    "Le code d'un rôle fourni avec le produit ne peut pas être modifié.",
  ),
  permission_hors_catalogue: m(
    422,
    "erreurs:permissionHorsCatalogue",
    "Cette permission n'existe pas au catalogue.",
  ),
  role_utilise: m(
    409,
    "erreurs:roleUtilise",
    "Ce rôle est encore attribué à des comptes. Réattribuez-les avant de le supprimer.",
  ),

  // ── Projets — M4, M5 ─────────────────────────────────────────────────────
  projet_annule: m(
    409,
    "erreurs:projetAnnule",
    "Ce projet est annulé : il n'accepte plus de modification.",
  ),
  deja_archive: m(409, "erreurs:dejaArchive", "Ce projet est déjà archivé."),
  pas_archive: m(409, "erreurs:pasArchive", "Ce projet n'est pas archivé."),
  membre_en_double: m(409, "erreurs:membreEnDouble", "Cette personne est déjà membre de l'équipe."),
  membre_introuvable: m(404, "erreurs:membreIntrouvable", "Cette personne n'est pas membre de l'équipe."),
  jalon_autre_projet: m(
    422,
    "erreurs:jalonAutreProjet",
    "Ce jalon appartient à un autre projet.",
  ),

  epopee_en_double: m(
    409,
    "erreurs:epopeeEnDouble",
    "Une épopée porte déjà ce nom dans ce projet.",
  ),

  // ── Tâches — M6 ──────────────────────────────────────────────────────────
  dependance_circulaire: m(
    422,
    "erreurs:dependanceCirculaire",
    "Cette dépendance créerait un cycle : la tâche finirait par dépendre d'elle-même.",
  ),
  dependance_en_double: m(409, "erreurs:dependanceEnDouble", "Cette dépendance existe déjà."),
  dependance_autre_projet: m(
    422,
    "erreurs:dependanceAutreProjet",
    "Une dépendance ne peut relier que deux tâches du même projet.",
  ),
  dependance_sur_soi: m(
    422,
    "erreurs:dependanceSurSoi",
    "Une tâche ne peut pas dépendre d'elle-même.",
  ),
  supprimee_avec_dependantes: m(
    409,
    "erreurs:supprimeeAvecDependantes",
    "D'autres tâches dépendent de celle-ci. Retirez ces dépendances d'abord.",
  ),
  raci_en_double: m(
    409,
    "erreurs:raciEnDouble",
    "Cette personne porte déjà ce rôle sur la tâche.",
  ),
  hors_projet_avec_jalon: m(
    422,
    "erreurs:horsProjetAvecJalon",
    "Une tâche hors projet ne peut pas être rattachée à un jalon.",
  ),
  /*
   * `RG-TSK-02` — deux droits distincts, et un seul point d'entrée. Le message
   * nomme LES DEUX gestes, parce que le refus se lit dans les deux sens :
   * l'un manque le droit de créer hors projet, l'autre celui de créer dedans.
   * Dire « refusé » sans dire lequel obligerait à deviner quoi changer.
   */
  droit_de_creation_manquant: m(
    403,
    "erreurs:droitDeCreationManquant",
    "Créer une tâche dans un projet et créer une tâche hors projet sont deux droits distincts, et celui qu'il faut ici ne vous est pas accordé. Rattachez la tâche à un projet, ou demandez ce droit à un administrateur.",
  ),
  /** `RG-TSK-03` — être membre du projet, sauf gestion globale. */
  pas_membre_du_projet: m(
    403,
    "erreurs:pasMembreDuProjet",
    "Vous n'êtes pas membre de ce projet. Demandez à y être ajouté, ou créez cette tâche hors projet.",
  ),
  /** `RG-TSK-14` — sans permission élargie, on ne supprime que ses tâches. */
  suppression_reservee_aux_assignes: m(
    403,
    "erreurs:suppressionReserveeAuxAssignes",
    "Vous ne pouvez supprimer que les tâches qui vous sont assignées. Demandez la suppression à l'un de ses assignés, ou à un gestionnaire des tâches.",
  ),
  multi_assignee_date: m(
    422,
    "erreurs:multiAssigneeDate",
    "Cette tâche a plusieurs assignés : indiquez lequel est concerné.",
  ),

  // ── Activité récurrente — M8 ─────────────────────────────────────────────
  creneau_sans_horaires: m(
    422,
    "erreurs:creneauSansHoraires",
    "Un créneau demande une heure de début et une heure de fin.",
  ),
  tache_inactive: m(
    409,
    "erreurs:tacheInactive",
    "Cette tâche prédéfinie est désactivée : elle ne peut plus être assignée.",
  ),
  agent_indisponible: m(
    409,
    "erreurs:agentIndisponible",
    "Cette personne est absente sur la période : congé, événement ou permanence déjà posée.",
  ),

  // ── Événements — M9 ──────────────────────────────────────────────────────
  participant_en_double: m(
    409,
    "erreurs:participantEnDouble",
    "Cette personne est déjà invitée.",
  ),
  horizon_depasse: m(
    422,
    "erreurs:horizonDepasse",
    "La récurrence dépasse l'horizon de génération autorisé. Raccourcissez la période.",
  ),
  pas_un_parent: m(
    422,
    "erreurs:pasUnParent",
    "Cet événement n'est pas une série : il n'a pas d'occurrences.",
  ),
  plage_incomplete: m(
    422,
    "erreurs:plageIncomplete",
    "Indiquez la date de début et la date de fin.",
  ),
  horaires_incoherents: m(
    422,
    "erreurs:horairesIncoherents",
    "L'heure de fin précède l'heure de début.",
  ),
  /*
   * `RG-EVT-07` — la portée se déclare, elle ne se devine pas. Les deux refus
   * qui suivent tiennent la même règle par ses deux bouts : un défaut de portée
   * sur une série, une portée sur un événement isolé. Le message dit dans les
   * deux cas ce qu'il faut faire, pas seulement ce qui a échoué.
   */
  portee_requise: m(
    422,
    "erreurs:porteeRequise",
    "Cet événement appartient à une série : indiquez si l'action porte sur cette occurrence seulement, ou sur celle-ci et les suivantes.",
  ),
  portee_sans_serie: m(
    422,
    "erreurs:porteeSansSerie",
    "Cet événement n'appartient à aucune série : il n'y a pas de portée à choisir. Reprenez sans la préciser.",
  ),
  date_non_propageable: m(
    422,
    "erreurs:dateNonPropageable",
    "La date distingue les occurrences les unes des autres : elle se change sur cette occurrence seulement, pas sur toute la série.",
  ),

  // ── Congés — M10 ─────────────────────────────────────────────────────────
  type_inactif: m(
    409,
    "erreurs:typeInactif",
    "Ce type de congé est désactivé : il ne peut plus être demandé.",
  ),
  chevauchement: m(
    409,
    "erreurs:chevauchement",
    "Vous avez déjà une absence sur cette période.",
  ),
  solde_insuffisant: m(
    422,
    "erreurs:soldeInsuffisant",
    "Votre solde ne couvre pas cette demande.",
  ),
  statut_incompatible: m(
    409,
    "erreurs:statutIncompatible",
    "Cette action n'est pas possible dans l'état actuel de la demande.",
  ),
  auto_validation_interdite: m(
    403,
    "erreurs:autoValidationInterdite",
    "Vous ne pouvez pas valider votre propre demande.",
  ),
  collaborateur_inactif: m(
    409,
    "erreurs:collaborateurInactif",
    "Ce compte est désactivé.",
  ),
  pas_son_conge: m(
    403,
    "erreurs:pasSonConge",
    "Cette demande n'est pas la vôtre.",
  ),
  delegue_inactif: m(
    409,
    "erreurs:delegueInactif",
    "Le compte délégataire est désactivé : choisissez quelqu'un d'autre.",
  ),
  allocation_modifiee: m(
    409,
    "erreurs:allocationModifiee",
    "Le solde a changé depuis votre lecture. Rechargez la demande avant de valider.",
  ),

  // ── Télétravail — M11 ────────────────────────────────────────────────────
  plage_trop_longue: m(
    422,
    "erreurs:plageTropLongue",
    "La période déclarée dépasse la durée maximale autorisée.",
  ),
  regle_en_double: m(
    409,
    "erreurs:regleEnDouble",
    "Une règle récurrente couvre déjà ce jour.",
  ),

  // ── Temps passé — M12 ────────────────────────────────────────────────────
  acteur_ambigu: m(
    422,
    "erreurs:acteurAmbigu",
    "Indiquez un agent ou un intervenant externe, pas les deux.",
  ),
  plafond_journalier: m(
    422,
    "erreurs:plafondJournalier",
    "Le total déclaré sur cette journée dépasserait le plafond autorisé.",
  ),
  acteur_non_modifiable: m(
    409,
    "erreurs:acteurNonModifiable",
    "La personne d'une saisie ne se corrige pas : supprimez la saisie et recréez-la.",
  ),

  // ── Compétences — M13 ────────────────────────────────────────────────────
  competence_assignee: m(
    409,
    "erreurs:competenceAssignee",
    "Cette compétence est évaluée sur des comptes. Retirez ces évaluations d'abord.",
  ),

  // ── Tiers et clients — M14 ───────────────────────────────────────────────
  contact_sur_personne_morale: m(
    422,
    "erreurs:contactSurPersonneMorale",
    "Un tiers de type organisation porte des contacts, pas un contact unique.",
  ),
  tiers_archive: m(
    409,
    "erreurs:tiersArchive",
    "Ce tiers est archivé : il n'accepte plus de modification.",
  ),
  deja_rattache: m(409, "erreurs:dejaRattache", "Ce tiers est déjà rattaché à ce projet."),
  non_rattache_au_projet: m(
    422,
    "erreurs:nonRattacheAuProjet",
    "Ce tiers n'est pas rattaché à ce projet.",
  ),
  client_inactif: m(
    409,
    "erreurs:clientInactif",
    "Ce client est inactif : il ne peut plus être rattaché.",
  ),

  // ── Documents et commentaires — M15 ──────────────────────────────────────
  pas_son_contenu: m(
    403,
    "erreurs:pasSonContenu",
    "Vous ne pouvez modifier ou supprimer que vos propres contributions.",
  ),

  // ── Paramétrage — M19 ────────────────────────────────────────────────────
  jour_deja_declare: m(
    409,
    "erreurs:jourDejaDeclare",
    "Ce jour est déjà déclaré au calendrier.",
  ),

  // ── Tableau de bord — M16 ────────────────────────────────────────────────
  /**
   * `RG-DSH-01` — le message dit la limite ET ce qu'il faut faire. « Limite
   * atteinte » tout court laisserait chercher laquelle, et quoi en faire.
   */
  // ── Imports et exports — M21 ─────────────────────────────────────────────
  /**
   * `RG-IMP-04` — l'erreur NOMME les colonnes qui manquent. « Fichier
   * invalide » obligerait à comparer le fichier au modèle, colonne par colonne.
   */
  colonnes_manquantes: m(
    422,
    "erreurs:colonnesManquantes",
    "Le fichier ne contient pas toutes les colonnes obligatoires.",
  ),
  fichier_illisible: m(
    422,
    "erreurs:fichierIllisible",
    "Le fichier n'a pas pu être lu. Vérifiez qu'il s'agit bien d'un CSV.",
  ),
  /*
   * `RG-GEN-03` — actionnable, donc chiffré et suivi d'une issue. « Des données
   * empêchent le remplacement » laisse chercher lesquelles ; le détail porte le
   * nombre de saisies, et le message dit le seul chemin qui reste.
   */
  remplacement_impossible: m(
    409,
    "erreurs:remplacementImpossible",
    "Du temps a été déclaré sur les tâches de ce projet : le remplacement les effacerait. Importez en mode Ajouter, ou supprimez ces saisies d'abord.",
  ),

  limite_todos: m(
    422,
    "erreurs:limiteTodos",
    "Vous avez atteint la limite de to-dos. Terminez-en ou supprimez-en une pour en ajouter.",
  ),
};
