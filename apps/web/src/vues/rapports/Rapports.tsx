import { useMemo, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button, Menu, MenuItem, MenuTrigger, Popover } from "react-aria-components";
import * as api from "../../api/rapports.js";
import { ErreurApi } from "../../api/client.js";
import { usePeut } from "../../session/session.js";
import { Chargement, AccesRefuse } from "../../composants/etats.js";
import { MarqueurCalcule } from "../../composants/pastilles.js";
import { formaterDate, formaterNombre } from "../../formats.js";
import { GanttPortefeuille } from "./GanttPortefeuille.js";
import "../../composants/partages.css";
import "./rapports.css";

/**
 * Vue 30 — rapports et analytics. Section 34 de la maquette.
 *
 * **Inès ouvre cette page une fois par mois et doit comprendre en trente
 * secondes.** Tout est ordonné pour ça, et l'ordre n'est pas négociable :
 *
 * 1. l'**alerte** — ce qui demande une action ;
 * 2. les **indicateurs** puis la **santé du portefeuille** — l'état d'ensemble ;
 * 3. le **détail**, dans les onglets suivants, pour qui veut creuser.
 *
 * Chaque graphique porte **un état vide rédigé** (`RG-RPT-06`) : une zone
 * blanche se prend pour un défaut de chargement, et on la signale au support
 * au lieu d'en tirer la conclusion — qu'il n'y a rien à voir.
 *
 * Aucune bibliothèque de graphiques (`cadrage/03 § 4, D12`). Les barres sont
 * des `<div>` en pourcentage, la courbe un `<svg>` calculé.
 */

const PERIODES = ["semaine", "mois", "trimestre", "annee"] as const;
const ONGLETS = ["over", "adv", "gantt"] as const;
type Onglet = (typeof ONGLETS)[number];

/** Le filtre de périmètre de la barre d'activité — repris de la maquette. */
export type Portee = "" | "active" | "risk";

/**
 * `EX-RPT-02`, `RG-RPT-06` — **les projets que la portée retient.**
 *
 * Les deux filtres de la barre — « Projets » et « Responsable » — étaient
 * appliqués ICI, aux lignes déjà reçues, et ne restreignaient donc que le
 * tableau « Santé des projets » et deux des quatre indicateurs. « Avancement
 * réel et attendu », « Complétion des jalons », « Ce qui est en retard »,
 * « Répartition de charge », les répartitions par priorité et par statut,
 * « Activité récente » et le Gantt portefeuille les ignoraient : ils sont
 * agrégés par le serveur, sur une population que le client ne peut pas
 * réduire après coup. Sur un périmètre à zéro projet, « Avancement moyen »
 * restait à 50 % et « Jalons échus tenus » à 13/20.
 *
 * Un filtre est une propriété du point d'entrée. La portée se traduit donc en
 * **liste d'identifiants de projets**, que `GET /rapports` sait déjà prendre —
 * `EX-RPT-02` demande précisément « filtrer par projet et par responsable ».
 */
export function idsDeLaPortee(sante: api.SanteLigne[], portee: Portee): string[] {
  return sante
    .filter((l) => (portee === "risk" ? l.sante !== "good" : true))
    .filter((l) => (portee === "active" ? l.completion < 100 : true))
    .map((l) => l.id);
}

/**
 * `RG-RPT-06`, `RG-GEN-05` — **le portefeuille vide, module par module.**
 *
 * Quand la portée ne retient aucun projet, il n'y a rien à demander au
 * serveur : une liste d'identifiants vide se laisse tomber à la sérialisation
 * et le portefeuille ENTIER reviendrait — l'exact contraire du filtre qu'on
 * vient de poser, et la cause de « Avancement moyen : 50 % » sur zéro projet.
 * On rend donc un jeu à zéro, dont chaque panneau déclenche son propre état
 * vide rédigé, plutôt qu'une page qui ment.
 */
export function vueVide(periode: api.VueEnsemble["periode"]): api.VueEnsemble {
  return {
    periode,
    alerte: { tachesEnRetard: 0 },
    progression: { projets: [], total: 0 },
    charge: { agents: [], moyenne: 0, surcharges: 0 },
    sante: [],
    tendance: {
      points: [],
      historiqueSuffisant: false,
      moyenne: 0,
      gain: 0,
      stagnation: false,
      /* Aucun relevé écarté : il n'y a aucun projet retenu, donc aucun relevé.
         Le seuil, lui, est celui du produit — la vue vide ne l'invente pas
         plus bas que le serveur, sans quoi l'état vide annoncerait un minimum
         que personne n'applique. */
      relevesHorsFenetre: 0,
      minimumRequis: 4,
    },
    jalons: {
      total: 0,
      aTemps: 0,
      enRetard: 0,
      aVenir: 0,
      echus: 0,
      retards: [],
      retardsNonListes: 0,
    },
    repartitions: { priorite: [], statut: [], actives: 0 },
    activite: {
      terminees: 0,
      creees: 0,
      passeesEnRetard: 0,
      ratio: null,
      interpretation: null,
    },
  };
}

/** `RG-RPT-02` — la liste de santé est plafonnée, et le plafond est annoncé. */
const PLAFOND_SANTE = 10;

const COULEUR_SANTE: Record<string, string> = {
  good: "var(--st-done)",
  warning: "var(--st-review)",
  critical: "var(--st-blocked)",
};

