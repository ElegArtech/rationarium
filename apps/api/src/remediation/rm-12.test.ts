import { HttpException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { AuthController } from "../auth/auth.controller.js";
import { AuthService, ErreurAuth } from "../auth/auth.service.js";
import { detecterTypeAvatar } from "../auth/avatar.js";
import { MESSAGES } from "../auth/messages.js";
import { UtilisateursService } from "../utilisateurs/utilisateurs.service.js";

const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
const jpeg = Buffer.from([0xff, 0xd8, 0, 0xff, 0xd9]);
const webp = Buffer.from("RIFF0000WEBP", "ascii");

describe("RM-12 — serveur profil, avatar et rôles système", () => {
  it("RG-AUTH-09 — reconnaît jpg, png et webp depuis les octets et refuse un faux format", () => {
    expect(detecterTypeAvatar(jpeg)).toBe("image/jpeg");
    expect(detecterTypeAvatar(png)).toBe("image/png");
    expect(detecterTypeAvatar(webp)).toBe("image/webp");
    expect(detecterTypeAvatar(Buffer.from("pas une image"))).toBeNull();
  });

  it("RG-AUTH-09 — refuse un MIME déclaré qui contredit le contenu réel", async () => {
    const service = new AuthService({} as never, {} as never);
    await expect(
      service.televerserAvatar("utilisateur", {
        contenu: png,
        typeMime: "image/jpeg",
        version: 1,
      }),
    ).rejects.toMatchObject({ code: "avatar_format_invalide" });
  });

  it("RG-GEN-07 — la suppression personnelle exige la version lue", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const service = new AuthService({ user: { updateMany } } as never, {} as never);
    await expect(service.supprimerAvatar("utilisateur", 3)).rejects.toEqual(
      new ErreurAuth("conflit_de_version"),
    );
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "utilisateur", version: 3 },
    }));
  });

  it("EX-AUTH-09 — le serveur transporte une URL de lecture quand un avatar existe", async () => {
    const service = new AuthService({
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: "utilisateur", prenom: "Camille", nom: "Durand",
          email: "camille@example.test", login: "camille",
          avatarFichier: "a".repeat(64), avatarPredefini: null,
          langue: "fr", theme: "auto", motDePasseAChanger: false,
          derniereConnexion: null, creeLe: new Date("2026-09-01T00:00:00Z"), version: 2,
          departement: null, services: [], role: null,
        }),
      },
    } as never, {} as never);
    await expect(service.profil("utilisateur")).resolves.toMatchObject({
      avatarFichier: "a".repeat(64),
      avatarUrl: "/api/auth/me/avatar",
    });
  });

  it("RG-GEN-03 — le refus de format reprend le message naturel exact de la vue 35", () => {
    expect(MESSAGES.avatar_format_invalide).toMatchObject({
      statut: 400,
      message: "Format non supporté. Utilisez jpg, png ou webp.",
    });
  });

  it("RG-AUTH-06 — le serveur énonce toute la politique sur un mot de passe non conforme", async () => {
    const controller = new AuthController({
      resoudreSession: vi.fn().mockResolvedValue({
        userId: "utilisateur",
        sessionId: "session",
        motDePasseAChanger: false,
      }),
      changerMotDePasse: vi.fn(),
    } as never);
    const requete = { cookies: { rationarium_session: "jeton" } } as never;

    for (const nouveau of ["Ab1!", "abcdef1!", "Abcdefgh!", "Abcdefg1"]) {
      try {
        await controller.changePassword(
          { actuel: "Actuel12!", nouveau, confirmation: nouveau },
          requete,
        );
        throw new Error("le mot de passe aurait dû être refusé");
      } catch (erreur) {
        expect(erreur).toBeInstanceOf(HttpException);
        expect((erreur as HttpException).getResponse()).toMatchObject({
          message: "Le mot de passe doit contenir au moins 8 caractères, une majuscule, un chiffre et un caractère spécial.",
        });
      }
    }
  });

  it("EX-AUTH-08 — le changement transmet le mot de passe actuel et conserve la session courante", async () => {
    const changerMotDePasse = vi.fn().mockResolvedValue(undefined);
    const controller = new AuthController({
      resoudreSession: vi.fn().mockResolvedValue({
        userId: "utilisateur",
        sessionId: "session-courante",
        motDePasseAChanger: false,
      }),
      changerMotDePasse,
    } as never);
    await controller.changePassword(
      { actuel: "Actuel12!", nouveau: "Nouveau12!", confirmation: "Nouveau12!" },
      { cookies: { rationarium_session: "jeton" } } as never,
    );
    expect(changerMotDePasse).toHaveBeenCalledWith(
      "utilisateur",
      "Actuel12!",
      "Nouveau12!",
      { conserverSessionId: "session-courante" },
    );
  });

  it("D-RM-06 — la session transporte systeme pour distinguer un rôle système d'un rôle personnalisé", async () => {
    const service = new AuthService({
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: "utilisateur",
          prenom: "Camille",
          nom: "Durand",
          email: "camille@example.test",
          login: "camille",
          avatarFichier: null,
          avatarPredefini: null,
          langue: "en",
          theme: "clair",
          motDePasseAChanger: false,
          derniereConnexion: null,
          creeLe: new Date("2026-09-01T00:00:00Z"),
          version: 1,
          departement: null,
          services: [],
          role: { code: "ADMIN", nom: "Administrateur", systeme: true, permissions: [] },
        }),
      },
    } as never, {} as never);
    await expect(service.profil("utilisateur")).resolves.toMatchObject({
      role: { code: "ADMIN", nom: "Administrateur", systeme: true },
    });
  });

  it("D-RM-06 — l'annuaire transporte aussi systeme sans traduire le nom personnalisé", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = new UtilisateursService(
      { user: { findMany } } as never,
      {} as never,
      { filtreUtilisateur: vi.fn().mockReturnValue({}) } as never,
    );
    await service.lister({} as never);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({
        role: { select: { id: true, code: true, nom: true, systeme: true } },
      }),
    }));
  });

  it("RG-AUTH-08 — la mise à jour de profil n'accepte jamais l'identifiant de connexion", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const service = new AuthService({
      user: {
        findUnique: vi.fn()
          .mockResolvedValueOnce({
            id: "utilisateur", login: "identifiant-stable", email: "a@example.test",
            avatarFichier: null, avatarPredefini: null,
          })
          .mockResolvedValueOnce(null),
        updateMany,
      },
    } as never, {} as never);
    service.profil = vi.fn().mockResolvedValue({ login: "identifiant-stable" });
    await service.modifierProfil("utilisateur", {
      email: "b@example.test",
      version: 1,
      login: "usurpateur",
    } as never);
    expect(updateMany.mock.calls[0]?.[0].data).not.toHaveProperty("login");
  });
});
