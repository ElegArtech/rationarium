import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const racine = resolve(import.meta.dirname, '..');
const version = JSON.parse(readFileSync(join(racine, 'package.json'), 'utf8')).version;
const empreinte = (c) => c.repeat(64);
const refs = {
  base: `ghcr.io/elegartech/rationarium-base@sha256:${empreinte('a')}`,
  api: `ghcr.io/elegartech/rationarium-api@sha256:${empreinte('b')}`,
  web: `ghcr.io/elegartech/rationarium-web@sha256:${empreinte('c')}`,
};

/** Une livraison minimale : le vrai kit Compose, une archive voisine et l'installateur. */
function livraison() {
  const dossier = mkdtempSync(join(tmpdir(), 'livraison-'));
  const nom = `rationarium-${version}-compose`;
  execFileSync('bash', [join(racine, 'deploiement/preparer-compose.sh'), join(dossier, nom)], { stdio: 'pipe' });
  execFileSync('tar', ['-C', dossier, '-czf', join(dossier, `${nom}.tar.gz`), nom]);
  mkdirSync(join(dossier, 'voisin'));
  writeFileSync(join(dossier, 'voisin/a.txt'), 'hors ligne');
  execFileSync('tar', ['-C', dossier, '-czf', join(dossier, `rationarium-${version}-linux-amd64.tar.gz`), 'voisin']);
  writeFileSync(join(dossier, 'installer-rationarium.sh'), '#!/usr/bin/env bash\n');
  return { dossier, nom };
}
const epingler = (dossier, ...args) => spawnSync('bash', [join(racine, 'deploiement/epingler-kit.sh'), dossier, version, ...args], { encoding: 'utf8' });

test('le kit publié désigne chaque image par son empreinte, et ses sommes sont recalculées', () => {
  const { dossier, nom } = livraison();
  const r = epingler(dossier, refs.base, refs.api, refs.web);
  assert.equal(r.status, 0, r.stderr);
  const sortie = mkdtempSync(join(tmpdir(), 'kit-'));
  execFileSync('tar', ['-xzf', join(dossier, `${nom}.tar.gz`), '-C', sortie]);
  const compose = readFileSync(join(sortie, nom, 'compose.yaml'), 'utf8');
  const images = [...compose.matchAll(/^\s*image:\s*(\S+)/gm)].map((m) => m[1]);
  assert.deepEqual(images, [refs.base, refs.api, refs.api, refs.api, refs.web]);
  assert.doesNotMatch(compose, /image:.*VERSION_RATIONARIUM/);
  execFileSync('sha256sum', ['-c', `${nom}.tar.gz.sha256`], { cwd: dossier, stdio: 'pipe' });
  execFileSync('sha256sum', ['-c', 'SHA256SUMS'], { cwd: dossier, stdio: 'pipe' });
  assert.match(readFileSync(join(dossier, 'SHA256SUMS'), 'utf8'), /linux-amd64\.tar\.gz/);
});

test('une référence par tag, incomplète ou en double est refusée sans toucher au kit', () => {
  const { dossier, nom } = livraison();
  const avant = readFileSync(join(dossier, `${nom}.tar.gz`));
  for (const args of [
    [refs.base, refs.api],
    [refs.base, refs.api, 'ghcr.io/elegartech/rationarium-web:1.0.0'],
    [refs.base, refs.api, `ghcr.io/elegartech/rationarium-web@sha256:${'0'.repeat(63)}`],
    [refs.base, refs.api, refs.api],
  ]) {
    assert.notEqual(epingler(dossier, ...args).status, 0, args.join(' '));
  }
  assert.deepEqual(readFileSync(join(dossier, `${nom}.tar.gz`)), avant);
});
