import { Fragment, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button } from "react-aria-components";
import { TYPES_ACTION_AGENT } from "@rationarium/contracts";
import * as api from "../../api/assistant.js";
import { ErreurApi } from "../../api/client.js";
import { messageErreur } from "../../api/erreurs.js";
import { Fenetre } from "../../composants/fenetre.js";
import { useMessages } from "../../composants/messages.js";
import { useLibelle } from "../../composants/pastilles.js";
import { formaterDate, formaterNombre } from "../../formats.js";
import {
  cheminDeLaCible,
  ecarts,
  estCreation,
  nomDeLaCible,
  texteValeur,
  type ContexteValeur,
} from "./difference.js";
import { ListePreuves, PastilleEtatAction } from "./elements.js";
import { horodatage } from "./formes.js";
import { etatDeLaLigne } from "./validation.js";
import "./assistant.css";

/**
 * Une action de l'agent — `docs/assistant/SPEC-PHASE-1.md § 11`.
 *
 * **La même ligne partout** : l'écran « Activité de l'agent » et l'onglet
 * « Suivi » d'un projet la partagent. Deux rendus d'une même action finiraient
 * par dire deux choses différentes, et c'est sur cette ligne qu'on décide de
 * défaire.
 *
 * Elle montre ce que l'agent a fait (type, entité, différence avant → après),
 * pourquoi (justification), d'après quoi (preuves), et ce qu'il en est advenu
 * (effectuée, refusée avec son motif, défaite par qui et quand).
 *
 * `RG-AST-21` — une action peut aussi ATTENDRE : la création d'un projet, et
 * les actions qui le désignent (`RG-AST-22`). Elle n'a rien écrit, donc rien
 * ne se défait ; elle se valide ou se rejette depuis la section « À valider »
 * de l'activité. Une fois décidée, la ligne dit qui a décidé et quand.
 */

/**
 * Tout ce que défaire peut changer ailleurs : l'entité rétablie ou supprimée
 * appartient à une vue qui ne sait pas qu'on vient d'écrire. Le `MutationCache`
 * de `main.tsx` couvre les vues d'agrégation ; celles-ci sont les vues de
 * l'entité elle-même.
 */
export const VUES_TOUCHEES = [["assistant"], ["projet"], ["projets"], ["tache"], ["taches"], ["evenements"], ["temps"]];

