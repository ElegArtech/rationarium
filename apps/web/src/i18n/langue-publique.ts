export type LanguePublique = "fr" | "en";

/** La région globale donne la langue publique seulement sans choix local explicite. */
export const languePublique = (
  reglages: Readonly<Record<string, string>>,
  memorisee: string | null,
): LanguePublique | null => {
  if (memorisee === "fr" || memorisee === "en") return null;
  return reglages["display.locale"]?.toLowerCase().startsWith("en") ? "en" : "fr";
};
