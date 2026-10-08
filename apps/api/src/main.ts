import "reflect-metadata";
import { HttpException } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import fastifyCookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { AppModule } from "./app.module.js";
import { LIMITE_CORPS_DEFAUT, poserLimitesDeCorps } from "./commun/limites-corps.js";

/**
 * Point d'entrée du serveur — NestJS sur adaptateur Fastify.
 *
 * C1 : aucune ressource distante. Les en-têtes de sécurité sont posés ici et
 * la limitation d'essais protège la connexion (RG-AUTH-01) au niveau du
 * transport, en complément du verrouillage de compte au niveau métier.
 */
export async function creerApplication(): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    /*
     * D08 — la limite de corps par défaut est BASSE (1 Mio) : la connexion, la
     * recherche, chaque écriture de formulaire n'en demandent pas davantage,
     * et Fastify lit tout le corps avant le moindre contrôle d'accès. Les
     * routes qui transportent un fichier — pièce jointe en base64 (`RG-DOC-04`),
     * avatar, import CSV, import ICS — sont relevées une à une, avec leur
     * motif, dans `commun/limites-corps.ts`.
     */
    new FastifyAdapter({ trustProxy: true, bodyLimit: LIMITE_CORPS_DEFAUT }),
    { logger: ["error", "warn"] },
  );

  // Avant `init()` : le crochet ne voit que les routes déclarées après lui.
  poserLimitesDeCorps(app.getHttpAdapter().getInstance());

  await app.register(helmet as never, { contentSecurityPolicy: false });
  await app.register(fastifyCookie as never, { secret: process.env.COOKIE_SECRET ?? "rationarium-dev" });
  await app.register(rateLimit as never, {
    max: 300,
    timeWindow: "1 minute",
    /*
     * Le refus traverse le filtre global (`commun/http.ts`) : l'erreur par
     * défaut du greffon n'y est pas reconnue et sortait en 500 « incident
     * enregistré ». Une `HttpException` y sort telle quelle, en 429, avec une
     * clé traduisible. Les routes d'authentification ont leurs propres
     * limites, plus basses : voir `LimiteDeDebit` (RG-AUTH-12).
     */
    errorResponseBuilder: () =>
      new HttpException(
        { cle: "auth:erreurs.tropDeDemandes", message: "Trop de demandes. Réessayez dans une minute." },
        429,
      ),
  });

  app.setGlobalPrefix("api");
  return app;
}

if (process.env.NODE_ENV !== "test") {
  const app = await creerApplication();
  await app.listen({ port: Number(process.env.PORT ?? 3000), host: "0.0.0.0" });
}
