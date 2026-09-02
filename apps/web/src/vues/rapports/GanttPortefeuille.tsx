import { useMemo, useState } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { ETATS_RAG } from "@rationarium/contracts";
import * as api from "../../api/rapports.js";
import { Chargement, ErreurDeChargement } from "../../composants/etats.js";
import {
  formaterDate,
  formaterJourMoisCourt,
  formaterMoisCourt,
  numeroDeSemaine,
} from "../../formats.js";

/**
 * `EX-RPT-11` — le Gantt portefeuille.
 *
 * **Aucune bibliothèque de Gantt** (`cadrage/03 § 4, D12`) : une barre est un
 * `<div>` positionné en pourcentage de la plage temporelle. Ce n'est pas une
 * privation — c'est ce qui permet aux jetons de porter les couleurs, donc aux
 * deux thèmes de suivre sans traitement particulier, et à l'impression de
 * fonctionner.
 *
 * **Le RAG n'est pas la santé.** La santé regarde le contenu du projet, le RAG
 * sa position dans le temps. Un projet peut être « on track » et de santé
 * « attention » : c'est ce croisement qui informe, et c'est pourquoi les deux
 * cohabitent sur la page plutôt que de se remplacer.
 *
 * `EX-RPT-13` — **l'échelle de temps se choisit**, comme sur le Gantt d'un
 * projet. Une frise figée au mois ne montre ni le détail d'une semaine chargée
 * ni la forme d'un portefeuille qui court sur deux ans : c'est la même donnée,
 * lue de deux distances. L'échelle ne va pas au serveur — les dates rendues
 * sont les mêmes quelle que soit la distance de lecture, seule la mise en page
 * change.
 */

type Tri =
  | "nom"
  | "nom_desc"
  | "progression"
  | "progression_desc"
  | "fin"
  | "fin_desc"
  | "priorite"
  | "service"
  | "chef";

const ORDRE_PRIORITE: Record<string, number> = { critical: 0, high: 1, normal: 2, low: 3 };

const ECHELLES = ["jour", "semaine", "mois", "trimestre"] as const;
type Echelle = (typeof ECHELLES)[number];

/**
 * La largeur d'un jour, en pixels, selon l'échelle.
 *
 * Le repère est le jour et non la graduation, sinon un mois de février et un
 * mois de mars occuperaient la même place et les barres mentiraient.
 *
 * La semaine reprend la valeur du Gantt d'un projet, pour qu'une même semaine
 * se lise à la même largeur dans les deux vues. Le jour, lui, ne le peut pas :
 * là-bas l'étiquette est un numéro de jour sous une bande de mois, ici elle
 * porte le jour ET le mois, faute de seconde bande. Trente-quatre pixels la
 * coupaient — « 01/0 » —, et une graduation tronquée ne gradue rien. Le mois
 * reconduit la densité d'avant ce choix, quatre-vingt-seize pixels environ pour
 * un mois, afin que l'échelle par défaut ne déplace rien.
 */
const PIXELS_PAR_JOUR: Record<Echelle, number> = {
  jour: 42,
  semaine: 14,
  mois: 3.2,
  trimestre: 1.2,
};

const JOUR_MS = 86_400_000;

const COULEUR_RAG: Record<string, string> = {
  on_track: "var(--st-done)",
  at_risk: "var(--st-review)",
  late: "var(--st-blocked)",
  upcoming: "var(--muted)",
  done: "var(--st-doing)",
};

