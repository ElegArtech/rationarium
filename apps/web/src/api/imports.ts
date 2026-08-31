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
 * `EX-TSK-18` — l'import CSV des seules tâches d'un projet, vue 12.
 *
 * Cette fonction a vécu des mois en appelant une route qui n'existait pas : un
 * **404 que seule l'action de l'utilisateur révélait**. Ni le typage, ni les
 * parcours, ni aucune boucle ne peut voir un appel client sans route en face —
 * c'est le test de sens inverse de `surface-http.test.ts` qui l'a trouvée.
 *
 * Un jalon nommé dans `milestoneName` est retrouvé en base, jamais créé : c'est
 * ce qui distingue cet import de celui du projet entier.
 */
export const importerTaches = (projetId: string, contenu: string) =>
  appeler<CompteRendu>(`/imports/projet/${projetId}/taches`, {
    methode: "POST",
    corps: { contenu },
  });

/**
 * `EX-JAL-06` — l'import des jalons d'un projet, vue 13.
 *
 * Même histoire que `importerTaches` : le contrôleur connaissait les deux
 * extrémités — l'aperçu accepte le type `jalons`, et l'export produit
 * exactement ces colonnes — et l'exécution manquait au milieu. Un jalon dont le
 * nom existe déjà est **ignoré**, pas dupliqué : rejouer un fichier est un
 * usage normal (`RG-IMP-04`).
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
