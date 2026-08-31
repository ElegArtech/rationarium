import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service.js";
import { AuditService } from "../commun/audit.service.js";
import { PerimetreService, type Perimetre } from "../commun/perimetre.service.js";
import type { EtatTeletravail } from "@rationarium/contracts";
import { autruiRefuse } from "../commun/champs-gouvernes.js";

/**
 * Télétravail — M11, vue 20.
 *
 * `RG-TLT-02` — **trois états par jour** : télétravail, bureau (déclaré), non
 * déclaré. Le week-end est distingué. La distinction « bureau déclaré » et
 * « non déclaré » n'est pas cosmétique : la première dit *j'ai répondu*, la
 * seconde *je n'ai rien dit*. Les confondre ferait passer un oubli pour une
 * présence.
 */

export type EchecTeletravail =
  | "autrui_sans_permission"
  | "plage_trop_longue"
  | "regle_en_double"
  | "hors_perimetre"
  | "introuvable";

export class ErreurTeletravail extends Error {
  constructor(
    readonly code: EchecTeletravail,
    readonly detail?: Record<string, unknown>,
  ) {
    super(code);
  }
}

const jour = (d: Date) => d.toISOString().slice(0, 10);

@Injectable()
export class TeletravailService {
  /**
   * `RG-TLT-07` — « Agir sur le télétravail d'autrui exige une permission
   * dédiée, **distincte selon l'action** (consulter, saisir, modifier,
   * supprimer, gérer les règles). »
   *
   * La règle était énoncée au cadrage et tenue **nulle part** : `basculer`,
   * `generer` et `statistiques` recevaient `userId` et `acteurId` sans jamais
   * les comparer, et les trois routes qui les servent font retomber `userId` sur
   * l'acteur *par défaut* — ce qui donne l'apparence d'un contrôle là où il n'y
   * en a pas. N'importe quel porteur de `telework:create`, c'est-à-dire tout
   * agent, pouvait poser du télétravail sur le calendrier de n'importe qui.
   *
   * **La granularité retenue**, et c'est une décision : le catalogue est fermé
   * (`cadrage/01 § 3.2`) et ne porte pas une permission « pour autrui » par
   * action. « Distincte selon l'action » se lit donc en deux temps — la
   * permission de l'action garde la route (`create`, `generate`,
   * `manage_rules`, `read`), et une seconde permission autorise à viser
   * quelqu'un d'autre : `manage_any` pour écrire, `read_team` pour lire. Les
   * deux vivent dans le bloc `ENCADREMENT`, donc un agent n'agit que sur
   * lui-même et un encadrant sur son équipe, sans qu'aucun modèle de rôle ne
   * change.
   */
  private refuserAutrui(
    cible: string,
    acteurId: string,
    permissions: ReadonlySet<string>,
    permission: string,
  ): void {
    const refus = autruiRefuse(cible, acteurId, permission, permissions);
    if (refus) throw new ErreurTeletravail("autrui_sans_permission", refus);
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly perimetres: PerimetreService,
  ) {}

  /**
   * `EX-TLT-02` — basculer un jour d'un clic.
   *
   * `RG-TLT-01` — un seul enregistrement par agent et par date : l'upsert
   * porte la règle, doublée par un index unique en base.
   *
   * `RG-TLT-04` — un jour issu d'une règle **peut être modifié ponctuellement,
   * ce qui crée une exception**. L'exception est marquée pour que la
   * régénération ne l'écrase pas.
   */
  async basculer(
    userId: string,
    date: Date,
    etat: EtatTeletravail,
    acteurId: string,
    permissions: ReadonlySet<string> = new Set(),
  ) {
    this.refuserAutrui(userId, acteurId, permissions, "telework:manage_any");
    const existant = await this.prisma.telework.findUnique({
      where: { userId_date: { userId, date } },
      select: { issuDeRegle: true },
    });

    const enregistrement = await this.prisma.telework.upsert({
      where: { userId_date: { userId, date } },
      create: { userId, date, etat },
      update: {
        etat,
        // Modifier un jour engendré par une règle en fait une exception.
        exception: existant?.issuDeRegle === true,
        version: { increment: 1 },
      },
    });

    await this.audit.tracer({
      action: "telework.set", typeEntite: "Telework", entiteId: enregistrement.id, acteurId,
      detail: { userId, date: jour(date), etat },
    });
    return enregistrement;
  }

