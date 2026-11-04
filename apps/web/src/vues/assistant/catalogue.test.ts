import { describe, it, expect } from "vitest";
import { IntlMessageFormat } from "intl-messageformat";
import fr from "../../locales/fr/assistant.json";
import en from "../../locales/en/assistant.json";

/**
 * `RG-GEN-08` — **chaque phrase du module se compose, dans les deux langues.**
 *
 * `intl-messageformat` LÈVE sur une phrase mal formée ou un placeholder
 * absent : l'écran tomberait à l'endroit précis où il doit expliquer un refus.
 * Le contrôle compile chaque phrase avec le vrai moteur ICU et des valeurs de
 * la bonne nature — un nombre pour un pluriel, une chaîne pour le reste.
 */
const NUMERIQUES = new Set(["n", "effectuees", "refusees", "defaites", "restees", "signaux", "h", "m", "jours", "max"]);

const aplatir = (o: Record<string, unknown>, prefixe = ""): [string, string][] =>
  Object.entries(o).flatMap(([k, v]) =>
    typeof v === "string" ? [[`${prefixe}${k}`, v] as [string, string]] : aplatir(v as Record<string, unknown>, `${prefixe}${k}.`),
  );

const valeurs = (phrase: string): Record<string, string | number> =>
  Object.fromEntries(
    [...phrase.matchAll(/\{\s*([A-Za-z0-9_]+)\s*[,}]/g)].map(([, nom]) => [nom, NUMERIQUES.has(nom ?? "") ? 2 : "x"]),
  );

describe("RG-GEN-08 — le catalogue du module se compose", () => {
  const phrasesFr = aplatir(fr);
  const phrasesEn = aplatir(en);

  it("le contrôle a quelque chose à mesurer", () => {
    expect(phrasesFr.length).toBeGreaterThan(200);
    expect(phrasesEn.length).toBe(phrasesFr.length);
  });

  for (const [langue, phrases] of [["fr", phrasesFr], ["en", phrasesEn]] as const) {
    it(`${langue} — aucune phrase ne lève, aucune ne laisse d'accolade à l'écran`, () => {
      const fautes: string[] = [];
      for (const [cle, phrase] of phrases) {
        try {
          const rendu = String(new IntlMessageFormat(phrase, langue).format(valeurs(phrase)));
          if (rendu.includes("{") || rendu.includes("}")) fautes.push(`${cle} — accolade rendue`);
        } catch (e) {
          fautes.push(`${cle} — ${String(e)}`);
        }
      }
      expect(fautes).toEqual([]);
    });
  }

  it("les vingt et une clés d'erreur du serveur ont leur phrase", () => {
    // `apps/api/src/assistant/` — `refusAssistant(…, "<clé>", …)`, préfixées
    // `assistant:erreurs.` par le serveur. Une clé absente retomberait sur la
    // phrase française du serveur, en session anglaise comprise.
    const cles = [
      "jetonInvalide", "jetonIntrouvable", "projetIntrouvable", "conflitVersion", "passageActif",
      "passageDejaPris", "passageClos", "passageIntrouvable", "actionIntrouvable", "actionNonDefaisable",
      "modifieeDepuis", "defaireRefuse", "plafondActions", "actionInvalide", "typeNonAutorise",
      "referenceEnDouble", "referenceInconnue", "actionDefaite", "jalonObligatoire", "debutNonAtteste",
      "cibleIntrouvable",
    ];
    expect(cles).toHaveLength(21);
    for (const cle of cles) {
      expect(fr.erreurs[cle as keyof typeof fr.erreurs], `fr ${cle}`).toBeTruthy();
      expect(en.erreurs[cle as keyof typeof en.erreurs], `en ${cle}`).toBeTruthy();
    }
  });

  it("le pluriel de ZÉRO diffère entre les deux langues", () => {
    const zero = (phrase: string, langue: string) => String(new IntlMessageFormat(phrase, langue).format({ n: 0 }));
    expect(zero(fr.activite.nombreActions, "fr")).toBe("0 action");
    expect(zero(en.activite.nombreActions, "en")).toBe("0 actions");
  });
});
