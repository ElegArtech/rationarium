/**
 * La bibliothèque d'icônes de projet — `cadrage/02`, vue 10.
 *
 * **Cinquante icônes, onze catégories, et la liste est FERMÉE.** Le brief de la
 * vue 10 décrit un sélecteur avec sa recherche, ses catégories et son état
 * « Aucune icône » : c'est donc un vocabulaire, pas une chaîne libre. Le
 * contrat acceptait pourtant `icone: z.string().max(60)`, et le produit y
 * rangeait un caractère — là où la maquette dessine un symbole SVG.
 *
 * Conséquence visible sur une dizaine de vues : la pastille de projet rendait
 * une lettre de 8 px au lieu du dessin, et `picon` manquait partout.
 *
 * **L'identité d'un projet est portée par sa pastille, jamais par la couleur**,
 * qui reste réservée au statut. C'est la règle des vues 07, 12 et 16, et c'est
 * pourquoi deux projets peuvent partager une couleur mais pas une icône.
 */

import { z } from "zod";

export type CategorieIconeProjet = {
  readonly code: string;
  readonly fr: string;
  readonly en: string;
};

export type IconeProjet = CategorieIconeProjet & {
  readonly categorie: string;
};

/** Les onze familles du sélecteur, dans l'ordre de la maquette. */
export const CATEGORIES_ICONE_PROJET: readonly CategorieIconeProjet[] = [
  { code: "ges", fr: "Gestion", en: "Management" },
  { code: "num", fr: "Numérique", en: "Digital" },
  { code: "fin", fr: "Finances", en: "Finance" },
  { code: "rh", fr: "RH", en: "HR" },
  { code: "ter", fr: "Territoire", en: "Territory" },
  { code: "soc", fr: "Social", en: "Social" },
  { code: "cul", fr: "Culture & Éducation", en: "Culture & Education" },
  { code: "sec", fr: "Sécurité", en: "Safety" },
  { code: "env", fr: "Environnement", en: "Environment" },
  { code: "jur", fr: "Juridique", en: "Legal" },
  { code: "sym", fr: "Symboles", en: "Symbols" },
] as const;

