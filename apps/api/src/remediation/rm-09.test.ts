import "reflect-metadata";
import { HttpException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { AdministrationController } from "../administration/administration.controller.js";
import { CLE_PERMISSION } from "../commun/permissions.garde.js";
import { OrganisationController } from "../organisation/organisation.controller.js";
import { UtilisateursController } from "../utilisateurs/utilisateurs.controller.js";

describe("RM-09 — routes d'administration", () => {
  it("EX-ADM-06 — l'initialisation interactive exige une confirmation vraie avant tout appel", async () => {
    const initialiserReferentiel = vi.fn().mockResolvedValue({ crees: 1, existants: 0 });
    const controller = new AdministrationController(
      { initialiserReferentiel } as never,
      {} as never,
    );
    const demande = { userId: "acteur" } as never;
    expect(() => controller.initialiserRoles({ confirmer: false }, demande)).toThrow(HttpException);
    expect(initialiserReferentiel).not.toHaveBeenCalled();
    await expect(controller.initialiserRoles({ confirmer: true }, demande)).resolves.toEqual({
      crees: 1, existants: 0,
    });
    expect(initialiserReferentiel).toHaveBeenCalledWith("acteur");
    expect(Reflect.getMetadata(
      CLE_PERMISSION,
      AdministrationController.prototype.initialiserRoles,
    )).toBe("users:manage_roles");
  });

  it("RG-DROITS-03 — chaque niveau organisationnel possède sa permission de modification propre", () => {
    expect(Reflect.getMetadata(
      CLE_PERMISSION,
      OrganisationController.prototype.modifierDirection,
    )).toBe("directions:update");
    expect(Reflect.getMetadata(
      CLE_PERMISSION,
      OrganisationController.prototype.modifierDepartement,
    )).toBe("departments:update");
    expect(Reflect.getMetadata(
      CLE_PERMISSION,
      OrganisationController.prototype.modifierService,
    )).toBe("services:update");
  });

  it("RG-GEN-07 — les trois routes organisationnelles refusent l'absence de version", () => {
    const renommer = vi.fn();
    const controller = new OrganisationController({ renommer } as never);
    const demande = { userId: "acteur" } as never;
    for (const appeler of [
      () => controller.modifierDirection("id", { nom: "Direction" }, demande),
      () => controller.modifierDepartement("id", { directionId: null }, demande),
      () => controller.modifierService("id", { nom: "Service" }, demande),
    ]) expect(appeler).toThrow(HttpException);
    expect(renommer).not.toHaveBeenCalled();
  });

  it("RG-USR-04 et RG-GEN-07 — cycle de vie et suppression exigent version, plus confirmation explicite pour l'irréversible", async () => {
    const desactiver = vi.fn().mockResolvedValue(undefined);
    const reactiver = vi.fn().mockResolvedValue(undefined);
    const supprimerDefinitivement = vi.fn().mockResolvedValue(undefined);
    const controller = new UtilisateursController({
      desactiver, reactiver, supprimerDefinitivement,
    } as never);
    const demande = { userId: "acteur" } as never;
    expect(() => controller.desactiver("cible", {}, demande)).toThrow(HttpException);
    expect(() => controller.reactiver("cible", {}, demande)).toThrow(HttpException);
    expect(() => controller.supprimer(
      "cible", { version: 2, confirmer: false }, demande,
    )).toThrow(HttpException);
    expect(supprimerDefinitivement).not.toHaveBeenCalled();

    await controller.desactiver("cible", { version: 2 }, demande);
    await controller.reactiver("cible", { version: 3 }, demande);
    await controller.supprimer("cible", { version: 4, confirmer: true }, demande);
    expect(desactiver).toHaveBeenCalledWith("cible", "acteur", 2);
    expect(reactiver).toHaveBeenCalledWith("cible", "acteur", 3);
    expect(supprimerDefinitivement).toHaveBeenCalledWith("cible", "acteur", 4);
  });
});
