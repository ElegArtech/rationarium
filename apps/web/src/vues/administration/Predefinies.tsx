import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { DUREES_TACHE_PREDEFINIE } from "@trame/contracts";
import * as api from "../../api/administration.js";
import { usePeut } from "../../session/session.js";
import { Chargement, ErreurDeChargement, AccesRefuse } from "../../composants/etats.js";
import { useLibelle } from "../../composants/pastilles.js";
import { formaterDate } from "../../formats.js";
import "../../composants/partages.css";
import "../taches/liste.css";
import "./predefinies.css";

/**
 * Vue 34 — Catalogue des tâches prédéfinies.
 *
 * **La prévisualisation en langage naturel de la règle est indispensable** —
 * le brief le dit ainsi. « type: ordinal, ordinal: 3, jourSemaine: 2 » ne se
 * relit pas ; « le 3ᵉ mardi de chaque mois, à partir du 1er septembre » si.
 * C'est la seule forme sous laquelle une récurrence se vérifie d'un coup d'œil.
 *
 * **Le poids est une jauge de cinq crans, doublée de son libellé.** Un nombre
 * de 1 à 5 ne dit pas s'il est léger ou lourd ; « 4 — Lourde » si, et la jauge
 * le montre sans lecture.
 *
 * Une tâche désactivée reste au catalogue (`RG-ACT-05`) : la faire disparaître
 * laisserait des assignations passées rattachées à un objet introuvable.
 */

const POIDS = [1, 2, 3, 4, 5] as const;

