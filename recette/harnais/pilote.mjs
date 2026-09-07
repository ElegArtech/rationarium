/**
 * Le pilote de recette — hors produit.
 *
 * Il donne à un exécutant de parcours les deux gestes que l'étape suppose, et
 * rien de plus : **ouvrir le produit sous une persona**, et **le remettre à
 * zéro**. Tout le reste — où cliquer, quoi lire — est laissé à l'exécutant :
 * le parcours dit où arriver, pas par où passer.
 *
 * ── Ce qu'il surveille sans qu'on le lui demande ────────────────────────────
 *
 * Le verdict d'un parcours est mécanique et il l'est intégralement. Sont donc
 * relevés en continu, dans `incidents` :
 *
 *   - toute erreur de console et toute exception non rattrapée ;
 *   - toute requête réseau en échec, et tout code d'erreur serveur ;
 *   - toute violation de la politique de sécurité de contenu — celle du
 *     `Caddyfile`, servie ici comme en exploitation, car une violation
 *     rattrapée par un `try` ne se voit **que** sous CSP ;
 *   - toute apparition d'une valeur du PREMIER jeu d'illustration.
 *
 * ── Emploi ──────────────────────────────────────────────────────────────────
 *
 *     import { ouvrirPile, ouvrirSous, fermer } from "./pilote.mjs";
 *     const pile = await ouvrirPile(0);
 *     const s = await ouvrirSous(pile, { persona: "Fatou", langue: "fr", nom: "P-12" });
 *     await s.page.getByRole("link", { name: "Congés" }).click();
 *     console.log(await s.texte());
 *     await s.capture("apres-clic");
 *     await s.fermer();            // écrit trace, vidéo, captures et incidents
 *     await pile.fermer();
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  RACINE,
  clonerBase,
  baseOuvrier,
  demarrerApi,
  arreter,
  reinitialiser,
  MOTDEPASSE_RECETTE,
} from "./pile.mjs";
import { demarrerServeurWeb, politiqueDuCaddyfile } from "./serveur-web.mjs";

export const PREUVES = resolve(RACINE, "recette/preuves");

/** Les personas du cahier des charges, associées au compte du second jeu. */
export function personas() {
  const module = resolve(RACINE, "recette/jeu2.mjs");
  return import(module).then((m) => m.PERSONAS);
}

/**
 * Les valeurs distinctives du PREMIER jeu d'illustration.
 *
 * Leur apparition à l'écran fait rouge : elle signifie qu'une donnée a été
 * codée en dur quelque part, ou qu'une vue lit un jeu qu'elle ne devrait pas
 * lire. La liste porte des valeurs **composées** — « Camille Durand », pas
 * « Camille » : le prénom seul figure dans la description des modèles de rôle
 * du produit (`packages/contracts/src/roles.ts`), qui est un libellé livré et
 * non une donnée.
 */
export const VALEURS_JEU1 = [
  "Camille Durand",
  "Driss Amrani",
  "Fatou Berthier",
  "Hugo Nguyen",
  "Inès Rocher",
  "Roqueville",
  "Refonte du portail citoyen",
  "Migration SIRH",
  "Schéma directeur numérique",
  "Dématérialisation des archives",
  "Gestion des cimetières",
  "Portail des familles",
  "Plan de voirie",
  "Marchés publics dématérialisés",
  "Éclairage public intelligent",
  "Réservation des équipements sportifs",
  "Télérelève de l'eau",
  "Budget participatif",
  "Direction des systèmes d'information",
  "Numérique et données",
];

/**
 * La recherche est **insensible à la casse** : `innerText` rend le texte tel
 * qu'il s'affiche, `text-transform` compris. « VILLE DE ROQUEVILLE » ne
 * contient pas « Roqueville », et la première mesure est passée à côté d'une
 * fuite qu'elle avait pourtant sous les yeux.
 */
export function chercherJeu1(texte) {
  const bas = texte.toLowerCase();
  return VALEURS_JEU1.filter((v) => bas.includes(v.toLowerCase()));
}

// ── La pile ─────────────────────────────────────────────────────────────────

const PORT_API = (slot) => 3200 + slot;
const PORT_WEB = (slot) => 4300 + slot;

/**
 * Monte une pile privée : base clonée du modèle, serveur applicatif, serveur
 * web. Deux piles de numéros différents ne se voient pas.
 */
