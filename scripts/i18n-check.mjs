#!/usr/bin/env node
/**
 * Contrôle d'internationalisation — RG-GEN-08.
 *
 * Trois contrôles, tous bloquants :
 *   1. Aucune clé manquante — toute clé française a son pendant anglais.
 *   2. Aucune clé orpheline — toute clé déclarée est employée dans le code.
 *   3. Aucune clé employée mais non déclarée.
 *
 * Sur le dépôt encore vide (vague 0), le contrôle passe : il n'y a rien à
 * contredire. Il mordra dès la première vue portée.
 */

import fs from "node:fs";
import path from "node:path";

const RACINE = process.cwd();
const CATALOGUES = path.join(RACINE, "apps/web/src/locales");
const SOURCES = path.join(RACINE, "apps/web/src");
const LANGUES = ["fr", "en"];

const ecarts = [];

function fichiersRecursifs(dir, filtre) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return fichiersRecursifs(p, filtre);
    return filtre(p) ? [p] : [];
  });
}

function aplatir(objet, prefixe = "") {
  return Object.entries(objet).flatMap(([k, v]) => {
    const cle = prefixe ? `${prefixe}.${k}` : k;
    return v && typeof v === "object" && !Array.isArray(v)
      ? aplatir(v, cle)
      : [cle];
  });
}

function clesDeclarees(langue) {
  const dir = path.join(CATALOGUES, langue);
  const cles = new Set();
  for (const f of fichiersRecursifs(dir, (p) => p.endsWith(".json"))) {
    const espace = path.basename(f, ".json");
    let contenu;
    try {
      contenu = JSON.parse(fs.readFileSync(f, "utf8"));
    } catch (e) {
      ecarts.push(`catalogue illisible : ${path.relative(RACINE, f)} — ${e.message}`);
      continue;
    }
    for (const cle of aplatir(contenu)) cles.add(`${espace}:${cle}`);
  }
  return cles;
}

function clesEmployees() {
  const cles = new Set();
  const motif = /\bt\(\s*["'`]([^"'`]+)["'`]/g;
  for (const f of fichiersRecursifs(
    SOURCES,
    (p) => /\.tsx?$/.test(p) && !p.includes("/locales/"),
  )) {
    const src = fs.readFileSync(f, "utf8");
    for (const m of src.matchAll(motif)) {
      cles.add(m[1].includes(":") ? m[1] : `commun:${m[1]}`);
    }
  }
  return cles;
}

const parLangue = Object.fromEntries(LANGUES.map((l) => [l, clesDeclarees(l)]));
const employees = clesEmployees();

// 1. Parité entre catalogues
for (const langue of LANGUES) {
  for (const autre of LANGUES.filter((l) => l !== langue)) {
    for (const cle of parLangue[langue]) {
      if (!parLangue[autre].has(cle)) {
        ecarts.push(`clé manquante en « ${autre} » : ${cle}`);
      }
    }
  }
}

// 2. Clés déclarées jamais employées
const declarees = parLangue.fr;
if (employees.size > 0) {
  for (const cle of declarees) {
    if (!employees.has(cle)) ecarts.push(`clé orpheline (déclarée, non employée) : ${cle}`);
  }
}

// 3. Clés employées jamais déclarées
if (declarees.size > 0) {
  for (const cle of employees) {
    if (!declarees.has(cle)) ecarts.push(`clé employée mais non déclarée : ${cle}`);
  }
}

const total = declarees.size;
if (ecarts.length === 0) {
  console.log(
    total === 0
      ? "i18n : aucun catalogue pour l'instant — contrôle sans objet."
      : `i18n : ${total} clés, parité FR/EN tenue, aucune orpheline.`,
  );
  process.exit(0);
}

console.error(`i18n : ${ecarts.length} écart(s) — RG-GEN-08\n`);
for (const e of ecarts.slice(0, 40)) console.error("  · " + e);
if (ecarts.length > 40) console.error(`  … et ${ecarts.length - 40} autres`);
process.exit(1);
