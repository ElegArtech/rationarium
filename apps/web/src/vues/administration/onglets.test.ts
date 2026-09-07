import { describe, it, expect } from "vitest";
import { ongletParametres } from "./Parametres.js";
import { ongletSuivi } from "./Suivi.js";

/**
 * **Un onglet est un état d'ADRESSE, pas un état local.**
 *
 * Le défaut constaté : les barres de sections des vues 28 et 31 posaient
 * `<a href="#feries">` puis appelaient `e.preventDefault()` sur un `useState`.
 * L'adresse affichée au survol ne menait nulle part — `/parametres#feries`
 * rendait « Affichage » —, le bouton Précédent ne défaisait pas le changement
 * de section, et revenir dans la vue perdait l'onglet. C'est le pendant exact
 * du réglage qui s'enregistre sans agir, consigné trois fois dans `CLAUDE.md`.
 *
 * La vue 19 avait déjà reçu le remède (`ongletCourant`, `Conges.tsx`) : on
 * reprend sa forme plutôt que d'en inventer une seconde — deux
 * représentations d'un même objet, c'est ce qui rend la vue suivante
 * incomparable.
 */
describe("EX-PRM-01, EX-USR-08 — le fragment porte la section", () => {
  it("un fragment connu désigne sa section", () => {
    expect(ongletParametres("feries")).toBe("feries");
    expect(ongletParametres("vacances")).toBe("vacances");
    expect(ongletSuivi("temps")).toBe("temps");
    expect(ongletSuivi("competences")).toBe("competences");
  });

  it("un fragment inconnu retombe sur la première section, jamais sur du vide", () => {
    // Une adresse recopiée à la main, ou celle d'une section disparue : la vue
    // ne rendait AUCUN panneau, un écran vide que rien ne signale.
    expect(ongletParametres("soldes")).toBe("affichage");
    expect(ongletParametres("")).toBe("affichage");
    expect(ongletSuivi("#temps")).toBe("ensemble");
    expect(ongletSuivi("")).toBe("ensemble");
  });
});

/* Même idiome que `coquille/liens.test.ts` : on lit la source, pas le rendu. */
const brut = import.meta.glob(
  "../{administration,referentiels,rapports,tableau,projets}/**/*.tsx",
  { query: "?raw", import: "default", eager: true },
) as Record<string, string>;

const sansCommentaires = (texte: string): string =>
  texte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const sources = Object.entries(brut)
  .filter(([chemin]) => !/\.test\.tsx?$/.test(chemin))
  .map(([chemin, texte]) => ({ chemin, texte: sansCommentaires(texte) }));

describe("aucune barre de sections ne promet une adresse qu'elle n'honore pas", () => {
  it("le contrôle a quelque chose à mesurer", () => {
    expect(sources.length).toBeGreaterThanOrEqual(18);
    expect(sources.some((f) => f.chemin.endsWith("Parametres.tsx"))).toBe(true);
    expect(sources.some((f) => f.chemin.endsWith("Suivi.tsx"))).toBe(true);
  });

  it("AUCUNE ANCRE DE FRAGMENT N'EST ANNULÉE PAR `preventDefault`", () => {
    /*
     * La fenêtre va du `href` jusqu'au `</a>` qui ferme l'ancre, et non aux
     * seuls attributs : `onClick={(e) => {` porte un `>` qui coupe court toute
     * lecture d'attributs par expression rationnelle. Écrite ainsi d'abord, la
     * mesure rendait ZÉRO sur les deux fichiers fautifs — un contrôle qu'on
     * n'a pas vu échouer ne prouve pas ce qu'on croit.
     *
     * `<use href="#i-depts">` d'un SVG n'est pas visé : ce n'est pas une
     * ancre, et il ne prétend mener nulle part.
     */
    const fautes: string[] = [];
    for (const { chemin, texte } of sources) {
      for (const ancre of texte.matchAll(/<a\b[^<]*?href=(?:"#|\{`#)/g)) {
        const fin = texte.indexOf("</a>", ancre.index);
        const corps = texte.slice(ancre.index, fin === -1 ? ancre.index + 400 : fin);
        if (/preventDefault/.test(corps)) {
          fautes.push(`${chemin} — <a href="#…"> annulée par preventDefault`);
        }
      }
    }
    expect(fautes).toEqual([]);
  });
});
