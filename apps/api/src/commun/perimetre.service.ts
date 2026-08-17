import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service.js";
import { PERMISSIONS_GESTION_GLOBALE } from "@trame/contracts";

/**
 * Constructeur de prédicats de périmètre — `RG-SCOPE-01` à `RG-SCOPE-04`.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * C'est la pièce la plus sensible du produit après le journal d'audit.
 *
 * Le cloisonnement repose entièrement sur elle : une requête de lecture qui
 * oublierait d'injecter ce prédicat exposerait des données hors périmètre sans
 * qu'aucune erreur ne se produise. **Un défaut ici est silencieux**, et c'est
 * ce qui le rend dangereux.
 *
 * D'où deux partis pris :
 *   - le périmètre se calcule une fois par requête et se transporte, plutôt
 *     que de se recalculer à chaque jointure ;
 *   - il est exprimé en ENSEMBLES D'IDENTIFIANTS explicites, pas en fragments
 *     de requête. Un ensemble se teste ; un fragment se relit.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Rappel de l'ordre imposé par `cadrage/03 § 5.4` : la **permission** d'abord,
 * le **périmètre** ensuite. Ce service ne traite que le second. Un point
 * d'entrée qui l'emploierait sans garde de permission serait ouvert à tous.
 */

export type Perimetre = {
  readonly userId: string;
  /** `true` quand une permission de gestion globale court-circuite tout (`RG-SCOPE-03`). */
  readonly global: boolean;
  /** Départements visibles. Vide si `global`. */
  readonly departements: ReadonlySet<string>;
  /** Utilisateurs visibles. Vide si `global`. */
  readonly utilisateurs: ReadonlySet<string>;
  /** L'utilisateur peut-il lire les tâches confidentielles (`RG-SCOPE-04`) ? */
  readonly confidentiel: boolean;
};

