import { describe, expect, it } from "vitest";
import i18next from "i18next";
import { MODELES_ROLES } from "@rationarium/contracts";
import { ICUGlobal } from "../../i18n/icu-global.js";
import coquilleFr from "../../locales/fr/coquille.json";
import coquilleEn from "../../locales/en/coquille.json";
import administrationFr from "../../locales/fr/administration.json";
import administrationEn from "../../locales/en/administration.json";
import erreursFr from "../../locales/fr/erreurs.json";
import erreursEn from "../../locales/en/erreurs.json";
import { cleFamille } from "./Roles.js";
import { refusGestion } from "./Utilisateurs.js";

/**
 * SEC-05 — l'interface des modèles de rôles, des comptes plus privilégiés et
 * des fichiers trop volumineux.
 */

/** Les personas du cadrage : des prénoms de travail, pas des textes de produit. */
const PERSONAS = ["Karim", "Inès", "Fatou", "Driss", "Camille", "Hugo"];

const descriptions = {
  fr: coquilleFr.rolesSysteme.descriptions as Record<string, string>,
  en: coquilleEn.rolesSysteme.descriptions as Record<string, string>,
};

describe("D20 — descriptions des modèles de rôles", () => {
  it("RG-GEN-08 — chacun des 26 modèles a sa description dans les deux langues", () => {
    expect(MODELES_ROLES).toHaveLength(26);
    for (const m of MODELES_ROLES) {
      expect(descriptions.fr[m.code], `${m.code} sans description française`).toBeTruthy();
      expect(descriptions.en[m.code], `${m.code} sans description anglaise`).toBeTruthy();
    }
    // Aucune description orpheline : une clé sans modèle ne s'afficherait jamais.
    expect(Object.keys(descriptions.en).sort()).toEqual(MODELES_ROLES.map((m) => m.code).sort());
  });

  it("le catalogue français EST la description du contrat : une seule rédaction", () => {
    // Le contrat est copié en base à la création d'un rôle depuis un modèle ;
    // si le catalogue en divergeait, la même description aurait deux textes.
    for (const m of MODELES_ROLES) expect(descriptions.fr[m.code]).toBe(m.description);
  });

  it("aucune description ne porte de prénom de persona ni de marque markdown, en français comme en anglais", () => {
    const textes = [
      ...MODELES_ROLES.map((m) => [`contrat ${m.code}`, m.description] as const),
      ...Object.entries(descriptions.fr).map(([c, d]) => [`fr ${c}`, d] as const),
      ...Object.entries(descriptions.en).map(([c, d]) => [`en ${c}`, d] as const),
    ];
    for (const [ou, texte] of textes) {
      for (const prenom of PERSONAS) {
        expect(new RegExp(`\\b${prenom}\\b`).test(texte), `${ou} nomme ${prenom}`).toBe(false);
      }
      expect(texte, `${ou} porte du markdown`).not.toMatch(/\*\*|__|`/);
    }
  });

  it("la vue Rôles en anglais ne rend aucune description française", async () => {
    const instance = i18next.createInstance();
    await instance.init({
      lng: "en",
      resources: { fr: { coquille: coquilleFr }, en: { coquille: coquilleEn } },
    });
    for (const m of MODELES_ROLES) {
      // Même résolution que `FenetreCreation` : par code, le contrat en repli.
      const rendu = instance.t(`coquille:rolesSysteme.descriptions.${m.code}`, {
        defaultValue: m.description,
      });
      expect(rendu, m.code).not.toBe(m.description);
      expect(rendu, m.code).toBe(descriptions.en[m.code]);
    }
  });

  it("chaque famille de modèles a son libellé dans les deux langues", () => {
    const familles = new Set(MODELES_ROLES.map((m) => m.famille));
    expect(cleFamille("Conduite de projet")).toBe("conduiteDeProjet");
    for (const f of familles) {
      const cle = cleFamille(f);
      expect((administrationFr.roles.familles as Record<string, string>)[cle], `fr ${f}`).toBeTruthy();
      expect((administrationEn.roles.familles as Record<string, string>)[cle], `en ${f}`).toBeTruthy();
    }
  });
});

describe("RG-USR-09, RG-GEN-06 — les gestes de gestion d'un compte plus privilégié", () => {
  it("RG-USR-09 — une ligne actionsRestreintes refuse modifier, réinitialiser, désactiver et supprimer", () => {
    expect(refusGestion({ id: "admin", actionsRestreintes: true }, "moi")).toEqual({
      modifier: "plusPrivilegie",
      reinitialiser: "plusPrivilegie",
      desactiver: "plusPrivilegie",
      supprimer: "plusPrivilegie",
    });
  });

  it("RG-GEN-06 — sans le champ, ou à faux, rien n'est refusé sur autrui", () => {
    const libre = { modifier: null, reinitialiser: null, desactiver: null, supprimer: null };
    expect(refusGestion({ id: "autre" }, "moi")).toEqual(libre);
    expect(refusGestion({ id: "autre", actionsRestreintes: false }, "moi")).toEqual(libre);
  });

  it("RG-USR-04 — sur soi-même, modifier reste permis et le motif de soi-même prime", () => {
    expect(refusGestion({ id: "moi", actionsRestreintes: true }, "moi")).toEqual({
      modifier: "plusPrivilegie",
      reinitialiser: "soiMeme",
      desactiver: "soiMeme",
      supprimer: "soiMeme",
    });
    expect(refusGestion({ id: "moi" }, "moi").modifier).toBeNull();
  });

  it("RG-GEN-08 — le motif est rédigé dans les deux langues, à la ligne comme dans l'erreur serveur", () => {
    expect(administrationFr.utilisateurs.comptePlusPrivilegie).toBeTruthy();
    expect(administrationEn.utilisateurs.comptePlusPrivilegie).toBeTruthy();
    expect(erreursFr.comptePlusPrivilegie).toBeTruthy();
    expect(erreursEn.comptePlusPrivilegie).toBeTruthy();
  });
});

describe("RG-DOC-04 — un fichier trop volumineux nomme la limite", () => {
  const Mio = 1024 * 1024;
  for (const [langue, catalogue, unite] of [
    ["fr", erreursFr, "Mio"],
    ["en", erreursEn, "MiB"],
  ] as const) {
    it(`D22 — en ${langue}, 20, 2 et 15 Mio s'affichent en Mio, pas en octets`, async () => {
      const instance = i18next.createInstance();
      await instance.use(ICUGlobal).init({ lng: langue, resources: { [langue]: { erreurs: catalogue } } });
      const message = (maxOctets: number) =>
        instance.t("erreurs:fichierTropVolumineux_detail", { maxOctets });
      expect(message(20 * Mio)).toMatch(new RegExp(`\\b20 ${unite}\\b`));
      expect(message(2 * Mio)).toMatch(new RegExp(`\\b2 ${unite}\\b`));
      expect(message(15 * Mio)).toMatch(new RegExp(`\\b15 ${unite}\\b`));
      expect(message(20 * Mio)).not.toMatch(/20\D?971/);
    });
  }
});
