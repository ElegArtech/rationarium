import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "react-aria-components";
import { Champ, ChampMotDePasse } from "../composants/champs.js";
import { connexion } from "../api/session.js";
import { messageErreur } from "../api/erreurs.js";
import { GabaritAcces } from "./gabarit-acces.js";

/**
 * Vue 01 — Connexion.
 *
 * **Attention (brief)** : le message d'échec ne doit jamais laisser deviner si
 * l'identifiant existe. Un seul message pour les deux cas. C'est pourquoi
 * cette vue n'interprète pas le code d'erreur du serveur : elle affiche ce
 * qu'il envoie, et le serveur envoie le même texte dans les deux situations.
 *
 * États couverts (`design/etats.json`) : nominal · soumission · identifiants
 * invalides · compte verrouillé · champs vides · inscription désactivée.
 */
export function Connexion({
  surSucces,
  inscriptionOuverte = false,
}: {
  surSucces: (motDePasseAChanger: boolean) => void;
  inscriptionOuverte?: boolean;
}) {
  const { t } = useTranslation("auth");
  const [identifiant, setIdentifiant] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [erreurChamp, setErreurChamp] = useState<{ identifiant?: string; motDePasse?: string }>({});

  async function soumettre(e: FormEvent) {
    e.preventDefault();
    setErreur(null);

    // Champs vides : messages distincts, vue 01.
    const champs: typeof erreurChamp = {};
    if (!identifiant.trim()) champs.identifiant = t("erreurs.identifiantRequis");
    if (!motDePasse) champs.motDePasse = t("erreurs.motDePasseRequis");
    setErreurChamp(champs);
    if (Object.keys(champs).length > 0) return;

    setEnCours(true);
    try {
      const session = await connexion(identifiant, motDePasse);
      surSucces(session.motDePasseAChanger);
    } catch (e) {
      // **Les champs restent remplis** — exigence explicite du brief.
      setErreur(
        messageErreur(e, t, t("erreurs.identifiantsInvalides")),
      );
    } finally {
      setEnCours(false);
    }
  }

  return (
    <GabaritAcces titre={t("connexion.titre")}>
      <form onSubmit={soumettre} noValidate>
        {erreur ? (
          <div className="alert alert-danger" role="alert">
            {erreur}
          </div>
        ) : null}

        <Champ
          libelle={t("connexion.identifiant")}
          value={identifiant}
          onChange={setIdentifiant}
          isDisabled={enCours}
          autoComplete="username"
          erreur={erreurChamp.identifiant}
        />

        <ChampMotDePasse
          libelle={t("connexion.motDePasse")}
          value={motDePasse}
          onChange={setMotDePasse}
          isDisabled={enCours}
          autoComplete="current-password"
          erreur={erreurChamp.motDePasse}
        />

        <Button type="submit" className="btn btn-primary" isDisabled={enCours}>
          {enCours ? t("connexion.enCours") : t("connexion.seConnecter")}
        </Button>

        <div className="acces-liens">
          <a href="/mot-de-passe-oublie">{t("connexion.motDePasseOublie")}</a>
          {/* Variante du brief : quand l'inscription est fermée, le lien
              DISPARAÎT entièrement. Il n'est pas désactivé — il n'existe pas. */}
          {inscriptionOuverte ? (
            <p className="acces-secondaire">
              {t("connexion.pasDeCompte")} <a href="/inscription">{t("connexion.sInscrire")}</a>
            </p>
          ) : null}
        </div>
      </form>
    </GabaritAcces>
  );
}
