import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service.js";
import { FileService, FILE_COURRIEL } from "./file.service.js";

/**
 * M18 — les notifications.
 *
 * Six déclencheurs, énumérés par `cadrage/01 § M18` : la liste est **fermée**.
 * Y ajouter un type est une décision, pas une initiative — c'est le même
 * principe que pour les actions du journal d'audit.
 *
 * **`RG-NTF-04` gouverne tout ce fichier.** `notifier()` écrit la notification
 * en base — opération locale, rapide, transactionnelle — puis **met en file**
 * le courriel. Jamais l'inverse, jamais synchrone. Un relais SMTP en panne
 * laisse la notification en cloche et le courriel en attente ; il ne fait pas
 * échouer l'approbation de congé qui l'a déclenché.
 */

/** Les six types de `cadrage/01 § M18`. La liste est fermée. */
export const TYPES_NOTIFICATION = [
  "tache_assignee",
  "conge_a_valider",
  "conge_decide",
  "tache_echeance_proche",
  "tache_en_retard",
  "ajout_projet",
] as const;

export type TypeNotification = (typeof TYPES_NOTIFICATION)[number];

/**
 * Les types envoyés **aussi** par courriel (`EX-NTF-04` — « les notifications
 * critiques »).
 *
 * Une échéance qui approche n'est pas critique : elle attendra la prochaine
 * ouverture de l'application. Une demande de congé à valider, si — le
 * demandeur, lui, attend.
 */
const CRITIQUES: ReadonlySet<TypeNotification> = new Set([
  "conge_a_valider",
  "conge_decide",
  "tache_en_retard",
]);

export type EchecNotification = "introuvable";

