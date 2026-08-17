import { useTranslation } from "react-i18next";
import { Button } from "react-aria-components";
import type { TachePlanning, EvenementPlanning, PersonnePlanning } from "../../api/planning.js";
import type { Cellule } from "./grille.js";
import { formaterDate, formaterHeure } from "../../formats.js";

/**
 * Le panneau de détail latéral des vues 07 et 08.
 *
 * Il existe parce que **la cellule ne peut pas tout dire** : à 122 px de large
 * en semaine et 34 px en mois, le détail n'a pas de place. Le sortir de la
 * grille est la réponse du brief, et c'est ce qui permet à la cellule de rester
 * un signal plutôt qu'un paragraphe.
 *
 * Il n'est pas une fenêtre modale : on continue de lire la grille pendant qu'il
 * est ouvert, et c'est précisément l'usage — comparer ce qu'on vient d'ouvrir
 * avec ce qui l'entoure.
 */

export type Selection =
  | { genre: "tache"; tache: TachePlanning }
  | { genre: "evenement"; evenement: EvenementPlanning }
  | { genre: "cellule"; cellule: Cellule; personne: PersonnePlanning; jour: string };

export function PanneauDetail({
  selection,
  genreParDefaut,
  surFermer,
}: {
  selection: Selection | null;
  /**
   * La nature que le panneau annonce **avant** toute sélection.
   *
   * Les maquettes 07 et 08 la portent en dur dans le balisage du tiroir, et
   * elles n'y mettent pas la même : « Tâche de projet » en semaine, où l'on
   * ouvre une occupation, « Journée » en mois, où la cellule entière est le
   * seul objet ouvrable. Le surtitre nomme donc ce que CETTE vue fait lire.
   */
  genreParDefaut: Selection["genre"];
  surFermer: () => void;
}) {
  const { t } = useTranslation("planning");

  const ouvert = selection !== null;

  /*
   * Le panneau est TOUJOURS monté, comme dans les maquettes 07 et 08 : c'est
   * la translation qui l'ouvre et le referme, pas un montage. Le monter au
   * clic ferait sauter l'animation et, surtout, ferait apparaître et
   * disparaître un point de repère `dialog` de l'arbre d'accessibilité.
   *
   * Fermé, il est `inert` : `aria-hidden` seul laisserait le bouton de
   * fermeture atteignable à la tabulation — c'est exactement la combinaison
   * qu'`axe` refuse (`aria-hidden-focus`), et le clavier repartirait dans un
   * panneau invisible.
   */
  return (
    <aside
      className={`drawer${ouvert ? " is-open" : ""}`}
      role="dialog"
      inert={!ouvert}
      aria-hidden={ouvert ? undefined : true}
      aria-label={t("detail.titre")}
    >
      <div className="drawer-head">
        <div>
          <span className="eyebrow">
            {t(`detail.genre_${selection ? selection.genre : genreParDefaut}`)}
          </span>
          <p className="panel-title modal-titre">
            {selection ? <TitreDetail selection={selection} /> : t("detail.aucuneSelection")}
          </p>
        </div>
        <Button className="icon-btn" onPress={surFermer} aria-label={t("detail.fermer")}>
          <span aria-hidden="true">×</span>
        </Button>
      </div>
      <div className="drawer-body">
        <Corps selection={selection} />
      </div>
    </aside>
  );
}

/** Le titre du panneau. Rendu comme un composant, pour que `t` reste typée. */
function TitreDetail({ selection }: { selection: Selection }) {
  const { t } = useTranslation("planning");
  if (selection.genre === "tache") return <>{selection.tache.titre}</>;
  if (selection.genre === "evenement") return <>{selection.evenement.titre}</>;
  return (
    <>
      {t("detail.celluleTitre", {
        nom: `${selection.personne.prenom} ${selection.personne.nom}`,
        date: formaterDate(selection.jour),
      })}
    </>
  );
}

