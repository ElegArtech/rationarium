import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { creerClient, type PrismaClient } from "@rationarium/db";
import { CompetencesService } from "./competences.service.js";
import { AuditService } from "../commun/audit.service.js";
import { PerimetreService } from "../commun/perimetre.service.js";

/**
 * `EX-CMP-07` — « Rechercher, filtrer par catégorie et par niveau, trier par
 * nom, couverture ou compétence. »
 *
 * **Elle était à moitié tenue, et la moitié manquante vivait dans la vue.** La
 * recherche et le filtre par catégorie étaient au service ; le filtre par
 * niveau et les tris étaient dans `Competences.tsx`, appliqués aux lignes déjà
 * reçues. Tant que la liste tient entière en mémoire, les deux se ressemblent —
 * à la première pagination, trier la page affichée n'est plus trier, et rien ne
 * l'aurait signalé.
 *
 * S'y ajoutait une **divergence de vocabulaire** : l'exigence disait « trier
 * par nom, COUVERTURE ou compétence », le produit proposait « nom / nombre de
 * compétences / par niveau sur une compétence ». Le tri par couverture — le
 * ratio détenteurs/requis de `RG-CMP-03`, celui qui répond à la question du
 * module — n'existait nulle part. Tranché et porté dans `cadrage/01 § M13` :
 * deux vocabulaires, un par objet trié, parce que le référentiel range des
 * compétences et la matrice range des agents.
 *
 * Ce fichier est neuf : `competences/` n'avait aucun test à son nom.
 */

const RACINE_DB = path.resolve(import.meta.dirname, "../../../../packages/db");
const uuid = () => crypto.randomUUID();

let pg: StartedPostgreSqlContainer;
let prisma: PrismaClient;
let competences: CompetencesService;
let perimetres: PerimetreService;
let acteur: string;

async function agent(nom: string, prenom = "A") {
  const id = uuid();
  await prisma.user.create({
    data: {
      id, login: `u-${id.slice(0, 8)}`, email: `${id.slice(0, 8)}@x.fr`,
      motDePasseHash: "x", prenom, nom,
    },
  });
  return id;
}

/** Une compétence nommée de façon unique, pour ne pas dépendre de l'ordre des tests. */
async function competence(
  nom: string,
  categorie: "technical" | "methodology" | "soft_skill" | "business" = "technical",
  effectifRequis = 1,
) {
  return competences.creer({ nom, categorie, effectifRequis }, acteur);
}

const globalP = () => perimetres.resoudre(acteur, new Set(["users:manage_any"]));

beforeAll(async () => {
  pg = await new PostgreSqlContainer("postgres:18-alpine").start();
  execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    cwd: RACINE_DB,
    env: { ...process.env, DATABASE_URL: pg.getConnectionUri() },
    stdio: "pipe",
  });
  prisma = creerClient(pg.getConnectionUri());
  const audit = new AuditService(prisma as never);
  perimetres = new PerimetreService(prisma as never);
  competences = new CompetencesService(prisma as never, audit, perimetres);

  acteur = await agent("Admin", "Karim");
}, 240_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await pg?.stop();
});

describe("EX-CMP-07 — le référentiel se filtre par NIVEAU, au serveur", () => {
  it("EX-CMP-07 — ne retient que les compétences détenues à ce niveau", async () => {
    const suffixe = uuid().slice(0, 6);
    const experte = await competence(`Cartographie ${suffixe}`);
    const debutante = await competence(`Rédaction ${suffixe}`);
    const orpheline = await competence(`Soudure ${suffixe}`);

    const paul = await agent(`Paul${suffixe}`);
    await competences.definirNiveau(paul, experte.id, "expert", acteur);
    await competences.definirNiveau(paul, debutante.id, "beginner", acteur);

    const filtre = await competences.referentiel({ niveau: "expert", recherche: suffixe });
    const noms = filtre.map((c) => c.id);
    expect(noms).toContain(experte.id);
    expect(noms).not.toContain(debutante.id);
    expect(noms).not.toContain(orpheline.id);
  });

  it("EX-CMP-07 — un détenteur DÉSACTIVÉ ne fait pas passer sa compétence au filtre", async () => {
    /*
     * Une compétence tenue par la seule personne partie n'est pas une
     * compétence détenue. Sans la borne `actif`, le filtre rendrait un
     * référentiel qui décrit un effectif qui n'est plus là.
     */
    const suffixe = uuid().slice(0, 6);
    const c = await competence(`Plomberie ${suffixe}`);
    const parti = await agent(`Parti${suffixe}`);
    await competences.definirNiveau(parti, c.id, "master", acteur);
    await prisma.user.update({ where: { id: parti }, data: { actif: false } });

    const filtre = await competences.referentiel({ niveau: "master", recherche: suffixe });
    expect(filtre.map((x) => x.id)).not.toContain(c.id);
  });

  it("EX-CMP-07 — sans filtre de niveau, tout le référentiel ressort", async () => {
    /*
     * Le cas nominal, sans lequel un filtre toujours actif passerait les deux
     * tests précédents.
     */
    const suffixe = uuid().slice(0, 6);
    const a = await competence(`Alpha ${suffixe}`);
    const b = await competence(`Beta ${suffixe}`);

    const tout = await competences.referentiel({ recherche: suffixe });
    expect(tout.map((c) => c.id)).toEqual(expect.arrayContaining([a.id, b.id]));
  });
});

