import { useTranslation } from "react-i18next";
import { Button } from "react-aria-components";
import {
  CRON_CINQ_CHAMPS,
  MODES_ASSISTANT,
  reglagesAssistantSchema,
  type ModeAssistant,
  type ReglagesAssistant,
} from "@rationarium/contracts";
import { useLibelle } from "../../composants/pastilles.js";
import "./assistant.css";

/**
 * Paramétrage › Assistant — `EX-AST-01`, `EX-AST-05`, `docs/assistant/SPEC-PHASE-1.md § 7`.
 *
 * Le brouillon vit dans la vue 31, avec celui des autres onglets : un seul
 * bandeau « modifications non enregistrées », un seul « Enregistrer », et le
 * même avertissement à la sortie (`RG-PRM-05`). Un onglet qui garderait son
 * propre brouillon le perdrait en silence au changement d'onglet.
 *
 * Les deux nombres se saisissent en TEXTE et se convertissent à
 * l'enregistrement : `Number("")` vaut zéro, et un champ vidé pour être
 * ressaisi deviendrait « zéro jour » sans que personne l'ait écrit.
 */
export type BrouillonAssistant = {
  mode: ModeAssistant;
  planification: string;
  jalonObligatoire: boolean;
  conservationJours: string;
  actionsParPassage: string;
};

export type ErreursAssistant = Partial<Record<"planification" | "conservationJours" | "actionsParPassage", true>>;

export const versBrouillon = (r: ReglagesAssistant): BrouillonAssistant => ({
  mode: r.mode,
  planification: r.planification,
  jalonObligatoire: r.jalonObligatoire,
  conservationJours: String(r.conservationJours),
  actionsParPassage: String(r.actionsParPassage),
});

const entier = (texte: string): number => (texte.trim() === "" ? Number.NaN : Number(texte));

/**
 * Le brouillon, converti et validé par le schéma du contrat — celui-là même
 * que `PUT /assistant/reglages` applique. Une erreur se rapporte à son champ ;
 * le serveur reste juge.
 */
export function depuisBrouillon(b: BrouillonAssistant): { valeurs: ReglagesAssistant | null; erreurs: ErreursAssistant } {
  const candidat = {
    mode: b.mode,
    planification: b.planification.trim().replace(/\s+/g, " "),
    jalonObligatoire: b.jalonObligatoire,
    conservationJours: entier(b.conservationJours),
    actionsParPassage: entier(b.actionsParPassage),
  };
  const erreurs: ErreursAssistant = {};
  if (candidat.planification !== "" && !CRON_CINQ_CHAMPS.test(candidat.planification)) erreurs.planification = true;
  const conservation = candidat.conservationJours;
  if (!Number.isInteger(conservation) || conservation < 30 || conservation > 1830) erreurs.conservationJours = true;
  const plafond = candidat.actionsParPassage;
  if (!Number.isInteger(plafond) || plafond < 1 || plafond > 1000) erreurs.actionsParPassage = true;
  const lu = reglagesAssistantSchema.safeParse(candidat);
  return { valeurs: lu.success && Object.keys(erreurs).length === 0 ? lu.data : null, erreurs };
}

export const brouillonsEgaux = (a: BrouillonAssistant, b: BrouillonAssistant): boolean =>
  a.mode === b.mode &&
  a.planification.trim() === b.planification.trim() &&
  a.jalonObligatoire === b.jalonObligatoire &&
  a.conservationJours.trim() === b.conservationJours.trim() &&
  a.actionsParPassage.trim() === b.actionsParPassage.trim();

