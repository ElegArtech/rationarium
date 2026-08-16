import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button } from "react-aria-components";
import { TYPES_TIERS, STATUTS_PROJET, STATUTS_TACHE } from "@trame/contracts";
import * as api from "../../api/referentiels.js";
import { messageErreur } from "../../api/erreurs.js";
import { usePeut } from "../../session/session.js";
import { Chargement, ErreurDeChargement } from "../../composants/etats.js";
import { Fenetre } from "../../composants/fenetre.js";
import { useMessages } from "../../composants/messages.js";
import { Pastille, useLibelle } from "../../composants/pastilles.js";
import "../../composants/partages.css";
import "../taches/liste.css";
import "../projets/fiche.css";
import "./tiers.css";

/**
 * Vue 23 — Tiers.
 *
 * **Le contact nommé n'existe que pour une personne physique.** Une personne
 * morale porte une organisation et des contacts, pas un contact unique
 * (`RG-TRS-01`). Les champs ne sont donc pas grisés : ils **disparaissent**.
 * Un champ grisé invite à chercher comment le remplir ; un champ absent dit
 * que la question ne se pose pas.
 *
 * **Un tiers archivé reste consultable.** Le masquer sans moyen de le
 * retrouver ferait croire à une suppression — or il porte du temps déclaré
 * qui doit rester traçable.
 */
export function Tiers() {
  const { t } = useTranslation("referentiels");
  const libelle = useLibelle();
  const peut = usePeut();
  const [recherche, setRecherche] = useState("");
  const [type, setType] = useState("");
  const [archives, setArchives] = useState(false);
  const [creationOuverte, setCreationOuverte] = useState(false);

  const filtres = { recherche, type, archive: archives };
  const requete = useQuery({
    queryKey: ["tiers", filtres],
    queryFn: () => api.listerTiers(filtres),
  });

  return (
    <div className="page">
      <div className="pl-toolbar">
        <div>
          <span className="eyebrow">{t("tiers.surtitre")}</span>
          <h1 className="h1 titre-vue">{t("tiers.titre")}</h1>
        </div>
        <span className="count-split">
          <b>{requete.data?.length ?? 0}</b> {t("tiers.compte", { n: requete.data?.length ?? 0 })}
        </span>
        {peut("third_parties:create") ? (
          <div className="pl-toolbar-fin">
            <Button className="btn btn-primary" onPress={() => setCreationOuverte(true)}>
              {t("tiers.nouveau")}
            </Button>
          </div>
        ) : null}
      </div>

      <div className="filters">
        <input
          className="f-input filtre-recherche"
          type="search"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder={t("tiers.rechercher")}
          aria-label={t("tiers.rechercher")}
        />
        <select
          className="f-input"
          value={type}
          onChange={(e) => setType(e.target.value)}
          aria-label={t("tiers.type")}
        >
          <option value="">{t("tiers.tousTypes")}</option>
          {TYPES_TIERS.map((x) => (
            <option key={x.code} value={x.code}>
              {libelle(x.code, TYPES_TIERS)}
            </option>
          ))}
        </select>
        <Button
          className="filter-toggle"
          aria-pressed={archives}
          onPress={() => setArchives((v) => !v)}
        >
          {t("tiers.voirArchives")}
        </Button>
      </div>

      {requete.isPending ? <Chargement quoi={t("tiers.lesTiers")} /> : null}
      {requete.isError ? (
        <ErreurDeChargement erreur={requete.error} surReessai={() => void requete.refetch()} />
      ) : null}

      {requete.data ? (
        requete.data.length === 0 ? (
          <div className="empty empty-large">
            <p>{t("tiers.videTitre")}</p>
            <small>{t("tiers.videExplication")}</small>
          </div>
        ) : (
          <div className="tlist">
            <div className="tp-grid tp-head" aria-hidden="true">
              <span>{t("tiers.colType")}</span>
              <span>{t("tiers.colIdentite")}</span>
              <span>{t("tiers.colContact")}</span>
              <span>{t("tiers.colRattachements")}</span>
              <span>{t("tiers.colStatut")}</span>
              <span>{t("tiers.colActions")}</span>
            </div>
            {requete.data.map((x) => (
              <LigneTiers key={x.id} tiers={x} />
            ))}
          </div>
        )
      ) : null}

      <FenetreCreation ouverte={creationOuverte} surFermeture={() => setCreationOuverte(false)} />
    </div>
  );
}

