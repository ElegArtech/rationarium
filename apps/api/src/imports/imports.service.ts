import { Injectable } from "@nestjs/common";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import { PrismaService } from "../prisma.service.js";
import { AuditService } from "../commun/audit.service.js";

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

@Injectable()
export class ImportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
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
        name: "PostgreSQL", category: "Technique", description: "", requiredCount: "2",
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
}
