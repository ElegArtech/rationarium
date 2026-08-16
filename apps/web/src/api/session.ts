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
