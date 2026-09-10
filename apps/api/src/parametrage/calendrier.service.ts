import { ConflictException, Injectable, UnprocessableEntityException } from "@nestjs/common";
import { readFileSync } from "node:fs";
import { PrismaService } from "../prisma.service.js";
import { AuditService } from "../commun/audit.service.js";

/**
 * Calendrier de l'organisation — M19, `cadrage/01 § M19`, vue 31.
 *
 * Ce service porte une responsabilité que le reste du produit consomme sans
 * la connaître : **définir ce qu'est un jour ouvré**. Le décompte des congés
 * (`RG-CNG-16`), la génération des assignations et la trame de fond du
 * planning en dépendent tous.
 *
 * `RG-PRM-01` — un jour férié marqué **ouvré** compte comme jour travaillé.
 * C'est le piège du module : férié n'implique pas chômé. Une collectivité
 * peut travailler un 11 novembre.
 */

export type EchecCalendrier =
  | "dates_incoherentes"
  | "jour_deja_declare"
  | "introuvable"
  | "conflit_de_version";

export class ErreurCalendrier extends Error {
  constructor(
    readonly code: EchecCalendrier,
    readonly detail?: Record<string, unknown>,
  ) {
    super(code);
  }
}

const jour = (d: Date | string): string =>
  (typeof d === "string" ? d : d.toISOString()).slice(0, 10);

type ZoneScolaire = "A" | "B" | "C";
type PeriodeOfficielle = {
  anneeScolaire: string;
  zone: ZoneScolaire;
  libelle: string;
  dateDebut: string;
  dateFin: string;
};
type ReferenceScolaire = {
  collecte: string;
  sha256Source: string;
  periodes: PeriodeOfficielle[];
};

export const META_AUDIT_IMPORT_SCOLAIRE = Symbol("audit-import-scolaire");
export type ResultatImportScolaire = {
  crees: number;
  existants: number;
  [META_AUDIT_IMPORT_SCOLAIRE]?: {
    anneeScolaire: string;
    zone: ZoneScolaire;
    crees: number;
    existants: number;
    collecte: string;
    sha256Source: string;
    nombrePeriodes: number;
  };
};

const estZoneScolaire = (valeur: string | undefined): valeur is ZoneScolaire =>
  valeur === "A" || valeur === "B" || valeur === "C";

/**
 * ADR-0017 — l'instantané est lu à côté du lot compilé. En développement, le
 * repli pointe vers la référence versionnée ; la construction API la copie
 * dans `dist/parametrage`, qui est ensuite copiée telle quelle dans l'image.
 */
const chargerReferenceScolaire = (): ReferenceScolaire => {
  const chemins = [
    new URL("./periodes-metropole.json", import.meta.url),
    new URL("../../../../docs/references/calendrier/periodes-metropole.json", import.meta.url),
  ];
  let contenu: string | undefined;
  for (const chemin of chemins) {
    try {
      contenu = readFileSync(chemin, "utf8");
      break;
    } catch {
      // Le premier chemin n'existe qu'après construction ; le second en dev.
    }
  }
  if (!contenu) throw new Error("La référence scolaire embarquée est introuvable.");
  const reference = JSON.parse(contenu) as ReferenceScolaire;
  if (
    reference.sha256Source !== "777eb79d413ebaadd9be0338c5fa09a7261f5ddd0f3eb782d4f3c121cd35fa6e" ||
    reference.periodes.length !== 171
  ) {
    throw new Error("La référence scolaire embarquée ne correspond pas à l'instantané validé.");
  }
  return reference;
};

const REFERENCE_SCOLAIRE = chargerReferenceScolaire();

