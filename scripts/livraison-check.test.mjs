import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MANIFESTES, DISTRIBUTION, verifierLivraison } from './livraison-check.mjs';
function fichiers(version = '1.0.0') {
  return Object.fromEntries([
    ...MANIFESTES.map((p) => [p, JSON.stringify({ version })]),
    ...DISTRIBUTION.map((p) => [p, `VERSION_RATIONARIUM=${version}`]),
    ['deploiement/compose.yaml', `services:\n  base:\n    image: registre/rationarium-base:\u0024{VERSION_RATIONARIUM:-${version}}\n  migrations:\n`],
  ]);
}
test('un tag cohérent valide la version stable', () => {
  const f = fichiers();
  f['README.md'] = 'https://github.com/x/y/releases/download/v1.0.0/rationarium-1.0.0-compose.tar.gz';
  assert.equal(verifierLivraison((p) => f[p], { tag: 'v1.0.0', stable: true }), '1.0.0');
});
test('un tag, un manifeste ou un guide périmé interdit la livraison', () => {
  assert.throws(() => verifierLivraison((p) => fichiers()[p], { tag: 'v2.0.0' }));
  for (const p of [...MANIFESTES.slice(1), ...DISTRIBUTION]) {
    const f = fichiers(); f[p] = f[p].replaceAll('1.0.0', '0.9.0');
    assert.throws(() => verifierLivraison((p) => f[p]));
  }
});
test('une préversion ne satisfait pas une demande de stable', () => {
  const f = fichiers('1.0.0-rc.1'); assert.throws(() => verifierLivraison((p) => f[p], { stable: true }));
});
test('une référence absente ne passe pas par vacuité', () => {
  const f = fichiers(); f['README.md'] = 'sans version'; assert.throws(() => verifierLivraison((p) => f[p]));
});
test('exposer la base ou ajouter SYS_ADMIN invalide sa qualification', () => {
  for (const ajout of ['    ports: ["5432:5432"]\n', '    privileged: true\n', '    cap_add: [SYS_ADMIN]\n']) {
    const f = fichiers(); f['deploiement/compose.yaml'] = f['deploiement/compose.yaml'].replace('  base:\n', `  base:\n${ajout}`);
    assert.throws(() => verifierLivraison((p) => f[p]));
  }
});
