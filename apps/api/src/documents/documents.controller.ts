import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { DocumentsService } from "./documents.service.js";
import { Demande, RequiertPermission, type ContexteDemande } from "../commun/permissions.garde.js";
import { valider } from "../commun/http.js";

/** M15 — documents et commentaires, avec traçage des accès. */

const cible = z
  .object({ projectId: z.uuid().optional(), taskId: z.uuid().optional() })
  .refine((c) => Boolean(c.projectId) !== Boolean(c.taskId), {
    message: "Rattachez à un projet ou à une tâche, pas aux deux.",
  });

@Controller("documents")
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  /**
   * `EX-DOC-01` — joindre un document.
   *
   * Le contenu arrive en base64 plutôt qu'en `multipart` : les pièces jointes
   * de ce produit sont des documents de travail, pas des vidéos, et un seul
   * format de corps sur tout le serveur évite une seconde chaîne de validation.
   */
  @Post()
  @RequiertPermission("documents:create")
  joindre(@Body() corps: unknown, @Demande() d: ContexteDemande) {
    const donnees = valider(
      z.object({
        nom: z.string().min(1).max(255),
        contenuBase64: z.base64().max(30_000_000),
        typeMime: z.string().min(1).max(120),
        projectId: z.uuid().nullish(),
        taskId: z.uuid().nullish(),
      }),
      corps,
    );
    const { contenuBase64, ...reste } = donnees;
    return this.documents.joindre(
      { ...reste, contenu: Buffer.from(contenuBase64, "base64") },
      d.userId,
    );
  }

  /** `RG-DOC-02` — la consultation laisse une trace. */
  @Get(":id")
  @RequiertPermission("documents:read")
  consulter(@Param("id") id: string, @Demande() d: ContexteDemande) {
    return this.documents.consulter(id, d.userId);
  }

  /**
   * `RG-DOC-02` — le téléchargement est tracé **distinctement**.
   *
   * Consulter et télécharger ne sont pas le même geste : le second sort la
   * donnée du système. D'où deux points d'entrée et deux permissions.
   */
  @Get(":id/telecharger")
  @RequiertPermission("documents:download")
  telecharger(@Param("id") id: string, @Demande() d: ContexteDemande) {
    return this.documents.telecharger(id, d.userId);
  }

  @Patch(":id")
  @RequiertPermission("documents:update")
  renommer(@Param("id") id: string, @Body() corps: unknown, @Demande() d: ContexteDemande) {
    const { nom } = valider(z.object({ nom: z.string().min(1).max(255) }), corps);
    return this.documents.renommer(id, nom, d.userId);
  }

  @Delete(":id")
  @RequiertPermission("documents:delete")
  supprimer(@Param("id") id: string, @Demande() d: ContexteDemande) {
    return this.documents.supprimer(id, d.userId, d.permissions);
  }

  // ── Commentaires — EX-DOC-03, EX-DOC-04 ──────────────────────────────────

  @Get("commentaires/fil")
  @RequiertPermission("comments:read")
  fil(@Query() requete: unknown) {
    return this.documents.fil(valider(cible, requete));
  }

  @Post("commentaires")
  @RequiertPermission("comments:create")
  commenter(@Body() corps: unknown, @Demande() d: ContexteDemande) {
    const donnees = valider(
      z.object({
        contenu: z.string().min(1).max(10_000),
        projectId: z.uuid().nullish(),
        taskId: z.uuid().nullish(),
      }),
      corps,
    );
    return this.documents.commenter(donnees, d.userId);
  }

  /** `RG-DOC-01` — on modifie ses propres contributions, pas celles d'autrui. */
  @Patch("commentaires/:id")
  @RequiertPermission("comments:update")
  modifierCommentaire(
    @Param("id") id: string,
    @Body() corps: unknown,
    @Demande() d: ContexteDemande,
  ) {
    const { contenu } = valider(z.object({ contenu: z.string().min(1).max(10_000) }), corps);
    return this.documents.modifierCommentaire(id, contenu, d.userId, d.permissions);
  }

  @Delete("commentaires/:id")
  @RequiertPermission("comments:delete")
  supprimerCommentaire(@Param("id") id: string, @Demande() d: ContexteDemande) {
    return this.documents.supprimerCommentaire(id, d.userId, d.permissions);
  }
}
