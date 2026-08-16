import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "react-aria-components";
import { Champ, ChampMotDePasse, PolitiqueMotDePasse } from "../composants/champs.js";
import { inscription } from "../api/session.js";
import { messageErreur } from "../api/erreurs.js";
import { GabaritAcces } from "./gabarit-acces.js";

/**
 * Vue 02 — Inscription.
 *
 * **Attention (brief)** : six messages d'erreur distincts à loger **sans que
 * le formulaire ne saute**. D'où une zone d'alerte de hauteur réservée en
 * tête, plutôt qu'un message inséré entre les champs.
 */
export function Inscription({ ouverte = true }: { ouverte?: boolean }) {
  const { t } = useTranslation("auth");
  const [champs, setChamps] = useState({
    prenom: "", nom: "", email: "", login: "", motDePasse: "", confirmation: "",
  });
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [cree, setCree] = useState(false);

  const modifier = (cle: keyof typeof champs) => (v: string) =>
    setChamps((c) => ({ ...c, [cle]: v }));

  // Page atteinte par URL directe alors que la fonction est désactivée.
  if (!ouverte) {
    return (
      <GabaritAcces titre={t("inscription.titre")}>
        <div className="alert alert-warn" role="status">
          {t("erreurs.inscriptionDesactivee")}
        </div>
        <div className="acces-liens">
          <a href="/connexion">{t("oubli.retour")}</a>
        </div>
      </GabaritAcces>
    );
  }

  async function soumettre(e: FormEvent) {
    e.preventDefault();
    setErreur(null);
    if (champs.motDePasse !== champs.confirmation) {
      setErreur(t("erreurs.motsDePasseDifferents"));
      return;
    }
    setEnCours(true);
    try {
      await inscription(champs);
      setCree(true);
    } catch (e) {
      setErreur(messageErreur(e, t, t("erreurs.inscriptionDesactivee")));
    } finally {
      setEnCours(false);
    }
  }

  if (cree) {
    return (
      <GabaritAcces titre={t("inscription.titre")}>
        <div className="alert alert-success" role="status">
          {t("reinitialisation.succes")}
        </div>
        <div className="acces-liens">
          <a href="/connexion">{t("inscription.seConnecter")}</a>
        </div>
      </GabaritAcces>
    );
  }

  return (
    <GabaritAcces titre={t("inscription.titre")}>
      <form onSubmit={soumettre} noValidate>
        {/* Zone d'alerte en tête : le formulaire ne saute pas quand un message apparaît. */}
        <div className="zone-alerte" aria-live="polite">
          {erreur ? (
            <div className="alert alert-danger" role="alert">
              {erreur}
            </div>
          ) : null}
        </div>

        <Champ libelle={t("inscription.prenom")} value={champs.prenom} onChange={modifier("prenom")} isDisabled={enCours} autoComplete="given-name" />
        <Champ libelle={t("inscription.nom")} value={champs.nom} onChange={modifier("nom")} isDisabled={enCours} autoComplete="family-name" />
        <Champ libelle={t("inscription.email")} value={champs.email} onChange={modifier("email")} type="email" isDisabled={enCours} autoComplete="email" />
        <Champ libelle={t("inscription.login")} value={champs.login} onChange={modifier("login")} isDisabled={enCours} autoComplete="username" />
        <ChampMotDePasse libelle={t("connexion.motDePasse")} value={champs.motDePasse} onChange={modifier("motDePasse")} isDisabled={enCours} autoComplete="new-password" />
        <PolitiqueMotDePasse valeur={champs.motDePasse} />
        <ChampMotDePasse libelle={t("inscription.confirmation")} value={champs.confirmation} onChange={modifier("confirmation")} isDisabled={enCours} autoComplete="new-password" />

        <Button type="submit" className="btn btn-primary" isDisabled={enCours}>
          {t("connexion.sInscrire")}
        </Button>
        <div className="acces-liens">
          <p className="acces-secondaire">
            {t("inscription.dejaUnCompte")} <a href="/connexion">{t("inscription.seConnecter")}</a>
          </p>
        </div>
      </form>
    </GabaritAcces>
  );
}
