import { useEffect } from "react";
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  useNavigate,
  useParams,
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
import { Portefeuille } from "../vues/projets/Portefeuille.js";
import { VueEnsemble } from "../vues/projets/VueEnsemble.js";
import { Jalons } from "../vues/projets/Jalons.js";
import { Equipe } from "../vues/projets/Equipe.js";
import { OngletTaches } from "../vues/taches/OngletTaches.js";
import { ListeTaches } from "../vues/taches/Liste.js";
import { FicheTache } from "../vues/taches/Fiche.js";
import { Evenements } from "../vues/occupations/Evenements.js";
import { Conges } from "../vues/occupations/Conges.js";
import { Teletravail } from "../vues/occupations/Teletravail.js";
import { Temps } from "../vues/occupations/Temps.js";
import { Competences } from "../vues/referentiels/Competences.js";
import { Tiers, FicheTiers } from "../vues/referentiels/Tiers.js";
import { Clients, FicheClient } from "../vues/referentiels/Clients.js";
import { Utilisateurs } from "../vues/administration/Utilisateurs.js";
import { SuiviIndividuel } from "../vues/administration/Suivi.js";
import { Organisation } from "../vues/administration/Organisation.js";
import { Parametres } from "../vues/administration/Parametres.js";
import { Roles } from "../vues/administration/Roles.js";
import { Audit } from "../vues/administration/Audit.js";
import { Predefinies } from "../vues/administration/Predefinies.js";
import { Planning } from "../vues/planning/Planning.js";
import { Activite } from "../vues/planning/Activite.js";
import { TableauDeBord } from "../vues/tableau/TableauDeBord.js";
import { Rapports } from "../vues/rapports/Rapports.js";
import { GanttProjet } from "../vues/rapports/GanttProjet.js";

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
 * Elle est décidée au rendu et non dans un `beforeLoad` : la session est une
 * requête, et la connaître avant le premier rendu obligerait à la charger deux
 * fois — une fois pour décider, une fois pour afficher.
 *
 * Mais elle est **exécutée dans un effet**, jamais pendant le rendu. React
 * l'interdit — « Cannot update a component while rendering a different
 * component » — et le contrôle de bout en bout l'a signalé en console avant
 * qu'aucun symptôme ne se voie à l'écran. Une navigation déclenchée en cours
 * de rendu fonctionne jusqu'au jour où elle arrive pendant un rendu concurrent.
 */
function RedirectionConnexion() {
  const navigate = useNavigate();
  const { t } = useTranslation("commun");

  useEffect(() => {
    void navigate({
      to: "/connexion",
      search: { suite: window.location.pathname + window.location.search },
      replace: true,
    });
  }, [navigate]);

  return <Chargement quoi={t("etats.laSession")} />;
}

