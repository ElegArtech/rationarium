import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { STATUTS_PROJET, PRIORITES } from "@trame/contracts";
import type { FicheProjet } from "../../api/projets.js";
import { Pastille } from "../../composants/pastilles.js";
import "../../composants/partages.css";
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

  /**
   * Les onglets non encore portés — Tâches (L-33), Gantt (L-22) — sont
   * **affichés mais inertes** : ils disent que la section existe, sans mener
   * à une page vide. Les masquer ferait croire que le projet n'a pas de
   * tâches ; les activer mènerait à une adresse inconnue.
   */
  const onglets: { cle: Onglet; libelle: string; nombre?: number; chemin?: string }[] = [
    { cle: "ensemble", libelle: t("onglets.ensemble"), chemin: "/projets/$id" },
    { cle: "taches", libelle: t("onglets.taches"), nombre: projet.taches.total },
    { cle: "jalons", libelle: t("onglets.jalons"), nombre: projet.jalons, chemin: "/projets/$id/jalons" },
    {
      cle: "equipe",
      libelle: t("onglets.equipe"),
      nombre: projet.equipe.agents + projet.equipe.tiers + projet.equipe.clients,
      chemin: "/projets/$id/equipe",
    },
    { cle: "gantt", libelle: t("onglets.gantt") },
  ];

  return (
    <div className="page">
      <Link to="/projets" className="back-link">
        <span aria-hidden="true">←</span> <span>{t("retourAuxProjets")}</span>
      </Link>

      {bandeau}

      <div className={`proj-head${projet.archive || projet.statut === "cancelled" ? " is-dim" : ""}`}>
        <div className="proj-icon" aria-hidden="true">
          <span className="picon-glyphe">{projet.icone ?? "◇"}</span>
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
              className={o.cle === onglet ? "is-active" : ""}
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
    </div>
  );
}
