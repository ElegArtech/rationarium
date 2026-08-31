import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "react-aria-components";
import * as api from "../../api/occupations.js";
import * as apiAdministration from "../../api/administration.js";
import { messageErreur } from "../../api/erreurs.js";
import { usePeut } from "../../session/session.js";
import { Chargement, ErreurDeChargement } from "../../composants/etats.js";
import { Fenetre } from "../../composants/fenetre.js";
import { useMessages } from "../../composants/messages.js";
import { AvatarAgent } from "../../composants/pastilles.js";
import { formaterDate, formaterMoisAnnee } from "../../formats.js";
import "../../composants/partages.css";
import "../taches/liste.css";
import "../projets/equipe.css";
/* La fenêtre des règles reprend `.rec-grid` et `.rec-prev` de la section 22,
   comme la maquette 20 — cumulative — le fait elle-même. */
import "./evenements.css";
import "./teletravail.css";

/**
 * Vue 20 — Télétravail.
 *
 * **Cinq apparences sur une même case.** Le brief le pose en point
 * d'attention : télétravail, bureau déclaré, non déclaré, week-end, plus les
 * deux qualificatifs « issu d'une règle » et « exception ». Les quatre
 * premiers s'excluent ; les deux derniers se surajoutent. Les confondre
 * reviendrait à ne plus distinguer « je n'ai rien dit » de « j'ai dit que je
 * serais au bureau ».
 *
 * **Le clic fait un cycle à trois temps** — non déclaré → télétravail →
 * bureau —, et le bandeau le dit avant qu'on l'ait essayé. Un geste qui ne
 * s'annonce pas ne se devine pas.
 *
 * **La couleur ne porte jamais seule.** Chaque case déclarée porte aussi une
 * étiquette écrite, et le libellé accessible du bouton dit l'état en toutes
 * lettres — une grille qui ne parlerait qu'en couleur serait muette pour qui
 * ne la voit pas.
 */

const JOURS_SEMAINE = [1, 2, 3, 4, 5];
const ABREGES = ["lun", "mar", "mer", "jeu", "ven", "sam", "dim"] as const;

/** Le cycle du clic, dans l'ordre annoncé par le bandeau. */
const SUIVANT: Record<string, string> = {
  undeclared: "telework",
  telework: "office",
  office: "undeclared",
};

