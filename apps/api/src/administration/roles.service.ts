import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service.js";
import { AuditService } from "../commun/audit.service.js";
import { MODELES_ROLES, PERMISSIONS, DOMAINES, estAuCatalogue } from "@trame/contracts";

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
  | "permission_hors_catalogue"
  | "code_deja_pris"
  | "role_utilise"
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

    for (const modele of MODELES_ROLES) {
      const existe = await this.prisma.role.findUnique({
        where: { code: modele.code },
        select: { id: true, systeme: true },
      });

      if (existe) {
        existants++;
        // Un rôle système reste aligné sur son modèle : c'est ce qui le rend
        // système. Un rôle personnalisé n'est jamais réécrit.
        if (existe.systeme) await this.definirPermissions(existe.id, [...modele.permissions]);
        continue;
      }

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
    }

    await this.audit.tracer({
      action: "role.seed",
      typeEntite: "Role",
      acteurId: acteurId ?? null,
      systeme: !acteurId,
      detail: { crees, existants },
    });
    return { crees, existants };
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
    return role;
  }

  /**
   * `RG-DROITS-02` — les rôles système ne sont ni supprimables ni renommables.
   *
   * « Dans leur structure » (`RG-ADM-02`) : leurs permissions sont fixées par
   * le modèle. Sans cela, un administrateur pourrait vider `ADMIN` de ses
   * permissions et se verrouiller définitivement hors de l'administration.
   */
  async renommer(id: string, nom: string, acteurId: string) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new ErreurRole("introuvable");
    if (role.systeme) throw new ErreurRole("role_systeme_non_renommable");

    await this.prisma.role.update({ where: { id }, data: { nom } });
    await this.audit.tracer({ action: "role.update", typeEntite: "Role", entiteId: id, acteurId });
  }

  /** `EX-ADM-03` — supprimer un rôle non système. */
  async supprimer(id: string, acteurId: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: { _count: { select: { utilisateurs: true } } },
    });
    if (!role) throw new ErreurRole("introuvable");
    if (role.systeme) throw new ErreurRole("role_systeme_non_supprimable");

    // Supprimer un rôle porté par des comptes les laisserait sans permission
    // aucune, en silence. On refuse en chiffrant.
    if (role._count.utilisateurs > 0) {
      throw new ErreurRole("role_utilise", { utilisateurs: role._count.utilisateurs });
    }

    await this.prisma.role.delete({ where: { id } });
    await this.audit.tracer({ action: "role.delete", typeEntite: "Role", entiteId: id, acteurId });
  }

  /**
   * `EX-ADM-04`, `EX-ADM-05` — définir les permissions d'un rôle.
   *
   * `RG-DROITS-03` — toute permission hors catalogue est refusée. Le contrôle
   * est ici et pas seulement dans l'interface : une requête forgée doit
   * échouer comme un formulaire.
   */
  async definirPermissions(roleId: string, permissions: string[], acteurId?: string) {
    const hors = permissions.filter((p) => !estAuCatalogue(p));
    if (hors.length > 0) throw new ErreurRole("permission_hors_catalogue", { permissions: hors });

    const uniques = [...new Set(permissions)];

    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({ where: { roleId } }),
      this.prisma.rolePermission.createMany({
        data: uniques.map((permission) => ({ roleId, permission })),
      }),
      this.prisma.role.update({ where: { id: roleId }, data: { version: { increment: 1 } } }),
    ]);

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
}
