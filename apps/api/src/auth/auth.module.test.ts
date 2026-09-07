import { describe, it, expect } from "vitest";
import "reflect-metadata";
import { MODULE_METADATA } from "@nestjs/common/constants.js";
import { AuthModule } from "./auth.module.js";
import { AuthService } from "./auth.service.js";
import { NotificationsModule } from "../notifications/notifications.module.js";
import { FileService } from "../notifications/file.service.js";

/**
 * `EX-AUTH-05`, `RG-NTF-04` — **le module d'authentification a une file.**
 *
 * `AuthModule` n'importait rien : `demanderReinitialisation` engendrait un
 * jeton en clair, le contrôleur le jetait, et la vue 03 affirmait qu'un lien
 * venait d'être envoyé. Aucun contrôle ne pouvait le voir — une fonctionnalité
 * absente ne fait échouer personne, et un fournisseur non monté ne casse rien :
 * il se tait.
 *
 * `FileService` est injecté en `@Optional()` pour que les tests d'intégration
 * qui construisent le service à la main continuent de le faire ; **c'est
 * précisément ce qui rend ce contrôle nécessaire.** Sans lui, retirer l'import
 * du module ferait retomber le produit dans le silence d'origine, et tous les
 * tests resteraient verts.
 */
describe("EX-AUTH-05 — le courriel de réinitialisation a par où partir", () => {
  it("AuthModule importe le module qui fournit la file", () => {
    const imports = (Reflect.getMetadata(MODULE_METADATA.IMPORTS, AuthModule) ?? []) as unknown[];
    expect(imports).toContain(NotificationsModule);
  });

  it("NotificationsModule exporte bien la file — l'import ne suffit pas", () => {
    const exportes = (Reflect.getMetadata(MODULE_METADATA.EXPORTS, NotificationsModule) ??
      []) as unknown[];
    expect(exportes).toContain(FileService);
  });

  it("AuthService déclare la file dans ses dépendances", () => {
    // `emitDecoratorMetadata` est actif : les types de constructeur sont
    // lisibles à l'exécution. Un paramètre retiré se verrait ici.
    const parametres = (Reflect.getMetadata("design:paramtypes", AuthService) ??
      []) as unknown[];
    expect(parametres).toContain(FileService);
  });
});
