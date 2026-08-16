import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { PgBoss, type Job } from "pg-boss";

/**
 * La file de travaux — `ADR-0007`, `cadrage/03 § 5`.
 *
 * **`RG-NTF-04` — l'indisponibilité de la messagerie n'empêche jamais l'action
 * métier d'aboutir.** C'est la raison d'être de ce service, et elle dicte tout :
 * un envoi de courriel est **toujours** une mise en file, jamais un appel
 * synchrone dans une transaction métier. Un serveur SMTP en panne fait échouer
 * un travail de file — il ne fait pas échouer une demande de congé.
 *
 * **`RG-NTF-02` — une seule instance envoie.** `pg-boss` le fournit par
 * `singletonKey` : deux exemplaires de l'application déclarant le même travail
 * périodique n'en exécutent qu'un. Écrire ce verrou à la main aurait été la
 * première chose à casser en production, et la dernière à s'en apercevoir.
 *
 * Le service est **facultatif à l'exécution**. Sans `DATABASE_URL`, ou si la
 * file refuse de démarrer, l'application démarre quand même et les envois sont
 * journalisés au lieu d'être mis en file : un produit qui refuserait de servir
 * une page parce qu'un courriel ne peut pas partir aurait mal lu `RG-NTF-04`.
 */

export type TravailCourriel = {
  destinataire: string;
  sujet: string;
  corps: string;
};

export type TravailPeriodique = {
  nom: string;
  /** Expression cron, dans le fuseau de l'organisation (`RG-NTF-01`). */
  cron: string;
  traitement: () => Promise<void>;
};

export const FILE_COURRIEL = "courriel";

@Injectable()
export class FileService implements OnModuleInit, OnModuleDestroy {
  private readonly journal = new Logger(FileService.name);
  private boss: PgBoss | null = null;
  /** Le démarrage en cours, partagé par tous ceux qui l'attendent. */
  private demarrage: Promise<void> | null = null;

  async onModuleInit(): Promise<void> {
    await this.demarrerUneFois();
  }

  /**
   * **Le démarrage est attendu, jamais supposé.**
   *
   * NestJS appelle les `onModuleInit` des fournisseurs d'un même module **en
   * parallèle** (`Promise.all`). `CourrielService` s'abonnait donc à sa file
   * pendant que ce service démarrait la sienne : l'abonnement partait sur un
   * schéma `pgboss` pas encore créé, échouait, et l'échec était avalé par le
   * `try` de `consommer` — écrit précisément pour ne pas faire échouer le
   * démarrage.
   *
   * Conséquence, invisible en développement comme en test : les courriels
   * étaient **mis en file et jamais consommés**. Aucune alerte, aucune erreur
   * après le démarrage, et une file qui grossit.
   *
   * D'où cette promesse unique, que tout appelant attend. Elle est amorcée par
   * le premier qui la demande, et non par un ordre d'initialisation entre
   * fournisseurs — un ordre que rien dans le cadre ne garantit.
   */
  private demarrerUneFois(): Promise<void> {
    this.demarrage ??= this.demarrer();
    return this.demarrage;
  }

  private async demarrer(): Promise<void> {
    const url = process.env["DATABASE_URL"];
    if (!url) {
      this.journal.warn(
        "DATABASE_URL absente : la file n'est pas démarrée, les envois seront journalisés.",
      );
      return;
    }

    try {
      const boss = new PgBoss({ connectionString: url, schema: "pgboss", createSchema: true });
      boss.on("error", (e: unknown) => this.journal.error(`file : ${String(e)}`));
      await boss.start();
      // Affecté SEULEMENT une fois `start()` terminé : tant que le champ est
      // nul, `publier` journalise au lieu d'échouer, ce qui est le
      // comportement voulu — et non un abonnement sur un schéma absent.
      this.boss = boss;
    } catch (e) {
      // Le démarrage de la file n'est pas une condition de service.
      this.boss = null;
      this.journal.error(`la file n'a pas démarré : ${String(e)}`);
    }
  }

  /** La file, une fois démarrée. `null` si elle n'a pas pu l'être. */
  private async pret(): Promise<PgBoss | null> {
    await this.demarrerUneFois();
    return this.boss;
  }

  async onModuleDestroy(): Promise<void> {
    await this.boss?.stop({ graceful: true });
  }

  /** La file est-elle opérationnelle ? Employé par les contrôles, pas par le métier. */
  get active(): boolean {
    return this.boss !== null;
  }

  /**
   * Met un travail en file, **sans jamais lever**.
   *
   * C'est le point d'application de `RG-NTF-04` : l'appelant est une action
   * métier en cours d'aboutissement. Une exception ici la ferait échouer pour
   * une raison qui ne la concerne pas.
   */
  async publier(nom: string, donnees: Record<string, unknown>): Promise<string | null> {
    const boss = await this.pret();
    if (!boss) {
      this.journal.log(`file inactive — travail « ${nom} » journalisé : ${JSON.stringify(donnees)}`);
      return null;
    }
    try {
      return await boss.send(nom, donnees, {
        retryLimit: 5,
        // Temporisation croissante : un relais SMTP qui redémarre revient en
        // quelques minutes, et cinq tentatives immédiates ne l'attendraient pas.
        retryDelay: 60,
        retryBackoff: true,
      });
    } catch (e) {
      this.journal.error(`mise en file impossible pour « ${nom} » : ${String(e)}`);
      return null;
    }
  }

  /**
   * Abonne un traitement à une file.
   *
   * **Ne lève pas.** Un abonnement se fait dans un `onModuleInit` : une
   * exception y fait échouer le démarrage de l'application entière. Le
   * contrôle d'intégration de la surface HTTP l'a montré — le serveur refusait
   * de démarrer parce qu'une file de courriel n'avait pas pu être créée, ce
   * qui est exactement ce que `RG-NTF-04` interdit, un cran plus haut.
   */
  async consommer<T extends object>(
    nom: string,
    traitement: (donnees: T) => Promise<void>,
  ): Promise<void> {
    const boss = await this.pret();
    if (!boss) return;
    try {
      await boss.createQueue(nom);
      await boss.work<T>(nom, async (travaux: Job<T>[]) => {
        for (const travail of travaux) await traitement(travail.data);
      });
    } catch (e) {
      this.journal.error(`abonnement impossible à « ${nom} » : ${String(e)}`);
    }
  }

  /**
   * `RG-NTF-01`, `RG-NTF-02` — un travail périodique, à instance unique.
   *
   * Déclarable avant le démarrage de la file : l'appel attend celui-ci, au lieu
   * de dépendre d'un ordre d'initialisation entre fournisseurs.
   */
  async planifier(travail: TravailPeriodique): Promise<void> {
    const boss = await this.pret();
    if (!boss) return;
    try {
      await boss.createQueue(travail.nom);
      await boss.work(travail.nom, async () => {
        await travail.traitement();
      });
      // `singletonKey` : deux instances déclarant le même travail n'en
      // exécutent qu'un. C'est `RG-NTF-02`, et il est natif.
      await boss.schedule(travail.nom, travail.cron, {} as never, {
        singletonKey: travail.nom,
        tz: process.env["TRAME_FUSEAU"] ?? "Europe/Paris",
      });
      this.journal.log(`travail périodique « ${travail.nom} » planifié (${travail.cron})`);
    } catch (e) {
      this.journal.error(`planification impossible pour « ${travail.nom} » : ${String(e)}`);
    }
  }
}
