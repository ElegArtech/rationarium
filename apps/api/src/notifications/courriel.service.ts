import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { createTransport, type Transporter } from "nodemailer";
import { FileService, FILE_COURRIEL, type TravailCourriel } from "./file.service.js";

/**
 * `EX-NTF-04` — le courriel sortant, par relais SMTP interne.
 *
 * **Rien n'appelle ce service directement.** Il consomme la file : c'est ce
 * qui rend `RG-NTF-04` structurel plutôt que déclaratif. Pour envoyer un
 * courriel, on publie un travail ; l'envoi arrive plus tard, ou pas, et
 * l'action métier n'en sait rien.
 *
 * `C1` — réseau fermé : le relais est **interne**, déclaré par variables
 * d'environnement. Sans configuration, le service journalise au lieu
 * d'envoyer. Un poste de développement n'a pas de relais SMTP, et cela ne doit
 * pas transformer chaque notification en erreur rouge.
 */

@Injectable()
export class CourrielService implements OnModuleInit {
  private readonly journal = new Logger(CourrielService.name);
  private transport: Transporter | null = null;

  constructor(private readonly file: FileService) {}

  async onModuleInit(): Promise<void> {
    const hote = process.env["SMTP_HOTE"];
    if (hote) {
      this.transport = createTransport({
        host: hote,
        port: Number(process.env["SMTP_PORT"] ?? 25),
        // Un relais interne en réseau fermé n'a pas toujours de certificat
        // signé par une autorité publique. `SMTP_TLS` reste explicite : on ne
        // décide pas à la place de l'exploitant.
        secure: process.env["SMTP_TLS"] === "true",
        ...(process.env["SMTP_UTILISATEUR"]
          ? {
              auth: {
                user: process.env["SMTP_UTILISATEUR"],
                pass: process.env["SMTP_MOTDEPASSE"] ?? "",
              },
            }
          : {}),
      });
    } else {
      this.journal.warn("SMTP_HOTE absent : les courriels seront journalisés, non envoyés.");
    }

    await this.file.consommer<TravailCourriel>(FILE_COURRIEL, (t) => this.envoyer(t));
  }

  /**
   * L'envoi réel. Appelé **par la file**, jamais par une action métier.
   *
   * Une exception ici fait échouer le travail, qui sera réessayé avec
   * temporisation croissante puis mis en file d'échec — et n'atteint jamais
   * l'utilisateur (`cadrage/03 § 5`).
   */
  private async envoyer(travail: TravailCourriel): Promise<void> {
    if (!this.transport) {
      this.journal.log(`courriel simulé → ${travail.destinataire} : ${travail.sujet}`);
      return;
    }
    await this.transport.sendMail({
      from: process.env["SMTP_EXPEDITEUR"] ?? "rationarium@localhost",
      to: travail.destinataire,
      subject: travail.sujet,
      text: travail.corps,
    });
  }
}