@Injectable()
export class PerimetreService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * `RG-SCOPE-01` — le périmètre par défaut est :
   *   son département de rattachement
   *   ∪ les départements de ses services
   *   ∪ toute sa direction s'il en est responsable.
   *
   * `RG-SCOPE-03` — les détenteurs d'une permission de gestion globale
   * conservent la vue complète de l'instance.
   */
  async resoudre(userId: string, permissions: ReadonlySet<string>): Promise<Perimetre> {
    const global = PERMISSIONS_GESTION_GLOBALE.some((p) => permissions.has(p));
    const confidentiel = permissions.has("tasks:read_confidential");

    if (global) {
      return {
        userId,
        global: true,
        departements: new Set(),
        utilisateurs: new Set(),
        confidentiel: true,
      };
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        departementId: true,
        services: { select: { service: { select: { departementId: true } } } },
        directionsDirigees: { select: { id: true } },
        departementsDiriges: { select: { id: true } },
        servicesManages: { select: { departementId: true } },
      },
    });

    const departements = new Set<string>();
    if (!user) {
      return { userId, global: false, departements, utilisateurs: new Set(), confidentiel };
    }

    // Son département de rattachement.
    if (user.departementId) departements.add(user.departementId);

    // Les départements de ses services — un agent peut appartenir à des
    // services relevant d'un autre département que le sien.
    for (const s of user.services) departements.add(s.service.departementId);

    // Ceux qu'il dirige, à quelque niveau que ce soit.
    for (const d of user.departementsDiriges) departements.add(d.id);
    for (const s of user.servicesManages) departements.add(s.departementId);

    // Responsable de direction : toute la direction entre dans le périmètre.
    if (user.directionsDirigees.length > 0) {
      const deLaDirection = await this.prisma.departement.findMany({
        where: { directionId: { in: user.directionsDirigees.map((d) => d.id) } },
        select: { id: true },
      });
      for (const d of deLaDirection) departements.add(d.id);
    }

    const utilisateurs = await this.utilisateursDesDepartements(departements, userId);

    return { userId, global: false, departements, utilisateurs, confidentiel };
  }

  /**
   * Les personnes visibles : celles rattachées aux départements du périmètre,
   * ou membres d'un service de ces départements.
   *
   * **L'intéressé est toujours dans son propre périmètre.** Sans cela, un
   * agent sans département — cas possible — ne se verrait pas lui-même, et ne
   * pourrait plus poser de congé.
   */
  private async utilisateursDesDepartements(
    departements: ReadonlySet<string>,
    userId: string,
  ): Promise<Set<string>> {
    const ids = new Set<string>([userId]);
    if (departements.size === 0) return ids;

    const liste = [...departements];
    const trouves = await this.prisma.user.findMany({
      where: {
        OR: [
          { departementId: { in: liste } },
          { services: { some: { service: { departementId: { in: liste } } } } },
        ],
      },
      select: { id: true },
    });
    for (const u of trouves) ids.add(u.id);
    return ids;
  }

  // ── Prédicats prêts à injecter ───────────────────────────────────────────

  /**
   * Filtre sur les utilisateurs visibles.
   *
   * Renvoie `{}` quand le périmètre est global — un objet vide se compose sans
   * risque avec n'importe quelle clause `where`.
   */
  filtreUtilisateur(p: Perimetre): Record<string, unknown> {
    return p.global ? {} : { id: { in: [...p.utilisateurs] } };
  }

  /** Filtre sur les objets porteurs d'un `userId` : congés, télétravail, temps. */
  filtreParAgent(p: Perimetre): Record<string, unknown> {
    return p.global ? {} : { userId: { in: [...p.utilisateurs] } };
  }

  filtreDepartement(p: Perimetre): Record<string, unknown> {
    return p.global ? {} : { id: { in: [...p.departements] } };
  }

  /**
   * `RG-SCOPE-02` — un projet est visible par son créateur, son chef, son
   * sponsor et ses membres. Les détenteurs de `projects:manage_any` voient tout.
   *
   * Noter que ce prédicat **n'est pas** celui du périmètre organisationnel :
   * l'appartenance à un projet est un droit d'accès distinct, qui ne découle
   * pas du rattachement hiérarchique.
   */
  filtreProjet(p: Perimetre, permissions: ReadonlySet<string>): Record<string, unknown> {
    if (p.global || permissions.has("projects:manage_any") || permissions.has("projects:readAll")) {
      return {};
    }
    return this.filtreMesProjets(p.userId);
  }

  /**
   * Les projets d'une personne : ceux qu'elle a créés, qu'elle dirige, dont
   * elle est sponsor, ou dont elle est membre.
   *
   * C'est le **même prédicat** que celui du périmètre projet, extrait pour
   * être réutilisable : la vue 10 propose « Mes projets » à qui voit tout, et
   * ce bouton doit resserrer sur exactement le même ensemble que celui qu'un
   * utilisateur sans droit global verrait. Deux définitions divergeraient au
   * premier ajout de rôle.
   */
  filtreMesProjets(userId: string): Record<string, unknown> {
    return {
      OR: [
        { createurId: userId },
        { chefId: userId },
        { sponsorId: userId },
        { membres: { some: { userId } } },
      ],
    };
  }

  /**
   * `RG-SCOPE-04` — **une tâche confidentielle n'est pas lisible du seul fait
   * d'y être assigné.** Elle exige une permission explicite.
   *
   * C'est la règle la plus facile à rater : l'intuition dit qu'un assigné voit
   * sa tâche. Ici, non.
   */
  filtreTache(p: Perimetre, permissions: ReadonlySet<string>): Record<string, unknown> {
    const clauses: Record<string, unknown>[] = [];

    if (!p.global && !permissions.has("tasks:readAll") && !permissions.has("tasks:manage_any")) {
      clauses.push({
        OR: [
          { assignes: { some: { userId: p.userId } } },
          { project: { membres: { some: { userId: p.userId } } } },
        ],
      });
    }

    if (!p.confidentiel) clauses.push({ confidentielle: false });

    return clauses.length === 0 ? {} : clauses.length === 1 ? clauses[0]! : { AND: clauses };
  }
}
