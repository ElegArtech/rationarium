import i18next from "i18next";

/**
 * Formats de date et d'heure — `RG-GEN-09`.
 *
 * **Jamais de formatage manuel.** Écrire `d.slice(8,10) + "/" + d.slice(5,7)`
 * produit une date française lisible par un lecteur anglais comme un mois de
 * trente et un. Le format suit la langue courante, et `Intl` s'en charge.
 *
 * Les dates métier arrivent en `AAAA-MM-JJ` (ADR-0010) : sans heure ni fuseau.
 * Elles sont interprétées **en UTC** pour la même raison qui les a fait choisir
 * ainsi — `new Date("2026-09-01")` lu à Paris en heure d'été reste le 1er
 * septembre, mais `new Date("2026-09-01T00:00:00")` lu à Tahiti devient le 31
 * août. Le fuseau n'a rien à faire dans une date d'échéance.
 */

const locale = (): string => (i18next.language.startsWith("en") ? "en-GB" : "fr-FR");

/** Une date métier vers un instant UTC, ou `null` si la valeur est absente. */
const instant = (valeur: string | Date | null | undefined): Date | null => {
  if (!valeur) return null;
  if (valeur instanceof Date) return valeur;
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(valeur) ? `${valeur}T00:00:00.000Z` : valeur;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** `01/03/2026` en français, `01/03/2026` en anglais britannique. */
export const formaterDate = (valeur: string | Date | null | undefined): string => {
  const d = instant(valeur);
  if (!d) return "—";
  return new Intl.DateTimeFormat(locale(), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
};

/** Forme longue, pour les en-têtes : `1 mars 2026`. */
export const formaterDateLongue = (valeur: string | Date | null | undefined): string => {
  const d = instant(valeur);
  if (!d) return "—";
  return new Intl.DateTimeFormat(locale(), {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
};

/**
 * Un nombre, avec le séparateur de milliers de la langue.
 *
 * `1 200 h` en français, `1,200 h` en anglais. Concaténer sans passer par
 * `Intl` produirait `1200` partout, ce qui se lit mal dès quatre chiffres.
 */
export const formaterNombre = (n: number, decimales = 0): string =>
  new Intl.NumberFormat(locale(), {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }).format(n);

/** L'écart en jours entiers entre une échéance et aujourd'hui. Négatif = retard. */
export const joursAvant = (echeance: string | Date | null | undefined): number | null => {
  const d = instant(echeance);
  if (!d) return null;
  const aujourdhui = new Date();
  const minuitUtc = Date.UTC(
    aujourdhui.getFullYear(),
    aujourdhui.getMonth(),
    aujourdhui.getDate(),
  );
  return Math.round((d.getTime() - minuitUtc) / 86_400_000);
};
