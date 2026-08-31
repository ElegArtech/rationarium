import { Injectable } from "@nestjs/common";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import {
  CATEGORIES_COMPETENCE,
  DEMI_JOURNEES,
  type CategorieCompetence,
  type DemiJournee,
} from "@rationarium/contracts";
import { PrismaService } from "../prisma.service.js";
import { AuditService } from "../commun/audit.service.js";
import { CongesService, ErreurConge } from "../conges/conges.service.js";
import type { Perimetre } from "../commun/perimetre.service.js";

/**
 * M21 — imports et exports.
 *
 * **`RG-IMP-03` — tout import passe par une prévisualisation.** C'est la règle
 * qui structure ce service : chaque type d'import a une fonction `analyser`
 * qui ne touche à rien, et une fonction `executer` qui prend le même fichier.
 * L'utilisateur voit ce qui va se passer avant que cela se passe — sur un
 * import en masse, c'est la différence entre une correction et une restauration.
 *
 * **`RG-IMP-04` — trois familles, jamais deux.** Importés, ignorés (doublons),
 * en erreur. Fondre les doublons dans les erreurs ferait paniquer sur un
 * fichier rejoué ; les fondre dans les importés ferait croire à un import
 * complet. Chaque erreur porte **son numéro de ligne** : « 3 erreurs » sans
 * dire lesquelles oblige à relire tout le fichier.
 */

export type EchecImport = "colonnes_manquantes" | "fichier_illisible" | "remplacement_impossible";

export class ErreurImport extends Error {
  constructor(
    readonly code: EchecImport,
    readonly detail?: Record<string, unknown>,
  ) {
    super(code);
  }
}

/** Le compte rendu de `RG-IMP-04`, identique pour tous les types. */
export type CompteRendu = {
  importes: number;
  ignores: number;
  erreurs: { ligne: number; message: string }[];
};

export type Apercu<T> = {
  lignes: T[];
  total: number;
  /** Les erreurs détectées **sans rien écrire** — c'est tout l'intérêt. */
  erreurs: { ligne: number; message: string }[];
};

/** Les six types d'import de `cadrage/01 § M21`. La liste est fermée. */
export const TYPES_IMPORT = [
  "utilisateurs",
  "taches",
  "jalons",
  "projet",
  "conges",
  "competences",
] as const;

export type TypeImport = (typeof TYPES_IMPORT)[number];

/** Les colonnes de chaque type ; l'astérisque marque l'obligatoire. */
const COLONNES: Record<TypeImport, { nom: string; obligatoire: boolean }[]> = {
  utilisateurs: [
    { nom: "email", obligatoire: true },
    { nom: "login", obligatoire: true },
    { nom: "password", obligatoire: true },
    { nom: "firstName", obligatoire: true },
    { nom: "lastName", obligatoire: true },
    { nom: "role", obligatoire: false },
    { nom: "departmentName", obligatoire: false },
    { nom: "serviceNames", obligatoire: false },
  ],
  taches: [
    { nom: "title", obligatoire: true },
    { nom: "description", obligatoire: false },
    { nom: "status", obligatoire: false },
    { nom: "priority", obligatoire: false },
    { nom: "assigneeEmail", obligatoire: false },
    { nom: "milestoneName", obligatoire: false },
    { nom: "estimatedHours", obligatoire: false },
    { nom: "startDate", obligatoire: false },
    { nom: "endDate", obligatoire: false },
  ],
  jalons: [
    { nom: "name", obligatoire: true },
    { nom: "description", obligatoire: false },
    { nom: "dueDate", obligatoire: true },
  ],
  projet: [
    { nom: "rowType", obligatoire: true },
    { nom: "name", obligatoire: false },
    { nom: "dueDate", obligatoire: false },
    { nom: "title", obligatoire: false },
    { nom: "description", obligatoire: false },
    { nom: "status", obligatoire: false },
    { nom: "priority", obligatoire: false },
    { nom: "assigneeEmail", obligatoire: false },
    { nom: "milestoneName", obligatoire: false },
    { nom: "estimatedHours", obligatoire: false },
    { nom: "startDate", obligatoire: false },
    { nom: "endDate", obligatoire: false },
    { nom: "subtasks", obligatoire: false },
  ],
  conges: [
    { nom: "userEmail", obligatoire: true },
    { nom: "leaveTypeName", obligatoire: true },
    { nom: "startDate", obligatoire: true },
    { nom: "endDate", obligatoire: true },
    { nom: "halfDay", obligatoire: false },
    { nom: "comment", obligatoire: false },
  ],
  competences: [
    { nom: "name", obligatoire: true },
    { nom: "category", obligatoire: true },
    { nom: "description", obligatoire: false },
    { nom: "requiredCount", obligatoire: false },
  ],
};