/**
 * Une requête en lecture sur la base de l'ouvrier.
 *
 * Elle existe pour ce qui vit **hors des trente-cinq vues** : un jeton de
 * réinitialisation qu'un courriel aurait porté (le relais SMTP n'est pas
 * configuré, les courriels sont journalisés), l'horodatage d'une ligne
 * d'audit. Elle n'existe pas pour établir un verdict : un parcours se juge à
 * l'écran, jamais en base. S'en servir pour constater l'état final, c'est
 * mesurer autre chose que ce que l'utilisateur voit.
 */
export async function sql(pile, requete, valeurs = []) {
  const { default: pg } = await import("pg");
  const client = new pg.Client({
    host: "127.0.0.1",
    port: 55433,
    user: "rationarium",
    password: "rationarium",
    database: pile.base,
  });
  await client.connect();
  try {
    const { rows } = await client.query(requete, valeurs);
    return rows;
  } finally {
    await client.end();
  }
}

export async function ouvrirPile(slot) {
  const base = await clonerBase(slot);
  const api = await demarrerApi({ port: PORT_API(slot), base });
  const csp = politiqueDuCaddyfile();
  const web = await demarrerServeurWeb({ port: PORT_WEB(slot), portApi: PORT_API(slot), csp });
  return {
    slot,
    base,
    csp,
    baseURL: `http://127.0.0.1:${PORT_WEB(slot)}`,
    /** Remet la base dans l'état du modèle. À appeler entre deux parcours. */
    remettreAZero: () => reinitialiser(slot),
    fermer: async () => {
      web.close();
      await arreter(api.processus);
    },
    journal: () => api.lignes.join(""),
  };
}

// ── La session ──────────────────────────────────────────────────────────────

/**
 * Ouvre le produit sous une persona, dans une langue, dans un contexte de
 * navigateur isolé.
 *
 * La connexion passe par **le formulaire réel**, pas par une injection de
 * session : c'est la vue 01 du parcours, et une porte dérobée aurait fait
 * mentir tous les parcours qui commencent par elle.
 */