export function Teletravail() {
  const { t } = useTranslation("occupations");
  const peut = usePeut();
  const client = useQueryClient();
  const annoncer = useMessages();
  const { t: tErreurs } = useTranslation("erreurs");
  const [reglesOuvertes, setReglesOuvertes] = useState(false);
  const [vue, setVue] = useState<"moi" | "equipe">("moi");
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

  /*
   * Les jours fériés ne viennent pas du planning de télétravail : le service
   * ne les connaît pas. Ils sont lus au calendrier, et seulement si la
   * permission le permet — sans elle, la case reste ouvrable, elle perd
   * seulement son étiquette de fête. C'est une courtoisie, pas un contrôle.
   */
  const feries = useQuery({
    queryKey: ["feries", mois.annee],
    queryFn: () => apiAdministration.joursFeries(mois.annee),
    enabled: peut("holidays:read"),
  });

  const bascule = useMutation({
    mutationFn: ({ date, etat }: { date: string; etat: string }) =>
      api.basculerTeletravail(date, etat),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["teletravail"] }),
    onError: (e) => annoncer("err", messageErreur(e, tErreurs, t("teletravail.echecBascule"))),
  });

  const calendrier = requete.data?.calendrier ?? [];
  const cumul = requete.data?.cumul;

  const parDate = useMemo(
    () => new Map(calendrier.map((j) => [j.date.slice(0, 10), j])),
    [calendrier],
  );
  const nomsFeries = useMemo(
    () => new Map((feries.data?.feries ?? []).map((f) => [f.date.slice(0, 10), f.libelle])),
    [feries.data],
  );

  const premier = new Date(Date.UTC(mois.annee, mois.mois, 1));
  const decalage = (premier.getUTCDay() + 6) % 7;
  const nbJours = new Date(Date.UTC(mois.annee, mois.mois + 1, 0)).getUTCDate();
  const nbJoursPrecedent = new Date(Date.UTC(mois.annee, mois.mois, 0)).getUTCDate();
  const reste = (7 - ((decalage + nbJours) % 7)) % 7;
  const aujourdhui = new Date().toISOString().slice(0, 10);

  const modifiable = peut("telework:create");

  return (
    <div className="page">
      <div className="pl-toolbar">
        <div>
          <span className="eyebrow">{t("teletravail.surtitre")}</span>
          <h1 className="h1 titre-vue">
            {vue === "moi" ? t("teletravail.titre") : t("teletravail.titreEquipe")}
          </h1>
        </div>
        <span className="count-split">
          {t("teletravail.compte", { n: cumul?.teletravail ?? 0 })}
        </span>
        <div className="pl-toolbar-fin">
          <div className="seg" role="group" aria-label={t("teletravail.affichage")}>
            <Button aria-pressed={vue === "moi"} onPress={() => setVue("moi")}>
              {t("teletravail.monPlanning")}
            </Button>
            <Button aria-pressed={vue === "equipe"} onPress={() => setVue("equipe")}>
              {t("teletravail.vueEquipe")}
            </Button>
          </div>
          {peut("telework:manage_rules") ? (
            <Button className="btn btn-primary" onPress={() => setReglesOuvertes(true)}>
              {t("teletravail.configurerJoursFixes")}
            </Button>
          ) : null}
        </div>
      </div>

      {vue === "moi" ? (
        <div>
          {/* L'explication est dans le flux, pas en aide au survol : le geste
              de bascule n'est deviné par personne la première fois. */}
          <div className="alert alert-neutral" role="note">
            <span className="alert-icon" aria-hidden="true">
              →
            </span>
            <span>{t("teletravail.commentCaMarche")}</span>
          </div>

          {requete.isPending ? <Chargement quoi={t("teletravail.lePlanning")} /> : null}
          {requete.isError ? (
            <ErreurDeChargement erreur={requete.error} surReessai={() => void requete.refetch()} />
          ) : null}

          {requete.data ? (
            <section className="panel">
              <div className="panel-head">
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
                <span className="panel-title">{formaterMoisAnnee(mois.annee, mois.mois)}</span>
                <span className="eyebrow ligne-actions-fin">
                  {t("teletravail.cumulDuMois", {
                    teletravail: cumul?.teletravail ?? 0,
                    bureau: cumul?.bureau ?? 0,
                    nonDeclares: cumul?.nonDeclares ?? 0,
                  })}
                </span>
              </div>

              <div className="tt-cal">
                {ABREGES.map((j) => (
                  <div className="tt-dow" key={j}>
                    {t(`jours.${j}`)}
                  </div>
                ))}

                {/* Les jours de débord portent leur numéro : une case nue
                    laisserait croire à un trou dans le mois. */}
                {Array.from({ length: decalage }, (_, i) => (
                  <div className="tt-cell is-out" key={`avant-${i}`} aria-hidden="true">
                    <span className="tt-n">{nbJoursPrecedent - decalage + i + 1}</span>
                  </div>
                ))}

                {Array.from({ length: nbJours }, (_, i) => {
                  const numero = i + 1;
                  const date = `${mois.annee}-${String(mois.mois + 1).padStart(2, "0")}-${String(numero).padStart(2, "0")}`;
                  const jour = parDate.get(date);
                  const weekEnd = jour?.weekend ?? false;
                  const etat = jour?.etat ?? "undeclared";
                  const ferie = nomsFeries.get(date);

                  const classes = [
                    "tt-cell",
                    weekEnd ? "is-we" : "",
                    etat === "telework" ? "is-tt" : "",
                    etat === "office" ? "is-office" : "",
                    date === aujourdhui ? "is-today" : "",
                  ]
                    .filter(Boolean)
                    .join(" ");

                  const contenu = (
                    <>
                      <span className="tt-n">{numero}</span>
                      {ferie ? (
                        <span className="tt-ferie">{ferie}</span>
                      ) : weekEnd ? null : (
                        <>
                          {etat === "telework" ? (
                            <span className="tt-tag is-tt">{t("teletravail.etat_telework")}</span>
                          ) : null}
                          {etat === "office" ? (
                            <span className="tt-tag is-office">{t("teletravail.etat_office")}</span>
                          ) : null}
                          {jour?.exception ? (
                            <span className="tt-mark is-exc">{t("teletravail.marqueException")}</span>
                          ) : jour?.issuDeRegle ? (
                            <span className="tt-mark">{t("teletravail.marqueRecurrent")}</span>
                          ) : null}
                        </>
                      )}
                    </>
                  );

                  const libelle = t("teletravail.caseLibelle", {
                    date: formaterDate(date),
                    etat: t(`teletravail.etat_${weekEnd ? "weekend" : etat}`),
                  });

                  /* Un week-end et un jour férié ne se déclarent pas : la case
                     n'est pas un bouton désactivé, elle n'est pas un bouton. */
                  if (weekEnd || ferie) {
                    return (
                      <div className={classes} key={date} aria-label={libelle}>
                        {contenu}
                      </div>
                    );
                  }

                  return (
                    <Button
                      key={date}
                      className={classes}
                      isDisabled={!modifiable}
                      aria-label={libelle}
                      onPress={() =>
                        bascule.mutate({ date, etat: SUIVANT[etat] ?? "telework" })
                      }
                    >
                      {contenu}
                    </Button>
                  );
                })}

                {Array.from({ length: reste }, (_, i) => (
                  <div className="tt-cell is-out" key={`apres-${i}`} aria-hidden="true">
                    <span className="tt-n">{i + 1}</span>
                  </div>
                ))}
              </div>

              <div className="tt-legend">
                <span className="tt-l">
                  <span className="tt-sw is-tt" aria-hidden="true" />
                  <span>{t("teletravail.etat_telework")}</span>
                </span>
                <span className="tt-l">
                  <span className="tt-sw is-office" aria-hidden="true" />
                  <span>{t("teletravail.bureauDeclare")}</span>
                </span>
                <span className="tt-l">
                  <span className="tt-sw is-none" aria-hidden="true" />
                  <span>{t("teletravail.etat_undeclared")}</span>
                </span>
                <span className="tt-l">
                  <span className="tt-sw is-we" aria-hidden="true" />
                  <span>{t("teletravail.etat_weekend")}</span>
                </span>
                <span className="tt-l">
                  <span className="tt-sw is-rec" aria-hidden="true" />
                  <span>{t("teletravail.teletravailRecurrent")}</span>
                </span>
                <span className="tt-l">
                  <span className="tt-mark is-exc">
                    <span aria-hidden="true">⌁</span>
                    <span>{t("teletravail.exception")}</span>
                  </span>
                </span>
              </div>
            </section>
          ) : null}
        </div>
      ) : (
        <VueEquipe />
      )}

      <FenetreRegles ouverte={reglesOuvertes} surFermeture={() => setReglesOuvertes(false)} />
    </div>
  );
}

