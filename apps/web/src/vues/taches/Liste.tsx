import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button } from "react-aria-components";
import { STATUTS_TACHE, PRIORITES } from "@trame/contracts";
import * as api from "../../api/taches.js";
import * as apiProjets from "../../api/projets.js";
import { usePeut } from "../../session/session.js";
import { Chargement, ErreurDeChargement } from "../../composants/etats.js";
import { Pastille, AvatarAgent, useLibelle } from "../../composants/pastilles.js";
import { formaterDate } from "../../formats.js";
import { Kanban } from "./Kanban.js";
import { FenetreCreationTache } from "./FenetreCreationTache.js";
import "../../composants/partages.css";
import "./liste.css";

/**
 * Vue 16 — Tâches, vue globale.
 *
 * **La tâche hors projet est un cas nominal, pas une anomalie.** Le brief
 * insiste : réunions, travail transverse, sollicitations ponctuelles. Elle
 * porte donc une identité propre — une pastille « Tâche indépendante » en
 * tirets — et non un champ projet resté vide. Le compteur la sépare
 * explicitement, et un filtre dédié permet de ne voir qu'elle.
 */
export function ListeTaches() {
  const { t } = useTranslation("taches");
  const libelle = useLibelle();
  const peut = usePeut();
  const [projectId, setProjectId] = useState("");
  const [priorite, setPriorite] = useState("");
  const [horsProjet, setHorsProjet] = useState(false);
  const [enRetard, setEnRetard] = useState(false);
  const [vue, setVue] = useState<"liste" | "kanban">("liste");
  const [creationOuverte, setCreationOuverte] = useState(false);

  const filtres = { projectId, priorite, horsProjet, enRetard };
  const cle = ["taches", filtres] as const;
  const requete = useQuery({ queryKey: cle, queryFn: () => api.lister(filtres) });

  const projets = useQuery({
    queryKey: ["projets", {}],
    queryFn: () => apiProjets.portefeuille({}),
  });

  const taches = requete.data ?? [];
  const independantes = taches.filter((x) => x.horsProjet).length;

  return (
    <div className="page">
      <div className="pl-toolbar">
        <div>
          <span className="eyebrow">{t("liste.surtitre")}</span>
          <h1 className="h1 titre-vue">{t("liste.titre")}</h1>
        </div>
        <span className="count-split">
          <b>{taches.length}</b> {t("liste.compte", { n: taches.length })}
          {independantes > 0 ? ` · ${t("liste.dontIndependantes", { n: independantes })}` : ""}
        </span>
        {peut("tasks:create") ? (
          <div className="pl-toolbar-fin">
            <Button className="btn btn-primary" onPress={() => setCreationOuverte(true)}>
              {t("liste.creer")}
            </Button>
          </div>
        ) : null}
      </div>

      <div className="filters">
        <select
          className="f-input"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          aria-label={t("liste.projet")}
          disabled={horsProjet}
        >
          <option value="">{t("liste.tousProjets")}</option>
          {(projets.data?.projets ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.nom}
            </option>
          ))}
        </select>

        <select
          className="f-input"
          value={priorite}
          onChange={(e) => setPriorite(e.target.value)}
          aria-label={t("liste.priorite")}
        >
          <option value="">{t("liste.toutesPriorites")}</option>
          {PRIORITES.map((p) => (
            <option key={p.code} value={p.code}>
              {libelle(p.code, PRIORITES)}
            </option>
          ))}
        </select>

        <span className="vsep" aria-hidden="true" />

        <Button
          className="filter-toggle is-indep"
          aria-pressed={horsProjet}
          onPress={() => {
            setHorsProjet((v) => !v);
            setProjectId("");
          }}
        >
          {t("liste.sansProjet")}
        </Button>
        <Button
          className="filter-toggle"
          aria-pressed={enRetard}
          onPress={() => setEnRetard((v) => !v)}
        >
          {t("liste.enRetard")}
        </Button>

        <div className="bascule-vue" role="group" aria-label={t("liste.affichage")}>
          <Button
            className="tab"
            aria-selected={vue === "liste"}
            onPress={() => setVue("liste")}
          >
            {t("liste.affichageListe")}
          </Button>
          <Button
            className="tab"
            aria-selected={vue === "kanban"}
            onPress={() => setVue("kanban")}
          >
            {t("liste.affichageKanban")}
          </Button>
        </div>
      </div>

      {requete.isPending ? <Chargement quoi={t("lesTaches")} /> : null}
      {requete.isError ? (
        <ErreurDeChargement erreur={requete.error} surReessai={() => void requete.refetch()} />
      ) : null}

      {requete.data ? (
        taches.length === 0 ? (
          <div className="empty empty-large">
            <p>{t("liste.videTitre")}</p>
            <small>{t("liste.videExplication")}</small>
            {peut("tasks:create") ? (
              <Button className="btn btn-primary" onPress={() => setCreationOuverte(true)}>
                {t("liste.creer")}
              </Button>
            ) : null}
          </div>
        ) : vue === "kanban" ? (
          <Kanban
            taches={taches}
            cleRequete={cle}
            surRechargement={() => void requete.refetch()}
          />
        ) : (
          <div className="tlist">
            {/*
              L'en-tête nomme les colonnes pour l'œil. Il ne porte PAS de rôle
              de tableau : les lignes sont des liens, pas des cellules, et
              annoncer une structure de tableau qui n'en est pas une désoriente
              plus qu'elle n'aide. Chaque ligne porte son contexte dans son
              propre contenu.
            */}
            <div className="tgrid thead" aria-hidden="true">
              <span>{t("liste.colTache")}</span>
              <span className="c-proj">{t("liste.colProjet")}</span>
              <span className="c-mile">{t("liste.colJalon")}</span>
              <span>{t("liste.colStatut")}</span>
              <span className="c-when">{t("liste.colEcheance")}</span>
              <span className="c-est">{t("liste.colEstime")}</span>
              <span className="c-who">{t("liste.colAssignes")}</span>
            </div>
            {taches.map((tache) => (
              <LigneTache key={tache.id} tache={tache} />
            ))}
          </div>
        )
      ) : null}

      <FenetreCreationTache
        ouverte={creationOuverte}
        surFermeture={() => setCreationOuverte(false)}
        projets={projets.data?.projets ?? []}
      />
    </div>
  );
}

