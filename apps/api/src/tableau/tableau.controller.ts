import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { z } from "zod";
import { TableauService } from "./tableau.service.js";
import {
  Demande,
  Personnel,
  RequiertPermission,
  type ContexteDemande,
} from "../commun/permissions.garde.js";
import { valider } from "../commun/http.js";

/**
 * M16 — le tableau de bord. Vue 06.
 *
 * Deux régimes de garde cohabitent ici, et la différence est délibérée :
 *
 * - L'**accueil** exige `planning:read` : il porte un extrait de planning, et
 *   la barre latérale conditionne déjà l'entrée « Tableau de bord » à cette
 *   permission (`coquille/navigation.ts`).
 * - Les **to-do** sont marquées `@Personnel()` : `RG-DSH-01` les dit
 *   strictement privées, et les vingt-quatre domaines de permissions de
 *   `cadrage/01 § 3.2` n'en comportent aucun pour elles. Le contrôle est le
 *   `userId` de la session, présent dans chaque requête.
 */
@Controller("tableau-de-bord")
export class TableauController {
  constructor(private readonly tableau: TableauService) {}

  /** `EX-DSH-01` à `EX-DSH-07` — la page d'accueil, en un appel. */
  @Get()
  @RequiertPermission("planning:read")
  accueil(@Demande() d: ContexteDemande) {
    return this.tableau.accueil(d.userId, d.perimetre, d.permissions, new Date());
  }

  @Get("todos")
  @Personnel()
  todos(@Demande() d: ContexteDemande) {
    return this.tableau.todos(d.userId);
  }

  /** `RG-DSH-01` — le plafond est contrôlé ici, pas seulement à la saisie. */
  @Post("todos")
  @Personnel()
  ajouter(@Body() corps: unknown, @Demande() d: ContexteDemande) {
    const { libelle } = valider(z.object({ libelle: z.string().min(1).max(200) }), corps);
    return this.tableau.ajouterTodo(d.userId, libelle);
  }

  /** `RG-DSH-02` — l'édition par double-clic n'écrit qu'un champ à la fois. */
  @Patch("todos/:id")
  @Personnel()
  modifier(@Param("id") id: string, @Body() corps: unknown, @Demande() d: ContexteDemande) {
    const donnees = valider(
      z.object({ libelle: z.string().min(1).max(200).optional(), fait: z.boolean().optional() }),
      corps,
    );
    return this.tableau.modifierTodo(d.userId, id, donnees);
  }

  @Delete("todos/:id")
  @Personnel()
  supprimer(@Param("id") id: string, @Demande() d: ContexteDemande) {
    return this.tableau.supprimerTodo(d.userId, id);
  }
}
