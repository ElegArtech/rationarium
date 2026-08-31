import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from "@nestjs/common";
import { z } from "zod";
import { PERMISSIONS, MODELES_ROLES } from "@rationarium/contracts";
import { RolesService } from "./roles.service.js";
import { AuditQueryService } from "./audit.query.service.js";
import { Demande, RequiertPermission, type ContexteDemande } from "../commun/permissions.garde.js";
import { valider, dateSchema } from "../commun/http.js";

/** M20 — rôles, matrice de permissions, journal d'audit. Vues 32 et 33. */

@Controller("administration")
export class AdministrationController {
  constructor(
    private readonly roles: RolesService,
    private readonly audit: AuditQueryService,
  ) {}

  // ── Rôles et permissions — vue 32 ────────────────────────────────────────

  @Get("roles")
  @RequiertPermission("users:manage_roles")
  listerRoles() {
    return this.roles.lister();
  }

  /**
   * Le catalogue des permissions et les modèles de rôles.
   *
   * La vue 32 dessine une matrice : sans le catalogue, le client ne saurait
   * pas quelles colonnes afficher. Il vient du serveur et non d'une constante
   * recopiée côté client — une seule définition, dans `@rationarium/contracts`.
   */
  @Get("catalogue")
  @RequiertPermission("users:manage_permissions")
  catalogue() {
    return {
      permissions: PERMISSIONS,
      modeles: MODELES_ROLES.map((m) => ({ code: m.code, nom: m.nom })),
    };
  }

  @Get("roles/:id/matrice")
  @RequiertPermission("users:manage_permissions")
  matrice(@Param("id") id: string) {
    return this.roles.matrice(id);
  }

  @Post("roles")
  @RequiertPermission("users:manage_roles")
  creerRole(@Body() corps: unknown, @Demande() d: ContexteDemande) {
    const donnees = valider(
      z.object({
        code: z.string().min(2).max(40).regex(/^[A-Z_]+$/),
        nom: z.string().min(1).max(80),
        description: z.string().max(2000).optional(),
        depuisModele: z.string().optional(),
      }),
      corps,
    );
    return this.roles.creer(donnees, d.userId);
  }

  @Patch("roles/:id")
  @RequiertPermission("users:manage_roles")
  renommer(@Param("id") id: string, @Body() corps: unknown, @Demande() d: ContexteDemande) {
    const { nom } = valider(z.object({ nom: z.string().min(1).max(80) }), corps);
    return this.roles.renommer(id, nom, d.userId);
  }

  @Delete("roles/:id")
  @RequiertPermission("users:manage_roles")
  supprimerRole(@Param("id") id: string, @Demande() d: ContexteDemande) {
    return this.roles.supprimer(id, d.userId);
  }

  /**
   * Les permissions d'un rôle, **remplacées en bloc**.
   *
   * Un `PUT` et non une suite d'ajouts et de retraits : la vue 32 édite une
   * matrice entière et l'enregistre d'un geste. Une écriture incrémentale
   * exposerait un état intermédiaire où le rôle aurait perdu ses permissions
   * sans avoir encore reçu les nouvelles.
   */
  @Put("roles/:id/permissions")
  @RequiertPermission("users:manage_permissions")
  definirPermissions(
    @Param("id") id: string,
    @Body() corps: unknown,
    @Demande() d: ContexteDemande,
  ) {
    const { permissions } = valider(
      z.object({ permissions: z.array(z.string()).max(400) }),
      corps,
    );
    return this.roles.definirPermissions(id, permissions, d.userId);
  }

  // ── Journal d'audit — vue 33 ─────────────────────────────────────────────

  /**
   * `RG-ADM-03` — la consultation du journal exige `audit:read`, et l'accès
   * refusé est lui-même tracé. C'est la garde qui s'en charge, sur le chemin
   * d'échec.
   *
   * La pagination est **par curseur**, pas par décalage : sur une table
   * partitionnée qui grossit en continu, un `OFFSET` profond coûte cher et
   * fait sauter des lignes quand de nouvelles s'insèrent pendant la lecture.
   */
  @Get("audit")
  @RequiertPermission("audit:read")
  journal(@Query() requete: unknown) {
    const q = valider(
      z.object({
        acteurId: z.uuid().optional(),
        action: z.string().max(80).optional(),
        typeEntite: z.string().max(80).optional(),
        entiteId: z.string().max(80).optional(),
        depuis: dateSchema.optional(),
        jusqua: dateSchema.optional(),
        curseurHorodatage: dateSchema.optional(),
        curseurId: z.uuid().optional(),
        taille: z.coerce.number().int().min(1).max(200).optional(),
      }),
      requete,
    );
    const { curseurHorodatage, curseurId, taille, ...filtres } = q;
    return this.audit.consulter(filtres, {
      ...(curseurHorodatage && curseurId
        ? { curseur: { horodatage: curseurHorodatage, id: curseurId } }
        : {}),
      ...(taille ? { taille } : {}),
    });
  }

  /** Les valeurs distinctes qui alimentent les filtres de la vue 33. */
  @Get("audit/facettes")
  @RequiertPermission("audit:read")
  facettes() {
    return this.audit.facettes();
  }
}
