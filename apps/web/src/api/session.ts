import type { Session as SessionComplete } from "../session/session.js";
import { appeler } from "./client.js";

export type Session = { userId: string; motDePasseAChanger: boolean };

export const connexion = (identifiant: string, motDePasse: string) =>
  appeler<Session>("/auth/login", { methode: "POST", corps: { identifiant, motDePasse } });

export const deconnexion = () => appeler<void>("/auth/logout", { methode: "POST" });

export const sessionCourante = () => appeler<SessionComplete>("/auth/me");

export const inscription = (donnees: {
  prenom: string;
  nom: string;
  email: string;
  login: string;
  motDePasse: string;
  confirmation: string;
}) => appeler<{ userId: string }>("/auth/signup", { methode: "POST", corps: donnees });

export const demanderReinitialisation = (email: string) =>
  appeler<{ message: string }>("/auth/forgot-password", { methode: "POST", corps: { email } });

/**
 * `RG-AUTH-04` — l'état du lien, **avant** d'ouvrir le formulaire.
 *
 * Sans elle, la vue 04 laissait choisir et confirmer un mot de passe sur un
 * jeton expiré, déjà consommé ou inconnu, puis refusait. Les trois messages
 * existaient et arrivaient après le geste qu'ils devaient épargner.
 *
 * Rend l'adresse du compte concerné — la vue l'affiche sous « Compte
 * concerné », et rien ne le lui donnait jusqu'ici.
 */
export const verifierJeton = (jeton: string) =>
  appeler<{ email: string }>("/auth/verify-reset-token", {
    methode: "POST",
    corps: { jeton },
  });

export const reinitialiser = (jeton: string, motDePasse: string) =>
  appeler<{ message: string }>("/auth/reset-password", {
    methode: "POST",
    corps: { jeton, motDePasse },
  });

export const changerMotDePasse = (actuel: string, nouveau: string, confirmation: string) =>
  appeler<{ message: string }>("/auth/change-password", {
    methode: "POST",
    corps: { actuel, nouveau, confirmation },
  });

/**
 * `EX-AUTH-09` — modifier son propre profil.
 *
 * `PATCH /auth/me`, marquée `@Personnel()` côté serveur : session exigée,
 * aucune permission. Modifier son nom ne relève d'aucun des vingt-quatre
 * domaines de `cadrage/01 § 3.2`, et le catalogue est fermé.
 *
 * `version` est obligatoire (`RG-GEN-07`) : c'est elle qui manquait au profil
 * rendu, et c'est pour cela que la vue 35 est restée en lecture seule.
 */
export const modifierProfil = (donnees: {
  prenom?: string;
  nom?: string;
  email?: string;
  langue?: string;
  theme?: string;
  avatarFichier?: null;
  avatarPredefini?: SessionComplete["avatarPredefini"];
  version: number;
}) => appeler<SessionComplete>("/auth/me", { methode: "PATCH", corps: donnees });

/** `EX-AUTH-09` — l'avatar personnel réel, versionné comme le reste du profil. */
export const televerserAvatar = (donnees: {
  contenuBase64: string;
  typeMime: "image/jpeg" | "image/png" | "image/webp";
  version: number;
}) => appeler<SessionComplete>("/auth/me/avatar", { methode: "POST", corps: donnees });

export const supprimerAvatar = (version: number) =>
  appeler<SessionComplete>("/auth/me/avatar", { methode: "DELETE", corps: { version } });

/**
 * Le GET est effectué par le navigateur via `<img>`. Le chemin reste littéral
 * ici afin que la surface HTTP sache constater ce troisième client réel.
 */
export const adresseAvatar = (version: number): string => `/api/auth/me/avatar?v=${version}`;