/**
 * `EX-TLT-05` — qui est sur site, qui est à distance, à une date donnée.
 *
 * La lecture est cloisonnée au serveur : le périmètre s'applique à la requête,
 * pas au rendu. Sans la permission d'équipe, l'onglet reste, et il dit
 * pourquoi il est vide plutôt que de disparaître sans explication.
 */
function VueEquipe() {
  const { t } = useTranslation("occupations");
  const peut = usePeut();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  const requete = useQuery({
    queryKey: ["teletravail", "equipe", date],
    queryFn: () => api.equipeTeletravail(date),
    enabled: peut("telework:read_team"),
  });

  const agents = requete.data ?? [];
  const compte = (etat: string) => agents.filter((a) => a.etat === etat).length;

  if (!peut("telework:read_team")) {
    return (
      <div className="empty empty-large">
        <p>{t("teletravail.equipeInterditeTitre")}</p>
        <small>{t("teletravail.equipeInterditeExplication")}</small>
      </div>
    );
  }

  return (
    <div>
      <div className="filters">
        <label className="field-label" htmlFor="tt-equipe-date">
          {t("teletravail.date")}
        </label>
        <input
          className="f-input"
          id="tt-equipe-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      {requete.isPending ? <Chargement quoi={t("teletravail.lEquipe")} /> : null}
      {requete.isError ? (
        <ErreurDeChargement erreur={requete.error} surReessai={() => void requete.refetch()} />
      ) : null}

      {requete.data ? (
        agents.length === 0 ? (
          <div className="empty empty-large">
            <p>{t("teletravail.equipeVideTitre")}</p>
            <small>{t("teletravail.equipeVideExplication")}</small>
          </div>
        ) : (
          <section className="panel">
            <div className="team-sum">
              <span className="tb-item">
                <span className="eyebrow">{t("teletravail.etat_telework")}</span>
                <span className="tb-val">{compte("telework")}</span>
              </span>
              <span className="tb-item">
                <span className="eyebrow">{t("teletravail.surSite")}</span>
                <span className="tb-val">{compte("office")}</span>
              </span>
              <span className="tb-item">
                <span className="eyebrow">{t("teletravail.etat_undeclared")}</span>
                <span className="tb-val">{compte("undeclared")}</span>
              </span>
            </div>
            {agents.map((a) => (
              <div className="team-row" key={a.id}>
                <span className="lv-who">
                  <AvatarAgent prenom={a.prenom} nom={a.nom} />
                  <span className="lv-wn">
                    {a.prenom} {a.nom}
                  </span>
                </span>
                <span>
                  {a.etat === "telework" ? (
                    <span className="tt-tag is-tt">{t("teletravail.etat_telework")}</span>
                  ) : a.etat === "office" ? (
                    <span className="tt-tag is-office">{t("teletravail.etat_office")}</span>
                  ) : (
                    <span className="lv-val">{t("teletravail.etat_undeclared")}</span>
                  )}
                </span>
                <span className="lv-acts" />
              </div>
            ))}
          </section>
        )
      ) : null}
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

  const peut = usePeut();
  const [jourSemaine, setJourSemaine] = useState(2);
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");
  const [genDebut, setGenDebut] = useState("");
  const [genFin, setGenFin] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  /*
   * `EX-TLT-04` — la règle en cours de modification, ou aucune.
   *
   * Le formulaire du bas sert les deux gestes : vide, il ajoute ; chargé d'une
   * règle, il la modifie. Un second formulaire aux mêmes trois champs
   * finirait par diverger du premier, et la maquette n'en montre qu'un.
   */
  const [enEdition, setEnEdition] = useState<api.RegleTeletravail | null>(null);
  const [aSupprimer, setASupprimer] = useState<api.RegleTeletravail | null>(null);

  const gereLesRegles = peut("telework:manage_rules");

  const regles = useQuery({
    queryKey: ["teletravail", "regles"],
    queryFn: () => api.reglesTeletravail(),
    enabled: ouverte,
  });

  const reinitialiser = () => {
    setEnEdition(null);
    setDateDebut("");
    setDateFin("");
    setJourSemaine(2);
  };

  const creation = useMutation({
    mutationFn: () =>
      enEdition
        ? api.modifierRegleTeletravail(enEdition.id, {
            version: enEdition.version,
            jourSemaine,
            dateDebut,
            // `null` efface la borne, l'absence la laisse : le formulaire vidé
            // doit pouvoir rouvrir une règle bornée.
            dateFin: dateFin ? dateFin : null,
          })
        : api.creerRegleTeletravail({
            jourSemaine,
            dateDebut,
            ...(dateFin ? { dateFin } : {}),
          }),
    onSuccess: () => {
      annoncer("ok", enEdition ? t("teletravail.regleModifiee") : t("teletravail.regleCreee"));
      reinitialiser();
      void client.invalidateQueries({ queryKey: ["teletravail"] });
    },
    onError: (e) => setErreur(messageErreur(e, tErreurs, t("teletravail.echecRegle"))),
  });

  /**
   * `EX-TLT-04` — la facette « actif ».
   *
   * Elle n'était écrite nulle part : `TeleworkRule.active` avait un défaut à
   * `true` et aucun chemin ne le changeait. Désactiver est le geste
   * réversible — la règle reste visible et explique pourquoi les jours qu'elle
   * produisait ont cessé d'apparaître.
   */
  const bascule = useMutation({
    mutationFn: (r: api.RegleTeletravail) =>
      api.modifierRegleTeletravail(r.id, { version: r.version, active: !r.active }),
    onSuccess: (r) => {
      annoncer("ok", r.active ? t("teletravail.regleActivee") : t("teletravail.regleDesactivee"));
      void client.invalidateQueries({ queryKey: ["teletravail"] });
    },
    onError: (e) => setErreur(messageErreur(e, tErreurs, t("teletravail.echecRegle"))),
  });

  const suppression = useMutation({
    mutationFn: (id: string) => api.supprimerRegleTeletravail(id),
    onSuccess: () => {
      annoncer("ok", t("teletravail.regleSupprimee"));
      setASupprimer(null);
      reinitialiser();
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

  const enLangageNaturel = (r: {
    jourSemaine: number;
    dateDebut: string;
    dateFin?: string | null;
  }) =>
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

  /*
   * `EX-TLT-04` — la plage de génération est bornée à 366 jours. Le contrôle
   * est au serveur ; ici il ne fait que dire, avant l'envoi, ce qui sera
   * refusé — et il le dit sans attendre que le bouton soit pressé.
   */
  const plageJours =
    genDebut && genFin
      ? Math.round(
          (new Date(genFin).getTime() - new Date(genDebut).getTime()) / 86_400_000,
        ) + 1
      : 0;
  const plageInvalide = plageJours > 366 || plageJours < 1;

  return (
    <Fenetre
      ouverte={ouverte}
      surFermeture={surFermeture}
      categorie={t("teletravail.recurrence")}
      titre={t("teletravail.joursFixes")}
      large
      mention={t("teletravail.reglesMention")}
      actions={
        <Button className="btn btn-primary" onPress={surFermeture}>
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

      {/*
        `EX-TLT-04` — les trois actions qui manquaient. La maquette réservait
        déjà deux colonnes d'actions à droite de chaque règle et n'en posait
        aucune : elles étaient vides parce que le serveur ne savait ni modifier,
        ni désactiver, ni supprimer une règle.

        `RG-GEN-06` — sans `telework:manage_rules`, les commandes ne s'affichent
        pas : le client reflète le serveur, il ne le double pas d'un contrôle.
      */}
      {(regles.data ?? []).map((r) => (
        <div className={`rule${r.active ? "" : " is-off"}`} key={r.id}>
          <span className="bloc-etroit">
            <span className="rule-nl">{enLangageNaturel(r)}</span>
            <span className="rule-sub">
              {r.active ? t("teletravail.regleActive") : t("teletravail.regleInactive")}
            </span>
          </span>
          {gereLesRegles ? (
            <Button
              className="chip-btn"
              onPress={() => {
                setEnEdition(r);
                setJourSemaine(r.jourSemaine);
                setDateDebut(r.dateDebut.slice(0, 10));
                setDateFin(r.dateFin ? r.dateFin.slice(0, 10) : "");
                setErreur(null);
              }}
              aria-label={t("teletravail.modifierLaRegle", { regle: enLangageNaturel(r) })}
            >
              {t("teletravail.modifierRegle")}
            </Button>
          ) : (
            <span />
          )}
          {gereLesRegles ? (
            <Button
              className="chip-btn"
              isPending={bascule.isPending}
              onPress={() => bascule.mutate(r)}
              aria-label={
                r.active
                  ? t("teletravail.desactiverLaRegle", { regle: enLangageNaturel(r) })
                  : t("teletravail.activerLaRegle", { regle: enLangageNaturel(r) })
              }
            >
              {r.active ? t("teletravail.desactiverRegle") : t("teletravail.activerRegle")}
            </Button>
          ) : (
            <span />
          )}
          {gereLesRegles ? (
            <Button
              className="chip-btn"
              onPress={() => setASupprimer(r)}
              aria-label={t("teletravail.supprimerLaRegle", { regle: enLangageNaturel(r) })}
            >
              {t("supprimer")}
            </Button>
          ) : (
            <span />
          )}
        </div>
      ))}

      <div className="gen-box">
        <span className="eyebrow">
          {enEdition ? t("teletravail.modifierRegle") : t("teletravail.ajouterRegle")}
        </span>
        <div className="rec-grid form-grid-espace">
          <div>
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
          <div>
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
          <div>
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
        </div>

        {/* La règle se relit en français avant d'être posée. */}
        <div className="rec-prev">
          <span aria-hidden="true" className="rec-prev-glyphe">
            ↻
          </span>
          <div>
            <p className="rec-prev-t">
              {dateDebut ? enLangageNaturel({ jourSemaine, dateDebut, dateFin }) : "—"}
            </p>
            <p className="rec-prev-d">{t("teletravail.regleSansEffet")}</p>
          </div>
        </div>

        <div className="ligne-actions">
          {enEdition ? (
            <Button className="btn btn-secondary" onPress={reinitialiser}>
              {t("annuler")}
            </Button>
          ) : null}
          <Button
            className="btn btn-primary ligne-actions-fin"
            isDisabled={!dateDebut}
            isPending={creation.isPending}
            onPress={() => creation.mutate()}
          >
            {enEdition ? t("enregistrer") : t("teletravail.ajouterRegle")}
          </Button>
        </div>
      </div>

      {/*
        La suppression se confirme, et la confirmation dit ce qu'elle ne fait
        PAS : les jours déjà posés au calendrier restent. Le découvrir après
        coup — ou pire, croire qu'ils ont disparu — est le genre
        d'apprentissage qu'on ne fait qu'une fois, et mal.
      */}
      {aSupprimer ? (
        <Fenetre
          ouverte
          surFermeture={() => setASupprimer(null)}
          categorie={t("teletravail.recurrence")}
          titre={t("teletravail.supprimerRegle")}
          actions={
            <>
              <Button className="btn btn-secondary" onPress={() => setASupprimer(null)}>
                {t("annuler")}
              </Button>
              <Button
                className="btn btn-danger"
                isPending={suppression.isPending}
                onPress={() => suppression.mutate(aSupprimer.id)}
              >
                {t("supprimer")}
              </Button>
            </>
          }
        >
          <p>{t("teletravail.confirmerSuppressionRegle", { regle: enLangageNaturel(aSupprimer) })}</p>
          <p className="field-hint">{t("teletravail.suppressionRegleGarde")}</p>
        </Fenetre>
      ) : null}

      <div className="gen-box">
        <span className="eyebrow">{t("teletravail.genererPlannings")}</span>
        <p className="field-hint">{t("teletravail.generationExplication")}</p>
        <div className="gen-row">
          <div>
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
          <div>
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
            className="btn btn-secondary ligne-actions-fin"
            isDisabled={plageInvalide}
            isPending={generation.isPending}
            onPress={() => generation.mutate()}
          >
            {t("teletravail.generer")}
          </Button>
        </div>
        {plageJours > 366 ? (
          <div className="alert alert-error" role="alert">
            <span className="alert-icon" aria-hidden="true">
              !
            </span>
            <span>{t("teletravail.plageMaximale")}</span>
          </div>
        ) : null}
      </div>
    </Fenetre>
  );
}
