import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button, Tooltip, TooltipTrigger, type ButtonProps } from "react-aria-components";

/**
 * Action soumise à permission — `RG-GEN-06`.
 *
 * > *Une action interdite est masquée ou désactivée avec explication — jamais
 * > proposée puis refusée.*
 *
 * Deux comportements, et le choix entre eux n'est pas cosmétique :
 *
 *   **Masquée** (`quandInterdit="masquer"`) — l'action n'a aucun sens pour ce
 *   profil. Camille n'a pas à savoir qu'il existe une administration.
 *
 *   **Désactivée avec explication** (défaut) — l'action a du sens, mais pas
 *   maintenant ou pas pour cet objet. L'utilisateur doit comprendre pourquoi,
 *   sinon il conclut à un défaut du produit.
 *
 * **Ce n'est pas un contrôle.** Le contrôle est au serveur, permission puis
 * périmètre (`cadrage/03 § 5.4`). C'est une courtoisie : on ne propose pas ce
 * qui sera refusé. Un composant qui laisserait croire le contraire serait
 * dangereux, d'où ce commentaire.
 */
/**
 * La décision, isolée du rendu.
 *
 * Extraite volontairement : c'est elle qui porte `RG-GEN-06`, et elle se
 * vérifie sans monter de DOM. Le rendu, lui, est exercé par Storybook et par
 * les parcours Playwright — `cadrage/03 § 3.5` désigne ce banc-là, pas un
 * simulacre de navigateur.
 */
export type Decision = "autorisee" | "masquee" | "desactivee";

export const decisionAction = (
  permission: string,
  permissions: ReadonlySet<string>,
  quandInterdit: "masquer" | "desactiver" = "desactiver",
): Decision =>
  permissions.has(permission)
    ? "autorisee"
    : quandInterdit === "masquer"
      ? "masquee"
      : "desactivee";

export function ActionProtegee({
  permission,
  permissions,
  motif,
  quandInterdit = "desactiver",
  children,
  ...props
}: ButtonProps & {
  permission: string;
  permissions: ReadonlySet<string>;
  /** Explication affichée au survol. À défaut, un texte générique. */
  motif?: string | undefined;
  quandInterdit?: "masquer" | "desactiver";
  children: ReactNode;
}) {
  const { t } = useTranslation("commun");
  const decision = decisionAction(permission, permissions, quandInterdit);

  if (decision === "autorisee") {
    return (
      <Button {...props} className={props.className ?? "btn"}>
        {children}
      </Button>
    );
  }

  if (decision === "masquee") return null;

  return (
    <TooltipTrigger delay={200}>
      <Button {...props} isDisabled className={props.className ?? "btn"}>
        {children}
      </Button>
      <Tooltip className="tooltip">
        <strong>{t("droits.permissionRequise")}</strong>
        <span> — {motif ?? t("droits.actionIndisponible")}</span>
      </Tooltip>
    </TooltipTrigger>
  );
}
