import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { MESSAGES_METIER } from "./messages-metier.js";
import { MESSAGES as MESSAGES_AUTH } from "../auth/messages.js";

/**
 * La table des messages doit rester **exhaustive**.
 *
 * Un code d'échec absent de la table tombe en 500 générique : le serveur
 * saurait exactement quoi dire, et dirait « erreur inattendue ». Le défaut est
 * silencieux — il n'apparaît qu'au moment où la règle se déclenche, en
 * production. Ce test le rend bruyant à la compilation du lot.
 *
 * Il lit les sources plutôt que les types, parce que les types sont effacés à
 * l'exécution : c'est le seul moyen de vérifier la couverture réellement.
 */

const RACINE = path.resolve(import.meta.dirname, "..");

function fichiersService(dossier: string): string[] {
  return readdirSync(dossier).flatMap((entree) => {
    const chemin = path.join(dossier, entree);
    if (statSync(chemin).isDirectory()) return fichiersService(chemin);
    return entree.endsWith(".service.ts") ? [chemin] : [];
  });
}

/** Les unions `export type Echec… = "a" | "b"` déclarées par les services. */
function codesDeclares(): { fichier: string; code: string }[] {
  const trouves: { fichier: string; code: string }[] = [];
  for (const fichier of fichiersService(RACINE)) {
    const source = readFileSync(fichier, "utf8");
    const union = /export type Echec\w+\s*=\s*((?:\s*\|?\s*"[^"]+")+)\s*;/g;
    for (const bloc of source.matchAll(union)) {
      for (const code of bloc[1]!.matchAll(/"([^"]+)"/g)) {
        trouves.push({ fichier: path.relative(RACINE, fichier), code: code[1]! });
      }
    }
  }
  return trouves;
}

describe("RG-GEN-03 — tout échec métier a un message rédigé", () => {
  const declares = codesDeclares();
  const connus = new Set([...Object.keys(MESSAGES_METIER), ...Object.keys(MESSAGES_AUTH)]);

  it("la lecture des sources trouve bien des codes — sinon le test ne teste rien", () => {
    // Sans cette garde, une regex cassée ferait passer le test à vide.
    expect(declares.length).toBeGreaterThan(60);
    expect(new Set(declares.map((d) => d.fichier)).size).toBeGreaterThan(12);
  });

  it("aucun code d'échec n'est dépourvu de message", () => {
    const orphelins = declares.filter((d) => !connus.has(d.code));
    expect(orphelins).toEqual([]);
  });

  it("aucun message n'est orphelin — la table ne conserve pas de code mort", () => {
    const utilises = new Set(declares.map((d) => d.code));
    const morts = Object.keys(MESSAGES_METIER).filter((c) => !utilises.has(c));
    expect(morts).toEqual([]);
  });
});

describe("RG-GEN-03 — la forme des messages", () => {
  const entrees = Object.entries(MESSAGES_METIER);

  it("le statut est un refus, jamais un succès ni un 500", () => {
    for (const [code, m] of entrees) {
      expect(m.statut, code).toBeGreaterThanOrEqual(400);
      expect(m.statut, code).toBeLessThan(500);
    }
  });

  it("la clé porte le préfixe de son catalogue", () => {
    for (const [code, m] of entrees) expect(m.cle, code).toMatch(/^erreurs:[a-zA-Z]+$/);
  });

  it("le message est en langue naturelle, pas un code technique", () => {
    for (const [code, m] of entrees) {
      // Une phrase, pas un identifiant : majuscule initiale, ponctuation
      // finale, et jamais le code lui-même recopié.
      expect(m.message, code).toMatch(/^[A-ZÀÉÈÊÎÔÛÇ].*[.!?]$/u);
      expect(m.message, code).not.toContain("_");
      expect(m.message.length, code).toBeGreaterThan(15);
    }
  });

  it("les clés sont distinctes deux à deux", () => {
    const cles = entrees.map(([, m]) => m.cle);
    expect(new Set(cles).size).toBe(cles.length);
  });
});
