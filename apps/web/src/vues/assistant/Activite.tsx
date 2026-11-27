import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button } from "react-aria-components";
import { DECLENCHEMENTS_PASSAGE, ETATS_PASSAGE_ACTIFS, TYPES_SOURCE_SUIVI } from "@rationarium/contracts";
import * as api from "../../api/assistant.js";
import { ErreurApi } from "../../api/client.js";
import { messageErreur } from "../../api/erreurs.js";
import { AccesRefuse, Chargement, ErreurDeChargement, EtatVide } from "../../composants/etats.js";
import { Fenetre } from "../../composants/fenetre.js";
import { useMessages } from "../../composants/messages.js";
import { useLibelle } from "../../composants/pastilles.js";
import { formaterDate, formaterNombre } from "../../formats.js";
import { lienSur } from "./difference.js";
import { EnTeteAssistant, IlYA, ModuleDesactive, PastilleEtatPassage, useMaintenant } from "./elements.js";
import { horodatage, minutesEntre } from "./formes.js";
import { SectionAValider } from "./AValider.js";
import { LigneAction, groupesParProjet } from "./LigneAction.js";
import { etatActif, moduleDesactive, optionsEtatAssistant, temoinAgent } from "./module.js";
import { creationsEnAttente, horsValidation } from "./validation.js";
import "../../composants/partages.css";
import "../projets/fiche.css";
import "./assistant.css";

/**
 * Activité de l'agent — `docs/assistant/SPEC-PHASE-1.md § 4, § 11, § 13`.
 *
 * **L'agent agit, l'écran rend compte.** L'agent a déjà écrit, avec les droits
 * de son propriétaire. L'écran dit s'il est joignable, ce qu'il a fait au
 * dernier passage, ce qu'il n'a pas pu trancher, et permet de défaire une
 * action ou un passage entier.
 *
 * **Une seule exception : la création d'un projet** (`RG-AST-21`). Elle attend
 * la validation de l'utilisateur, avec les actions qui désignent ce futur
 * projet (`RG-AST-22`). Ces attentes vivent dans la section « À valider », en
 * tête, quel que soit le passage montré : une décision en suspens ne se cache
 * pas derrière un filtre.
 *
 * `?passage=<id>` — le lien des notifications de fin de passage (`EX-AST-08`)
 * — restreint l'écran à ce passage.
 */

/** Pendant un passage actif, l'écran se tient à jour sans qu'on recharge. */
const RAFRAICHISSEMENT_MS = 15_000;
const PAS_ACTIONS = 100;
const MAX_ACTIONS = 500;
/** Le plafond de `GET /assistant/actions` : les attentes se lisent toutes, d'un coup. */
const MAX_A_VALIDER = 500;

const estActif = (p: api.Passage | null | undefined): boolean =>
  Boolean(p && (ETATS_PASSAGE_ACTIFS as readonly string[]).includes(p.etat));

