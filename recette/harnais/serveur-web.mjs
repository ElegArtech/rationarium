/**
 * Le serveur du harnais de recette — hors produit.
 *
 * Il sert le **lot construit** de `apps/web/dist` et relaie `/api` vers le
 * serveur applicatif, exactement comme Caddy le fait en exploitation
 * (`deploiement/Caddyfile`) et comme le relais de Vite le fait en
 * développement (`apps/web/vite.config.ts`).
 *
 * **Pourquoi il existe.** `vite preview` ne lit pas `server.proxy` — il lit
 * `preview.proxy`, que la configuration du produit ne pose pas. La suite de
 * bout en bout existante n'a donc jamais parlé à un serveur réel : elle
 * simule `/api` par interception. C'est légitime pour un contrôle de routage ;
 * ça ne l'est pas pour une recette, dont l'objet est justement le raccord
 * entre les deux moitiés.
 *
 *     node serveur-web.mjs --port 4300 --api 3200
 */
import { createServer, request as requeteHttp } from "node:http";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ICI = fileURLToPath(new URL(".", import.meta.url));
const LOT = resolve(ICI, "../../apps/web/dist");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json; charset=utf-8",
};

/**
 * La politique de sécurité de contenu du déploiement, lue dans le `Caddyfile`.
 *
 * Elle est posée ici parce qu'une violation de CSP ne se voit **que** sous
 * CSP : l'aperçu de Vite n'en sert aucune, et c'est ce qui a laissé un
 * avertissement permanent dans la console de l'instance déployée. La recette
 * joue le produit tel qu'il est servi, en-têtes compris.
 */
export function politiqueDuCaddyfile() {
  const chemin = resolve(ICI, "../../deploiement/Caddyfile");
  if (!existsSync(chemin)) return null;
  const texte = readFileSync(chemin, "utf8");
  const ligne = texte.split("\n").find((l) => l.includes("Content-Security-Policy"));
  if (!ligne) return null;
  const guillemets = ligne.match(/"([^"]*)"/);
  return guillemets ? guillemets[1] : null;
}

export function demarrerServeurWeb({ port, portApi, csp = null }) {
  const serveur = createServer((entrante, sortante) => {
    const url = new URL(entrante.url ?? "/", `http://${entrante.headers.host ?? "localhost"}`);

    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      const relais = requeteHttp(
        {
          host: "127.0.0.1",
          port: portApi,
          method: entrante.method,
          path: entrante.url,
          headers: { ...entrante.headers, host: `127.0.0.1:${portApi}` },
        },
        (reponse) => {
          sortante.writeHead(reponse.statusCode ?? 502, reponse.headers);
          reponse.pipe(sortante);
        },
      );
      relais.on("error", (e) => {
        sortante.writeHead(502, { "content-type": "application/json" });
        sortante.end(JSON.stringify({ message: `relais indisponible : ${e.message}` }));
      });
      entrante.pipe(relais);
      return;
    }

    // Fichier du lot, sinon `index.html` : l'application est monopage.
    const demande = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
    let fichier = join(LOT, demande);
    if (!fichier.startsWith(LOT) || !existsSync(fichier) || statSync(fichier).isDirectory()) {
      fichier = join(LOT, "index.html");
    }
    const entetes = { "content-type": TYPES[extname(fichier)] ?? "application/octet-stream" };
    if (csp) entetes["content-security-policy"] = csp;
    sortante.writeHead(200, entetes);
    createReadStream(fichier).pipe(sortante);
  });

  return new Promise((ok) => serveur.listen(port, "127.0.0.1", () => ok(serveur)));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (nom, defaut) => {
    const i = process.argv.indexOf(`--${nom}`);
    return i === -1 ? defaut : process.argv[i + 1];
  };
  const port = Number(arg("port", 4300));
  const portApi = Number(arg("api", 3200));
  await demarrerServeurWeb({ port, portApi });
  console.log(`harnais web : http://127.0.0.1:${port} → api ${portApi}`);
}
