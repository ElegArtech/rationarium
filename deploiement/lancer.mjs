import { spawn } from "node:child_process";

// Prisma et pg-boss attendent une URL. Les champs de configuration restent séparés
// dans Compose ; chaque composant est encodé ici, y compris les signes % et /.
if (process.env.PGHOST) {
  const url = new URL("postgresql://localhost");
  url.hostname = process.env.PGHOST;
  url.port = process.env.PGPORT || "5432";
  url.username = encodeURIComponent(process.env.PGUSER || "rationarium");
  url.password = encodeURIComponent(process.env.PGPASSWORD || "");
  url.pathname = "/" + encodeURIComponent(process.env.PGDATABASE || "rationarium");
  process.env.DATABASE_URL = url.toString();
}
const [commande, ...arguments_] = process.argv.slice(2);
if (!commande) throw new Error("Commande de démarrage manquante.");
const enfant = spawn(commande, arguments_, { stdio: "inherit", env: process.env });
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => enfant.kill(signal));
enfant.on("error", (erreur) => { console.error(erreur.message); process.exitCode = 1; });
enfant.on("exit", (code, signal) => process.exit(code ?? (signal === "SIGTERM" ? 143 : 1)));
