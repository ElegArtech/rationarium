import { describe, it, expect } from "vitest";
import { adresseExport, type FiltresRapport } from "./rapports.js";

/**
 * **Une forme de réponse inventée côté client se fait valider par son propre
 * jeu d'essai.** Le piège est consigné : le typage ne voit rien, puisqu'il
 * décrit l'invention, et un jeu d'essai calqué sur ce que le client croit
 * recevoir passe au vert sur une fiction.
 *
 * Ici, c'est le sens inverse — le contrat client décrivait **moins** que ce que
 * le serveur promet. `tendance` rend `relevesHorsFenetre` et `minimumRequis`
 * depuis que `RG-RPT-03` a cessé d'annoncer un faux motif de tendance vide ;
 * `api/rapports.ts` ne les déclarait pas, et la vue 30 élargissait le type dans
 * son coin, avec des valeurs de repli recopiées à la main — dont un seuil qui
 * n'était même pas celui du serveur. Deux moitiés justes, un raccord faux.
 *
 * Le contrôle lit les deux SOURCES et les confronte, dans les deux sens. C'est
 * la seule chose qui refuse la prochaine occurrence plutôt que celle-ci.
 */
// @ts-expect-error — `@types/node` n'est pas dans le champ `types` du paquet web.
const fs = (await import("node:fs")) as { readFileSync: (p: URL, e: string) => string };

const lire = (chemin: string): string =>
  fs
    .readFileSync(new URL(chemin, import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

/**
 * Les clés de premier niveau d'un bloc `{ … }`, ouvrant compris.
 *
 * Un découpage naïf sur la virgule compterait `points.reduce((n, p) => …, 0)`
 * pour deux clés. On suit donc la profondeur, et on ne coupe qu'à zéro.
 */
const clesDeNiveau1 = (texte: string, debut: number): string[] => {
  const cles: string[] = [];
  let profondeur = 0;
  let morceau = "";
  for (let i = debut; i < texte.length; i++) {
    const c = texte[i]!;
    if ("{[(".includes(c)) profondeur++;
    if ("}])".includes(c)) {
      profondeur--;
      if (profondeur === 0) break;
    }
    if (profondeur === 1 && (c === "," || c === ";")) {
      const nom = /^\s*(\w+)\s*[:,]?/.exec(morceau + ",");
      if (nom) cles.push(nom[1]!);
      morceau = "";
    } else if (profondeur >= 1) {
      morceau += c;
    }
  }
  const dernier = /^\s*(\w+)\s*:/.exec(morceau);
  if (dernier) cles.push(dernier[1]!);
  return cles;
};

/** Ce que le serveur rend pour la tendance — le `return` de `tendance()`. */
const clesServeur = (): string[] => {
  const source = lire("../../../api/src/rapports/rapports.service.ts");
  const methode = source.indexOf("private async tendance(");
  expect(methode).toBeGreaterThan(0);
  const retour = source.indexOf("return {", methode);
  expect(retour).toBeGreaterThan(methode);
  return clesDeNiveau1(source, source.indexOf("{", retour));
};

/** Ce que le client déclare — le membre `tendance` de `VueEnsemble`. */
const clesClient = (): string[] => {
  const source = lire("./rapports.ts");
  const membre = source.indexOf("\n  tendance: {");
  expect(membre).toBeGreaterThan(0);
  return clesDeNiveau1(source, source.indexOf("{", membre));
};

describe("le contrat de `/rapports` décrit ce que le serveur rend", () => {
  it("le contrôle a quelque chose à mesurer", () => {
    // Un contrôle qui ne mesure rien passe au vert. On affirme la matière.
    expect(clesServeur()).toContain("historiqueSuffisant");
    expect(clesClient()).toContain("historiqueSuffisant");
  });

  it("aucun champ rendu par le serveur ne manque au contrat client", () => {
    const client = clesClient();
    expect(clesServeur().filter((c) => !client.includes(c))).toEqual([]);
  });

  it("aucun champ du contrat client n'est absent de la réponse du serveur", () => {
    // Le sens qui a coûté la fenêtre de tâche : un champ que personne ne rend
    // se lit `undefined`, en silence, et la vue affiche zéro.
    const serveur = clesServeur();
    expect(clesClient().filter((c) => !serveur.includes(c))).toEqual([]);
  });
});

describe("RG-GEN-08 — l'export part avec la langue du lecteur", () => {
  const filtres: FiltresRapport = { periode: "mois" };

  it("la langue voyage dans les filtres, pas dans une concaténation d'appelant", () => {
    // Elle était jointe à l'adresse au point d'appel, donc dépendante de la
    // vigilance de chacun : le prochain export en aurait fait l'économie sans
    // que rien ne le dise.
    expect(adresseExport({ ...filtres, langue: "en" }, "csv")).toContain("&langue=en");
  });

  it("sans langue demandée, l'adresse n'invente pas de paramètre vide", () => {
    expect(adresseExport(filtres, "csv")).not.toContain("langue");
  });

  it("les filtres posés partent avec l'export — RG-RPT-02", () => {
    const adresse = adresseExport({ periode: "annee", projets: ["p1", "p2"], langue: "fr" }, "json");
    expect(adresse).toContain("periode=annee");
    expect(adresse).toContain("projets=p1%2Cp2");
    expect(adresse).toContain("format=json");
    expect(adresse).toContain("langue=fr");
  });
});
