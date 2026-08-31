import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "react-aria-components";
import { TYPES_ACTIVITE } from "@rationarium/contracts";
import * as api from "../../api/occupations.js";
import * as apiProjets from "../../api/projets.js";
import * as apiTaches from "../../api/taches.js";
import { messageErreur } from "../../api/erreurs.js";
import { usePeut, useSession } from "../../session/session.js";
import { Chargement, ErreurDeChargement } from "../../composants/etats.js";
import { Fenetre } from "../../composants/fenetre.js";
import { useMessages } from "../../composants/messages.js";
import { Pastille, jetonDe, useLibelle } from "../../composants/pastilles.js";
import { formaterDate, formaterMoisSeul, formaterNombre, joursVisibles } from "../../formats.js";
import "../../composants/partages.css";
import "../taches/liste.css";
import "./temps.css";

/**
 * Vue 21 — Temps passé.
 *
 * **C'est le chemin de consultation et de correction**, pas le chemin
 * principal de saisie : celui-là est la saisie rapide du tableau de bord
 * (vue 06). Le brief le dit, et cela change la hiérarchie — ici, ce qui
 * compte est de retrouver, vérifier et corriger.
 *
 * D'où le regroupement par jour, avec le total et le plafond de chaque
 * journée, et surtout **les jours ouvrés SANS saisie** : « une corvée
 * quotidienne : la vue doit rendre visible ce qui manque autant que ce qui a
 * été déclaré. » Un jour vide n'est pas une absence de ligne, c'est une ligne
 * qui dit qu'elle est vide, avec le geste pour la remplir.
 */

/**
 * Le plafond journalier est un **paramètre serveur**
 * (`time_tracking.plafondJournalier`, `RG-TMP-02`), pas une constante de vue.
 *
 * Il voyage désormais avec le cumul : la vue n'en garde plus de copie. La
 * valeur ci-dessous ne sert qu'au premier rendu, avant la réponse — jamais à
 * juger d'un dépassement, qui se lit sur le plafond reçu. Une copie en dur
 * laissait la jauge tracer sur douze heures pendant que le serveur refusait
 * au-delà de huit : le réglage s'enregistrait sans jamais s'appliquer.
 */
const PLAFOND_AVANT_REPONSE = 12;

/** Le mois d'une date ISO, en clé de traduction courte : `aout`, `sept`… */
const ABREGES_JOURS = ["dim", "lun", "mar", "mer", "jeu", "ven", "sam"] as const;

/** Les bornes du mois courant, en ISO. */
function moisCourant(): { debut: string; fin: string } {
  const d = new Date();
  const annee = d.getUTCFullYear();
  const mois = d.getUTCMonth();
  return {
    debut: new Date(Date.UTC(annee, mois, 1)).toISOString().slice(0, 10),
    fin: new Date(Date.UTC(annee, mois + 1, 0)).toISOString().slice(0, 10),
  };
}

