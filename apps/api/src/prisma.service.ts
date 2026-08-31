import { Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@rationarium/db";

/**
 * Accès à la base. Un seul client pour tout le serveur.
 *
 * En Prisma 7, la connexion passe **obligatoirement** par un adaptateur de
 * pilote : `datasourceUrl` n'existe plus, et l'URL des migrations vit dans
 * `prisma.config.ts`. Voir ADR-0006.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? "" }),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
