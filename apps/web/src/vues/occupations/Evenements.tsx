import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "react-aria-components";
import * as api from "../../api/occupations.js";
import * as apiProjets from "../../api/projets.js";
import { appeler } from "../../api/client.js";
import { messageErreur } from "../../api/erreurs.js";
import { usePeut } from "../../session/session.js";
import { Chargement, ErreurDeChargement } from "../../composants/etats.js";
import { Fenetre } from "../../composants/fenetre.js";
import { useMessages } from "../../composants/messages.js";
import { formaterDate, formaterHeure, formaterMoisSeul, formaterMoisAnnee } from "../../formats.js";
import "../../composants/partages.css";
import "../taches/liste.css";
import "./evenements.css";

/**
 * Vue 18 — Événements.
 *
 * **La portée du geste se choisit AVANT d'agir, jamais après.** Le brief le
 * pose en point d'attention : « la distinction entre modifier une occurrence
 * et modifier toute la série doit être explicite au moment de l'action, pas
 * découverte après coup ». D'où la fenêtre de portée, avec deux options
 * décrites — et non un bouton unique dont l'effet se révèle une fois exécuté.
 */

const JOURS = [0, 1, 2, 3, 4, 5, 6];

export function Evenements() {
  const { t } = useTranslation("occupations");
  const peut = usePeut();
  const [recherche, setRecherche] = useState("");
  const [projectId, setProjectId] = useState("");
  const [interventionExterieure, setInterventionExterieure] = useState(false);
  const [vue, setVue] = useState<"liste" | "calendrier">("liste");
  const [creationOuverte, setCreationOuverte] = useState(false);
  const [detail, setDetail] = useState<api.Evenement | null>(null);
  const [mois, setMois] = useState(() => {
    const d = new Date();
    return { annee: d.getUTCFullYear(), mois: d.getUTCMonth() };
  });

  const debut = new Date(Date.UTC(mois.annee, mois.mois, 1)).toISOString().slice(0, 10);
  const fin = new Date(Date.UTC(mois.annee, mois.mois + 1, 0)).toISOString().slice(0, 10);
  const aujourdhui = new Date().toISOString().slice(0, 10);

  const filtres = { debut, fin, projectId };
  const requete = useQuery({
    queryKey: ["evenements", filtres],
    queryFn: () => api.evenements(filtres),
  });
  const projets = useQuery({
    queryKey: ["projets", {}],
    queryFn: () => apiProjets.portefeuille({}),
  });

  /* La recherche par titre et le filtre d'intervention extérieure se posent
     sur la liste rendue, comme la maquette : ni l'un ni l'autre n'existe en
     paramètre de la route `/evenements`. */
  const evenements = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return (requete.data ?? [])
      .filter((e) => (q ? e.titre.toLowerCase().includes(q) : true))
      .filter((e) => (interventionExterieure ? e.interventionExterieure : true));
  }, [requete.data, recherche, interventionExterieure]);

  const filtreActif = Boolean(recherche || projectId || interventionExterieure);
  const reinitialiser = () => {
    setRecherche("");
    setProjectId("");
    setInterventionExterieure(false);
  };

  /** Regroupés par jour : la liste se lit par date, pas par ordre d'insertion. */
  const parJour = useMemo(() => {
    const groupes = new Map<string, api.Evenement[]>();
    for (const e of evenements) {
      const cle = e.date.slice(0, 10);
      groupes.set(cle, [...(groupes.get(cle) ?? []), e]);
    }
    return [...groupes.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [evenements]);

  return (
    <div className="page">
      <div className="pl-toolbar">
        <div>
          <span className="eyebrow">{t("evenements.surtitre")}</span>
          <h1 className="h1 titre-vue">{t("evenements.titre")}</h1>
        </div>
        <span className="count-split">
          {t("evenements.compte", { n: evenements.length })}
        </span>
        <div className="pl-toolbar-fin">
          <div className="seg" role="group" aria-label={t("evenements.affichage")}>
            <Button aria-pressed={vue === "liste"} onPress={() => setVue("liste")}>
              {t("evenements.affichageListe")}
            </Button>
            <Button aria-pressed={vue === "calendrier"} onPress={() => setVue("calendrier")}>
              {t("evenements.affichageCalendrier")}
            </Button>
          </div>
          {peut("events:create") ? (
            <Button className="btn btn-primary" onPress={() => setCreationOuverte(true)}>
              {t("evenements.creer")}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="filters">
        <input
          className="f-input filtre-recherche"
          type="search"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          aria-label={t("evenements.rechercher")}
          placeholder={t("evenements.rechercher")}
        />

        <select
          className="f-input"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          aria-label={t("evenements.projet")}
        >
          <option value="">{t("evenements.tousProjets")}</option>
          {(projets.data?.projets ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.nom}
            </option>
          ))}
        </select>

        <Button
          className="filter-toggle"
          aria-pressed={interventionExterieure}
          onPress={() => setInterventionExterieure((v) => !v)}
        >
          {t("evenements.interventionExterieure")}
        </Button>

        <span className="pl-period ligne-actions-fin">
          {formaterMoisAnnee(mois.annee, mois.mois)}
        </span>
        <div className="pl-nav" role="group" aria-label={t("evenements.navigationMois")}>
          <Button
            className="nav-sq"
            onPress={() =>
              setMois((m) =>
                m.mois === 0 ? { annee: m.annee - 1, mois: 11 } : { ...m, mois: m.mois - 1 },
              )
            }
            aria-label={t("evenements.moisPrecedent")}
          >
            <span aria-hidden="true">‹</span>
          </Button>
          <Button
            className="nav-sq"
            onPress={() =>
              setMois((m) =>
                m.mois === 11 ? { annee: m.annee + 1, mois: 0 } : { ...m, mois: m.mois + 1 },
              )
            }
            aria-label={t("evenements.moisSuivant")}
          >
            <span aria-hidden="true">›</span>
          </Button>
        </div>
      </div>

      {requete.isPending ? <Chargement quoi={t("evenements.lesEvenements")} /> : null}
      {requete.isError ? (
        <ErreurDeChargement erreur={requete.error} surReessai={() => void requete.refetch()} />
      ) : null}

      {requete.data ? (
        evenements.length === 0 ? (
          <div className="empty empty-encadre">
            <p>{t("evenements.videTitre")}</p>
            <small>{filtreActif ? t("evenements.videFiltres") : t("evenements.videExplication")}</small>
            {filtreActif ? (
              <Button className="chip-btn" onPress={reinitialiser}>
                {t("evenements.reinitialiserFiltres")}
              </Button>
            ) : peut("events:create") ? (
              <Button className="btn btn-primary" onPress={() => setCreationOuverte(true)}>
                {t("evenements.creer")}
              </Button>
            ) : null}
          </div>
        ) : vue === "calendrier" ? (
          <CalendrierSimplifie evenements={evenements} annee={mois.annee} mois={mois.mois} />
        ) : (
          <div className="tlist">
            {parJour.map(([jour, liste]) => {
              const nomDuJour = t(
                `jours.long.${new Date(`${jour}T00:00:00.000Z`).getUTCDay()}`,
              ).toLowerCase();
              return (
              <div key={jour}>
                <div className={`ev-day${jour === aujourdhui ? " is-today" : ""}`}>
                  <span className="ev-dnum">{Number(jour.slice(8, 10))}</span>
                  <span className="ev-dow">
                    {t("evenements.jourEtMois", {
                      jour: nomDuJour,
                      mois: formaterMoisSeul(jour),
                    })}
                  </span>
                  {jour === aujourdhui ? (
                    <span className="ev-dtoday">{t("evenements.aujourdhui")}</span>
                  ) : null}
                </div>
                {liste.map((e) => (
                  <LigneEvenement key={e.id} evenement={e} surOuverture={() => setDetail(e)} />
                ))}
              </div>
              );
            })}
          </div>
        )
      ) : null}

      {/*
        Le panneau de détail vit en permanence dans le document et se glisse
        hors du cadre quand il est fermé — comme la maquette. Fermé, il est
        `inert` : sans cela, la tabulation traverserait un panneau invisible.
      */}
      <PanneauDetail
        evenement={detail}
        projets={projets.data?.projets ?? []}
        surFermeture={() => setDetail(null)}
      />

      <FenetreCreation
        ouverte={creationOuverte}
        surFermeture={() => setCreationOuverte(false)}
        projets={projets.data?.projets ?? []}
      />
    </div>
  );
}

/**
 * `EX-EVT-08` — la liste des participants, avec ses deux gestes.
 *
 * **Deux gestes unitaires plutôt qu'une liste réécrite.** Réécrire l'ensemble
 * ferait disparaître puis réapparaître les participants inchangés, avec la
 * notification d'invitation qui prévient quelqu'un d'un événement qu'il n'a
 * jamais quitté. C'est le raisonnement déjà retenu pour les membres d'un
 * projet, et il vaut ici pour la même raison.
 *
 * L'annuaire n'est lu que si l'on a le droit d'écrire : sans `events:update`,
 * la liste se lit et rien ne se propose (`RG-GEN-06`).
 */
function Participants({ evenement }: { evenement: api.Evenement }) {
  const { t } = useTranslation("occupations");
  const { t: tErreurs } = useTranslation("erreurs");
  const peut = usePeut();
  const annoncer = useMessages();
  const client = useQueryClient();
  const modifiable = peut("events:update");
  const [choisi, setChoisi] = useState("");

  const annuaire = useQuery({
    queryKey: ["utilisateurs", "tous"],
    queryFn: () => appeler<{ id: string; prenom: string; nom: string }[]>("/utilisateurs"),
    enabled: modifiable,
  });

  const rafraichir = () => client.invalidateQueries({ queryKey: ["evenements"] });

  const ajout = useMutation({
    mutationFn: (userId: string) => api.ajouterParticipant(evenement.id, userId),
    onSuccess: async () => {
      annoncer("ok", t("evenements.participantAjoute"));
      setChoisi("");
      await rafraichir();
    },
    onError: (e) => annoncer("err", messageErreur(e, tErreurs, t("evenements.echecParticipant"))),
  });

  const retrait = useMutation({
    mutationFn: (userId: string) => api.retirerParticipant(evenement.id, userId),
    onSuccess: async () => {
      annoncer("ok", t("evenements.participantRetire"));
      await rafraichir();
    },
    onError: (e) => annoncer("err", messageErreur(e, tErreurs, t("evenements.echecParticipant"))),
  });

  // Qui n'est pas déjà invité. Proposer un participant en place produirait une
  // erreur que l'écran pouvait éviter.
  const deja = new Set(evenement.participants.map((p) => p.userId));
  const candidats = (annuaire.data ?? []).filter((u) => !deja.has(u.id));

  return (
    <div className="drawer-part">
      {evenement.participants.length > 0 ? (
        <ul className="part-liste">
          {evenement.participants.map((p) => (
            <li className="part-item" key={p.userId}>
              <span>
                {p.user.prenom} {p.user.nom}
              </span>
              {modifiable ? (
                <Button
                  className="icon-btn"
                  isPending={retrait.isPending}
                  onPress={() => retrait.mutate(p.userId)}
                  aria-label={t("evenements.retirerParticipant", {
                    nom: `${p.user.prenom} ${p.user.nom}`,
                  })}
                >
                  <span aria-hidden="true">×</span>
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="part-vide">{t("evenements.aucunParticipant")}</p>
      )}

      {modifiable ? (
        <div className="ligne-actions-fin">
          <label className="sr-only" htmlFor="ev-ajout-part">
            {t("evenements.ajouterParticipant")}
          </label>
          <select
            className="field"
            id="ev-ajout-part"
            value={choisi}
            onChange={(e) => setChoisi(e.target.value)}
          >
            <option value="">{t("selectionner")}</option>
            {candidats.map((u) => (
              <option key={u.id} value={u.id}>
                {u.prenom} {u.nom}
              </option>
            ))}
          </select>
          <Button
            className="chip-btn"
            isPending={ajout.isPending}
            // Un `aria-disabled` plutôt qu'un `isDisabled` : un bouton
            // désactivé au sens HTML ne reçoit ni survol ni focus.
            aria-disabled={choisi === ""}
            onPress={() => (choisi === "" ? undefined : ajout.mutate(choisi))}
          >
            {t("evenements.ajouterParticipant")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Le panneau de détail d'un événement.
 *
 * **« Modifier » et « Supprimer » agissent.** Ils sont restés désactivés tant
 * que `PATCH` et `DELETE /evenements/:id` n'existaient pas — le motif était
 * exact, et il a été comblé par L-42. Les deux gestes passent maintenant par la
 * question de portée quand l'événement appartient à une série : `RG-EVT-07`.
 *
 * `RG-GEN-06` — sans la permission, l'action n'est pas proposée puis refusée :
 * elle n'est pas proposée. Le contrôle, lui, reste au serveur.
 */
function PanneauDetail({
  evenement,
  projets,
  surFermeture,
}: {
  evenement: api.Evenement | null;
  projets: apiProjets.LigneProjet[];
  surFermeture: () => void;
}) {
  const { t } = useTranslation("occupations");
  const peut = usePeut();
  const [geste, setGeste] = useState<Geste | null>(null);
  const [edition, setEdition] = useState<api.PorteeEvenement | "aucune" | null>(null);
  const ouvert = evenement !== null;
  const serie = evenement !== null && api.estDUneSerie(evenement);

  /*
   * `askScope` de la maquette court-circuite la fenêtre quand l'événement n'est
   * pas récurrent : une question à une seule réponse possible n'est pas une
   * question. La modification ouvre donc directement son formulaire.
   *
   * La suppression, elle, garde sa confirmation hors série — la maquette
   * supprime sur un simple clic, et c'est le seul geste irréversible du
   * panneau. C'est la portée qui est court-circuitée, pas la confirmation :
   * la fenêtre s'affiche alors sans ses deux options.
   */
  const demanderModification = () => {
    if (serie) setGeste("modifier");
    else setEdition("aucune");
  };

  return (
    <aside
      className={`drawer${ouvert ? " is-open" : ""}`}
      aria-label={t("evenements.detailTitre")}
      aria-hidden={!ouvert}
      inert={!ouvert}
    >
      <div className="drawer-head">
        <div className="bloc-etroit">
          <span className="eyebrow">{t("evenements.detailTitre")}</span>
          <p className="panel-title">{evenement?.titre ?? "—"}</p>
        </div>
        <Button className="icon-btn" onPress={surFermeture} aria-label={t("fermer")}>
          <span aria-hidden="true">×</span>
        </Button>
      </div>

      <div className="drawer-body">
        <p className="drawer-desc">{evenement?.description ?? "—"}</p>
        <dl className="dl">
          <dt>{t("evenements.colDate")}</dt>
          <dd>{evenement ? formaterDate(evenement.date) : "—"}</dd>
          <dt>{t("evenements.colHoraires")}</dt>
          <dd>
            {!evenement
              ? "—"
              : evenement.journeeEntiere || !evenement.heureDebut
                ? t("evenements.touteLaJournee")
                : t("evenements.plageHoraire", {
                    debut: formaterHeure(evenement.heureDebut),
                    fin: formaterHeure(evenement.heureFin),
                  })}
          </dd>
          <dt>{t("evenements.projet")}</dt>
          <dd>{evenement?.project?.nom ?? t("evenements.sansProjet")}</dd>
          <dt>{t("evenements.colParticipants")}</dt>
          <dd>{t("evenements.participants", { n: evenement?.participants.length ?? 0 })}</dd>
        </dl>

        {/*
          `EX-EVT-08` — ajouter et retirer des participants.

          Le panneau n'en montrait que le COMPTE. Les deux routes existaient,
          gardées et testées, et rien ne les appelait : on ne pouvait composer
          la liste qu'à la création, et jamais la corriger — or une réunion
          dont un participant change est le cas courant, pas l'exception.
        */}
        {evenement ? <Participants evenement={evenement} /> : null}

        {serie && evenement ? (
          <div className="drawer-serie">
            <div className="alert alert-neutral drawer-alerte">
              <p className="drawer-serie-t">{t("evenements.faitPartieDuneSerie")}</p>
              <p className="drawer-serie-d">{t("evenements.serieExplication")}</p>
            </div>
            {peut("events:update") ? (
              <Button className="btn btn-secondary btn-block" onPress={() => setGeste("arreter")}>
                {t("evenements.arreterRecurrence")}
              </Button>
            ) : null}
          </div>
        ) : null}

        <div className="btn-stack">
          {peut("events:update") ? (
            <Button className="btn btn-secondary" onPress={demanderModification}>
              {t("evenements.modifier")}
            </Button>
          ) : null}
          {peut("events:delete") ? (
            <Button
              className="btn btn-secondary btn-refus"
              onPress={() => setGeste("supprimer")}
            >
              {t("evenements.supprimer")}
            </Button>
          ) : null}
        </div>
      </div>

      {/*
        Les fenêtres se montent à l'ouverture et se démontent à la fermeture :
        leur état — la portée choisie, les champs saisis — repart ainsi neuf à
        chaque geste, au lieu de conserver celui du geste précédent.
      */}
      {evenement && geste ? (
        <FenetrePortee
          evenement={evenement}
          action={geste}
          surFermeture={() => setGeste(null)}
          surPorteeChoisie={(portee) => {
            setGeste(null);
            setEdition(portee);
          }}
          surSuppression={() => {
            setGeste(null);
            surFermeture();
          }}
        />
      ) : null}

      {evenement && edition ? (
        <FenetreEdition
          evenement={evenement}
          portee={edition === "aucune" ? undefined : edition}
          projets={projets}
          surFermeture={() => setEdition(null)}
        />
      ) : null}
    </aside>
  );
}

function LigneEvenement({
  evenement,
  surOuverture,
}: {
  evenement: api.Evenement;
  surOuverture: () => void;
}) {
  const { t } = useTranslation("occupations");
  const serie = api.estDUneSerie(evenement);
  const sansHoraire = evenement.journeeEntiere || !evenement.heureDebut;

  /*
   * La maquette rend la ligne cliquable. Une ligne cliquable qui n'est pas un
   * élément interactif est inatteignable au clavier : c'est un bouton, avec
   * le nom accessible de l'événement qu'il ouvre.
   */
  return (
    <Button className="ev-row" onPress={surOuverture} aria-label={evenement.titre}>
      {/*
        Pas d'horaire = toute la journée. Rendre « — – — » pour un événement
        sans heure serait annoncer une donnée manquante là où il n'en manque
        aucune : la maquette dit « Toute la journée » dans les deux cas.
      */}
      <span className={`ev-time${sansHoraire ? " is-all" : ""}`}>
        {sansHoraire
          ? t("evenements.touteLaJournee")
          : t("evenements.plageHoraire", {
              debut: formaterHeure(evenement.heureDebut),
              fin: formaterHeure(evenement.heureFin),
            })}
      </span>

      <span className="bloc-etroit">
        <span className="ev-name">{evenement.titre}</span>
        <span className="ev-sub">
          {serie ? (
            <span className="ev-rec">
              <span aria-hidden="true">↻</span>
              <span>{t("evenements.serie")}</span>
            </span>
          ) : null}
          {evenement.interventionExterieure ? (
            <span className="pill pill-ext">{t("evenements.interventionExt")}</span>
          ) : null}
        </span>
      </span>

      <span className="bloc-etroit">
        {evenement.project ? (
          <span className="pchip">
            <span className="picon" aria-hidden="true">
              ◇
            </span>
            <span>{evenement.project.nom}</span>
          </span>
        ) : (
          <span className="pchip is-indep">
            <span className="dot-ind" aria-hidden="true" />
            <span>{t("evenements.sansProjet")}</span>
          </span>
        )}
      </span>

      <span className="ev-part">
        {t("evenements.participants", { n: evenement.participants.length })}
      </span>

      <span className="ev-go" aria-hidden="true">
        ›
      </span>
    </Button>
  );
}

/** Les trois gestes qui passent par la question de portée. */
type Geste = "arreter" | "modifier" | "supprimer";

/**
 * `RG-EVT-07`, `RG-EVT-04` — la portée du geste, demandée AVANT d'agir.
 *
 * Le brief de la vue 18 le pose en point d'attention : « la distinction entre
 * modifier une occurrence et modifier toute la série doit être explicite au
 * moment de l'action, pas découverte après coup ». D'où cette fenêtre, avec ses
 * deux options **décrites** — et non un bouton unique dont l'effet se révèle une
 * fois exécuté. Le serveur tient la même exigence : il refuse une écriture sur
 * une série qui ne déclare pas sa portée.
 *
 * Une seule fenêtre pour les trois gestes, parce que la question est la même.
 * Ce qui change d'un geste à l'autre :
 *
 *   - **arrêter** — la portée est nécessairement la série ; « cette occurrence »
 *     reste montrée et désactivée, avec sa raison : arrêter, c'est couper la
 *     suite. Une option absente laisserait croire qu'elle n'existe pas.
 *   - **modifier** — la fenêtre ne fait que choisir ; c'est le formulaire qui
 *     suit qui écrit.
 *   - **supprimer** — la fenêtre confirme et supprime. Hors série, elle n'a
 *     plus d'options : elle reste une confirmation, parce que c'est le seul
 *     geste irréversible du panneau.
 *
 * Le pied porte toujours « Le passé n'est jamais touché » : l'information qui
 * lève l'inquiétude, à côté du bouton qui l'inspire.
 */
function FenetrePortee({
  evenement,
  action,
  surFermeture,
  surPorteeChoisie,
  surSuppression,
}: {
  evenement: api.Evenement;
  action: Geste;
  surFermeture: () => void;
  surPorteeChoisie: (portee: api.PorteeEvenement | "aucune") => void;
  surSuppression: () => void;
}) {
  const { t } = useTranslation("occupations");
  const { t: tErreurs } = useTranslation("erreurs");
  const annoncer = useMessages();
  const client = useQueryClient();
  const serie = api.estDUneSerie(evenement);
  const [portee, setPortee] = useState<api.PorteeEvenement>(
    action === "arreter" ? "serie" : "occurrence",
  );

  const arret = useMutation({
    mutationFn: () => api.arreterRecurrence(evenement.id, evenement.date.slice(0, 10)),
    onSuccess: (r) => {
      annoncer("ok", t("evenements.recurrenceArretee", { n: r.supprimees }));
      surFermeture();
      void client.invalidateQueries({ queryKey: ["evenements"] });
    },
    onError: (e) => annoncer("err", messageErreur(e, tErreurs, t("evenements.echecArret"))),
  });

  const suppression = useMutation({
    mutationFn: () =>
      api.supprimerEvenement(evenement.id, {
        version: evenement.version,
        // `RG-EVT-07` — hors série, la portée n'a pas d'objet, et le serveur la
        // refuse. La transmettre « au cas où » ferait échouer le geste.
        ...(serie ? { portee } : {}),
      }),
    onSuccess: (r) => {
      annoncer("ok", t("evenements.supprime", { n: r.supprimees }));
      surSuppression();
      void client.invalidateQueries({ queryKey: ["evenements"] });
    },
    onError: (e) => annoncer("err", messageErreur(e, tErreurs, t("evenements.echecSuppression"))),
  });

  /* Les deux options, dans le vocabulaire du geste. « Arrêter » a le sien :
     l'occurrence seule n'y est pas une portée possible, et le dire vaut mieux
     que de la masquer. */
  const options =
    action === "arreter"
      ? ([
          {
            cle: "serie",
            titre: t("evenements.porteeSerie"),
            detail: t("evenements.porteeSerieDetail"),
            possible: true,
          },
          {
            cle: "occurrence",
            titre: t("evenements.porteeOccurrence"),
            detail: t("evenements.porteeOccurrenceDetail"),
            possible: false,
          },
        ] as const)
      : ([
          {
            cle: "occurrence",
            titre: t("evenements.porteeOccurrenceSeule"),
            detail: t("evenements.porteeOccurrenceSeuleDetail"),
            possible: true,
          },
          {
            cle: "serie",
            titre: t("evenements.porteeSerieDepuisIci"),
            detail: t("evenements.porteeSerieDepuisIciDetail"),
            possible: true,
          },
        ] as const);

  const categorie =
    action === "arreter" ? t("evenements.serieRecurrente") : t("evenements.porteeAction");
  const titre =
    action === "arreter"
      ? t("evenements.arreterTitre")
      : action === "modifier"
        ? t("evenements.modifierTitre")
        : t("evenements.supprimerTitre");
  const question =
    action === "arreter"
      ? t("evenements.arreterQuestion")
      : !serie
        ? t("evenements.supprimerQuestion")
        : action === "modifier"
          ? t("evenements.porteeQuestionModifier")
          : t("evenements.porteeQuestionSupprimer");
  /*
   * Le bouton de confirmation ne reprend PAS le libellé du bouton qui a ouvert
   * la fenêtre. Deux raisons, et la seconde est la vraie : « Modifier » ici ne
   * modifie rien — il ouvre le formulaire, donc « Continuer » dit ce qui se
   * passe ; et « Supprimer définitivement » nomme l'irréversible à côté du
   * geste qui l'exécute. Accessoirement, deux commandes de même nom accessible
   * dans un même document sont indistinguables au lecteur d'écran comme au
   * contrôle de bout en bout.
   */
  const confirmer =
    action === "arreter"
      ? t("evenements.arreterConfirmer")
      : action === "modifier"
        ? t("evenements.continuer")
        : t("evenements.supprimerConfirmer");

  const agir = () => {
    if (action === "arreter") arret.mutate();
    else if (action === "modifier") surPorteeChoisie(serie ? portee : "aucune");
    else suppression.mutate();
  };

  return (
    <Fenetre
      ouverte
      surFermeture={surFermeture}
      categorie={categorie}
      titre={titre}
      mention={t("evenements.passeIntact")}
      actions={
        <>
          <Button className="btn btn-secondary" onPress={surFermeture}>
            {t("annuler")}
          </Button>
          <Button
            className={action === "modifier" ? "btn btn-primary" : "btn btn-danger"}
            isPending={arret.isPending || suppression.isPending}
            onPress={agir}
          >
            {confirmer}
          </Button>
        </>
      }
    >
      <p className="phrase-confirmation">{question}</p>
      {serie ? (
        <div className="scope-opts" role="radiogroup" aria-label={t("evenements.porteeDuGeste")}>
          {options.map((o) => (
            <Button
              key={o.cle}
              className="scope-opt"
              aria-pressed={portee === o.cle}
              isDisabled={!o.possible}
              onPress={() => setPortee(o.cle)}
            >
              <span className="scope-mark" aria-hidden="true" />
              <span>
                <span className="scope-t">{o.titre}</span>
                <span className="scope-d">{o.detail}</span>
              </span>
            </Button>
          ))}
        </div>
      ) : null}
    </Fenetre>
  );
}

/**
 * `EX-EVT-06` — le formulaire de modification.
 *
 * Il n'ouvre que les champs que `PATCH /evenements/:id` accepte : les
 * participants ont leurs propres points d'entrée (`EX-EVT-08`), et les
 * paramètres de récurrence ne se réécrivent pas — les changer régénérerait la
 * série, ce qui est un autre geste que « modifier ».
 *
 * **La date disparaît en portée « série »**, et le formulaire dit pourquoi : le
 * serveur la refuse (`date_non_propageable`), parce qu'elle est ce qui
 * distingue deux occurrences l'une de l'autre. Un champ proposé puis refusé
 * serait exactement ce que `RG-GEN-06` interdit.
 */
function FenetreEdition({
  evenement,
  portee,
  projets,
  surFermeture,
}: {
  evenement: api.Evenement;
  portee: api.PorteeEvenement | undefined;
  projets: apiProjets.LigneProjet[];
  surFermeture: () => void;
}) {
  const { t } = useTranslation("occupations");
  const { t: tErreurs } = useTranslation("erreurs");
  const annoncer = useMessages();
  const client = useQueryClient();

  const [titre, setTitre] = useState(evenement.titre);
  const [description, setDescription] = useState(evenement.description ?? "");
  const [date, setDate] = useState(evenement.date.slice(0, 10));
  const [journeeEntiere, setJourneeEntiere] = useState(evenement.journeeEntiere);
  const [heureDebut, setHeureDebut] = useState(evenement.heureDebut ?? "09:00");
  const [heureFin, setHeureFin] = useState(evenement.heureFin ?? "10:00");
  const [projectId, setProjectId] = useState(evenement.project?.id ?? "");
  const [interventionExterieure, setInterventionExterieure] = useState(
    evenement.interventionExterieure,
  );
  const [erreur, setErreur] = useState<string | null>(null);
  const [manquants, setManquants] = useState<string[]>([]);

  const surSerie = portee === "serie";

  const modification = useMutation({
    mutationFn: () =>
      api.modifierEvenement(evenement.id, {
        // `RG-GEN-07` — la version lue voyage avec l'écriture. Sans elle, deux
        // corrections concurrentes s'effaceraient sans que personne ne le sache.
        version: evenement.version,
        ...(portee ? { portee } : {}),
        titre,
        description: description.trim() === "" ? null : description,
        ...(surSerie ? {} : { date }),
        journeeEntiere,
        heureDebut: journeeEntiere ? null : heureDebut,
        heureFin: journeeEntiere ? null : heureFin,
        projectId: projectId || null,
        interventionExterieure,
      }),
    onSuccess: () => {
      annoncer("ok", t("evenements.modifie"));
      surFermeture();
      void client.invalidateQueries({ queryKey: ["evenements"] });
    },
    onError: (e) => setErreur(messageErreur(e, tErreurs, t("evenements.echecModification"))),
  });

  const valider = () => {
    setErreur(null);
    const vides = [!titre.trim() && "titre", !surSerie && !date && "date"].filter(
      Boolean,
    ) as string[];
    setManquants(vides);
    if (vides.length > 0) {
      setErreur(t("champsObligatoires"));
      return;
    }
    modification.mutate();
  };

  return (
    <Fenetre
      ouverte
      surFermeture={surFermeture}
      categorie={t("evenements.detailTitre")}
      titre={t("evenements.modifierTitre")}
      large
      mention={surSerie ? t("evenements.passeIntact") : t("champsObligatoires")}
      actions={
        <>
          <Button className="btn btn-secondary" onPress={surFermeture}>
            {t("annuler")}
          </Button>
          <Button className="btn btn-primary" isPending={modification.isPending} onPress={valider}>
            {t("evenements.enregistrer")}
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

      {surSerie ? (
        <div className="alert alert-neutral drawer-alerte">
          <p className="drawer-serie-t">{t("evenements.porteeSerieDepuisIci")}</p>
          <p className="drawer-serie-d">{t("evenements.dateFigeeSurSerie")}</p>
        </div>
      ) : null}

      <div className="form-grid form-grid-espace">
        <div className="field-block span2">
          <label className="field-label" htmlFor="ev-m-titre">
            {t("evenements.titreChamp")} <span className="req">*</span>
          </label>
          <input
            className="field"
            id="ev-m-titre"
            type="text"
            value={titre}
            aria-invalid={manquants.includes("titre")}
            onChange={(e) => setTitre(e.target.value)}
          />
        </div>

        <div className="field-block span2">
          <label className="field-label" htmlFor="ev-m-desc">
            {t("evenements.descriptionChamp")}
          </label>
          <textarea
            className="field"
            id="ev-m-desc"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        {/* En portée « série », la date n'est pas grisée : elle disparaît, et
            l'encart ci-dessus dit pourquoi. Un champ grisé invite à chercher
            comment le réactiver. */}
        {surSerie ? null : (
          <div className="field-block">
            <label className="field-label" htmlFor="ev-m-date">
              {t("evenements.date")} <span className="req">*</span>
            </label>
            <input
              className="field"
              id="ev-m-date"
              type="date"
              value={date}
              aria-invalid={manquants.includes("date")}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        )}

        <div className="field-block">
          <label className="check">
            <input
              type="checkbox"
              checked={journeeEntiere}
              onChange={(e) => setJourneeEntiere(e.target.checked)}
            />
            <span>{t("evenements.touteLaJournee")}</span>
          </label>
        </div>

        {journeeEntiere ? null : (
          <>
            <div className="field-block">
              <label className="field-label" htmlFor="ev-m-h1">
                {t("evenements.heureDebut")}
              </label>
              <input
                className="field"
                id="ev-m-h1"
                type="time"
                value={heureDebut}
                onChange={(e) => setHeureDebut(e.target.value)}
              />
            </div>
            <div className="field-block">
              <label className="field-label" htmlFor="ev-m-h2">
                {t("evenements.heureFin")}
              </label>
              <input
                className="field"
                id="ev-m-h2"
                type="time"
                value={heureFin}
                onChange={(e) => setHeureFin(e.target.value)}
              />
            </div>
          </>
        )}

        <div className="field-block span2">
          <label className="field-label" htmlFor="ev-m-projet">
            {t("evenements.projet")}
          </label>
          <select
            className="field"
            id="ev-m-projet"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          >
            <option value="">{t("evenements.sansProjet")}</option>
            {projets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nom}
              </option>
            ))}
          </select>
        </div>

        <div className="field-block span2">
          <label className="check">
            <input
              type="checkbox"
              checked={interventionExterieure}
              onChange={(e) => setInterventionExterieure(e.target.checked)}
            />
            <span>{t("evenements.interventionExterieure")}</span>
          </label>
        </div>
      </div>
    </Fenetre>
  );
}

/** La vue calendrier, annoncée comme simplifiée — elle l'est, et le dit. */
function CalendrierSimplifie({
  evenements,
  annee,
  mois,
}: {
  evenements: api.Evenement[];
  annee: number;
  mois: number;
}) {
  const { t } = useTranslation("occupations");
  const premier = new Date(Date.UTC(annee, mois, 1));
  // La grille commence au lundi : le calendrier de travail français.
  const decalage = (premier.getUTCDay() + 6) % 7;
  const nbJours = new Date(Date.UTC(annee, mois + 1, 0)).getUTCDate();
  const cellules = Array.from({ length: decalage + nbJours }, (_, i) =>
    i < decalage ? null : i - decalage + 1,
  );

  const jours = ["lun", "mar", "mer", "jeu", "ven", "sam", "dim"];

  return (
    <div className="tlist">
      <p className="cal-note">{t("evenements.calendrierSimplifie")}</p>
      <div className="cal">
        {jours.map((j) => (
          <div className="cal-dow" key={j}>
            {t(`jours.${j}`)}
          </div>
        ))}
        {cellules.map((jour, i) => (
          <div className={`cal-cell${jour === null ? " is-out" : ""}`} key={i}>
            {jour === null ? null : (
              <>
                <span className="cal-n">{jour}</span>
                {evenements
                  .filter((e) => Number(e.date.slice(8, 10)) === jour)
                  .slice(0, 3)
                  .map((e) => (
                    <span className="cal-ev" key={e.id}>
                      <span>{e.titre}</span>
                    </span>
                  ))}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * La fenêtre de création.
 *
 * « Toute la journée » masque les horaires plutôt que de les désactiver : un
 * champ grisé invite à chercher comment le réactiver.
 *
 * `RG-EVT-05` — l'horizon de récurrence est borné, et le refus le chiffre.
 */
function FenetreCreation({
  ouverte,
  surFermeture,
  projets,
}: {
  ouverte: boolean;
  surFermeture: () => void;
  projets: apiProjets.LigneProjet[];
}) {
  const { t } = useTranslation("occupations");
  const { t: tErreurs } = useTranslation("erreurs");
  const annoncer = useMessages();
  const client = useQueryClient();

  const [titre, setTitre] = useState("");
  const [date, setDate] = useState("");
  const [journeeEntiere, setJourneeEntiere] = useState(false);
  const [heureDebut, setHeureDebut] = useState("09:00");
  const [heureFin, setHeureFin] = useState("10:00");
  const [projectId, setProjectId] = useState("");
  const [participants, setParticipants] = useState<string[]>([]);
  const [recurrent, setRecurrent] = useState(false);
  const [frequence, setFrequence] = useState(1);
  const [jourSemaine, setJourSemaine] = useState<number | "auto">("auto");
  const [jusqua, setJusqua] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [manquants, setManquants] = useState<string[]>([]);

  const utilisateurs = useQuery({
    queryKey: ["utilisateurs", "tous"],
    queryFn: () =>
      appeler<{ id: string; prenom: string; nom: string }[]>("/utilisateurs"),
    enabled: ouverte,
  });

  const creation = useMutation({
    mutationFn: () =>
      api.creerEvenement({
        titre,
        date,
        journeeEntiere,
        ...(journeeEntiere ? {} : { heureDebut, heureFin }),
        projectId: projectId || null,
        ...(participants.length > 0 ? { participantIds: participants } : {}),
        ...(recurrent && jusqua
          ? {
              recurrence: {
                frequenceSemaines: frequence,
                jourSemaine:
                  jourSemaine === "auto"
                    ? new Date(`${date}T00:00:00.000Z`).getUTCDay()
                    : jourSemaine,
                jusqua,
              },
            }
          : {}),
      }),
    onSuccess: () => {
      annoncer("ok", t("evenements.cree"));
      setTitre("");
      setDate("");
      surFermeture();
      void client.invalidateQueries({ queryKey: ["evenements"] });
    },
    onError: (e) => setErreur(messageErreur(e, tErreurs, t("evenements.echecCreation"))),
  });

  const valider = () => {
    setErreur(null);
    const vides = [!titre.trim() && "titre", !date && "date"].filter(Boolean) as string[];
    setManquants(vides);
    if (vides.length > 0) {
      setErreur(t("champsObligatoires"));
      return;
    }
    creation.mutate();
  };

  /** L'aperçu en langage naturel : une récurrence se relit, elle ne se devine pas. */
  const apercu =
    recurrent && date
      ? t("evenements.apercuRecurrence", {
          n: frequence,
          jour:
            jourSemaine === "auto"
              ? t("evenements.memeJourQueLaDate")
              : t(`jours.long.${jourSemaine}`),
          fin: jusqua ? formaterDate(jusqua) : t("evenements.sansFin"),
        })
      : null;

  return (
    <Fenetre
      ouverte={ouverte}
      surFermeture={surFermeture}
      categorie={t("evenements.nouvelEvenement")}
      titre={t("evenements.creer")}
      large
      mention={t("champsObligatoires")}
      actions={
        <>
          <Button className="btn btn-secondary" onPress={surFermeture}>
            {t("annuler")}
          </Button>
          <Button className="btn btn-primary" isPending={creation.isPending} onPress={valider}>
            {t("evenements.creerEvenement")}
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

      <div className="form-grid form-grid-espace">
        <div className="field-block span2">
          <label className="field-label" htmlFor="ev-titre">
            {t("evenements.titreChamp")} <span className="req">*</span>
          </label>
          <input
            className="field"
            id="ev-titre"
            type="text"
            value={titre}
            aria-invalid={manquants.includes("titre")}
            onChange={(e) => setTitre(e.target.value)}
          />
        </div>

        <div className="field-block">
          <label className="field-label" htmlFor="ev-date">
            {t("evenements.date")} <span className="req">*</span>
          </label>
          <input
            className="field"
            id="ev-date"
            type="date"
            value={date}
            aria-invalid={manquants.includes("date")}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        <div className="field-block">
          <label className="check">
            <input
              type="checkbox"
              checked={journeeEntiere}
              onChange={(e) => setJourneeEntiere(e.target.checked)}
            />
            <span>{t("evenements.touteLaJournee")}</span>
          </label>
        </div>

        {/* Les horaires disparaissent au lieu d'être grisés : un champ grisé
            invite à chercher comment le réactiver. */}
        {journeeEntiere ? null : (
          <>
            <div className="field-block">
              <label className="field-label" htmlFor="ev-h1">
                {t("evenements.heureDebut")}
              </label>
              <input
                className="field"
                id="ev-h1"
                type="time"
                value={heureDebut}
                onChange={(e) => setHeureDebut(e.target.value)}
              />
            </div>
            <div className="field-block">
              <label className="field-label" htmlFor="ev-h2">
                {t("evenements.heureFin")}
              </label>
              <input
                className="field"
                id="ev-h2"
                type="time"
                value={heureFin}
                onChange={(e) => setHeureFin(e.target.value)}
              />
            </div>
          </>
        )}

        <div className="field-block span2">
          <label className="field-label" htmlFor="ev-projet">
            {t("evenements.projet")}
          </label>
          <select
            className="field"
            id="ev-projet"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          >
            <option value="">{t("evenements.sansProjet")}</option>
            {projets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nom}
              </option>
            ))}
          </select>
        </div>

        <div className="field-block span2">
          <span className="field-label" id="ev-part-lab">
            {t("evenements.participantsChamp")}
          </span>
          <div className="pickbox" role="group" aria-labelledby="ev-part-lab">
            {(utilisateurs.data ?? []).map((u) => (
              <label className="pick-item" key={u.id}>
                <input
                  type="checkbox"
                  checked={participants.includes(u.id)}
                  onChange={(e) =>
                    setParticipants((s) =>
                      e.target.checked ? [...s, u.id] : s.filter((x) => x !== u.id),
                    )
                  }
                />
                <span>
                  {u.prenom} {u.nom}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="field-block span2">
          <label className="check">
            <input
              type="checkbox"
              checked={recurrent}
              onChange={(e) => setRecurrent(e.target.checked)}
            />
            <span>{t("evenements.evenementRecurrent")}</span>
          </label>
        </div>

        {recurrent ? (
          <div className="field-block span2">
            <div className="rec-box">
              <div className="rec-grid">
                <div className="field-block">
                  <label className="field-label" htmlFor="ev-freq">
                    {t("evenements.frequence")}
                  </label>
                  <input
                    className="field"
                    id="ev-freq"
                    type="number"
                    min={1}
                    max={52}
                    value={frequence}
                    onChange={(e) => setFrequence(Number(e.target.value))}
                  />
                </div>
                <div className="field-block">
                  <label className="field-label" htmlFor="ev-jour">
                    {t("evenements.jourSemaine")}
                  </label>
                  <select
                    className="field"
                    id="ev-jour"
                    value={String(jourSemaine)}
                    onChange={(e) =>
                      setJourSemaine(e.target.value === "auto" ? "auto" : Number(e.target.value))
                    }
                  >
                    <option value="auto">{t("evenements.memeJourQueLaDate")}</option>
                    {JOURS.map((j) => (
                      <option key={j} value={j}>
                        {t(`jours.long.${j}`)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field-block">
                  <label className="field-label" htmlFor="ev-jusqua">
                    {t("evenements.jusqua")}
                  </label>
                  <input
                    className="field"
                    id="ev-jusqua"
                    type="date"
                    value={jusqua}
                    onChange={(e) => setJusqua(e.target.value)}
                  />
                </div>
              </div>

              {apercu ? (
                <div className="rec-prev">
                  <span aria-hidden="true">↻</span>
                  <div>
                    <p className="rec-prev-t">{t("evenements.apercuTitre")}</p>
                    <p className="rec-prev-d">{apercu}</p>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </Fenetre>
  );
}
