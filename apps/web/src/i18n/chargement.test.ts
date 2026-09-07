import { describe, it, expect, beforeAll } from "vitest";
import i18next, { type TFunction } from "i18next";
import ICU from "i18next-icu";
import communFr from "../locales/fr/commun.json" with { type: "json" };
import communEn from "../locales/en/commun.json" with { type: "json" };

/**
 * `RG-GEN-08` — **« Chargement de les comptes… »**
 *
 * Le motif français était « Chargement de {quoi} », et les quarante appelants
 * passent un groupe nominal **déjà articulé** : « les comptes », « le
 * journal », « votre session », « l'arborescence ». La contraction
 * `de + les → des` n'existe pas dans une interpolation, et l'écran affichait
 * « Chargement de les comptes… » sur les trois quarts des vues. L'anglais,
 * lui, était juste : le défaut n'existait que d'un côté, ce qui explique qu'un
 * contrôle de parité FR/EN ne pouvait pas le voir.
 *
 * **La correction ne dépend d'aucun appelant** — c'est la seule qui tienne :
 * les quarante sites d'appel vivent dans les vues, et faire porter la
 * grammaire à chacun d'eux, c'est attendre que le quarante-et-unième se
 * trompe. Le motif porte donc un deux-points, qui n'a rien à contracter.
 *
 * Le contrôle exerce le motif sur les formes d'articles réellement employées,
 * plutôt que sur une chaîne inventée pour lui.
 */

/** Les articles que les appelants passent — relevés dans les catalogues des vues. */
const GROUPES_NOMINAUX = [
  "les comptes",
  "les rôles",
  "le journal",
  "le catalogue",
  "la matrice",
  "l'équipe",
  "l'arborescence",
  "votre session",
];

const instance = i18next.createInstance();
let t: TFunction;
let tEn: TFunction;

beforeAll(async () => {
  await instance.use(ICU).init({
    lng: "fr",
    fallbackLng: "fr",
    ns: ["commun"],
    defaultNS: "commun",
    resources: { fr: { commun: communFr }, en: { commun: communEn } },
    interpolation: { escapeValue: false },
  });
  t = instance.getFixedT("fr", "commun");
  tEn = instance.getFixedT("en", "commun");
});

describe("l'état de chargement se lit en français", () => {
  it.each(GROUPES_NOMINAUX)("« %s » ne produit aucune contraction manquée", (quoi) => {
    const rendu = t("etats.chargement", { quoi });
    // « de les », « de le », « de la », « de l'» : quatre façons d'écrire
    // ce qu'aucun francophone n'écrit.
    expect(rendu).not.toMatch(/\bde (les|le|la|l['’])/i);
    expect(rendu).toContain(quoi);
  });

  it("le motif ne se termine par aucune préposition qui se contracte", () => {
    // Le contrôle porte sur le MOTIF, pas sur un rendu : c'est lui qui décide,
    // et c'est lui qu'une prochaine reformulation risque de casser.
    const motif = communFr.etats.chargement;
    expect(motif).toContain("{quoi}");
    expect(motif.slice(0, motif.indexOf("{quoi}"))).not.toMatch(/\b(de|du|des|à|au|aux)\s*$/i);
  });

  it("l'anglais reste inchangé — le défaut n'existait que d'un côté", () => {
    expect(tEn("etats.chargement", { quoi: "the accounts" })).toBe("Loading the accounts…");
  });
});
