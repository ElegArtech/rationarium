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
});