function LigneTache({ tache }: { tache: api.LigneTache }) {
  const { t } = useTranslation("taches");

  return (
    <Link to="/taches/$id" params={{ id: tache.id }} className="tgrid trow2">
      <div>
        <p className="t2-name">{tache.titre}</p>
        <span className="t2-sub">
          <Pastille code={tache.priorite} vocabulaire={PRIORITES} />
          {tache.enRetard ? <span className="badge badge-late">{t("enRetard")}</span> : null}
          {tache._count.sousTaches > 0 ? (
            <span className="t2-when">
              {t("liste.sousTaches", { n: tache._count.sousTaches })}
            </span>
          ) : null}
        </span>
      </div>

      <span className="c-proj">
        {tache.project ? (
          <span className="pchip">
            <span>{tache.project.nom}</span>
          </span>
        ) : (
          /* Le hors-projet est nommé et assumé, jamais laissé vide. */
          <span className="pchip is-indep">
            <span className="dot-ind" aria-hidden="true" />
            <span>{t("tacheIndependante")}</span>
          </span>
        )}
      </span>

      <span className={`t2-mile c-mile${tache.milestone ? "" : " is-none"}`}>
        {tache.milestone?.nom ?? t("liste.sansJalon")}
      </span>

      <Pastille code={tache.statut} vocabulaire={STATUTS_TACHE} />

      <span className={`t2-when c-when${tache.enRetard ? " is-late" : ""}`}>
        {tache.dateFin ? formaterDate(tache.dateFin) : t("sansEcheance")}
      </span>

      <span className="t2-est c-est">
        {tache.estimationHeures ? t("heures", { n: Number(tache.estimationHeures) }) : "—"}
      </span>

      <span className="avs c-who">
        {tache.assignes.slice(0, 3).map((a) => (
          <AvatarAgent key={a.userId} prenom={a.user.prenom} nom={a.user.nom} />
        ))}
        {tache.assignes.length === 0 ? (
          <span className="t2-when">{t("liste.sansAssigne")}</span>
        ) : null}
      </span>
    </Link>
  );
}