describe("EX-CMP-07 — le référentiel se trie par COUVERTURE, au serveur", () => {
  it("EX-CMP-07 — le tri par couverture met le MOINS couvert en premier", async () => {
    /*
     * Le tri qui manquait entièrement, cadrage compris. La couverture est le
     * RATIO détenteurs/requis (`RG-CMP-03`) : 0/1 et 0/10 manquent de 1 et de
     * 10, et c'est pourtant le premier qui est le plus près d'être couvert.
     * Un tri sur le manque brut inverserait ces deux-là — d'où le jeu choisi.
     */
    const suffixe = uuid().slice(0, 6);
    const pleine = await competence(`Pleine ${suffixe}`, "technical", 2);
    const moitie = await competence(`Moitié ${suffixe}`, "technical", 2);
    const vide = await competence(`Vide ${suffixe}`, "technical", 2);

    const un = await agent(`Un${suffixe}`);
    const deux = await agent(`Deux${suffixe}`);
    await competences.definirNiveau(un, pleine.id, "expert", acteur);
    await competences.definirNiveau(deux, pleine.id, "expert", acteur);
    await competences.definirNiveau(un, moitie.id, "beginner", acteur);

    const trie = await competences.referentiel({ recherche: suffixe, tri: "couverture" });
    expect(trie.map((c) => c.id)).toEqual([vide.id, moitie.id, pleine.id]);
  });

  it("EX-CMP-07 — le tri par NOM ignore la catégorie, contrairement à l'ordre par défaut", async () => {
    /*
     * L'ordre par défaut groupe par catégorie puis par nom. Le tri « nom » doit
     * donc produire un ordre DIFFÉRENT dès que deux catégories se mêlent —
     * sinon il ne trie rien et le test ne prouve rien.
     */
    const suffixe = uuid().slice(0, 6);
    const aTechnique = await competence(`AAA ${suffixe}`, "technical");
    const bMethodologie = await competence(`BBB ${suffixe}`, "methodology");
    const cTechnique = await competence(`CCC ${suffixe}`, "technical");

    const defaut = await competences.referentiel({ recherche: suffixe });
    const parNom = await competences.referentiel({ recherche: suffixe, tri: "nom" });

    expect(parNom.map((c) => c.id)).toEqual([aTechnique.id, bMethodologie.id, cTechnique.id]);
    /*
     * Et l'ordre par défaut n'est PAS le même. L'enum Prisma s'ordonne dans
     * l'ordre de sa déclaration — `technical` avant `methodology` — donc les
     * deux techniques passent devant BBB. Sans cette différence, le test
     * passerait avec et sans le tri, et ne prouverait rien.
     */
    expect(defaut.map((c) => c.id)).toEqual([aTechnique.id, cTechnique.id, bMethodologie.id]);
  });
});