export function Rapports() {
  const { t, i18n } = useTranslation("rapports");
  const peut = usePeut();
  const [periode, setPeriode] = useState<api.Periode>("mois");
  const [portee, setPortee] = useState<Portee>("");
  const [responsable, setResponsable] = useState("");
  const [onglet, setOnglet] = useState<Onglet>("over");

  /*
   * **Deux requêtes, et une seule quand rien n'est filtré.**
   *
   * `base` est le portefeuille SANS filtre. Il sert à deux choses qu'un jeu
   * déjà filtré ne pourrait plus dire : la liste des responsables offerts au
   * choix — filtrée, elle ne proposerait que celui qu'on a déjà choisi — et la
   * traduction de la portée en identifiants de projets.
   *
   * Sans filtre, `filtree` reste **désactivée** : une seule requête part, et la
   * page se sert de `base`. La seconde n'existe que pour un écran réellement
   * restreint.
   */
  const base = useQuery({
    queryKey: ["rapports", periode],
    queryFn: () => api.vueEnsemble({ periode }),
  });

  const idsRetenus = useMemo(
    () => idsDeLaPortee(base.data?.sante ?? [], portee),
    [base.data, portee],
  );

  const filtreActif = portee !== "" || responsable !== "";
  const aucunProjetRetenu = portee !== "" && base.isSuccess && idsRetenus.length === 0;
  const filtres: api.FiltresRapport = {
    periode,
    ...(portee !== "" ? { projets: idsRetenus } : {}),
    ...(responsable !== "" ? { responsables: [responsable] } : {}),
    /*
     * `RG-GEN-08` — **la langue accompagne la demande d'export.** Le serveur
     * rend le fichier lui-même, sans navigateur pour le traduire et sans
     * langue de session à lire : il ne peut que la recevoir. Elle vit dans les
     * filtres et `adresseExport` la pose ; `query()` ne la reprend pas, les
     * lectures de rapport ne s'en trouvent donc pas modifiées.
     */
    langue: i18n.language,
  };

  const filtree = useQuery({
    queryKey: ["rapports", periode, portee, responsable, idsRetenus.join(",")],
    queryFn: () => api.vueEnsemble(filtres),
    /* `base.isSuccess` suffit : la seconde requête ne part jamais avant que la
       première ait été servie, donc jamais quand la lecture est refusée. */
    enabled: filtreActif && !aucunProjetRetenu && base.isSuccess,
  });

  /*
   * `RG-ADM-03`, `RG-GEN-06` — **le refus se prononce au SERVEUR.**
   *
   * DÉFAUT ACTIF CORRIGÉ (P-91, même forme que la vue 33). La requête portait
   * `enabled: peut(…)` et la vue rendait le refus avant tout appel : rien
   * n'atteignait `permissions.garde.ts`, seul endroit du produit qui TRACE un
   * accès refusé. Le masque de courtoisie porte sur les commandes d'écriture,
   * jamais sur la lecture d'une vue entière.
   */
  if (base.error instanceof ErreurApi && base.error.statut === 403)
    return <AccesRefuse />;

  const donnees = aucunProjetRetenu
    ? base.data
      ? vueVide(base.data.periode)
      : undefined
    : filtreActif
      ? filtree.data
      : base.data;

  const enChargement =
    base.isPending || (filtreActif && !aucunProjetRetenu && !filtree.isSuccess && !filtree.isError);
  const enErreur = base.isError || filtree.isError;
  const actualiser = () => {
    void base.refetch();
    if (filtreActif) void filtree.refetch();
  };

  /*
   * `RG-GEN-08` — l'export part avec la langue du lecteur ET les filtres
   * posés. Il rendait un fichier identique en français et en anglais, sur le
   * portefeuille entier quel que soit l'écran qu'on venait de composer.
   *
   * La langue voyage désormais DANS les filtres, et `adresseExport` la pose :
   * une concaténation à la main ici doublait la connaissance de la forme de
   * l'adresse en deux endroits, et c'est ainsi qu'on obtient un jour deux
   * paramètres `langue` ou aucun.
   */
  const adresse = (format: "csv" | "json") => api.adresseExport(filtres, format);

  return (
    <div className="page">
      {/* `EX-RPT-03` — l'export PDF passe par l'impression du navigateur.
          L'en-tête porte la période : un rapport imprimé sans sa période est
          un tableau de chiffres dont personne ne sait de quoi il parle. */}
      <div className="print-head">
        <p className="print-title">{t("titre")}</p>
        <p className="print-meta">{t(`periode.${periode}`)}</p>
      </div>

      <div className="pl-toolbar">
        <div>
          <span className="eyebrow">{t("surtitre")}</span>
          <h1 className="h1 titre-vue">{t("titre")}</h1>
        </div>
        {donnees ? (
          <span className="count-split rep-arrete">
            {t("arreteAu", { date: formaterDate(donnees.periode.fin) })}
          </span>
        ) : null}
      </div>

      <div className="rep-bar">
        <span className="eyebrow">{t("fenetre")}</span>
        <div className="seg" role="group" aria-label={t("periode.groupe")}>
          {PERIODES.map((p) => (
            <button key={p} type="button" aria-pressed={p === periode} onClick={() => setPeriode(p)}>
              {t(`periode.${p}`)}
            </button>
          ))}
        </div>

        <select
          className="f-input"
          aria-label={t("filtres.projets")}
          value={portee}
          onChange={(e) => setPortee(e.target.value as Portee)}
        >
          <option value="">{t("filtres.tousLesProjets")}</option>
          <option value="active">{t("filtres.enCoursSeulement")}</option>
          <option value="risk">{t("filtres.aRisque")}</option>
        </select>

        <select
          className="f-input"
          aria-label={t("filtres.responsable")}
          value={responsable}
          onChange={(e) => setResponsable(e.target.value)}
        >
          <option value="">{t("filtres.tousLesResponsables")}</option>
          {/* La liste des responsables se lit sur le portefeuille NON filtré :
              tirée du jeu filtré, elle ne proposerait plus que celui qu'on
              vient de choisir, et le filtre deviendrait impossible à défaire
              autrement qu'en revenant à « Tous ». */}
          {[
            ...new Map(
              (base.data?.sante ?? [])
                .filter((l) => l.chef !== null)
                .map((l) => [l.chef!.id, `${l.chef!.prenom} ${l.chef!.nom}`] as const),
            ),
          ].map(([id, nom]) => (
            <option key={id} value={id}>
              {nom}
            </option>
          ))}
        </select>

        <Button className="chip-btn" onPress={actualiser}>
          {t("actions.actualiser")}
        </Button>

        {peut("reports:export") ? (
          <div className="has-pop ligne-actions-fin">
            <MenuTrigger>
              <Button className="btn btn-primary">{t("actions.exporter")}</Button>
              <Popover>
                <Menu className="pop pop-sm">
                  {/* L'impression du navigateur produit le PDF : un second
                      chemin de mise en page ferait diverger deux rendus du
                      même contenu. Le lot L-27 porte la feuille d'impression. */}
                  <MenuItem className="pop-action" id="pdf" onAction={() => window.print()}>
                    {t("actions.exportPdf")}
                  </MenuItem>
                  <MenuItem
                    className="pop-action"
                    id="csv"
                    href={adresse("csv")}
                  >
                    {t("actions.exportCsv")}
                  </MenuItem>
                  <MenuItem
                    className="pop-action"
                    id="json"
                    href={adresse("json")}
                  >
                    {t("actions.exportJson")}
                  </MenuItem>
                </Menu>
              </Popover>
            </MenuTrigger>
          </div>
        ) : null}
      </div>

      {enChargement ? <Chargement quoi={t("lesDonnees")} /> : null}

      {/* L'erreur est rédigée sur place : elle dit ce qui a échoué **et** ce
          qui reste accessible. Un « une erreur est survenue » fait appeler le
          support pour une panne qui n'empêche rien d'autre. */}
      {enErreur ? (
        <div className="empty empty-encadre-erreur">
          <p className="texte-erreur">{t("erreur.titre")}</p>
          <small>{t("erreur.aide")}</small>
          <Button className="chip-btn" onPress={actualiser}>
            {t("erreur.reessayer")}
          </Button>
        </div>
      ) : null}

      {donnees ? (
        <Contenu donnees={donnees} filtres={filtres} onglet={onglet} surOnglet={setOnglet} />
      ) : null}
    </div>
  );
}