export function ActiviteAgent({ passageId }: { passageId?: string | undefined }) {
  const { t } = useTranslation("assistant");
  const { t: tErreurs } = useTranslation("erreurs");
  const annoncer = useMessages();
  const client = useQueryClient();
  const maintenant = useMaintenant();
  const [limite, setLimite] = useState(PAS_ACTIONS);

  /*
   * Lecture SANS `enabled` sur la permission : la vue entière se juge au
   * serveur, qui trace le refus (`RG-ADM-03`). Les options sont celles de la
   * coquille, à l'intervalle près.
   */
  const etat = useQuery({ ...optionsEtatAssistant, refetchInterval: RAFRAICHISSEMENT_MS });
  // `RG-AST-01` — la sonde répond `{ actif: false }` quand le module est désactivé.
  const lu = etatActif(etat.data);
  const disponible = lu !== undefined;

  const selection = useQuery({
    queryKey: ["assistant", "passage", passageId],
    queryFn: () => api.passage(passageId ?? ""),
    enabled: disponible && Boolean(passageId),
    refetchInterval: (q) => (estActif(q.state.data) ? RAFRAICHISSEMENT_MS : false),
  });

  const passageMontre = passageId ? selection.data : lu?.dernierPassage;
  const actif = estActif(passageMontre);

  const actions = useQuery({
    queryKey: ["assistant", "actions", { passageId: passageId ?? null, limite }],
    queryFn: () => api.actions({ ...(passageId ? { passageId } : {}), limite }),
    enabled: disponible,
    refetchInterval: actif ? RAFRAICHISSEMENT_MS : false,
  });

  /*
   * `RG-AST-21` — les créations de projet en attente, et leurs dépendantes :
   * toutes, sans filtre de passage. Lues seulement quand la sonde en annonce,
   * et relues avec elle — la clé commence par `["assistant"]`, qu'une décision
   * invalide.
   */
  const attendues = lu?.aValider ?? 0;
  const enAttente = useQuery({
    queryKey: ["assistant", "actions", { etat: "a_valider", limite: MAX_A_VALIDER }],
    queryFn: () => api.actions({ etat: "a_valider", limite: MAX_A_VALIDER }),
    enabled: disponible && attendues > 0,
  });

  const rafraichir = () => client.invalidateQueries({ queryKey: ["assistant"] });

  const lancement = useMutation({
    mutationFn: () => api.lancerPassage(),
    onSuccess: () => {
      annoncer("ok", t("activite.passageLance"));
      void rafraichir();
    },
    onError: (e) => {
      annoncer("err", messageErreur(e, tErreurs, t("activite.echecLancement")));
      void rafraichir();
    },
  });

  if ((etat.error && moduleDesactive(etat.error)) || etat.data?.actif === false) {
    return (
      <>
        <EnTeteAssistant onglet="activite" />
        <ModuleDesactive />
      </>
    );
  }
  if (etat.error instanceof ErreurApi && etat.error.statut === 403) return <AccesRefuse erreur={etat.error} />;
  if (etat.isPending) return <Chargement quoi={t("activite.lActivite")} />;
  if (etat.isError) return <ErreurDeChargement erreur={etat.error} surReessai={() => void etat.refetch()} />;

  const e = lu;
  if (!e) return <Chargement quoi={t("activite.lActivite")} />;
  const passageActif = estActif(e.dernierPassage) ? e.dernierPassage : null;
  const liste = actions.data ?? [];
  const sansAgent = e.jetonsValides === 0;
  /* Une sonde à zéro l'emporte sur une liste encore en cache : la dernière
     décision vient d'être prise, la liste sera relue au besoin. */
  const creations = e.aValider > 0 ? creationsEnAttente(enAttente.data ?? []) : [];
  const visibles = horsValidation(liste, creations);

  return (
    <>
      <EnTeteAssistant
        onglet="activite"
        actions={
          passageActif ? null : (
            <Button className="btn btn-primary" isPending={lancement.isPending} onPress={() => lancement.mutate()}>
              {t("activite.lancer")}
            </Button>
          )
        }
      />

      <TemoinEtPlan etat={e} maintenant={maintenant} />

      {sansAgent && liste.length > 0 ? (
        <div className="alert alert-warn ag-espace">
          <span className="alert-icon" aria-hidden="true">
            !
          </span>
          <span>
            {t("activite.aucunJetonValide")}{" "}
            <Link className="lien-route" to="/profil" hash="agents">
              {t("activite.brancherAgent")}
            </Link>
          </span>
        </div>
      ) : null}

      {passageId && selection.isPending ? <Chargement quoi={t("activite.lePassage")} /> : null}
      {passageId && selection.isError ? (
        <ErreurDeChargement erreur={selection.error} surReessai={() => void selection.refetch()} />
      ) : null}
      {e.aValider > 0 && enAttente.isPending ? <Chargement quoi={t("validation.lesAttentes")} /> : null}
      {e.aValider > 0 && enAttente.isError ? (
        <ErreurDeChargement erreur={enAttente.error} surReessai={() => void enAttente.refetch()} />
      ) : null}
      <SectionAValider creations={creations} />

      {passageMontre ? (
        <PanneauPassage passage={passageMontre} selectionne={Boolean(passageId)} maintenant={maintenant} />
      ) : null}

      <div className="pl-toolbar ag-espace">
        <h2 className="panel-title sous-titre-vue">
          {passageId ? t("activite.actionsDuPassage") : t("activite.actionsRecentes")}
        </h2>
        {passageId ? (
          <div className="pl-toolbar-fin">
            <Link className="chip-btn" to="/assistant" search={{}}>
              {t("activite.toutesLesActions")}
            </Link>
          </div>
        ) : null}
      </div>

      {actions.isPending ? <Chargement quoi={t("activite.lesActions")} /> : null}
      {actions.isError ? (
        <ErreurDeChargement erreur={actions.error} surReessai={() => void actions.refetch()} />
      ) : null}

      {actions.data && liste.length > 0 && visibles.length === 0 ? (
        <p className="field-hint ag-espace">{t("validation.rienDAutre")}</p>
      ) : null}

      {actions.data && liste.length === 0 ? (
        <section className="panel">
          {sansAgent && !passageId ? (
            /* `§ 13` — tant qu'aucun agent n'est branché, l'état vide mène à la création d'un jeton. */
            <EtatVide
              titre={t("activite.videSansAgentTitre")}
              explication={t("activite.videSansAgent")}
              sortie={
                <Link className="btn btn-primary" to="/profil" hash="agents">
                  {t("activite.brancherAgent")}
                </Link>
              }
            />
          ) : (
            <EtatVide
              titre={passageId ? t("activite.videPassageTitre") : t("activite.videTitre")}
              explication={passageId ? t("activite.videPassage") : t("activite.vide")}
              sortie={
                passageActif ? (
                  <Link className="btn" to="/assistant/historique">
                    {t("activite.voirHistorique")}
                  </Link>
                ) : (
                  <Button className="btn btn-primary" isPending={lancement.isPending} onPress={() => lancement.mutate()}>
                    {t("activite.lancer")}
                  </Button>
                )
              }
            />
          )}
        </section>
      ) : null}

      {groupesParProjet(visibles).map((g) => (
        <section className="panel ag-groupe" key={g.projectId ?? "hors-projet"}>
          <div className="panel-head">
            {g.projectId ? (
              <Link className="panel-title lien-route" to="/projets/$id/suivi" params={{ id: g.projectId }}>
                {g.projetNom ?? t("activite.projetSansNom")}
              </Link>
            ) : (
              <span className="panel-title">{t("activite.horsProjet")}</span>
            )}
            <span className="eyebrow">{t("activite.nombreActions", { n: g.actions.length })}</span>
          </div>
          <div className="ag-liste">
            {g.actions.map((a) => (
              <LigneAction key={a.id} action={a} />
            ))}
          </div>
        </section>
      ))}

      {actions.data && liste.length >= limite && limite < MAX_ACTIONS ? (
        <div className="ligne-actions">
          <Button className="chip-btn" onPress={() => setLimite((l) => Math.min(MAX_ACTIONS, l + PAS_ACTIONS))}>
            {t("activite.plusAnciennes")}
          </Button>
        </div>
      ) : null}
    </>
  );
}

