import i18next from "i18next";
import ICU from "i18next-icu";
import { initReactI18next } from "react-i18next";

import communFr from "../locales/fr/commun.json";
import authFr from "../locales/fr/auth.json";
import accesFr from "../locales/fr/acces.json";
import coquilleFr from "../locales/fr/coquille.json";
import erreursFr from "../locales/fr/erreurs.json";
import projetsFr from "../locales/fr/projets.json";
import tachesFr from "../locales/fr/taches.json";
import occupationsFr from "../locales/fr/occupations.json";
import referentielsFr from "../locales/fr/referentiels.json";
import administrationFr from "../locales/fr/administration.json";
import planningFr from "../locales/fr/planning.json";
import tableauFr from "../locales/fr/tableau.json";
import rapportsFr from "../locales/fr/rapports.json";
import importsFr from "../locales/fr/imports.json";
import communEn from "../locales/en/commun.json";
import authEn from "../locales/en/auth.json";
import accesEn from "../locales/en/acces.json";
import coquilleEn from "../locales/en/coquille.json";
import erreursEn from "../locales/en/erreurs.json";
import projetsEn from "../locales/en/projets.json";
import tachesEn from "../locales/en/taches.json";
import occupationsEn from "../locales/en/occupations.json";
import referentielsEn from "../locales/en/referentiels.json";
import administrationEn from "../locales/en/administration.json";
import planningEn from "../locales/en/planning.json";
import tableauEn from "../locales/en/tableau.json";
import rapportsEn from "../locales/en/rapports.json";
import importsEn from "../locales/en/imports.json";

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
    ns: ["commun", "auth", "acces", "coquille", "erreurs", "projets", "taches", "occupations", "referentiels", "administration", "planning", "tableau", "rapports", "imports"],
    resources: {
      fr: { commun: communFr, auth: authFr, acces: accesFr, coquille: coquilleFr, erreurs: erreursFr, projets: projetsFr, taches: tachesFr, occupations: occupationsFr, referentiels: referentielsFr, administration: administrationFr, planning: planningFr, tableau: tableauFr, rapports: rapportsFr, imports: importsFr },
      en: { commun: communEn, auth: authEn, acces: accesEn, coquille: coquilleEn, erreurs: erreursEn, projets: projetsEn, taches: tachesEn, occupations: occupationsEn, referentiels: referentielsEn, administration: administrationEn, planning: planningEn, tableau: tableauEn, rapports: rapportsEn, imports: importsEn },
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
