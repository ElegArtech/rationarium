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
/* Sections cumulatives : `.count-split` (20), `.ms-toggle` (17), `.lv-acts`
   (23), `.filters` / `.f-input` (transverses), `.picon` (14). */
import "../taches/liste.css";
import "../projets/jalons.css";
import "../projets/portefeuille.css";
import "../occupations/conges.css";
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
/** Les trois niveaux, dans l'ordre où la maquette les nomme. */
type Nature = "direction" | "departement" | "service";

export function Organisation() {
  const { t } = useTranslation("administration");
  const peut = usePeut();
  /*
   * L'arborescence est DÉPLIÉE par défaut, comme la maquette : on vient y
   * lire la structure entière. On mémorise donc ce qui est replié, pas ce qui
   * est déplié — sans quoi « tout déplier » exigerait d'énumérer des nœuds
   * qu'on n'a pas encore chargés.
   */
  const [replies, setReplies] = useState<ReadonlySet<string>>(new Set());
  const [toutReplie, setToutReplie] = useState(false);
  const [recherche, setRecherche] = useState("");
  const [departementId, setDepartementId] = useState("");
  const [creation, setCreation] = useState<Nature | null>(null);

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
    setReplies((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const ouvert = (id: string) => !toutReplie && !replies.has(id);

  const tousDepartements = [
    ...directions.flatMap((d) => d.departements),
    ...departementsSansDirection,
  ];

  const correspond = (nom: string) =>
    !recherche || nom.toLowerCase().includes(recherche.toLowerCase());

  return (
    <>
      <div className="pl-toolbar">
        <div>
          <span className="eyebrow">{t("organisation.surtitre")}</span>
          <h1 className="h1">{t("organisation.titre")}</h1>
        </div>
        <span className="count-split">
          {t("organisation.compteDirections", { n: directions.length })}
          {" · "}
          {t("organisation.compteDepartements", { n: nbDepartements })}
          {" · "}
          {t("organisation.compteServices", { n: nbServices })}
        </span>
        <div className="pl-toolbar-fin">
          {peut("directions:create") ? (
            <Button className="chip-btn" onPress={() => setCreation("direction")}>
              {t("organisation.nouvelleDirection")}
            </Button>
          ) : null}
          {peut("departments:create") ? (
            <Button className="chip-btn" onPress={() => setCreation("departement")}>
              {t("organisation.nouveauDepartement")}
            </Button>
          ) : null}
          {peut("services:create") ? (
            <Button className="btn btn-primary" onPress={() => setCreation("service")}>
              {t("organisation.nouveauService")}
            </Button>
          ) : null}
        </div>
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

      <div className="filters">
        <input
          className="f-input"
          type="search"
          style={{ width: "230px" }}
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder={t("organisation.rechercher")}
          aria-label={t("organisation.rechercher")}
        />
        <select
          className="f-input"
          value={departementId}
          onChange={(e) => setDepartementId(e.target.value)}
          aria-label={t("organisation.filtrerParDepartement")}
        >
          <option value="">{t("organisation.tousDepartements")}</option>
          {tousDepartements.map((d) => (
            <option key={d.id} value={d.id}>
              {d.nom}
            </option>
          ))}
        </select>
        <Button
          className="chip-btn"
          onPress={() => {
            setToutReplie(false);
            setReplies(new Set());
          }}
        >
          {t("organisation.toutDeplier")}
        </Button>
        <Button className="chip-btn" onPress={() => setToutReplie(true)}>
          {t("organisation.toutReplier")}
        </Button>
      </div>

      {directions.length === 0 && departementsSansDirection.length === 0 ? (
        <div className="empty empty-encadre">
          <p>{t("organisation.videTitre")}</p>
          <small>{t("organisation.videExplication")}</small>
          {peut("departments:create") ? (
            <Button className="btn btn-primary" onPress={() => setCreation("departement")}>
              {t("organisation.creerPremierDepartement")}
            </Button>
          ) : null}
        </div>
      ) : null}

      {directions
        .filter(
          (d) =>
            (!departementId || d.departements.some((x) => x.id === departementId)) &&
            (correspond(d.nom) || d.departements.some((x) => correspond(x.nom))),
        )
        .map((d) => (
          <BlocDirection
            key={d.id}
            direction={d}
            departementId={departementId}
            ouvert={ouvert}
            surBascule={basculer}
            surCreation={setCreation}
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
                deplie={ouvert(dep.id)}
                surBascule={() => basculer(dep.id)}
                surCreation={setCreation}
              />
            ))}
          </div>
        </div>
      ) : null}

      <FenetreCreationNoeud nature={creation} surFermeture={() => setCreation(null)} />
    </>
  );
}

