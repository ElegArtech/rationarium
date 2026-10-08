import { HttpException } from "@nestjs/common";
import { z } from "zod";
import { dateSchema } from "./http.js";

/**
 * Les plages de dates reçues en entrée — lues, puis BORNÉES.
 *
 * **Le défaut.** `?debut=1970-01-01&fin=9999-12-31` traversait la validation
 * de toutes les lectures par plage : `dateSchema` vérifie qu'une date est une
 * date, pas qu'une période est raisonnable. Or plusieurs services énumèrent
 * la plage JOUR PAR JOUR — la trame du planning, la grille d'activité, la
 * génération du télétravail, le décompte des jours ouvrés, qui fait en plus
 * une requête par année. Huit mille ans de jours, c'est trois millions de
 * tours de boucle et autant d'objets en mémoire, sur une seule requête
 * authentifiée, rejouable à volonté.
 *
 * **La borne.** 366 jours par défaut — l'année bissextile entière, la plus
 * longue période qu'une vue du produit demande d'un coup (`RG-TLT-06` la
 * posait déjà pour le seul planning du télétravail). Une route qui sert
 * légitimement davantage passe sa borne et dit pourquoi.
 *
 * **Le refus.** 400 et non 422 : la requête est mal formée, aucune règle
 * métier n'est en jeu. Deux clés distinctes, parce que les deux situations
 * n'appellent pas le même geste — inverser les dates, ou raccourcir la
 * période. La seconde porte `maxJours` pour que le message dise la borne.
 */

export const MAX_JOURS_PLAGE = 366;

const JOUR_MS = 86_400_000;

/** `{debut, fin}`, toutes deux obligatoires — à étendre par `.extend(...)`. */
export const plageSchema = z.object({ debut: dateSchema, fin: dateSchema });

/** Le nombre de jours couverts, bornes comprises. */
export const joursCouverts = (debut: Date, fin: Date): number =>
  Math.floor((fin.getTime() - debut.getTime()) / JOUR_MS) + 1;

/**
 * Refuse une plage incohérente ou trop étendue ; rend l'entrée inchangée.
 *
 * Une plage dont l'une des bornes manque n'est pas contrôlée ici : les routes
 * à bornes facultatives ont leur propre règle pour ce cas (`plage_incomplete`
 * des événements), que ce contrôle ne doit pas court-circuiter.
 */
export function bornerPlage<T extends { debut?: Date | null; fin?: Date | null }>(
  q: T,
  maxJours: number = MAX_JOURS_PLAGE,
): T {
  const { debut, fin } = q;
  if (!debut || !fin) return q;
  if (fin.getTime() < debut.getTime()) {
    throw new HttpException(
      { cle: "erreurs:datesIncoherentes", message: "La date de fin précède la date de début." },
      400,
    );
  }
  if (joursCouverts(debut, fin) > maxJours) {
    throw new HttpException(
      {
        cle: "erreurs:periodeTropEtendue",
        message: "La période demandée est trop étendue.",
        detail: { maxJours },
      },
      400,
    );
  }
  return q;
}
