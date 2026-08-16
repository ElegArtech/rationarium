import { useState, useEffect, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useRouterState } from "@tanstack/react-router";
import {
  Button,
  Menu,
  MenuItem,
  MenuTrigger,
  Popover,
  Dialog,
  DialogTrigger,
  SearchField,
  Input,
} from "react-aria-components";
import { PanneauNotifications } from "./Notifications.js";
import { BibliothequeIcones, Icone } from "./icones.js";
import { navigationVisible } from "./navigation.js";
import { changerLangue, LANGUES } from "../i18n/index.js";
import { definirTheme, themeCourant, THEMES, type Theme } from "../theme/index.js";
import "./coquille.css";

/**
 * Coquille applicative — `cadrage/02 § B`, section 2 des maquettes.
 *
 * Le cadre permanent dans lequel s'affiche chaque vue : barre latérale
 * repliable, en-tête, zone de contenu.
 *
 * **Le vocabulaire de classes est celui de la maquette.** `.side`,
 * `.side-head`, `.side-mark`, `.side-nav`, `.side-foot`, `.main`, `.topbar`,
 * `.crumb`, `.search`, `.topbar-right`, `.usermenu-btn`, `.page`. La version
 * précédente en avait inventé un autre — `.sidebar`, `.zone`, `.fil-ariane`,
 * `.recherche-globale`, `.topbar-actions` —, et comme la coquille enveloppe
 * les trente-cinq vues, l'écart se répétait sur chacune. C'est aussi ce qui a
 * rendu inertes les feuilles d'impression recopiées des maquettes, défaut
 * corrigé au L-27 **au symptôme** et non à la cause.
 *
 * Une seule dérogation, imposée par RGAA sur `DESIGN.md § 4` : la maquette
 * n'a **aucun élément `<main>`** — sa zone de contenu est un `<div class=
 * "page">`. Une page sans point de repère principal est un défaut
 * d'accessibilité, et l'accessibilité prime. La zone porte donc la classe de
 * la maquette **et** l'élément que la norme demande.
 *
 * **Attention (brief)** : la barre latérale doit rester lisible à 8 entrées
 * comme à 20, et il faut prévoir le cas où un groupe entier disparaît. C'est
 * `navigationVisible` qui s'en charge — un groupe vidé de ses entrées n'est
 * pas rendu avec un titre orphelin, il n'est pas rendu du tout.
 *
 * **RG-GEN-06** : les entrées auxquelles l'utilisateur n'a pas droit ne sont
 * pas affichées. Ce n'est pas un contrôle — le contrôle est au serveur — c'est
 * une courtoisie : on ne propose pas ce qui sera refusé.
 */
export type Utilisateur = {
  id: string;
  prenom: string;
  nom: string;
  role: string;
  avatarUrl?: string | undefined;
};

