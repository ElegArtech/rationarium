import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "react-aria-components";
import { TYPES_ACTIVITE } from "@trame/contracts";
import * as api from "../../api/occupations.js";
import * as apiProjets from "../../api/projets.js";
import * as apiTaches from "../../api/taches.js";
import { messageErreur } from "../../api/erreurs.js";
import { usePeut } from "../../session/session.js";
import { Chargement, ErreurDeChargement } from "../../composants/etats.js";
import { Fenetre } from "../../composants/fenetre.js";
import { useMessages } from "../../composants/messages.js";
import { Barre, useLibelle } from "../../composants/pastilles.js";
import { formaterDate, formaterDateLongue, formaterNombre } from "../../formats.js";
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
 * journée. « Une corvée quotidienne : la vue doit rendre visible ce qui manque
 * autant que ce qui a été déclaré. »
 */

const PLAFOND_PAR_DEFAUT = 12;

export function Temps() {
  const { t } = useTranslation("occupations");
  const peut = usePeut();
  const [projectId, setProjectId] = useState("");
  const [debut, setDebut] = useState("");
  const [fin, setFin] = useState("");
  const [saisieOuverte, setSaisieOuverte] = useState(false);

  const filtres = { projectId, debut, fin };
  const requete = useQuery({ queryKey: ["temps", filtres], queryFn: () => api.temps(filtres) });
  const projets = useQuery({
    queryKey: ["projets", {}],
    queryFn: () => apiProjets.portefeuille({}),
  });

  const saisies = requete.data?.saisies ?? [];

  /** Regroupées par jour : le plafond est journalier, la lecture doit l'être. */
  const parJour = useMemo(() => {
    const groupes = new Map<string, api.SaisieTemps[]>();
    for (const s of saisies) {
      const cle = s.date.slice(0, 10);
      groupes.set(cle, [...(groupes.get(cle) ?? []), s]);
    }
    return [...groupes.entries()].sort(([a], [b]) => b.localeCompare(a));
  }, [saisies]);

  const reinitialiser = () => {
    setProjectId("");
    setDebut("");
    setFin("");
  };
  const filtre = Boolean(projectId || debut || fin);

  return (
    <div className="page">
      <div className="pl-toolbar">
        <div>
          <span className="eyebrow">{t("temps.surtitre")}</span>
          <h1 className="h1 titre-vue">{t("temps.titre")}</h1>
        </div>
        <span className="count-split">
          <b>{requete.data?.cumul.entrees ?? 0}</b> {t("temps.entrees", { n: requete.data?.cumul.entrees ?? 0 })}
          {" — "}
          <b>{formaterNombre(requete.data?.cumul.heures ?? 0, 1)}</b> {t("temps.hTotal")}
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
        <input
          className="f-input"
          type="date"
          value={debut}
          onChange={(e) => setDebut(e.target.value)}
          aria-label={t("temps.dateDebut")}
        />
        <input
          className="f-input"
          type="date"
          value={fin}
          onChange={(e) => setFin(e.target.value)}
          aria-label={t("temps.dateFin")}
        />
        {filtre ? (
          <Button className="chip-btn" onPress={reinitialiser}>
            {t("temps.reinitialiser")}
          </Button>
        ) : null}
      </div>

      {requete.isPending ? <Chargement quoi={t("temps.lesSaisies")} /> : null}
      {requete.isError ? (
        <ErreurDeChargement erreur={requete.error} surReessai={() => void requete.refetch()} />
      ) : null}

      {requete.data ? (
        saisies.length === 0 ? (
          <div className="empty empty-large">
            <p>{t("temps.videTitre")}</p>
            <small>{t("temps.videExplication")}</small>
            {peut("time_tracking:create") ? (
              <Button className="btn btn-primary" onPress={() => setSaisieOuverte(true)}>
                {t("temps.saisirPremiere")}
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="tlist">
            {parJour.map(([jour, liste]) => {
              const total = liste.reduce((n, s) => n + Number(s.heures), 0);
              const depasse = total > PLAFOND_PAR_DEFAUT;
              return (
                <div key={jour}>
                  <div className={`te-day${depasse ? " is-over" : ""}`}>
                    <span className="te-dlab">
                      <span className="te-dnum">{Number(jour.slice(8, 10))}</span>
                      <span className="te-dow">{formaterDateLongue(jour)}</span>
                    </span>
                    <span className="te-dtot">{t("heures", { n: total })}</span>
                    <span className="te-cap">
                      <Barre
                        valeur={(total / PLAFOND_PAR_DEFAUT) * 100}
                        libelle={t("temps.remplissageDuJour", { date: formaterDate(jour) })}
                      />
                      <span className="te-caplab">
                        {t("temps.surPlafond", { n: PLAFOND_PAR_DEFAUT })}
                      </span>
                    </span>
                    <span />
                  </div>

                  {liste.map((s) => (
                    <LigneSaisie key={s.id} saisie={s} />
                  ))}
                </div>
              );
            })}
          </div>
        )
      ) : null}

      <FenetreSaisie
        ouverte={saisieOuverte}
        surFermeture={() => setSaisieOuverte(false)}
        projets={projets.data?.projets ?? []}
      />
    </div>
  );
}

function LigneSaisie({ saisie }: { saisie: api.SaisieTemps }) {
  const { t } = useTranslation("occupations");
  const { t: tErreurs } = useTranslation("erreurs");
  const libelle = useLibelle();
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
        <span className="pchip">
          <span>
            {saisie.project ? saisie.project.nom : t("temps.horsProjet")}
          </span>
        </span>
      </span>

      <span className="te-h">{t("heures", { n: Number(saisie.heures) })}</span>

      <span className="bloc-etroit">
        <span className="te-desc">
          {saisie.task?.titre ?? saisie.description ?? t("temps.sansDescription")}
        </span>
        <span className="te-meta">
          <span className="te-created">{libelle(saisie.typeActivite, TYPES_ACTIVITE)}</span>
          <span className="te-created">
            {t("temps.creeLe", { date: formaterDate(saisie.creeLe) })}
          </span>
          {/* `RG-TMP-03` — l'acteur est immuable. Le dire ici évite de chercher
              où le corriger : il n'y a pas d'endroit. */}
          {saisie.thirdParty ? (
            <span className="te-actor">
              {t("temps.pourTiers", {
                qui: saisie.thirdParty.organisation ?? saisie.thirdParty.contactNom ?? "—",
              })}
            </span>
          ) : null}
        </span>
      </span>

      <span>
        {peut("time_tracking:delete") ? (
          <Button
            className="mdel"
            onPress={() => setSuppressionOuverte(true)}
            aria-label={t("temps.supprimerLaSaisie", { date: formaterDate(saisie.date) })}
          >
            <span aria-hidden="true">×</span>
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
