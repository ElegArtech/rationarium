import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { PrismaClient, creerClient } from "@rationarium/db";
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

describe("EX-AUTH-06, RG-AUTH-04 — définir un nouveau mot de passe depuis le lien reçu ; le jeton est à usage unique et il expire", () => {
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

describe("EX-AUTH-04, RG-AUTH-03 — créer un compte en autonomie, activable et désactivable", () => {
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

  it("RG-AUTH-09 — REFUSE un avatar à la fois fichier ET prédéfini", async () => {
    const u = await poserUnCompte();
    await expect(
      auth.modifierProfil(u.id, {
        avatarFichier: "photo.webp",
        avatarPredefini: "a-07",
        version: 1,
      }),
    ).rejects.toMatchObject({ code: "avatar_ambigu" });
  });

  it("RG-AUTH-09 — refuse aussi quand l'AMBIGUÏTÉ NAÎT DE L'ÉTAT DÉJÀ EN BASE", async () => {
    /*
     * Le cas que le schéma seul ne peut pas voir : le corps ne porte qu'UN
     * avatar, donc il est valide ; c'est l'état résultant qui en compte deux.
     * Sans ce contrôle dans le service, deux requêtes licites successives
     * fabriquaient l'état que la règle interdit.
     */
    const u = await poserUnCompte();
    await auth.modifierProfil(u.id, { avatarPredefini: "a-07", version: 1 });
    await expect(
      auth.modifierProfil(u.id, { avatarFichier: "photo.webp", version: 2 }),
    ).rejects.toMatchObject({ code: "avatar_ambigu" });
  });

  it("RG-AUTH-09 — accepte de remplacer un avatar par l'autre en une requête", async () => {
    const u = await poserUnCompte();
    await auth.modifierProfil(u.id, { avatarPredefini: "a-07", version: 1 });
    const r = await auth.modifierProfil(u.id, {
      avatarPredefini: null,
      avatarFichier: "photo.webp",
      version: 2,
    });
    expect(r.avatarFichier).toBe("photo.webp");
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
      auth.modifierProfil(b.id, { email: a.email, version: 1 }),
    ).rejects.toMatchObject({ code: "email_deja_pris" });
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
