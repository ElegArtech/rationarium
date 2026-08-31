import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button } from "react-aria-components";
import { TYPES_TIERS, STATUTS_PROJET, STATUTS_TACHE, TYPES_ACTIVITE } from "@rationarium/contracts";
import * as api from "../../api/referentiels.js";
import { messageErreur } from "../../api/erreurs.js";
import { usePeut } from "../../session/session.js";
import { Chargement, ErreurDeChargement } from "../../composants/etats.js";
import { formaterDate } from "../../formats.js";
import { Fenetre } from "../../composants/fenetre.js";
import { useMessages } from "../../composants/messages.js";
import { MarqueurCalcule, Pastille, useLibelle } from "../../composants/pastilles.js";
import { IconeProjet } from "../../composants/icones-projet.js";
import * as apiProjets from "../../api/projets.js";
import "../../composants/partages.css";
/*
 * Maquettes cumulatives : les sections 27 et 28 réemploient des classes
 * introduites plus tôt. `.ms-toggle` vient de la section 17, `.lv-acts` de la
 * 23, `.proj-head` / `.pills` / `.side-dl` / `.two-col` de la 15.
 */
import "../projets/jalons.css";
import "../projets/fiche.css";
import "../projets/equipe.css";
import "../taches/liste.css";
import "../taches/fiche.css";
import "../occupations/conges.css";
import "./tiers.css";
import "./clients.css";

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
  /** `on` (actifs), `off` (archivés) ou `` (tous) — l'ordre de la maquette. */
  const [statut, setStatut] = useState("on");
  const [creationOuverte, setCreationOuverte] = useState(false);

  const reinitialiser = () => {
    setRecherche("");
    setType("");
    setStatut("on");
  };

  const filtres = { recherche, type, archive: statut !== "on" };
  const requete = useQuery({
    queryKey: ["tiers", filtres],
    queryFn: () => api.listerTiers(filtres),
  });

  const liste = (requete.data ?? []).filter((x) =>
    statut === "on" ? x.actif : statut === "off" ? !x.actif : true,
  );

  return (
    <>
      <div className="pl-toolbar">
        <div>
          <span className="eyebrow">{t("tiers.surtitre")}</span>
          <h1 className="h1">{t("tiers.titre")}</h1>
        </div>
        <span className="count-split">{t("tiers.compte", { n: liste.length })}</span>
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
          className="f-input"
          type="search"
          style={{ width: "230px" }}
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
        <select
          className="f-input"
          value={statut}
          onChange={(e) => setStatut(e.target.value)}
          aria-label={t("tiers.colStatut")}
        >
          <option value="on">{t("tiers.filtreActifs")}</option>
          <option value="off">{t("tiers.filtreArchives")}</option>
          <option value="">{t("tiers.filtreTous")}</option>
        </select>
        <Button className="chip-btn" onPress={reinitialiser}>
          {t("reinitialiser")}
        </Button>
      </div>

      {requete.isPending ? <Chargement quoi={t("tiers.lesTiers")} /> : null}
      {requete.isError ? (
        <ErreurDeChargement erreur={requete.error} surReessai={() => void requete.refetch()} />
      ) : null}

      {requete.isSuccess ? (
        <section className="panel">
          <div className="tp-grid tp-head">
            <span>{t("tiers.colType")}</span>
            <span>{t("tiers.colIdentite")}</span>
            <span>{t("tiers.colContact")}</span>
            <span>{t("tiers.colRattachements")}</span>
            <span>{t("tiers.colStatut")}</span>
            <span style={{ textAlign: "right" }}>{t("tiers.colActions")}</span>
          </div>
          <div>
            {liste.map((x) => (
              <LigneTiers key={x.id} tiers={x} />
            ))}
          </div>
          {liste.length === 0 ? (
            <div className="empty">
              <p>{t("tiers.videTitre")}</p>
              <small>{t("tiers.videExplication")}</small>
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

function LigneTiers({ tiers }: { tiers: api.Tiers }) {
  const { t } = useTranslation("referentiels");
  const libelle = useLibelle();
  const peut = usePeut();
  const morale = tiers.type === "organisation";

  const [suppressionOuverte, setSuppressionOuverte] = useState(false);
  const [modificationOuverte, setModificationOuverte] = useState(false);

  return (
    <div className={`tp-grid tp-row${tiers.actif ? "" : " is-off"}`}>
      <div>
        <span className={`tp-kind ${morale ? "is-moral" : "is-phys"}`}>
          <span className="tp-glyph" aria-hidden="true">
            {morale ? "⌷" : "◇"}
          </span>
          <span>{libelle(tiers.type, TYPES_TIERS)}</span>
        </span>
      </div>

      <div style={{ minWidth: 0 }}>
        <p className="tp-n">{tiers.organisation ?? tiers.contactNom ?? "—"}</p>
        {tiers.notes ? <span className="tp-note">{tiers.notes}</span> : null}
      </div>

      {/* Une personne morale n'a pas de contact nommé : on l'écrit, on ne
          laisse pas une case vide qui se lirait comme une donnée manquante. */}
      <div style={{ minWidth: 0 }}>
        <span className={`tp-c${morale ? " is-none" : ""}`}>
          {morale ? t("tiers.coordonneesGeneriques") : (tiers.contactNom ?? t("tiers.sansContact"))}
        </span>
        <span className="tp-c-mail">{tiers.contactEmail ?? t("nonRenseigne")}</span>
      </div>

      <div className="tp-link">
        <span>{t("tiers.projetsRattaches", { n: tiers._count.projets })}</span>
        <span>{t("tiers.tachesAssignees", { n: tiers._count.taches })}</span>
      </div>

      <div>
        <span className="pill" style={{ color: tiers.actif ? "var(--st-done)" : "var(--muted)" }}>
          {tiers.actif ? t("tiers.actif") : t("tiers.archive")}
        </span>
        {tiers.actif ? null : (
          <span className="tp-c-mail" style={{ color: "var(--st-review)" }}>
            {t("tiers.nonAssignable")}
          </span>
        )}
      </div>

      <div className="lv-acts">
        <Link to="/tiers/$id" params={{ id: tiers.id }} className="ms-toggle">
          {t("fiche")}
        </Link>
        {/* « Modifier », que les maquettes 23 et 24 posent et qui n'existait
            pas : corriger un numéro imposait de supprimer le tiers. */}
        {peut("third_parties:update") ? (
          <Button className="ms-toggle" onPress={() => setModificationOuverte(true)}>
            {t("modifier")}
          </Button>
        ) : null}
        {peut("third_parties:delete") ? (
          <Button className="ms-toggle" onPress={() => setSuppressionOuverte(true)}>
            {t("supprimer")}
          </Button>
        ) : null}
      </div>

      <FenetreCreation
        ouverte={modificationOuverte}
        surFermeture={() => setModificationOuverte(false)}
        tiers={tiers}
      />

      {/* `RG-TRS-06` — le bilan d'impact précède la confirmation, y compris
          depuis la liste : supprimer d'un clic sans bilan serait le contraire
          de la règle. */}
      <FenetreSuppressionTiers
        id={tiers.id}
        projets={tiers._count.projets}
        taches={tiers._count.taches}
        heures={0}
        surSuccesRediriger={false}
        ouverte={suppressionOuverte}
        surFermeture={() => setSuppressionOuverte(false)}
      />
    </div>
  );
}

/** Vue 24 — Fiche tiers : ses rattachements, et le temps déclaré pour lui. */
export function FicheTiers({ tiersId }: { tiersId: string }) {
  const { t } = useTranslation("referentiels");
  const { t: tErreurs } = useTranslation("erreurs");
  const libelle = useLibelle();
  const peut = usePeut();
  const annoncer = useMessages();
  const cache = useQueryClient();
  const [suppressionOuverte, setSuppressionOuverte] = useState(false);
  const [modificationOuverte, setModificationOuverte] = useState(false);

  const requete = useQuery({
    queryKey: ["tiers", tiersId],
    queryFn: () => api.ficheTiers(tiersId),
  });

  /*
   * `EX-TRS-02` — **l'archivage est réversible**, et c'est ce qui le distingue
   * de la suppression : un tiers archivé reste consultable et garde son temps
   * déclaré. La valeur envoyée se lit sur la donnée servie, jamais sur un état
   * local qui pourrait la contredire.
   */
  const bascule = useMutation({
    mutationFn: () => api.modifierTiers(tiersId, { actif: !requete.data?.actif }),
    onSuccess: () => {
      annoncer("ok", requete.data?.actif ? t("tiers.archiveFait") : t("tiers.reactiveFait"));
      void cache.invalidateQueries({ queryKey: ["tiers"] });
    },
    onError: (e) => annoncer("err", messageErreur(e, tErreurs, t("tiers.echecAction"))),
  });

  /* L'avancement n'est pas servi par la fiche tiers : il l'est par le
     portefeuille. On le compose plutôt que de laisser la barre vide. */
  const portefeuille = useQuery({
    queryKey: ["projets", "portefeuille"],
    queryFn: () => apiProjets.portefeuille({}),
  });
  const avancementDe = (id: string) =>
    portefeuille.data?.projets.find((x) => x.id === id)?.progression ?? 0;

  const [rattachementOuvert, setRattachementOuvert] = useState(false);

  if (requete.isPending) return <Chargement quoi={t("tiers.leTiers")} />;
  if (requete.isError)
    return <ErreurDeChargement erreur={requete.error} surReessai={() => void requete.refetch()} />;

  const tiers = requete.data;
  const morale = tiers.type === "organisation";
  /*
   * Les rôles tenus, dédupliqués : la ligne d'informations donne la lecture
   * d'ensemble, chaque projet porte le sien. Un tiers peut n'en avoir aucun.
   */
  const roles =
    [...new Set(tiers.projets.map((p) => p.role).filter((r): r is string => Boolean(r)))].join(
      " · ",
    ) || null;
  const enCours = tiers.projets.filter((p) => p.statut === "active").length;
  const terminees = tiers.taches.filter((x) => x.statut === "done").length;

  return (
    <>
      <Link to="/tiers" className="back-link" activeOptions={{ exact: true }}>
        <span aria-hidden="true">←</span> <span>{t("tiers.retour")}</span>
      </Link>

      {tiers.actif ? null : (
        <div className="alert alert-warn" role="status">
          <span className="alert-icon" aria-hidden="true">
            ⌸
          </span>
          <span style={{ flex: 1 }}>{t("tiers.bandeauArchive")}</span>
          {peut("third_parties:update") ? (
            <Button
              className="chip-btn"
              style={{ flex: "none" }}
              isPending={bascule.isPending}
              onPress={() => bascule.mutate()}
            >
              {t("tiers.reactiver")}
            </Button>
          ) : null}
        </div>
      )}

      <div className="proj-head">
        <div className={`tp-hero ${morale ? "is-moral" : "is-phys"}`} aria-hidden="true">
          {morale ? "⌷" : "◇"}
        </div>
        <div style={{ minWidth: 0 }}>
          <span className="eyebrow">{libelle(tiers.type, TYPES_TIERS)}</span>
          <h1 className="proj-name">{tiers.organisation ?? tiers.contactNom ?? "—"}</h1>
          <div className="pills">
            <span className={`tp-kind ${morale ? "is-moral" : "is-phys"}`}>
              <span className="tp-glyph" aria-hidden="true">
                {morale ? "⌷" : "◇"}
              </span>
              <span>{libelle(tiers.type, TYPES_TIERS)}</span>
            </span>
            <span
              className="pill"
              style={{ color: tiers.actif ? "var(--st-done)" : "var(--muted)" }}
            >
              {tiers.actif ? t("tiers.actif") : t("tiers.archive")}
            </span>
          </div>
        </div>
        {/* `RG-GEN-06` — le client masque par courtoisie ; le contrôle reste au
            serveur. Un tiers déjà archivé n'offre plus « Archiver » : c'est le
            bandeau qui porte alors « Réactiver ». */}
        <div className="proj-acts">
          {peut("third_parties:update") ? (
            <Button className="chip-btn" onPress={() => setModificationOuverte(true)}>
              {t("modifier")}
            </Button>
          ) : null}
          {peut("third_parties:update") && tiers.actif ? (
            <Button
              className="chip-btn"
              isPending={bascule.isPending}
              onPress={() => bascule.mutate()}
            >
              {t("tiers.archiver")}
            </Button>
          ) : null}
          {peut("third_parties:delete") ? (
            <Button
              className="chip-btn"
              style={{ color: "var(--st-blocked)", borderColor: "var(--st-blocked)" }}
              onPress={() => setSuppressionOuverte(true)}
            >
              {t("supprimer")}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi">
          <span className="eyebrow">{t("tiers.projetsRattachesTitre")}</span>
          <p className="kpi-val">{tiers.projets.length}</p>
          <span className="kpi-sub">{t("tiers.dontEnCours", { n: enCours })}</span>
        </div>
        <div className="kpi">
          <span className="eyebrow">{t("tiers.tachesAssigneesTitre")}</span>
          <p className="kpi-val">{tiers.taches.length}</p>
          <span className="kpi-sub">
            {t("tiers.tachesTerminees", { n: terminees })}
          </span>
        </div>
        <div className="kpi">
          <div className="kpi-head">
            <span className="eyebrow">{t("tiers.heuresDeclarees")}</span>
            <MarqueurCalcule explication={t("tiers.heuresCalcul")} />
          </div>
          <p className="kpi-val">{t("tiers.heures", { n: tiers.heuresDeclarees })}</p>
          <span className="kpi-sub">{t("tiers.saisies", { n: tiers.saisies })}</span>
        </div>

        {/* La période d'intervention se lit sur les saisies, pas sur une date
            saisie à la main : c'est la première et la dernière fois que ce
            tiers a été porté sur une déclaration de temps. */}
        <div className="kpi">
          <span className="eyebrow">{t("tiers.periodeIntervention")}</span>
          <p className="kpi-val" style={{ fontSize: "19px" }}>
            {tiers.premiereIntervention ? formaterDate(tiers.premiereIntervention) : "—"}
          </p>
          <span className="kpi-sub">
            {tiers.derniereIntervention
              ? t("tiers.premiereDerniere", {
                  date: formaterDate(tiers.derniereIntervention),
                })
              : t("tiers.aucuneIntervention")}
          </span>
        </div>
      </div>

      <div className="two-col">
        <div>
          <section className="panel">
            <div className="panel-head">
              <span className="panel-title">{t("tiers.projetsRattachesTitre")}</span>
              {peut("third_parties:assign") ? (
                <Button className="chip-btn" onPress={() => setRattachementOuvert(true)}>
                  {t("tiers.rattacherAUnProjet")}
                </Button>
              ) : null}
            </div>
            <div>
              {tiers.projets.map((p) => (
                <Link to="/projets/$id" params={{ id: p.id }} className="lnk-row" key={p.id}>
                  {/* Le jeu `p-*` existe désormais (`@rationarium/contracts`) : la
                      pastille rend le SYMBOLE du projet, pas son code. */}
                  <IconeProjet icone={p.icone} nom={p.nom} />
                  <span style={{ minWidth: 0 }}>
                    <p className="lnk-n">{p.nom}</p>
                    <span className="lnk-s">
                      {libelle(p.statut, STATUTS_PROJET)}
                      {p.role ? ` · ${p.role}` : ""}
                    </span>
                  </span>
                  <span className="prow-progline">
                    <span className="bar">
                      <i style={{ width: `${avancementDe(p.id)}%` }} />
                    </span>
                    <span className="prow-pct">{avancementDe(p.id)} %</span>
                  </span>
                  <span>
                    <Pastille code={p.statut} vocabulaire={STATUTS_PROJET} />
                  </span>
                  <span className="prow-go" aria-hidden="true">
                    ›
                  </span>
                </Link>
              ))}
            </div>
            {tiers.projets.length === 0 ? (
              <div className="empty">
                <p>{t("tiers.aucunProjet")}</p>
                <small>{t("tiers.aucunProjetExplication")}</small>
              </div>
            ) : null}
          </section>

          <section className="panel">
            <div className="panel-head">
              <span className="panel-title">{t("tiers.tachesAssigneesTitre")}</span>
              <span className="eyebrow">{t("tiers.uniquementProjetsRattaches")}</span>
            </div>
            <div>
              {tiers.taches.map((x) => (
                <div className="tsk-row" key={x.id}>
                  <div style={{ minWidth: 0 }}>
                    <p className="lnk-n">{x.titre}</p>
                  </div>
                  {/* `RG-TRS-05` — une tâche assignée l'est toujours dans un
                      projet auquel le tiers est rattaché : la pastille du
                      projet dit lequel, sans quoi la liste est illisible. */}
                  <div style={{ minWidth: 0 }}>
                    {x.projet ? (
                      <span className="pchip" title={x.projet.nom}>
                        {x.projet.icone ? (
                          <svg className="picon" aria-hidden="true">
                            <use href={`#${x.projet.icone}`} />
                          </svg>
                        ) : null}
                        <span>{x.projet.nom}</span>
                      </span>
                    ) : (
                      <span className="pchip is-indep">
                        <span className="dot-ind" aria-hidden="true" />
                        <span>{t("tiers.tacheIndependante")}</span>
                      </span>
                    )}
                  </div>
                  <div>
                    <Pastille code={x.statut} vocabulaire={STATUTS_TACHE} />
                  </div>
                  <span className="lnk-s">
                    {x.dateFin
                      ? t("tiers.finLe", { date: formaterDate(x.dateFin) })
                      : t("tiers.sansEcheance")}
                  </span>
                </div>
              ))}
            </div>
            {tiers.taches.length === 0 ? (
              <div className="empty">
                <p>{t("tiers.aucuneTache")}</p>
                <small>{t("tiers.aucuneTacheExplication")}</small>
              </div>
            ) : null}
          </section>

          {/*
           * Temps déclaré — les saisies les plus récentes, et le reste annoncé.
           * Le panneau vivait sur le seul total : « 184 h » sans une ligne de
           * détail ne permet ni de reconnaître une saisie erronée, ni de savoir
           * sur quoi le tiers est intervenu.
           */}
          <section className="panel">
            <div className="panel-head">
              <span className="panel-title">{t("tiers.tempsDeclarePour")}</span>
              <span className="eyebrow">{t("tiers.heures", { n: tiers.heuresDeclarees })}</span>
            </div>
            <div className="tm-row tm-head">
              <span>{t("tiers.colDate")}</span>
              <span>{t("tiers.colDuree")}</span>
              <span>{t("tiers.colActivite")}</span>
              <span>{t("tiers.colObjet")}</span>
            </div>
            <div>
              {tiers.saisiesRecentes.map((s) => (
                <div className="tm-row" key={s.id}>
                  <span className="lv-when">{formaterDate(s.date)}</span>
                  <span className="te-h">{t("tiers.heures", { n: s.heures })}</span>
                  <div>
                    <Pastille code={s.typeActivite} vocabulaire={TYPES_ACTIVITE} />
                  </div>
                  <span className="te-desc">{s.description ?? t("nonRenseigne")}</span>
                </div>
              ))}
              {/* `RG-RPT-02` d'esprit : une liste coupée en silence ferait
                  conclure que le tiers n'a que cinq saisies. */}
              {tiers.saisiesRestantes > 0 ? (
                <p className="prev-more">
                  {t("tiers.autresSaisies", { n: tiers.saisiesRestantes })}
                </p>
              ) : null}
            </div>
            {tiers.saisiesRecentes.length === 0 ? (
              <div className="empty">
                <p>{t("tiers.aucunTemps")}</p>
                <small>{t("tiers.aucunTempsExplication")}</small>
              </div>
            ) : null}
          </section>
        </div>

        <div>
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
                  <dt>{t("tiers.raisonSociale")}</dt>
                  <dd>{tiers.organisation ?? t("nonRenseigne")}</dd>
                  <dt>{t("tiers.contactNomme")}</dt>
                  <dd className="is-none">{t("tiers.sansObjetPersonneMorale")}</dd>
                </>
              ) : (
                <>
                  <dt>{t("tiers.colContact")}</dt>
                  <dd className={tiers.contactNom ? "" : "is-none"}>
                    {tiers.contactNom ?? t("tiers.sansContact")}
                  </dd>
                </>
              )}

              <dt>{morale ? t("tiers.emailGenerique") : t("tiers.email")}</dt>
              <dd className={tiers.contactEmail ? "" : "is-none"}>
                {tiers.contactEmail ?? t("nonRenseigne")}
              </dd>
              <dt>{t("tiers.telephone")}</dt>
              <dd className={tiers.contactTelephone ? "" : "is-none"}>
                {tiers.contactTelephone ?? t("nonRenseigne")}
              </dd>

              <dt>{t("tiers.tempsDeclare")}</dt>
              <dd>{t("tiers.saisies", { n: tiers.saisies })}</dd>
              <dt>{t("tiers.adresse")}</dt>
              <dd className={tiers.adresse ? "" : "is-none"}>
                {tiers.adresse ?? t("nonRenseigne")}
              </dd>

              {/*
               * Le RÔLE est celui du rattachement, pas du tiers : le même
               * prestataire peut être « développement » ici et « AMO »
               * ailleurs. La ligne d'informations en donne donc la lecture
               * d'ensemble, et chaque projet porte le sien sur sa ligne.
               */}
              <dt>{t("tiers.role")}</dt>
              <dd className={roles ? "" : "is-none"}>{roles ?? t("nonRenseigne")}</dd>

              {/*
               * Le SIRET reste absent : le modèle ne le porte pas. Un libellé
               * suivi d'un « non renseigné » que rien ne peut jamais remplir
               * vaut moins qu'une absence assumée. Voir
               * `docs/audits/conformite-maquettes.md § 3`.
               */}
            </dl>
          </section>

          <section className="panel">
            <div className="panel-head">
              <span className="panel-title">{t("tiers.notes")}</span>
            </div>
            <div className="panel-body">
              {tiers.notes ? (
                <p style={{ margin: 0, fontSize: "12.5px", lineHeight: 1.6 }}>{tiers.notes}</p>
              ) : (
                <p style={{ margin: 0, fontSize: "12.5px", color: "var(--muted)", fontStyle: "italic" }}>
                  {t("tiers.aucuneNote")}
                </p>
              )}
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <span className="panel-title">{t("tiers.suivi")}</span>
            </div>
            <dl className="side-dl">
              <dt>{t("tiers.creeLe")}</dt>
              <dd>{formaterDate(tiers.creeLe)}</dd>
              <dt>{t("tiers.modifieLe")}</dt>
              <dd>{formaterDate(tiers.modifieLe)}</dd>
              <dt>{t("tiers.assignable")}</dt>
              <dd>{tiers.actif ? t("oui") : t("non")}</dd>
            </dl>
          </section>
        </div>
      </div>

      <FenetreRattachementTiers
        tiersId={tiers.id}
        dejaRattaches={tiers.projets.map((p) => p.id)}
        ouverte={rattachementOuvert}
        surFermeture={() => setRattachementOuvert(false)}
      />

      <FenetreCreation
        ouverte={modificationOuverte}
        surFermeture={() => setModificationOuverte(false)}
        tiers={tiers}
      />

      <FenetreSuppressionTiers
        id={tiers.id}
        projets={tiers.projets.length}
        taches={tiers.taches.length}
        heures={tiers.saisies}
        surSuccesRediriger
        ouverte={suppressionOuverte}
        surFermeture={() => setSuppressionOuverte(false)}
      />
    </>
  );
}

/**
 * `RG-TRS-06` — le bilan d'impact précède la confirmation.
 *
 * Un tiers engagé sur des projets ou des tâches ne se supprime pas sans qu'on
 * sache quoi. Les volumes sont chiffrés avant le geste, jamais après.
 */
function FenetreSuppressionTiers({
  id,
  projets,
  taches,
  heures,
  surSuccesRediriger,
  ouverte,
  surFermeture,
}: {
  id: string;
  projets: number;
  taches: number;
  heures: number;
  surSuccesRediriger: boolean;
  ouverte: boolean;
  surFermeture: () => void;
}) {
  const { t } = useTranslation("referentiels");
  const { t: tErreurs } = useTranslation("erreurs");
  const annoncer = useMessages();
  const client = useQueryClient();

  const impact = useQuery({
    queryKey: ["tiers", id, "impact"],
    queryFn: () => api.impactTiers(id),
    enabled: ouverte,
  });

  const suppression = useMutation({
    mutationFn: () => api.supprimerTiers(id),
    onSuccess: () => {
      annoncer("ok", t("tiers.supprime"));
      if (surSuccesRediriger) window.location.assign("/tiers");
      else void client.invalidateQueries({ queryKey: ["tiers"] });
    },
    onError: (e) => annoncer("err", messageErreur(e, tErreurs, t("tiers.echecSuppression"))),
  });

  const refuse = impact.data ? impact.data.blocages.length > 0 : false;

  return (
    <Fenetre
      ouverte={ouverte}
      surFermeture={surFermeture}
      categorie={t("tiers.bilanImpact")}
      titre={t("tiers.supprimerTitre")}
      mention={t("tiers.deuxIssues")}
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
              {t("supprimer")}
            </Button>
          )}
        </>
      }
    >
      {impact.isPending ? <Chargement quoi={t("tiers.leBilan")} /> : null}

      {impact.data ? (
        <>
          <p className="lede">{t("tiers.bilanIntro")}</p>
          <div className="impact">
            <div className="imp">
              <p className="imp-n">{projets}</p>
              <span className="eyebrow">{t("tiers.projets")}</span>
            </div>
            <div className="imp">
              <p className="imp-n">{taches}</p>
              <span className="eyebrow">{t("tiers.taches")}</span>
            </div>
            <div className={`imp${heures > 0 ? " is-hot" : ""}`}>
              <p className="imp-n">{heures}</p>
              <span className="eyebrow">{t("tiers.saisiesCourt")}</span>
            </div>
          </div>

          <ul className="imp-list">
            {impact.data.blocages.map((b) => (
              <li key={b.objet}>
                <span className="imp-k">{b.objet}</span>
                <span>{b.nombre}</span>
              </li>
            ))}
          </ul>

          <div className="alert alert-warn">
            <span className="alert-icon" aria-hidden="true">
              !
            </span>
            <span>{t("tiers.archiverOuSupprimer")}</span>
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
/**
 * Créer OU modifier — la même fenêtre, le même formulaire, les mêmes règles.
 *
 * Deux fenêtres pour les mêmes champs finiraient par diverger : c'est celle
 * qu'on modifie le moins souvent qui garderait l'ancienne validation. La
 * distinction tient à un seul paramètre, et à la mutation qu'il choisit.
 */
function FenetreCreation({
  ouverte,
  surFermeture,
  tiers: aModifier,
}: {
  ouverte: boolean;
  surFermeture: () => void;
  tiers?: {
    id: string;
    type: string;
    organisation: string | null;
    contactNom: string | null;
    contactEmail: string | null;
    contactTelephone: string | null;
  };
}) {
  const { t } = useTranslation("referentiels");
  const { t: tErreurs } = useTranslation("erreurs");
  const libelle = useLibelle();
  const annoncer = useMessages();
  const client = useQueryClient();

  const [type, setType] = useState(aModifier?.type ?? "individual");
  const [organisation, setOrganisation] = useState(aModifier?.organisation ?? "");
  const [contactNom, setContactNom] = useState(aModifier?.contactNom ?? "");
  const [contactEmail, setContactEmail] = useState(aModifier?.contactEmail ?? "");
  const [contactTelephone, setContactTelephone] = useState(aModifier?.contactTelephone ?? "");
  const [notes, setNotes] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);

  const morale = type === "organisation";

  const creation = useMutation({
    mutationFn: () => {
      const champs = {
        type,
        organisation: organisation || null,
        // Une personne morale ne porte pas de contact nommé : on n'envoie pas
        // un champ que le serveur refusera.
        contactNom: morale ? null : contactNom || null,
        contactEmail: contactEmail || null,
        contactTelephone: contactTelephone || null,
        ...(notes ? { notes } : {}),
      };
      return aModifier ? api.modifierTiers(aModifier.id, champs) : api.creerTiers(champs);
    },
    onSuccess: () => {
      annoncer("ok", t(aModifier ? "tiers.modifie" : "tiers.cree"));
      setOrganisation("");
      setContactNom("");
      setContactEmail("");
      setContactTelephone("");
      surFermeture();
      void client.invalidateQueries({ queryKey: ["tiers"] });
    },
    onError: (e) => setErreur(messageErreur(e, tErreurs, t("tiers.echecCreation"))),
  });

  return (
    <Fenetre
      ouverte={ouverte}
      surFermeture={surFermeture}
      categorie={t("tiers.categorie")}
      titre={t(aModifier ? "tiers.modifier" : "tiers.nouveau")}
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

      {/* Le type conditionne toute la suite du formulaire. */}
      <div className="kind-seg">
        {TYPES_TIERS.map((x) => (
          <Button
            key={x.code}
            className="kind-opt"
            aria-pressed={type === x.code}
            onPress={() => setType(x.code)}
          >
            <span className="tp-glyph" aria-hidden="true">
              {x.code === "organisation" ? "⌷" : "◇"}
            </span>
            <span>
              <span className="kind-name">{libelle(x.code, TYPES_TIERS)}</span>
              <span className="kind-desc">
                {x.code === "organisation" ? t("tiers.aideMoraleCourt") : t("tiers.aidePhysique")}
              </span>
            </span>
          </Button>
        ))}
      </div>

      <div className="field-block">
        <label className="field-label" htmlFor="tp-org">
          {morale ? t("tiers.organisation") : t("tiers.nomDusage")} <span className="req">*</span>
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
        <div className="explain">
          <span aria-hidden="true" style={{ color: "var(--accent)", fontSize: "15px" }}>
            ⌷
          </span>
          <div>
            <p className="explain-t">{t("tiers.pasDeContactNomme")}</p>
            <p className="explain-d">{t("tiers.aideMorale")}</p>
          </div>
        </div>
      ) : (
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
      )}

      <div className="field-block">
        <label className="field-label" htmlFor="tp-mail">
          {morale ? t("tiers.emailGenerique") : t("tiers.email")}
        </label>
        <input
          className="field"
          id="tp-mail"
          type="email"
          value={contactEmail}
          onChange={(e) => setContactEmail(e.target.value)}
        />
      </div>

      <div className="field-block">
        <label className="field-label" htmlFor="tp-tel">
          {t("tiers.telephone")}
        </label>
        <input
          className="field"
          id="tp-tel"
          type="tel"
          value={contactTelephone}
          onChange={(e) => setContactTelephone(e.target.value)}
        />
      </div>

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


/**
 * `RG-TRS-05` — un tiers ne s'assigne à une tâche que s'il est rattaché au
 * projet de cette tâche. Le rattachement est donc le geste préalable, et il a
 * sa place sur la fiche.
 */
function FenetreRattachementTiers({
  tiersId,
  dejaRattaches,
  ouverte,
  surFermeture,
}: {
  tiersId: string;
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
    mutationFn: (projetId: string) => api.rattacherTiersAuProjet(projetId, tiersId),
    onSuccess: () => {
      annoncer("ok", t("tiers.rattache"));
      surFermeture();
      void client.invalidateQueries({ queryKey: ["tiers"] });
    },
    onError: (e) => annoncer("err", messageErreur(e, tErreurs, t("tiers.echecRattachement"))),
  });

  const candidats = (projets.data?.projets ?? []).filter((p) => !dejaRattaches.includes(p.id));

  return (
    <Fenetre
      ouverte={ouverte}
      surFermeture={surFermeture}
      categorie={t("tiers.categorie")}
      titre={t("tiers.rattacherAUnProjetTitre")}
      mention={t("tiers.rattacherMention")}
      actions={
        <Button className="btn btn-secondary" onPress={surFermeture}>
          {t("annuler")}
        </Button>
      }
    >
      <input
        className="f-input"
        type="search"
        style={{ width: "100%", marginBottom: "11px" }}
        value={recherche}
        onChange={(e) => setRecherche(e.target.value)}
        placeholder={t("tiers.rechercherProjet")}
        aria-label={t("tiers.rechercherProjet")}
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
            <p>{t("tiers.aucunProjetARattacher")}</p>
          </div>
        ) : null}
      </div>
    </Fenetre>
  );
}