@Injectable()
export class CalendrierService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── Jours fériés ─────────────────────────────────────────────────────────

  /**
   * Les jours **chômés** d'une période — c'est-à-dire ceux qui ne comptent pas
   * comme travaillés.
   *
   * `RG-PRM-02` — un jour récurrent se reconduit automatiquement chaque année.
   * Il est donc stocké une fois et projeté sur l'année demandée, plutôt que
   * dupliqué à chaque exercice.
   */
  async joursChomes(debut: Date, fin: Date): Promise<Set<string>> {
    const anneeDebut = debut.getUTCFullYear();
    const anneeFin = fin.getUTCFullYear();

    const feries = await this.prisma.holiday.findMany({
      where: { OR: [{ date: { gte: debut, lte: fin } }, { recurrent: true }] },
      select: { date: true, ouvre: true, recurrent: true },
    });

    const chomes = new Set<string>();
    for (const f of feries) {
      // Un férié « ouvré » ne chôme pas : il ne rejoint pas l'ensemble.
      if (f.ouvre) continue;

      if (!f.recurrent) {
        chomes.add(jour(f.date));
        continue;
      }
      // Récurrent : projeté sur chaque année de la période.
      for (let annee = anneeDebut; annee <= anneeFin; annee++) {
        const projete = new Date(f.date);
        projete.setUTCFullYear(annee);
        if (projete >= debut && projete <= fin) chomes.add(jour(projete));
      }
    }
    return chomes;
  }

  /**
   * `RG-CNG-16` — nombre de jours **ouvrés** d'une période : week-ends exclus,
   * jours fériés non ouvrés exclus.
   *
   * `RG-CNG-17` — une demi-journée peut être précisée en début et en fin de
   * période ; le décompte en tient compte au demi-jour près.
   *
   * Cette fonction est le cœur comptable du module congés. Elle est ici, dans
   * le calendrier, parce que la notion de jour ouvré n'appartient pas aux
   * congés : elle leur préexiste.
   */
  async joursOuvres(
    debut: Date,
    fin: Date,
    options: { demiJourneeDebut?: boolean | undefined; demiJourneeFin?: boolean | undefined } = {},
  ): Promise<number> {
    const chomes = await this.joursChomes(debut, fin);

    let compte = 0;
    const premier = jour(debut);
    const dernier = jour(fin);
    const ouvrables: string[] = [];

    for (const d = new Date(debut); d <= fin; d.setUTCDate(d.getUTCDate() + 1)) {
      const semaine = d.getUTCDay();
      if (semaine === 0 || semaine === 6) continue; // week-end
      const iso = jour(d);
      if (chomes.has(iso)) continue;
      ouvrables.push(iso);
      compte += 1;
    }

    // Les demi-journées ne s'appliquent que si le jour concerné est ouvrable :
    // retrancher une demi-journée sur un samedi fausserait le décompte.
    if (options.demiJourneeDebut && ouvrables.includes(premier)) compte -= 0.5;

    // RG-CNG-18 — sur un congé d'UN SEUL jour, les deux demi-journées désignent
    // la même : on ne retranche qu'une fois, sinon le jour vaudrait zéro.
    //
    // La garde porte sur ce cas précis et non sur `premier === dernier` en
    // général : dans une répartition par année (RG-CNG-19), un segment d'un
    // seul jour peut légitimement porter une demi-journée de fin, la
    // demi-journée de début appartenant au segment de l'année précédente.
    const dejaRetranchee = options.demiJourneeDebut === true && dernier === premier;
    if (options.demiJourneeFin && ouvrables.includes(dernier) && !dejaRetranchee) compte -= 0.5;

    return Math.max(0, compte);
  }

  /**
   * `RG-CNG-19` — une demande à cheval sur deux années civiles est **répartie
   * par année**, et chaque année sera contrôlée contre son propre solde.
   */
  async repartitionParAnnee(
    debut: Date,
    fin: Date,
    options: { demiJourneeDebut?: boolean | undefined; demiJourneeFin?: boolean | undefined } = {},
  ): Promise<{ annee: number; jours: number }[]> {
    const premiereAnnee = debut.getUTCFullYear();
    const derniereAnnee = fin.getUTCFullYear();
    if (premiereAnnee === derniereAnnee) {
      return [{ annee: premiereAnnee, jours: await this.joursOuvres(debut, fin, options) }];
    }

    const parts: { annee: number; jours: number }[] = [];
    for (let annee = premiereAnnee; annee <= derniereAnnee; annee++) {
      const borneDebut = annee === premiereAnnee ? debut : new Date(Date.UTC(annee, 0, 1));
      const borneFin = annee === derniereAnnee ? fin : new Date(Date.UTC(annee, 11, 31));
      const jours = await this.joursOuvres(borneDebut, borneFin, {
        demiJourneeDebut: annee === premiereAnnee && options.demiJourneeDebut === true,
        demiJourneeFin: annee === derniereAnnee && options.demiJourneeFin === true,
      });
      if (jours > 0) parts.push({ annee, jours });
    }
    return parts;
  }

  async declarerJourFerie(
    donnees: { date: Date; libelle: string; type?: string; ouvre?: boolean; recurrent?: boolean },
    acteurId: string,
  ) {
    const existe = await this.prisma.holiday.findUnique({
      where: { date: donnees.date },
      select: { id: true },
    });
    if (existe) throw new ErreurCalendrier("jour_deja_declare", { date: jour(donnees.date) });

    const ferie = await this.prisma.holiday.create({
      data: {
        date: donnees.date,
        libelle: donnees.libelle,
        // « legal » est réservé aux fériés légaux, que seul l'import pose.
        // Un jour déclaré à la main est un jour PARTICULIER de l'organisation :
        // la vue 31 compte les fériés légaux à part, ce qui n'aurait aucun sens
        // si tout portait ce type par défaut.
        type: donnees.type ?? "local",
        ouvre: donnees.ouvre ?? false,
        recurrent: donnees.recurrent ?? false,
      },
    });
    await this.audit.tracer({
      action: "holiday.create", typeEntite: "Holiday", entiteId: ferie.id, acteurId,
    });
    return ferie;
  }

  /** `RG-GEN-07` — la version relue participe au prédicat atomique d'écriture. */
  async modifierJourFerie(
    id: string,
    donnees: { version: number; ouvre?: boolean; recurrent?: boolean },
  ) {
    const modifie = await this.prisma.holiday.updateMany({
      where: { id, version: donnees.version },
      data: {
        ...(donnees.ouvre === undefined ? {} : { ouvre: donnees.ouvre }),
        ...(donnees.recurrent === undefined ? {} : { recurrent: donnees.recurrent }),
        version: { increment: 1 },
      },
    });
    if (modifie.count === 0) {
      const actuel = await this.prisma.holiday.findUnique({
        where: { id },
        select: { version: true },
      });
      if (!actuel) throw new ErreurCalendrier("introuvable");
      throw new ErreurCalendrier("conflit_de_version", {
        attendue: actuel.version,
        recue: donnees.version,
      });
    }
    return this.prisma.holiday.findUniqueOrThrow({ where: { id } });
  }

  /**
   * `RG-PRM-03` — l'import rend compte : créés / déjà existants.
   *
   * Sous `C1`, l'import ne va chercher aucune source en ligne : il reçoit la
   * liste, calculée ou fournie. Les fériés français mobiles se calculent — la
   * date de Pâques détermine cinq d'entre eux.
   */
  async importerJoursFeries(
    annee: number,
    acteurId: string,
  ): Promise<{ crees: number; existants: number }> {
    const feries = this.feriesFrancais(annee);
    let crees = 0;
    let existants = 0;

    for (const f of feries) {
      const existe = await this.prisma.holiday.findUnique({
        where: { date: f.date },
        select: { id: true },
      });
      if (existe) {
        existants++;
        continue;
      }
      await this.prisma.holiday.create({
        data: { date: f.date, libelle: f.libelle, type: "legal", ouvre: false, recurrent: f.fixe },
      });
      crees++;
    }

    await this.audit.tracer({
      action: "holiday.import", typeEntite: "Holiday", acteurId,
      detail: { annee, crees, existants },
    });
    return { crees, existants };
  }

  /**
   * Jours fériés légaux français.
   *
   * Les cinq mobiles dérivent de Pâques, calculée par l'algorithme de Meeus —
   * la seule partie de ce module qui mérite un commentaire, parce qu'elle est
   * illisible sans référence.
   */
  private feriesFrancais(annee: number): { date: Date; libelle: string; fixe: boolean }[] {
    const paques = this.dimanchePaques(annee);
    const decale = (jours: number) => {
      const d = new Date(paques);
      d.setUTCDate(d.getUTCDate() + jours);
      return d;
    };
    const fixe = (mois: number, jourDuMois: number) => new Date(Date.UTC(annee, mois - 1, jourDuMois));

    return [
      { date: fixe(1, 1), libelle: "Jour de l'an", fixe: true },
      { date: decale(1), libelle: "Lundi de Pâques", fixe: false },
      { date: fixe(5, 1), libelle: "Fête du Travail", fixe: true },
      { date: fixe(5, 8), libelle: "Victoire 1945", fixe: true },
      { date: decale(39), libelle: "Ascension", fixe: false },
      { date: decale(50), libelle: "Lundi de Pentecôte", fixe: false },
      { date: fixe(7, 14), libelle: "Fête nationale", fixe: true },
      { date: fixe(8, 15), libelle: "Assomption", fixe: true },
      { date: fixe(11, 1), libelle: "Toussaint", fixe: true },
      { date: fixe(11, 11), libelle: "Armistice 1918", fixe: true },
      { date: fixe(12, 25), libelle: "Noël", fixe: true },
    ];
  }

  /** Algorithme de Meeus / Jones / Butcher, calendrier grégorien. */
  private dimanchePaques(annee: number): Date {
    const a = annee % 19;
    const b = Math.floor(annee / 100);
    const c = annee % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const mois = Math.floor((h + l - 7 * m + 114) / 31);
    const jourDuMois = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(Date.UTC(annee, mois - 1, jourDuMois));
  }

  // ── Vacances scolaires ───────────────────────────────────────────────────

  /** `RG-PRM-04` — les dates sont cohérentes : fin postérieure au début. */
  async declarerVacances(
    donnees: {
      libelle: string; dateDebut: Date; dateFin: Date;
      zone: string; anneeScolaire: string;
    },
    acteurId: string,
  ) {
    if (donnees.dateFin <= donnees.dateDebut) throw new ErreurCalendrier("dates_incoherentes");

    const periode = await this.prisma.schoolVacation.create({
      data: { ...donnees, importee: false },
    });
    await this.audit.tracer({
      action: "school_vacation.create",
      typeEntite: "SchoolVacation",
      entiteId: periode.id,
      acteurId,
    });
    return periode;
  }

  /**
   * D-RM-15 / ADR-0017 — import strictement local, année-zone explicite ou
   * héritée du réglage global. `createMany(skipDuplicates)` fait porter
   * l'idempotence concurrente par l'unicité déjà présente en base.
   */
  async importerVacances(
    anneeScolaire: string,
    zoneDemandee?: ZoneScolaire,
  ): Promise<ResultatImportScolaire> {
    const zone = zoneDemandee ?? await this.zoneScolaireConfiguree();
    const periodes = zone
      ? REFERENCE_SCOLAIRE.periodes.filter(
          (periode) => periode.anneeScolaire === anneeScolaire && periode.zone === zone,
        )
      : [];
    if (!zone || periodes.length === 0) {
      throw new UnprocessableEntityException({
        cle: "erreurs:calendrierScolaireIndisponible",
        message: "Aucune période officielle n'est disponible pour cette année scolaire et cette zone. Choisissez une combinaison disponible.",
      });
    }

    const donnees = periodes.map((periode) => ({
      libelle: periode.libelle,
      dateDebut: new Date(`${periode.dateDebut}T00:00:00.000Z`),
      dateFin: new Date(`${periode.dateFin}T00:00:00.000Z`),
      zone: periode.zone,
      anneeScolaire: periode.anneeScolaire,
      importee: true,
    }));
    const creees = await this.prisma.$transaction(async (tx) => {
      const insertion = await tx.schoolVacation.createMany({
        data: donnees,
        skipDuplicates: true,
      });
      const stockees = await tx.schoolVacation.findMany({
        where: {
          zone,
          anneeScolaire,
          libelle: { in: donnees.map((periode) => periode.libelle) },
        },
      });
      const attendues = new Map(donnees.map((periode) => [periode.libelle, periode]));
      const conflit = stockees.find((periode) => {
        const attendue = attendues.get(periode.libelle);
        return !attendue || !periode.importee ||
          jour(periode.dateDebut) !== jour(attendue.dateDebut) ||
          jour(periode.dateFin) !== jour(attendue.dateFin);
      });
      if (conflit) {
        throw new ConflictException({
          cle: "erreurs:periodeScolaireEnConflit",
          message: "Une période saisie manuellement porte le même nom qu'une période officielle avec d'autres dates. Renommez ou supprimez la période manuelle avant de relancer l'import.",
          detail: { libelle: conflit.libelle, zone, anneeScolaire },
        });
      }
      return insertion.count;
    });
    const resultat: ResultatImportScolaire = {
      crees: creees,
      existants: periodes.length - creees,
    };
    Object.defineProperty(resultat, META_AUDIT_IMPORT_SCOLAIRE, {
      enumerable: false,
      value: {
        anneeScolaire,
        zone,
        ...resultat,
        collecte: REFERENCE_SCOLAIRE.collecte,
        sha256Source: REFERENCE_SCOLAIRE.sha256Source,
        nombrePeriodes: REFERENCE_SCOLAIRE.periodes.length,
      },
    });
    return resultat;
  }

  /** `EX-PLN-14` — trame de fond du planning : fériés et vacances scolaires. */
  async trameDeFond(debut: Date, fin: Date, zone?: string) {
    const zoneEffective = estZoneScolaire(zone) ? zone : await this.zoneScolaireConfiguree();
    const [chomes, vacances] = await Promise.all([
      this.joursChomes(debut, fin),
      this.prisma.schoolVacation.findMany({
        where: {
          AND: [
            { dateDebut: { lte: fin } },
            { dateFin: { gte: debut } },
            // Une zone globale vide signifie « aucune trame scolaire », pas
            // « superposer les trois zones ». Une zone explicite garde la
            // priorité pour la lecture unitaire historique.
            ...(zoneEffective ? [{ zone: zoneEffective }] : [{ zone: "__aucune_zone__" }]),
          ],
        },
        select: { libelle: true, dateDebut: true, dateFin: true, zone: true },
      }),
    ]);
    return { joursChomes: [...chomes].sort(), vacances };
  }

  private async zoneScolaireConfiguree(): Promise<ZoneScolaire | undefined> {
    const reglage = await this.prisma.setting.findUnique({
      where: { cle: "planning.schoolZone" },
      select: { valeur: true },
    });
    return estZoneScolaire(reglage?.valeur) ? reglage.valeur : undefined;
  }

  /**
   * M19 — les réglages globaux.
   *
   * Seuls les réglages **publics** sortent : la table porte aussi des limites
   * internes (plafond journalier, durée de session) qu'un écran de préférences
   * n'a pas à exposer. Le drapeau est en base, il ne se décide pas ici.
   */
  async reglages() {
    const lignes = await this.prisma.setting.findMany({
      where: { public: true },
      orderBy: { cle: "asc" },
    });
    return Object.fromEntries(lignes.map((l) => [l.cle, l.valeur]));
  }

  /**
   * Enregistre des réglages, **en une transaction**.
   *
   * Un enregistrement partiel laisserait l'application dans un état que
   * personne n'a choisi : format de date changé, premier jour de la semaine
   * inchangé. Tout passe, ou rien.
   */
  async enregistrerReglages(reglages: Record<string, string>, acteurId: string) {
    const cles = Object.keys(reglages);
    if (cles.length === 0) return {};

    await this.prisma.$transaction(
      cles.map((cle) =>
        this.prisma.setting.upsert({
          where: { cle },
          create: { cle, valeur: reglages[cle]!, public: true },
          update: { valeur: reglages[cle]!, version: { increment: 1 } },
        }),
      ),
    );
    await this.audit.tracer({
      action: "settings.update", typeEntite: "Setting", entiteId: cles.join(","), acteurId,
      detail: { cles },
    });
    return this.reglages();
  }

  /**
   * M19 / `RG-PRM-01..03` — les jours fériés d'une année et leurs statistiques.
   *
   * Le compte de jours **ouvrés** est mis en avant parce que c'est le réglage
   * à effet lointain : un férié marqué ouvré compte comme travaillé dans le
   * décompte des congés. Le brief exige que la conséquence soit explicite.
   */
  async joursFeries(annee: number) {
    const debut = new Date(Date.UTC(annee, 0, 1));
    const fin = new Date(Date.UTC(annee, 11, 31));
    const lignes = await this.prisma.holiday.findMany({
      where: { OR: [{ date: { gte: debut, lte: fin } }, { recurrent: true }] },
      orderBy: { date: "asc" },
    });

    // `RG-PRM-02` — un récurrent est stocké UNE fois et projeté sur l'année
    // demandée, exactement comme le fait `joursChomes`. Sans cette projection,
    // une année jamais importée s'afficherait vide dans la vue 31 alors que le
    // décompte des congés, lui, y voit bien ses fériés : les deux lectures se
    // contrediraient, et c'est le paramétrage qui aurait tort.
    const parDate = new Map<string, (typeof lignes)[number]>();
    for (const f of lignes) {
      if (f.date >= debut && f.date <= fin) parDate.set(jour(f.date), f);
    }
    for (const f of lignes) {
      if (!f.recurrent) continue;
      const projete = new Date(f.date);
      projete.setUTCFullYear(annee);
      const cle = jour(projete);
      // Une déclaration explicite pour l'année l'emporte sur la projection :
      // c'est ainsi qu'on chôme un jour habituellement travaillé, ou l'inverse.
      if (!parDate.has(cle)) parDate.set(cle, { ...f, date: projete });
    }

    const feries = [...parDate.values()].sort((a, b) => a.date.getTime() - b.date.getTime());

    return {
      feries,
      statistiques: {
        total: feries.length,
        chomes: feries.filter((f) => !f.ouvre).length,
        ouvres: feries.filter((f) => f.ouvre).length,
        legaux: feries.filter((f) => f.type === "legal").length,
      },
    };
  }

  /** M19 / `RG-PRM-04` — les vacances scolaires d'une année et d'une zone. */
  async vacances(anneeScolaire?: string, zone?: ZoneScolaire) {
    const vacances = await this.prisma.schoolVacation.findMany({
      ...(
        anneeScolaire || zone
          ? {
              where: {
                ...(anneeScolaire ? { anneeScolaire } : {}),
                ...(zone ? { zone } : {}),
              },
            }
          : {}
      ),
      orderBy: { dateDebut: "asc" },
    });

    const zonesParAnnee = new Map<string, Set<ZoneScolaire>>();
    for (const periode of REFERENCE_SCOLAIRE.periodes) {
      const zones = zonesParAnnee.get(periode.anneeScolaire) ?? new Set<ZoneScolaire>();
      zones.add(periode.zone);
      zonesParAnnee.set(periode.anneeScolaire, zones);
    }
    return {
      vacances,
      statistiques: {
        total: vacances.length,
        importees: vacances.filter((v) => v.importee).length,
        manuelles: vacances.filter((v) => !v.importee).length,
      },
      reference: {
        collecte: REFERENCE_SCOLAIRE.collecte,
        sha256Source: REFERENCE_SCOLAIRE.sha256Source,
        nombrePeriodes: REFERENCE_SCOLAIRE.periodes.length,
        combinaisons: [...zonesParAnnee.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([anneeDisponible, zones]) => ({
            anneeScolaire: anneeDisponible,
            zones: [...zones].sort(),
          })),
      },
    };
  }

}
