import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
  useNavigate,
  useSearch,
} from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { Coquille } from "../coquille/Coquille.js";
import { FournisseurSession, useSession, CLE_SESSION } from "../session/session.js";
import { Chargement, RouteIntrouvable } from "../composants/etats.js";
import { deconnexion } from "../api/session.js";

import { Connexion } from "../routes/connexion.js";
import { Inscription } from "../routes/inscription.js";
import { MotDePasseOublie } from "../routes/mot-de-passe-oublie.js";
import { Reinitialisation } from "../routes/reinitialisation.js";
import { MotDePasseImpose } from "../routes/mot-de-passe-impose.js";
import { Profil } from "../routes/profil.js";

/**
 * L'arborescence des routes.
 *
 * **Deux zones, deux gabarits.** Les vues 01 à 05 vivent hors de la coquille :
 * elles précèdent la session, donc la barre latérale et le fil d'Ariane n'ont
 * rien à y afficher. Tout le reste vit dedans.
 *
 * **La garde de route n'est pas un contrôle d'accès.** Elle évite d'afficher
 * une coquille vide pendant qu'une requête part se faire refuser — rien de
 * plus. Le contrôle est au serveur, permission puis périmètre. Une garde de
 * route qu'on croirait protectrice serait pire qu'aucune garde : elle
 * dispenserait de vérifier au bon endroit.
 *
 * L'arbre est **déclaré en code** et non déduit de l'arborescence des
 * fichiers : le générateur de routes de TanStack écrit un fichier qu'il faut
 * ensuite committer, et un artefact généré committé dérive silencieusement.
 */

const racine = createRootRoute({
  component: () => <Outlet />,
  notFoundComponent: RouteIntrouvable,
});

// ── Zone publique — vues 01 à 05 ────────────────────────────────────────────

/**
 * Après connexion, on revient là où l'on allait.
 *
 * Sans ce report, un lien partagé vers une tâche renverrait sur l'accueil
 * après identification, et l'utilisateur devrait retrouver la tâche à la main.
 */
const rechercheConnexion = z.object({ suite: z.string().optional() });

const routeConnexion = createRoute({
  getParentRoute: () => racine,
  path: "/connexion",
  validateSearch: rechercheConnexion,
  component: function PageConnexion() {
    const navigate = useNavigate();
    const client = useQueryClient();
    const { suite } = useSearch({ from: "/connexion" });

    return (
      <Connexion
        surSucces={(motDePasseAChanger) => {
          void client.invalidateQueries({ queryKey: CLE_SESSION }).then(() =>
            navigate({ to: motDePasseAChanger ? "/mot-de-passe-impose" : (suite ?? "/") }),
          );
        }}
      />
    );
  },
});

const routeInscription = createRoute({
  getParentRoute: () => racine,
  path: "/inscription",
  component: () => <Inscription />,
});

const routeMotDePasseOublie = createRoute({
  getParentRoute: () => racine,
  path: "/mot-de-passe-oublie",
  component: () => <MotDePasseOublie />,
});

const routeReinitialisation = createRoute({
  getParentRoute: () => racine,
  path: "/reinitialisation",
  validateSearch: z.object({ jeton: z.string().default("") }),
  component: function PageReinitialisation() {
    const { jeton } = useSearch({ from: "/reinitialisation" });
    return <Reinitialisation jeton={jeton} />;
  },
});

// ── Zone authentifiée ───────────────────────────────────────────────────────

/**
 * `EX-AUTH-07` — le changement imposé se fait **hors coquille**.
 *
 * L'utilisateur est identifié mais n'a pas encore repris la main sur son
 * compte : lui montrer la navigation complète l'inviterait à aller ailleurs,
 * pour se faire renvoyer ici.
 */
const routeMotDePasseImpose = createRoute({
  getParentRoute: () => racine,
  path: "/mot-de-passe-impose",
  component: function PageMotDePasseImpose() {
    const navigate = useNavigate();
    const client = useQueryClient();
    return (
      <MotDePasseImpose
        surSucces={() => {
          void client.invalidateQueries({ queryKey: CLE_SESSION });
          void navigate({ to: "/" });
        }}
      />
    );
  },
});

/** Le gabarit de toutes les vues internes : coquille, puis la vue. */
const routeApplication = createRoute({
  getParentRoute: () => racine,
  id: "application",
  component: function GabaritApplication() {
    const { t } = useTranslation("commun");
    const navigate = useNavigate();
    const client = useQueryClient();

    return (
      <FournisseurSession
        enAttente={<Chargement quoi={t("etats.laSession")} />}
        sansSession={<RedirectionConnexion />}
      >
        {(session) =>
          session.motDePasseAChanger ? (
            <RedirectionMotDePasse />
          ) : (
            <CoquilleDeSession
              surDeconnexion={async () => {
                await deconnexion();
                client.clear();
                await navigate({ to: "/connexion", search: {} });
              }}
            />
          )
        }
      </FournisseurSession>
    );
  },
});

/**
 * La redirection vers la connexion, **en gardant la destination**.
 *
 * Elle est faite au rendu et non dans un `beforeLoad` : la session est une
 * requête, et la connaître avant le premier rendu obligerait à la charger deux
 * fois — une fois pour décider, une fois pour afficher.
 */
function RedirectionConnexion() {
  const navigate = useNavigate();
  const { t } = useTranslation("commun");
  void navigate({
    to: "/connexion",
    search: { suite: window.location.pathname + window.location.search },
    replace: true,
  });
  return <Chargement quoi={t("etats.laSession")} />;
}

function RedirectionMotDePasse() {
  const navigate = useNavigate();
  const { t } = useTranslation("commun");
  void navigate({ to: "/mot-de-passe-impose", replace: true });
  return <Chargement quoi={t("etats.laSession")} />;
}

function CoquilleDeSession({ surDeconnexion }: { surDeconnexion: () => void }) {
  const { session, permissions } = useSession();
  return (
    <Coquille
      utilisateur={{
        id: session.id,
        prenom: session.prenom,
        nom: session.nom,
        role: session.role?.nom ?? "",
      }}
      permissions={permissions}
      surDeconnexion={surDeconnexion}
    >
      <Outlet />
    </Coquille>
  );
}

// ── Vues internes portées à ce jour ─────────────────────────────────────────

/**
 * L'accueil.
 *
 * Le tableau de bord (vue 06) appartient au lot L-21 : tant qu'il n'est pas
 * porté, l'accueil renvoie sur le profil plutôt que d'afficher une page
 * inventée. Une page d'attente aurait toutes les chances de survivre à sa
 * raison d'être.
 */
const routeAccueil = createRoute({
  getParentRoute: () => routeApplication,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/profil" });
  },
});

const routeProfil = createRoute({
  getParentRoute: () => routeApplication,
  path: "/profil",
  component: function PageProfil() {
    const { session } = useSession();
    return (
      <Profil
        utilisateur={{
          prenom: session.prenom,
          nom: session.nom,
          email: session.email,
          login: session.login,
          role: session.role?.nom ?? "",
          derniereConnexion: session.derniereConnexion,
        }}
      />
    );
  },
});

const arbre = racine.addChildren([
  routeConnexion,
  routeInscription,
  routeMotDePasseOublie,
  routeReinitialisation,
  routeMotDePasseImpose,
  routeApplication.addChildren([routeAccueil, routeProfil]),
]);

export const routeur = createRouter({
  routeTree: arbre,
  defaultNotFoundComponent: RouteIntrouvable,
  // C1 : aucune ressource distante. Le préchargement porte sur le code déjà
  // livré dans le lot de construction, pas sur un réseau.
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof routeur;
  }
}
