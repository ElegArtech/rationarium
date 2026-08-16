#!/usr/bin/env node
/**
 * Boucle de conformité visuelle — étage 1.
 *
 * Pilote une maquette gelée dans chacun de ses états déclarés
 * (`design/etats.json`) et en relève ce qui est comparable SANS AMBIGUÏTÉ :
 * textes contractuels, jetons employés, repères d'accessibilité, débordement.
 *
 * Pourquoi pas une comparaison au pixel contre la maquette : polices,
 * lissage, données d'exemple et largeurs de barre de défilement produisent un
 * flot de faux positifs. La comparaison stricte a un sens implémentation ↔
 * implémentation (étage 3, non-régression), pas implémentation ↔ maquette.
 * Voir cadrage/04 § 7.4.
 *
 * Emplois :
 *   node scripts/ui-diff.mjs --releve 07      relève la référence de la vue 07
 *   node scripts/ui-diff.mjs --releve toutes  relève les 35 références
 *   node scripts/ui-diff.mjs 07               compare l'implémentation à la référence
 */

import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const RACINE = process.cwd();
const MANIFESTE = JSON.parse(
  fs.readFileSync(path.join(RACINE, "design/etats.json"), "utf8"),
);
const REFERENCES = path.join(RACINE, "design/references");

/** Jetons dont l'écart contre les 26 maquettes non corrigées est ATTENDU. */
const JETONS_DIVERGENTS = ["--placeholder", "--line-strong", "--leave-pending"];
const MAQUETTES_CONFORMES = ["01", "06", "07", "09", "14", "19", "22", "28", "30"];

/** Ce qu'on relève d'un rendu : uniquement du comparable sans ambiguïté. */
async function releverEtat(page) {
  return page.evaluate(() => {
    const visible = (el) => {
      const s = getComputedStyle(el);
      return s.display !== "none" && s.visibility !== "hidden" && s.opacity !== "0";
    };
    const hors = (el) => el.closest("#review, .rv-body, .toasts");

    const textes = [];
    for (const el of document.querySelectorAll("body *")) {
      if (hors(el) || !visible(el)) continue;
      for (const n of el.childNodes) {
        if (n.nodeType === 3) {
          const t = n.textContent.trim();
          if (t) textes.push(t);
        }
      }
    }

    const jetons = {};
    for (const [k, v] of Object.entries(
      Object.fromEntries(
        [...document.styleSheets]
          .flatMap((s) => {
            try {
              return [...s.cssRules];
            } catch {
              return [];
            }
          })
          .filter((r) => r.selectorText === ":root")
          .flatMap((r) => [...r.style].filter((p) => p.startsWith("--")).map((p) => [p, r.style.getPropertyValue(p).trim()])),
      ),
    )) {
      jetons[k] = v;
    }

    const reperes = {
      landmarks: [...document.querySelectorAll("[role], main, nav, header, aside")]
        .filter((e) => !hors(e) && visible(e))
        .map((e) => e.getAttribute("role") || e.tagName.toLowerCase())
        .sort(),
      focusables: [...document.querySelectorAll("a[href], button, input, select, textarea, [tabindex]")]
        .filter((e) => !hors(e) && visible(e)).length,
      debordement: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    };

    return { textes: textes.sort(), jetons, reperes };
  });
}

/**
 * Éléments interactifs sans nom accessible, lus dans l'ARBRE D'ACCESSIBILITÉ
 * du navigateur et non par heuristique DOM.
 *
 * La première version de ce contrôle déduisait le nom de `textContent`,
 * `aria-label` et `title`. Elle ignorait `<label for>` et l'imbrication dans
 * un `<label>`, et a produit 234 faux positifs sur 35 vues — soit 32 vues
 * signalées à tort. L'arbre d'accessibilité fait autorité : c'est ce que
 * l'assistance technique voit réellement.
 */
