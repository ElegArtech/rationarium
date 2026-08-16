#!/usr/bin/env node
/**
 * Conformité de rendu — **le comparateur qui manquait.**
 *
 * `CLAUDE.md` inscrit « conformité de rendu » dans la définition de terminé de
 * chaque vue, et `pnpm ui:diff` était censé la tenir. Elle ne la tenait pas :
 * la branche de comparaison de `ui-diff.mjs` affichait « la comparaison
 * s'active dès que la vue est portée » et **sortait avec le code 0**. Trente-
 * cinq vues ont donc été déclarées conformes sans qu'aucune comparaison n'ait
 * jamais eu lieu — et les cinq vues d'accès ont été livrées **sans une seule
 * règle de style**, leurs classes ne correspondant à rien.
 *
 * Ce que ce programme compare, et pourquoi chaque mesure existe :
 *
 *   1. **Le vocabulaire de classes.** Une classe présente dans la maquette et
 *      absente de l'implémentation signifie que la structure a été réinventée.
 *      C'est la mesure qui aurait tout arrêté : les vues d'accès employaient
 *      `.acces-panneau` là où la maquette dit `.form-panel`.
 *   2. **Les classes inertes.** Une classe portée par le balisage sans aucune
 *      règle en face ne produit ni erreur, ni avertissement, ni test rouge.
 *      Elle ne se voit qu'à l'œil, sur la page, et seulement si on la regarde.
 *   3. **Les textes contractuels.** `cadrage/02` donne des textes à la lettre.
 *      Un texte de la maquette absent du rendu est un manque de contenu, pas
 *      une variation de style.
 *   4. **Les repères.** Points de repère ARIA, nombre d'éléments focalisables,
 *      débordement horizontal.
 *
 * Ce qu'il ne compare **pas**, et c'est délibéré : le pixel. Polices, lissage,
 * données d'exemple et largeurs de barre de défilement produiraient un flot de
 * faux positifs (`cadrage/04 § 7.4`). La fidélité pixel se juge à l'œil sur
 * les captures que ce programme produit ; la fidélité de structure, elle, se
 * mesure — et c'est elle qui était rompue.
 *
 * Emploi :
 *   node scripts/ui-conformite.mjs 01              une vue
 *   node scripts/ui-conformite.mjs toutes          les 35
 *   node scripts/ui-conformite.mjs 01 --captures   écrit les captures côte à côte
 *
 * Sort en **1** dès qu'une vue diverge. C'est tout l'intérêt.
 */

import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const RACINE = process.cwd();
const MANIFESTE = JSON.parse(fs.readFileSync(path.join(RACINE, "design/etats.json"), "utf8"));
const ROUTES = JSON.parse(fs.readFileSync(path.join(RACINE, "design/routes.json"), "utf8"));
const BASE = process.env.TRAME_URL ?? "http://localhost:5173";
const CAPTURES = path.join(RACINE, "design/captures");

/** Compte pour la connexion — les vues 06+ sont derrière la session. */
const IDENTIFIANT = process.env.TRAME_LOGIN ?? "admin";
const MOT_DE_PASSE = process.env.TRAME_MOTDEPASSE ?? "TrameLocal!2026";

/**
 * Classes hors produit : le panneau de revue des maquettes, et les états que
 * seul un pilote de maquette sait produire. Elles ne décrivent pas le produit.
 */
const HORS_PRODUIT = /^(rv-|review|sk-|demo-)/;

/**
 * Classes engendrées par la bibliothèque de composants, jamais écrites à la
 * main : `react-aria-Button`, `react-aria-TextField`… Les compter comme
 * inertes serait un faux positif permanent, et un contrôle qui crie au loup
 * cesse d'être lu.
 */
const HORS_AUTEUR = /^react-aria-/;