function Contenu({
  donnees,
  filtres,
  onglet,
  surOnglet,
}: {
  donnees: api.VueEnsemble;
  filtres: api.FiltresRapport;
  onglet: Onglet;
  surOnglet: (o: Onglet) => void;
}) {
  const { t } = useTranslation("rapports");

  /* Les filtres sont appliqués par le SERVEUR, sur tous les modules à la fois.
     Les rejouer ici ne restreindrait que ce panneau — c'était le défaut. */
  const sante = donnees.sante;

  /*
   * `RG-RPT-06` — **chaque graphique porte son propre état vide rédigé.** La
   * maquette offre en plus un panneau global « Aucune donnée disponible » qui
   * remplace toute la page ; on ne le porte pas, parce qu'il masquerait
   * justement les états vides que la règle impose. Un panneau vide qui dit
   * pourquoi il est vide vaut mieux qu'une page qui dit qu'il n'y a rien.
   */
  return (
    <>
      {/* `EX-RPT-12` — l'alerte est en tête, et elle dit quoi faire. Un
          compteur sans suite laisse chercher où agir. */}
      {donnees.alerte.tachesEnRetard > 0 ? (
        <div className="alert alert-error" role="status">
          <span className="alert-icon" aria-hidden="true">
            !
          </span>
          <span className="alert-corps">
            <strong>{t("alerte.titre")}</strong> {t("alerte.texte", { n: donnees.alerte.tachesEnRetard })}
          </span>
          {/*
            **Une ancre brute recharge tout le document.** Elle relançait
            l'application entière — le lot, la session, les réglages — depuis
            un bandeau d'alerte. `Link` navigue dans le routeur.

            **Le lien porte le filtre qu'il annonce.** « Ouvrir les tâches »
            arrivait sur TOUTES les tâches, filtre « En retard » éteint : le
            bandeau comptait juste et renvoyait à côté, ce qui oblige à
            reposer à la main le filtre qu'on venait de nommer. Le paramètre
            suit la convention déjà en place sur cette route — `creer=1`,
            `date`, `assigne` sont lus sans schéma, tels qu'ils arrivent
            (`vues/taches/Liste.tsx`).

            **Le raccord est fait des deux côtés.** Ce lien a vécu une vague
            avec sa moitié manquante : `vues/taches/Liste.tsx` amorce
            désormais `enRetard` sur `texte("retard") === "1"`, à côté de
            `creer=1`. Un paramètre qui voyage sans que personne le lise ne
            fait échouer aucun contrôle — c'est ce que
            `vues/rapports/rapports.test.ts` compare maintenant, l'écriture du
            paramètre ici ET sa lecture là-bas.
          */}
          <Link to="/taches" search={{ retard: "1" }} className="chip-btn">
            {t("alerte.ouvrirLesTaches")}
          </Link>
        </div>
      ) : null}

      {/* Les onglets ne naviguent pas : ce sont des boutons, pas des liens.
          `aria-pressed` sur un lien est une violation critique — ici la
          sélection se dit par `aria-selected` sur un vrai onglet. */}
      <nav className="tabbar" aria-label={t("onglets.groupe")}>
        {ONGLETS.map((o) => (
          <button
            key={o}
            type="button"
            className={o === onglet ? "is-active" : ""}
            aria-current={o === onglet ? "true" : undefined}
            onClick={() => surOnglet(o)}
          >
            <span>{t(`onglets.${o}`)}</span>
          </button>
        ))}
      </nav>

      {onglet === "over" ? (
        <VueDEnsemble donnees={donnees} sante={sante} />
      ) : onglet === "adv" ? (
        <Avances donnees={donnees} />
      ) : (
        <GanttPortefeuille filtres={filtres} />
      )}
    </>
  );
}

