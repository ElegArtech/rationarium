import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import fastifyCookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { AppModule } from "./app.module.js";

/**
 * Point d'entrée du serveur — NestJS sur adaptateur Fastify (ADR-0005).
 *
 * C1 : aucune ressource distante. Les en-têtes de sécurité sont posés ici et
 * la limitation d'essais protège la connexion (RG-AUTH-01) au niveau du
 * transport, en complément du verrouillage de compte au niveau métier.
 */
export async function creerApplication(): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ trustProxy: true }),
    { logger: ["error", "warn"] },
  );

  await app.register(helmet as never, { contentSecurityPolicy: false });
  await app.register(fastifyCookie as never, { secret: process.env.COOKIE_SECRET ?? "rationarium-dev" });
  await app.register(rateLimit as never, { max: 300, timeWindow: "1 minute" });

  app.setGlobalPrefix("api");
  return app;
}

if (process.env.NODE_ENV !== "test") {
  const app = await creerApplication();
  await app.listen({ port: Number(process.env.PORT ?? 3000), host: "0.0.0.0" });
}
