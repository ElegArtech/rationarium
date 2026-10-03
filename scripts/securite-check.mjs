import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const charger = (p) => JSON.parse(readFileSync(p, 'utf8'));

/** Une exception vise une version, un avis et son contexte exact. */
function justifiee(exceptions, attendu, maintenant) {
  return exceptions.some((e) => Object.entries(attendu).every(([k, v]) => e[k] === v)
    && typeof e.raison === 'string' && e.raison.length >= 40
    && typeof e.source === 'string' && e.source.startsWith('https://')
    && /^\d{4}-\d{2}-\d{2}$/.test(e.expiration ?? '')
    && new Date(`${e.expiration}T23:59:59Z`) >= maintenant);
}

export function verifierNpm(rapport, exceptions = [], { production = false, maintenant = new Date() } = {}) {
  if (rapport.error || !rapport.advisories || !rapport.metadata?.vulnerabilities
    || !(rapport.metadata.totalDependencies > 0)) throw new Error('Audit npm absent, vide ou invalide.');
  const refus = [];
  let qualifies = 0;
  for (const a of Object.values(rapport.advisories)) {
    if (!a.findings?.length) throw new Error(`Avis sans chemins : ${a.github_advisory_id}`);
    for (const f of a.findings) {
      if (!f.paths?.length) throw new Error('Chemins npm absents.');
      for (const chemin of f.paths) {
        const admis = !production && justifiee(exceptions, {
          avis: a.github_advisory_id, paquet: a.module_name, version: f.version, chemin,
        }, maintenant);
        if (admis) qualifies++; else refus.push(`${a.github_advisory_id} ${a.module_name}@${f.version} (${chemin})`);
      }
    }
  }
  const annonces = Object.values(rapport.metadata.vulnerabilities).reduce((a, b) => a + b, 0);
  if (annonces > 0 && Object.keys(rapport.advisories).length === 0) throw new Error('Audit npm incohérent.');
  if (refus.length) throw new Error(`Alertes npm non qualifiées :\n${refus.join('\n')}`);
  return { dependances: rapport.metadata.totalDependencies, avis: Object.keys(rapport.advisories).length, cheminsQualifies: qualifies };
}

export function verifierImage(rapport, image, exceptions = [], maintenant = new Date()) {
  if (!['api', 'web', 'base'].includes(image)) throw new Error('Image inconnue.');
  if (!rapport.Metadata?.OS?.Family || !rapport.Results?.length
    || !rapport.Results.some((r) => r.Class === 'os-pkgs')) throw new Error('Scan système absent ou vide.');
  const date = new Date(rapport.CreatedAt);
  if (!Number.isFinite(+date) || Math.abs(maintenant - date) > 86_400_000) throw new Error('Scan absent ou âgé de plus de 24 heures.');
  const refus = [];
  let total = 0, qualifies = 0;
  for (const r of rapport.Results) {
    for (const v of r.Vulnerabilities ?? []) {
      total++;
      if (!['HIGH', 'CRITICAL'].includes(v.Severity)) continue;
      if (justifiee(exceptions, {
        image, avis: v.VulnerabilityID, paquet: v.PkgName, version: v.InstalledVersion, cible: r.Class === 'os-pkgs' ? (r.Type ?? r.Target) : r.Target,
      }, maintenant)) qualifies++;
      else refus.push(`${v.VulnerabilityID} ${v.PkgName}@${v.InstalledVersion} (${r.Target})`);
    }
  }
  if (refus.length) throw new Error(`Alertes image non qualifiées :\n${refus.join('\n')}`);
  return { image, alertes: total, alertesEleveesQualifiees: qualifies };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [type, chemin, option] = process.argv.slice(2);
    const politique = charger(new URL('../deploiement/securite-exceptions.json', import.meta.url));
    const r = charger(chemin);
    if (type === 'npm') console.log(verifierNpm(r, politique.npm, { production: option === '--production' }));
    else if (type === 'image') console.log(verifierImage(r, option, politique.images));
    else throw new Error('Usage : securite-check.mjs npm <rapport> [--production] | image <rapport> <api|web|base>');
  } catch (e) { console.error(e.message); process.exitCode = 1; }
}
