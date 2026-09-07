import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { MOTIFS, NOMS_MOTIFS, type Motif } from "./motifs.js";

/**
 * `RG-GEN-08` — **aucune chaîne visible en dur, celles du compte rendu
 * d'import comprises.**
 *
 * Le défaut que ces contrôles tiennent : les messages ligne à ligne du compte
 * rendu partaient en français figé. En session anglaise, la fenêtre d'import
 * affichait « Row 6 — aucun compte ne porte l'adresse « … » » et « Row 7 — le
 * type de congé « Formation professionnelle » est désactivé… » — le numéro de
 * ligne traduit, le message non (parcours P-97 en, P-98 en).
 *
 * La règle n'était pas contournée par négligence : rien ne la contrôlait de ce
 * côté-ci. `pnpm i18n:check` lit `apps/web`, et le serveur a le droit d'écrire
 * du français — pour ses journaux. Ce qui manquait, c'est la distinction entre
 * une phrase qui va au journal et une phrase qui va à l'écran. Elle est
 * désormais dans le type : un `Motif` porte une **clé**, ses **paramètres**, et
 * une phrase française qui n'est qu'un repli.
 */

/** Un exemplaire de chaque motif, appelé avec des valeurs plausibles. */
const EXEMPLES: Record<string, Motif> = {
  colonneVide: MOTIFS.colonneVide("login"),
  nombreHorsBornes: MOTIFS.nombreHorsBornes("progress", "500", 0, 100),
  avancementIncoherent: MOTIFS.avancementIncoherent(100),
  valeurInconnue: MOTIFS.valeurInconnue("status", "En cours", "todo, doing, done"),
  emailDejaPris: MOTIFS.emailDejaPris("l.vasseur@valmorin.fr"),
  loginDejaPris: MOTIFS.loginDejaPris("l.vasseur"),
  categorieInconnue: MOTIFS.categorieInconnue("Bricolage", "technical, business"),
  effectifInvalide: MOTIFS.effectifInvalide("deux"),
  competenceDejaPresente: MOTIFS.competenceDejaPresente("PostgreSQL"),
  jalonDejaPresent: MOTIFS.jalonDejaPresent("Lancement"),
  compteInconnu: MOTIFS.compteInconnu("x@valmorin.fr"),
  compteDesactive: MOTIFS.compteDesactive("x@valmorin.fr"),
  horsPerimetre: MOTIFS.horsPerimetre("x@valmorin.fr"),
  typeInconnu: MOTIFS.typeInconnu("Congés exceptionnels"),
  dateIllisible: MOTIFS.dateIllisible("hier", "demain"),
  datesInversees: MOTIFS.datesInversees("2026-10-09", "2026-10-05"),
  demiJourneeInconnue: MOTIFS.demiJourneeInconnue("midi", "morning, afternoon"),
  demiJourneeSurPlusieursJours: MOTIFS.demiJourneeSurPlusieursJours(),
  soldeInsuffisant: MOTIFS.soldeInsuffisant("2026", "14", "5", "9"),
  typeDesactive: MOTIFS.typeDesactive("Formation professionnelle"),
  chevauchement: MOTIFS.chevauchement(),
  erreurTechnique: MOTIFS.erreurTechnique("PrismaClientKnownRequestError: P2002"),
};

