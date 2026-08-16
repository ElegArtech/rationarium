import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { PrismaService } from "../prisma.service.js";
import { AuditService } from "../commun/audit.service.js";

/**
 * Documents et commentaires — M15.
 *
 * Deux exigences singulières gouvernent ce module.
 *
 * `RG-DOC-02` — **création, lecture, téléchargement, modification et
 * suppression de documents sont tracés.** La *lecture* et le *téléchargement*
 * y figurent, ce qui est rare : dans un système où des pièces jointes peuvent
 * porter des données personnelles, savoir qui a consulté quoi fait partie de
 * la traçabilité, pas du confort.
 *
 * `C14` — le chemin de stockage est adressé **par empreinte, jamais par nom
 * d'origine**. Deux fichiers homonymes ne se écrasent pas, et un nom de
 * fichier hostile ne peut pas s'échapper du volume.
 */

export type EchecDocument =
  | "rattachement_requis"
  | "pas_son_contenu"
  | "introuvable";

export class ErreurDocument extends Error {
  constructor(
    readonly code: EchecDocument,
    readonly detail?: Record<string, unknown>,
  ) {
    super(code);
  }
}

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Chemin de stockage d'un contenu, dérivé de son empreinte.
   *
   * `ab/cd/abcdef…` — deux niveaux de répartition pour qu'aucun répertoire ne
   * porte des centaines de milliers d'entrées. Le nom d'origine ne participe
   * jamais au chemin : il est une métadonnée d'affichage, pas une adresse.
   */
  cheminDeStockage(empreinte: string): string {
    return `${empreinte.slice(0, 2)}/${empreinte.slice(2, 4)}/${empreinte}`;
  }

  empreinteDe(contenu: Buffer): string {
    return createHash("sha256").update(contenu).digest("hex");
  }

  /** `EX-DOC-01` — joindre un document à un projet ou à une tâche. */
  async joindre(
    donnees: {
      nom: string; contenu: Buffer; typeMime: string;
      projectId?: string | null; taskId?: string | null;
    },
    acteurId: string,
  ) {
    if (!donnees.projectId && !donnees.taskId) throw new ErreurDocument("rattachement_requis");

    const empreinte = this.empreinteDe(donnees.contenu);
    const document = await this.prisma.document.create({
      data: {
        nom: donnees.nom,
        empreinte,
        tailleOctets: donnees.contenu.byteLength,
        typeMime: donnees.typeMime,
        auteurId: acteurId,
        projectId: donnees.projectId ?? null,
        taskId: donnees.taskId ?? null,
      },
    });

    await this.audit.tracer({
      action: "document.create", typeEntite: "Document", entiteId: document.id, acteurId,
      detail: { nom: donnees.nom, octets: donnees.contenu.byteLength },
    });
    return { ...document, chemin: this.cheminDeStockage(empreinte) };
  }

  /**
   * `EX-DOC-02` — consulter. **Tracé** (`RG-DOC-02`).
   *
   * La consultation d'une pièce jointe est une action sensible : elle laisse
   * une trace, comme le téléchargement.
   */
  async consulter(id: string, acteurId: string) {
    const document = await this.prisma.document.findUnique({ where: { id } });
    if (!document) throw new ErreurDocument("introuvable");

    await this.audit.tracer({
      action: "document.read", typeEntite: "Document", entiteId: id, acteurId,
    });
    return document;
  }

  /** `EX-DOC-02` — télécharger. Tracé distinctement de la consultation. */
  async telecharger(id: string, acteurId: string) {
    const document = await this.prisma.document.findUnique({ where: { id } });
    if (!document) throw new ErreurDocument("introuvable");

    // Consulter et télécharger ne sont pas le même geste : le second sort la
    // donnée du système. Les tracer sous la même action les rendrait
    // indiscernables au journal.
    await this.audit.tracer({
      action: "document.download", typeEntite: "Document", entiteId: id, acteurId,
    });
    return { ...document, chemin: this.cheminDeStockage(document.empreinte) };
  }

  /** `EX-DOC-02` — renommer. Le nom est une métadonnée : le contenu ne bouge pas. */
  async renommer(id: string, nom: string, acteurId: string) {
    const avant = await this.prisma.document.findUnique({ where: { id }, select: { nom: true } });
    if (!avant) throw new ErreurDocument("introuvable");

    await this.prisma.document.update({ where: { id }, data: { nom, version: { increment: 1 } } });
    await this.audit.tracer({
      action: "document.rename", typeEntite: "Document", entiteId: id, acteurId,
      detail: { avant: avant.nom, apres: nom },
    });
  }

  /**
   * `RG-DOC-01` — un utilisateur modifie et supprime **ses propres**
   * contributions ; agir sur celles d'autrui exige une permission dédiée.
   */
  async supprimer(id: string, acteurId: string, permissions: ReadonlySet<string>) {
    const document = await this.prisma.document.findUnique({
      where: { id },
      select: { auteurId: true, nom: true },
    });
    if (!document) throw new ErreurDocument("introuvable");

    if (document.auteurId !== acteurId && !permissions.has("documents:manage_any")) {
      throw new ErreurDocument("pas_son_contenu");
    }

    await this.audit.tracer({
      action: "document.delete", typeEntite: "Document", entiteId: id, acteurId,
      detail: { nom: document.nom, dAutrui: document.auteurId !== acteurId },
    });
    await this.prisma.document.delete({ where: { id } });
  }

  // ── Commentaires — EX-DOC-03, EX-DOC-04 ──────────────────────────────────

  async commenter(
    donnees: { contenu: string; projectId?: string | null; taskId?: string | null },
    acteurId: string,
  ) {
    if (!donnees.projectId && !donnees.taskId) throw new ErreurDocument("rattachement_requis");

    return this.prisma.comment.create({
      data: {
        contenu: donnees.contenu,
        auteurId: acteurId,
        projectId: donnees.projectId ?? null,
        taskId: donnees.taskId ?? null,
      },
    });
  }

  /** `RG-DOC-01` — on modifie ses propres commentaires, pas ceux des autres. */
  async modifierCommentaire(
    id: string,
    contenu: string,
    acteurId: string,
    permissions: ReadonlySet<string>,
  ) {
    const commentaire = await this.prisma.comment.findUnique({
      where: { id },
      select: { auteurId: true },
    });
    if (!commentaire) throw new ErreurDocument("introuvable");
    if (commentaire.auteurId !== acteurId && !permissions.has("comments:manage_any")) {
      throw new ErreurDocument("pas_son_contenu");
    }

    await this.prisma.comment.update({
      where: { id },
      data: { contenu, version: { increment: 1 } },
    });
  }

  async supprimerCommentaire(id: string, acteurId: string, permissions: ReadonlySet<string>) {
    const commentaire = await this.prisma.comment.findUnique({
      where: { id },
      select: { auteurId: true },
    });
    if (!commentaire) throw new ErreurDocument("introuvable");
    if (commentaire.auteurId !== acteurId && !permissions.has("comments:manage_any")) {
      throw new ErreurDocument("pas_son_contenu");
    }
    await this.prisma.comment.delete({ where: { id } });
  }

  /** Le fil d'un objet, ordonné du plus ancien au plus récent. */
  async fil(cible: { projectId?: string; taskId?: string }) {
    return this.prisma.comment.findMany({
      where: cible.projectId
        ? { projectId: cible.projectId }
        : { taskId: cible.taskId ?? null },
      orderBy: { creeLe: "asc" },
      include: { auteur: { select: { id: true, prenom: true, nom: true } } },
    });
  }
}