export async function ouvrirSous(pile, { persona, langue = "fr", nom, theme = null, sansConnexion = false }) {
  const PERSONAS = await personas();
  // Le parcours nomme la persona comme le cahier des charges l'écrit — « Inès ».
  // Le jeu la range sous une clé sans accent ni majuscule. On normalise ici
  // plutôt que d'imposer l'une des deux écritures aux deux bouts.
  const cle = (persona ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
  const compte = PERSONAS[cle];
  if (!compte && !sansConnexion) {
    throw new Error(
      `persona inconnue : « ${persona} ». Connues : ${Object.keys(PERSONAS).join(", ")}`,
    );
  }

  const dossier = resolve(PREUVES, nom ?? "sans-nom", persona ?? "anonyme", langue);
  mkdirSync(dossier, { recursive: true });

  const navigateur = await chromium.launch();
  const contexte = await navigateur.newContext({
    viewport: { width: 1600, height: 1000 },
    locale: langue === "en" ? "en-GB" : "fr-FR",
    recordVideo: { dir: resolve(dossier, "video") },
  });
  await contexte.tracing.start({ screenshots: true, snapshots: true, sources: false });

  // La langue se pose comme le produit la mémorise, avant tout chargement.
  await contexte.addInitScript(
    ([cle, valeur]) => {
      try {
        window.localStorage.setItem(cle, valeur);
      } catch {
        /* stockage indisponible : la détection retombe sur la locale */
      }
    },
    ["rationarium.langue", langue],
  );
  if (theme) {
    await contexte.addInitScript(
      ([cle, valeur]) => {
        try {
          window.localStorage.setItem(cle, valeur);
        } catch {
          /* idem */
        }
      },
      ["rationarium.theme", theme],
    );
  }

  const incidents = [];
  const page = await contexte.newPage();

  page.on("console", (m) => {
    if (m.type() === "error") incidents.push({ genre: "console", texte: m.text(), url: page.url() });
  });
  page.on("pageerror", (e) => incidents.push({ genre: "exception", texte: e.message, url: page.url() }));
  page.on("requestfailed", (r) => {
    const echec = r.failure()?.errorText ?? "";
    // `net::ERR_ABORTED` accompagne une navigation interrompue par une autre :
    // ce n'est pas une requête en échec, c'est un changement d'avis.
    if (echec.includes("ERR_ABORTED")) return;
    incidents.push({ genre: "reseau", texte: `${r.method()} ${r.url()} — ${echec}` });
  });
  page.on("response", (r) => {
    if (r.status() >= 400) {
      incidents.push({ genre: "http", texte: `${r.status()} ${r.request().method()} ${r.url()}` });
    }
  });
  await page.addInitScript(() => {
    window.__violationsCsp = [];
    document.addEventListener("securitypolicyviolation", (e) => {
      window.__violationsCsp.push(`${e.violatedDirective} ← ${e.blockedURI}`);
    });
  });

  const session = {
    page,
    contexte,
    navigateur,
    incidents,
    persona,
    langue,
    compte,
    dossier,
    baseURL: pile.baseURL,

    /** Le texte visible de la page, tel qu'un lecteur le lirait. */
    texte: async () => (await page.locator("body").innerText()).replace(/\n{3,}/g, "\n\n"),

    /** L'arbre d'accessibilité : ce que le clavier et le lecteur d'écran voient. */
    arbre: async (selecteur = "body") => await page.locator(selecteur).ariaSnapshot(),

    capture: async (etiquette) => {
      const chemin = resolve(dossier, `${String(compteur(session)).padStart(2, "0")}-${etiquette}.png`);
      await page.screenshot({ path: chemin, fullPage: true });
      return chemin;
    },

    /** Les violations de CSP relevées depuis le chargement courant. */
    violationsCsp: async () => await page.evaluate(() => window.__violationsCsp ?? []),

    /** Les valeurs du premier jeu visibles à l'écran. Toute occurrence fait rouge. */
    fuitesJeu1: async () => chercherJeu1(await page.locator("body").innerText()),

    fermer: async () => {
      const csp = await session.violationsCsp().catch(() => []);
      for (const v of csp) incidents.push({ genre: "csp", texte: v });
      writeFileSync(
        resolve(dossier, "incidents.json"),
        JSON.stringify(incidents, null, 2),
        "utf8",
      );
      await contexte.tracing.stop({ path: resolve(dossier, "trace.zip") });
      await contexte.close();
      await navigateur.close();
      return incidents;
    },
  };

  if (!sansConnexion) {
    await connecter(session);
  }
  return session;
}

const compteurs = new WeakMap();
function compteur(session) {
  const n = (compteurs.get(session) ?? 0) + 1;
  compteurs.set(session, n);
  return n;
}

/**
 * La connexion, par le formulaire.
 *
 * Elle n'affirme rien sur la vue d'arrivée : c'est au parcours de le faire.
 * Elle échoue franchement si le champ n'existe pas — un pilote qui se tait
 * ferait porter l'échec à l'étape suivante.
 */
export async function connecter(session) {
  const { page, compte, baseURL } = session;
  await page.goto(`${baseURL}/`);
  await page.waitForLoadState("networkidle");
  const identifiant = page.getByLabel(/identifiant|login|username/i).first();
  await identifiant.waitFor({ state: "visible", timeout: 15_000 });
  await identifiant.fill(compte.login);
  await page.getByLabel(/mot de passe|password/i).first().fill(MOTDEPASSE_RECETTE);
  await page.getByRole("button", { name: /connexion|se connecter|sign in|log in/i }).first().click();
  /*
   * `networkidle` ne suffit pas : l'application est monopage, et le routeur
   * change de vue sans que le réseau reparte. Attendu ainsi, le pilote rendait
   * la main sur la page de connexion, et l'échec se lisait à l'étape suivante.
   * On attend que l'URL quitte `/connexion` — ce qui couvre aussi la
   * redirection vers le changement de mot de passe imposé.
   */
  await page.waitForURL((u) => !u.pathname.startsWith("/connexion"), { timeout: 20_000 });
  /*
   * L'URL change avant que la session soit chargée : la page affiche encore
   * « Chargement de votre session… ». Rendre la main ici ferait porter
   * l'échec à la première assertion du parcours, sur un symptôme qui ne
   * ressemble pas à sa cause. On attend le titre de la vue.
   */
  await page.locator("h1").first().waitFor({ state: "visible", timeout: 20_000 });
  await page.waitForLoadState("networkidle");
  return page.url();
}

export async function fermer(session) {
  return session.fermer();
}

/** Écrit le compte rendu d'un parcours au dossier de preuves. */
export function consigner(nom, persona, langue, verdict) {
  const dossier = resolve(PREUVES, nom, persona, langue);
  mkdirSync(dossier, { recursive: true });
  writeFileSync(resolve(dossier, "verdict.json"), JSON.stringify(verdict, null, 2), "utf8");
  return dossier;
}

export function lireParcours() {
  const chemin = resolve(RACINE, "recette/09-parcours.json");
  if (!existsSync(chemin)) throw new Error("recette/09-parcours.json n'existe pas encore.");
  return JSON.parse(readFileSync(chemin, "utf8"));
}
