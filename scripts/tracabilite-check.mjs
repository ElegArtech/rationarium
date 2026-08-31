#!/usr/bin/env node
/**
 * Contrôle de traçabilité — « une EX-…/RG-… = un test nommé qui la cite ».
 *
 * CLAUDE.md pose cette règle depuis l'origine ; rien ne la tenait. Ce contrôle
 * la tient dans les deux sens :
 *
 *   1. Toute exigence ou règle DÉCLARÉE au cadrage est citée par un test,
 *      ou inscrite dans design/tracabilite.json — en dette (`aTester`) ou
 *      en impossibilité motivée (`nonTestable`).
 *   2. Toute citation trouvée dans un test correspond à un identifiant qui
 *      EXISTE au cadrage. Le versant symétrique : un test qui cite
 *      « RG-ADM-09 » quand le cadrage dit « EX-ADM-09 » ne prouve rien et
 *      fait croire qu'il prouve quelque chose.
 *
 * CE QUI COMPTE COMME CITATION
 * ----------------------------
 * Le titre d'un `it(`, d'un `test(` ou d'un `describe(`. Un `describe` qui
 * nomme précisément une règle est bien « un test nommé qui la cite » : c'est
 * une suite dédiée à cette règle, et 106 identifiants du dépôt ne sont
 * couverts que sous cette forme.
 *
 * EN REVANCHE, UNE PLAGE NE CITE RIEN. `describe("RG-CNG-01 à 07")` ne cite
 * aucun des sept : il en nomme deux bornes et élide le reste. Sans cette
 * exclusion, RG-CNG-01, RG-CNG-25 et RG-CNG-29 passeraient pour couverts
 * alors qu'aucun `it` ne les exerce — la plage se contentait de les survoler.
 * Une ÉNUMÉRATION, elle, compte : `describe("RG-CNG-13, RG-CNG-14")` écrit
 * les deux identifiants en toutes lettres, donc les cite tous les deux.
 *
 * LE PIÈGE QUE CE CONTRÔLE DOIT S'INTERDIRE
 * -----------------------------------------
 * Le dépôt a payé QUATRE fois un contrôle qui passait au vert en ne mesurant
 * rien : la suite de performance sur un projet Playwright vide, `ui:diff` qui
 * sortait en 0 sans comparer, la suite d'accessibilité avant qu'elle
 * n'affirme couvrir les 35 vues. Ce contrôle-ci affirme donc son inventaire
 * AVANT de conclure : si l'extraction rend moins que ses seuils plancher,
 * il échoue en disant que son extraction est cassée — il ne conclut jamais
 * « tout va bien » sur un corpus vide.
 */

import fs from "node:fs";
import path from "node:path";
import { readdirSync } from "node:fs";

const RACINE = path.resolve(import.meta.dirname, "..");
const CADRAGE = path.join(RACINE, "cadrage/01-cahier-des-charges-fonctionnel.md");
const DECLARATION = path.join(RACINE, "design/tracabilite.json");

/** Plancher d'inventaire : en dessous, l'extraction est cassée, pas le dépôt. */
const PLANCHER_DECLARES = 300;
const PLANCHER_FICHIERS = 50;
const PLANCHER_CITES = 200;

const ID = /\b(?:EX|RG)-[A-Z]+-\d+\b/g;

/* ------------------------------------------------------------------ *
 * 1. Les identifiants DÉCLARÉS au cadrage                            *
 * ------------------------------------------------------------------ */

/**
 * Une déclaration ouvre sa ligne : cellule de tableau (`| EX-AUTH-01 | …`),
 * puce (`- **RG-AUTH-01** — …`) ou puce citée (`> **RG-DROITS-01.** …`).
 * Une mention en milieu de paragraphe est une référence croisée : elle
 * renvoie à une règle déclarée ailleurs, elle n'en déclare aucune.
 */
