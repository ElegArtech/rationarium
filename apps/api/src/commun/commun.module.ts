import { Global, Module } from "@nestjs/common";
import { PrismaService } from "../prisma.service.js";
import { AuditService } from "./audit.service.js";
import { PerimetreService } from "./perimetre.service.js";

/**
 * Les services que **tout** module métier consomme : la base, le journal
 * d'audit, le constructeur de prédicats de périmètre.
 *
 * Le module est global. C'est une exception à la règle d'injection explicite,
 * et elle se motive : ces trois services sont des dépendances transverses par
 * construction — l'audit et le périmètre sont exigés sur *chaque* lecture et
 * *chaque* écriture (`cadrage/03 § 5.4`). Les redéclarer vingt fois ne
 * documenterait rien ; ça inviterait surtout à en oublier un.
 */
@Global()
@Module({
  providers: [PrismaService, AuditService, PerimetreService],
  exports: [PrismaService, AuditService, PerimetreService],
})
export class CommunModule {}
