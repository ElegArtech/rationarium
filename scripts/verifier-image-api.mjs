// Exécuté DANS l'image, sans réseau, par le contrôle de livraison.
import { existsSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const racine = '/rationarium';
const attendus = [
  'apps/api/dist/main.js', 'apps/api/dist/exploitation/amorcage.js',
  'packages/db/dist/reversibilite-cli.js', 'packages/db/prisma/schema.prisma',
  'packages/db/prisma.config.ts', 'packages/db/node_modules/.bin/prisma',
  'deploiement/lancer.mjs', 'deploiement/roles-restauration.mjs',
];
for (const p of attendus) if (!existsSync(`${racine}/${p}`)) throw new Error(`Fichier d'exploitation absent : ${p}`);
if (!existsSync(process.env.PRISMA_SCHEMA_ENGINE_BINARY ?? '')) throw new Error('Moteur Prisma absent.');
const packages = readdirSync(`${racine}/node_modules/.pnpm`);
if (packages.length < 20) throw new Error('Graphe de dépendances incomplet.');
const interdits = packages.filter((p) => /^(?:@vitest\+|@playwright\+|vitest@|playwright(?:-core)?@|vite@|eslint@|stylelint@|braces@|turbo@)/.test(p));
if (interdits.length) throw new Error(`Outillage de développement embarqué : ${interdits.join(', ')}`);
if (process.getuid() === 0) throw new Error('Le serveur ne doit pas démarrer sous root.');
const require = createRequire(`${racine}/apps/api/package.json`);
for (const p of ['@rationarium/db', '@rationarium/contracts', 'fastify', 'nodemailer', '@node-rs/argon2']) require.resolve(p);
await require('@node-rs/argon2').hash('controle-module-natif');
execFileSync(process.env.PRISMA_SCHEMA_ENGINE_BINARY, ['--version'], { stdio: 'pipe' });
console.log(`Image API complète, moteur et module natif opérationnels ; ${packages.length} entrées de dépendances, aucun outil interdit.`);
