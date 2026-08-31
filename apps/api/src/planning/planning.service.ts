import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service.js";
import { CalendrierService } from "../parametrage/calendrier.service.js";
import { ActiviteService } from "../activite/activite.service.js";
import type { Perimetre } from "../commun/perimetre.service.js";
import { AuditService } from "../commun/audit.service.js";
import { genererIcs, analyserIcs, type EvenementIcs } from "./ics.js";

/**
 * M7 — le planning unifié. Vues 07, 08, 09.
 *
 * **C'est la vue centrale du produit**, et ce service en porte la promesse :
 * une seule grille temporelle réconcilie tout ce qui occupe une personne —
 * congé, télétravail, tâche de projet, tâche hors projet, permanence, réunion.
 *
 * `RG-PLN-01` — **une seule sollicitation** rapporte tout ce qu'il faut à la
 * période affichée. Ce n'est pas une optimisation : six requêtes séparées
 * peuvent revenir de six instants différents, et la grille afficherait alors
 * un congé posé après le chargement des tâches. La cohérence de la lecture
 * est la raison d'être de l'agrégat.
 *
 * `RG-PLN-02` — sans permission de gestion globale, la grille est restreinte
 * au périmètre organisationnel. Le filtrage se fait **sur la liste des
 * personnes**, une fois, en tête : toutes les occupations en découlent, et
 * aucune ne peut donc fuir par un chemin oublié.
 */

/** Une journée, en ISO court. C'est la clé de tout ce module. */
const jour = (d: Date): string => d.toISOString().slice(0, 10);

const jours = (debut: Date, fin: Date): string[] => {
  const sortie: string[] = [];
  for (const d = new Date(debut); d <= fin; d.setUTCDate(d.getUTCDate() + 1)) sortie.push(jour(d));
  return sortie;
};

/** Une ressource de la grille, telle que la vue la reçoit. */
export type Personne = {
  id: string;
  prenom: string;
  nom: string;
  avatarFichier: string | null;
  avatarPredefini: string | null;
  departement: { id: string; nom: string } | null;
  services: { service: { id: string; nom: string } }[];
};

export type FiltresPlanning = {
  services?: string[];
  departementId?: string;
  ressourceId?: string;
  /** `EX-PLN-05` — se restreindre à son propre périmètre, même si on a plus. */
  monPerimetre?: boolean;
};

