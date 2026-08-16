/**
 * @trame/db — schéma, migrations et client typé.
 *
 * Contenu attendu, produit par le lot L-02 (vague 1) :
 *   - prisma/schema.prisma  — le modèle (~40 tables)
 *   - prisma/migrations/    — migrations déterministes
 *   - src/scope.ts          — constructeur de prédicats de périmètre (L-06)
 *   - src/sql/              — les requêtes chaudes écrites à la main
 *                             (planning agrégé, rapports, matrice de compétences)
 *
 * Contraintes portées par ce paquet, voir cadrage/03 § 5 :
 *   - contraintes d'exclusion GiST et unicités composites (C15)
 *   - colonne `version` sur les entités modifiables (RG-GEN-07)
 *   - rôle SQL applicatif sans UPDATE ni DELETE sur `audit_log` (RG-ADM-01)
 *
 * Toute évolution du schéma passe par une tâche de schéma dédiée,
 * jamais par une tâche de fonctionnalité. Voir cadrage/04 § 5.3.
 *
 * Vague 0 : squelette seul, aucun modèle.
 */

export {};