/** Le témoin de l'agent, les jetons, la planification : d'un coup d'œil. */
function TemoinEtPlan({ etat, maintenant }: { etat: api.EtatAssistant; maintenant: number }) {
  const { t } = useTranslation("assistant");
  const temoin = temoinAgent(etat.agent.dernierContact, maintenant);
  const couleur =
    temoin === "joignable" ? "var(--st-done)" : temoin === "silencieux" ? "var(--st-review)" : "var(--muted)";

  return (
    <div className="kpi-grid ag-kpis">
      <div className="kpi">
        <span className="eyebrow">{t("activite.agent")}</span>
        {/* Le témoin dit son état en mots, la pastille ne fait que le doubler. */}
        <p className="ag-temoin" style={{ color: couleur }} role="status">
          <span className="ag-point" aria-hidden="true" />
          {temoin === "joignable"
            ? t("activite.joignable")
            : temoin === "silencieux"
              ? t("activite.silencieux")
              : t("activite.jamaisVu")}
        </p>
        <span className="kpi-sub">
          {etat.agent.dernierContact ? (
            <>
              {t("activite.dernierContact")} <IlYA iso={etat.agent.dernierContact} maintenant={maintenant} />
            </>
          ) : (
            t("activite.aucunContact")
          )}
        </span>
      </div>
      <div className="kpi">
        <span className="eyebrow">{t("activite.jetons")}</span>
        <p className="kpi-val">{etat.jetonsValides}</p>
        <span className="kpi-sub">
          <Link className="lien-route" to="/profil" hash="agents">
            {t("activite.gererJetons")}
          </Link>
        </span>
      </div>
      <div className="kpi">
        <span className="eyebrow">{t("activite.planification")}</span>
        <p className="ag-temoin">{etat.planification ? <code className="ag-code">{etat.planification}</code> : t("activite.sansPlanification")}</p>
        <span className="kpi-sub">
          {etat.planification ? t("activite.planificationAide") : t("activite.sansPlanificationAide")}
        </span>
      </div>
      {etat.aValider > 0 ? (
        <div className="kpi">
          <span className="eyebrow">{t("validation.tuile")}</span>
          <p className="kpi-val">{etat.aValider}</p>
          <span className="kpi-sub">{t("validation.tuileAide", { n: etat.aValider })}</span>
        </div>
      ) : null}
      <div className="kpi">
        <span className="eyebrow">{t("activite.dernierPassage")}</span>
        {etat.dernierPassage ? (
          <>
            <p className="ag-temoin">
              <PastilleEtatPassage etat={etat.dernierPassage.etat} />
            </p>
            <span className="kpi-sub">{horodatage(etat.dernierPassage.creeLe)}</span>
          </>
        ) : (
          <>
            <p className="ag-temoin">{t("activite.aucunPassage")}</p>
            <span className="kpi-sub">{t("activite.aucunPassageAide")}</span>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Un passage : son état, son déclenchement, sa progression, et son bilan —
 * surtout ses POINTS OUVERTS, ce que l'agent n'a pas pu trancher seul
 * (`§ 10`). Ce sont eux qui attendent une décision.
 */
function PanneauPassage({
  passage,
  selectionne,
  maintenant,
}: {
  passage: api.Passage;
  selectionne: boolean;
  maintenant: number;
}) {
  const { t } = useTranslation("assistant");
  const { t: tErreurs } = useTranslation("erreurs");
  const libelle = useLibelle();
  const annoncer = useMessages();
  const client = useQueryClient();
  const [annulation, setAnnulation] = useState(false);
  const [defaireTout, setDefaireTout] = useState(false);
  const [compteRendu, setCompteRendu] = useState<api.CompteRenduDefaire | null>(null);
  const actif = estActif(passage);
  const bilan = passage.bilan;
  const quand = horodatage(passage.creeLe);

  const rafraichir = () => client.invalidateQueries({ queryKey: ["assistant"] });

  const annuler = useMutation({
    mutationFn: () => api.annulerPassage(passage.id),
    onSuccess: () => {
      setAnnulation(false);
      annoncer("ok", t("passage.annule"));
      void rafraichir();
    },
    onError: (e) => {
      setAnnulation(false);
      annoncer("err", messageErreur(e, tErreurs, t("passage.echecAnnulation")));
      void rafraichir();
    },
  });

  const defaire = useMutation({
    mutationFn: () => api.defairePassage(passage.id),
    onSuccess: (r) => {
      setDefaireTout(false);
      setCompteRendu(r);
      annoncer(r.restees.length === 0 ? "ok" : "warn", t("passage.defaitCompte", { defaites: r.defaites.length, restees: r.restees.length }));
      for (const queryKey of [["assistant"], ["projet"], ["projets"], ["tache"], ["taches"], ["evenements"], ["temps"]]) {
        void client.invalidateQueries({ queryKey });
      }
    },
    onError: (e) => {
      setDefaireTout(false);
      annoncer("err", messageErreur(e, tErreurs, t("passage.echecDefaire")));
    },
  });

  const duree = minutesEntre(passage.priseLe ?? passage.creeLe, passage.finLe);
  const signauxLus = bilan?.signauxLus ?? (bilan?.sources ?? []).reduce((n, s) => n + s.signaux, 0);
  const effectuees = passage.actions?.effectuees;
  /* Sans décompte — le détail d'un passage n'en porte pas —, la commande reste
     offerte une fois le passage clos : le serveur dit ce qu'il a pu défaire. */
  const defaisable = !actif && (effectuees === undefined || effectuees > 0);

  return (
    <section className="panel ag-espace" aria-labelledby={`passage-${passage.id}`}>
      <div className="panel-head">
        <span className="panel-title" id={`passage-${passage.id}`}>
          {selectionne ? t("passage.titreDu", { quand }) : t("passage.dernier")}
        </span>
        <span className="pills">
          <PastilleEtatPassage etat={passage.etat} />
          <span className="pill pill-muted">{libelle(passage.declenchement, DECLENCHEMENTS_PASSAGE)}</span>
        </span>
      </div>
      <div className="panel-body">
        <dl className="ag-faits">
          <dt>{t("passage.cree")}</dt>
          <dd>{quand}</dd>
          <dt>{t("passage.pris")}</dt>
          <dd>{passage.priseLe ? horodatage(passage.priseLe) : t("passage.pasEncorePris")}</dd>
          <dt>{t("passage.fin")}</dt>
          <dd>{passage.finLe ? horodatage(passage.finLe) : t("passage.pasEncoreFini")}</dd>
          <dt>{t("passage.duree")}</dt>
          <dd>{duree === null ? t("valeurs.vide") : <Duree minutes={duree} />}</dd>
          <dt>{t("passage.portee")}</dt>
          <dd>
            {passage.projectIds.length === 0
              ? t("passage.tousLesProjetsSuivis")
              : t("passage.projets", { n: passage.projectIds.length })}
          </dd>
          {passage.actions ? (
            <>
              <dt>{t("passage.actions")}</dt>
              <dd>
                {t("passage.decompte", {
                  effectuees: passage.actions.effectuees,
                  refusees: passage.actions.refusees,
                  defaites: passage.actions.defaites,
                  aValider: passage.actions.aValider,
                  rejetees: passage.actions.rejetees,
                })}
              </dd>
            </>
          ) : null}
          {actif ? (
            <>
              <dt>{t("passage.progression")}</dt>
              <dd>
                {passage.progression ?? (passage.etat === "en_attente" ? t("passage.attentePoste") : t("valeurs.vide"))}
                {passage.signeDeVie ? (
                  <span className="field-hint ag-ligne">
                    {t("passage.signeDeVie")} <IlYA iso={passage.signeDeVie} maintenant={maintenant} />
                  </span>
                ) : null}
              </dd>
            </>
          ) : null}
        </dl>

        {passage.erreur ? (
          <div className="alert alert-error">
            <span className="alert-icon" aria-hidden="true">
              !
            </span>
            <span>{t("passage.erreur", { erreur: passage.erreur })}</span>
          </div>
        ) : null}

        {bilan?.resume ? <p className="ag-resume">{bilan.resume}</p> : null}

        {bilan?.pointsOuverts && bilan.pointsOuverts.length > 0 ? (
          <>
            <p className="eyebrow ag-espace-haut">{t("passage.pointsOuverts", { n: bilan.pointsOuverts.length })}</p>
            <ul className="ag-points">
              {bilan.pointsOuverts.map((p, i) => (
                <li key={i} className="ag-point-ouvert">
                  <span>{p.texte}</span>
                  {p.projectId ? (
                    <Link className="link-sm lien-route" to="/projets/$id" params={{ id: p.projectId }}>
                      {t("passage.ouvrirProjet")}
                    </Link>
                  ) : null}
                  {p.preuves && p.preuves.length > 0 ? (
                    <ul className="ag-preuves">
                      {p.preuves.map((pr, j) => {
                        const lien = lienSur(pr.lien);
                        return (
                          <li key={j} className="ag-preuve">
                            <span className="ag-preuve-head">
                              <span className="pill pill-muted">{pr.source}</span>
                              <span className="ag-ref">{pr.reference}</span>
                              <span className="ag-act-when">{pr.date.length > 10 ? horodatage(pr.date) : formaterDate(pr.date)}</span>
                            </span>
                            {lien ? (
                              <a className="link-sm" href={lien} target="_blank" rel="noopener noreferrer">
                                {t("actions.ouvrirPreuve")}
                                <span className="sr-only"> {t("actions.nouvelOnglet")}</span>
                              </a>
                            ) : null}
                            {pr.extrait ? <blockquote className="ag-extrait">{pr.extrait}</blockquote> : null}
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        ) : !actif && bilan ? (
          <p className="field-hint">{t("passage.aucunPointOuvert")}</p>
        ) : null}

        {bilan?.limites && bilan.limites.length > 0 ? (
          <>
            <p className="eyebrow ag-espace-haut">{t("passage.limites")}</p>
            <ul className="ag-points">
              {bilan.limites.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          </>
        ) : null}

        {bilan?.sources && bilan.sources.length > 0 ? (
          <>
            <p className="eyebrow ag-espace-haut">{t("passage.sourcesLues", { signaux: signauxLus })}</p>
            <ul className="ag-points">
              {bilan.sources.map((s, i) => (
                <li key={i}>
                  {t("passage.source", {
                    type: libelle(s.type, TYPES_SOURCE_SUIVI),
                    designation: s.designation ?? "",
                    signaux: s.signaux,
                  })}
                </li>
              ))}
            </ul>
          </>
        ) : null}

        {bilan?.consommation ? (
          <p className="field-hint">
            {t("passage.consommation", {
              modele: bilan.consommation.modele ?? t("valeurs.vide"),
              entree: formaterNombre(bilan.consommation.jetonsEntree ?? 0),
              sortie: formaterNombre(bilan.consommation.jetonsSortie ?? 0),
            })}
            {bilan.consommation.cout !== undefined
              ? ` ${t("passage.cout", {
                  cout: formaterNombre(bilan.consommation.cout, 2),
                  devise: bilan.consommation.devise ?? "",
                })}`
              : null}
          </p>
        ) : null}

        {compteRendu ? <CompteRendu compte={compteRendu} /> : null}

        {actif || defaisable || !selectionne ? (
          <div className="ligne-actions ag-espace-haut">
            {actif ? (
              <Button className="chip-btn chip-danger" onPress={() => setAnnulation(true)}>
                {t("passage.annuler")}
              </Button>
            ) : null}
            {defaisable ? (
              <Button className="chip-btn chip-danger" onPress={() => setDefaireTout(true)}>
                {t("passage.defaireTout")}
              </Button>
            ) : null}
            {!selectionne ? (
              <Link className="chip-btn" to="/assistant" search={{ passage: passage.id }}>
                {t("passage.voirSeul")}
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>

      <Fenetre
        ouverte={annulation}
        surFermeture={() => setAnnulation(false)}
        categorie={t("actions.confirmation")}
        titre={t("passage.annulerTitre", { quand })}
        mention={t("passage.annulerMention")}
        actions={
          <>
            <Button className="btn btn-secondary" onPress={() => setAnnulation(false)}>
              {t("passage.garder")}
            </Button>
            <Button className="btn btn-danger" isPending={annuler.isPending} onPress={() => annuler.mutate()}>
              {t("passage.annuler")}
            </Button>
          </>
        }
      >
        <p className="phrase-confirmation">{t("passage.annulerTexte")}</p>
      </Fenetre>

      <Fenetre
        ouverte={defaireTout}
        surFermeture={() => setDefaireTout(false)}
        categorie={t("actions.confirmation")}
        titre={t("passage.defaireToutTitre", { quand })}
        mention={t("actions.defaireMention")}
        actions={
          <>
            <Button className="btn btn-secondary" onPress={() => setDefaireTout(false)}>
              {t("actions.annuler")}
            </Button>
            <Button className="btn btn-danger" isPending={defaire.isPending} onPress={() => defaire.mutate()}>
              {t("passage.defaireTout")}
            </Button>
          </>
        }
      >
        <p className="phrase-confirmation">
          {effectuees === undefined
            ? t("passage.defaireToutTexte")
            : t("passage.defaireToutTexteCompte", { n: effectuees })}
        </p>
      </Fenetre>
    </section>
  );
}

/**
 * Le compte rendu d'un passage défait — comme un import (`RG-IMP-04`) : ce qui
 * a été défait, et ce qui ne pouvait plus l'être, avec la raison de chacun.
 */
function CompteRendu({ compte }: { compte: api.CompteRenduDefaire }) {
  const { t } = useTranslation("assistant");
  return (
    <div className={`alert ${compte.restees.length === 0 ? "alert-success" : "alert-warn"}`} role="status">
      <span className="alert-icon" aria-hidden="true">
        !
      </span>
      <span className="bloc-etroit">
        <span>{t("passage.defaitCompte", { defaites: compte.defaites.length, restees: compte.restees.length })}</span>
        {compte.restees.length > 0 ? (
          <ul className="ag-points">
            {compte.restees.map((r) => (
              <li key={r.actionId}>{r.message}</li>
            ))}
          </ul>
        ) : null}
      </span>
    </div>
  );
}

export function Duree({ minutes }: { minutes: number }) {
  const { t } = useTranslation("assistant");
  if (minutes < 1) return <>{t("temps.moinsDUneMinute")}</>;
  if (minutes < 60) return <>{t("temps.minutes", { n: minutes })}</>;
  return <>{t("temps.heuresMinutes", { h: Math.floor(minutes / 60), m: minutes % 60 })}</>;
}
