import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";

import "./i18n/index.js";
import "./styles/socle.css";
import { initialiserTheme } from "./theme/index.js";
import { routeur } from "./app/routeur.js";
import { FournisseurMessages } from "./composants/messages.js";
import { ErreurApi } from "./api/client.js";

/**
 * @trame/web — point d'entrée du client.
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

const cache = new QueryClient({
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
