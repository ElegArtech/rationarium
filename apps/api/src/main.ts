import "reflect-metadata";
import { HttpException } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import fastifyCookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { AppModule } from "./app.module.js";
import { secretDesCookies } from "./commun/secret-cookie.js";

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
     * D08 — `bodyLimit` par défaut de Fastify : 1 Mio. Les pièces jointes
     * voyagent en base64 dans un corps JSON (un tiers de plus que le fichier),
     * si bien que tout document au-delà d'environ 750 Ko était refusé en 413
     * avant d'atteindre le moindre contrôle métier. 32 Mio couvrent une pièce
     * de 20 Mio encodée (`RG-DOC-04`) ; les plafonds par nature de fichier
     * vivent dans les services, qui les connaissent.
     */
    new FastifyAdapter({ trustProxy: true, bodyLimit: 32 * 1024 * 1024 }),
    { logger: ["error", "warn"] },
  );

  await app.register(helmet as never, { contentSecurityPolicy: false });
  await app.register(fastifyCookie as never, { secret: secretDesCookies() });
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
