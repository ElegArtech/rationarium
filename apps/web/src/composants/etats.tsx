import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "react-aria-components";
import { messageErreur } from "../api/erreurs.js";
import { ErreurApi } from "../api/client.js";
import "./etats.css";

/**
 * Les états transverses d'une vue de données : **vide, chargement, erreur,
 * accès refusé**.
 *
 * `cadrage/02 § D` les exige sur toute vue de données, et `.claude/rules/ui.md`
 * les rappelle. Les écrire une fois ici plutôt qu'à chaque vue n'est pas une
 * économie de frappe : c'est la seule façon d'obtenir la **même** formulation
 * partout. Vingt états vides rédigés vingt fois divergent en vingt tons.
 *
 * `RG-GEN-04` — un état vide **explique et propose l'action suivante**. Jamais
 * une zone blanche. C'est pourquoi `sortie` n'est pas optionnel par confort :
 * une liste vide sans porte de sortie laisse l'utilisateur devant un mur.
 */

/** L'attente. Annoncée aux assistances techniques, pas seulement dessinée. */
export function Chargement({ quoi }: { quoi: string }) {
  const { t } = useTranslation("commun");
  return (
    <div className="etat-chargement" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <p>{t("etats.chargement", { quoi })}</p>
    </div>
  );
}

/**
 * L'échec d'un chargement, **avec le moyen de réessayer**.
 *
 * Le message vient de la clé envoyée par le serveur (`RG-GEN-08`) ; le repli
 * générique ne sert que si la clé est inconnue du catalogue — cas que
 * `pnpm i18n:check` empêche d'exister.
 */
export function ErreurDeChargement({
  erreur,
  surReessai,
}: {
  erreur: unknown;
  surReessai?: () => void;
}) {
  const { t } = useTranslation("commun");
  const { t: tErreurs } = useTranslation("erreurs");

  return (
    <div className="etat-erreur" role="alert">
      <p className="etat-titre">{t("etats.erreurTitre")}</p>
      <p>{messageErreur(erreur, tErreurs, t("etats.erreurRepli"))}</p>
      {surReessai ? (
        <Button className="btn" onPress={surReessai}>
          {t("etats.reessayer")}
        </Button>
      ) : null}
    </div>
  );
}

/**
 * L'absence de données, expliquée et suivie de sa sortie (`RG-GEN-04`).
 *
 * `sortie` est requis : c'est la contrainte qui empêche l'état vide de
 * dégénérer en page blanche polie.
 */
export function EtatVide({
  titre,
  explication,
  sortie,
}: {
  titre: string;
  explication: string;
  sortie: ReactNode;
}) {
  return (
    <div className="etat-vide">
      <p className="etat-titre">{titre}</p>
      <p className="etat-explication">{explication}</p>
      <div className="etat-sortie">{sortie}</div>
    </div>
  );
}

/**
 * Le refus de périmètre ou de permission.
 *
 * `RG-GEN-06` veut qu'une action interdite ne soit **pas proposée**. Cet état
 * traite le cas résiduel : une adresse saisie à la main, ou un droit retiré
 * pendant que la page était ouverte. Il dit ce qui manque, sans détailler ce
 * qui existe derrière — nommer l'objet renseignerait sur son existence.
 */
export function AccesRefuse({ erreur }: { erreur?: unknown }) {
  const { t } = useTranslation("commun");
  const horsPerimetre = erreur instanceof ErreurApi && erreur.statut === 403;

  return (
    <div className="etat-refus" role="alert">
      <p className="etat-titre">{t("droits.permissionRequise")}</p>
      <p>{horsPerimetre ? t("etats.refusPerimetre") : t("etats.refusPermission")}</p>
      <a className="btn" href="/">
        {t("etats.retourAccueil")}
      </a>
    </div>
  );
}

/**
 * Une adresse qui ne correspond à aucune vue.
 *
 * C'est un état vide comme un autre : il explique et propose sa sortie.
 */
export function RouteIntrouvable() {
  const { t } = useTranslation("commun");
  return (
    <EtatVide
      titre={t("etats.introuvableTitre")}
      explication={t("etats.introuvableExplication")}
      sortie={
        <a className="btn" href="/">
          {t("etats.retourAccueil")}
        </a>
      }
    />
  );
}
