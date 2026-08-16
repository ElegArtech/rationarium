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
  titre: string;
  contenu: string;
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
