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
import { formaterDate } from "../../formats.js";
import { Fenetre } from "../../composants/fenetre.js";
import { useMessages } from "../../composants/messages.js";
import { MarqueurCalcule, Pastille } from "../../composants/pastilles.js";
import * as apiProjets from "../../api/projets.js";
import "../../composants/partages.css";
/* Sections cumulatives : `.pchip` (20), `.ms-toggle` (17), `.lv-acts` (23),
   `.count-split` (20), `.side-dl` (21), `.proj-head` / `.two-col` (15). */
import "../taches/liste.css";
import "../taches/fiche.css";
import "../projets/fiche.css";
import "../projets/jalons.css";
import "../projets/portefeuille.css";
import "../occupations/conges.css";
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
  const [statut, setStatut] = useState("on");
  const [creationOuverte, setCreationOuverte] = useState(false);

  const reinitialiser = () => {
    setRecherche("");
    setStatut("on");
  };

  const requete = useQuery({
    queryKey: ["clients", recherche],
    queryFn: () => api.listerClients({ recherche }),
  });

  const liste = (requete.data ?? []).filter((c) =>
    statut === "on" ? c.actif : statut === "off" ? !c.actif : true,
  );

  return (
    <>
      <div className="pl-toolbar">
        <div>
          <span className="eyebrow">{t("clients.surtitre")}</span>
          <h1 className="h1">{t("clients.titre")}</h1>
        </div>
        <span className="count-split">{t("clients.compte", { n: liste.length })}</span>
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
          className="f-input"
          type="search"
          style={{ width: "250px" }}
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder={t("clients.rechercher")}
          aria-label={t("clients.rechercher")}
        />
        <select
          className="f-input"
          value={statut}
          onChange={(e) => setStatut(e.target.value)}
          aria-label={t("clients.colStatut")}
        >
          <option value="on">{t("clients.filtreActifs")}</option>
          <option value="off">{t("clients.filtreInactifs")}</option>
          <option value="">{t("clients.filtreTous")}</option>
        </select>
        <Button className="chip-btn" onPress={reinitialiser}>
          {t("reinitialiser")}
        </Button>
      </div>

      {requete.isPending ? <Chargement quoi={t("clients.lesClients")} /> : null}
      {requete.isError ? (
        <ErreurDeChargement erreur={requete.error} surReessai={() => void requete.refetch()} />
      ) : null}

      {requete.isSuccess ? (
        <section className="panel">
          <div className="cl-grid cl-head">
            <span />
            <span>{t("clients.colNom")}</span>
            <span>{t("clients.colContact")}</span>
            <span>{t("clients.colProjets")}</span>
            <span>{t("clients.colStatut")}</span>
            <span style={{ textAlign: "right" }}>{t("clients.colActions")}</span>
          </div>
          <div>
            {liste.map((c) => (
              <LigneClient key={c.id} client={c} />
            ))}
          </div>
          {liste.length === 0 ? (
            <div className="empty">
              <p>{t("clients.videTitre")}</p>
              <small>{t("clients.videExplication")}</small>
              <Button className="chip-btn" onPress={reinitialiser}>
                {t("reinitialiserFiltres")}
              </Button>
            </div>
          ) : null}
        </section>
      ) : null}

      <FenetreCreation ouverte={creationOuverte} surFermeture={() => setCreationOuverte(false)} />
    </>
  );
}

function LigneClient({ client }: { client: api.Client }) {
  const { t } = useTranslation("referentiels");
  const peut = usePeut();
  const [suppressionOuverte, setSuppressionOuverte] = useState(false);

  return (
    <div className={`cl-grid cl-row${client.actif ? "" : " is-off"}`}>
      <div className="cl-ic">
        {/*
         * La maquette pose une icône SVG de bâtiment (`#p-cityhall`). Le jeu
         * de symboles porté ne contient que les icônes de navigation : on
         * emploie `#i-clients`, qui dit la même chose, plutôt qu'un glyphe
         * inventé. Le manque du jeu `p-*` est remonté au cadrage.
         */}
        <svg className="picon" aria-hidden="true">
          <use href="#i-clients" />
        </svg>
      </div>

      <div style={{ minWidth: 0 }}>
        <p className="cl-n">{client.nom}</p>
        {client.adresse ? <span className="cl-s">{client.adresse}</span> : null}
      </div>

      <div style={{ minWidth: 0 }}>
        <span className="cl-c">{client.contactNom ?? t("clients.sansContact")}</span>
        <span className="cl-c-mail">{client.contactEmail ?? t("nonRenseigne")}</span>
      </div>

      <div className="cl-projs">
        {client.projets.length === 0 ? (
          <span className="cl-more">{t("clients.aucunProjet")}</span>
        ) : (
          <>
            {client.projets.slice(0, 2).map((p) => (
              <span className="pchip" key={p.project.id} title={p.project.nom}>
                <span>{p.project.nom}</span>
              </span>
            ))}
            <span className="cl-more">
              {t("clients.projetsRattaches", { n: client._count.projets })}
            </span>
          </>
        )}
      </div>

      <div>
        <span className="pill" style={{ color: client.actif ? "var(--st-done)" : "var(--muted)" }}>
          {client.actif ? t("clients.actif") : t("clients.inactif")}
        </span>
      </div>

      <div className="lv-acts">
        <Link to="/clients/$id" params={{ id: client.id }} className="ms-toggle">
          {t("fiche")}
        </Link>
        {peut("clients:delete") ? (
          <Button className="ms-toggle" onPress={() => setSuppressionOuverte(true)}>
            {t("supprimer")}
          </Button>
        ) : null}
      </div>

      <FenetreSuppression
        id={client.id}
        nom={client.nom}
        projets={client.projets.map((p) => p.project)}
        ouverte={suppressionOuverte}
        surFermeture={() => setSuppressionOuverte(false)}
      />
    </div>
  );
}

