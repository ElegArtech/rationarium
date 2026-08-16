import { premierJourSemaine, joursVisibles } from "../../formats.js";
import type {
  Planning,
  TachePlanning,
  CongePlanning,
  EvenementPlanning,
  PermanencePlanning,
  TeletravailPlanning,
} from "../../api/planning.js";

/**
 * La logique de grille, isolée des composants.
 *
 * Elle est ici parce qu'elle est **testable sans rendu** et parce que les trois
 * vues du planning la partagent : semaine et mois lisent la même indexation,
 * seul le dessin change. La dupliquer dans deux composants la ferait diverger
 * au premier correctif de calcul de chevauchement.
 */

/** Les couches activables — `EX-PLN-06`. */
export type Couches = {
  disponibilites: boolean;
  activites: boolean;
  tachesProjet: boolean;
  tachesHorsProjet: boolean;
  evenements: boolean;
};

export const COUCHES_PAR_DEFAUT: Couches = {
  disponibilites: true,
  activites: true,
  tachesProjet: true,
  tachesHorsProjet: true,
  evenements: true,
};

/** Les sections de la légende filtrante — `EX-PLN-07`. */
export type Filtres = {
  statuts: ReadonlySet<string>;
  typesTache: ReadonlySet<string>;
  presence: ReadonlySet<string>;
  absences: ReadonlySet<string>;
  evenements: ReadonlySet<string>;
};

export const iso = (d: Date): string => d.toISOString().slice(0, 10);

export const dateDe = (s: string): Date => new Date(`${s}T00:00:00.000Z`);

export const ajouterJours = (s: string, n: number): string => {
  const d = dateDe(s);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};

/**
 * Le premier jour de la semaine d'une date, **selon le réglage global**.
 *
 * `getUTCDay()` rend 0 pour dimanche : le décalage `(j - premier + 7) % 7`
 * ramène la date au premier jour choisi, et non au lendemain. C'est l'erreur
 * classique de ce calcul, et elle ne se voit qu'un jour sur sept.
 *
 * `RG-PLN-03` et la vue 31 rendent ce premier jour paramétrable : une semaine
 * qui commencerait toujours le lundi contredirait le réglage qu'on offre.
 */
export const lundiDe = (s: string): string => {
  const d = dateDe(s);
  const premier = premierJourSemaine();
  return ajouterJours(s, -((d.getUTCDay() - premier + 7) % 7));
};

export const premierDuMois = (s: string): string => `${s.slice(0, 7)}-01`;

export const dernierDuMois = (s: string): string => {
  const d = dateDe(s);
  return iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
};

/** La période affichée, selon le mode. */
export function periodeDe(mode: "semaine" | "mois" | "activite", ancre: string) {
  if (mode === "mois") return { debut: premierDuMois(ancre), fin: dernierDuMois(ancre) };
  const debut = lundiDe(ancre);
  return { debut, fin: ajouterJours(debut, 6) };
}

export function decaler(mode: "semaine" | "mois" | "activite", ancre: string, sens: -1 | 1): string {
  if (mode === "mois") {
    const d = dateDe(ancre);
    // Le 31 janvier + un mois ne doit pas déborder sur mars : on ancre au 1er.
    return iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + sens, 1)));
  }
  return ajouterJours(ancre, sens * 7);
}

/**
 * Une occupation, quelle que soit sa nature.
 *
 * Le type discriminant permet à la cellule de traiter les cinq natures d'une
 * seule boucle — et surtout, d'appliquer la grammaire visuelle une seule fois.
 */
export type Occupation =
  | { genre: "tache"; cle: string; tache: TachePlanning }
  | { genre: "evenement"; cle: string; evenement: EvenementPlanning }
  | { genre: "permanence"; cle: string; permanence: PermanencePlanning };

export type Cellule = {
  /** `RG-PLN-13` — le congé occupe la cellule ; il n'y a rien d'autre à voir. */
  conge: CongePlanning | null;
  /** La demi-journée concernée, quand le congé n'occupe qu'une moitié. */
  demiJournee: "morning" | "afternoon" | null;
  lieu: TeletravailPlanning | null;
  occupations: Occupation[];
};

const dansLaPlage = (jour: string, debut: string, fin: string | null) =>
  jour >= debut && jour <= (fin ?? debut);

/**
 * La demi-journée d'un congé, **le jour donné**.
 *
 * Un congé du lundi après-midi au mercredi matin n'est une demi-journée qu'à
 * ses deux extrémités : le mardi est plein. Ne regarder que `demiJourneeDebut`
 * ferait afficher trois demi-journées.
 */
function demiJourneeDe(conge: CongePlanning, jour: string): "morning" | "afternoon" | null {
  if (jour === conge.dateDebut && conge.demiJourneeDebut) {
    return conge.demiJourneeDebut === "morning" ? "morning" : "afternoon";
  }
  if (jour === conge.dateFin && conge.demiJourneeFin) {
    return conge.demiJourneeFin === "morning" ? "morning" : "afternoon";
  }
  return null;
}