function RedirectionMotDePasse() {
  const navigate = useNavigate();
  const { t } = useTranslation("commun");

  useEffect(() => {
    void navigate({ to: "/mot-de-passe-impose", replace: true });
  }, [navigate]);

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
 * L'accueil — le tableau de bord (vue 06), depuis L-21.
 *
 * Il renvoyait au profil tant que la vue n'était pas portée. La redirection est
 * levée : c'est **la page la plus consultée du produit**, et pour un
 * contributeur la seule qu'il ouvre.
 */
const routeAccueil = createRoute({
  getParentRoute: () => routeApplication,
  path: "/",
  component: TableauDeBord,
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

// ── Projets — vues 10, 11, 13, 14 (L-32) ────────────────────────────────────

const routeProjets = createRoute({
  getParentRoute: () => routeApplication,
  path: "/projets",
  component: Portefeuille,
});

/**
 * La fiche projet et ses onglets.
 *
 * Chaque onglet est une route à part entière, et non un état interne : une
 * fiche projet se partage par lien, et un onglet qui ne s'inscrit pas dans
 * l'adresse renvoie le destinataire sur la vue d'ensemble.
 */
const routeProjet = createRoute({
  getParentRoute: () => routeApplication,
  path: "/projets/$id",
  component: function PageProjet() {
    const { id } = useParams({ from: "/application/projets/$id" });
    return <VueEnsemble projetId={id} />;
  },
});

const routeProjetGantt = createRoute({
  getParentRoute: () => routeApplication,
  path: "/projets/$id/gantt",
  component: function PageGanttProjet() {
    const { id } = useParams({ from: "/application/projets/$id/gantt" });
    return <GanttProjet projetId={id} />;
  },
});

const routeProjetJalons = createRoute({
  getParentRoute: () => routeApplication,
  path: "/projets/$id/jalons",
  component: function PageJalons() {
    const { id } = useParams({ from: "/application/projets/$id/jalons" });
    return <Jalons projetId={id} />;
  },
});

const routeProjetEquipe = createRoute({
  getParentRoute: () => routeApplication,
  path: "/projets/$id/equipe",
  component: function PageEquipe() {
    const { id } = useParams({ from: "/application/projets/$id/equipe" });
    return <Equipe projetId={id} />;
  },
});

// ── Tâches — vues 12, 16, 17 (L-33) ─────────────────────────────────────────

const routeProjetTaches = createRoute({
  getParentRoute: () => routeApplication,
  path: "/projets/$id/taches",
  component: function PageTachesProjet() {
    const { id } = useParams({ from: "/application/projets/$id/taches" });
    return <OngletTaches projetId={id} />;
  },
});

const routeTaches = createRoute({
  getParentRoute: () => routeApplication,
  path: "/taches",
  component: ListeTaches,
});

const routeTache = createRoute({
  getParentRoute: () => routeApplication,
  path: "/taches/$id",
  component: function PageTache() {
    const { id } = useParams({ from: "/application/taches/$id" });
    return <FicheTache tacheId={id} />;
  },
});

// ── Occupations — vues 18, 19, 20, 21 (L-34) ────────────────────────────────

const routeEvenements = createRoute({
  getParentRoute: () => routeApplication,
  path: "/evenements",
  component: Evenements,
});

const routeConges = createRoute({
  getParentRoute: () => routeApplication,
  path: "/conges",
  component: Conges,
});

const routeTeletravail = createRoute({
  getParentRoute: () => routeApplication,
  path: "/teletravail",
  component: Teletravail,
});

const routeTemps = createRoute({
  getParentRoute: () => routeApplication,
  path: "/temps",
  component: Temps,
});

// ── Référentiels — vues 22 à 26 (L-35) ──────────────────────────────────────

const routeCompetences = createRoute({
  getParentRoute: () => routeApplication,
  path: "/competences",
  component: Competences,
});

const routeTiers = createRoute({
  getParentRoute: () => routeApplication,
  path: "/tiers",
  component: Tiers,
});

const routeTiersFiche = createRoute({
  getParentRoute: () => routeApplication,
  path: "/tiers/$id",
  component: function PageTiers() {
    const { id } = useParams({ from: "/application/tiers/$id" });
    return <FicheTiers tiersId={id} />;
  },
});

const routeClients = createRoute({
  getParentRoute: () => routeApplication,
  path: "/clients",
  component: Clients,
});

const routeClientFiche = createRoute({
  getParentRoute: () => routeApplication,
  path: "/clients/$id",
  component: function PageClient() {
    const { id } = useParams({ from: "/application/clients/$id" });
    return <FicheClient clientId={id} />;
  },
});

// ── Administration — vues 27, 28, 29 (L-36) ─────────────────────────────────

const routeUtilisateurs = createRoute({
  getParentRoute: () => routeApplication,
  path: "/utilisateurs",
  component: Utilisateurs,
});

const routeSuivi = createRoute({
  getParentRoute: () => routeApplication,
  path: "/utilisateurs/$id/suivi",
  component: function PageSuivi() {
    const { id } = useParams({ from: "/application/utilisateurs/$id/suivi" });
    return <SuiviIndividuel userId={id} />;
  },
});

const routeOrganisation = createRoute({
  getParentRoute: () => routeApplication,
  path: "/departements",
  component: Organisation,
});

const routeRapports = createRoute({
  getParentRoute: () => routeApplication,
  path: "/rapports",
  component: Rapports,
});

const routePlanning = createRoute({
  getParentRoute: () => routeApplication,
  path: "/planning",
  component: () => <Planning mode="semaine" />,
});

const routePlanningMois = createRoute({
  getParentRoute: () => routeApplication,
  path: "/planning/mois",
  component: () => <Planning mode="mois" />,
});

const routePlanningActivite = createRoute({
  getParentRoute: () => routeApplication,
  path: "/planning/activite",
  component: Activite,
});

const routeParametres = createRoute({
  getParentRoute: () => routeApplication,
  path: "/parametres",
  component: Parametres,
});

const routeRoles = createRoute({
  getParentRoute: () => routeApplication,
  path: "/roles",
  component: Roles,
});

const routeAudit = createRoute({
  getParentRoute: () => routeApplication,
  path: "/audit",
  component: Audit,
});

const routePredefinies = createRoute({
  getParentRoute: () => routeApplication,
  path: "/taches-predefinies",
  component: Predefinies,
});

const arbre = racine.addChildren([
  routeConnexion,
  routeInscription,
  routeMotDePasseOublie,
  routeReinitialisation,
  routeMotDePasseImpose,
  routeApplication.addChildren([
    routeAccueil,
    routeProfil,
    routeProjets,
    routeProjet,
    routeProjetGantt,
    routeProjetJalons,
    routeProjetEquipe,
    routeProjetTaches,
    routeTaches,
    routeTache,
    routeEvenements,
    routeConges,
    routeTeletravail,
    routeTemps,
    routeCompetences,
    routeTiers,
    routeTiersFiche,
    routeClients,
    routeClientFiche,
    routeUtilisateurs,
    routeSuivi,
    routeOrganisation,
    routeRapports,
    routePlanning,
    routePlanningMois,
    routePlanningActivite,
    routeParametres,
    routeRoles,
    routeAudit,
    routePredefinies,
  ]),
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