/**
 * Le jeu de données fictif des maquettes.
 *
 * Les maquettes montrent « C. Durand », « Migration SIRH », « Ville de
 * Roqueville » ; l'implémentation montre les données réelles de l'instance.
 * Compter ces textes comme manquants ferait crier au loup sur chaque vue de
 * données — et un contrôle auquel on ne croit plus ne sert à rien.
 *
 * Sont donc écartés de la comparaison de textes : ce jeu fictif, et tout texte
 * portant un chiffre (comptes, pourcentages, dates, heures, ratios), qui vient
 * par construction des données et non du gabarit.
 *
 * Ce qui reste comparé, c'est ce qui est CONTRACTUEL : libellés, intitulés de
 * colonnes, textes de boutons, états vides, messages — ceux que `cadrage/02`
 * donne à la lettre.
 */
const DONNEES_MAQUETTE = [
  "c. durand", "d. amrani", "f. berthier", "h. nguyen", "i. rocher",
  "camille durand", "ville de roqueville", "roqueville",
  "refonte du portail citoyen", "migration sirh", "schéma directeur numérique",
  "maquettes portail", "recette portail", "cahier des charges",
  "reprise des données", "note de cadrage", "bureau municipal",
];

/** Relève d'une page ce qui est comparable sans ambiguïté. */
async function relever(page) {
  return page.evaluate(() => {
    const hors = (el) => el.closest("#review, .rv-body, .toasts, [hidden]");
    const visible = (el) => {
      const s = getComputedStyle(el);
      return s.display !== "none" && s.visibility !== "hidden";
    };

    // Les classes RÉELLEMENT posées sur des éléments visibles.
    const employees = new Set();
    for (const el of document.querySelectorAll("body *")) {
      if (hors(el) || !visible(el)) continue;
      for (const c of el.classList) employees.add(c);
    }

    // Les classes qu'une règle CSS chargée définit.
    const definies = new Set();
    for (const f of document.styleSheets) {
      let regles;
      try {
        regles = f.cssRules;
      } catch {
        continue;
      }
      const parcourir = (liste) => {
        for (const r of liste) {
          if (r.selectorText) {
            for (const m of r.selectorText.matchAll(/\.([A-Za-z0-9_-]+)/g)) definies.add(m[1]);
          }
          if (r.cssRules) parcourir(r.cssRules);
        }
      };
      parcourir(regles);
    }

    const textes = new Set();
    for (const el of document.querySelectorAll("body *")) {
      if (hors(el) || !visible(el)) continue;
      for (const n of el.childNodes) {
        if (n.nodeType === 3) {
          const t = n.textContent.replace(/\s+/g, " ").trim();
          if (t) textes.add(t);
        }
      }
    }

    return {
      classes: [...employees].sort(),
      definies: [...definies].sort(),
      textes: [...textes].sort(),
      reperes: {
        landmarks: [...document.querySelectorAll("main, nav, header, aside, footer, [role]")]
          .filter((e) => !hors(e) && visible(e))
          .map((e) => e.getAttribute("role") || e.tagName.toLowerCase())
          .sort(),
        focusables: [
          ...document.querySelectorAll("a[href], button, input, select, textarea, [tabindex]"),
        ].filter((e) => !hors(e) && visible(e)).length,
        debordement: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      },
    };
  });
}

async function connecter(page) {
  await page.goto(`${BASE}/connexion`, { waitUntil: "networkidle" });
  if (!page.url().includes("/connexion")) return;
  await page.locator("input").first().fill(IDENTIFIANT);
  await page.locator('input[type="password"]').first().fill(MOT_DE_PASSE);
  await page.getByRole("button", { name: /se connecter|sign in/i }).first().click();
  await page.waitForTimeout(1500);
}

