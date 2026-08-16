/**
 * Client HTTP.
 *
 * Le cookie de session est `HttpOnly` : le client ne le lit jamais, il se
 * contente de le laisser voyager (`credentials: "include"`). C'est le point
 * d'ADR-0008 — un jeton lisible par JavaScript est un jeton exfiltrable.
 */

export class ErreurApi extends Error {
  constructor(
    readonly statut: number,
    readonly cle: string | undefined,
    message: string,
    readonly details?: { champ: string; message: string }[],
  ) {
    super(message);
  }
}

const BASE = import.meta.env.VITE_API_URL ?? "/api";

export async function appeler<T>(
  chemin: string,
  options: { methode?: string; corps?: unknown } = {},
): Promise<T> {
  const reponse = await fetch(`${BASE}${chemin}`, {
    method: options.methode ?? "GET",
    credentials: "include",
    headers: options.corps ? { "content-type": "application/json" } : {},
    ...(options.corps ? { body: JSON.stringify(options.corps) } : {}),
  });

  if (reponse.status === 204) return undefined as T;

  const charge = await reponse.json().catch(() => ({}));
  if (!reponse.ok) {
    throw new ErreurApi(
      reponse.status,
      charge.cle,
      charge.message ?? "Une erreur est survenue",
      charge.details,
    );
  }
  return charge as T;
}
