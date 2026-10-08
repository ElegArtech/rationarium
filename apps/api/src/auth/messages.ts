import type { EchecAuth } from "./auth.service.js";

/**
 * Traduction des situations d'échec en réponse HTTP.
 *
 * **Le serveur envoie une CLÉ, pas un texte affichable.** C'est le point
 * important : le serveur ne connaît pas la langue du lecteur, et RG-GEN-08
 * exige que toute chaîne visible soit traduisible. Le `message` accompagne la
 * clé comme repli — pour un client qui n'aurait pas le catalogue, et pour les
 * journaux — mais l'interface affiche la traduction de la clé.
 *
 * Les libellés de repli sont ceux des vues 01 à 05, **à la
 * lettre** : ils sont contractuels et vérifiés par la boucle de conformité.
 *
 * Les placer ici plutôt que dans le service tient la règle de séparation : le
 * service nomme la situation, la couche HTTP la formule.
 *
 * RG-GEN-03 — en langue naturelle, jamais en code technique.
 */
export const MESSAGES: Record<EchecAuth, { statut: number; cle: string; message: string }> = {
  identifiants_invalides: {
    statut: 401,
    cle: "auth:erreurs.identifiantsInvalides",
    message: "Identifiant ou mot de passe incorrect",
  },
  compte_verrouille: {
    statut: 429,
    cle: "auth:erreurs.compteVerrouille",
    message: "Trop de tentatives de connexion. Réessayez plus tard.",
  },
  compte_inactif: {
    statut: 403,
    cle: "auth:erreurs.compteInactif",
    message: "Identifiant ou mot de passe incorrect",
  },
  jeton_expire: {
    statut: 410,
    cle: "auth:erreurs.jetonExpire",
    message: "Ce token de réinitialisation a expiré",
  },
  jeton_deja_utilise: {
    statut: 409,
    cle: "auth:erreurs.jetonDejaUtilise",
    message: "Ce token de réinitialisation a déjà été utilisé",
  },
  jeton_invalide: {
    statut: 400,
    cle: "auth:erreurs.jetonInvalide",
    message: "Token de réinitialisation invalide",
  },
  ancien_mot_de_passe_incorrect: {
    statut: 400,
    cle: "auth:erreurs.ancienMotDePasseIncorrect",
    message: "Ancien mot de passe incorrect",
  },
  nouveau_identique: {
    statut: 400,
    cle: "auth:erreurs.nouveauIdentique",
    message: "Le nouveau mot de passe doit être différent de l'actuel",
  },
  email_deja_pris: { statut: 409, cle: "auth:erreurs.emailDejaPris", message: "Cet email est déjà utilisé" },
  login_deja_pris: { statut: 409, cle: "auth:erreurs.loginDejaPris", message: "Ce login est déjà utilisé" },
  domaine_non_autorise: {
    statut: 403,
    cle: "auth:erreurs.domaineNonAutorise",
    message: "Les inscriptions sont réservées aux adresses des domaines autorisés",
  },
  domaine_email_non_autorise: {
    statut: 403,
    cle: "auth:erreurs.domaineEmailNonAutorise",
    message: "Cette adresse n'appartient pas à un domaine de messagerie autorisé.",
  },
  mot_de_passe_actuel_requis: {
    statut: 400,
    cle: "auth:erreurs.motDePasseActuelRequis",
    message: "Saisissez votre mot de passe actuel pour changer d'adresse.",
  },
  mot_de_passe_actuel_incorrect: {
    statut: 400,
    cle: "auth:erreurs.motDePasseActuelIncorrect",
    message: "Mot de passe actuel incorrect",
  },
  inscription_desactivee: {
    statut: 403,
    cle: "auth:erreurs.inscriptionDesactivee",
    message: "La création de compte autonome est désactivée",
  },
  /*
   * `RG-AUTH-09` — l'avatar est soit un fichier, soit un visuel prédéfini,
   * soit rien. Le message dit quoi faire, pas ce qui a échoué : « conflit
   * d'état » serait vrai et inutilisable (`RG-GEN-03`).
   */
  avatar_ambigu: {
    statut: 409,
    cle: "auth:erreurs.avatarAmbigu",
    message: "Choisissez un visuel prédéfini ou une image téléversée, pas les deux. Retirez l'un des deux, puis enregistrez.",
  },
  avatar_predefini_invalide: {
    statut: 400,
    cle: "auth:erreurs.avatarPredefiniInvalide",
    message: "Ce visuel prédéfini n'est pas disponible. Choisissez-en un dans le catalogue, puis enregistrez.",
  },
  avatar_format_invalide: {
    statut: 400,
    cle: "auth:erreurs.avatarFormatInvalide",
    message: "Format non supporté. Utilisez jpg, png ou webp.",
  },
  avatar_vide: {
    statut: 400,
    cle: "auth:erreurs.avatarVide",
    message: "Choisissez une image jpg, png ou webp non vide, puis réessayez.",
  },
  /*
   * D08 — la clé est celle de toute pièce trop lourde du produit (`RG-DOC-04`),
   * pas une clé propre à l'avatar ; le plafond voyage dans `detail.maxOctets`.
   */
  avatar_trop_volumineux: {
    statut: 413,
    cle: "erreurs:fichierTropVolumineux",
    message: "Cette image est trop volumineuse. Choisissez une image de 2 Mo au plus.",
  },
  avatar_introuvable: {
    statut: 404,
    cle: "auth:erreurs.avatarIntrouvable",
    message: "Aucun avatar personnel n'est disponible. Téléversez une image depuis votre profil.",
  },
  conflit_de_version: {
    statut: 409,
    cle: "erreurs:conflitDeVersion",
    message: "Quelqu'un a modifié votre profil pendant votre saisie. Rechargez pour voir la version à jour, puis reprenez votre modification.",
  },
};
