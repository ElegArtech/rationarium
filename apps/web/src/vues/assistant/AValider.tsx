import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button } from "react-aria-components";
import {
  JOURS_REFUS_ACTION_DEFAITE,
  PRIORITES,
  STATUTS_PROJET,
  TYPES_ACTION_AGENT,
  TYPES_SOURCE_SUIVI,
} from "@rationarium/contracts";
import * as api from "../../api/assistant.js";
import { messageErreur } from "../../api/erreurs.js";
import { Fenetre } from "../../composants/fenetre.js";
import { useMessages } from "../../composants/messages.js";
import { useLibelle } from "../../composants/pastilles.js";
import { formaterDate } from "../../formats.js";
import { nomDeLaCible } from "./difference.js";
import { ListePreuves, PastilleEtatAction } from "./elements.js";
import { horodatage } from "./formes.js";
import { VUES_TOUCHEES } from "./LigneAction.js";
import { compteRenduValidation, projetPropose, type CreationEnAttente, type LigneCompteRendu } from "./validation.js";
import "./assistant.css";

/**
 * Activité de l'agent › À valider — `RG-AST-21`, `RG-AST-22`.
 *
 * **La création d'un projet par l'agent, et elle seule, attend une décision.**
 * Chaque carte montre ce que l'agent propose — nom, dates, statut, plan de
 * suivi —, pourquoi et d'après quoi, et la liste des actions qui attendent avec
 * le projet. Valider crée le tout avec l'identité de qui valide ; rejeter
 * n'écrit rien, et l'agent ne repropose pas ce projet.
 *
 * Le compte rendu d'une validation vit ICI, au-dessus des cartes : la carte
 * validée quitte la liste dès la relecture, et un compte rendu porté par elle
 * disparaîtrait avec elle avant d'avoir été lu.
 */

type CompteRendu = { nom: string; lignes: ReturnType<typeof compteRenduValidation> };

export function SectionAValider({ creations }: { creations: CreationEnAttente[] }) {
  const { t } = useTranslation("assistant");
  const [comptes, setComptes] = useState<CompteRendu[]>([]);

  if (creations.length === 0 && comptes.length === 0) return null;

  return (
    <section className="ag-espace" aria-labelledby="assistant-a-valider">
      <div className="pl-toolbar">
        <h2 className="panel-title sous-titre-vue" id="assistant-a-valider">
          {t("validation.titre", { n: creations.length })}
        </h2>
      </div>
      {creations.length > 0 ? <p className="field-hint ag-espace">{t("validation.chapeau")}</p> : null}

      {comptes.map((c, i) => (
        <CompteRenduDeValidation
          key={c.lignes.projet.actionId}
          compte={c}
          surFermeture={() => setComptes((liste) => liste.filter((_, j) => j !== i))}
        />
      ))}

      {creations.map((c) => (
        <CarteCreation
          key={c.projet.id}
          creation={c}
          surValidation={(compte) => setComptes((liste) => [compte, ...liste])}
        />
      ))}
    </section>
  );
}

