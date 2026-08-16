import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "react-aria-components";
import * as api from "../../api/occupations.js";
import { messageErreur } from "../../api/erreurs.js";
import { usePeut } from "../../session/session.js";
import { Chargement, ErreurDeChargement } from "../../composants/etats.js";
import { Fenetre } from "../../composants/fenetre.js";
import { useMessages } from "../../composants/messages.js";
import { formaterDate, formaterDateLongue } from "../../formats.js";
import "../../composants/partages.css";
import "../taches/liste.css";
import "./teletravail.css";

/**
 * Vue 20 — Télétravail.
 *
 * **Cinq apparences sur une même case.** Le brief le pose en point
 * d'attention : télétravail, bureau déclaré, non déclaré, week-end, plus le
 * qualificatif « issu d'une règle ». Les quatre premiers s'excluent ; le
 * cinquième se surajoute. Les confondre reviendrait à ne plus distinguer
 * « je n'ai rien dit » de « j'ai dit que je serais au bureau ».
 *
 * **La couleur ne porte jamais seule.** Chaque case déclarée porte aussi une
 * étiquette écrite, et le libellé accessible du bouton dit l'état en toutes
 * lettres — une grille qui ne parlerait qu'en couleur serait muette pour qui
 * ne la voit pas.
 */

const JOURS_SEMAINE = [1, 2, 3, 4, 5, 6, 0];

