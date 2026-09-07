import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { IconeProjet } from "../../composants/icones-projet.js";
import { Link, useRouterState } from "@tanstack/react-router";
import { STATUTS_PROJET, PRIORITES, type Permission } from "@rationarium/contracts";
import type { FicheProjet } from "../../api/projets.js";
import { Pastille } from "../../composants/pastilles.js";
import { usePeut } from "../../session/session.js";
import "../../composants/partages.css";
import { retourAuPortefeuille } from "./adresse.js";
import "./fiche.css";

/**
 * Le cadre commun aux onglets d'un projet — vues 11, 12, 13, 14, 15.
 *
 * **Trois états d'existence coexistent** : actif, annulé, archivé. Le brief de
 * la vue 11 insiste, ils doivent être « visuellement immédiats » et ils
 * bloquent la modification différemment. D'où deux bandeaux distincts en tête
 * de page, chacun avec **sa** sortie : restaurer pour l'annulé, désarchiver
 * pour l'archivé. Un bandeau unique « ce projet est figé » ferait perdre
 * l'action qui le débloque.
 */

export type Onglet = "ensemble" | "taches" | "jalons" | "equipe" | "gantt";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * `RG-GEN-06` — **la permission qui garde la vue d'arrivée de chaque onglet.**
 *
 * Même forme que le sélecteur de mode du planning, et trouvée par la même
 * recherche : un groupe d'onglets qui mène à une vue gardée par une permission
 * que le porteur n'a pas. `PORTFOLIO_MANAGER` — `SOCLE` + `ENCADREMENT`, sans
 * `CONTRIBUTION_PROJET` — n'a **pas** `milestones:read` : les onglets
 * « Jalons » et « Gantt » lui étaient offerts, et les deux vues qu'ils ouvrent
 * lisent `GET /projets/:id/feuille-de-route`, que le serveur refuse.
 *
 * On masque la commande, on ne l'éteint pas : une action interdite n'est
 * jamais proposée puis refusée, et la barre latérale fait déjà ce choix — pas
 * désactivées, **absentes**. Le contrôle reste au serveur (`RG-ADM-03` : qui
 * force l'adresse obtient un refus tracé, pas une page qui se tait).
 * ════════════════════════════════════════════════════════════════════════════
 */
export const PERMISSION_DE_L_ONGLET = {
  ensemble: "projects:read",
  taches: "tasks:read",
  /** `projets.controller.ts` : `@RequiertPermission("milestones:read")`. */
  jalons: "milestones:read",
  equipe: "projects:read",
  /** La vue 15 lit la feuille de route autant que les tâches. */
  gantt: "milestones:read",
} as const satisfies Record<Onglet, Permission>;

export function CadreProjet({
  projet,
  onglet,
  actions,
  bandeau,
  children,
}: {
  projet: FicheProjet;
  onglet: Onglet;
  /** Les actions d'en-tête — absentes des onglets qui n'en portent pas. */
  actions?: ReactNode;
  /** Les bandeaux d'état, rendus par la vue d'ensemble seule. */
  bandeau?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useTranslation("projets");
  const peut = usePeut();

  /*
   * `EX-PRJ-02`, `RG-GEN-04` — **le retour rend le portefeuille tel qu'on l'a
   * laissé.**
   *
   * Le lien pointait `/projets` nu : un filtre posé sur « Actif » avant
   * d'ouvrir un projet revenait à « Tous les statuts », sans un mot. Les
   * paramètres du portefeuille traversent la fiche et ses onglets, et lui sont
   * rendus au retour.
   */
  const brut = useRouterState({ select: (e) => e.location.search }) as Record<string, unknown>;
  const retour = retourAuPortefeuille(brut);

  /** Les cinq onglets d'un projet. Le Gantt a rejoint les autres au L-22. */
  const tousLesOnglets: { cle: Onglet; libelle: string; nombre?: number; chemin?: string }[] = [
    { cle: "ensemble", libelle: t("onglets.ensemble"), chemin: "/projets/$id" },
    { cle: "taches", libelle: t("onglets.taches"), nombre: projet.taches.total, chemin: "/projets/$id/taches" },
    { cle: "jalons", libelle: t("onglets.jalons"), nombre: projet.jalons, chemin: "/projets/$id/jalons" },
    {
      cle: "equipe",
      libelle: t("onglets.equipe"),
      nombre: projet.equipe.agents + projet.equipe.tiers + projet.equipe.clients,
      chemin: "/projets/$id/equipe",
    },
    { cle: "gantt", libelle: t("onglets.gantt"), chemin: "/projets/$id/gantt" },
  ];
  /* `RG-GEN-06` — masquées, pas désactivées : voir `PERMISSION_DE_L_ONGLET`. */
  const onglets = tousLesOnglets.filter((o) => peut(PERMISSION_DE_L_ONGLET[o.cle]));

  /*
   * PAS DE `.page` ICI. La coquille rend déjà `<main class="page">`, et les
   * maquettes 11 à 15 n'en portent qu'un : `.main > .page > …`. Le second
   * doublait les 24 px de marge intérieure, décalait la grille du kanban de
   * 24 px vers la droite et faisait **déborder la page horizontalement** — la
   * maquette tient à 1440 px au pixel près (266 + 5×226 + 4×11 = 1440), le
   * produit sortait à 1464. Un débordement qu'aucune règle ne signalait.
   */
  return (
    <>
      {/* `activeProps` neutralisé : le routeur ajoute sa propre classe `active`
          quand le lien correspond à l'adresse courante — et `/projets` la
          reçoit sur toute la lignée `/projets/$id`. Cette classe n'existe dans
          aucune maquette et aucune règle ne la définit : elle serait inerte.
          Le marquage de l'onglet courant se dit par `is-active`, celui des
          maquettes, et par `aria-current`. */}
      <Link to="/projets" search={retour} className="back-link" activeProps={{ className: "" }}>
        <span aria-hidden="true">←</span> <span>{t("retourAuxProjets")}</span>
      </Link>

      {bandeau}

      <div className={`proj-head${projet.archive || projet.statut === "cancelled" ? " is-dim" : ""}`}>
        <div className="proj-icon">
          <IconeProjet icone={projet.icone} nom={projet.nom} />
        </div>
        <div className="bloc-etroit">
          {projet.createur ? (
            <span className="eyebrow">
              {t("creePar", { qui: `${projet.createur.prenom} ${projet.createur.nom}` })}
            </span>
          ) : null}
          <h1 className="proj-name">{projet.nom}</h1>
          <div className="pills">
            <Pastille code={projet.statut} vocabulaire={STATUTS_PROJET} />
            <Pastille code={projet.priorite} vocabulaire={PRIORITES} />
            {projet.chef ? (
              <span className="pill pill-muted">
                {t("chefDeProjet", { qui: `${projet.chef.prenom} ${projet.chef.nom}` })}
              </span>
            ) : null}
          </div>
        </div>
        {actions ? <div className="proj-acts">{actions}</div> : null}
      </div>

      <nav className="tabbar" aria-label={t("onglets.libelle")}>
        {onglets.map((o) =>
          o.chemin ? (
            <Link
              key={o.cle}
              to={o.chemin}
              params={{ id: projet.id }}
              search={retour}
              className={o.cle === onglet ? "is-active" : ""}
              /*
               * `activeProps` neutralise la CLASSE que le routeur ajoute, pas
               * son `aria-current` — et `/projets/$id` reste active par PRÉFIXE
               * sur `/projets/$id/jalons`. Deux liens portaient donc
               * `aria-current="page"` en même temps, et un lecteur d'écran
               * annonçait deux « page courante ». `axe` ne le voit pas, le rendu
               * ne bouge pas : seul un contrôle qui COMPTE l'attribut l'attrape.
               * `exact` referme la correspondance par préfixe.
               */
              activeOptions={{ exact: true }}
              activeProps={{ className: "" }}
              aria-current={o.cle === onglet ? "page" : undefined}
            >
              <span>{o.libelle}</span>
              {o.nombre === undefined ? null : <span className="n">{o.nombre}</span>}
            </Link>
          ) : (
            <span key={o.cle} className="onglet-inerte" aria-disabled="true">
              <span>{o.libelle}</span>
              {o.nombre === undefined ? null : <span className="n">{o.nombre}</span>}
            </span>
          ),
        )}
      </nav>

      {children}
    </>
  );
}
