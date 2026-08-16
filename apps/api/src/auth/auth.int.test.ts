import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { PrismaClient, creerClient } from "@trame/db";
import { AuthService, ErreurAuth } from "./auth.service.js";
import { AuditService } from "../commun/audit.service.js";
import { hacherMotDePasse } from "./mots-de-passe.js";

/**
 * L-04 — authentification, criticité haute.
 *
 * Chaque test cite la règle qu'il couvre. Ces tests portent sur le SERVICE, pas
 * sur la couche HTTP : c'est là que vivent les règles, et c'est là qu'elles
 * doivent être vérifiées.
 */

const RACINE_DB = path.resolve(import.meta.dirname, "../../../../packages/db");
const MDP = "Motdepasse1!";

let pg: StartedPostgreSqlContainer;
let prisma: PrismaClient;
let auth: AuthService;

const uuid = () => crypto.randomUUID();

async function poserUnCompte(
  options: { actif?: boolean; motDePasseAChanger?: boolean; motDePasse?: string } = {},
) {
  const id = uuid();
  const suffixe = id.slice(0, 8);
  await prisma.user.create({
    data: {
      id,
      login: `agent-${suffixe}`,
      email: `${suffixe}@collectivite.fr`,
      motDePasseHash: await hacherMotDePasse(options.motDePasse ?? MDP),
      prenom: "Camille",
      nom: "Durand",
      actif: options.actif ?? true,
      motDePasseAChanger: options.motDePasseAChanger ?? false,
    },
  });
  return { id, login: `agent-${suffixe}`, email: `${suffixe}@collectivite.fr` };
}

const reglage = (cle: string, valeur: string) =>
  prisma.setting.upsert({
    where: { cle },
    create: { cle, valeur },
    update: { valeur },
  });

beforeAll(async () => {
  pg = await new PostgreSqlContainer("postgres:18-alpine").start();
  execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    cwd: RACINE_DB,
    env: { ...process.env, DATABASE_URL: pg.getConnectionUri() },
    stdio: "pipe",
  });
  prisma = creerClient(pg.getConnectionUri());
  auth = new AuthService(prisma as never, new AuditService(prisma as never));
}, 240_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await pg?.stop();
});

beforeEach(async () => {
  await prisma.setting.deleteMany({ where: { cle: { startsWith: "auth." } } });
});

describe("EX-AUTH-01 — connexion par identifiant ou email", () => {
  it("accepte l'identifiant", async () => {
    const c = await poserUnCompte();
    const r = await auth.connecter(c.login, MDP);
    expect(r.userId).toBe(c.id);
    expect(r.jeton).toHaveLength(43);
  });

  it("accepte l'adresse email, insensible à la casse", async () => {
    const c = await poserUnCompte();
    const r = await auth.connecter(c.email.toUpperCase(), MDP);
    expect(r.userId).toBe(c.id);
  });

  it("EX-AUTH-10 — la connexion réussie horodate la dernière connexion", async () => {
    const c = await poserUnCompte();
    await auth.connecter(c.login, MDP);
    const u = await prisma.user.findUniqueOrThrow({ where: { id: c.id } });
    expect(u.derniereConnexion).toBeInstanceOf(Date);
  });
});

describe("RG-AUTH-02 — le message ne distingue jamais les deux échecs", () => {
  it("identifiant inconnu et mot de passe erroné donnent le même code", async () => {
    const c = await poserUnCompte();
    const inconnu = await auth.connecter("personne", MDP).catch((e: ErreurAuth) => e.code);
    const mauvais = await auth.connecter(c.login, "Mauvais1!").catch((e: ErreurAuth) => e.code);
    expect(inconnu).toBe("identifiants_invalides");
    expect(mauvais).toBe("identifiants_invalides");
  });

  it("RG-AUTH-05 — un compte inactif ne se distingue pas non plus au message", async () => {
    const c = await poserUnCompte({ actif: false });
    // Le code interne diffère pour l'audit, mais la vue 01 affiche le même
    // texte : « Identifiant ou mot de passe incorrect ». Voir messages.ts.
    await expect(auth.connecter(c.login, MDP)).rejects.toMatchObject({ code: "compte_inactif" });
  });
});

