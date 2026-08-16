import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service.js";

/**
 * Journal d'audit — RG-ADM-01, `cadrage/01 § M20`.
 *
 * **Une trace ne doit jamais empêcher une action métier d'aboutir.** C'est
 * l'esprit de RG-NTF-04 appliqué ici : si l'écriture de la trace échoue, on
 * journalise l'incident et on laisse passer. L'inverse — refuser une
 * approbation de congé parce que le journal est saturé — serait pire que
 * l'absence de trace.
 *
 * La table est en ajout seul, garanti par les droits SQL et non par ce code :
 * le rôle applicatif n'a ni UPDATE ni DELETE dessus.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async tracer(entree: {
    action: string;
    typeEntite: string;
    entiteId?: string | null;
    acteurId?: string | null;
    systeme?: boolean;
    detail?: Record<string, unknown>;
  }): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          action: entree.action,
          typeEntite: entree.typeEntite,
          entiteId: entree.entiteId ?? null,
          acteurId: entree.acteurId ?? null,
          systeme: entree.systeme ?? false,
          detail: (entree.detail ?? null) as never,
        },
      });
    } catch (e) {
      // Volontairement avalé. Voir l'en-tête de ce fichier.
      console.error("[audit] trace non écrite", entree.action, e);
    }
  }
}
