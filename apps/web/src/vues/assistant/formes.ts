import { formaterDate, formaterHeure } from "../../formats.js";

/**
 * Les mises en forme propres aux écrans de l'agent.
 *
 * Les horodatages du module — création, prise, fin, dernier contact — sont des
 * instants, pas des dates métier : `formaterDate` lit en UTC, ce qui est juste
 * pour une colonne `@db.Date` et faux pour un instant. Un passage terminé à
 * 0 h 30 à Paris s'afficherait la veille. L'instant est donc ramené à la date
 * et à l'heure LOCALES avant de passer par les formats réglés (`RG-GEN-09`).
 */

const deux = (n: number): string => String(n).padStart(2, "0");

/** `03/11/2026 · 14:05`, dans le fuseau du poste et selon le paramétrage. */
export function horodatage(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const jour = `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}`;
  return `${formaterDate(jour)} · ${formaterHeure(`${deux(d.getHours())}:${deux(d.getMinutes())}`)}`;
}

/** Une durée, en minutes entières, ou `null` quand elle ne se calcule pas. */
export function minutesEntre(debut: string | null | undefined, fin: string | null | undefined): number | null {
  if (!debut || !fin) return null;
  const a = Date.parse(debut);
  const b = Date.parse(fin);
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return null;
  return Math.floor((b - a) / 60_000);
}

/**
 * L'écart au présent, découpé pour une phrase ICU : l'unité choisie et sa
 * valeur. La phrase elle-même vit au catalogue — « il y a 3 minutes » ne se
 * compose pas par concaténation.
 */
export function ecartAuPresent(
  iso: string,
  maintenant: number,
): { unite: "secondes" | "minutes" | "heures" | "jours"; n: number } {
  const secondes = Math.max(0, Math.round((maintenant - Date.parse(iso)) / 1000));
  if (secondes < 60) return { unite: "secondes", n: secondes };
  const minutes = Math.round(secondes / 60);
  if (minutes < 60) return { unite: "minutes", n: minutes };
  const heures = Math.round(minutes / 60);
  if (heures < 24) return { unite: "heures", n: heures };
  return { unite: "jours", n: Math.round(heures / 24) };
}
