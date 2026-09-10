import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Button } from "react-aria-components";
import * as api from "../../api/projets.js";
import { ErreurApi } from "../../api/client.js";
import { messageErreur } from "../../api/erreurs.js";
import { usePeut } from "../../session/session.js";
import { Chargement, ErreurDeChargement } from "../../composants/etats.js";
import { Fenetre } from "../../composants/fenetre.js";
import { FenetreCreation } from "./Portefeuille.js";
import { useMessages } from "../../composants/messages.js";
import { STATUTS_JALON, progressionJalon, type StatutJalon } from "@rationarium/contracts";
import { Pastille, Barre, MarqueurCalcule } from "../../composants/pastilles.js";
import { formaterDate, formaterNombre } from "../../formats.js";
import { CadreProjet } from "./Fiche.js";
import "../../composants/partages.css";
import "./fiche.css";

/**
 * Vue 11 — Projet, onglet Vue d'ensemble.
 *
 * **La progression et le budget consommé sont calculés, jamais saisis.** Le
 * brief le souligne : « ne pas suggérer qu'ils sont modifiables ». D'où le
 * marqueur `Calculé` porté par les deux indicateurs concernés, et son
 * explication accessible au clavier — une infobulle au survol n'existe pas
 * pour qui n'a pas de souris.
 */
