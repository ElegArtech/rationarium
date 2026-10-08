import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { PrismaClient, creerClient } from "@rationarium/db";
import { AuthController } from "./auth.controller.js";
import { UtilisateursService } from "../utilisateurs/utilisateurs.service.js";
import { PerimetreService } from "../commun/perimetre.service.js";
import { AuthService, ErreurAuth } from "./auth.service.js";
import { modificationProfilSchema } from "@rationarium/contracts";
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
      email: `${suffixe}@collectivite.test`,
      motDePasseHash: await hacherMotDePasse(options.motDePasse ?? MDP),
      prenom: "Camille",
      nom: "Durand",
      actif: options.actif ?? true,
      motDePasseAChanger: options.motDePasseAChanger ?? false,
    },
  });
  return { id, login: `agent-${suffixe}`, email: `${suffixe}@collectivite.test` };
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
  /*
   * La file est fournie, muette : sans elle, chaque demande de
   * réinitialisation journaliserait « la file n'est pas injectée » — un
   * message juste en production, et du bruit ici. Une erreur qui se répète
   * sans objet apprend à ne plus lire les journaux.
   */
  auth = new AuthService(
    prisma as never,
    new AuditService(prisma as never),
    { publier: async () => "travail" } as never,
  );
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

  /**
   * `RG-AUTH-01` — **le verrou ne se contourne pas en parallèle.**
   *
   * Le service lisait le compteur, attendait Argon2, puis écrivait `lu + 1` :
   * vingt connexions lancées ensemble lisaient toutes zéro et écrivaient
   * toutes un. Vingt essais de mot de passe pour un seuil de cinq, et le
   * compte restait ouvert au bon mot de passe juste après.
   */
  it("RG-AUTH-01 — vingt connexions fausses EN PARALLÈLE verrouillent le compte, sans plus d'essais que le seuil", async () => {
    await reglage("auth.tentativesAvantVerrouillage", "5");
    const c = await poserUnCompte();

    const codes = await Promise.all(
      Array.from({ length: 20 }, () =>
        auth.connecter(c.login, "Faux1234!").then(
          () => "connecte",
          (e: ErreurAuth) => e.code,
        ),
      ),
    );

    // Au plus seuil − 1 réponses « identifiants invalides » : chaque autre
    // requête a été refusée par le verrou, sans vérifier le mot de passe.
    expect(codes.filter((code) => code === "identifiants_invalides").length).toBeLessThanOrEqual(4);
    expect(codes).toContain("compte_verrouille");
    const u = await prisma.user.findUniqueOrThrow({ where: { id: c.id } });
    expect(u.verrouilleJusqua!.getTime()).toBeGreaterThan(Date.now());
    await expect(auth.connecter(c.login, MDP)).rejects.toMatchObject({ code: "compte_verrouille" });
  });

  it("RG-AUTH-01 — un compteur resté au-dessus du seuil sans verrou ne bloque pas pour toujours", async () => {
    // Une réservation orpheline : processus tombé entre l'incrément et la fin.
    await reglage("auth.tentativesAvantVerrouillage", "5");
    await reglage("auth.dureeVerrouillageMinutes", "15");
    const c = await poserUnCompte();
    await prisma.user.update({ where: { id: c.id }, data: { echecsConnexion: 9 } });

    await expect(auth.connecter(c.login, MDP)).rejects.toMatchObject({ code: "compte_verrouille" });
    const u = await prisma.user.findUniqueOrThrow({ where: { id: c.id } });
    expect(u.echecsConnexion).toBe(0);
    expect(u.verrouilleJusqua).not.toBeNull();

    await prisma.user.update({ where: { id: c.id }, data: { verrouilleJusqua: new Date(Date.now() - 1000) } });
    await expect(auth.connecter(c.login, MDP)).resolves.toMatchObject({ userId: c.id });
  });

  it("RG-AUTH-01, RG-AUTH-12 — vingt essais parallèles sur un identifiant INCONNU le verrouillent aussi", async () => {
    await reglage("auth.tentativesAvantVerrouillage", "5");
    const inconnu = `fantome-${uuid().slice(0, 8)}`;
    const codes = await Promise.all(
      Array.from({ length: 20 }, () =>
        auth.connecter(inconnu, "Faux1234!").catch((e: ErreurAuth) => e.code),
      ),
    );
    expect(codes.filter((code) => code === "identifiants_invalides").length).toBeLessThanOrEqual(4);
    await expect(auth.connecter(inconnu, "Faux1234!")).rejects.toMatchObject({ code: "compte_verrouille" });
  });
});

