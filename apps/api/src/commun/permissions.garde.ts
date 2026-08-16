import {
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  createParamDecorator,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { FastifyRequest } from "fastify";
import { estAuCatalogue } from "@trame/contracts";
import { PrismaService } from "../prisma.service.js";
import { AuditService } from "./audit.service.js";
import { AuthService } from "../auth/auth.service.js";
import { PerimetreService, type Perimetre } from "./perimetre.service.js";

/**
 * Garde de permission — `RG-DROITS-03`, `cadrage/03 § 5.4`.
 *
 * **L'ordre est imposé et il ne se négocie pas : permission d'abord, périmètre
 * ensuite.** Une garde qui vérifierait le périmètre sans la permission
 * laisserait un agent lire ce qu'il n'a pas le droit de lire, mais dans son
 * service. Une garde qui vérifierait la permission sans le périmètre
 * laisserait un manager lire toute l'instance.
 *
 * Liste blanche stricte : toute permission absente est refusée.
 *
 * `RG-ADM-03` — **l'accès refusé est lui-même tracé.** C'est pourquoi l'audit
 * est appelé ici, sur le chemin d'échec, et pas seulement sur le chemin
 * nominal.
 */

export const CLE_PERMISSION = "trame:permission";

/** Déclare la permission requise par un point d'entrée. */
export const RequiertPermission = (permission: string) => {
  // Un point d'entrée qui exigerait une permission inexistante serait
  // inaccessible à tous, en silence. On échoue au démarrage plutôt qu'à
  // l'exécution.
  if (!estAuCatalogue(permission)) {
    throw new Error(
      `Permission hors catalogue : « ${permission} ». Voir packages/contracts/src/permissions.ts.`,
    );
  }
  return SetMetadata(CLE_PERMISSION, permission);
};

/** Marque un point d'entrée comme ouvert — l'exception, jamais la règle. */
export const CLE_PUBLIC = "trame:public";
export const Public = () => SetMetadata(CLE_PUBLIC, true);

/**
 * Marque un point d'entrée comme **strictement personnel** : il exige une
 * session, mais aucune permission.
 *
 * Le cas existe et il est étroit : une donnée qui n'appartient qu'à son auteur
 * et que personne d'autre ne lit jamais. Les to-do de `RG-DSH-01` en sont le
 * seul exemple à ce jour — le cadrage les dit « strictement privées », et les
 * vingt-quatre domaines de permissions de `cadrage/01 § 3.2` n'en comportent
 * pas pour elles. Inventer un domaine hors catalogue serait pire.
 *
 * Ce n'est **pas** `@Public()`, qui signifie « avant la session ». La garde se
 * comporte déjà ainsi pour une route sans permission ; ce marqueur ne change
 * rien à l'exécution — il rend l'intention **déclarée**, donc vérifiable par
 * `surface-http.test.ts`, qui refuse toute route nue.
 *
 * Le contrôle réel est ailleurs, et il est le seul qui compte : chaque requête
 * est bornée à `d.userId`. Une permission n'y ajouterait rien.
 */
export const CLE_PERSONNEL = "trame:personnel";
export const Personnel = () => SetMetadata(CLE_PERSONNEL, true);

export type ContexteDemande = {
  userId: string;
  permissions: ReadonlySet<string>;
  perimetre: Perimetre;
};

/** Récupère le contexte résolu par la garde. */
export const Demande = createParamDecorator(
  (_donnee: unknown, ctx: ExecutionContext): ContexteDemande =>
    ctx.switchToHttp().getRequest<FastifyRequest & { trame: ContexteDemande }>().trame,
);

@Injectable()
export class GardePermission implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly perimetres: PerimetreService,
    private readonly audit: AuditService,
  ) {}

  async canActivate(contexte: ExecutionContext): Promise<boolean> {
    const cibles = [contexte.getHandler(), contexte.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(CLE_PUBLIC, cibles)) return true;

    const requete = contexte.switchToHttp().getRequest<
      FastifyRequest & { trame?: ContexteDemande }
    >();

    // 1. La session.
    const jeton = requete.cookies?.["trame_session"];
    const session = jeton ? await this.auth.resoudreSession(jeton) : null;
    if (!session) throw new UnauthorizedException({ cle: "auth:erreurs.sessionRequise" });

    // 2. Les permissions, résolues côté serveur à chaque requête. Jamais
    //    lues depuis le client — ADR-0008.
    const permissions = await this.permissionsDe(session.userId);

    // 3. La permission exigée. Liste blanche stricte.
    const requise = this.reflector.getAllAndOverride<string>(CLE_PERMISSION, cibles);
    if (requise && !permissions.has(requise)) {
      // RG-ADM-03 — l'accès refusé est tracé, y compris sur le journal d'audit
      // lui-même. D'où l'appel ici, sur le chemin d'échec.
      await this.audit.tracer({
        action: "access.denied",
        typeEntite: "Endpoint",
        entiteId: `${requete.method} ${requete.url}`,
        acteurId: session.userId,
        detail: { permission: requise },
      });
      throw new ForbiddenException({ cle: "commun:droits.permissionRequise" });
    }

    // 4. Le périmètre — APRÈS la permission, jamais avant.
    const perimetre = await this.perimetres.resoudre(session.userId, permissions);

    requete.trame = { userId: session.userId, permissions, perimetre };
    return true;
  }

  /**
   * Permissions effectives d'un compte.
   *
   * Un compte sans rôle n'a **aucune** permission : c'est la liste blanche
   * appliquée au cas dégradé. Un compte fraîchement créé sans rôle ne doit rien
   * pouvoir, plutôt que de tomber sur un défaut permissif.
   */
  private async permissionsDe(userId: string): Promise<ReadonlySet<string>> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: { select: { permissions: { select: { permission: true } } } } },
    });
    return new Set(user?.role?.permissions.map((p) => p.permission) ?? []);
  }
}
