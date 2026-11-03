import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button } from "react-aria-components";
import { TYPES_SOURCE_SUIVI, type SourceSuivi, type TypeSourceSuivi } from "@rationarium/contracts";
import * as api from "../../api/projets.js";
import * as apiAssistant from "../../api/assistant.js";
import { ErreurApi } from "../../api/client.js";
import { messageErreur } from "../../api/erreurs.js";
import { usePeut, useSession } from "../../session/session.js";
import { AccesRefuse, Chargement, ErreurDeChargement, EtatVide } from "../../composants/etats.js";
import { useMessages } from "../../composants/messages.js";
import { useLibelle } from "../../composants/pastilles.js";
import { LigneAction } from "../assistant/LigneAction.js";
import { ModuleDesactive, PastilleEtatPassage } from "../assistant/elements.js";
import { horodatage } from "../assistant/formes.js";
import { moduleDesactive, useModuleAssistant } from "../assistant/module.js";
import { CadreProjet } from "./Fiche.js";
import "../../composants/partages.css";
import "./fiche.css";
import "../assistant/assistant.css";

/**
 * Fiche projet › Suivi — `EX-AST-03`, `docs/assistant/SPEC-PHASE-1.md § 4.3, § 11, § 13`.
 *
 * **Le plan dit à l'agent quoi aller voir.** Une consigne libre, des sources
 * (une requête de courriel, un dépôt, un dossier, un canal, un flux, une page)
 * et un seuil de silence. Le serveur ne les interprète pas en phase 1 : il les
 * garde et les transmet à l'agent du poste.
 *
 * Sous le plan, les dernières actions de l'agent sur ce projet — la même ligne
 * que l'écran « Activité de l'agent », pour défaire d'ici ce qui est faux.
 *
 * **Modifier le plan exige de porter le projet** (`RG-PRJ-13` : créateur,
 * chef, sponsor ou `projects:manage_any`) : c'est la règle du serveur
 * (`exigerPorteurDuProjet`), reprise ici par courtoisie (`RG-GEN-06`).
 */

type SourceEditee = { type: TypeSourceSuivi; designation: string; libelle: string };

type Brouillon = {
  consigne: string;
  sources: SourceEditee[];
  silenceJours: string;
  actif: boolean;
};

const MAX_SOURCES = 50;

export const brouillonDuPlan = (plan: apiAssistant.PlanDeSuivi): Brouillon => ({
  consigne: plan.consigne ?? "",
  sources: plan.sources.map((s) => ({ type: s.type, designation: s.designation, libelle: s.libelle ?? "" })),
  silenceJours: plan.silenceJours === null ? "" : String(plan.silenceJours),
  // Un plan qui n'existe pas encore naît actif : c'est ce que le serveur pose
  // à la création, et ce qu'on vient faire en ouvrant cet onglet.
  actif: plan.version === 0 ? true : plan.actif,
});

/**
 * Le corps de `PUT /assistant/suivis/:projectId`, ou les erreurs qui
 * l'empêchent. Un libellé vide n'est pas envoyé : le contrat le veut absent,
 * pas vide. `Number("")` vaut zéro : le seuil vide se teste sur la chaîne.
 */
export function corpsDuPlan(
  b: Brouillon,
  version: number,
): { corps: Parameters<typeof apiAssistant.enregistrerPlanDeSuivi>[1] | null; erreurs: { sources: number[]; silence: boolean } } {
  const sources: SourceSuivi[] = b.sources.map((s) => ({
    type: s.type,
    designation: s.designation.trim(),
    ...(s.libelle.trim() ? { libelle: s.libelle.trim() } : {}),
  }));
  const fautives = sources.flatMap((s, i) => (s.designation === "" ? [i] : []));
  const brut = b.silenceJours.trim();
  const silence = brut === "" ? null : Number(brut);
  const silenceFaux = silence !== null && (!Number.isInteger(silence) || silence < 1 || silence > 365);
  if (fautives.length > 0 || silenceFaux) return { corps: null, erreurs: { sources: fautives, silence: silenceFaux } };
  return {
    corps: {
      consigne: b.consigne.trim() === "" ? null : b.consigne,
      sources,
      silenceJours: silence,
      actif: b.actif,
      version,
    },
    erreurs: { sources: [], silence: false },
  };
}

