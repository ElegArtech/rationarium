import { Injectable } from "@nestjs/common";
import type { SanteProjet, EtatRag } from "@trame/contracts";
import { PrismaService } from "../prisma.service.js";
import { PerimetreService, type Perimetre } from "../commun/perimetre.service.js";
import { AuditService } from "../commun/audit.service.js";

/**
 * M17 — rapports et analytics. Vues 15 et 30.
 *
 * **Inès ouvre cette page une fois par mois et doit comprendre en trente
 * secondes.** Tout ce service est écrit pour ça : chaque module rend une
 * conclusion, pas seulement des nombres. Un ratio de complétion s'accompagne de
 * son interprétation ; une surcharge est nommée ; une stagnation est signalée ;
 * un historique trop court le dit au lieu de tracer une courbe trompeuse.
 *
 * `RG-RPT-01` — **les agrégats respectent le périmètre.** C'est la règle la
 * plus dangereuse à rater ici : un compteur n'a pas l'air de divulguer, mais
 * « 47 tâches en retard » sur un portefeuille qu'on n'a pas le droit de voir en
 * dit déjà trop. Le filtre projet est donc appliqué **en tête**, une fois, et
 * tous les modules travaillent sur cette liste.
 */

export type Periode = "semaine" | "mois" | "trimestre" | "annee";

export type FiltresRapport = {
  periode: Periode;
  projets?: string[];
  responsables?: string[];
};

/** `RG-RPT-02` — au-delà de dix projets, l'affichage graphique est limité. */
const PLAFOND_GRAPHIQUE = 10;

/** `RG-RPT-03` — sous ce nombre d'instantanés, la courbe ne veut rien dire. */
const HISTORIQUE_MINIMAL = 4;

/** `RG-RPT-04` — sous ce gain de progression, on parle de stagnation. */
const SEUIL_STAGNATION = 2;

/** `RG-RPT-05` — une charge supérieure à ce multiple de la moyenne surcharge. */
const FACTEUR_SURCHARGE = 1.5;

const jour = (d: Date): string => d.toISOString().slice(0, 10);

/** Le début de la période demandée, à partir d'une date de référence. */
export function debutDe(periode: Periode, reference: Date): Date {
  const d = new Date(reference);
  if (periode === "semaine") {
    // Lundi. `getUTCDay()` rend 0 le dimanche : le décalage le rattache à la
    // semaine qui précède, et non à la suivante.
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }
  if (periode === "mois") return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  if (periode === "trimestre") {
    return new Date(Date.UTC(d.getUTCFullYear(), Math.floor(d.getUTCMonth() / 3) * 3, 1));
  }
  return new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
}

