import { Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@rationarium/db";

/**
 * `RG-AUTH-14` — **le haché d'un mot de passe ne sort jamais du serveur.**
 *
 * `POST` et `PATCH /utilisateurs` le rendaient : le service renvoyait la ligne
 * entière, et rien entre la base et la réponse ne savait qu'une colonne était
 * secrète. Le retirer réponse par réponse aurait fait dépendre la règle de la
 * vigilance de chaque appel — c'est exactement ainsi qu'il était sorti.
 *
 * L'omission est donc posée **une fois, sur le client** : aucune lecture ne
 * rend la colonne, sauf celle qui la demande en toutes lettres
 * (`omit: { motDePasseHash: false }`). Les seuls lecteurs légitimes sont la
 * vérification du mot de passe (`AuthService.connecter`, `changerMotDePasse`).
 *
 * Le type suit l'exécution : un `user.motDePasseHash` lu sans la demande
 * explicite ne compile pas.
 */
const OMISSIONS = { user: { motDePasseHash: true } } as const;

/**
 * Accès à la base. Un seul client pour tout le serveur.
 *
 * En Prisma 7, la connexion passe **obligatoirement** par un adaptateur de
 * pilote : `datasourceUrl` n'existe plus, et l'URL des migrations vit dans
 * `prisma.config.ts`.
 */
@Injectable()
export class PrismaService
  extends PrismaClient<{ adapter: PrismaPg; omit: typeof OMISSIONS }>
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? "" }),
      omit: OMISSIONS,
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
