import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "react-aria-components";
import { ChampMotDePasse, PolitiqueMotDePasse } from "../composants/champs.js";
import { reinitialiser } from "../api/session.js";
import { messageErreur } from "../api/erreurs.js";
import { ErreurApi } from "../api/client.js";
import { GabaritAcces } from "./gabarit-acces.js";

/**
 * Vue 04 — Réinitialisation du mot de passe.
 *
 * **Attention (brief)** : les trois cas d'échec de jeton sont **des messages
 * distincts, chacun avec sa sortie**. Le jeton expiré propose d'en redemander
 * un ; les deux autres non, parce qu'il n'y a rien à redemander.
 */
export function Reinitialisation({ jeton }: { jeton: string }) {
  const { t } = useTranslation("auth");
  const [motDePasse, setMotDePasse] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [erreur, setErreur] = useState<{ message: string; cle?: string | undefined } | null>(null);
  const [succes, setSucces] = useState(false);
  const [enCours, setEnCours] = useState(false);

  async function soumettre(e: FormEvent) {
    e.preventDefault();
    setErreur(null);
    if (motDePasse !== confirmation) {
      setErreur({ message: t("erreurs.motsDePasseDifferents") });
      return;
    }
    setEnCours(true);
    try {
      await reinitialiser(jeton, motDePasse);
      setSucces(true);
    } catch (e) {
      setErreur(
        { message: messageErreur(e, t, t("erreurs.jetonInvalide")), cle: e instanceof ErreurApi ? e.cle : undefined },
      );
    } finally {
      setEnCours(false);
    }
  }

  if (succes) {
    return (
      <GabaritAcces titre={t("reinitialisation.titre")}>
        <div className="alert alert-success" role="status">
          {t("reinitialisation.succes")}
        </div>
        <div className="acces-liens">
          <a href="/connexion">{t("oubli.retour")}</a>
        </div>
      </GabaritAcces>
    );
  }

  return (
    <GabaritAcces titre={t("reinitialisation.titre")}>
      <form onSubmit={soumettre} noValidate>
        {erreur ? (
          <div className="alert alert-danger" role="alert">
            {erreur.message}
            {/* Le jeton expiré a une sortie ; l'invalide et le déjà-utilisé n'en ont pas. */}
            {erreur.cle === "auth:erreurs.jetonExpire" ? (
              <p>
                <a href="/mot-de-passe-oublie">{t("erreurs.demanderNouveauLien")}</a>
              </p>
            ) : null}
          </div>
        ) : null}

        <ChampMotDePasse
          libelle={t("reinitialisation.nouveau")}
          value={motDePasse}
          onChange={setMotDePasse}
          autoComplete="new-password"
          isDisabled={enCours}
        />
        <PolitiqueMotDePasse valeur={motDePasse} />
        <ChampMotDePasse
          libelle={t("inscription.confirmation")}
          value={confirmation}
          onChange={setConfirmation}
          autoComplete="new-password"
          isDisabled={enCours}
        />
        <Button type="submit" className="btn btn-primary" isDisabled={enCours}>
          {t("reinitialisation.reinitialiser")}
        </Button>
      </form>
    </GabaritAcces>
  );
}
