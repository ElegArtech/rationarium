import {
  Catch,
  HttpException,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { z } from "zod";
import { MESSAGES_METIER, type Message } from "./messages-metier.js";
import { MESSAGES as MESSAGES_AUTH } from "../auth/messages.js";

/**
 * La couche HTTP transverse : validation d'entrée, traduction des échecs.
 *
 * La règle de séparation tenue partout dans ce serveur : **le service nomme la
 * situation, la couche HTTP la formule.** Un service ne connaît ni les codes
 * de statut, ni les clés de traduction ; il lève une erreur portant un `code`.
 */

/**
 * Le filet de sécurité sous les erreurs de base.
 *
 * Ces situations **devraient** être nommées par le service : c'est lui qui sait
 * qu'on supprime un projet inexistant, pas la couche HTTP. Mais un service qui
 * délègue la vérification d'existence à la clause `where` produit une erreur
 * Prisma brute, et sans cette table l'utilisateur lirait « erreur inattendue »
 * là où « cet élément n'existe pas » était la réponse.
 *
 * La traduction est journalisée en avertissement : le filet rattrape, il ne
 * dispense pas.
 */
const INTROUVABLE: Message = {
  statut: 404,
  cle: "erreurs:introuvable",
  message: "Cet élément n'existe pas ou plus.",
};

const ERREURS_PRISMA: Record<string, Message> = {
  /** Enregistrement requis introuvable. */
  P2025: INTROUVABLE,
  /** Contrainte d'unicité violée. */
  P2002: {
    statut: 409,
    cle: "erreurs:contrainteUnicite",
    message: "Une entrée identique existe déjà.",
  },
  /** Contrainte de clé étrangère violée. */
  P2003: {
    statut: 409,
    cle: "erreurs:contrainteLiaison",
    message: "Cet élément est lié à d'autres : la liaison empêche l'opération.",
  },
  /** Contrainte d'exclusion, ou toute contrainte posée en base (`C15`). */
  P2010: {
    statut: 409,
    cle: "erreurs:contrainteBase",
    message: "L'opération viole une règle garantie par la base de données.",
  },
};

/**
 * `RG-GEN-11` — un identifiant mal formé est un « introuvable », jamais un 500.
 *
 * Les routes `:id` passent l'identifiant tel quel à Prisma. `abc` ne désigne
 * aucune ligne, mais PostgreSQL refuse de le convertir en UUID (`22P02`), et
 * Prisma 7 le rend en `P2007` avec la cause du pilote en `meta` — ou en
 * `P2023` selon le chemin de requête. Sans cette reconnaissance, une adresse
 * tapée de travers produisait « erreur inattendue, incident enregistré ».
 *
 * La reconnaissance est ÉTROITE : seul l'UUID mal formé est un introuvable.
 * Un `22P02` sur une énumération dit qu'une validation manque en amont, et
 * celui-là doit continuer de se voir en 500.
 */
const estIdentifiantMalForme = (e: ErreurCodee): boolean => {
  if (e.code === "P2023") return true;
  if (e.code !== "P2007") return false;
  const cause = (e as { meta?: { driverAdapterError?: { cause?: { originalCode?: unknown; originalMessage?: unknown } } } })
    .meta?.driverAdapterError?.cause;
  return cause?.originalCode === "22P02" && /\btype uuid\b/.test(String(cause.originalMessage ?? ""));
};

/**
 * `RG-DOC-04` — un corps refusé par le TRANSPORT se dit dans la même langue
 * qu'un fichier refusé par le service.
 *
 * Au-delà de `bodyLimit`, Fastify lève `FST_ERR_CTP_BODY_TOO_LARGE` avant
 * qu'aucun contrôleur ne voie la requête ; Nest la convertit en
 * `HttpException(message, 413)` et perd le code au passage. Le client recevait
 * donc un 413 sans clé, c'est-à-dire sans message traduisible.
 */
const TROP_VOLUMINEUX: Message = {
  statut: 413,
  cle: "erreurs:fichierTropVolumineux",
  message: "Le fichier dépasse la taille autorisée.",
};

/**
 * `RG-DOC-04` — le même refus, levé par un contrôleur qui connaît son
 * plafond : `detail.maxOctets` permet au client de dire « 20 Mio au plus »
 * plutôt que « trop gros ».
 */
export const fichierTropVolumineux = (maxOctets: number) =>
  new HttpException(
    { cle: TROP_VOLUMINEUX.cle, message: TROP_VOLUMINEUX.message, detail: { maxOctets } },
    TROP_VOLUMINEUX.statut,
  );

/** Une erreur métier : toute erreur portant un `code` reconnu. */
type ErreurCodee = Error & { code: string; detail?: Record<string, unknown> };

const estCodee = (e: unknown): e is ErreurCodee =>
  e instanceof Error && typeof (e as { code?: unknown }).code === "string";

/**
 * Le type d'une entrée validée : les champs optionnels restent optionnels,
 * mais ne valent plus **jamais** `undefined`.
 *
 * C'est la contrepartie exacte de ce que fait `compacter` à l'exécution, et
 * c'est ce qui réconcilie Zod avec `exactOptionalPropertyTypes`. Sans cela,
 * chaque contrôleur devrait recopier à la main les champs non vides avant
 * d'appeler son service — vingt fois le même code, et le premier oubli passe
 * inaperçu jusqu'à ce qu'un `undefined` explicite écrase une valeur en base.
 */
type Valide<T> = T extends object ? { [K in keyof T]: Exclude<T[K], undefined> } : T;

/**
 * Supprime les clés dont la valeur est `undefined`.
 *
 * « Absent » et « présent, mais indéfini » ne sont pas la même chose : le
 * premier laisse la valeur existante tranquille, le second l'efface.
 */
const compacter = <T extends object>(o: T): T => {
  if (Array.isArray(o) || o instanceof Date || Buffer.isBuffer(o)) return o;
  const sortie: Record<string, unknown> = {};
  for (const [cle, valeur] of Object.entries(o)) {
    if (valeur !== undefined) sortie[cle] = valeur;
  }
  return sortie as T;
};

/**
 * Valide une entrée, ou refuse en 400 **champ par champ**.
 *
 * Le détail par champ n'est pas un luxe : `cadrage/02` demande que l'erreur
 * s'affiche sous le champ fautif. Un message global obligerait l'utilisateur à
 * chercher lequel des douze champs est en cause.
 */
export const valider = <T>(schema: z.ZodType<T>, donnees: unknown): Valide<T> => {
  const r = schema.safeParse(donnees);
  if (!r.success) {
    throw new HttpException(
      {
        cle: "erreurs:donneesInvalides",
        message: "Certaines informations sont incomplètes ou mal formées.",
        details: r.error.issues.map((i) => ({
          champ: i.path.join("."),
          message: i.message,
        })),
      },
      400,
    );
  }
  return (
    typeof r.data === "object" && r.data !== null ? compacter(r.data) : r.data
  ) as Valide<T>;
};

/**
 * Filtre global : traduit toute erreur métier en réponse HTTP.
 *
 * **Pourquoi un filtre global plutôt qu'un `try/catch` par point d'entrée.**
 * Avec un catch par méthode, il suffit d'en oublier un pour qu'une règle de
 * gestion parfaitement implémentée remonte en 500 — l'utilisateur voit
 * « erreur interne » là où le serveur savait exactement quoi dire. Le filtre
 * rend l'oubli impossible.
 *
 * Une erreur **non reconnue** ne fuit jamais son message vers le client : elle
 * est journalisée côté serveur et rendue en 500 générique. Un message
 * d'exception peut contenir un fragment de requête ou un identifiant interne.
 */
@Catch()
export class FiltreErreurs implements ExceptionFilter {
  private readonly journal = new Logger("http");

  catch(exception: unknown, hote: ArgumentsHost) {
    const reponse = hote.switchToHttp().getResponse<FastifyReply>();

    if (exception instanceof HttpException) {
      const charge = exception.getResponse();
      // Le 413 du transport arrive sans clé : il n'a pas traversé de contrôleur.
      if (exception.getStatus() === 413 && typeof charge === "string") {
        void reponse.status(413).send({ cle: TROP_VOLUMINEUX.cle, message: TROP_VOLUMINEUX.message });
        return;
      }
      void reponse
        .status(exception.getStatus())
        .send(typeof charge === "string" ? { message: charge } : charge);
      return;
    }

    if (estCodee(exception)) {
      const connu =
        MESSAGES_METIER[exception.code] ??
        (MESSAGES_AUTH as Record<string, Message>)[exception.code];
      if (connu) {
        void reponse.status(connu.statut).send({
          cle: connu.cle,
          message: connu.message,
          // Le détail chiffré des refus — solde manquant, plafond dépassé —
          // fait partie du message utile : « refusé » sans le chiffre oblige
          // à recompter à la main.
          ...(exception.detail ? { detail: exception.detail } : {}),
        });
        return;
      }
      if (exception.code === "FST_ERR_CTP_BODY_TOO_LARGE") {
        void reponse.status(413).send({ cle: TROP_VOLUMINEUX.cle, message: TROP_VOLUMINEUX.message });
        return;
      }
      const dePrisma = estIdentifiantMalForme(exception) ? INTROUVABLE : ERREURS_PRISMA[exception.code];
      if (dePrisma) {
        // Le service aurait dû nommer la situation lui-même — d'où la trace.
        // Mais un filet vaut mieux qu'un 500 : « cet élément n'existe pas »
        // est toujours plus juste que « erreur inattendue ».
        this.journal.warn(
          `Erreur Prisma ${exception.code} non interceptée par le service : traduite en ${dePrisma.statut}.`,
        );
        void reponse.status(dePrisma.statut).send({ cle: dePrisma.cle, message: dePrisma.message });
        return;
      }

      this.journal.error(`Code d'échec sans message : « ${exception.code} »`);
    }

    this.journal.error(exception instanceof Error ? exception.stack : String(exception));
    void reponse.status(500).send({
      cle: "erreurs:erreurInterne",
      message: "Une erreur inattendue est survenue. L'incident a été enregistré.",
    });
  }
}

/** Une date de requête, acceptée en `AAAA-MM-JJ` comme en ISO complet. */
export const dateSchema = z.coerce.date();
