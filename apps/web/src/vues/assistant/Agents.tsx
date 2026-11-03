import { useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "react-aria-components";
import { JOURS_VIE_JETON, TYPES_ACTION_AGENT, type TypeActionAgent } from "@rationarium/contracts";
import * as api from "../../api/assistant.js";
import { messageErreur } from "../../api/erreurs.js";
import { Chargement, ErreurDeChargement, EtatVide } from "../../composants/etats.js";
import { Fenetre } from "../../composants/fenetre.js";
import { useMessages } from "../../composants/messages.js";
import { useLibelle } from "../../composants/pastilles.js";
import { formaterDate } from "../../formats.js";
import { horodatage } from "./formes.js";
import "../../composants/partages.css";
import "../projets/fiche.css";
import "./assistant.css";

/**
 * Mon compte › Agents — `EX-AST-02`, `RG-AST-02`, `RG-AST-03`, `RG-AST-05`.
 *
 * **Le jeton ne s'affiche qu'une fois.** Le serveur n'en garde que
 * l'empreinte : passé la fenêtre de création, personne — ni l'utilisateur, ni
 * l'administrateur — ne peut le relire. La fenêtre le dit en toutes lettres,
 * offre de le copier, et ne se referme que sur un geste explicite.
 *
 * **Révoquer se confirme en nommant le jeton et la conséquence** (`RG-GEN-01`)
 * : l'agent qui s'en sert est refusé dès sa requête suivante (`RG-AST-03`).
 */

const JOURS_MAX = JOURS_VIE_JETON * 2;
const COULEUR_ETAT: Record<api.EtatJeton, string> = {
  valide: "var(--st-done)",
  expire: "var(--st-review)",
  revoque: "var(--muted)",
};

export function AgentsDuCompte() {
  const { t } = useTranslation("assistant");
  const { t: tErreurs } = useTranslation("erreurs");
  const libelle = useLibelle();
  const annoncer = useMessages();
  const client = useQueryClient();
  const champLibelle = useRef<HTMLInputElement>(null);

  const [nom, setNom] = useState("");
  const [types, setTypes] = useState<TypeActionAgent[]>([]);
  const [jours, setJours] = useState("");
  const [erreurs, setErreurs] = useState<{ libelle?: string; jours?: string }>({});
  const [cree, setCree] = useState<api.JetonCree | null>(null);
  const [copie, setCopie] = useState(false);
  const [aRevoquer, setARevoquer] = useState<api.JetonAgent | null>(null);

  const requete = useQuery({ queryKey: ["assistant", "jetons"], queryFn: api.jetons });

  const creation = useMutation({
    mutationFn: () =>
      api.creerJeton({
        libelle: nom.trim(),
        ...(types.length > 0 ? { typesAutorises: types } : {}),
        ...(jours.trim() ? { joursValidite: Number(jours) } : {}),
      }),
    onSuccess: (r) => {
      setCree(r);
      setCopie(false);
      setNom("");
      setTypes([]);
      setJours("");
      void client.invalidateQueries({ queryKey: ["assistant"] });
    },
    onError: (e) => annoncer("err", messageErreur(e, tErreurs, t("jetons.echecCreation"))),
  });

  const revocation = useMutation({
    mutationFn: (jeton: api.JetonAgent) => api.revoquerJeton(jeton.id),
    onSuccess: (_r, jeton) => {
      setARevoquer(null);
      annoncer("ok", t("jetons.revoque", { libelle: jeton.libelle }));
      void client.invalidateQueries({ queryKey: ["assistant"] });
    },
    onError: (e) => {
      setARevoquer(null);
      annoncer("err", messageErreur(e, tErreurs, t("jetons.echecRevocation")));
    },
  });

  const soumettre = (e: FormEvent) => {
    e.preventDefault();
    /*
     * Le serveur revalide tout (`nouveauJetonSchema`) ; ces deux contrôles ne
     * servent qu'à dire l'erreur SUR LE CHAMP, avant l'aller-retour. `Number("")`
     * vaut zéro : le champ vide se teste sur la chaîne, jamais sur sa conversion.
     */
    const suivantes: { libelle?: string; jours?: string } = {};
    if (!nom.trim()) suivantes.libelle = t("jetons.libelleRequis");
    if (jours.trim()) {
      const n = Number(jours);
      if (!Number.isInteger(n) || n < 1 || n > JOURS_MAX) suivantes.jours = t("jetons.joursBornes", { max: JOURS_MAX });
    }
    setErreurs(suivantes);
    if (suivantes.libelle || suivantes.jours) return;
    creation.mutate();
  };

  const copier = async (jeton: string) => {
    try {
      await navigator.clipboard.writeText(jeton);
      setCopie(true);
      annoncer("ok", t("jetons.copie"));
    } catch {
      // Presse-papiers refusé (contexte non sécurisé, permission) : le jeton
      // reste sélectionnable dans le champ, et on le dit.
      annoncer("warn", t("jetons.copieImpossible"));
    }
  };

  /** « Tous les types d'action » quand le jeton n'en limite aucun (`RG-AST-05`). */
  const typesDe = (codes: readonly TypeActionAgent[]): string =>
    codes.length === 0 ? t("jetons.tousLesTypes") : codes.map((c) => libelle(c, TYPES_ACTION_AGENT)).join(", ");

  const basculerType = (code: TypeActionAgent) =>
    setTypes((liste) => (liste.includes(code) ? liste.filter((c) => c !== code) : [...liste, code]));

  return (
    <div className="two-col">
      <section className="panel" aria-labelledby="agents-creer">
        <div className="panel-head">
          <span className="panel-title" id="agents-creer">
            {t("jetons.creerTitre")}
          </span>
        </div>
        <form className="panel-body" onSubmit={soumettre} noValidate>
          <p className="field-hint ag-espace">{t("jetons.creerAide")}</p>
          <div className="field-block">
            <label className="field-label" htmlFor="jeton-libelle">
              {t("jetons.libelle")}
            </label>
            <input
              ref={champLibelle}
              id="jeton-libelle"
              className="field"
              type="text"
              maxLength={120}
              value={nom}
              aria-invalid={erreurs.libelle ? true : undefined}
              aria-describedby={erreurs.libelle ? "jeton-libelle-erreur" : "jeton-libelle-aide"}
              onChange={(e) => setNom(e.target.value)}
            />
            {erreurs.libelle ? (
              <p className="field-error" id="jeton-libelle-erreur">
                {erreurs.libelle}
              </p>
            ) : (
              <p className="field-hint" id="jeton-libelle-aide">
                {t("jetons.libelleAide")}
              </p>
            )}
          </div>

          <fieldset className="field-block ag-fieldset">
            <legend className="field-label">{t("jetons.types")}</legend>
            <p className="field-hint">{t("jetons.typesAide")}</p>
            <div className="ag-cases">
              {TYPES_ACTION_AGENT.map((type) => (
                <label className="check" key={type.code}>
                  <input
                    type="checkbox"
                    checked={types.includes(type.code)}
                    onChange={() => basculerType(type.code)}
                  />
                  <span>{libelle(type.code, TYPES_ACTION_AGENT)}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="field-block">
            <label className="field-label" htmlFor="jeton-jours">
              {t("jetons.validite")}
            </label>
            <input
              id="jeton-jours"
              className="field ag-champ-court"
              type="number"
              inputMode="numeric"
              min={1}
              max={JOURS_MAX}
              value={jours}
              placeholder={String(JOURS_VIE_JETON)}
              aria-invalid={erreurs.jours ? true : undefined}
              aria-describedby={erreurs.jours ? "jeton-jours-erreur" : "jeton-jours-aide"}
              onChange={(e) => setJours(e.target.value)}
            />
            {erreurs.jours ? (
              <p className="field-error" id="jeton-jours-erreur">
                {erreurs.jours}
              </p>
            ) : (
              <p className="field-hint" id="jeton-jours-aide">
                {t("jetons.validiteAide", { jours: JOURS_VIE_JETON })}
              </p>
            )}
          </div>

          <div className="ligne-actions-fin">
            <Button type="submit" className="btn btn-primary" isPending={creation.isPending}>
              {t("jetons.creer")}
            </Button>
          </div>
        </form>
      </section>

      <section className="panel" aria-labelledby="agents-liste">
        <div className="panel-head">
          <span className="panel-title" id="agents-liste">
            {t("jetons.listeTitre")}
          </span>
          {requete.data ? <span className="eyebrow">{t("jetons.nombre", { n: requete.data.length })}</span> : null}
        </div>
        {requete.isPending ? <Chargement quoi={t("jetons.lesJetons")} /> : null}
        {requete.isError ? <ErreurDeChargement erreur={requete.error} surReessai={() => void requete.refetch()} /> : null}
        {requete.data && requete.data.length === 0 ? (
          <EtatVide
            titre={t("jetons.videTitre")}
            explication={t("jetons.vide")}
            sortie={
              <Button className="btn" onPress={() => champLibelle.current?.focus()}>
                {t("jetons.creerPremier")}
              </Button>
            }
          />
        ) : null}
        {requete.data && requete.data.length > 0 ? (
          <ul className="ag-jetons">
            {requete.data.map((j) => (
              <li className="ag-jeton" key={j.id}>
                <div className="ag-act-head">
                  <span className="ag-act-type">{j.libelle}</span>
                  <span className="pill" style={{ color: COULEUR_ETAT[j.etat] }}>
                    {j.etat === "valide"
                      ? t("jetons.etatValide")
                      : j.etat === "expire"
                        ? t("jetons.etatExpire")
                        : t("jetons.etatRevoque")}
                  </span>
                  {j.etat === "valide" ? (
                    <Button className="chip-btn chip-danger ag-pousse" onPress={() => setARevoquer(j)}>
                      {t("jetons.revoquer")}
                    </Button>
                  ) : null}
                </div>
                <dl className="ag-faits">
                  <dt>{t("jetons.creeLe")}</dt>
                  <dd>{formaterDate(j.creeLe)}</dd>
                  <dt>{j.etat === "expire" ? t("jetons.expireLe") : t("jetons.expire")}</dt>
                  <dd>{formaterDate(j.expireLe)}</dd>
                  {j.revoqueLe ? (
                    <>
                      <dt>{t("jetons.revoqueLe")}</dt>
                      <dd>{horodatage(j.revoqueLe)}</dd>
                    </>
                  ) : null}
                  <dt>{t("jetons.dernierUsage")}</dt>
                  <dd>{j.dernierUsage ? horodatage(j.dernierUsage) : t("jetons.jamaisUtilise")}</dd>
                  <dt>{t("jetons.types")}</dt>
                  <dd>{typesDe(j.typesAutorises)}</dd>
                </dl>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {/*
        `RG-AST-02` — l'affichage unique. La fenêtre ne propose qu'une sortie,
        qui dit ce qu'on vient de faire : « J'ai rangé le jeton ». Un clic hors
        de la fenêtre la fermerait aussi ; le jeton serait alors perdu, ce que
        le texte annonce avant.
      */}
      <Fenetre
        ouverte={cree !== null}
        surFermeture={() => setCree(null)}
        categorie={t("jetons.creeCategorie")}
        titre={t("jetons.creeTitre", { libelle: cree?.libelle ?? "" })}
        mention={t("jetons.creeMention")}
        large
        actions={
          <Button className="btn btn-primary" onPress={() => setCree(null)}>
            {t("jetons.range")}
          </Button>
        }
      >
        <div className="alert alert-warn">
          <span className="alert-icon" aria-hidden="true">
            !
          </span>
          <span>{t("jetons.uneSeuleFois")}</span>
        </div>
        <div className="field-block ag-espace-haut">
          <label className="field-label" htmlFor="jeton-clair">
            {t("jetons.leJeton")}
          </label>
          <div className="ag-jeton-clair">
            <input
              id="jeton-clair"
              className="field ag-mono"
              type="text"
              readOnly
              value={cree?.jeton ?? ""}
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button className="btn btn-secondary" onPress={() => void copier(cree?.jeton ?? "")}>
              {copie ? t("jetons.copieOk") : t("jetons.copier")}
            </Button>
          </div>
          <p className="field-hint">{t("jetons.ouLeRanger")}</p>
        </div>
        {cree ? (
          <p className="field-hint">{t("jetons.creeResume", { expire: formaterDate(cree.expireLe), types: typesDe(cree.typesAutorises) })}</p>
        ) : null}
      </Fenetre>

      <Fenetre
        ouverte={aRevoquer !== null}
        surFermeture={() => setARevoquer(null)}
        categorie={t("jetons.revoquerCategorie")}
        titre={t("jetons.revoquerTitre", { libelle: aRevoquer?.libelle ?? "" })}
        mention={t("jetons.revoquerMention")}
        actions={
          <>
            <Button className="btn btn-secondary" onPress={() => setARevoquer(null)}>
              {t("actions.annuler")}
            </Button>
            <Button
              className="btn btn-danger"
              isPending={revocation.isPending}
              onPress={() => {
                if (aRevoquer) revocation.mutate(aRevoquer);
              }}
            >
              {t("jetons.revoquer")}
            </Button>
          </>
        }
      >
        <p className="phrase-confirmation">{t("jetons.revoquerTexte", { libelle: aRevoquer?.libelle ?? "" })}</p>
      </Fenetre>
    </div>
  );
}
