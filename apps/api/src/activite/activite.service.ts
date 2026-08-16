import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service.js";
import { AuditService } from "../commun/audit.service.js";
import { PerimetreService, type Perimetre } from "../commun/perimetre.service.js";
import type { PeriodeJournee, DureeTachePredefinie } from "@trame/contracts";

/**
 * Activité récurrente — M8, vues 09 et 34.
 *
 * Permanences, astreintes, accueil, gardes : ce qui revient, ne relève d'aucun
 * projet, et **doit être réparti équitablement** — d'où le poids de 1 à 5.
 *
 * `RG-ACT-04` porte le piège calendaire du module : pour une récurrence
 * mensuelle à date fixe, si le jour n'existe pas dans le mois — le 31 février —
 * l'assignation est **ramenée au dernier jour du mois**. Une implémentation
 * naïve avec `Date` la reporterait au mois suivant, silencieusement.
 */

export type EchecActivite =
  | "creneau_sans_horaires"
  | "tache_inactive"
  | "deja_assigne"
  | "agent_indisponible"
  | "introuvable";

export class ErreurActivite extends Error {
  constructor(
    readonly code: EchecActivite,
    readonly detail?: Record<string, unknown>,
  ) {
    super(code);
  }
}

/** Motif d'inéligibilité d'un agent — vue 09, fenêtre d'ajout. */
export type Inelegibilite = {
  userId: string;
  prenom: string;
  nom: string;
  motif: "deja_assigne" | "en_conge" | "en_teletravail" | null;
  detail?: string;
};

