import i18next from "i18next";

/**
 * Formats de date et d'heure — `RG-GEN-09`.
 *
 * **Jamais de formatage manuel.** Écrire `d.slice(8,10) + "/" + d.slice(5,7)`
 * produit une date française lisible par un lecteur anglais comme un mois de
 * trente et un. Le format suit la langue courante, et `Intl` s'en charge.
 *
 * Les dates métier arrivent en `AAAA-MM-JJ` (ADR-0010) : sans heure ni fuseau.
 * Elles sont interprétées **en UTC** pour la même raison qui les a fait choisir
 * ainsi — `new Date("2026-09-01")` lu à Paris en heure d'été reste le 1er
 * septembre, mais `new Date("2026-09-01T00:00:00")` lu à Tahiti devient le 31
 * août. Le fuseau n'a rien à faire dans une date d'échéance.
 */

/*
 * `i18next.language` est **indéfini tant que l'initialisation n'a pas eu
 * lieu** : dans un test unitaire qui n'importe pas la configuration, ou au
 * tout premier rendu. Le défaut français est explicite plutôt que subi.
 */
const langueInterface = (): string => (i18next.language?.startsWith("en") ? "en-GB" : "fr-FR");

/**
 * ────────────────────────────────────────────────────────────────────────────
 * `RG-GEN-09` — **les formats suivent le paramétrage global**, pas seulement
 * la langue.
 *
 * DÉFAUT TROUVÉ PAR L'AUDIT L-28. La vue 31 laissait choisir un format de date
 * parmi cinq et un format d'heure parmi trois ; les réglages étaient
 * enregistrés, relus, affichés — et **jamais appliqués nulle part**. Un
 * utilisateur qui choisissait « AAAA-MM-JJ » ne voyait rien changer.
 *
 * Les réglages sont poussés ici par la coquille, une fois chargés. Ce module
 * reste sans dépendance — il ne va pas les chercher, on les lui donne : une
 * fonction de formatage qui déclencherait une requête serait appelée des
 * centaines de fois par rendu de grille.
 * ────────────────────────────────────────────────────────────────────────────
 */
let reglages: Record<string, string> = {};

export const appliquerReglages = (valeurs: Record<string, string>): void => {
  reglages = valeurs;
};

/** Le réglage courant, ou son défaut. */
const reglage = (cle: string, defaut: string): string => reglages[cle] ?? defaut;

/*
 * La région se règle en vue 31 (« Langue et région ») et **s'applique ici**.
 * Elle décide du nom des mois et des jours de la semaine — exactement ce que
 * l'aide du réglage annonce. Sans ce branchement, le réglage s'enregistrerait
 * sans rien changer : le défaut trouvé par l'audit L-28, sur cette vue-là.
 *
 * Non réglée, la région suit la langue de l'interface, comme auparavant.
 */
const locale = (): string => {
  const choisie = reglage("display.locale", "");
  return choisie === "" ? langueInterface() : choisie;
};

/**
 * Le premier jour de la semaine — `0` dimanche, `1` lundi.
 *
 * Employé par le planning : `RG-PLN-03` et la vue 31 le rendent paramétrable,
 * et une semaine qui commencerait toujours le lundi contredirait le réglage
 * qu'on vient d'offrir.
 */
export const premierJourSemaine = (): number => {
  const lu = Number(reglage("display.firstDayOfWeek", "1"));
  return lu === 0 ? 0 : 1;
};

/**
 * Les jours visibles du planning — `RG-PLN-03`.
 *
 * « Au moins un jour doit rester sélectionné » : un réglage vide ou illisible
 * rendrait une grille sans colonne, ce qui ressemble à une panne. On retombe
 * alors sur la semaine ouvrée.
 */
export const joursVisibles = (): ReadonlySet<number> => {
  const lu = reglage("planning.visibleDays", "1,2,3,4,5")
    .split(",")
    .map((x) => x.trim())
    // Le filtre porte sur la CHAÎNE avant la conversion : `Number("")` vaut
    // zéro, et un réglage vide aurait donné « dimanche seulement » — une
    // grille d'un jour, là où on attendait le défaut.
    .filter((x) => /^[0-6]$/.test(x))
    .map(Number);
  return new Set(lu.length > 0 ? lu : [1, 2, 3, 4, 5]);
};

