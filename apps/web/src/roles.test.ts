import { afterEach, expect, it } from "vitest";
import i18next from "i18next";
import fr from "./locales/fr/coquille.json";
import en from "./locales/en/coquille.json";
import { nomRole } from "./roles.js";
afterEach(async () => { await i18next.changeLanguage("fr"); });
it("RM-12 D-RM06 — traduit les rôles système et préserve le nom libre même avec un code connu", async () => {
  await i18next.init({ lng: "en", resources: { fr: { coquille: fr }, en: { coquille: en } } });
  expect(nomRole({ code: "ADMIN", nom: "Administrateur", systeme: true })).toBe("Administrator");
  expect(nomRole({ code: "ADMIN", nom: "Mon équipe", systeme: false })).toBe("Mon équipe");
  expect(nomRole({ code: "INCONNU", nom: "Mon rôle", systeme: true })).toBe("Mon rôle");
  await i18next.changeLanguage("fr");
  expect(nomRole({ code: "ADMIN", nom: "Administrator", systeme: true })).toBe("Administrateur");
});
