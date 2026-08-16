import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Button } from "react-aria-components";
import * as apiTaches from "../../api/taches.js";
import * as apiProjets from "../../api/projets.js";
import { usePeut } from "../../session/session.js";
import { Chargement, ErreurDeChargement, AccesRefuse } from "../../composants/etats.js";
import { formaterDate } from "../../formats.js";
import { CadreProjet } from "../projets/Fiche.js";
import "../../composants/partages.css";
import "./gantt.css";

/**
 * Vue 15 — projet, onglet Gantt.
 *
 * **Les flèches de dépendance deviennent illisibles au-delà d'une vingtaine de
 * tâches.** Le brief l'anticipe et donne la réponse : ne les afficher qu'à la
 * sélection. C'est ce que fait cette vue — et les dépendances de la tâche
 * choisie ne sont même chargées qu'à ce moment, ce qui évite de rapporter un
 * graphe entier pour n'en dessiner qu'une branche.
 *
 * Aucune bibliothèque de Gantt (`cadrage/03 § 4, D12`). Les barres sont
 * positionnées en pourcentage de la plage, les flèches sont un `<svg>`
 * superposé. Les jetons portent les couleurs : les deux thèmes suivent.
 */

const ECHELLES = ["jour", "semaine", "mois"] as const;
type Echelle = (typeof ECHELLES)[number];

/** La largeur d'une unité de temps, en pixels, selon l'échelle. */
const LARGEUR: Record<Echelle, number> = { jour: 34, semaine: 14, mois: 5 };

const HAUTEUR_LIGNE = 34;
const HAUTEUR_GROUPE = 30;

/**
 * Le jour civil d'une date, en millisecondes.
 *
 * L'API rend des horodatages complets (`2024-08-16T00:00:00.000Z`), pas des
 * dates seules. Concaténer `T00:00:00.000Z` à une valeur qui en porte déjà un
 * donne une date invalide, donc `NaN`, donc un `Math.min` à `NaN` — et
 * `new Date(NaN).toISOString()` **lève**. On tronque au jour avant de composer.
 */
