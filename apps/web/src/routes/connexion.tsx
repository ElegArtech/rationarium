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
 * invalides · compte verrouillé · champs vides · succès.
 *
 * Le balisage suit la maquette : `.form-intro`, `.alert`, `.field-block`,
 * `.submit-row`, `.signup-row`. Le lien « Mot de passe oublié ? » vit **sur la
 * ligne du libellé** (`.field-head`), pas sous le bouton.
 */
export function Connexion({
  surSucces,
  inscriptionOuverte = false,
}: {
  surSucces: (motDePasseAChanger: boolean) => void;
  inscriptionOuverte?: boolean;
}) {
  const { t } = useTranslation("auth");
  const { t: tAcces } = useTranslation("acces");
  const [identifiant, setIdentifiant] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [reussi, setReussi] = useState(false);
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
      // L'état « succès » de la maquette : l'alerte et la ligne de redirection
      // s'affichent avant la bascule, sinon l'écran saute sans rien dire.
      setReussi(true);
      surSucces(session.motDePasseAChanger);
    } catch (e) {
      // **Les champs restent remplis** — exigence explicite du brief.
      setErreur(messageErreur(e, t, t("erreurs.identifiantsInvalides")));
      setEnCours(false);
    }
  }

  if (reussi) {
    return (
      <GabaritAcces
        chapeau={tAcces("connexion.chapeau")}
        titre={t("connexion.titre")}
        intro={t("connexion.intro")}
      >
        <div className="alert alert-success">
          <span className="alert-icon" aria-hidden="true">
            ✓
          </span>
          <span>{t("connexion.reussie")}</span>
        </div>
        <p className="redirect">
          <span className="spinner spinner-ink" aria-hidden="true" />
          <span>{t("connexion.redirection")}</span>
        </p>
      </GabaritAcces>
    );
  }

  return (
    <GabaritAcces
      chapeau={tAcces("connexion.chapeau")}
      titre={t("connexion.titre")}
      intro={t("connexion.intro")}
    >
      <form onSubmit={soumettre} noValidate autoComplete="on">
        {erreur ? (
          <div className="alert alert-error" role="alert">
            <span className="alert-icon" aria-hidden="true">
              !
            </span>
            <span>{erreur}</span>
          </div>
        ) : null}

        <Champ
          libelle={t("connexion.identifiant")}
          placeholder={t("connexion.identifiantExemple")}
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
          action={
            <a href="/mot-de-passe-oublie" className="link link-sm">
              {t("connexion.motDePasseOublie")}
            </a>
          }
        />

        <div className="submit-row">
          <Button type="submit" className="btn btn-primary btn-block" isDisabled={enCours}>
            {enCours ? <span className="spinner" aria-hidden="true" /> : null}
            <span>{enCours ? t("connexion.enCours") : t("connexion.seConnecter")}</span>
          </Button>
        </div>

        {/* Variante du brief : quand l'inscription est fermée, la ligne
            DISPARAÎT entièrement. Elle n'est pas désactivée — elle n'existe pas. */}
        {inscriptionOuverte ? (
          <div className="signup-row">
            <span>{t("connexion.pasDeCompte")}</span>
            <a href="/inscription" className="link">
              {t("connexion.sInscrire")}
            </a>
          </div>
        ) : null}
      </form>
    </GabaritAcces>
  );
}