export function Teletravail() {
  const { t } = useTranslation("occupations");
  const peut = usePeut();
  const client = useQueryClient();
  const annoncer = useMessages();
  const { t: tErreurs } = useTranslation("erreurs");
  const [reglesOuvertes, setReglesOuvertes] = useState(false);
  const [mois, setMois] = useState(() => {
    const d = new Date();
    return { annee: d.getUTCFullYear(), mois: d.getUTCMonth() };
  });

  const debut = new Date(Date.UTC(mois.annee, mois.mois, 1)).toISOString().slice(0, 10);
  const fin = new Date(Date.UTC(mois.annee, mois.mois + 1, 0)).toISOString().slice(0, 10);

  const requete = useQuery({
    queryKey: ["teletravail", debut, fin],
    queryFn: () => api.planningTeletravail(debut, fin),
  });

  const bascule = useMutation({
    mutationFn: ({ date, etat }: { date: string; etat: string }) =>
      api.basculerTeletravail(date, etat),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["teletravail"] }),
    onError: (e) => annoncer("err", messageErreur(e, tErreurs, t("teletravail.echecBascule"))),
  });

  const parDate = useMemo(
    () => new Map((requete.data ?? []).map((j) => [j.date.slice(0, 10), j])),
    [requete.data],
  );
  const nbTeletravail = (requete.data ?? []).filter((j) => j.etat === "telework").length;

  const premier = new Date(Date.UTC(mois.annee, mois.mois, 1));
  const decalage = (premier.getUTCDay() + 6) % 7;
  const nbJours = new Date(Date.UTC(mois.annee, mois.mois + 1, 0)).getUTCDate();
  const aujourdhui = new Date().toISOString().slice(0, 10);

  const modifiable = peut("telework:create");

  return (
    <div className="page">
      <div className="pl-toolbar">
        <div>
          <span className="eyebrow">{t("teletravail.surtitre")}</span>
          <h1 className="h1 titre-vue">{t("teletravail.titre")}</h1>
          <p className="lede">{t("teletravail.compte", { n: nbTeletravail })}</p>
        </div>
        {peut("telework:manage_rules") ? (
          <div className="pl-toolbar-fin">
            <Button className="btn btn-primary" onPress={() => setReglesOuvertes(true)}>
              {t("teletravail.configurerJoursFixes")}
            </Button>
          </div>
        ) : null}
      </div>

      <div className="filters">
        <div className="pl-nav" role="group" aria-label={t("teletravail.navigationMois")}>
          <Button
            className="nav-sq"
            onPress={() =>
              setMois((m) =>
                m.mois === 0 ? { annee: m.annee - 1, mois: 11 } : { ...m, mois: m.mois - 1 },
              )
            }
            aria-label={t("teletravail.moisPrecedent")}
          >
            <span aria-hidden="true">‹</span>
          </Button>
          <span className="pl-period">{formaterDateLongue(debut).replace(/^\d+\s/, "")}</span>
          <Button
            className="nav-sq"
            onPress={() =>
              setMois((m) =>
                m.mois === 11 ? { annee: m.annee + 1, mois: 0 } : { ...m, mois: m.mois + 1 },
              )
            }
            aria-label={t("teletravail.moisSuivant")}
          >
            <span aria-hidden="true">›</span>
          </Button>
        </div>
      </div>

      {/* L'explication est dans le flux, pas en aide au survol : le geste de
          bascule n'est deviné par personne la première fois. */}
      <div className="alert alert-neutral" role="note">
        <span className="alert-icon" aria-hidden="true">
          ?
        </span>
        <span>{t("teletravail.commentCaMarche")}</span>
      </div>

      {requete.isPending ? <Chargement quoi={t("teletravail.lePlanning")} /> : null}
      {requete.isError ? (
        <ErreurDeChargement erreur={requete.error} surReessai={() => void requete.refetch()} />
      ) : null}

      {requete.data ? (
        <section className="panel">
          <div className="tt-cal">
            {["lun", "mar", "mer", "jeu", "ven", "sam", "dim"].map((j) => (
              <div className="tt-dow" key={j}>
                {t(`jours.${j}`)}
              </div>
            ))}

            {Array.from({ length: decalage }, (_, i) => (
              <div className="tt-cell is-out" key={`vide-${i}`} />
            ))}

            {Array.from({ length: nbJours }, (_, i) => {
              const numero = i + 1;
              const date = `${mois.annee}-${String(mois.mois + 1).padStart(2, "0")}-${String(numero).padStart(2, "0")}`;
              const jour = parDate.get(date);
              const jourSemaine = new Date(`${date}T00:00:00.000Z`).getUTCDay();
              const weekEnd = jourSemaine === 0 || jourSemaine === 6;
              const etat = jour?.etat ?? "none";

              const classes = [
                "tt-cell",
                weekEnd ? "is-we" : "",
                etat === "telework" ? "is-tt" : "",
                etat === "office" ? "is-office" : "",
                date === aujourdhui ? "is-today" : "",
              ]
                .filter(Boolean)
                .join(" ");

              const libelleEtat = t(`teletravail.etat_${etat}`);

              if (weekEnd) {
                return (
                  <div className={classes} key={date}>
                    <span className="tt-n">{numero}</span>
                  </div>
                );
              }

              return (
                <Button
                  key={date}
                  className={classes}
                  isDisabled={!modifiable}
                  // L'état est dit en toutes lettres, pas seulement peint.
                  aria-label={t("teletravail.caseLibelle", {
                    date: formaterDate(date),
                    etat: libelleEtat,
                  })}
                  onPress={() =>
                    bascule.mutate({
                      date,
                      etat: etat === "telework" ? "none" : "telework",
                    })
                  }
                >
                  <span className="tt-n">{numero}</span>
                  {etat === "telework" ? (
                    <span className="tt-tag is-tt">{t("teletravail.etat_telework")}</span>
                  ) : null}
                  {etat === "office" ? (
                    <span className="tt-tag is-office">{t("teletravail.etat_office")}</span>
                  ) : null}
                  {jour?.issuDeRegle ? (
                    <span className="tt-mark">
                      <span aria-hidden="true">↻</span> {t("teletravail.recurrent")}
                    </span>
                  ) : null}
                </Button>
              );
            })}
          </div>

          <div className="tt-legend">
            <span className="tt-l">
              <span className="tt-sw is-tt" aria-hidden="true" />
              {t("teletravail.etat_telework")}
            </span>
            <span className="tt-l">
              <span className="tt-sw is-office" aria-hidden="true" />
              {t("teletravail.etat_office")}
            </span>
            <span className="tt-l">
              <span className="tt-sw is-none" aria-hidden="true" />
              {t("teletravail.etat_none")}
            </span>
            <span className="tt-l">
              <span className="tt-sw is-we" aria-hidden="true" />
              {t("teletravail.weekEnd")}
            </span>
            <span className="tt-l">
              <span className="tt-sw is-rec" aria-hidden="true" />
              {t("teletravail.teletravailRecurrent")}
            </span>
          </div>
        </section>
      ) : null}

      <FenetreRegles ouverte={reglesOuvertes} surFermeture={() => setReglesOuvertes(false)} />
    </div>
  );
}

/**
 * Les règles récurrentes, avec leur **prévisualisation en langage naturel**.
 *
 * « Tous les mardis à partir du 1er mars » se relit ; « jourSemaine: 2,
 * dateDebut: 2026-03-01 » se déchiffre. Le brief exige la première forme.
 */