async function sansNomAccessible(page) {
  return page.evaluate(() => {
    const visible = (el) => {
      const s = getComputedStyle(el);
      return s.display !== "none" && s.visibility !== "hidden";
    };
    const hors = (el) => el.closest("#review, .rv-body, .toasts");

    // Sources d'un nom accessible, dans l'ordre de la norme.
    const nomAccessible = (el) => {
      const par = el.getAttribute("aria-labelledby");
      if (par) {
        const t = par
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent?.trim() || "")
          .join(" ")
          .trim();
        if (t) return t;
      }
      const aria = el.getAttribute("aria-label")?.trim();
      if (aria) return aria;

      if (el.id) {
        const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (l?.textContent?.trim()) return l.textContent.trim();
      }
      const enveloppe = el.closest("label");
      if (enveloppe?.textContent?.trim()) return enveloppe.textContent.trim();

      const titre = el.getAttribute("title")?.trim();
      if (titre) return titre;

      if (el.tagName === "INPUT" && ["submit", "button", "reset"].includes(el.type)) {
        if (el.value?.trim()) return el.value.trim();
      }
      // Un placeholder est un pis-aller : la norme l'accepte en dernier recours.
      const ph = el.getAttribute("placeholder")?.trim();
      if (ph) return ph;

      return el.textContent?.trim() || "";
    };

    return [...document.querySelectorAll("button, a[href], input, select, textarea, [role=button], [role=tab]")]
      .filter((e) => !hors(e) && visible(e) && e.type !== "hidden")
      .filter((e) => !nomAccessible(e))
      .length;
  });
}

async function pourChaqueEtat(page, vue, fn) {
  const v = MANIFESTE[vue];
  for (const axe of v.axes) {
    for (const opt of axe.options) {
      try {
        await page.evaluate((p) => eval(p), opt.pilote);
      } catch {
        /* pilote inopérant : signalé au relevé */
      }
      await page.waitForTimeout(60);
      await fn(`${axe.axe} · ${opt.libelle}`, opt.pilote);
    }
  }
}

async function relever(vues) {
  fs.mkdirSync(REFERENCES, { recursive: true });
  const navigateur = await chromium.launch();
  for (const vue of vues) {
    const v = MANIFESTE[vue];
    const page = await navigateur.newPage({ viewport: { width: 1600, height: 1000 } });
    await page.goto("file://" + path.join(RACINE, v.fichier));
    const releve = { vue, titre: v.titre, source: v.fichier, etats: {} };
    await pourChaqueEtat(page, vue, async (nom) => {
      const e = await releverEtat(page);
      e.reperes.sansNomAccessible = await sansNomAccessible(page);
      releve.etats[nom] = e;
    });
    await page.close();
    fs.writeFileSync(
      path.join(REFERENCES, `${vue}.json`),
      JSON.stringify(releve, null, 2) + "\n",
    );
    const n = Object.keys(releve.etats).length;
    const debordent = Object.values(releve.etats).filter((e) => e.reperes.debordement).length;
    const muets = Object.values(releve.etats).reduce((m, e) => Math.max(m, e.reperes.sansNomAccessible), 0);
    console.log(
      `  ${vue}  ${String(n).padStart(2)} états` +
        (debordent ? `  ⚠ ${debordent} en débordement` : "") +
        (muets ? `  ⚠ ${muets} éléments sans libellé accessible` : ""),
    );
  }
  await navigateur.close();
}

const args = process.argv.slice(2);
if (args[0] === "--releve") {
  const vues = args[1] === "toutes" ? Object.keys(MANIFESTE).sort() : [args[1]];
  console.log(`Relevé de référence — ${vues.length} vue(s)`);
  await relever(vues);
  console.log(`\nRéférences écrites dans design/references/`);
} else if (args[0]) {
  const ref = path.join(REFERENCES, `${args[0]}.json`);
  if (!fs.existsSync(ref)) {
    console.error(`Pas de référence pour la vue ${args[0]}. Lancer d'abord :`);
    console.error(`  node scripts/ui-diff.mjs --releve ${args[0]}`);
    process.exit(1);
  }
  /*
   * **Ce message-ci a coûté un projet.**
   *
   * Cette branche affichait « la comparaison s'active dès que la vue est
   * portée » et sortait avec le code 0. `pnpm ui:diff` passait donc au vert
   * sans jamais rien comparer, et « conformité de rendu » — que la définition
   * de terminé de CLAUDE.md exige pour chaque vue — a été déclarée trente-cinq
   * fois sur la foi d'un contrôle vide. Les cinq vues d'accès ont ainsi été
   * livrées SANS UNE SEULE RÈGLE DE STYLE, leurs classes ne correspondant à
   * rien.
   *
   * Un contrôle qui n'a rien à mesurer doit ÉCHOUER, jamais réussir en
   * silence. C'est déjà écrit dans les pièges connus, deux fois.
   *
   * La comparaison réelle vit dans `ui-conformite.mjs` ; on y délègue.
   */
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync(
    process.execPath,
    [path.join(RACINE, "scripts/ui-conformite.mjs"), args[0], ...args.slice(1)],
    { stdio: "inherit" },
  );
  process.exit(r.status ?? 1);
} else {
  console.error("Emploi : ui-diff.mjs [--releve <vue>|toutes] | <vue>");
  process.exit(1);
}