  /**
   * `EX-TLT-01`, `EX-TLT-03` — le planning mensuel et le cumul.
   *
   * `RG-TLT-06` — une plage interrogée ne peut excéder 366 jours.
   */
  async planning(userId: string, debut: Date, fin: Date) {
    const jours = Math.ceil((fin.getTime() - debut.getTime()) / 86_400_000);
    if (jours > 366) throw new ErreurTeletravail("plage_trop_longue", { jours });

    const declarations = await this.prisma.telework.findMany({
      where: { userId, date: { gte: debut, lte: fin } },
      orderBy: { date: "asc" },
    });

    const parDate = new Map(declarations.map((d) => [jour(d.date), d]));
    const calendrier: {
      date: string;
      etat: EtatTeletravail;
      weekend: boolean;
      issuDeRegle: boolean;
      exception: boolean;
    }[] = [];

    for (const d = new Date(debut); d <= fin; d.setUTCDate(d.getUTCDate() + 1)) {
      const iso = jour(d);
      const semaine = d.getUTCDay();
      const declare = parDate.get(iso);
      calendrier.push({
        date: iso,
        etat: (declare?.etat ?? "undeclared") as EtatTeletravail,
        weekend: semaine === 0 || semaine === 6,
        issuDeRegle: declare?.issuDeRegle ?? false,
        exception: declare?.exception ?? false,
      });
    }

    return {
      calendrier,
      cumul: {
        teletravail: calendrier.filter((j) => j.etat === "telework").length,
        bureau: calendrier.filter((j) => j.etat === "office").length,
        // Les non déclarés hors week-end : c'est ce qui manque, pas ce qui est.
        nonDeclares: calendrier.filter((j) => j.etat === "undeclared" && !j.weekend).length,
      },
    };
  }

  /**
   * Les règles récurrentes d'une personne, actives ou non.
   *
   * Les inactives restent visibles : une règle désactivée explique pourquoi
   * les jours qu'elle produisait ont cessé d'apparaître. La faire disparaître
   * laisserait l'utilisateur devant un calendrier qui a changé sans raison.
   */
  async regles(userId: string) {
    return this.prisma.teleworkRule.findMany({
      where: { userId },
      orderBy: [{ active: "desc" }, { jourSemaine: "asc" }],
    });
  }

  /**
   * `EX-TLT-04`, `RG-TLT-03` — une règle est unique pour un couple jour de
   * semaine × date de début.
   */
  async creerRegle(
    donnees: { userId: string; jourSemaine: number; dateDebut: Date; dateFin?: Date | null },
    acteurId: string,
  ) {
    const existe = await this.prisma.teleworkRule.findUnique({
      where: {
        userId_jourSemaine_dateDebut: {
          userId: donnees.userId,
          jourSemaine: donnees.jourSemaine,
          dateDebut: donnees.dateDebut,
        },
      },
    });
    if (existe) throw new ErreurTeletravail("regle_en_double");

    const regle = await this.prisma.teleworkRule.create({
      data: {
        userId: donnees.userId,
        jourSemaine: donnees.jourSemaine,
        dateDebut: donnees.dateDebut,
        dateFin: donnees.dateFin ?? null,
      },
    });
    await this.audit.tracer({
      action: "telework.rule_create", typeEntite: "TeleworkRule", entiteId: regle.id, acteurId,
    });
    return regle;
  }

  /**
   * `EX-TLT-05` — prévisualiser une règle en langage naturel.
   *
   * Le libellé est composé de clés d'internationalisation et de valeurs, pas
   * de texte : `RG-GEN-08` interdit toute chaîne figée, y compris ici où la
   * tentation de concaténer est forte.
   */
  apercuRegle(regle: { jourSemaine: number; dateDebut: Date; dateFin?: Date | null }) {
    return {
      cle: regle.dateFin ? "teletravail.regle.avecFin" : "teletravail.regle.sansFin",
      valeurs: {
        jour: regle.jourSemaine,
        debut: jour(regle.dateDebut),
        ...(regle.dateFin ? { fin: jour(regle.dateFin) } : {}),
      },
    };
  }

