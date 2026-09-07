import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import i18next, { type TFunction } from "i18next";
import ICU from "i18next-icu";
import { ErreurApi, appeler } from "./client.js";
import { messageErreur } from "./erreurs.js";
import erreursFr from "../locales/fr/erreurs.json" with { type: "json" };
import erreursEn from "../locales/en/erreurs.json" with { type: "json" };

/**
 * `RG-CNG-21`, `RG-TMP-02`, `RG-GEN-03` — **un refus chiffré porte ses
 * chiffres jusqu'à l'écran.**
 *
 * Le serveur calculait le détail — jours demandés, disponibles, manquants pour
 * un solde de congé ; déjà-déclaré, demandé, total, plafond pour le temps — et
 * `commun/http.ts` le transportait dans la réponse. Le client le **jetait** :
 * `ErreurApi` ne le gardait pas, `messageErreur` ne lisait que la clé, et
 * l'agent lisait « Votre solde ne couvre pas cette demande. » — une phrase sans
 * un seul nombre, là où la règle veut qu'il sache de combien il dépasse.
 *
 * Le contrôle monte le **vrai** catalogue et le **vrai** moteur ICU : une
 * variante mal formée, un pluriel faux ou un nombre formaté comme une année
 * (« l'année 2 027 ») échouent ici, pas au navigateur.
 */

const instance = i18next.createInstance();

/** `t` lié à l'espace de noms des erreurs, comme les vues le lient. */
let t: TFunction;
let tEn: TFunction;

beforeAll(async () => {
  await instance.use(ICU).init({
    lng: "fr",
    fallbackLng: "fr",
    ns: ["erreurs"],
    defaultNS: "erreurs",
    resources: { fr: { erreurs: erreursFr }, en: { erreurs: erreursEn } },
    interpolation: { escapeValue: false },
  });
  t = instance.getFixedT("fr", "erreurs");
  tEn = instance.getFixedT("en", "erreurs");
});

const refus = (cle: string, detail?: Record<string, unknown>) =>
  new ErreurApi(422, cle, "message de repli du serveur", undefined, detail);

/** Les nombres du message, l'année mise à part — la mesure du parcours P-26. */
const chiffres = (message: string) =>
  (message.match(/\d+([.,]\d+)?/g) ?? []).filter((c) => !/^20\d\d$/.test(c));

describe("RG-CNG-21 — le refus de solde est chiffré", () => {
  const detail = { annee: 2027, demandes: 11, disponibles: 4, manquants: 7 };

  it("nomme l'année et porte les trois nombres, en français", () => {
    const message = messageErreur(refus("erreurs:soldeInsuffisant", detail), t, "repli");
    expect(message).toContain("2027");
    expect(chiffres(message).length).toBeGreaterThanOrEqual(3);
  });

  it("nomme l'année et porte les trois nombres, en anglais", () => {
    const message = messageErreur(refus("erreurs:soldeInsuffisant", detail), tEn, "repli");
    expect(message).toContain("2027");
    expect(chiffres(message).length).toBeGreaterThanOrEqual(3);
  });

  it("l'année n'est jamais formatée comme un nombre — « 2 027 » serait une date fausse", () => {
    for (const tr of [t, tEn]) {
      expect(messageErreur(refus("erreurs:soldeInsuffisant", detail), tr, "repli")).not.toMatch(
        /2\s.027|2,027/,
      );
    }
  });

  it("les demi-journées survivent au formatage local", () => {
    const demi = { annee: 2027, demandes: 2.5, disponibles: 1, manquants: 1.5 };
    expect(messageErreur(refus("erreurs:soldeInsuffisant", demi), t, "repli")).toContain("2,5");
    expect(messageErreur(refus("erreurs:soldeInsuffisant", demi), tEn, "repli")).toContain("2.5");
  });

  it("le pluriel de zéro diffère entre les deux langues", () => {
    const rien = { annee: 2027, demandes: 3, disponibles: 0, manquants: 3 };
    expect(messageErreur(refus("erreurs:soldeInsuffisant", rien), t, "repli")).toContain(
      "0 disponible",
    );
    expect(messageErreur(refus("erreurs:soldeInsuffisant", rien), tEn, "repli")).toContain(
      "0 available",
    );
  });
});

describe("RG-TMP-02 — le refus de plafond nomme le total constaté et le plafond", () => {
  const detail = { dejaDeclare: 3.5, demande: 10, total: 13.5, plafond: 12 };

  it("porte le déjà-déclaré et le plafond, en français", () => {
    const message = messageErreur(refus("erreurs:plafondJournalier", detail), t, "repli");
    expect(message).toMatch(/3,5/);
    expect(message).toMatch(/\b12\b/);
  });

  it("porte le déjà-déclaré et le plafond, en anglais", () => {
    const message = messageErreur(refus("erreurs:plafondJournalier", detail), tEn, "repli");
    expect(message).toMatch(/3\.5/);
    expect(message).toMatch(/\b12\b/);
  });
});

describe("le message nu reste la sortie par défaut", () => {
  it("sans détail, la variante chiffrée n'est pas cherchée", () => {
    expect(messageErreur(refus("erreurs:soldeInsuffisant"), t, "repli")).toBe(
      "Votre solde ne couvre pas cette demande.",
    );
  });

  it("un détail sur une clé sans variante retombe sur le message de la clé", () => {
    const message = messageErreur(
      refus("erreurs:conflitDeVersion", { attendue: 3, recue: 2 }),
      t,
      "repli",
    );
    expect(message).toBe(erreursFr.conflitDeVersion);
  });

  it("une clé inconnue du catalogue retombe sur le message du serveur", () => {
    expect(messageErreur(refus("erreurs:cleQuiNExistePas", { n: 1 }), t, "repli")).toBe(
      "message de repli du serveur",
    );
  });

  it("un détail imbriqué ne fabrique jamais « [object Object] »", () => {
    const message = messageErreur(
      refus("erreurs:chevauchement", { conflit: { dateDebut: "2026-01-01" } }),
      t,
      "repli",
    );
    expect(message).not.toContain("[object Object]");
  });
});

/**
 * Le raccord entre les deux moitiés : ce que `commun/http.ts` ÉMET et ce que
 * `client.ts` en garde. Chaque moitié était juste — le serveur calculait, la
 * vue affichait ce qu'on lui donnait — et le détail se perdait entre les deux.
 * La charge ci-dessous est copiée de la réponse du serveur, pas de l'idée que
 * le client s'en fait.
 */
describe("le détail traverse la couche de transport", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("`appeler` garde le `detail` de la réponse", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            cle: "erreurs:soldeInsuffisant",
            message: "Votre solde ne couvre pas cette demande.",
            detail: { annee: 2027, demandes: 11, disponibles: 4, manquants: 7 },
          }),
          { status: 422, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    const echec = await appeler("/conges", { methode: "POST", corps: {} }).catch((e: unknown) => e);
    expect(echec).toBeInstanceOf(ErreurApi);
    expect((echec as ErreurApi).detail).toEqual({
      annee: 2027,
      demandes: 11,
      disponibles: 4,
      manquants: 7,
    });
  });
});
