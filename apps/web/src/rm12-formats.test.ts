import { afterEach, describe, expect, it } from "vitest";
import i18next from "i18next";
import { ICUGlobal } from "./i18n/icu-global.js";
import { appliquerReglages, formaterDate, formaterMois, formaterNombre } from "./formats.js";
const avant = i18next.language;
afterEach(() => { i18next.language = avant; appliquerReglages({}); });
describe("RM-12 D-RM06 — mots UI, nombres globaux et pluriels UI", () => {
  it("les mots anglais restent anglais avec les nombres et dates numériques globaux français", () => {
    i18next.language = "en";
    appliquerReglages({ "display.locale": "fr-FR", "display.dateFormat": "JJ/MM/AAAA" });
    expect(formaterMois("2026-09-01")).toBe("September 2026");
    expect(formaterNombre(1234.5, 1)).toBe(new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1 }).format(1234.5));
    expect(formaterDate("2026-09-07")).toBe("07/09/2026");
  });
  it("l'ordre numérique explicite reste JJ/MM avec la région en-US", () => {
    i18next.language = "en";
    appliquerReglages({ "display.locale": "en-US", "display.dateFormat": "JJ/MM/AAAA" });
    expect(formaterDate("2026-09-07")).toBe("07/09/2026");
  });
  for (const lng of ["fr", "en"]) it(`ICU ${lng} préserve zéro singulier/pluriel et utilise les nombres globaux`, async () => {
    appliquerReglages({ "display.locale": lng === "fr" ? "en-US" : "fr-FR" });
    const instance = i18next.createInstance();
    await instance.use(ICUGlobal).init({ lng, resources: { [lng]: { translation: { test: "{n, number} / {n, plural, one {singulier} other {pluriel}}" } } } });
    expect(instance.t("test", { n: 0 })).toBe(`0 / ${lng === "fr" ? "singulier" : "pluriel"}`);
    expect(instance.t("test", { n: 1234.5 })).toBe(`${new Intl.NumberFormat(lng === "fr" ? "en-US" : "fr-FR").format(1234.5)} / pluriel`);
  });
});