export function Coquille({
  utilisateur,
  permissions,
  filAriane = [],
  notificationsNonLues = 0,
  surDeconnexion,
  children,
}: {
  utilisateur: Utilisateur;
  permissions: ReadonlySet<string>;
  filAriane?: { libelle: string; chemin?: string }[];
  notificationsNonLues?: number;
  surDeconnexion: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation("coquille");
  const [repliee, setRepliee] = useState(false);
  // Mobile : la barre latérale devient un tiroir (§ B, états).
  const [tiroirOuvert, setTiroirOuvert] = useState(false);
  const [theme, setThemeEtat] = useState<Theme>(themeCourant);

  const groupes = navigationVisible(permissions);
  const initiales = `${utilisateur.prenom[0] ?? ""}${utilisateur.nom[0] ?? ""}`.toUpperCase();
  const entrees = groupes.reduce((n, g) => n + g.entrees.length, 0);

  const appliquerTheme = (nouveau: Theme) => {
    definirTheme(nouveau);
    setThemeEtat(nouveau);
  };

  const chemin = useRouterState({ select: (etat) => etat.location.pathname });

  /*
   * RGAA 8.6 — **le titre de page doit être pertinent**, et il ne l'était pas :
   * toutes les vues s'appelaient « Trame ». Le titre est **dérivé du `h1`
   * affiché** plutôt que déclaré vue par vue : une liste parallèle finirait par
   * diverger, et une vue nouvelle l'oublierait.
   */
  useEffect(() => {
    const image = requestAnimationFrame(() => {
      const titre = document.querySelector("main h1")?.textContent?.trim();
      document.title = titre ? `${titre} — Trame` : "Trame";
    });
    return () => cancelAnimationFrame(image);
  }, [chemin]);

  return (
    <>
      <BibliothequeIcones />
      <div
        className={`app${repliee ? " is-collapsed" : ""}${tiroirOuvert ? " is-open" : ""}`}
      >
        {/*
          RGAA 12.7 — le lien d'évitement. Il est le **premier enfant** : un
          lien d'évitement atteint après la navigation ne sert à rien, on l'a
          déjà traversée.
        */}
        <a className="skip" href="#contenu">
          {t("navigation.allerAuContenu")}
        </a>

        {/* Le voile du tiroir mobile. Cliquer dessus referme. */}
        <div
          className="scrim"
          onClick={() => setTiroirOuvert(false)}
          aria-hidden="true"
        />

        {/* ══════════ Barre latérale ══════════ */}
        <aside className="side">
          <div className="side-head">
            <span className="side-mark">Trame</span>
            <Button
              className="icon-btn"
              onPress={() => setRepliee((r) => !r)}
              aria-label={repliee ? t("navigation.deplier") : t("navigation.replier")}
              aria-expanded={!repliee}
            >
              <Icone nom="i-collapse" petite />
            </Button>
          </div>

          <nav className="side-nav" aria-label={t("navigation.principale")}>
            {groupes.map((groupe) => (
              <div key={groupe.cle} className="nav-group">
                {/* Le titre de groupe n'apparaît que si le groupe a des entrées. */}
                <p className="nav-legend">{t(`groupes.${groupe.cle}`)}</p>
                {groupe.entrees.map((entree) => (
                  <a
                    key={entree.cle}
                    className={`nav-item${chemin === entree.chemin ? " is-active" : ""}`}
                    href={entree.chemin}
                    title={t(`entrees.${entree.cle}`)}
                    {...(chemin === entree.chemin ? { "aria-current": "page" as const } : {})}
                  >
                    <Icone nom={entree.icone} />
                    <span>{t(`entrees.${entree.cle}`)}</span>
                  </a>
                ))}
              </div>
            ))}
          </nav>

          {/* Le pied compte les entrées : c'est ce que la maquette y met, et
              c'est ce qui rend lisible la variation de droits (§ D.3). */}
          <div className="side-foot">
            <span className="eyebrow">{t("navigation.entrees", { n: entrees })}</span>
          </div>
        </aside>

        {/* ══════════ Zone principale ══════════ */}
        <div className="main">
          <header className="topbar">
            <Button
              className="icon-btn burger"
              onPress={() => setTiroirOuvert((o) => !o)}
              aria-label={t("navigation.ouvrir")}
              aria-expanded={tiroirOuvert}
            >
              <Icone nom="i-burger" petite />
            </Button>

            <p className="crumb">
              <a href="/">Trame</a>
              {filAriane.map((etape) => (
                <span key={etape.libelle}>
                  <span aria-hidden="true"> / </span>
                  {etape.chemin ? (
                    <a href={etape.chemin}>{etape.libelle}</a>
                  ) : (
                    <b>{etape.libelle}</b>
                  )}
                </span>
              ))}
            </p>

            <SearchField className="search" aria-label={t("entete.rechercheGlobale")}>
              <Icone nom="i-search" petite />
              <Input placeholder={t("entete.rechercheGlobale")} />
            </SearchField>

            <div className="topbar-right">
              <div className="seg" role="group" aria-label={t("entete.langue")}>
                {LANGUES.map((l) => (
                  <Button
                    key={l}
                    aria-pressed={document.documentElement.lang.startsWith(l)}
                    onPress={() => void changerLangue(l)}
                  >
                    {l.toUpperCase()}
                  </Button>
                ))}
              </div>

              <MenuTrigger>
                <Button className="chip-btn">{t("entete.theme")}</Button>
                <Popover>
                  <Menu
                    onAction={(cle) => appliquerTheme(cle as Theme)}
                    selectionMode="single"
                    selectedKeys={[theme]}
                  >
                    {THEMES.map((mode) => (
                      <MenuItem key={mode} id={mode}>
                        {t(
                          mode === "clair"
                            ? "entete.themeClair"
                            : mode === "sombre"
                              ? "entete.themeSombre"
                              : "entete.themeAuto",
                        )}
                      </MenuItem>
                    ))}
                  </Menu>
                </Popover>
              </MenuTrigger>

              <div className="has-pop">
                <DialogTrigger>
                  {/* Le compteur est annoncé en toutes lettres : une pastille
                      colorée seule ne dit rien à une assistance technique. */}
                  <Button
                    className="icon-btn"
                    aria-label={t("entete.notificationsNonLues", { n: notificationsNonLues })}
                  >
                    <Icone nom="i-bell" petite />
                    {notificationsNonLues > 0 ? (
                      <span className="dot-badge" aria-hidden="true">
                        {notificationsNonLues}
                      </span>
                    ) : null}
                  </Button>
                  <Popover className="pop">
                    <Dialog aria-label={t("notifications.titre")}>
                      <PanneauNotifications />
                    </Dialog>
                  </Popover>
                </DialogTrigger>
              </div>

              <div className="has-pop">
                <MenuTrigger>
                  <Button className="usermenu-btn" aria-label={t("entete.menuUtilisateur")}>
                    <span className="avatar" aria-hidden="true">
                      {initiales}
                    </span>
                    <span>
                      <span className="um-name">
                        {utilisateur.prenom} {utilisateur.nom}
                      </span>
                      <span className="um-role">{utilisateur.role}</span>
                    </span>
                  </Button>
                  <Popover className="pop pop-sm">
                    <Menu>
                      <MenuItem href="/profil" className="pop-action">
                        {t("entete.monProfil")}
                      </MenuItem>
                      <MenuItem onAction={surDeconnexion} className="pop-action">
                        {t("entete.deconnexion")}
                      </MenuItem>
                    </Menu>
                  </Popover>
                </MenuTrigger>
              </div>
            </div>
          </header>

          {/* `.page` est la classe de la maquette ; `<main>` est le point de
              repère que la maquette omet et que RGAA exige. */}
          <main className="page" id="contenu" tabIndex={-1}>
            {children}
          </main>
        </div>
      </div>
    </>
  );
}
