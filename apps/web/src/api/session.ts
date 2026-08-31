import { appeler } from "./client.js";

export type Session = { userId: string; motDePasseAChanger: boolean };

export const connexion = (identifiant: string, motDePasse: string) =>
  appeler<Session>("/auth/login", { methode: "POST", corps: { identifiant, motDePasse } });

export const deconnexion = () => appeler<void>("/auth/logout", { methode: "POST" });

export const sessionCourante = () => appeler<Session>("/auth/me");

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
  version: number;
}) => appeler<unknown>("/auth/me", { methode: "PATCH", corps: donnees });
