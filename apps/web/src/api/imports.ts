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

/**
 * `EX-CMP-09` — l'import du référentiel de compétences, vue 22.
 *
 * La colonne `category` porte le **code** du vocabulaire (`technical`,
 * `methodology`, `soft_skill`, `business`) : c'est ce que le modèle propose et
 * ce que l'export écrit, donc ce qui fait de l'export un aller-retour. Les
 * libellés français et anglais restent acceptés en lecture, pour le fichier
 * rempli à la main.
 */
export const importerCompetences = (contenu: string) =>
  appeler<CompteRendu>("/imports/competences", { methode: "POST", corps: { contenu } });

/**
 * `EX-CNG-14` — l'import de congés en masse, vue 19.
 *
 * `RG-CNG-32` — doublons et **chevauchements** reviennent en « ignorés », pas
 * en erreurs : rejouer un fichier RH est un usage normal. Le compte rendu est
 * celui des autres imports, et la fenêtre partagée l'affiche telle quelle.
 */
export const importerConges = (contenu: string) =>
  appeler<CompteRendu>("/imports/conges", { methode: "POST", corps: { contenu } });

/**
 * L'import CSV des seules tâches d'un projet — vue 12, bouton « Importer CSV ».
 *
 * **La route serveur n'existe pas encore.** Le contrôleur M21 expose l'aperçu
 * (`POST /imports/apercu?type=taches`, qui fonctionne : le modèle et l'analyse
 * connaissent le type `taches`), l'import projet complet et les exports — mais
 * aucun `POST /imports/projet/:id/taches`. Même situation, et même traitement,
 * que `importerCompetences` : le manque est remonté au cadrage plutôt que
 * comblé ici, un module serveur n'étant pas la sortie d'une tâche de vue.
 */
export const importerTaches = (projetId: string, contenu: string) =>
  appeler<CompteRendu>(`/imports/projet/${projetId}/taches`, {
    methode: "POST",
    corps: { contenu },
  });

/**
 * L'import des jalons d'un projet — vue 13, action « Importer CSV ».
 *
 * **La route serveur n'existe pas encore.** `cadrage/01 § M21` impose pourtant
 * l'objet « Jalons d'un projet » (`name*`, `description`, `dueDate*`), et le
 * contrôleur M21 en connaît déjà les deux extrémités : l'aperçu accepte le type
 * `jalons`, et `GET /imports/export/projet/:id/jalons` produit exactement ces
 * colonnes. Il manque l'exécution au milieu. Même situation, et même parti pris,
 * que `importerCompetences` : le manque est remonté au cadrage plutôt que
 * comblé ici.
 */
export const importerJalons = (projetId: string, contenu: string) =>
  appeler<CompteRendu>(`/imports/projet/${projetId}/jalons`, {
    methode: "POST",
    corps: { contenu },
  });

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