export function OngletSuiviAgent({ projetId }: { projetId: string }) {
  const { t } = useTranslation("assistant");
  const { t: tProjets } = useTranslation("projets");
  const { session } = useSession();
  const peut = usePeut();
  const assistant = useModuleAssistant();

  const projet = useQuery({ queryKey: ["projet", projetId], queryFn: () => api.fiche(projetId) });
  const plan = useQuery({
    queryKey: ["assistant", "suivi", projetId],
    queryFn: () => apiAssistant.planDeSuivi(projetId),
    retry: false,
  });

  if (projet.isPending) return <Chargement quoi={tProjets("fiche.leProjet")} />;
  if (projet.isError) return <ErreurDeChargement erreur={projet.error} surReessai={() => void projet.refetch()} />;

  const porteur =
    peut("projects:manage_any") ||
    [projet.data.createur?.id, projet.data.chef?.id, projet.data.sponsor?.id].includes(session.id);

  return (
    <CadreProjet projet={projet.data} onglet="suivi">
      <div className="pl-toolbar">
        <div>
          <h2 className="panel-title sous-titre-vue">{t("suivi.titre")}</h2>
          <p className="lede">{t("suivi.chapeau")}</p>
        </div>
        <div className="pl-toolbar-fin">
          <Link className="chip-btn" to="/assistant" search={{}}>
            {t("suivi.versActivite")}
          </Link>
        </div>
      </div>

      {plan.error && moduleDesactive(plan.error) ? <ModuleDesactive /> : null}
      {plan.error instanceof ErreurApi && plan.error.statut === 403 ? <AccesRefuse erreur={plan.error} /> : null}
      {plan.isPending ? <Chargement quoi={t("suivi.lePlan")} /> : null}
      {plan.isError && !moduleDesactive(plan.error) && !(plan.error instanceof ErreurApi && plan.error.statut === 403) ? (
        <ErreurDeChargement erreur={plan.error} surReessai={() => void plan.refetch()} />
      ) : null}

      {plan.data ? (
        <div className="two-col">
          <PlanDeSuivi projetId={projetId} plan={plan.data} modifiable={porteur} surRecharger={() => void plan.refetch()} />
          <div>
            <DernierPassage etat={assistant.etat} projetId={projetId} />
            <DernieresActions projetId={projetId} />
          </div>
        </div>
      ) : null}
    </CadreProjet>
  );
}

