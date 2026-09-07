import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DocumentsService, ErreurDocument } from "./documents.service.js";
import { DocumentsController } from "./documents.controller.js";
import {
  dispositionPieceJointe,
  ecrireContenu,
  empreinteSure,
  lireContenu,
  racineStockage,
  RACINE_PAR_DEFAUT,
} from "./stockage.js";

/**
 * `EX-DOC-02` — **télécharger rend un fichier.**
 *
 * Le défaut que ces contrôles auraient vu (P-53) : la route rendait l'objet
 * Prisma en JSON, augmenté du chemin de stockage interne, et le navigateur
 * quittait l'application pour l'afficher. Aucune boucle ne pouvait s'en
 * apercevoir — la route répondait 200, le typage décrivait bien ce qu'elle
 * rendait, et rien n'affirmait ce qu'elle **devait** rendre.
 */

let racine: string;
let ancienne: string | undefined;

/** Un document en base, sans porteur : la visibilité n'est pas le sujet ici. */
const ligne = (empreinte: string) => ({
  id: "0000460b-0000-4000-8000-000000000001",
  nom: "Grille-analyse-des-offres.ods",
  empreinte,
  tailleOctets: 7,
  typeMime: "application/vnd.oasis.opendocument.spreadsheet",
  auteurId: null,
  projectId: null,
  taskId: null,
  version: 1,
});

const traces: { action: string }[] = [];

function service(document: ReturnType<typeof ligne> | null) {
  traces.length = 0;
  return new DocumentsService(
    { document: { findUnique: async () => document } } as never,
    { tracer: async (t: { action: string }) => void traces.push(t) } as never,
    {} as never,
  );
}

const perimetre = { global: true, userId: "u", utilisateurs: new Set<string>() } as never;

beforeAll(async () => {
  racine = await mkdtemp(path.join(tmpdir(), "rationarium-docs-"));
  ancienne = process.env["RATIONARIUM_DOCUMENTS"];
  process.env["RATIONARIUM_DOCUMENTS"] = racine;
});

afterAll(async () => {
  if (ancienne === undefined) delete process.env["RATIONARIUM_DOCUMENTS"];
  else process.env["RATIONARIUM_DOCUMENTS"] = ancienne;
  await rm(racine, { recursive: true, force: true });
});

describe("EX-DOC-02 — le téléchargement rend un fichier", () => {
  const empreinte = "a".repeat(64);

  it("rend le nom, le type et le CONTENU — et jamais le chemin de stockage", async () => {
    await ecrireContenu(empreinte, Buffer.from("colonne"));
    const fichier = await service(ligne(empreinte)).telecharger(
      "0000460b-0000-4000-8000-000000000001",
      "acteur",
      perimetre,
      new Set(),
    );

    expect(fichier.contenu).toBeInstanceOf(Buffer);
    expect(fichier.contenu.toString()).toBe("colonne");
    expect(fichier.nom).toBe("Grille-analyse-des-offres.ods");
    expect(fichier.typeMime).toBe("application/vnd.oasis.opendocument.spreadsheet");

    /*
     * Le point exact du défaut : la réponse portait `chemin: "aa/aa/aaa…"`.
     * L'assertion porte sur la SÉRIALISATION, pas sur une clé nommée — un
     * chemin qui reviendrait sous un autre nom serait tout aussi divulgué.
     */
    const serialisee = JSON.stringify({ ...fichier, contenu: undefined });
    expect(serialisee).not.toContain(empreinte.slice(0, 2) + "/");
    expect(serialisee).not.toContain(empreinte);
    expect(Object.keys(fichier).sort()).toEqual(["contenu", "nom", "typeMime"]);
  });

  it("`RG-DOC-02` — le téléchargement est tracé distinctement de la consultation", async () => {
    await ecrireContenu(empreinte, Buffer.from("colonne"));
    const s = service(ligne(empreinte));
    await s.telecharger("0000460b-0000-4000-8000-000000000001", "acteur", perimetre, new Set());
    expect(traces.map((t) => t.action)).toEqual(["document.download"]);
  });

  it("une ligne sans son contenu est introuvable, jamais un fichier vide", async () => {
    // Le cas des jeux de données qui écrivent la métadonnée sans les octets :
    // rendre 200 avec un corps vide livrerait un fichier corrompu portant le
    // bon nom, ce qu'aucun utilisateur ne peut diagnostiquer.
    await expect(
      service(ligne("b".repeat(64))).telecharger("x", "acteur", perimetre, new Set()),
    ).rejects.toMatchObject({ code: "introuvable" });
    expect(traces).toEqual([]);
  });

  it("un document inexistant reste introuvable", async () => {
    await expect(service(null).telecharger("x", "acteur", perimetre, new Set())).rejects.toThrow(
      ErreurDocument,
    );
  });
});

