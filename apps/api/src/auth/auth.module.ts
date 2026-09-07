import { Module } from "@nestjs/common";
import { AuthService } from "./auth.service.js";
import { AuthController } from "./auth.controller.js";
import { PrismaService } from "../prisma.service.js";
import { AuditService } from "../commun/audit.service.js";
import { NotificationsModule } from "../notifications/notifications.module.js";

/**
 * M1 — authentification. Vues 01 à 05.
 *
 * **`NotificationsModule` n'est pas un ornement.** `EX-AUTH-05` veut qu'une
 * demande de réinitialisation produise un courriel ; le module n'importait
 * rien, `AuthService` n'avait aucune file, et le jeton en clair était jeté par
 * le contrôleur. La vue 03 annonçait pourtant « un lien vient d'être envoyé ».
 * L'import fournit `FileService` : l'envoi est une mise en file, jamais un
 * appel synchrone (`RG-NTF-04`).
 */
@Module({
  imports: [NotificationsModule],
  controllers: [AuthController],
  providers: [AuthService, PrismaService, AuditService],
  exports: [AuthService],
})
export class AuthModule {}
