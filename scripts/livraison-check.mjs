import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const MANIFESTES = ['package.json', 'apps/api/package.json', 'apps/web/package.json', 'packages/contracts/package.json', 'packages/db/package.json'];
export const DISTRIBUTION = ['deploiement/compose.yaml', 'deploiement/.env.example', 'deploiement/installer.sh', 'README.md', 'docs/installation.md', 'docs/hors-ligne.md'];
export function verifierLivraison(lire, { tag, stable = false } = {}) {
  const version = JSON.parse(lire(MANIFESTES[0])).version;
  const semver = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
  if (!semver.test(version) || (stable && version.includes('-'))) throw new Error('Version de livraison invalide.');
  if (tag !== undefined && tag !== `v${version}`) throw new Error(`Le tag ${tag} ne correspond pas à v${version}.`);
  for (const p of MANIFESTES) if (JSON.parse(lire(p)).version !== version) throw new Error(`Version divergente : ${p}`);
  for (const p of DISTRIBUTION) {
    const texte = lire(p);
    const versions = [...texte.matchAll(/(?:VERSION_RATIONARIUM(?::-|=)|^VERSION=|releases\/(?:download|tag)\/v|rationarium-)(\d+\.\d+\.\d+(?:-(?:rc|alpha|beta)\.\d+)?)/gm)].map((x) => x[1]);
    if (!versions.length) throw new Error(`Aucune référence de version mesurée : ${p}`);
    if (versions.some((v) => v !== version)) throw new Error(`Référence de livraison divergente : ${p}`);
  }
  const compose = lire('deploiement/compose.yaml');
  const base = compose.split('\n  base:\n')[1]?.split('\n  migrations:')[0];
  if (!base || /^\s+ports:/m.test(base) || /privileged:\s*true|SYS_ADMIN/.test(compose)) throw new Error('Le confinement de la base ne respecte plus la qualification de sécurité.');
  if (!base.includes('/rationarium-base:')) throw new Error('La base livrée doit utiliser son image examinée.');
  return version;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = process.argv.slice(2);
    const index = args.indexOf('--tag');
    if (index >= 0 && !args[index + 1]) throw new Error('Tag manquant.');
    const root = resolve(import.meta.dirname, '..');
    const version = verifierLivraison((p) => readFileSync(resolve(root, p), 'utf8'), { stable: args.includes('--stable'), ...(index >= 0 ? { tag: args[index + 1] } : {}) });
    console.log(`Livraison ${version} : manifestes, kit, documentation et confinement cohérents.`);
  } catch (e) { console.error(e.message); process.exitCode = 1; }
}
