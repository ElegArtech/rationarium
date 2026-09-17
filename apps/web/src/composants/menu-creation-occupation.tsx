import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { Button, Menu, MenuItem, MenuTrigger, Popover } from "react-aria-components";
import { usePeut } from "../session/session.js";

/**
 * La commande de création commune au planning et au tableau de bord.
 *
 * `RG-GEN-06` — une tâche de projet et une tâche hors projet relèvent de deux
 * droits différents. Le menu propose la tâche dès que l'un des deux est
 * accordé, l'événement seulement avec `events:create`, et disparaît quand il
 * n'a aucune action autorisée à présenter.
 *
 * Les destinations restent ici, dans une seule commande : le raccourci du
 * tableau de bord doit ouvrir exactement les mêmes parcours que celui du
 * planning, sans second contrat susceptible de dériver.
 */
export function MenuCreationOccupation() {
  const { t } = useTranslation("planning");
  const peut = usePeut();
  const navigate = useNavigate();
  const peutCreerUneTache = peut("tasks:create") || peut("tasks:create_standalone");
  const peutCreerUnEvenement = peut("events:create");

  if (!peutCreerUneTache && !peutCreerUnEvenement) return null;

  return (
    <MenuTrigger>
      <Button className="btn btn-primary">{t("actions.creer")}</Button>
      <Popover>
        <Menu className="pop pop-sm">
          {/* `onAction`, et non `href` : sans le `RouterProvider` de
              react-aria, une ancre de menu recharge toute l'application. */}
          {peutCreerUneTache ? (
            <MenuItem
              className="pop-action"
              id="tache"
              onAction={() => void navigate({ to: "/taches", search: { creer: 1 } })}
            >
              {t("actions.creerTache")}
            </MenuItem>
          ) : null}
          {peutCreerUnEvenement ? (
            <MenuItem
              className="pop-action"
              id="evenement"
              onAction={() => void navigate({ to: "/evenements" })}
            >
              {t("actions.creerEvenement")}
            </MenuItem>
          ) : null}
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}
