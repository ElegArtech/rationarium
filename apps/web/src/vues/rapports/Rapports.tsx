import { useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Button, Menu, MenuItem, MenuTrigger, Popover, Tab, TabList, TabPanel, Tabs } from "react-aria-components";
import * as api from "../../api/rapports.js";
import { usePeut } from "../../session/session.js";
import { Chargement, ErreurDeChargement, AccesRefuse } from "../../composants/etats.js";
import { formaterDate, formaterNombre } from "../../formats.js";
import { GanttPortefeuille } from "./GanttPortefeuille.js";
import "../../composants/partages.css";
import "./rapports.css";

/**
 * Vue 30 — rapports et analytics.
 *
 * **Inès ouvre cette page une fois par mois et doit comprendre en trente
 * secondes.** Tout est ordonné pour ça, et l'ordre n'est pas négociable :
 *
 * 1. l'**alerte** — ce qui demande une action ;
 * 2. la **santé du portefeuille** — l'état d'ensemble ;
 * 3. le **détail**, dans le second onglet, pour qui veut creuser.
 *
 * Chaque graphique porte **un état vide rédigé** (`RG-RPT-06`) : une zone
 * blanche se prend pour un défaut de chargement, et on la signale au support
 * au lieu d'en tirer la conclusion — qu'il n'y a rien à voir.
 *
 * Aucune bibliothèque de graphiques (`cadrage/03 § 4, D12`). Les barres sont
 * des `<div>` en pourcentage, la courbe un `<svg>` calculé.
 */

const PERIODES = ["semaine", "mois", "trimestre", "annee"] as const;

export function Rapports() {
  const { t } = useTranslation("rapports");
  const peut = usePeut();
  const [periode, setPeriode] = useState<api.Periode>("mois");

  const requete = useQuery({
    queryKey: ["rapports", periode],
    queryFn: () => api.vueEnsemble({ periode }),
    enabled: peut("reports:read"),
  });

  if (!peut("reports:read")) return <AccesRefuse />;

  return (
    <div className="page">
      <div className="pl-toolbar">
        <div>
          <span className="eyebrow">{t("surtitre")}</span>
          <h1 className="h1 titre-vue">{t("titre")}</h1>
        </div>
      </div>

      <div className="rep-bar">
        <div className="seg" role="group" aria-label={t("periode.groupe")}>
          {PERIODES.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={p === periode}
              onClick={() => setPeriode(p)}
            >
              {t(`periode.${p}`)}
            </button>
          ))}
        </div>

        <Button className="chip-btn" onPress={() => void requete.refetch()}>
          {t("actions.actualiser")}
        </Button>

        {peut("reports:export") ? (
          <MenuTrigger>
            <Button className="chip-btn">{t("actions.exporter")}</Button>
            <Popover>
              <Menu className="pop pop-sm">
                {/* L'impression du navigateur produit le PDF : un second chemin
                    de mise en page ferait diverger deux rendus du même contenu.
                    Le lot L-27 porte la feuille d'impression. */}
                <MenuItem id="pdf" onAction={() => window.print()}>
                  {t("actions.exportPdf")}
                </MenuItem>
                <MenuItem id="csv" href={api.adresseExport({ periode }, "csv")}>
                  {t("actions.exportCsv")}
                </MenuItem>
                <MenuItem id="json" href={api.adresseExport({ periode }, "json")}>
                  {t("actions.exportJson")}
                </MenuItem>
              </Menu>
            </Popover>
          </MenuTrigger>
        ) : null}
      </div>

      {requete.isPending ? <Chargement quoi={t("lesDonnees")} /> : null}
      {requete.isError ? (
        <ErreurDeChargement erreur={requete.error} surReessai={() => void requete.refetch()} />
      ) : null}

      {requete.data ? <Contenu donnees={requete.data} periode={periode} /> : null}
    </div>
  );
}

