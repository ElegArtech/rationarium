import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button } from "react-aria-components";
import { STATUTS_TACHE, PRIORITES } from "@trame/contracts";
import * as api from "../../api/taches.js";
import * as apiProjets from "../../api/projets.js";
import { messageErreur } from "../../api/erreurs.js";
import { usePeut } from "../../session/session.js";
import { Chargement, ErreurDeChargement } from "../../composants/etats.js";
import { useMessages } from "../../composants/messages.js";
import { Pastille, AvatarAgent, useLibelle } from "../../composants/pastilles.js";
import { formaterDate, formaterNombre } from "../../formats.js";
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
 *
 * **Le statut se change depuis la liste.** C'est le geste le plus fréquent :
 * l'imposer par un détour en fiche ferait de la mise à jour quotidienne une
 * corvée. La version lue accompagne l'écriture (`RG-GEN-07`).
 */
export function ListeTaches() {
  const { t } = useTranslation("taches");
  const { t: tErreurs } = useTranslation("erreurs");
  const libelle = useLibelle();
  const peut = usePeut();
  const client = useQueryClient();
  const annoncer = useMessages();

  const [recherche, setRecherche] = useState("");
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

  /*
   * La recherche par titre se fait sur la liste chargée, comme la maquette.
   * Elle n'a pas de filtre serveur : ajouter un paramètre non prévu au
   * cadrage serait une décision, pas un portage.
   */
  const taches = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    const tout = requete.data ?? [];
    return q ? tout.filter((x) => x.titre.toLowerCase().includes(q)) : tout;
  }, [requete.data, recherche]);
  const independantes = taches.filter((x) => x.horsProjet).length;
  const filtreActif = Boolean(recherche || projectId || priorite || horsProjet || enRetard);

  const reinitialiser = () => {
    setRecherche("");
    setProjectId("");
    setPriorite("");
    setHorsProjet(false);
    setEnRetard(false);
  };

  const changerStatut = useMutation({
    mutationFn: ({ tache, statut }: { tache: api.LigneTache; statut: string }) =>
      api.modifier(tache.id, { version: tache.version, statut }),
    onSuccess: () => {
      annoncer("ok", t("liste.statutMisAJour"));
      void client.invalidateQueries({ queryKey: ["taches"] });
    },
    onError: (e) => annoncer("err", messageErreur(e, tErreurs, t("liste.echecStatut"))),
  });

  return (
    <div className="page">
      <div className="pl-toolbar">
        <div>
          <span className="eyebrow">{t("liste.surtitre")}</span>
          <h1 className="h1 titre-vue">{t("liste.titre")}</h1>
        </div>
        <span className="count-split">
          <b>{t("liste.compte", { n: taches.length })}</b>
          {` · ${t("liste.dontHorsProjet", { n: independantes })}`}
        </span>
        <div className="pl-toolbar-fin">
          <div className="seg" role="group" aria-label={t("liste.affichage")}>
            <Button aria-pressed={vue === "liste"} onPress={() => setVue("liste")}>
              {t("liste.affichageListe")}
            </Button>
            <Button aria-pressed={vue === "kanban"} onPress={() => setVue("kanban")}>
              {t("liste.affichageKanban")}
            </Button>
          </div>
          {peut("tasks:create") ? (
            <Button className="btn btn-primary" onPress={() => setCreationOuverte(true)}>
              {t("liste.creer")}
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
          aria-label={t("liste.rechercher")}
          placeholder={t("liste.rechercher")}
        />

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

        <Button className="chip-btn ligne-actions-fin" onPress={reinitialiser}>
          {t("liste.reinitialiser")}
        </Button>
      </div>

      {requete.isPending ? <Chargement quoi={t("lesTaches")} /> : null}
      {requete.isError ? (
        <ErreurDeChargement erreur={requete.error} surReessai={() => void requete.refetch()} />
      ) : null}

      {requete.data ? (
        taches.length === 0 ? (
          <div className="empty empty-encadre">
            <p>{t("liste.videTitre")}</p>
            <small>{filtreActif ? t("liste.videFiltres") : t("liste.videAucune")}</small>
            {filtreActif ? (
              <Button className="chip-btn" onPress={reinitialiser}>
                {t("liste.reinitialiserFiltres")}
              </Button>
            ) : peut("tasks:create") ? (
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
              de tableau : les lignes ne sont pas des cellules, et annoncer une
              structure de tableau qui n'en est pas une désoriente plus qu'elle
              n'aide. Chaque ligne porte son contexte dans son propre contenu.
            */}
            <div className="tgrid thead" aria-hidden="true">
              <span>{t("liste.colTache")}</span>
              <span className="c-proj">{t("liste.colRattachement")}</span>
              <span className="c-mile">{t("liste.colJalon")}</span>
              <span className="c-who">{t("liste.colAssignes")}</span>
              <span className="c-when">{t("liste.colEcheance")}</span>
              <span className="c-est">{t("liste.colEstime")}</span>
              <span>{t("liste.colStatut")}</span>
            </div>
            {taches.map((tache) => (
              <LigneTache
                key={tache.id}
                tache={tache}
                modifiable={peut("tasks:update")}
                surStatut={(statut) => changerStatut.mutate({ tache, statut })}
              />
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

/** La pastille de rattachement : projet identifié, ou hors projet assumé. */
export function PastilleRattachement({
  projet,
}: {
  projet: { nom: string; icone?: string | null } | null;
}) {
  const { t } = useTranslation("taches");
  if (!projet) {
    return (
      <span className="pchip is-indep">
        <span className="dot-ind" aria-hidden="true" />
        <span>{t("tacheIndependante")}</span>
      </span>
    );
  }
  return (
    <span className="pchip">
      <span className="picon" aria-hidden="true">
        {projet.icone ?? "◇"}
      </span>
      <span>{projet.nom}</span>
    </span>
  );
}

function LigneTache({
  tache,
  modifiable,
  surStatut,
}: {
  tache: api.LigneTache;
  modifiable: boolean;
  surStatut: (statut: string) => void;
}) {
  const { t } = useTranslation("taches");
  const libelle = useLibelle();

  return (
    <div className="tgrid trow2">
      <div className="bloc-etroit">
        {/* Le titre porte le lien : la ligne entière ne peut pas l'être,
            elle contient une liste déroulante de statut. */}
        <p className="t2-name">
          <Link to="/taches/$id" params={{ id: tache.id }}>
            {tache.titre}
          </Link>
        </p>
        <span className="t2-sub">
          <Pastille code={tache.priorite} vocabulaire={PRIORITES} />
          {tache.enRetard ? <span className="pill badge-late">{t("enRetard")}</span> : null}
          {tache.interventionExterieure ? (
            <span className="pill pill-ext" title={t("interventionExterieure")}>
              {t("ext")}
            </span>
          ) : null}
          {tache.avancement > 0 && tache.avancement < 100 ? (
            <span className="t2-when">{t("pourcent", { n: tache.avancement })}</span>
          ) : null}
        </span>
      </div>

      <div className="c-proj bloc-etroit">
        <PastilleRattachement projet={tache.project} />
      </div>

      <span className={`t2-mile c-mile${tache.milestone ? "" : " is-none"}`}>
        {tache.milestone?.nom ?? t("liste.sansJalon")}
      </span>

      <div className="avs c-who">
        {tache.assignes.length === 0 ? (
          <span className="t2-when">{t("liste.sansAssigne")}</span>
        ) : (
          <>
            {tache.assignes.slice(0, 3).map((a) => (
              <AvatarAgent key={a.userId} prenom={a.user.prenom} nom={a.user.nom} />
            ))}
            {tache.assignes.length > 3 ? (
              <span className="avs-more">+{formaterNombre(tache.assignes.length - 3)}</span>
            ) : null}
          </>
        )}
      </div>

      <span className={`t2-when c-when${tache.enRetard ? " is-late" : ""}`}>
        {tache.dateFin ? formaterDate(tache.dateFin) : t("sansEcheance")}
      </span>

      <span className="t2-est c-est">
        {tache.estimationHeures ? t("heures", { n: Number(tache.estimationHeures) }) : "—"}
      </span>

      <select
        className="mini-select"
        value={tache.statut}
        disabled={!modifiable}
        aria-label={t("liste.statutDe", { titre: tache.titre })}
        onChange={(e) => surStatut(e.target.value)}
      >
        {STATUTS_TACHE.map((s) => (
          <option key={s.code} value={s.code}>
            {libelle(s.code, STATUTS_TACHE)}
          </option>
        ))}
      </select>
    </div>
  );
}