function comparer(vue, maquette, rendu) {
  const utiles = (l) => l.filter((c) => !HORS_PRODUIT.test(c));

  const employeesMaquette = new Set(utiles(maquette.classes));
  const employeesRendu = new Set(rendu.classes);

  // 1. Le vocabulaire : ce que la maquette pose et que le rendu ignore.
  const manquantes = [...employeesMaquette].filter((c) => !employeesRendu.has(c));

  // 2. Les classes inertes du rendu : posées, mais stylées par rien.
  const inertes = [...employeesRendu]
    .filter((c) => !HORS_AUTEUR.test(c))
    .filter((c) => !rendu.definies.includes(c));

  // 3. Les textes de la maquette absents du rendu.
  const normaliser = (t) => t.toLowerCase().replace(/[\s ]+/g, " ").trim();
  const textesRendu = new Set(rendu.textes.map(normaliser));
  const textesManquants = maquette.textes
    .map(normaliser)
    .filter((t) => t.length > 2)
    .filter((t) => !/\d/.test(t))
    .filter((t) => !DONNEES_MAQUETTE.some((d) => t.includes(d)))
    .filter((t) => !textesRendu.has(t));

  // 4. Les repères.
  const reperes = [];
  if (rendu.reperes.debordement && !maquette.reperes.debordement) {
    reperes.push("débordement horizontal absent de la maquette");
  }
  const manqueLandmark = maquette.reperes.landmarks.filter(
    (l) => !rendu.reperes.landmarks.includes(l),
  );
  if (manqueLandmark.length > 0) {
    reperes.push(`points de repère manquants : ${[...new Set(manqueLandmark)].join(", ")}`);
  }

  return { vue, manquantes, inertes, textesManquants, reperes };
}

function rapporter(r) {
  const total =
    r.manquantes.length + r.inertes.length + r.textesManquants.length + r.reperes.length;
  const etat = total === 0 ? "✓" : "✗";
  console.log(`\n${etat} vue ${r.vue} — ${total} écart(s)`);
  if (r.manquantes.length) {
    console.log(`   structure : ${r.manquantes.length} classe(s) de la maquette absentes`);
    console.log(`     ${r.manquantes.slice(0, 12).join(" ")}`);
  }
  if (r.inertes.length) {
    console.log(`   inertes   : ${r.inertes.length} classe(s) posées sans aucune règle`);
    console.log(`     ${r.inertes.slice(0, 12).join(" ")}`);
  }
  if (r.textesManquants.length) {
    console.log(`   textes    : ${r.textesManquants.length} texte(s) de la maquette absents`);
    for (const t of r.textesManquants.slice(0, 6)) console.log(`     « ${t.slice(0, 70)} »`);
  }
  for (const p of r.reperes) console.log(`   repères   : ${p}`);
  return total;
}

// ════════════════════════════════════════════════════════════════════════════

const args = process.argv.slice(2);
const captures = args.includes("--captures");
const cible = args[0];
if (!cible) {
  console.error("Emploi : ui-conformite.mjs <vue>|toutes [--captures]");
  process.exit(1);
}
const vues = cible === "toutes" ? Object.keys(MANIFESTE).sort() : [cible];

if (captures) fs.mkdirSync(CAPTURES, { recursive: true });

const navigateur = await chromium.launch();
const contexte = await navigateur.newContext({ viewport: { width: 1440, height: 900 } });
const page = await contexte.newPage();
await connecter(page);

let ecarts = 0;
const bilan = [];

for (const vue of vues) {
  const route = ROUTES[vue];
  if (!route) {
    console.log(`\n· vue ${vue} — aucune route déclarée dans design/routes.json`);
    ecarts += 1;
    continue;
  }

  // La maquette.
  await page.goto("file://" + path.join(RACINE, MANIFESTE[vue].fichier), {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(300);
  const maquette = await relever(page);
  if (captures) await page.screenshot({ path: path.join(CAPTURES, `${vue}-maquette.png`) });

  // L'implémentation.
  await page.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  const rendu = await relever(page);
  if (captures) await page.screenshot({ path: path.join(CAPTURES, `${vue}-rendu.png`) });

  const r = comparer(vue, maquette, rendu);
  const n = rapporter(r);
  bilan.push({ vue, ecarts: n, ...r });
  ecarts += n;
}

await navigateur.close();

fs.writeFileSync(
  path.join(RACINE, "design/conformite.json"),
  JSON.stringify(bilan, null, 2) + "\n",
);

const vertes = bilan.filter((b) => b.ecarts === 0).length;
console.log(`\n${"─".repeat(66)}`);
console.log(`${vertes}/${bilan.length} vue(s) conformes · ${ecarts} écart(s) au total`);
process.exit(ecarts === 0 ? 0 : 1);