function PlanDeSuivi({
  projetId,
  plan,
  modifiable,
  surRecharger,
}: {
  projetId: string;
  plan: apiAssistant.PlanDeSuivi;
  modifiable: boolean;
  surRecharger: () => void;
}) {
  const { t } = useTranslation("assistant");
  const { t: tErreurs } = useTranslation("erreurs");
  const libelle = useLibelle();
  const annoncer = useMessages();
  const client = useQueryClient();
  const [brouillon, setBrouillon] = useState<Brouillon>(() => brouillonDuPlan(plan));
  const [erreurs, setErreurs] = useState<{ sources: number[]; silence: boolean }>({ sources: [], silence: false });
  const [conflit, setConflit] = useState(false);

  // Le brouillon repart du plan quand le plan change sous lui — après un
  // enregistrement, ou après le rechargement qui suit un conflit de version.
  useEffect(() => {
    setBrouillon(brouillonDuPlan(plan));
  }, [plan]);

  const reference = brouillonDuPlan(plan);
  const modifie = JSON.stringify(brouillon) !== JSON.stringify(reference);

  const enregistrement = useMutation({
    mutationFn: (corps: Parameters<typeof apiAssistant.enregistrerPlanDeSuivi>[1]) =>
      apiAssistant.enregistrerPlanDeSuivi(projetId, corps),
    onSuccess: (ecrit) => {
      setConflit(false);
      client.setQueryData(["assistant", "suivi", projetId], ecrit);
      annoncer("ok", t("suivi.enregistre"));
    },
    onError: (e) => {
      /*
       * `RG-GEN-07` — quelqu'un (ou l'agent, par `suivi.modifier`) a changé le
       * plan entre-temps. On ne réessaie pas en écrasant : on le dit, on
       * recharge, et la personne refait ses changements sur la version lue.
       */
      if (e instanceof ErreurApi && e.cle === "assistant:erreurs.conflitVersion") {
        setConflit(true);
        surRecharger();
      }
      annoncer("err", messageErreur(e, tErreurs, t("suivi.echecEnregistrement")));
    },
  });

  const enregistrer = () => {
    const { corps, erreurs: suivantes } = corpsDuPlan(brouillon, plan.version);
    setErreurs(suivantes);
    if (!corps) {
      annoncer("err", t("suivi.corrigerChamps"));
      return;
    }
    enregistrement.mutate(corps);
  };

  const majSource = (i: number, modif: Partial<SourceEditee>) =>
    setBrouillon((b) => ({ ...b, sources: b.sources.map((s, j) => (j === i ? { ...s, ...modif } : s)) }));

  return (
    <section className="panel" aria-labelledby="suivi-plan">
      <div className="panel-head">
        <span className="panel-title" id="suivi-plan">
          {t("suivi.plan")}
        </span>
        <span className="pill" style={{ color: plan.version === 0 ? "var(--muted)" : plan.actif ? "var(--st-done)" : "var(--st-review)" }}>
          {plan.version === 0 ? t("suivi.aucunPlan") : plan.actif ? t("suivi.actif") : t("suivi.suspendu")}
        </span>
      </div>
      <div className="panel-body">
        {plan.version === 0 ? <p className="field-hint">{t("suivi.aucunPlanAide")}</p> : null}
        {!modifiable ? <p className="field-hint">{t("suivi.lectureSeule")}</p> : null}

        {conflit ? (
          <div className="alert alert-warn" role="alert">
            <span className="alert-icon" aria-hidden="true">
              !
            </span>
            <span>{t("suivi.conflit")}</span>
          </div>
        ) : null}

        {modifie && modifiable ? (
          <div className="alert alert-warn ag-dirty" role="status">
            <span className="alert-icon" aria-hidden="true">
              !
            </span>
            <span>{t("suivi.nonEnregistre")}</span>
          </div>
        ) : null}

        <div className="field-block">
          <label className="field-label" htmlFor="suivi-consigne">
            {t("suivi.consigne")}
          </label>
          <textarea
            id="suivi-consigne"
            className="field ag-consigne"
            rows={5}
            maxLength={10_000}
            readOnly={!modifiable}
            value={brouillon.consigne}
            aria-describedby="suivi-consigne-aide"
            onChange={(e) => setBrouillon((b) => ({ ...b, consigne: e.target.value }))}
          />
          <p className="field-hint" id="suivi-consigne-aide">
            {t("suivi.consigneAide")}
          </p>
        </div>

        <fieldset className="field-block ag-fieldset">
          <legend className="field-label">{t("suivi.sources")}</legend>
          <p className="field-hint">{t("suivi.sourcesAide")}</p>
          {brouillon.sources.length === 0 ? (
            <div className="empty empty-encadre">
              <p>{t("suivi.aucuneSource")}</p>
              <small>{modifiable ? t("suivi.aucuneSourceAide") : t("suivi.aucuneSourceLecture")}</small>
            </div>
          ) : (
            <ul className="ag-sources">
              {brouillon.sources.map((s, i) => {
                const enErreur = erreurs.sources.includes(i);
                return (
                  <li className="ag-source" key={i}>
                    <div className="ag-source-grille">
                      <div>
                        <label className="field-label" htmlFor={`source-type-${i}`}>
                          {t("suivi.sourceType")}
                        </label>
                        <select
                          id={`source-type-${i}`}
                          className="f-input"
                          disabled={!modifiable}
                          value={s.type}
                          onChange={(e) => {
                            const type = TYPES_SOURCE_SUIVI.find((x) => x.code === e.target.value)?.code;
                            if (type) majSource(i, { type });
                          }}
                        >
                          {TYPES_SOURCE_SUIVI.map((x) => (
                            <option key={x.code} value={x.code}>
                              {libelle(x.code, TYPES_SOURCE_SUIVI)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="field-label" htmlFor={`source-designation-${i}`}>
                          {t("suivi.sourceDesignation")}
                        </label>
                        <input
                          id={`source-designation-${i}`}
                          className="field ag-mono"
                          type="text"
                          maxLength={1000}
                          readOnly={!modifiable}
                          value={s.designation}
                          aria-invalid={enErreur ? true : undefined}
                          aria-describedby={enErreur ? `source-designation-${i}-erreur` : undefined}
                          onChange={(e) => majSource(i, { designation: e.target.value })}
                        />
                        {enErreur ? (
                          <p className="field-error" id={`source-designation-${i}-erreur`}>
                            {t("suivi.designationRequise")}
                          </p>
                        ) : null}
                      </div>
                      <div>
                        <label className="field-label" htmlFor={`source-libelle-${i}`}>
                          {t("suivi.sourceLibelle")}
                        </label>
                        <input
                          id={`source-libelle-${i}`}
                          className="field"
                          type="text"
                          maxLength={160}
                          readOnly={!modifiable}
                          value={s.libelle}
                          onChange={(e) => majSource(i, { libelle: e.target.value })}
                        />
                      </div>
                    </div>
                    {modifiable ? (
                      <Button
                        className="chip-btn chip-danger"
                        aria-label={t("suivi.retirerSourceNommee", {
                          source: s.libelle || s.designation || libelle(s.type, TYPES_SOURCE_SUIVI),
                        })}
                        onPress={() => setBrouillon((b) => ({ ...b, sources: b.sources.filter((_x, j) => j !== i) }))}
                      >
                        {t("suivi.retirerSource")}
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
          {modifiable && brouillon.sources.length < MAX_SOURCES ? (
            <Button
              className="chip-btn"
              onPress={() =>
                setBrouillon((b) => ({
                  ...b,
                  sources: [...b.sources, { type: "courriel", designation: "", libelle: "" }],
                }))
              }
            >
              {t("suivi.ajouterSource")}
            </Button>
          ) : null}
        </fieldset>

        <div className="field-block">
          <label className="field-label" htmlFor="suivi-silence">
            {t("suivi.silence")}
          </label>
          <input
            id="suivi-silence"
            className="field ag-champ-court"
            type="number"
            inputMode="numeric"
            min={1}
            max={365}
            readOnly={!modifiable}
            value={brouillon.silenceJours}
            aria-invalid={erreurs.silence ? true : undefined}
            aria-describedby="suivi-silence-aide"
            onChange={(e) => setBrouillon((b) => ({ ...b, silenceJours: e.target.value }))}
          />
          {erreurs.silence ? <p className="field-error">{t("suivi.silenceBornes")}</p> : null}
          <p className="field-hint" id="suivi-silence-aide">
            {t("suivi.silenceAide")}
          </p>
        </div>

        <label className="check ag-check">
          <input
            type="checkbox"
            checked={brouillon.actif}
            disabled={!modifiable}
            aria-describedby="suivi-actif-aide"
            onChange={(e) => setBrouillon((b) => ({ ...b, actif: e.target.checked }))}
          />
          <span>{t("suivi.planActif")}</span>
        </label>
        <p className="field-hint" id="suivi-actif-aide">
          {brouillon.actif ? t("suivi.planActifAide") : t("suivi.planSuspenduAide")}
        </p>

        {modifiable ? (
          <div className="ligne-actions-fin ag-espace-haut">
            {modifie ? (
              <Button className="chip-btn" onPress={() => setBrouillon(reference)}>
                {t("suivi.annulerModifications")}
              </Button>
            ) : null}
            <Button
              className="btn btn-primary"
              isPending={enregistrement.isPending}
              onPress={() => {
                if (modifie || plan.version === 0) enregistrer();
                else annoncer("ok", t("suivi.rienAEnregistrer"));
              }}
            >
              {plan.version === 0 ? t("suivi.creerPlan") : t("suivi.enregistrer")}
            </Button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

/** Le dernier passage, quand il a porté sur ce projet — tous les projets suivis, ou lui nommément. */
function DernierPassage({ etat, projetId }: { etat: apiAssistant.EtatAssistant | undefined; projetId: string }) {
  const { t } = useTranslation("assistant");
  const p = etat?.dernierPassage;
  if (!p || (p.projectIds.length > 0 && !p.projectIds.includes(projetId))) return null;
  return (
    <section className="panel ag-espace">
      <div className="panel-head">
        <span className="panel-title">{t("passage.dernier")}</span>
        <PastilleEtatPassage etat={p.etat} />
      </div>
      <div className="panel-body">
        <p className="field-hint">
          {t("suivi.passageDu", { quand: horodatage(p.creeLe) })}{" "}
          <Link className="lien-route" to="/assistant" search={{ passage: p.id }}>
            {t("suivi.voirPassage")}
          </Link>
        </p>
      </div>
    </section>
  );
}

function DernieresActions({ projetId }: { projetId: string }) {
  const { t } = useTranslation("assistant");
  const requete = useQuery({
    queryKey: ["assistant", "actions", { projectId: projetId, limite: 20 }],
    queryFn: () => apiAssistant.actions({ projectId: projetId, limite: 20 }),
    retry: false,
  });

  return (
    <section className="panel" aria-labelledby="suivi-actions">
      <div className="panel-head">
        <span className="panel-title" id="suivi-actions">
          {t("suivi.dernieresActions")}
        </span>
      </div>
      {requete.isPending ? <Chargement quoi={t("activite.lesActions")} /> : null}
      {requete.isError ? <ErreurDeChargement erreur={requete.error} surReessai={() => void requete.refetch()} /> : null}
      {requete.data && requete.data.length === 0 ? (
        <EtatVide
          titre={t("suivi.aucuneActionTitre")}
          explication={t("suivi.aucuneAction")}
          sortie={
            <Link className="btn" to="/assistant" search={{}}>
              {t("suivi.versActivite")}
            </Link>
          }
        />
      ) : null}
      {requete.data && requete.data.length > 0 ? (
        <div className="ag-liste">
          {requete.data.map((a) => (
            <LigneAction key={a.id} action={a} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
