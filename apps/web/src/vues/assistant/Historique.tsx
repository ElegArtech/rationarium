import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { DECLENCHEMENTS_PASSAGE, ETATS_PASSAGE, type EtatPassage } from "@rationarium/contracts";
import * as api from "../../api/assistant.js";
import { ErreurApi } from "../../api/client.js";
import { AccesRefuse, Chargement, ErreurDeChargement, EtatVide } from "../../composants/etats.js";
import { useLibelle } from "../../composants/pastilles.js";
import { Duree } from "./Activite.js";
import { EnTeteAssistant, ModuleDesactive, PastilleEtatPassage } from "./elements.js";
import { horodatage, minutesEntre } from "./formes.js";
import { moduleDesactive } from "./module.js";
import "../../composants/partages.css";
import "./assistant.css";

/**
 * Activité de l'agent › Historique — `EX-AST-09`, `§ 13`.
 *
 * Un passage par ligne : comment il est parti, ce qu'il est devenu, combien de
 * temps il a duré, ce que l'agent y a fait et ce qu'il en a dit. Le filtre par
 * état est un état d'ADRESSE : une liste filtrée se partage par lien.
 */
export function HistoriqueAgent({ etat }: { etat?: EtatPassage | undefined }) {
  const { t } = useTranslation("assistant");
  const libelle = useLibelle();
  const navigate = useNavigate();

  const requete = useQuery({
    queryKey: ["assistant", "passages", etat ?? null],
    queryFn: () => api.passages({ ...(etat ? { etat } : {}), limite: 200 }),
    retry: false,
  });

  if (requete.error && moduleDesactive(requete.error)) {
    return (
      <>
        <EnTeteAssistant onglet="historique" />
        <ModuleDesactive />
      </>
    );
  }
  if (requete.error instanceof ErreurApi && requete.error.statut === 403) return <AccesRefuse erreur={requete.error} />;

  return (
    <>
      <EnTeteAssistant onglet="historique" />

      <div className="filters">
        <label className="field-label ag-filtre-label" htmlFor="historique-etat">
          {t("historique.filtreEtat")}
        </label>
        <select
          id="historique-etat"
          className="f-input"
          value={etat ?? ""}
          onChange={(e) => {
            const valeur = ETATS_PASSAGE.find((x) => x.code === e.target.value)?.code;
            void navigate({ to: "/assistant/historique", search: valeur ? { etat: valeur } : {} });
          }}
        >
          <option value="">{t("historique.tousLesEtats")}</option>
          {ETATS_PASSAGE.map((x) => (
            <option key={x.code} value={x.code}>
              {libelle(x.code, ETATS_PASSAGE)}
            </option>
          ))}
        </select>
      </div>

      {requete.isPending ? <Chargement quoi={t("historique.lesPassages")} /> : null}
      {requete.isError ? <ErreurDeChargement erreur={requete.error} surReessai={() => void requete.refetch()} /> : null}

      {requete.data && requete.data.length === 0 ? (
        <section className="panel">
          <EtatVide
            titre={etat ? t("historique.videFiltreTitre") : t("historique.videTitre")}
            explication={etat ? t("historique.videFiltre") : t("historique.vide")}
            sortie={
              etat ? (
                <Link className="btn" to="/assistant/historique" search={{}}>
                  {t("historique.retirerFiltre")}
                </Link>
              ) : (
                <Link className="btn btn-primary" to="/assistant" search={{}}>
                  {t("historique.versActivite")}
                </Link>
              )
            }
          />
        </section>
      ) : null}

      {requete.data && requete.data.length > 0 ? (
        <section className="panel">
          <div className="ag-hist-grid ag-hist-head" aria-hidden="true">
            <span>{t("historique.colPassage")}</span>
            <span>{t("historique.colEtat")}</span>
            <span>{t("historique.colDeroulement")}</span>
            <span>{t("historique.colActions")}</span>
            <span>{t("historique.colBilan")}</span>
          </div>
          <ul className="ag-hist-liste" aria-label={t("historique.titre")}>
            {requete.data.map((p) => {
              const duree = minutesEntre(p.priseLe ?? p.creeLe, p.finLe);
              const points = p.bilan?.pointsOuverts?.length ?? 0;
              return (
                <li className="ag-hist-grid ag-hist-row" key={p.id}>
                  <span className="bloc-etroit">
                    <Link className="lien-route" to="/assistant" search={{ passage: p.id }}>
                      {horodatage(p.creeLe)}
                    </Link>
                    <span className="ag-sous">{libelle(p.declenchement, DECLENCHEMENTS_PASSAGE)}</span>
                  </span>
                  <span>
                    <PastilleEtatPassage etat={p.etat} />
                  </span>
                  <span className="ag-pile ag-sous">
                    <span>{t("historique.prise", { quand: p.priseLe ? horodatage(p.priseLe) : t("valeurs.vide") })}</span>
                    <span>{t("historique.fin", { quand: p.finLe ? horodatage(p.finLe) : t("valeurs.vide") })}</span>
                    <span>
                      {t("historique.duree")} {duree === null ? t("valeurs.vide") : <Duree minutes={duree} />}
                    </span>
                  </span>
                  <span className="ag-sous">
                    {t("passage.decompte", {
                      effectuees: p.actions.effectuees,
                      refusees: p.actions.refusees,
                      defaites: p.actions.defaites,
                    })}
                  </span>
                  <span className="bloc-etroit">
                    <span className="ag-resume-court">{p.bilan?.resume ?? (p.erreur ? t("passage.erreur", { erreur: p.erreur }) : t("historique.sansBilan"))}</span>
                    {points > 0 ? <span className="ag-sous">{t("passage.pointsOuverts", { n: points })}</span> : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </>
  );
}
