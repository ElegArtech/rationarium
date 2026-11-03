/* global process, fetch, AbortSignal, URL, Buffer, setTimeout */
/**
 * M22 — agent de référence : ce que `rationarium-agent` et `rationarium-relais`
 * partagent (`docs/assistant/SPEC-PHASE-1.md § 10 et 14`).
 *
 * La configuration, la lecture du jeton, le client du guichet et le découpage
 * des actions en lots. Aucune dépendance : Node.js 24 et son `fetch` natif.
 *
 * Deux interdits tiennent tout le fichier.
 * - Le jeton ne s'affiche jamais : aucun message ne le porte, et `masquer`
 *   l'efface de tout texte qui sortirait malgré tout.
 * - La vérification TLS ne se désactive jamais : un certificat racine propre
 *   à l'instance s'ajoute par `RATIONARIUM_CA`, qui passe par
 *   `NODE_EXTRA_CA_CERTS`.
 */
import { spawn, spawnSync } from "node:child_process";
import { accessSync, constants, existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";

export const VERSION = "1.0.0";

/** `packages/contracts/src/assistant.ts` — `ACTIONS_PAR_LOT`. */
export const ACTIONS_PAR_LOT = 50;
/** Le guichet limite un corps à 1 Mio (`RG-ROB-01`) : un lot reste en dessous. */
export const OCTETS_PAR_LOT = 900_000;
/** `SECONDES_ATTENTE_PASSAGE` : l'attente maximale d'un appel à `passages/suivant`. */
export const SECONDES_ATTENTE_PASSAGE = 25;
export const LONGUEUR_PROGRESSION = 200;
export const LONGUEUR_ERREUR = 2000;

/** Les codes de sortie, communs aux deux exécutables. */
export const SORTIES = Object.freeze({ ok: 0, interne: 1, usage: 2, http: 3, reseau: 4 });

/** Attributs du trousseau sous lesquels le jeton est rangé. */
export const TROUSSEAU = Object.freeze(["service", "rationarium-agent", "usage", "jeton"]);

const IDENTIFIANT = /^[A-Za-z0-9_-]{1,64}$/;

// ── Erreurs ─────────────────────────────────────────────────────────────────

export class ErreurAgent extends Error {
  constructor(message, codeSortie = SORTIES.interne) {
    super(message);
    this.codeSortie = codeSortie;
  }
}

/** Une commande mal formée, ou une configuration absente : code 2. */
export class ErreurUsage extends ErreurAgent {
  constructor(message, { transitoire = false } = {}) {
    super(message, SORTIES.usage);
    /** Vrai quand la cause peut disparaître seule, comme un trousseau verrouillé. */
    this.transitoire = transitoire;
  }
}

/** Le guichet a répondu, et refusé : code 3. */
export class ErreurHttp extends ErreurAgent {
  constructor(statut, corps, attente) {
    super(messageHttp(statut, corps), SORTIES.http);
    this.statut = statut;
    this.corps = corps;
    /** Délai demandé par `Retry-After`, en millisecondes. */
    this.attente = attente;
  }
  get cle() {
    return typeof this.corps?.cle === "string" ? this.corps.cle : null;
  }
}

/** Le guichet n'a pas répondu : code 4. */
export class ErreurReseau extends ErreurAgent {
  constructor(message) {
    super(message, SORTIES.reseau);
  }
}

const INDICES_HTTP = {
  400: "requête refusée par le guichet",
  401: "jeton refusé : il est inconnu, révoqué ou expiré, ou son propriétaire est inactif (RG-AST-03)",
  403: "refusé : le propriétaire du jeton n'a pas le droit requis",
  404: "introuvable : le module est désactivé, ou la ressource n'existe pas pour ce propriétaire",
  409: "conflit",
  413: "corps trop volumineux",
  429: "débit limité par le guichet : réessayez plus tard",
};

function messageHttp(statut, corps) {
  const parties = [`refus HTTP ${statut}`];
  const indice = INDICES_HTTP[statut] ?? (statut >= 500 ? "erreur du serveur" : null);
  const message = typeof corps?.message === "string" ? corps.message : null;
  if (indice) parties.push(indice);
  if (message) parties.push(message);
  let texte = parties.join(" : ");
  const marques = [corps?.cle, corps?.regle].filter((v) => typeof v === "string");
  if (marques.length) texte += ` [${marques.join(", ")}]`;
  if (corps?.details !== undefined) texte += ` ${JSON.stringify(corps.details).slice(0, 500)}`;
  return texte;
}

/** Efface le jeton d'un texte, au cas où un message le porterait. */
export function masquer(texte, jeton) {
  const chaine = String(texte);
  if (!jeton || jeton.length < 8) return chaine;
  return chaine.split(jeton).join("rat_…");
}

// ── Configuration ───────────────────────────────────────────────────────────

/** `RATIONARIUM_CONFIG`, sinon `~/.config/rationarium-agent/agent.env`. */
export function cheminConfiguration(env = process.env) {
  if (env.RATIONARIUM_CONFIG) return env.RATIONARIUM_CONFIG;
  const base = env.XDG_CONFIG_HOME || join(env.HOME || homedir(), ".config");
  return join(base, "rationarium-agent", "agent.env");
}

/** Lignes `CLE=valeur`, commentaires `#` ; les guillemets englobants sont retirés. */
export function lireFichierEnv(texte) {
  const valeurs = {};
  for (const brute of texte.split(/\r?\n/)) {
    const ligne = brute.trim();
    if (!ligne || ligne.startsWith("#")) continue;
    const m = /^(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/.exec(ligne);
    if (!m) continue;
    let valeur = m[2];
    const q = valeur[0];
    if (valeur.length >= 2 && (q === '"' || q === "'") && valeur.endsWith(q)) valeur = valeur.slice(1, -1);
    valeurs[m[1]] = valeur;
  }
  return valeurs;
}

/**
 * Complète l'environnement par le fichier de configuration. Une variable déjà
 * présente l'emporte ; seules les clés `RATIONARIUM_…` sont lues.
 */
export function chargerConfiguration(env = process.env) {
  const chemin = cheminConfiguration(env);
  if (!existsSync(chemin)) {
    if (env.RATIONARIUM_CONFIG) throw new ErreurUsage(`RATIONARIUM_CONFIG désigne un fichier introuvable : ${chemin}`);
    return null;
  }
  for (const [cle, valeur] of Object.entries(lireFichierEnv(readFileSync(chemin, "utf8")))) {
    if (cle.startsWith("RATIONARIUM_") && (env[cle] === undefined || env[cle] === "")) env[cle] = valeur;
  }
  return chemin;
}

/** L'agent refuse de fonctionner sans vérification des certificats. */
export function verifierTls(env = process.env) {
  if (env.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
    throw new ErreurUsage(
      "NODE_TLS_REJECT_UNAUTHORIZED=0 désactive la vérification des certificats, et l'agent refuse de fonctionner ainsi. " +
        "Renseignez RATIONARIUM_CA avec le certificat racine de l'instance.",
    );
  }
}

/**
 * `RATIONARIUM_CA` — Node.js ne lit `NODE_EXTRA_CA_CERTS` qu'à son démarrage.
 * Quand le certificat n'est pas encore chargé, le processus se relance avec la
 * variable posée, et rend le code de sortie de sa relance. Rend `null` quand
 * aucune relance n'est nécessaire.
 */
export function relancerAvecCertificat(env = process.env) {
  const ca = env.RATIONARIUM_CA;
  if (!ca || env.NODE_EXTRA_CA_CERTS === ca) return Promise.resolve(null);
  if (!existsSync(ca)) throw new ErreurUsage(`RATIONARIUM_CA désigne un fichier introuvable : ${ca}`);
  return new Promise((resoudre) => {
    const enfant = spawn(process.execPath, [...process.execArgv, process.argv[1], ...process.argv.slice(2)], {
      stdio: "inherit",
      env: { ...env, NODE_EXTRA_CA_CERTS: ca },
    });
    const relayer = (signal) => enfant.kill(signal);
    for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(signal, relayer);
    enfant.on("error", () => resoudre(SORTIES.interne));
    enfant.on("exit", (code, signal) => resoudre(code ?? (signal ? 128 + 15 : SORTIES.interne)));
  });
}

/** L'adresse du guichet, tirée de `RATIONARIUM_URL`. */
export function baseGuichet(brute) {
  if (!brute) {
    throw new ErreurUsage("RATIONARIUM_URL n'est pas renseignée : indiquez l'adresse de l'instance, par exemple https://localhost:8443.");
  }
  let url;
  try {
    url = new URL(brute);
  } catch {
    throw new ErreurUsage(`RATIONARIUM_URL n'est pas une adresse valide : ${brute}`);
  }
  if (url.username || url.password) throw new ErreurUsage("RATIONARIUM_URL ne doit porter aucun identifiant.");
  const hote = url.hostname;
  const locale = ["localhost", "127.0.0.1", "[::1]"].includes(hote) || hote.endsWith(".localhost");
  if (url.protocol === "http:" && !locale) {
    throw new ErreurUsage("RATIONARIUM_URL emploie http:// vers un hôte distant, et le jeton y circulerait en clair. Employez https://.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new ErreurUsage(`RATIONARIUM_URL doit commencer par https:// : ${brute}`);
  }
  let chemin = url.pathname.replace(/\/+$/, "");
  if (!chemin.endsWith("/api/agent/v1")) chemin = chemin.endsWith("/api") ? `${chemin}/agent/v1` : `${chemin}/api/agent/v1`;
  url.pathname = chemin;
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/+$/, "");
}

// ── Jeton ───────────────────────────────────────────────────────────────────

export function trouverExecutable(nom, env = process.env) {
  for (const dossier of (env.PATH || "").split(delimiter)) {
    if (!dossier) continue;
    const chemin = join(dossier, nom);
    try {
      accessSync(chemin, constants.X_OK);
      return chemin;
    } catch {
      // absent de ce dossier
    }
  }
  return null;
}

/**
 * `RATIONARIUM_JETON`, sinon le trousseau du système par `secret-tool`.
 * Rend `{ jeton, source }` ; la source vaut `environnement` ou `trousseau`.
 */
export function lireJeton(env = process.env) {
  const direct = (env.RATIONARIUM_JETON || "").trim();
  if (direct) return { jeton: direct, source: "environnement" };
  const rangement = `secret-tool store --label='Rationarium agent' ${TROUSSEAU.join(" ")}`;
  const outil = trouverExecutable("secret-tool", env);
  if (!outil) {
    throw new ErreurUsage(`Aucun jeton : renseignez RATIONARIUM_JETON, ou rangez le jeton dans le trousseau avec \`${rangement}\`.`);
  }
  const r = spawnSync(outil, ["lookup", ...TROUSSEAU], {
    encoding: "utf8",
    timeout: 15_000,
    env,
    stdio: ["ignore", "pipe", "ignore"],
  });
  const jeton = (r.stdout || "").trim();
  if (r.status === 0 && jeton) return { jeton, source: "trousseau" };
  const cause = r.error?.code === "ETIMEDOUT" ? " ; le trousseau ne répond pas, il est peut-être verrouillé" : "";
  throw new ErreurUsage(
    `Le trousseau ne rend aucun jeton pour ${TROUSSEAU.join(" ")}${cause}. ` +
      `Rangez-le avec \`${rangement}\`, ou renseignez RATIONARIUM_JETON.`,
    { transitoire: true },
  );
}

// ── Client du guichet ───────────────────────────────────────────────────────

export const pause = (ms) => new Promise((r) => setTimeout(r, ms));

export function verifierIdentifiant(id, quoi = "passage") {
  if (!id || !IDENTIFIANT.test(id)) throw new ErreurUsage(`identifiant de ${quoi} invalide : ${id ?? "(absent)"}`);
  return id;
}

function erreurReseau(e, url) {
  const cause = e?.cause ?? e;
  const code = cause?.code ?? cause?.name ?? e?.name;
  if (e?.name === "TimeoutError" || cause?.name === "TimeoutError") {
    return new ErreurReseau(`le guichet ${url.host} n'a pas répondu dans le délai imparti`);
  }
  if (/CERT|SELF_SIGNED|UNABLE_TO_VERIFY|ERR_TLS|ERR_SSL/.test(String(code))) {
    return new ErreurReseau(
      `le certificat de ${url.host} n'est pas reconnu (${code}). Renseignez RATIONARIUM_CA avec le certificat racine de l'instance ; ` +
        "la vérification TLS n'est jamais désactivée",
    );
  }
  return new ErreurReseau(`le guichet ${url.host} est injoignable (${code ?? "erreur réseau"})`);
}

function attenteDemandee(reponse) {
  const valeur = Number(reponse.headers.get("retry-after"));
  return Number.isFinite(valeur) && valeur > 0 ? Math.min(valeur, 120) * 1000 : undefined;
}

export class Guichet {
  /**
   * @param {{ base: string, jeton: string, reessais?: number, delai?: number }} options
   * `reessais` : nouvelles tentatives sur une coupure réseau ou un 429, 502,
   * 503 ou 504, pour les seuls appels qu'on peut rejouer sans effet.
   */
  constructor({ base, jeton, reessais = 2, delai = 120 }) {
    this.base = base;
    this.jeton = jeton;
    this.reessais = reessais;
    this.delai = delai;
  }

  async appeler(methode, chemin, { corps, requete, delai = this.delai, rejouable = false } = {}) {
    const limite = rejouable ? this.reessais : 0;
    for (let tentative = 0; ; tentative += 1) {
      try {
        return await this.#une(methode, chemin, { corps, requete, delai });
      } catch (e) {
        const transitoire = e instanceof ErreurReseau || (e instanceof ErreurHttp && [429, 502, 503, 504].includes(e.statut));
        if (!transitoire || tentative >= limite) throw e;
        await pause(e.attente ?? 2000 * 2 ** tentative);
      }
    }
  }

  async #une(methode, chemin, { corps, requete, delai }) {
    const url = new URL(this.base + chemin);
    for (const [cle, valeur] of Object.entries(requete ?? {})) {
      if (valeur !== undefined && valeur !== null) url.searchParams.set(cle, String(valeur));
    }
    const entetes = {
      Authorization: `Bearer ${this.jeton}`,
      Accept: "application/json",
      "User-Agent": `rationarium-agent/${VERSION}`,
    };
    let body;
    if (corps !== undefined) {
      entetes["Content-Type"] = "application/json";
      body = JSON.stringify(corps);
    }
    let reponse;
    let texte;
    try {
      // Aucune redirection suivie : le jeton ne part que vers l'adresse configurée.
      reponse = await fetch(url, { method: methode, headers: entetes, body, redirect: "error", signal: AbortSignal.timeout(delai * 1000) });
      texte = await reponse.text();
    } catch (e) {
      throw erreurReseau(e, url);
    }
    let donnees = null;
    if (texte) {
      try {
        donnees = JSON.parse(texte);
      } catch {
        donnees = { message: texte.slice(0, 300) };
      }
    }
    if (!reponse.ok) throw new ErreurHttp(reponse.status, donnees, attenteDemandee(reponse));
    return donnees;
  }

  // Les routes du guichet (`SPEC-PHASE-1.md § 10`).

  etat() {
    return this.appeler("GET", "/etat", { rejouable: true });
  }
  suivant(secondes = SECONDES_ATTENTE_PASSAGE) {
    const attendre = Math.max(0, Math.min(SECONDES_ATTENTE_PASSAGE, Math.round(secondes)));
    return this.appeler("GET", "/passages/suivant", { requete: { attendre }, delai: attendre + 20, rejouable: true });
  }
  creerPassage(projectIds) {
    return this.appeler("POST", "/passages", { corps: projectIds?.length ? { projectIds } : {} });
  }
  prendre(id) {
    return this.appeler("POST", `/passages/${encodeURIComponent(id)}/prise`, { corps: {} });
  }
  progression(id, libelle) {
    return this.appeler("POST", `/passages/${encodeURIComponent(id)}/progression`, { corps: { libelle }, rejouable: true });
  }
  contexte(id) {
    return this.appeler("GET", `/passages/${encodeURIComponent(id)}/contexte`, { rejouable: true });
  }
  temps(id, du, au) {
    return this.appeler("GET", `/passages/${encodeURIComponent(id)}/temps`, { requete: { du, au }, rejouable: true });
  }
  /** Rejouer un lot identique dans le même passage rend le premier résultat (`RG-AST-12`). */
  actions(id, actions) {
    return this.appeler("POST", `/passages/${encodeURIComponent(id)}/actions`, { corps: { actions }, rejouable: true });
  }
  fin(id, corps) {
    return this.appeler("POST", `/passages/${encodeURIComponent(id)}/fin`, { corps });
  }
}

/** Le client configuré par l'environnement. */
export function creerGuichet(env = process.env) {
  const base = baseGuichet(env.RATIONARIUM_URL);
  const { jeton, source } = lireJeton(env);
  const reessais = env.RATIONARIUM_REESSAIS === undefined || env.RATIONARIUM_REESSAIS === "" ? 2 : Number(env.RATIONARIUM_REESSAIS);
  if (!Number.isInteger(reessais) || reessais < 0 || reessais > 10) {
    throw new ErreurUsage("RATIONARIUM_REESSAIS doit être un entier de 0 à 10.");
  }
  const guichet = new Guichet({ base, jeton, reessais });
  guichet.sourceJeton = source;
  return guichet;
}

// ── Attente et actions ──────────────────────────────────────────────────────

/**
 * Attend un passage pendant `secondes` au plus : un appel long jusqu'à 25 s,
 * puis d'autres, espacés de `pauseSecondes`. Rend le passage, ou `null`.
 */
export async function attendrePassage(guichet, secondes = SECONDES_ATTENTE_PASSAGE, pauseSecondes = 1) {
  const limite = Date.now() + secondes * 1000;
  for (;;) {
    const reste = Math.max(0, Math.ceil((limite - Date.now()) / 1000));
    const reponse = await guichet.suivant(Math.min(SECONDES_ATTENTE_PASSAGE, reste));
    if (reponse?.passage) return reponse.passage;
    if (Date.now() + pauseSecondes * 1000 >= limite) return null;
    await pause(pauseSecondes * 1000);
  }
}

/** Accepte un tableau d'actions ou `{ actions: [...] }`. */
export function normaliserActions(donnees) {
  const actions = Array.isArray(donnees) ? donnees : donnees && Array.isArray(donnees.actions) ? donnees.actions : null;
  if (!actions) throw new ErreurUsage("le fichier doit contenir un tableau d'actions, ou un objet { \"actions\": [...] }");
  if (actions.length === 0) throw new ErreurUsage("le fichier ne contient aucune action");
  actions.forEach((a, i) => {
    if (!a || typeof a !== "object" || Array.isArray(a) || typeof a.type !== "string") {
      throw new ErreurUsage(`l'action ${i} n'est pas un objet portant un champ "type"`);
    }
  });
  return actions;
}

/** Des lots de 50 actions au plus, chacun sous la limite de taille du guichet, dans l'ordre. */
export function decouperEnLots(actions, taille = ACTIONS_PAR_LOT, octetsMax = OCTETS_PAR_LOT) {
  const lots = [];
  let courant = [];
  let poids = 0;
  for (const action of actions) {
    const p = Buffer.byteLength(JSON.stringify(action)) + 1;
    if (courant.length && (courant.length >= taille || poids + p > octetsMax)) {
      lots.push(courant);
      courant = [];
      poids = 0;
    }
    courant.push(action);
    poids += p;
  }
  if (courant.length) lots.push(courant);
  return lots;
}

/**
 * Exécute les actions lot après lot, et renumérote les résultats dans l'ordre
 * du fichier. Un lot qui échoue arrête l'envoi : l'erreur porte `partiel`, le
 * compte rendu des lots déjà exécutés, qui ne doit pas se perdre.
 */
export async function executerActions(guichet, passageId, actions, { surLot } = {}) {
  const lots = decouperEnLots(actions);
  const bilan = { passageId, lots: lots.length, envoyees: actions.length, effectuees: 0, refusees: 0, resultats: [], interrompu: null };
  let decalage = 0;
  for (const [i, lot] of lots.entries()) {
    surLot?.(i + 1, lots.length, lot.length);
    let reponse;
    try {
      reponse = await guichet.actions(passageId, lot);
    } catch (e) {
      bilan.interrompu = { lot: i + 1, premiereAction: decalage, message: e.message };
      e.partiel = bilan;
      throw e;
    }
    for (const [j, r] of (reponse?.resultats ?? []).entries()) {
      const resultat = { ...r, index: decalage + (Number.isInteger(r.index) ? r.index : j), lot: i + 1 };
      bilan.resultats.push(resultat);
      if (r.etat === "effectuee") bilan.effectuees += 1;
      else if (r.etat === "refusee") bilan.refusees += 1;
    }
    decalage += lot.length;
  }
  return bilan;
}
