/**
 * @trame/contracts — contrat partagé client / serveur.
 *
 * Définition unique dont dérivent la validation d'entrée du serveur
 * (via nestjs-zod), les types et formulaires du client, la garde de
 * permission, la matrice d'administration et les tests.
 * Voir `docs/adr/ADR-0009`.
 */

export * from "./vocabulaires.js";
export * from "./permissions.js";
export * from "./roles.js";
export * from "./schemas.js";
