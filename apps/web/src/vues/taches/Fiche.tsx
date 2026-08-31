import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button } from "react-aria-components";
import { STATUTS_TACHE, PRIORITES, ROLES_RACI } from "@rationarium/contracts";
import * as api from "../../api/taches.js";
import * as apiTemps from "../../api/occupations.js";
import * as apiProjets from "../../api/projets.js";
import * as apiReferentiels from "../../api/referentiels.js";
import { appeler, ErreurApi } from "../../api/client.js";
import { messageErreur } from "../../api/erreurs.js";
import { usePeut, useSession } from "../../session/session.js";
import { Chargement, ErreurDeChargement } from "../../composants/etats.js";
import { Fenetre } from "../../composants/fenetre.js";
import { useMessages } from "../../composants/messages.js";
import { Pastille, AvatarAgent, useLibelle } from "../../composants/pastilles.js";
import { PastilleRattachement } from "./Liste.js";
import { formaterDate, formaterDateLongue, formaterNombre, formaterHeure } from "../../formats.js";
import "../../composants/partages.css";
/* `.conf-list` et `.conf-k` viennent de la section 19 ; la maquette 17 —
   cumulative — les emploie telles quelles pour l'incohérence de dates. */
import "../rapports/gantt.css";
import "./liste.css";
import "./fiche.css";

/**
 * Vue 17 — Fiche tâche.
 *
 * **La vue la plus dense en objets liés du produit**, et le brief prévient :
 * « sans hiérarchie forte, elle devient un formulaire interminable. Ce qui
 * compte au quotidien — statut, assignés, avancement — doit être atteignable
 * sans défilement. »
 *
 * D'où la barre collante en tête : elle porte ces trois-là et rien d'autre.
 * Tout le reste est en dessous, en deux colonnes.
 *
 * **La concurrence est détectée, jamais écrasée** (`RG-GEN-07`). Chaque
 * écriture transmet la version lue ; un écart remonte en 409 avec un message
 * qui dit quoi faire — recharger — plutôt qu'un échec muet.
 */
