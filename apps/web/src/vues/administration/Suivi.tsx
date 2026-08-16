import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button } from "react-aria-components";
import { STATUTS_TACHE, PRIORITES, STATUTS_CONGE, NIVEAUX_COMPETENCE, TYPES_ACTIVITE, CATEGORIES_COMPETENCE } from "@trame/contracts";
import * as api from "../../api/administration.js";
import { ErreurApi } from "../../api/client.js";
import { usePeut } from "../../session/session.js";
import { Chargement, ErreurDeChargement, AccesRefuse } from "../../composants/etats.js";
import { Pastille, AvatarAgent, Barre, useLibelle } from "../../composants/pastilles.js";
import { formaterDate, formaterNombre } from "../../formats.js";
import "../../composants/partages.css";
import "../taches/liste.css";
import "../projets/fiche.css";
import "./suivi.css";

/**
 * Vue 28 — Suivi individuel.
 *
 * **Le sélecteur de période commande les six onglets à la fois**, et le brief
 * exige que « son effet soit évident, et la période active rappelée dans
 * chaque onglet ». D'où le bandeau collant, qui reste visible en défilant.
 *
 * Mais tous les chiffres ne suivent pas la période — et c'est le piège de
 * cette vue. Les heures saisies et les jours de télétravail la suivent ; le
 * solde de congés suit l'année civile, parce qu'un droit à congés ne se
 * découpe pas en trimestres ; les tâches actives valent à l'instant. Chaque
 * chiffre **porte donc son étendue**, écrite à côté de lui. Les afficher sous
 * un même en-tête « cette semaine » donnerait des nombres justes séparément et
 * faux ensemble.
 */

type Onglet = "ensemble" | "taches" | "conges" | "teletravail" | "temps" | "competences";

type Etendue = "periode" | "annee" | "maintenant";

const PERIODES = ["semaine", "mois", "trimestre", "annee", "tout"] as const;
type Periode = (typeof PERIODES)[number];

/** Les bornes d'une période, calculées en UTC comme toutes les dates métier. */
function bornes(periode: Periode): { debut: string; fin: string } {
  const now = new Date();
  const a = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const j = now.getUTCDate();
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  switch (periode) {
    case "semaine": {
      // Semaine ISO : elle commence le lundi.
      const jour = (now.getUTCDay() + 6) % 7;
      return {
        debut: iso(new Date(Date.UTC(a, m, j - jour))),
        fin: iso(new Date(Date.UTC(a, m, j - jour + 6))),
      };
    }
    case "mois":
      return { debut: iso(new Date(Date.UTC(a, m, 1))), fin: iso(new Date(Date.UTC(a, m + 1, 0))) };
    case "trimestre": {
      const t = Math.floor(m / 3) * 3;
      return { debut: iso(new Date(Date.UTC(a, t, 1))), fin: iso(new Date(Date.UTC(a, t + 3, 0))) };
    }
    case "annee":
      return { debut: `${a}-01-01`, fin: `${a}-12-31` };
    case "tout":
      return { debut: "1970-01-01", fin: `${a + 5}-12-31` };
  }
}

