import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { ETATS_ACTION_AGENT, ETATS_PASSAGE, type EtatActionAgent, type EtatPassage } from "@rationarium/contracts";
import type { PreuveAction } from "../../api/assistant.js";
import { EtatVide } from "../../composants/etats.js";
import { useLibelle } from "../../composants/pastilles.js";
import { usePeut } from "../../session/session.js";
import { formaterDate } from "../../formats.js";
import { lienSur } from "./difference.js";
import { ecartAuPresent, horodatage } from "./formes.js";
import "../../composants/partages.css";
import "./assistant.css";

/**
 * L'horloge de l'écran. Le témoin de l'agent se juge contre elle, pas contre
 * l'instant de la dernière lecture : sans elle, « joignable » resterait affiché
 * une heure après l'extinction du poste.
 */
export function useMaintenant(periodeMs = 5_000): number {
  const [maintenant, setMaintenant] = useState(() => Date.now());
  useEffect(() => {
    const minuterie = setInterval(() => setMaintenant(Date.now()), periodeMs);
    return () => clearInterval(minuterie);
  }, [periodeMs]);
  return maintenant;
}

/**
 * L'en-tête commun à « Activité de l'agent » et à son historique : deux
 * onglets d'un même écran, chacun à son adresse — un onglet qui ne s'inscrit
 * pas dans l'adresse ne se partage pas.
 */
export function EnTeteAssistant({
  onglet,
  actions,
}: {
  onglet: "activite" | "historique";
  actions?: ReactNode;
}) {
  const { t } = useTranslation("assistant");
  return (
    <>
      <div className="pl-toolbar">
        <div>
          <span className="eyebrow">{t("activite.surtitre")}</span>
          <h1 className="h1 titre-vue">{onglet === "activite" ? t("activite.titre") : t("historique.titre")}</h1>
          <p className="lede ag-lede">{onglet === "activite" ? t("activite.chapeau") : t("historique.chapeau")}</p>
        </div>
        {actions ? <div className="pl-toolbar-fin">{actions}</div> : null}
      </div>
      <nav className="tabbar" aria-label={t("activite.sections")}>
        <Link
          to="/assistant"
          search={{}}
          activeOptions={{ exact: true }}
          activeProps={{ className: "" }}
          className={onglet === "activite" ? "is-active" : ""}
          aria-current={onglet === "activite" ? "page" : undefined}
        >
          {t("activite.onglet")}
        </Link>
        <Link
          to="/assistant/historique"
          activeOptions={{ exact: true }}
          activeProps={{ className: "" }}
          className={onglet === "historique" ? "is-active" : ""}
          aria-current={onglet === "historique" ? "page" : undefined}
        >
          {t("historique.onglet")}
        </Link>
      </nav>
    </>
  );
}

/**
 * `RG-AST-01` — **le module désactivé n'a pas d'écran**, et une adresse saisie
 * à la main le dit avec sa sortie (`RG-GEN-04`) : l'activer pour qui le peut,
 * revenir à l'accueil pour les autres.
 */
export function ModuleDesactive() {
  const { t } = useTranslation("assistant");
  const peut = usePeut();
  return (
    <section className="panel">
      <EtatVide
        titre={t("module.desactiveTitre")}
        explication={peut("assistant:configure") ? t("module.desactiveAdmin") : t("module.desactive")}
        sortie={
          peut("assistant:configure") ? (
            <Link className="btn btn-primary" to="/parametres" hash="assistant">
              {t("module.activer")}
            </Link>
          ) : (
            <Link className="btn" to="/">
              {t("module.retourAccueil")}
            </Link>
          )
        }
      />
    </section>
  );
}

/**
 * Les pastilles d'état du module. **Le libellé vient du vocabulaire**
 * (`@rationarium/contracts`), la couleur d'un jeton du socle : la carte
 * ci-dessous ne fait que les relier, comme `pastilles.tsx` pour les statuts de
 * projet et de tâche.
 */
const JETON_ACTION: Record<EtatActionAgent, string> = {
  effectuee: "var(--st-done)",
  refusee: "var(--st-blocked)",
  defaite: "var(--muted)",
  // `RG-AST-21` — l'attente d'une décision se lit comme une revue, le rejet s'éteint.
  a_valider: "var(--st-review)",
  rejetee: "var(--muted)",
};

const JETON_PASSAGE: Record<EtatPassage, string> = {
  en_attente: "var(--st-todo)",
  prise: "var(--st-doing)",
  en_cours: "var(--st-doing)",
  terminee: "var(--st-done)",
  echec: "var(--st-blocked)",
  interrompue: "var(--st-review)",
  annulee: "var(--muted)",
};

export function PastilleEtatAction({ etat }: { etat: EtatActionAgent }) {
  const libelle = useLibelle();
  return (
    <span className="pill" style={{ color: JETON_ACTION[etat] ?? "var(--muted)" }}>
      {libelle(etat, ETATS_ACTION_AGENT)}
    </span>
  );
}

export function PastilleEtatPassage({ etat }: { etat: EtatPassage }) {
  const libelle = useLibelle();
  return (
    <span className="pill" style={{ color: JETON_PASSAGE[etat] ?? "var(--muted)" }}>
      {libelle(etat, ETATS_PASSAGE)}
    </span>
  );
}

/** « il y a 3 minutes » — l'unité se choisit ici, la phrase au catalogue. */
export function IlYA({ iso, maintenant }: { iso: string; maintenant: number }) {
  const { t } = useTranslation("assistant");
  const { unite, n } = ecartAuPresent(iso, maintenant);
  switch (unite) {
    case "secondes":
      return <>{t("temps.ilYASecondes", { n })}</>;
    case "minutes":
      return <>{t("temps.ilYAMinutes", { n })}</>;
    case "heures":
      return <>{t("temps.ilYAHeures", { n })}</>;
    case "jours":
      return <>{t("temps.ilYAJours", { n })}</>;
  }
}

/**
 * Les preuves d'une action, cliquables — `RG-AST-07`, `§ 11`.
 *
 * **Un lien ne mène qu'à une adresse sûre** (`lienSur` : `http`, `https`,
 * `mailto`). Le reste s'affiche en texte : l'information demeure, le geste
 * non. La ligne d'action et la section « À valider » partagent ce rendu : une
 * preuve ne doit pas devenir cliquable sur un écran et rester inerte sur
 * l'autre.
 */
export function ListePreuves({ preuves, id }: { preuves: PreuveAction[]; id?: string }) {
  const { t } = useTranslation("assistant");
  return (
    <ul className="ag-preuves" id={id}>
      {preuves.map((p, i) => {
        const lien = lienSur(p.lien);
        return (
          <li key={`${p.reference}-${i}`} className="ag-preuve">
            <span className="ag-preuve-head">
              <span className="pill pill-muted">{p.source}</span>
              <span className="ag-ref">{p.reference}</span>
              <span className="ag-act-when">{p.date.length > 10 ? horodatage(p.date) : formaterDate(p.date)}</span>
            </span>
            {lien ? (
              <a className="link-sm" href={lien} target="_blank" rel="noopener noreferrer">
                {t("actions.ouvrirPreuve")}
                <span className="sr-only"> {t("actions.nouvelOnglet")}</span>
              </a>
            ) : p.lien ? (
              <span className="ag-ref">{p.lien}</span>
            ) : null}
            {p.extrait ? <blockquote className="ag-extrait">{p.extrait}</blockquote> : null}
          </li>
        );
      })}
    </ul>
  );
}
