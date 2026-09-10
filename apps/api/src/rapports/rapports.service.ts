import { Injectable } from "@nestjs/common";
import type { SanteProjet, EtatRag } from "@rationarium/contracts";
import { PrismaService } from "../prisma.service.js";
import { PerimetreService, type Perimetre } from "../commun/perimetre.service.js";
import { AuditService } from "../commun/audit.service.js";
import { debutDuJour, echeanceDepassee } from "../commun/dates.js";
import { creerXlsx } from "./xlsx.js";

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

/** Contrat explicite du module tendance, y compris son état de confidentialité. */
export type TendanceRapport = {
  points: Array<{ date: string; progression: number }>;
  historiqueSuffisant: boolean;
  moyenne: number;
  gain: number;
  stagnation: boolean;
  relevesHorsFenetre: number;
  minimumRequis: number;
  accesRestreint: boolean;
};

/** `RG-RPT-03` — sous ce nombre d'instantanés, la courbe ne veut rien dire. */
const HISTORIQUE_MINIMAL = 4;

/** `RG-RPT-04` — sous ce gain de progression, on parle de stagnation. */
const SEUIL_STAGNATION = 2;

/** `RG-RPT-05` — une charge supérieure à ce multiple de la moyenne surcharge. */
const FACTEUR_SURCHARGE = 1.5;

/**
 * `RG-RPT-02` — le nombre de jalons en retard détaillés sous le compte global.
 *
 * Dix lignes tiennent sous un panneau sans le faire déborder. Au-delà, la liste
 * cesserait d'aider : ce qui reste est compté et annoncé, jamais tu.
 */
const PLAFOND_RETARDS = 10;

const jour = (d: Date): string => d.toISOString().slice(0, 10);

/**
 * `EX-RPT-03`, `RG-GEN-08` — **l'export est bilingue, comme le reste.**
 *
 * Le fichier était identique en français et en anglais : nom technique,
 * en-têtes `projet,completion,taches_restantes,…` et une colonne `sante`
 * portant les codes bruts. Un tableur dont la première ligne dit
 * `taches_en_retard` n'est pas un compte rendu — c'est un vidage de base.
 *
 * Le vocabulaire vit ici, en clair, comme celui des notifications
 * (`notifications/libelles.ts`) : le serveur n'a pas de catalogue i18next, et
 * une chaîne d'export composée par le client obligerait à lui faire confiance
 * sur ce qu'il envoie. Les libellés sont **ceux de la vue** — « Critique »,
 * « Attention », « Bon » —, sinon l'export contredit l'écran qui l'a produit.
 */
export type Langue = "fr" | "en";

/** La langue du lecteur, ramenée à ce que ce module sait rendre. */
export const langueDe = (declaree: string | null | undefined): Langue =>
  declaree?.toLowerCase().startsWith("en") ? "en" : "fr";

const NOM_FICHIER: Record<Langue, string> = { fr: "rapport", en: "report" };

const ENTETES_EXPORT: Record<Langue, string>[] = [
  { fr: "Identifiant", en: "Identifier" },
  { fr: "Projet", en: "Project" },
  { fr: "Complétion", en: "Completion" },
  { fr: "Tâches restantes", en: "Remaining tasks" },
  { fr: "Tâches en retard", en: "Overdue tasks" },
  { fr: "Jalons", en: "Milestones" },
  { fr: "Jalons à venir", en: "Upcoming milestones" },
  { fr: "Date de fin", en: "End date" },
  { fr: "Chef de projet", en: "Project lead" },
  { fr: "Service", en: "Service" },
  { fr: "Santé", en: "Health" },
];

const SANTE_EXPORT: Record<SanteProjet, Record<Langue, string>> = {
  good: { fr: "Bon", en: "Good" },
  warning: { fr: "Attention", en: "Warning" },
  critical: { fr: "Critique", en: "Critical" },
};

/**
 * `EX-RPT-04` — l'avancement **attendu** d'un projet à une date donnée.
 *
 * Au prorata de la durée écoulée, borné aux deux extrémités : avant le début un
 * projet n'a rien à montrer, après la fin il devait être terminé. C'est ce
 * repère qui donne son sens à la barre — 40 % ne dit rien sans savoir si on en
 * attendait 20 ou 80.
 */