/** Une date métier vers un instant UTC, ou `null` si la valeur est absente. */
const instant = (valeur: string | Date | null | undefined): Date | null => {
  if (!valeur) return null;
  if (valeur instanceof Date) return valeur;
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(valeur) ? `${valeur}T00:00:00.000Z` : valeur;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * Les cinq formats de date de la vue 31, traduits en options `Intl`.
 *
 * Les libellés viennent du paramétrage — ils sont montrés à l'utilisateur avec
 * un exemple —, et ce sont eux qui font foi. `Intl` reste le moteur : un
 * formatage manuel produirait « 03/01/2026 » lu comme un 3 janvier par un
 * lecteur anglais.
 */
const OPTIONS_DATE: Record<string, Intl.DateTimeFormatOptions> = {
  "JJ/MM/AAAA": { day: "2-digit", month: "2-digit", year: "numeric" },
  "MM/JJ/AAAA": { day: "2-digit", month: "2-digit", year: "numeric" },
  "AAAA-MM-JJ": { day: "2-digit", month: "2-digit", year: "numeric" },
  "J Mois AAAA": { day: "numeric", month: "long", year: "numeric" },
  "Jour J Mois AAAA": { weekday: "long", day: "numeric", month: "long", year: "numeric" },
};

/** `01/03/2026` par défaut ; le format suit le réglage global. */
export const formaterDate = (valeur: string | Date | null | undefined): string => {
  const d = instant(valeur);
  if (!d) return "—";
  const format = reglage("display.dateFormat", "JJ/MM/AAAA");

  // Deux formats ne s'expriment pas par des options `Intl` : l'ordre
  // américain et l'ordre ISO. Ils se construisent à partir des PARTIES
  // rendues par `Intl`, jamais par découpage de chaîne — c'est la seule façon
  // d'obtenir les bons chiffres sans réimplémenter un calendrier.
  if (format === "AAAA-MM-JJ" || format === "MM/JJ/AAAA") {
    const parties = new Intl.DateTimeFormat("en-CA", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "UTC",
    }).formatToParts(d);
    const valeurDe = (type: string) => parties.find((p) => p.type === type)?.value ?? "";
    const [a, m, j] = [valeurDe("year"), valeurDe("month"), valeurDe("day")];
    return format === "AAAA-MM-JJ" ? `${a}-${m}-${j}` : `${m}/${j}/${a}`;
  }

  return new Intl.DateTimeFormat(locale(), {
    ...(OPTIONS_DATE[format] ?? OPTIONS_DATE["JJ/MM/AAAA"]!),
    timeZone: "UTC",
  }).format(d);
};

/**
 * Le mois d'une frise — « mars 26 ».
 *
 * La bande de mois du Gantt (section 19 des maquettes) nomme chaque mois
 * traversé, suivi des deux derniers chiffres de l'année. `formaterDate` ne sait
 * pas le rendre : il produit une date complète, jour compris.
 *
 * L'année est interpolée **en chaîne**. Un `{annee, number}` la rendrait
 * « 2 026 » en français, séparateur de milliers compris — le piège consigné.
 */
export const formaterMoisCourt = (valeur: Date): string => {
  const mois = new Intl.DateTimeFormat(locale(), { month: "short", timeZone: "UTC" }).format(valeur);
  return `${mois} ${String(valeur.getUTCFullYear()).slice(2)}`;
};

/**
 * Une heure `HH:MM`, selon le format global — 24 h, 24 h avec secondes, 12 h.
 *
 * Les horaires métier arrivent en chaîne `HH:MM` : ils n'ont ni date ni
 * fuseau, et les faire passer par un `Date` réintroduirait les deux.
 */