export function FicheTache({ tacheId }: { tacheId: string }) {
  const { t } = useTranslation("taches");
  const { t: tErreurs } = useTranslation("erreurs");
  const libelle = useLibelle();
  const peut = usePeut();
  const annoncer = useMessages();
  const client = useQueryClient();
  const [suppressionOuverte, setSuppressionOuverte] = useState(false);
  const [assignesOuvert, setAssignesOuvert] = useState(false);
  const [modificationOuverte, setModificationOuverte] = useState(false);

  const requete = useQuery({ queryKey: ["tache", tacheId], queryFn: () => api.fiche(tacheId) });
  const contexteTemps = useQuery({
    queryKey: ["temps", "contexte", tacheId],
    queryFn: () => apiTemps.contexteTemps(tacheId),
    enabled: peut("time_tracking:read"),
  });
  const modifiable = peut("tasks:update");

  const modifier = useMutation({
    mutationFn: (champs: Parameters<typeof api.modifier>[1]) => api.modifier(tacheId, champs),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["tache", tacheId] }),
    onError: (e) => {
      annoncer("err", messageErreur(e, tErreurs, t("fiche.echecEnregistrement")));
      void client.invalidateQueries({ queryKey: ["tache", tacheId] });
    },
  });

  if (requete.isPending) return <Chargement quoi={t("fiche.laTache")} />;
  if (requete.isError)
    return <ErreurDeChargement erreur={requete.error} surReessai={() => void requete.refetch()} />;

  const tache = requete.data;
  const incoherentes = tache.incoherences;

  return (
    <div className="page">
      {/*
        `activeProps` est vidé : le routeur ajoute par défaut une classe
        `active` sur tout lien dont la route est un ANCÊTRE de la route
        courante — ici `/taches`. Une classe que rien ne définit, donc invisible
        et inerte, et qui n'existe pas dans la maquette.
      */}
      <Link to="/taches" className="back-link" activeProps={{}}>
        <span aria-hidden="true">←</span> <span>{t("fiche.retour")}</span>
      </Link>

      {/*
        `EX-TSK-12` — l'incohérence de dates se dit AVANT d'être découverte, et
        elle nomme la tâche en cause avec sa date. « Attention, incohérence »
        sans le détail oblige à chercher ce qui cloche.
      */}
      {incoherentes.length > 0 ? (
        <div className="alert alert-warn conf-alerte" role="status">
          <div className="conf-corps">
            <span className="alert-icon" aria-hidden="true">
              !
            </span>
            <div className="conf-texte">
              <strong>{t("fiche.incoherencesDates")}</strong>
              <ul className="conf-list">
                {incoherentes.map((x) => (
                  <li key={x.prerequis.id}>
                    <span className="conf-k">
                      {x.prerequis.dateFin ? formaterDate(x.prerequis.dateFin) : "—"}
                    </span>
                    <span>{t("fiche.incoherenceDetail", { titre: x.prerequis.titre })}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      ) : null}

      <div className="proj-head proj-head-fiche">
        <div className="bloc-etroit proj-head-titre">
          <div className="pills">
            <PastilleRattachement projet={tache.project} />
            <Pastille code={tache.priorite} vocabulaire={PRIORITES} />
            <span className="pill pill-muted">
              {tache.milestone?.nom ?? t("liste.sansJalon")}
            </span>
            {tache.enRetard ? <span className="pill badge-late">{t("enRetard")}</span> : null}
            {tache.interventionExterieure ? (
              <span className="pill pill-ext">{t("fiche.interventionExterieure")}</span>
            ) : null}
          </div>
          <TitreEditable
            titre={tache.titre}
            modifiable={modifiable}
            surEnregistrement={(titre) => modifier.mutate({ version: tache.version, titre })}
          />
        </div>
        <div className="proj-acts">
          {/*
            « Modifier » ouvre le formulaire complet de la maquette. Il a vécu
            désactivé plusieurs lots, derrière un motif qui disait vrai — la
            route existait, c'est le formulaire qui manquait — et qui n'en
            restait pas moins une commande inerte : la fiche édite en place le
            titre, le statut, l'avancement, le projet et les horaires, et les
            quatre champs restants n'étaient joignables par AUCUN chemin.

            Le commentaire est réécrit à chaque geste ajouté : un commentaire
            qui affirme une absence est une affirmation que RIEN ne vérifie, et
            le dépôt a déjà payé trois fois d'en avoir laissé vieillir un.
          */}
          {modifiable ? (
            <Button className="chip-btn" onPress={() => setModificationOuverte(true)}>
              {t("fiche.modifier")}
            </Button>
          ) : null}
          {peut("tasks:delete") ? (
            <Button className="chip-btn chip-danger" onPress={() => setSuppressionOuverte(true)}>
              {t("fiche.supprimer")}
            </Button>
          ) : null}
        </div>
      </div>

      <FenetreModification
        ouverte={modificationOuverte}
        surFermeture={() => setModificationOuverte(false)}
        tache={tache}
      />

      <FenetreAssignes
        ouverte={assignesOuvert}
        surFermeture={() => setAssignesOuvert(false)}
        tacheId={tacheId}
        version={tache.version}
        projectId={tache.project?.id ?? null}
        actuels={tache.assignes.map((a) => a.userId)}
      />

      {/* La barre du quotidien : statut, assignés, avancement. Elle ne défile pas. */}
      <div className="daybar">
        <div className="day-block">
          <span className="eyebrow">{t("liste.colStatut")}</span>
          <select
            className="mini-select"
            value={tache.statut}
            disabled={!modifiable}
            aria-label={t("liste.colStatut")}
            onChange={(e) => modifier.mutate({ version: tache.version, statut: e.target.value })}
          >
            {STATUTS_TACHE.map((s) => (
              <option key={s.code} value={s.code}>
                {libelle(s.code, STATUTS_TACHE)}
              </option>
            ))}
          </select>
        </div>

        <div className="day-block">
          <span className="eyebrow">{t("liste.colAssignes")}</span>
          <div className="day-row">
            {tache.assignes.length > 0 ? (
              <span className="avs">
                {tache.assignes.map((a) => (
                  <AvatarAgent key={a.userId} prenom={a.user.prenom} nom={a.user.nom} />
                ))}
              </span>
            ) : (
              <span className="raci-none">{t("liste.sansAssigne")}</span>
            )}
            {/* `EX-TSK-05`. Le bouton a vécu désactivé derrière un commentaire
                affirmant que « l'ajout d'un assigné n'a pas de point d'entrée » :
                `PUT /taches/:id/assignes` existe depuis L-33. La fenêtre pose la
                liste ENTIÈRE, comme la route l'exige. */}
            <Button
              className="who-add"
              isDisabled={!peut("tasks:update")}
              aria-label={t("fiche.ajouterAssigne")}
              onPress={() => setAssignesOuvert(true)}
            >
              <span aria-hidden="true">+</span>
            </Button>
          </div>
        </div>

        <div className="day-block">
          <span className="eyebrow">{t("fiche.avancement")}</span>
          <div className="day-row">
            <input
              className="slider"
              type="range"
              min={0}
              max={100}
              step={5}
              value={tache.avancement}
              disabled={!modifiable}
              aria-label={t("fiche.avancement")}
              onChange={(e) =>
                modifier.mutate({ version: tache.version, avancement: Number(e.target.value) })
              }
            />
            <span className="pct-val">{tache.avancement} %</span>
          </div>
        </div>
      </div>

      <div className="split2">
        <div>
          <section className="panel">
            <div className="panel-head">
              <span className="panel-title">{t("fiche.description")}</span>
            </div>
            <div className="panel-body">
              {tache.description ? (
                <p className="cmt-txt">{tache.description}</p>
              ) : (
                <p className="dep-none">{t("fiche.aucuneDescription")}</p>
              )}
            </div>
          </section>

          <SousTaches tache={tache} modifiable={modifiable} />
          <Dependances tache={tache} />
          <Commentaires tache={tache} />
          <Documents tache={tache} />
        </div>

        {/*
          La colonne latérale suit le découpage de la maquette : rattachement,
          responsabilités, planification, suivi. Un seul bloc « informations »
          mélangeait quatre questions différentes.
        */}
        <div>
          <section className="panel">
            <div className="panel-head">
              <span className="panel-title">{t("liste.colRattachement")}</span>
            </div>
            <dl className="side-dl">
              {/*
                `EX-TSK-15` — le rattachement se change ICI. Il s'affichait en
                lecture seule : le serveur ne savait pas le faire, et l'écran
                n'avait rien à appeler. Une tâche née hors projet le restait
                pour toujours.
              */}
              <RattachementProjet
                tache={tache}
                modifiable={modifiable}
                surChangement={(projectId) => modifier.mutate({ version: tache.version, projectId })}
              />
              <Ligne libelle={t("liste.jalon")} valeur={tache.milestone?.nom ?? null} />
              <Ligne libelle={t("fiche.epopee")} valeur={tache.epic?.nom ?? null} />
              <dt>{t("fiche.tiersAssignes")}</dt>
              <dd className={tache.tiers.length > 0 ? "" : "is-none"}>
                {tache.tiers.length === 0
                  ? t("nonRenseigne")
                  : tache.tiers.map((x) => (
                      <span className="pchip is-indep pchip-tiers" key={x.id}>
                        <span className="dot-ind" aria-hidden="true" />
                        <span>{x.organisation ?? x.contactNom ?? "—"}</span>
                      </span>
                    ))}
                {/* `EX-TRS-02` — le geste existait au serveur depuis L-12 et
                    rien ne l'appelait : on voyait les tiers assignés sans
                    jamais pouvoir en assigner un. `RG-TRS-04` borne la liste
                    aux tiers rattachés au projet parent — c'est le serveur qui
                    la calcule, l'écran ne devine pas. */}
                {peut("third_parties:assign") ? <AssignerTiers tache={tache} /> : null}
              </dd>
            </dl>
          </section>

          <Raci tache={tache} />

          <section className="panel">
            <div className="panel-head">
              <span className="panel-title">{t("fiche.planification")}</span>
            </div>
            <dl className="side-dl">
              <Ligne
                libelle={t("fiche.dates")}
                valeur={
                  tache.dateDebut && tache.dateFin
                    ? t("fiche.deADate", {
                        debut: formaterDate(tache.dateDebut),
                        fin: formaterDate(tache.dateFin),
                      })
                    : tache.dateFin
                      ? formaterDate(tache.dateFin)
                      : null
                }
              />
              {/*
                `EX-TSK-04` — les horaires se SAISISSENT. Ils étaient lus par
                le planning et écrits par rien : deux colonnes mortes en
                écriture, et un créneau de réunion insaisissable.
              */}
              <HorairesEditables
                tache={tache}
                modifiable={modifiable}
                surEnregistrement={(champs) => modifier.mutate({ version: tache.version, ...champs })}
              />
              <Ligne
                libelle={t("fiche.estimation")}
                valeur={
                  tache.estimationHeures
                    ? t("heures", { n: Number(tache.estimationHeures) })
                    : null
                }
              />
              {/* `RG-TMP-07` — le temps déclaré vient du module M12, tous
                  contributeurs confondus, pas de la tâche elle-même. */}
              <Ligne
                libelle={t("fiche.tempsDeclare")}
                valeur={
                  contexteTemps.data
                    ? t("fiche.heuresEtSaisies", {
                        heures: contexteTemps.data.heuresDeclarees,
                        n: contexteTemps.data.entrees,
                      })
                    : null
                }
              />
            </dl>
          </section>

          <section className="panel">
            <div className="panel-head">
              <span className="panel-title">{t("fiche.suivi")}</span>
            </div>
            <dl className="side-dl">
              <Ligne libelle={t("fiche.creeeLe")} valeur={formaterDateLongue(tache.creeLe)} />
              <Ligne libelle={t("fiche.miseAJour")} valeur={formaterDateLongue(tache.modifieLe)} />
              <dt>{t("fiche.confidentielle")}</dt>
              <dd className={tache.confidentielle ? "" : "is-none"}>
                {tache.confidentielle ? t("fiche.oui") : t("fiche.non")}
              </dd>
            </dl>
          </section>
        </div>
      </div>

      <FenetreSuppression
        tache={tache}
        ouverte={suppressionOuverte}
        surFermeture={() => setSuppressionOuverte(false)}
      />
    </div>
  );
}

function Ligne({ libelle, valeur }: { libelle: string; valeur: string | null }) {
  const { t } = useTranslation("taches");
  return (
    <>
      <dt>{libelle}</dt>
      <dd className={valeur ? "" : "is-none"}>{valeur ?? t("nonRenseigne")}</dd>
    </>
  );
}

/**
 * `EX-TSK-15` — **rattacher ou détacher la tâche d'un projet, a posteriori.**
 *
 * « Aucun projet (tâche indépendante) » est une option nommée, exactement comme
 * à la création : `RG-TSK-01` en fait un cas nominal, et le présenter comme un
 * champ qu'on vide dirait le contraire.
 *
 * Le détachement emporte le jalon et l'épopée — c'est le serveur qui le fait
 * (`RG-JAL-04`), pas l'écran : la fiche est simplement rechargée et les montre
 * vides. Le client ne devine pas ce que la règle produit.
 */
function RattachementProjet({
  tache,
  modifiable,
  surChangement,
}: {
  tache: api.FicheTache;
  modifiable: boolean;
  surChangement: (projectId: string | null) => void;
}) {
  const { t } = useTranslation("taches");
  const peut = usePeut();

  /*
   * `RG-GEN-06` — le client masque par courtoisie. Sans `projects:read`, il n'y
   * a aucune liste à proposer : on retombe sur la lecture seule plutôt que sur
   * un menu vide, qui donnerait à croire qu'il n'existe aucun projet.
   */
  const ouvert = modifiable && peut("projects:read");
  const projets = useQuery({
    queryKey: ["projets", {}],
    queryFn: () => apiProjets.portefeuille({}),
    enabled: ouvert,
  });

  if (!ouvert) {
    return <Ligne libelle={t("liste.projet")} valeur={tache.project?.nom ?? null} />;
  }

  const liste = projets.data?.projets ?? [];
  /*
   * Le projet courant peut être hors de la liste rendue — filtre de
   * portefeuille, projet archivé. L'omettre ferait retomber le `select` sur sa
   * première option, et le prochain enregistrement déplacerait la tâche sans
   * que personne ne l'ait demandé.
   */
  const options =
    tache.project && !liste.some((p) => p.id === tache.project?.id)
      ? [{ id: tache.project.id, nom: tache.project.nom }, ...liste]
      : liste;

  return (
    <>
      <dt>
        <label htmlFor="fiche-projet">{t("liste.projet")}</label>
      </dt>
      <dd>
        <select
          className="mini-select"
          id="fiche-projet"
          value={tache.project?.id ?? ""}
          onChange={(e) => surChangement(e.target.value === "" ? null : e.target.value)}
        >
          <option value="">{t("liste.aucunProjet")}</option>
          {options.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nom}
            </option>
          ))}
        </select>
      </dd>
    </>
  );
}

/**
 * `EX-TSK-04` — les horaires, saisissables.
 *
 * L'état local suit les champs et **se resynchronise** quand la tâche change
 * sous lui — même parti pris que le titre : un refus du serveur (horaires
 * incohérents, conflit de version) recharge la fiche, et le champ doit alors
 * revenir à ce que le serveur dit, pas rester sur une valeur refusée.
 *
 * Les deux champs partent ENSEMBLE : le serveur confronte la fin au début déjà
 * en base, et n'envoyer que l'un des deux ferait dépendre le refus de l'ordre
 * dans lequel on quitte les champs.
 */