export function GanttPortefeuille({ periode }: { periode: api.Periode }) {
  const { t } = useTranslation("rapports");
  const [tri, setTri] = useState<Tri>("fin");
  const [echelle, setEchelle] = useState<Echelle>("mois");

  const requete = useQuery({
    queryKey: ["rapports", "gantt", periode],
    queryFn: () => api.gantt({ periode }),
  });

  const lignes = useMemo(() => trier(requete.data?.lignes ?? [], tri), [requete.data, tri]);

  const plage = useMemo(() => bornes(lignes), [lignes]);

  if (requete.isPending) return <Chargement quoi={t("gantt.leGantt")} />;
  if (requete.isError)
    return <ErreurDeChargement erreur={requete.error} surReessai={() => void requete.refetch()} />;

  if (lignes.length === 0) {
    return (
      <section className="panel">
        <div className="panel-head">
          <span className="panel-title">{t("gantt.titre")}</span>
        </div>
        <div className="empty">
          <p>{t("gantt.vide")}</p>
          <small>{t("gantt.videAide")}</small>
        </div>
      </section>
    );
  }

  const position = (date: string) => {
    const total = plage.fin - plage.debut;
    if (total <= 0) return 0;
    return ((new Date(`${date}T00:00:00.000Z`).getTime() - plage.debut) / total) * 100;
  };

  const aujourdhui = requete.data.reference;
  const graduations = decouperEnPeriodes(plage, echelle, t);
  // La plage se mesure en jours, jamais en graduations : c'est ce qui garde
  // aux barres, positionnées en pourcentage, la même longueur relative quand
  // l'échelle change.
  const joursDeLaPlage = Math.max(1, Math.round((plage.fin - plage.debut) / JOUR_MS));
  const largeurFrise = Math.max(560, joursDeLaPlage * PIXELS_PAR_JOUR[echelle]);

  return (
    <section className="panel">
      <div className="panel-head">
        <span className="panel-title">{t("gantt.titre")}</span>
        {/*
          Le même groupe segmenté que le Gantt d'un projet, au même vocabulaire
          de classes. Deux contrôles qui font la même chose dans deux vues
          doivent se ressembler, sinon on ne les reconnaît pas.
        */}
        <div className="seg" role="group" aria-label={t("gantt.echelle")}>
          {ECHELLES.map((e) => (
            <button
              key={e}
              type="button"
              aria-pressed={e === echelle}
              onClick={() => setEchelle(e)}
            >
              {t(`gantt.echelle_${e}`)}
            </button>
          ))}
        </div>
        <label className="mini-select-libelle">
          <span className="eyebrow">{t("gantt.trier")}</span>
          <select
            className="mini-select"
            aria-label={t("gantt.trier")}
            value={tri}
            onChange={(e) => setTri(e.target.value as Tri)}
          >
            {(
              [
                "nom", "nom_desc", "progression", "progression_desc",
                "fin", "fin_desc", "priorite", "service", "chef",
              ] as const
            ).map((cle) => (
              <option key={cle} value={cle}>
                {t(`gantt.tri.${cle}`)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/*
        Le cadre défile horizontalement et ne contient aucun élément focalisable
        — les barres sont des images accessibles, pas des boutons. `axe` le
        refuse à juste titre : sans `tabIndex`, le contenu débordant est
        inatteignable au clavier. Le rôle et le libellé nomment ce qu'on
        parcourt.
      */}
      <div
        className="pg-wrap"
        tabIndex={0}
        role="region"
        aria-label={t("gantt.titre")}
      >
        <div className="pg">
          <div className="pg-left">
            <div className="pg-lhead">
              <span className="eyebrow">{t("gantt.colonneProjets")}</span>
            </div>
            {lignes.map((l) => (
              <div className="pg-row" key={l.id}>
                <span className="pg-n">{l.nom}</span>
                <span className="pill" style={{ color: COULEUR_RAG[l.rag] }}>
                  {t(`rag.${l.rag}`)}
                </span>
              </div>
            ))}
          </div>

          <div className="pg-right" style={{ width: `${largeurFrise}px` }}>
            <div className="pg-head">
              {graduations.map((g) => (
                <span className="pg-m" key={g.cle} style={{ width: `${g.largeur}%` }}>
                  {g.libelle}
                </span>
              ))}
            </div>

            <div className="pg-body">
              {lignes.map((l) => (
                <div className="pg-row" key={l.id} style={{ position: "relative" }}>
                  {/*
                    Chaque barre porte son résumé complet en libellé : survol,
                    progression, dates, chef, service, santé. Le survol n'existe
                    pas au clavier — le libellé, si.
                  */}
                  <span
                    className="pg-bar"
                    role="img"
                    aria-label={t("gantt.libelleBarre", {
                      nom: l.nom,
                      progression: l.progression,
                      debut: formaterDate(l.dateDebut),
                      fin: formaterDate(l.dateFin),
                      chef: l.chef ? `${l.chef.prenom} ${l.chef.nom}` : t("gantt.nonAssigne"),
                      service: l.service?.nom ?? t("gantt.nonAssigne"),
                      rag: t(`rag.${l.rag}`),
                    })}
                    style={{
                      color: COULEUR_RAG[l.rag],
                      left: `${position(l.dateDebut)}%`,
                      width: `${Math.max(1.5, position(l.dateFin) - position(l.dateDebut))}%`,
                      top: "11px",
                    }}
                  >
                    <i style={{ width: `${l.progression}%` }} />
                  </span>
                </div>
              ))}

              {/* La ligne d'aujourd'hui : sans elle, une barre « en retard » ne
                  se voit qu'en lisant les dates une à une. */}
              <span
                className="pg-today"
                style={{ left: `${position(aujourdhui)}%` }}
                role="img"
                aria-label={t("gantt.aujourdhui", { date: formaterDate(aujourdhui) })}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="panel-body">
        <div className="rag-legend">
          {ETATS_RAG.map((e) => (
            <span className="rag-l" key={e.code}>
              <span className="rag-sw" style={{ color: COULEUR_RAG[e.code] }} aria-hidden="true" />
              <span>{t(`rag.${e.code}`)}</span>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * Les tris du brief, tous.
 *
 * « Entrées sans valeur : Non assigné » — un projet sans chef ni service ne
 * disparaît pas du tri : il se regroupe sous une valeur nommée.
 */
function trier(lignes: api.LigneGantt[], tri: Tri): api.LigneGantt[] {
  const copie = [...lignes];
  const parNom = (a: api.LigneGantt, b: api.LigneGantt) => a.nom.localeCompare(b.nom);

  switch (tri) {
    case "nom":
      return copie.sort(parNom);
    case "nom_desc":
      return copie.sort((a, b) => parNom(b, a));
    case "progression":
      return copie.sort((a, b) => a.progression - b.progression || parNom(a, b));
    case "progression_desc":
      return copie.sort((a, b) => b.progression - a.progression || parNom(a, b));
    case "fin":
      return copie.sort((a, b) => a.dateFin.localeCompare(b.dateFin) || parNom(a, b));
    case "fin_desc":
      return copie.sort((a, b) => b.dateFin.localeCompare(a.dateFin) || parNom(a, b));
    case "priorite":
      return copie.sort(
        (a, b) =>
          (ORDRE_PRIORITE[a.priorite] ?? 9) - (ORDRE_PRIORITE[b.priorite] ?? 9) || parNom(a, b),
      );
    case "service":
      return copie.sort(
        (a, b) => (a.service?.nom ?? "￿").localeCompare(b.service?.nom ?? "￿") || parNom(a, b),
      );
    case "chef":
      return copie.sort(
        (a, b) => (a.chef?.nom ?? "￿").localeCompare(b.chef?.nom ?? "￿") || parNom(a, b),
      );
  }
}

/** La plage temporelle couverte, élargie d'une marge pour respirer. */
function bornes(lignes: api.LigneGantt[]): { debut: number; fin: number } {
  if (lignes.length === 0) {
    const maintenant = Date.now();
    return { debut: maintenant, fin: maintenant + 1 };
  }
  const debuts = lignes.map((l) => new Date(`${l.dateDebut}T00:00:00.000Z`).getTime());
  const fins = lignes.map((l) => new Date(`${l.dateFin}T00:00:00.000Z`).getTime());
  return { debut: Math.min(...debuts), fin: Math.max(...fins) };
}

/**
 * L'en-tête temporel, découpé selon l'échelle choisie.
 *
 * Chaque graduation porte une étiquette qui se suffit à elle-même. La bande
 * est unique, à la différence du Gantt d'un projet qui en superpose deux : un
 * numéro de jour seul ne dirait pas de quel mois il relève, et il fallait donc
 * choisir entre une seconde bande et une étiquette complète. L'étiquette
 * complète tient dans les trente-quatre pixels d'un jour, la seconde bande
 * aurait demandé de reprendre la hauteur de l'en-tête et son adhérence au
 * défilement.
 *
 * Les largeurs sont en pourcentage de la plage, comme les barres : les deux se
 * calent donc l'une sur l'autre quelle que soit la largeur en pixels de la
 * frise. Une graduation entamée — le premier mois, le dernier trimestre — n'est
 * large que de sa part visible, sans quoi les étiquettes glisseraient d'un cran
 * par rapport aux barres.
 */
function decouperEnPeriodes(
  plage: { debut: number; fin: number },
  echelle: Echelle,
  t: TFunction<"rapports">,
) {
  const graduations: { cle: string; libelle: string; largeur: number }[] = [];
  const total = plage.fin - plage.debut;
  if (total <= 0) return graduations;

  let curseur = debutDeGraduation(plage.debut, echelle);
  // Une garde de boucle : une échelle inconnue ou une plage aberrante ne doit
  // pas produire un rendu infini. Un jour par pixel sur un siècle reste sous
  // ce plafond.
  for (let garde = 0; curseur <= plage.fin && garde < 40_000; garde += 1) {
    const suivante = graduationSuivante(curseur, echelle);
    const debutVisible = Math.max(curseur, plage.debut);
    const finVisible = Math.min(suivante, plage.fin);
    graduations.push({
      cle: new Date(curseur).toISOString().slice(0, 10),
      libelle: etiquette(new Date(curseur), echelle, t),
      largeur: ((finVisible - debutVisible) / total) * 100,
    });
    curseur = suivante;
  }
  return graduations;
}

/** Le début de la graduation qui contient cet instant. */
function debutDeGraduation(instant: number, echelle: Echelle): number {
  const d = new Date(instant);
  const [a, m, j] = [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()];
  switch (echelle) {
    case "jour":
      return Date.UTC(a, m, j);
    case "semaine":
      // Le lundi qui précède, la semaine étant étiquetée par son numéro ISO.
      return Date.UTC(a, m, j) - ((d.getUTCDay() + 6) % 7) * JOUR_MS;
    case "mois":
      return Date.UTC(a, m, 1);
    case "trimestre":
      return Date.UTC(a, Math.floor(m / 3) * 3, 1);
  }
}

/** Le début de la graduation qui suit celle-ci. */
function graduationSuivante(debut: number, echelle: Echelle): number {
  const d = new Date(debut);
  const [a, m] = [d.getUTCFullYear(), d.getUTCMonth()];
  switch (echelle) {
    case "jour":
      return debut + JOUR_MS;
    case "semaine":
      return debut + 7 * JOUR_MS;
    case "mois":
      return Date.UTC(a, m + 1, 1);
    case "trimestre":
      return Date.UTC(a, m + 3, 1);
  }
}

/** L'étiquette d'une graduation, dans la langue de l'utilisateur. */
function etiquette(debut: Date, echelle: Echelle, t: TFunction<"rapports">): string {
  switch (echelle) {
    case "jour":
      return formaterJourMoisCourt(debut);
    case "semaine":
      return t("semaineCourte", { n: numeroDeSemaine(debut) });
    case "mois":
      return formaterMoisCourt(debut);
    case "trimestre":
      return t("trimestreCourt", {
        n: Math.floor(debut.getUTCMonth() / 3) + 1,
        annee: String(debut.getUTCFullYear()).slice(2),
      });
  }
}
