/**
 * Le contrôle de couverture des parcours — § 2 de l'étape de recette.
 *
 * Quatre règles, vérifiées **avant toute exécution**. Il ne juge pas la
 * qualité d'un parcours ; il constate ce que le fichier ne couvre pas, et il
 * le nomme.
 *
 *     node recette/harnais/couverture.mjs
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { RACINE } from "./pile.mjs";

const parcours = JSON.parse(readFileSync(resolve(RACINE, "recette/09-parcours.json"), "utf8"));
const cahier = readFileSync(resolve(RACINE, "cadrage/01-cahier-des-charges-fonctionnel.md"), "utf8");
const carte = readFileSync(resolve(RACINE, "design/carte-de-navigation.md"), "utf8");

const entrees = Object.entries(parcours).filter(([k]) => k !== "_meta");
const meta = parcours._meta ?? {};

// ── Règle 1 — chaque persona a au moins un parcours ─────────────────────────
const PERSONAS = ["Camille", "Driss", "Fatou", "Hugo", "Inès", "Karim"];
const parPersona = new Map(PERSONAS.map((p) => [p, []]));
for (const [id, p] of entrees) {
  if (!parPersona.has(p.persona)) parPersona.set(p.persona, []);
  parPersona.get(p.persona).push(id);
}
const personasSansParcours = PERSONAS.filter((p) => (parPersona.get(p) ?? []).length === 0);

// ── Règle 2 — chaque persona a au moins un parcours négatif ─────────────────
const negatifs = new Map(PERSONAS.map((p) => [p, []]));
for (const [id, p] of entrees) {
  if (p.type === "negatif" && negatifs.has(p.persona)) negatifs.get(p.persona).push(id);
}
const personasSansNegatif = PERSONAS.filter((p) => (negatifs.get(p) ?? []).length === 0);

// ── Règle 3 — les EX-… du cahier ────────────────────────────────────────────
const exCahier = [...new Set(cahier.match(/EX-[A-Z]+-\d+/g) ?? [])].sort();
const rgCahier = [...new Set(cahier.match(/RG-[A-Z]+-\d+/g) ?? [])].sort();
const citees = new Set();
for (const [, p] of entrees) for (const e of p.exigences ?? []) citees.add(e);
const exNonCouvertes = exCahier.filter((e) => !citees.has(e));
const rgNonCouvertes = rgCahier.filter((r) => !citees.has(r));
const citationsOrphelines = [...citees].filter(
  (e) => !exCahier.includes(e) && !rgCahier.includes(e),
);

// ── Règle 4 — chaque arête de la carte est empruntée ────────────────────────
const aretesCarte = [...new Set(carte.match(/^\| (A-\d+)/gm)?.map((l) => l.slice(2)) ?? [])];
const empruntees = new Set();
for (const [, p] of entrees) for (const a of p.aretes ?? []) empruntees.add(a);
const aretesNonEmpruntees = aretesCarte.filter((a) => !empruntees.has(a));
const aretesInconnues = [...empruntees].filter((a) => !aretesCarte.includes(a));

// ── Contrôle de forme — l'objectif est un état final, pas une suite de clics ─
const VERBES_DE_CLIC = /\b(clique|cliquer|clic |appuie|saisit puis|puis clique|ouvre le menu|sélectionne puis)\b/i;
const objectifsProceduraux = entrees
  .filter(([, p]) => VERBES_DE_CLIC.test(p.objectif ?? ""))
  .map(([id]) => id);

const vuesCarte = new Set(
  [...carte.matchAll(/^\| (\d{2}) \| /gm)].map((m) => m[1]),
);
const vuesInconnues = new Set();
for (const [, p] of entrees) for (const v of p.vues ?? []) if (!vuesCarte.has(v)) vuesInconnues.add(v);

const rapport = {
  decompte: entrees.length,
  meta,
  regle1_personas_sans_parcours: personasSansParcours,
  regle2_personas_sans_negatif: personasSansNegatif,
  regle3_ex_du_cahier: exCahier.length,
  regle3_ex_couvertes: exCahier.length - exNonCouvertes.length,
  regle3_ex_non_couvertes: exNonCouvertes,
  regle3_rg_du_cahier: rgCahier.length,
  regle3_rg_couvertes: rgCahier.length - rgNonCouvertes.length,
  regle3_citations_orphelines: citationsOrphelines,
  regle4_aretes_de_la_carte: aretesCarte.length,
  regle4_aretes_empruntees: aretesCarte.length - aretesNonEmpruntees.length,
  regle4_aretes_non_empruntees: aretesNonEmpruntees,
  regle4_aretes_inconnues: aretesInconnues,
  forme_objectifs_procéduraux: objectifsProceduraux,
  forme_vues_hors_carte: [...vuesInconnues],
  repartition: Object.fromEntries(
    [...parPersona].map(([p, l]) => [
      p,
      { total: l.length, negatifs: (negatifs.get(p) ?? []).length },
    ]),
  ),
  types: entrees.reduce((acc, [, p]) => ({ ...acc, [p.type]: (acc[p.type] ?? 0) + 1 }), {}),
};

console.log(JSON.stringify(rapport, null, 2));

const manques =
  personasSansParcours.length +
  personasSansNegatif.length +
  aretesInconnues.length +
  citationsOrphelines.length +
  objectifsProceduraux.length +
  vuesInconnues.size;
process.exit(manques === 0 ? 0 : 1);