function Corps({ selection }: { selection: Selection | null }) {
  const { t } = useTranslation("planning");

  /*
   * Panneau fermé : la charpente reste, vide. Les maquettes 07 et 08 portent
   * en permanence `.hcard-list` et `.dl` dans le corps du panneau ; les
   * remplir est le seul rôle de l'ouverture.
   */
  if (selection === null) {
    return (
      <>
        <div className="hcard-list" />
        <dl className="dl" />
      </>
    );
  }

  if (selection.genre === "tache") {
    const tache = selection.tache;
    return (
      <dl className="dl">
        <dt>{t("detail.statut")}</dt>
        <dd>{t(`statuts.${tache.statut}`)}</dd>
        <dt>{t("detail.priorite")}</dt>
        <dd>{t(`priorites.${tache.priorite}`)}</dd>
        <dt>{t("detail.projet")}</dt>
        {/* Une tâche hors projet le dit ; une valeur vide ferait chercher. */}
        <dd>{tache.project?.nom ?? t("detail.horsProjet")}</dd>
        <dt>{t("detail.periode")}</dt>
        <dd>
          {tache.dateDebut ? formaterDate(tache.dateDebut) : "—"}
          {tache.dateFin && tache.dateFin !== tache.dateDebut
            ? ` → ${formaterDate(tache.dateFin)}`
            : ""}
        </dd>
        {tache.heureDebut ? (
          <>
            <dt>{t("detail.horaires")}</dt>
            <dd>
              {formaterHeure(tache.heureDebut)} – {formaterHeure(tache.heureFin)}
            </dd>
          </>
        ) : null}
        <dt>{t("detail.avancement")}</dt>
        <dd>{t("detail.pourcentage", { n: tache.avancement })}</dd>
        <dt>{t("detail.assignes")}</dt>
        <dd>{t("detail.nAssignes", { n: tache.assignes.length })}</dd>
        <dt>{t("detail.ouvrir")}</dt>
        <dd>
          <a className="lien-route" href={`/taches/${tache.id}`}>
            {t("detail.ficheTache")}
          </a>
        </dd>
      </dl>
    );
  }

  if (selection.genre === "evenement") {
    const e = selection.evenement;
    return (
      <dl className="dl">
        <dt>{t("detail.date")}</dt>
        <dd>{formaterDate(e.date)}</dd>
        <dt>{t("detail.horaires")}</dt>
        <dd>
          {e.journeeEntiere
            ? t("detail.journeeEntiere")
            : `${formaterHeure(e.heureDebut)} – ${formaterHeure(e.heureFin)}`}
        </dd>
        <dt>{t("detail.projet")}</dt>
        <dd>{e.project?.nom ?? t("detail.horsProjet")}</dd>
        <dt>{t("detail.type")}</dt>
        <dd>
          {e.interventionExterieure
            ? t("detail.interventionExterieure")
            : t("detail.evenementInterne")}
        </dd>
        <dt>{t("detail.participants")}</dt>
        <dd>{t("detail.nParticipants", { n: e.participants.length })}</dd>
      </dl>
    );
  }

  // Une cellule chargée : ce que la grille n'a pas eu la place de montrer.
  // Les maquettes 07 et 08 rendent la journée en DEUX blocs — la liste des
  // occupations, puis la synthèse du jour. La liste seule laissait sans
  // réponse la question que la vue Mois pose le plus : « présent ou pas ? ».
  const { cellule } = selection;
  const taches = cellule.occupations.filter((o) => o.genre === "tache");
  const projets = [
    ...new Set(
      taches
        .map((o) => (o.genre === "tache" ? o.tache.project?.nom : undefined))
        .filter((n): n is string => Boolean(n)),
    ),
  ];
  const presence = cellule.conge
    ? t("detail.presenceAbsent")
    : cellule.lieu
      ? t(`presence.${cellule.lieu.etat}`)
      : t("presence.nonDeclare");

  return (
    <>
    <div className="hcard-list">
      {cellule.occupations.map((o) => (
        <span
          key={o.cle}
          className={`occ${o.genre === "tache" && o.tache.horsProjet ? " is-indep" : ""}`}
          style={{
            color:
              o.genre === "tache"
                ? `var(--st-${o.tache.statut})`
                : o.genre === "evenement"
                  ? "var(--event)"
                  : "var(--activity)",
          }}
        >
          <span>
            {o.genre === "tache"
              ? o.tache.titre
              : o.genre === "evenement"
                ? o.evenement.titre
                : o.permanence.predefinedTask.nom}
          </span>
        </span>
      ))}
      {cellule.occupations.length === 0 ? (
        <p className="hcard-none">{t("detail.celluleVide")}</p>
      ) : null}
    </div>

    <dl className="dl">
      <dt>{t("detail.taches")}</dt>
      <dd>{t("detail.nTaches", { n: taches.length })}</dd>
      <dt>{t("detail.projets")}</dt>
      <dd>{projets.length > 0 ? projets.join(", ") : t("detail.aucunProjet")}</dd>
      <dt>{t("detail.presence")}</dt>
      <dd>{presence}</dd>
      {cellule.conge ? (
        <>
          <dt>{t("detail.conge")}</dt>
          <dd>{cellule.conge.type.nom}</dd>
        </>
      ) : null}
    </dl>
    </>
  );
}