@Injectable()
export class ActiviteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly perimetres: PerimetreService,
  ) {}

  /**
   * `EX-ACT-01` — le catalogue, avec ses règles de récurrence.
   *
   * Une tâche désactivée reste au catalogue : `RG-ACT-05` conserve le passé,
   * et la faire disparaître laisserait des assignations rattachées à un objet
   * introuvable.
   */
  async catalogue(inclureInactives = false) {
    return this.prisma.predefinedTask.findMany({
      where: inclureInactives ? {} : { actif: true },
      orderBy: [{ actif: "desc" }, { nom: "asc" }],
      include: {
        recurrences: { orderBy: [{ active: "desc" }, { dateDebut: "asc" }] },
        _count: { select: { assignations: true } },
      },
    });
  }

  /** `EX-ACT-01`, `RG-ACT-02` — une durée « créneau horaire » exige ses horaires. */
  async creerTache(
    donnees: {
      nom: string; description?: string; couleur?: string; icone?: string;
      dureeParDefaut?: DureeTachePredefinie;
      heureDebut?: string | null; heureFin?: string | null;
      teletravailAutorise?: boolean; poids?: number;
    },
    acteurId: string,
  ) {
    if (donnees.dureeParDefaut === "time_slot" && (!donnees.heureDebut || !donnees.heureFin)) {
      throw new ErreurActivite("creneau_sans_horaires");
    }

    const tache = await this.prisma.predefinedTask.create({
      data: {
        nom: donnees.nom,
        description: donnees.description ?? null,
        couleur: donnees.couleur ?? null,
        icone: donnees.icone ?? null,
        dureeParDefaut: donnees.dureeParDefaut ?? "full_day",
        heureDebut: donnees.heureDebut ?? null,
        heureFin: donnees.heureFin ?? null,
        teletravailAutorise: donnees.teletravailAutorise ?? true,
        poids: donnees.poids ?? 1,
      },
    });
    await this.audit.tracer({
      action: "predefined_task.create", typeEntite: "PredefinedTask", entiteId: tache.id, acteurId,
    });
    return tache;
  }

  /**
   * Éligibilité des agents pour une assignation — vue 09.
   *
   * Le brief est explicite : chaque agent est listé **avec sa raison
   * d'inéligibilité le cas échéant**. Masquer les inéligibles priverait le
   * manager de l'information qui compte — *pourquoi* il ne peut pas
   * l'assigner.
   *
   * `RG-ACT-03` — assigner un agent en télétravail à une tâche qui ne
   * l'autorise pas est refusé, **en nommant les agents incompatibles**.
   */
  async eligibilite(
    predefinedTaskId: string,
    date: Date,
    periode: PeriodeJournee,
    perimetre: Perimetre,
  ): Promise<Inelegibilite[]> {
    const tache = await this.prisma.predefinedTask.findUnique({
      where: { id: predefinedTaskId },
      select: { teletravailAutorise: true },
    });
    if (!tache) throw new ErreurActivite("introuvable");

    const agents = await this.prisma.user.findMany({
      where: { AND: [this.perimetres.filtreUtilisateur(perimetre), { actif: true }] },
      select: { id: true, prenom: true, nom: true },
      orderBy: [{ nom: "asc" }],
    });
    const ids = agents.map((a) => a.id);

    const [dejaAssignes, enConge, enTeletravail] = await Promise.all([
      this.prisma.predefinedTaskAssignment.findMany({
        where: { predefinedTaskId, date, periode, userId: { in: ids } },
        select: { userId: true },
      }),
      this.prisma.leave.findMany({
        where: {
          userId: { in: ids },
          statut: { in: ["approved", "cancellation_requested"] },
          dateDebut: { lte: date },
          dateFin: { gte: date },
        },
        select: { userId: true, type: { select: { nom: true } } },
      }),
      tache.teletravailAutorise
        ? Promise.resolve([])
        : this.prisma.telework.findMany({
            where: { userId: { in: ids }, date, etat: "telework" },
            select: { userId: true },
          }),
    ]);

    const assignes = new Set(dejaAssignes.map((a) => a.userId));
    const conges = new Map(enConge.map((c) => [c.userId, c.type.nom]));
    const teletravaillent = new Set(enTeletravail.map((t) => t.userId));

    // Le champ s'appelle `userId`, pas `id` : `assigner` fait sa correspondance
    // dessus. Un spread de `{ id, prenom, nom }` laissait `userId` indéfini, et
    // AUCUNE inéligibilité n'était détectée — l'assignation passait toujours.
    return agents.map((a) => {
      const base = { userId: a.id, prenom: a.prenom, nom: a.nom };
      if (assignes.has(a.id)) return { ...base, motif: "deja_assigne" as const };
      if (conges.has(a.id)) {
        return { ...base, motif: "en_conge" as const, detail: conges.get(a.id)! };
      }
      if (teletravaillent.has(a.id)) return { ...base, motif: "en_teletravail" as const };
      return { ...base, motif: null };
    });
  }

  /**
   * `EX-ACT-02`, `EX-ACT-03` — assigner, éventuellement en masse.
   *
   * `RG-ACT-01` — une assignation est unique pour agent × tâche × date ×
   * période, doublée par un index unique en base.
   * `RG-ACT-05` — une tâche inactive n'est plus assignable, mais les
   * assignations passées sont conservées.
   */
  async assigner(
    predefinedTaskId: string,
    userIds: string[],
    date: Date,
    periode: PeriodeJournee,
    acteurId: string,
    perimetre: Perimetre,
  ) {
    const tache = await this.prisma.predefinedTask.findUnique({
      where: { id: predefinedTaskId },
      select: { actif: true, nom: true },
    });
    if (!tache) throw new ErreurActivite("introuvable");
    if (!tache.actif) throw new ErreurActivite("tache_inactive", { tache: tache.nom });

    const eligibilite = await this.eligibilite(predefinedTaskId, date, periode, perimetre);
    const parId = new Map(eligibilite.map((e) => [e.userId, e]));

    const refuses = userIds
      .map((id) => parId.get(id))
      .filter((e): e is Inelegibilite => Boolean(e?.motif));

    if (refuses.length > 0) {
      // RG-ACT-03 — le refus NOMME les agents incompatibles et dit pourquoi.
      throw new ErreurActivite("agent_indisponible", {
        agents: refuses.map((r) => ({
          nom: `${r.prenom} ${r.nom}`,
          motif: r.motif,
          detail: r.detail ?? null,
        })),
      });
    }

    await this.prisma.predefinedTaskAssignment.createMany({
      data: userIds.map((userId) => ({ predefinedTaskId, userId, date, periode })),
    });

    await this.audit.tracer({
      action: "predefined_task.assign", typeEntite: "PredefinedTask", entiteId: predefinedTaskId,
      acteurId, detail: { agents: userIds.length, date: date.toISOString().slice(0, 10), periode },
    });
    return { crees: userIds.length };
  }

  /**
   * `RG-ACT-04` — **le piège calendaire du module.**
   *
   * Pour une récurrence mensuelle à date fixe, si le jour n'existe pas dans le
   * mois — le 31 février —, l'assignation est ramenée au **dernier jour du
   * mois**. Une construction naïve `new Date(annee, mois, 31)` déborderait
   * silencieusement sur mars.
   */
  dateMensuelle(annee: number, mois: number, jourVoulu: number): Date {
    const dernierJour = new Date(Date.UTC(annee, mois + 1, 0)).getUTCDate();
    return new Date(Date.UTC(annee, mois, Math.min(jourVoulu, dernierJour)));
  }

  /** Le n-ième jour de semaine d'un mois — « le 3ᵉ mardi », « le dernier vendredi ». */
  dateOrdinale(annee: number, mois: number, jourSemaine: number, ordinal: number): Date | null {
    const dernierJour = new Date(Date.UTC(annee, mois + 1, 0)).getUTCDate();
    const occurrences: number[] = [];
    for (let j = 1; j <= dernierJour; j++) {
      if (new Date(Date.UTC(annee, mois, j)).getUTCDay() === jourSemaine) occurrences.push(j);
    }
    // ordinal -1 désigne le dernier.
    const choisi = ordinal === -1 ? occurrences[occurrences.length - 1] : occurrences[ordinal - 1];
    return choisi === undefined ? null : new Date(Date.UTC(annee, mois, choisi));
  }

  /**
   * `EX-ACT-05`, `RG-ACT-06` — générer les assignations depuis les règles, en
   * rendant compte des **créées et ignorées**.
   */
  async genererDepuisRecurrences(
    predefinedTaskId: string,
    debut: Date,
    fin: Date,
    userIds: string[],
    acteurId: string,
  ) {
    const recurrences = await this.prisma.predefinedTaskRecurrence.findMany({
      where: {
        predefinedTaskId,
        active: true,
        dateDebut: { lte: fin },
        OR: [{ dateFin: null }, { dateFin: { gte: debut } }],
      },
    });

    const dates = new Set<string>();

    for (const r of recurrences) {
      if (r.type === "weekly" && r.jourSemaine !== null) {
        const pas = (r.frequence || 1) * 7 * 86_400_000;
        // On part du premier jour de la plage qui tombe le bon jour de semaine.
        const curseur = new Date(Math.max(debut.getTime(), r.dateDebut.getTime()));
        while (curseur.getUTCDay() !== r.jourSemaine) {
          curseur.setUTCDate(curseur.getUTCDate() + 1);
        }
        for (let d = new Date(curseur); d <= fin; d = new Date(d.getTime() + pas)) {
          if (r.dateFin && d > r.dateFin) break;
          dates.add(d.toISOString().slice(0, 10));
        }
      }

      if (r.type === "monthly_fixed" && r.jourMois !== null) {
        for (
          let m = new Date(Date.UTC(debut.getUTCFullYear(), debut.getUTCMonth(), 1));
          m <= fin;
          m = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1))
        ) {
          const d = this.dateMensuelle(m.getUTCFullYear(), m.getUTCMonth(), r.jourMois);
          if (d >= debut && d <= fin && (!r.dateFin || d <= r.dateFin)) {
            dates.add(d.toISOString().slice(0, 10));
          }
        }
      }

      if (r.type === "monthly_ordinal" && r.jourSemaine !== null && r.ordinal !== null) {
        for (
          let m = new Date(Date.UTC(debut.getUTCFullYear(), debut.getUTCMonth(), 1));
          m <= fin;
          m = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1))
        ) {
          const d = this.dateOrdinale(m.getUTCFullYear(), m.getUTCMonth(), r.jourSemaine, r.ordinal);
          if (d && d >= debut && d <= fin && (!r.dateFin || d <= r.dateFin)) {
            dates.add(d.toISOString().slice(0, 10));
          }
        }
      }
    }

    let crees = 0;
    let ignores = 0;

    for (const iso of [...dates].sort()) {
      const date = new Date(`${iso}T00:00:00.000Z`);
      for (const userId of userIds) {
        const existe = await this.prisma.predefinedTaskAssignment.findUnique({
          where: {
            userId_predefinedTaskId_date_periode: {
              userId, predefinedTaskId, date, periode: "full_day",
            },
          },
          select: { id: true },
        });
        if (existe) {
          ignores++;
          continue;
        }
        await this.prisma.predefinedTaskAssignment.create({
          data: { predefinedTaskId, userId, date, periode: "full_day" },
        });
        crees++;
      }
    }

    await this.audit.tracer({
      action: "predefined_task.generate", typeEntite: "PredefinedTask", entiteId: predefinedTaskId,
      acteurId, detail: { crees, ignores, dates: dates.size },
    });
    return { crees, ignores, dates: dates.size };
  }

  /**
   * `EX-ACT-07` — la grille d'activité de la vue 09 : **jours en lignes,
   * tâches en colonnes**. L'inversion des axes est délibérée.
   */
  async grille(debut: Date, fin: Date, perimetre: Perimetre) {
    const taches = await this.prisma.predefinedTask.findMany({
      where: { actif: true },
      orderBy: { nom: "asc" },
    });

    const assignations = await this.prisma.predefinedTaskAssignment.findMany({
      where: {
        date: { gte: debut, lte: fin },
        ...(perimetre.global ? {} : { userId: { in: [...perimetre.utilisateurs] } }),
      },
      include: { user: { select: { id: true, prenom: true, nom: true } } },
      orderBy: { user: { nom: "asc" } },
    });

    const parCle = new Map<string, typeof assignations>();
    for (const a of assignations) {
      const cle = `${a.date.toISOString().slice(0, 10)}|${a.predefinedTaskId}`;
      parCle.set(cle, [...(parCle.get(cle) ?? []), a]);
    }

    const lignes: {
      date: string;
      cellules: { tacheId: string; agents: Record<string, unknown>[] }[];
    }[] = [];
    for (const d = new Date(debut); d <= fin; d.setUTCDate(d.getUTCDate() + 1)) {
      const iso = d.toISOString().slice(0, 10);
      lignes.push({
        date: iso,
        cellules: taches.map((t) => ({
          tacheId: t.id,
          // L'identifiant de l'ASSIGNATION accompagne l'agent : sans lui, la
          // vue 09 ne peut pas déclarer la réalisation (`EX-ACT-06`) sans une
          // seconde requête pour retrouver ce qu'elle vient d'afficher.
          agents: (parCle.get(`${iso}|${t.id}`) ?? []).map((a) => ({
            ...a.user,
            assignationId: a.id,
            periode: a.periode,
            realisee: a.realisee,
          })),
        })),
      });
    }

    return { colonnes: taches, lignes };
  }

  /** `EX-ACT-06` — déclarer le statut de réalisation d'une assignation. */
  async declarerRealisation(assignationId: string, realisee: boolean, acteurId: string) {
    await this.prisma.predefinedTaskAssignment.update({
      where: { id: assignationId },
      data: { realisee, version: { increment: 1 } },
    });
    await this.audit.tracer({
      action: "predefined_task.status", typeEntite: "PredefinedTaskAssignment",
      entiteId: assignationId, acteurId, detail: { realisee },
    });
  }
}
