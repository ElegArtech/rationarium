import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

// Le nom Compose effectif inclut -p ; NOM_PROJET seul ne suffit pas.
const env = { ...process.env, POSTGRES_MOTDEPASSE: 'verification-sans-donnees', COOKIE_SECRET: 'verification-sans-donnees' };
for (const key of ['COMPOSE_PROJECT_NAME', 'COMPOSE_FILE', 'COMPOSE_ENV_FILES', 'VOLUME_POSTGRES']) delete env[key];
for (const cas of [
  { nom: 'verification-nom', cli: [], volume: '', attendu: 'verification-nom_donnees' },
  { nom: 'verification-nom', cli: ['-p', 'verification-cli'], volume: '', attendu: 'verification-cli_donnees' },
  { nom: 'verification-nom', cli: ['-p', 'verification-cli'], volume: 'verification-migre', attendu: 'verification-migre' },
]) {
  const config = JSON.parse(execFileSync('docker', ['compose', '--env-file', 'deploiement/.env.example', '-f', 'deploiement/compose.yaml', ...cas.cli, 'config', '--format', 'json'], {
    cwd: new URL('..', import.meta.url), env: { ...env, NOM_PROJET: cas.nom, VOLUME_POSTGRES: cas.volume }, encoding: 'utf8',
  }));
  assert.equal(config.volumes.donnees.name, cas.attendu);
  assert.ok(config.services.base.volumes.some((v) => v.source === 'donnees' && v.target === '/var/lib/postgresql'));
}
console.log('Volumes : projet configuré, option -p et volume migré restent isolés.');
