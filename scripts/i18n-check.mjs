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

/**
 * Clés employées dans le code.
 *
 * **L'espace de noms n'est pas toujours dans la clé.** `useTranslation("auth")`
 * le fixe pour tout le fichier, et `t("connexion.titre")` s'y rapporte. Une
 * première version de ce contrôle l'ignorait et préfixait tout par `commun:` :
 * elle déclarait orphelines 122 clés parfaitement employées.
 *
 * L'enseignement est le même que pour le contrôle d'accessibilité : un
 * contrôle mal spécifié ne produit pas du bruit neutre, il produit de la
 * fausse confiance dans les deux sens.
 */
function clesEmployees() {
  const cles = new Set();
  /** Familles employées dynamiquement : `t(`groupes.${x}`)` → `groupes.` */
  const familles = new Set();

  /*
   * Toutes les chaînes littérales d'un appel `t(...)`, y compris derrière un
   * ternaire : `t(sombre ? "entete.themeSombre" : "entete.themeClair")`.
   *
   * Le nom de la fonction est CAPTURÉ : un fichier peut lier plusieurs espaces
   * de noms — `const { t } = useTranslation("taches")` et
   * `const { t: tImports } = useTranslation("imports")` —, et attribuer les
   * deux au premier `useTranslation` rencontré rendait le verdict dépendant de
   * l'ORDRE DES DÉCLARATIONS. Un contrôle qui change d'avis quand on déplace
   * une fonction ne contrôle rien.
   */
  const motifAppel = /\b(t[A-Za-z0-9_]*)\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g;
  const motifChaine = /["']([A-Za-z0-9_]+(?:[.:][A-Za-z0-9_]+)+)["']/g;
  /**
   * Les clés **plates** — `t("annuler")` — sont invisibles au motif ci-dessus,
   * qui exige un point ou un deux-points. Une première version du contrôle les
   * déclarait donc orphelines alors qu'elles étaient employées partout.
   *
   * Elles ne sont cherchées que dans le **premier argument** de l'appel : une
   * chaîne quelconque plus loin — `t("x", { defaut: "annuler" })` — n'est pas
   * une clé, et l'accepter rendrait le contrôle plus large que juste.
   */
  const motifPremierArgument = /^\s*["']([A-Za-z0-9_]+)["']\s*(?:,|$)/;
  /** `const { t } = useTranslation("ns")` ou `const { t: tX } = useTranslation("ns")`. */
  const motifNs =
    /const\s*\{\s*t(?:\s*:\s*([A-Za-z0-9_]+))?[^}]*\}\s*=\s*useTranslation\(\s*["'`]([^"'`]+)["'`]/g;
  // Gabarit dont le préfixe est littéral et la fin interpolée.
  const motifGabarit = /\b(t[A-Za-z0-9_]*)\(\s*`([^`$]*)\$\{/g;
  // Déclaration explicite, pour les clés résolues à l'exécution — `t(e.cle)`.
  // Ce que l'analyse statique ne peut pas voir, on le lui DIT, plutôt que
  // d'affaiblir le contrôle jusqu'à ce qu'il ne voie plus rien.
  const motifDeclaration = /i18n-familles:\s*([^\n*]+)/g;

  for (const f of fichiersRecursifs(
    SOURCES,
    (p) => /\.tsx?$/.test(p) && !p.includes("/locales/"),
  )) {
    const src = fs.readFileSync(f, "utf8");

    /** Chaque nom de fonction de traduction, avec son espace de noms. */
    const parNom = new Map();
    for (const m of src.matchAll(motifNs)) parNom.set(m[1] ?? "t", m[2]);
    const parDefaut = parNom.get("t") ?? [...parNom.values()][0] ?? "commun";
    const espaceDe = (nom) => parNom.get(nom) ?? parDefaut;

    for (const appel of src.matchAll(motifAppel)) {
      // Seules les fonctions RÉELLEMENT liées à un espace de noms comptent :
      // sans ce filtre, `trim(`, `test(` ou n'importe quelle fonction dont le
      // nom commence par « t » passerait pour un appel de traduction.
      if (!parNom.has(appel[1])) continue;
      const espace = espaceDe(appel[1]);
      for (const c of appel[2].matchAll(motifChaine)) {
        cles.add(c[1].includes(":") ? c[1] : `${espace}:${c[1]}`);
      }
      const plate = motifPremierArgument.exec(appel[2]);
      if (plate) cles.add(`${espace}:${plate[1]}`);
    }
    for (const m of src.matchAll(motifGabarit)) {
      if (!parNom.has(m[1])) continue;
      const espace = espaceDe(m[1]);
      const prefixe = m[2];
      familles.add(prefixe.includes(":") ? prefixe : `${espace}:${prefixe}`);
    }
    for (const m of src.matchAll(motifDeclaration)) {
      for (const f of m[1].split(",").map((x) => x.trim()).filter(Boolean)) familles.add(f);
    }
  }
  return { cles, familles };
}

const parLangue = Object.fromEntries(LANGUES.map((l) => [l, clesDeclarees(l)]));
const { cles: employees, familles } = clesEmployees();

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

// 2. Clés déclarées jamais employées.
//
// Une clé composée dynamiquement — `t(`groupes.${cle}`)` — n'est pas
// détectable par analyse statique. On en relève le PRÉFIXE littéral et on
// considère la famille entière comme employée. C'est volontairement
// permissif : le contraire produirait des orphelines fausses, et une alerte
// fausse finit par ne plus être lue.
const declarees = parLangue.fr;
const employeeParFamille = (cle) => [...familles].some((f) => cle.startsWith(f));
if (employees.size > 0) {
  for (const cle of declarees) {
    if (!employees.has(cle) && !employeeParFamille(cle)) {
      ecarts.push(`clé orpheline (déclarée, non employée) : ${cle}`);
    }
  }
}

// 3. Clés employées jamais déclarées
if (declarees.size > 0) {
  for (const cle of employees) {
    if (!declarees.has(cle)) ecarts.push(`clé employée mais non déclarée : ${cle}`);
  }
}

// 4. Famille employée dynamiquement mais vide : le gabarit ne trouvera rien.
for (const f of familles) {
  if (![...declarees].some((c) => c.startsWith(f))) {
    ecarts.push(`famille employée dynamiquement mais sans aucune clé : ${f}*`);
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