/** Les quatre indicateurs de tête, puis la santé, puis les deux panneaux. */
function VueDEnsemble({ donnees, sante }: { donnees: api.VueEnsemble; sante: api.SanteLigne[] }) {
  const { t } = useTranslation("rapports");
  const critiques = sante.filter((l) => l.sante === "critical");
  const enCours = sante.filter((l) => l.completion < 100);

  /* La moyenne est pondérée par le nombre de tâches : un projet de 2 400 h ne
     pèse pas comme un de 300 h. À défaut de budget, les tâches en tiennent
     lieu — et le marqueur « Pondéré » dit que le chiffre est calculé. */
  const poids = donnees.progression.projets.reduce((s, p) => s + p.taches, 0);
  const avancement =
    poids > 0
      ? Math.round(
          donnees.progression.projets.reduce((s, p) => s + p.progression * p.taches, 0) / poids,
        )
      : 0;

  return (
    <>
      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-head">
            <span className="eyebrow">{t("kpi.projetsEnCours")}</span>
            <span className="scope is-now">{t("kpi.aLInstant")}</span>
          </div>
          <p className="kpi-val">{enCours.length}</p>
          <span className="kpi-sub">{t("kpi.projetsSuivis", { n: sante.length })}</span>
        </div>

        <div className={`kpi${critiques.length > 0 ? " is-alert" : ""}`}>
          <div className="kpi-head">
            <span className="eyebrow">{t("kpi.projetsCritiques")}</span>
            <MarqueurCalcule libelle={t("kpi.regle")} explication={t("kpi.regleExplication")} />
          </div>
          <p className="kpi-val">{critiques.length}</p>
          <span className="kpi-sub">
            {critiques.length > 0
              ? critiques.map((l) => l.nom).join(" · ")
              : t("kpi.aucunEnDifficulte")}
          </span>
        </div>

        <div className="kpi">
          <div className="kpi-head">
            <span className="eyebrow">{t("kpi.avancementMoyen")}</span>
            <MarqueurCalcule libelle={t("kpi.pondere")} explication={t("kpi.pondereExplication")} />
          </div>
          <p className="kpi-val">{t("kpi.pourcent", { n: avancement })}</p>
          <div
            className="bar kpi-bar"
            role="progressbar"
            aria-valuenow={avancement}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t("kpi.avancementMoyen")}
          >
            <i style={{ width: `${avancement}%` }} />
          </div>
          <span className="kpi-sub">{t("kpi.attenduACeStade", { n: avancement })}</span>
        </div>

        <div className="kpi">
          <div className="kpi-head">
            <span className="eyebrow">{t("kpi.jalonsEchusTenus")}</span>
            <span className="scope is-now">{t("kpi.aLInstant")}</span>
          </div>
          <p className="kpi-val">
            {donnees.jalons.aTemps} / {donnees.jalons.echus}
          </p>
          <span className="kpi-sub">
            {t("kpi.partJalonsTenus", {
              n:
                donnees.jalons.echus > 0
                  ? Math.round((donnees.jalons.aTemps / donnees.jalons.echus) * 100)
                  : 0,
            })}
          </span>
        </div>
      </div>

      <SanteDuPortefeuille lignes={sante} />

      <div className="two-col">
        <Progression progression={donnees.progression} />
        <Jalons jalons={donnees.jalons} />
      </div>
    </>
  );
}