export function Predefinies() {
  const { t } = useTranslation("administration");
  const libelle = useLibelle();
  const peut = usePeut();
  const [inactives, setInactives] = useState(false);

  const requete = useQuery({
    queryKey: ["predefinies", inactives],
    queryFn: () => api.cataloguePredefini(inactives),
    enabled: peut("predefined_tasks:read"),
  });

  if (!peut("predefined_tasks:read")) return <AccesRefuse />;
  if (requete.isPending) return <Chargement quoi={t("predefinies.leCatalogue")} />;
  if (requete.isError)
    return <ErreurDeChargement erreur={requete.error} surReessai={() => void requete.refetch()} />;

  return (
    <div className="page">
      <div className="pl-toolbar">
        <div>
          <span className="eyebrow">{t("predefinies.surtitre")}</span>
          <h1 className="h1 titre-vue">{t("predefinies.titre")}</h1>
          <p className="lede">{t("predefinies.chapeau")}</p>
        </div>
      </div>

      <div className="filters">
        <label className="check">
          <input
            type="checkbox"
            checked={inactives}
            onChange={(e) => setInactives(e.target.checked)}
          />
          <span>{t("predefinies.afficherInactives")}</span>
        </label>
      </div>

      {requete.data.length === 0 ? (
        <div className="empty empty-large">
          <p>{t("predefinies.videTitre")}</p>
          <small>{t("predefinies.videExplication")}</small>
        </div>
      ) : (
        <>
          <div className="tlist">
            <div className="pt-row pt-head" aria-hidden="true">
              <span />
              <span>{t("predefinies.colNom")}</span>
              <span>{t("predefinies.colDuree")}</span>
              <span>{t("predefinies.colPoids")}</span>
              <span>{t("predefinies.colTeletravail")}</span>
              <span>{t("predefinies.colStatut")}</span>
              <span>{t("predefinies.colAssignations")}</span>
            </div>

            {requete.data.map((tache) => (
              <div className={`pt-row${tache.actif ? "" : " is-off"}`} key={tache.id}>
                <span
                  className="pt-ic"
                  style={{ background: tache.couleur ?? "var(--accent)" }}
                  aria-hidden="true"
                >
                  {tache.icone ?? "◍"}
                </span>

                <div className="bloc-etroit">
                  <p className="pt-n">{tache.nom}</p>
                  {tache.description ? <span className="pt-d">{tache.description}</span> : null}
                </div>

                <span className="bloc-etroit">
                  <span className="us-org">
                    {libelle(tache.dureeParDefaut, DUREES_TACHE_PREDEFINIE)}
                  </span>
                  {/* `RG-ACT-02` — un créneau exige ses horaires. Les afficher
                      ici évite d'ouvrir la fiche pour vérifier. */}
                  {tache.heureDebut && tache.heureFin ? (
                    <span className="pt-slot">
                      {tache.heureDebut} – {tache.heureFin}
                    </span>
                  ) : null}
                </span>

                <Poids valeur={tache.poids} />

                <span
                  className={`tt-ok ${tache.teletravailAutorise ? "is-yes" : "is-no"}`}
                >
                  {tache.teletravailAutorise
                    ? t("predefinies.teletravailOui")
                    : t("predefinies.teletravailNon")}
                </span>

                <span
                  className="pill"
                  style={{ color: tache.actif ? "var(--st-done)" : "var(--muted)" }}
                >
                  {tache.actif ? t("predefinies.active") : t("predefinies.inactive")}
                </span>

                <span className="us-org">
                  {t("predefinies.assignations", { n: tache._count.assignations })}
                </span>
              </div>
            ))}
          </div>

          <section className="panel matrice-espace">
            <div className="panel-head">
              <span className="panel-title">{t("predefinies.reglesTitre")}</span>
            </div>
            <div className="panel-body">
              {requete.data.every((x) => x.recurrences.length === 0) ? (
                <p className="dep-none">{t("predefinies.aucuneRegle")}</p>
              ) : (
                requete.data.flatMap((tache) =>
                  tache.recurrences.map((r) => (
                    <div
                      className={`rule-card${r.active ? "" : " is-off"}`}
                      key={r.id}
                    >
                      <span
                        className="pt-ic"
                        style={{ background: tache.couleur ?? "var(--accent)" }}
                        aria-hidden="true"
                      >
                        {tache.icone ?? "◍"}
                      </span>
                      <span className="bloc-etroit">
                        {/* La phrase, pas les champs. */}
                        <span className="rule-nl2">
                          <PhraseRecurrence regle={r} />
                        </span>
                        <span className="rule-meta">{tache.nom}</span>
                      </span>
                      <span className="us-org">
                        {r.dateFin
                          ? t("predefinies.duAu", {
                              debut: formaterDate(r.dateDebut),
                              fin: formaterDate(r.dateFin),
                            })
                          : t("predefinies.aPartirDe", { debut: formaterDate(r.dateDebut) })}
                      </span>
                      <span
                        className="pill"
                        style={{ color: r.active ? "var(--st-done)" : "var(--muted)" }}
                      >
                        {r.active ? t("predefinies.regleActive") : t("predefinies.regleInactive")}
                      </span>
                    </div>
                  )),
                )
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

/**
 * La règle, en une phrase.
 *
 * Les trois types ont des champs différents, et c'est justement pourquoi la
 * phrase est nécessaire : elle est la seule forme commune sous laquelle les
 * trois se comparent.
 */
function PhraseRecurrence({ regle }: { regle: api.RecurrencePredefinie }) {
  const { t } = useTranslation("administration");

  if (regle.type === "weekly") {
    return (
      <>
        {t("predefinies.phraseHebdo", {
          n: regle.frequence,
          jour: t(`predefinies.jour_${regle.jourSemaine ?? 1}`),
        })}
      </>
    );
  }

  if (regle.type === "monthly_date") {
    return (
      <>
        {t("predefinies.phraseMensuelleDate", { jour: regle.jourMois ?? 1 })}
        {/* `RG-ACT-04` — un 31 février n'existe pas : l'assignation est
            ramenée au dernier jour du mois. Le dire ici évite de découvrir la
            règle en constatant une date inattendue. */}
        {(regle.jourMois ?? 1) > 28 ? (
          <span className="rule-meta">{t("predefinies.clampage")}</span>
        ) : null}
      </>
    );
  }

  return (
    <>
      {t("predefinies.phraseOrdinale", {
        ordinal: t(`predefinies.ordinal_${regle.ordinal ?? 1}`),
        jour: t(`predefinies.jour_${regle.jourSemaine ?? 1}`),
      })}
    </>
  );
}

/** Le poids : une jauge de cinq crans, doublée de son libellé. */
function Poids({ valeur }: { valeur: number }) {
  const { t } = useTranslation("administration");
  return (
    <span className="gauge">
      <span
        className="gauge-seg"
        role="img"
        aria-label={t("predefinies.poidsLibelle", {
          n: valeur,
          niveau: t(`predefinies.poids_${valeur}`),
        })}
      >
        {POIDS.map((p) => (
          <i
            key={p}
            className={p <= valeur ? (valeur >= 4 ? "is-hot" : "is-on") : ""}
          />
        ))}
      </span>
      {/* Un nombre de 1 à 5 ne dit pas s'il est léger ou lourd. */}
      <span className="gauge-l">{t(`predefinies.poids_${valeur}`)}</span>
    </span>
  );
}
