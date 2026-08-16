/**
 * `EX-PLN-15` — export et import ICS, écrits ici plutôt qu'empruntés.
 *
 * `C1` et `ADR-0013` : une dépendance se justifie, elle ne s'ajoute pas par
 * commodité. Le sous-ensemble d'iCalendar dont ce produit a besoin — des
 * `VEVENT` de journée entière ou horodatés, sans fuseau, sans pièce jointe,
 * sans alarme — tient en deux fonctions. Une bibliothèque complète apporterait
 * ici un format qu'on n'écrit pas et qu'on ne lit pas.
 *
 * Ce que la RFC 5545 impose et qui se perd facilement :
 *
 * - **Les fins de ligne sont CRLF**, pas LF. Un lecteur strict rejette le
 *   fichier entier sur ce seul point.
 * - **Les lignes se plient à 75 octets**, la suite préfixée d'une espace. Ce
 *   sont des *octets*, pas des caractères : « é » en compte deux, et plier au
 *   milieu d'un caractère produit un fichier illisible.
 * - **Quatre caractères s'échappent** dans un texte : la barre oblique
 *   inverse, le point-virgule, la virgule et le saut de ligne.
 * - **Une date de fin de journée entière est exclusive** : un événement d'un
 *   jour porte `DTEND` au lendemain. L'oubli décale tout d'une journée, ce qui
 *   ne se voit qu'à la lecture dans un autre agenda.
 */

const CRLF = "\r\n";

/** Échappe un texte selon la RFC 5545 § 3.3.11. */
const echapper = (texte: string): string =>
  texte
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
    .replaceAll(/\r?\n/g, "\\n");

const desechapper = (texte: string): string =>
  texte
    .replaceAll("\\n", "\n")
    .replaceAll("\\N", "\n")
    .replaceAll("\\,", ",")
    .replaceAll("\\;", ";")
    .replaceAll("\\\\", "\\");

/**
 * Plie une ligne à 75 **octets**.
 *
 * Le découpage se fait sur les points de code, en mesurant la taille encodée :
 * couper au milieu d'un caractère multi-octet produirait une séquence UTF-8
 * invalide que le lecteur d'en face ne saurait pas réparer.
 */
export function plier(ligne: string): string {
  const octets = (s: string) => new TextEncoder().encode(s).length;
  if (octets(ligne) <= 75) return ligne;

  const morceaux: string[] = [];
  let courant = "";
  let limite = 75;

  for (const caractere of ligne) {
    if (octets(courant + caractere) > limite) {
      morceaux.push(courant);
      courant = caractere;
      // Les lignes de continuation portent une espace en tête, qui compte.
      limite = 74;
    } else {
      courant += caractere;
    }
  }
  morceaux.push(courant);
  return morceaux.join(`${CRLF} `);
}

/** Déplie : une ligne qui commence par une espace ou une tabulation continue la précédente. */
export function deplier(texte: string): string[] {
  const lignes: string[] = [];
  for (const brute of texte.split(/\r?\n/)) {
    if ((brute.startsWith(" ") || brute.startsWith("\t")) && lignes.length > 0) {
      lignes[lignes.length - 1] += brute.slice(1);
    } else {
      lignes.push(brute);
    }
  }
  return lignes.filter((l) => l.length > 0);
}

const jourIcs = (iso: string): string => iso.replaceAll("-", "");

