import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifierNpm, verifierImage } from './securite-check.mjs';

const maintenant = new Date('2026-10-03T12:00:00Z');
const npm = { advisories: {}, metadata: { totalDependencies: 100, vulnerabilities: { high: 0 } } };
const image = { CreatedAt: maintenant.toISOString(), Metadata: { OS: { Family: 'alpine' } }, Results: [{ Class: 'os-pkgs', Target: 'test', Vulnerabilities: [] }] };
test('un audit indisponible, vide ou incohérent ne passe pas', () => {
  for (const r of [{}, { error: 'registry unavailable' }, { ...npm, metadata: { totalDependencies: 0 } }, { ...npm, metadata: { totalDependencies: 10, vulnerabilities: { high: 1 } } }]) assert.throws(() => verifierNpm(r));
});
test('une alerte npm ne peut être ignorée en production ou après expiration', () => {
  const r = structuredClone(npm);
  r.advisories.x = { github_advisory_id: 'GHSA-test', module_name: 'test', findings: [{ version: '1', paths: ['.>outil>test'] }] };
  const e = { avis: 'GHSA-test', paquet: 'test', version: '1', chemin: '.>outil>test', raison: 'Entrée contrôlée par le dépôt, jamais exposée au serveur livré.', source: 'https://example.org/advisory', expiration: '2026-11-03' };
  assert.throws(() => verifierNpm(r));
  assert.equal(verifierNpm(r, [e], { maintenant }).cheminsQualifies, 1);
  assert.throws(() => verifierNpm(r, [e], { maintenant, production: true }));
  assert.throws(() => verifierNpm(r, [{ ...e, expiration: '2026-10-02' }], { maintenant }));
  assert.throws(() => verifierNpm(r, [{ ...e, chemin: '.>serveur>test' }], { maintenant }));
});
test('un scan système doit mesurer une image et être récent', () => {
  assert.equal(verifierImage(image, 'api', [], maintenant).alertes, 0);
  assert.throws(() => verifierImage({}, 'api', [], maintenant));
  assert.throws(() => verifierImage({ ...image, Results: [] }, 'api', [], maintenant));
  assert.throws(() => verifierImage(image, 'autre', [], maintenant));
  assert.throws(() => verifierImage(image, 'api', [], new Date('2026-10-05')));
});
test('une CVE élevée inconnue, une autre version ou une autre image est refusée', () => {
  const r = structuredClone(image);
  r.Results[0].Vulnerabilities.push({ Severity: 'CRITICAL', VulnerabilityID: 'CVE-test', PkgName: 'lib', InstalledVersion: '1' });
  const e = { image: 'api', avis: 'CVE-test', paquet: 'lib', version: '1', cible: 'test', raison: 'Fonction vulnérable non compilée dans le composant effectivement livré.', source: 'https://example.org/advisory', expiration: '2026-11-03' };
  assert.throws(() => verifierImage(r, 'api', [], maintenant));
  assert.equal(verifierImage(r, 'api', [e], maintenant).alertesEleveesQualifiees, 1);
  for (const modif of [{ version: '2' }, { image: 'base' }, { expiration: '2026-10-01' }]) assert.throws(() => verifierImage(r, 'api', [{ ...e, ...modif }], maintenant));
});