/** Vue 26 — Fiche client : son portefeuille de projets. */
export function FicheClient({ clientId }: { clientId: string }) {
  const { t } = useTranslation("referentiels");
  const peut = usePeut();
  const [suppressionOuverte, setSuppressionOuverte] = useState(false);
  const [rattachementOuvert, setRattachementOuvert] = useState(false);

  const requete = useQuery({
    queryKey: ["clients", clientId],
    queryFn: () => api.ficheClient(clientId),
  });

  /*
   * L'avancement n'est pas servi par la fiche client : il l'est par le
   * portefeuille. On le compose plutôt que de laisser la barre vide — et on
   * ne l'invente pas côté client.
   */
  const portefeuille = useQuery({
    queryKey: ["projets", "portefeuille"],
    queryFn: () => apiProjets.portefeuille({}),
  });
  const avancementDe = (id: string) =>
    portefeuille.data?.projets.find((x) => x.id === id)?.progression ?? null;

  const detachement = useDetachement(clientId);

  if (requete.isPending) return <Chargement quoi={t("clients.leClient")} />;
  if (requete.isError)
    return <ErreurDeChargement erreur={requete.error} surReessai={() => void requete.refetch()} />;

  const client = requete.data;
  const actifs = client.projets.filter((p) => p.statut === "active").length;
  const echeances = client.projets
    .map((p) => p.dateFin)
    .filter((d): d is string => d !== null)
    .sort();
  const prochaine = echeances[0] ?? null;
  const avancements = client.projets
    .map((p) => avancementDe(p.id))
    .filter((x): x is number => x !== null);
  const avancementMoyen = avancements.length
    ? Math.round(avancements.reduce((a, b) => a + b, 0) / avancements.length)
    : 0;

  return (
    <>
      <Link to="/clients" className="back-link" activeOptions={{ exact: true }}>
        <span aria-hidden="true">←</span> <span>{t("clients.retour")}</span>
      </Link>

      {client.actif ? null : (
        <div className="alert alert-warn" role="status">
          <span className="alert-icon" aria-hidden="true">
            ⌸
          </span>
          <span style={{ flex: 1 }}>{t("clients.bandeauInactif")}</span>
        </div>
      )}

      <div className="proj-head">
        <div className="cl-hero">
          <svg className="picon" aria-hidden="true">
            <use href="#i-clients" />
          </svg>
        </div>
        <div style={{ minWidth: 0 }}>
          <span className="eyebrow">{t("clients.beneficiaire")}</span>
          <h1 className="proj-name">{client.nom}</h1>
          <div className="pills">
            <span
              className="pill"
              style={{ color: client.actif ? "var(--st-done)" : "var(--muted)" }}
            >
              {client.actif ? t("clients.actif") : t("clients.inactif")}
            </span>
            <span className="pill" style={{ color: "var(--muted)" }}>
              {t("clients.beneficiaire")}
            </span>
          </div>
        </div>
        {peut("clients:delete") ? (
          <div className="proj-acts">
            <Button
              className="chip-btn"
              style={{ color: "var(--st-blocked)", borderColor: "var(--st-blocked)" }}
              onPress={() => setSuppressionOuverte(true)}
            >
              {t("supprimer")}
            </Button>
          </div>
        ) : null}
      </div>

      <div className="kpi-grid">
        <div className="kpi">
          <span className="eyebrow">{t("clients.portefeuille")}</span>
          <p className="kpi-val">{client.projets.length}</p>
          <span className="kpi-sub">{t("clients.dontActifs", { n: actifs })}</span>
        </div>
        <div className="kpi">
          <div className="kpi-head">
            <span className="eyebrow">{t("clients.avancementMoyen")}</span>
            <MarqueurCalcule explication={t("clients.avancementCalcul")} />
          </div>
          <p className="kpi-val">{avancementMoyen} %</p>
          <div className="bar kpi-bar" aria-hidden="true">
            <i style={{ width: `${avancementMoyen}%` }} />
          </div>
        </div>
        <div className="kpi">
          <span className="eyebrow">{t("clients.prochaineEcheance")}</span>
          <p className="kpi-val" style={{ fontSize: "19px" }}>
            {prochaine ? formaterDate(prochaine) : "—"}
          </p>
          <span className="kpi-sub">{t("clients.surProjetsRattaches")}</span>
        </div>
      </div>

      <div className="two-col">
        <div>
          <section className="panel">
            <div className="panel-head">
              <span className="panel-title">{t("clients.portefeuille")}</span>
              {peut("clients:update") ? (
                <Button
                  className="btn btn-primary"
                  onPress={() => setRattachementOuvert(true)}
                >
                  {t("clients.rattacherUnProjet")}
                </Button>
              ) : null}
            </div>
            <div>
              {client.projets.map((p) => (
                <div className="lnk-row is-cli" key={p.id}>
                  <span className="picon-box" aria-hidden="true">
                    <span className="picon-glyphe">◇</span>
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <p className="lnk-n">
                      <Link to="/projets/$id" params={{ id: p.id }}>
                        {p.nom}
                      </Link>
                    </p>
                    <span className="lnk-s">
                      {p.dateFin ? t("clients.echeanceLe", { date: formaterDate(p.dateFin) }) : "—"}
                    </span>
                  </div>
                  <div className="prow-progline">
                    <div className="bar">
                      <i style={{ width: `${avancementDe(p.id) ?? 0}%` }} />
                    </div>
                    <span className="prow-pct">{avancementDe(p.id) ?? 0} %</span>
                  </div>
                  <div>
                    <Pastille code={p.statut} vocabulaire={STATUTS_PROJET} />
                  </div>
                  <div className="lv-acts">
                    {peut("clients:update") ? (
                      <Button
                        className="ms-toggle"
                        onPress={() => detachement.mutate(p.id)}
                        aria-label={t("clients.detacherProjet", { nom: p.nom })}
                      >
                        {t("clients.detacher")}
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
            {client.projets.length === 0 ? (
              <div className="empty">
                <p>{t("clients.aucunProjet")}</p>
                <small>{t("clients.aucunProjetExplication")}</small>
              </div>
            ) : null}
          </section>
        </div>

        <div>
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

          <section className="panel">
            <div className="panel-head">
              <span className="panel-title">{t("clients.notes")}</span>
            </div>
            <div className="panel-body">
              {client.notes ? (
                <p style={{ margin: 0, fontSize: "12.5px", lineHeight: 1.6 }}>{client.notes}</p>
              ) : (
                <p
                  style={{
                    margin: 0,
                    fontSize: "12.5px",
                    color: "var(--muted)",
                    fontStyle: "italic",
                  }}
                >
                  {t("clients.aucuneNote")}
                </p>
              )}
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <span className="panel-title">{t("clients.suivi")}</span>
            </div>
            <dl className="side-dl">
              <dt>{t("clients.creeLe")}</dt>
              <dd>{formaterDate(client.creeLe)}</dd>
              <dt>{t("clients.modifieLe")}</dt>
              <dd>{formaterDate(client.modifieLe)}</dd>
              <dt>{t("clients.selectionnable")}</dt>
              <dd>{client.actif ? t("oui") : t("non")}</dd>
            </dl>
          </section>
        </div>
      </div>

      <FenetreSuppression
        id={client.id}
        nom={client.nom}
        projets={client.projets}
        ouverte={suppressionOuverte}
        surFermeture={() => setSuppressionOuverte(false)}
      />

      <FenetreRattachement
        clientId={client.id}
        dejaRattaches={client.projets.map((p) => p.id)}
        ouverte={rattachementOuvert}
        surFermeture={() => setRattachementOuvert(false)}
      />
    </>
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
  id,
  nom,
  projets,
  ouverte,
  surFermeture,
}: {
  id: string;
  nom: string;
  projets: { id: string; nom: string }[];
  ouverte: boolean;
  surFermeture: () => void;
}) {
  const { t } = useTranslation("referentiels");
  const { t: tErreurs } = useTranslation("erreurs");
  const annoncer = useMessages();

  const impact = useQuery({
    queryKey: ["clients", id, "impact"],
    queryFn: () => api.impactClient(id),
    enabled: ouverte,
  });

  const suppression = useMutation({
    mutationFn: () => api.supprimerClient(id),
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
      categorie={t("clients.bilanImpact")}
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
            {t("supprimer")}
          </Button>
        </>
      }
    >
      {impact.isPending ? <Chargement quoi={t("clients.leBilan")} /> : null}

      <p className="phrase-confirmation">
        {t("clients.confirmerSuppression")} <span className="quoted">« {nom} »</span> ?
      </p>

      {projets.length > 0 ? (
        <>
          <div className="alert alert-neutral">
            <span className="alert-icon" aria-hidden="true">
              →
            </span>
            <span>{t("clients.effetSuppression", { n: projets.length })}</span>
          </div>
          <ul className="imp-list">
            {projets.map((p) => (
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
      categorie={t("clients.categorie")}
      titre={t("clients.nouveau")}
      mention={t("champObligatoire")}
      actions={
        <>
          <Button className="btn btn-secondary" onPress={surFermeture}>
            {t("annuler")}
          </Button>
          <Button className="btn btn-primary" isPending={creation.isPending} onPress={valider}>
            {t("enregistrer")}
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


/**
 * Détacher un projet du client.
 *
 * Le point d'entrée remplace la liste entière : on relit donc les
 * bénéficiaires du projet et on renvoie celle-ci privée du client courant.
 * **Détacher n'est pas supprimer** — le projet reste, il perd un
 * bénéficiaire.
 */
function useDetachement(clientId: string) {
  const { t } = useTranslation("referentiels");
  const { t: tErreurs } = useTranslation("erreurs");
  const annoncer = useMessages();
  const client = useQueryClient();

  return useMutation({
    mutationFn: async (projetId: string) => {
      const projet = await apiProjets.fiche(projetId);
      const restants = projet.clients.map((c) => c.id).filter((id) => id !== clientId);
      return api.definirClientsDuProjet(projetId, restants);
    },
    onSuccess: () => {
      annoncer("ok", t("clients.detache"));
      void client.invalidateQueries({ queryKey: ["clients"] });
    },
    onError: (e) => annoncer("err", messageErreur(e, tErreurs, t("clients.echecDetachement"))),
  });
}

/**
 * Rattacher un projet au portefeuille du client.
 *
 * Seuls les projets non archivés sont proposés, et un projet déjà rattaché
 * n'apparaît plus : proposer ce qui est déjà fait fait douter de ce qu'on voit.
 */
function FenetreRattachement({
  clientId,
  dejaRattaches,
  ouverte,
  surFermeture,
}: {
  clientId: string;
  dejaRattaches: string[];
  ouverte: boolean;
  surFermeture: () => void;
}) {
  const { t } = useTranslation("referentiels");
  const { t: tErreurs } = useTranslation("erreurs");
  const annoncer = useMessages();
  const client = useQueryClient();
  const [recherche, setRecherche] = useState("");

  const projets = useQuery({
    queryKey: ["projets", "portefeuille", recherche],
    queryFn: () => apiProjets.portefeuille({ recherche, archive: false }),
    enabled: ouverte,
  });

  const rattachement = useMutation({
    mutationFn: async (projetId: string) => {
      const projet = await apiProjets.fiche(projetId);
      const ids = [...new Set([...projet.clients.map((c) => c.id), clientId])];
      return api.definirClientsDuProjet(projetId, ids);
    },
    onSuccess: () => {
      annoncer("ok", t("clients.rattache"));
      surFermeture();
      void client.invalidateQueries({ queryKey: ["clients"] });
    },
    onError: (e) => annoncer("err", messageErreur(e, tErreurs, t("clients.echecRattachement"))),
  });

  const candidats = (projets.data?.projets ?? []).filter((p) => !dejaRattaches.includes(p.id));

  return (
    <Fenetre
      ouverte={ouverte}
      surFermeture={surFermeture}
      categorie={t("clients.portefeuilleCategorie")}
      titre={t("clients.rattacherUnProjetTitre")}
      mention={t("clients.rattacherMention")}
      actions={
        <Button className="btn btn-secondary" onPress={surFermeture}>
          {t("annuler")}
        </Button>
      }
    >
      <p className="field-hint">{t("clients.rattacherAide")}</p>
      <input
        className="f-input"
        type="search"
        style={{ width: "100%", marginBottom: "11px" }}
        value={recherche}
        onChange={(e) => setRecherche(e.target.value)}
        placeholder={t("clients.rechercherProjet")}
        aria-label={t("clients.rechercherProjet")}
      />
      <div className="pop-list">
        {candidats.map((p) => (
          <Button
            key={p.id}
            className="pop-action"
            isPending={rattachement.isPending}
            onPress={() => rattachement.mutate(p.id)}
          >
            <span>{p.nom}</span>
          </Button>
        ))}
        {candidats.length === 0 ? (
          <div className="empty">
            <p>{t("clients.aucunProjetARattacher")}</p>
          </div>
        ) : null}
      </div>
    </Fenetre>
  );
}