function Contenu({ donnees, periode }: { donnees: api.VueEnsemble; periode: api.Periode }) {
  const { t } = useTranslation("rapports");

  return (
    <>
      {/* `EX-RPT-12` — l'alerte est en tête, et elle dit quoi faire. Un
          compteur sans suite laisse chercher où agir. */}
      {donnees.alerte.tachesEnRetard > 0 ? (
        <div className="alert alert-warn" role="status">
          <span className="alert-icon" aria-hidden="true">
            !
          </span>
          <span>
            <strong>{t("alerte.titre")}</strong>{" "}
            {t("alerte.texte", { n: donnees.alerte.tachesEnRetard })}
          </span>
        </div>
      ) : null}

      <Tabs>
        <TabList className="tabs" aria-label={t("onglets.groupe")}>
          <Tab className="tab" id="ensemble">
            {t("onglets.ensemble")}
          </Tab>
          <Tab className="tab" id="analytics">
            {t("onglets.analytics")}
          </Tab>
          <Tab className="tab" id="gantt">
            {t("onglets.gantt")}
          </Tab>
        </TabList>

        <TabPanel id="ensemble">
          <SanteDuPortefeuille lignes={donnees.sante} />
          <Progression progression={donnees.progression} />
        </TabPanel>

        <TabPanel id="analytics">
          <Charge charge={donnees.charge} />
          <Tendance tendance={donnees.tendance} />
          <Jalons jalons={donnees.jalons} />
          <Repartitions repartitions={donnees.repartitions} />
          <Activite activite={donnees.activite} />
        </TabPanel>

        <TabPanel id="gantt">
          <GanttPortefeuille periode={periode} />
        </TabPanel>
      </Tabs>
    </>
  );
}

