/**
 * Le bilan des verdicts — lecture du dossier de preuves.
 *
 * Il ne juge rien : il compte ce que les exécutants ont consigné, et il dit ce
 * qui manque. Un parcours sans trace n'est pas un vert.
 *
 *     node recette/harnais/bilan.mjs [--json]
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { RACINE } from "./pile.mjs";

const PREUVES = resolve(RACINE, "recette/preuves");
const parcours = JSON.parse(readFileSync(resolve(RACINE, "recette/09-parcours.json"), "utf8"));
const ids = Object.keys(parcours).filter((k) => k !== "_meta").sort(
  (a, b) => Number(a.slice(2)) - Number(b.slice(2)),
);

const lignes = [];
for (const id of ids) {
  const p = parcours[id];
  for (const langue of ["fr", "en"]) {
    const dossier = join(PREUVES, id, p.persona, langue);
    const fichier = join(dossier, "verdict.json");
    if (!existsSync(fichier)) {
      lignes.push({ id, persona: p.persona, type: p.type, langue, verdict: "ABSENT", preuves: 0 });
      continue;
    }
    const v = JSON.parse(readFileSync(fichier, "utf8"));
    const fichiers = existsSync(dossier)
      ? readdirSync(dossier).filter((f) => statSync(join(dossier, f)).isFile() || f === "video")
      : [];
    lignes.push({
      id,
      persona: p.persona,
      type: p.type,
      langue,
      verdict: String(v.verdict ?? "?").toLowerCase(),
      cause: v.constate ?? v.cause ?? "",
      exigences: p.exigences ?? [],
      trace: existsSync(join(dossier, "trace.zip")),
      captures: fichiers.filter((f) => f.endsWith(".png")).length,
      dossier: dossier.replace(RACINE + "/", ""),
    });
  }
}

const compte = (f) => lignes.filter(f).length;
const rouges = lignes.filter((l) => l.verdict === "rouge");
const verts = lignes.filter((l) => l.verdict === "vert");
const absents = lignes.filter((l) => l.verdict === "ABSENT");
const vertsSansTrace = verts.filter((l) => !l.trace);

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ lignes }, null, 1));
} else {
  console.log(`exécutions attendues : ${ids.length * 2}   consignées : ${lignes.length - absents.length}`);
  console.log(`verts : ${verts.length}   rouges : ${rouges.length}   absents : ${absents.length}`);
  console.log(`verts sans trace : ${vertsSansTrace.length}`);
  console.log(`autres verdicts : ${compte((l) => !["vert", "rouge", "ABSENT"].includes(l.verdict))}`);
  const parcoursRouges = [...new Set(rouges.map((l) => l.id))].sort(
    (a, b) => Number(a.slice(2)) - Number(b.slice(2)),
  );
  console.log(`\nparcours rouges (${parcoursRouges.length} / ${ids.length}) :`);
  console.log(parcoursRouges.join(" "));
  if (absents.length) {
    console.log(`\nabsents : ${[...new Set(absents.map((l) => `${l.id}/${l.langue}`))].join(" ")}`);
  }
  const exigencesRouges = new Set();
  for (const r of rouges) for (const e of r.exigences) exigencesRouges.add(e);
  console.log(`\nexigences et règles mises en défaut : ${exigencesRouges.size}`);
  console.log([...exigencesRouges].sort().join(" "));
}
