import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "react-aria-components";
import { ChampMotDePasse, PolitiqueMotDePasse } from "../composants/champs.js";
import { changerMotDePasse } from "../api/session.js";
import { messageErreur } from "../api/erreurs.js";
import { GabaritAcces } from "./gabarit-acces.js";

/**
 * Vue 05 — Changement de mot de passe imposé.
 *
 * **Attention (brief)** : aucune issue latérale, et l'utilisateur doit
 * comprendre pourquoi il est bloqué là. D'où l'explication en tête, et
 * l'absence de tout lien de navigation — y compris vers la déconnexion.
 */
export function MotDePasseImpose({ surSucces }: { surSucces: () => void }) {
  const { t } = useTranslation("auth");
  const { t: tAcces } = useTranslation("acces");
  const [actuel, setActuel] = useState("");
  const [nouveau, setNouveau] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function soumettre(e: FormEvent) {
    e.preventDefault();
    setErreur(null);
    if (nouveau !== confirmation) {
      setErreur(t("erreurs.motsDePasseDifferents"));
      return;
    }
    setEnCours(true);
    try {
      await changerMotDePasse(actuel, nouveau, confirmation);
      surSucces();
    } catch (e) {
      setErreur(messageErreur(e, t, t("erreurs.ancienMotDePasseIncorrect")));
    } finally {
      setEnCours(false);
    }
  }

  return (
    <GabaritAcces
      chapeau={tAcces("impose.chapeau")}
      titre={t("impose.titre")}
      intro={t("impose.intro")}
    >
      <p className="acces-explication">{t("impose.explication")}</p>
      <form onSubmit={soumettre} noValidate>
        <div className="zone-alerte" aria-live="polite">
          {erreur ? (
            <div className="alert alert-danger" role="alert">
              {erreur}
            </div>
          ) : null}
        </div>
        <ChampMotDePasse libelle={t("impose.actuel")} value={actuel} onChange={setActuel} isDisabled={enCours} autoComplete="current-password" />
        <ChampMotDePasse libelle={t("reinitialisation.nouveau")} value={nouveau} onChange={setNouveau} isDisabled={enCours} autoComplete="new-password" />
        <PolitiqueMotDePasse valeur={nouveau} />
        <ChampMotDePasse libelle={t("inscription.confirmation")} value={confirmation} onChange={setConfirmation} isDisabled={enCours} autoComplete="new-password" />
        <Button type="submit" className="btn btn-primary" isDisabled={enCours}>
          {t("reinitialisation.reinitialiser")}
        </Button>
      </form>
      {/* Aucune issue latérale : c'est le point du brief. */}
    </GabaritAcces>
  );
}