/** `EX-RPT-06` — la santé, calculée, avec son détail. */
function SanteDuPortefeuille({ lignes }: { lignes: api.SanteLigne[] }) {
  const { t } = useTranslation("rapports");

  if (lignes.length === 0) {
    return (
      <section className="panel">
        <div className="panel-head">
          <span className="panel-title">{t("sante.titre")}</span>
        </div>
        <div className="empty">
          <p>{t("sante.vide")}</p>
          <small>{t("sante.videAide")}</small>
        </div>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <span className="panel-title">{t("sante.titre")}</span>
        <span className="grp-meta">{t("sante.compte", { n: lignes.length })}</span>
      </div>
      <div className="panel-body is-flush">
        <div className="health-grid health-head" aria-hidden="true">
          <span>{t("sante.colProjet")}</span>
          <span>{t("sante.colCompletion")}</span>
          <span>{t("sante.colJalons")}</span>
          <span>{t("sante.colActives")}</span>
          <span>{t("sante.colSante")}</span>
          <span>{t("sante.colDetail")}</span>
        </div>

        {lignes.map((l) => (
          <div
            className={`health-grid health-row${
              l.sante === "critical" ? " is-crit" : l.sante === "warning" ? " is-warn" : ""
            }`}
            key={l.id}
          >
            <div className="bloc-etroit">
              <p className="hp-n">{l.nom}</p>
              <span className="hp-s">
                {l.chef ? `${l.chef.prenom} ${l.chef.nom}` : t("sante.nonAssigne")}
                {l.service ? ` · ${l.service}` : ""}
              </span>
            </div>

            <span className="hbar-t" role="img" aria-label={t("sante.completionDe", { nom: l.nom, n: l.completion })}>
              <i style={{ width: `${l.completion}%` }} />
            </span>

            <span className="hbar-v">
              {l.jalonsAVenir}/{l.jalons}
            </span>
            <span className="hbar-v">{l.tachesActives}</span>

            {/* La pastille est doublée du filet de bord : la couleur seule ne
                porte jamais une information à elle seule. */}
            <span
              className="pill"
              style={{
                color:
                  l.sante === "critical"
                    ? "var(--st-blocked)"
                    : l.sante === "warning"
                      ? "var(--st-review)"
                      : "var(--st-done)",
              }}
            >
              {t(`santes.${l.sante}`)}
            </span>

            <span className="hp-detail">
              {t("sante.restantes", { n: l.restantes })}
              {l.enRetard > 0 ? (
                <>
                  {" · "}
                  <b>{t("sante.enRetard", { n: l.enRetard })}</b>
                </>
              ) : null}
              {" · "}
              {t("sante.finLe", { date: formaterDate(l.dateFin) })}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

/** `EX-RPT-04`, `RG-RPT-02` — la progression, plafonnée et annoncée. */
function Progression({ progression }: { progression: api.VueEnsemble["progression"] }) {
  const { t } = useTranslation("rapports");

  return (
    <section className="panel">
      <div className="panel-head">
        <span className="panel-title">{t("progression.titre")}</span>
        <a className="chip-btn" href="/projets">
          {t("progression.tousLesProjets")}
        </a>
      </div>
      <div className="panel-body">
        {progression.projets.length === 0 ? (
          <div className="empty">
            <p>{t("progression.vide")}</p>
            <small>{t("progression.videAide")}</small>
          </div>
        ) : (
          progression.projets.map((p) => (
            <div className="hbar" key={p.id}>
              <span className="hbar-n">{p.nom}</span>
              <span
                className="hbar-t"
                role="img"
                aria-label={t("progression.de", { nom: p.nom, n: p.progression })}
              >
                <i style={{ width: `${p.progression}%` }} />
              </span>
              <span className="hbar-v">{p.progression} %</span>
            </div>
          ))
        )}
      </div>
      {/* Une liste coupée en silence fait conclure qu'il n'y a que dix projets. */}
      {progression.tronque ? (
        <p className="trunc">
          <span aria-hidden="true">▲</span>
          {t("progression.tronque", { n: progression.plafond, total: progression.total })}
        </p>
      ) : null}
    </section>
  );
}

/** `EX-RPT-05`, `RG-RPT-05` — la charge, et l'écart à la moyenne. */
function Charge({ charge }: { charge: api.VueEnsemble["charge"] }) {
  const { t } = useTranslation("rapports");
  const maximum = Math.max(1, ...charge.agents.map((a) => a.taches));

  return (
    <section className="panel">
      <div className="panel-head">
        <span className="panel-title">{t("charge.titre")}</span>
        {charge.surcharges > 0 ? (
          <span className="pill" style={{ color: "var(--st-review)" }}>
            {t("charge.surchargeDetectee", { n: charge.surcharges })}
          </span>
        ) : null}
      </div>
      <div className="panel-body">
        {charge.agents.length === 0 ? (
          <div className="empty">
            <p>{t("charge.vide")}</p>
            <small>{t("charge.videAide")}</small>
          </div>
        ) : (
          <>
            {charge.agents.map((a) => (
              <div className={`hbar${a.surcharge ? " is-over" : ""}`} key={a.id}>
                <span className="hbar-n">{a.nom}</span>
                <span
                  className="hbar-t"
                  role="img"
                  aria-label={t(a.surcharge ? "charge.libelleSurcharge" : "charge.libelle", {
                    nom: a.nom,
                    n: a.taches,
                    moyenne: charge.moyenne,
                  })}
                >
                  <i style={{ width: `${(a.taches / maximum) * 100}%` }} />
                  {/* La ligne de moyenne : c'est elle qui donne son sens au
                      mot « surcharge ». Sans elle, dix tâches ne disent rien. */}
                  <span
                    className="avg-line"
                    style={{ left: `${(charge.moyenne / maximum) * 100}%` }}
                    aria-hidden="true"
                  />
                </span>
                <span className="hbar-v">{a.taches}</span>
              </div>
            ))}
            <p className="avg-cap">
              <span className="avg-sw" aria-hidden="true" />
              {t("charge.moyenne", { n: charge.moyenne })}
            </p>
          </>
        )}
      </div>
    </section>
  );
}

/** `EX-RPT-07`, `RG-RPT-03`, `RG-RPT-04` — la tendance, ou son absence. */
function Tendance({ tendance }: { tendance: api.VueEnsemble["tendance"] }) {
  const { t } = useTranslation("rapports");

  return (
    <section className="panel">
      <div className="panel-head">
        <span className="panel-title">{t("tendance.titre")}</span>
        {tendance.stagnation ? (
          <span className="pill" style={{ color: "var(--st-review)" }}>
            {t("tendance.stagnation")}
          </span>
        ) : null}
      </div>
      <div className="panel-body">
        {/* `RG-RPT-03` — une courbe lissée sur trois points est le plus
            efficace des mensonges : elle a l'air d'une mesure. */}
        {!tendance.historiqueSuffisant ? (
          <div className="empty">
            <p>{t("tendance.historiqueCourt")}</p>
            <small>{t("tendance.historiqueCourtAide")}</small>
          </div>
        ) : (
          <Courbe points={tendance.points} moyenne={tendance.moyenne} />
        )}
      </div>
    </section>
  );
}

/**
 * La courbe, en SVG calculé.
 *
 * Elle porte un `role="img"` et un libellé qui **résume la tendance en mots** :
 * un tracé n'est pas lisible autrement, et le résumé vaut aussi pour qui lit
 * vite.
 */
function Courbe({ points, moyenne }: { points: { date: string; progression: number }[]; moyenne: number }) {
  const { t } = useTranslation("rapports");
  const largeur = 640;
  const hauteur = 180;
  const marge = { haut: 12, bas: 26, gauche: 34, droite: 12 };

  const x = (i: number) =>
    marge.gauche +
    (points.length <= 1
      ? 0
      : (i / (points.length - 1)) * (largeur - marge.gauche - marge.droite));
  const y = (v: number) =>
    hauteur - marge.bas - (v / 100) * (hauteur - marge.haut - marge.bas);

  const trace = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.progression)}`).join(" ");
  const premier = points[0]?.progression ?? 0;
  const dernier = points[points.length - 1]?.progression ?? 0;

  return (
    <svg
      className="chart"
      viewBox={`0 0 ${largeur} ${hauteur}`}
      role="img"
      aria-label={t("tendance.libelle", {
        debut: premier,
        fin: dernier,
        points: points.length,
      })}
    >
      {[0, 25, 50, 75, 100].map((v) => (
        <g key={v}>
          <line className="grid-l" x1={marge.gauche} y1={y(v)} x2={largeur - marge.droite} y2={y(v)} />
          <text className="axis-t" x={4} y={y(v) + 3}>
            {v}
          </text>
        </g>
      ))}

      <line
        className="serie serie-avg"
        x1={marge.gauche}
        y1={y(moyenne)}
        x2={largeur - marge.droite}
        y2={y(moyenne)}
      />

      <path className="serie" d={trace} style={{ stroke: "var(--accent)" }} />

      {points.map((p, i) => (
        <circle
          className="dot"
          key={p.date}
          cx={x(i)}
          cy={y(p.progression)}
          r={3}
          style={{ fill: "var(--accent)" }}
        />
      ))}

      {points.map((p, i) =>
        i % Math.max(1, Math.ceil(points.length / 6)) === 0 ? (
          <text className="axis-t" key={`l-${p.date}`} x={x(i)} y={hauteur - 8} textAnchor="middle">
            {p.date.slice(5)}
          </text>
        ) : null,
      )}
    </svg>
  );
}

/** `EX-RPT-08` — la complétion des jalons. */
function Jalons({ jalons }: { jalons: api.VueEnsemble["jalons"] }) {
  const { t } = useTranslation("rapports");

  return (
    <section className="panel">
      <div className="panel-head">
        <span className="panel-title">{t("jalons.titre")}</span>
      </div>
      <div className="panel-body">
        {jalons.total === 0 ? (
          <div className="empty">
            <p>{t("jalons.vide")}</p>
            <small>{t("jalons.videAide")}</small>
          </div>
        ) : (
          <>
            <p className="mile-sum">
              <span className="mile-big">{jalons.aTemps}</span>
              <span className="kpi-sub">{t("jalons.surEchus", { n: jalons.echus })}</span>
            </p>
            <div className="pills">
              <span className="pill" style={{ color: "var(--st-done)" }}>
                {t("jalons.aTemps", { n: jalons.aTemps })}
              </span>
              <span className="pill" style={{ color: "var(--st-blocked)" }}>
                {t("jalons.enRetard", { n: jalons.enRetard })}
              </span>
              <span className="pill" style={{ color: "var(--muted)" }}>
                {t("jalons.aVenir", { n: jalons.aVenir })}
              </span>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

/** `EX-RPT-09` — les répartitions par priorité et par statut. */
function Repartitions({ repartitions }: { repartitions: api.VueEnsemble["repartitions"] }) {
  const { t } = useTranslation("rapports");

  const bloc = (
    titre: string,
    lignes: { cle: string; nombre: number }[],
    prefixe: string,
    couleurs: Record<string, string>,
  ) => {
    const total = lignes.reduce((n, l) => n + l.nombre, 0);
    return (
      <section className="panel" key={titre}>
        <div className="panel-head">
          <span className="panel-title">{titre}</span>
          <span className="grp-meta">{t("repartitions.surActives", { n: total })}</span>
        </div>
        <div className="panel-body">
          {total === 0 ? (
            <div className="empty">
              <p>{t("repartitions.vide")}</p>
              <small>{t("repartitions.videAide")}</small>
            </div>
          ) : (
            lignes.map((l) => (
              <div className="hbar" key={l.cle}>
                <span className="hbar-n">{t(`${prefixe}.${l.cle}`)}</span>
                <span
                  className="hbar-t"
                  role="img"
                  aria-label={t("repartitions.libelle", {
                    quoi: t(`${prefixe}.${l.cle}`),
                    n: l.nombre,
                    total,
                  })}
                >
                  <i
                    style={
                      {
                        width: `${(l.nombre / total) * 100}%`,
                        background: couleurs[l.cle] ?? "var(--accent)",
                      } as CSSProperties
                    }
                  />
                </span>
                <span className="hbar-v">{l.nombre}</span>
              </div>
            ))
          )}
        </div>
      </section>
    );
  };

  return (
    <>
      {bloc(t("repartitions.parPriorite"), repartitions.priorite, "priorites", {
        critical: "var(--st-blocked)",
        high: "var(--st-review)",
        normal: "var(--accent)",
        low: "var(--muted)",
      })}
      {bloc(t("repartitions.parStatut"), repartitions.statut, "statuts", {
        todo: "var(--st-todo)",
        doing: "var(--st-doing)",
        review: "var(--st-review)",
        blocked: "var(--st-blocked)",
        done: "var(--st-done)",
      })}
    </>
  );
}

/** `EX-RPT-10` — l'activité récente, et son interprétation. */
function Activite({ activite }: { activite: api.VueEnsemble["activite"] }) {
  const { t } = useTranslation("rapports");

  return (
    <section className="panel">
      <div className="panel-head">
        <span className="panel-title">{t("activite.titre")}</span>
        <span className="grp-meta">{t("activite.periode")}</span>
      </div>
      <div className="panel-body">
        <div className="act3">
          <div className="kpi">
            <span className="eyebrow">{t("activite.terminees")}</span>
            <p className="kpi-val">{activite.terminees}</p>
          </div>
          <div className="kpi">
            <span className="eyebrow">{t("activite.creees")}</span>
            <p className="kpi-val">{activite.creees}</p>
          </div>
          <div className={`kpi${activite.passeesEnRetard > 0 ? " is-alert" : ""}`}>
            <span className="eyebrow">{t("activite.passeesEnRetard")}</span>
            <p className="kpi-val">{activite.passeesEnRetard}</p>
          </div>
        </div>

        {/* Le ratio seul ne dit rien à qui ne le manipule pas tous les jours.
            « Le backlog grossit » se comprend en une seconde. */}
        {activite.ratio === null ? (
          <div className="empty">
            <p>{t("activite.vide")}</p>
            <small>{t("activite.videAide")}</small>
          </div>
        ) : (
          <p
            className="ratio-box"
            style={{
              color: activite.interpretation === "resorbe" ? "var(--st-done)" : "var(--st-review)",
            }}
          >
            {/* `RG-GEN-09` — le nombre suit le paramétrage : « 0,4 » en
                français, « 0.4 » en anglais. Le rendre brut le laisserait en
                notation anglaise partout. */}
            <span className="ratio-v">{formaterNombre(activite.ratio, 2)}</span>
            <span>
              <span className="ratio-t">{t("activite.ratio")}</span>
              <span className="ratio-d">
                {t(`activite.${activite.interpretation === "resorbe" ? "resorbe" : "grossit"}`)}
              </span>
            </span>
          </p>
        )}
      </div>
    </section>
  );
}
