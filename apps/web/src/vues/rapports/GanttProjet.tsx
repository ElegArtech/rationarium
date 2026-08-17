import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button, Menu, MenuItem, MenuTrigger, Popover } from "react-aria-components";
import * as apiTaches from "../../api/taches.js";
import * as apiProjets from "../../api/projets.js";
import { messageErreur } from "../../api/erreurs.js";
import { usePeut } from "../../session/session.js";
import { Chargement, ErreurDeChargement, AccesRefuse } from "../../composants/etats.js";
import { Fenetre } from "../../composants/fenetre.js";
import { useMessages } from "../../composants/messages.js";
import { formaterDate, formaterMoisCourt, formaterNombre } from "../../formats.js";
import { CadreProjet } from "../projets/Fiche.js";
import "../../composants/partages.css";
import "./gantt.css";

/**
 * Vue 15 — projet, onglet Gantt.
 *
 * **Les flèches de dépendance deviennent illisibles au-delà d'une vingtaine de
 * tâches.** Le brief l'anticipe et donne la réponse : ne les afficher qu'à la
 * sélection. C'est ce que fait cette vue par défaut ; la case « Afficher toutes
 * les dépendances » de la maquette lève la restriction, et **dit alors ce qu'on
 * y perd** plutôt que de laisser découvrir l'illisibilité.
 *
 * Aucune bibliothèque de Gantt (`cadrage/03 § 4, D12`). Les barres sont
 * positionnées en pixels par jour, les flèches sont un `<svg>` superposé. Les
 * jetons portent les couleurs : les deux thèmes suivent.
 *
 * **`EX-TSK-12` — les incohérences de dates sont signalées, jamais interdites.**
 * Une tâche qui commence avant la fin de ce dont elle dépend reste affichable :
 * le bandeau la nomme, la barre passe en trait discontinu, la flèche vire au
 * rouge. Le produit ne corrige pas à la place de l'utilisateur ; il lui montre.
 */

const ECHELLES = ["jour", "semaine", "mois"] as const;
type Echelle = (typeof ECHELLES)[number];

/** La largeur d'une unité de temps, en pixels, selon l'échelle. */
const LARGEUR: Record<Echelle, number> = { jour: 34, semaine: 14, mois: 5 };

const HAUTEUR_LIGNE = 34;
const HAUTEUR_GROUPE = 30;

/**
 * Le seuil au-delà duquel la maquette avertit sur la lisibilité des flèches.
 * Le brief parle « d'une vingtaine » ; la maquette prévient dès la treizième,
 * pour laisser le temps de refermer avant que ce soit illisible.
 */
const SEUIL_FLECHES = 12;

/**
 * Le jour civil d'une date, en millisecondes.
 *
 * L'API rend des horodatages complets (`2024-08-16T00:00:00.000Z`), pas des
 * dates seules. Concaténer `T00:00:00.000Z` à une valeur qui en porte déjà un
 * donne une date invalide, donc `NaN`, donc un `Math.min` à `NaN` — et
 * `new Date(NaN).toISOString()` **lève**. On tronque au jour avant de composer.
 */
