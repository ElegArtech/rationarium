import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";

/**
 * Socle des imports CSV — M21, `RG-IMP-01` à `RG-IMP-06`.
 *
 * Six types d'import partagent la même mécanique, et `cadrage/02 § D.6`
 * demande explicitement un gabarit commun. Il est ici, écrit une fois.
 *
 * Trois exigences le structurent :
 *
 *   `RG-IMP-01` — virgule ET point-virgule acceptés. Un tableur français
 *   produit du point-virgule ; refuser ce cas ferait échouer la majorité des
 *   fichiers réels.
 *
 *   `RG-IMP-03` — tout import passe par une **prévisualisation** avant
 *   exécution. D'où deux temps distincts : `analyser` puis `executer`.
 *
 *   `RG-IMP-04` — le compte rendu distingue **systématiquement** importés,
 *   ignorés (doublons) et en erreur, avec le détail des erreurs. Trois
 *   catégories, jamais deux : « ignoré » et « en erreur » ne se confondent pas,
 *   parce que le premier est normal et le second demande une correction.
 */

export type LigneImport<T> = {
  numero: number;
  brut: Record<string, string>;
  valeur?: T;
  statut: "valide" | "doublon" | "erreur";
  motif?: string;
};

export type Analyse<T> = {
  colonnesAttendues: string[];
  colonnesTrouvees: string[];
  colonnesManquantes: string[];
  lignes: LigneImport<T>[];
  resume: { total: number; valides: number; doublons: number; erreurs: number };
};

export type CompteRendu = {
  importes: number;
  ignores: number;
  erreurs: number;
  detail: { numero: number; motif: string }[];
};

/**
 * Détection du séparateur — `RG-IMP-01`.
 *
 * On compare le nombre de colonnes obtenu avec chaque séparateur sur la
 * première ligne. Le bon séparateur est celui qui en produit le plus : un
 * fichier à point-virgule lu avec des virgules donne une seule colonne.
 */
export const detecterSeparateur = (contenu: string): "," | ";" => {
  const premiere = contenu.split(/\r?\n/)[0] ?? "";
  return (premiere.match(/;/g)?.length ?? 0) > (premiere.match(/,/g)?.length ?? 0) ? ";" : ",";
};

/** `RG-IMP-02` — un modèle de fichier est téléchargeable pour chaque type. */
export const modeleCsv = (colonnes: string[], exemple: Record<string, string>[]): string =>
  stringify(exemple, { header: true, columns: colonnes, delimiter: ";" });

export async function analyserCsv<T>(
  contenu: string,
  options: {
    colonnesAttendues: string[];
    colonnesObligatoires: string[];
    /** Valide et convertit une ligne. Lever pour la refuser. */
    valider: (ligne: Record<string, string>) => Promise<T> | T;
    /** Une clé de doublon identique fait passer la ligne en « ignoré ». */
    cleDoublon?: (valeur: T) => string;
    /** Doublons déjà présents en base. */
    existeDeja?: (valeur: T) => Promise<boolean>;
  },
): Promise<Analyse<T>> {
  const separateur = detecterSeparateur(contenu);
  const brutes = parse(contenu, {
    columns: true,
    delimiter: separateur,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  }) as Record<string, string>[];

  const colonnesTrouvees = Object.keys(brutes[0] ?? {});
  const colonnesManquantes = options.colonnesObligatoires.filter(
    (c) => !colonnesTrouvees.includes(c),
  );

  const lignes: LigneImport<T>[] = [];
  const vues = new Set<string>();

  for (const [i, brut] of brutes.entries()) {
    const numero = i + 2; // ligne 1 = en-têtes

    if (colonnesManquantes.length > 0) {
      lignes.push({
        numero, brut, statut: "erreur",
        motif: `colonnes obligatoires manquantes : ${colonnesManquantes.join(", ")}`,
      });
      continue;
    }

    try {
      const valeur = await options.valider(brut);

      // Doublon dans le fichier lui-même.
      const cle = options.cleDoublon?.(valeur);
      if (cle && vues.has(cle)) {
        lignes.push({ numero, brut, valeur, statut: "doublon", motif: "doublon dans le fichier" });
        continue;
      }
      if (cle) vues.add(cle);

      // Doublon déjà en base.
      if (options.existeDeja && (await options.existeDeja(valeur))) {
        lignes.push({ numero, brut, valeur, statut: "doublon", motif: "existe déjà" });
        continue;
      }

      lignes.push({ numero, brut, valeur, statut: "valide" });
    } catch (e) {
      lignes.push({
        numero, brut, statut: "erreur",
        motif: e instanceof Error ? e.message : "ligne invalide",
      });
    }
  }

  return {
    colonnesAttendues: options.colonnesAttendues,
    colonnesTrouvees,
    colonnesManquantes,
    lignes,
    resume: {
      total: lignes.length,
      valides: lignes.filter((l) => l.statut === "valide").length,
      doublons: lignes.filter((l) => l.statut === "doublon").length,
      erreurs: lignes.filter((l) => l.statut === "erreur").length,
    },
  };
}

/**
 * Exécute un import analysé.
 *
 * `RG-IMP-06` — en mode **tout-ou-rien**, une seule ligne en erreur annule
 * l'ensemble et ne supprime rien. Le mode est porté par l'appelant, qui décide
 * s'il enveloppe dans une transaction.
 */
export async function executerImport<T>(
  analyse: Analyse<T>,
  ecrire: (valeurs: T[]) => Promise<void>,
  options: { toutOuRien?: boolean } = {},
): Promise<CompteRendu> {
  const erreurs = analyse.lignes.filter((l) => l.statut === "erreur");

  if (options.toutOuRien && erreurs.length > 0) {
    return {
      importes: 0,
      ignores: 0,
      erreurs: erreurs.length,
      detail: erreurs.map((l) => ({ numero: l.numero, motif: l.motif ?? "" })),
    };
  }

  const valides = analyse.lignes.filter((l) => l.statut === "valide").map((l) => l.valeur as T);
  if (valides.length > 0) await ecrire(valides);

  return {
    importes: valides.length,
    ignores: analyse.resume.doublons,
    erreurs: erreurs.length,
    detail: erreurs.map((l) => ({ numero: l.numero, motif: l.motif ?? "" })),
  };
}