function FenetreRegles({
  ouverte,
  surFermeture,
}: {
  ouverte: boolean;
  surFermeture: () => void;
}) {
  const { t } = useTranslation("occupations");
  const { t: tErreurs } = useTranslation("erreurs");
  const annoncer = useMessages();
  const client = useQueryClient();

  const [jourSemaine, setJourSemaine] = useState(1);
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");
  const [genDebut, setGenDebut] = useState("");
  const [genFin, setGenFin] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);

  const regles = useQuery({
    queryKey: ["teletravail", "regles"],
    queryFn: () => api.reglesTeletravail(),
    enabled: ouverte,
  });

  const creation = useMutation({
    mutationFn: () =>
      api.creerRegleTeletravail({
        jourSemaine,
        dateDebut,
        ...(dateFin ? { dateFin } : {}),
      }),
    onSuccess: () => {
      annoncer("ok", t("teletravail.regleCreee"));
      setDateDebut("");
      setDateFin("");
      void client.invalidateQueries({ queryKey: ["teletravail"] });
    },
    onError: (e) => setErreur(messageErreur(e, tErreurs, t("teletravail.echecRegle"))),
  });

  const generation = useMutation({
    mutationFn: () => api.genererTeletravail(genDebut, genFin),
    onSuccess: (r) => {
      annoncer("ok", t("teletravail.generation", { crees: r.crees, ignores: r.ignores }));
      void client.invalidateQueries({ queryKey: ["teletravail"] });
    },
    onError: (e) => setErreur(messageErreur(e, tErreurs, t("teletravail.echecGeneration"))),
  });

  const enLangageNaturel = (r: api.RegleTeletravail) =>
    r.dateFin
      ? t("teletravail.regleDuAu", {
          jour: t(`jours.long.${r.jourSemaine}`),
          debut: formaterDate(r.dateDebut),
          fin: formaterDate(r.dateFin),
        })
      : t("teletravail.regleAPartirDe", {
          jour: t(`jours.long.${r.jourSemaine}`),
          debut: formaterDate(r.dateDebut),
        });

  return (
    <Fenetre
      ouverte={ouverte}
      surFermeture={surFermeture}
      categorie={t("teletravail.joursFixes")}
      titre={t("teletravail.configurerJoursFixes")}
      large
      mention={t("teletravail.reglesMention")}
      actions={
        <Button className="btn btn-secondary" onPress={surFermeture}>
          {t("fermer")}
        </Button>
      }
    >
      {erreur ? (
        <div className="alert alert-error" role="alert">
          <span className="alert-icon" aria-hidden="true">
            !
          </span>
          <span>{erreur}</span>
        </div>
      ) : null}

      {regles.data && regles.data.length === 0 ? (
        <div className="empty">
          <p>{t("teletravail.aucuneRegle")}</p>
          <small>{t("teletravail.aucuneRegleExplication")}</small>
        </div>
      ) : null}

      {(regles.data ?? []).map((r) => (
        <div className={`rule${r.active ? "" : " is-off"}`} key={r.id}>
          <span className="bloc-etroit">
            <span className="rule-nl">{enLangageNaturel(r)}</span>
            <span className="rule-sub">
              {r.active ? t("teletravail.regleActive") : t("teletravail.regleInactive")}
            </span>
          </span>
          <span />
          <span />
        </div>
      ))}

      <div className="gen-box">
        <p className="eyebrow">{t("teletravail.ajouterRegle")}</p>
        <div className="gen-row">
          <div className="field-block">
            <label className="field-label" htmlFor="tt-jour">
              {t("teletravail.jourSemaine")}
            </label>
            <select
              className="field"
              id="tt-jour"
              value={jourSemaine}
              onChange={(e) => setJourSemaine(Number(e.target.value))}
            >
              {JOURS_SEMAINE.map((j) => (
                <option key={j} value={j}>
                  {t(`jours.long.${j}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="field-block">
            <label className="field-label" htmlFor="tt-debut">
              {t("teletravail.dateDebut")}
            </label>
            <input
              className="field"
              id="tt-debut"
              type="date"
              value={dateDebut}
              onChange={(e) => setDateDebut(e.target.value)}
            />
          </div>
          <div className="field-block">
            <label className="field-label" htmlFor="tt-fin">
              {t("teletravail.dateFin")}
            </label>
            <input
              className="field"
              id="tt-fin"
              type="date"
              value={dateFin}
              onChange={(e) => setDateFin(e.target.value)}
            />
          </div>
          <Button
            className="btn btn-primary"
            isDisabled={!dateDebut}
            isPending={creation.isPending}
            onPress={() => creation.mutate()}
          >
            {t("teletravail.ajouter")}
          </Button>
        </div>
      </div>

      <div className="gen-box">
        <p className="eyebrow">{t("teletravail.genererPlannings")}</p>
        <div className="gen-row">
          <div className="field-block">
            <label className="field-label" htmlFor="tt-gd">
              {t("teletravail.du")}
            </label>
            <input
              className="field"
              id="tt-gd"
              type="date"
              value={genDebut}
              onChange={(e) => setGenDebut(e.target.value)}
            />
          </div>
          <div className="field-block">
            <label className="field-label" htmlFor="tt-gf">
              {t("teletravail.au")}
            </label>
            <input
              className="field"
              id="tt-gf"
              type="date"
              value={genFin}
              onChange={(e) => setGenFin(e.target.value)}
            />
          </div>
          <Button
            className="btn btn-secondary"
            isDisabled={!genDebut || !genFin}
            isPending={generation.isPending}
            onPress={() => generation.mutate()}
          >
            {t("teletravail.generer")}
          </Button>
        </div>
        <p className="field-hint">{t("teletravail.plageMaximale")}</p>
      </div>
    </Fenetre>
  );
}