const jourDe = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00.000Z`).getTime();

/** Le numéro de semaine, repris de la maquette — il n'étiquette qu'une graduation. */
const semaineDe = (d: Date) => {
  const debutAnnee = Date.UTC(d.getUTCFullYear(), 0, 1);
  const jourDeLAn = new Date(debutAnnee).getUTCDay();
  return Math.ceil(((d.getTime() - debutAnnee) / JOUR_MS + jourDeLAn + 1) / 7);
};
const JOUR_MS = 86_400_000;

/** Un décalage de dates lu à l'écran : la même valeur en jours dans les deux sens. */
const jourIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

type Conflit = { tache: apiTaches.LigneTache; prerequis: apiTaches.LienDependance };

export function GanttProjet({ projetId }: { projetId: string }) {
  const { t } = useTranslation("rapports");
  const { t: tErreurs } = useTranslation("erreurs");
  const peut = usePeut();
  const annoncer = useMessages();
  const client = useQueryClient();

  const [echelle, setEchelle] = useState<Echelle>("semaine");
  const [selection, setSelection] = useState<string | null>(null);
  const [toutesDependances, setToutesDependances] = useState(false);
  const [conflitsDeplies, setConflitsDeplies] = useState(false);
  const [dependancesDe, setDependancesDe] = useState<apiTaches.LigneTache | null>(null);
  const [cascade, setCascade] = useState<{
    tache: apiTaches.LigneTache;
    jours: number;
    touchees: { id: string; titre: string }[];
  } | null>(null);

  const projet = useQuery({ queryKey: ["projet", projetId], queryFn: () => apiProjets.fiche(projetId) });

  const taches = useQuery({
    queryKey: ["taches", { projectId: projetId }],
    queryFn: () => apiTaches.lister({ projectId: projetId }),
    enabled: peut("tasks:read"),
  });

  const route = useQuery({
    queryKey: ["projet", projetId, "route"],
    queryFn: () => apiProjets.feuilleDeRoute(projetId),
    enabled: peut("milestones:read"),
  });

  const datees = useMemo(
    () => (taches.data ?? []).filter((x) => x.dateDebut !== null && x.dateFin !== null),
    [taches.data],
  );

  /**
   * Les prérequis, tâche par tâche.
   *
   * `_count.dependances` dit lesquelles en ont : celles qui n'en ont aucune ne
   * déclenchent aucun appel. C'est ce qui rend le bandeau d'incohérences
   * tenable — il lui faut le graphe entier, pas seulement la branche
   * sélectionnée, et une lecture par tâche datée serait un appel par ligne.
   */
  const aPrerequis = useMemo(
    () => datees.filter((x) => x._count.dependances > 0),
    [datees],
  );
  const resultatsLiens = useQueries({
    queries: aPrerequis.map((x) => ({
      queryKey: ["taches", x.id, "dependances"],
      queryFn: () => apiTaches.dependances(x.id),
      enabled: peut("tasks:read"),
    })),
  });

  /** `id de la tâche → ses prérequis`. Recalculé à chaque passage : il est petit. */
  const liens = new Map<string, apiTaches.LienDependance[]>();
  aPrerequis.forEach((tache, i) => {
    const donnees = resultatsLiens[i]?.data;
    if (donnees) liens.set(tache.id, donnees.dependDe);
  });

  /**
   * `EX-TSK-12` — une tâche ne devrait pas commencer avant la fin de ce dont
   * elle dépend. Le prérequis peut appartenir à un **autre projet** : il n'est
   * alors pas sur la frise, mais l'incohérence existe quand même et se nomme.
   */
  const conflits: Conflit[] = [];
  for (const tache of datees) {
    for (const prerequis of liens.get(tache.id) ?? []) {
      if (prerequis.dateFin && jourDe(prerequis.dateFin) > jourDe(tache.dateDebut!)) {
        conflits.push({ tache, prerequis });
      }
    }
  }
  const idsEnConflit = new Set(conflits.map((c) => c.tache.id));

  const rafraichir = () => {
    void client.invalidateQueries({ queryKey: ["taches"] });
    void client.invalidateQueries({ queryKey: ["projet", projetId] });
  };

  /**
   * Le décalage d'une tâche.
   *
   * **On demande avant d'écrire.** La maquette enregistre la tâche puis propose
   * la cascade ; le serveur, lui, décale la tâche **et** ses dépendantes dans
   * une seule transaction (`POST /taches/:id/cascade`). Écrire d'abord
   * obligerait à décaler deux fois la tâche pilote, ou à défaire ce qu'on vient
   * d'écrire. L'aperçu (`GET .../cascade`) donne le nombre avant toute écriture,
   * ce que `EX-TSK-13` exige de toute façon.
   */
  const decaler = useMutation({
    mutationFn: async ({ tache, jours }: { tache: apiTaches.LigneTache; jours: number }) => {
      const touchees = await apiTaches.apercuCascade(tache.id, jours);
      return { tache, jours, touchees };
    },
    onSuccess: (donnees) => {
      if (donnees.touchees.length > 0) {
        setCascade(donnees);
        return;
      }
      seulementCetteTache.mutate({ tache: donnees.tache, jours: donnees.jours });
    },
    onError: (e) => annoncer("err", messageErreur(e, tErreurs, t("ganttProjet.echecDecalage"))),
  });

  const seulementCetteTache = useMutation({
    mutationFn: ({ tache, jours }: { tache: apiTaches.LigneTache; jours: number }) =>
      apiTaches.modifier(tache.id, {
        version: tache.version,
        dateDebut: jourIso(jourDe(tache.dateDebut!) + jours * JOUR_MS),
        dateFin: jourIso(jourDe(tache.dateFin!) + jours * JOUR_MS),
      }),
    onSuccess: () => {
      setCascade(null);
      annoncer("ok", t("ganttProjet.datesMisesAJour"));
      rafraichir();
    },
    onError: (e) => annoncer("err", messageErreur(e, tErreurs, t("ganttProjet.echecDecalage"))),
  });

  const decalerLaSuite = useMutation({
    mutationFn: ({ tache, jours }: { tache: apiTaches.LigneTache; jours: number }) =>
      apiTaches.decalerEnCascade(tache.id, jours),
    onSuccess: (donnees) => {
      setCascade(null);
      annoncer("ok", t("ganttProjet.tachesDecalees", { n: donnees.decalees }));
      rafraichir();
    },
    onError: (e) => annoncer("err", messageErreur(e, tErreurs, t("ganttProjet.echecDecalage"))),
  });

  if (!peut("tasks:read")) return <AccesRefuse />;
  if (projet.isPending) return <Chargement quoi={t("ganttProjet.leProjet")} />;
  if (projet.isError)
    return <ErreurDeChargement erreur={projet.error} surReessai={() => void projet.refetch()} />;

  const modifiable = peut("tasks:manage_dependencies");

  return (
    <CadreProjet projet={projet.data} onglet="gantt">
      {taches.isPending ? <Chargement quoi={t("ganttProjet.lesTaches")} /> : null}
      {taches.isError ? (
        <ErreurDeChargement erreur={taches.error} surReessai={() => void taches.refetch()} />
      ) : null}

      {taches.data ? (
        datees.length === 0 ? (
          <div className="empty empty-encadre">
            <p>{t("ganttProjet.videTitre")}</p>
            <small>{t("ganttProjet.videAide")}</small>
            <Link
              to="/projets/$id/taches"
              params={{ id: projetId }}
              className="btn btn-primary"
              activeProps={{ className: "" }}
            >
              {t("ganttProjet.ouvrirLesTaches")}
            </Link>
          </div>
        ) : (
          <>
            {/* `EX-TSK-12` — signalé en tête, replié au-delà du premier : une
                liste de quinze incohérences repousserait la frise hors de
                l'écran, et c'est la frise qu'on est venu voir. */}
            {conflits.length > 0 ? (
              <div className="alert alert-warn bandeau-conflits" role="status">
                <div className="bandeau-conflits-corps">
                  <span className="alert-icon" aria-hidden="true">
                    !
                  </span>
                  <div className="bandeau-conflits-texte">
                    <strong>{t("ganttProjet.conflitsTitre")}</strong>
                    <ul className="conf-list">
                      {(conflitsDeplies ? conflits : conflits.slice(0, 1)).map((c) => (
                        <li key={`${c.tache.id}-${c.prerequis.id}`}>
                          <span className="conf-k">{formaterDate(c.tache.dateDebut!)}</span>
                          <span>
                            {t("ganttProjet.conflitPhrase", {
                              tache: c.tache.titre,
                              prerequis: c.prerequis.titre,
                              date: formaterDate(c.prerequis.dateFin ?? null),
                            })}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  {conflits.length > 1 ? (
                    <Button
                      className="chip-btn"
                      onPress={() => setConflitsDeplies((v) => !v)}
                      aria-expanded={conflitsDeplies}
                    >
                      {conflitsDeplies
                        ? t("ganttProjet.reduire")
                        : t("ganttProjet.voirAutresConflits", { n: conflits.length - 1 })}
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}

            {/* La barre de la section 19 : `.filters`, pas un nom propre à cette
                vue. `g-echelle` et `g-indice` étaient deux inventions — aucune
                maquette ne les porte — et `.filters` emporte au passage sa règle
                d'impression, que ces deux-là n'avaient pas. */}
            <div className="filters">
              <span className="panel-title">{t("ganttProjet.echelle")}</span>
              <div className="seg" role="group" aria-label={t("ganttProjet.echelle")}>
                {ECHELLES.map((e) => (
                  <button
                    key={e}
                    type="button"
                    aria-pressed={e === echelle}
                    onClick={() => setEchelle(e)}
                  >
                    {t(`ganttProjet.echelle_${e}`)}
                  </button>
                ))}
              </div>
              <span className="vsep" />
              <label className="layer is-on">
                <input
                  type="checkbox"
                  checked={toutesDependances}
                  onChange={(e) => setToutesDependances(e.target.checked)}
                />
                <span>{t("ganttProjet.toutesDependances")}</span>
              </label>
              {/* Le brief : « les flèches deviennent illisibles au-delà d'une
                  vingtaine de tâches ». Lever la restriction est permis ; le
                  faire sans le dire ne l'est pas. */}
              {toutesDependances && datees.length > SEUIL_FLECHES ? (
                <span className="field-hint alerte-lisibilite">
                  {t("ganttProjet.alerteLisibilite", { n: datees.length })}
                </span>
              ) : null}
              {/* L'indice de la maquette, mot pour mot : sans lui, la sélection
                  et le double-clic ne se découvrent pas. */}
              <span className="field-hint pl-toolbar-fin">{t("ganttProjet.indice")}</span>
            </div>

            <Grille
              taches={datees}
              jalons={route.data?.jalons ?? []}
              echelle={echelle}
              selection={selection}
              surSelection={setSelection}
              liens={liens}
              idsEnConflit={idsEnConflit}
              toutesDependances={toutesDependances}
              modifiable={modifiable}
              surDependances={setDependancesDe}
              surDecalage={(tache, jours) => decaler.mutate({ tache, jours })}
            />
          </>
        )
      ) : null}

      {dependancesDe ? (
        <FenetreDependances
          tache={dependancesDe}
          candidates={datees}
          prerequisActuels={liens.get(dependancesDe.id) ?? []}
          surFermeture={() => setDependancesDe(null)}
          surEnregistrement={rafraichir}
        />
      ) : null}

      <FenetreCascade
        cascade={cascade}
        datesConnues={datees}
        surFermeture={() => setCascade(null)}
        surSeuleLaTache={(tache, jours) => seulementCetteTache.mutate({ tache, jours })}
        surToutDecaler={(tache, jours) => decalerLaSuite.mutate({ tache, jours })}
      />
    </CadreProjet>
  );
}

function Grille({
  taches,
  jalons,
  echelle,
  selection,
  surSelection,
  liens,
  idsEnConflit,
  toutesDependances,
  modifiable,
  surDependances,
  surDecalage,
}: {
  taches: apiTaches.LigneTache[];
  jalons: { id: string; nom: string; dateEcheance: string | null; statut: string }[];
  echelle: Echelle;
  selection: string | null;
  surSelection: (id: string | null) => void;
  liens: Map<string, apiTaches.LienDependance[]>;
  idsEnConflit: Set<string>;
  toutesDependances: boolean;
  modifiable: boolean;
  surDependances: (tache: apiTaches.LigneTache) => void;
  surDecalage: (tache: apiTaches.LigneTache, jours: number) => void;
}) {
  const { t } = useTranslation("rapports");

  /**
   * `EX-JAL-…` — les tâches sont **regroupées par jalon**, dans l'ordre de la
   * feuille de route. Celles qui n'en portent pas forment un groupe nommé
   * plutôt que de flotter en tête sans explication.
   */
  const groupes = useMemo(() => {
    const parJalon = new Map<string, apiTaches.LigneTache[]>();
    for (const tache of taches) {
      const cle = tache.milestone?.id ?? "";
      parJalon.set(cle, [...(parJalon.get(cle) ?? []), tache]);
    }
    const ordonnes = jalons
      .filter((j) => parJalon.has(j.id))
      .map((j) => ({
        id: j.id,
        nom: j.nom,
        dateEcheance: j.dateEcheance,
        statut: j.statut,
        taches: parJalon.get(j.id)!,
      }));
    const sans = parJalon.get("");
    return sans
      ? [
          ...ordonnes,
          { id: "", nom: t("ganttProjet.sansJalon"), dateEcheance: null, statut: "", taches: sans },
        ]
      : ordonnes;
  }, [taches, jalons, t]);

  /**
   * La plage temporelle.
   *
   * **Elle couvre les jalons autant que les tâches.** La calculer sur les
   * seules tâches laissait tomber hors cadre toute échéance antérieure à la
   * première tâche ou postérieure à la dernière — c'est-à-dire, précisément,
   * les jalons en retard et ceux à venir, les deux qu'on cherche à voir. La
   * maquette cadre large pour la même raison.
   */
  const plage = useMemo(() => {
    const bornes = [
      ...taches.map((x) => jourDe(x.dateDebut!)),
      ...taches.map((x) => jourDe(x.dateFin!)),
      ...groupes.filter((g) => g.dateEcheance).map((g) => jourDe(g.dateEcheance!)),
    ];
    // Une marge d'un jour de part et d'autre : une barre collée au bord se lit
    // comme une barre coupée.
    return { debut: Math.min(...bornes) - JOUR_MS, fin: Math.max(...bornes) + JOUR_MS };
  }, [taches, groupes]);

  const debut = plage.debut;
  const jours = Math.max(1, Math.round((plage.fin - plage.debut) / JOUR_MS));
  /** Pixels par jour — le repère unique de toute la frise, comme la maquette. */
  const ppd = LARGEUR[echelle];
  const largeur = jours * ppd;
  const x = (ms: number) => ((ms - plage.debut) / JOUR_MS) * ppd;
  /** Le jour `i` de la plage, à minuit UTC — `jourDe` compose en UTC. */
  const jourA = (i: number) => new Date(plage.debut + i * JOUR_MS);

  /**
   * La bande des mois et celle des unités.
   *
   * La maquette nomme chaque mois traversé et découpe les unités selon
   * l'échelle : un pas par jour, par semaine ISO ou par mois. Une bande unique
   * portant « début → fin », comme nous le faisions, ne situe rien : c'est la
   * graduation qui fait lire une position.
   */
  const bandes = useMemo(() => {
    // Le calcul ne dépend que de la plage, de l'échelle et du pas : il refait
    // son propre `jourA` plutôt que de capturer celui du rendu, qui changerait
    // d'identité à chaque passage et annulerait la mémoïsation.
    const jourA = (i: number) => new Date(debut + i * JOUR_MS);
    const mois: { cle: string; libelle: string; largeur: number }[] = [];
    let i = 0;
    while (i < jours) {
      const d0 = jourA(i);
      const finDeMois = Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() + 1, 0);
      const dernier = Math.min(jours - 1, Math.round((finDeMois - debut) / JOUR_MS));
      const n = dernier - i + 1;
      mois.push({ cle: `${d0.getUTCFullYear()}-${d0.getUTCMonth()}`, libelle: formaterMoisCourt(d0), largeur: n * ppd });
      i = dernier + 1;
    }

    const unites: { cle: string; libelle: string; largeur: number; lundi: boolean; chome: boolean }[] = [];
    if (echelle === "jour") {
      for (let k = 0; k < jours; k += 1) {
        const d0 = jourA(k);
        const j = d0.getUTCDay();
        unites.push({
          cle: String(k),
          libelle: String(d0.getUTCDate()),
          largeur: ppd,
          lundi: j === 1,
          chome: j === 0 || j === 6,
        });
      }
    } else if (echelle === "semaine") {
      let k = 0;
      while (k < jours) {
        const d0 = jourA(k);
        // Le reste de la semaine en cours : la première peut être entamée.
        const n = Math.min(7 - ((d0.getUTCDay() + 6) % 7), jours - k);
        unites.push({ cle: String(k), libelle: `S${semaineDe(d0)}`, largeur: n * ppd, lundi: true, chome: false });
        k += n;
      }
    } else {
      for (const m of mois) {
        unites.push({
          cle: m.cle,
          libelle: t("ganttProjet.nJours", { n: Math.round(m.largeur / ppd) }),
          largeur: m.largeur,
          lundi: true,
          chome: false,
        });
      }
    }
    return { mois, unites };
  }, [jours, ppd, echelle, debut, t]);

  /**
   * La position verticale de chaque tâche, pour les barres et les flèches, et
   * celle de chaque ligne de groupe, où se pose le losange du jalon.
   */
  const lignes = useMemo(() => {
    const positions = new Map<string, number>();
    const sommetsDeGroupe = new Map<string, number>();
    const filets: number[] = [];
    let y = 0;
    for (const g of groupes) {
      sommetsDeGroupe.set(g.id, y);
      y += HAUTEUR_GROUPE;
      filets.push(y);
      for (const tache of g.taches) {
        positions.set(tache.id, y);
        y += HAUTEUR_LIGNE;
        filets.push(y);
      }
    }
    return { positions, sommetsDeGroupe, filets, hauteur: y };
  }, [groupes]);

  const aujourdhui = Date.now();
  const dansLaPlage = aujourdhui >= plage.debut && aujourdhui <= plage.fin;

  return (
    /*
     * Un cadre défilant doit être atteignable au clavier — `axe` le refuse en
     * « serious » (`scrollable-region-focusable`). Les barres sont focalisables,
     * mais le défilement horizontal, lui, ne l'est que par le conteneur.
     */
    <div className="gantt" tabIndex={0} role="region" aria-label={t("ganttProjet.frise")}>
      <div className="g-grid">
        <div className="g-left">
          <div className="g-lhead">
            <span className="eyebrow">{t("ganttProjet.colonneTaches")}</span>
          </div>
          {groupes.map((g) => (
            <div key={g.id || "sans"}>
              <div className="g-grp">
                <span className="grp-caret" aria-hidden="true">
                  ▾
                </span>
                <span className="g-grp-name">{g.nom}</span>
                {g.dateEcheance ? (
                  <span className="g-row-dates">{formaterDate(g.dateEcheance)}</span>
                ) : null}
              </div>
              {g.taches.map((tache) => (
                <div
                  className={`g-row${selection === tache.id ? " is-sel" : ""}`}
                  key={tache.id}
                >
                  <span className="g-row-name">{tache.titre}</span>
                  <span className="g-row-dates">
                    {formaterDate(tache.dateDebut!)} → {formaterDate(tache.dateFin!)}
                  </span>
                  {/*
                    `C6` — l'alternative clavier au glisser-déposer. Elle nomme
                    ce qu'elle fait : « Décaler d'une semaine plus tard » se
                    comprend, s'annonce et se teste, là où une traînée simulée
                    ne laisse aucune prise. Le même menu porte la modification
                    des dépendances, seule voie clavier vers le double-clic.
                  */}
                  {modifiable ? (
                    <MenuTrigger>
                      <Button
                        className="gmove"
                        aria-label={t("ganttProjet.actionsDe", { titre: tache.titre })}
                      >
                        <span aria-hidden="true">⇄</span>
                      </Button>
                      <Popover>
                        <Menu
                          className="pop pop-sm"
                          onAction={(cle) => {
                            if (cle === "deps") surDependances(tache);
                            else surDecalage(tache, Number(cle));
                          }}
                        >
                          <MenuItem className="pop-action" id="-7">
                            {t("ganttProjet.decalerSemaineAvant")}
                          </MenuItem>
                          <MenuItem className="pop-action" id="-1">
                            {t("ganttProjet.decalerJourAvant")}
                          </MenuItem>
                          <MenuItem className="pop-action" id="1">
                            {t("ganttProjet.decalerJourApres")}
                          </MenuItem>
                          <MenuItem className="pop-action" id="7">
                            {t("ganttProjet.decalerSemaineApres")}
                          </MenuItem>
                          <MenuItem className="pop-action" id="deps">
                            {t("ganttProjet.modifierDependances")}
                          </MenuItem>
                        </Menu>
                      </Popover>
                    </MenuTrigger>
                  ) : null}
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className="g-right" style={{ width: `${largeur}px` }}>
          <div className="g-head">
            <div className="g-months">
              {bandes.mois.map((m) => (
                <span className="g-month" key={m.cle} style={{ width: `${m.largeur}px` }}>
                  {m.libelle}
                </span>
              ))}
            </div>
            <div className="g-units">
              {bandes.unites.map((u) => (
                <div
                  className={`g-unit${u.lundi ? " is-mon" : ""}${u.chome ? " is-off" : ""}`}
                  key={u.cle}
                  style={{ width: `${u.largeur}px` }}
                >
                  {u.libelle}
                </div>
              ))}
            </div>
          </div>

          <div className="g-body" style={{ height: `${lignes.hauteur}px` }}>
            {/* Le fond de grille, sous les barres : bandes de fin de semaine,
                filet vertical du lundi, filet horizontal de chaque ligne. Sans
                eux, une barre flotte sans repère et sa date ne se lit pas.
                L'échelle « mois » s'en passe — la maquette aussi : à 5 px par
                jour, un filet par lundi devient une trame. */}
            {echelle === "mois"
              ? null
              : Array.from({ length: jours }, (_, k) => {
                  const j = jourA(k).getUTCDay();
                  if (j === 0 || j === 6) {
                    return (
                      <span
                        className="g-weekend"
                        key={`we${k}`}
                        style={{ left: `${k * ppd}px`, width: `${ppd}px` }}
                      />
                    );
                  }
                  if (j === 1) {
                    return (
                      <span className="g-colline is-strong" key={`cl${k}`} style={{ left: `${k * ppd}px` }} />
                    );
                  }
                  return null;
                })}

            {lignes.filets.map((haut) => (
              <span className="g-rowline" key={`rl${haut}`} style={{ top: `${haut - 1}px` }} />
            ))}

            {/* Le jalon sur la frise : un losange à son échéance, sur la ligne
                de son groupe. Terminé s'il ne reste aucune tâche à faire, en
                retard si l'échéance est passée sans cela. */}
            {groupes.map((g) => {
              if (!g.dateEcheance || g.id === "") return null;
              const echeance = jourDe(g.dateEcheance);
              const haut = lignes.sommetsDeGroupe.get(g.id) ?? 0;
              /*
               * `RG-JAL-01` — **le statut d'un jalon est calculé par le
               * serveur**, jamais redéduit ici. Le recalculer sur les seules
               * tâches datées de la frise ferait dire « terminé » à un jalon
               * dont une tâche sans dates reste ouverte : deux lectures d'une
               * même donnée qui se contredisent, et aucune boucle pour le voir.
               */
              const termine = g.statut === "done";
              const enRetard = !termine && echeance < aujourdhui;
              return (
                <span key={`ms${g.id}`}>
                  <span
                    className={`g-mile${termine ? " is-done" : enRetard ? " is-late" : ""}`}
                    style={{ left: `${x(echeance)}px`, top: `${haut + 7}px` }}
                    role="img"
                    aria-label={t("ganttProjet.libelleJalon", {
                      nom: g.nom,
                      date: formaterDate(g.dateEcheance),
                    })}
                  />
                  <span
                    className="g-mile-lab"
                    style={{ left: `${x(echeance) + 12}px`, top: `${haut + 8}px` }}
                    aria-hidden="true"
                  >
                    {g.nom}
                  </span>
                </span>
              );
            })}

            {/* La ligne d'aujourd'hui, quand elle tombe dans la plage. La
                dessiner hors plage la collerait à un bord, où elle mentirait. */}
            {dansLaPlage ? (
              <span
                className="g-today"
                style={{ left: `${x(aujourdhui)}px` }}
                role="img"
                aria-label={t("ganttProjet.aujourdhui")}
              />
            ) : null}

            {groupes.map((g) =>
              g.taches.map((tache) => (
                <Barre
                  key={tache.id}
                  tache={tache}
                  x={x}
                  haut={lignes.positions.get(tache.id) ?? 0}
                  selection={selection}
                  lie={estLie(tache.id, selection, liens)}
                  enConflit={idsEnConflit.has(tache.id)}
                  surSelection={surSelection}
                  modifiable={modifiable}
                  surDependances={surDependances}
                />
              )),
            )}

            {/* `Attention` du brief — les flèches n'existent qu'à la sélection,
                sauf demande explicite. Le calque, lui, est toujours posé : la
                maquette le monte à vide, et le retirer ferait varier la pile de
                superposition selon la sélection. */}
            <Fleches
              selection={selection}
              liens={liens}
              positions={lignes.positions}
              taches={taches}
              toutes={toutesDependances}
              x={x}
              largeur={largeur}
              hauteur={lignes.hauteur}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Une tâche est liée à la sélection si l'une dépend de l'autre. */
function estLie(
  id: string,
  selection: string | null,
  liens: Map<string, apiTaches.LienDependance[]>,
): boolean {
  if (selection === null) return true;
  if (selection === id) return true;
  if ((liens.get(selection) ?? []).some((p) => p.id === id)) return true;
  return (liens.get(id) ?? []).some((p) => p.id === selection);
}

/**
 * Une barre du Gantt.
 *
 * `<button>` natif plutôt que celui de `react-aria-components` : la maquette
 * lui donne **deux** gestes de pointeur — le clic sélectionne, le double-clic
 * ouvre la modification des dépendances — et `Button` ne transmet que le
 * premier. Le comportement clavier, lui, est celui d'un bouton natif ; l'égalité
 * d'accès promise par `C6` est tenue par le menu de la ligne, pas par une
 * traînée simulée.
 */
function Barre({
  tache,
  x,
  haut,
  selection,
  lie,
  enConflit,
  surSelection,
  modifiable,
  surDependances,
}: {
  tache: apiTaches.LigneTache;
  x: (ms: number) => number;
  haut: number;
  selection: string | null;
  lie: boolean;
  enConflit: boolean;
  surSelection: (id: string | null) => void;
  /** `RG-GEN-06` — le double-clic n'ouvre rien à qui ne peut pas modifier. */
  modifiable: boolean;
  surDependances: (tache: apiTaches.LigneTache) => void;
}) {
  const { t } = useTranslation("rapports");
  const debut = jourDe(tache.dateDebut!);
  const fin = jourDe(tache.dateFin!);
  const attenue = selection !== null && !lie;

  return (
    <button
      type="button"
      className={`g-bar${selection === tache.id ? " is-sel" : ""}${attenue ? " is-dim" : ""}${
        enConflit ? " is-conflict" : ""
      }`}
      style={{
        color: `var(--st-${tache.statut})`,
        left: `${x(debut)}px`,
        width: `${Math.max(6, x(fin + JOUR_MS) - x(debut))}px`,
        top: `${haut + 8}px`,
      }}
      aria-pressed={selection === tache.id}
      aria-label={t("ganttProjet.libelleBarre", {
        titre: tache.titre,
        statut: t(`statuts.${tache.statut}`),
        debut: formaterDate(tache.dateDebut),
        fin: formaterDate(tache.dateFin),
        avancement: tache.avancement,
      })}
      onClick={() => surSelection(selection === tache.id ? null : tache.id)}
      onDoubleClick={() => {
        if (modifiable) surDependances(tache);
      }}
    >
      <span className="g-bar-fill" style={{ width: `${tache.avancement}%` }} />
      <span className="g-bar-lab">{tache.titre}</span>
    </button>
  );
}

/**
 * Les flèches de dépendance, en SVG.
 *
 * Elles relient la fin du prérequis au début de la tâche dépendante. Un tracé
 * en segments plutôt qu'une droite : une diagonale traverse les autres barres
 * et devient impossible à suivre dès qu'il y en a trois. Une flèche
 * **incohérente** — le prérequis finit après le début de sa dépendante — passe
 * en trait discontinu rouge : c'est la même information que le bandeau, là où
 * elle se lit géométriquement.
 */
function Fleches({
  selection,
  liens,
  positions,
  taches,
  toutes,
  x,
  largeur,
  hauteur,
}: {
  selection: string | null;
  liens: Map<string, apiTaches.LienDependance[]>;
  positions: Map<string, number>;
  taches: apiTaches.LigneTache[];
  toutes: boolean;
  x: (ms: number) => number;
  largeur: number;
  hauteur: number;
}) {
  const parId = new Map(taches.map((x2) => [x2.id, x2]));

  const traces: { cle: string; d: string; pointe: string; conflit: boolean }[] = [];
  for (const tache of taches) {
    for (const prerequis of liens.get(tache.id) ?? []) {
      const visible = toutes || (selection !== null && (selection === tache.id || selection === prerequis.id));
      if (!visible) continue;
      // Un prérequis d'un autre projet n'a pas de ligne sur cette frise : la
      // flèche n'aurait pas d'origine. L'incohérence, elle, reste au bandeau.
      const source = parId.get(prerequis.id);
      if (!source?.dateFin || !tache.dateDebut) continue;
      const ySource = (positions.get(prerequis.id) ?? 0) + 17;
      const yCible = (positions.get(tache.id) ?? 0) + 17;
      const xSource = x(jourDe(source.dateFin) + JOUR_MS);
      const xCible = x(jourDe(tache.dateDebut));
      const conflit = jourDe(source.dateFin) > jourDe(tache.dateDebut);

      const d =
        xCible > xSource + 16
          ? `M${xSource},${ySource} H${xSource + 9} V${yCible} H${xCible - 6}`
          : `M${xSource},${ySource} H${xSource + 9} V${Math.max(ySource, yCible) + 15} H${
              xCible - 14
            } V${yCible} H${xCible - 6}`;

      traces.push({
        cle: `${prerequis.id}-${tache.id}`,
        d,
        pointe: `${xCible - 6},${yCible - 3.5} ${xCible},${yCible} ${xCible - 6},${yCible + 3.5}`,
        conflit,
      });
    }
  }

  return (
    <svg className="g-arrows" width={largeur} height={hauteur} aria-hidden="true">
      {traces.map((tr) => (
        <g key={tr.cle}>
          <path d={tr.d} className={tr.conflit ? "is-conflict" : undefined} />
          <polygon points={tr.pointe} className={tr.conflit ? "is-conflict" : undefined} />
        </g>
      ))}
    </svg>
  );
}

/**
 * `EX-TSK-11` — la modification des dépendances.
 *
 * Le sélecteur montre **le conflit de dates au moment de cocher**, pas après
 * l'enregistrement : c'est la seule place où l'information change une décision.
 */
function FenetreDependances({
  tache,
  candidates,
  prerequisActuels,
  surFermeture,
  surEnregistrement,
}: {
  tache: apiTaches.LigneTache;
  candidates: apiTaches.LigneTache[];
  prerequisActuels: apiTaches.LienDependance[];
  surFermeture: () => void;
  surEnregistrement: () => void;
}) {
  const { t } = useTranslation("rapports");
  const { t: tErreurs } = useTranslation("erreurs");
  const annoncer = useMessages();

  const initiaux = useMemo(() => new Set(prerequisActuels.map((p) => p.id)), [prerequisActuels]);
  const [choisis, setChoisis] = useState<Set<string>>(initiaux);
  const [recherche, setRecherche] = useState("");

  const liste = candidates.filter(
    (c) =>
      c.id !== tache.id &&
      (recherche === "" || c.titre.toLowerCase().includes(recherche.toLowerCase())),
  );

  const enConflit = (c: apiTaches.LigneTache) =>
    choisis.has(c.id) && c.dateFin !== null && jourDe(c.dateFin) > jourDe(tache.dateDebut!);
  const nombreDeConflits = liste.filter(enConflit).length;

  const enregistrer = useMutation({
    mutationFn: async () => {
      for (const id of choisis) {
        if (!initiaux.has(id)) await apiTaches.ajouterDependance(tache.id, id);
      }
      for (const id of initiaux) {
        if (!choisis.has(id)) await apiTaches.retirerDependance(tache.id, id);
      }
    },
    onSuccess: () => {
      annoncer("ok", t("ganttProjet.dependancesEnregistrees"));
      surEnregistrement();
      surFermeture();
    },
    onError: (e) => annoncer("err", messageErreur(e, tErreurs, t("ganttProjet.echecDependances"))),
  });

  const basculer = (id: string) =>
    setChoisis((avant) => {
      const apres = new Set(avant);
      if (apres.has(id)) apres.delete(id);
      else apres.add(id);
      return apres;
    });

  return (
    <Fenetre
      ouverte
      surFermeture={surFermeture}
      categorie={t("ganttProjet.dependances")}
      titre={tache.titre}
      mention={
        t("ganttProjet.dependancesChoisies", { n: choisis.size }) +
        (nombreDeConflits > 0
          ? t("ganttProjet.dontConflits", { n: nombreDeConflits })
          : "")
      }
      actions={
        <>
          <Button className="btn btn-secondary" onPress={surFermeture}>
            {t("ganttProjet.annuler")}
          </Button>
          <Button
            className="btn btn-primary"
            isPending={enregistrer.isPending}
            onPress={() => enregistrer.mutate()}
          >
            {t("ganttProjet.enregistrer")}
          </Button>
        </>
      }
    >
      <p className="field-hint aide-fenetre">{t("ganttProjet.choisirPrerequis")}</p>
      <input
        className="f-input champ-large"
        type="search"
        value={recherche}
        onChange={(e) => setRecherche(e.target.value)}
        placeholder={t("ganttProjet.rechercherTache")}
        aria-label={t("ganttProjet.rechercherTache")}
      />
      <div className="dep-list">
        {liste.length === 0 ? (
          <div className="empty">
            <p>{t("ganttProjet.aucuneTacheTrouvee")}</p>
          </div>
        ) : (
          liste.map((c) => (
            <label className="dep" key={c.id}>
              <input
                type="checkbox"
                checked={choisis.has(c.id)}
                onChange={() => basculer(c.id)}
              />
              <span className="bloc-etroit">
                <span className="dep-name">{c.titre}</span>
                <span className="dep-sub">
                  {formaterDate(c.dateDebut)} → {formaterDate(c.dateFin)}
                </span>
              </span>
              {enConflit(c) ? (
                <span className="dep-warn">{t("ganttProjet.conflitDeDates")}</span>
              ) : null}
            </label>
          ))
        )}
      </div>
    </Fenetre>
  );
}

/**
 * `EX-TSK-13`, `RG-TSK-09` — le décalage en cascade.
 *
 * Le nombre de tâches touchées est **dans la question**, pas dans le résultat :
 * c'est ce qui distingue une action assumée d'un dégât collatéral.
 */
function FenetreCascade({
  cascade,
  datesConnues,
  surFermeture,
  surSeuleLaTache,
  surToutDecaler,
}: {
  cascade: {
    tache: apiTaches.LigneTache;
    jours: number;
    touchees: { id: string; titre: string }[];
  } | null;
  /** Les tâches de la frise : elles portent les dates que l'aperçu n'a pas. */
  datesConnues: apiTaches.LigneTache[];
  surFermeture: () => void;
  surSeuleLaTache: (tache: apiTaches.LigneTache, jours: number) => void;
  surToutDecaler: (tache: apiTaches.LigneTache, jours: number) => void;
}) {
  const { t } = useTranslation("rapports");
  if (!cascade) return null;
  const { tache, jours, touchees } = cascade;
  const debutDe = (id: string) => datesConnues.find((x) => x.id === id)?.dateDebut ?? null;

  return (
    <Fenetre
      ouverte
      surFermeture={surFermeture}
      categorie={t("ganttProjet.deplacementDeTache")}
      titre={tache.titre}
      mention={t("ganttProjet.mentionCascade")}
      actions={
        <>
          <Button className="btn btn-secondary" onPress={() => surSeuleLaTache(tache, jours)}>
            {t("ganttProjet.neRienDecaler")}
          </Button>
          <Button className="btn btn-primary" onPress={() => surToutDecaler(tache, jours)}>
            {t("ganttProjet.decalerNTaches", { n: touchees.length })}
          </Button>
        </>
      }
    >
      <p className="question-cascade">
        {t("ganttProjet.tacheDecaleeDe", { jours: formaterNombre(jours) })}{" "}
        {t("ganttProjet.decalerAussi", { n: touchees.length })}
      </p>
      <ul className="conf-list">
        {touchees.map((x) => (
          <li key={x.id}>
            <span className="conf-k">{formaterDate(debutDe(x.id))}</span>
            <span>{x.titre}</span>
          </li>
        ))}
      </ul>
    </Fenetre>
  );
}