export const ICONES_PROJET: readonly IconeProjet[] = [
  { code: "p-folder", categorie: "ges", fr: "Dossier", en: "Folder" },
  { code: "p-target", categorie: "ges", fr: "Objectif", en: "Target" },
  { code: "p-clipboard", categorie: "ges", fr: "Suivi", en: "Checklist" },
  { code: "p-flow", categorie: "ges", fr: "Organisation", en: "Org chart" },
  { code: "p-calcheck", categorie: "ges", fr: "Échéancier", en: "Schedule" },
  { code: "p-screen", categorie: "num", fr: "Site web", en: "Website" },
  { code: "p-server", categorie: "num", fr: "Serveur", en: "Server" },
  { code: "p-cloud", categorie: "num", fr: "Hébergement", en: "Hosting" },
  { code: "p-code", categorie: "num", fr: "Développement", en: "Development" },
  { code: "p-database", categorie: "num", fr: "Données", en: "Database" },
  { code: "p-coin", categorie: "fin", fr: "Budget", en: "Budget" },
  { code: "p-chart", categorie: "fin", fr: "Analyse financière", en: "Financials" },
  { code: "p-wallet", categorie: "fin", fr: "Subvention", en: "Funding" },
  { code: "p-calc", categorie: "fin", fr: "Comptabilité", en: "Accounting" },
  { code: "p-person", categorie: "rh", fr: "Agent", en: "Employee" },
  { code: "p-group", categorie: "rh", fr: "Équipe", en: "Team" },
  { code: "p-badge", categorie: "rh", fr: "Recrutement", en: "Recruitment" },
  { code: "p-handshake", categorie: "rh", fr: "Partenariat", en: "Partnership" },
  { code: "p-map", categorie: "ter", fr: "Territoire", en: "Territory" },
  { code: "p-pin", categorie: "ter", fr: "Site", en: "Location" },
  { code: "p-road", categorie: "ter", fr: "Voirie", en: "Roads" },
  { code: "p-cityhall", categorie: "ter", fr: "Bâtiment public", en: "Public building" },
  { code: "p-bridge", categorie: "ter", fr: "Ouvrage d\u2019art", en: "Bridge" },
  { code: "p-heart", categorie: "soc", fr: "Action sociale", en: "Social care" },
  { code: "p-ring", categorie: "soc", fr: "Solidarité", en: "Solidarity" },
  { code: "p-house", categorie: "soc", fr: "Logement", en: "Housing" },
  { code: "p-basket", categorie: "soc", fr: "Aide alimentaire", en: "Food aid" },
  { code: "p-book", categorie: "cul", fr: "Médiathèque", en: "Library" },
  { code: "p-palette", categorie: "cul", fr: "Arts plastiques", en: "Visual arts" },
  { code: "p-mask", categorie: "cul", fr: "Spectacle vivant", en: "Performing arts" },
  { code: "p-graduate", categorie: "cul", fr: "Éducation", en: "Education" },
  { code: "p-music", categorie: "cul", fr: "Musique", en: "Music" },
  { code: "p-shield", categorie: "sec", fr: "Prévention", en: "Prevention" },
  { code: "p-helmet", categorie: "sec", fr: "Chantier", en: "Worksite" },
  { code: "p-extinguisher", categorie: "sec", fr: "Incendie", en: "Fire safety" },
  { code: "p-camera", categorie: "sec", fr: "Vidéoprotection", en: "CCTV" },
  { code: "p-lock", categorie: "sec", fr: "Sécurité", en: "Security" },
  { code: "p-leaf", categorie: "env", fr: "Biodiversité", en: "Biodiversity" },
  { code: "p-tree", categorie: "env", fr: "Espaces verts", en: "Green spaces" },
  { code: "p-drop", categorie: "env", fr: "Eau", en: "Water" },
  { code: "p-sun", categorie: "env", fr: "Énergie", en: "Energy" },
  { code: "p-recycle", categorie: "env", fr: "Déchets", en: "Waste" },
  { code: "p-scales", categorie: "jur", fr: "Juridique", en: "Legal" },
  { code: "p-gavel", categorie: "jur", fr: "Contentieux", en: "Litigation" },
  { code: "p-scroll", categorie: "jur", fr: "Délibération", en: "Deliberation" },
  { code: "p-stamp", categorie: "jur", fr: "État civil", en: "Registry" },
  { code: "p-star", categorie: "sym", fr: "Priorité", en: "Priority" },
  { code: "p-bolt", categorie: "sym", fr: "Urgence", en: "Urgent" },
  { code: "p-flag", categorie: "sym", fr: "Jalon", en: "Milestone" },
  { code: "p-bulb", categorie: "sym", fr: "Innovation", en: "Innovation" },
] as const;

/** L'icône existe-t-elle au catalogue ? Une valeur hors liste est refusée. */
export const estIconeProjet = (code: string): boolean =>
  ICONES_PROJET.some((i) => i.code === code);

/**
 * L'icône d'un projet, **confrontée à la bibliothèque**.
 *
 * `EX-PRJ-04` dit « choisir une icône *dans une bibliothèque* » : c'est un
 * vocabulaire fermé, au même titre que les statuts et les priorités de
 * `cadrage/01 § 4.1`. Le contrôleur acceptait pourtant `z.string().max(20)` et
 * n'a jamais appelé `estIconeProjet` : n'importe quelle chaîne entrait en base,
 * et la pastille rendait alors un `<use href="#nimportequoi">` que rien ne
 * définit — une boîte vide, sans erreur, sans avertissement. Le membre de la
 * famille « inerte et invisible » propre à ce champ.
 *
 * La contrainte se pose ICI, à côté de la liste, et non dans le contrôleur :
 * deux définitions du même vocabulaire divergent à la première icône ajoutée.
 *
 * Le message est en langue naturelle et **dit quoi faire** (`RG-GEN-03`) : ce
 * refus s'affiche sous le champ, il ne finit pas dans un journal.
 */
export const iconeProjetSchema = z
  .string()
  .refine(
    estIconeProjet,
    "Cette icône ne fait pas partie de la bibliothèque. Choisissez-en une dans le sélecteur d'icône.",
  );