export const formaterHeure = (valeur: string | null | undefined): string => {
  if (!valeur) return "—";
  const [h, m, s] = valeur.split(":");
  const heures = Number(h);
  if (!Number.isInteger(heures)) return valeur;
  const minutes = (m ?? "00").padStart(2, "0");

  switch (reglage("display.timeFormat", "24h")) {
    case "24h-secondes":
      return `${String(heures).padStart(2, "0")}:${minutes}:${(s ?? "00").padStart(2, "0")}`;
    case "12h": {
      const suffixe = heures < 12 ? "AM" : "PM";
      const douze = heures % 12 === 0 ? 12 : heures % 12;
      return `${String(douze).padStart(2, "0")}:${minutes} ${suffixe}`;
    }
    default:
      return `${String(heures).padStart(2, "0")}:${minutes}`;
  }
};

/** Forme longue, pour les en-têtes : `1 mars 2026`. */
export const formaterDateLongue = (valeur: string | Date | null | undefined): string => {
  const d = instant(valeur);
  if (!d) return "—";
  return new Intl.DateTimeFormat(locale(), {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
};

/**
/**
 * Forme longue précédée du jour de semaine : `jeudi 13 août 2026`.
 *
 * Employée par le surtitre du tableau de bord (vue 06), où la date situe tout
 * ce que la page affirme — « à venir », « en retard », « cette semaine ». Le
 * jour de semaine y compte autant que le quantième : c'est lui qui dit où l'on
 * en est de la semaine ouvrée.
 */
export const formaterDateAvecJour = (valeur: string | Date | null | undefined): string => {
  const d = instant(valeur);
  if (!d) return "—";
  return new Intl.DateTimeFormat(locale(), {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
};

/**
 * Le mois et son année, depuis une date : `Août 2026`.
 *
 * La maquette 08 titre le mois, pas une plage de dates : « Du 01/08/2026 au
 * 31/08/2026 » dit la même chose en trois fois plus large, sur une barre
 * d'outils déjà chargée. `Intl` donne la minuscule en français — c'est la
 * règle en cours de phrase, pas en tête d'un intitulé.
 */
export const formaterMois = (valeur: string | Date | null | undefined): string => {
  const d = instant(valeur);
  if (!d) return "—";
  const rendu = new Intl.DateTimeFormat(locale(), {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
  return rendu.charAt(0).toUpperCase() + rendu.slice(1);
};

/**
 * Le même, depuis un couple année / mois — la forme dont disposent les vues qui
 * naviguent de mois en mois sans porter de date.
 *
 * L'année n'est **pas** formatée comme un nombre : `{annee, number}` rendrait
 * « 2 026 » en français, séparateur de milliers compris. `Intl` avec
 * `year: "numeric"` ne fait pas cette erreur, contrairement à une
 * interpolation ICU.
 */
export const formaterMoisAnnee = (annee: number, mois: number): string =>
  formaterMois(new Date(Date.UTC(annee, mois, 1)));

/** Le seul nom du mois d'une date : `août`. */
export const formaterMoisSeul = (valeur: string | Date | null | undefined): string => {
  const d = instant(valeur);
  if (!d) return "—";
  return new Intl.DateTimeFormat(locale(), { month: "long", timeZone: "UTC" }).format(d);
};

/**
 * Un nombre, avec le séparateur de milliers de la langue.
 *
 * `1 200 h` en français, `1,200 h` en anglais. Concaténer sans passer par
 * `Intl` produirait `1200` partout, ce qui se lit mal dès quatre chiffres.
 */
export const formaterNombre = (n: number, decimales = 0): string =>
  new Intl.NumberFormat(locale(), {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }).format(n);

/** L'écart en jours entiers entre une échéance et aujourd'hui. Négatif = retard. */
export const joursAvant = (echeance: string | Date | null | undefined): number | null => {
  const d = instant(echeance);
  if (!d) return null;
  const aujourdhui = new Date();
  const minuitUtc = Date.UTC(
    aujourdhui.getFullYear(),
    aujourdhui.getMonth(),
    aujourdhui.getDate(),
  );
  return Math.round((d.getTime() - minuitUtc) / 86_400_000);
};
