import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";

import "./i18n/index.js";
import "./styles/socle.css";
import { initialiserTheme } from "./theme/index.js";
import { routeur } from "./app/routeur.js";
import { FournisseurMessages } from "./composants/messages.js";
import { ErreurApi } from "./api/client.js";

/**
 * @rationarium/web — point d'entrée du client.
 *
 * Quatre choses sont posées ici, et rien d'autre : le cache de requêtes, le
 * thème mémorisé, la file de messages d'action, le routeur.
 *
 * **La file de messages est à la racine, hors du routeur.** Elle vaut aussi
 * pour les vues 01 à 05, qui vivent hors de la coquille. Elle avait été écrite
 * au L-31 et jamais montée : `useMessages` ne lève pas hors fournisseur — il
 * se tait —, si bien qu'aucune confirmation d'action n'apparaissait nulle part,
 * sans qu'aucune boucle ne s'en aperçoive. Un composant qui échoue en silence
 * doit être branché par un test, pas par une relecture.
 *
 * **Le thème est appliqué avant le premier rendu.** L'appliquer dans un effet
 * ferait clignoter la page en clair avant de passer en sombre — désagréable,
 * et surtout contraire à `C5` pour qui la lumière est un obstacle.
 *
 * `C1` — aucune ressource distante. Les polices, les catalogues de traduction
 * et le code sont dans le lot de construction.
 */

/**
 * Les vues qui AGRÈGENT le travail des autres.
 *
 * Rien de ce qu'elles montrent ne leur appartient : le tableau de bord et le
 * planning affichent des tâches, des congés, des événements que l'on modifie
 * ailleurs. Elles ne peuvent donc pas savoir quand leur contenu a changé, et
 * c'est aux écritures de le leur dire — ce qu'aucune n'avait de raison de
 * penser à faire.
 *
 * Le défaut observé : clore une tâche depuis sa fiche, revenir au tableau de
 * bord par la barre latérale, et l'y retrouver « à faire ». La donnée était
 * juste au serveur ; c'est le cache du client qui servait l'état d'avant. Il
 * fallait recharger la page pour voir la vérité — le pire des symptômes, car
 * l'affichage n'a pas l'air en panne, il a l'air d'avoir raison.
 *
 * Les lister ici plutôt que d'ajouter une invalidation à chaque mutation :
 * elles sont une petite dizaine, les écritures se comptent par centaines, et
 * c'est précisément l'oubli d'une écriture qui a produit ce défaut. Une règle
 * qui dépend de la vigilance de chaque appel n'en est pas une.
 */
const VUES_AGREGEES = [
  ["tableau-de-bord"],
  ["planning"],
  ["activite"],
  ["presence"],
  ["rapports"],
  ["suivi"],
  ["notifications"],
];

const cache = new QueryClient({
  /*
   * Après TOUTE écriture réussie, les vues d'agrégation sont périmées.
   *
   * `invalidateQueries` ne relance que les requêtes MONTÉES ; les autres sont
   * seulement marquées, et se rechargent à leur prochain affichage. Depuis la
   * fiche d'une tâche, cela ne déclenche donc aucune requête — le tableau de
   * bord se recharge quand on y revient, et pas avant.
   *
   * Les invalidations que les vues font déjà pour leurs propres clés restent :
   * celles-ci ne les remplacent pas, elles couvrent ce qu'aucune vue ne peut
   * connaître depuis l'endroit où elle écrit.
   */
  mutationCache: new MutationCache({
    onSuccess: () => {
      for (const queryKey of VUES_AGREGEES) void cache.invalidateQueries({ queryKey });
    },
  }),
  defaultOptions: {
    queries: {
      // Réessayer un refus n'a jamais fait changer d'avis un serveur : 401,
      // 403 et 404 sont des réponses, pas des pannes de réseau.
      retry: (echecs, erreur) =>
        !(erreur instanceof ErreurApi && erreur.statut < 500) && echecs < 2,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
    mutations: { retry: false },
  },
});

initialiserTheme();

const racine = document.getElementById("root");
if (!racine) throw new Error("L'élément #root est absent du document.");

createRoot(racine).render(
  <StrictMode>
    <QueryClientProvider client={cache}>
      <FournisseurMessages>
        <RouterProvider router={routeur} />
      </FournisseurMessages>
    </QueryClientProvider>
  </StrictMode>,
);