function LigneTiers({ tiers }: { tiers: api.Tiers }) {
  const { t } = useTranslation("referentiels");
  const libelle = useLibelle();
  const morale = tiers.type === "organisation";

  return (
    <div className={`tp-grid tp-row${tiers.actif ? "" : " is-off"}`}>
      <span className={`tp-kind ${morale ? "is-moral" : "is-phys"}`}>
        <span className="tp-glyph" aria-hidden="true">
          {morale ? "▣" : "◍"}
        </span>
        {libelle(tiers.type, TYPES_TIERS)}
      </span>

      <span className="bloc-etroit">
        <p className="tp-n">{tiers.organisation ?? tiers.contactNom ?? "—"}</p>
        {tiers.notes ? <span className="tp-note">{tiers.notes}</span> : null}
      </span>

      {/* Une personne morale n'a pas de contact nommé : on l'écrit, on ne
          laisse pas une case vide qui se lirait comme une donnée manquante. */}
      <span className={`tp-c${morale ? " is-none" : ""}`}>
        {morale ? (
          t("tiers.pasDeContactNomme")
        ) : (
          <>
            {tiers.contactNom ?? t("tiers.sansContact")}
            {tiers.contactEmail ? (
              <span className="tp-c-mail">{tiers.contactEmail}</span>
            ) : null}
          </>
        )}
      </span>

      <span className="tp-link">
        <span>{t("tiers.projetsRattaches", { n: tiers._count.projets })}</span>
        <span>{t("tiers.tachesAssignees", { n: tiers._count.taches })}</span>
      </span>

      <span
        className="pill"
        style={{ color: tiers.actif ? "var(--st-done)" : "var(--muted)" }}
      >
        {tiers.actif ? t("tiers.actif") : t("tiers.archive")}
      </span>

      <span className="lv-acts">
        <Link to="/tiers/$id" params={{ id: tiers.id }} className="chip-btn">
          {t("ouvrir")}
        </Link>
      </span>
    </div>
  );
}

/** Vue 24 — Fiche tiers : ses rattachements, et le temps déclaré pour lui. */
export function FicheTiers({ tiersId }: { tiersId: string }) {
  const { t } = useTranslation("referentiels");
  const libelle = useLibelle();
  const peut = usePeut();
  const [suppressionOuverte, setSuppressionOuverte] = useState(false);

  const requete = useQuery({
    queryKey: ["tiers", tiersId],
    queryFn: () => api.ficheTiers(tiersId),
  });

  if (requete.isPending) return <Chargement quoi={t("tiers.leTiers")} />;
  if (requete.isError)
    return <ErreurDeChargement erreur={requete.error} surReessai={() => void requete.refetch()} />;

  const tiers = requete.data;
  const morale = tiers.type === "organisation";

  return (
    <div className="page">
      <Link to="/tiers" className="back-link">
        <span aria-hidden="true">←</span> <span>{t("tiers.retour")}</span>
      </Link>

      {tiers.actif ? null : (
        <div className="alert alert-warn" role="status">
          <span className="alert-icon" aria-hidden="true">
            ⌸
          </span>
          <span>{t("tiers.bandeauArchive")}</span>
        </div>
      )}

      <div className={`proj-head${tiers.actif ? "" : " is-dim"}`}>
        <div className={`tp-hero ${morale ? "is-moral" : "is-phys"}`} aria-hidden="true">
          {morale ? "▣" : "◍"}
        </div>
        <div className="bloc-etroit">
          <span className="eyebrow">{libelle(tiers.type, TYPES_TIERS)}</span>
          <h1 className="proj-name">{tiers.organisation ?? tiers.contactNom ?? "—"}</h1>
        </div>
        {peut("third_parties:delete") ? (
          <div className="proj-acts">
            <Button className="chip-btn chip-danger" onPress={() => setSuppressionOuverte(true)}>
              {t("supprimer")}
            </Button>
          </div>
        ) : null}
      </div>

      <div className="two-col">
        <div>
          <section className="panel panel-espace">
            <div className="panel-head">
              <span className="panel-title">{t("tiers.projetsRattachesTitre")}</span>
              <span className="kcol-n">{tiers.projets.length}</span>
            </div>
            {tiers.projets.length === 0 ? (
              <div className="empty">
                <p>{t("tiers.aucunProjet")}</p>
              </div>
            ) : (
              tiers.projets.map((p) => (
                <Link
                  to="/projets/$id"
                  params={{ id: p.id }}
                  className="lnk-row"
                  key={p.id}
                >
                  <span className="cl-ic" aria-hidden="true">
                    ◇
                  </span>
                  <span className="bloc-etroit">
                    <p className="lnk-n">{p.nom}</p>
                  </span>
                  <Pastille code={p.statut} vocabulaire={STATUTS_PROJET} />
                  <span />
                  <span aria-hidden="true">›</span>
                </Link>
              ))
            )}
          </section>

          <section className="panel">
            <div className="panel-head">
              <span className="panel-title">{t("tiers.tachesAssigneesTitre")}</span>
              <span className="kcol-n">{tiers.taches.length}</span>
            </div>
            {tiers.taches.length === 0 ? (
              <div className="empty">
                <p>{t("tiers.aucuneTache")}</p>
              </div>
            ) : (
              tiers.taches.map((x) => (
                <div className="tsk-row" key={x.id}>
                  <span className="lnk-n">{x.titre}</span>
                  <Pastille code={x.statut} vocabulaire={STATUTS_TACHE} />
                  <span />
                  <span />
                </div>
              ))
            )}
          </section>
        </div>

        <section className="panel">
          <div className="panel-head">
            <span className="panel-title">{t("tiers.informations")}</span>
          </div>
          <dl className="side-dl">
            <dt>{t("tiers.colType")}</dt>
            <dd>{libelle(tiers.type, TYPES_TIERS)}</dd>

            {/* `RG-TRS-01` — le contact nommé n'existe pas pour une personne
                morale. On l'écrit plutôt que d'afficher un blanc. */}
            {morale ? (
              <>
                <dt>{t("tiers.colContact")}</dt>
                <dd className="is-none">{t("tiers.pasDeContactNomme")}</dd>
              </>
            ) : (
              <>
                <dt>{t("tiers.colContact")}</dt>
                <dd className={tiers.contactNom ? "" : "is-none"}>
                  {tiers.contactNom ?? t("tiers.sansContact")}
                </dd>
                <dt>{t("tiers.email")}</dt>
                <dd className={tiers.contactEmail ? "" : "is-none"}>
                  {tiers.contactEmail ?? t("nonRenseigne")}
                </dd>
                <dt>{t("tiers.telephone")}</dt>
                <dd className={tiers.contactTelephone ? "" : "is-none"}>
                  {tiers.contactTelephone ?? t("nonRenseigne")}
                </dd>
              </>
            )}

            <dt>{t("tiers.tempsDeclare")}</dt>
            <dd>{t("tiers.saisies", { n: tiers.heuresDeclarees })}</dd>
          </dl>
        </section>
      </div>

      <FenetreSuppressionTiers
        tiers={tiers}
        ouverte={suppressionOuverte}
        surFermeture={() => setSuppressionOuverte(false)}
      />
    </div>
  );
}

