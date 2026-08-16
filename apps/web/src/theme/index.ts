/**
 * Thème — `cadrage/01 § 7` : clair, sombre et **automatique**.
 *
 * Le mode automatique suit la préférence du système et doit y réagir en
 * direct : un utilisateur dont le poste bascule à la tombée du jour n'a pas à
 * recharger. D'où l'écoute du media query plutôt qu'une lecture unique.
 *
 * La classe `dark` est celle des maquettes : le socle graphique définit ses
 * jetons sombres sous `html.dark`. On ne réinterprète pas ce contrat.
 */
export const THEMES = ["clair", "sombre", "auto"] as const;
export type Theme = (typeof THEMES)[number];

export const CLE_THEME = "trame.theme";

const requeteSombre = () => window.matchMedia("(prefers-color-scheme: dark)");

const appliquer = (theme: Theme): void => {
  const sombre = theme === "sombre" || (theme === "auto" && requeteSombre().matches);
  document.documentElement.classList.toggle("dark", sombre);
};

let ecoute: ((e: MediaQueryListEvent) => void) | null = null;

export const definirTheme = (theme: Theme): void => {
  localStorage.setItem(CLE_THEME, theme);
  appliquer(theme);

  const mq = requeteSombre();
  if (ecoute) mq.removeEventListener("change", ecoute);
  if (theme === "auto") {
    ecoute = () => appliquer("auto");
    mq.addEventListener("change", ecoute);
  } else {
    ecoute = null;
  }
};

export const themeCourant = (): Theme => {
  const memorise = localStorage.getItem(CLE_THEME);
  return memorise === "clair" || memorise === "sombre" || memorise === "auto" ? memorise : "auto";
};

export const initialiserTheme = (): void => definirTheme(themeCourant());
