import i18next from "i18next";
import ICU from "i18next-icu";
import { initReactI18next } from "react-i18next";

import communFr from "../locales/fr/commun.json";
import authFr from "../locales/fr/auth.json";
import coquilleFr from "../locales/fr/coquille.json";
import erreursFr from "../locales/fr/erreurs.json";
import projetsFr from "../locales/fr/projets.json";
import tachesFr from "../locales/fr/taches.json";
import communEn from "../locales/en/commun.json";
import authEn from "../locales/en/auth.json";
import coquilleEn from "../locales/en/coquille.json";
import erreursEn from "../locales/en/erreurs.json";
import projetsEn from "../locales/en/projets.json";
import tachesEn from "../locales/en/taches.json";

/**
 * Internationalisation — RG-GEN-08, ADR-0011.
 *
 * Format ICU pour les pluriels et les formats : le produit affiche en
 * permanence des « {n} jour(s) » et des « {n} tâche(s) sur {total} ».
 * Concaténer pour former un pluriel est une faute de traduction, pas un
 * raccourci — toutes les langues n'ont pas deux formes.
 *
 * **Les catalogues sont chargés depuis le lot de construction**, jamais depuis
 * un service distant (C1). C'est pourquoi ils sont importés statiquement.
 */
export const LANGUES = ["fr", "en"] as const;
export type Langue = (typeof LANGUES)[number];

export const CLE_LANGUE = "trame.langue";

const detecter = (): Langue => {
  const memorisee = localStorage.getItem(CLE_LANGUE);
  if (memorisee === "fr" || memorisee === "en") return memorisee;
  return navigator.language.startsWith("en") ? "en" : "fr";
};

await i18next
  .use(ICU)
  .use(initReactI18next)
  .init({
    lng: detecter(),
    fallbackLng: "fr",
    defaultNS: "commun",
    ns: ["commun", "auth", "coquille", "erreurs", "projets", "taches"],
    resources: {
      fr: { commun: communFr, auth: authFr, coquille: coquilleFr, erreurs: erreursFr, projets: projetsFr, taches: tachesFr },
      en: { commun: communEn, auth: authEn, coquille: coquilleEn, erreurs: erreursEn, projets: projetsEn, taches: tachesEn },
    },
    interpolation: { escapeValue: false },
  });

export const changerLangue = async (langue: Langue): Promise<void> => {
  await i18next.changeLanguage(langue);
  localStorage.setItem(CLE_LANGUE, langue);
  document.documentElement.lang = langue;
};

document.documentElement.lang = i18next.language;

export default i18next;
