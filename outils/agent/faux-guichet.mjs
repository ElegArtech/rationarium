/* global process, URL */
/**
 * Outil des tests de l'agent de référence : un faux guichet `node:http`, et le
 * lancement des deux exécutables dans un environnement isolé.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ICI = dirname(fileURLToPath(import.meta.url));
export const AGENT = join(ICI, "rationarium-agent");
export const RELAIS = join(ICI, "rationarium-relais");
export const JETON = "rat_ce-jeton-ne-doit-jamais-sortir-0123456789";
export const PASSAGE = "6f1c2a7e-0b3d-4c5e-9a8b-1d2e3f405162";

/**
 * Les routes s'écrivent `"POST /passages/:id/actions"`, sans le préfixe
 * `/api/agent/v1`. Un gestionnaire rend `{ statut?, corps? }`.
 */
export async function demarrerFauxGuichet(routes) {
  const requetes = [];
  const motifs = Object.entries(routes).map(([cle, gestion]) => {
    const [methode, chemin] = cle.split(" ");
    const regex = new RegExp(`^${chemin.replace(/:[a-z]+/g, "([^/]+)")}$`);
    return { methode, regex, gestion };
  });
  const serveur = createServer(async (req, res) => {
    let texte = "";
    for await (const morceau of req) texte += morceau;
    const url = new URL(req.url, "http://faux");
    const chemin = url.pathname.replace(/^\/api\/agent\/v1/, "");
    const requete = {
      methode: req.method,
      chemin,
      prefixe: url.pathname.startsWith("/api/agent/v1/"),
      requete: Object.fromEntries(url.searchParams),
      autorisation: req.headers.authorization,
      corps: texte ? JSON.parse(texte) : undefined,
    };
    requetes.push(requete);
    const motif = motifs.find((m) => m.methode === req.method && m.regex.test(chemin));
    const { statut = 200, corps = null } = motif
      ? ((await motif.gestion(requete, chemin.match(motif.regex).slice(1))) ?? {})
      : { statut: 404, corps: { cle: "erreurs:introuvable", message: "Ressource introuvable." } };
    res.writeHead(statut, { "content-type": "application/json" });
    res.end(JSON.stringify(corps));
  });
  await new Promise((r) => serveur.listen(0, "127.0.0.1", r));
  return {
    url: `http://127.0.0.1:${serveur.address().port}`,
    requetes,
    fermer: () => new Promise((r) => serveur.close(r)),
  };
}

/** Un dossier temporaire, effacé par `nettoyer`. */
export function dossierTemporaire() {
  const chemin = mkdtempSync(join(tmpdir(), "rationarium-agent-"));
  return { chemin, nettoyer: () => rmSync(chemin, { recursive: true, force: true }) };
}

/**
 * Lance un exécutable, de façon asynchrone : le faux guichet tourne dans le
 * même processus. L'environnement part de zéro, pour qu'aucune configuration
 * ni aucun trousseau du poste n'entre dans le test.
 */
export function executer(script, args, { env = {}, entree, maison } = {}) {
  return new Promise((resoudre, rejeter) => {
    const base = {
      HOME: maison,
      XDG_CONFIG_HOME: join(maison, ".config"),
      XDG_STATE_HOME: join(maison, ".local", "state"),
      PATH: [dirname(process.execPath), "/usr/bin", "/bin"].join(delimiter),
      RATIONARIUM_REESSAIS: "0",
      LANG: "C.UTF-8",
    };
    const enfant = spawn(process.execPath, [script, ...args], { env: { ...base, ...env }, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    enfant.stdout.on("data", (d) => (stdout += d));
    enfant.stderr.on("data", (d) => (stderr += d));
    enfant.on("error", rejeter);
    enfant.on("close", (code) => resoudre({ code, stdout, stderr }));
    if (entree !== undefined) enfant.stdin.end(entree);
    else enfant.stdin.end();
  });
}
