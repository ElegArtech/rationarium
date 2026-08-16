/**
 * @trame/db — schéma, migrations et client typé.
 *
 * Le client est engendré par Prisma dans `src/generated` (non versionné,
 * reproductible par `pnpm db:generate`). Ce module le réexporte pour que le
 * reste du dépôt n'ait jamais à connaître ce chemin.
 *
 * Contraintes portées par ce paquet, voir cadrage/03 § 5 :
 *   - contraintes d'exclusion GiST et unicités composites (C15)
 *   - colonne `version` sur les entités modifiables (RG-GEN-07)
 *   - rôle SQL applicatif sans UPDATE ni DELETE sur `audit_log` (RG-ADM-01)
 *
 * Toute évolution du schéma passe par une tâche de schéma dédiée, jamais par
 * une tâche de fonctionnalité. Voir cadrage/04 § 5.3.
 */

export { PrismaClient } from "./generated/client.js";
export type * from "./generated/models.js";
export * from "./generated/enums.js";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient as Client } from "./generated/client.js";

/**
 * Fabrique un client connecté.
 *
 * En Prisma 7, la connexion passe obligatoirement par un **adaptateur de
 * pilote** : `datasourceUrl` n'existe plus. C'est la dépendance que
 * `ADR-0006` signalait comme à arrêter au lot L-02 — `@prisma/adapter-pg`,
 * aligné sur la version du client.
 */
export const creerClient = (url: string): Client =>
  new Client({ adapter: new PrismaPg({ connectionString: url }) });

/** Le jeu de données de volumétrie cible — `cadrage/01 § 7`, employé par L-26. */
export { peupler, CIBLE, CIBLE_REDUITE, type CibleVolumetrie } from "./volumetrie.js";

/**
 * Le jeu de données des maquettes, employé par la boucle de conformité.
 * Il ne sert qu'à mesurer : voir l'en-tête du module.
 */
export { peuplerMaquette, AGENTS, PROJETS } from "./maquette.js";

/** C14 — l'export intégral en formats ouverts, employé par L-29. */
export {
  listerTables,
  exporterTout,
  reimporterTout,
  type Manifeste,
  type LigneManifeste,
} from "./reversibilite.js";
