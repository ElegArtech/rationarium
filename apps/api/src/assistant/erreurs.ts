import { HttpException } from "@nestjs/common";

/**
 * Les refus du module M22, rédigés comme ceux du reste du produit : une clé de
 * traduction (`assistant:erreurs.…`) et une phrase en langue naturelle
 * (`RG-GEN-03`). La règle en cause est nommée quand il y en a une : l'agent la
 * lit pour savoir quoi corriger, et l'utilisateur pour comprendre le refus.
 */
export const refusAssistant = (
  statut: number,
  cle: string,
  message: string,
  complement: Record<string, unknown> = {},
): HttpException => new HttpException({ cle: `assistant:erreurs.${cle}`, message, ...complement }, statut);

/** `RG-AST-01` — un module désactivé n'existe pas. */
export const moduleIntrouvable = (): HttpException =>
  new HttpException({ cle: "erreurs:introuvable", message: "Ressource introuvable." }, 404);