export function OngletAssistant({
  brouillon,
  ecrire,
  erreurs,
}: {
  brouillon: BrouillonAssistant;
  ecrire: (modification: Partial<BrouillonAssistant>) => void;
  erreurs: ErreursAssistant;
}) {
  const { t } = useTranslation("assistant");
  const libelle = useLibelle();

  return (
    <div className="two-col">
      <div>
        <section className="panel panel-espace">
          <div className="panel-head">
            <span className="panel-title">{t("reglages.mode")}</span>
          </div>
          <div className="panel-body">
            <div className="opt-list" role="radiogroup" aria-label={t("reglages.mode")}>
              {MODES_ASSISTANT.map((m) => (
                <Button
                  key={m.code}
                  className="opt"
                  aria-pressed={brouillon.mode === m.code}
                  onPress={() => ecrire({ mode: m.code })}
                >
                  <span className="opt-mark" aria-hidden="true" />
                  <span className="opt-n">{libelle(m.code, MODES_ASSISTANT)}</span>
                  <span className="opt-ex">{m.code === "desactive" ? t("reglages.modeDesactiveEx") : t("reglages.modeRelaisEx")}</span>
                </Button>
              ))}
            </div>
            <p className="field-hint">
              {brouillon.mode === "desactive" ? t("reglages.modeDesactiveAide") : t("reglages.modeRelaisAide")}
            </p>
          </div>
        </section>

        <section className="panel panel-espace">
          <div className="panel-head">
            <span className="panel-title">{t("reglages.planification")}</span>
          </div>
          <div className="panel-body">
            <label className="field-label" htmlFor="assistant-planification">
              {t("reglages.expressionCron")}
            </label>
            <input
              id="assistant-planification"
              className="field ag-mono"
              type="text"
              maxLength={120}
              spellCheck={false}
              placeholder={t("reglages.cronExemple")}
              value={brouillon.planification}
              aria-invalid={erreurs.planification ? true : undefined}
              aria-describedby="assistant-planification-aide"
              onChange={(e) => ecrire({ planification: e.target.value })}
            />
            {erreurs.planification ? <p className="field-error">{t("reglages.cronInvalide")}</p> : null}
            <p className="field-hint" id="assistant-planification-aide">
              {brouillon.planification.trim() === "" ? t("reglages.sansPlanification") : t("reglages.planificationAide")}
            </p>
          </div>
        </section>
      </div>

      <div>
        <section className="panel panel-espace">
          <div className="panel-head">
            <span className="panel-title">{t("reglages.regles")}</span>
          </div>
          <div className="panel-body">
            <label className="check ag-check">
              <input
                type="checkbox"
                checked={brouillon.jalonObligatoire}
                aria-describedby="assistant-jalon-aide"
                onChange={(e) => ecrire({ jalonObligatoire: e.target.checked })}
              />
              <span>{t("reglages.jalonObligatoire")}</span>
            </label>
            <p className="field-hint" id="assistant-jalon-aide">
              {brouillon.jalonObligatoire ? t("reglages.jalonObligatoireAide") : t("reglages.jalonFacultatifAide")}
            </p>

            <div className="field-block ag-espace-haut">
              <label className="field-label" htmlFor="assistant-plafond">
                {t("reglages.actionsParPassage")}
              </label>
              <input
                id="assistant-plafond"
                className="field ag-champ-court"
                type="number"
                inputMode="numeric"
                min={1}
                max={1000}
                value={brouillon.actionsParPassage}
                aria-invalid={erreurs.actionsParPassage ? true : undefined}
                aria-describedby="assistant-plafond-aide"
                onChange={(e) => ecrire({ actionsParPassage: e.target.value })}
              />
              {erreurs.actionsParPassage ? <p className="field-error">{t("reglages.plafondBornes")}</p> : null}
              <p className="field-hint" id="assistant-plafond-aide">
                {t("reglages.actionsParPassageAide")}
              </p>
            </div>
          </div>
        </section>

        <section className="panel panel-espace">
          <div className="panel-head">
            <span className="panel-title">{t("reglages.conservation")}</span>
          </div>
          <div className="panel-body">
            <label className="field-label" htmlFor="assistant-conservation">
              {t("reglages.conservationJours")}
            </label>
            <input
              id="assistant-conservation"
              className="field ag-champ-court"
              type="number"
              inputMode="numeric"
              min={30}
              max={1830}
              value={brouillon.conservationJours}
              aria-invalid={erreurs.conservationJours ? true : undefined}
              aria-describedby="assistant-conservation-aide"
              onChange={(e) => ecrire({ conservationJours: e.target.value })}
            />
            {erreurs.conservationJours ? <p className="field-error">{t("reglages.conservationBornes")}</p> : null}
            <p className="field-hint" id="assistant-conservation-aide">
              {t("reglages.conservationAide")}
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
