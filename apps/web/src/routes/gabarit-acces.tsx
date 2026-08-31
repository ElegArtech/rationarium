import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "react-aria-components";
import i18next from "i18next";
import { useState } from "react";
import { changerLangue, LANGUES } from "../i18n/index.js";
import { definirTheme, themeCourant } from "../theme/index.js";
import "./acces.css";

/**
 * Gabarit des vues d'accès — vues 01 à 05, section 7 des maquettes.
 *
 * **Deux moitiés, et la gauche n'est pas une décoration.** Elle énonce la
 * thèse du produit en la montrant : en haut le portefeuille — d'où viennent
 * les occupations —, en bas la grille — ce qu'elles occupent réellement, aux
 * côtés des congés, du télétravail, des permanences et des réunions. C'est
 * l'argument du produit, avant la première connexion.
 *
 * Le contenu du panneau est **illustratif et figé**, comme dans la maquette :
 * il est affiché avant toute session, donc aucune donnée réelle n'est
 * accessible — et aucune ne doit l'être. Il passe malgré tout par i18next
 * (`RG-GEN-08`), la maquette portant elle-même ses variantes `fr` / `en`.
 *
 * Le sélecteur de langue et la bascule de thème restent atteignables avant
 * connexion : un anglophone doit pouvoir lire la page qui lui demande de
 * s'identifier, et un utilisateur en thème sombre ne doit pas subir un écran
 * clair pour se connecter.
 */

/** Les trois icônes de projet employées par le panneau. Section « pglyph ». */
function BibliothequeIcones() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <symbol id="p-flow" viewBox="0 0 16 16">
        <rect x="6" y="1.6" width="4" height="3" />
        <rect x="1.6" y="11" width="4" height="3" />
        <rect x="10.4" y="11" width="4" height="3" />
        <path d="M8 4.6v3M3.6 11V7.6h8.8V11" />
      </symbol>
      <symbol id="p-screen" viewBox="0 0 16 16">
        <rect x="2" y="3" width="12" height="8" />
        <path d="M6 14h4M8 11v3" />
      </symbol>
      <symbol id="p-database" viewBox="0 0 16 16">
        <path d="M13.5 4c0 1.1-2.5 2-5.5 2S2.5 5.1 2.5 4 5 2 8 2s5.5.9 5.5 2z" />
        <path d="M2.5 4v8c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2V4M2.5 8c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2" />
      </symbol>
    </svg>
  );
}

function Pastille({ icone, titre }: { icone: string; titre: string }) {
  return (
    <i className="pglyph" title={titre}>
      <svg className="pgi" viewBox="0 0 16 16" aria-hidden="true">
        <use href={`#${icone}`} />
      </svg>
    </i>
  );
}

/** Les trois projets du panneau — `pf`, l'amont. */
const PROJETS = [
  { cle: "portail", icone: "p-screen", avancement: 62, sante: "done" },
  { cle: "sirh", icone: "p-database", avancement: 31, sante: "review" },
  { cle: "schema", icone: "p-flow", avancement: 12, sante: "blocked" },
] as const;

/**
 * Les cinq lignes de la grille miniature — `mini`, l'aval.
 *
 * Chaque cellule porte au plus deux occupations : au-delà, la miniature
 * cesserait de démontrer la lisibilité qu'elle prétend démontrer.
 */