/**
 * Indexe les occupations par personne et par jour.
 *
 * Une seule passe sur chaque collection, puis une lecture en O(1) par cellule.
 * Sur une vue Mois — vingt personnes × vingt-deux jours, soit quatre cent
 * quarante cellules —, filtrer les tableaux dans chaque cellule referait le
 * travail quatre cent quarante fois.
 */
export function indexer(
  donnees: Planning,
  couches: Couches,
  filtres: Filtres,
): Map<string, Cellule> {
  const index = new Map<string, Cellule>();

  const cellule = (userId: string, jour: string): Cellule => {
    const cle = `${userId}|${jour}`;
    const existante = index.get(cle);
    if (existante) return existante;
    const neuve: Cellule = { conge: null, demiJournee: null, lieu: null, occupations: [] };
    index.set(cle, neuve);
    return neuve;
  };

  const jours = donnees.periode.jours;

  if (couches.tachesProjet || couches.tachesHorsProjet) {
    for (const t of donnees.occupations.taches) {
      if (t.horsProjet ? !couches.tachesHorsProjet : !couches.tachesProjet) continue;
      if (!filtres.statuts.has(t.statut)) continue;
      if (!filtres.typesTache.has(t.horsProjet ? "hors_projet" : "projet")) continue;
      for (const jour of jours) {
        if (!dansLaPlage(jour, t.dateDebut ?? "", t.dateFin)) continue;
        for (const userId of t.assignes) {
          cellule(userId, jour).occupations.push({ genre: "tache", cle: `t-${t.id}`, tache: t });
        }
      }
    }
  }

  if (couches.evenements) {
    for (const e of donnees.occupations.evenements) {
      const categorie = e.interventionExterieure ? "externe" : "interne";
      if (!filtres.evenements.has(categorie)) continue;
      for (const userId of e.participants) {
        cellule(userId, e.date).occupations.push({
          genre: "evenement",
          cle: `e-${e.id}`,
          evenement: e,
        });
      }
    }
  }

  if (couches.activites && donnees.occupations.permanences) {
    for (const p of donnees.occupations.permanences) {
      cellule(p.userId, p.date).occupations.push({
        genre: "permanence",
        cle: `p-${p.id}`,
        permanence: p,
      });
    }
  }

  // Le congé est posé après les occupations : il les recouvre à l'affichage,
  // mais il ne les efface pas de l'index — la carte de survol du mois les
  // montre encore, et c'est voulu.
  for (const c of donnees.occupations.conges) {
    const categorie = c.statut === "approved" ? "valide" : "attente";
    if (!filtres.absences.has(categorie)) continue;
    for (const jour of jours) {
      if (!dansLaPlage(jour, c.dateDebut, c.dateFin)) continue;
      const cel = cellule(c.userId, jour);
      cel.conge = c;
      cel.demiJournee = demiJourneeDe(c, jour);
    }
  }

  if (couches.disponibilites) {
    for (const t of donnees.occupations.teletravail) {
      // `RG-TLT-02` — « non déclaré » n'est pas « bureau » : il ne s'affiche
      // pas comme un lieu choisi.
      if (t.etat === "undeclared") continue;
      if (!filtres.presence.has(t.etat)) continue;
      cellule(t.userId, t.date).lieu = t;
    }
  }

  return index;
}

export const CELLULE_VIDE: Cellule = {
  conge: null,
  demiJournee: null,
  lieu: null,
  occupations: [],
};

/**
 * `RG-PLN-03` — **les jours visibles sont paramétrables globalement.**
 *
 * Le serveur rend la période entière ; le filtrage est ici, parce que c'est un
 * choix d'affichage et non de données — et parce qu'un utilisateur qui change
 * le réglage doit voir la grille suivre sans nouvelle requête.
 *
 * Le réglage était enregistré par la vue 31 et **appliqué nulle part** : la
 * grille montrait sept colonnes quoi qu'on choisisse.
 */
export function joursAffiches(jours: string[]): string[] {
  const visibles = joursVisibles();
  const retenus = jours.filter((j) => visibles.has(dateDe(j).getUTCDay()));
  // Une grille sans colonne ressemble à une panne : si le réglage exclut tout
  // ce que la période contient, on montre la période telle quelle.
  return retenus.length > 0 ? retenus : jours;
}

/** L'index des jours de vacances scolaires, pour la trame de fond. */
export function trameDesJours(donnees: Planning): Map<string, { ferie: boolean; vacances: string | null }> {
  const carte = new Map<string, { ferie: boolean; vacances: string | null }>();
  for (const jour of donnees.periode.jours) {
    const vacance = donnees.trame.vacances.find((v) => jour >= v.dateDebut && jour <= v.dateFin);
    carte.set(jour, {
      ferie: donnees.trame.joursChomes.includes(jour),
      vacances: vacance?.libelle ?? null,
    });
  }
  return carte;
}

/** Les initiales d'une personne, pour la pastille de ressource. */
export const initiales = (p: { prenom: string; nom: string }): string =>
  `${p.prenom.slice(0, 1)}${p.nom.slice(0, 1)}`.toUpperCase();
