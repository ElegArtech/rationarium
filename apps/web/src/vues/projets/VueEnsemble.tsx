import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button } from "react-aria-components";
import * as api from "../../api/projets.js";
import { messageErreur } from "../../api/erreurs.js";
import { usePeut } from "../../session/session.js";
import { Chargement, ErreurDeChargement } from "../../composants/etats.js";
import { Fenetre } from "../../composants/fenetre.js";
import { FenetreCreation } from "./Portefeuille.js";
import { useMessages } from "../../composants/messages.js";
import { STATUTS_JALON } from "@rationarium/contracts";
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
  const peut = usePeut();
  const annoncer = useMessages();
  const client = useQueryClient();
  const [suppressionOuverte, setSuppressionOuverte] = useState(false);
  const [editionOuverte, setEditionOuverte] = useState(false);

  const requete = useQuery({
    queryKey: ["projet", projetId],
    queryFn: () => api.fiche(projetId),
  });
  const route = useQuery({
    queryKey: ["projet", projetId, "route"],
    queryFn: () => api.feuilleDeRoute(projetId),
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

  if (requete.isPending) return <Chargement quoi={t("fiche.leProjet")} />;
  if (requete.isError)
    return <ErreurDeChargement erreur={requete.error} surReessai={() => void requete.refetch()} />;

  const projet = requete.data;
  const fige = projet.statut === "cancelled" || projet.archive;

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
            <Button className="chip-btn" onPress={() => cycleDeVie.mutate("annuler")}>
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
            {route.data && route.data.jalons.length > 0 ? (
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
          version: projet.version,
        }}
        surFermeture={() => setEditionOuverte(false)}
        surSucces={() => {
          setEditionOuverte(false);
          annoncer("ok", t("fiche.modifie"));
          void client.invalidateQueries({ queryKey: ["projets"] });
        }}
        traduireErreur={(e) => messageErreur(e, tErreurs, t("fiche.echecAction"))}
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
  const progression =
    jalon.taches.length === 0
      ? 0
      : Math.round(jalon.taches.reduce((n, x) => n + x.avancement, 0) / jalon.taches.length);

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

  const impact = useQuery({
    queryKey: ["projet", projet.id, "impact"],
    queryFn: () => api.impactSuppression(projet.id),
    enabled: ouverte,
  });

  const suppression = useMutation({
    mutationFn: () => api.supprimerProjet(projet.id),
    onSuccess: () => {
      annoncer("ok", t("fiche.supprimeFait"));
      void client.invalidateQueries({ queryKey: ["projets"] });
      window.location.assign("/projets");
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