describe("RG-AUTH-12 — le verrouillage ne révèle pas si un compte existe", () => {
  afterEach(() => vi.useRealTimers());

  /** Les codes successifs de `n` échecs sur un identifiant. */
  const codes = async (identifiant: string, n: number) => {
    const vus: string[] = [];
    for (let i = 0; i < n; i++) {
      vus.push(
        await auth.connecter(identifiant, "Faux1234!").then(
          () => "connecte",
          (e: ErreurAuth) => e.code,
        ),
      );
    }
    return vus;
  };

  it("un identifiant inconnu est « verrouillé » au même seuil qu'un compte réel", async () => {
    await reglage("auth.tentativesAvantVerrouillage", "3");
    const c = await poserUnCompte();
    const inconnu = `fantome-${uuid().slice(0, 8)}`;

    const reel = await codes(c.login, 4);
    const fictif = await codes(inconnu, 4);

    expect(reel).toEqual([
      "identifiants_invalides",
      "identifiants_invalides",
      "compte_verrouille",
      "compte_verrouille",
    ]);
    expect(fictif).toEqual(reel);
  });

  it("le seuil est le paramètre : un seuil de 2 verrouille l'inconnu au 2e échec", async () => {
    await reglage("auth.tentativesAvantVerrouillage", "2");
    const fictif = await codes(`fantome-${uuid().slice(0, 8)}`, 2);
    expect(fictif).toEqual(["identifiants_invalides", "compte_verrouille"]);
  });

  it("l'identifiant inconnu est normalisé : la casse ne remet pas le compteur à zéro", async () => {
    await reglage("auth.tentativesAvantVerrouillage", "2");
    const inconnu = `Fantome-${uuid().slice(0, 8)}`;
    await codes(inconnu, 1);
    expect(await codes(inconnu.toUpperCase(), 1)).toEqual(["compte_verrouille"]);
  });

  it("le verrouillage d'un inconnu dure et expire comme celui d'un compte réel", async () => {
    await reglage("auth.tentativesAvantVerrouillage", "2");
    await reglage("auth.dureeVerrouillageMinutes", "15");
    const inconnu = `fantome-${uuid().slice(0, 8)}`;
    vi.useFakeTimers({ toFake: ["Date"] });
    const depart = new Date();
    vi.setSystemTime(depart);

    expect(await codes(inconnu, 3)).toEqual([
      "identifiants_invalides",
      "compte_verrouille",
      "compte_verrouille",
    ]);
    vi.setSystemTime(new Date(depart.getTime() + 14 * 60_000));
    expect(await codes(inconnu, 1)).toEqual(["compte_verrouille"]);
    vi.setSystemTime(new Date(depart.getTime() + 16 * 60_000));
    expect(await codes(inconnu, 1)).toEqual(["identifiants_invalides"]);
  });
});

