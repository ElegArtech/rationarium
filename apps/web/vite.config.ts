import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  css: {
    // Lightning CSS est intégré à Vite : imbrication, préfixes, minification.
    // Aucun préprocesseur. Voir cadrage/03 § 3.2.
    transformer: "lightningcss",
  },
  build: {
    outDir: "dist",
    // C1 — réseau fermé : aucune ressource distante dans le lot de construction.
    assetsInlineLimit: 0,
  },
  server: {
    /*
     * En développement, le client et le serveur sont sur deux ports. Le client
     * appelle `/api` en chemin relatif — même origine, pas de CORS, un seul
     * cookie de session (`ADR-0008`) —, et c'est aussi ce que fait Caddy en
     * production. Sans ce relais, `/api/...` arrive sur Vite, qui rend
     * `index.html` : le client reçoit du HTML là où il attend du JSON, et
     * l'erreur ne parle de rien.
     *
     * Le port suit `PORT`, comme le serveur.
     */
    proxy: {
      "/api": {
        target: `http://localhost:${process.env["PORT"] ?? 3000}`,
        changeOrigin: false,
      },
    },
  },
});
