import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { ETATS_RAG } from "@trame/contracts";
import * as api from "../../api/rapports.js";
import { Chargement, ErreurDeChargement } from "../../composants/etats.js";
import { formaterDate } from "../../formats.js";

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
  const mois = decouperEnMois(plage);

  return (
    <section className="panel">
      <div className="panel-head">
        <span className="panel-title">{t("gantt.titre")}</span>
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

          <div className="pg-right" style={{ width: `${Math.max(560, mois.length * 96)}px` }}>
            <div className="pg-head">
              {mois.map((m) => (
                <span className="pg-m" key={m.cle} style={{ width: `${m.largeur}%` }}>
                  {m.libelle}
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

/** L'en-tête temporel, découpé en mois de largeur proportionnelle. */
function decouperEnMois(plage: { debut: number; fin: number }) {
  const mois: { cle: string; libelle: string; largeur: number }[] = [];
  const total = plage.fin - plage.debut;
  if (total <= 0) return mois;

  const curseur = new Date(plage.debut);
  curseur.setUTCDate(1);

  while (curseur.getTime() <= plage.fin) {
    const finDuMois = new Date(
      Date.UTC(curseur.getUTCFullYear(), curseur.getUTCMonth() + 1, 1),
    ).getTime();
    const debutVisible = Math.max(curseur.getTime(), plage.debut);
    const finVisible = Math.min(finDuMois, plage.fin);
    mois.push({
      cle: curseur.toISOString().slice(0, 7),
      libelle: curseur.toISOString().slice(0, 7),
      largeur: ((finVisible - debutVisible) / total) * 100,
    });
    curseur.setUTCMonth(curseur.getUTCMonth() + 1);
  }
  return mois;
}
