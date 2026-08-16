import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";
import { PanneauNotifications } from "./Notifications.js";
import {
  Button,
  Menu,
  MenuItem,
  MenuTrigger,
  Popover,
  Breadcrumbs,
  Breadcrumb,
  Link,
  Dialog,
  DialogTrigger,
  SearchField,
  Input,
} from "react-aria-components";
import { navigationVisible } from "./navigation.js";
import { changerLangue, LANGUES } from "../i18n/index.js";
import { definirTheme, themeCourant, THEMES, type Theme } from "../theme/index.js";
import "./coquille.css";

/**
 * Coquille applicative — `cadrage/02 § B`.
 *
 * Le cadre permanent dans lequel s'affiche chaque vue : barre latérale
 * repliable, en-tête, zone de contenu.
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

  const appliquerTheme = (nouveau: Theme) => {
    definirTheme(nouveau);
    setThemeEtat(nouveau);
  };

  /*
   * RGAA 8.6 — **le titre de page doit être pertinent**, et il ne l'était pas :
   * toutes les vues s'appelaient « Trame ». Un utilisateur de lecteur d'écran
   * qui passe d'une vue à l'autre n'entendait donc rien qui les distingue, et
   * l'historique du navigateur affichait trente-cinq entrées identiques.
   *
   * Le titre est **dérivé du `h1` affiché** plutôt que déclaré vue par vue :
   * une liste parallèle finirait par diverger, et une vue nouvelle
   * l'oublierait. Ce qui est à l'écran est ce qui est annoncé.
   */
  const chemin = useRouterState({ select: (etat) => etat.location.pathname });

  useEffect(() => {
    const image = requestAnimationFrame(() => {
      const titre = document.querySelector("main h1")?.textContent?.trim();
      document.title = titre ? `${titre} — Trame` : "Trame";
    });
    return () => cancelAnimationFrame(image);
  }, [chemin]);

  return (
    <div className={`app ${repliee ? "sidebar-repliee" : ""} ${tiroirOuvert ? "tiroir-ouvert" : ""}`}>
      {/*
        RGAA 12.7 — le lien d'évitement. Il était **stylé dans le socle et
        jamais rendu** : la classe existait, l'élément non. L'audit L-25 l'a
        trouvé, et c'est exactement le genre de manque qu'`axe` ne voit pas —
        rien n'est incorrect dans une page qui n'a pas de lien d'évitement,
        elle est seulement plus longue à traverser pour qui n'a pas de souris.

        Il est le **premier enfant** : un lien d'évitement atteint après la
        navigation ne sert à rien, on l'a déjà traversée.
      */}
      <a className="skip" href="#contenu">
        {t("navigation.allerAuContenu")}
      </a>
      <nav className="sidebar" aria-label={t("navigation.principale")}>
        <div className="sidebar-tete">
          <span className="marque-nom">Trame</span>
          <Button
            className="icon-btn"
            onPress={() => setRepliee((r) => !r)}
            aria-label={repliee ? t("navigation.deplier") : t("navigation.replier")}
            aria-expanded={!repliee}
          >
            <span aria-hidden="true">{repliee ? "»" : "«"}</span>
          </Button>
        </div>

        {groupes.map((groupe) => (
          <div key={groupe.cle} className="nav-group">
            {/* Le titre de groupe n'apparaît que si le groupe a des entrées. */}
            <p className="nav-legend">{t(`groupes.${groupe.cle}`)}</p>
            {groupe.entrees.map((entree) => (
              <a key={entree.cle} className="nav-item" href={entree.chemin}>
                {t(`entrees.${entree.cle}`)}
              </a>
            ))}
          </div>
        ))}
      </nav>

      <div className="zone">
        <header className="topbar">
          {/* Visible en mobile seulement : la barre latérale y est un tiroir. */}
          <Button
            className="icon-btn ouvre-tiroir"
            onPress={() => setTiroirOuvert((o) => !o)}
            aria-label={t("navigation.ouvrir")}
            aria-expanded={tiroirOuvert}
          >
            <span aria-hidden="true">☰</span>
          </Button>

          <Breadcrumbs className="fil-ariane" aria-label={t("entete.filAriane")}>
            {filAriane.map((etape) => (
              <Breadcrumb key={etape.libelle}>
                {etape.chemin ? <Link href={etape.chemin}>{etape.libelle}</Link> : etape.libelle}
              </Breadcrumb>
            ))}
          </Breadcrumbs>

          <SearchField className="recherche-globale" aria-label={t("entete.rechercheGlobale")}>
            <Input className="field" placeholder={t("entete.rechercheGlobale")} />
          </SearchField>

          <div className="topbar-actions">
            <div role="group" aria-label={t("entete.langue")} className="lang-switch">
              {LANGUES.map((l) => (
                <Button key={l} className="chip-btn" onPress={() => void changerLangue(l)}>
                  {l.toUpperCase()}
                </Button>
              ))}
            </div>

            <MenuTrigger>
              <Button className="icon-btn" aria-label={t("entete.theme")}>
                <span aria-hidden="true">◐</span>
              </Button>
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

            <DialogTrigger>
              {/* Le compteur est annoncé en toutes lettres : une pastille
                  colorée seule ne dit rien à une assistance technique. */}
              <Button
                className="icon-btn"
                aria-label={t("entete.notificationsNonLues", { n: notificationsNonLues })}
              >
                <span aria-hidden="true">🔔</span>
                {notificationsNonLues > 0 ? (
                  <span className="dot-badge" aria-hidden="true">
                    {notificationsNonLues}
                  </span>
                ) : null}
              </Button>
              <Popover>
                <Dialog aria-label={t("notifications.titre")}>
                  <PanneauNotifications />
                </Dialog>
              </Popover>
            </DialogTrigger>

            <MenuTrigger>
              <Button className="avatar" aria-label={t("entete.menuUtilisateur")}>
                <span aria-hidden="true">{initiales}</span>
              </Button>
              <Popover>
                <Menu>
                  <MenuItem href="/profil">{t("entete.monProfil")}</MenuItem>
                  <MenuItem onAction={surDeconnexion}>{t("entete.deconnexion")}</MenuItem>
                </Menu>
              </Popover>
            </MenuTrigger>
          </div>
        </header>

        <main className="contenu" id="contenu">
          {children}
        </main>
      </div>
    </div>
  );
}