function identifiantsDeclares() {
  if (!fs.existsSync(CADRAGE)) {
    echouer([`cadrage introuvable : ${path.relative(RACINE, CADRAGE)}`]);
  }
  const declares = new Map(); // id -> numéro de ligne
  const lignes = fs.readFileSync(CADRAGE, "utf8").split("\n");
  lignes.forEach((ligne, i) => {
    // Au plus 6 caractères non alphabétiques avant l'identifiant : « | »,
    // « - ** », « > ** ». Au-delà, on n'est plus en tête de ligne.
    const tete = /^[^A-Za-z]{0,6}(?<id>(?:EX|RG)-[A-Z]+-\d+)\b/.exec(ligne);
    if (tete && !declares.has(tete.groups.id)) declares.set(tete.groups.id, i + 1);
  });
  return declares;
}

/* ------------------------------------------------------------------ *
 * 2. Les identifiants CITÉS par un test                              *
 * ------------------------------------------------------------------ */

/**
 * Le SYSTÈME DE FICHIERS, pas `git ls-files`.
 *
 * La première version lisait l'index git : **un fichier de test neuf y est
 * invisible tant qu'il n'a pas été indexé**. Le contrôle répondait alors « aucun
 * test ne cite cette règle » à quelqu'un qui venait précisément de l'écrire —
 * et l'invitait à inscrire en dette une règle déjà couverte. Un contrôle qui
 * ment sur le travail qu'on vient de faire cesse d'être lu.
 *
 * Le balayage saute les dossiers qui ne portent jamais de source du dépôt.
 */
const IGNORES = new Set(["node_modules", ".git", "dist", ".turbo", "test-results", ".claude"]);

function fichiersDeTest(dossier = RACINE, trouves = []) {
  for (const entree of readdirSync(dossier, { withFileTypes: true })) {
    if (IGNORES.has(entree.name)) continue;
    const chemin = path.join(dossier, entree.name);
    if (entree.isDirectory()) fichiersDeTest(chemin, trouves);
    else if (/\.(test|spec)\.ts$/.test(entree.name)) trouves.push(path.relative(RACINE, chemin));
  }
  return trouves;
}

/**
 * Ouverture d'un `describe` / `it` / `test`, avec ses modificateurs
 * (`.skip`, `.only`, `.each(…)`, `test.describe.serial`…), suivie de son
 * titre littéral. Le titre peut tenir sur la ligne suivante.
 */
