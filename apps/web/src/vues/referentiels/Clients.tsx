import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button } from "react-aria-components";
import { STATUTS_PROJET } from "@trame/contracts";
import * as api from "../../api/referentiels.js";
import { messageErreur } from "../../api/erreurs.js";
import { usePeut } from "../../session/session.js";
import { Chargement, ErreurDeChargement } from "../../composants/etats.js";
import { Fenetre } from "../../composants/fenetre.js";
import { useMessages } from "../../composants/messages.js";
import { Pastille } from "../../composants/pastilles.js";
import "../../composants/partages.css";
import "../taches/liste.css";
import "../projets/fiche.css";
import "./tiers.css";
import "./clients.css";

/**
 * Vue 25 — Clients.
 *
 * **Supprimer un client détache ses projets, il ne les supprime pas.** C'est
 * la note explicite de `design/etats.json`, et c'est le genre de distinction
 * qu'on ne devine pas : le bilan d'impact liste les projets rattachés et le
 * pied de fenêtre dit ce qui leur arrivera.
 */
export function Clients() {
  const { t } = useTranslation("referentiels");
  const peut = usePeut();
  const [recherche, setRecherche] = useState("");
  const [creationOuverte, setCreationOuverte] = useState(false);

  const requete = useQuery({
    queryKey: ["clients", recherche],
    queryFn: () => api.listerClients({ recherche }),
  });

  return (
    <div className="page">
      <div className="pl-toolbar">
        <div>
          <span className="eyebrow">{t("clients.surtitre")}</span>
          <h1 className="h1 titre-vue">{t("clients.titre")}</h1>
        </div>
        <span className="count-split">
          <b>{requete.data?.length ?? 0}</b> {t("clients.compte", { n: requete.data?.length ?? 0 })}
        </span>
        {peut("clients:create") ? (
          <div className="pl-toolbar-fin">
            <Button className="btn btn-primary" onPress={() => setCreationOuverte(true)}>
              {t("clients.nouveau")}
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
          placeholder={t("clients.rechercher")}
          aria-label={t("clients.rechercher")}
        />
      </div>

      {requete.isPending ? <Chargement quoi={t("clients.lesClients")} /> : null}
      {requete.isError ? (
        <ErreurDeChargement erreur={requete.error} surReessai={() => void requete.refetch()} />
      ) : null}

      {requete.data ? (
        requete.data.length === 0 ? (
          <div className="empty empty-large">
            <p>{t("clients.videTitre")}</p>
            <small>{t("clients.videExplication")}</small>
          </div>
        ) : (
          <div className="tlist">
            <div className="cl-grid cl-head" aria-hidden="true">
              <span />
              <span>{t("clients.colNom")}</span>
              <span>{t("clients.colContact")}</span>
              <span>{t("clients.colProjets")}</span>
              <span>{t("clients.colStatut")}</span>
              <span>{t("clients.colActions")}</span>
            </div>
            {requete.data.map((c) => (
              <div className={`cl-grid cl-row${c.actif ? "" : " is-off"}`} key={c.id}>
                <span className="cl-ic" aria-hidden="true">
                  ▣
                </span>
                <span className="bloc-etroit">
                  <p className="cl-n">{c.nom}</p>
                  {c.adresse ? <span className="cl-s">{c.adresse}</span> : null}
                </span>
                <span className="cl-c">
                  {c.contactNom ?? t("clients.sansContact")}
                  {c.contactEmail ? <span className="cl-c-mail">{c.contactEmail}</span> : null}
                </span>
                <span className="cl-more">
                  {t("clients.projetsRattaches", { n: c._count.projets })}
                </span>
                <span
                  className="pill"
                  style={{ color: c.actif ? "var(--st-done)" : "var(--muted)" }}
                >
                  {c.actif ? t("clients.actif") : t("clients.inactif")}
                </span>
                <span className="lv-acts">
                  <Link to="/clients/$id" params={{ id: c.id }} className="chip-btn">
                    {t("ouvrir")}
                  </Link>
                </span>
              </div>
            ))}
          </div>
        )
      ) : null}

      <FenetreCreation ouverte={creationOuverte} surFermeture={() => setCreationOuverte(false)} />
    </div>
  );
}

/** Vue 26 — Fiche client : son portefeuille de projets. */
export function FicheClient({ clientId }: { clientId: string }) {
  const { t } = useTranslation("referentiels");
  const peut = usePeut();
  const [suppressionOuverte, setSuppressionOuverte] = useState(false);

  const requete = useQuery({
    queryKey: ["clients", clientId],
    queryFn: () => api.ficheClient(clientId),
  });

  if (requete.isPending) return <Chargement quoi={t("clients.leClient")} />;
  if (requete.isError)
    return <ErreurDeChargement erreur={requete.error} surReessai={() => void requete.refetch()} />;

  const client = requete.data;

  return (
    <div className="page">
      <Link to="/clients" className="back-link">
        <span aria-hidden="true">←</span> <span>{t("clients.retour")}</span>
      </Link>

      {client.actif ? null : (
        <div className="alert alert-warn" role="status">
          <span className="alert-icon" aria-hidden="true">
            ⌸
          </span>
          <span>{t("clients.bandeauInactif")}</span>
        </div>
      )}

      <div className={`proj-head${client.actif ? "" : " is-dim"}`}>
        <div className="cl-hero" aria-hidden="true">
          ▣
        </div>
        <div className="bloc-etroit">
          <span className="eyebrow">{t("clients.beneficiaire")}</span>
          <h1 className="proj-name">{client.nom}</h1>
        </div>
        {peut("clients:delete") ? (
          <div className="proj-acts">
            <Button className="chip-btn chip-danger" onPress={() => setSuppressionOuverte(true)}>
              {t("supprimer")}
            </Button>
          </div>
        ) : null}
      </div>

      <div className="two-col">
        <section className="panel">
          <div className="panel-head">
            <span className="panel-title">{t("clients.portefeuille")}</span>
            <span className="kcol-n">{client.projets.length}</span>
          </div>
          {client.projets.length === 0 ? (
            <div className="empty">
              <p>{t("clients.aucunProjet")}</p>
              <small>{t("clients.aucunProjetExplication")}</small>
            </div>
          ) : (
            client.projets.map((p) => (
              <Link
                to="/projets/$id"
                params={{ id: p.id }}
                className="lnk-row is-cli"
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
            <span className="panel-title">{t("clients.informations")}</span>
          </div>
          <dl className="side-dl">
            <dt>{t("clients.colContact")}</dt>
            <dd className={client.contactNom ? "" : "is-none"}>
              {client.contactNom ?? t("nonRenseigne")}
            </dd>
            <dt>{t("clients.email")}</dt>
            <dd className={client.contactEmail ? "" : "is-none"}>
              {client.contactEmail ?? t("nonRenseigne")}
            </dd>
            <dt>{t("clients.telephone")}</dt>
            <dd className={client.contactTelephone ? "" : "is-none"}>
              {client.contactTelephone ?? t("nonRenseigne")}
            </dd>
            <dt>{t("clients.adresse")}</dt>
            <dd className={client.adresse ? "" : "is-none"}>
              {client.adresse ?? t("nonRenseigne")}
            </dd>
          </dl>
        </section>
      </div>

      <FenetreSuppression
        client={client}
        ouverte={suppressionOuverte}
        surFermeture={() => setSuppressionOuverte(false)}
      />
    </div>
  );
}

/**
 * Le bilan d'impact avant suppression.
 *
 * **Détacher n'est pas supprimer** : les projets rattachés survivent, ils
 * perdent leur bénéficiaire. Le pied de fenêtre le dit à côté du bouton rouge,
 * là où l'inquiétude se forme.
 */
function FenetreSuppression({
  client,
  ouverte,
  surFermeture,
}: {
  client: api.FicheClient;
  ouverte: boolean;
  surFermeture: () => void;
}) {
  const { t } = useTranslation("referentiels");
  const { t: tErreurs } = useTranslation("erreurs");
  const annoncer = useMessages();

  const impact = useQuery({
    queryKey: ["clients", client.id, "impact"],
    queryFn: () => api.impactClient(client.id),
    enabled: ouverte,
  });

  const suppression = useMutation({
    mutationFn: () => api.supprimerClient(client.id),
    onSuccess: () => {
      annoncer("ok", t("clients.supprime"));
      window.location.assign("/clients");
    },
    onError: (e) => annoncer("err", messageErreur(e, tErreurs, t("clients.echecSuppression"))),
  });

  return (
    <Fenetre
      ouverte={ouverte}
      surFermeture={surFermeture}
      categorie={t("clients.actionIrreversible")}
      titre={t("clients.supprimerTitre")}
      // La note de design/etats.json, écrite là où elle sert.
      mention={t("clients.detacherNestPasSupprimer")}
      actions={
        <>
          <Button className="btn btn-secondary" onPress={surFermeture}>
            {t("annuler")}
          </Button>
          <Button
            className="btn btn-danger"
            isPending={suppression.isPending}
            onPress={() => suppression.mutate()}
          >
            {t("clients.supprimerTitre")}
          </Button>
        </>
      }
    >
      {impact.isPending ? <Chargement quoi={t("clients.leBilan")} /> : null}

      <p className="phrase-confirmation">
        {t("clients.confirmerSuppression")} <span className="quoted">« {client.nom} »</span> ?
      </p>

      {client.projets.length > 0 ? (
        <>
          <div className="alert alert-neutral">
            <span className="alert-icon" aria-hidden="true">
              →
            </span>
            <span>{t("clients.effetSuppression", { n: client.projets.length })}</span>
          </div>
          <ul className="imp-list">
            {client.projets.map((p) => (
              <li key={p.id}>
                <span className="imp-k">{t("clients.projet")}</span>
                <span>{p.nom}</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="alert alert-neutral">
          <span className="alert-icon" aria-hidden="true">
            →
          </span>
          <span>{t("clients.aucunRattachement")}</span>
        </div>
      )}
    </Fenetre>
  );
}

function FenetreCreation({
  ouverte,
  surFermeture,
}: {
  ouverte: boolean;
  surFermeture: () => void;
}) {
  const { t } = useTranslation("referentiels");
  const { t: tErreurs } = useTranslation("erreurs");
  const annoncer = useMessages();
  const client = useQueryClient();

  const [nom, setNom] = useState("");
  const [contactNom, setContactNom] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [adresse, setAdresse] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);

  const creation = useMutation({
    mutationFn: () =>
      api.creerClient({
        nom,
        contactNom: contactNom || null,
        contactEmail: contactEmail || null,
        adresse: adresse || null,
      }),
    onSuccess: () => {
      annoncer("ok", t("clients.cree"));
      setNom("");
      setContactNom("");
      setContactEmail("");
      setAdresse("");
      surFermeture();
      void client.invalidateQueries({ queryKey: ["clients"] });
    },
    onError: (e) => setErreur(messageErreur(e, tErreurs, t("clients.echecCreation"))),
  });

  const valider = () => {
    setErreur(null);
    if (!nom.trim()) {
      setErreur(t("clients.nomRequis"));
      return;
    }
    creation.mutate();
  };

  return (
    <Fenetre
      ouverte={ouverte}
      surFermeture={surFermeture}
      categorie={t("clients.nouveau")}
      titre={t("clients.creerTitre")}
      mention={t("champObligatoire")}
      actions={
        <>
          <Button className="btn btn-secondary" onPress={surFermeture}>
            {t("annuler")}
          </Button>
          <Button className="btn btn-primary" isPending={creation.isPending} onPress={valider}>
            {t("clients.creer")}
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
        <label className="field-label" htmlFor="cl-nom">
          {t("clients.colNom")} <span className="req">*</span>
        </label>
        <input
          className="field"
          id="cl-nom"
          type="text"
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          placeholder={t("clients.nomExemple")}
        />
      </div>

      <div className="field-block">
        <label className="field-label" htmlFor="cl-contact">
          {t("clients.colContact")}
        </label>
        <input
          className="field"
          id="cl-contact"
          type="text"
          value={contactNom}
          onChange={(e) => setContactNom(e.target.value)}
        />
      </div>

      <div className="field-block">
        <label className="field-label" htmlFor="cl-mail">
          {t("clients.email")}
        </label>
        <input
          className="field"
          id="cl-mail"
          type="email"
          value={contactEmail}
          onChange={(e) => setContactEmail(e.target.value)}
        />
      </div>

      <div className="field-block">
        <label className="field-label" htmlFor="cl-adr">
          {t("clients.adresse")}
        </label>
        <input
          className="field"
          id="cl-adr"
          type="text"
          value={adresse}
          onChange={(e) => setAdresse(e.target.value)}
        />
      </div>
    </Fenetre>
  );
}