/**
 * `RG-IMP-01` — virgule **et** point-virgule.
 *
 * Un tableur français exporte en point-virgule par défaut, parce que la
 * virgule y est le séparateur décimal. Refuser ce fichier reviendrait à
 * refuser le format que produisent les postes de l'organisation.
 */
export function detecterSeparateur(contenu: string): "," | ";" {
  const premiere = contenu.split(/\r?\n/, 1)[0] ?? "";
  const virgules = (premiere.match(/,/g) ?? []).length;
  const pointsVirgules = (premiere.match(/;/g) ?? []).length;
  return pointsVirgules > virgules ? ";" : ",";
}

const NON_VIDE = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";

const dateDe = (valeur: string | undefined): Date | null => {
  if (!NON_VIDE(valeur)) return null;
  const d = new Date(`${valeur.trim().slice(0, 10)}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
};


/**
 * La catégorie d'une compétence, lue depuis un CSV — **le code fait foi**.
 *
 * Le format n'était pas arrêté et les deux bouts se contredisaient : le modèle
 * proposait « Technique » (libellé français) quand `exporterCompetences`
 * écrivait `technical` (code du vocabulaire). **Un export n'était donc pas
 * réimportable**, ce que le commentaire de `exporterTaches` promet pourtant
 * pour tous les exports du module.
 *
 * L'arbitrage : le CSV porte le **code** de `CATEGORIES_COMPETENCE`. C'est la
 * seule valeur stable — elle ne dépend ni de la langue de l'agent ni de la
 * casse de son tableur —, c'est celle que la base stocke, et c'est elle qui
 * fait de l'export un aller-retour. Le modèle a été corrigé en conséquence.
 *
 * Les libellés français et anglais restent **acceptés en lecture** : une
 * personne qui remplit un tableau à la main écrit « Savoir-être », pas
 * `soft_skill`, et refuser son fichier au nom d'une valeur qu'elle n'a jamais
 * vue serait une rigueur sans destinataire. Tolérant en entrée, strict en
 * sortie.
 */
function categorieDe(valeur: string): CategorieCompetence | null {
  const brut = valeur.trim().toLowerCase();
  const terme = CATEGORIES_COMPETENCE.find(
    (c) => c.code === brut || c.fr.toLowerCase() === brut || c.en.toLowerCase() === brut,
  );
  return terme?.code ?? null;
}

/** Les codes acceptés, énumérés dans le message d'erreur : deviner coûte plus cher. */
const CODES_CATEGORIE = CATEGORIES_COMPETENCE.map((c) => c.code).join(", ");

/**
 * La demi-journée d'une ligne de congé — `RG-CNG-17`, `RG-CNG-18`.
 *
 * Le fichier n'a qu'une colonne `halfDay` là où le modèle en porte deux
 * (début et fin) : un CSV plat ne peut pas exprimer « matin le premier jour,
 * après-midi le dernier ». C'est cohérent avec `RG-CNG-18`, qui réserve la
 * demi-journée simple au congé d'**une seule journée**.
 */
function demiJourneeDe(valeur: string): DemiJournee | null {
  const brut = valeur.trim().toLowerCase();
  const terme = DEMI_JOURNEES.find(
    (d) => d.code === brut || d.fr.toLowerCase() === brut || d.en.toLowerCase() === brut,
  );
  return terme?.code ?? null;
}

const CODES_DEMI_JOURNEE = DEMI_JOURNEES.map((d) => d.code).join(", ");

/**
 * La contrainte d'exclusion GiST `leaves_pas_de_chevauchement`, vue depuis le
 * client Prisma.
 *
 * Le contrôle applicatif de `refuserChevauchement` couvre le cas nominal ; la
 * contrainte en base couvre la concurrence, et c'est elle qui parle quand deux
 * imports se croisent. **`RG-CNG-32` veut le chevauchement en ignoré**, quelle
 * que soit la moitié du dispositif qui l'a vu : les deux chemins mènent donc
 * au même compteur.
 */
const CHEVAUCHEMENT_EN_BASE = /leaves_pas_de_chevauchement|23P01|exclusion constraint/i;

const estUnChevauchement = (e: unknown): boolean =>
  (e instanceof ErreurConge && e.code === "chevauchement") ||
  CHEVAUCHEMENT_EN_BASE.test(String((e as { message?: string })?.message ?? e));

@Injectable()
export class ImportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly conges: CongesService,
  ) {}

  /**
   * `RG-IMP-02` — le modèle téléchargeable.
   *
   * Il porte **une ligne d'exemple**, pas seulement les en-têtes : un fichier
   * vide laisse deviner le format des dates et des listes, et c'est là que se
   * perdent les imports.
   */
  modele(type: TypeImport): string {
    const colonnes = COLONNES[type];
    const exemples: Record<TypeImport, Record<string, string>> = {
      utilisateurs: {
        email: "camille.roussel@exemple.fr", login: "camille.roussel",
        password: "MotDePasse!2026", firstName: "Camille", lastName: "Roussel",
        role: "AGENT", departmentName: "Direction des services numériques",
        serviceNames: "Études et développement;Exploitation",
      },
      taches: {
        title: "Rédiger la note de cadrage", description: "",
        status: "todo", priority: "normal", assigneeEmail: "camille.roussel@exemple.fr",
        milestoneName: "Lancement", estimatedHours: "8",
        startDate: "2026-09-01", endDate: "2026-09-15",
      },
      jalons: { name: "Lancement", description: "", dueDate: "2026-09-30" },
      projet: {
        rowType: "MILESTONE", name: "Lancement", dueDate: "2026-09-30",
        title: "", description: "", status: "", priority: "", assigneeEmail: "",
        milestoneName: "", estimatedHours: "", startDate: "", endDate: "", subtasks: "",
      },
      conges: {
        userEmail: "camille.roussel@exemple.fr", leaveTypeName: "Congés annuels",
        startDate: "2026-08-10", endDate: "2026-08-14", halfDay: "", comment: "",
      },
      competences: {
        // Le CODE du vocabulaire, pas son libellé. Voir `categorieDe` : c'est
        // ce que l'export écrit, donc la seule valeur qui fasse du modèle et
        // de l'export un aller-retour.
        name: "PostgreSQL", category: "technical", description: "", requiredCount: "2",
      },
    };

    return stringify([exemples[type]], {
      header: true,
      columns: colonnes.map((c) => c.nom),
      // Point-virgule : c'est ce qu'attend un tableur français, et le modèle
      // sert d'abord à être rouvert dans un tableur.
      delimiter: ";",
      bom: true,
    });
  }

  /**
   * Lit un fichier et rend ses lignes, **sans rien écrire**.
   *
   * Les colonnes obligatoires absentes font échouer l'analyse entière : un
   * fichier sans la colonne `email` n'est pas « 40 lignes en erreur », c'est
   * un mauvais fichier, et le dire ainsi évite de chercher ligne par ligne.
   */
  analyser(type: TypeImport, contenu: string): Apercu<Record<string, string>> {
    let lignes: Record<string, string>[];
    try {
      lignes = parse(contenu, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        bom: true,
        delimiter: detecterSeparateur(contenu),
      }) as Record<string, string>[];
    } catch (e) {
      throw new ErreurImport("fichier_illisible", { detail: String(e) });
    }

    /*
     * Les en-têtes se lisent sur la PREMIÈRE LIGNE du fichier, pas sur le
     * premier enregistrement. Un fichier valide mais sans donnée — un export
     * de projet vide, par exemple — n'a aucun enregistrement : déduire les
     * colonnes de `lignes[0]` déclarait alors toutes les colonnes manquantes,
     * et un fichier correct était rejeté comme illisible.
     */
    const separateur = detecterSeparateur(contenu);
    const premiereLigne = contenu.replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0] ?? "";
    const entetes = new Set(
      premiereLigne.split(separateur).map((c) => c.trim().replace(/^"|"$/g, "")),
    );
    const manquantes = COLONNES[type]
      .filter((c) => c.obligatoire && !entetes.has(c.nom))
      .map((c) => c.nom);
    if (manquantes.length > 0) {
      throw new ErreurImport("colonnes_manquantes", { colonnes: manquantes });
    }

    const erreurs: { ligne: number; message: string }[] = [];
    lignes.forEach((ligne, i) => {
      for (const colonne of COLONNES[type]) {
        if (colonne.obligatoire && !NON_VIDE(ligne[colonne.nom])) {
          // Le numéro de ligne est celui du FICHIER : en-tête comprise, base 1.
          // C'est le seul repère que l'utilisateur puisse retrouver.
          erreurs.push({ ligne: i + 2, message: `colonne « ${colonne.nom} » vide` });
        }
      }
    });

    return { lignes, total: lignes.length, erreurs };
  }

  // ── Utilisateurs ─────────────────────────────────────────────────────────

  /**
   * `RG-IMP-04` — importe, en distinguant les trois familles.
   *
   * Un compte déjà présent est **ignoré**, pas mis en erreur : rejouer un
   * fichier est un usage normal, pas un incident.
   */
  async importerUtilisateurs(contenu: string, acteurId: string): Promise<CompteRendu> {
    const apercu = this.analyser("utilisateurs", contenu);
    const rendu: CompteRendu = { importes: 0, ignores: 0, erreurs: [...apercu.erreurs] };
    const enErreur = new Set(apercu.erreurs.map((e) => e.ligne));

    for (const [i, ligne] of apercu.lignes.entries()) {
      const numero = i + 2;
      if (enErreur.has(numero)) continue;

      const email = ligne["email"]!.trim().toLowerCase();
      const login = ligne["login"]!.trim();

      const existant = await this.prisma.user.findFirst({
        where: { OR: [{ email }, { login }] },
        select: { id: true },
      });
      if (existant) {
        rendu.ignores += 1;
        continue;
      }

      try {
        const role = NON_VIDE(ligne["role"])
          ? await this.prisma.role.findUnique({
              where: { code: ligne["role"].trim() },
              select: { id: true },
            })
          : null;
        const departement = NON_VIDE(ligne["departmentName"])
          ? await this.prisma.departement.findFirst({
              where: { nom: ligne["departmentName"].trim() },
              select: { id: true },
            })
          : null;

        const services = NON_VIDE(ligne["serviceNames"])
          ? await this.prisma.service.findMany({
              where: { nom: { in: ligne["serviceNames"].split(";").map((s) => s.trim()) } },
              select: { id: true },
            })
          : [];

        await this.prisma.user.create({
          data: {
            email,
            login,
            // Le mot de passe du fichier est un mot de passe **provisoire** :
            // le compte est créé avec l'obligation de le changer.
            motDePasseHash: ligne["password"]!,
            motDePasseAChanger: true,
            prenom: ligne["firstName"]!.trim(),
            nom: ligne["lastName"]!.trim(),
            ...(role ? { roleId: role.id } : {}),
            ...(departement ? { departementId: departement.id } : {}),
            ...(services.length
              ? { services: { create: services.map((s) => ({ serviceId: s.id })) } }
              : {}),
          },
        });
        rendu.importes += 1;
      } catch (e) {
        rendu.erreurs.push({ ligne: numero, message: String(e).slice(0, 200) });
      }
    }

    await this.audit.tracer({
      action: "user.create", typeEntite: "User", entiteId: "import-csv", acteurId,
      detail: { source: "csv", ...rendu, erreurs: rendu.erreurs.length },
    });
    return rendu;
  }

  // ── Projet complet — `RG-IMP-05`, `RG-IMP-06` ────────────────────────────

  /**
   * `RG-IMP-05` — **l'ordre des lignes est indifférent.**
   *
   * Les jalons sont créés avant les tâches, quelle que soit leur place dans le
   * fichier, et une tâche peut référencer un jalon d'une ligne postérieure.
   * Exiger un ordre reviendrait à demander à l'utilisateur de comprendre notre
   * ordre d'insertion — ce qui n'est pas son travail.
   *
   * `RG-IMP-06` — **le mode Remplacer est tout-ou-rien.** Une seule ligne en
   * erreur annule l'ensemble et ne supprime rien. C'est la règle la plus
   * dangereuse du module : elle ne se voit qu'au moment où elle manque, et il
   * est alors trop tard.
   */
  async importerProjet(
    projectId: string,
    contenu: string,
    mode: "ajouter" | "remplacer",
    acteurId: string,
  ): Promise<CompteRendu> {
    const apercu = this.analyser("projet", contenu);

    // `RG-IMP-06` — le contrôle est fait AVANT toute écriture. Découvrir
    // l'erreur après la suppression serait exactement ce que la règle interdit.
    if (mode === "remplacer" && apercu.erreurs.length > 0) {
      return { importes: 0, ignores: 0, erreurs: apercu.erreurs };
    }

    const jalonsDuFichier = apercu.lignes.filter(
      (l) => (l["rowType"] ?? "").trim().toUpperCase() === "MILESTONE",
    );
    const tachesDuFichier = apercu.lignes.filter(
      (l) => (l["rowType"] ?? "").trim().toUpperCase() === "TASK",
    );

    const rendu: CompteRendu = { importes: 0, ignores: 0, erreurs: [...apercu.erreurs] };

    await this.prisma.$transaction(async (tx) => {
      if (mode === "remplacer") {
        // L'ordre compte : les sous-tâches partent avec leurs tâches par
        // cascade, mais les jalons doivent survivre à la suppression des
        // tâches qui les référencent — d'où le détachement préalable.
        await tx.task.updateMany({ where: { projectId }, data: { milestoneId: null } });
        await tx.task.deleteMany({ where: { projectId } });
        await tx.milestone.deleteMany({ where: { projectId } });
      }

      // 1. Les jalons d'abord, quelle que soit leur place dans le fichier.
      const parNom = new Map<string, string>();
      for (const existant of await tx.milestone.findMany({
        where: { projectId },
        select: { id: true, nom: true },
      })) {
        parNom.set(existant.nom, existant.id);
      }

      for (const ligne of jalonsDuFichier) {
        const nom = (ligne["name"] ?? "").trim();
        if (!nom) continue;
        if (parNom.has(nom)) {
          rendu.ignores += 1;
          continue;
        }
        const jalon = await tx.milestone.create({
          data: {
            nom,
            description: NON_VIDE(ligne["description"]) ? ligne["description"].trim() : null,
            dateEcheance: dateDe(ligne["dueDate"]),
            projectId,
          },
        });
        parNom.set(nom, jalon.id);
        rendu.importes += 1;
      }

      // 2. Les tâches ensuite — elles retrouvent leur jalon par son nom, qu'il
      //    vienne du fichier ou de la base.
      for (const ligne of tachesDuFichier) {
        const titre = (ligne["title"] ?? "").trim();
        if (!titre) continue;

        const assigne = NON_VIDE(ligne["assigneeEmail"])
          ? await tx.user.findUnique({
              where: { email: ligne["assigneeEmail"].trim().toLowerCase() },
              select: { id: true },
            })
          : null;

        const milestoneId = NON_VIDE(ligne["milestoneName"])
          ? (parNom.get(ligne["milestoneName"].trim()) ?? null)
          : null;

        const tache = await tx.task.create({
          data: {
            titre,
            description: NON_VIDE(ligne["description"]) ? ligne["description"].trim() : null,
            projectId,
            milestoneId,
            statut: (NON_VIDE(ligne["status"]) ? ligne["status"].trim() : "todo") as never,
            priorite: (NON_VIDE(ligne["priority"]) ? ligne["priority"].trim() : "normal") as never,
            dateDebut: dateDe(ligne["startDate"]),
            dateFin: dateDe(ligne["endDate"]),
            estimationHeures: NON_VIDE(ligne["estimatedHours"])
              ? Number(ligne["estimatedHours"])
              : null,
            ...(assigne ? { assignes: { create: [{ userId: assigne.id, porteur: true }] } } : {}),
          },
        });

        // Les sous-tâches voyagent dans une colonne, séparées par des
        // points-virgules : un fichier plat n'a pas d'autre moyen de porter
        // une liste, et les éclater en lignes obligerait à les rattacher.
        if (NON_VIDE(ligne["subtasks"])) {
          const libelles = ligne["subtasks"].split(";").map((s) => s.trim()).filter(Boolean);
          await tx.subtask.createMany({
            data: libelles.map((libelle, ordre) => ({ taskId: tache.id, libelle, ordre })),
          });
        }
        rendu.importes += 1;
      }
    });

    await this.audit.tracer({
      action: "task.create", typeEntite: "Project", entiteId: projectId, acteurId,
      detail: { source: "csv", mode, ...rendu, erreurs: rendu.erreurs.length },
    });
    return rendu;
  }

  /**
   * Ce que le mode Remplacer va supprimer — **avant** de le supprimer.
   *
   * Le brief impose les volumes dans la confirmation : « {n} jalon(s),
   * {n} tâche(s) et {n} sous-tâche(s) seront supprimés ». Un « êtes-vous
   * sûr ? » sans chiffres ne permet pas de décider.
   */
  async volumesRemplacement(projectId: string) {
    const [jalons, taches, sousTaches] = await Promise.all([
      this.prisma.milestone.count({ where: { projectId } }),
      this.prisma.task.count({ where: { projectId } }),
      this.prisma.subtask.count({ where: { task: { projectId } } }),
    ]);
    return { jalons, taches, sousTaches };
  }

  // ── Exports CSV ──────────────────────────────────────────────────────────

  /** `EX-IMP` — les tâches d'un projet, en CSV réimportable. */
  async exporterTaches(projectId: string): Promise<string> {
    const taches = await this.prisma.task.findMany({
      where: { projectId },
      orderBy: { creeLe: "asc" },
      select: {
        titre: true, description: true, statut: true, priorite: true,
        estimationHeures: true, dateDebut: true, dateFin: true,
        milestone: { select: { nom: true } },
        assignes: { select: { user: { select: { email: true } } }, take: 1 },
      },
    });

    // Les colonnes sont celles de l'IMPORT : un export qui ne se réimporte pas
    // n'est pas de la réversibilité, c'est une capture d'écran en texte.
    return stringify(
      taches.map((t) => ({
        title: t.titre,
        description: t.description ?? "",
        status: t.statut,
        priority: t.priorite,
        assigneeEmail: t.assignes[0]?.user.email ?? "",
        milestoneName: t.milestone?.nom ?? "",
        estimatedHours: t.estimationHeures ? String(t.estimationHeures) : "",
        startDate: t.dateDebut ? t.dateDebut.toISOString().slice(0, 10) : "",
        endDate: t.dateFin ? t.dateFin.toISOString().slice(0, 10) : "",
      })),
      { header: true, columns: COLONNES.taches.map((c) => c.nom), delimiter: ";", bom: true },
    );
  }

  /** Les jalons d'un projet, en CSV réimportable. */
  async exporterJalons(projectId: string): Promise<string> {
    const jalons = await this.prisma.milestone.findMany({
      where: { projectId },
      orderBy: { dateEcheance: "asc" },
      select: { nom: true, description: true, dateEcheance: true },
    });

    return stringify(
      jalons.map((j) => ({
        name: j.nom,
        description: j.description ?? "",
        dueDate: j.dateEcheance ? j.dateEcheance.toISOString().slice(0, 10) : "",
      })),
      { header: true, columns: COLONNES.jalons.map((c) => c.nom), delimiter: ";", bom: true },
    );
  }

  /** La matrice de compétences, en CSV. */
  async exporterCompetences(): Promise<string> {
    const competences = await this.prisma.skill.findMany({
      orderBy: [{ categorie: "asc" }, { nom: "asc" }],
      select: { nom: true, categorie: true, description: true, effectifRequis: true },
    });

    return stringify(
      competences.map((c) => ({
        name: c.nom,
        category: c.categorie,
        description: c.description ?? "",
        requiredCount: String(c.effectifRequis),
      })),
      { header: true, columns: COLONNES.competences.map((c) => c.nom), delimiter: ";", bom: true },
    );
  }

  // ── Compétences — EX-CMP-09 ──────────────────────────────────────────────

  /**
   * `EX-CMP-09` — le référentiel de compétences, importé depuis un CSV.
   *
   * `RG-CMP-05` — **les noms sont uniques**, et un nom déjà pris est
   * **ignoré**, pas mis en erreur : rejouer le référentiel d'une direction
   * après y avoir ajouté trois lignes est l'usage normal, pas un incident
   * (`RG-IMP-04`). L'unicité est doublée en base par `Skill.nom @unique` :
   * le contrôle applicatif rédige le compte rendu, la contrainte tient la
   * concurrence — d'où le rattrapage du `P2002` ci-dessous, qui range le
   * doublon né d'une course dans le même compteur que celui né d'un rejeu.
   *
   * **Ligne à ligne, jamais en transaction globale.** Une seule catégorie mal
   * orthographiée sur deux cents lignes ferait échouer les deux cents, et
   * l'agent n'aurait aucun moyen de savoir laquelle.
   *
   * Le périmètre ne s'applique pas ici, et c'est une propriété du référentiel,
   * pas un oubli : une compétence n'appartient à aucun département. La garde
   * exige `skills:import` ; il n'y a rien à cloisonner en dessous.
   */
  async importerCompetences(contenu: string, acteurId: string): Promise<CompteRendu> {
    const apercu = this.analyser("competences", contenu);
    const rendu: CompteRendu = { importes: 0, ignores: 0, erreurs: [...apercu.erreurs] };
    const enErreur = new Set(apercu.erreurs.map((e) => e.ligne));

    for (const [i, ligne] of apercu.lignes.entries()) {
      // Le numéro est celui du FICHIER, en-tête comprise : le seul repère que
      // l'utilisateur puisse retrouver dans son tableur.
      const numero = i + 2;
      if (enErreur.has(numero)) continue;
      const enPanne = (message: string) => rendu.erreurs.push({ ligne: numero, message });

      const nom = ligne["name"]!.trim();

      const categorie = categorieDe(ligne["category"]!);
      if (categorie === null) {
        enPanne(
          `catégorie « ${ligne["category"]!.trim()} » inconnue. ` +
            `Valeurs attendues : ${CODES_CATEGORIE}.`,
        );
        continue;
      }

      /*
       * `Number("")` vaut zéro : le filtre porte sur la CHAÎNE, pas sur sa
       * conversion. Sans `NON_VIDE`, une colonne laissée vide poserait un
       * effectif requis de 0 — donc une compétence qu'aucun écart ne
       * signalera jamais (`RG-CMP-02`), en silence.
       */
      let effectifRequis = 1;
      if (NON_VIDE(ligne["requiredCount"])) {
        const n = Number(ligne["requiredCount"].trim());
        if (!Number.isInteger(n) || n < 0) {
          enPanne(
            `effectif requis « ${ligne["requiredCount"].trim()} » invalide : ` +
              `un nombre entier positif ou nul est attendu.`,
          );
          continue;
        }
        effectifRequis = n;
      }

      // `RG-CMP-05` — le nom déjà pris est ignoré, pas mis en erreur.
      const existante = await this.prisma.skill.findUnique({
        where: { nom },
        select: { id: true },
      });
      if (existante) {
        rendu.ignores += 1;
        continue;
      }

      try {
        await this.prisma.skill.create({
          data: {
            nom,
            categorie,
            description: NON_VIDE(ligne["description"]) ? ligne["description"].trim() : null,
            effectifRequis,
          },
        });
        rendu.importes += 1;
      } catch (e) {
        // `P2002` — l'unicité en base a parlé la première : deux imports
        // concurrents, ou deux graphies du même nom. C'est un doublon, donc
        // un ignoré, pas une erreur.
        if (/P2002|Unique constraint/i.test(String(e))) {
          rendu.ignores += 1;
          continue;
        }
        enPanne(String(e).slice(0, 200));
      }
    }

    await this.audit.tracer({
      action: "skill.create", typeEntite: "Skill", entiteId: "import-csv", acteurId,
      detail: { source: "csv", ...rendu, erreurs: rendu.erreurs.length },
    });
    return rendu;
  }

  // ── Congés — EX-CNG-14, RG-CNG-32 ────────────────────────────────────────

  /**
   * `EX-CNG-14` — les congés, importés en masse depuis un CSV.
   *
   * ══════════════════════════════════════════════════════════════════════════
   * **Trois décisions qui ne se devinent pas, et qui gouvernent cette
   * fonction.**
   *
   * **1. Ligne à ligne, jamais en une transaction.** `leaves_pas_de_chevauchement`
   * est une contrainte d'EXCLUSION GiST : dans une transaction unique, une
   * seule ligne chevauchante ferait échouer les deux cents autres — et
   * `RG-CNG-32` veut précisément le chevauchement en **ignoré**. Le
   * tout-ou-rien de `RG-IMP-06` est réservé au mode Remplacer de l'import
   * projet ; il n'a pas cours ici.
   *
   * **2. Le dépôt passe par `CongesService.deposer`, sans le réécrire.** Le
   * décompte en jours ouvrés (`RG-CNG-16`), la demi-journée (`RG-CNG-17`), la
   * répartition par année (`RG-CNG-19`), le contrôle de solde (`RG-CNG-21`),
   * le refus de chevauchement (`RG-CNG-25` à `27`), la détermination du
   * validateur (`RG-CNG-08`) et l'approbation directe (`RG-CNG-13`,
   * `RG-CNG-14`) y sont déjà, avec leurs tests. Les redire ici en produirait
   * une seconde version, qui divergerait au premier amendement — et
   * l'expérience du dépôt dit que deux lectures d'une même donnée finissent
   * toujours par se contredire sans qu'aucune boucle ne le voie.
   *
   * **Conséquence tenue, pas subie : un import est « pour autrui », donc
   * directement approuvé** (`RG-CNG-14`), avec l'importateur pour validateur
   * de fait. Un fichier RH de deux cents congés qui produirait deux cents
   * demandes en attente noierait le validateur et n'aurait aucun sens : ce
   * qu'on importe est un état constaté, pas une intention.
   *
   * L'exception, et elle est **volontaire** : la ligne qui désigne
   * l'importateur lui-même n'est pas « pour autrui », et suit donc le régime
   * ordinaire — en attente si son type exige une validation. Approuver cette
   * ligne-là ferait de l'import un contournement de `RG-CNG-09`, qui interdit
   * d'approuver sa propre demande sans permission explicite. Une route d'import
   * ne doit pas offrir ce qu'une route de validation refuse.
   *
   * **3. Le solde est CONTRÔLÉ, il n'est pas contourné.** `RG-CNG-21` ne
   * prévoit aucune dispense pour l'import, et `RG-CNG-32` n'énumère que deux
   * cas d'ignoré — doublon et chevauchement. Une ligne au-delà du disponible
   * part donc en **erreur**, avec le message chiffré de la règle : année,
   * jours demandés, jours disponibles, jours manquants. Passer outre écrirait
   * des soldes négatifs que rien, ensuite, ne signale — et le compte rendu
   * annoncerait « 200 importés » sur un référentiel devenu faux.
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Le **périmètre** s'applique après la permission, comme partout : un agent
   * hors du périmètre de l'importateur est refusé ligne à ligne. Sans cela,
   * `leaves:import` deviendrait une écriture globale déguisée.
   */
  async importerConges(
    contenu: string,
    acteurId: string,
    perimetre: Perimetre,
  ): Promise<CompteRendu> {
    const apercu = this.analyser("conges", contenu);
    const rendu: CompteRendu = { importes: 0, ignores: 0, erreurs: [...apercu.erreurs] };
    const enErreur = new Set(apercu.erreurs.map((e) => e.ligne));

    /*
     * Le référentiel des types est chargé UNE FOIS. La colonne s'appelle
     * `leaveTypeName`, donc le nom d'abord ; le code ensuite, parce qu'un
     * fichier venu d'un autre outil RH porte plus souvent « CA » que
     * « Congés annuels ».
     */
    const types = await this.prisma.leaveType.findMany({
      select: { id: true, nom: true, code: true },
    });
    const parNom = new Map(types.map((t) => [t.nom.trim().toLowerCase(), t]));
    const parCode = new Map(types.map((t) => [t.code.trim().toLowerCase(), t]));

    for (const [i, ligne] of apercu.lignes.entries()) {
      const numero = i + 2;
      if (enErreur.has(numero)) continue;
      const enPanne = (message: string) => rendu.erreurs.push({ ligne: numero, message });

      const email = ligne["userEmail"]!.trim().toLowerCase();
      const agent = await this.prisma.user.findUnique({
        where: { email },
        select: { id: true, actif: true },
      });
      if (!agent) {
        enPanne(`aucun compte ne porte l'adresse « ${email} ».`);
        continue;
      }
      // `RG-CNG-15` — un collaborateur inactif est refusé, ici comme au dépôt.
      if (!agent.actif) {
        enPanne(`le compte « ${email} » est désactivé : aucun congé ne peut lui être ajouté.`);
        continue;
      }
      // Le périmètre, APRÈS la permission — `cadrage/03 § 5.4`.
      if (!perimetre.global && !perimetre.utilisateurs.has(agent.id)) {
        enPanne(`le compte « ${email} » est hors de votre périmètre.`);
        continue;
      }

      const nomType = ligne["leaveTypeName"]!.trim();
      const type = parNom.get(nomType.toLowerCase()) ?? parCode.get(nomType.toLowerCase());
      if (!type) {
        enPanne(`aucun type de congé ne s'appelle « ${nomType} ».`);
        continue;
      }

      const debut = dateDe(ligne["startDate"]);
      const fin = dateDe(ligne["endDate"]);
      if (!debut || !fin) {
        enPanne(
          `date illisible : « ${ligne["startDate"] ?? ""} » → « ${ligne["endDate"] ?? ""} ». ` +
            `Le format attendu est AAAA-MM-JJ.`,
        );
        continue;
      }
      // `RG-CNG-28` — la date de fin est postérieure ou égale à la date de début.
      if (fin < debut) {
        enPanne(
          `la date de fin (${ligne["endDate"]}) précède la date de début ` +
            `(${ligne["startDate"]}) : inversez-les.`,
        );
        continue;
      }

      let demi: DemiJournee | null = null;
      if (NON_VIDE(ligne["halfDay"])) {
        demi = demiJourneeDe(ligne["halfDay"]);
        if (demi === null) {
          enPanne(
            `demi-journée « ${ligne["halfDay"].trim()} » inconnue. ` +
              `Valeurs attendues : ${CODES_DEMI_JOURNEE}, ou la colonne laissée vide.`,
          );
          continue;
        }
        // `RG-CNG-18` — la demi-journée simple ne vaut que sur un seul jour.
        if (debut.getTime() !== fin.getTime()) {
          enPanne(
            "une demi-journée ne s'applique qu'à un congé d'une seule journée : " +
              "laissez la colonne vide, ou ramenez les deux dates au même jour.",
          );
          continue;
        }
      }

      try {
        await this.conges.deposer(
          {
            userId: agent.id,
            typeId: type.id,
            dateDebut: debut,
            dateFin: fin,
            demiJourneeDebut: demi,
            demiJourneeFin: demi,
            ...(NON_VIDE(ligne["comment"]) ? { motif: ligne["comment"].trim() } : {}),
          },
          acteurId,
        );
        rendu.importes += 1;
      } catch (e) {
        /*
         * `RG-CNG-32` — doublon ET chevauchement sont des IGNORÉS. Un doublon
         * exact est d'ailleurs un chevauchement parfait : les deux passent par
         * le même refus, applicatif ou en base, et par le même compteur.
         */
        if (estUnChevauchement(e)) {
          rendu.ignores += 1;
          continue;
        }
        if (e instanceof ErreurConge && e.code === "solde_insuffisant") {
          // `RG-CNG-21` — le message est CHIFFRÉ. « Solde insuffisant » tout
          // court oblige à aller chercher ailleurs de quoi corriger la ligne.
          const d = e.detail ?? {};
          enPanne(
            `solde insuffisant pour ${String(d["annee"])} : ${String(d["demandes"])} jour(s) ` +
              `demandé(s), ${String(d["disponibles"])} disponible(s), ` +
              `${String(d["manquants"])} manquant(s).`,
          );
          continue;
        }
        if (e instanceof ErreurConge && e.code === "type_inactif") {
          // `RG-CNG-29` — un type désactivé n'est plus sélectionnable.
          enPanne(
            `le type de congé « ${type.nom} » est désactivé : réactivez-le, ` +
              `ou choisissez un autre type sur cette ligne.`,
          );
          continue;
        }
        enPanne(String(e).slice(0, 200));
      }
    }

    await this.audit.tracer({
      action: "leave.create", typeEntite: "Leave", entiteId: "import-csv", acteurId,
      detail: { source: "csv", ...rendu, erreurs: rendu.erreurs.length },
    });
    return rendu;
  }
}