const LIGNES = [
  {
    cle: "durand",
    cellules: [
      [{ cle: "maquettes", statut: "doing", icone: "p-screen", projet: "portail" }],
      [{ cle: "maquettes", statut: "doing", icone: "p-screen", projet: "portail" }],
      [{ cle: "congeAnnuel", statut: "leave", plat: true }],
      [{ cle: "congeAnnuel", statut: "leave", plat: true }],
      [{ cle: "recette", statut: "todo", icone: "p-screen", projet: "portail" }],
    ],
  },
  {
    cle: "amrani",
    cellules: [
      [
        { cle: "teletravail", statut: "telework" },
        { cle: "cahierCharges", statut: "review", icone: "p-database", projet: "sirh" },
      ],
      [{ cle: "cahierCharges", statut: "doing", icone: "p-database", projet: "sirh" }],
      [{ cle: "comite", statut: "event" }],
      [],
      [{ cle: "recette", statut: "done", icone: "p-screen", projet: "portail" }],
    ],
  },
  {
    cle: "berthier",
    cellules: [
      [{ cle: "accueil", statut: "todo" }],
      [{ cle: "congeAttente", statut: "leave", plat: true, hachure: true }],
      [{ cle: "congeAttente", statut: "leave", plat: true, hachure: true }],
      [],
      [{ cle: "teletravail", statut: "telework" }],
    ],
  },
  {
    cle: "nguyen",
    cellules: [
      [{ cle: "reprise", statut: "doing", icone: "p-database", projet: "sirh" }],
      [{ cle: "reprise", statut: "doing", icone: "p-database", projet: "sirh" }],
      [{ cle: "reprise", statut: "doing", icone: "p-database", projet: "sirh" }],
      [],
      [{ cle: "astreinte", statut: "todo" }],
    ],
  },
  {
    cle: "rocher",
    cellules: [
      [{ cle: "noteCadrage", statut: "todo", icone: "p-flow", projet: "schema" }],
      [{ cle: "bureau", statut: "event" }],
      [{ cle: "noteCadrage", statut: "doing", icone: "p-flow", projet: "schema" }],
      [],
      // Tâche hors projet : trait interrompu, pas de pastille. Cas nominal.
      [{ cle: "reunion", statut: "todo", independant: true }],
    ],
  },
] as const;

const SYNTHESE = ["1/5 · 20 %", "1/5 · 20 %", "2/5 · 40 %", null, "1/5 · 20 %"];

