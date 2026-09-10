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
    /**
     * Le **détail chiffré** du refus, tel que le serveur l'a calculé.
     *
     * `commun/http.ts` le joint à toute erreur métier qui en porte un —
     * `{annee, demandes, disponibles, manquants}` pour un solde de congé,
     * `{dejaDeclare, demande, total, plafond}` pour le plafond journalier.
     * Il était **jeté ici** : le client ne gardait que la clé, et l'agent
     * lisait « Votre solde ne couvre pas cette demande » sans un seul nombre,
     * là où `RG-CNG-21`, `RG-TMP-02` et `RG-GEN-03` veulent qu'il sache de
     * combien il dépasse. Ce que le serveur transporte, le client le porte.
     */
    readonly detail?: Record<string, unknown>,
  ) {
    super(message);
  }
}

const BASE = import.meta.env.VITE_API_URL ?? "/api";

/**
 * Le drapeau que la page de connexion relève pour dire **pourquoi** on y est.
 *
 * Il vit dans le stockage de session parce que la sortie est un rechargement
 * complet du document : un état React ne survivrait pas au voyage, et c'est
 * précisément le voyage qu'on veut faire.
 */
export const CLE_SESSION_EXPIREE = "rationarium.session-expiree";

/**
 * Les points d'entrée qui vivent **avant** la session.
 *
 * Un `401` y est une réponse, pas une expiration : `/auth/login` refuse des
 * identifiants, `/auth/me` dit « personne n'est connecté » — c'est ainsi que
 * le routeur apprend qu'il doit afficher la vue 01. Les confondre ferait
 * boucler la page de connexion sur elle-même.
 */
const AVANT_SESSION = [
  "/auth/acces",
  "/auth/login",
  "/auth/logout",
  "/auth/signup",
  "/auth/me",
  "/auth/forgot-password",
  "/auth/reset-password",
  "/auth/verify-reset-token",
  "/parametrage",
];

/** Vrai une fois la sortie enclenchée : dix requêtes en vol ne partent qu'une fois. */
let sortieEnCours = false;

/**
 * `EX-AUTH-02`, `EX-AUTH-03`, `RG-GEN-02`, `RG-GEN-03` — **une session expirée
 * ne laisse pas la vue à l'écran.**
 *
 * Ce que le parcours a relevé : session supprimée au serveur, un geste réel
 * sur le planning, `GET /api/planning` en `401` — et la vue TOUJOURS AFFICHÉE,
 * avec sa coquille, sa barre latérale, son compteur de notifications et ses
 * données périmées. Le seul message était « Le chargement a échoué · Session
 * requise · Réessayer » : un libellé d'erreur de chargement, pas une
 * expiration de session, sans retour à la vue 01 ni invitation à se
 * reconnecter. Personne n'écoutait le `401` hors de la requête de session, et
 * celle-ci est en cache une minute.
 *
 * **La sortie est un rechargement délibéré du document, et c'est le seul
 * endroit du produit où ce soit la bonne réponse.** Naviguer par le routeur
 * laisserait en mémoire ce qu'on veut justement perdre : le cache de requêtes,
 * la session lue, les réglages, le compteur. Ici, tout doit tomber.
 *
 * La destination est reportée : `RG-GEN-02` — on revient où l'on allait.
 */
const signalerSessionExpiree = (): void => {
  if (sortieEnCours) return;
  if (typeof window === "undefined") return;
  if (window.location.pathname.startsWith("/connexion")) return;
  sortieEnCours = true;
  try {
    window.sessionStorage.setItem(CLE_SESSION_EXPIREE, "1");
  } catch {
    // Navigation privée, stockage refusé : on part quand même. Le retour à la
    // vue 01 vaut mieux qu'une vue périmée, message ou pas.
  }
  const suite = window.location.pathname + window.location.search;
  window.location.assign(`/connexion?suite=${encodeURIComponent(suite)}`);
};

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

  /*
   * Le `401` est intercepté AVANT toute lecture de la charge : c'est une
   * expiration de session, quelle que soit la requête qui l'a rencontrée.
   * L'erreur est levée quand même — l'appelant a le droit de savoir que sa
   * requête a échoué —, mais le document part déjà vers la vue 01.
   */
  if (reponse.status === 401 && !AVANT_SESSION.includes(chemin.split("?")[0] ?? chemin)) {
    signalerSessionExpiree();
  }

  if (reponse.status === 204) return undefined as T;

  const charge = await reponse.json().catch(() => ({}));
  if (!reponse.ok) {
    throw new ErreurApi(
      reponse.status,
      charge.cle,
      charge.message ?? "Une erreur est survenue",
      charge.details,
      charge.detail,
    );
  }
  return charge as T;
}