export function attenduA(debut: Date, fin: Date, reference: Date): number {
  const duree = fin.getTime() - debut.getTime();
  if (duree <= 0) return reference.getTime() >= fin.getTime() ? 100 : 0;
  if (reference.getTime() <= debut.getTime()) return 0;
  if (reference.getTime() >= fin.getTime()) return 100;
  return Math.round(((reference.getTime() - debut.getTime()) / duree) * 100);
}

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
    // Conservé dans la signature d'injection du module ; la trace d'export est
    // désormais exclusivement produite par l'intercepteur HTTP.
    _audit: AuditService,
  ) {
    void _audit;
  }

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
    const tacheIds = projets.flatMap((p) => p.taches.map((t) => t.id));
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
      this.tachesEnRetard(
        ids,
        reference,
        perimetre,
        permissions,
        !filtres.projets?.length && !filtres.responsables?.length,
      ),
      this.progressionProjets(projets, reference),
      this.chargeParCollaborateur(tacheIds),
      this.santeProjets(projets, reference, services),
      // Les instantanés ne conservent pas les contributions individuelles historiques.
      // Seule une lecture intégrale peut les exploiter sans révéler une tâche masquée.
      this.tendance(perimetre.global && perimetre.confidentiel ? ids : [], debut),
      this.completionJalons(ids, tacheIds, reference),
      this.repartitions(tacheIds),
      this.activiteRecente(tacheIds, reference),
    ]);

    const tendanceContractuelle: TendanceRapport = {
      ...tendance,
      accesRestreint: !perimetre.global || !perimetre.confidentiel,
    };

    return {
      periode: { nature: filtres.periode, debut: jour(debut), fin: jour(reference) },
      alerte,
      progression,
      charge,
      sante,
      tendance: tendanceContractuelle,
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
        dateDebut: true, dateFin: true, budgetHeures: true,
        chef: { select: { id: true, prenom: true, nom: true } },
        // `Project` porte `departementId` sans relation déclarée : le nom se
        // résout en une passe, plus bas, plutôt qu'en une jointure par ligne.
        departementId: true,
        taches: {
          where: this.perimetres.filtreTache(perimetre, permissions),
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

  /**
   * `EX-RPT-12` — le bandeau d'alerte : ce qui demande une action, en tête.
   *
   * **Il comptait par projet, et laissait tomber les tâches hors projet.** Le
   * bandeau annonçait dix tâches en retard là où la liste des tâches en
   * comptait onze — deux lectures du même fait, l'une agrégée par
   * `projectId in (…)`, l'autre par le périmètre de tâche, et rien pour
   * signaler l'écart. Une tâche hors projet en retard est exactement ce que ce
   * bandeau existe pour montrer : elle n'a pas de chef de projet pour la voir.
   *
   * `RG-RPT-01` — le périmètre reste appliqué, et il l'est ici par
   * `filtreTache`, le même prédicat que la liste des tâches : une tâche hors
   * projet n'est visible que de ses assignés. La règle n'est pas relâchée, elle
   * est étendue à une population que le filtre par projet ne pouvait pas
   * atteindre.
   *
   * Quand le portefeuille est **restreint** par un filtre — un projet, un
   * responsable —, les tâches hors projet sortent du compte : elles
   * n'appartiennent à aucun des projets retenus, et les compter contredirait
   * le filtre que l'utilisateur vient de poser.
   */
  private async tachesEnRetard(
    projetIds: string[],
    reference: Date,
    perimetre: Perimetre,
    permissions: ReadonlySet<string>,
    portefeuilleEntier: boolean,
  ) {
    const enRetard = await this.prisma.task.count({
      where: {
        AND: [
          this.perimetres.filtreTache(perimetre, permissions),
          { statut: { not: "done" } },
          // Le DÉBUT du jour, pas l'instant : `dateFin` est une colonne `Date`,
          // donc à minuit, et comparée à l'heure courante toute échéance du
          // jour comptait comme dépassée. Voir `commun/dates.ts`.
          { dateFin: { lt: debutDuJour(reference) } },
          portefeuilleEntier
            ? { OR: [{ projectId: { in: projetIds } }, { projectId: null }] }
            : { projectId: { in: projetIds } },
        ],
      },
    });
    return { tachesEnRetard: enRetard };
  }

  /**
   * `EX-RPT-04`, `RG-RPT-02` — la progression par projet, **entière**.
   *
   * Elle a été plafonnée à dix barres, avec le troncage annoncé en pied de
   * panneau. `RG-RPT-02` en fait désormais l'exception explicite (2026-09-02,
   * sur demande du commanditaire) : c'est le graphique qu'on ouvre pour savoir
   * où en est le portefeuille, et en masquer une part fait conclure qu'il n'y
   * en a pas d'autre — la mention du troncage ne se lit qu'après avoir déjà
   * tiré cette conclusion.
   *
   * L'ordre, lui, reste celui du retard : ce qui appelle une décision arrive
   * en premier, et cela vaut d'autant plus qu'aucune barre n'est masquée.
   */
  private progressionProjets(
    projets: Awaited<ReturnType<RapportsService["projetsVisibles"]>>,
    reference: Date,
  ) {
    const calculees = projets
      .map((p) => {
        const progression =
          p.taches.length === 0
            ? 0
            : Math.round(p.taches.reduce((n, t) => n + t.avancement, 0) / p.taches.length);
        const attendu = attenduA(p.dateDebut, p.dateFin, reference);
        return {
          id: p.id,
          nom: p.nom,
          icone: p.icone,
          progression,
          /** `EX-RPT-04` — l'avancement attendu, au prorata de la durée écoulée. */
          attendu,
          /** Positif quand le projet est en retard sur son calendrier. */
          ecart: attendu - progression,
          taches: p.taches.length,
        };
      })
      // Le plus en retard passe devant : l'ordre alphabétique enfouirait au
      // milieu de la liste ce qu'on vient précisément y chercher.
      .sort((a, b) => b.ecart - a.ecart || a.nom.localeCompare(b.nom));

    // `total` reste, bien qu'il vaille désormais toujours le nombre de barres
    // rendues : il dit ce que la liste couvre, et le retirer obligerait la vue
    // à recompter ce que le serveur sait déjà.
    return { projets: calculees, total: calculees.length };
  }

  /**
   * `EX-RPT-05`, `RG-RPT-05` — la charge par collaborateur, et ses surcharges.
   *
   * La surcharge est un **écart à la moyenne de l'équipe**, pas un seuil
   * absolu : dix tâches ne veut rien dire dans l'absolu, et tout dire quand
   * l'équipe en porte quatre en moyenne.
   */
  private async chargeParCollaborateur(tacheIds: string[]) {
    const assignations = await this.prisma.taskAssignee.findMany({
      where: { task: { id: { in: tacheIds }, statut: { not: "done" } } },
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
   *
   * **La liste est rendue triée par criticité.** La vue l'annonce — « Trié par
   * criticité », « Affichage limité aux 10 projets les plus critiques » — et
   * coupait pourtant dans l'ordre alphabétique servi par la base : le panneau
   * affirmait un tri qu'il ne faisait pas, et le troncage écartait les projets
   * qu'on venait précisément chercher. Le tri appartient au calcul de la santé,
   * pas au composant qui l'affiche.
   */
  private santeProjets(
    projets: Awaited<ReturnType<RapportsService["projetsVisibles"]>>,
    reference: Date,
    services: Map<string, string>,
  ) {
    const poids: Record<SanteProjet, number> = { critical: 2, warning: 1, good: 0 };
    return projets.map((p) => {
      const restantes = p.taches.filter((t) => t.statut !== "done").length;
      const enRetard = p.taches.filter(
        (t) => t.statut !== "done" && echeanceDepassee(t.dateFin, reference),
      ).length;
      const jalonsAVenir = p.jalons.filter(
        // Même règle qu'ailleurs : un jalon dû AUJOURD'HUI est encore à venir.
        (j) => j.dateEcheance !== null && !echeanceDepassee(j.dateEcheance, reference),
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
      if (enRetard >= 3 || (enRetard > 0 && echeanceDepassee(p.dateFin, reference)))
        sante = "critical";

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
        /** La maquette 34 range le budget d'heures sur la même ligne que le
         *  chef et le service : c'est l'ordre de grandeur du projet. */
        budgetHeures: p.budgetHeures === null ? null : Number(p.budgetHeures),
        sante,
      };
    })
      .sort(
        (a, b) =>
          poids[b.sante] - poids[a.sante] || b.enRetard - a.enRetard || a.nom.localeCompare(b.nom),
      );
  }

  /**
   * `EX-RPT-07`, `RG-RPT-03`, `RG-RPT-04` — la tendance de progression.
   *
   * **Un historique court le dit** plutôt que de tracer une courbe sur trois
   * points. Une courbe lissée sur des données absentes est le plus efficace des
   * mensonges : elle a l'air d'une mesure.
   */
  private async tendance(projetIds: string[], debut: Date) {
    const [instantanes, horsFenetre] = await Promise.all([
      this.prisma.projectSnapshot.findMany({
        where: { projectId: { in: projetIds }, date: { gte: debut } },
        orderBy: { date: "asc" },
        select: { date: true, progression: true, projectId: true },
      }),
      /*
       * `RG-RPT-03`, `RG-GEN-05` — **l'état vide doit dire le VRAI motif, et
       * offrir sa sortie.**
       *
       * Le panneau annonçait « Historique en cours de construction » sur un
       * projet qui porte six instantanés : la tendance est bornée par la
       * fenêtre d'analyse — trente jours par défaut —, et aucun relevé n'y
       * tombait. Le motif affiché était faux, et il n'y avait rien à faire
       * pour en sortir puisque le geste utile — élargir la fenêtre — n'était
       * même pas suggéré. Ce compte-là est ce qui permet de le dire.
       */
      this.prisma.projectSnapshot.count({
        where: { projectId: { in: projetIds }, date: { lt: debut } },
      }),
    ]);

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
      /** Les relevés que la fenêtre d'analyse écarte — le vrai motif du vide. */
      relevesHorsFenetre: horsFenetre,
      /** Le seuil que l'état vide annonce : il se lit ici, il ne se recopie pas. */
      minimumRequis: HISTORIQUE_MINIMAL,
    };
  }

  /**
   * `EX-RPT-08` — la complétion des jalons : à temps, en retard, à venir.
   *
   * Le compte global ne dit pas où agir. Les jalons en retard sont donc rendus
   * un à un, avec leur projet, leur retard et ce qui leur reste à faire, du
   * plus ancien au plus récent : c'est dans cet ordre qu'ils se traitent, et
   * c'est là que se voit le projet qui concentre le retard.
   */
  private async completionJalons(projetIds: string[], tacheIds: string[], reference: Date) {
    const jalons = await this.prisma.milestone.findMany({
      where: { projectId: { in: projetIds } },
      select: {
        id: true, nom: true, dateEcheance: true, statut: true,
        project: { select: { id: true, nom: true } },
        taches: { where: { id: { in: tacheIds } }, select: { statut: true } },
      },
    });

    let aTemps = 0;
    let aVenir = 0;
    const retards: {
      id: string; nom: string; projetId: string; projetNom: string;
      dateEcheance: string; joursDeRetard: number; tachesRestantes: number;
    }[] = [];

    for (const j of jalons) {
      const termine = j.taches.length === 0
        ? j.statut === "done"
        : j.taches.every((t) => t.statut === "done");
      // Une échéance qui tombe AUJOURD'HUI n'est pas dépassée : c'est le seul
      // jour où le jalon peut encore être tenu. La comparaison est nommée dans
      // `commun/dates.ts` et ne se réécrit pas ici.
      const echu = echeanceDepassee(j.dateEcheance, reference);

      if (!echu) aVenir += 1;
      else if (termine) aTemps += 1;
      else
        retards.push({
          id: j.id,
          nom: j.nom,
          projetId: j.project.id,
          projetNom: j.project.nom,
          dateEcheance: jour(j.dateEcheance!),
          joursDeRetard: Math.round(
            (debutDuJour(reference).getTime() - j.dateEcheance!.getTime()) / 86_400_000,
          ),
          tachesRestantes: j.taches.filter((t) => t.statut !== "done").length,
        });
    }

    retards.sort((a, b) => b.joursDeRetard - a.joursDeRetard || a.projetNom.localeCompare(b.projetNom));

    return {
      total: jalons.length,
      aTemps,
      enRetard: retards.length,
      aVenir,
      echus: aTemps + retards.length,
      // `RG-RPT-02` — le client borne d'abord la liste pour rester lisible,
      // puis peut la déplier sans perdre le classement ni refaire un calcul à
      // un autre instant. Ce qu'il masque initialement reste compté.
      retards,
      retardsNonListes: Math.max(0, retards.length - PLAFOND_RETARDS),
    };
  }

  /** `EX-RPT-09` — la répartition des tâches actives, par priorité et statut. */
  private async repartitions(tacheIds: string[]) {
    const [parPriorite, parStatut] = await Promise.all([
      this.prisma.task.groupBy({
        by: ["priorite"],
        where: { id: { in: tacheIds }, statut: { not: "done" } },
        _count: true,
      }),
      this.prisma.task.groupBy({
        by: ["statut"],
        where: { id: { in: tacheIds } },
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
  private async activiteRecente(tacheIds: string[], reference: Date) {
    const debut = new Date(reference);
    debut.setUTCDate(debut.getUTCDate() - 30);

    const [terminees, creees, enRetard] = await Promise.all([
      this.prisma.task.count({
        where: { id: { in: tacheIds }, statut: "done", modifieLe: { gte: debut } },
      }),
      this.prisma.task.count({
        where: { id: { in: tacheIds }, creeLe: { gte: debut } },
      }),
      this.prisma.task.count({
        where: {
          id: { in: tacheIds },
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
   * Le XLSX est produit en OOXML/ZIP natif, sans dépendance. Le PDF reste le
   * chemin d'impression de la page afin de ne pas dupliquer sa mise en forme.
   */
  async exporter(
    format: "json" | "csv",
    filtres: FiltresRapport,
    perimetre: Perimetre,
    permissions: ReadonlySet<string>,
    reference: Date,
    acteurId: string,
    langue?: Langue,
  ): Promise<{ contenu: string; type: string; nom: string }>;
  async exporter(
    format: "xlsx",
    filtres: FiltresRapport,
    perimetre: Perimetre,
    permissions: ReadonlySet<string>,
    reference: Date,
    acteurId: string,
    langue?: Langue,
  ): Promise<{ contenu: Buffer; type: string; nom: string }>;
  async exporter(
    format: "json" | "csv" | "xlsx",
    filtres: FiltresRapport,
    perimetre: Perimetre,
    permissions: ReadonlySet<string>,
    reference: Date,
    acteurId: string,
    langue?: Langue,
  ): Promise<{ contenu: string | Buffer; type: string; nom: string }>;
  async exporter(
    format: "json" | "csv" | "xlsx",
    filtres: FiltresRapport,
    perimetre: Perimetre,
    permissions: ReadonlySet<string>,
    reference: Date,
    _acteurId: string,
    langue: Langue = "fr",
  ): Promise<{ contenu: string | Buffer; type: string; nom: string }> {
    const donnees = await this.vueEnsemble(filtres, perimetre, permissions, reference);

    if (format === "json") {
      return {
        contenu: JSON.stringify(donnees, null, 2),
        type: "application/json; charset=utf-8",
        nom: `${NOM_FICHIER[langue]}-${donnees.periode.debut}.json`,
      };
    }

    if (format === "xlsx") {
      return {
        contenu: creerXlsx(lignesSante(donnees.sante, langue), NOM_FICHIER[langue]),
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        nom: `${NOM_FICHIER[langue]}-${donnees.periode.debut}.xlsx`,
      };
    }

    return {
      contenu: csvSante(donnees.sante, langue),
      type: "text/csv; charset=utf-8",
      nom: `${NOM_FICHIER[langue]}-${donnees.periode.debut}.csv`,
    };
  }

}


/** Une ligne du tableau de santé, telle que l'export la lit. */
export type LigneSanteExport = {
  id: string;
  nom: string;
  completion: number;
  restantes: number;
  enRetard: number;
  jalons: number;
  jalonsAVenir: number;
  dateFin: string;
  chef: { prenom: string; nom: string } | null;
  service: string | null;
  sante: SanteProjet;
};

/**
 * `EX-RPT-03` — le tableau de santé, en CSV, **dans la langue du lecteur**.
 *
 * Les valeurs sont échappées : un nom de projet contenant une virgule — il y en
 * a — décalerait toutes les colonnes suivantes, et le fichier paraîtrait valide.
 *
 * Hors de la classe, et exporté : c'est du texte pur, qui se vérifie sans base
 * ni conteneur. Il était privé, et la seule façon de contrôler l'export passait
 * par une suite d'intégration — ce qui revenait à ne pas le contrôler.
 */
export function csvSante(lignes: readonly LigneSanteExport[], langue: Langue = "fr"): string {
  const echapper = (v: unknown): string => {
    const texte = String(v ?? "");
    return /[",;\n]/.test(texte) ? `"${texte.replaceAll('"', '""')}"` : texte;
  };

  const [entetes = [], ...lignesCorps] = lignesSante(lignes, langue);
  const corps = lignesCorps.map((ligne) => ligne.map(echapper).join(","));

  // Le BOM UTF-8 : sans lui, Excel lit le fichier en ANSI et « Complétion »
  // devient « ComplÃ©tion ». C'est le détail qui fait juger l'export cassé.
  return `\uFEFF${[entetes.join(","), ...corps].join("\r\n")}\r\n`;
}

/** Données communes aux sorties tableur CSV (compatibilité) et XLSX. */
export function lignesSante(
  lignes: readonly LigneSanteExport[],
  langue: Langue = "fr",
): Array<Array<string | number>> {
  return [
    ENTETES_EXPORT.map((entete) => entete[langue]),
    ...lignes.map((ligne) => [
      ligne.id, ligne.nom, ligne.completion, ligne.restantes, ligne.enRetard,
      ligne.jalons, ligne.jalonsAVenir, ligne.dateFin,
      ligne.chef ? `${ligne.chef.prenom} ${ligne.chef.nom}` : "",
      ligne.service ?? "", SANTE_EXPORT[ligne.sante][langue],
    ]),
  ];
}