export function GabaritAcces({
  titre,
  chapeau,
  intro,
  large = false,
  actions,
  avecAide = true,
  children,
}: {
  titre: string;
  /** Le sur-titre : « Accès à l'application ». */
  chapeau: string;
  /**
   * La ligne d'introduction sous le titre.
   *
   * Facultative : la vue 05 n'en a pas. Son explication n'est pas une
   * introduction mais **le motif du blocage**, et il vit dans une alerte, pas
   * dans un chapô — ce n'est pas la même information.
   */
  intro?: string | undefined;
  large?: boolean;
  /** Boutons ajoutés à la barre de service — la sortie de session, vue 05. */
  actions?: ReactNode;
  /** La vue 05 n'offre pas de lien d'aide : son pied ne porte que deux entrées. */
  avecAide?: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation("acces");
  const { t: tCoquille } = useTranslation("coquille");
  const courante = i18next.language;
  const [theme, setTheme] = useState(themeCourant);

  // La bascule est binaire ici : avant connexion, il n'y a pas de vue de
  // paramètres pour choisir « auto ». Elle part de l'état effectif.
  const basculer = () => {
    const suivant = document.documentElement.classList.contains("dark") ? "clair" : "sombre";
    definirTheme(suivant);
    setTheme(suivant);
  };

  return (
    <>
      {/* Le lien d'évitement est dans la maquette : il ouvre le document,
          avant le panneau signature qui compte plus de cent éléments. */}
      <a className="skip" href="#contenu">
        {t("skip")}
      </a>
      <BibliothequeIcones />
      <div className="split">
        {/* ═══════ Panneau signature : la grille, thèse du produit ═══════ */}
        <aside className="brand-panel">
          <div>
            <div className="wordmark">
              <span className="wordmark-name">Rationarium</span>
              <span className="eyebrow on-brand-eyebrow">{t("panneau.organisation")}</span>
            </div>
            <p className="brand-sub">{t("panneau.signature")}</p>
          </div>

          {/* ── L'amont : le portefeuille (vues 10 · 11 · 30) ── */}
          <div className="pf">
            <div className="pf-caption">
              <span className="eyebrow on-brand-eyebrow">{t("panneau.portefeuille")}</span>
              <span className="mini-foot" style={{ padding: 0 }}>
                {t("panneau.colonnes")}
              </span>
            </div>

            <div className="pf-list">
              {PROJETS.map((p) => (
                <div key={p.cle} className="pf-row">
                  <Pastille icone={p.icone} titre={t(`panneau.projets.${p.cle}.nom`)} />
                  <span className="pf-name">{t(`panneau.projets.${p.cle}.nom`)}</span>
                  <span className="pf-prog">
                    <span className="pf-bar">
                      <i style={{ width: `${p.avancement}%` }} />
                    </span>
                    <span className="pf-pct">{t("panneau.pourcent", { n: p.avancement })}</span>
                  </span>
                  <span className="pf-mile">{t(`panneau.projets.${p.cle}.jalon`)}</span>
                  <span className="pf-health" style={{ color: `var(--ob-${p.sante})` }}>
                    <i className="pf-dot" />
                    <span>{t(`panneau.sante.${p.sante}`)}</span>
                  </span>
                </div>
              ))}
            </div>

            <p className="pf-link eyebrow on-brand-eyebrow" style={{ marginBottom: 0 }}>
              {t("panneau.articulation")}
            </p>
          </div>

          {/* ── L'aval : la grille (vue 07) ── */}
          <div className="mini-wrap">
            <div className="mini-caption">
              <span className="eyebrow on-brand-eyebrow">{t("panneau.semaine")}</span>
              <span className="mini-foot" style={{ padding: 0 }}>
                {t("panneau.service")}
              </span>
            </div>

            <div className="mini">
              <div className="mini-grid mini-headrow">
                <div className="mini-head is-first">{t("panneau.ressource")}</div>
                {[0, 1, 2, 3, 4].map((j) => (
                  <div key={j} className={`mini-head${j === 3 ? " col-ferie" : ""}`}>
                    {t(`panneau.jours.${j}`)}
                  </div>
                ))}
              </div>

              {LIGNES.map((ligne) => (
                <div key={ligne.cle} className="mini-grid mini-row">
                  <div className="mini-name">{t(`panneau.personnes.${ligne.cle}`)}</div>
                  {ligne.cellules.map((cellule, j) => (
                    <div key={j} className={`mini-cell${j === 3 ? " col-ferie" : ""}`}>
                      {cellule.map((o, k) => (
                        <span
                          key={k}
                          className={`chip${"plat" in o && o.plat ? " chip-flat" : ""}${
                            "hachure" in o && o.hachure ? " chip-hatch" : ""
                          }${"independant" in o && o.independant ? " chip-indep" : ""}`}
                          style={{ color: `var(--ob-${o.statut})` }}
                        >
                          {"icone" in o && o.icone ? (
                            <Pastille
                              icone={o.icone}
                              titre={t(`panneau.projets.${o.projet}.nom`)}
                            />
                          ) : null}
                          <span>{t(`panneau.occupations.${o.cle}`)}</span>
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              ))}

              <div className="mini-grid mini-sum">
                <div className="mini-foot is-first">{t("panneau.horsPresentiel")}</div>
                {SYNTHESE.map((s, j) => (
                  <div key={j} className={`mini-foot${j === 3 ? " col-ferie" : ""}`}>
                    {s ?? t("panneau.ferie")}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <p className="brand-foot">{t("panneau.legende")}</p>
        </aside>

        {/* ═══════ Formulaire ═══════ */}
        <main className="form-panel" id="contenu" tabIndex={-1}>
          <div className="service-bar">
            <div className="seg" role="group" aria-label={tCoquille("entete.langue")}>
              {LANGUES.map((l) => (
                <Button
                  key={l}
                  aria-pressed={courante.startsWith(l)}
                  onPress={() => void changerLangue(l)}
                >
                  {l.toUpperCase()}
                </Button>
              ))}
            </div>
            <Button className="chip-btn" onPress={basculer}>
              {t(theme === "sombre" ? "theme.clair" : "theme.sombre")}
            </Button>
            {actions}
          </div>

          <div className="form-body">
            <div className={`form-card${large ? " form-card--wide" : ""}`}>
              <div className="form-intro">
                <span className="eyebrow">{chapeau}</span>
                <h1 className="h1">{titre}</h1>
                {intro ? <p className="lede">{intro}</p> : null}
              </div>
              {children}
            </div>
          </div>

          <footer className="form-foot">
            <span className="eyebrow">{t("pied.version")}</span>
            <span className="eyebrow">{t("pied.accessibilite")}</span>
            {avecAide ? <span className="eyebrow">{t("pied.aide")}</span> : null}
          </footer>
        </main>
      </div>
    </>
  );
}