export class ErreurNotification extends Error {
  constructor(readonly code: EchecNotification) {
    super(code);
  }
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly file: FileService,
  ) {}

  /**
   * Émet une notification, et met le courriel en file s'il y a lieu.
   *
   * **Ne lève jamais pour une raison de messagerie.** L'appelant est une action
   * métier en cours ; la seule erreur qu'il puisse voir ici est une erreur de
   * base, et elle est la sienne.
   */
  async notifier(entree: {
    userId: string;
    type: TypeNotification;
    titre: string;
    contenu: string;
    lien?: string | null;
  }) {
    const notification = await this.prisma.notification.create({
      data: {
        userId: entree.userId,
        type: entree.type,
        titre: entree.titre,
        contenu: entree.contenu,
        lien: entree.lien ?? null,
      },
    });

    /*
     * `RG-NTF-04`, **tenue à deux niveaux**. `publier` capture déjà ses propres
     * échecs ; ce second filet ne fait pas double emploi : il garantit que la
     * règle survit à une évolution de la file. Une garantie qui repose sur la
     * promesse qu'une autre couche n'échouera jamais n'est pas une garantie.
     */
    try {
      if (CRITIQUES.has(entree.type)) {
        const destinataire = await this.prisma.user.findUnique({
          where: { id: entree.userId },
          select: { email: true, actif: true },
        });
        // Un compte désactivé ne reçoit plus de courriel : son adresse peut
        // avoir été réattribuée, et sa boîte n'est plus relevée.
        if (destinataire?.actif) {
          await this.file.publier(FILE_COURRIEL, {
            destinataire: destinataire.email,
            sujet: entree.titre,
            corps: entree.contenu,
          });
        }
      }
    } catch {
      // Silencieux DE PROPOS DÉLIBÉRÉ : l'appelant est une action métier en
      // cours d'aboutissement, et l'échec d'un courriel ne la concerne pas.
      // La file journalise ; l'utilisateur n'a rien à voir ici.
    }

    return notification;
  }

  /** Émet la même notification à plusieurs personnes, sans doublon. */
  async notifierPlusieurs(
    userIds: string[],
    entree: { type: TypeNotification; titre: string; contenu: string; lien?: string | null },
  ) {
    const uniques = [...new Set(userIds)];
    for (const userId of uniques) await this.notifier({ userId, ...entree });
    return { emises: uniques.length };
  }

  /** `EX-NTF-01` — ses notifications, et le compte des non-lues. */
  async lister(userId: string, options: { nonLuesSeulement?: boolean; limite?: number } = {}) {
    const [entrees, nonLues] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId, ...(options.nonLuesSeulement ? { lue: false } : {}) },
        orderBy: { creeLe: "desc" },
        take: options.limite ?? 50,
      }),
      this.prisma.notification.count({ where: { userId, lue: false } }),
    ]);
    return { entrees, nonLues };
  }

  /**
   * `EX-NTF-02` — marquer comme lue.
   *
   * Le filtre porte sur l'identifiant **et** sur le propriétaire : une
   * notification est personnelle, et une écriture qui ne filtrerait que sur
   * `id` laisserait marquer celle d'autrui à qui devine un identifiant.
   */
  async marquerLue(userId: string, id: string) {
    const resultat = await this.prisma.notification.updateMany({
      where: { id, userId },
      data: { lue: true },
    });
    if (resultat.count === 0) throw new ErreurNotification("introuvable");
    return { lue: true };
  }

  /** `EX-NTF-03` — tout marquer comme lu. */
  async toutMarquerLu(userId: string) {
    const resultat = await this.prisma.notification.updateMany({
      where: { userId, lue: false },
      data: { lue: true },
    });
    return { marquees: resultat.count };
  }

  // ── Le travail planifié quotidien — `RG-NTF-01` ───────────────────────────

  /**
   * Les alertes d'échéance, émises une fois par jour.
   *
   * Deux natures, et elles ne se confondent pas : une tâche **qui approche**
   * de son échéance appelle une anticipation ; une tâche **dépassée** appelle
   * une correction. Les fondre en une seule alerte ferait perdre la première.
   *
   * Le travail est **idempotent dans la journée** : rejoué, il ne redouble pas
   * les notifications. Un travail périodique se rejoue — au redémarrage, après
   * un échec — et l'utilisateur qui reçoit trois fois la même alerte cesse de
   * les lire.
   */
  async alertesEcheance(aujourdhui: Date) {
    const debutDuJour = new Date(
      Date.UTC(aujourdhui.getUTCFullYear(), aujourdhui.getUTCMonth(), aujourdhui.getUTCDate()),
    );
    const dansTroisJours = new Date(debutDuJour);
    dansTroisJours.setUTCDate(dansTroisJours.getUTCDate() + 3);

    const [proches, depassees] = await Promise.all([
      this.prisma.task.findMany({
        where: {
          statut: { not: "done" },
          dateFin: { gte: debutDuJour, lte: dansTroisJours },
        },
        select: { id: true, titre: true, dateFin: true, assignes: { select: { userId: true } } },
      }),
      this.prisma.task.findMany({
        where: { statut: { not: "done" }, dateFin: { lt: debutDuJour } },
        select: { id: true, titre: true, dateFin: true, assignes: { select: { userId: true } } },
      }),
    ]);

    let emises = 0;
    let ignorees = 0;

    for (const [taches, type] of [
      [proches, "tache_echeance_proche"],
      [depassees, "tache_en_retard"],
    ] as const) {
      for (const tache of taches) {
        for (const { userId } of tache.assignes) {
          const deja = await this.prisma.notification.findFirst({
            where: {
              userId,
              type,
              lien: `/taches/${tache.id}`,
              creeLe: { gte: debutDuJour },
            },
            select: { id: true },
          });
          if (deja) {
            ignorees += 1;
            continue;
          }
          await this.notifier({
            userId,
            type,
            titre: type === "tache_en_retard" ? `En retard : ${tache.titre}` : `Échéance proche : ${tache.titre}`,
            contenu:
              type === "tache_en_retard"
                ? `La tâche « ${tache.titre} » a dépassé son échéance du ${tache.dateFin?.toISOString().slice(0, 10)}.`
                : `La tâche « ${tache.titre} » arrive à échéance le ${tache.dateFin?.toISOString().slice(0, 10)}.`,
            lien: `/taches/${tache.id}`,
          });
          emises += 1;
        }
      }
    }

    return { emises, ignorees };
  }
}