/**
 * `RG-TRS-06` — le bilan d'impact précède la confirmation.
 *
 * Un tiers engagé sur des projets ou des tâches ne se supprime pas sans qu'on
 * sache quoi. Les volumes sont chiffrés avant le geste, jamais après.
 */
function FenetreSuppressionTiers({
  tiers,
  ouverte,
  surFermeture,
}: {
  tiers: api.FicheTiers;
  ouverte: boolean;
  surFermeture: () => void;
}) {
  const { t } = useTranslation("referentiels");
  const { t: tErreurs } = useTranslation("erreurs");
  const annoncer = useMessages();

  const impact = useQuery({
    queryKey: ["tiers", tiers.id, "impact"],
    queryFn: () => api.impactTiers(tiers.id),
    enabled: ouverte,
  });

  const suppression = useMutation({
    mutationFn: () => api.supprimerTiers(tiers.id),
    onSuccess: () => {
      annoncer("ok", t("tiers.supprime"));
      window.location.assign("/tiers");
    },
    onError: (e) => annoncer("err", messageErreur(e, tErreurs, t("tiers.echecSuppression"))),
  });

  const refuse = impact.data ? impact.data.blocages.length > 0 : false;

  return (
    <Fenetre
      ouverte={ouverte}
      surFermeture={surFermeture}
      categorie={t("tiers.actionIrreversible")}
      titre={t("tiers.supprimerTitre")}
      mention={t("tiers.bilanPrealable")}
      actions={
        <>
          <Button className="btn btn-secondary" onPress={surFermeture}>
            {t("annuler")}
          </Button>
          {refuse ? null : (
            <Button
              className="btn btn-danger"
              isPending={suppression.isPending}
              onPress={() => suppression.mutate()}
            >
              {t("tiers.supprimerTitre")}
            </Button>
          )}
        </>
      }
    >
      {impact.isPending ? <Chargement quoi={t("tiers.leBilan")} /> : null}

      {impact.data ? (
        <>
          <div className="impact">
            <div className="imp">
              <p className="imp-n">{tiers.projets.length}</p>
              <span className="eyebrow">{t("tiers.projets")}</span>
            </div>
            <div className="imp">
              <p className="imp-n">{tiers.taches.length}</p>
              <span className="eyebrow">{t("tiers.taches")}</span>
            </div>
            <div className={`imp${tiers.heuresDeclarees > 0 ? " is-hot" : ""}`}>
              <p className="imp-n">{tiers.heuresDeclarees}</p>
              <span className="eyebrow">{t("tiers.saisiesCourt")}</span>
            </div>
          </div>

          {refuse ? (
            <div className="alert alert-error" role="alert">
              <span className="alert-icon" aria-hidden="true">
                !
              </span>
              <span>{t("tiers.suppressionRefusee")}</span>
            </div>
          ) : (
            <p className="phrase-confirmation">{t("tiers.confirmerSuppression")}</p>
          )}
        </>
      ) : null}
    </Fenetre>
  );
}