export function LigneAction({ action, avecProjet = false }: { action: api.ActionAgent; avecProjet?: boolean }) {
  const { t } = useTranslation("assistant");
  const { t: tErreurs } = useTranslation("erreurs");
  const libelle = useLibelle();
  const annoncer = useMessages();
  const client = useQueryClient();
  const [preuvesOuvertes, setPreuvesOuvertes] = useState(false);
  const [confirmation, setConfirmation] = useState(false);
  const [refusDefaire, setRefusDefaire] = useState<string | null>(null);

  const { creation, lignes } = ecarts(action.avant, action.apres);
  const nom = nomDeLaCible(action);
  const nature = action.cibleType ? t(`cibles.${action.cibleType}`) : t("cibles.aucune");
  const element = nom ? t("actions.elementNomme", { nature, nom }) : nature;
  const chemin = cheminDeLaCible(action);
  const etatLigne = etatDeLaLigne(action);

  const ctx: ContexteValeur = {
    cible: action.cibleType,
    libelle: (code, vocabulaire) => libelle(code, vocabulaire),
    formaterDate,
    oui: t("valeurs.oui"),
    non: t("valeurs.non"),
    vide: t("valeurs.vide"),
    pourcent: (n) => t("valeurs.pourcent", { n }),
    nombre: (n) => formaterNombre(n, Number.isInteger(n) ? 0 : Number.isInteger(n * 10) ? 1 : 2),
  };

  const defaire = useMutation({
    mutationFn: () => api.defaireAction(action.id),
    onSuccess: () => {
      setConfirmation(false);
      setRefusDefaire(null);
      annoncer("ok", t("actions.defaiteOk", { element }));
      for (const queryKey of VUES_TOUCHEES) void client.invalidateQueries({ queryKey });
    },
    onError: (e) => {
      /*
       * `RG-AST-18` — l'entité a changé depuis l'action : défaire écraserait
       * ce changement, et le serveur refuse. Le message le dit en clair, sur
       * la ligne même, et propose la seule sortie : corriger l'élément.
       *
       * Un refus du service métier (`defaireRefuse`) porte le motif de ce
       * service : il est cité après la phrase du produit.
       */
      const message = messageErreur(e, tErreurs, t("actions.echecDefaire"));
      const cite =
        e instanceof ErreurApi && e.cle === "assistant:erreurs.defaireRefuse" && e.message
          ? t("actions.refusCite", { message, motif: e.message })
          : message;
      setConfirmation(false);
      setRefusDefaire(cite);
      annoncer("err", cite);
      void client.invalidateQueries({ queryKey: ["assistant", "actions"] });
    },
  });

  const champsTouches = lignes.map((l) => t(`champs.${l.champ}`, { defaultValue: l.champ })).join(", ");

  return (
    <article className="ag-act" aria-labelledby={`action-${action.id}`}>
      <div className="ag-act-head">
        <span className="ag-act-type" id={`action-${action.id}`}>
          {libelle(action.type, TYPES_ACTION_AGENT)}
        </span>
        <PastilleEtatAction etat={action.etat} />
        {avecProjet && action.projetNom ? <span className="pill pill-muted">{action.projetNom}</span> : null}
        <span className="ag-act-when">{horodatage(action.creeLe)}</span>
      </div>

      <p className="ag-act-cible">
        <span className="eyebrow">{nature}</span>{" "}
        {chemin ? (
          <Link className="lien-route" to={chemin}>
            {nom ?? t("actions.ouvrirElement")}
          </Link>
        ) : (
          <span>{nom ?? t("actions.elementSansNom")}</span>
        )}
      </p>

      {lignes.length > 0 ? (
        <>
          <p className="eyebrow">{creation ? t("actions.creeAvec") : t("actions.changements")}</p>
          <dl className="ag-diff">
            {lignes.map((l) => (
              <Fragment key={l.champ}>
                <dt>{t(`champs.${l.champ}`, { defaultValue: l.champ })}</dt>
                <dd>
                  {creation ? (
                    <span className="ag-apres">{texteValeur(l.champ, l.apres, ctx)}</span>
                  ) : (
                    <>
                      <del className="ag-avant">{texteValeur(l.champ, l.avant, ctx)}</del>
                      <span className="ag-fleche" aria-hidden="true">
                        →
                      </span>
                      <span className="sr-only">{t("actions.devient")}</span>
                      <ins className="ag-apres">{texteValeur(l.champ, l.apres, ctx)}</ins>
                    </>
                  )}
                </dd>
              </Fragment>
            ))}
          </dl>
        </>
      ) : null}

      {action.justification ? (
        <p className="ag-justif">
          <span className="eyebrow">{t("actions.justification")}</span>
          <span className="ag-justif-t">{action.justification}</span>
        </p>
      ) : null}

      {action.etat === "refusee" && action.motifRefus ? (
        <div className="alert alert-error" role="note">
          <span className="alert-icon" aria-hidden="true">
            !
          </span>
          <span>
            {action.motifRefus.regle
              ? t("actions.refuseeRegle", { message: action.motifRefus.message, regle: action.motifRefus.regle })
              : t("actions.refusee", { message: action.motifRefus.message })}
          </span>
        </div>
      ) : null}

      {etatLigne.attente ? (
        <p className="field-hint">
          {action.dependDeId ? t("actions.attenteDependante") : t("actions.attenteValidation")}
        </p>
      ) : null}

      {etatLigne.decision?.nature === "rejetee" ? (
        <div className="alert alert-warn" role="note">
          <span className="alert-icon" aria-hidden="true">
            !
          </span>
          <span>
            {etatLigne.decision.qui
              ? t("actions.rejeteePar", { qui: etatLigne.decision.qui, quand: horodatage(etatLigne.decision.quand) })
              : t("actions.rejeteeLe", { quand: horodatage(etatLigne.decision.quand) })}
            {action.motifRefus?.message ? ` ${t("actions.motifRejet", { motif: action.motifRefus.message })}` : null}
          </span>
        </div>
      ) : null}

      {etatLigne.decision?.nature === "validee" ? (
        <p className="field-hint">
          {etatLigne.decision.qui
            ? t("actions.valideePar", { qui: etatLigne.decision.qui, quand: horodatage(etatLigne.decision.quand) })
            : t("actions.valideeLe", { quand: horodatage(etatLigne.decision.quand) })}
        </p>
      ) : null}

      {action.etat === "defaite" ? (
        <p className="field-hint">
          {action.defaitePar
            ? t("actions.defaitePar", { qui: action.defaitePar, quand: horodatage(action.defaiteLe) })
            : t("actions.defaiteLe", { quand: horodatage(action.defaiteLe) })}
        </p>
      ) : null}

      {refusDefaire ? (
        <div className="alert alert-warn" role="alert">
          <span className="alert-icon" aria-hidden="true">
            !
          </span>
          <span>{refusDefaire}</span>
        </div>
      ) : null}

      <div className="ag-act-foot">
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
        {etatLigne.defaisable ? (
          <Button className="chip-btn chip-danger" onPress={() => setConfirmation(true)}>
            {t("actions.defaire")}
          </Button>
        ) : null}
      </div>

      {preuvesOuvertes ? <ListePreuves preuves={action.preuves} id={`preuves-${action.id}`} /> : null}

      {/*
        `RG-GEN-01` — la confirmation NOMME l'élément et dit la conséquence.
        Défaire une création supprime l'entité (`RG-AST-18`) ; défaire une
        modification rend aux champs touchés leur valeur d'avant. Les deux
        phrases sont différentes parce que les deux gestes le sont.
      */}
      <Fenetre
        ouverte={confirmation}
        surFermeture={() => setConfirmation(false)}
        categorie={t("actions.confirmation")}
        titre={t("actions.defaireTitre", { element })}
        mention={t("actions.defaireMention")}
        actions={
          <>
            <Button className="btn btn-secondary" onPress={() => setConfirmation(false)}>
              {t("actions.annuler")}
            </Button>
            <Button className="btn btn-danger" isPending={defaire.isPending} onPress={() => defaire.mutate()}>
              {t("actions.defaire")}
            </Button>
          </>
        }
      >
        <p className="phrase-confirmation">
          {estCreation(action.type)
            ? t("actions.defaireCreation", { element })
            : champsTouches
              ? t("actions.defaireModification", { element, champs: champsTouches })
              : t("actions.defaireModificationSansDetail", { element })}
        </p>
      </Fenetre>
    </article>
  );
}

/**
 * Les actions, **groupées par projet** — `§ 13`. Un projet se lit d'un bloc :
 * ce que l'agent y a fait cette nuit, puis ce qu'il a fait ailleurs.
 * L'ordre des groupes suit la plus récente de leurs actions.
 */
export function groupesParProjet(
  actions: api.ActionAgent[],
): { projectId: string | null; projetNom: string | null; actions: api.ActionAgent[] }[] {
  const groupes = new Map<string, { projectId: string | null; projetNom: string | null; actions: api.ActionAgent[] }>();
  for (const a of actions) {
    const cle = a.projectId ?? "";
    const groupe = groupes.get(cle) ?? { projectId: a.projectId, projetNom: a.projetNom, actions: [] };
    groupe.actions.push(a);
    if (!groupe.projetNom && a.projetNom) groupe.projetNom = a.projetNom;
    groupes.set(cle, groupe);
  }
  return [...groupes.values()];
}