const lendemain = (iso: string): string => {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

const horodatage = (iso: string, heure: string): string =>
  `${jourIcs(iso)}T${heure.replace(":", "")}00`;

export type EvenementIcs = {
  uid: string;
  titre: string;
  description?: string | null;
  date: string;
  dateFin?: string | null;
  journeeEntiere: boolean;
  heureDebut?: string | null;
  heureFin?: string | null;
  categorie?: string;
};

/**
 * Le calendrier complet, prêt à être servi.
 *
 * `estampille` est passée par l'appelant plutôt que lue de l'horloge : une
 * fonction pure se teste, une fonction qui interroge l'heure se contourne.
 */
export function genererIcs(evenements: EvenementIcs[], estampille: Date): string {
  const dtstamp = `${estampille.toISOString().replaceAll(/[-:]/g, "").slice(0, 15)}Z`;

  const lignes: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Trame//Planning//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  for (const e of evenements) {
    lignes.push("BEGIN:VEVENT");
    lignes.push(`UID:${e.uid}`);
    lignes.push(`DTSTAMP:${dtstamp}`);

    if (e.journeeEntiere || !e.heureDebut) {
      // La fin d'une journée entière est EXCLUSIVE : un événement d'un jour
      // finit le lendemain, sans quoi tout est décalé d'un jour à la lecture.
      lignes.push(`DTSTART;VALUE=DATE:${jourIcs(e.date)}`);
      lignes.push(`DTEND;VALUE=DATE:${jourIcs(lendemain(e.dateFin ?? e.date))}`);
    } else {
      lignes.push(`DTSTART:${horodatage(e.date, e.heureDebut)}`);
      lignes.push(`DTEND:${horodatage(e.dateFin ?? e.date, e.heureFin ?? e.heureDebut)}`);
    }

    lignes.push(`SUMMARY:${echapper(e.titre)}`);
    if (e.description) lignes.push(`DESCRIPTION:${echapper(e.description)}`);
    if (e.categorie) lignes.push(`CATEGORIES:${echapper(e.categorie)}`);
    lignes.push("END:VEVENT");
  }

  lignes.push("END:VCALENDAR");
  return lignes.map(plier).join(CRLF) + CRLF;
}

export type EvenementImporte = {
  uid: string | null;
  titre: string;
  description: string | null;
  date: string;
  journeeEntiere: boolean;
  heureDebut: string | null;
  heureFin: string | null;
};

/**
 * Lit un calendrier et rend ses événements.
 *
 * **Tolérant à la lecture, strict à l'écriture.** Les calendriers du monde
 * réel arrivent avec des paramètres inattendus, des fuseaux nommés, des
 * propriétés inconnues : les ignorer vaut mieux que refuser le fichier. Un
 * `VEVENT` sans titre ou sans date, en revanche, n'est pas un événement — il
 * est écarté, et le compte des ignorés est rendu à l'appelant.
 */
export function analyserIcs(texte: string): {
  evenements: EvenementImporte[];
  ignores: number;
} {
  const evenements: EvenementImporte[] = [];
  let ignores = 0;
  let courant: Record<string, { valeur: string; params: string }> | null = null;

  for (const ligne of deplier(texte)) {
    if (ligne === "BEGIN:VEVENT") {
      courant = {};
      continue;
    }
    if (ligne === "END:VEVENT") {
      if (courant) {
        const lu = construire(courant);
        if (lu) evenements.push(lu);
        else ignores += 1;
      }
      courant = null;
      continue;
    }
    if (!courant) continue;

    const separateur = ligne.indexOf(":");
    if (separateur === -1) continue;
    const gauche = ligne.slice(0, separateur);
    const valeur = ligne.slice(separateur + 1);
    const [nom = "", ...params] = gauche.split(";");
    courant[nom.toUpperCase()] = { valeur, params: params.join(";").toUpperCase() };
  }

  return { evenements, ignores };
}

function construire(
  champs: Record<string, { valeur: string; params: string }>,
): EvenementImporte | null {
  const titre = champs["SUMMARY"]?.valeur;
  const debut = champs["DTSTART"];
  if (!titre || !debut) return null;

  const brut = debut.valeur;
  const date = `${brut.slice(0, 4)}-${brut.slice(4, 6)}-${brut.slice(6, 8)}`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  // Une date sans partie horaire, ou marquée VALUE=DATE, vaut journée entière.
  const journeeEntiere = !brut.includes("T") || debut.params.includes("VALUE=DATE");
  const heure = (v?: string) =>
    v && v.includes("T") ? `${v.slice(9, 11)}:${v.slice(11, 13)}` : null;

  return {
    uid: champs["UID"]?.valeur ?? null,
    titre: desechapper(titre),
    description: champs["DESCRIPTION"] ? desechapper(champs["DESCRIPTION"].valeur) : null,
    date,
    journeeEntiere,
    heureDebut: journeeEntiere ? null : heure(brut),
    heureFin: journeeEntiere ? null : heure(champs["DTEND"]?.valeur),
  };
}
