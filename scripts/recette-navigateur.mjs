import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const requireWeb = createRequire(new URL('../apps/web/package.json', import.meta.url));
const { chromium, expect } = requireWeb('@playwright/test');
const [dossier, phase = 'initiale'] = process.argv.slice(2);
const env = Object.fromEntries(readFileSync(`${dossier}/kit/.env`, 'utf8').split('\n').filter(l => l && !l.startsWith('#')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ locale: 'fr-FR', ignoreHTTPSErrors: phase === 'https', viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();
  const erreurs = [];
  page.on('pageerror', e => erreurs.push(e.message));
  await page.goto(env.RATIONARIUM_URL_PUBLIQUE);
  await page.locator('input[autocomplete="username"]').fill('admin');
  await page.locator('input[autocomplete="current-password"]').fill(env.RATIONARIUM_ADMIN_MOTDEPASSE + (phase === 'initiale' ? '' : '2'));
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  if (phase === 'initiale') {
    await expect(page.getByRole('heading', { name: 'Changez votre mot de passe', exact: true })).toBeVisible();
    await page.locator('input[autocomplete="current-password"]').fill(env.RATIONARIUM_ADMIN_MOTDEPASSE);
    const champs = page.locator('input[autocomplete="new-password"]');
    await champs.nth(0).fill(env.RATIONARIUM_ADMIN_MOTDEPASSE + '2');
    await champs.nth(1).fill(env.RATIONARIUM_ADMIN_MOTDEPASSE + '2');
    await page.getByRole('button', { name: 'Changer le mot de passe', exact: true }).click();
  }
  await expect(page.getByRole('heading', { name: 'Bonjour Administration', exact: true })).toBeVisible({ timeout: 20000 });
  if (phase === 'initiale') {
    await page.getByRole('textbox', { name: 'Nouvelle to-do', exact: true }).fill('Témoin installation');
    const [creation] = await Promise.all([
      page.waitForResponse(r => r.url().endsWith('/api/tableau-de-bord/todos') && r.request().method() === 'POST'),
      page.getByRole('button', { name: 'Ajouter la to-do', exact: true }).click(),
    ]);
    assert.equal(creation.status(), 201);
    await page.reload();
  }
  await expect(page.getByText('Témoin installation', { exact: true })).toBeVisible();
  if (phase === 'https') {
    const cookie = (await context.cookies()).find(c => c.name === 'rationarium_session');
    assert.ok(cookie?.secure && cookie.httpOnly && cookie.sameSite === 'Lax');
  }
  await page.screenshot({ path: `${dossier}/${phase}.png`, fullPage: true });
  await context.storageState({ path: `${dossier}/session.json` });
  if (phase === 'courriel') {
    const response = await context.request.post(`${env.RATIONARIUM_URL_PUBLIQUE}/api/auth/forgot-password`, { data: { email: env.RATIONARIUM_ADMIN_EMAIL }, headers: { origin: env.RATIONARIUM_URL_PUBLIQUE } });
    assert.equal(response.status(), 202);
    await expect.poll(() => { try { return readFileSync(`${dossier}/mail.txt`, 'utf8'); } catch { return ''; } }, { timeout: 30000 }).toContain('jeton=');
    const mail = readFileSync(`${dossier}/mail.txt`, 'utf8').replace(/=\r?\n/g, '').replace(/=([\dA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
    const lien = mail.match(/https?:\/\/[^\s"<>]+\/reinitialisation\?jeton=[\w-]+/)?.[0];
    assert.ok(lien, 'Lien de réinitialisation reçu');
    const anonyme = await browser.newPage({ locale: 'fr-FR' });
    await anonyme.goto(lien);
    await expect(anonyme.locator('input[autocomplete="new-password"]').first()).toBeVisible();
  }
  assert.deepEqual(erreurs, []);
  writeFileSync(`${dossier}/${phase}.json`, JSON.stringify({ phase, connexion: true, erreursJavaScript: erreurs }, null, 2));
  console.log(`Recette navigateur ${phase} : OK`);
} finally { await browser.close(); }