  /**
   * `EX-TLT-06`, `RG-TLT-05` — générer les plannings à partir des règles, en
   * rendant compte des jours **créés et ignorés**.
   *
   * Une exception posée à la main n'est jamais écrasée : c'est tout l'objet du
   * marquage `RG-TLT-04`. Sans cela, la régénération annulerait silencieusement
   * les ajustements de l'agent.
   */
  async generer(
    userId: string,
    debut: Date,
    fin: Date,
    acteurId: string,
    permissions: ReadonlySet<string> = new Set(),
  ) {
    this.refuserAutrui(userId, acteurId, permissions, "telework:manage_any");
    const regles = await this.prisma.teleworkRule.findMany({
      where: {
        userId,
        active: true,
        dateDebut: { lte: fin },
        OR: [{ dateFin: null }, { dateFin: { gte: debut } }],
      },
    });

    let crees = 0;
    let ignores = 0;

    for (const d = new Date(debut); d <= fin; d.setUTCDate(d.getUTCDate() + 1)) {
      const semaine = d.getUTCDay();
      if (semaine === 0 || semaine === 6) continue;

      const applicable = regles.find(
        (r) =>
          r.jourSemaine === semaine &&
          r.dateDebut <= d &&
          (r.dateFin === null || r.dateFin >= d),
      );
      if (!applicable) continue;

      const date = new Date(d);
      const existant = await this.prisma.telework.findUnique({
        where: { userId_date: { userId, date } },
        select: { exception: true },
      });

      // Une exception posée à la main survit à la régénération.
      if (existant?.exception) {
        ignores++;
        continue;
      }
      if (existant) {
        ignores++;
        continue;
      }

      await this.prisma.telework.create({
        data: { userId, date, etat: "telework", issuDeRegle: true },
      });
      crees++;
    }

    await this.audit.tracer({
      action: "telework.generate", typeEntite: "Telework", acteurId,
      detail: { userId, crees, ignores },
    });
    return { crees, ignores };
  }

  /** `EX-TLT-07` — le télétravail de l'équipe à une date. */
  async equipeALaDate(perimetre: Perimetre, date: Date) {
    const agents = await this.prisma.user.findMany({
      where: { AND: [this.perimetres.filtreUtilisateur(perimetre), { actif: true }] },
      select: { id: true, prenom: true, nom: true },
      orderBy: [{ nom: "asc" }],
    });

    const declarations = await this.prisma.telework.findMany({
      where: { userId: { in: agents.map((a) => a.id) }, date },
      select: { userId: true, etat: true },
    });
    const parAgent = new Map(declarations.map((d) => [d.userId, d.etat]));

    return agents.map((a) => ({
      ...a,
      etat: (parAgent.get(a.id) ?? "undeclared") as EtatTeletravail,
    }));
  }

  /** `EX-TLT-08` — statistiques d'un agent : cumuls et moyenne mensuelle. */
  async statistiques(
    userId: string,
    annee: number,
    acteurId: string = userId,
    permissions: ReadonlySet<string> = new Set(),
  ) {
    // Lire le télétravail d'autrui est une action distincte d'y écrire :
    // `read_team` la gouverne, `manage_any` gouverne l'écriture (`RG-TLT-07`).
    this.refuserAutrui(userId, acteurId, permissions, "telework:read_team");
    const debut = new Date(Date.UTC(annee, 0, 1));
    const fin = new Date(Date.UTC(annee, 11, 31));
    const jours = await this.prisma.telework.findMany({
      where: { userId, date: { gte: debut, lte: fin }, etat: "telework" },
      select: { date: true },
    });

    const parMois = new Array(12).fill(0) as number[];
    for (const j of jours) parMois[j.date.getUTCMonth()]! += 1;

    const moisEcoules = Math.max(1, new Set(jours.map((j) => j.date.getUTCMonth())).size);
    /*
     * `annee` portait `jours.length` — le champ nommé « année » rendait un
     * NOMBRE DE JOURS. Le contrat du contrôleur annonce pourtant une année, et
     * la requête en prend une en entrée. Personne ne l'avait vu parce que
     * personne n'appelait cette route : aucun écran ne la consommait, donc
     * aucune assertion ne portait sur sa forme. Trouvé en écrivant le test de
     * `RG-TLT-07`.
     */
    return {
      annee,
      total: jours.length,
      parMois,
      moyenneMensuelle: Number((jours.length / moisEcoules).toFixed(1)),
    };
  }
}