/**
 * La fenêtre de création.
 *
 * Le type se choisit **d'abord** parce qu'il change la forme du formulaire :
 * une personne morale n'a pas de contact nommé.
 */
function FenetreCreation({
  ouverte,
  surFermeture,
}: {
  ouverte: boolean;
  surFermeture: () => void;
}) {
  const { t } = useTranslation("referentiels");
  const { t: tErreurs } = useTranslation("erreurs");
  const libelle = useLibelle();
  const annoncer = useMessages();
  const client = useQueryClient();

  const [type, setType] = useState("individual");
  const [organisation, setOrganisation] = useState("");
  const [contactNom, setContactNom] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);

  const morale = type === "organisation";

  const creation = useMutation({
    mutationFn: () =>
      api.creerTiers({
        type,
        organisation: organisation || null,
        // Une personne morale ne porte pas de contact nommé : on n'envoie pas
        // un champ que le serveur refusera.
        contactNom: morale ? null : contactNom || null,
        contactEmail: morale ? null : contactEmail || null,
        ...(notes ? { notes } : {}),
      }),
    onSuccess: () => {
      annoncer("ok", t("tiers.cree"));
      setOrganisation("");
      setContactNom("");
      setContactEmail("");
      surFermeture();
      void client.invalidateQueries({ queryKey: ["tiers"] });
    },
    onError: (e) => setErreur(messageErreur(e, tErreurs, t("tiers.echecCreation"))),
  });

  return (
    <Fenetre
      ouverte={ouverte}
      surFermeture={surFermeture}
      categorie={t("tiers.nouveau")}
      titre={t("tiers.creerTitre")}
      mention={t("champObligatoire")}
      actions={
        <>
          <Button className="btn btn-secondary" onPress={surFermeture}>
            {t("annuler")}
          </Button>
          <Button
            className="btn btn-primary"
            isPending={creation.isPending}
            onPress={() => creation.mutate()}
          >
            {t("tiers.creer")}
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

      <div className="field-block">
        <label className="field-label" htmlFor="tp-type">
          {t("tiers.colType")} <span className="req">*</span>
        </label>
        <select
          className="field"
          id="tp-type"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          {TYPES_TIERS.map((x) => (
            <option key={x.code} value={x.code}>
              {libelle(x.code, TYPES_TIERS)}
            </option>
          ))}
        </select>
      </div>

      <div className="field-block">
        <label className="field-label" htmlFor="tp-org">
          {t("tiers.organisation")}
        </label>
        <input
          className="field"
          id="tp-org"
          type="text"
          value={organisation}
          onChange={(e) => setOrganisation(e.target.value)}
        />
      </div>

      {/* Les champs de contact DISPARAISSENT pour une personne morale : un
          champ grisé invite à chercher comment le remplir, un champ absent dit
          que la question ne se pose pas. */}
      {morale ? (
        <p className="field-hint">{t("tiers.aideMorale")}</p>
      ) : (
        <>
          <div className="field-block">
            <label className="field-label" htmlFor="tp-contact">
              {t("tiers.colContact")}
            </label>
            <input
              className="field"
              id="tp-contact"
              type="text"
              value={contactNom}
              onChange={(e) => setContactNom(e.target.value)}
            />
          </div>
          <div className="field-block">
            <label className="field-label" htmlFor="tp-mail">
              {t("tiers.email")}
            </label>
            <input
              className="field"
              id="tp-mail"
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
            />
          </div>
        </>
      )}

      <div className="field-block">
        <label className="field-label" htmlFor="tp-notes">
          {t("tiers.notes")}
        </label>
        <textarea
          className="field"
          id="tp-notes"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
    </Fenetre>
  );
}