function HorairesEditables({
  tache,
  modifiable,
  surEnregistrement,
}: {
  tache: api.FicheTache;
  modifiable: boolean;
  surEnregistrement: (champs: { heureDebut: string | null; heureFin: string | null }) => void;
}) {
  const { t } = useTranslation("taches");
  const [debut, setDebut] = useState(tache.heureDebut ?? "");
  const [fin, setFin] = useState(tache.heureFin ?? "");

  useEffect(() => {
    setDebut(tache.heureDebut ?? "");
    setFin(tache.heureFin ?? "");
  }, [tache.heureDebut, tache.heureFin]);

  if (!modifiable) {
    return (
      <Ligne
        libelle={t("fiche.horaires")}
        valeur={
          tache.heureDebut && tache.heureFin
            ? t("fiche.deAHeure", {
                debut: formaterHeure(tache.heureDebut),
                fin: formaterHeure(tache.heureFin),
              })
            : null
        }
      />
    );
  }

  const enregistrer = () => {
    const prochainDebut = debut === "" ? null : debut;
    const prochaineFin = fin === "" ? null : fin;
    if (prochainDebut === (tache.heureDebut ?? null) && prochaineFin === (tache.heureFin ?? null)) {
      return;
    }
    surEnregistrement({ heureDebut: prochainDebut, heureFin: prochaineFin });
  };

  return (
    <>
      <dt>{t("fiche.horaires")}</dt>
      <dd>
        {/*
          L'enregistrement se déclenche quand le focus quitte **le couple**, pas
          chaque champ. Enregistrer à chaque champ posait un défaut réel : le
          premier départ rechargeait la fiche, l'effet de resynchronisation
          remettait le second champ à sa valeur serveur SOUS LA MAIN de
          l'utilisateur, et la moitié de la saisie disparaissait. Une plage
          horaire se saisit à deux valeurs : elle s'enregistre à deux valeurs.
        */}
        <div
          className="day-row"
          onBlur={(e) => {
            if (e.currentTarget.contains(e.relatedTarget)) return;
            enregistrer();
          }}
        >
          <input
            className="mini-select"
            type="time"
            value={debut}
            aria-label={t("liste.heureDebut")}
            onChange={(e) => setDebut(e.target.value)}
          />
          <input
            className="mini-select"
            type="time"
            value={fin}
            aria-label={t("liste.heureFin")}
            onChange={(e) => setFin(e.target.value)}
          />
        </div>
        <p className="field-hint">{t("liste.horairesAide")}</p>
      </dd>
    </>
  );
}

/**
 * Le titre s'édite en place.
 *
 * L'état local suit le champ, mais **se resynchronise** quand la tâche change
 * sous lui — cas d'une modification concurrente rechargée. Sans cela, le champ
 * afficherait indéfiniment une valeur que le serveur a refusée.
 */
function TitreEditable({
  titre,
  modifiable,
  surEnregistrement,
}: {
  titre: string;
  modifiable: boolean;
  surEnregistrement: (titre: string) => void;
}) {
  const { t } = useTranslation("taches");
  const [valeur, setValeur] = useState(titre);
  useEffect(() => setValeur(titre), [titre]);

  if (!modifiable) return <h1 className="task-title">{titre}</h1>;

  return (
    <>
      <h1>
        {/*
          `role="textbox"` est le rôle implicite du champ ; il est écrit parce
          que la maquette édite le titre sur un `contenteditable` qui le porte
          explicitement, et que le repère doit se retrouver à l'identique.
        */}
        <input
          className="task-title"
          role="textbox"
          value={valeur}
          aria-label={t("fiche.titreDeLaTache")}
          onChange={(e) => setValeur(e.target.value)}
          onBlur={() => {
            if (valeur.trim() && valeur !== titre) surEnregistrement(valeur.trim());
            else setValeur(titre);
          }}
        />
      </h1>
      <span className="title-hint">{t("fiche.editerEnPlace")}</span>
    </>
  );
}

/**
 * Les sous-tâches, réordonnables au glisser-déposer.
 *
 * `C6` — le glisser-déposer est doublé de deux boutons « monter » et
 * « descendre ». Ils ne sont pas décoratifs : c'est le seul chemin au clavier,
 * et l'ordre d'une liste de contrôle porte du sens.
 */
function SousTaches({ tache, modifiable }: { tache: api.FicheTache; modifiable: boolean }) {
  const { t } = useTranslation("taches");
  const client = useQueryClient();
  const [nouvelle, setNouvelle] = useState("");
  const [saisie, setSaisie] = useState<string | null>(null);

  const rafraichir = () => void client.invalidateQueries({ queryKey: ["tache", tache.id] });

  const ajout = useMutation({
    mutationFn: () => api.ajouterSousTache(tache.id, nouvelle.trim()),
    onSuccess: () => {
      setNouvelle("");
      rafraichir();
    },
  });
  const bascule = useMutation({
    mutationFn: ({ id, fait }: { id: string; fait: boolean }) => api.basculerSousTache(id, fait),
    onSuccess: rafraichir,
  });
  const retrait = useMutation({
    mutationFn: (id: string) => api.supprimerSousTache(id),
    onSuccess: rafraichir,
  });
  const reordonner = useMutation({
    // `RG-GEN-07` — l'ordre voyage entier, donc la version lue l'accompagne.
    mutationFn: (ids: string[]) => api.reordonnerSousTaches(tache.id, ids, tache.version),
    onSuccess: rafraichir,
  });

  const faites = tache.sousTaches.filter((s) => s.fait).length;

  const deplacer = (index: number, delta: number) => {
    const cible = index + delta;
    if (cible < 0 || cible >= tache.sousTaches.length) return;
    const ids = tache.sousTaches.map((s) => s.id);
    const [enleve] = ids.splice(index, 1);
    ids.splice(cible, 0, enleve!);
    reordonner.mutate(ids);
  };

  return (
    <section className="panel">
      <div className="panel-head">
        <span className="panel-title">{t("fiche.sousTaches")}</span>
        <span className="kcol-n">
          {t("fiche.sousTachesCompte", { faites, total: tache.sousTaches.length })}
        </span>
      </div>

      {tache.sousTaches.length === 0 ? (
        <p className="dep-none sous-taches-vide">{t("fiche.aucuneSousTache")}</p>
      ) : (
        tache.sousTaches.map((s, i) => (
          <div
            key={s.id}
            className={`sub${s.fait ? " is-done" : ""}${saisie === s.id ? " is-drag" : ""}`}
            draggable={modifiable}
            onDragStart={() => setSaisie(s.id)}
            onDragEnd={() => setSaisie(null)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (!saisie || saisie === s.id) return;
              const ids = tache.sousTaches.map((x) => x.id);
              const depuis = ids.indexOf(saisie);
              ids.splice(depuis, 1);
              ids.splice(i, 0, saisie);
              reordonner.mutate(ids);
              setSaisie(null);
            }}
          >
            <span className="sub-grip" aria-hidden="true">
              ⠿
            </span>
            <input
              type="checkbox"
              checked={s.fait}
              disabled={!modifiable}
              aria-label={s.libelle}
              onChange={(e) => bascule.mutate({ id: s.id, fait: e.target.checked })}
            />
            <span className="sub-lab">{s.libelle}</span>
            {modifiable ? (
              <>
                <Button
                  className="sub-del"
                  isDisabled={i === 0}
                  onPress={() => deplacer(i, -1)}
                  aria-label={t("fiche.monter", { libelle: s.libelle })}
                >
                  <span aria-hidden="true">↑</span>
                </Button>
                <Button
                  className="sub-del"
                  isDisabled={i === tache.sousTaches.length - 1}
                  onPress={() => deplacer(i, 1)}
                  aria-label={t("fiche.descendre", { libelle: s.libelle })}
                >
                  <span aria-hidden="true">↓</span>
                </Button>
                <Button
                  className="sub-del"
                  onPress={() => retrait.mutate(s.id)}
                  aria-label={t("fiche.supprimerSousTache", { libelle: s.libelle })}
                >
                  <span aria-hidden="true">×</span>
                </Button>
              </>
            ) : null}
          </div>
        ))
      )}

      {modifiable ? (
        <form
          className="sub-add"
          onSubmit={(e) => {
            e.preventDefault();
            if (nouvelle.trim()) ajout.mutate();
          }}
        >
          <input
            value={nouvelle}
            onChange={(e) => setNouvelle(e.target.value)}
            placeholder={t("fiche.ajouterSousTache")}
            aria-label={t("fiche.ajouterSousTache")}
          />
          <Button className="btn btn-primary" type="submit" isDisabled={!nouvelle.trim()}>
            {t("fiche.ajouter")}
          </Button>
        </form>
      ) : null}
    </section>
  );
}

