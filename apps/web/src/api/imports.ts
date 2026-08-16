import { appeler } from "./client.js";

/**
 * M21 — imports et exports.
 *
 * **Deux appels par import, jamais un.** `apercu` ne touche à rien, `executer`
 * écrit : c'est `RG-IMP-03` rendu visible jusque dans le client. Un seul appel
 * avec un drapeau « simulation » aurait la même signature pour deux
 * comportements de nature opposée.
 */

export type TypeImport =
  | "utilisateurs"
  | "taches"
  | "jalons"
  | "projet"
  | "conges"
  | "competences";

export type LigneErreur = { ligne: number; message: string };

export type Apercu = {
  lignes: Record<string, string>[];
  total: number;
  erreurs: LigneErreur[];
};

/** `RG-IMP-04` — trois familles, jamais deux. */
export type CompteRendu = {
  importes: number;
  ignores: number;
  erreurs: LigneErreur[];
};

export const apercu = (type: TypeImport, contenu: string) =>
  appeler<Apercu>(`/imports/apercu?type=${type}`, { methode: "POST", corps: { contenu } });

export const importerUtilisateurs = (contenu: string) =>
  appeler<CompteRendu>("/imports/utilisateurs", { methode: "POST", corps: { contenu } });

export const volumesRemplacement = (projetId: string) =>
  appeler<{ jalons: number; taches: number; sousTaches: number }>(
    `/imports/projet/${projetId}/volumes`,
  );

export const importerProjet = (
  projetId: string,
  contenu: string,
  mode: "ajouter" | "remplacer",
) =>
  appeler<CompteRendu>(`/imports/projet/${projetId}`, {
    methode: "POST",
    corps: { contenu, mode },
  });

/** Les adresses de téléchargement : ouvertes par le navigateur. */
export const adresseModele = (type: TypeImport) => `/api/imports/modele?type=${type}`;
export const adresseExportTaches = (projetId: string) =>
  `/api/imports/export/projet/${projetId}/taches`;
export const adresseExportJalons = (projetId: string) =>
  `/api/imports/export/projet/${projetId}/jalons`;
export const adresseExportCompetences = () => "/api/imports/export/competences";
