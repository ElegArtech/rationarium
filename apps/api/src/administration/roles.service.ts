import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service.js";
import { AuditService } from "../commun/audit.service.js";
import { MODELES_ROLES, PERMISSIONS, DOMAINES, estAuCatalogue } from "@rationarium/contracts";

/**
 * Rôles et permissions — M20, `cadrage/01 § M20`, vue 32.
 *
 * `RG-DROITS-01` — un modèle de rôle est un **point de départ**, pas une
 * contrainte : un administrateur compose un rôle sur mesure en cochant les
 * permissions dans une matrice. Les 26 modèles servent donc à l'amorçage et à
 * la duplication, jamais à borner ce qui est possible.
 */

export type EchecRole =
  | "role_systeme_non_supprimable"
  | "role_systeme_non_renommable"
  | "role_systeme_non_modifiable"
  | "permission_hors_catalogue"
  | "code_deja_pris"
  | "role_utilise"
  | "conflit_de_version"
  | "introuvable";

export class ErreurRole extends Error {
  constructor(
    readonly code: EchecRole,
    readonly detail?: Record<string, unknown>,
  ) {
    super(code);
  }
}

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * `EX-ADM-06` — initialise le référentiel de permissions et de rôles.
   *
   * Idempotent : le rejouer ne duplique rien et ne perd aucune personnalisation
   * sur les rôles non systèmes. Une initialisation qui casserait à la seconde
   * exécution serait inutilisable en exploitation.
   */
  async initialiserReferentiel(acteurId?: string) {
    let crees = 0;
    let existants = 0;
    const collisions: { code: string; roleId: string }[] = [];

    for (const modele of MODELES_ROLES) {
      const existe = await this.prisma.role.findUnique({
        where: { code: modele.code },
        select: { id: true, systeme: true, nom: true, description: true },
      });

      if (existe) {
        // Un rôle système reste aligné sur son modèle : c'est ce qui le rend
        // système. Un rôle personnalisé qui porte par hasard le code réservé
        // n'est PAS un modèle existant : on le signale sans le réécrire et on
        // poursuit l'initialisation des autres modèles.
        const correspondAuModele =
          existe.nom === modele.nom && existe.description === (modele.description ?? null);
        if (!existe.systeme && !correspondAuModele) {
          collisions.push({ code: modele.code, roleId: existe.id });
          continue;
        }
        existants++;
        if (existe.systeme) await this.alignerPermissionsSysteme(existe.id, [...modele.permissions]);
        continue;
      }

      try {
        const role = await this.prisma.role.create({
          data: {
            code: modele.code,
            nom: modele.nom,
            description: modele.description,
            systeme: modele.systeme,
          },
        });
        await this.definirPermissions(role.id, [...modele.permissions]);
        crees++;
      } catch (erreur) {
        if (codePrisma(erreur) !== "P2002") throw erreur;
        // Une seconde initialisation a pu créer le rôle entre la lecture et
        // l'écriture. On relit pour distinguer ce rejeu concurrent d'une
        // collision avec un rôle personnalisé.
        const concurrent = await this.prisma.role.findUniqueOrThrow({
          where: { code: modele.code },
          select: { id: true, systeme: true, nom: true, description: true },
        });
        const correspondAuModele =
          concurrent.nom === modele.nom && concurrent.description === (modele.description ?? null);
        if (concurrent.systeme || correspondAuModele) {
          existants++;
          if (concurrent.systeme) {
            await this.alignerPermissionsSysteme(concurrent.id, [...modele.permissions]);
          }
        } else {
          collisions.push({ code: modele.code, roleId: concurrent.id });
        }
      }
    }

    await this.audit.tracer({
      action: "role.seed",
      typeEntite: "Role",
      acteurId: acteurId ?? null,
      systeme: !acteurId,
      detail: { crees, existants, collisions },
    });
    return { crees, existants, collisions };
  }

  /** `EX-ADM-01` — lister les rôles avec leur nombre de permissions. */
  async lister() {
    const roles = await this.prisma.role.findMany({
      orderBy: [{ systeme: "desc" }, { nom: "asc" }],
      include: {
        _count: { select: { permissions: true, utilisateurs: true } },
      },
    });
    return roles.map((r) => ({
      id: r.id,
      code: r.code,
      nom: r.nom,
      description: r.description,
      systeme: r.systeme,
      version: r.version,
      nombrePermissions: r._count.permissions,
      nombreUtilisateurs: r._count.utilisateurs,
    }));
  }

  /**
   * `EX-ADM-04` — la matrice modules × actions de la vue 32.
   *
   * Rendue **complète**, y compris les cases vides : une matrice qui n'afficherait
   * que les permissions détenues ne permettrait pas d'en cocher de nouvelles.
   * C'est le catalogue qui donne les colonnes, pas le rôle.
   */
  async matrice(roleId: string) {
    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
      include: { permissions: { select: { permission: true } } },
    });
    if (!role) throw new ErreurRole("introuvable");

    const detenues = new Set(role.permissions.map((p) => p.permission));
    const actions = [...new Set(PERMISSIONS.map((p) => p.split(":")[1]!))].sort();

    return {
      role: { id: role.id, code: role.code, nom: role.nom, systeme: role.systeme, version: role.version },
      actions,
      lignes: DOMAINES.map((domaine) => ({
        domaine,
        cases: actions.map((action) => {
          const permission = `${domaine}:${action}`;
          return {
            action,
            permission,
            /** `null` = la permission n'existe pas pour ce domaine : case inerte. */
            detenue: estAuCatalogue(permission) ? detenues.has(permission) : null,
          };
        }),
      })),
    };
  }

  /** `EX-ADM-02` — créer un rôle, éventuellement à partir d'un modèle. */
  async creer(
    donnees: { code: string; nom: string; description?: string; depuisModele?: string },
    acteurId: string,
  ) {
    if (await this.prisma.role.findUnique({ where: { code: donnees.code }, select: { id: true } })) {
      throw new ErreurRole("code_deja_pris");
    }

    const modele = donnees.depuisModele
      ? MODELES_ROLES.find((m) => m.code === donnees.depuisModele)
      : undefined;

    const role = await this.prisma.role.create({
      data: {
        code: donnees.code,
        nom: donnees.nom,
        description: donnees.description ?? modele?.description ?? null,
        // Un rôle créé par un administrateur n'est JAMAIS système, même dupliqué
        // depuis un modèle système : sinon on pourrait fabriquer un rôle
        // indélébile par simple duplication.
        systeme: false,
      },
    });

    if (modele) await this.definirPermissions(role.id, [...modele.permissions]);

    await this.audit.tracer({
      action: "role.create", typeEntite: "Role", entiteId: role.id, acteurId,
      detail: { code: donnees.code, depuisModele: donnees.depuisModele ?? null },
    });
    return modele
      ? this.prisma.role.findUniqueOrThrow({ where: { id: role.id } })
      : role;
  }

  /**
   * `RG-DROITS-02` — les rôles système ne sont ni supprimables ni renommables.
   *
   * « Dans leur structure » (`RG-ADM-02`) : leurs permissions sont fixées par
   * le modèle. Sans cela, un administrateur pourrait vider `ADMIN` de ses
   * permissions et se verrouiller définitivement hors de l'administration.
   */
  async renommer(id: string, nom: string, acteurId: string, version: number) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new ErreurRole("introuvable");
    if (role.systeme) throw new ErreurRole("role_systeme_non_renommable");
    if (role.version !== version) throw new ErreurRole("conflit_de_version");

    try {
      await this.prisma.role.update({
        where: { id, version },
        data: { nom, version: { increment: 1 } },
      });
    } catch (erreur) {
      if (codePrisma(erreur) === "P2025") throw new ErreurRole("conflit_de_version");
      throw erreur;
    }
    await this.audit.tracer({ action: "role.update", typeEntite: "Role", entiteId: id, acteurId });
  }

  /** `EX-ADM-03` — supprimer un rôle non système. */
  async supprimer(id: string, acteurId: string, version: number) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: { _count: { select: { utilisateurs: true } } },
    });
    if (!role) throw new ErreurRole("introuvable");
    if (role.systeme) throw new ErreurRole("role_systeme_non_supprimable");
    if (role.version !== version) throw new ErreurRole("conflit_de_version");

    // Supprimer un rôle porté par des comptes les laisserait sans permission
    // aucune, en silence. On refuse en chiffrant.
    if (role._count.utilisateurs > 0) {
      throw new ErreurRole("role_utilise", { utilisateurs: role._count.utilisateurs });
    }

    try {
      await this.prisma.role.delete({ where: { id, version } });
    } catch (erreur) {
      if (codePrisma(erreur) === "P2025") throw new ErreurRole("conflit_de_version");
      throw erreur;
    }
    await this.audit.tracer({ action: "role.delete", typeEntite: "Role", entiteId: id, acteurId });
  }

  /**
   * `EX-ADM-04`, `EX-ADM-05` — définir les permissions d'un rôle.
   *
   * `RG-DROITS-03` — toute permission hors catalogue est refusée. Le contrôle
   * est ici et pas seulement dans l'interface : une requête forgée doit
   * échouer comme un formulaire.
   *
   * `RG-ADM-02` — **les rôles système ne sont pas modifiables dans leur
   * structure**, et ce refus-ci manquait. Le raisonnement était pourtant écrit,
   * douze lignes plus haut, sur `renommer` : « sans cela, un administrateur
   * pourrait vider `ADMIN` de ses permissions et se verrouiller définitivement
   * hors de l'administration ». `Roles.tsx` désactivait bien le bouton — mais un
   * client qui désactive n'est qu'une courtoisie (`RG-GEN-06`), jamais un
   * contrôle. Une requête forgée sur `PUT /administration/roles/:id/permissions`
   * vidait `ADMIN`, et personne ne pouvait le restaurer puisque restaurer exige
   * `users:manage_permissions`, qui vit dans `ADMIN`.
   *
   * `acteurId` est le discriminant, et il existait déjà : l'alignement du
   * référentiel (`initialiserReferentiel`) appelle sans acteur, la route HTTP
   * appelle avec. Un rôle système se réaligne donc toujours sur son modèle, et
   * ne se modifie jamais à la demande.
   */
  async definirPermissions(roleId: string, permissions: string[], acteurId?: string, version?: number) {
    const hors = permissions.filter((p) => !estAuCatalogue(p));
    if (hors.length > 0) throw new ErreurRole("permission_hors_catalogue", { permissions: hors });

    const uniques = [...new Set(permissions)];
    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
      select: { systeme: true, version: true },
    });
    if (!role) throw new ErreurRole("introuvable");
    if (acteurId && role.systeme) throw new ErreurRole("role_systeme_non_modifiable");
    if (acteurId && version === undefined) throw new ErreurRole("conflit_de_version");
    const attendue = version ?? role.version;
    if (role.version !== attendue) throw new ErreurRole("conflit_de_version");

    try {
      await this.prisma.$transaction(async (tx) => {
        // L'incrément est la première écriture : deux matrices parties de la
        // même version ne peuvent jamais chacune remplacer les permissions.
        await tx.role.update({
          where: { id: roleId, version: attendue },
          data: { version: { increment: 1 } },
        });
        await tx.rolePermission.deleteMany({ where: { roleId } });
        await tx.rolePermission.createMany({
          data: uniques.map((permission) => ({ roleId, permission })),
        });
      });
    } catch (erreur) {
      if (codePrisma(erreur) === "P2025") throw new ErreurRole("conflit_de_version");
      throw erreur;
    }

    if (acteurId) {
      await this.audit.tracer({
        action: "role.set_permissions",
        typeEntite: "Role",
        entiteId: roleId,
        acteurId,
        detail: { nombre: uniques.length },
      });
    }
  }

  /** Réaligne seulement si le modèle diffère, afin qu'un rejeu soit idempotent jusque dans sa version. */
  private async alignerPermissionsSysteme(roleId: string, permissions: string[]) {
    const [role, actuelles] = await Promise.all([
      this.prisma.role.findUniqueOrThrow({ where: { id: roleId }, select: { version: true } }),
      this.prisma.rolePermission.findMany({ where: { roleId }, select: { permission: true } }),
    ]);
    const attendues = [...new Set(permissions)].sort();
    const presentes = actuelles.map((p) => p.permission).sort();
    if (attendues.length === presentes.length && attendues.every((p, i) => p === presentes[i])) return;
    await this.definirPermissions(roleId, attendues, undefined, role.version);
  }
}

const codePrisma = (erreur: unknown): string | undefined =>
  typeof erreur === "object" && erreur !== null && "code" in erreur
    ? String((erreur as { code?: unknown }).code)
    : undefined;