/** Les dépendances, dans les deux sens. Une tâche supprimée reste visible. */
function Dependances({ tache }: { tache: api.FicheTache }) {
  const { t } = useTranslation("taches");
  const libelle = useLibelle();
  const peut = usePeut();
  const [fenetreOuverte, setFenetreOuverte] = useState(false);

  /*
   * `is-bad` marque la date qui ne tient pas : un prérequis qui finit APRÈS le
   * début de cette tâche. C'est la même information que le bandeau d'alerte,
   * portée là où on la lit — sur la ligne du lien fautif.
   */
  const incoherent = new Set(tache.incoherences.map((x) => x.prerequis.id));

  const colonne = (
    titre: string,
    liens: api.LienDependance[],
    vide: string,
    dateLibelle: (l: api.LienDependance) => string | null,
  ) => (
    <div className="dep-col">
      <p className="eyebrow">
        {titre} ({liens.length})
      </p>
      {liens.length === 0 ? (
        <p className="dep-none">{vide}</p>
      ) : (
        liens.map((l) =>
          /*
           * `RG-SCOPE-04` — un lien vers une tâche que le lecteur ne peut pas
           * voir GARDE SON ENTRÉE, sans son titre. La retirer changerait le
           * compte annoncé — « Dépend de (2) » avec une seule ligne — et
           * laisserait croire à un défaut d'affichage plutôt qu'à un
           * cloisonnement. La maquette 17 traite ce cas : entrée atténuée,
           * en italique, sans lien (`is-gone`).
           */
          l.lisible === false ? (
            <div className="dep-item is-gone" key={l.id}>
              <span className="dep-t">{t("fiche.dependanceMasquee")}</span>
            </div>
          ) : (
            <div className="dep-item" key={l.id}>
              <div className="bloc-etroit">
                <span className="dep-t">{l.titre}</span>
                <span className={`dep-e${incoherent.has(l.id) ? " is-bad" : ""}`}>
                  {libelle(l.statut ?? "", STATUTS_TACHE)}
                  {dateLibelle(l) ? ` · ${dateLibelle(l)}` : ""}
                </span>
              </div>
              <Link to="/taches/$id" params={{ id: l.id }} className="dep-go">
                {t("fiche.voirDetails")}
              </Link>
            </div>
          ),
        )
      )}
    </div>
  );

  return (
    <section className="panel">
      <div className="panel-head">
        <span className="panel-title">{t("fiche.dependances")}</span>
        {/*
          `RG-GEN-06` — le bouton n'existe que pour qui peut agir. Il a vécu
          plusieurs lots DÉSACTIVÉ derrière un motif exact : le serveur posait et
          retirait un lien, mais n'exposait pas la liste des tâches candidates.
          `GET :id/dependances/candidats` la donne désormais, et `PUT
          :id/dependances` enregistre la sélection en un geste.
        */}
        {peut("tasks:manage_dependencies") ? (
          <Button className="chip-btn" onPress={() => setFenetreOuverte(true)}>
            {t("fiche.modifierDependances")}
          </Button>
        ) : null}
      </div>
      <FenetreDependances
        ouverte={fenetreOuverte}
        surFermeture={() => setFenetreOuverte(false)}
        tache={tache}
      />
      <div className="dep-cols">
        {colonne(
          t("fiche.dependDe"),
          tache.dependances.dependDe,
          t("fiche.aucuneDependance"),
          (l) => (l.dateFin ? t("fiche.finLe", { date: formaterDate(l.dateFin) }) : null),
        )}
        {colonne(
          t("fiche.bloque"),
          tache.dependances.bloque,
          t("fiche.aucuneTacheDependante"),
          (l) => (l.dateDebut ? t("fiche.debutLe", { date: formaterDate(l.dateDebut) }) : null),
        )}
      </div>
    </section>
  );
}

