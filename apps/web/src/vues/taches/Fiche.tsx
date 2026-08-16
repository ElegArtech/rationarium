import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button } from "react-aria-components";
import { STATUTS_TACHE, PRIORITES, ROLES_RACI } from "@trame/contracts";
import * as api from "../../api/taches.js";
import { messageErreur } from "../../api/erreurs.js";
import { usePeut, useSession } from "../../session/session.js";
import { Chargement, ErreurDeChargement } from "../../composants/etats.js";
import { Fenetre } from "../../composants/fenetre.js";
import { useMessages } from "../../composants/messages.js";
import { Pastille, AvatarAgent, useLibelle } from "../../composants/pastilles.js";
import { formaterDate, formaterDateLongue, formaterNombre } from "../../formats.js";
import "../../composants/partages.css";
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

  const requete = useQuery({ queryKey: ["tache", tacheId], queryFn: () => api.fiche(tacheId) });
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
  const incoherentes = Array.isArray(tache.incoherences)
    ? tache.incoherences
    : (tache.incoherences.taches ?? []);

  return (
    <div className="page">
      <Link to="/taches" className="back-link">
        <span aria-hidden="true">←</span> <span>{t("fiche.retour")}</span>
      </Link>

      {incoherentes.length > 0 ? (
        <div className="alert alert-warn" role="status">
          <span className="alert-icon" aria-hidden="true">
            ⚠
          </span>
          <span>{t("fiche.incoherencesDates")}</span>
        </div>
      ) : null}

      <div className="proj-head">
        <div className="bloc-etroit">
          <span className="eyebrow">
            {tache.project ? tache.project.nom : t("tacheIndependante")}
          </span>
          <TitreEditable
            titre={tache.titre}
            modifiable={modifiable}
            surEnregistrement={(titre) => modifier.mutate({ version: tache.version, titre })}
          />
          <div className="pills">
            <Pastille code={tache.statut} vocabulaire={STATUTS_TACHE} />
            <Pastille code={tache.priorite} vocabulaire={PRIORITES} />
            {tache.enRetard ? <span className="badge badge-late">{t("enRetard")}</span> : null}
            {tache.interventionExterieure ? (
              <span className="badge badge-indep">{t("fiche.interventionExterieure")}</span>
            ) : null}
          </div>
        </div>
        {peut("tasks:delete") ? (
          <div className="proj-acts">
            <Button className="chip-btn chip-danger" onPress={() => setSuppressionOuverte(true)}>
              {t("fiche.supprimer")}
            </Button>
          </div>
        ) : null}
      </div>

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
          <span className="eyebrow">{t("liste.assignes")}</span>
          <div className="day-row">
            {tache.assignes.length > 0 ? (
              tache.assignes.map((a) => (
                <span className="raci-tag" key={a.userId}>
                  <AvatarAgent prenom={a.user.prenom} nom={a.user.nom} />
                  <span>
                    {a.user.prenom} {a.user.nom}
                  </span>
                </span>
              ))
            ) : (
              <span className="raci-none">{t("liste.sansAssigne")}</span>
            )}
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

        <div>
          <section className="panel">
            <div className="panel-head">
              <span className="panel-title">{t("fiche.informations")}</span>
            </div>
            <dl className="side-dl">
              <Ligne libelle={t("liste.projet")} valeur={tache.project?.nom ?? null} />
              <Ligne libelle={t("liste.jalon")} valeur={tache.milestone?.nom ?? null} />
              <Ligne libelle={t("fiche.epopee")} valeur={tache.epic?.nom ?? null} />
              <Ligne
                libelle={t("liste.dateDebut")}
                valeur={tache.dateDebut ? formaterDate(tache.dateDebut) : null}
              />
              <Ligne
                libelle={t("liste.dateFin")}
                valeur={tache.dateFin ? formaterDate(tache.dateFin) : null}
              />
              <Ligne
                libelle={t("fiche.horaires")}
                valeur={
                  tache.heureDebut && tache.heureFin
                    ? `${tache.heureDebut} – ${tache.heureFin}`
                    : null
                }
              />
              <Ligne
                libelle={t("liste.estimation")}
                valeur={
                  tache.estimationHeures
                    ? t("heures", { n: Number(tache.estimationHeures) })
                    : null
                }
              />
              <Ligne libelle={t("fiche.creeeLe")} valeur={formaterDateLongue(tache.creeLe)} />
              <Ligne libelle={t("fiche.miseAJour")} valeur={formaterDateLongue(tache.modifieLe)} />
              <Ligne
                libelle={t("fiche.tiersAssignes")}
                valeur={
                  tache.tiers.length > 0
                    ? tache.tiers.map((x) => x.organisation ?? x.contactNom ?? "—").join(", ")
                    : null
                }
              />
            </dl>
          </section>

          <Raci tache={tache} />
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
        <input
          className="task-title"
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
          <Button className="chip-btn" type="submit" isDisabled={!nouvelle.trim()}>
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
        liens.map((l) => (
          <div className="dep-item" key={l.id}>
            <div className="bloc-etroit">
              <span className="dep-t">{l.titre}</span>
              <span className="dep-e">
                {libelle(l.statut, STATUTS_TACHE)}
                {dateLibelle(l) ? ` · ${dateLibelle(l)}` : ""}
              </span>
            </div>
            <Link to="/taches/$id" params={{ id: l.id }} className="dep-go">
              {t("fiche.voirDetails")}
            </Link>
          </div>
        ))
      )}
    </div>
  );

  return (
    <section className="panel">
      <div className="panel-head">
        <span className="panel-title">{t("fiche.dependances")}</span>
      </div>
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
          <Button className="chip-btn" type="submit" isDisabled={!contenu.trim()}>
            {t("fiche.publier")}
          </Button>
        </form>
      ) : null}
    </section>
  );
}

function Documents({ tache }: { tache: api.FicheTache }) {
  const { t } = useTranslation("taches");

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
            <span />
          </div>
        ))
      )}
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
