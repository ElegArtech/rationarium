import { type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "react-aria-components";
import type { Planning, PersonnePlanning } from "../../api/planning.js";
import { CELLULE_VIDE, initiales, joursAffiches, type Cellule } from "./grille.js";
import { cleGroupe } from "./Planning.js";
import type { Selection } from "./Detail.js";

/**
 * Vue 08 — la même grille, sur un mois.
 *
 * **C'est la vue la plus contrainte du produit.** À 34 px de large, le texte ne
 * tient pas : la cellule devient une **texture**. Une barre par occupation, sa
 * couleur au statut, un trait interrompu pour le hors-projet ; un aplat pour
 * l'absence ; un filet en pied pour le lieu.
 *
 * **Le détail sort de la cellule.** Il n'y est pas entassé en plus petit — la
 * cellule est un signal, pas un résumé. Chaque cellule est un bouton : elle
 * s'ouvre au clic **et** au clavier, ce qui est la seule façon d'atteindre le
 * détail sans souris. Un simple `title` au survol n'aurait pas cette propriété.
 *
 * La colonne « Ressource » reste figée au défilement horizontal, l'en-tête des
 * jours au défilement vertical.
 */

/**
 * Trois barres, puis le compte — c'est le seuil de la maquette 08
 * (`occ.slice(0, 3)` puis `mcount` au-delà). Il valait quatre ici : la
 * quatrième occupation s'affichait au lieu d'être comptée, et `mcount`
 * n'apparaissait qu'à cinq.
 */
const MAX_BARRES = 3;

export function GrilleMois({
  donnees,
  groupes,
  index,
  trame,
  replies,
  surReplier,
  surSelection,
}: {
  donnees: Planning;
  groupes: { service: { id: string; nom: string } | null; personnes: PersonnePlanning[] }[];
  index: Map<string, Cellule>;
  trame: Map<string, { ferie: boolean; vacances: string | null }>;
  replies: ReadonlySet<string>;
  surReplier: (cle: string) => void;
  surSelection: (s: Selection) => void;
}) {
  const { t } = useTranslation("planning");
  // `RG-PLN-03` — « masquer le week-end » vaut aussi sur la vue Mois, et
  // c'est même là qu'il fait gagner le plus de largeur.
  const jours = joursAffiches(donnees.periode.jours);
  const aujourdhui = new Date().toISOString().slice(0, 10);
  /*
   * `minmax(34px, 1fr)`, et non `34px` : les 34 px de la maquette sont un
   * PLANCHER de lisibilité, pas une largeur définitive. Fixes, ils laissaient
   * la grille s'arrêter à 938 px dans un cadre de 1260 — trois cents pixels
   * de vide à droite, et vingt-deux colonnes serrées au plus étroit alors
   * qu'elles avaient la place de respirer. La vue la plus contrainte du
   * produit n'a aucune raison de se contraindre davantage que nécessaire :
   * les colonnes prennent ce qui reste, et le défilement horizontal ne
   * revient que quand le mois ne tient réellement plus.
   */
  const style = { "--cols": `190px repeat(${jours.length}, minmax(34px, 1fr))` } as CSSProperties;

  const jourSemaine = (jour: string) => new Date(`${jour}T00:00:00.000Z`).getUTCDay();

  /** Les périodes de vacances, regroupées : une étiquette, pas un lavis répété. */
  const bandeaux = segmenter(jours, (jour) => trame.get(jour)?.vacances ?? null);

  return (
    // Voir la vue 07 : un cadre défilant veut son point de repère et sa
    // prise au clavier.
    <div className="pl-wrap" role="region" tabIndex={0} aria-label={t("grilleRegion")}>
      <div className="mo" style={style}>
        <div className="pl-corner">
          <span className="eyebrow">{t("colonneRessource")}</span>
        </div>

        {jours.map((jour) => {
          const js = jourSemaine(jour);
          const info = trame.get(jour);
          return (
            <div
              key={jour}
              className={`mo-head${js === 1 ? " is-mon" : ""}${
                jour === aujourdhui ? " is-today" : ""
              }${js === 0 || js === 6 || info?.ferie ? " is-off" : ""}`}
            >
              <span className="mo-dow">{t(`jours.initiale.${js}`)}</span>
              <span className="mo-num">{String(Number(jour.slice(8)))}</span>
            </div>
          );
        })}

        <div className="mo-bandlab">
          <span className="eyebrow">{t("bandeau")}</span>
        </div>
        {bandeaux.map((segment) => (
          <div
            key={segment.debut}
            className={`mo-band${segment.valeur ? " is-vac" : ""}${
              jourSemaine(segment.debut) === 1 ? " is-mon" : ""
            }`}
            style={{ gridColumn: `span ${segment.longueur}` }}
          >
            {segment.valeur ?? ""}
          </div>
        ))}

        {groupes.map((groupe) => {
          const cle = cleGroupe(groupe);
          const replie = replies.has(cle);
          const nom = groupe.service?.nom ?? t("sansService");
          return (
            <div key={cle || "sans"} style={{ display: "contents" }}>
              <div className="grp">
                <Button
                  className="grp-caret"
                  aria-expanded={!replie}
                  onPress={() => surReplier(cle)}
                  aria-label={t(replie ? "actions.deplierGroupe" : "actions.replierGroupe", { nom })}
                >
                  <span aria-hidden="true">{replie ? "▸" : "▾"}</span>
                </Button>
                <span className="grp-name">{nom}</span>
                <span className="grp-meta">
                  {t("groupe.effectif", { n: groupe.personnes.length })}
                </span>
              </div>

              {replie
                ? null
                : groupe.personnes.map((personne) => (
                    <div key={personne.id} style={{ display: "contents" }}>
                      <div className="res">
                        <span className="res-av" aria-hidden="true">
                          {initiales(personne)}
                        </span>
                        <span className="res-name">
                          {personne.prenom} {personne.nom}
                        </span>
                      </div>

                      {jours.map((jour) => (
                        <MicroCellule
                          key={jour}
                          cellule={index.get(`${personne.id}|${jour}`) ?? CELLULE_VIDE}
                          jour={jour}
                          personne={personne}
                          jourSemaine={jourSemaine(jour)}
                          ferie={trame.get(jour)?.ferie ?? false}
                          aujourdhui={jour === aujourdhui}
                          surSelection={surSelection}
                        />
                      ))}
                    </div>
                  ))}
            </div>
          );
        })}

        {/* La synthèse prend ici toute sa valeur : la tendance du mois se lit
            comme une courbe, sans lire un seul chiffre. */}
        <div className="msum-lab">
          <span className="eyebrow">{t("synthese.titre")}</span>
          <span className="grp-meta">{t("synthese.tendance")}</span>
        </div>
        {jours.map((jour) => {
          const s = donnees.synthese.find((x) => x.date === jour);
          const pct = s?.pourcentage ?? 0;
          return (
            <div
              key={jour}
              className={`msum${pct >= 40 ? " is-high" : ""}${
                jourSemaine(jour) === 1 ? " is-mon" : ""
              }`}
              title={t("synthese.detail", {
                date: jour,
                absents: s?.absents ?? 0,
                total: s?.total ?? 0,
                pourcentage: pct,
              })}
            >
              <span className="msum-n">{s?.absents ?? 0}</span>
              <span
                className="msum-bar"
                style={{ height: `${Math.max(1, Math.round(pct * 0.3))}px` }}
                aria-hidden="true"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MicroCellule({
  cellule,
  jour,
  personne,
  jourSemaine,
  ferie,
  aujourdhui,
  surSelection,
}: {
  cellule: Cellule;
  jour: string;
  personne: PersonnePlanning;
  jourSemaine: number;
  ferie: boolean;
  aujourdhui: boolean;
  surSelection: (s: Selection) => void;
}) {
  const { t } = useTranslation("planning");
  const weekend = jourSemaine === 0 || jourSemaine === 6;

  /*
   * Un congé de DEMI-JOURNÉE ne vide pas la cellule : la maquette 08 dessine
   * l'aplat sur la moitié concernée **et** les barres de l'autre moitié
   * (`if(!leave || leave.half)`). Traiter la demi-journée comme une journée
   * entière faisait disparaître le travail réellement prévu ce matin-là.
   */
  const occupationsVisibles = !cellule.conge || cellule.demiJournee !== null;

  /**
   * Le libellé d'assistance porte **tout** ce que la texture ne dit pas.
   * Sur cette vue, l'écran est muet par construction : si le libellé ne le
   * dit pas, personne ne l'entend.
   */
  const resume = cellule.conge
    ? t("mois.resumeConge", {
        nom: `${personne.prenom} ${personne.nom}`,
        date: jour,
        type: cellule.conge.type.nom,
        statut: t(cellule.conge.statut === "approved" ? "legende.congeValide" : "legende.congeAttente"),
      })
    : t("mois.resume", {
        nom: `${personne.prenom} ${personne.nom}`,
        date: jour,
        n: cellule.occupations.length,
        lieu: cellule.lieu ? t(`presence.${cellule.lieu.etat}`) : t("presence.nonDeclare"),
      });

  return (
    <Button
      className={`mcell${jourSemaine === 1 ? " is-mon" : ""}${weekend ? " is-off" : ""}${
        ferie ? " is-ferie" : ""
      }${aujourdhui ? " is-today" : ""}`}
      aria-label={resume}
      onPress={() => surSelection({ genre: "cellule", cellule, personne, jour })}
    >
      {cellule.conge ? (
        <span
          className={`mleave${cellule.conge.statut === "approved" ? "" : " is-pending"}${
            cellule.demiJournee === "morning"
              ? " is-am"
              : cellule.demiJournee === "afternoon"
                ? " is-pm"
                : ""
          }`}
          aria-hidden="true"
        />
      ) : null}

      {occupationsVisibles
        ? cellule.occupations
            .slice(0, MAX_BARRES)
            .map((o) => (
              <span
                key={o.cle}
                className={`mbar${o.genre === "tache" && o.tache.horsProjet ? " is-indep" : ""}`}
                style={{
                  color:
                    o.genre === "tache"
                      ? `var(--st-${o.tache.statut})`
                      : o.genre === "evenement"
                        ? "var(--event)"
                        : "var(--activity)",
                }}
                aria-hidden="true"
              />
            ))
        : null}

      {occupationsVisibles && cellule.occupations.length > MAX_BARRES ? (
        <span className="mcount" aria-hidden="true">
          {cellule.occupations.length}
        </span>
      ) : null}

      {occupationsVisibles && cellule.lieu ? (
        <span
          className={`mplace${cellule.lieu.etat === "office" ? " is-office" : ""}`}
          aria-hidden="true"
        />
      ) : null}
    </Button>
  );
}

/**
 * Regroupe les jours consécutifs qui partagent la même valeur.
 *
 * Le bandeau du mois porte **une** étiquette par période de vacances : répétée
 * sur vingt-deux colonnes de 34 px, elle serait illisible et ne dirait rien de
 * plus.
 */
function segmenter(
  jours: string[],
  valeurDe: (jour: string) => string | null,
): { debut: string; longueur: number; valeur: string | null }[] {
  const segments: { debut: string; longueur: number; valeur: string | null }[] = [];
  for (const jour of jours) {
    const valeur = valeurDe(jour);
    const dernier = segments[segments.length - 1];
    if (dernier && dernier.valeur === valeur) dernier.longueur += 1;
    else segments.push({ debut: jour, longueur: 1, valeur });
  }
  return segments;
}