/** `EX-TSK-14` — les quatre rôles RACI, chacun avec ses porteurs. */
function Raci({ tache }: { tache: api.FicheTache }) {
  const { t } = useTranslation("taches");
  const libelle = useLibelle();
  const peut = usePeut();
  const client = useQueryClient();

  const retrait = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      api.retirerRaci(tache.id, userId, role),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["tache", tache.id] }),
  });

  return (
    <section className="panel">
      <div className="panel-head">
        <span className="panel-title">{t("fiche.raci")}</span>
        <span className="eyebrow">{t("fiche.responsabilites")}</span>
      </div>
      <div className="raci">
        {ROLES_RACI.map((role) => {
          const porteurs = tache.raci.filter((r) => r.role === role.code);
          return (
            <div className="raci-row" key={role.code}>
              <span className="raci-k">
                <span className={`raci-let raci-let-${role.code}`} aria-hidden="true">
                  {libelle(role.code, ROLES_RACI)[0]}
                </span>
                <span className="raci-n">{libelle(role.code, ROLES_RACI)}</span>
              </span>
              <span className="raci-people">
                {porteurs.length === 0 ? (
                  <span className="raci-none">{t("fiche.personne")}</span>
                ) : (
                  porteurs.map((p) => (
                    <span className="raci-tag" key={p.userId}>
                      <AvatarAgent prenom={p.user.prenom} nom={p.user.nom} />
                      <span>
                        {p.user.prenom} {p.user.nom}
                      </span>
                      {peut("tasks:manage_raci") ? (
                        <Button
                          onPress={() => retrait.mutate({ userId: p.userId, role: role.code })}
                          aria-label={t("fiche.retirerRaci", {
                            qui: `${p.user.prenom} ${p.user.nom}`,
                            role: libelle(role.code, ROLES_RACI),
                          })}
                        >
                          <span aria-hidden="true">×</span>
                        </Button>
                      ) : null}
                    </span>
                  ))
                )}
              </span>
              <span />
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Commentaires({ tache }: { tache: api.FicheTache }) {
  const { t } = useTranslation("taches");
  const peut = usePeut();
  const { session } = useSession();
  const client = useQueryClient();
  const [contenu, setContenu] = useState("");
  const [edite, setEdite] = useState<string | null>(null);
  const [brouillon, setBrouillon] = useState("");

  const rafraichir = () => client.invalidateQueries({ queryKey: ["tache", tache.id] });

  const edition = useMutation({
    mutationFn: (id: string) => api.modifierCommentaire(id, brouillon.trim()),
    onSuccess: () => {
      setEdite(null);
      void rafraichir();
    },
  });

  const retrait = useMutation({
    mutationFn: (id: string) => api.supprimerCommentaire(id),
    onSuccess: () => void rafraichir(),
  });

  /** `undefined` quand le serveur n'a pas rendu la clé — pas quand elle est vide. */
  const fil = tache.commentaires;

  const envoi = useMutation({
    mutationFn: () => api.commenter(tache.id, contenu.trim()),
    onSuccess: () => {
      setContenu("");
      void client.invalidateQueries({ queryKey: ["tache", tache.id] });
    },
  });

  return (
    <section className="panel">
      <div className="panel-head">
        <span className="panel-title">{t("fiche.commentaires")}</span>
        {fil ? <span className="kcol-n">{fil.length}</span> : null}
      </div>

      {/*
        `RG-DROITS-03` — le serveur ne rend PAS la clé `commentaires` à qui
        n'a pas `comments:read`. Absente n'est pas vide : afficher « aucun
        commentaire » mentirait sur l'état de la tâche. L'écran dit donc ce
        qu'il en est, et le geste d'écriture disparaît avec la lecture.
      */}
      {!fil ? (
        <p className="dep-none sous-taches-vide">{t("fiche.filNonAutorise")}</p>
      ) : fil.length === 0 ? (
        <p className="dep-none sous-taches-vide">{t("fiche.aucunCommentaire")}</p>
      ) : (
        fil.map((c) => (
          <article className="cmt" key={c.id}>
            <AvatarAgent prenom={c.auteur.prenom} nom={c.auteur.nom} />
            <div className="bloc-etroit">
              <div className="cmt-head">
                <span className="cmt-who">
                  {c.auteur.prenom} {c.auteur.nom}
                </span>
                <span className="cmt-when">{formaterDateLongue(c.creeLe)}</span>
                {/* `RG-DOC-01` — chacun modifie et supprime SES contributions.
                    La maquette ne révèle `.cmt-acts` que pour l'auteur : le
                    client masque par courtoisie, le refus reste au serveur. */}
                {c.auteur.id === session.id ? (
                  <div className="cmt-acts">
                    {peut("comments:update") ? (
                      <Button
                        className="ms-toggle"
                        onPress={() => {
                          setEdite(c.id);
                          setBrouillon(c.contenu);
                        }}
                      >
                        {t("fiche.modifierCommentaire")}
                      </Button>
                    ) : null}
                    {peut("comments:delete") ? (
                      <Button className="ms-toggle" onPress={() => retrait.mutate(c.id)}>
                        {t("fiche.supprimerCommentaire")}
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
              {edite === c.id ? (
                <div className="cmt-edition">
                  <textarea
                    className="field"
                    aria-label={t("fiche.modifierCommentaire")}
                    value={brouillon}
                    onChange={(e) => setBrouillon(e.target.value)}
                  />
                  <div className="ligne-actions">
                    <Button
                      className="btn btn-primary"
                      isDisabled={!brouillon.trim() || edition.isPending}
                      onPress={() => edition.mutate(c.id)}
                    >
                      {t("fiche.enregistrerCommentaire")}
                    </Button>
                    <Button className="btn btn-secondary" onPress={() => setEdite(null)}>
                      {t("annuler")}
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="cmt-txt">{c.contenu}</p>
              )}
            </div>
          </article>
        ))
      )}

      {fil && peut("comments:create") ? (
        <form
          className="cmt-new"
          onSubmit={(e) => {
            e.preventDefault();
            if (contenu.trim()) envoi.mutate();
          }}
        >
          <AvatarAgent prenom={session.prenom} nom={session.nom} />
          <textarea
            className="field"
            value={contenu}
            onChange={(e) => setContenu(e.target.value)}
            placeholder={t("fiche.ecrireCommentaire")}
            aria-label={t("fiche.ecrireCommentaire")}
          />
          <Button className="btn btn-primary" type="submit" isDisabled={!contenu.trim()}>
            {t("fiche.publier")}
          </Button>
        </form>
      ) : null}
    </section>
  );
}

function Documents({ tache }: { tache: api.FicheTache }) {
  const { t } = useTranslation("taches");
  const { t: tErreurs } = useTranslation("erreurs");
  const peut = usePeut();
  const annoncer = useMessages();
  const client = useQueryClient();
  /** La pièce ouverte en consultation — `EX-DOC-02`. `null` : aucune. */
  const [consulte, setConsulte] = useState<api.FicheTache["documents"][number] | null>(null);

  /*
   * `EX-DOC-01` — la zone de dépôt était **purement décorative** : un
   * paragraphe, sans champ de fichier ni gestionnaire. `POST /documents`
   * existait, gardée par `documents:create`. On téléchargeait sans pouvoir
   * déposer, et la moitié de `EX-TSK-17` — « commenter ET joindre » — n'était
   * pas servie.
   *
   * Le contenu part en base64 : c'est ce que la route attend, et ce qui lui
   * permet de rester une route JSON comme les autres.
   */
  const depot = useMutation({
    mutationFn: async (fichier: File) => {
      const octets = new Uint8Array(await fichier.arrayBuffer());
      let binaire = "";
      for (const octet of octets) binaire += String.fromCharCode(octet);
      return api.televerserDocument({
        nom: fichier.name,
        contenuBase64: btoa(binaire),
        typeMime: fichier.type || "application/octet-stream",
        taskId: tache.id,
      });
    },
    onSuccess: () => {
      annoncer("ok", t("fiche.documentDepose"));
      void client.invalidateQueries({ queryKey: ["tache", tache.id] });
    },
    onError: (e) => annoncer("err", messageErreur(e, tErreurs, t("fiche.echecDepot"))),
  });

  return (
    <section className="panel">
      <div className="panel-head">
        <span className="panel-title">{t("fiche.documents")}</span>
        <span className="kcol-n">{tache.documents.length}</span>
      </div>
      {tache.documents.length === 0 ? (
        <p className="dep-none sous-taches-vide">{t("fiche.aucunDocument")}</p>
      ) : (
        tache.documents.map((d) => (
          <div className="doc" key={d.id}>
            <span className="doc-ic" aria-hidden="true">
              {d.typeMime.split("/").pop()?.slice(0, 3).toUpperCase()}
            </span>
            <div className="bloc-etroit">
              {/*
                `EX-DOC-02` — **le nom du document EST la commande de
                consultation.** La rangée n'a que quatre colonnes ; ajouter un
                bouton « Consulter » en aurait fait une cinquième, alors que
                l'objet à ouvrir est justement celui qu'on nomme.

                `RG-GEN-06` — sans `documents:read`, le nom reste lisible mais
                inerte : on voit qu'une pièce existe, on ne peut pas l'ouvrir.
                Masquer la ligne ferait croire qu'il n'y a rien.
              */}
              {peut("documents:read") ? (
                <Button className="doc-n" onPress={() => setConsulte(d)}>
                  {d.nom}
                </Button>
              ) : (
                <span className="doc-n">{d.nom}</span>
              )}
              <span className="doc-m">
                {t("fiche.tailleEtAuteur", {
                  ko: formaterNombre(d.tailleOctets / 1024),
                  qui: d.auteur ? `${d.auteur.prenom} ${d.auteur.nom}` : "—",
                })}
              </span>
            </div>
            <span className="doc-m">{formaterDate(d.creeLe)}</span>
            {/* `RG-DOC-02` — télécharger est un geste distinct de consulter,
                avec sa permission et sa trace. */}
            {peut("documents:download") ? (
              <a className="dep-go" href={`/api/documents/${d.id}/telecharger`}>
                {t("fiche.telecharger")}
              </a>
            ) : (
              <span />
            )}
          </div>
        ))
      )}
      {/* La zone de dépôt existe même quand la liste est vide : c'est elle qui
          dit ce qu'on peut faire, pas le vide. `RG-GEN-06` — sans le droit de
          déposer, elle disparaît plutôt que de proposer un geste refusé. */}
      {peut("documents:create") ? (
        <label className="doc-dz">
          {depot.isPending ? t("fiche.depotEnCours") : t("fiche.deposerFichier")}
          <input
            type="file"
            className="champ-fichier"
            aria-label={t("fiche.deposerFichier")}
            disabled={depot.isPending}
            onChange={(e) => {
              const fichier = e.target.files?.[0];
              if (fichier) depot.mutate(fichier);
              e.target.value = "";
            }}
          />
        </label>
      ) : null}

      {/*
        La fenêtre reste MONTÉE, fermée : c'est elle qui rend le focus au nom
        du document à la fermeture. La démonter d'un coup ferait repartir le
        clavier en tête de document — le défaut que `Fenetre` existe pour ne
        plus laisser passer.
      */}
      <FenetreDocument
        document={consulte}
        tacheId={tache.id}
        surFermeture={() => setConsulte(null)}
      />
    </section>
  );
}

/**
 * `EX-DOC-02` — **consulter, renommer, supprimer** un document.
 *
 * Trois des quatre verbes de l'exigence vivaient sans écran : `GET`, `PATCH`
 * et `DELETE /documents/:id` existaient, gardées et testées, et rien ne les
 * appelait. Seul `télécharger` était servi. Le verbe du milieu, encore.
 *
 * **Pourquoi une fenêtre plutôt qu'un `×` sur la rangée.** `RG-DOC-01` — « un
 * utilisateur modifie et supprime ses propres contributions ; agir sur celles
 * d'autrui exige une permission dédiée. » Le motif est celui des commentaires,
 * juste au-dessus : le client masque par courtoisie, le refus reste au serveur.
 * Mais la fiche tâche ne rend PAS l'identifiant de l'auteur d'un document —
 * `auteur: { prenom, nom }`, sans `id`. Il n'existe donc aucun moyen, à
 * l'affichage de la liste, de savoir de qui est la pièce. `GET /documents/:id`
 * le donne, et il est de toute façon le geste « consulter » de `EX-DOC-02`,
 * tracé distinctement du téléchargement (`RG-DOC-02`).
 *
 * L'ordre est donc celui de la règle et non celui de la commodité : on consulte
 * — ce qui laisse une trace, comme il se doit —, et c'est la consultation qui
 * dit ce qu'on a le droit de faire ensuite.
 */
function FenetreDocument({
  document,
  tacheId,
  surFermeture,
}: {
  /** `null` quand aucune pièce n'est ouverte : la fenêtre reste montée, fermée. */
  document: api.FicheTache["documents"][number] | null;
  tacheId: string;
  surFermeture: () => void;
}) {
  const { t } = useTranslation("taches");
  const { t: tErreurs } = useTranslation("erreurs");
  const peut = usePeut();
  const { session } = useSession();
  const annoncer = useMessages();
  const client = useQueryClient();

  const [nom, setNom] = useState("");
  const [pour, setPour] = useState<string | null>(null);
  if (document && pour !== document.id) {
    setPour(document.id);
    setNom(document.nom);
  }

  const detail = useQuery({
    queryKey: ["document", document?.id],
    queryFn: () => api.consulterDocument(document!.id),
    enabled: document !== null,
  });

  const rafraichir = () => {
    void client.invalidateQueries({ queryKey: ["tache", tacheId] });
    void client.invalidateQueries({ queryKey: ["document", document?.id] });
  };

  const renommage = useMutation({
    mutationFn: () => api.renommerDocument(document!.id, nom.trim()),
    onSuccess: () => {
      annoncer("ok", t("fiche.documentRenomme"));
      rafraichir();
      surFermeture();
    },
    onError: (e) => annoncer("err", messageErreur(e, tErreurs, t("fiche.echecRenommage"))),
  });

  const suppression = useMutation({
    mutationFn: () => api.supprimerDocument(document!.id),
    onSuccess: () => {
      annoncer("ok", t("fiche.documentSupprime"));
      rafraichir();
      surFermeture();
    },
    onError: (e) =>
      annoncer("err", messageErreur(e, tErreurs, t("fiche.echecSuppressionDocument"))),
  });

  /*
   * `RG-DOC-01` — la sienne, ou la permission dédiée. Tant que la consultation
   * n'a pas répondu, on ne sait pas : on ne propose rien plutôt que de proposer
   * puis de retirer.
   */
  const sien = detail.data ? detail.data.auteurId === session.id : false;
  const dAutrui = detail.data ? !sien : true;
  const surSesContributions = sien || peut("documents:manage_any");
  const renommable = peut("documents:update") && surSesContributions;
  const supprimable = peut("documents:delete") && surSesContributions;

  return (
    <Fenetre
      ouverte={document !== null}
      surFermeture={surFermeture}
      categorie={t("fiche.document")}
      titre={document?.nom ?? ""}
      mention={supprimable ? t("fiche.actionIrreversible") : t("fiche.accesTrace")}
      actions={
        <>
          {supprimable ? (
            <Button
              className="btn btn-danger"
              isPending={suppression.isPending}
              onPress={() => suppression.mutate()}
            >
              {t("fiche.supprimerDocument")}
            </Button>
          ) : null}
          <Button className="btn btn-secondary" onPress={surFermeture}>
            {t("annuler")}
          </Button>
          {renommable ? (
            <Button
              className="btn btn-primary"
              isDisabled={!nom.trim() || nom.trim() === detail.data?.nom || renommage.isPending}
              onPress={() => renommage.mutate()}
            >
              {t("fiche.renommerDocument")}
            </Button>
          ) : null}
        </>
      }
    >
      {detail.isPending ? (
        <Chargement quoi={t("fiche.leDocument")} />
      ) : detail.isError ? (
        <ErreurDeChargement erreur={detail.error} surReessai={() => void detail.refetch()} />
      ) : (
        <>
          <dl className="side-dl">
            <dt>{t("fiche.typeDeFichier")}</dt>
            <dd>{detail.data.typeMime}</dd>
            <dt>{t("fiche.taille")}</dt>
            <dd>{t("fiche.enKo", { ko: formaterNombre(detail.data.tailleOctets / 1024) })}</dd>
            <dt>{t("fiche.deposePar")}</dt>
            <dd>
              {document?.auteur ? `${document.auteur.prenom} ${document.auteur.nom}` : "—"}
            </dd>
            <dt>{t("fiche.deposeLe")}</dt>
            <dd>{formaterDateLongue(detail.data.creeLe)}</dd>
            {/* `C14` — le contenu est adressé par empreinte, jamais par nom
                d'origine. La montrer permet de vérifier qu'un renommage n'a
                pas changé le fichier : c'est précisément ce que dit la règle. */}
            <dt>{t("fiche.empreinte")}</dt>
            <dd className="doc-m">{detail.data.empreinte}</dd>
          </dl>

          {renommable ? (
            <div className="field-block">
              <label className="field-label" htmlFor={`doc-nom-${detail.data.id}`}>
                {t("fiche.nomDuDocument")}
              </label>
              <input
                id={`doc-nom-${detail.data.id}`}
                className="field"
                value={nom}
                onChange={(e) => setNom(e.target.value)}
              />
            </div>
          ) : (
            /*
              `RG-GEN-06` — on dit POURQUOI la commande n'est pas là. Sans
              cette phrase, une fiche sans champ de renommage ressemble à une
              fonction manquante, pas à un droit qu'on n'a pas.
            */
            <p className="dep-none">
              {dAutrui ? t("fiche.documentDAutrui") : t("fiche.documentNonModifiable")}
            </p>
          )}
        </>
      )}
    </Fenetre>
  );
}

/**
 * `RG-TSK-07` — supprimer une tâche dont d'autres dépendent est **refusé**.
 *
 * La fenêtre l'annonce avant le geste, en nommant les tâches concernées :
 * un refus qui arrive après le clic force à deviner ce qui bloque.
 */
function FenetreSuppression({
  tache,
  ouverte,
  surFermeture,
}: {
  tache: api.FicheTache;
  ouverte: boolean;
  surFermeture: () => void;
}) {
  const { t } = useTranslation("taches");
  const { t: tErreurs } = useTranslation("erreurs");
  const annoncer = useMessages();

  const bloquee = tache.dependances.bloque.length > 0;

  const suppression = useMutation({
    mutationFn: () => api.supprimer(tache.id),
    onSuccess: () => {
      annoncer("ok", t("fiche.supprimee"));
      window.location.assign("/taches");
    },
    onError: (e) => annoncer("err", messageErreur(e, tErreurs, t("fiche.echecEnregistrement"))),
  });

  return (
    <Fenetre
      ouverte={ouverte}
      surFermeture={surFermeture}
      categorie={t("confirmation")}
      titre={t("fiche.supprimerLaTache")}
      mention={bloquee ? t("fiche.retirerLesDependances") : t("fiche.actionIrreversible")}
      actions={
        <>
          <Button className="btn btn-secondary" onPress={surFermeture}>
            {t("annuler")}
          </Button>
          {bloquee ? null : (
            <Button
              className="btn btn-danger"
              isPending={suppression.isPending}
              onPress={() => suppression.mutate()}
            >
              {t("fiche.supprimerLaTache")}
            </Button>
          )}
        </>
      }
    >
      {bloquee ? (
        <>
          <div className="alert alert-error" role="alert">
            <span className="alert-icon" aria-hidden="true">
              !
            </span>
            <span>{t("fiche.suppressionBloquee")}</span>
          </div>
          <ul className="err-liste">
            {tache.dependances.bloque.map((b) => (
              <li key={b.id}>{b.titre}</li>
            ))}
          </ul>
        </>
      ) : (
        <p className="phrase-confirmation">
          {t("fiche.confirmerSuppression")} <span className="quoted">« {tache.titre} »</span> ?
        </p>
      )}
    </Fenetre>
  );
}

/**
 * `EX-TSK-05` — fixer la liste des assignés d'une tâche existante.
 *
 * `RG-TSK-15` commande la source des candidats : **en priorité les membres du
 * projet ; si le projet n'a pas de membre, tous les utilisateurs**, et
 * l'interface le dit. Hors projet, ce sont tous les utilisateurs — c'est le cas
 * qui ne fonctionnait pas, faute d'assignation possible sur une tâche
 * indépendante.
 *
 * La liste part **entière** : `PUT /taches/:id/assignes` remplace, il n'ajoute
 * pas. Deux écrans qui ajoutent et retirent en même temps laisseraient sinon
 * un état que personne n'a voulu.
 */
function FenetreAssignes({
  ouverte,
  surFermeture,
  tacheId,
  version,
  projectId,
  actuels,
}: {
  ouverte: boolean;
  surFermeture: () => void;
  tacheId: string;
  /** `RG-GEN-07` — la liste part ENTIÈRE, donc la version lue l'accompagne. */
  version: number;
  projectId: string | null;
  actuels: string[];
}) {
  const { t } = useTranslation("taches");
  const { t: tErreurs } = useTranslation("erreurs");
  const annoncer = useMessages();
  const client = useQueryClient();

  const [choisis, setChoisis] = useState<string[]>(actuels);
  const [pour, setPour] = useState<string | null>(null);
  const cle = `${tacheId}:${actuels.join(",")}`;
  if (ouverte && pour !== cle) {
    setPour(cle);
    setChoisis(actuels);
  }

  const equipe = useQuery({
    queryKey: ["projet", projectId, "equipe"],
    queryFn: () =>
      appeler<{ agents: { userId: string; utilisateur: { prenom: string; nom: string } }[] }>(
        `/projets/${projectId}/equipe`,
      ),
    enabled: ouverte && Boolean(projectId),
  });

  const tous = useQuery({
    queryKey: ["utilisateurs", "tous"],
    // `GET /utilisateurs` rend un TABLEAU. La forme `{ utilisateurs: [...] }`
    // était une invention du client, et elle rendait ce repli inopérant.
    queryFn: () => appeler<{ id: string; prenom: string; nom: string }[]>("/utilisateurs"),
    enabled: ouverte,
  });

  const membres = (equipe.data?.agents ?? []).map((a) => ({
    id: a.userId,
    prenom: a.utilisateur.prenom,
    nom: a.utilisateur.nom,
  }));
  const projetSansMembre = Boolean(projectId) && equipe.isSuccess && membres.length === 0;
  const candidats = projectId && !projetSansMembre ? membres : (tous.data ?? []);

  const enregistrer = useMutation({
    mutationFn: () => api.definirAssignes(tacheId, choisis, version),
    onSuccess: () => {
      annoncer("ok", t("fiche.assignesEnregistres"));
      surFermeture();
      void client.invalidateQueries({ queryKey: ["tache", tacheId] });
      void client.invalidateQueries({ queryKey: ["taches"] });
    },
    onError: (e) => annoncer("err", messageErreur(e, tErreurs, t("fiche.echecAssignes"))),
  });

  return (
    <Fenetre
      ouverte={ouverte}
      surFermeture={surFermeture}
      categorie={t("liste.colAssignes")}
      titre={t("fiche.ajouterAssigne")}
      actions={
        <>
          <Button className="btn btn-secondary" onPress={surFermeture}>
            {t("annuler")}
          </Button>
          <Button
            className="btn btn-primary"
            isPending={enregistrer.isPending}
            onPress={() => enregistrer.mutate()}
          >
            {t("fiche.enregistrerAssignes")}
          </Button>
        </>
      }
    >
      <div className="pickbox" role="group" aria-label={t("liste.assignes")}>
        <p className={`pick-hint${projetSansMembre ? " is-warn" : ""}`}>
          {projectId
            ? projetSansMembre
              ? t("liste.projetSansMembre")
              : t("liste.membresDuProjet")
            : t("liste.tousLesUtilisateurs")}
        </p>
        {candidats.map((u) => (
          <label className="pick-item" key={u.id}>
            <input
              type="checkbox"
              checked={choisis.includes(u.id)}
              onChange={(e) =>
                setChoisis((s) => (e.target.checked ? [...s, u.id] : s.filter((x) => x !== u.id)))
              }
            />
            <span>
              {u.prenom} {u.nom}
            </span>
          </label>
        ))}
      </div>
      {/* Le premier de la liste est le porteur : le dire évite de découvrir la
          règle en constatant un porteur qu'on n'a pas choisi. */}
      <p className="field-hint">{t("fiche.premierEstPorteur")}</p>
    </Fenetre>
  );
}

/**
 * `EX-TSK-10` — **la fenêtre de sélection des dépendances**, vue 17.
 *
 * La maquette (17, l. 1891-1923) enregistre un ENSEMBLE : `saveDeps` pose la
 * sélection entière, jamais un ajout ni un retrait isolé. Le client reprend ce
 * geste tel quel — `PUT /taches/:id/dependances` — et non deux appels par
 * différence, qui laisseraient un état intermédiaire si le second échouait.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * **La liste vient de DEUX sources, et c'est délibéré.**
 *
 * `GET :id/dependances/candidats` rend ce qui est POSABLE : il exclut en amont
 * les cinq refus du serveur, y compris les prérequis déjà en place. Les lignes
 * déjà cochées viennent donc de la fiche (`dependances.dependDe`) — sans elles,
 * on ne pourrait plus rien décocher.
 *
 * Un prérequis que le lecteur ne peut pas nommer (`RG-SCOPE-04`, `lisible:
 * false`) n'apparaît dans aucune des deux : il n'est pas proposé, et le serveur
 * ne le retire pas non plus quand la sélection l'ignore. Une case à cocher sans
 * nom n'est pas un choix, et supprimer en silence ce qu'on n'a pas montré
 * serait pire.
 * ──────────────────────────────────────────────────────────────────────────
 */
function FenetreDependances({
  ouverte,
  surFermeture,
  tache,
}: {
  ouverte: boolean;
  surFermeture: () => void;
  tache: api.FicheTache;
}) {
  const { t } = useTranslation("taches");
  const { t: tErreurs } = useTranslation("erreurs");
  const libelle = useLibelle();
  const annoncer = useMessages();
  const client = useQueryClient();

  /**
   * Les prérequis actuels que le lecteur peut nommer — les lignes pré-cochées.
   *
   * `!== false` et non `=== true` : c'est la lecture qu'emploie déjà le panneau
   * `Dependances` juste au-dessus. Deux lectures du même champ dans le même
   * fichier finiraient par diverger.
   */
  const actuels = tache.dependances.dependDe.filter((l) => l.lisible !== false);

  const [choisis, setChoisis] = useState<string[]>(() => actuels.map((l) => l.id));
  const [recherche, setRecherche] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);

  /*
   * La sélection se réamorce à chaque OUVERTURE, pas à chaque rendu : rouvrir
   * la fenêtre après un abandon doit repartir de l'état enregistré, et non de
   * ce qui avait été coché puis annulé.
   */
  const cle = `${tache.id}:${tache.version}:${actuels.map((l) => l.id).join(",")}`;
  const [pour, setPour] = useState<string | null>(null);
  if (ouverte && pour !== cle) {
    setPour(cle);
    setChoisis(actuels.map((l) => l.id));
    setRecherche("");
    setErreur(null);
  }

  const candidats = useQuery({
    queryKey: ["tache", tache.id, "candidats"],
    queryFn: () => api.candidatsDependance(tache.id),
    enabled: ouverte,
  });

  /*
   * `EX-TSK-12` — les incohérences sont RELUES à l'ouverture. La fiche en porte
   * déjà une copie, mais elle date de son chargement : une fenêtre ouverte dix
   * minutes plus tard marquerait `.dep-warn` sur un état périmé.
   */
  const incoherences = useQuery({
    queryKey: ["tache", tache.id, "incoherences"],
    queryFn: () => api.incoherences(tache.id),
    enabled: ouverte,
  });

  const enConflit = new Set((incoherences.data ?? []).map((x) => x.prerequis.id));

  /** Les deux sources fondues en une liste unique, dans l'ordre de la maquette. */
  const lignes = [
    ...actuels.map((l) => ({
      id: l.id,
      titre: l.titre ?? "",
      statut: l.statut ?? "",
      dateFin: l.dateFin ?? null,
      conflit: enConflit.has(l.id),
    })),
    ...(candidats.data ?? []),
  ];

  const filtrees = lignes.filter((l) =>
    l.titre.toLowerCase().includes(recherche.trim().toLowerCase()),
  );

  const conflits = filtrees.filter((l) => choisis.includes(l.id) && l.conflit).length;

  const enregistrer = useMutation({
    mutationFn: () => api.definirDependances(tache.id, tache.version, choisis),
    onSuccess: () => {
      annoncer("ok", t("fiche.dependancesEnregistrees"));
      surFermeture();
      void client.invalidateQueries({ queryKey: ["tache", tache.id] });
    },
    onError: (e) => {
      /*
       * `cadrage/02:566` — le texte du bandeau est celui du brief, à la lettre.
       * Il ne se déclenche en pratique que sur une course : le serveur écarte
       * les candidats cycliques de la liste, donc seul un lien posé ailleurs
       * entre le chargement et l'enregistrement peut refermer une boucle.
       */
      const circulaire =
        e instanceof ErreurApi && e.cle === "erreurs:dependanceCirculaire";
      setErreur(
        circulaire
          ? t("fiche.dependanceCirculaire")
          : messageErreur(e, tErreurs, t("fiche.echecDependances")),
      );
    },
  });

  const basculer = (id: string, coche: boolean) => {
    setErreur(null);
    setChoisis((s) => (coche ? [...s, id] : s.filter((x) => x !== id)));
  };

  return (
    <Fenetre
      ouverte={ouverte}
      surFermeture={surFermeture}
      categorie={t("fiche.dependances")}
      titre={tache.titre}
      mention={
        conflits > 0
          ? t("fiche.dependancesConflits", { n: choisis.length, c: conflits })
          : t("fiche.dependancesSelection", { n: choisis.length })
      }
      actions={
        <>
          <Button className="btn btn-secondary" onPress={surFermeture}>
            {t("annuler")}
          </Button>
          <Button
            className="btn btn-primary"
            isPending={enregistrer.isPending}
            onPress={() => enregistrer.mutate()}
          >
            {t("fiche.enregistrerDependances")}
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

      <p className="field-hint">{t("fiche.dependancesIndice")}</p>

      <input
        className="f-input recherche-dependances"
        type="search"
        value={recherche}
        aria-label={t("fiche.rechercherTache")}
        placeholder={t("fiche.rechercherTache")}
        onChange={(e) => setRecherche(e.target.value)}
      />

      <div className="dep-list" role="group" aria-label={t("fiche.listeDesCandidats")}>
        {candidats.isPending ? (
          <p className="ilib-none">{t("fiche.chargementCandidats")}</p>
        ) : filtrees.length === 0 ? (
          /*
           * `cadrage/02:571` — DEUX états vides, pas un. « Aucune tâche
           * disponible » dit qu'il n'y a rien à lier ; « Aucune tâche trouvée »
           * dit que la recherche est trop étroite. Les confondre laisserait
           * croire à un projet vide devant une faute de frappe.
           */
          <p className="ilib-none">
            {recherche.trim() ? t("fiche.aucuneTacheTrouvee") : t("fiche.aucuneTacheDisponible")}
          </p>
        ) : (
          filtrees.map((l) => (
            <label className="dep" key={l.id}>
              <input
                type="checkbox"
                checked={choisis.includes(l.id)}
                onChange={(e) => basculer(l.id, e.target.checked)}
              />
              <div className="bloc-etroit">
                <span className="dep-name">{l.titre}</span>
                <span className="dep-sub">
                  {l.dateFin
                    ? t("fiche.statutEtFin", {
                        statut: libelle(l.statut, STATUTS_TACHE),
                        date: formaterDate(l.dateFin),
                      })
                    : t("fiche.statutSansFin", { statut: libelle(l.statut, STATUTS_TACHE) })}
                </span>
              </div>
              {choisis.includes(l.id) && l.conflit ? (
                <span className="dep-warn">{t("fiche.conflitDeDates")}</span>
              ) : null}
            </label>
          ))
        )}
      </div>
    </Fenetre>
  );
}

/**
 * `EX-TRS-02`, `RG-TRS-04` — assigner un tiers à la tâche.
 *
 * La liste des candidats vient de `GET /tiers/taches/:id/candidats`, qui
 * applique en amont les trois refus que l'écriture applique en aval : archivé,
 * non rattaché au projet parent, déjà assigné. Sans elle, l'écran proposerait ce
 * que le serveur refuse — c'est le manque que L-45 avait comblé pour les
 * dépendances, et le dernier de cette famille.
 */
function AssignerTiers({ tache }: { tache: api.FicheTache }) {
  const { t } = useTranslation("taches");
  const { t: tErreurs } = useTranslation("erreurs");
  const annoncer = useMessages();
  const client = useQueryClient();
  const [ouvert, setOuvert] = useState(false);

  const candidats = useQuery({
    queryKey: ["tiers", "candidats", tache.id],
    queryFn: () => apiReferentiels.candidatsTiersPourTache(tache.id),
    enabled: ouvert,
  });

  const assignation = useMutation({
    mutationFn: (id: string) => apiReferentiels.assignerTiersATache(tache.id, id),
    onSuccess: () => {
      annoncer("ok", t("fiche.tiersAssigne"));
      setOuvert(false);
      void client.invalidateQueries({ queryKey: ["tache", tache.id] });
    },
    onError: (e) => annoncer("err", messageErreur(e, tErreurs, t("fiche.echecAssignationTiers"))),
  });

  const liste = candidats.data ?? [];

  return (
    <>
      <Button className="chip-btn" onPress={() => setOuvert(true)}>
        {t("fiche.assignerTiers")}
      </Button>
      <Fenetre
        ouverte={ouvert}
        surFermeture={() => setOuvert(false)}
        categorie={t("fiche.tiersAssignes")}
        titre={t("fiche.assignerTiers")}
        actions={
          <Button className="btn btn-secondary" onPress={() => setOuvert(false)}>
            {t("annuler")}
          </Button>
        }
      >
        {candidats.isPending ? (
          <Chargement quoi={t("fiche.lesTiers")} />
        ) : liste.length === 0 ? (
          <div className="empty">
            {/* Deux vides distincts : hors projet, tout tiers actif est
                candidat ; dans un projet, seuls ses tiers rattachés le sont. */}
            <p>{tache.project ? t("fiche.aucunTiersDuProjet") : t("fiche.aucunTiers")}</p>
          </div>
        ) : (
          <div className="pickbox" role="group" aria-label={t("fiche.assignerTiers")}>
            {liste.map((x) => (
              <Button
                key={x.id}
                className="pop-action"
                isDisabled={assignation.isPending}
                onPress={() => assignation.mutate(x.id)}
              >
                {x.organisation ?? x.contactNom ?? "—"}
              </Button>
            ))}
          </div>
        )}
      </Fenetre>
    </>
  );
}

/**
 * `EX-TSK-07` — le formulaire complet de modification d'une tâche.
 *
 * **Ce qu'il répare.** Le bouton « Modifier » a vécu plusieurs lots désactivé,
 * derrière un motif qui disait vrai — `PATCH /taches/:id` existe, c'est le
 * formulaire qui manquait — et qui n'en laissait pas moins quatre champs
 * joignables par aucun chemin : les dates, l'estimation, le jalon et la
 * confidentialité. La fiche édite le reste en place.
 *
 * `RG-SCOPE-04` mérite un mot : la confidentialité se change **après coup**.
 * Le serveur l'accepte depuis L-38, le client ne l'envoyait pas — une tâche
 * marquée par erreur restait donc invisible pour toujours à qui n'a pas la
 * permission de lecture confidentielle, y compris à celui qui l'avait marquée.
 *
 * `RG-JAL-03` : le jalon proposé est celui **du projet de la tâche**, et une
 * tâche hors projet n'en propose aucun (`RG-JAL-04`). Le sélecteur ne montre
 * donc jamais un choix que le serveur refuserait.
 */
function FenetreModification({
  ouverte,
  surFermeture,
  tache,
}: {
  ouverte: boolean;
  surFermeture: () => void;
  tache: api.FicheTache;
}) {
  const { t } = useTranslation("taches");
  const { t: tErreurs } = useTranslation("erreurs");
  const annoncer = useMessages();
  const client = useQueryClient();

  const [description, setDescription] = useState(tache.description ?? "");
  const [priorite, setPriorite] = useState(tache.priorite);
  const [debut, setDebut] = useState(tache.dateDebut?.slice(0, 10) ?? "");
  const [fin, setFin] = useState(tache.dateFin?.slice(0, 10) ?? "");
  const [estimation, setEstimation] = useState(tache.estimationHeures ?? "");
  const [jalon, setJalon] = useState(tache.milestone?.id ?? "");
  const [confidentielle, setConfidentielle] = useState(tache.confidentielle);
  const [datesInversees, setDatesInversees] = useState(false);

  /*
   * Les champs se réamorcent sur la tâche à CHAQUE ouverture. Sans cela, une
   * fenêtre rouverte après un enregistrement montrerait l'état d'avant, et
   * l'enregistrer une seconde fois écraserait ce qu'on venait d'écrire.
   */
  const [pour, setPour] = useState<string | null>(null);
  const cle = `${tache.id}:${tache.version}`;
  if (ouverte && pour !== cle) {
    setPour(cle);
    setDescription(tache.description ?? "");
    setPriorite(tache.priorite);
    setDebut(tache.dateDebut?.slice(0, 10) ?? "");
    setFin(tache.dateFin?.slice(0, 10) ?? "");
    setEstimation(tache.estimationHeures ?? "");
    setJalon(tache.milestone?.id ?? "");
    setConfidentielle(tache.confidentielle);
    setDatesInversees(false);
  }

  // `RG-JAL-04` — une tâche hors projet ne se rattache à aucun jalon : on ne
  // demande même pas la feuille de route.
  const route = useQuery({
    queryKey: ["projet", tache.project?.id, "route"],
    queryFn: () => apiProjets.feuilleDeRoute(tache.project!.id),
    enabled: ouverte && Boolean(tache.project),
  });

  const enregistrement = useMutation({
    mutationFn: () =>
      api.modifier(tache.id, {
        version: tache.version,
        description: description.trim() || null,
        priorite,
        // Vider une date la RETIRE : l'absence de date est un état, pas une
        // omission à ignorer.
        dateDebut: debut || null,
        dateFin: fin || null,
        // `Number("")` vaut zéro : le filtre porte sur la chaîne, jamais sur
        // sa conversion.
        estimationHeures: String(estimation).trim() === "" ? null : Number(estimation),
        ...(tache.project ? { milestoneId: jalon || null } : {}),
        confidentielle,
      }),
    onSuccess: () => {
      annoncer("ok", t("fiche.modifiee"));
      surFermeture();
      void client.invalidateQueries({ queryKey: ["tache", tache.id] });
      void client.invalidateQueries({ queryKey: ["taches"] });
    },
    onError: (e) => annoncer("err", messageErreur(e, tErreurs, t("fiche.echecEnregistrement"))),
  });

  const valider = () => {
    // Le refus se prononce ici plutôt qu'après l'aller-retour : la règle est
    // la même des deux côtés, et l'utilisateur n'a pas à attendre pour
    // l'apprendre. Le serveur la tient quand même.
    const inversees = Boolean(debut && fin && fin < debut);
    setDatesInversees(inversees);
    if (!inversees) enregistrement.mutate();
  };

  return (
    <Fenetre
      ouverte={ouverte}
      surFermeture={surFermeture}
      categorie={t("fiche.categorie")}
      titre={t("fiche.modifierTitre")}
      actions={
        <>
          <Button className="btn btn-secondary" onPress={surFermeture}>
            {t("annuler")}
          </Button>
          <Button
            className="btn btn-primary"
            isPending={enregistrement.isPending}
            onPress={valider}
          >
            {t("enregistrer")}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          valider();
        }}
        noValidate
      >
        <div className="field-block">
          <label className="field-label" htmlFor="tm-desc">
            {t("fiche.description")}
          </label>
          <textarea
            className="field"
            id="tm-desc"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="form-grid">
          <div className="field-block">
            <label className="field-label" htmlFor="tm-prio">
              {t("fiche.priorite")}
            </label>
            <select
              className="field"
              id="tm-prio"
              value={priorite}
              onChange={(e) => setPriorite(e.target.value)}
            >
              {PRIORITES.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.fr}
                </option>
              ))}
            </select>
          </div>

          <div className="field-block">
            <label className="field-label" htmlFor="tm-est">
              {t("fiche.estimation")}
            </label>
            <input
              className="field"
              id="tm-est"
              type="number"
              min={0}
              step="0.5"
              value={estimation}
              onChange={(e) => setEstimation(e.target.value)}
            />
          </div>

          <div className="field-block">
            <label className="field-label" htmlFor="tm-debut">
              {t("fiche.dateDebut")}
            </label>
            <input
              className="field"
              id="tm-debut"
              type="date"
              value={debut}
              aria-invalid={datesInversees}
              onChange={(e) => setDebut(e.target.value)}
            />
          </div>

          <div className="field-block">
            <label className="field-label" htmlFor="tm-fin">
              {t("fiche.dateFin")}
            </label>
            <input
              className="field"
              id="tm-fin"
              type="date"
              value={fin}
              aria-invalid={datesInversees}
              onChange={(e) => setFin(e.target.value)}
            />
            <p className={`field-error${datesInversees ? "" : " is-quiet"}`}>
              <span aria-hidden="true">↑</span>
              <span>{t("fiche.datesInversees")}</span>
            </p>
          </div>
        </div>

        {tache.project ? (
          <div className="field-block">
            <label className="field-label" htmlFor="tm-jalon">
              {t("fiche.jalon")}
            </label>
            <select
              className="field"
              id="tm-jalon"
              value={jalon}
              onChange={(e) => setJalon(e.target.value)}
            >
              <option value="">{t("fiche.aucunJalon")}</option>
              {(route.data?.jalons ?? []).map((j) => (
                <option key={j.id} value={j.id}>
                  {j.nom}
                </option>
              ))}
            </select>
            <p className="field-hint">{t("fiche.jalonDuProjet")}</p>
          </div>
        ) : null}

        <div className="field-block">
          <label className="check">
            <input
              type="checkbox"
              checked={confidentielle}
              onChange={(e) => setConfidentielle(e.target.checked)}
            />
            <span>{t("fiche.confidentielle")}</span>
          </label>
          <p className="field-hint">{t("fiche.confidentielleAide")}</p>
        </div>
      </form>
    </Fenetre>
  );
}
