import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "react-aria-components";
import { Champ } from "../composants/champs.js";
import { demanderReinitialisation } from "../api/session.js";
import { GabaritAcces } from "./gabarit-acces.js";

/**
 * Vue 03 — Mot de passe oublié.
 *
 * **Attention (brief)** : la confirmation est **identique** que l'adresse
 * existe ou non. C'est pourquoi cette vue n'a pas d'état d'erreur « adresse
 * inconnue » : il n'en existe pas, et en ajouter un trahirait l'existence des
 * comptes.
 */
export function MotDePasseOublie({
  disponible = true,
}: {
  /**
   * `RG-AUTH-03` dans l'esprit : une organisation peut couper la
   * réinitialisation autonome. L'état correspondant est spécifié par le brief
   * de la vue 03, et il a sa propre sortie — contacter l'administrateur.
   */
  disponible?: boolean;
} = {}) {
  const { t } = useTranslation("auth");
  const { t: tAcces } = useTranslation("acces");
  const [email, setEmail] = useState("");
  const [envoye, setEnvoye] = useState(false);
  const [enCours, setEnCours] = useState(false);

  async function soumettre(e: FormEvent) {
    e.preventDefault();
    setEnCours(true);
    try {
      await demanderReinitialisation(email);
    } finally {
      // Succès comme échec : même issue affichée.
      setEnvoye(true);
      setEnCours(false);
    }
  }

  if (!disponible) {
    return (
      <GabaritAcces
      chapeau={tAcces("oubli.chapeau")}
      titre={t("oubli.titre")}
      intro={t("oubli.intro")}
    >
        <div className="alert alert-warn" role="status">
          {t("oubli.indisponible")}
        </div>
        <div className="acces-liens">
          <a href="/connexion">{t("oubli.retour")}</a>
        </div>
      </GabaritAcces>
    );
  }

  return (
    <GabaritAcces
      chapeau={tAcces("oubli.chapeau")}
      titre={t("oubli.titre")}
      intro={t("oubli.intro")}
    >
      {envoye ? (
        <div className="alert alert-neutral" role="status">
          {t("oubli.envoye")}
        </div>
      ) : (
        <form onSubmit={soumettre} noValidate>
          <Champ
            libelle={t("inscription.email")}
            value={email}
            onChange={setEmail}
            type="email"
            autoComplete="email"
            isDisabled={enCours}
          />
          <Button type="submit" className="btn btn-primary" isDisabled={enCours}>
            {t("oubli.envoyerLien")}
          </Button>
        </form>
      )}
      <div className="acces-liens">
        <a href="/connexion">{t("oubli.retour")}</a>
      </div>
    </GabaritAcces>
  );
}