describe("EX-CMP-07 — la matrice se filtre et se trie, au serveur", () => {
  it("EX-CMP-07 — la RECHERCHE d'agent est appliquée par le service, pas par la vue", async () => {
    const suffixe = uuid().slice(0, 6);
    const c = await competence(`Matriciel ${suffixe}`);
    const vu = await agent(`Zorro${suffixe}`);
    const autre = await agent(`Autre${suffixe}`);
    await competences.definirNiveau(vu, c.id, "expert", acteur);
    await competences.definirNiveau(autre, c.id, "beginner", acteur);

    const m = await competences.matrice(await globalP(), { recherche: `Zorro${suffixe}` });
    const ids = m.lignes.map((l) => l.agent.id);
    expect(ids).toContain(vu);
    expect(ids).not.toContain(autre);
  });

  it("EX-CMP-07 — le filtre par NIVEAU ne garde que les agents qui l'atteignent", async () => {
    const suffixe = uuid().slice(0, 6);
    const c = await competence(`Niveau ${suffixe}`);
    const maitre = await agent(`Maitre${suffixe}`);
    const novice = await agent(`Novice${suffixe}`);
    await competences.definirNiveau(maitre, c.id, "master", acteur);
    await competences.definirNiveau(novice, c.id, "beginner", acteur);

    const m = await competences.matrice(await globalP(), {
      niveau: "master",
      recherche: suffixe,
    });
    const ids = m.lignes.map((l) => l.agent.id);
    expect(ids).toContain(maitre);
    expect(ids).not.toContain(novice);
  });

  it("EX-CMP-07 — le tri par NOMBRE de compétences ordonne toutes les lignes retenues", async () => {
    const suffixe = uuid().slice(0, 6);
    const a = await competence(`Tri A ${suffixe}`);
    const b = await competence(`Tri B ${suffixe}`);
    const c = await competence(`Tri C ${suffixe}`);

    const riche = await agent(`Riche${suffixe}`);
    const moyen = await agent(`Moyen${suffixe}`);
    const pauvre = await agent(`Pauvre${suffixe}`);
    for (const s of [a, b, c]) await competences.definirNiveau(riche, s.id, "expert", acteur);
    for (const s of [a, b]) await competences.definirNiveau(moyen, s.id, "expert", acteur);
    await competences.definirNiveau(pauvre, a.id, "expert", acteur);

    const m = await competences.matrice(await globalP(), {
      recherche: suffixe,
      tri: "nombre",
    });
    expect(m.lignes.map((l) => l.agent.id)).toEqual([riche, moyen, pauvre]);
  });

  it("EX-CMP-07 — le tri par COMPÉTENCE ordonne par NIVEAU sur celle qui est nommée", async () => {
    /*
     * Le tri que le cadrage appelait « par compétence » sans dire selon quoi.
     * La réponse est : selon le niveau détenu sur la compétence choisie — et
     * la compétence choisie doit être celle qu'on nomme, pas la première venue.
     * Le jeu le vérifie : l'ordre alphabétique et l'ordre par niveau sont
     * inverses l'un de l'autre.
     */
    const suffixe = uuid().slice(0, 6);
    const visee = await competence(`Visée ${suffixe}`);
    const leurre = await competence(`Autre ${suffixe}`);

    const fort = await agent(`Zulu${suffixe}`);
    const faible = await agent(`Alpha${suffixe}`);
    await competences.definirNiveau(fort, visee.id, "master", acteur);
    await competences.definirNiveau(faible, visee.id, "beginner", acteur);
    // Sur le leurre, l'inverse : trier sur la mauvaise colonne se verrait.
    await competences.definirNiveau(fort, leurre.id, "beginner", acteur);
    await competences.definirNiveau(faible, leurre.id, "master", acteur);

    const m = await competences.matrice(await globalP(), {
      recherche: suffixe,
      tri: "competence",
      competenceId: visee.id,
    });
    expect(m.lignes.map((l) => l.agent.id)).toEqual([fort, faible]);

    // Et sur l'autre colonne, l'ordre s'inverse : c'est bien la compétence
    // NOMMÉE qui décide, pas un ordre figé.
    const surLeurre = await competences.matrice(await globalP(), {
      recherche: suffixe,
      tri: "competence",
      competenceId: leurre.id,
    });
    expect(surLeurre.lignes.map((l) => l.agent.id)).toEqual([faible, fort]);
  });

  it("EX-CMP-07 — sans tri demandé, la matrice reste dans l'ordre alphabétique", async () => {
    const suffixe = uuid().slice(0, 6);
    const c = await competence(`Ordre ${suffixe}`);
    const zulu = await agent(`Zulu${suffixe}`);
    const alpha = await agent(`Alpha${suffixe}`);
    await competences.definirNiveau(zulu, c.id, "expert", acteur);
    await competences.definirNiveau(alpha, c.id, "beginner", acteur);

    const m = await competences.matrice(await globalP(), { recherche: suffixe });
    expect(m.lignes.map((l) => l.agent.id)).toEqual([alpha, zulu]);
  });

  it("EX-CMP-07 — le filtre de la matrice ne CONTOURNE pas le périmètre", async () => {
    /*
     * Permission puis périmètre : chercher nommément quelqu'un hors périmètre
     * ne doit pas le faire apparaître. Un filtre appliqué à la place du
     * périmètre plutôt qu'en plus de lui serait une élévation d'accès.
     */
    const suffixe = uuid().slice(0, 6);
    const c = await competence(`Cloison ${suffixe}`);
    const dehors = await agent(`Dehors${suffixe}`);
    await competences.definirNiveau(dehors, c.id, "expert", acteur);

    const borne = await agent(`Borne${suffixe}`);
    const p = await perimetres.resoudre(borne, new Set());

    const m = await competences.matrice(p, { recherche: `Dehors${suffixe}` });
    expect(m.lignes.map((l) => l.agent.id)).not.toContain(dehors);
  });
});
