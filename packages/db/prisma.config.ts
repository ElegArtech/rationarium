import { defineConfig, env } from "prisma/config";

/**
 * Configuration Prisma 7.
 *
 * En Prisma 7, l'URL de connexion ne vit plus dans le bloc `datasource` du
 * schéma : elle est déclarée ici pour les commandes de migration et
 * d'introspection, et fournie au client par un adaptateur de pilote.
 * Voir docs/adr/ADR-0006.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DATABASE_URL"),
  },
});