describe("C14 — le magasin est adressé par empreinte", () => {
  it("refuse toute empreinte qui n'est pas hexadécimale", () => {
    // Une empreinte vient de la base, pas d'un calcul : un jeu de données y
    // écrit ce qu'il veut. `../../` composerait un chemin hors du volume.
    expect(empreinteSure("a".repeat(64))).toBe(true);
    expect(empreinteSure("recette-f3")).toBe(false);
    expect(empreinteSure("../../etc/passwd")).toBe(false);
    expect(empreinteSure("")).toBe(false);
  });

  it("n'écrit ni ne lit rien sous une empreinte non sûre", async () => {
    await ecrireContenu("../evasion", Buffer.from("x"));
    expect(await lireContenu("../evasion")).toBeNull();
  });

  it("la racine se paramètre, et une variable VIDE vaut absente", () => {
    process.env["RATIONARIUM_DOCUMENTS"] = "";
    expect(racineStockage()).toBe(path.resolve(process.cwd(), RACINE_PAR_DEFAUT));
    process.env["RATIONARIUM_DOCUMENTS"] = racine;
    expect(racineStockage()).toBe(racine);
  });
});

describe("EX-DOC-02 — l'en-tête de pièce jointe", () => {
  it("porte le nom en ASCII et en UTF-8", () => {
    const entete = dispositionPieceJointe("Règles-de-paie-2026.odt");
    expect(entete.startsWith("attachment;")).toBe(true);
    expect(entete).toContain(`filename="R_gles-de-paie-2026.odt"`);
    expect(entete).toContain("filename*=UTF-8''R%C3%A8gles-de-paie-2026.odt");
  });

  it("neutralise un nom qui refermerait le guillemet", () => {
    expect(dispositionPieceJointe('a";x=y.pdf')).toContain(`filename="a_;x=y.pdf"`);
  });
});

/**
 * Le contrôle qui aurait vu le défaut **tel qu'il a été constaté** : par la
 * réponse HTTP.
 *
 * La recette n'a pas relevé « le service rend un mauvais objet » — elle a
 * relevé « réponse 200, type `application/json`, disposition aucune, fichier
 * aucun ». Un contrôle qui s'arrête au service ne dit rien de l'en-tête, et
 * c'est l'en-tête qui décide si le navigateur télécharge ou s'il NAVIGUE,
 * c'est-à-dire s'il quitte l'application pour afficher la réponse.
 */
describe("EX-DOC-02 — la réponse HTTP est une pièce jointe", () => {
  it("porte le type du fichier, sa disposition et ses octets — jamais du JSON", async () => {
    const empreinte = "c".repeat(64);
    await ecrireContenu(empreinte, Buffer.from("colonne;valeur\n1;2\n"));

    @Module({
      controllers: [DocumentsController],
      providers: [{ provide: DocumentsService, useValue: service(ligne(empreinte)) }],
    })
    class ModuleDEssai {}

    const app = await NestFactory.create<NestFastifyApplication>(
      ModuleDEssai,
      new FastifyAdapter(),
      { logger: false },
    );
    /*
     * `@Demande()` lit le contexte que la GARDE dépose sur la requête. Elle
     * n'est pas montée ici — ce contrôle porte sur la réponse, pas sur le
     * cloisonnement, qui a ses propres suites —, donc on le dépose à la main.
     */
    app.getHttpAdapter().getInstance().addHook("onRequest", (requete, _reponse, suite) => {
      (requete as unknown as { trame: unknown }).trame = {
        userId: "acteur",
        permissions: new Set<string>(),
        perimetre,
      };
      suite();
    });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    const reponse = await app
      .getHttpAdapter()
      .getInstance()
      .inject({ method: "GET", url: "/documents/0000460b-0000-4000-8000-000000000001/telecharger" });

    expect(reponse.statusCode).toBe(200);
    expect(reponse.headers["content-type"]).toContain(
      "application/vnd.oasis.opendocument.spreadsheet",
    );
    expect(reponse.headers["content-type"]).not.toContain("application/json");
    expect(String(reponse.headers["content-disposition"])).toContain("attachment;");
    expect(String(reponse.headers["content-disposition"])).toContain(
      "Grille-analyse-des-offres.ods",
    );
    expect(reponse.body).toBe("colonne;valeur\n1;2\n");
    await app.close();
  });
});