describe("RG-AUTH-13 — la session glisse avec l'usage", () => {
  afterEach(() => vi.useRealTimers());
  const JOUR = 86_400_000;

  it("utilisée à J+15, une session de 30 jours est encore valide à J+31", async () => {
    await reglage("auth.dureeSessionJours", "30");
    const c = await poserUnCompte();
    vi.useFakeTimers({ toFake: ["Date"] });
    const depart = new Date();
    vi.setSystemTime(depart);
    const { jeton } = await auth.connecter(c.login, MDP);

    vi.setSystemTime(new Date(depart.getTime() + 15 * JOUR));
    await expect(auth.resoudreSession(jeton)).resolves.toMatchObject({ userId: c.id });

    vi.setSystemTime(new Date(depart.getTime() + 31 * JOUR));
    await expect(auth.resoudreSession(jeton)).resolves.toMatchObject({ userId: c.id });
  });

  it("sans usage, la même session est expirée à J+31", async () => {
    await reglage("auth.dureeSessionJours", "30");
    const c = await poserUnCompte();
    vi.useFakeTimers({ toFake: ["Date"] });
    const depart = new Date();
    vi.setSystemTime(depart);
    const { jeton } = await auth.connecter(c.login, MDP);

    vi.setSystemTime(new Date(depart.getTime() + 31 * JOUR));
    await expect(auth.resoudreSession(jeton)).resolves.toBeNull();
  });

  it("deux usages à moins de cinq minutes n'écrivent qu'une fois", async () => {
    const c = await poserUnCompte();
    vi.useFakeTimers({ toFake: ["Date"] });
    const depart = new Date();
    vi.setSystemTime(depart);
    const { jeton } = await auth.connecter(c.login, MDP);
    const lire = () => prisma.session.findFirstOrThrow({ where: { userId: c.id } });

    vi.setSystemTime(new Date(depart.getTime() + 10 * 60_000));
    await auth.resoudreSession(jeton);
    const premiere = await lire();

    vi.setSystemTime(new Date(depart.getTime() + 12 * 60_000));
    await auth.resoudreSession(jeton);
    const seconde = await lire();
    expect(seconde.derniereActivite.getTime()).toBe(premiere.derniereActivite.getTime());
    expect(seconde.expireLe.getTime()).toBe(premiere.expireLe.getTime());

    vi.setSystemTime(new Date(depart.getTime() + 16 * 60_000));
    await auth.resoudreSession(jeton);
    const troisieme = await lire();
    expect(troisieme.derniereActivite.getTime()).toBeGreaterThan(premiere.derniereActivite.getTime());
    expect(troisieme.expireLe.getTime()).toBeGreaterThan(premiere.expireLe.getTime());
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

  /**
   * `EX-AUTH-07`, `RG-AUTH-06` — **le changement imposé ne révoque pas sa
   * propre session.**
   *
   * Relevé en recette : `POST /auth/change-password` → 200, navigation vers
   * `/`, `GET /auth/me` → 401, retour sur la vue 05 avec un formulaire vide et
   * aucun message. L'utilisateur avait changé son mot de passe **et restait
   * enfermé** — condamné à ressaisir un « mot de passe actuel » qui n'existait
   * plus. Le commentaire du service disait « invalide les AUTRES sessions » ;
   * `revoquerSessions(userId)` les invalidait toutes.
   */
  it("EX-AUTH-07 — la session qui change le mot de passe survit, les autres non", async () => {
    const c = await poserUnCompte({ motDePasseAChanger: true });
    const ailleurs = await auth.connecter(c.login, MDP);
    const ici = await auth.connecter(c.login, MDP);
    const session = await auth.resoudreSession(ici.jeton);

    await auth.changerMotDePasse(c.id, MDP, "Nouveau12!", {
      conserverSessionId: session!.sessionId,
    });

    // Celle qui a fait le geste continue de valoir : sinon la vue 05 se
    // referme sur son occupant.
    const apres = await auth.resoudreSession(ici.jeton);
    expect(apres).not.toBeNull();
    expect(apres!.motDePasseAChanger).toBe(false);
    // Toutes les autres tombent — c'est le geste qu'on fait quand on
    // soupçonne une compromission.
    await expect(auth.resoudreSession(ailleurs.jeton)).resolves.toBeNull();
  });

  it("sans session à conserver, tout tombe — le cas de l'administration", async () => {
    const c = await poserUnCompte();
    const { jeton } = await auth.connecter(c.login, MDP);
    await auth.changerMotDePasse(c.id, MDP, "Nouveau12!");
    await expect(auth.resoudreSession(jeton)).resolves.toBeNull();
  });

  /**
   * `RG-AUTH-07`, `RG-AUTH-11` — **le mot de passe provisoire ne survit pas
   * au changement imposé.** La vue 05 refusait l'identique côté client
   * seulement : une requête directe reposait le secret que l'administrateur
   * avait choisi, et levait l'obligation.
   */
  it("RG-AUTH-07 — un nouveau mot de passe IDENTIQUE à l'actuel est refusé, l'obligation demeure", async () => {
    const c = await poserUnCompte({ motDePasseAChanger: true });
    await expect(auth.changerMotDePasse(c.id, MDP, MDP)).rejects.toMatchObject({
      code: "nouveau_identique",
    });
    const u = await prisma.user.findUniqueOrThrow({ where: { id: c.id } });
    expect(u.motDePasseAChanger).toBe(true);
  });

  /**
   * `RG-AUTH-01` — **le changement de mot de passe compte ses échecs.** Il
   * n'avait ni compteur ni verrou : une session volée y essayait des mots de
   * passe sans limite, et le bon lui donnait le compte.
   */
  it("RG-AUTH-01 — les échecs du changement de mot de passe sont tracés, comptés, et verrouillent le compte", async () => {
    await reglage("auth.tentativesAvantVerrouillage", "3");
    const c = await poserUnCompte();
    const codes: string[] = [];
    for (let i = 0; i < 3; i++) {
      codes.push(
        await auth.changerMotDePasse(c.id, `Faux${i}234!`, "Nouveau12!").then(
          () => "change",
          (e: ErreurAuth) => e.code,
        ),
      );
    }
    expect(codes).toEqual([
      "ancien_mot_de_passe_incorrect",
      "ancien_mot_de_passe_incorrect",
      "compte_verrouille",
    ]);
    // Verrouillé : le bon mot de passe ne passe plus, ni ici ni à la connexion.
    await expect(auth.changerMotDePasse(c.id, MDP, "Nouveau12!")).rejects.toMatchObject({
      code: "compte_verrouille",
    });
    await expect(auth.connecter(c.login, MDP)).rejects.toMatchObject({ code: "compte_verrouille" });
    const traces = await prisma.auditLog.findMany({ where: { entiteId: c.id } });
    expect(traces.map((t) => t.action)).toContain("auth.password.change_failed");
    expect(traces.map((t) => t.action)).toContain("auth.login.lockout");
  });
});

describe("EX-AUTH-06, RG-AUTH-04 — définir un nouveau mot de passe depuis le lien reçu ; le jeton est à usage unique et il expire", () => {
  it("EX-AUTH-05 — la demande ne révèle pas si l'adresse existe", async () => {
    await expect(auth.demanderReinitialisation("inconnu@nulle-part.test")).resolves.toBeNull();
    const c = await poserUnCompte();
    await expect(auth.demanderReinitialisation(c.email)).resolves.toMatchObject({ userId: c.id });
  });

  /**
   * `EX-AUTH-05` — **le lien part.**
   *
   * `POST /auth/forgot-password` appelait le service, recevait le jeton en
   * clair et le jetait : `AuthModule` n'importait aucun service de courriel,
   * rien n'était mis en file, et la vue 03 affirmait pourtant « un lien de
   * réinitialisation vient d'être envoyé ». Le jeton existait en base, valable
   * deux heures, et personne au monde ne pouvait l'obtenir.
   *
   * Le contrôle regarde ce qui ENTRE DANS LA FILE, et pas seulement que la
   * demande aboutit : c'est la moitié qui manquait, et la seule que le service
   * ne pouvait pas prouver tout seul.
   */
  it("EX-AUTH-05 — la demande met un courriel en file, avec le lien et le jeton", async () => {
    const enFile: { file: string; donnees: Record<string, unknown> }[] = [];
    const avecFile = new AuthService(
      prisma as never,
      new AuditService(prisma as never),
      {
        publier: async (file: string, donnees: Record<string, unknown>) => {
          enFile.push({ file, donnees });
          return "travail";
        },
      } as never,
    );

    const c = await poserUnCompte();
    const demande = await avecFile.demanderReinitialisation(c.email);

    expect(enFile).toHaveLength(1);
    expect(enFile[0]!.file).toBe("courriel");
    expect(enFile[0]!.donnees["destinataire"]).toBe(c.email);
    // RG-AUTH-04 — le lien mène à la vue 04 et porte le jeton : sans lui, le
    // courriel est une politesse sans porte.
    expect(String(enFile[0]!.donnees["corps"])).toContain(
      `/reinitialisation?jeton=${demande!.jeton}`,
    );
  });

  it("EX-AUTH-05 — une adresse inconnue ne met rien en file", async () => {
    const enFile: unknown[] = [];
    const avecFile = new AuthService(
      prisma as never,
      new AuditService(prisma as never),
      { publier: async () => (enFile.push(1), "t") } as never,
    );
    await expect(avecFile.demanderReinitialisation("inconnu@nulle-part.test")).resolves.toBeNull();
    expect(enFile).toEqual([]);
  });

  /**
   * `RG-AUTH-04` — **le jeton est jugé avant qu'on saisisse quoi que ce soit.**
   *
   * Il n'existait aucun point d'entrée de vérification : la vue 04 ouvrait son
   * formulaire complet sur un jeton mort, et l'utilisateur ne l'apprenait
   * qu'après avoir choisi ET confirmé un mot de passe. Les trois messages
   * distincts existaient et arrivaient après le geste qu'ils devaient
   * épargner.
   */
  describe("RG-AUTH-04 — l'état d'un lien se lit avant le formulaire", () => {
    it("un jeton valide nomme le compte concerné", async () => {
      const c = await poserUnCompte();
      const d = await auth.demanderReinitialisation(c.email);
      await expect(auth.verifierJetonReinitialisation(d!.jeton)).resolves.toEqual({
        email: c.email,
      });
    });

    it("un jeton déjà consommé se refuse SANS qu'un mot de passe soit demandé", async () => {
      const c = await poserUnCompte();
      const d = await auth.demanderReinitialisation(c.email);
      await auth.reinitialiserMotDePasse(d!.jeton, "Nouveau12!");
      await expect(auth.verifierJetonReinitialisation(d!.jeton)).rejects.toMatchObject({
        code: "jeton_deja_utilise",
      });
    });

    it("un jeton expiré se refuse, et le message le distingue d'un jeton inconnu", async () => {
      const c = await poserUnCompte();
      const d = await auth.demanderReinitialisation(c.email);
      await prisma.passwordResetToken.updateMany({
        where: { userId: c.id },
        data: { expireLe: new Date(Date.now() - 1000) },
      });
      await expect(auth.verifierJetonReinitialisation(d!.jeton)).rejects.toMatchObject({
        code: "jeton_expire",
      });
      await expect(auth.verifierJetonReinitialisation("fabrique")).rejects.toMatchObject({
        code: "jeton_invalide",
      });
    });

    it("un compte désactivé entre-temps rend le lien invalide, pas expiré", async () => {
      const c = await poserUnCompte();
      const d = await auth.demanderReinitialisation(c.email);
      await prisma.user.update({ where: { id: c.id }, data: { actif: false } });
      await expect(auth.verifierJetonReinitialisation(d!.jeton)).rejects.toMatchObject({
        code: "jeton_invalide",
      });
    });
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

  /**
   * `RG-AUTH-04` — **un seul lien actif par compte.** Chaque demande ajoutait
   * un jeton sans retirer les précédents : dix demandes, dix liens valables
   * dans la boîte aux lettres.
   */
  it("RG-AUTH-04 — une nouvelle demande invalide le lien précédent", async () => {
    const c = await poserUnCompte();
    const premiere = await auth.demanderReinitialisation(c.email);
    const seconde = await auth.demanderReinitialisation(c.email);

    await expect(auth.verifierJetonReinitialisation(premiere!.jeton)).rejects.toMatchObject({
      code: "jeton_invalide",
    });
    await expect(auth.reinitialiserMotDePasse(premiere!.jeton, "Nouveau12!")).rejects.toMatchObject({
      code: "jeton_invalide",
    });
    await expect(auth.verifierJetonReinitialisation(seconde!.jeton)).resolves.toMatchObject({
      email: c.email,
    });
    expect(
      await prisma.passwordResetToken.count({ where: { userId: c.id, utiliseLe: null } }),
    ).toBe(1);
  });

  it("RG-AUTH-04 — changer son mot de passe révoque le lien de réinitialisation en cours", async () => {
    const c = await poserUnCompte();
    const demande = await auth.demanderReinitialisation(c.email);
    await auth.changerMotDePasse(c.id, MDP, "Nouveau12!");

    await expect(auth.reinitialiserMotDePasse(demande!.jeton, "Intrus123!")).rejects.toMatchObject({
      code: "jeton_invalide",
    });
    await expect(auth.connecter(c.login, "Nouveau12!")).resolves.toBeTruthy();
  });

  it("RG-AUTH-04 — la réinitialisation administrateur révoque aussi le lien en cours", async () => {
    const admin = await poserUnCompte();
    const c = await poserUnCompte();
    const demande = await auth.demanderReinitialisation(c.email);
    const utilisateurs = new UtilisateursService(
      prisma as never,
      new AuditService(prisma as never),
      new PerimetreService(prisma as never),
    );
    await utilisateurs.reinitialiserMotDePasse(c.id, "Provisoire1!", admin.id);

    await expect(auth.reinitialiserMotDePasse(demande!.jeton, "Intrus123!")).rejects.toMatchObject({
      code: "jeton_invalide",
    });
  });

  it("RG-AUTH-04 — deux consommations SIMULTANÉES du même jeton : une seule réussit", async () => {
    const c = await poserUnCompte();
    const demande = await auth.demanderReinitialisation(c.email);
    const issues = await Promise.allSettled([
      auth.reinitialiserMotDePasse(demande!.jeton, "Premier12!"),
      auth.reinitialiserMotDePasse(demande!.jeton, "Second123!"),
    ]);
    expect(issues.filter((i) => i.status === "fulfilled")).toHaveLength(1);
  });
});

describe("EX-AUTH-04, RG-AUTH-03 — créer un compte en autonomie, activable et désactivable", () => {
  const nouveau = () => ({
    prenom: "Léa",
    nom: "Fabre",
    email: `lea-${crypto.randomUUID().slice(0, 8)}@collectivite.test`,
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
    await reglage("auth.domainesAutorises", "collectivite.test,mairie.test");
    await expect(
      auth.inscrire({ ...nouveau(), email: "quelquun@messagerie.test" }),
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

/**
 * `EX-AUTH-09` — « Consulter **et** modifier son profil : identité, avatar,
 * langue, thème. »
 *
 * Seule la consultation existait. `GET /auth/me` répondait depuis le premier
 * lot, aucune route n'écrivait jamais : le thème ne vivait que dans le
 * stockage local du navigateur — il s'appliquait, mais ne suivait personne
 * d'une machine à l'autre, alors que la colonne l'attendait en base.
 *
 * Trouvé en relisant l'exigence, pas par une boucle : aucune ne vérifiait
 * qu'une exigence à deux verbes ait bien ses deux moitiés.
 */
describe("EX-AUTH-09 — modifier son profil", () => {
  it("enregistre l'identité, la langue et le thème, et les relit", async () => {
    const u = await poserUnCompte();
    const avant = await auth.profil(u.id);
    expect(avant.theme).toBe("auto");

    const apres = await auth.modifierProfil(u.id, {
      prenom: "Camille",
      nom: "Durand-Roche",
      langue: "en",
      theme: "sombre",
      version: 1,
    });

    expect(apres.nom).toBe("Durand-Roche");
    expect(apres.langue).toBe("en");
    expect(apres.theme).toBe("sombre");

    // Relu depuis la base, pas depuis la valeur renvoyée : un service qui
    // rend ce qu'on lui a passé sans écrire passerait le test précédent.
    const relu = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(relu.theme).toBe("sombre");
    expect(relu.langue).toBe("en");
  });

  /**
   * `RG-GEN-07` — **`profil()` doit rendre la version qu'il faudra lui
   * renvoyer.**
   *
   * Elle manquait. `modificationProfilSchema` l'exige, donc aucune requête de
   * modification n'était composable depuis ce que `/auth/me` rendait : la vue
   * 35 a vécu tout le projet en lecture seule, ses deux commandes désactivées
   * derrière un commentaire concluant qu'« il n'existe ni PATCH /auth/me ni
   * équivalent ». La route existait ; c'est ce champ qui manquait, et le
   * diagnostic tiré était le mauvais.
   *
   * Aucune boucle ne pouvait le voir : la lecture était juste, l'écriture
   * était juste, et rien ne vérifiait que la SORTIE DE L'UNE suffise à
   * composer L'ENTRÉE DE L'AUTRE. C'est le contrôle qui l'affirme.
   */
  it("RG-GEN-07 — ce que `profil()` rend suffit à composer une modification", async () => {
    const u = await poserUnCompte();
    const lu = await auth.profil(u.id);

    expect(lu).toHaveProperty("version");
    expect(typeof lu.version).toBe("number");

    // Le schéma du contrat, appliqué à un corps bâti UNIQUEMENT depuis la
    // lecture : c'est la boucle complète, et c'est elle qui était rompue.
    const corps = { prenom: lu.prenom, nom: lu.nom, email: lu.email, version: lu.version };
    expect(() => modificationProfilSchema.parse(corps)).not.toThrow();

    const apres = await auth.modifierProfil(u.id, { ...corps, prenom: "Inès" });
    expect(apres.prenom).toBe("Inès");
  });

  /**
   * `RG-AUTH-09` — **un fichier ne se désigne pas, il se téléverse.**
   *
   * `PATCH /auth/me` acceptait une chaîne libre et l'écrivait telle quelle :
   * l'empreinte de n'importe quelle pièce jointe du magasin commun devenait
   * l'avatar du compte, et `GET /auth/me/avatar` la servait — une lecture de
   * pièce jointe sans `documents:download`. Seul `null` s'écrit désormais.
   */
  it("RG-AUTH-09 — PATCH ne pose JAMAIS un fichier désigné par le client, seul null s'écrit", async () => {
    const u = await poserUnCompte();
    await expect(
      auth.modifierProfil(u.id, { avatarFichier: "a".repeat(64), version: 1 } as never),
    ).rejects.toMatchObject({ code: "avatar_introuvable" });
    const relu = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(relu.avatarFichier).toBeNull();
    expect(relu.version).toBe(1);
    expect(
      modificationProfilSchema.safeParse({ avatarFichier: "a".repeat(64), version: 1 }).success,
    ).toBe(false);
    expect(modificationProfilSchema.safeParse({ avatarFichier: null, version: 1 }).success).toBe(true);
  });

  it("RG-AUTH-09 — refuse un identifiant prédéfini hors catalogue même sans frontière HTTP", async () => {
    const u = await poserUnCompte();
    await expect(
      auth.modifierProfil(u.id, { avatarPredefini: "a-07", version: 1 } as never),
    ).rejects.toMatchObject({ code: "avatar_predefini_invalide" });

    const relu = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(relu.avatarPredefini).toBeNull();
    expect(relu.version).toBe(1);
  });

  it("RG-AUTH-09 — persiste un visuel catalogué et expose sa sélection dans la session", async () => {
    const u = await poserUnCompte();
    const apres = await auth.modifierProfil(u.id, {
      avatarPredefini: "montagne",
      version: 1,
    });

    expect(apres).toMatchObject({
      avatarFichier: null,
      avatarPredefini: "montagne",
      avatarUrl: null,
      version: 2,
    });
    await expect(auth.profil(u.id)).resolves.toMatchObject({
      avatarPredefini: "montagne",
      avatarUrl: null,
    });
    await expect(
      prisma.user.findUniqueOrThrow({ where: { id: u.id } }),
    ).resolves.toMatchObject({ avatarFichier: null, avatarPredefini: "montagne" });
  });

  it("RG-AUTH-09 — choisir un visuel prédéfini remplace le fichier existant", async () => {
    const u = await poserUnCompte();
    await prisma.user.update({
      where: { id: u.id },
      data: { avatarFichier: "empreinte-existante" },
    });

    const apres = await auth.modifierProfil(u.id, {
      avatarPredefini: "vagues",
      version: 1,
    });
    expect(apres).toMatchObject({
      avatarFichier: null,
      avatarPredefini: "vagues",
      avatarUrl: null,
    });
  });

  it("RG-AUTH-09 — avatarFichier: null efface le fichier téléversé, et rien d'autre", async () => {
    const u = await poserUnCompte();
    await prisma.user.update({ where: { id: u.id }, data: { avatarFichier: "b".repeat(64) } });
    const r = await auth.modifierProfil(u.id, { avatarFichier: null, version: 1 });
    expect(r.avatarFichier).toBeNull();
    expect(r.avatarUrl).toBeNull();
    expect(r.avatarPredefini).toBeNull();
  });

  it("RG-GEN-07 — DEUX ÉCRITURES CONCURRENTES ne s'écrasent pas en silence", async () => {
    const u = await poserUnCompte();
    // Deux onglets lisent la version 1.
    await auth.modifierProfil(u.id, { prenom: "Première", version: 1 });
    await expect(
      auth.modifierProfil(u.id, { prenom: "Seconde", version: 1 }),
    ).rejects.toMatchObject({ code: "conflit_de_version" });

    const relu = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(relu.prenom).toBe("Première");
  });

  it("RG-USR-01 — refuse un email déjà pris par quelqu'un d'autre", async () => {
    const a = await poserUnCompte();
    const b = await poserUnCompte();
    await expect(
      auth.modifierProfil(b.id, { email: a.email, motDePasseActuel: MDP, version: 1 }),
    ).rejects.toMatchObject({ code: "email_deja_pris" });
  });

  /**
   * `RG-AUTH-16` — **changer d'adresse exige le mot de passe actuel.**
   *
   * L'adresse est la clé de la réinitialisation. Avec une session volée, on
   * remplaçait l'adresse, on demandait un lien, et le compte changeait de
   * propriétaire sans que son mot de passe ait jamais été connu.
   */
  it("RG-AUTH-16 — changer d'adresse SANS le mot de passe actuel est refusé, l'adresse reste", async () => {
    const u = await poserUnCompte();
    await expect(
      auth.modifierProfil(u.id, { email: "intrus@ailleurs.fr", version: 1 }),
    ).rejects.toMatchObject({ code: "mot_de_passe_actuel_requis" });
    const relu = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(relu.email).toBe(u.email);
    expect(relu.version).toBe(1);
  });

  it("RG-AUTH-16, RG-AUTH-01 — un mot de passe faux est refusé, tracé, et compte jusqu'au verrou", async () => {
    await reglage("auth.tentativesAvantVerrouillage", "2");
    const u = await poserUnCompte();
    await expect(
      auth.modifierProfil(u.id, { email: "intrus@ailleurs.fr", motDePasseActuel: "Faux1234!", version: 1 }),
    ).rejects.toMatchObject({ code: "mot_de_passe_actuel_incorrect" });
    await expect(
      auth.modifierProfil(u.id, { email: "intrus@ailleurs.fr", motDePasseActuel: "Faux1234!", version: 1 }),
    ).rejects.toMatchObject({ code: "compte_verrouille" });
    // Verrouillé : même le bon mot de passe ne change plus l'adresse.
    await expect(
      auth.modifierProfil(u.id, { email: "intrus@ailleurs.fr", motDePasseActuel: MDP, version: 1 }),
    ).rejects.toMatchObject({ code: "compte_verrouille" });

    const relu = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(relu.email).toBe(u.email);
    const actions = (await prisma.auditLog.findMany({ where: { entiteId: u.id } })).map((t) => t.action);
    expect(actions).toContain("user.email_change_failed");
    expect(actions).toContain("auth.login.lockout");
  });

  it("RG-AUTH-16 — avec le bon mot de passe : adresse en minuscules, trace, avis à l'ANCIENNE adresse", async () => {
    const enFile: { file: string; donnees: Record<string, unknown> }[] = [];
    const avecFile = new AuthService(
      prisma as never,
      new AuditService(prisma as never),
      {
        publier: async (file: string, donnees: Record<string, unknown>) => {
          enFile.push({ file, donnees });
          return "travail";
        },
      } as never,
    );
    const u = await poserUnCompte();
    const nouvelle = `Nouvelle.${u.id.slice(0, 8)}@Collectivite.FR`;

    const apres = await avecFile.modifierProfil(u.id, {
      email: nouvelle,
      motDePasseActuel: MDP,
      version: 1,
    });

    expect(apres.email).toBe(nouvelle.toLowerCase());
    // La connexion cherche l'adresse en minuscules : elle la retrouve.
    await expect(auth.connecter(nouvelle, MDP)).resolves.toMatchObject({ userId: u.id });

    const trace = await prisma.auditLog.findFirstOrThrow({
      where: { action: "user.email_changed", entiteId: u.id },
    });
    expect(trace.detail).toMatchObject({ avant: u.email, apres: nouvelle.toLowerCase() });

    expect(enFile).toHaveLength(1);
    expect(enFile[0]!.file).toBe("courriel");
    expect(enFile[0]!.donnees["destinataire"]).toBe(u.email);
    expect(String(enFile[0]!.donnees["corps"])).toContain(nouvelle.toLowerCase());
  });

  it("RG-AUTH-16 — l'avis suit la langue enregistrée du compte", async () => {
    const enFile: Record<string, unknown>[] = [];
    const avecFile = new AuthService(
      prisma as never,
      new AuditService(prisma as never),
      { publier: async (_f: string, d: Record<string, unknown>) => (enFile.push(d), "t") } as never,
    );
    const u = await poserUnCompte();
    await prisma.user.update({ where: { id: u.id }, data: { langue: "en" } });
    await avecFile.modifierProfil(u.id, {
      email: `en.${u.id.slice(0, 8)}@collectivite.fr`,
      motDePasseActuel: MDP,
      version: 1,
    });
    expect(String(enFile[0]!["sujet"])).toBe("Your email address was changed");
  });

  it("RG-AUTH-16, RG-AUTH-03 — la nouvelle adresse respecte la liste blanche des domaines", async () => {
    await reglage("auth.domainesAutorises", "collectivite.fr");
    const u = await poserUnCompte();
    await expect(
      auth.modifierProfil(u.id, { email: "agent@gmail.com", motDePasseActuel: MDP, version: 1 }),
    ).rejects.toMatchObject({ code: "domaine_email_non_autorise" });
    await expect(
      auth.modifierProfil(u.id, { email: `autre.${u.id.slice(0, 8)}@collectivite.fr`, motDePasseActuel: MDP, version: 1 }),
    ).resolves.toBeTruthy();
  });

  it("RG-AUTH-16 — reposer la même adresse, casse comprise, n'exige rien", async () => {
    const u = await poserUnCompte();
    await expect(
      auth.modifierProfil(u.id, { email: u.email.toUpperCase(), prenom: "Inès", version: 1 }),
    ).resolves.toMatchObject({ prenom: "Inès", email: u.email });
  });

  it("NE TOUCHE JAMAIS AU LOGIN NI AU MOT DE PASSE, quoi qu'on lui passe", async () => {
    /*
     * `RG-AUTH-08` — le mot de passe ne se change que par le point d'entrée
     * dédié, avec l'actuel. Un `...champs` diffusé depuis le corps a DÉJÀ
     * laissé passer `login` dans ce service : les champs sont désormais
     * énumérés, et ce test l'exige depuis le service, pas depuis la frontière
     * HTTP — une règle du domaine qui ne vit qu'au contrôleur tombe dès qu'un
     * autre appelant arrive.
     */
    const u = await poserUnCompte();
    const avant = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });

    await auth.modifierProfil(
      u.id,
      { prenom: "Camille", login: "usurpateur", motDePasseHash: "x", actif: false, version: 1 } as never,
    );

    const apres = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(apres.login).toBe(avant.login);
    expect(apres.motDePasseHash).toBe(avant.motDePasseHash);
    expect(apres.actif).toBe(true);
  });
});

describe("EX-AUTH-09 — le profil dit à quelle organisation appartient l'agent", () => {
  /**
   * La vue 35 affiche « Département », « Services » et « Membre depuis » en
   * lecture seule. Ils venaient de nulle part : le profil ne les exposait pas,
   * et la vue les avait simplement omis. Le test porte donc sur ce que le
   * profil doit CONTENIR, pas sur ce qu'il contenait.
   */
  /* Les noms de direction et de département sont uniques en base : chaque
     appel pose les siens, sinon le second test échoue sur une contrainte et
     l'échec ne parle pas de ce qu'on teste. */
  async function rattacher() {
    const c = await poserUnCompte();
    const marque = uuid().slice(0, 8);
    const direction = await prisma.direction.create({
      data: { id: uuid(), nom: `Direction ${marque}` },
    });
    const departement = await prisma.departement.create({
      data: { id: uuid(), nom: `Services numériques ${marque}`, directionId: direction.id },
    });
    // Deux services, posés dans le DÉSORDRE : la sortie doit être ordonnée.
    const si = await prisma.service.create({
      data: { id: uuid(), nom: "Systèmes d'information", departementId: departement.id },
    });
    const ac = await prisma.service.create({
      data: { id: uuid(), nom: "Applications citoyennes", departementId: departement.id },
    });
    await prisma.user.update({
      where: { id: c.id },
      data: {
        departementId: departement.id,
        services: { create: [{ serviceId: si.id }, { serviceId: ac.id }] },
      },
    });
    return { ...c, departement: departement.nom };
  }

  it("rend le département, TOUS les services et la date d'entrée", async () => {
    const c = await rattacher();
    const p = await auth.profil(c.id);
    expect(p.departement).toBe(c.departement);
    // Plusieurs services : la vue les énumère, elle n'en choisit pas un.
    expect(p.services).toEqual(["Applications citoyennes", "Systèmes d'information"]);
    expect(p.membreDepuis).toBeInstanceOf(Date);
  });

  it("un agent sans rattachement rend null et une liste vide, jamais une erreur", async () => {
    const c = await poserUnCompte();
    const p = await auth.profil(c.id);
    expect(p.departement).toBeNull();
    expect(p.services).toEqual([]);
  });

  it("ne rend JAMAIS que le compte demandé : deux agents rattachés différemment", async () => {
    /*
     * Le périmètre de cette lecture est le compte lui-même. Le vérifier exige
     * deux agents : avec un seul, n'importe quelle requête passerait le test.
     */
    const a = await rattacher();
    const b = await poserUnCompte();
    const pa = await auth.profil(a.id);
    const pb = await auth.profil(b.id);
    expect(pa.id).toBe(a.id);
    expect(pb.id).toBe(b.id);
    expect(pb.departement).toBeNull();
    expect(pb.services).toEqual([]);
  });
});


it("EX-AUTH-07 — me distingue première connexion et vrai reset administrateur sans exposer son identité", async () => {
  const c = await poserUnCompte({ motDePasseAChanger: true });
  const administrateur = await poserUnCompte();
  const controller = new AuthController(auth);
  const demande = { userId: c.id, permissions: new Set<string>(), perimetre: {} as never };
  const premiere = await auth.connecter(c.login, MDP);
  expect(premiere.jeton).toBeTruthy();
  expect(await controller.me(demande)).toMatchObject({
    motDePasseAChanger: true, motifChangementMotDePasse: "premiere", motDePasseReinitialiseLe: null,
  });
  const utilisateurs = new UtilisateursService(prisma as never, new AuditService(prisma as never), new PerimetreService(prisma as never));
  await utilisateurs.reinitialiserMotDePasse(c.id, "Provisoire12!", administrateur.id);
  const trace = await prisma.auditLog.findFirstOrThrow({ where: { action: "user.reset_password", entiteId: c.id }, orderBy: { horodatage: "desc" } });
  const reset = await auth.connecter(c.login, "Provisoire12!");
  const me = await controller.me(demande);
  expect(me).toMatchObject({
    motDePasseAChanger: true, motifChangementMotDePasse: "administrateur", motDePasseReinitialiseLe: trace.horodatage.toISOString(),
  });
  expect(JSON.stringify(me)).not.toContain(administrateur.id);
  expect(JSON.stringify(me)).not.toContain("Provisoire12!");
  const session = await auth.resoudreSession(reset.jeton);
  await auth.changerMotDePasse(c.id, "Provisoire12!", "Definitif12!", { conserverSessionId: session!.sessionId });
  expect(await controller.me(demande)).toMatchObject({
    motDePasseAChanger: false, motifChangementMotDePasse: null, motDePasseReinitialiseLe: null,
  });
});