export function VueEnsemble({ projetId }: { projetId: string }) {
  const { t } = useTranslation("projets");
  const { t: tErreurs } = useTranslation("erreurs");
  /* Deux liaisons dans un même fichier : `i18n:check` attribue chaque appel à
     SA liaison, à condition de ne pas les nommer pareil. */
  const { t: tCommun } = useTranslation("commun");
  const peut = usePeut();
  const annoncer = useMessages();
  const client = useQueryClient();
  const [suppressionOuverte, setSuppressionOuverte] = useState(false);
  const [annulationOuverte, setAnnulationOuverte] = useState(false);
  const [editionOuverte, setEditionOuverte] = useState(false);

  const requete = useQuery({
    queryKey: ["projet", projetId],
    queryFn: () => api.fiche(projetId),
  });
  const route = useQuery({
    queryKey: ["projet", projetId, "route"],
    queryFn: () => api.feuilleDeRoute(projetId),
  });
  /*
   * `EX-PRJ-13` — l'historique des instantanés.
   *
   * Il se lit ICI, sous la commande qui les produit et sous l'indicateur
   * « Dernier instantané » qui n'en montrait qu'un. Le raccord entre la
   * lecture et l'écriture est le sujet : capturer puis voir la ligne
   * apparaître est ce qui prouve que le produit écrit ce qu'il dit écrire.
   *
   * `reports:read` est la permission de la route ; le client masque sur
   * celle-là, pas sur une plus stricte choisie ici (`RG-GEN-06`).
   */
  const historique = useQuery({
    queryKey: ["projet", projetId, "instantanes"],
    queryFn: () => api.instantanes(projetId),
    enabled: peut("reports:read"),
  });

  const cycleDeVie = useMutation({
    mutationFn: (geste: "archiver" | "desarchiver" | "restaurer" | "annuler") =>
      geste === "restaurer"
        ? api.restaurerProjet(projetId)
        : geste === "annuler"
          ? api.annulerProjet(projetId)
          : api.archiverProjet(projetId, geste === "archiver"),
    onSuccess: (_, geste) => {
      annoncer("ok", t(`fiche.${geste}Fait`));
      void client.invalidateQueries({ queryKey: ["projet", projetId] });
      void client.invalidateQueries({ queryKey: ["projets"] });
    },
    onError: (e) => annoncer("err", messageErreur(e, tErreurs, t("fiche.echecAction"))),
  });

  /**
   * `EX-PRJ-13`, `RG-PRJ-09` — figer l'avancement d'aujourd'hui.
   *
   * La date est celle du jour, jamais un champ : `RG-PRJ-09` parle d'un relevé
   * *périodique*, pas d'une saisie rétroactive, et laisser choisir la date
   * ouvrirait la porte à réécrire un point de la courbe qu'on est justement là
   * pour ne pas recalculer.
   *
   * **Cette commande est aujourd'hui le SEUL producteur d'instantanés du
   * produit.** `cadrage/03 § 5.4` confie la capture à un travail `pg-boss`
   * périodique ; ce travail n'existe pas. Sans elle, `dernierInstantane` de la
   * fiche et la courbe de tendance de la vue 30 restent vides à jamais.
   *
   * L'accusé de réception rend la **progression reçue**, pas celle qu'on
   * affichait : c'est la seule façon de vérifier que le serveur a bien écrit
   * ce qu'on croit, plutôt que d'afficher notre propre état sous un autre nom.
   */
  const instantane = useMutation({
    mutationFn: () =>
      api.capturerInstantane(projetId, new Date().toISOString().slice(0, 10)),
    onSuccess: (pris) => {
      annoncer(
        "ok",
        pris ? t("fiche.instantanePris", {
          pct: pris.progression,
          date: formaterDate(pris.date),
        }) : t("fiche.instantanePrisRestreint"),
      );
      void client.invalidateQueries({ queryKey: ["projet", projetId] });
      // L'historique juste en dessous doit MONTRER la ligne qu'on vient
      // d'écrire : sans cette invalidation, la capture se dirait faite au-
      // dessus d'un tableau qui ne la porte pas.
      void client.invalidateQueries({ queryKey: ["projet", projetId, "instantanes"] });
    },
    onError: (e) => annoncer("err", messageErreur(e, tErreurs, t("fiche.echecInstantane"))),
  });

  if (requete.isPending) return <Chargement quoi={t("fiche.leProjet")} />;
  if (requete.isError)
    return <ErreurDeChargement erreur={requete.error} surReessai={() => void requete.refetch()} />;

  const projet = requete.data;
  const fige = projet.statut === "cancelled" || projet.archive;
  /*
   * `RG-SCOPE-02` — la feuille de route est gardée par `milestones:read`, que
   * la fiche n'exige pas : les deux lectures n'ont pas les mêmes droits, et le
   * panneau doit dire laquelle lui manque plutôt que de conclure au vide.
   */
  const routeRefusee = route.error instanceof ErreurApi && route.error.statut === 403;

  return (
    <CadreProjet
      projet={projet}
      onglet="ensemble"
      bandeau={
        projet.statut === "cancelled" ? (
          <div className="alert alert-error bandeau-etat" role="status">
            <span className="alert-icon" aria-hidden="true">
              !
            </span>
            <span>{t("fiche.bandeauAnnule")}</span>
            {peut("projects:update") ? (
              <Button className="chip-btn" onPress={() => cycleDeVie.mutate("restaurer")}>
                {t("fiche.restaurer")}
              </Button>
            ) : null}
          </div>
        ) : projet.archive ? (
          <div className="alert alert-warn bandeau-etat" role="status">
            <span className="alert-icon" aria-hidden="true">
              ⌸
            </span>
            <span>{t("fiche.bandeauArchive")}</span>
            {peut("projects:archive") ? (
              <Button className="chip-btn" onPress={() => cycleDeVie.mutate("desarchiver")}>
                {t("fiche.desarchiver")}
              </Button>
            ) : null}
          </div>
        ) : null
      }
      actions={
        <>
          {/*
            `EX-PRJ-05` — la maquette 11 pose « Modifier » ici. La fenêtre est
            celle du portefeuille : créer ou modifier, mêmes champs, mêmes
            règles. Deux fenêtres finiraient par diverger.
          */}
          {peut("projects:update") && projet.statut !== "cancelled" ? (
            <Button className="chip-btn" onPress={() => setEditionOuverte(true)}>
              {t("fiche.modifier")}
            </Button>
          ) : null}
          {/*
            `EX-PRJ-13` — capturer l'avancement du jour. `reports:read` est la
            permission que porte la route ; `RG-GEN-06` veut que le client
            masque sur celle-là, pas sur une plus stricte choisie ici.
            Un projet annulé est figé — `02`, vue 11 : « toute modification
            bloquée » —, et un instantané est une écriture.
          */}
          {peut("reports:read") && projet.statut !== "cancelled" ? (
            <Button
              className="chip-btn"
              isPending={instantane.isPending}
              onPress={() => instantane.mutate()}
            >
              {t("fiche.capturerInstantane")}
            </Button>
          ) : null}
          {peut("projects:archive") && !projet.archive && projet.statut !== "cancelled" ? (
            <Button className="chip-btn" onPress={() => cycleDeVie.mutate("archiver")}>
              {t("fiche.archiver")}
            </Button>
          ) : null}
          {/*
            `RG-PRJ-02` — l'annulation logique, premier des trois temps de
            `RG-GEN-10`. Elle précède la suppression définitive et reste
            réversible : le bandeau d'état et le bouton « Restaurer » l'attendent
            depuis L-32, sans que rien ne puisse la produire.
          */}
          {peut("projects:update") && projet.statut !== "cancelled" ? (
            <Button className="chip-btn" onPress={() => setAnnulationOuverte(true)}>
              {t("fiche.annulerProjet")}
            </Button>
          ) : null}
          {peut("projects:delete") ? (
            <Button className="chip-btn chip-danger" onPress={() => setSuppressionOuverte(true)}>
              {t("fiche.supprimer")}
            </Button>
          ) : null}
        </>
      }
    >
      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-head">
            <span className="eyebrow">{t("fiche.progression")}</span>
            <MarqueurCalcule
              explication={t("fiche.progressionCalcul", { n: projet.taches.total })}
            />
          </div>
          <p className="kpi-val">{projet.progression} %</p>
          <Barre
            valeur={projet.progression}
            libelle={t("fiche.progression")}
            classe="bar kpi-bar"
          />
        </div>

        <div className="kpi">
          <div className="kpi-head">
            <span className="eyebrow">{t("onglets.taches")}</span>
          </div>
          <p className="kpi-val">{projet.taches.total}</p>
          <span className="kpi-sub">
            {t("fiche.tachesDetail", {
              enCours: projet.taches.enCours,
              bloquees: projet.taches.bloquees,
            })}
          </span>
        </div>

        <div className="kpi">
          <div className="kpi-head">
            <span className="eyebrow">{t("fiche.budgetConsomme")}</span>
            <MarqueurCalcule explication={t("fiche.budgetCalcul")} />
          </div>
          <p className="kpi-val">{t("heures", { n: projet.budget.consomme })}</p>
          <span className="kpi-sub">
            {projet.budget.alloue === null
              ? t("fiche.sansBudget")
              : t("fiche.budgetDetail", {
                  total: formaterNombre(projet.budget.alloue),
                  restant: formaterNombre(projet.budget.restant ?? 0),
                })}
          </span>
          {projet.budget.alloue ? (
            <Barre
              valeur={(projet.budget.consomme / projet.budget.alloue) * 100}
              libelle={t("fiche.budgetConsomme")}
              classe="bar kpi-bar"
            />
          ) : null}
        </div>

        <div className="kpi">
          <div className="kpi-head">
            <span className="eyebrow">{t("onglets.equipe")}</span>
          </div>
          <p className="kpi-val">
            {projet.equipe.agents + projet.equipe.tiers + projet.equipe.clients}
          </p>
          <span className="kpi-sub">
            {t("fiche.equipeDetail", {
              agents: projet.equipe.agents,
              tiers: projet.equipe.tiers,
            })}
          </span>
        </div>
      </div>

      <div className="two-col">
        <section className="panel">
          <div className="panel-head">
            <span className="panel-title">{t("fiche.feuilleDeRoute")}</span>
            <span className="eyebrow">
              {t("fiche.jalonsEtEpopees", { jalons: projet.jalons, epopees: projet.epopees })}
            </span>
          </div>
          <div className="panel-body">
            {routeRefusee ? (
              /*
               * ══════════════════════════════════════════════════════════════
               * `RG-GEN-05`, `RG-GEN-06`, `RG-SCOPE-02` — **un état vide dit
               * « il n'y a rien », jamais « vous n'avez pas le droit de le
               * savoir ».**
               *
               * DÉFAUT CONSTATÉ EN SECONDE PASSE (P-116, P-165) :
               * `GET /projets/:id/feuille-de-route` est gardée par
               * `milestones:read`, que `PORTFOLIO_MANAGER` n'a pas. Le refus
               * était AVALÉ — `route.data` restait indéfini — et le même écran
               * annonçait « Feuille de route — 3 jalons » au bandeau pendant
               * que le corps affichait « Aucun jalon défini » et proposait
               * « + Créer un jalon », une action que le serveur refuserait.
               *
               * Deux lectures contradictoires côte à côte, et la fausse était
               * la plus rassurante. Le décompte du bandeau, lui, reste : il
               * vient de la fiche, que le porteur a le droit de lire. Ce qui
               * change, c'est que le corps ne prétend plus être vide.
               * ══════════════════════════════════════════════════════════════
               */
              <div className="empty" role="status">
                <p>{tCommun("droits.permissionRequise")}</p>
                <small>{t("jalons.refusLecture")}</small>
              </div>
            ) : route.data && route.data.jalons.length > 0 ? (
              <>
                <div className="rmap">
                  {route.data.jalons.map((j) => (
                    <ApercuJalon key={j.id} jalon={j} />
                  ))}
                </div>
                <p className="lien-route">
                  <Link to="/projets/$id/jalons" params={{ id: projet.id }} className="link link-sm">
                    {t("fiche.ouvrirRoute")}
                  </Link>
                </p>
              </>
            ) : (
              <div className="empty">
                <p>{t("jalons.videTitre")}</p>
                <small>{t("jalons.videExplication")}</small>
                <Link to="/projets/$id/jalons" params={{ id: projet.id }} className="btn btn-primary">
                  {t("jalons.creerPremier")}
                </Link>
              </div>
            )}
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <span className="panel-title">{t("fiche.informations")}</span>
          </div>
          <div className="panel-body">
            <dl className="info-grid">
              <Info libelle={t("portefeuille.dateDebut")} valeur={formaterDate(projet.dateDebut)} />
              <Info libelle={t("portefeuille.dateFin")} valeur={formaterDate(projet.dateFin)} />
              <Info
                libelle={t("portefeuille.budgetHeures")}
                valeur={
                  projet.budgetHeures
                    ? t("heures", { n: Number(projet.budgetHeures) })
                    : null
                }
              />
              <Info libelle={t("portefeuille.chefId")} valeur={projet.chef ? `${projet.chef.prenom} ${projet.chef.nom}` : null} />
              <Info libelle={t("portefeuille.departementId")} valeur={projet.departement?.nom ?? null} />
              <Info
                libelle={t("fiche.sponsor")}
                valeur={projet.sponsor ? `${projet.sponsor.prenom} ${projet.sponsor.nom}` : null}
              />
              <Info libelle={t("fiche.creeLe")} valeur={formaterDate(projet.creeLe)} />
              <Info
                libelle={t("fiche.creePar")}
                valeur={
                  projet.createur ? `${projet.createur.prenom} ${projet.createur.nom}` : null
                }
              />
              <Info
                libelle={t("fiche.clients")}
                valeur={
                  projet.clients.length > 0
                    ? projet.clients.map((c) => c.nom).join(", ")
                    : null
                }
              />
              <Info
                libelle={t("fiche.dernierInstantane")}
                valeur={
                  projet.dernierInstantane
                    ? `${formaterDate(projet.dernierInstantane.date)} · ${projet.dernierInstantane.progression} %`
                    : null
                }
              />
            </dl>
          </div>
        </section>
      </div>

      {/*
        `EX-PRJ-13` — **consulter l'historique des instantanés.**

        L'exigence porte deux verbes ; seul « capturer » était servi. La fiche
        ne montrait que `dernierInstantane` — un point sur une courbe —, et la
        tendance des rapports moyenne `progression` par date sur un LOT de
        projets, en jetant les tâches et les heures. Un projet écrivait donc un
        historique que personne ne pouvait relire.

        Il est ici, sous la commande qui le produit, et non dans l'onglet
        Gantt : le Gantt répond à « quand », l'historique à « où en étions-nous
        le 12 mars ». Décision portée dans `cadrage/02`, vue 11.
      */}
      {peut("reports:read") ? (
        <section className="panel">
          <div className="panel-head">
            <span className="panel-title">{t("fiche.historiqueInstantanes")}</span>
            {historique.data && historique.data.length > 0 ? (
              <span className="eyebrow">
                {t("fiche.instantanesCompte", { n: historique.data.length })}
              </span>
            ) : null}
          </div>
          <div className="panel-body is-flush">
            {projet.instantanesAccesRestreint ? <div className="panel-body"><p className="field-hint" role="status">{t("fiche.historiqueRestreint")}</p></div> : null}
            {historique.isPending && !projet.instantanesAccesRestreint ? (
              <div className="panel-body">
                <Chargement quoi={t("fiche.lHistorique")} />
              </div>
            ) : null}
            {historique.isError ? (
              <div className="panel-body">
                <ErreurDeChargement
                  erreur={historique.error}
                  surReessai={() => void historique.refetch()}
                />
              </div>
            ) : null}
            {historique.data && !projet.instantanesAccesRestreint ? (
              historique.data.length > 0 ? (
                <>
                  {/* Le motif de liste tabulaire du produit — celui du journal
                      d'audit (vue 33) : un en-tête en grille, des lignes de
                      même grille. Un `<table>` réintroduirait une seconde
                      manière d'aligner des colonnes. */}
                  <div className="snap-grid snap-head">
                    <span>{t("fiche.instantaneDate")}</span>
                    <span>{t("fiche.progression")}</span>
                    <span>{t("onglets.taches")}</span>
                    <span>{t("fiche.budgetConsomme")}</span>
                  </div>
                  {/* Le cadre défile : sans `tabIndex` ni nom, `axe` le refuse
                      en « serious » (`scrollable-region-focusable`) — rien
                      dedans ne prend le focus, donc rien ne l'atteint au
                      clavier. */}
                  <div
                    className="snap-liste"
                    role="region"
                    aria-label={t("fiche.historiqueInstantanes")}
                    tabIndex={0}
                  >
                    {historique.data.map((i) => (
                      <div key={i.id} className="snap-grid snap-row">
                        {/* La date est la clé de la ligne : `(projet, date)`
                            est unique en base, une seconde capture le même
                            jour rafraîchit celle-ci. */}
                        <span className="snap-date">{formaterDate(i.date)}</span>
                        <span className="snap-prog">
                          <Barre
                            valeur={i.progression}
                            libelle={t("fiche.progressionAu", {
                              date: formaterDate(i.date),
                            })}
                            classe="bar snap-bar"
                          />
                          <span className="prow-pct">{i.progression} %</span>
                        </span>
                        {/* « finies sur total », pas un pourcentage : c'est ce
                            qui distingue une progression qui monte parce qu'on
                            a fini des tâches d'une qui monte parce qu'on en a
                            supprimé. */}
                        <span className="snap-taches">
                          {t("fiche.tachesFiniesSur", {
                            finies: i.tachesFinies,
                            total: i.tachesTotal,
                          })}
                        </span>
                        <span className="snap-heures">
                          {t("heures", { n: Number(i.heuresConsommees) })}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                /*
                  `RG-GEN-04` — l'état vide dit sa sortie. Deux sorties, en
                  fait : la capture nocturne remplira ce tableau toute seule, et
                  la commande d'en-tête n'attend pas la nuit.
                */
                <div className="panel-body">
                  <div className="empty">
                    <p>{t("fiche.historiqueVide")}</p>
                    <small>{t("fiche.historiqueVideExplication")}</small>
                  </div>
                </div>
              )
            ) : null}
          </div>
        </section>
      ) : null}

      <FenetreCreation
        ouverte={editionOuverte}
        existant={{
          id: projet.id,
          nom: projet.nom,
          description: projet.description,
          statut: projet.statut,
          priorite: projet.priorite,
          dateDebut: projet.dateDebut,
          dateFin: projet.dateFin,
          budgetHeures: projet.budgetHeures === null ? null : Number(projet.budgetHeures),
          /* `EX-PRJ-04` — l'exigence dit « choisir », pas « choisir une fois » :
             sans cette ligne la fenêtre rouvrirait sur « Aucune icône » et
             l'enregistrement effacerait celle du projet. */
          icone: projet.icone,
          chefId: projet.chef?.id ?? null,
          sponsorId: projet.sponsor?.id ?? null,
          departementId: projet.departement?.id ?? null,
          version: projet.version,
        }}
        surFermeture={() => setEditionOuverte(false)}
        surSucces={() => {
          setEditionOuverte(false);
          annoncer("ok", t("fiche.modifie"));
          void client.invalidateQueries({ queryKey: ["projet", projetId] });
          void client.invalidateQueries({ queryKey: ["projets"] });
        }}
        traduireErreur={(e) => messageErreur(e, tErreurs, t("fiche.echecAction"))}
      />

      {/*
        `RG-GEN-01` — « Toute action destructrice est confirmée, en nommant
        l'objet et en énonçant les conséquences. »

        L'annulation s'exécutait AU PREMIER CLIC. Elle est le premier des trois
        temps de `RG-GEN-10` — donc réversible, ce que la fenêtre dit —, mais
        elle fige le projet : plus de modification, plus d'instantané, plus
        d'archivage. Ce n'est pas un réglage, c'est une décision de gestion, et
        elle porte sur un objet qu'il faut nommer.
      */}
      <FenetreAnnulation
        projet={projet}
        ouverte={annulationOuverte}
        surFermeture={() => setAnnulationOuverte(false)}
        enCours={cycleDeVie.isPending}
        surConfirmation={() => {
          cycleDeVie.mutate("annuler");
          setAnnulationOuverte(false);
        }}
      />

      <FenetreSuppression
        projet={projet}
        ouverte={suppressionOuverte}
        surFermeture={() => setSuppressionOuverte(false)}
        fige={fige}
      />
    </CadreProjet>
  );
}

/**
 * Une paire information / valeur.
 *
 * Une valeur absente s'écrit « Non renseigné » en italique, jamais un blanc :
 * un blanc se lit comme un défaut d'affichage plutôt que comme une absence.
 */
function Info({ libelle, valeur }: { libelle: string; valeur: string | null }) {
  const { t } = useTranslation("projets");
  return (
    <div>
      <dt className="info-k">{libelle}</dt>
      <dd className={`info-v${valeur ? "" : " is-none"}`}>{valeur ?? t("nonRenseigne")}</dd>
    </div>
  );
}

function ApercuJalon({ jalon }: { jalon: api.Jalon }) {
  const { t } = useTranslation("projets");
  const fait = jalon.taches.filter((x) => x.statut === "done").length;
  /* `RG-JAL-06` — même calcul qu'en vue 13, et il n'est écrit qu'une fois. */
  const progression = progressionJalon(
    jalon.statut as StatutJalon,
    jalon.taches.map((x) => x.avancement),
  );

  return (
    <div className="rm">
      <span
        className={`rm-dot${jalon.statut === "done" ? " is-done" : jalon.statut === "doing" ? " is-doing" : ""}`}
        aria-hidden="true"
      />
      <div className="rm-top">
        <span className="rm-name">{jalon.nom}</span>
        <span className="rm-date">
          {jalon.dateEcheance ? formaterDate(jalon.dateEcheance) : t("jalons.sansDate")}
        </span>
        {/*
          Le statut du jalon, en toutes lettres — maquette 11, `rm-top`.
          La pastille de la frise (`rm-dot`) ne distingue que par la couleur :
          seule, elle ne dit rien à qui ne la voit pas. `RG-JAL-01` rappelle que
          ce statut est calculé, jamais saisi.
        */}
        <Pastille code={jalon.statut} vocabulaire={STATUTS_JALON} />
      </div>
      <div className="rm-line">
        <Barre
          valeur={progression}
          termine={jalon.statut === "done"}
          libelle={t("jalons.avancementDe", { nom: jalon.nom })}
        />
        <span className="rm-meta">
          {t("jalons.tachesEtPourcent", {
            n: jalon.taches.length,
            faites: fait,
            pct: progression,
          })}
        </span>
      </div>
    </div>
  );
}

/**
 * `RG-PRJ-02`, `RG-GEN-01`, `RG-GEN-10` — **l'annulation se confirme.**
 *
 * Elle s'exécutait au premier clic, sans nommer le projet ni énoncer ce
 * qu'elle entraîne. Elle n'est pas irréversible — c'est justement le propos de
 * `RG-GEN-10`, et la fenêtre le dit, sortie comprise —, mais elle fige le
 * projet : les commandes de modification, d'instantané et d'archivage
 * disparaissent toutes de l'en-tête à la seconde où elle passe.
 */
function FenetreAnnulation({
  projet,
  ouverte,
  surFermeture,
  enCours,
  surConfirmation,
}: {
  projet: api.FicheProjet;
  ouverte: boolean;
  surFermeture: () => void;
  enCours: boolean;
  surConfirmation: () => void;
}) {
  const { t } = useTranslation("projets");

  return (
    <Fenetre
      ouverte={ouverte}
      surFermeture={surFermeture}
      categorie={t("confirmation")}
      titre={t("fiche.annulerProjet")}
      mention={t("fiche.annulationReversible")}
      actions={
        <>
          <Button className="btn btn-secondary" onPress={surFermeture}>
            {t("fiche.annulationRenoncer")}
          </Button>
          <Button className="btn btn-danger" isPending={enCours} onPress={surConfirmation}>
            {t("fiche.annulationConfirmer")}
          </Button>
        </>
      }
    >
      <p className="phrase-confirmation">
        {t("fiche.confirmationAnnulation")} <span className="quoted">« {projet.nom} »</span> ?
      </p>
      <div className="danger-box">
        <strong>{t("fiche.annulationConsequencesTitre")}</strong>
        <ul>
          <li>{t("fiche.annulationEffetFige")}</li>
          <li>{t("fiche.annulationEffetTaches", { n: projet.taches.total })}</li>
          <li>{t("fiche.annulationEffetRestaurable")}</li>
        </ul>
      </div>
    </Fenetre>
  );
}

/**
 * `RG-PRJ-08` — la suppression définitive est refusée quand des données
 * historiques sont rattachées.
 *
 * L'impact est demandé **à l'ouverture**, et la fenêtre prend deux formes :
 * la confirmation chiffrée, ou le refus motivé avec l'archivage comme
 * alternative. Proposer un bouton qui échouera serait une promesse fausse.
 */
function FenetreSuppression({
  projet,
  ouverte,
  surFermeture,
  fige,
}: {
  projet: api.FicheProjet;
  ouverte: boolean;
  surFermeture: () => void;
  fige: boolean;
}) {
  const { t } = useTranslation("projets");
  const { t: tErreurs } = useTranslation("erreurs");
  const annoncer = useMessages();
  const client = useQueryClient();
  const navigate = useNavigate();

  const impact = useQuery({
    queryKey: ["projet", projet.id, "impact"],
    queryFn: () => api.impactSuppression(projet.id),
    enabled: ouverte,
  });

  const suppression = useMutation({
    mutationFn: () => api.supprimerProjet(projet.id),
    /*
     * `window.location.assign` RECHARGE le document : l'application repart de
     * zéro, et « Projet supprimé. » — annoncé la ligne d'avant — n'était
     * jamais lisible. On navigue par le routeur, qui garde la session, le
     * cache et la file de messages.
     */
    onSuccess: () => {
      annoncer("ok", t("fiche.supprimeFait"));
      void client.invalidateQueries({ queryKey: ["projets"] });
      void navigate({ to: "/projets" });
    },
    onError: (e) => annoncer("err", messageErreur(e, tErreurs, t("fiche.echecAction"))),
  });

  const archivage = useMutation({
    mutationFn: () => api.archiverProjet(projet.id, true),
    onSuccess: () => {
      annoncer("ok", t("fiche.archiverFait"));
      surFermeture();
      void client.invalidateQueries({ queryKey: ["projet", projet.id] });
    },
  });

  const refuse = impact.data ? impact.data.blocages.length > 0 : false;

  return (
    <Fenetre
      ouverte={ouverte}
      surFermeture={surFermeture}
      categorie={t("fiche.actionIrreversible")}
      titre={t("fiche.supprimerLeProjet")}
      actions={
        <>
          <Button className="btn btn-secondary" onPress={surFermeture}>
            {t("annuler")}
          </Button>
          {refuse ? (
            <Button
              className="btn btn-primary"
              isDisabled={fige}
              onPress={() => archivage.mutate()}
            >
              {t("fiche.archiverLeProjet")}
            </Button>
          ) : (
            <Button
              className="btn btn-danger"
              isPending={suppression.isPending}
              onPress={() => suppression.mutate()}
            >
              {t("fiche.supprimerDefinitivement")}
            </Button>
          )}
        </>
      }
    >
      {impact.isPending ? <Chargement quoi={t("fiche.lImpact")} /> : null}

      {impact.data && !refuse ? (
        <>
          <p className="phrase-confirmation">
            {t("fiche.confirmationSuppression")} <span className="quoted">« {projet.nom} »</span> ?
          </p>
          <div className="danger-box">
            <strong>{t("fiche.irreversible")}</strong> <span>{t("fiche.toutSeraSupprime")}</span>
            <ul>
              {impact.data.effacements.map((e) => (
                <li key={e.objet}>
                  {e.nombre} {e.objet}
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : null}

      {impact.data && refuse ? (
        <>
          <div className="alert alert-error" role="alert">
            <span className="alert-icon" aria-hidden="true">
              !
            </span>
            <span>{t("fiche.suppressionRefusee")}</span>
          </div>
          <p className="lede">{t("fiche.suppressionRefuseeExplication")}</p>
          <dl className="info-grid">
            {impact.data.blocages.map((b) => (
              <div key={b.objet}>
                <dt className="info-k">{b.objet}</dt>
                <dd className="info-v">{b.nombre}</dd>
              </div>
            ))}
          </dl>
        </>
      ) : null}
    </Fenetre>
  );
}