describe("RG-AUTH-01 — verrouillage après tentatives infructueuses", () => {
  it("verrouille au seuil paramétré, et le seuil est bien un paramètre", async () => {
    await reglage("auth.tentativesAvantVerrouillage", "3");
    const c = await poserUnCompte();

    for (let i = 0; i < 2; i++) {
      await expect(auth.connecter(c.login, "Faux1234!")).rejects.toMatchObject({
        code: "identifiants_invalides",
      });
    }
    // Troisième échec : le compte se verrouille.
    await expect(auth.connecter(c.login, "Faux1234!")).rejects.toMatchObject({
      code: "compte_verrouille",
    });

    // Et le bon mot de passe ne passe plus.
    await expect(auth.connecter(c.login, MDP)).rejects.toMatchObject({
      code: "compte_verrouille",
    });
  });

  it("une connexion réussie remet le compteur d'échecs à zéro", async () => {
    await reglage("auth.tentativesAvantVerrouillage", "5");
    const c = await poserUnCompte();
    await expect(auth.connecter(c.login, "Faux1234!")).rejects.toThrow();
    await auth.connecter(c.login, MDP);
    const u = await prisma.user.findUniqueOrThrow({ where: { id: c.id } });
    expect(u.echecsConnexion).toBe(0);
    expect(u.verrouilleJusqua).toBeNull();
  });

  it("le verrouillage expire", async () => {
    await reglage("auth.tentativesAvantVerrouillage", "1");
    await reglage("auth.dureeVerrouillageMinutes", "15");
    const c = await poserUnCompte();
    await expect(auth.connecter(c.login, "Faux1234!")).rejects.toMatchObject({
      code: "compte_verrouille",
    });
    // On simule l'écoulement du délai.
    await prisma.user.update({
      where: { id: c.id },
      data: { verrouilleJusqua: new Date(Date.now() - 1000) },
    });
    await expect(auth.connecter(c.login, MDP)).resolves.toMatchObject({ userId: c.id });
  });
});

describe("RG-AUTH-10 — les événements d'authentification sont tracés", () => {
  it("succès, échec et verrouillage laissent chacun leur trace", async () => {
    await reglage("auth.tentativesAvantVerrouillage", "2");
    const c = await poserUnCompte();
    await auth.connecter(c.login, MDP);
    await auth.connecter(c.login, "Faux1234!").catch(() => {});
    await auth.connecter(c.login, "Faux1234!").catch(() => {});

    const traces = await prisma.auditLog.findMany({
      where: { entiteId: c.id },
      orderBy: { horodatage: "asc" },
    });
    const actions = traces.map((t) => t.action);
    expect(actions).toContain("auth.login.success");
    expect(actions).toContain("auth.login.failed");
    expect(actions).toContain("auth.login.lockout");
  });

  it("une tentative sur un identifiant inconnu est tracée elle aussi", async () => {
    await auth.connecter("fantome", MDP).catch(() => {});
    const traces = await prisma.auditLog.findMany({
      where: { action: "auth.login.failed", entiteId: null },
    });
    expect(traces.length).toBeGreaterThan(0);
  });
});

describe("EX-AUTH-02, EX-AUTH-03 — cycle de vie de la session", () => {
  it("une session ouverte se résout", async () => {
    const c = await poserUnCompte();
    const { jeton } = await auth.connecter(c.login, MDP);
    await expect(auth.resoudreSession(jeton)).resolves.toMatchObject({ userId: c.id });
  });

  it("EX-AUTH-03 — la déconnexion invalide la session", async () => {
    const c = await poserUnCompte();
    const { jeton } = await auth.connecter(c.login, MDP);
    await auth.deconnecter(jeton, c.id);
    await expect(auth.resoudreSession(jeton)).resolves.toBeNull();
  });

  it("une session expirée ne se résout pas, et disparaît", async () => {
    const c = await poserUnCompte();
    const { jeton } = await auth.connecter(c.login, MDP);
    await prisma.session.updateMany({
      where: { userId: c.id },
      data: { expireLe: new Date(Date.now() - 1000) },
    });
    await expect(auth.resoudreSession(jeton)).resolves.toBeNull();
    expect(await prisma.session.count({ where: { userId: c.id } })).toBe(0);
  });

  it("RG-AUTH-05 — désactiver un compte coupe ses sessions ouvertes immédiatement", async () => {
    const c = await poserUnCompte();
    const { jeton } = await auth.connecter(c.login, MDP);
    await prisma.user.update({ where: { id: c.id }, data: { actif: false } });
    await expect(auth.resoudreSession(jeton)).resolves.toBeNull();
  });

  it("le jeton n'est jamais stocké en clair", async () => {
    const c = await poserUnCompte();
    const { jeton } = await auth.connecter(c.login, MDP);
    const s = await prisma.session.findFirstOrThrow({ where: { userId: c.id } });
    expect(s.jetonHash).not.toBe(jeton);
    expect(s.jetonHash).toHaveLength(64);
  });

  it("un jeton inventé ne résout rien", async () => {
    await expect(auth.resoudreSession("jeton-fabrique")).resolves.toBeNull();
  });
});

