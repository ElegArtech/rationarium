import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  StreamableFile,
} from "@nestjs/common";
import { z } from "zod";
import { DocumentsService } from "./documents.service.js";
import { dispositionPieceJointe } from "./stockage.js";
import { Demande, RequiertPermission, type ContexteDemande } from "../commun/permissions.garde.js";
import { fichierTropVolumineux, valider } from "../commun/http.js";

/** M15 — documents et commentaires, avec traçage des accès. */

/** `RG-DOC-04` — une pièce jointe pèse au plus 20 Mio. */
const TAILLE_MAX_PIECE_JOINTE = 20 * 1024 * 1024;

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
  async joindre(@Body() corps: unknown, @Demande() d: ContexteDemande) {
    const donnees = valider(
      z.object({
        nom: z.string().min(1).max(255),
        /*
         * Pas de `max` ici : un plafond sur la longueur du base64 rendait un
         * 400 « données invalides » pour un fichier un peu trop gros, là où
         * `RG-DOC-04` promet un 413 qui dit le plafond. La borne dure reste
         * la limite de corps du transport.
         */
        contenuBase64: z.base64(),
        typeMime: z.string().min(1).max(120),
        projectId: z.uuid().nullish(),
        taskId: z.uuid().nullish(),
      }),
      corps,
    );
    const { contenuBase64, ...reste } = donnees;
    // `RG-DOC-04` — mesuré sur le contenu DÉCODÉ, avant de le décoder.
    if (Buffer.byteLength(contenuBase64, "base64") > TAILLE_MAX_PIECE_JOINTE) {
      throw fichierTropVolumineux(TAILLE_MAX_PIECE_JOINTE);
    }
    // `RG-DOC-03` — avant d'écrire le moindre octet.
    await this.documents.exigerPorteursVisibles(reste, d.perimetre, d.permissions);
    return this.documents.joindre(
      { ...reste, contenu: Buffer.from(contenuBase64, "base64") },
      d.userId,
    );
  }

  /** `RG-DOC-02` — la consultation laisse une trace. */
  @Get(":id")
  @RequiertPermission("documents:read")
  consulter(@Param("id") id: string, @Demande() d: ContexteDemande) {
    return this.documents.consulter(id, d.userId, d.perimetre, d.permissions);
  }

  /**
   * `EX-DOC-02` — télécharger. **Une pièce jointe, pas un objet JSON.**
   *
   * `RG-DOC-02` — le téléchargement est tracé **distinctement**. Consulter et
   * télécharger ne sont pas le même geste : le second sort la donnée du
   * système. D'où deux points d'entrée et deux permissions.
   *
   * La vue 17 pose une ancre vers cette route. Sans `Content-Disposition`, le
   * navigateur ne télécharge pas : il **navigue**, quitte l'application et
   * affiche ce que la route a rendu — c'est le défaut constaté en recette
   * (P-53), et il se corrige par l'en-tête autant que par le corps.
   */
  @Get(":id/telecharger")
  @RequiertPermission("documents:download")
  async telecharger(@Param("id") id: string, @Demande() d: ContexteDemande) {
    const fichier = await this.documents.telecharger(id, d.userId, d.perimetre, d.permissions);
    return new StreamableFile(fichier.contenu, {
      type: fichier.typeMime,
      disposition: dispositionPieceJointe(fichier.nom),
      length: fichier.contenu.byteLength,
    });
  }

  @Patch(":id")
  @RequiertPermission("documents:update")
  async renommer(@Param("id") id: string, @Body() corps: unknown, @Demande() d: ContexteDemande) {
    /*
     * `RG-DOC-06`, `RG-GEN-07` — la version lue est OBLIGATOIRE. Elle a été
     * facultative tant que le client ne la portait pas ; facultative, elle ne
     * protégeait que les appelants qui voulaient bien l'être, et un renommage
     * sans version écrasait en silence celui d'une autre fenêtre.
     */
    const { nom, version } = valider(
      z.object({ nom: z.string().min(1).max(255), version: z.number().int().positive() }),
      corps,
    );
    // `RG-DOC-05` — la pièce d'autrui : permission dédiée, puis porteur lisible.
    await this.documents.exigerPorteurSiAutrui("document", id, d.userId, d.perimetre, d.permissions);
    return this.documents.renommer(id, nom, d.userId, d.permissions, version);
  }

  @Delete(":id")
  @RequiertPermission("documents:delete")
  async supprimer(@Param("id") id: string, @Demande() d: ContexteDemande) {
    await this.documents.exigerPorteurSiAutrui("document", id, d.userId, d.perimetre, d.permissions);
    return this.documents.supprimer(id, d.userId, d.permissions);
  }

  // ── Commentaires — EX-DOC-03, EX-DOC-04 ──────────────────────────────────

  @Get("commentaires/fil")
  @RequiertPermission("comments:read")
  async fil(@Query() requete: unknown, @Demande() d: ContexteDemande) {
    const fil = valider(cible, requete);
    // `RG-DOC-03` — le fil se lit si le porteur se lit, confidentialité comprise.
    await this.documents.exigerPorteursVisibles(fil, d.perimetre, d.permissions);
    return this.documents.fil(fil);
  }

  @Post("commentaires")
  @RequiertPermission("comments:create")
  async commenter(@Body() corps: unknown, @Demande() d: ContexteDemande) {
    const donnees = valider(
      z.object({
        contenu: z.string().min(1).max(10_000),
        projectId: z.uuid().nullish(),
        taskId: z.uuid().nullish(),
      }),
      corps,
    );
    await this.documents.exigerPorteursVisibles(donnees, d.perimetre, d.permissions);
    return this.documents.commenter(donnees, d.userId);
  }

  /** `RG-DOC-01` — on modifie ses propres contributions, pas celles d'autrui. */
  @Patch("commentaires/:id")
  @RequiertPermission("comments:update")
  async modifierCommentaire(
    @Param("id") id: string,
    @Body() corps: unknown,
    @Demande() d: ContexteDemande,
  ) {
    // `RG-DOC-06`, `RG-GEN-07` — la version lue accompagne la modification.
    const { contenu, version } = valider(
      z.object({ contenu: z.string().min(1).max(10_000), version: z.number().int().positive() }),
      corps,
    );
    await this.documents.exigerPorteurSiAutrui("commentaire", id, d.userId, d.perimetre, d.permissions);
    return this.documents.modifierCommentaire(id, contenu, version, d.userId, d.permissions);
  }

  @Delete("commentaires/:id")
  @RequiertPermission("comments:delete")
  async supprimerCommentaire(@Param("id") id: string, @Demande() d: ContexteDemande) {
    await this.documents.exigerPorteurSiAutrui("commentaire", id, d.userId, d.perimetre, d.permissions);
    return this.documents.supprimerCommentaire(id, d.userId, d.permissions);
  }
}