@Injectable()
export class RapportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly perimetres: PerimetreService,
    private readonly audit: AuditService,
  ) {}

  /**
   * `EX-RPT-04` à `EX-RPT-12` — tous les modules d'analyse, en un appel.
   *
   * Huit modules chargés séparément produiraient huit états de chargement sur
   * une page qu'on lit d'un seul regard. Et surtout, ils pourraient revenir de
   * huit instants différents : « 12 tâches en retard » à côté de « 0 tâche
   * active » se lit comme une erreur du produit, pas comme une course.
   */
  async vueEnsemble(
    filtres: FiltresRapport,
    perimetre: Perimetre,
    permissions: ReadonlySet<string>,
    reference: Date,
  ) {
    const debut = debutDe(filtres.periode, reference);
    const projets = await this.projetsVisibles(filtres, perimetre, permissions);
    const ids = projets.map((p) => p.id);
    const services = await this.nomsDeDepartements(projets);

    const [
      alerte,
      progression,
      charge,
      sante,
      tendance,
      jalons,
      repartitions,
      activite,
    ] = await Promise.all([
      this.tachesEnRetard(ids, reference),
      this.progressionProjets(projets),
      this.chargeParCollaborateur(ids),
      this.santeProjets(projets, reference, services),
      this.tendance(ids, debut),
      this.completionJalons(ids, reference),
      this.repartitions(ids),
      this.activiteRecente(ids, reference),
    ]);

    return {
      periode: { nature: filtres.periode, debut: jour(debut), fin: jour(reference) },
      alerte,
      progression,
      charge,
      sante,
      tendance,
      jalons,
      repartitions,
      activite,
    };
  }

  /**
   * La liste des projets sur laquelle **tout** le reste s'appuie.
   *
   * `RG-RPT-01` — le filtre de périmètre est ici, et nulle part ailleurs. Le
   * répéter dans chaque module donnerait huit occasions de l'oublier.
   */
  private async projetsVisibles(
    filtres: FiltresRapport,
    perimetre: Perimetre,
    permissions: ReadonlySet<string>,
  ) {
    return this.prisma.project.findMany({
      where: {
        AND: [
          this.perimetres.filtreProjet(perimetre, permissions),
          { archive: false },
          ...(filtres.projets?.length ? [{ id: { in: filtres.projets } }] : []),
          ...(filtres.responsables?.length ? [{ chefId: { in: filtres.responsables } }] : []),
        ],
      },
      select: {
        id: true, nom: true, statut: true, priorite: true, icone: true,
        dateDebut: true, dateFin: true,
        chef: { select: { id: true, prenom: true, nom: true } },
        // `Project` porte `departementId` sans relation déclarée : le nom se
        // résout en une passe, plus bas, plutôt qu'en une jointure par ligne.
        departementId: true,
        taches: {
          select: { id: true, statut: true, priorite: true, avancement: true, dateFin: true },
        },
        jalons: { select: { id: true, dateEcheance: true } },
      },
      orderBy: { nom: "asc" },
    });
  }

  /** Les noms de département, résolus en une passe pour toute la page. */
  private async nomsDeDepartements(
    projets: { departementId: string | null }[],
  ): Promise<Map<string, string>> {
    const ids = [...new Set(projets.map((p) => p.departementId).filter((x) => x !== null))];
    if (ids.length === 0) return new Map();
    const lignes = await this.prisma.departement.findMany({
      where: { id: { in: ids } },
      select: { id: true, nom: true },
    });
    return new Map(lignes.map((d) => [d.id, d.nom]));
  }

  /** `EX-RPT-12` — le bandeau d'alerte : ce qui demande une action, en tête. */
  private async tachesEnRetard(projetIds: string[], reference: Date) {
    const enRetard = await this.prisma.task.count({
      where: {
        projectId: { in: projetIds },
        statut: { not: "done" },
        dateFin: { lt: reference },
      },
    });
    return { tachesEnRetard: enRetard };
  }

  /**
   * `EX-RPT-04`, `RG-RPT-02` — la progression par projet, **plafonnée**.
   *
   * Au-delà de dix barres, le graphique cesse d'être lisible. Le troncage est
   * **annoncé** : une liste silencieusement coupée fait conclure qu'il n'y a
   * que dix projets, ce qui est une erreur de pilotage, pas d'affichage.
   */
  private progressionProjets(projets: Awaited<ReturnType<RapportsService["projetsVisibles"]>>) {
    const calculees = projets.map((p) => ({
      id: p.id,
      nom: p.nom,
      icone: p.icone,
      progression:
        p.taches.length === 0
          ? 0
          : Math.round(p.taches.reduce((n, t) => n + t.avancement, 0) / p.taches.length),
      taches: p.taches.length,
    }));

    return {
      projets: calculees.slice(0, PLAFOND_GRAPHIQUE),
      total: calculees.length,
      tronque: calculees.length > PLAFOND_GRAPHIQUE,
      plafond: PLAFOND_GRAPHIQUE,
    };
  }

  /**
   * `EX-RPT-05`, `RG-RPT-05` — la charge par collaborateur, et ses surcharges.
   *
   * La surcharge est un **écart à la moyenne de l'équipe**, pas un seuil
   * absolu : dix tâches ne veut rien dire dans l'absolu, et tout dire quand
   * l'équipe en porte quatre en moyenne.
   */
  private async chargeParCollaborateur(projetIds: string[]) {
    const assignations = await this.prisma.taskAssignee.findMany({
      where: { task: { projectId: { in: projetIds }, statut: { not: "done" } } },
      select: { userId: true, user: { select: { prenom: true, nom: true } } },
    });

    const parAgent = new Map<string, { id: string; nom: string; taches: number }>();
    for (const a of assignations) {
      const existant = parAgent.get(a.userId);
      if (existant) existant.taches += 1;
      else {
        parAgent.set(a.userId, {
          id: a.userId,
          nom: `${a.user.prenom} ${a.user.nom}`,
          taches: 1,
        });
      }
    }

    const agents = [...parAgent.values()].sort((a, b) => b.taches - a.taches);
    const moyenne =
      agents.length === 0
        ? 0
        : Math.round((agents.reduce((n, a) => n + a.taches, 0) / agents.length) * 10) / 10;

    return {
      agents: agents.map((a) => ({ ...a, surcharge: moyenne > 0 && a.taches > moyenne * FACTEUR_SURCHARGE })),
      moyenne,
      surcharges: agents.filter((a) => moyenne > 0 && a.taches > moyenne * FACTEUR_SURCHARGE).length,
    };
  }

  /**
   * `EX-RPT-06` — la santé des projets.
   *
   * Trois niveaux, **calculés** et non saisis (`cadrage/01 § M17`) : tâches
   * restantes, tâches en retard, jalons à venir. Une santé saisie à la main
   * dirait ce que le chef de projet veut bien en dire ; celle-ci dit ce que
   * les données montrent.
   */
  private santeProjets(
    projets: Awaited<ReturnType<RapportsService["projetsVisibles"]>>,
    reference: Date,
    services: Map<string, string>,
  ) {
    return projets.map((p) => {
      const restantes = p.taches.filter((t) => t.statut !== "done").length;
      const enRetard = p.taches.filter(
        (t) => t.statut !== "done" && t.dateFin !== null && t.dateFin < reference,
      ).length;
      const jalonsAVenir = p.jalons.filter(
        (j) => j.dateEcheance !== null && j.dateEcheance >= reference,
      ).length;
      const completion =
        p.taches.length === 0
          ? 0
          : Math.round(
              (p.taches.filter((t) => t.statut === "done").length / p.taches.length) * 100,
            );

      // Le retard prime : un projet à 90 % avec cinq tâches dépassées est en
      // difficulté, même si le pourcentage rassure.
      let sante: SanteProjet = "good";
      if (enRetard > 0) sante = "warning";
      if (enRetard >= 3 || (enRetard > 0 && p.dateFin < reference)) sante = "critical";

      return {
        id: p.id,
        nom: p.nom,
        icone: p.icone,
        completion,
        restantes,
        enRetard,
        jalons: p.jalons.length,
        jalonsAVenir,
        tachesActives: restantes,
        dateFin: jour(p.dateFin),
        chef: p.chef,
        service: p.departementId ? (services.get(p.departementId) ?? null) : null,
        sante,
      };
    });
  }

  /**
   * `EX-RPT-07`, `RG-RPT-03`, `RG-RPT-04` — la tendance de progression.
   *
   * **Un historique court le dit** plutôt que de tracer une courbe sur trois
   * points. Une courbe lissée sur des données absentes est le plus efficace des
   * mensonges : elle a l'air d'une mesure.
   */
  private async tendance(projetIds: string[], debut: Date) {
    const instantanes = await this.prisma.projectSnapshot.findMany({
      where: { projectId: { in: projetIds }, date: { gte: debut } },
      orderBy: { date: "asc" },
      select: { date: true, progression: true, projectId: true },
    });

    const parDate = new Map<string, number[]>();
    for (const i of instantanes) {
      const cle = jour(i.date);
      parDate.set(cle, [...(parDate.get(cle) ?? []), i.progression]);
    }

    const points = [...parDate.entries()]
      .map(([date, valeurs]) => ({
        date,
        progression: Math.round(valeurs.reduce((n, v) => n + v, 0) / valeurs.length),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const suffisant = points.length >= HISTORIQUE_MINIMAL;
    const premier = points[0]?.progression ?? 0;
    const dernier = points[points.length - 1]?.progression ?? 0;
    const gain = dernier - premier;

    return {
      points,
      historiqueSuffisant: suffisant,
      moyenne:
        points.length === 0
          ? 0
          : Math.round(points.reduce((n, p) => n + p.progression, 0) / points.length),
      gain,
      // `RG-RPT-04` — la stagnation ne se déduit pas d'un graphique plat qu'on
      // regarde : elle est calculée et nommée.
      stagnation: suffisant && Math.abs(gain) < SEUIL_STAGNATION,
    };
  }

  /** `EX-RPT-08` — la complétion des jalons : à temps, en retard, à venir. */
  private async completionJalons(projetIds: string[], reference: Date) {
    const jalons = await this.prisma.milestone.findMany({
      where: { projectId: { in: projetIds } },
      select: {
        id: true, nom: true, dateEcheance: true,
        taches: { select: { statut: true } },
      },
    });

    let aTemps = 0;
    let enRetard = 0;
    let aVenir = 0;

    for (const j of jalons) {
      const termine = j.taches.length > 0 && j.taches.every((t) => t.statut === "done");
      const echu = j.dateEcheance !== null && j.dateEcheance < reference;

      if (!echu) aVenir += 1;
      else if (termine) aTemps += 1;
      else enRetard += 1;
    }

    return { total: jalons.length, aTemps, enRetard, aVenir, echus: aTemps + enRetard };
  }

  /** `EX-RPT-09` — la répartition des tâches actives, par priorité et statut. */
  private async repartitions(projetIds: string[]) {
    const [parPriorite, parStatut] = await Promise.all([
      this.prisma.task.groupBy({
        by: ["priorite"],
        where: { projectId: { in: projetIds }, statut: { not: "done" } },
        _count: true,
      }),
      this.prisma.task.groupBy({
        by: ["statut"],
        where: { projectId: { in: projetIds } },
        _count: true,
      }),
    ]);

    const compter = (lignes: { _count: number }[]) => lignes.reduce((n, l) => n + l._count, 0);

    return {
      priorite: parPriorite.map((l) => ({ cle: l.priorite, nombre: l._count })),
      statut: parStatut.map((l) => ({ cle: l.statut, nombre: l._count })),
      actives: compter(parPriorite),
    };
  }

  /**
   * `EX-RPT-10` — l'activité des trente derniers jours, **interprétée**.
   *
   * Le ratio de complétion seul ne dit rien à qui ne le manipule pas tous les
   * jours. « Le backlog grossit » se comprend en une seconde, et c'est
   * exactement ce que la page doit permettre.
   */
  private async activiteRecente(projetIds: string[], reference: Date) {
    const debut = new Date(reference);
    debut.setUTCDate(debut.getUTCDate() - 30);

    const [terminees, creees, enRetard] = await Promise.all([
      this.prisma.task.count({
        where: { projectId: { in: projetIds }, statut: "done", modifieLe: { gte: debut } },
      }),
      this.prisma.task.count({
        where: { projectId: { in: projetIds }, creeLe: { gte: debut } },
      }),
      this.prisma.task.count({
        where: {
          projectId: { in: projetIds },
          statut: { not: "done" },
          dateFin: { gte: debut, lt: reference },
        },
      }),
    ]);

    // Un ratio sur zéro création n'est pas « infini » : il n'existe pas.
    const ratio = creees === 0 ? null : Math.round((terminees / creees) * 100) / 100;

    return {
      terminees,
      creees,
      passeesEnRetard: enRetard,
      ratio,
      // `null` quand le ratio n'existe pas : « stable » serait une affirmation.
      interpretation: ratio === null ? null : ratio >= 1 ? "resorbe" : "grossit",
    };
  }

  /**
   * `EX-RPT-11` — le Gantt portefeuille, et son statut RAG.
   *
   * Le RAG n'est pas la santé : la santé regarde le contenu du projet, le RAG
   * regarde sa position dans le temps. Un projet peut être « on track » et de
   * santé « attention » — c'est justement ce croisement qui informe.
   */
  async gantt(
    filtres: FiltresRapport,
    perimetre: Perimetre,
    permissions: ReadonlySet<string>,
    reference: Date,
  ) {
    const projets = await this.projetsVisibles(filtres, perimetre, permissions);
    const services = await this.nomsDeDepartements(projets);

    const lignes = projets.map((p) => {
      const total = p.taches.length;
      const finies = p.taches.filter((t) => t.statut === "done").length;
      const progression = total === 0 ? 0 : Math.round((finies / total) * 100);
      const enRetard = p.taches.filter(
        (t) => t.statut !== "done" && t.dateFin !== null && t.dateFin < reference,
      ).length;

      let rag: EtatRag;
      if (p.statut === "done" || (total > 0 && finies === total)) rag = "done";
      else if (p.dateDebut > reference) rag = "upcoming";
      else if (p.dateFin < reference) rag = "late";
      else if (enRetard > 0) rag = "at_risk";
      else rag = "on_track";

      return {
        id: p.id,
        nom: p.nom,
        icone: p.icone,
        statut: p.statut,
        priorite: p.priorite,
        dateDebut: jour(p.dateDebut),
        dateFin: jour(p.dateFin),
        progression,
        taches: total,
        enRetard,
        rag,
        // Le brief impose « Non assigné » plutôt qu'une case vide : une valeur
        // absente qui ne se nomme pas se prend pour un défaut de chargement.
        chef: p.chef,
        service: p.departementId
          ? { id: p.departementId, nom: services.get(p.departementId) ?? "" }
          : null,
      };
    });

    return { lignes, reference: jour(reference) };
  }

  /**
   * `EX-RPT-03` — l'export.
   *
   * ────────────────────────────────────────────────────────────────────────
   * DÉCISION PRISE EN AUTONOMIE — 2026-08-16, réversible
   *
   * Le cadrage demande « PDF, Excel ou JSON ». Deux des trois posent une
   * question que le cadrage ne tranche pas :
   *
   * - **Excel.** Un vrai classeur `.xlsx` exige une bibliothèque (`exceljs` ou
   *   équivalent), donc un ADR au titre de `C1` et d'`ADR-0013`. Ce lot rend
   *   du **CSV**, qu'Excel ouvre nativement, et le nomme comme tel dans
   *   l'interface — plutôt que d'annoncer « Excel » et de livrer autre chose.
   * - **PDF.** Le produit possède déjà des feuilles d'impression (vue 09), et
   *   le lot L-27 porte l'impression et le PDF. Générer ici un second chemin
   *   PDF côté serveur ferait diverger deux mises en page du même contenu.
   *   L'export PDF passe donc par l'impression du navigateur.
   *
   * Les deux points remontent en question ; ils ne sont pas refermés en
   * silence.
   * ────────────────────────────────────────────────────────────────────────
   */
  async exporter(
    format: "json" | "csv",
    filtres: FiltresRapport,
    perimetre: Perimetre,
    permissions: ReadonlySet<string>,
    reference: Date,
    acteurId: string,
  ): Promise<{ contenu: string; type: string; nom: string }> {
    const donnees = await this.vueEnsemble(filtres, perimetre, permissions, reference);

    await this.audit.tracer({
      action: "export.csv", typeEntite: "Report", entiteId: filtres.periode, acteurId,
      detail: { format, projets: donnees.sante.length },
    });

    if (format === "json") {
      return {
        contenu: JSON.stringify(donnees, null, 2),
        type: "application/json; charset=utf-8",
        nom: `rapport-${donnees.periode.debut}.json`,
      };
    }

    return {
      contenu: this.csvSante(donnees.sante),
      type: "text/csv; charset=utf-8",
      nom: `rapport-${donnees.periode.debut}.csv`,
    };
  }

  /**
   * Le tableau de santé, en CSV.
   *
   * Les valeurs sont échappées : un nom de projet contenant une virgule — il y
   * en a — décalerait toutes les colonnes suivantes, et le fichier paraîtrait
   * valide.
   */
  private csvSante(lignes: ReturnType<RapportsService["santeProjets"]>): string {
    const echapper = (v: unknown): string => {
      const texte = String(v ?? "");
      return /[",;\n]/.test(texte) ? `"${texte.replaceAll('"', '""')}"` : texte;
    };

    const entetes = [
      "projet", "completion", "taches_restantes", "taches_en_retard",
      "jalons", "jalons_a_venir", "date_fin", "chef", "service", "sante",
    ];

    const corps = lignes.map((l) =>
      [
        l.nom, l.completion, l.restantes, l.enRetard, l.jalons, l.jalonsAVenir,
        l.dateFin, l.chef ? `${l.chef.prenom} ${l.chef.nom}` : "", l.service ?? "", l.sante,
      ]
        .map(echapper)
        .join(","),
    );

    // Le BOM UTF-8 : sans lui, Excel lit le fichier en ANSI et « Complétion »
    // devient « ComplÃ©tion ». C'est le détail qui fait juger l'export cassé.
    return `\uFEFF${[entetes.join(","), ...corps].join("\r\n")}\r\n`;
  }
}