export function SuiviIndividuel({ userId }: { userId: string }) {
  const { t } = useTranslation("administration");
  const peut = usePeut();
  const [periode, setPeriode] = useState<Periode>("mois");
  const [onglet, setOnglet] = useState<Onglet>("ensemble");

  const fenetre = useMemo(() => bornes(periode), [periode]);

  const requete = useQuery({
    queryKey: ["suivi", userId, fenetre],
    queryFn: () => api.suivi(userId, fenetre.debut, fenetre.fin),
    enabled: peut("users:read_individual_tracking"),
  });

  // `RG-GEN-06` traite l'action ; ici c'est la page entière. L'état de refus
  // dit ce qui manque sans détailler ce qu'il y a derrière.
  if (!peut("users:read_individual_tracking")) return <AccesRefuse />;

  if (requete.isPending) return <Chargement quoi={t("suivi.leSuivi")} />;
  if (requete.isError) {
    const introuvable = requete.error instanceof ErreurApi && requete.error.statut === 404;
    if (introuvable) {
      return (
        <div className="page">
          <div className="empty empty-large">
            <p>{t("suivi.introuvable")}</p>
          </div>
        </div>
      );
    }
    return <ErreurDeChargement erreur={requete.error} surReessai={() => void requete.refetch()} />;
  }

  const donnees = requete.data;
  const onglets: { cle: Onglet; libelle: string }[] = [
    { cle: "ensemble", libelle: t("suivi.ongletEnsemble") },
    { cle: "taches", libelle: t("suivi.ongletTaches") },
    { cle: "conges", libelle: t("suivi.ongletConges") },
    { cle: "teletravail", libelle: t("suivi.ongletTeletravail") },
    { cle: "temps", libelle: t("suivi.ongletTemps") },
    { cle: "competences", libelle: t("suivi.ongletCompetences") },
  ];

  return (
    <div className="page">
      <Link to="/utilisateurs" className="back-link">
        <span aria-hidden="true">←</span> <span>{t("suivi.retour")}</span>
      </Link>

      <div className="proj-head">
        <AvatarAgent
          prenom={donnees.agent.prenom}
          nom={donnees.agent.nom}
          classe="mav"
        />
        <div className="bloc-etroit">
          <span className="eyebrow">{donnees.agent.role?.nom ?? t("suivi.sansRole")}</span>
          <h1 className="proj-name">
            {donnees.agent.prenom} {donnees.agent.nom}
          </h1>
        </div>
      </div>

      {/* Le bandeau reste visible : sa portée est écrite, pas devinée. */}
      <div className="period-band">
        <span className="eyebrow">{t("suivi.periode")}</span>
        <div className="bascule-vue" role="group" aria-label={t("suivi.periode")}>
          {PERIODES.map((p) => (
            <Button
              key={p}
              className="tab"
              aria-selected={periode === p}
              onPress={() => setPeriode(p)}
            >
              {t(`suivi.periode_${p}`)}
            </Button>
          ))}
        </div>
        <span className="period-range">
          {formaterDate(donnees.periode.debut)} → {formaterDate(donnees.periode.fin)}
        </span>
        <span className="period-note">{t("suivi.porteeDuBandeau")}</span>
      </div>

      <nav className="tabbar" aria-label={t("suivi.sections")}>
        {onglets.map((o) => (
          <a
            key={o.cle}
            href={`#${o.cle}`}
            className={o.cle === onglet ? "is-active" : ""}
            aria-current={o.cle === onglet ? "page" : undefined}
            onClick={(e) => {
              e.preventDefault();
              setOnglet(o.cle);
            }}
          >
            {o.libelle}
          </a>
        ))}
      </nav>

      {onglet === "ensemble" ? <Ensemble donnees={donnees} /> : null}
      {onglet === "taches" ? <OngletTaches donnees={donnees} /> : null}
      {onglet === "conges" ? <OngletConges donnees={donnees} /> : null}
      {onglet === "teletravail" ? <OngletTeletravail donnees={donnees} /> : null}
      {onglet === "temps" ? <OngletTemps donnees={donnees} /> : null}
      {onglet === "competences" ? <OngletCompetences donnees={donnees} /> : null}
    </div>
  );
}

/** L'étendue d'un chiffre, écrite à côté de lui. */
function Etendue({ nature }: { nature: Etendue }) {
  const { t } = useTranslation("administration");
  const classe =
    nature === "periode" ? "scope is-period" : nature === "annee" ? "scope is-year" : "scope is-now";
  return <span className={classe}>{t(`suivi.etendue_${nature}`)}</span>;
}

function Indicateur({
  libelle,
  valeur,
  etendue,
}: {
  libelle: string;
  valeur: string | number;
  etendue: Etendue;
}) {
  return (
    <div className="kpi">
      <div className="kpi-head">
        <span className="eyebrow">{libelle}</span>
        <Etendue nature={etendue} />
      </div>
      <p className="kpi-val">{valeur}</p>
    </div>
  );
}

