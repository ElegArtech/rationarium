import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button } from "react-aria-components";
import { STATUTS_TACHE, PRIORITES, ROLES_RACI } from "@rationarium/contracts";
import * as api from "../../api/taches.js";
import * as apiTemps from "../../api/occupations.js";
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
            « Modifier » ouvre, dans la maquette, un formulaire complet de
            tâche. Le serveur sait modifier (`PATCH /taches/:id`) et la fiche
            édite déjà en place titre, statut et avancement ; le formulaire
            complet — dates, estimation, jalon, confidentialité — reste à
            porter. Question remontée.
          */}
          {modifiable ? (
            <Button className="chip-btn" isDisabled aria-description={t("fiche.modifierIndisponible")}>
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

      <FenetreAssignes
        ouverte={assignesOuvert}
        surFermeture={() => setAssignesOuvert(false)}
        tacheId={tacheId}
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
              <Ligne libelle={t("liste.projet")} valeur={tache.project?.nom ?? null} />
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
    mutationFn: (ids: string[]) => api.reordonnerSousTaches(tache.id, ids),
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
        <span className="kcol-n">{tache.commentaires.length}</span>
      </div>

      {tache.commentaires.length === 0 ? (
        <p className="dep-none sous-taches-vide">{t("fiche.aucunCommentaire")}</p>
      ) : (
        tache.commentaires.map((c) => (
          <article className="cmt" key={c.id}>
            <AvatarAgent prenom={c.auteur.prenom} nom={c.auteur.nom} />
            <div className="bloc-etroit">
              <div className="cmt-head">
                <span className="cmt-who">
                  {c.auteur.prenom} {c.auteur.nom}
                </span>
                <span className="cmt-when">{formaterDateLongue(c.creeLe)}</span>
              </div>
              <p className="cmt-txt">{c.contenu}</p>
            </div>
          </article>
        ))
      )}

      {peut("comments:create") ? (
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
  const peut = usePeut();

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
              <span className="doc-n">{d.nom}</span>
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
          dit ce qu'on peut faire, pas le vide. */}
      <p className="doc-dz">{t("fiche.deposerFichier")}</p>
    </section>
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
  projectId,
  actuels,
}: {
  ouverte: boolean;
  surFermeture: () => void;
  tacheId: string;
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
    mutationFn: () => api.definirAssignes(tacheId, choisis),
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