const jourDe = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00.000Z`).getTime();
const JOUR_MS = 86_400_000;

export function GanttProjet({ projetId }: { projetId: string }) {
  const { t } = useTranslation("rapports");
  const peut = usePeut();
  const [echelle, setEchelle] = useState<Echelle>("semaine");
  const [selection, setSelection] = useState<string | null>(null);

  const projet = useQuery({ queryKey: ["projet", projetId], queryFn: () => apiProjets.fiche(projetId) });

  const taches = useQuery({
    queryKey: ["taches", { projectId: projetId }],
    queryFn: () => apiTaches.lister({ projectId: projetId }),
    enabled: peut("tasks:read"),
  });

  const route = useQuery({
    queryKey: ["projet", projetId, "route"],
    queryFn: () => apiProjets.feuilleDeRoute(projetId),
    enabled: peut("milestones:read"),
  });

  /** Les dépendances ne sont chargées qu'à la sélection — c'est la règle. */
  const detail = useQuery({
    queryKey: ["taches", selection],
    queryFn: () => apiTaches.fiche(selection!),
    enabled: selection !== null,
  });

  const datees = useMemo(
    () => (taches.data ?? []).filter((x) => x.dateDebut !== null && x.dateFin !== null),
    [taches.data],
  );

  if (!peut("tasks:read")) return <AccesRefuse />;
  if (projet.isPending) return <Chargement quoi={t("ganttProjet.leProjet")} />;
  if (projet.isError)
    return <ErreurDeChargement erreur={projet.error} surReessai={() => void projet.refetch()} />;

  return (
    <CadreProjet projet={projet.data} onglet="gantt">
      {taches.isPending ? <Chargement quoi={t("ganttProjet.lesTaches")} /> : null}
      {taches.isError ? (
        <ErreurDeChargement erreur={taches.error} surReessai={() => void taches.refetch()} />
      ) : null}

      {taches.data ? (
        datees.length === 0 ? (
          <div className="empty empty-large">
            <p>{t("ganttProjet.videTitre")}</p>
            <small>{t("ganttProjet.videAide")}</small>
          </div>
        ) : (
          <>
            <div className="g-echelle">
              <div className="seg" role="group" aria-label={t("ganttProjet.echelle")}>
                {ECHELLES.map((e) => (
                  <button
                    key={e}
                    type="button"
                    aria-pressed={e === echelle}
                    onClick={() => setEchelle(e)}
                  >
                    {t(`ganttProjet.echelle_${e}`)}
                  </button>
                ))}
              </div>
              {/* L'indice du brief, mot pour mot : sans lui, la sélection et le
                  double-clic ne se découvrent pas. */}
              <span className="g-indice">{t("ganttProjet.indice")}</span>
            </div>

            <Grille
              taches={datees}
              jalons={route.data?.jalons ?? []}
              echelle={echelle}
              selection={selection}
              surSelection={setSelection}
              dependances={
                selection && detail.data
                  ? (detail.data.dependances.dependDe ?? []).map((d) => d.id)
                  : []
              }
            />
          </>
        )
      ) : null}
    </CadreProjet>
  );
}

function Grille({
  taches,
  jalons,
  echelle,
  selection,
  surSelection,
  dependances,
}: {
  taches: apiTaches.LigneTache[];
  jalons: { id: string; nom: string; dateEcheance: string | null }[];
  echelle: Echelle;
  selection: string | null;
  surSelection: (id: string | null) => void;
  dependances: string[];
}) {
  const { t } = useTranslation("rapports");

  const plage = useMemo(() => {
    const debuts = taches.map((x) => jourDe(x.dateDebut!));
    const fins = taches.map((x) => jourDe(x.dateFin!));
    // Une marge d'un jour de part et d'autre : une barre collée au bord se lit
    // comme une barre coupée.
    return { debut: Math.min(...debuts) - JOUR_MS, fin: Math.max(...fins) + JOUR_MS };
  }, [taches]);

  const jours = Math.max(1, Math.round((plage.fin - plage.debut) / JOUR_MS));
  const largeur = jours * LARGEUR[echelle];
  const x = (ms: number) => ((ms - plage.debut) / (plage.fin - plage.debut)) * largeur;

  /**
   * `EX-JAL-…` — les tâches sont **regroupées par jalon**, dans l'ordre de la
   * feuille de route. Celles qui n'en portent pas forment un groupe nommé
   * plutôt que de flotter en tête sans explication.
   */
  const groupes = useMemo(() => {
    const parJalon = new Map<string, apiTaches.LigneTache[]>();
    for (const tache of taches) {
      const cle = tache.milestone?.id ?? "";
      parJalon.set(cle, [...(parJalon.get(cle) ?? []), tache]);
    }
    const ordonnes = jalons
      .filter((j) => parJalon.has(j.id))
      .map((j) => ({ id: j.id, nom: j.nom, dateEcheance: j.dateEcheance, taches: parJalon.get(j.id)! }));
    const sans = parJalon.get("");
    return sans
      ? [...ordonnes, { id: "", nom: t("ganttProjet.sansJalon"), dateEcheance: null, taches: sans }]
      : ordonnes;
  }, [taches, jalons, t]);

  /** La position verticale de chaque tâche, pour les barres et les flèches. */
  const lignes = useMemo(() => {
    const positions = new Map<string, number>();
    let y = 0;
    for (const g of groupes) {
      y += HAUTEUR_GROUPE;
      for (const tache of g.taches) {
        positions.set(tache.id, y);
        y += HAUTEUR_LIGNE;
      }
    }
    return { positions, hauteur: y };
  }, [groupes]);

  const aujourdhui = Date.now();
  const dansLaPlage = aujourdhui >= plage.debut && aujourdhui <= plage.fin;

  return (
    <div className="gantt">
      <div className="g-grid">
        <div className="g-left">
          <div className="g-lhead">
            <span className="eyebrow">{t("ganttProjet.colonneTaches")}</span>
          </div>
          {groupes.map((g) => (
            <div key={g.id || "sans"}>
              <div className="g-grp">
                <span className="g-grp-name">{g.nom}</span>
                {g.dateEcheance ? (
                  <span className="g-row-dates">{formaterDate(g.dateEcheance)}</span>
                ) : null}
              </div>
              {g.taches.map((tache) => (
                <div
                  className={`g-row${selection === tache.id ? " is-sel" : ""}`}
                  key={tache.id}
                >
                  <span className="g-row-name">{tache.titre}</span>
                  <span className="g-row-dates">
                    {formaterDate(tache.dateDebut!)} → {formaterDate(tache.dateFin!)}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className="g-right" style={{ width: `${largeur}px` }}>
          <div className="g-head">
            <div className="g-months">
              <span className="g-month" style={{ width: `${largeur}px` }}>
                {formaterDate(new Date(plage.debut).toISOString().slice(0, 10))} →{" "}
                {formaterDate(new Date(plage.fin).toISOString().slice(0, 10))}
              </span>
            </div>
            <div className="g-units" />
          </div>

          <div className="g-body" style={{ height: `${lignes.hauteur}px`, position: "relative" }}>
            {/* La ligne d'aujourd'hui, quand elle tombe dans la plage. La
                dessiner hors plage la collerait à un bord, où elle mentirait. */}
            {dansLaPlage ? (
              <span
                className="g-today"
                style={{ left: `${x(aujourdhui)}px` }}
                role="img"
                aria-label={t("ganttProjet.aujourdhui")}
              />
            ) : null}

            {groupes.map((g) =>
              g.taches.map((tache) => {
                const debut = jourDe(tache.dateDebut!);
                const fin = jourDe(tache.dateFin!);
                const haut = lignes.positions.get(tache.id) ?? 0;
                const lie = dependances.includes(tache.id);
                const attenue = selection !== null && selection !== tache.id && !lie;

                return (
                  <Button
                    key={tache.id}
                    className={`g-bar${selection === tache.id ? " is-sel" : ""}${
                      attenue ? " is-dim" : ""
                    }`}
                    style={{
                      color: `var(--st-${tache.statut})`,
                      left: `${x(debut)}px`,
                      width: `${Math.max(6, x(fin + JOUR_MS) - x(debut))}px`,
                      top: `${haut + 8}px`,
                    }}
                    aria-pressed={selection === tache.id}
                    aria-label={t("ganttProjet.libelleBarre", {
                      titre: tache.titre,
                      statut: t(`statuts.${tache.statut}`),
                      debut: formaterDate(tache.dateDebut!),
                      fin: formaterDate(tache.dateFin!),
                      avancement: tache.avancement,
                    })}
                    onPress={() => surSelection(selection === tache.id ? null : tache.id)}
                  >
                    <span className="g-bar-fill" style={{ width: `${tache.avancement}%` }} />
                    <span className="g-bar-lab">{tache.titre}</span>
                  </Button>
                );
              }),
            )}

            {/* `Attention` du brief — les flèches n'existent qu'à la sélection. */}
            {selection !== null && dependances.length > 0 ? (
              <Fleches
                selection={selection}
                dependances={dependances}
                positions={lignes.positions}
                taches={taches}
                x={x}
                largeur={largeur}
                hauteur={lignes.hauteur}
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Les flèches de dépendance, en SVG.
 *
 * Elles relient la fin du prérequis au début de la tâche sélectionnée. Un
 * tracé en trois segments plutôt qu'une droite : une diagonale traverse les
 * autres barres et devient impossible à suivre dès qu'il y en a trois.
 */
function Fleches({
  selection,
  dependances,
  positions,
  taches,
  x,
  largeur,
  hauteur,
}: {
  selection: string;
  dependances: string[];
  positions: Map<string, number>;
  taches: apiTaches.LigneTache[];
  x: (ms: number) => number;
  largeur: number;
  hauteur: number;
}) {
  const parId = new Map(taches.map((t) => [t.id, t]));
  const cible = parId.get(selection);
  if (!cible?.dateDebut) return null;

  const yCible = (positions.get(selection) ?? 0) + 17;
  const xCible = x(jourDe(cible.dateDebut));

  return (
    <svg className="g-arrows" width={largeur} height={hauteur} aria-hidden="true">
      {dependances.map((id) => {
        const source = parId.get(id);
        if (!source?.dateFin) return null;
        const ySource = (positions.get(id) ?? 0) + 17;
        const xSource = x(jourDe(source.dateFin) + JOUR_MS);
        const coude = Math.max(xSource + 8, xCible - 12);

        return (
          <g key={id}>
            <path d={`M${xSource},${ySource} H${coude} V${yCible} H${xCible - 6}`} />
            <polygon
              points={`${xCible},${yCible} ${xCible - 6},${yCible - 4} ${xCible - 6},${yCible + 4}`}
            />
          </g>
        );
      })}
    </svg>
  );
}