function Ensemble({ donnees }: { donnees: api.Suivi }) {
  const { t } = useTranslation("administration");
  const s = donnees.statistiques;

  return (
    <>
      <div className="kpi-grid">
        <Indicateur libelle={t("suivi.tachesActives")} valeur={s.tachesActives} etendue="maintenant" />
        <Indicateur
          libelle={t("suivi.tachesTerminees")}
          valeur={s.tachesTerminees}
          etendue="maintenant"
        />
        {/* Un droit à congés ne se découpe pas en trimestres : l'étendue est
            l'année civile, et c'est écrit. */}
        <Indicateur libelle={t("suivi.congesPris")} valeur={formaterNombre(s.congesAnnee, 1)} etendue="annee" />
        <Indicateur
          libelle={t("suivi.joursTeletravail")}
          valeur={s.joursTeletravail}
          etendue="periode"
        />
        <Indicateur
          libelle={t("suivi.heuresSaisies")}
          valeur={formaterNombre(s.heuresSaisies, 1)}
          etendue="periode"
        />
        <Indicateur libelle={t("suivi.projetsActifs")} valeur={s.projetsActifs} etendue="maintenant" />
      </div>

      <section className="panel">
        <div className="panel-head">
          <span className="panel-title">{t("suivi.informations")}</span>
        </div>
        <dl className="side-dl">
          <dt>{t("suivi.role")}</dt>
          <dd className={donnees.agent.role ? "" : "is-none"}>
            {donnees.agent.role?.nom ?? t("suivi.sansRole")}
          </dd>
          <dt>{t("suivi.departement")}</dt>
          <dd className={donnees.agent.departement ? "" : "is-none"}>
            {donnees.agent.departement?.nom ?? t("suivi.sansDepartement")}
          </dd>
          <dt>{t("suivi.services")}</dt>
          <dd className={donnees.agent.services.length > 0 ? "" : "is-none"}>
            {donnees.agent.services.length > 0
              ? donnees.agent.services.map((x) => x.nom).join(", ")
              : t("suivi.sansService")}
          </dd>
          <dt>{t("suivi.email")}</dt>
          <dd>{donnees.agent.email}</dd>
          <dt>{t("suivi.membreDepuis")}</dt>
          <dd>{formaterDate(donnees.agent.creeLe)}</dd>
          <dt>{t("suivi.statut")}</dt>
          <dd>{donnees.agent.actif ? t("suivi.actif") : t("suivi.inactif")}</dd>
        </dl>
      </section>
    </>
  );
}

function OngletTaches({ donnees }: { donnees: api.Suivi }) {
  const { t } = useTranslation("administration");

  if (donnees.taches.length === 0) {
    return (
      <div className="empty empty-large">
        <p>{t("suivi.videTaches")}</p>
      </div>
    );
  }

  return (
    <div className="tlist">
      <div className="ind-grid ind-head" aria-hidden="true">
        <span>{t("suivi.colTache")}</span>
        <span>{t("suivi.colProjet")}</span>
        <span>{t("suivi.colStatut")}</span>
        <span>{t("suivi.colAvancement")}</span>
        <span>{t("suivi.colEcheance")}</span>
      </div>
      {donnees.taches.map((x) => (
        <div className="ind-grid ind-row" key={x.id}>
          <span className="lnk-n">{x.titre}</span>
          <span className="us-org">{x.project?.nom ?? t("suivi.horsProjet")}</span>
          <span className="ligne-actions">
            <Pastille code={x.statut} vocabulaire={STATUTS_TACHE} />
            <Pastille code={x.priorite} vocabulaire={PRIORITES} />
          </span>
          <Barre valeur={x.avancement} libelle={t("suivi.avancementDe", { titre: x.titre })} />
          <span className="t2-when">
            {x.dateFin ? formaterDate(x.dateFin) : t("suivi.sansEcheance")}
          </span>
        </div>
      ))}
    </div>
  );
}