@Injectable()
export class PlanningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly calendrier: CalendrierService,
    private readonly audit: AuditService,
    private readonly activite: ActiviteService,
  ) {}

  /**
   * `EX-ACT-07` — la grille d'activité, avec sa trame. Vue 09.
   *
   * `RG-PLN-01` vaut aussi ici : la grille et la trame de fond partent
   * ensemble. Les demander séparément ferait apparaître les fériés après coup,
   * sur une grille déjà lue — et un jour férié découvert en second est un jour
   * qu'on a déjà compté comme ouvré.
   */
  async grilleActivite(debut: Date, fin: Date, perimetre: Perimetre) {
    const [grille, trame] = await Promise.all([
      this.activite.grille(debut, fin, perimetre),
      this.calendrier.trameDeFond(debut, fin),
    ]);
    return { ...grille, trame };
  }

  /**
   * `EX-PLN-03` — tout ce qui occupe les personnes de la période, en un appel.
   *
   * L'ordre des opérations n'est pas indifférent : les personnes d'abord, le
   * reste ensuite et **uniquement pour elles**. Interroger les congés sur la
   * période puis filtrer après coup laisserait passer la fenêtre où le filtre
   * est oublié.
   */
  async agreger(
    debut: Date,
    fin: Date,
    filtres: FiltresPlanning,
    perimetre: Perimetre,
    permissions: ReadonlySet<string>,
  ) {
    const personnes = await this.personnes(filtres, perimetre);
    const ids = personnes.map((p) => p.id);
    const grille = jours(debut, fin);

    // Une seule attente pour six lectures indépendantes : elles ne se
    // conditionnent pas l'une l'autre, les sérialiser ne rendrait rien de plus.
    const [taches, conges, teletravail, evenements, permanences, trame] = await Promise.all([
      this.taches(debut, fin, ids, perimetre, permissions),
      this.conges(debut, fin, ids),
      this.teletravail(debut, fin, ids),
      this.evenements(debut, fin, ids),
      // `RG-PLN-07` — les permanences ne sont visibles qu'avec le droit de
      // consulter les tâches prédéfinies. `null` dit « pas de droit », et se
      // distingue d'un tableau vide, qui dit « aucune permanence ce jour-là ».
      permissions.has("predefined_tasks:read")
        ? this.permanences(debut, fin, ids)
        : Promise.resolve(null),
      this.calendrier.trameDeFond(debut, fin),
    ]);

    return {
      periode: { debut: jour(debut), fin: jour(fin), jours: grille },
      groupes: this.grouper(personnes),
      occupations: { taches, conges, teletravail, evenements, permanences },
      trame,
      synthese: this.horsPresentiel(grille, personnes.length, conges, teletravail),
    };
  }

  /**
   * Les personnes de la grille, après périmètre **et** filtres.
   *
   * `EX-PLN-05` — « Mon périmètre » restreint volontairement quelqu'un qui a
   * le droit de voir plus large. C'est un confort de lecture, pas un contrôle :
   * le contrôle, lui, est le périmètre résolu par la garde.
   */
  private async personnes(filtres: FiltresPlanning, perimetre: Perimetre): Promise<Personne[]> {
    const restreint = filtres.monPerimetre || !perimetre.global;

    return this.prisma.user.findMany({
      where: {
        actif: true,
        ...(restreint ? { id: { in: [...perimetre.utilisateurs] } } : {}),
        ...(filtres.ressourceId ? { id: filtres.ressourceId } : {}),
        ...(filtres.departementId ? { departementId: filtres.departementId } : {}),
        ...(filtres.services?.length
          ? { services: { some: { serviceId: { in: filtres.services } } } }
          : {}),
      },
      select: {
        id: true, prenom: true, nom: true, avatarFichier: true, avatarPredefini: true,
        departement: { select: { id: true, nom: true } },
        services: { select: { service: { select: { id: true, nom: true } } } },
      },
      orderBy: [{ nom: "asc" }, { prenom: "asc" }],
    });
  }

  /**
   * `EX-PLN-04` — les ressources sont groupées par service.
   *
   * Une personne rattachée à deux services apparaît dans les deux : c'est la
   * lecture attendue d'un manager, qui cherche son service et veut y voir tous
   * ses agents. La synthèse, elle, compte les personnes **distinctes** — sans
   * quoi un effectif de vingt en afficherait vingt-quatre.
   *
   * Un agent sans service n'est pas escamoté : il forme un groupe nommé, parce
   * qu'un agent invisible au planning est un agent qu'on croit disponible.
   */
  private grouper(personnes: Personne[]) {
    const groupes = new Map<
      string,
      { service: { id: string; nom: string } | null; personnes: Personne[] }
    >();

    for (const p of personnes) {
      if (p.services.length === 0) {
        const sans = groupes.get("") ?? { service: null, personnes: [] };
        sans.personnes.push(p);
        groupes.set("", sans);
        continue;
      }
      for (const { service } of p.services) {
        const g = groupes.get(service.id) ?? { service, personnes: [] };
        g.personnes.push(p);
        groupes.set(service.id, g);
      }
    }

    return [...groupes.values()].sort((a, b) =>
      // Le groupe « sans service » ferme la liste : il est l'exception, pas
      // l'entrée en matière.
      a.service === null ? 1 : b.service === null ? -1 : a.service.nom.localeCompare(b.service.nom),
    );
  }

  /**
   * Les tâches qui touchent la période, projet et hors projet.
   *
   * `RG-SCOPE-04` — une tâche confidentielle reste exclue sauf permission
   * explicite : le planning n'est pas une porte dérobée sur ce que la vue
   * Tâches refuse de montrer.
   */
  private async taches(
    debut: Date,
    fin: Date,
    ids: string[],
    perimetre: Perimetre,
    permissions: ReadonlySet<string>,
  ) {
    const lignes = await this.prisma.task.findMany({
      where: {
        assignes: { some: { userId: { in: ids } } },
        // Une tâche « touche » la période dès qu'elle la chevauche : celle qui
        // court du 1er au 30 doit apparaître dans la semaine du 10.
        dateDebut: { lte: fin },
        dateFin: { gte: debut },
        ...(perimetre.confidentiel || permissions.has("tasks:read_confidential")
          ? {}
          : { confidentielle: false }),
      },
      select: {
        id: true, titre: true, statut: true, priorite: true, avancement: true,
        dateDebut: true, dateFin: true, heureDebut: true, heureFin: true,
        interventionExterieure: true,
        project: { select: { id: true, nom: true, icone: true } },
        assignes: { select: { userId: true } },
      },
      orderBy: { dateDebut: "asc" },
    });

    return lignes.map((t) => ({
      ...t,
      dateDebut: t.dateDebut ? jour(t.dateDebut) : null,
      dateFin: t.dateFin ? jour(t.dateFin) : null,
      assignes: t.assignes.map((a) => a.userId),
      /** Le brief exige une tâche hors projet **visuellement distincte**. */
      horsProjet: t.project === null,
      /** `RG-TSK-11` — le glisser-déposer en date lui est refusé. Autant que
       *  la vue le sache avant le geste, plutôt qu'après le refus. */
      multiAssignee: t.assignes.length > 1,
    }));
  }

  /** `EX-PLN-13` — congé validé et congé en attente ne se confondent pas. */
  private async conges(debut: Date, fin: Date, ids: string[]) {
    const lignes = await this.prisma.leave.findMany({
      where: {
        userId: { in: ids },
        dateDebut: { lte: fin },
        dateFin: { gte: debut },
        // Un congé refusé ou annulé n'occupe personne : l'afficher ferait
        // croire à une absence.
        statut: { in: ["pending", "approved", "cancellation_requested"] },
      },
      select: {
        id: true, userId: true, dateDebut: true, dateFin: true, statut: true,
        demiJourneeDebut: true, demiJourneeFin: true,
        type: { select: { id: true, nom: true, couleur: true, icone: true } },
      },
    });

    return lignes.map((c) => ({
      ...c,
      dateDebut: jour(c.dateDebut),
      dateFin: jour(c.dateFin),
    }));
  }

  /** `RG-TLT-02` — trois états, et « bureau » n'est pas « non déclaré ». */
  private async teletravail(debut: Date, fin: Date, ids: string[]) {
    const lignes = await this.prisma.telework.findMany({
      where: { userId: { in: ids }, date: { gte: debut, lte: fin } },
      select: { id: true, userId: true, date: true, etat: true, issuDeRegle: true, version: true },
    });
    return lignes.map((t) => ({ ...t, date: jour(t.date) }));
  }

  /** `RG-EVT-06` — une intervention extérieure est signalée distinctement. */
  private async evenements(debut: Date, fin: Date, ids: string[]) {
    const lignes = await this.prisma.event.findMany({
      where: {
        date: { gte: debut, lte: fin },
        participants: { some: { userId: { in: ids } } },
      },
      select: {
        id: true, titre: true, date: true, journeeEntiere: true,
        heureDebut: true, heureFin: true, interventionExterieure: true,
        project: { select: { id: true, nom: true } },
        participants: { select: { userId: true } },
      },
      orderBy: [{ date: "asc" }, { heureDebut: "asc" }],
    });

    return lignes.map((e) => ({
      ...e,
      date: jour(e.date),
      participants: e.participants.map((p) => p.userId),
    }));
  }

  /** `RG-PLN-07` — les permanences, pour qui a le droit de les consulter. */
  private async permanences(debut: Date, fin: Date, ids: string[]) {
    const lignes = await this.prisma.predefinedTaskAssignment.findMany({
      where: { userId: { in: ids }, date: { gte: debut, lte: fin } },
      select: {
        id: true, userId: true, date: true, periode: true, realisee: true,
        predefinedTask: {
          select: { id: true, nom: true, couleur: true, icone: true, heureDebut: true, heureFin: true },
        },
      },
    });
    return lignes.map((a) => ({ ...a, date: jour(a.date) }));
  }

  /**
   * `EX-PLN-08` — la synthèse quotidienne « hors présentiel ».
   *
   * Hors présentiel = absent du bureau : en congé, ou en télétravail. Le
   * télétravail n'est **pas** une absence — la personne travaille — mais elle
   * n'est pas là, et c'est précisément la question que pose un manager qui
   * regarde cette ligne. Les deux se cumulent sans se compter deux fois.
   *
   * Un congé en attente ne compte pas : il n'est pas encore une absence, et
   * l'inclure gonflerait le chiffre sur une décision qui n'est pas prise.
   */
  private horsPresentiel(
    grille: string[],
    effectif: number,
    conges: { userId: string; dateDebut: string; dateFin: string; statut: string }[],
    teletravail: { userId: string; date: string; etat: string }[],
  ) {
    return grille.map((date) => {
      const absents = new Set<string>();
      for (const c of conges) {
        if (c.statut === "pending") continue;
        if (c.dateDebut <= date && date <= c.dateFin) absents.add(c.userId);
      }
      for (const t of teletravail) {
        if (t.date === date && t.etat === "telework") absents.add(t.userId);
      }
      const n = absents.size;
      return {
        date,
        absents: n,
        total: effectif,
        // Un effectif nul donnerait NaN, qui s'afficherait tel quel.
        pourcentage: effectif === 0 ? 0 : Math.round((n / effectif) * 100),
      };
    });
  }

  /**
   * `EX-PLN-15` — le planning de la période, au format ICS.
   *
   * Ce qui part : les événements auxquels les personnes du périmètre
   * participent, et leurs congés approuvés. Pas les tâches — une tâche qui
   * court sur trois semaines n'est pas un rendez-vous, et la déverser dans un
   * agenda en ferait un bloc de trois semaines qui masque tout le reste.
   *
   * `RG-SCOPE-01` — l'export respecte le périmètre. Un export est une copie
   * qui sort du produit : c'est le pire endroit où relâcher le cloisonnement.
   */
  async exporterIcs(
    debut: Date,
    fin: Date,
    filtres: FiltresPlanning,
    perimetre: Perimetre,
    estampille: Date,
  ): Promise<string> {
    const personnes = await this.personnes(filtres, perimetre);
    const ids = personnes.map((p) => p.id);
    const noms = new Map(personnes.map((p) => [p.id, `${p.prenom} ${p.nom}`]));

    const [evenements, conges] = await Promise.all([
      this.evenements(debut, fin, ids),
      this.conges(debut, fin, ids),
    ]);

    const entrees: EvenementIcs[] = [
      ...evenements.map((e) => ({
        uid: `evt-${e.id}@rationarium`,
        titre: e.interventionExterieure ? `${e.titre} (intervention extérieure)` : e.titre,
        description: e.project ? e.project.nom : null,
        date: e.date,
        dateFin: e.date,
        journeeEntiere: e.journeeEntiere,
        heureDebut: e.heureDebut,
        heureFin: e.heureFin,
        categorie: "Événement",
      })),
      // Un congé en attente n'est pas une absence : l'exporter le ferait
      // apparaître comme acquis dans l'agenda de quelqu'un d'autre.
      ...conges
        .filter((c) => c.statut === "approved")
        .map((c) => ({
          uid: `cng-${c.id}@rationarium`,
          titre: `${noms.get(c.userId) ?? ""} — ${c.type.nom}`.trim(),
          description: null,
          date: c.dateDebut,
          dateFin: c.dateFin,
          journeeEntiere: true,
          heureDebut: null,
          heureFin: null,
          categorie: "Congé",
        })),
    ];

    return genererIcs(entrees, estampille);
  }

  /**
   * `EX-PLN-15` — importe un calendrier et en crée des événements.
   *
   * L'import **rend compte** : créés, ignorés, déjà présents. Un import muet
   * laisse chercher pourquoi trois rendez-vous manquent, et la réponse tient
   * toujours dans l'un de ces trois nombres.
   *
   * Le `UID` du fichier sert de garde-fou au rejeu : réimporter deux fois le
   * même calendrier ne duplique rien. C'est le seul usage de `RG-GEN-07` qui
   * vaille ici — il n'y a pas de version à comparer sur une donnée qui entre.
   */
  async importerIcs(contenu: string, acteurId: string) {
    const { evenements, ignores } = analyserIcs(contenu);

    let crees = 0;
    let existants = 0;

    for (const e of evenements) {
      const reference = e.uid ? `ics:${e.uid}` : null;
      if (reference) {
        const deja = await this.prisma.event.findFirst({
          where: { description: { contains: reference } },
          select: { id: true },
        });
        if (deja) {
          existants += 1;
          continue;
        }
      }

      await this.prisma.event.create({
        data: {
          titre: e.titre,
          // La référence d'origine est conservée dans la description : sans
          // elle, le rejeu dupliquerait tout.
          description: [e.description, reference].filter(Boolean).join("\n") || null,
          date: new Date(`${e.date}T00:00:00.000Z`),
          journeeEntiere: e.journeeEntiere,
          heureDebut: e.heureDebut,
          heureFin: e.heureFin,
          participants: { create: [{ userId: acteurId }] },
        },
      });
      crees += 1;
    }

    await this.audit.tracer({
      action: "event.create", typeEntite: "Event", entiteId: "import-ics", acteurId,
      detail: { source: "ics", crees, existants, ignores },
    });

    return { crees, existants, ignores };
  }

}