const APPEL =
  /\b(?<appel>describe|it|test)(?<mods>(?:\.[A-Za-z]+(?:\([^()]*\))?)*)\s*\(\s*(?<quote>["'`])(?<titre>(?:\\.|(?!\k<quote>)[\s\S])*?)\k<quote>/g;

/**
 * Un connecteur de plage : « .. », « … », « → », « à », « to ».
 * Le tiret cadratin « — » en est EXCLU : c'est le séparateur de titre du
 * dépôt (« RG-CNG-20 — le solde compte les ENGAGÉS »), pas une plage.
 *
 * Les connecteurs-mots sont bornés par des espaces, PAS par `\b` : hors mode
 * unicode, `à` n'est pas un caractère de mot, donc `\bà\b` ne correspond
 * jamais — et « RG-CNG-01 à 07 » repassait pour une citation de RG-CNG-01.
 *
 * La borne d'arrivée est un identifiant complet (« EX-NTF-01 à EX-NTF-03 »)
 * ou un simple numéro (« RG-CNG-01 à 07 ») : les deux écritures existent.
 */
const PLAGE =
  /\b(?:EX|RG)-[A-Z]+-\d+(?:\s*(?:\.{2,}|…|→|->)\s*|\s+(?:à|to)\s+)(?:(?:EX|RG)-[A-Z]+-)?\d+/g;

/**
 * Les identifiants qu'un titre cite réellement : ceux écrits en toutes
 * lettres, moins ceux qui ne figurent que comme borne d'une plage.
 */
function citationsDuTitre(titre) {
  const bornes = new Set();
  for (const plage of titre.match(PLAGE) ?? []) {
    for (const id of plage.match(ID) ?? []) bornes.add(id);
  }
  return (titre.match(ID) ?? []).filter((id) => !bornes.has(id));
}

function citations(fichiers) {
  const cites = new Map(); // id -> [{ fichier, titre }]
  const plagesIgnorees = [];
  for (const fichier of fichiers) {
    const source = fs.readFileSync(path.join(RACINE, fichier), "utf8");
    for (const m of source.matchAll(APPEL)) {
      const titre = m.groups.titre;
      if (!ID.test(titre)) {
        ID.lastIndex = 0;
        continue;
      }
      ID.lastIndex = 0;
      for (const plage of titre.match(PLAGE) ?? []) {
        plagesIgnorees.push({ fichier, plage, titre });
      }
      for (const id of citationsDuTitre(titre)) {
        if (!cites.has(id)) cites.set(id, []);
        cites.get(id).push({ fichier, titre });
      }
    }
  }
  return { cites, plagesIgnorees };
}

/* ------------------------------------------------------------------ *
 * 3. Le fichier de déclaration                                       *
 * ------------------------------------------------------------------ */

function declaration() {
  if (!fs.existsSync(DECLARATION)) {
    echouer([
      `déclaration introuvable : ${path.relative(RACINE, DECLARATION)}`,
      "C'est ce fichier qui porte la dette (`aTester`) et les impossibilités motivées (`nonTestable`).",
    ]);
  }
  let brut;
  try {
    brut = JSON.parse(fs.readFileSync(DECLARATION, "utf8"));
  } catch (e) {
    echouer([`déclaration illisible (${path.relative(RACINE, DECLARATION)}) : ${e.message}`]);
  }
  const listes = ["aTester", "nonTestable", "citationsOrphelines"];
  for (const nom of listes) {
    if (!Array.isArray(brut[nom])) {
      echouer([`déclaration : la liste « ${nom} » est absente ou n'est pas un tableau.`]);
    }
  }
  return brut;
}

/* ------------------------------------------------------------------ *
 * 4. Verdict                                                          *
 * ------------------------------------------------------------------ */

function echouer(lignes) {
  console.error("\ntraçabilité : ÉCHEC\n");
  for (const l of lignes) console.error("  " + l);
  console.error("");
  process.exit(1);
}

const declares = identifiantsDeclares();
const fichiers = fichiersDeTest();
const { cites, plagesIgnorees } = citations(fichiers);

// --- Assertions d'inventaire : un contrôle qui ne mesure rien doit ÉCHOUER.
const inventaire = [];
if (declares.size < PLANCHER_DECLARES) {
  inventaire.push(
    `${declares.size} identifiant(s) déclaré(s) au cadrage, plancher ${PLANCHER_DECLARES}.`,
  );
}
if (fichiers.length < PLANCHER_FICHIERS) {
  inventaire.push(`${fichiers.length} fichier(s) de test lu(s), plancher ${PLANCHER_FICHIERS}.`);
}
const citesConnus = [...cites.keys()].filter((id) => declares.has(id));
if (citesConnus.length < PLANCHER_CITES) {
  inventaire.push(`${citesConnus.length} identifiant(s) cité(s), plancher ${PLANCHER_CITES}.`);
}
if (inventaire.length > 0) {
  echouer([
    "L'EXTRACTION EST CASSÉE — le contrôle refuse de conclure sur un corpus vide.",
    "",
    ...inventaire,
    "",
    "Ce contrôle ne passe jamais au vert faute d'avoir trouvé quelque chose à mesurer :",
    "c'est le piège que le dépôt a déjà payé quatre fois. Réparer l'extraction, pas le seuil.",
  ]);
}

const decl = declaration();
const enDette = new Map(decl.aTester.map((e) => [e.id, e]));
const nonTestable = new Map(decl.nonTestable.map((e) => [e.id, e]));
const orphelinsDeclares = new Map(decl.citationsOrphelines.map((e) => [e.id, e]));

const ecarts = [];

// (a) Déclaré au cadrage, ni cité ni inscrit.
const nonCouverts = [...declares.keys()].filter(
  (id) => !cites.has(id) && !enDette.has(id) && !nonTestable.has(id),
);
for (const id of nonCouverts) {
  ecarts.push(
    `${id} — déclaré au cadrage (ligne ${declares.get(id)}), aucun test ne le cite, ` +
      "et il n'est inscrit ni en dette (`aTester`) ni en impossibilité (`nonTestable`).",
  );
}

// (b) Cité par un test, inconnu du cadrage. Le versant symétrique.
const orphelins = [...cites.keys()].filter((id) => !declares.has(id));
for (const id of orphelins) {
  if (orphelinsDeclares.has(id)) continue;
  const ou = cites.get(id).map((c) => c.fichier);
  ecarts.push(
    `${id} — CITÉ PAR UN TEST MAIS INCONNU DU CADRAGE (${[...new Set(ou)].join(", ")}). ` +
      "Une citation fausse fait croire à une couverture qui n'existe pas : corriger le titre, " +
      "ou inscrire l'écart dans `citationsOrphelines` avec l'identifiant à lire.",
  );
}

// (c) Hygiène : la dette doit RÉTRÉCIR, donc une entrée devenue vraie s'en retire.
for (const [id, entree] of enDette) {
  if (!declares.has(id)) {
    ecarts.push(`${id} — inscrit en dette (\`aTester\`) mais inconnu du cadrage.`);
  } else if (cites.has(id)) {
    ecarts.push(
      `${id} — inscrit en dette (\`aTester\`, lot ${entree.lot ?? "?"}) alors qu'un test le cite ` +
        `désormais (${cites.get(id)[0].fichier}). Le retirer de la liste : elle doit rétrécir.`,
    );
  }
}
for (const [id, entree] of nonTestable) {
  if (!declares.has(id)) {
    ecarts.push(`${id} — inscrit en \`nonTestable\` mais inconnu du cadrage.`);
  }
  if (!entree.raison) {
    ecarts.push(`${id} — inscrit en \`nonTestable\` sans raison. Chaque impossibilité se motive.`);
  }
}
for (const [id] of orphelinsDeclares) {
  if (!cites.has(id)) {
    ecarts.push(
      `${id} — inscrit en \`citationsOrphelines\` alors qu'aucun test ne le cite plus. ` +
        "Le retirer de la liste.",
    );
  }
}

/* ------------------------------------------------------------------ *
 * 5. Compte rendu                                                     *
 * ------------------------------------------------------------------ */

const couvertsParTest = citesConnus.length;
const dettesRestantes = [...enDette.keys()].filter((id) => !cites.has(id)).length;

console.log("traçabilité — « une EX-…/RG-… = un test nommé qui la cite »\n");
console.log(`  identifiants déclarés au cadrage   : ${declares.size}`);
console.log(`  fichiers de test lus               : ${fichiers.length}`);
console.log(`  cités par un test nommé            : ${couvertsParTest}`);
console.log(`  en dette (aTester)                 : ${dettesRestantes}`);
console.log(`  non testables (motivés)            : ${nonTestable.size}`);
console.log(`  citations orphelines déclarées     : ${orphelinsDeclares.size}`);
if (plagesIgnorees.length > 0) {
  console.log(
    `  plages ignorées (ne citent rien)   : ${plagesIgnorees.length}` +
      ` — ${plagesIgnorees.map((p) => p.plage).join(", ")}`,
  );
}

if (ecarts.length === 0) {
  const pourcent = Math.round((couvertsParTest / declares.size) * 100);
  console.log(
    `\ntraçabilité : ${couvertsParTest}/${declares.size} (${pourcent} %) couverts par un test nommé,` +
      ` le reste est inscrit et motivé.`,
  );
  process.exit(0);
}

echouer([
  `${ecarts.length} écart(s) de traçabilité.`,
  "",
  ...ecarts.map((e) => "· " + e),
  "",
  "Écrire le test, ou inscrire l'identifiant dans design/tracabilite.json avec le lot qui s'en charge.",
]);