function CarteCreation({
  creation,
  surValidation,
}: {
  creation: CreationEnAttente;
  surValidation: (compte: CompteRendu) => void;
}) {
  const { t } = useTranslation("assistant");
  const { t: tErreurs } = useTranslation("erreurs");
  const libelle = useLibelle();
  const annoncer = useMessages();
  const client = useQueryClient();
  const [confirmation, setConfirmation] = useState(false);
  const [rejet, setRejet] = useState(false);
  const [motif, setMotif] = useState("");
  const [preuvesOuvertes, setPreuvesOuvertes] = useState(false);

  const { projet: action, dependantes } = creation;
  const p = projetPropose(action.charge);
  const nom = p.nom ?? t("activite.projetSansNom");
  const n = dependantes.length;
  const idTitre = `a-valider-${action.id}`;

  const rafraichir = () => {
    for (const queryKey of VUES_TOUCHEES) void client.invalidateQueries({ queryKey });
  };

  const validation = useMutation({
    mutationFn: () => api.valider(action.id),
    onSuccess: (reponse) => {
      setConfirmation(false);
      const lignes = compteRenduValidation(reponse, creation);
      const refusees = lignes.dependantes.filter((l) => !l.effectuee).length;
      if (!lignes.projet.effectuee) annoncer("err", t("validation.projetNonCree", { nom }));
      else if (refusees > 0) annoncer("warn", t("validation.valideAvecRefus", { nom, refusees }));
      else annoncer("ok", t("validation.valide", { nom }));
      surValidation({ nom, lignes });
      rafraichir();
    },
    onError: (e) => {
      setConfirmation(false);
      annoncer("err", messageErreur(e, tErreurs, t("validation.echecValidation")));
      void client.invalidateQueries({ queryKey: ["assistant"] });
    },
  });

  const rejeter = useMutation({
    mutationFn: () => api.rejeter(action.id, motif),
    onSuccess: (r) => {
      setRejet(false);
      setMotif("");
      // `rejetees` compte la création ET ses dépendantes : la phrase ne nomme que ces dernières.
      annoncer("ok", t("validation.rejete", { nom, n: Math.max(0, r.rejetees - 1) }));
      void client.invalidateQueries({ queryKey: ["assistant"] });
    },
    onError: (e) => {
      setRejet(false);
      annoncer("err", messageErreur(e, tErreurs, t("validation.echecRejet")));
      void client.invalidateQueries({ queryKey: ["assistant"] });
    },
  });

  const sources = p.suivi?.sources ?? [];

  return (
    <article className="panel ag-groupe" aria-labelledby={idTitre}>
      <div className="panel-head">
        <span className="panel-title" id={idTitre}>
          {nom}
        </span>
        <span className="pills">
          <PastilleEtatAction etat={action.etat} />
          <span className="ag-act-when">{horodatage(action.creeLe)}</span>
        </span>
      </div>
      <div className="panel-body">
        <dl className="ag-faits">
          <dt>{t("validation.dates")}</dt>
          <dd>
            {p.dateDebut && p.dateFin
              ? t("validation.du", { debut: formaterDate(p.dateDebut), fin: formaterDate(p.dateFin) })
              : t("valeurs.vide")}
          </dd>
          <dt>{t("champs.statut")}</dt>
          <dd>{p.statut ? libelle(p.statut, STATUTS_PROJET) : t("validation.statutParDefaut")}</dd>
          {p.priorite ? (
            <>
              <dt>{t("champs.priorite")}</dt>
              <dd>{libelle(p.priorite, PRIORITES)}</dd>
            </>
          ) : null}
          {p.description ? (
            <>
              <dt>{t("champs.description")}</dt>
              <dd className="ag-justif-t">{p.description}</dd>
            </>
          ) : null}
          <dt>{t("validation.planDeSuivi")}</dt>
          <dd>
            {p.suivi ? (
              <span className="ag-pile">
                {p.suivi.consigne ? <span className="ag-justif-t">{p.suivi.consigne}</span> : null}
                {sources.length > 0 ? (
                  <ul className="ag-points">
                    {sources.map((s, i) => (
                      <li key={`${s.type}-${i}`}>
                        {t("validation.source", {
                          type: libelle(s.type, TYPES_SOURCE_SUIVI),
                          designation: s.libelle ? `${s.libelle} (${s.designation})` : s.designation,
                        })}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span>{t("validation.aucuneSource")}</span>
                )}
                {p.suivi.silenceJours !== null ? (
                  <span className="ag-sous">{t("validation.silence", { jours: p.suivi.silenceJours })}</span>
                ) : null}
              </span>
            ) : (
              t("validation.sansPlan")
            )}
          </dd>
        </dl>

        {action.justification ? (
          <p className="ag-justif">
            <span className="eyebrow">{t("actions.justification")}</span>
            <span className="ag-justif-t">{action.justification}</span>
          </p>
        ) : null}

        <div className="ag-act-foot ag-espace-haut">
          {action.preuves.length > 0 ? (
            <Button
              className="chip-btn"
              aria-expanded={preuvesOuvertes}
              aria-controls={`preuves-${action.id}`}
              onPress={() => setPreuvesOuvertes((o) => !o)}
            >
              {preuvesOuvertes
                ? t("actions.masquerPreuves", { n: action.preuves.length })
                : t("actions.voirPreuves", { n: action.preuves.length })}
            </Button>
          ) : (
            <span className="field-hint">{t("actions.aucunePreuve")}</span>
          )}
        </div>
        {preuvesOuvertes ? <ListePreuves preuves={action.preuves} id={`preuves-${action.id}`} /> : null}

        <p className="eyebrow ag-espace-haut">{t("validation.dependantes", { n })}</p>
        {n > 0 ? (
          <ul className="ag-points">
            {dependantes.map((d) => (
              <li key={d.id}>
                {t("validation.dependante", {
                  type: libelle(d.type, TYPES_ACTION_AGENT),
                  nom: nomDeLaCible(d) ?? t("actions.elementSansNom"),
                })}
              </li>
            ))}
          </ul>
        ) : (
          <p className="field-hint">{t("validation.aucuneDependante")}</p>
        )}

        <div className="ligne-actions ag-espace-haut">
          <Button className="btn btn-primary" onPress={() => setConfirmation(true)}>
            {t("validation.valider")}
          </Button>
          <Button className="btn btn-secondary" onPress={() => setRejet(true)}>
            {t("validation.rejeter")}
          </Button>
        </div>
      </div>

      {/* `RG-GEN-01` — la confirmation nomme le projet et dit la conséquence : ce
          qui sera créé, et sous quelle identité. */}
      <Fenetre
        ouverte={confirmation}
        surFermeture={() => setConfirmation(false)}
        categorie={t("actions.confirmation")}
        titre={t("validation.validerTitre", { nom })}
        mention={t("validation.validerMention")}
        actions={
          <>
            <Button className="btn btn-secondary" onPress={() => setConfirmation(false)}>
              {t("actions.annuler")}
            </Button>
            <Button className="btn btn-primary" isPending={validation.isPending} onPress={() => validation.mutate()}>
              {t("validation.valider")}
            </Button>
          </>
        }
      >
        <p className="phrase-confirmation">{t("validation.validerTexte", { nom, n })}</p>
      </Fenetre>

      <Fenetre
        ouverte={rejet}
        surFermeture={() => setRejet(false)}
        categorie={t("actions.confirmation")}
        titre={t("validation.rejeterTitre", { nom })}
        mention={t("validation.rejeterMention", { jours: JOURS_REFUS_ACTION_DEFAITE })}
        actions={
          <>
            <Button className="btn btn-secondary" onPress={() => setRejet(false)}>
              {t("actions.annuler")}
            </Button>
            <Button className="btn btn-danger" isPending={rejeter.isPending} onPress={() => rejeter.mutate()}>
              {t("validation.rejeter")}
            </Button>
          </>
        }
      >
        <p className="phrase-confirmation">{t("validation.rejeterTexte", { nom, n })}</p>
        <div className="field-block">
          <label className="field-label" htmlFor={`motif-${action.id}`}>
            {t("validation.motif")}
          </label>
          <textarea
            id={`motif-${action.id}`}
            className="field"
            rows={3}
            maxLength={1000}
            value={motif}
            aria-describedby={`motif-${action.id}-aide`}
            onChange={(e) => setMotif(e.target.value)}
          />
          <p className="field-hint" id={`motif-${action.id}-aide`}>
            {t("validation.motifAide")}
          </p>
        </div>
      </Fenetre>
    </article>
  );
}

/**
 * Ce que la validation a produit — comme un import (`RG-IMP-04`) : le projet
 * créé, avec le lien vers sa fiche, puis chaque dépendante effectuée ou refusée
 * avec son motif. Une dépendante refusée l'est seule ; le projet reste créé.
 */
function CompteRenduDeValidation({ compte, surFermeture }: { compte: CompteRendu; surFermeture: () => void }) {
  const { t } = useTranslation("assistant");
  const libelle = useLibelle();
  const { projet, dependantes } = compte.lignes;
  const refusees = dependantes.filter((d) => !d.effectuee).length;
  const classe = !projet.effectuee ? "alert-error" : refusees > 0 ? "alert-warn" : "alert-success";

  const nomDe = (l: LigneCompteRendu): string =>
    l.type
      ? t("validation.dependante", { type: libelle(l.type, TYPES_ACTION_AGENT), nom: l.nom ?? t("actions.elementSansNom") })
      : (l.nom ?? t("actions.elementSansNom"));

  return (
    <div className={`alert ${classe} ag-espace`} role="status">
      <span className="alert-icon" aria-hidden="true">
        !
      </span>
      <span className="bloc-etroit">
        {projet.effectuee && projet.cibleId ? (
          <span>
            {t("validation.projetCree")}{" "}
            <Link className="lien-route" to="/projets/$id" params={{ id: projet.cibleId }}>
              {compte.nom}
            </Link>
          </span>
        ) : (
          <span>
            {t("validation.projetNonCree", { nom: compte.nom })}
            {projet.motif?.message ? ` ${t("validation.motifCite", { motif: projet.motif.message })}` : null}
          </span>
        )}
        {dependantes.length > 0 ? (
          <>
            <span>
              {t("validation.bilanDependantes", { effectuees: dependantes.length - refusees, refusees })}
            </span>
            <ul className="ag-points">
              {dependantes.map((d) => (
                <li key={d.actionId}>
                  {d.effectuee
                    ? t("validation.dependanteEffectuee", { action: nomDe(d) })
                    : d.motif?.message
                      ? t("validation.dependanteRefusee", { action: nomDe(d), motif: d.motif.message })
                      : t("validation.dependanteRefuseeSansMotif", { action: nomDe(d) })}
                </li>
              ))}
            </ul>
          </>
        ) : null}
        <span>
          <Button className="chip-btn" onPress={surFermeture}>
            {t("validation.fermerCompteRendu")}
          </Button>
        </span>
      </span>
    </div>
  );
}
