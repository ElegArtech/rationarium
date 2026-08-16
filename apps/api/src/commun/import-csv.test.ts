import { describe, it, expect } from "vitest";
import { detecterSeparateur, analyserCsv, executerImport, modeleCsv } from "./import-csv.js";

/**
 * Le socle des six imports. Une règle, un test qui la cite.
 */

const COLONNES = ["email", "login", "prenom", "nom"];
const valider = (l: Record<string, string>) => {
  if (!l.email?.includes("@")) throw new Error("adresse email invalide");
  return { email: l.email.toLowerCase(), login: l.login!, prenom: l.prenom!, nom: l.nom! };
};

describe("RG-IMP-01 — virgule et point-virgule acceptés", () => {
  it("détecte le point-virgule, que produit un tableur français", () => {
    expect(detecterSeparateur("a;b;c\n1;2;3")).toBe(";");
  });

  it("détecte la virgule", () => {
    expect(detecterSeparateur("a,b,c\n1,2,3")).toBe(",");
  });

  it("lit réellement les deux", async () => {
    const virgule = "email,login,prenom,nom\na@x.fr,a,A,AA";
    const pointVirgule = "email;login;prenom;nom\na@x.fr;a;A;AA";
    for (const contenu of [virgule, pointVirgule]) {
      const a = await analyserCsv(contenu, {
        colonnesAttendues: COLONNES, colonnesObligatoires: COLONNES, valider,
      });
      expect(a.resume.valides).toBe(1);
    }
  });
});

describe("RG-IMP-04 — trois catégories, jamais deux", () => {
  it("distingue importés, ignorés (doublons) et en erreur", async () => {
    const contenu = [
      "email;login;prenom;nom",
      "a@x.fr;a;A;AA",       // valide
      "a@x.fr;a2;A;AA",      // doublon dans le fichier
      "pas-une-adresse;c;C;CC", // erreur
    ].join("\n");

    const a = await analyserCsv(contenu, {
      colonnesAttendues: COLONNES,
      colonnesObligatoires: COLONNES,
      valider,
      cleDoublon: (v) => v.email,
    });

    expect(a.resume).toEqual({ total: 3, valides: 1, doublons: 1, erreurs: 1 });
  });

  it("« ignoré » et « en erreur » ne se confondent pas — le premier est normal", async () => {
    const contenu = "email;login;prenom;nom\na@x.fr;a;A;AA";
    const a = await analyserCsv(contenu, {
      colonnesAttendues: COLONNES,
      colonnesObligatoires: COLONNES,
      valider,
      existeDeja: async () => true,
    });
    expect(a.resume.doublons).toBe(1);
    expect(a.resume.erreurs).toBe(0);
  });

  it("le détail des erreurs porte le numéro de ligne du fichier", async () => {
    const contenu = "email;login;prenom;nom\nok@x.fr;a;A;AA\nnon;b;B;BB";
    const a = await analyserCsv(contenu, {
      colonnesAttendues: COLONNES, colonnesObligatoires: COLONNES, valider,
    });
    const enErreur = a.lignes.find((l) => l.statut === "erreur");
    // Ligne 1 = en-têtes, donc la troisième ligne du fichier est le numéro 3.
    expect(enErreur?.numero).toBe(3);
    expect(enErreur?.motif).toBe("adresse email invalide");
  });
});

describe("RG-IMP-03 — la prévisualisation précède l'exécution", () => {
  it("analyser n'écrit rien", async () => {
    let ecrit = false;
    const a = await analyserCsv("email;login;prenom;nom\na@x.fr;a;A;AA", {
      colonnesAttendues: COLONNES, colonnesObligatoires: COLONNES, valider,
    });
    expect(ecrit).toBe(false);
    await executerImport(a, async () => { ecrit = true; });
    expect(ecrit).toBe(true);
  });

  it("les colonnes manquantes sont signalées AVANT toute écriture", async () => {
    const a = await analyserCsv("email;login\na@x.fr;a", {
      colonnesAttendues: COLONNES, colonnesObligatoires: COLONNES, valider,
    });
    expect(a.colonnesManquantes).toEqual(["prenom", "nom"]);
    expect(a.resume.valides).toBe(0);
  });
});

describe("RG-IMP-06 — le mode tout-ou-rien n'écrit rien en cas d'erreur", () => {
  it("une seule ligne fautive annule l'ensemble", async () => {
    const contenu = "email;login;prenom;nom\nok@x.fr;a;A;AA\nnon;b;B;BB";
    const a = await analyserCsv(contenu, {
      colonnesAttendues: COLONNES, colonnesObligatoires: COLONNES, valider,
    });

    let ecrites = 0;
    const cr = await executerImport(a, async (v) => { ecrites = v.length; }, { toutOuRien: true });

    expect(ecrites).toBe(0);
    expect(cr.importes).toBe(0);
    expect(cr.erreurs).toBe(1);
  });

  it("sans ce mode, les lignes valides passent", async () => {
    const contenu = "email;login;prenom;nom\nok@x.fr;a;A;AA\nnon;b;B;BB";
    const a = await analyserCsv(contenu, {
      colonnesAttendues: COLONNES, colonnesObligatoires: COLONNES, valider,
    });
    const cr = await executerImport(a, async () => {});
    expect(cr.importes).toBe(1);
    expect(cr.erreurs).toBe(1);
  });
});

describe("RG-IMP-02 — un modèle téléchargeable par type d'import", () => {
  it("porte les colonnes attendues et une ligne d'exemple", () => {
    const modele = modeleCsv(COLONNES, [
      { email: "camille.durand@collectivite.fr", login: "cdurand", prenom: "Camille", nom: "Durand" },
    ]);
    expect(modele.split("\n")[0]).toBe("email;login;prenom;nom");
    expect(modele).toContain("cdurand");
  });
});

describe("robustesse des fichiers réels", () => {
  it("tolère le BOM que produit Excel", async () => {
    const a = await analyserCsv("﻿email;login;prenom;nom\na@x.fr;a;A;AA", {
      colonnesAttendues: COLONNES, colonnesObligatoires: COLONNES, valider,
    });
    expect(a.resume.valides).toBe(1);
  });

  it("tolère les fins de ligne Windows et les espaces parasites", async () => {
    const a = await analyserCsv("email;login;prenom;nom\r\n a@x.fr ; a ; A ; AA \r\n", {
      colonnesAttendues: COLONNES, colonnesObligatoires: COLONNES, valider,
    });
    expect(a.resume.valides).toBe(1);
    expect(a.lignes[0]?.valeur?.email).toBe("a@x.fr");
  });
});