/** `EX-RPT-06` — la santé, calculée, avec son détail. */
function SanteDuPortefeuille({ lignes }: { lignes: api.SanteLigne[] }) {
  const { t } = useTranslation("rapports");
  const [tout, setTout] = useState(false);
  const visibles = tout ? lignes : lignes.slice(0, PLAFOND_SANTE);

  return (
    <section className="panel">
      <div className="panel-head">
        <span className="panel-title">{t("sante.titre")}</span>
        <span className="eyebrow">{t("sante.tri")}</span>
      </div>

      {lignes.length === 0 ? (
        <div className="empty">
          <p>{t("sante.vide")}</p>
          <small>{t("sante.videAide")}</small>
        </div>
      ) : (
        <>
          <div className="health-grid health-head">
            <span>{t("sante.colProjet")}</span>
            <span>{t("sante.colSante")}</span>
            {/*
              **Deux nombres, deux mots.** La colonne s'intitulait
              « Avancement » et affichait la COMPLÉTION — la part de tâches
              terminées —, tandis que trente lignes plus bas « Avancement réel
              et attendu » affiche la moyenne des avancements, comme la vue 11.
              Le même projet valait 20 % ici et 46 % là, sous le même mot ; le
              nom accessible de la cellule disait d'ailleurs « Complétion de … »
              quand l'en-tête visible disait « Avancement ». Le libellé suit
              désormais la valeur, et le marqueur dit ce qui les sépare.
            */}
            <span className="ligne-icone">
              {t("sante.colCompletion")}
              <MarqueurCalcule
                libelle={t("sante.completionMarqueur")}
                explication={t("sante.completionExplication")}
              />
            </span>
            <span>{t("sante.colJalons")}</span>
            <span>{t("sante.colActives")}</span>
            <span>{t("sante.colPourquoi")}</span>
          </div>

          {visibles.map((l) => (
            <div
              className={`health-grid health-row${
                l.sante === "critical" ? " is-crit" : l.sante === "warning" ? " is-warn" : ""
              }`}
              key={l.id}
            >
              <div className="bloc-etroit">
                <div className="ligne-icone">
                  {/* Le jeu `p-*` existe : `icone` porte un CODE de symbole
                      (`p-database`), pas un glyphe. Le rendre en texte
                      affichait « p-database » dans la pastille — un défaut que
                      ni `axe`, ni le typage, ni les parcours ne regardent. */}
                  <span className="picon-box picon-box-sm" aria-hidden="true">
                    {l.icone ? (
                      <svg className="picon">
                        <use href={`#${l.icone}`} />
                      </svg>
                    ) : (
                      <span className="picon-glyphe">◇</span>
                    )}
                  </span>
                  <p className="hp-n">{l.nom}</p>
                </div>
                <span className="hp-s">
                  {l.chef ? `${l.chef.prenom} ${l.chef.nom}` : t("sante.nonAssigne")}
                  {l.service ? ` · ${l.service}` : ""}
                  {/* Le budget d'heures dit l'ordre de grandeur du projet :
                      « 3 en retard » ne pèse pas pareil sur 300 h et sur
                      2 400 h. La maquette le range sur cette même ligne. */}
                  {l.budgetHeures === null
                    ? ""
                    : ` · ${t("sante.budgetHeures", { n: l.budgetHeures })}`}
                </span>
              </div>

              {/* La pastille est doublée du filet de bord : la couleur seule ne
                  porte jamais une information à elle seule. */}
              <div>
                <span className="pill" style={{ color: COULEUR_SANTE[l.sante] }}>
                  {t(`santes.${l.sante}`)}
                </span>
              </div>

              <div className="prow-progline">
                <div
                  className="bar"
                  role="progressbar"
                  aria-valuenow={l.completion}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={t("sante.completionDe", { nom: l.nom, n: l.completion })}
                >
                  <i
                    style={
                      { width: `${l.completion}%`, background: COULEUR_SANTE[l.sante] } as CSSProperties
                    }
                  />
                </div>
                <span className="prow-pct">{t("kpi.pourcent", { n: l.completion })}</span>
              </div>

              <span className="hp-detail">{t("sante.jalonsEchus", { n: l.jalonsAVenir, total: l.jalons })}</span>
              <span className="hp-detail">{l.tachesActives}</span>

              <span className="hp-detail">
                {l.enRetard > 0 ? (
                  <>
                    <b>{t("sante.enRetard", { n: l.enRetard })}</b>
                    {" · "}
                  </>
                ) : null}
                {t("sante.restantes", { n: l.restantes })}
                {" · "}
                {t("sante.finLe", { date: formaterDate(l.dateFin) })}
              </span>
            </div>
          ))}

          {/* `RG-RPT-02` — une liste coupée en silence fait conclure qu'il n'y
              a que dix projets. */}
          {lignes.length > PLAFOND_SANTE ? (
            <div className="trunc">
              <span aria-hidden="true">▾</span>
              <span>
                {tout
                  ? t("sante.toutAffiche")
                  : t("sante.limite", { n: PLAFOND_SANTE, reste: lignes.length - PLAFOND_SANTE })}
              </span>
              <Button className="chip-btn ligne-actions-fin" onPress={() => setTout(!tout)}>
                {tout ? t("sante.revenirA", { n: PLAFOND_SANTE }) : t("sante.toutAfficher")}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

/** `EX-RPT-04`, `RG-RPT-02` — l'avancement réel, et celui attendu. */
function Progression({ progression }: { progression: api.VueEnsemble["progression"] }) {
  const { t } = useTranslation("rapports");

  return (
    <section className="panel">
      <div className="panel-head">
        <span className="panel-title">{t("progression.titre")}</span>
        <a className="link link-sm" href="/projets">
          {t("progression.tousLesProjets")}
        </a>
      </div>
      <div className="panel-body">
        {progression.projets.length === 0 ? (
          <div className="empty">
            <p>{t("progression.vide")}</p>
          </div>
        ) : (
          <>
            {progression.projets.map((p) => (
              <div className="hbar" key={p.id}>
                <span className="hbar-n">{p.nom}</span>
                <div
                  className="hbar-t"
                  role="progressbar"
                  aria-valuenow={p.progression}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={t(p.ecart > 0 ? "progression.deEnRetard" : "progression.de", {
                    nom: p.nom,
                    n: p.progression,
                    attendu: p.attendu,
                  })}
                >
                  <i style={{ width: `${p.progression}%` }} />
                  {/*
                   * Le repère de l'avancement attendu. Le panneau s'intitule
                   * « Avancement réel et attendu » et sa légende décrit un
                   * repère vertical — qui n'était jamais dessiné. Une légende
                   * sans son marqueur ne devient rouge nulle part.
                   */}
                  <div
                    className="avg-line"
                    style={{ left: `${p.attendu}%` }}
                    title={t("progression.attendu", { n: p.attendu })}
                    aria-hidden="true"
                  />
                </div>
                {/* La maquette colore la valeur quand le réel est sous
                    l'attendu ; elle le fait en style, sans classe dédiée. */}
                <span
                  className="hbar-v"
                  style={p.ecart > 0 ? { color: "var(--st-review)" } : undefined}
                >
                  {t("kpi.pourcent", { n: p.progression })}
                </span>
              </div>
            ))}
            <div className="avg-cap">
              <span className="avg-sw" aria-hidden="true" />
              <span>{t("progression.repere")}</span>
            </div>
          </>
        )}
      </div>

      {/* Plus de pied de troncage : `RG-RPT-02` fait de ce graphique son
          exception depuis le 2026-09-02, et il montre tous les projets du
          périmètre. Le panneau « Santé du portefeuille », lui, garde son
          plafond et sa commande « Tout afficher ». */}
    </section>
  );
}

/** `EX-RPT-08` — la complétion des jalons. */
function Jalons({ jalons }: { jalons: api.VueEnsemble["jalons"] }) {
  const { t } = useTranslation("rapports");

  const parts = [
    { cle: "aTemps", n: jalons.aTemps, couleur: "var(--st-done)" },
    { cle: "enRetard", n: jalons.enRetard, couleur: "var(--st-blocked)" },
    { cle: "aVenir", n: jalons.aVenir, couleur: "var(--st-todo)" },
  ];

  return (
    <section className="panel">
      <div className="panel-head">
        <span className="panel-title">{t("jalons.titre")}</span>
      </div>
      <div className="panel-body">
        {jalons.total === 0 ? (
          <div className="empty">
            <p>{t("jalons.vide")}</p>
          </div>
        ) : (
          <>
            <div className="mile-sum">
              <span className="mile-big">
                {jalons.aTemps} / {jalons.echus}
              </span>
              <span className="lede">{t("jalons.surEchus", { n: jalons.echus })}</span>
            </div>

            <div className="split-bar">
              {parts
                .filter((p) => p.n > 0)
                .map((p) => (
                  <i
                    key={p.cle}
                    style={
                      { width: `${(p.n / jalons.total) * 100}%`, background: p.couleur } as CSSProperties
                    }
                  />
                ))}
            </div>

            <div className="split-legend">
              {parts.map((p) => (
                <span className="sl" key={p.cle}>
                  <span className="sl-sw" style={{ background: p.couleur }} aria-hidden="true" />
                  <span>{t(`jalons.${p.cle}`)}</span>
                  <span className="sl-n">{p.n}</span>
                </span>
              ))}
            </div>

            <RetardsDeJalons jalons={jalons} />
          </>
        )}
      </div>
    </section>
  );
}

/**
 * `EX-RPT-08` — le détail de ce qui est en retard, sous le compte global.
 *
 * Un compteur sans suite laisse chercher où agir : « trois jalons en retard »
 * ne dit ni lesquels, ni dans quel projet, ni depuis quand. Chaque ligne nomme
 * donc son jalon, son projet, l'ancienneté du retard et ce qui reste à faire
 * pour le lever, et elle mène à la feuille de route du projet.
 *
 * L'ordre est celui du plus ancien retard au plus récent, parce que c'est dans
 * cet ordre qu'ils se traitent, et parce qu'un projet qui concentre le retard
 * se voit alors d'un coup d'œil, ses jalons se suivant dans la liste.
 *
 * **Zéro tâche restante ne veut pas dire « tout est fait ».** Un jalon dont
 * toutes les tâches sont faites est atteint à temps et ne figure pas ici :
 * dans cette liste, un zéro ne peut donc signifier qu'une chose, aucune tâche
 * n'est rattachée au jalon. C'est d'ailleurs la raison de son retard, et le
 * libellé le dit — écrire « toutes les tâches sont faites » sous « en retard »
 * était une contradiction, trouvée sur les données réelles.
 */
function RetardsDeJalons({ jalons }: { jalons: api.VueEnsemble["jalons"] }) {
  const { t } = useTranslation("rapports");

  if (jalons.enRetard === 0) {
    // L'absence de retard est une information, et elle vaut d'être écrite :
    // rien afficher laisserait croire que le détail manque.
    return <p className="mile-aucun">{t("jalons.aucunRetard")}</p>;
  }

  return (
    <div className="mile-late">
      <span className="eyebrow">{t("jalons.detailRetards")}</span>
      <ul className="mile-list">
        {jalons.retards.map((j) => (
          <li className="mile-item" key={j.id}>
            <Link
              className="mile-lien"
              to="/projets/$id/jalons"
              params={{ id: j.projetId }}
              title={t("jalons.allerAuProjet", { projet: j.projetNom })}
            >
              <span className="mile-nom">{j.nom}</span>
              <span className="mile-projet">{j.projetNom}</span>
            </Link>
            <span className="mile-retard">
              {t("jalons.retardDeJours", { n: j.joursDeRetard })}
            </span>
            <span className="mile-reste">
              {t("jalons.echeanceEtReste", {
                date: formaterDate(j.dateEcheance),
                n: j.tachesRestantes,
              })}
            </span>
          </li>
        ))}
      </ul>
      {jalons.retardsNonListes > 0 ? (
        <p className="mile-tronque">{t("jalons.autresRetards", { n: jalons.retardsNonListes })}</p>
      ) : null}
    </div>
  );
}

/** Le second onglet : charge, tendance, répartitions, activité. */
function Avances({ donnees }: { donnees: api.VueEnsemble }) {
  return (
    <>
      <div className="two-col">
        <Charge charge={donnees.charge} />
        <Tendance tendance={donnees.tendance} />
      </div>
      <div className="two-col">
        <Repartition
          cle="parPriorite"
          lignes={donnees.repartitions.priorite}
          prefixe="priorites"
          couleurs={{
            critical: "var(--st-blocked)",
            high: "var(--st-review)",
            normal: "var(--st-doing)",
            low: "var(--st-todo)",
          }}
        />
        <Repartition
          cle="parStatut"
          lignes={donnees.repartitions.statut}
          prefixe="statuts"
          couleurs={{
            todo: "var(--st-todo)",
            doing: "var(--st-doing)",
            review: "var(--st-review)",
            blocked: "var(--st-blocked)",
            done: "var(--st-done)",
          }}
        />
      </div>
      <Activite activite={donnees.activite} />
    </>
  );
}

/** `EX-RPT-05`, `RG-RPT-05` — la charge, et l'écart à la moyenne. */
function Charge({ charge }: { charge: api.VueEnsemble["charge"] }) {
  const { t } = useTranslation("rapports");
  const maximum = Math.max(1, ...charge.agents.map((a) => a.taches));

  return (
    <section className="panel">
      <div className="panel-head">
        <span className="panel-title">{t("charge.titre")}</span>
        <span className="eyebrow">
          {t("charge.total", { n: charge.agents.reduce((s, a) => s + a.taches, 0), gens: charge.agents.length })}
        </span>
      </div>
      <div className="panel-body">
        {charge.agents.length === 0 ? (
          <div className="empty">
            <p>{t("charge.vide")}</p>
            <small>{t("charge.videAide")}</small>
          </div>
        ) : (
          <>
            {charge.agents.map((a) => (
              <div className={`hbar${a.surcharge ? " is-over" : ""}`} key={a.id}>
                <span className="hbar-n">{a.nom}</span>
                {/* `RG-RPT-05` — la surcharge est NOMMÉE, pas seulement
                    colorée : une barre plus longue ne dit pas « trop ». */}
                {a.surcharge ? (
                  <span className="pill" style={{ color: "var(--st-review)" }}>
                    {t("charge.surchargeDetectee")}
                  </span>
                ) : null}
                <div
                  className="hbar-t"
                  role="progressbar"
                  aria-valuenow={a.taches}
                  aria-valuemin={0}
                  aria-valuemax={maximum}
                  aria-label={t(a.surcharge ? "charge.libelleSurcharge" : "charge.libelle", {
                    nom: a.nom,
                    n: a.taches,
                    moyenne: charge.moyenne,
                  })}
                >
                  <i style={{ width: `${(a.taches / maximum) * 100}%` }} />
                  {/* La ligne de moyenne : c'est elle qui donne son sens au
                      mot « surcharge ». Sans elle, dix tâches ne disent rien. */}
                  <div
                    className="avg-line"
                    style={{ left: `${(charge.moyenne / maximum) * 100}%` }}
                    aria-hidden="true"
                  />
                </div>
                <span className="hbar-v">{t("charge.nTaches", { n: a.taches })}</span>
              </div>
            ))}
            <div className="avg-cap">
              <span className="avg-sw" aria-hidden="true" />
              <span>{t("charge.moyenne", { n: charge.moyenne })}</span>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

/** `EX-RPT-07`, `RG-RPT-03`, `RG-RPT-04` — la tendance, ou son absence. */
function Tendance({ tendance }: { tendance: api.VueEnsemble["tendance"] }) {
  const { t } = useTranslation("rapports");
  /* Les deux champs étaient élargis ICI, en attendant que
     `apps/web/src/api/rapports.ts` les déclare — ce qui est fait. Un contrat
     recopié dans la vue est un contrat que personne ne peut opposer : le type
     local et son `as` sont retirés, la signature du service fait foi. */
  /*
   * `RG-RPT-03`, `RG-GEN-05` — **l'état vide dit le VRAI motif et offre sa
   * sortie.** Le panneau annonçait « Historique en cours de construction —
   * trois relevés au minimum sont nécessaires » sur un projet qui en porte
   * six : la tendance est bornée par la fenêtre d'analyse, à trente jours par
   * défaut, et aucun relevé n'y tombait. Le motif était faux, le seuil annoncé
   * n'était même pas celui du serveur — quatre —, et la sortie utile — élargir
   * la fenêtre — n'était pas proposée.
   */
  const horsFenetre = tendance.relevesHorsFenetre;
  const minimum = tendance.minimumRequis;

  return (
    <section className="panel">
      <div className="panel-head">
        <span className="panel-title">{t("tendance.titre")}</span>
        <MarqueurCalcule
          libelle={t("tendance.instantanes")}
          explication={t("tendance.instantanesExplication")}
        />
      </div>
      <div className="panel-body">
        {/* `RG-RPT-03` — une courbe lissée sur trois points est le plus
            efficace des mensonges : elle a l'air d'une mesure. */}
        {!tendance.historiqueSuffisant ? (
          <div className="empty">
            <p>
              {horsFenetre > 0
                ? t("tendance.horsFenetre")
                : t("tendance.historiqueCourt")}
            </p>
            <small>
              {horsFenetre > 0
                ? t("tendance.horsFenetreAide", { n: horsFenetre })
                : t("tendance.historiqueCourtAide", { n: minimum })}
            </small>
          </div>
        ) : (
          <>
            <Courbe points={tendance.points} moyenne={tendance.moyenne} />
            {tendance.stagnation ? (
              <div className="split-legend">
                <span className="sl">
                  <span className="pill" style={{ color: "var(--st-blocked)" }}>
                    {t("tendance.stagnation")}
                  </span>
                </span>
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}

/**
 * La courbe, en SVG calculé.
 *
 * Elle porte un `role="img"` et un libellé qui **résume la tendance en mots** :
 * un tracé n'est pas lisible autrement, et le résumé vaut aussi pour qui lit
 * vite.
 */
function Courbe({
  points,
  moyenne,
}: {
  points: { date: string; progression: number }[];
  moyenne: number;
}) {
  const { t } = useTranslation("rapports");
  const largeur = 560;
  const hauteur = 190;
  const pad = 30;

  const x = (i: number) =>
    pad + (points.length <= 1 ? 0 : i * ((largeur - pad - 10) / (points.length - 1)));
  const y = (v: number) => hauteur - pad - (v / 100) * (hauteur - pad - 12);

  const trace = points.map((p, i) => `${x(i)},${y(p.progression)}`).join(" ");
  const premier = points[0]?.progression ?? 0;
  const dernier = points[points.length - 1]?.progression ?? 0;

  return (
    <svg
      className="chart"
      viewBox={`0 0 ${largeur} ${hauteur}`}
      role="img"
      aria-label={t("tendance.libelle", { debut: premier, fin: dernier, points: points.length })}
    >
      {[0, 25, 50, 75, 100].map((v) => (
        <g key={v}>
          <line className="grid-l" x1={pad} y1={y(v)} x2={largeur} y2={y(v)} />
          <text className="axis-t" x={0} y={y(v) + 3}>
            {t("kpi.pourcentBrut", { n: v })}
          </text>
        </g>
      ))}

      <line
        className="serie serie-avg"
        x1={pad}
        y1={y(moyenne)}
        x2={largeur}
        y2={y(moyenne)}
      />

      <polyline className="serie" points={trace} style={{ stroke: "var(--accent)" }} />

      {points.map((p, i) => (
        <circle className="dot" key={p.date} cx={x(i)} cy={y(p.progression)} r={3} style={{ fill: "var(--accent)" }} />
      ))}

      {points.map((p, i) =>
        i % Math.max(1, Math.ceil(points.length / 6)) === 0 ? (
          <text className="axis-t" key={`l-${p.date}`} x={x(i) - 10} y={hauteur - 10}>
            {p.date.slice(5)}
          </text>
        ) : null,
      )}
    </svg>
  );
}

/** `EX-RPT-09` — les répartitions par priorité et par statut. */
function Repartition({
  cle,
  lignes,
  prefixe,
  couleurs,
}: {
  cle: string;
  lignes: { cle: string; nombre: number }[];
  prefixe: string;
  couleurs: Record<string, string>;
}) {
  const { t } = useTranslation("rapports");
  const total = lignes.reduce((n, l) => n + l.nombre, 0);

  return (
    <section className="panel">
      <div className="panel-head">
        <span className="panel-title">{t(`repartitions.${cle}`)}</span>
        <span className="eyebrow">{t("repartitions.surActives", { n: total })}</span>
      </div>
      <div className="panel-body">
        {total === 0 ? (
          <div className="empty">
            <p>{t("repartitions.vide")}</p>
            <small>{t("repartitions.videAide")}</small>
          </div>
        ) : (
          <>
            <div className="split-bar">
              {lignes
                .filter((l) => l.nombre > 0)
                .map((l) => (
                  <i
                    key={l.cle}
                    style={
                      {
                        width: `${(l.nombre / total) * 100}%`,
                        background: couleurs[l.cle] ?? "var(--accent)",
                      } as CSSProperties
                    }
                  />
                ))}
            </div>
            <div className="split-legend">
              {lignes.map((l) => (
                <span className="sl" key={l.cle}>
                  <span
                    className="sl-sw"
                    style={{ background: couleurs[l.cle] ?? "var(--accent)" }}
                    aria-hidden="true"
                  />
                  <span>{t(`${prefixe}.${l.cle}`)}</span>
                  <span className="sl-n">
                    {t("repartitions.partPart", {
                      n: l.nombre,
                      part: Math.round((l.nombre / total) * 100),
                    })}
                  </span>
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

/** `EX-RPT-10` — l'activité récente, et son interprétation. */
function Activite({ activite }: { activite: api.VueEnsemble["activite"] }) {
  const { t } = useTranslation("rapports");

  return (
    <section className="panel panel-espace-haut">
      <div className="panel-head">
        <span className="panel-title">{t("activite.titre")}</span>
        <span className="scope is-period">{t("activite.periode")}</span>
      </div>
      <div className="panel-body">
        <div className="act3">
          <div className="rep is-ok">
            <p className="rep-n">{activite.terminees}</p>
            <span className="eyebrow">{t("activite.terminees")}</span>
          </div>
          <div className="rep">
            <p className="rep-n">{activite.creees}</p>
            <span className="eyebrow">{t("activite.creees")}</span>
          </div>
          <div className="rep is-err">
            <p className="rep-n">{activite.passeesEnRetard}</p>
            <span className="eyebrow">{t("activite.passeesEnRetard")}</span>
          </div>
        </div>

        {/* Le ratio seul ne dit rien à qui ne le manipule pas tous les jours.
            « Le backlog grossit » se comprend en une seconde. */}
        {activite.ratio === null ? (
          <div className="empty">
            <p>{t("activite.vide")}</p>
            <small>{t("activite.videAide")}</small>
          </div>
        ) : (
          <div
            className="ratio-box"
            style={{
              color: activite.interpretation === "resorbe" ? "var(--st-done)" : "var(--st-review)",
            }}
          >
            {/* `RG-GEN-09` — le nombre suit le paramétrage : « 0,4 » en
                français, « 0.4 » en anglais. Le rendre brut le laisserait en
                notation anglaise partout. */}
            <span className="ratio-v">{formaterNombre(activite.ratio, 2)}</span>
            <div>
              <span className="ratio-t">{t("activite.ratio")}</span>
              <span className="ratio-d">
                {t(`activite.${activite.interpretation === "resorbe" ? "resorbe" : "grossit"}`)}
              </span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
