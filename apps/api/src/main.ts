/**
 * @trame/api — point d'entrée du serveur.
 *
 * Contenu attendu, produit à partir du lot L-04 (vague 1) :
 *   - modules par domaine, un par module M… de cadrage/01
 *   - garde de permission        @RequirePermission('leaves:approve')
 *   - garde de périmètre         prédicat injecté dans chaque lecture
 *   - intercepteur d'audit       après la garde de permission, et sur son échec
 *   - intercepteur de concurrence optimiste → HTTP 409
 *
 * Voir cadrage/03 § 4, D5 et § 5.4.
 *
 * Vague 0 : squelette seul, aucun module.
 */

export {};