describe("EX-AUTH-07, EX-AUTH-08 — mot de passe", () => {
  it("EX-AUTH-07 — un compte à mot de passe imposé le signale à la connexion", async () => {
    const c = await poserUnCompte({ motDePasseAChanger: true });
    const r = await auth.connecter(c.login, MDP);
    expect(r.motDePasseAChanger).toBe(true);
  });

  it("RG-AUTH-07 — le changement exige le mot de passe actuel", async () => {
    const c = await poserUnCompte();
    await expect(auth.changerMotDePasse(c.id, "Faux1234!", "Nouveau1!")).rejects.toMatchObject({
      code: "ancien_mot_de_passe_incorrect",
    });
  });

  it("le changement lève l'obligation et révoque les autres sessions", async () => {
    const c = await poserUnCompte({ motDePasseAChanger: true });
    const { jeton } = await auth.connecter(c.login, MDP);
    await auth.changerMotDePasse(c.id, MDP, "Nouveau12!");

    const u = await prisma.user.findUniqueOrThrow({ where: { id: c.id } });
    expect(u.motDePasseAChanger).toBe(false);
    // La session ouverte avant le changement ne vaut plus.
    await expect(auth.resoudreSession(jeton)).resolves.toBeNull();
    await expect(auth.connecter(c.login, "Nouveau12!")).resolves.toBeTruthy();
  });
});

describe("RG-AUTH-04 — jeton de réinitialisation : trois échecs distincts", () => {
  it("EX-AUTH-05 — la demande ne révèle pas si l'adresse existe", async () => {
    await expect(auth.demanderReinitialisation("inconnu@nulle-part.fr")).resolves.toBeNull();
    const c = await poserUnCompte();
    await expect(auth.demanderReinitialisation(c.email)).resolves.toMatchObject({ userId: c.id });
  });

  it("un jeton valide réinitialise et révoque les sessions", async () => {
    const c = await poserUnCompte();
    const { jeton: session } = await auth.connecter(c.login, MDP);
    const demande = await auth.demanderReinitialisation(c.email);
    await auth.reinitialiserMotDePasse(demande!.jeton, "Nouveau12!");

    await expect(auth.resoudreSession(session)).resolves.toBeNull();
    await expect(auth.connecter(c.login, "Nouveau12!")).resolves.toBeTruthy();
  });

  it("jeton déjà utilisé — message distinct", async () => {
    const c = await poserUnCompte();
    const d = await auth.demanderReinitialisation(c.email);
    await auth.reinitialiserMotDePasse(d!.jeton, "Nouveau12!");
    await expect(auth.reinitialiserMotDePasse(d!.jeton, "Encore123!")).rejects.toMatchObject({
      code: "jeton_deja_utilise",
    });
  });

  it("jeton expiré — message distinct", async () => {
    const c = await poserUnCompte();
    const d = await auth.demanderReinitialisation(c.email);
    await prisma.passwordResetToken.updateMany({
      where: { userId: c.id },
      data: { expireLe: new Date(Date.now() - 1000) },
    });
    await expect(auth.reinitialiserMotDePasse(d!.jeton, "Nouveau12!")).rejects.toMatchObject({
      code: "jeton_expire",
    });
  });

  it("jeton inconnu — message distinct", async () => {
    await expect(auth.reinitialiserMotDePasse("fabrique", "Nouveau12!")).rejects.toMatchObject({
      code: "jeton_invalide",
    });
  });
});

describe("RG-AUTH-03 — inscription autonome", () => {
  const nouveau = () => ({
    prenom: "Léa",
    nom: "Fabre",
    email: `lea-${crypto.randomUUID().slice(0, 8)}@collectivite.fr`,
    login: `lea-${crypto.randomUUID().slice(0, 8)}`,
    motDePasse: MDP,
  });

  it("désactivée par défaut", async () => {
    await expect(auth.inscrire(nouveau())).rejects.toMatchObject({
      code: "inscription_desactivee",
    });
  });

  it("activée, elle crée le compte", async () => {
    await reglage("auth.inscriptionAutonome", "true");
    const d = nouveau();
    const id = await auth.inscrire(d);
    const u = await prisma.user.findUniqueOrThrow({ where: { id } });
    expect(u.email).toBe(d.email);
    // Le mot de passe est choisi par l'intéressé : aucun changement imposé.
    expect(u.motDePasseAChanger).toBe(false);
  });

  it("restreinte à une liste de domaines autorisés", async () => {
    await reglage("auth.inscriptionAutonome", "true");
    await reglage("auth.domainesAutorises", "collectivite.fr,mairie.fr");
    await expect(
      auth.inscrire({ ...nouveau(), email: "quelquun@gmail.com" }),
    ).rejects.toMatchObject({ code: "domaine_non_autorise" });
    await expect(auth.inscrire(nouveau())).resolves.toBeTruthy();
  });

  it("RG-USR-01 — email et identifiant en doublon donnent des messages DISTINCTS", async () => {
    await reglage("auth.inscriptionAutonome", "true");
    const d = nouveau();
    await auth.inscrire(d);
    await expect(auth.inscrire({ ...nouveau(), email: d.email })).rejects.toMatchObject({
      code: "email_deja_pris",
    });
    await expect(auth.inscrire({ ...nouveau(), login: d.login })).rejects.toMatchObject({
      code: "login_deja_pris",
    });
  });
});
