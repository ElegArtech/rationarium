import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";
import { serveur } from "./fixtures/projets.js";
import { SESSION_CONFIG, REGLAGES, FERIES, VACANCES } from "./fixtures/parametrage.js";
for (const langue of ["fr", "en"] as const) test.describe(langue, () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-09-10T09:00:00Z"));
    await page.addInitScript(l => localStorage.setItem("rationarium.langue", l), langue);
  });
  test(`RM-12 P-119 ${langue} trois onglets et préférences persistées`, async ({ page }) => {
    const session = { ...SESSION_CONFIG, langue, theme: "clair", version: 1 };
    await serveur(page, { session, reponses: { "/api/parametrage": { corps: REGLAGES } } });
    let ecriture: unknown;
    await page.route(url => url.pathname === "/api/auth/me", async route => {
      if (route.request().method() === "PATCH") {
        ecriture = route.request().postDataJSON();
        Object.assign(session, ecriture, { version: 2 });
      }
      await route.fulfill({ json: session });
    });
    await page.goto("/profil");
    await expect(page.locator(".tabbar button")).toHaveCount(3);
    await page.locator(".tabbar").getByRole("button", { name: /Préférences|Preferences/ }).click();
    await page.getByRole("group", { name: /Thème|Theme/ }).getByRole("button", { name: /Sombre|Dark/ }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.getByRole("button", { name: /Enregistrer les préférences|Save preferences/ }).click();
    await expect.poll(() => ecriture).toEqual({ langue, theme: "sombre", version: 1 });
    await page.reload();
    await page.locator(".tabbar").getByRole("button", { name: /Préférences|Preferences/ }).click();
    await expect(page.getByRole("group", { name: /Thème|Theme/ }).getByRole("button", { name: /Sombre|Dark/ })).toHaveAttribute("aria-pressed", "true");
    await page.locator(".tabbar").getByRole("button", { name: /Sécurité|Security/ }).click();
    await expect(page.getByText(/Dernière connexion|Last sign-in/, { exact: false }).first()).toBeVisible();
    for (const [onglet, nom] of [["info", /Informations personnelles|Personal information/], ["sec", /Sécurité|Security/], ["pref", /Préférences|Preferences/]] as const) {
      await page.locator(".tabbar").getByRole("button", { name: nom }).click();
      for (const sombre of [false, true]) {
        await page.evaluate(dark => document.documentElement.classList.toggle("dark", dark), sombre);
        // Le socle anime champs, boutons et politique pendant 150 ms. Axe
        // mesurait la couleur intermédiaire de la transition, pas le thème
        // effectivement rendu (témoin : fond #929398 à 2,52:1).
        await page.waitForTimeout(180);
        for (const width of [1440, 768]) {
          await page.setViewportSize({ width, height: 1024 });
          expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
          await page.screenshot({ path: `../../recette/remediation/rm-12/reprise/profil-${onglet}-${langue}-${sombre ? "sombre" : "clair"}-${width}.png` });
        }
      }
    }
  });
  test(`RM-12 P-172 ${langue} connexion applique la langue enregistrée et conserve le format global`, async ({ page }) => {
    const cible = langue === "fr" ? "en" : "fr";
    const session = { ...SESSION_CONFIG, derniereConnexion: "2026-09-07T09:00:00Z", langue: cible, theme: "sombre", role: { code: "ADMIN", nom: "Administrateur", systeme: true } };
    await serveur(page, { session, reponses: { "/api/parametrage": { corps: { ...REGLAGES, "display.dateFormat": "AAAA-MM-JJ" } } } });
    let connecte = false;
    await page.route(url => url.pathname === "/api/auth/me", async route => {
      await route.fulfill(connecte ? { json: session } : { status: 401, json: {} });
    });
    await page.route(url => url.pathname === "/api/auth/login", async route => {
      connecte = true;
      await route.fulfill({ json: { userId: session.id, motDePasseAChanger: false } });
    });
    await page.goto("/connexion?suite=%2Fprofil");
    await page.locator('input[autocomplete="username"]').fill("karim");
    await page.locator('input[autocomplete="current-password"]').fill("Exemple1!");
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/profil$/);
    await expect(page.locator("html")).toHaveAttribute("lang", cible);
    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect(page.getByText(cible === "en" ? "Administrator" : "Administrateur", { exact: true }).first()).toBeVisible();
    await page.locator(".tabbar").getByRole("button", { name: /Sécurité|Security/ }).click();
    await expect(page.getByText("2026-09-07", { exact: true })).toBeVisible();
    session.role = { code: "ADMIN", nom: "Administrateur local", systeme: false };
    await page.reload();
    await expect(page.getByText("Administrateur local", { exact: true }).first()).toBeVisible();
  });
  test(`RM-12 P-120 ${langue} chaque défaut de politique reste explicite sans appel serveur`, async ({ page }) => {
    await serveur(page, { session: SESSION_CONFIG });
    let appels = 0;
    await page.route(url => url.pathname === "/api/auth/change-password", async route => {
      appels++;
      await route.fulfill({
        status: 400,
        json: {
          cle: "auth:erreurs.ancienMotDePasseIncorrect",
          message: "Ancien mot de passe incorrect",
        },
      });
    });
    await page.goto("/profil");
    await page.locator(".tabbar").getByRole("button", { name: /Sécurité|Security/ }).click();
    await page.locator('input[autocomplete="current-password"]').fill("Ancien1!");
    const nouveaux = page.locator('input[autocomplete="new-password"]');
    for (const [secret, texte] of [["A1!", /8 caractères|8 characters/], ["abcdefg1!", /majuscule|capital letter/], ["Abcdefgh!", /chiffre|number|digit/], ["Abcdefgh1", /spécial|special/]] as const) {
      await nouveaux.nth(0).fill(secret); await nouveaux.nth(1).fill(secret);
      await page.locator('button[type="submit"]').click();
      await expect(page.locator(".alert-error")).toContainText(texte);
      expect(appels).toBe(0);
    }
    await nouveaux.nth(0).fill("Nouveau12!");
    await nouveaux.nth(1).fill("Different12!");
    await page.locator('button[type="submit"]').click();
    await expect(page.locator(".alert-error")).toContainText(
      langue === "fr" ? "Les mots de passe ne correspondent pas" : "Passwords do not match",
    );
    expect(appels).toBe(0);
    await nouveaux.nth(1).fill("Nouveau12!");
    await page.locator('button[type="submit"]').click();
    await expect.poll(() => appels).toBe(1);
    await expect(page.locator(".alert-error")).toContainText(
      langue === "fr" ? "Ancien mot de passe incorrect" : "Current password is incorrect",
    );
  });
  test(`RM-12 P-13 ${langue} avatar jpg png webp, refus et suppression`, async ({ page }) => {
    const session = {
      ...SESSION_CONFIG,
      langue,
      avatarFichier: null,
      avatarPredefini: null,
      avatarUrl: null as string | null,
      permissions: [],
      version: 1,
    };
    const appels: { methode: string; corps?: Record<string, unknown> }[] = [];
    let lectures = 0;
    await serveur(page, { session });
    await page.route(url => url.pathname === "/api/auth/me", async route => {
      if (route.request().method() === "PATCH") {
        const corps = route.request().postDataJSON() as Record<string, unknown>;
        appels.push({ methode: "PATCH", corps });
        Object.assign(session, corps, { avatarFichier: null, avatarUrl: null, version: session.version + 1 });
      }
      await route.fulfill({ json: session });
    });
    await page.route(url => url.pathname === "/api/auth/me/avatar", async route => {
      const methode = route.request().method();
      if (methode === "GET") {
        lectures++;
        await route.fulfill({
          body: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
          contentType: "image/png",
        });
        return;
      }
      const corps = route.request().postDataJSON() as Record<string, unknown>;
      appels.push({ methode, corps });
      if (methode === "POST") {
        Object.assign(session, { avatarFichier: "empreinte", avatarUrl: "/api/auth/me/avatar", version: 2 });
      } else {
        Object.assign(session, { avatarFichier: null, avatarUrl: null, version: 3 });
      }
      await route.fulfill({ json: session });
    });

    await page.goto("/profil");
    const styleConstellation = await page.locator(".avatar-option .avatar-predefini-constellation").evaluate(element => {
      const temoin = document.createElement("span");
      temoin.style.background = "var(--accent-soft)";
      temoin.style.color = "var(--accent)";
      document.body.append(temoin);
      const attendu = getComputedStyle(temoin);
      const rendu = getComputedStyle(element);
      const resultat = {
        fond: rendu.backgroundColor === attendu.backgroundColor,
        encre: rendu.color === attendu.color,
      };
      temoin.remove();
      return resultat;
    });
    expect(styleConstellation).toEqual({ fond: true, encre: true });
    const vagues = page.locator(".avatar-option").filter({
      hasText: langue === "fr" ? "Vagues" : "Waves",
    });
    await vagues.click();
    await expect.poll(() => appels.at(-1)).toMatchObject({
      methode: "PATCH",
      corps: { avatarFichier: null, avatarPredefini: "vagues", version: 1 },
    });
    await expect(page.locator(".profil-head .avatar-predefini-vagues")).toBeVisible();
    await expect(page.locator(".usermenu-btn .avatar-predefini-vagues")).toBeVisible();
    for (const sombre of [false, true]) {
      await page.evaluate(dark => document.documentElement.classList.toggle("dark", dark), sombre);
      await page.waitForTimeout(180);
      for (const width of [1440, 768]) {
        await page.setViewportSize({ width, height: 1024 });
        expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
        await page.screenshot({
          path: `../../recette/remediation/rm-12/reprise/avatar-predefini-${langue}-${sombre ? "sombre" : "clair"}-${width}.png`,
        });
      }
    }
    const fichier = page.locator("#profil-avatar");
    const nombreAvantRefus = appels.length;
    await fichier.setInputFiles({ name: "portrait.gif", mimeType: "image/gif", buffer: Buffer.from("GIF") });
    await expect(page.locator(".avatar-retour").getByRole("alert")).toHaveText(
      langue === "fr"
        ? "!Format non supporté. Utilisez jpg, png ou webp."
        : "!Unsupported format. Use jpg, png or webp.",
    );
    expect(appels).toHaveLength(nombreAvantRefus);

    for (const [name, mimeType] of [
      ["portrait.jpg", "image/jpeg"],
      ["portrait.png", "image/png"],
      ["portrait.webp", "image/webp"],
    ] as const) {
      const nombreAvant = appels.length;
      await fichier.setInputFiles({ name, mimeType, buffer: Buffer.from([1, 2, 3, 4]) });
      await expect.poll(() => appels.length).toBe(nombreAvant + 1);
      expect(appels.at(-1)?.corps).toMatchObject({ typeMime: mimeType });
      expect(String(appels.at(-1)?.corps?.["contenuBase64"])).toBe("AQIDBA==");
      await expect(page.locator(".profil-head img.avatar-image")).toBeVisible();
    }
    await expect.poll(() => lectures).toBeGreaterThan(0);
    await page.getByRole("button", { name: /Supprimer l.avatar|Remove avatar/ }).click();
    await expect.poll(() => appels.at(-1)).toMatchObject({ methode: "DELETE", corps: { version: 2 } });
    await expect(page.locator(".profil-head img.avatar-image")).toHaveCount(0);
  });

  test(`RM-12 socle ${langue} rend les pictogrammes date et heure en thème sombre`, async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await serveur(page, {
      session: { ...SESSION_CONFIG, langue },
      reponses: {
        "/api/parametrage": { corps: REGLAGES },
        "/api/parametrage/feries": { corps: FERIES },
        "/api/parametrage/vacances": { corps: VACANCES },
      },
    });
    await page.goto("/parametres#feries");
    await page.getByRole("button", {
      name: langue === "fr" ? "Ajouter un jour" : "Add a day",
    }).click();
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    const date = page.locator('#h-date');
    await expect(date).toBeVisible();
    await expect.poll(() => date.evaluate(element => getComputedStyle(element).colorScheme)).toBe("dark");
    const couleurHeure = await page.evaluate(() => {
      const champ = document.createElement("input");
      champ.type = "time";
      champ.className = "field";
      document.body.append(champ);
      const valeur = getComputedStyle(champ).colorScheme;
      champ.remove();
      return valeur;
    });
    expect(couleurHeure).toBe("dark");
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({
      path: `../../recette/remediation/rm-12/reprise/pictogramme-date-${langue}-sombre-768.png`,
    });
  });
});

test("RM-12 P-133 EX-PRM-03 — la langue publique de l'organisation précède toute session", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-10T09:00:00Z"));
  await page.addInitScript(() => localStorage.clear());
  await serveur(page, {
    reponses: {
      "/api/parametrage": { corps: { ...REGLAGES, "display.locale": "en-US", "display.dateFormat": "AAAA-MM-JJ" } },
      "/api/auth/acces": { corps: { inscriptionAutonome: true } },
    },
  });
  await page.route(url => url.pathname === "/api/auth/me", route =>
    route.fulfill({ status: 401, contentType: "application/json", body: "{}" }),
  );

  await page.goto("/connexion");

  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign up", exact: true })).toBeVisible();
  await expect(page.getByTestId("date-publique")).toHaveText("Today: 2026-09-10");
});
