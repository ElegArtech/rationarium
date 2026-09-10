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
  statut?: "TENTATIVE" | "CONFIRMED";
  transparent?: boolean;
  proprietes?: Record<string, string>;
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
    "PRODID:-//Rationarium//Planning//FR",
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

    if (e.transparent) lignes.push("TRANSP:TRANSPARENT");
    for (const [cle, valeur] of Object.entries(e.proprietes ?? {})) lignes.push(`${cle}:${echapper(valeur)}`);
    if (e.statut) lignes.push(`STATUS:${e.statut}`);
    lignes.push(`SUMMARY:${echapper(e.titre)}`);
    if (e.description) lignes.push(`DESCRIPTION:${echapper(e.description)}`);
    if (e.categorie) lignes.push(`CATEGORIES:${echapper(e.categorie)}`);
    lignes.push("END:VEVENT");
  }

  lignes.push("END:VCALENDAR");
  return lignes.map(plier).join(CRLF) + CRLF;
}

export type EvenementImporte = {
  index?: number;
  uid: string | null;
  titre: string;
  description: string | null;
  date: string;
  journeeEntiere: boolean;
  heureDebut: string | null;
  heureFin: string | null;
  recurrence?: { frequenceSemaines: number; jourSemaine: number; jusqua: string };
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
  erreurs: { index: number; titre: string | null; motif: string }[];
} {
  const evenements: EvenementImporte[] = [];
  let ignores = 0;
  let index = 0;
  const erreurs: { index: number; titre: string | null; motif: string }[] = [];
  let courant: Record<string, { valeur: string; params: string }> | null = null;

  for (const ligne of deplier(texte)) {
    if (ligne === "BEGIN:VEVENT") {
      courant = {};
      index++;
      continue;
    }
    if (ligne === "END:VEVENT") {
      if (courant) {
        const lu = construire(courant);
        if (!("erreur" in lu)) evenements.push({ ...lu, index });
        else { ignores++; erreurs.push({ index, titre: courant["SUMMARY"]?.valeur ?? null, motif: lu.erreur }); }
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

  if (courant || index === 0) {
    ignores++; erreurs.push({ index: index || 1, titre: courant?.["SUMMARY"]?.valeur ?? null, motif: "incomplet" });
  }
  return { evenements, ignores, erreurs };
}

function construire(champs: Record<string, { valeur: string; params: string }>): EvenementImporte | { erreur: string } {
  const titre = champs["SUMMARY"]?.valeur;
  if (!titre || !champs["DTSTART"]) return { erreur: "incomplet" };
  const lireDate = (champ: { valeur: string; params: string }): { date: string; heure: string | null } | { erreur: string } => {
    const v = champ.valeur;
    const dateSeule = /^\d{8}$/.test(v);
    if (!dateSeule && !/^\d{8}T\d{6}Z?$/.test(v)) return { erreur: "date_invalide" };
    if (champ.params.split(";").includes("VALUE=DATE") && !dateSeule) return { erreur: "date_invalide" };
    const date = `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
    const parsed = new Date(`${date}T00:00:00Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return { erreur: "date_invalide" };
    if (dateSeule) return { date, heure: null };
    const heure = `${v.slice(9, 11)}:${v.slice(11, 13)}`;
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(heure) || v.slice(13, 15) !== "00") return { erreur: "horaires_invalides" };
    const zone = champ.params.split(";").find((p) => p.startsWith("TZID="))?.slice(5);
    if (zone && zone !== "EUROPE/PARIS") return { erreur: "fuseau_non_pris_en_charge" };
    if (!v.endsWith("Z")) return { date, heure };
    const instant = new Date(`${date}T${heure}:00Z`);
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(instant);
    const part = (type: string) => parts.find((p) => p.type === type)!.value;
    return { date: `${part("year")}-${part("month")}-${part("day")}`, heure: `${part("hour")}:${part("minute")}` };
  };
  const debut = lireDate(champs["DTSTART"]);
  if ("erreur" in debut) return debut;
  const fin = champs["DTEND"] ? lireDate(champs["DTEND"]) : null;
  if (fin && "erreur" in fin) return fin;
  if (debut.heure !== null && fin === null) return { erreur: "incomplet" };
  if (fin && (debut.heure === null) !== (fin.heure === null)) return { erreur: "horaires_invalides" };
  if (fin && (debut.heure === null ? fin.date !== lendemain(debut.date) : fin.date !== debut.date)) return { erreur: "multi_jours" };
  if (debut.heure && fin?.heure && fin.heure <= debut.heure) return { erreur: "horaires_invalides" };
  let recurrence: EvenementImporte["recurrence"];
  if (champs["RRULE"]) {
    const regle = Object.fromEntries(champs["RRULE"].valeur.split(";").map((p) => p.split("=")));
    const intervalle = Number(regle["INTERVAL"] ?? 1);
    const jusqua = lireDate({ valeur: regle["UNTIL"] ?? "", params: "" });
    const jourSemaine = new Date(`${debut.date}T00:00:00Z`).getUTCDay();
    if (regle["FREQ"] !== "WEEKLY" || !Number.isInteger(intervalle) || intervalle < 1 || intervalle > 52
      || Object.keys(regle).some((k) => !["FREQ", "INTERVAL", "UNTIL", "BYDAY"].includes(k))
      || (regle["BYDAY"] !== undefined && regle["BYDAY"] !== ["SU", "MO", "TU", "WE", "TH", "FR", "SA"][jourSemaine])
      || "erreur" in jusqua || jusqua.date < debut.date || champs["DTSTART"].valeur.endsWith("Z")) return { erreur: "recurrence_non_prise_en_charge" };
    recurrence = { frequenceSemaines: intervalle, jourSemaine, jusqua: jusqua.date };
  }
  if (desechapper(titre).length > 200) return { erreur: "titre_trop_long" };
  return { ...(recurrence ? { recurrence } : {}), uid: champs["UID"]?.valeur ?? null,
    titre: desechapper(titre), description: champs["DESCRIPTION"] ? desechapper(champs["DESCRIPTION"].valeur) : null,
    date: debut.date, journeeEntiere: debut.heure === null, heureDebut: debut.heure, heureFin: fin?.heure ?? null,
  };
}
