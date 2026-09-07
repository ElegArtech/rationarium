import { appeler } from "./client.js";

/**
 * M18 — les notifications. Coquille applicative.
 *
 * La cloche est le seul canal qui ne dépend de rien d'extérieur : elle
 * fonctionne quand la messagerie est en panne, et c'est précisément ce que
 * `RG-NTF-04` garantit côté serveur.
 */

export type Notification = {
  id: string;
  type: string;
  /**
   * Le titre rendu **par le serveur**, dans la langue du COMPTE (`users.langue`).
   * Il ne sert plus qu'à deux choses : le courriel de `EX-NTF-04`, qui part sans
   * navigateur, et le repli d'un type que le catalogue ne connaîtrait pas.
   */
  titre: string;
  /** Idem pour le corps — repli d'une phrase déjà rédigée, ou d'une clé inconnue. */
  contenu: string;
  /**
   * `RG-GEN-08` — **ce que le panneau compose lui-même.**
   *
   * `null` quand le corps stocké est une phrase déjà rédigée. Le serveur les
   * expose depuis la vague 1 (`notifications.service.ts`, `rendre`) et personne
   * ne les lisait : la cloche affichait `titre`/`contenu`, donc la langue du
   * compte, dans une interface qui pouvait être dans l'autre.
   */
  cle: string | null;
  params: Record<string, string>;
  lien: string | null;
  lue: boolean;
  creeLe: string;
};

export const notifications = (options: { nonLues?: boolean; limite?: number } = {}) => {
  const q = new URLSearchParams();
  if (options.nonLues) q.set("nonLues", "true");
  if (options.limite) q.set("limite", String(options.limite));
  const s = q.toString();
  return appeler<{ entrees: Notification[]; nonLues: number }>(
    `/notifications${s ? `?${s}` : ""}`,
  );
};

export const marquerLue = (id: string) =>
  appeler<{ lue: boolean }>(`/notifications/${id}`, { methode: "PATCH", corps: {} });

export const toutMarquerLu = () =>
  appeler<{ marquees: number }>("/notifications/tout-lu", { methode: "POST", corps: {} });