function BlocDirection({
  direction,
  departementId,
  ouvert,
  surBascule,
  surCreation,
}: {
  direction: api.Direction;
  departementId: string;
  ouvert: (id: string) => boolean;
  surBascule: (id: string) => void;
  surCreation: (nature: Nature) => void;
}) {
  const { t } = useTranslation("administration");
  const peut = usePeut();
  const [suppressionOuverte, setSuppressionOuverte] = useState(false);
  const deplie = ouvert(direction.id);
  const departements = direction.departements.filter(
    (d) => !departementId || d.id === departementId,
  );

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
        <div className="dir-ic" aria-hidden="true">
          <svg className="picon">
            <use href="#i-depts" />
          </svg>
        </div>
        <div style={{ minWidth: 0 }}>
          <p className="dir-n">{direction.nom}</p>
          <span className="node-d">
            {direction.description ?? t("organisation.sansDescription")}
          </span>
        </div>
        <Responsable personne={direction.responsable} />
        <div className="head-count">
          <span>{t("organisation.departements", { n: departements.length })}</span>
        </div>
        <div className="lv-acts">
          {peut("directions:delete") ? (
            /*
             * `RG-ORG-02` — la règle est ANNONCÉE avant l'action. Le bouton est
             * désactivé et dit pourquoi ; la découvrir au message d'erreur est
             * exactement ce que le brief refuse.
             */
            <Button
              className="ms-toggle"
              isDisabled={departements.length > 0}
              style={
                departements.length > 0
                  ? {}
                  : { color: "var(--st-blocked)", borderColor: "var(--st-blocked)" }
              }
              onPress={() => setSuppressionOuverte(true)}
            >
              <span title={departements.length > 0 ? t("organisation.suppressionBloquee", { n: departements.length }) : undefined}>
                {t("supprimer")}
              </span>
            </Button>
          ) : null}
        </div>
      </div>

      {deplie ? (
        <div className="dir-body">
          {departements.length === 0 ? (
            <div className="node-empty">
              <span>{t("organisation.aucunDepartement")}</span>
              {peut("departments:create") ? (
                <Button className="ms-toggle" onPress={() => surCreation("departement")}>
                  {t("organisation.ajouterUnDepartement")}
                </Button>
              ) : null}
            </div>
          ) : (
            departements.map((dep) => (
              <BlocDepartement
                key={dep.id}
                departement={dep}
                deplie={ouvert(dep.id)}
                surBascule={() => surBascule(dep.id)}
                surCreation={surCreation}
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
  surCreation,
}: {
  departement: api.Departement;
  deplie: boolean;
  surBascule: () => void;
  surCreation: (nature: Nature) => void;
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
        <div style={{ minWidth: 0 }}>
          <p className="dep-n">{departement.nom}</p>
          <span className="node-d">
            {departement.description ?? t("organisation.sansDescription")} ·{" "}
            {t("organisation.creeLe", { date: formaterDate(departement.creeLe) })}
          </span>
        </div>
        <Responsable personne={departement.responsable} />
        <div className="head-count">
          <span>{t("organisation.services", { n: departement._count.services })}</span>
          <span>{t("organisation.membres", { n: departement._count.membres })}</span>
        </div>
        <div className="lv-acts">
          {peut("services:create") ? (
            <Button className="ms-toggle" onPress={() => surCreation("service")}>
              {t("organisation.plusService")}
            </Button>
          ) : null}
          {peut("departments:delete") ? (
            <Button
              className="ms-toggle"
              style={{ color: "var(--st-blocked)", borderColor: "var(--st-blocked)" }}
              onPress={() => setSuppressionOuverte(true)}
            >
              {t("supprimer")}
            </Button>
          ) : null}
        </div>
      </div>

      {deplie ? (
        <div className="dep-body">
          {departement.services.length === 0 ? (
            <div className="node-empty">
              <span>{t("organisation.aucunService")}</span>
              {peut("services:create") ? (
                <Button className="ms-toggle" onPress={() => surCreation("service")}>
                  {t("organisation.ajouterUnService")}
                </Button>
              ) : null}
            </div>
          ) : (
            departement.services.map((s) => (
              <div className="svc" key={s.id}>
                <span className="svc-dot" aria-hidden="true" />
                <div style={{ minWidth: 0 }}>
                  <p className="svc-n">{s.nom}</p>
                  <span className="node-d">
                    {s.description ?? t("organisation.sansDescription")}
                  </span>
                </div>
                <Responsable personne={s.manager} />
                <div className="head-count">
                  <span>{t("organisation.membres", { n: s._count.membres })}</span>
                </div>
                <div className="lv-acts" />
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


/**
 * La création d'un nœud — **un formulaire pour trois niveaux**.
 *
 * La maquette en fait une seule fenêtre dont le rattachement change avec le
 * niveau : une direction n'a pas de parent, un département en a un facultatif
 * (`RG-ORG-03`), un service en exige un.
 */
function FenetreCreationNoeud({
  nature,
  surFermeture,
}: {
  nature: Nature | null;
  surFermeture: () => void;
}) {
  const { t } = useTranslation("administration");
  const { t: tErreurs } = useTranslation("erreurs");
  const annoncer = useMessages();
  const client = useQueryClient();

  const [nom, setNom] = useState("");
  const [description, setDescription] = useState("");
  const [parent, setParent] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);

  const arbre = useQuery({
    queryKey: ["organisation"],
    queryFn: api.arborescence,
    enabled: nature !== null,
  });
  const departements = [
    ...(arbre.data?.directions.flatMap((d) => d.departements) ?? []),
    ...(arbre.data?.departementsSansDirection ?? []),
  ];

  const creation = useMutation({
    mutationFn: () => {
      if (nature === "direction") {
        return api.creerDirection({ nom, ...(description ? { description } : {}) });
      }
      if (nature === "departement") {
        return api.creerDepartement({
          nom,
          ...(description ? { description } : {}),
          directionId: parent || null,
        });
      }
      return api.creerService({
        nom,
        ...(description ? { description } : {}),
        departementId: parent,
      });
    },
    onSuccess: () => {
      annoncer("ok", t("organisation.creee"));
      setNom("");
      setDescription("");
      setParent("");
      surFermeture();
      void client.invalidateQueries({ queryKey: ["organisation"] });
    },
    onError: (e) => setErreur(messageErreur(e, tErreurs, t("organisation.echecCreation"))),
  });

  if (nature === null) return null;

  const valider = () => {
    setErreur(null);
    if (!nom.trim()) {
      setErreur(t("organisation.nomObligatoire"));
      return;
    }
    if (nature === "service" && !parent) {
      setErreur(t("organisation.departementObligatoire"));
      return;
    }
    creation.mutate();
  };

  return (
    <Fenetre
      ouverte
      surFermeture={surFermeture}
      categorie={t(`organisation.nature_${nature}`)}
      titre={t(`organisation.nouveau_${nature}`)}
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
        <label className="field-label" htmlFor="org-nom">
          {t("organisation.nom")} <span className="req">*</span>
        </label>
        <input
          className="field"
          id="org-nom"
          type="text"
          value={nom}
          onChange={(e) => setNom(e.target.value)}
        />
      </div>

      <div className="field-block">
        <label className="field-label" htmlFor="org-desc">
          {t("organisation.description")}
        </label>
        <textarea
          className="field"
          id="org-desc"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      {nature === "direction" ? null : (
        <div className="field-block">
          <label className="field-label" htmlFor="org-parent">
            {nature === "departement"
              ? t("organisation.directionDeRattachement")
              : t("organisation.departementDeRattachement")}
            {nature === "service" ? <span className="req"> *</span> : null}
          </label>
          <select
            className="field"
            id="org-parent"
            value={parent}
            onChange={(e) => setParent(e.target.value)}
          >
            {nature === "departement" ? (
              <option value="">{t("organisation.aucuneDirection")}</option>
            ) : (
              <option value="">{t("organisation.choisirDepartement")}</option>
            )}
            {(nature === "departement" ? (arbre.data?.directions ?? []) : departements).map((x) => (
              <option key={x.id} value={x.id}>
                {x.nom}
              </option>
            ))}
          </select>
        </div>
      )}
    </Fenetre>
  );
}