describe("RG-GEN-08 — un motif de compte rendu porte une CLÉ, pas une phrase", () => {
  it("le jeu d'exemples couvre TOUS les motifs — sinon le test ne mesure qu'une part", () => {
    // Sans cette garde, ajouter un motif sans l'exemplifier laisserait tous
    // les contrôles suivants passer sur un motif jamais regardé.
    expect(Object.keys(EXEMPLES).sort()).toEqual([...NOMS_MOTIFS].sort());
    expect(NOMS_MOTIFS.length).toBeGreaterThan(20);
  });

  it("chaque motif porte une clé du catalogue `imports`, préfixée de son espace de noms", () => {
    for (const [nom, motif] of Object.entries(EXEMPLES)) {
      // Sans le préfixe `imports:`, i18next chercherait dans l'espace par
      // défaut (`commun`) et ne résoudrait jamais.
      expect(motif.cle, nom).toBe(`imports:motifs.${nom}`);
    }
  });

  it("deux motifs ne partagent jamais une clé", () => {
    const cles = Object.values(EXEMPLES).map((m) => m.cle);
    expect(new Set(cles).size).toBe(cles.length);
  });

  it("toute valeur citée dans la phrase française est AUSSI un paramètre", () => {
    /*
     * C'est le contrôle qui compte. Une phrase qui interpole une valeur
     * — un courriel, un nom de type, un chiffre de solde — sans la passer
     * en paramètre serait intraduisible : le client afficherait la clé
     * traduite, amputée de ce qui la rend utile.
     *
     * On repère les valeurs à leurs guillemets français et aux parenthèses,
     * les deux formes que ces messages emploient. Une parenthèse d'un seul
     * caractère est la marque du pluriel français — « jour(s) » —, pas une
     * valeur : le repli garde cette béquille que le catalogue ICU remplacera
     * par une vraie règle de pluriel.
     */
    for (const [nom, motif] of Object.entries(EXEMPLES)) {
      const citees = [...motif.message.matchAll(/« ([^»]+) »|\(([^)]{2,})\)/g)]
        .map((m) => (m[1] ?? m[2] ?? "").trim())
        .filter((v) => v !== "");
      const valeurs = Object.values(motif.params).map(String);
      for (const citee of citees) {
        expect(valeurs, `${nom} cite « ${citee} » sans le passer en paramètre`).toContain(citee);
      }
    }
  });

  it("RG-GEN-03 — chaque repli est une phrase, jamais un code technique", () => {
    for (const [nom, motif] of Object.entries(EXEMPLES)) {
      expect(motif.message.length, nom).toBeGreaterThan(15);
      // Un identifiant à rallonge (`solde_insuffisant`) recopié tel quel dans
      // le message serait exactement ce que `RG-GEN-03` refuse.
      expect(motif.message, nom).not.toContain(nom);
    }
  });

  it("les paramètres sont nommés, jamais positionnels", () => {
    for (const [nom, motif] of Object.entries(EXEMPLES)) {
      for (const cle of Object.keys(motif.params)) {
        expect(cle, nom).toMatch(/^[a-zA-Z]+$/);
      }
    }
  });
});

/**
 * Le contrôle de sens inverse : **le service ne rédige plus rien lui-même.**
 *
 * Il lit la source, comme `messages-metier.test.ts` lit celle des services,
 * et pour la même raison : un motif rédigé sur place ne se distingue pas d'un
 * motif rédigé ici, sinon par l'endroit où il est écrit. Sans ce contrôle, le
 * prochain refus ajouté au service repartirait en français figé, et rien ne le
 * dirait — c'est très exactement ainsi que celui-ci est né.
 */
describe("RG-GEN-08 — le service nomme la situation, il ne la formule pas", () => {
  const source = readFileSync(
    path.join(import.meta.dirname, "imports.service.ts"),
    "utf8",
  );

  /**
   * Le corps des méthodes, sans les commentaires — qui, eux, ont le droit
   * d'écrire du français —, et sans la DÉCLARATION de l'alias `enPanne`, qui
   * relaie un motif sans en construire un.
   */
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/^\s*const enPanne = .*$/gm, "");

  it("aucun refus ni ignoré n'entre au compte rendu autrement que par un motif", () => {
    // Les trois portes du compte rendu, dans les méthodes d'écriture :
    // `rendu.refuser(`, `rendu.ignorer(`, et l'alias local `enPanne(`.
    const poussees = [
      ...code.matchAll(/(?:rendu\.(?:refuser|ignorer)|enPanne)\(([\s\S]*?)\);/g),
    ];
    expect(poussees.length, "le test ne mesure rien s'il ne trouve aucune poussée").toBeGreaterThan(
      15,
    );
    for (const [, arguments_] of poussees) {
      expect(arguments_, "un refus doit passer par MOTIFS").toContain("MOTIFS.");
    }
  });

  it("l'analyse elle-même ne rédige plus : chaque erreur de ligne vient d'un motif", () => {
    // À l'analyse, une erreur porte son numéro de ligne calculé sur place.
    const poussees = [...code.matchAll(/erreurs\.push\(\{\s*\n?\s*ligne: i \+ 2,([\s\S]*?)\}\)/g)];
    expect(poussees.length, "aucune erreur d'analyse trouvée : la regex est cassée").toBeGreaterThan(
      3,
    );
    for (const [, corps] of poussees) {
      expect(corps).toContain("MOTIFS.");
      expect(corps, "un message rédigé sur place n'est pas traduisible").not.toMatch(/message:/);
    }
  });
});
