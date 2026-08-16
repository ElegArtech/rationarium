import { useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "react-aria-components";
import * as api from "../../api/planning.js";
import { messageErreur } from "../../api/erreurs.js";
import { usePeut } from "../../session/session.js";
import { Chargement, ErreurDeChargement, AccesRefuse } from "../../composants/etats.js";
import { useMessages } from "../../composants/messages.js";
import { Fenetre } from "../../composants/fenetre.js";
import { formaterDate, formaterDateLongue, formaterHeure } from "../../formats.js";
import { ajouterJours, decaler, initiales, iso, lundiDe, periodeDe } from "./grille.js";
import "../../composants/partages.css";
import "./semaine.css";
import "./activite.css";

/**
 * Vue 09 — la grille d'activité, **axes inversés**.
 *
 * Jours en lignes, tâches prédéfinies en colonnes. Le brief prévient :
 * « l'inversion est délibérée mais désorientante ». Elle est donc **annoncée
 * dans la cellule d'angle** — « jours ↓ · tâches → » — plutôt que laissée à
 * deviner après trois secondes d'égarement.
 *
 * Cette vue est **imprimée et affichée en salle de service**. La feuille
 * d'impression n'est pas un ajout tardif : elle fait partie de la définition de
 * terminé, et elle est en noir et blanc lisible (voir `activite.css`).
 */

const MAX_AGENTS = 4;

export function Activite() {
  const { t } = useTranslation("planning");
  const peut = usePeut();
  const [ancre, setAncre] = useState(() => iso(new Date()));
  const [ajout, setAjout] = useState<{ tache: api.GrilleActivite["colonnes"][number]; date: string } | null>(null);

  const periode = periodeDe("activite", ancre);

  const requete = useQuery({
    queryKey: ["planning", "activite", periode.debut, periode.fin],
    queryFn: () => api.grilleActivite(periode.debut, periode.fin),
    enabled: peut("predefined_tasks:read"),
  });

  if (!peut("predefined_tasks:read")) return <AccesRefuse />;
  if (requete.isPending) return <Chargement quoi={t("lagrille")} />;
  if (requete.isError)
    return <ErreurDeChargement erreur={requete.error} surReessai={() => void requete.refetch()} />;

  const { colonnes, lignes, trame } = requete.data;
  const aujourdhui = iso(new Date());
  const style = { "--cols": `170px repeat(${colonnes.length}, minmax(160px, 1fr))` } as CSSProperties;

  return (
    <div className="page">
      {/* L'en-tête d'impression n'existe qu'à l'impression : à l'écran, le
          titre de page dit déjà la même chose. */}
      <div className="print-head">
        <p className="print-title">{t("activite.titre")}</p>
        <p className="print-meta">
          {t("navigation.libelle_semaine", {
            debut: formaterDate(periode.debut),
            fin: formaterDate(periode.fin),
          })}
        </p>
      </div>

      <div className="pl-toolbar">
        <h1 className="h1 titre-vue">{t("titre")}</h1>

        <div className="seg" role="group" aria-label={t("modes.groupe")}>
          {(["semaine", "mois", "activite"] as const).map((m) => (
            <a
              key={m}
              href={m === "semaine" ? "/planning" : `/planning/${m}`}
              // Un lien n'est pas un bouton bascule — voir la vue 07.
              aria-current={m === "activite" ? "page" : undefined}
            >
              {t(`modes.${m}`)}
            </a>
          ))}
        </div>

        <div className="pl-nav">
          <Button
            className="nav-sq"
            aria-label={t("navigation.precedent_semaine")}
            onPress={() => setAncre(decaler("activite", ancre, -1))}
          >
            <span aria-hidden="true">‹</span>
          </Button>
          <Button
            className="nav-sq"
            aria-label={t("navigation.suivant_semaine")}
            onPress={() => setAncre(decaler("activite", ancre, 1))}
          >
            <span aria-hidden="true">›</span>
          </Button>
          <Button className="chip-btn" onPress={() => setAncre(iso(new Date()))}>
            {t("navigation.aujourdhui")}
          </Button>
        </div>

        <span className="pl-period">
          {t("navigation.libelle_semaine", {
            debut: formaterDate(periode.debut),
            fin: formaterDate(periode.fin),
          })}
        </span>

        <div className="ligne-actions-fin">
          <Button className="btn btn-primary no-print" onPress={() => window.print()}>
            {t("activite.imprimer")}
          </Button>
        </div>
      </div>

      {/*
        `cadrage/02 § vue 09` — « L'inversion des axes est délibérée mais
        désorientante. » La cellule d'angle la porte une fois la grille
        peuplée ; ce bandeau la porte TOUJOURS, y compris sur l'état vide,
        qui est précisément le moment où l'on cherche à comprendre la vue.
      */}
      <div className="alert alert-neutral no-print">
        <span className="alert-icon" aria-hidden="true">
          ↻
        </span>
        <span>{t("activite.axesInverses")}</span>
      </div>

      {colonnes.length === 0 ? (
        <div className="pl-wrap" role="region" tabIndex={0} aria-label={t("activite.grilleRegion")}>
          <div className="pl-empty">
            <p>{t("activite.videTitre")}</p>
            <small>{t("activite.videExplication")}</small>
            <p className="ligne-actions">
              <a className="chip-btn" href="/taches-predefinies">
                {t("activite.videAction")}
              </a>
            </p>
          </div>
        </div>
      ) : (
        <div
          className="pl-wrap"
          role="region"
          tabIndex={0}
          aria-label={t("activite.grilleRegion")}
        >
          <div className="act" style={style}>
            {/* `EX-PLN-01` — l'inversion des axes est ANNONCÉE ici. */}
            <div className="act-corner">
              <div className="ax">
                <span className="ax-line">
                  <span className="ax-arrow" aria-hidden="true">
                    ↓
                  </span>
                  <span>{t("activite.axeJours")}</span>
                </span>
                <span className="ax-line">
                  <span className="ax-arrow" aria-hidden="true">
                    →
                  </span>
                  <span>{t("activite.axeTaches")}</span>
                </span>
              </div>
            </div>

            {colonnes.map((tache) => (
              <div className="act-head" key={tache.id}>
                <div className="act-head-top">
                  <span
                    className="act-glyph"
                    style={{ background: tache.couleur ?? "var(--accent)" }}
                    aria-hidden="true"
                  >
                    {tache.icone ?? "◍"}
                  </span>
                  <span className="act-name">{tache.nom}</span>
                </div>
                <span className="act-sub">
                  {tache.heureDebut && tache.heureFin
                    ? `${formaterHeure(tache.heureDebut)} – ${formaterHeure(tache.heureFin)}`
                    : t("detail.journeeEntiere")}
                </span>
              </div>
            ))}

            {lignes.map((ligne) => {
              const d = new Date(`${ligne.date}T00:00:00.000Z`);
              const weekend = d.getUTCDay() === 0 || d.getUTCDay() === 6;
              const ferie = trame.joursChomes.includes(ligne.date);
              return (
                <div key={ligne.date} style={{ display: "contents" }}>
                  <div
                    className={`act-day${ligne.date === aujourdhui ? " is-today" : ""}${
                      weekend || ferie ? " is-off" : ""
                    }`}
                  >
                    <span className="act-dow">{t(`jours.long.${d.getUTCDay()}`)}</span>
                    <span className="act-date">{ligne.date.slice(8)}</span>
                    {/* `EX-PLN-14` — un férié se voit dans cette grille aussi :
                        c'est le jour où une permanence surprend le plus. */}
                    {ferie ? <span className="act-ferie">{t("bandeauFerie")}</span> : null}
                  </div>

                  {ligne.cellules.map((cellule) => {
                    const tache = colonnes.find((c) => c.id === cellule.tacheId);
                    return (
                      <div
                        key={cellule.tacheId}
                        className={`acell${ligne.date === aujourdhui ? " is-today" : ""}${
                          weekend || ferie ? " is-off" : ""
                        }`}
                      >
                        {cellule.agents.length === 0 ? (
                          <span className="acell-none" aria-label={t("activite.aucunAgent")}>
                            —
                          </span>
                        ) : (
                          cellule.agents.slice(0, MAX_AGENTS).map((agent) => (
                            <LigneAgent key={agent.assignationId} agent={agent} />
                          ))
                        )}

                        {cellule.agents.length > MAX_AGENTS ? (
                          <span className="acell-more">
                            {t("activite.agentsSupplementaires", {
                              n: cellule.agents.length - MAX_AGENTS,
                            })}
                          </span>
                        ) : null}

                        {peut("predefined_tasks:assign") && tache ? (
                          <Button
                            className="acell-add no-print"
                            onPress={() => setAjout({ tache, date: ligne.date })}
                            aria-label={t("activite.ajouterA", {
                              tache: tache.nom,
                              date: formaterDate(ligne.date),
                            })}
                          >
                            {t("activite.ajouter")}
                          </Button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Maquette 09 — les marqueurs de réalisation sont muets sans leur clé
          de lecture. Le panneau la donne, et dit comment les faire changer. */}
      <section className="panel matrice-espace no-print">
        <div className="panel-head">
          <span className="panel-title">{t("activite.statutTitre")}</span>
          <span className="eyebrow">{t("activite.statutIndication")}</span>
        </div>
        <div className="panel-body legende-statuts">
          <span className="check">
            <span className="agent-st" aria-hidden="true">
              ·
            </span>
            <span>{t("activite.statutPrevue")}</span>
          </span>
          <span className="check">
            <span className="agent-st is-done" aria-hidden="true">
              ✓
            </span>
            <span>{t("activite.statutRealisee")}</span>
          </span>
          <span className="check">
            <span className="agent-st is-missed" aria-hidden="true">
              ✗
            </span>
            <span>{t("activite.statutNonRealisee")}</span>
          </span>
        </div>
      </section>

      {ajout ? (
        <FenetreAjout
          tache={ajout.tache}
          date={ajout.date}
          surFermer={() => setAjout(null)}
        />
      ) : null}
    </div>
  );
}

/** Un agent affecté, et l'état de réalisation de sa permanence (`EX-ACT-06`). */
function LigneAgent({
  agent,
}: {
  agent: api.GrilleActivite["lignes"][number]["cellules"][number]["agents"][number];
}) {
  const { t } = useTranslation("planning");
  const { t: tErreurs } = useTranslation("erreurs");
  const peut = usePeut();
  const annoncer = useMessages();
  const client = useQueryClient();

  const realisation = useMutation({
    mutationFn: (realisee: boolean) => api.declarerRealisation(agent.assignationId, realisee),
    onSuccess: () => {
      annoncer("ok", t("activite.realisationEnregistree"));
      void client.invalidateQueries({ queryKey: ["planning", "activite"] });
    },
    onError: (e) => annoncer("err", messageErreur(e, tErreurs, t("activite.echecRealisation"))),
  });

  const nom = `${agent.prenom} ${agent.nom}`;

  return (
    <span className={`agent${agent.realisee ? " is-done" : ""}`}>
      <span className="agent-av" aria-hidden="true">
        {initiales(agent)}
      </span>
      <span className="agent-name">{nom}</span>
      {peut("predefined_tasks:update") ? (
        <Button
          className={`agent-st${agent.realisee ? " is-done" : ""}`}
          aria-pressed={agent.realisee}
          onPress={() => realisation.mutate(!agent.realisee)}
          aria-label={t(agent.realisee ? "activite.marquerNonTenue" : "activite.marquerTenue", {
            nom,
          })}
        >
          <span aria-hidden="true">{agent.realisee ? "✓" : "·"}</span>
        </Button>
      ) : (
        <span className={`agent-st${agent.realisee ? " is-done" : ""}`} aria-hidden="true">
          {agent.realisee ? "✓" : "·"}
        </span>
      )}
    </span>
  );
}

/**
 * `RG-PLN-08` — la fenêtre d'ajout **nomme** chaque inéligibilité.
 *
 * « déjà assigné », « en congé · {type} », « en télétravail » : la raison est
 * portée par l'agent concerné, pas résumée en bas de liste. Masquer les
 * inéligibles ferait chercher qui manque ; les griser sans raison ferait
 * chercher pourquoi la case refuse de se cocher.
 */
function FenetreAjout({
  tache,
  date,
  surFermer,
}: {
  tache: api.GrilleActivite["colonnes"][number];
  date: string;
  surFermer: () => void;
}) {
  const { t } = useTranslation("planning");
  const { t: tErreurs } = useTranslation("erreurs");
  const annoncer = useMessages();
  const client = useQueryClient();
  const [choisis, setChoisis] = useState<ReadonlySet<string>>(new Set());

  const requete = useQuery({
    queryKey: ["activite", "eligibilite", tache.id, date],
    queryFn: () => api.eligibilite(tache.id, date),
  });

  const assignation = useMutation({
    mutationFn: () =>
      api.assignerPermanence({
        predefinedTaskId: tache.id,
        userIds: [...choisis],
        date,
        periode: "full_day",
      }),
    onSuccess: (r) => {
      annoncer("ok", t("activite.assignationsCreees", { n: r.crees }));
      void client.invalidateQueries({ queryKey: ["planning", "activite"] });
      surFermer();
    },
    onError: (e) => annoncer("err", messageErreur(e, tErreurs, t("activite.echecAssignation"))),
  });

  const agents = requete.data ?? [];
  const eligibles = agents.filter((a) => a.motif === null);

  return (
    <Fenetre
      ouverte
      surFermeture={surFermer}
      categorie={t("activite.fenetreTitre")}
      titre={t("activite.fenetreSousTitre", {
        tache: tache.nom,
        date: formaterDateLongue(date),
      })}
      mention={t("activite.nSelectionnes", { n: choisis.size })}
      actions={
        <>
          <Button className="chip-btn" onPress={surFermer}>
            {t("activite.annuler")}
          </Button>
          <Button
            className="btn btn-primary"
            isDisabled={choisis.size === 0}
            isPending={assignation.isPending}
            onPress={() => assignation.mutate()}
          >
            {t("activite.ajouterN", { n: choisis.size })}
          </Button>
        </>
      }
    >
      {requete.isPending ? <Chargement quoi={t("activite.lesAgents")} /> : null}

      {requete.data && eligibles.length === 0 ? (
        <div className="empty empty-large">
          <p>{t("activite.aucunEligible")}</p>
        </div>
      ) : null}

      {agents.map((agent) => {
        const bloque = agent.motif !== null;
        return (
          <label className={`pick${bloque ? " is-off" : ""}`} key={agent.userId}>
            <input
              type="checkbox"
              disabled={bloque}
              checked={choisis.has(agent.userId)}
              onChange={(e) =>
                setChoisis((c) => {
                  const suivant = new Set(c);
                  if (e.target.checked) suivant.add(agent.userId);
                  else suivant.delete(agent.userId);
                  return suivant;
                })
              }
            />
            <span>
              <span className="pick-name">
                {agent.prenom} {agent.nom}
              </span>
            </span>
            {agent.motif ? (
              <span className={`reason ${classeMotif(agent.motif)}`}>
                {agent.motif === "en_conge" && agent.detail
                  ? t("activite.motif_en_conge_detail", { type: agent.detail })
                  : t(`activite.motif_${agent.motif}`)}
              </span>
            ) : null}
          </label>
        );
      })}
    </Fenetre>
  );
}

const classeMotif = (motif: string) =>
  motif === "en_conge" ? "reason-leave" : motif === "en_teletravail" ? "reason-tt" : "reason-dup";

/** La semaine affichée par la vue Activité commence le lundi, comme la 07. */
export const semaineDe = (ancre: string) => ({
  debut: lundiDe(ancre),
  fin: ajouterJours(lundiDe(ancre), 6),
});