function OngletConges({ donnees }: { donnees: api.Suivi }) {
  const { t } = useTranslation("administration");

  if (donnees.conges.length === 0) {
    return (
      <div className="empty empty-large">
        <p>{t("suivi.videConges")}</p>
      </div>
    );
  }

  return (
    <>
      <div className="alert alert-neutral" role="note">
        <span className="alert-icon" aria-hidden="true">
          →
        </span>
        {/*
          Une ANNÉE ne se formate pas comme un nombre : `{annee, number}`
          rendait « l'année 2 026 » en français, séparateur de milliers
          compris. Elle est interpolée telle quelle.
        */}
        <span>{t("suivi.congesSurAnnee", { annee: String(donnees.periode.annee) })}</span>
      </div>
      <div className="tlist">
        {donnees.conges.map((c) => (
          <div className="ind-grid ind-row" key={c.id}>
            <span className="lnk-n">{c.type.nom}</span>
            <span className="lv-when">
              {t("suivi.duAu", {
                debut: formaterDate(c.dateDebut),
                fin: formaterDate(c.dateFin),
              })}
            </span>
            <Pastille code={c.statut} vocabulaire={STATUTS_CONGE} />
            <span className="lv-days">{formaterNombre(Number(c.joursOuvres), 1)}</span>
            <span />
          </div>
        ))}
      </div>
    </>
  );
}

function OngletTeletravail({ donnees }: { donnees: api.Suivi }) {
  const { t } = useTranslation("administration");

  if (donnees.teletravail.length === 0) {
    return (
      <div className="empty empty-large">
        <p>{t("suivi.videTeletravail")}</p>
      </div>
    );
  }

  return (
    <div className="tlist">
      {donnees.teletravail.map((j) => (
        <div className="ind-grid ind-row" key={j.date}>
          <span className="lnk-n">{formaterDate(j.date)}</span>
          <span className="us-org">{t("suivi.teletravail")}</span>
          <span>
            {j.issuDeRegle ? <span className="tt-mark">{t("suivi.recurrent")}</span> : null}
          </span>
          <span />
          <span />
        </div>
      ))}
    </div>
  );
}

function OngletTemps({ donnees }: { donnees: api.Suivi }) {
  const { t } = useTranslation("administration");
  const libelle = useLibelle();

  if (donnees.temps.length === 0) {
    return (
      <div className="empty empty-large">
        <p>{t("suivi.videTemps")}</p>
      </div>
    );
  }

  /** La répartition par projet : le chiffre qu'on vient chercher en entretien. */
  const parProjet = donnees.temps.reduce<Map<string, number>>((acc, e) => {
    const cle = e.project?.nom ?? t("suivi.horsProjet");
    acc.set(cle, (acc.get(cle) ?? 0) + Number(e.heures));
    return acc;
  }, new Map());

  return (
    <>
      <section className="panel panel-espace">
        <div className="panel-head">
          <span className="panel-title">{t("suivi.repartitionProjet")}</span>
          <Etendue nature="periode" />
        </div>
        <div className="panel-body">
          {[...parProjet.entries()]
            .sort(([, a], [, b]) => b - a)
            .map(([nom, heures]) => (
              <p className="cb-line" key={nom}>
                <span>{nom}</span>
                <b>{t("heures", { n: heures })}</b>
              </p>
            ))}
        </div>
      </section>

      <div className="tlist">
        {donnees.temps.map((e) => (
          <div className="ind-grid ind-row" key={e.id}>
            <span className="lnk-n">{e.description ?? t("suivi.sansDescription")}</span>
            <span className="us-org">{e.project?.nom ?? t("suivi.horsProjet")}</span>
            <span className="us-org">{libelle(e.typeActivite, TYPES_ACTIVITE)}</span>
            <span className="te-h">{t("heures", { n: Number(e.heures) })}</span>
            <span className="t2-when">{formaterDate(e.date)}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function OngletCompetences({ donnees }: { donnees: api.Suivi }) {
  const { t } = useTranslation("administration");
  const libelle = useLibelle();

  if (donnees.competences.length === 0) {
    return (
      <div className="empty empty-large">
        <p>{t("suivi.videCompetences")}</p>
      </div>
    );
  }

  return (
    <div className="tlist">
      {donnees.competences.map((c) => (
        <div className="ind-grid ind-row" key={c.id}>
          <span className="lnk-n">{c.nom}</span>
          <span className="us-org">{libelle(c.categorie, CATEGORIES_COMPETENCE)}</span>
          <span className="us-org">{libelle(c.niveau, NIVEAUX_COMPETENCE)}</span>
          <span />
          <span />
        </div>
      ))}
    </div>
  );
}
