import type { FastifyInstance, RouteOptions } from "fastify";

/**
 * Les limites de corps de requête — une borne basse partout, relevée route
 * par route là où un fichier voyage.
 *
 * **Pourquoi pas une seule limite haute.** Jusqu'en 1.0.1, `bodyLimit` valait
 * 32 Mio pour TOUT le serveur, afin qu'une pièce jointe de 20 Mio encodée en
 * base64 passe (`RG-DOC-04`). La connexion, la recherche, chaque `PATCH` d'une
 * case à cocher acceptaient donc aussi 32 Mio — que Fastify lit en entier et
 * que `JSON.parse` matérialise avant le moindre contrôle d'accès. Sur
 * `POST /auth/login`, route ouverte sans session, c'était un moyen de faire
 * travailler le serveur pour rien, à volonté. La limite du transport est un
 * contrôle de déni de service : elle doit suivre ce que la route reçoit.
 *
 * **Pourquoi une table et non un décorateur.** Nest sur Fastify n'expose pas
 * `bodyLimit` par route : `@RouteConfig` n'écrit que dans `config`, que
 * Fastify ne relit pas pour la limite. Le seul endroit où l'option se pose
 * est le crochet `onRoute`, qui voit l'adresse et non la méthode du
 * contrôleur. Une entrée de cette table qui ne correspond plus à aucune route
 * serait INERTE et muette — le piège du sélecteur sans correspondance — d'où
 * `entreesSansRoute`, que le test d'intégration exige vide.
 */

const MIO = 1024 * 1024;

/** Ce que reçoit toute route qui ne transporte pas de fichier. */
export const LIMITE_CORPS_DEFAUT = 1 * MIO;

type Entree = { methode: string; chemin: string; octets: number; motif: string };

/**
 * Chaque relèvement dit le plafond métier qu'il couvre. Les chemins sont
 * ceux de Fastify, préfixe global compris, paramètres en `:nom`.
 */
export const LIMITES_PAR_ROUTE: readonly Entree[] = [
  {
    methode: "POST",
    chemin: "/api/documents",
    octets: 32 * MIO,
    motif:
      "RG-DOC-04 — 20 Mio décodés, soit 26,7 Mio en base64 ; la marge laisse un fichier un peu trop gros atteindre le contrôleur, qui dit le plafond.",
  },
  {
    methode: "POST",
    chemin: "/api/auth/me/avatar",
    octets: 6 * MIO,
    motif:
      "EX-AUTH-09 — 2 Mio décodés (TAILLE_MAX_AVATAR), 2,7 Mio en base64 ; la marge laisse une image de 3 à 4 Mio atteindre le service, qui dit le plafond (avatar_trop_volumineux).",
  },
  {
    methode: "POST",
    chemin: "/api/planning/ics",
    octets: 8 * MIO,
    motif: "EX-PLN-15 — 2 000 000 caractères au plus ; l'échappement JSON des fins de ligne et l'UTF-8 multi-octets peuvent le doubler.",
  },
  {
    methode: "POST",
    chemin: "/api/planning/ics/apercu",
    octets: 8 * MIO,
    motif: "EX-PLN-15 — même fichier que l'import, lu sans écrire.",
  },
  ...[
    "/api/imports/apercu",
    "/api/imports/utilisateurs",
    "/api/imports/competences",
    "/api/imports/conges",
    "/api/imports/projet/:id",
    "/api/imports/projet/:id/taches",
    "/api/imports/projet/:id/jalons",
  ].map((chemin) => ({
    methode: "POST",
    chemin,
    octets: 32 * MIO,
    motif:
      "M21 — 20 000 000 caractères au plus (corpsFichier) ; le client plafonne à 15 Mio, et l'échappement JSON du CSV peut en ajouter autant.",
  })),
];

const cle = (methode: string, chemin: string) => `${methode} ${chemin.replace(/\/+$/, "") || "/"}`;

/** Les entrées effectivement posées, par instance — pour `entreesSansRoute`. */
const suivis = new WeakMap<FastifyInstance, Set<string>>();

/**
 * Pose les relèvements sur les routes au moment où Nest les déclare.
 *
 * À appeler AVANT `app.init()` : un crochet `onRoute` ne voit que les routes
 * déclarées après lui.
 */
export function poserLimitesDeCorps(instance: FastifyInstance): void {
  const table = new Map(LIMITES_PAR_ROUTE.map((e) => [cle(e.methode, e.chemin), e]));
  const appliquees = new Set<string>();
  suivis.set(instance, appliquees);

  instance.addHook("onRoute", (route: RouteOptions) => {
    const methodes = Array.isArray(route.method) ? route.method : [route.method];
    for (const methode of methodes) {
      const k = cle(String(methode).toUpperCase(), route.url);
      const entree = table.get(k);
      if (entree) {
        route.bodyLimit = entree.octets;
        appliquees.add(k);
      }
    }
  });
}

/**
 * Les entrées de la table qu'aucune route n'a reçues — vide sur une
 * application initialisée, sans quoi un relèvement est mort en silence.
 */
export function entreesSansRoute(instance: FastifyInstance): string[] {
  const appliquees = suivis.get(instance) ?? new Set<string>();
  return LIMITES_PAR_ROUTE.map((e) => cle(e.methode, e.chemin)).filter((k) => !appliquees.has(k));
}
