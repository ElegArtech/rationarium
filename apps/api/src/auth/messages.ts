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
 * Les libellés de repli sont ceux de `cadrage/02`, vues 01 à 05, **à la
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
  email_deja_pris: { statut: 409, cle: "auth:erreurs.emailDejaPris", message: "Cet email est déjà utilisé" },
  login_deja_pris: { statut: 409, cle: "auth:erreurs.loginDejaPris", message: "Ce login est déjà utilisé" },
  domaine_non_autorise: {
    statut: 403,
    cle: "auth:erreurs.domaineNonAutorise",
    message: "Les inscriptions sont réservées aux adresses des domaines autorisés",
  },
  inscription_desactivee: {
    statut: 403,
    cle: "auth:erreurs.inscriptionDesactivee",
    message: "La création de compte autonome est désactivée",
  },
};
