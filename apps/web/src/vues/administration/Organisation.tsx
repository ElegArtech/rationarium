import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "react-aria-components";
import * as api from "../../api/administration.js";
import { messageErreur } from "../../api/erreurs.js";
import { usePeut } from "../../session/session.js";
import { Chargement, ErreurDeChargement, AccesRefuse } from "../../composants/etats.js";
import { Fenetre } from "../../composants/fenetre.js";
import { useMessages } from "../../composants/messages.js";
import { AvatarAgent } from "../../composants/pastilles.js";
import { formaterDate } from "../../formats.js";
import "../../composants/partages.css";
import "../taches/liste.css";
import "./organisation.css";

/**
 * Vue 29 — Départements et services.
 *
 * **Deux règles de suppression opposées, et c'est le point d'attention du
 * brief** : la direction **refuse** tant qu'elle a des départements, le
 * département **emporte** ses services. Cette asymétrie « doit être annoncée
 * avant l'action, pas découverte au message d'erreur ».
 *
 * Elle est donc écrite deux fois : dans l'encart de tête, qui explique la
 * hiérarchie et ses règles, et dans chaque fenêtre de confirmation, qui dit ce
 * qui va arriver aux objets rattachés.
 */
export function Organisation() {
  const { t } = useTranslation("administration");
  const peut = usePeut();
  const [deplies, setDeplies] = useState<ReadonlySet<string>>(new Set());

  const requete = useQuery({ queryKey: ["organisation"], queryFn: api.arborescence });

  if (!peut("departments:read")) return <AccesRefuse />;
  if (requete.isPending) return <Chargement quoi={t("organisation.larborescence")} />;
  if (requete.isError)
    return <ErreurDeChargement erreur={requete.error} surReessai={() => void requete.refetch()} />;

  const { directions, departementsSansDirection } = requete.data;
  const nbDepartements =
    directions.reduce((n, d) => n + d.departements.length, 0) + departementsSansDirection.length;
  const nbServices =
    directions.reduce((n, d) => n + d.departements.reduce((m, x) => m + x.services.length, 0), 0) +
    departementsSansDirection.reduce((n, d) => n + d.services.length, 0);

  const basculer = (id: string) =>
    setDeplies((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="page">
      <div className="pl-toolbar">
        <div>
          <span className="eyebrow">{t("organisation.surtitre")}</span>
          <h1 className="h1 titre-vue">{t("organisation.titre")}</h1>
        </div>
        <span className="count-split">
          <b>{directions.length}</b> {t("organisation.compteDirections", { n: directions.length })}
          {" · "}
          <b>{nbDepartements}</b> {t("organisation.compteDepartements", { n: nbDepartements })}
          {" · "}
          <b>{nbServices}</b> {t("organisation.compteServices", { n: nbServices })}
        </span>
      </div>

      {/*
        L'encart porte l'explication ET l'asymétrie des règles de suppression.
        Découvrir au message d'erreur qu'une direction refuse là où un
        département emporte est le genre d'apprentissage qu'on ne fait qu'une
        fois — et mal.
      */}
      <div className="org-note">
        <div>
          <span className="eyebrow">{t("organisation.hierarchie")}</span>
          <p>{t("organisation.explication")}</p>
        </div>
        <div>
          <span className="eyebrow">{t("organisation.reglesDeSuppression")}</span>
          <div className="org-rule">
            <span className="org-rule-ic" aria-hidden="true">
              ⊘
            </span>
            <p>{t("organisation.regleDirection")}</p>
          </div>
          <div className="org-rule">
            <span className="org-rule-ic" aria-hidden="true">
              ⇩
            </span>
            <p>{t("organisation.regleDepartement")}</p>
          </div>
        </div>
      </div>

      {directions.length === 0 && departementsSansDirection.length === 0 ? (
        <div className="empty empty-large">
          <p>{t("organisation.videTitre")}</p>
          <small>{t("organisation.videExplication")}</small>
        </div>
      ) : null}

      {directions.map((d) => (
        <BlocDirection
          key={d.id}
          direction={d}
          deplies={deplies}
          surBascule={basculer}
        />
      ))}

      {departementsSansDirection.length > 0 ? (
        <div className="dir">
          <div className="dir-head">
            <span className="caret" aria-hidden="true">
              —
            </span>
            <span className="dir-ic" aria-hidden="true">
              ◇
            </span>
            <div className="bloc-etroit">
              <p className="dir-n">{t("organisation.sansDirection")}</p>
              {/* `RG-ORG-03` — un département hors direction existe. Le taire
                  le ferait disparaître de l'arborescence. */}
              <span className="node-d">{t("organisation.sansDirectionExplication")}</span>
            </div>
            <span />
            <span />
            <span />
          </div>
          <div className="dir-body">
            {departementsSansDirection.map((dep) => (
              <BlocDepartement
                key={dep.id}
                departement={dep}
                deplie={deplies.has(dep.id)}
                surBascule={() => basculer(dep.id)}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function BlocDirection({
  direction,
  deplies,
  surBascule,
}: {
  direction: api.Direction;
  deplies: ReadonlySet<string>;
  surBascule: (id: string) => void;
}) {
  const { t } = useTranslation("administration");
  const peut = usePeut();
  const [suppressionOuverte, setSuppressionOuverte] = useState(false);
  const deplie = deplies.has(direction.id);

  return (
    <div className="dir">
      <div className="dir-head">
        <Button
          className="caret"
          onPress={() => surBascule(direction.id)}
          aria-expanded={deplie}
          aria-label={t("organisation.deplierDirection", { nom: direction.nom })}
        >
          <span aria-hidden="true">{deplie ? "▾" : "▸"}</span>
        </Button>
        <span className="dir-ic" aria-hidden="true">
          ◈
        </span>
        <div className="bloc-etroit">
          <p className="dir-n">{direction.nom}</p>
          {direction.description ? (
            <span className="node-d">{direction.description}</span>
          ) : null}
        </div>
        <Responsable personne={direction.responsable} />
        <span className="head-count">
          <span>
            {t("organisation.departements", { n: direction.departements.length })}
          </span>
        </span>
        <span className="lv-acts">
          {peut("directions:delete") ? (
            <Button className="chip-btn chip-danger" onPress={() => setSuppressionOuverte(true)}>
              {t("supprimer")}
            </Button>
          ) : null}
        </span>
      </div>

      {deplie ? (
        <div className="dir-body">
          {direction.departements.length === 0 ? (
            <div className="node-empty">
              <span>{t("organisation.aucunDepartement")}</span>
            </div>
          ) : (
            direction.departements.map((dep) => (
              <BlocDepartement
                key={dep.id}
                departement={dep}
                deplie={deplies.has(dep.id)}
                surBascule={() => surBascule(dep.id)}
              />
            ))
          )}
        </div>
      ) : null}

      <FenetreSuppressionDirection
        direction={direction}
        ouverte={suppressionOuverte}
        surFermeture={() => setSuppressionOuverte(false)}
      />
    </div>
  );
}

function BlocDepartement({
  departement,
  deplie,
  surBascule,
}: {
  departement: api.Departement;
  deplie: boolean;
  surBascule: () => void;
}) {
  const { t } = useTranslation("administration");
  const peut = usePeut();
  const [suppressionOuverte, setSuppressionOuverte] = useState(false);

  return (
    <div className="dep">
      <div className="dep-head">
        <Button
          className="caret"
          onPress={surBascule}
          aria-expanded={deplie}
          aria-label={t("organisation.deplierDepartement", { nom: departement.nom })}
        >
          <span aria-hidden="true">{deplie ? "▾" : "▸"}</span>
        </Button>
        <div className="bloc-etroit">
          <p className="dep-n">{departement.nom}</p>
          <span className="node-d">
            {t("organisation.creeLe", { date: formaterDate(departement.creeLe) })}
          </span>
        </div>
        <Responsable personne={departement.responsable} />
        <span className="head-count">
          <span>{t("organisation.services", { n: departement._count.services })}</span>
          <span>{t("organisation.membres", { n: departement._count.membres })}</span>
        </span>
        <span className="lv-acts">
          {peut("departments:delete") ? (
            <Button className="chip-btn chip-danger" onPress={() => setSuppressionOuverte(true)}>
              {t("supprimer")}
            </Button>
          ) : null}
        </span>
      </div>

      {deplie ? (
        <div className="dep-body">
          {departement.services.length === 0 ? (
            <div className="node-empty">
              <span>{t("organisation.aucunService")}</span>
            </div>
          ) : (
            departement.services.map((s) => (
              <div className="svc" key={s.id}>
                <span className="svc-dot" aria-hidden="true" />
                <div className="bloc-etroit">
                  <p className="svc-n">{s.nom}</p>
                </div>
                <Responsable personne={s.manager} />
                <span className="head-count">
                  <span>{t("organisation.membres", { n: s._count.membres })}</span>
                </span>
                <span />
              </div>
            ))
          )}
        </div>
      ) : null}

      <FenetreSuppressionDepartement
        departement={departement}
        ouverte={suppressionOuverte}
        surFermeture={() => setSuppressionOuverte(false)}
      />
    </div>
  );
}

function Responsable({ personne }: { personne: { prenom: string; nom: string } | null }) {
  const { t } = useTranslation("administration");
  if (!personne) return <span className="mgr-none">{t("organisation.sansResponsable")}</span>;
  return (
    <span className="mgr">
      <AvatarAgent prenom={personne.prenom} nom={personne.nom} />
      <span className="mgr-n">
        {personne.prenom} {personne.nom}
      </span>
    </span>
  );
}

/**
 * `RG-ORG-02` — une direction **refuse** la suppression tant qu'elle porte des
 * départements.
 *
 * La fenêtre le dit avant le clic, et n'offre pas de bouton qui échouerait :
 * ce serait une promesse fausse.
 */
function FenetreSuppressionDirection({
  direction,
  ouverte,
  surFermeture,
}: {
  direction: api.Direction;
  ouverte: boolean;
  surFermeture: () => void;
}) {
  const { t } = useTranslation("administration");
  const { t: tErreurs } = useTranslation("erreurs");
  const annoncer = useMessages();
  const client = useQueryClient();

  const bloque = direction.departements.length > 0;

  const suppression = useMutation({
    mutationFn: () => api.supprimerDirection(direction.id),
    onSuccess: () => {
      annoncer("ok", t("organisation.directionSupprimee"));
      surFermeture();
      void client.invalidateQueries({ queryKey: ["organisation"] });
    },
    onError: (e) => annoncer("err", messageErreur(e, tErreurs, t("organisation.echecAction"))),
  });

  return (
    <Fenetre
      ouverte={ouverte}
      surFermeture={surFermeture}
      categorie={t("confirmation")}
      titre={t("organisation.supprimerDirection")}
      // La règle, écrite là où elle s'applique.
      mention={t("organisation.mentionDirection")}
      actions={
        <>
          <Button className="btn btn-secondary" onPress={surFermeture}>
            {t("annuler")}
          </Button>
          {bloque ? null : (
            <Button
              className="btn btn-danger"
              isPending={suppression.isPending}
              onPress={() => suppression.mutate()}
            >
              {t("organisation.supprimerDirection")}
            </Button>
          )}
        </>
      }
    >
      {bloque ? (
        <>
          <div className="alert alert-error" role="alert">
            <span className="alert-icon" aria-hidden="true">
              !
            </span>
            <span>{t("organisation.directionBloquee")}</span>
          </div>
          <ul className="imp-list">
            {direction.departements.map((d) => (
              <li key={d.id}>
                <span className="imp-k">{t("organisation.departement")}</span>
                <span>{d.nom}</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="phrase-confirmation">
          {t("organisation.confirmerDirection")}{" "}
          <span className="quoted">« {direction.nom} »</span> ?
        </p>
      )}
    </Fenetre>
  );
}

/**
 * `RG-ORG-04` — un département **emporte** ses services.
 *
 * La règle opposée à celle de la direction, dans la même vue. La fenêtre liste
 * donc nommément ce qui disparaîtra : « tous les services associés seront
 * également supprimés » sans les nommer laisserait deviner lesquels.
 */
function FenetreSuppressionDepartement({
  departement,
  ouverte,
  surFermeture,
}: {
  departement: api.Departement;
  ouverte: boolean;
  surFermeture: () => void;
}) {
  const { t } = useTranslation("administration");
  const { t: tErreurs } = useTranslation("erreurs");
  const annoncer = useMessages();
  const client = useQueryClient();

  const impact = useQuery({
    queryKey: ["organisation", departement.id, "impact"],
    queryFn: () => api.impactDepartement(departement.id),
    enabled: ouverte,
  });

  const suppression = useMutation({
    mutationFn: () => api.supprimerDepartement(departement.id),
    onSuccess: () => {
      annoncer("ok", t("organisation.departementSupprime"));
      surFermeture();
      void client.invalidateQueries({ queryKey: ["organisation"] });
    },
    onError: (e) => annoncer("err", messageErreur(e, tErreurs, t("organisation.echecAction"))),
  });

  return (
    <Fenetre
      ouverte={ouverte}
      surFermeture={surFermeture}
      categorie={t("organisation.actionIrreversible")}
      titre={t("organisation.supprimerDepartement")}
      mention={t("organisation.mentionDepartement")}
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
            {t("organisation.supprimerDepartement")}
          </Button>
        </>
      }
    >
      <p className="phrase-confirmation">
        {t("organisation.confirmerDepartement")}{" "}
        <span className="quoted">« {departement.nom} »</span> ?
      </p>

      {impact.isPending ? <Chargement quoi={t("organisation.limpact")} /> : null}

      {impact.data ? (
        <>
          <div className="alert alert-error" role="alert">
            <span className="alert-icon" aria-hidden="true">
              !
            </span>
            <span>{t("organisation.departementEmporte")}</span>
          </div>
          {impact.data.servicesSupprimes.length > 0 ? (
            <ul className="imp-list">
              {impact.data.servicesSupprimes.map((nom) => (
                <li key={nom}>
                  <span className="imp-k">{t("organisation.service")}</span>
                  <span>{nom}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="field-hint">
            {t("organisation.agentsDetaches", { n: impact.data.agentsDetaches })}
          </p>
        </>
      ) : null}
    </Fenetre>
  );
}