export function Temps() {
  const { t } = useTranslation("occupations");
  const libelle = useLibelle();
  const peut = usePeut();
  const [projectId, setProjectId] = useState("");
  const [typeActivite, setTypeActivite] = useState("");
  /*
   * La période s'ouvre sur le MOIS COURANT, comme la maquette. Sans borne, le
   * compteur de jours ouvrés sans saisie n'aurait rien à mesurer — et c'est
   * l'indicateur que la vue existe pour montrer.
   */
  const [debut, setDebut] = useState(() => moisCourant().debut);
  const [fin, setFin] = useState(() => moisCourant().fin);
  const [repartition, setRepartition] = useState<"activite" | "projet">("activite");
  const [afficherLesTrous, setAfficherLesTrous] = useState(true);
  const [saisieOuverte, setSaisieOuverte] = useState(false);

  /*
   * La vue est PERSONNELLE — « Temps passé », pas « temps de l'équipe ». Sans
   * `userId`, un administrateur reçoit les saisies de tout son périmètre et
   * l'indicateur « jours ouvrés sans saisie » ne veut plus rien dire : il
   * mesurerait les trous de trois cents personnes à la fois. Le rapport
   * d'équipe est un autre point d'entrée (`EX-TMP-07`).
   */
  const { session } = useSession();
  const filtres = { userId: session.id, projectId, debut, fin };
  const requete = useQuery({ queryKey: ["temps", filtres], queryFn: () => api.temps(filtres) });
  const projets = useQuery({
    queryKey: ["projets", {}],
    queryFn: () => apiProjets.portefeuille({}),
  });

  /* Le type d'activité n'est pas un filtre serveur : il se pose sur la liste
     rendue, comme dans la maquette. */
  const saisies = useMemo(() => {
    const tout = requete.data?.saisies ?? [];
    return typeActivite ? tout.filter((s) => s.typeActivite === typeActivite) : tout;
  }, [requete.data, typeActivite]);

  const heuresParJour = useMemo(() => {
    const somme = new Map<string, number>();
    for (const s of saisies) {
      const cle = s.date.slice(0, 10);
      somme.set(cle, (somme.get(cle) ?? 0) + Number(s.heures));
    }
    return somme;
  }, [saisies]);

  const total = [...heuresParJour.values()].reduce((n, h) => n + h, 0);
  const joursSaisis = heuresParJour.size;
  const plafond = requete.data?.cumul.plafondJournalier ?? PLAFOND_AVANT_REPONSE;

  /**
   * Les jours ouvrés sans saisie, sur la période visible et **jusqu'à
   * aujourd'hui seulement** : reprocher un trou sur un jour à venir n'aurait
   * pas de sens. Le week-end suit le paramétrage d'affichage (`RG-GEN-09`),
   * jamais une liste écrite en dur.
   */
  const ouvres = joursVisibles();
  const joursSansSaisie = useMemo(() => {
    if (!debut || !fin) return [];
    const aujourdhui = new Date().toISOString().slice(0, 10);
    const trous: string[] = [];
    const curseur = new Date(`${debut}T00:00:00.000Z`);
    const borne = new Date(`${fin}T00:00:00.000Z`);
    while (curseur <= borne) {
      const jour = curseur.toISOString().slice(0, 10);
      if (jour > aujourdhui) break;
      if (ouvres.has(curseur.getUTCDay()) && !heuresParJour.has(jour)) trous.push(jour);
      curseur.setUTCDate(curseur.getUTCDate() + 1);
    }
    return trous;
  }, [debut, fin, heuresParJour, ouvres]);

  /** Les groupes de la barre empilée : par activité, ou par projet. */
  const groupes = useMemo(() => {
    const somme = new Map<string, { libelle: string; jeton: string; heures: number }>();
    for (const s of saisies) {
      const cle = repartition === "activite" ? s.typeActivite : (s.project?.id ?? "hors-projet");
      const existant = somme.get(cle);
      somme.set(cle, {
        libelle: repartition === "activite" ? s.typeActivite : (s.project?.nom ?? ""),
        jeton: repartition === "activite" ? jetonDe(s.typeActivite) : "var(--st-doing)",
        heures: (existant?.heures ?? 0) + Number(s.heures),
      });
    }
    return [...somme.entries()].sort((a, b) => b[1].heures - a[1].heures);
  }, [saisies, repartition]);

  const jours = useMemo(() => {
    const tout = new Set([...heuresParJour.keys()]);
    if (afficherLesTrous) for (const j of joursSansSaisie) tout.add(j);
    return [...tout].sort((a, b) => b.localeCompare(a));
  }, [heuresParJour, joursSansSaisie, afficherLesTrous]);

  const reinitialiser = () => {
    setProjectId("");
    setTypeActivite("");
    setDebut(moisCourant().debut);
    setFin(moisCourant().fin);
  };

  return (
    <div className="page">
      <div className="pl-toolbar">
        <div>
          <span className="eyebrow">{t("temps.surtitre")}</span>
          <h1 className="h1 titre-vue">{t("temps.titre")}</h1>
        </div>
        <span className="count-split">
          <b>{t("temps.entrees", { n: saisies.length })}</b>
          {` — ${t("temps.auTotal", { n: total })}`}
        </span>
        {peut("time_tracking:create") ? (
          <div className="pl-toolbar-fin">
            <Button className="btn btn-primary" onPress={() => setSaisieOuverte(true)}>
              {t("temps.saisir")}
            </Button>
          </div>
        ) : null}
      </div>

      <div className="filters">
        <select
          className="f-input"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          aria-label={t("temps.projet")}
        >
          <option value="">{t("temps.tousProjets")}</option>
          {(projets.data?.projets ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.nom}
            </option>
          ))}
        </select>

        <select
          className="f-input"
          value={typeActivite}
          onChange={(e) => setTypeActivite(e.target.value)}
          aria-label={t("temps.typeActivite")}
        >
          <option value="">{t("temps.toutesActivites")}</option>
          {TYPES_ACTIVITE.map((x) => (
            <option key={x.code} value={x.code}>
              {libelle(x.code, TYPES_ACTIVITE)}
            </option>
          ))}
        </select>

        <label className="field-label" htmlFor="tp-f-d1">
          {t("temps.du")}
        </label>
        <input
          className="f-input"
          id="tp-f-d1"
          type="date"
          value={debut}
          onChange={(e) => setDebut(e.target.value)}
        />
        <label className="field-label" htmlFor="tp-f-d2">
          {t("temps.au")}
        </label>
        <input
          className="f-input"
          id="tp-f-d2"
          type="date"
          value={fin}
          onChange={(e) => setFin(e.target.value)}
        />

        <Button className="chip-btn" onPress={reinitialiser}>
          {t("temps.reinitialiserFiltres")}
        </Button>

        <label className="check ligne-actions-fin">
          <input
            type="checkbox"
            checked={afficherLesTrous}
            onChange={(e) => setAfficherLesTrous(e.target.checked)}
          />
          <span>{t("temps.afficherJoursSansSaisie")}</span>
        </label>
      </div>

      {requete.isPending ? <Chargement quoi={t("temps.lesSaisies")} /> : null}
      {requete.isError ? (
        <ErreurDeChargement erreur={requete.error} surReessai={() => void requete.refetch()} />
      ) : null}

      {requete.data ? (
        <>
          <div className="te-sum">
            <div className="kpi">
              <span className="eyebrow">{t("temps.totalDeclare")}</span>
              <p className="kpi-val">{t("heures", { n: total })}</p>
              <span className="kpi-sub">{t("temps.surJoursSaisis", { n: joursSaisis })}</span>
            </div>
            <div className="kpi">
              <span className="eyebrow">{t("temps.moyenneParJour")}</span>
              <p className="kpi-val">
                {joursSaisis ? t("heures", { n: total / joursSaisis }) : "—"}
              </p>
              <span className="kpi-sub">{t("temps.plafondParJour", { n: plafond })}</span>
            </div>
            <div className={`kpi${joursSansSaisie.length > 2 ? " is-alert" : ""}`}>
              <span className="eyebrow">{t("temps.joursSansSaisie")}</span>
              <p className="kpi-val">{formaterNombre(joursSansSaisie.length)}</p>
              <span className="kpi-sub">
                {!debut || !fin
                  ? t("temps.choisirPeriode")
                  : joursSansSaisie.length
                    ? t("temps.jusquAujourdhui")
                    : t("temps.toutEstSaisi")}
              </span>
            </div>
            <div className="kpi">
              <span className="eyebrow">{t("temps.entreesTitre")}</span>
              <p className="kpi-val">{formaterNombre(saisies.length)}</p>
              <span className="kpi-sub">{t("temps.surLaPeriode")}</span>
            </div>
          </div>

          <section className="panel">
            <div className="panel-head">
              <span className="panel-title">{t("temps.repartition")}</span>
              <div className="seg" role="group" aria-label={t("temps.repartition")}>
                <Button
                  aria-pressed={repartition === "activite"}
                  onPress={() => setRepartition("activite")}
                >
                  {t("temps.parActivite")}
                </Button>
                <Button
                  aria-pressed={repartition === "projet"}
                  onPress={() => setRepartition("projet")}
                >
                  {t("temps.parProjet")}
                </Button>
              </div>
            </div>
            <div className="panel-body">
              <div className="split-bar">
                {groupes.map(([cle, g]) => (
                  <i
                    key={cle}
                    style={{ width: `${(g.heures / (total || 1)) * 100}%`, background: g.jeton }}
                  />
                ))}
              </div>
              <div className="split-legend">
                {groupes.map(([cle, g]) => {
                  const part = Math.round((g.heures / (total || 1)) * 100);
                  return (
                    <span className="sl" key={cle}>
                      <span className="sl-sw" style={{ background: g.jeton }} aria-hidden="true" />
                      <span>
                        {repartition === "activite"
                          ? libelle(cle, TYPES_ACTIVITE)
                          : (g.libelle || t("temps.horsProjet"))}
                      </span>
                      <span className="sl-n">
                        {t("temps.partDuTotal", { heures: g.heures, part })}
                      </span>
                    </span>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <span className="panel-title">{t("temps.saisies")}</span>
              <span className="eyebrow">
                {t("temps.groupeesParJour", { n: plafond })}
              </span>
            </div>

            {saisies.length === 0 ? (
              <div className="empty">
                <p>{t("temps.videTitre")}</p>
                <small>{t("temps.videExplication")}</small>
                {peut("time_tracking:create") ? (
                  <Button className="btn btn-primary" onPress={() => setSaisieOuverte(true)}>
                    {t("temps.saisirPremiere")}
                  </Button>
                ) : null}
              </div>
            ) : (
              jours.map((jour) => (
                <GroupeDuJour
                  key={jour}
                  jour={jour}
                  saisies={saisies.filter((s) => s.date.slice(0, 10) === jour)}
                  plafond={plafond}
                  surSaisie={() => setSaisieOuverte(true)}
                />
              ))
            )}
          </section>
        </>
      ) : null}

      {/*
        `EX-TMP-07` — le versant ÉQUIPE, gardé par sa permission propre.

        Il ne double pas la répartition qui le précède : celle-ci est
        personnelle et se calcule sur les saisies déjà chargées, celui-là est
        agrégé EN BASE sur le périmètre de l'appelant, et sait ventiler par
        agent — ce que la page personnelle ne peut pas faire.

        Sans `time_tracking:read_team`, le panneau n'existe pas : la vue reste
        exactement celle de la maquette 21, qui est une page personnelle.
      */}
      {peut("time_tracking:read_team") ? <RapportEquipe debut={debut} fin={fin} /> : null}

      <FenetreSaisie
        ouverte={saisieOuverte}
        surFermeture={() => setSaisieOuverte(false)}
        projets={projets.data?.projets ?? []}
      />
    </div>
  );
}

/**
 * `EX-TMP-07` — « consulter un rapport par agent, par projet, ou personnel ».
 *
 * Les trois axes du serveur sont `agent`, `projet` et `type` ; c'est le
 * troisième qui rend le rapport « personnel » utile, puisque la ventilation par
 * type d'activité est celle qu'on lit sur son propre temps.
 *
 * La fenêtre est celle des filtres de la page : demander deux périodes sur un
 * même écran ferait diverger les deux moitiés sans que rien ne le dise.
 * `debut` et `fin` sont obligatoires au serveur — on n'interroge donc pas tant
 * que l'une des deux est vide, au lieu d'aller chercher un 400.
 */
function RapportEquipe({ debut, fin }: { debut: string; fin: string }) {
  const { t } = useTranslation("occupations");
  const libelle = useLibelle();
  const [axe, setAxe] = useState<"agent" | "projet" | "type">("agent");

  const requete = useQuery({
    queryKey: ["temps", "rapport", { axe, debut, fin }],
    queryFn: () => api.rapportTemps({ axe, debut, fin }),
    enabled: Boolean(debut && fin),
  });

  const lignes = useMemo(
    () => [...(requete.data ?? [])].sort((a, b) => b.heures - a.heures),
    [requete.data],
  );
  const total = lignes.reduce((n, l) => n + l.heures, 0);

  return (
    <section className="panel">
      <div className="panel-head">
        <span className="panel-title">{t("temps.rapportTitre")}</span>
        <div className="seg" role="group" aria-label={t("temps.rapportAxe")}>
          <Button aria-pressed={axe === "agent"} onPress={() => setAxe("agent")}>
            {t("temps.parAgent")}
          </Button>
          <Button aria-pressed={axe === "projet"} onPress={() => setAxe("projet")}>
            {t("temps.parProjet")}
          </Button>
          <Button aria-pressed={axe === "type"} onPress={() => setAxe("type")}>
            {t("temps.parType")}
          </Button>
        </div>
      </div>

      {!debut || !fin ? (
        <div className="empty">
          <p>{t("temps.rapportSansPeriode")}</p>
          <small>{t("temps.rapportSansPeriodeAide")}</small>
        </div>
      ) : requete.isPending ? (
        <Chargement quoi={t("temps.leRapport")} />
      ) : requete.isError ? (
        <ErreurDeChargement erreur={requete.error} surReessai={() => void requete.refetch()} />
      ) : lignes.length === 0 ? (
        <div className="empty">
          <p>{t("temps.rapportVide")}</p>
          <small>{t("temps.rapportVideAide")}</small>
        </div>
      ) : (
        <div className="panel-body">
          <div className="split-bar">
            {lignes.map((l) => (
              <i
                key={l.cle ?? l.libelle}
                style={{
                  width: `${(l.heures / (total || 1)) * 100}%`,
                  background: axe === "type" ? jetonDe(l.cle ?? "") : "var(--st-doing)",
                }}
              />
            ))}
          </div>
          <div className="split-legend">
            {lignes.map((l) => (
              <span className="sl" key={l.cle ?? l.libelle}>
                <span
                  className="sl-sw"
                  style={{ background: axe === "type" ? jetonDe(l.cle ?? "") : "var(--st-doing)" }}
                  aria-hidden="true"
                />
                {/* Le serveur rend le CODE d'activité en libellé — « meeting »,
                    pas « Réunion ». Le traduire ici est la même règle que
                    partout ailleurs : aucune chaîne visible ne vient du serveur. */}
                <span>{axe === "type" ? libelle(l.cle ?? "", TYPES_ACTIVITE) : l.libelle}</span>
                <span className="sl-n">
                  {t("temps.rapportLigne", { heures: l.heures, entrees: l.entrees })}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function GroupeDuJour({
  jour,
  saisies,
  plafond,
  surSaisie,
}: {
  jour: string;
  saisies: api.SaisieTemps[];
  plafond: number;
  surSaisie: () => void;
}) {
  const { t } = useTranslation("occupations");
  const peut = usePeut();
  const total = saisies.reduce((n, s) => n + Number(s.heures), 0);
  const depasse = total > plafond;
  const vide = saisies.length === 0;
  const jourSemaine = ABREGES_JOURS[new Date(`${jour}T00:00:00.000Z`).getUTCDay()] ?? "lun";

  return (
    <div>
      <div className={`te-day${depasse ? " is-over" : ""}${vide ? " is-empty" : ""}`}>
        <span className="te-dlab">
          <span className="te-dnum">{Number(jour.slice(8, 10))}</span>
          {/* Un seul nœud de texte : « lun août » se lit d'un bloc. */}
          <span className="te-dow">
            {t("temps.jourEtMois", {
              jour: t(`jours.${jourSemaine}`),
              mois: formaterMoisSeul(jour),
            })}
          </span>
        </span>
        <span className="te-dtot">{vide ? "—" : t("heures", { n: total })}</span>
        <span className="te-cap">
          {/* La barre du plafond n'est pas la barre de progression générique :
              elle vire au rouge au dépassement, et le dit aussi en toutes
              lettres — la couleur seule ne porte jamais l'alerte. */}
          <span
            className="bar"
            role="progressbar"
            aria-valuenow={Math.round((total / plafond) * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t("temps.remplissageDuJour", { date: formaterDate(jour) })}
          >
            <i
              style={{
                width: `${Math.min(100, (total / plafond) * 100)}%`,
                background: depasse ? "var(--st-blocked)" : "var(--accent)",
              }}
            />
          </span>
          <span className="te-caplab">
            {vide
              ? t("temps.aucuneSaisie")
              : depasse
                ? t("temps.depasseLePlafond", { n: total - plafond })
                : t("temps.surPlafondChiffre", { total, plafond })}
          </span>
        </span>
        <span className="lv-acts">
          {vide && peut("time_tracking:create") ? (
            <Button className="ms-toggle" onPress={surSaisie}>
              {t("temps.saisirCourt")}
            </Button>
          ) : null}
        </span>
      </div>

      {saisies.map((s) => (
        <LigneSaisie key={s.id} saisie={s} />
      ))}
    </div>
  );
}

function LigneSaisie({ saisie }: { saisie: api.SaisieTemps }) {
  const { t } = useTranslation("occupations");
  const { t: tErreurs } = useTranslation("erreurs");
  const peut = usePeut();
  const annoncer = useMessages();
  const client = useQueryClient();
  const [suppressionOuverte, setSuppressionOuverte] = useState(false);

  const suppression = useMutation({
    mutationFn: () => api.supprimerTemps(saisie.id),
    onSuccess: () => {
      annoncer("ok", t("temps.supprimee"));
      setSuppressionOuverte(false);
      void client.invalidateQueries({ queryKey: ["temps"] });
    },
    onError: (e) => annoncer("err", messageErreur(e, tErreurs, t("temps.echecAction"))),
  });

  return (
    <div className="te-row">
      <span className="te-act">
        <Pastille code={saisie.typeActivite} vocabulaire={TYPES_ACTIVITE} />
      </span>

      <span className="te-h">{t("heures", { n: Number(saisie.heures) })}</span>

      <div className="bloc-etroit">
        <p className="te-desc">
          {saisie.description ?? saisie.task?.titre ?? t("temps.sansDescription")}
        </p>
        <span className="te-meta">
          {/* Le rattachement d'une SAISIE se dit « Hors projet » — la tâche
              indépendante est un objet, le temps qu'on y passe est du temps
              hors projet. La maquette distingue les deux mots. */}
          {saisie.project ? (
            <span className="pchip">
              <span className="picon" aria-hidden="true">
                ◇
              </span>
              <span>{saisie.project.nom}</span>
            </span>
          ) : (
            <span className="pchip is-indep">
              <span className="dot-ind" aria-hidden="true" />
              <span>{t("temps.horsProjet")}</span>
            </span>
          )}
          {saisie.task ? (
            <span className="te-created">{t("temps.surTache", { titre: saisie.task.titre })}</span>
          ) : null}
          {/* `RG-TMP-03` — l'acteur est immuable. Le dire ici évite de chercher
              où le corriger : il n'y a pas d'endroit. */}
          {saisie.thirdParty ? (
            <span className="te-actor">
              {t("temps.pourTiers", {
                qui: saisie.thirdParty.organisation ?? saisie.thirdParty.contactNom ?? "—",
              })}
            </span>
          ) : null}
          <span className="te-created">
            {t("temps.creeLe", { date: formaterDate(saisie.creeLe) })}
          </span>
        </span>
      </div>

      <span className="lv-acts">
        {peut("time_tracking:delete") ? (
          /* Le nom accessible commence par le texte visible — sans quoi la
             commande vocale « supprimer » ne viserait plus le bouton. */
          <Button
            className="ms-toggle"
            aria-label={t("temps.supprimerLaSaisie", { date: formaterDate(saisie.date) })}
            onPress={() => setSuppressionOuverte(true)}
          >
            {t("temps.supprimer")}
          </Button>
        ) : null}
      </span>

      <Fenetre
        ouverte={suppressionOuverte}
        surFermeture={() => setSuppressionOuverte(false)}
        categorie={t("confirmation")}
        titre={t("temps.supprimerTitre")}
        mention={t("temps.acteurImmuable")}
        actions={
          <>
            <Button className="btn btn-secondary" onPress={() => setSuppressionOuverte(false)}>
              {t("annuler")}
            </Button>
            <Button
              className="btn btn-danger"
              isPending={suppression.isPending}
              onPress={() => suppression.mutate()}
            >
              {t("temps.supprimerTitre")}
            </Button>
          </>
        }
      >
        <p className="phrase-confirmation">{t("temps.confirmerSuppression")}</p>
      </Fenetre>
    </div>
  );
}

/**
 * La fenêtre de saisie.
 *
 * **La tâche dépend du projet** : la choisir avant lui n'aurait pas de sens,
 * et le sélecteur le dit plutôt que de rester vide sans explication.
 *
 * `RG-TMP-02` — le plafond journalier est contrôlé au serveur, qui renvoie le
 * déjà-déclaré, le demandé, le total et le plafond. Le message affiché reprend
 * ces chiffres : « dépassé » sans le compte oblige à recompter à la main.
 */
function FenetreSaisie({
  ouverte,
  surFermeture,
  projets,
}: {
  ouverte: boolean;
  surFermeture: () => void;
  projets: apiProjets.LigneProjet[];
}) {
  const { t } = useTranslation("occupations");
  const { t: tErreurs } = useTranslation("erreurs");
  const libelle = useLibelle();
  const annoncer = useMessages();
  const client = useQueryClient();

  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [heures, setHeures] = useState("");
  const [typeActivite, setTypeActivite] = useState("development");
  const [projectId, setProjectId] = useState("");
  const [taskId, setTaskId] = useState("");
  const [description, setDescription] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);

  const taches = useQuery({
    queryKey: ["taches", { projectId }],
    queryFn: () => apiTaches.lister({ projectId }),
    enabled: ouverte && Boolean(projectId),
  });

  const saisie = useMutation({
    mutationFn: () =>
      api.saisirTemps({
        date,
        heures: Number(heures),
        typeActivite,
        projectId: projectId || null,
        taskId: taskId || null,
        ...(description ? { description } : {}),
      }),
    onSuccess: () => {
      annoncer("ok", t("temps.saisieEnregistree"));
      setHeures("");
      setDescription("");
      surFermeture();
      void client.invalidateQueries({ queryKey: ["temps"] });
    },
    onError: (e) => setErreur(messageErreur(e, tErreurs, t("temps.echecSaisie"))),
  });

  const valider = () => {
    setErreur(null);
    if (!date || !heures) {
      setErreur(t("champsObligatoires"));
      return;
    }
    // `RG-TMP-01` — la règle est au serveur ; l'annoncer ici évite un
    // aller-retour pour une information que le formulaire a sous les yeux.
    if (!projectId && !taskId) {
      setErreur(t("temps.tacheOuProjetRequis"));
      return;
    }
    saisie.mutate();
  };

  return (
    <Fenetre
      ouverte={ouverte}
      surFermeture={surFermeture}
      categorie={t("temps.nouvelleSaisie")}
      titre={t("temps.saisir")}
      large
      mention={t("champsObligatoires")}
      actions={
        <>
          <Button className="btn btn-secondary" onPress={surFermeture}>
            {t("annuler")}
          </Button>
          <Button className="btn btn-primary" isPending={saisie.isPending} onPress={valider}>
            {t("temps.enregistrer")}
          </Button>
        </>
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

      <div className="form-grid form-grid-espace">
        <div className="field-block">
          <label className="field-label" htmlFor="tp-date">
            {t("temps.date")} <span className="req">*</span>
          </label>
          <input
            className="field"
            id="tp-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        <div className="field-block">
          <label className="field-label" htmlFor="tp-heures">
            {t("temps.duree")} <span className="req">*</span>
          </label>
          <input
            className="field"
            id="tp-heures"
            type="number"
            min={0.25}
            step={0.25}
            value={heures}
            placeholder={t("temps.dureeExemple")}
            onChange={(e) => setHeures(e.target.value)}
          />
        </div>

        <div className="field-block">
          <label className="field-label" htmlFor="tp-type">
            {t("temps.typeActivite")}
          </label>
          <select
            className="field"
            id="tp-type"
            value={typeActivite}
            onChange={(e) => setTypeActivite(e.target.value)}
          >
            {TYPES_ACTIVITE.map((x) => (
              <option key={x.code} value={x.code}>
                {libelle(x.code, TYPES_ACTIVITE)}
              </option>
            ))}
          </select>
        </div>

        <div className="field-block">
          <label className="field-label" htmlFor="tp-projet">
            {t("temps.projet")}
          </label>
          <select
            className="field"
            id="tp-projet"
            value={projectId}
            onChange={(e) => {
              setProjectId(e.target.value);
              setTaskId("");
            }}
          >
            <option value="">{t("temps.aucunProjet")}</option>
            {projets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nom}
              </option>
            ))}
          </select>
        </div>

        <div className="field-block span2">
          <label className="field-label" htmlFor="tp-tache">
            {t("temps.tache")}
          </label>
          <select
            className="field"
            id="tp-tache"
            value={taskId}
            disabled={!projectId}
            onChange={(e) => setTaskId(e.target.value)}
          >
            <option value="">
              {projectId ? t("temps.aucuneTache") : t("temps.choisirProjetDabord")}
            </option>
            {(taches.data ?? []).map((x) => (
              <option key={x.id} value={x.id}>
                {x.titre}
              </option>
            ))}
          </select>
        </div>

        <div className="field-block span2">
          <label className="field-label" htmlFor="tp-desc">
            {t("temps.description")}
          </label>
          <textarea
            className="field"
            id="tp-desc"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("temps.descriptionExemple")}
          />
        </div>
      </div>
    </Fenetre>
  );
}
