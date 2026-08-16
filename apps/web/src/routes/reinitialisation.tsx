import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "react-aria-components";
import { ChampMotDePasse, politiqueTenue } from "../composants/champs.js";
import { reinitialiser } from "../api/session.js";
import { ErreurApi } from "../api/client.js";
import { GabaritAcces } from "./gabarit-acces.js";

/**
 * Vue 04 — Réinitialisation du mot de passe.
 *
 * **Attention (brief)** : les trois cas d'échec de jeton sont **des messages
 * distincts, chacun avec sa sortie**, et les sorties diffèrent parce que la
 * situation diffère. Le lien expiré et le lien invalide invitent à en demander
 * un nouveau ; le lien déjà utilisé invite d'abord à se connecter, puisque le
 * mot de passe a bel et bien changé — proposer d'en redemander un en premier
 * lui ferait croire que sa manœuvre a échoué.
 *
 * États couverts : nominal · politique en cours de frappe · mots de passe
 * différents · enregistrement · succès · lien expiré · lien déjà utilisé ·
 * lien invalide.
 */

const ID_MOT_DE_PASSE = "reinitialisation-mot-de-passe";

/** Les trois échecs de lien, par la clé que le serveur renvoie. */
const ECHECS = {
  "auth:erreurs.jetonExpire": "expire",
  "auth:erreurs.jetonDejaUtilise": "utilise",
  "auth:erreurs.jetonInvalide": "invalide",
} as const;

type Echec = (typeof ECHECS)[keyof typeof ECHECS];

export function Reinitialisation({
  jeton,
  compte = "",
}: {
  jeton: string;
  /**
   * Le compte que le lien désigne.
   *
   * La maquette l'affiche — « Compte concerné » — et **le serveur ne l'expose
   * nulle part** : il n'existe aucun point d'entrée de vérification de jeton,
   * et le lien n'est aujourd'hui construit par personne. Voir le compte rendu.
   */
  compte?: string;
}) {
  const { t } = useTranslation("auth");
  const { t: tAcces } = useTranslation("acces");
  const [motDePasse, setMotDePasse] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [erreur, setErreur] = useState<string | undefined>(undefined);
  const [echec, setEchec] = useState<Echec | null>(null);
  const [succes, setSucces] = useState(false);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    if (!succes) return;
    const minuteur = setTimeout(() => {
      window.location.assign("/connexion");
    }, 1_100);
    return () => clearTimeout(minuteur);
  }, [succes]);

  async function soumettre(e: FormEvent) {
    e.preventDefault();
    if (!politiqueTenue(motDePasse)) {
      document.getElementById(ID_MOT_DE_PASSE)?.focus();
      return;
    }
    if (!confirmation) {
      setErreur(t("erreurs.confirmationRequise"));
      return;
    }
    if (motDePasse !== confirmation) {
      setErreur(t("erreurs.motsDePasseDifferents"));
      return;
    }
    setErreur(undefined);
    setEnCours(true);
    try {
      await reinitialiser(jeton, motDePasse);
      setSucces(true);
    } catch (e) {
      const cle = e instanceof ErreurApi ? e.cle : undefined;
      // Tout échec qui n'est pas de saisie est un échec de lien : la vue le
      // remplace entièrement, elle ne le loge pas sous un champ.
      setEchec((cle && ECHECS[cle as keyof typeof ECHECS]) || "invalide");
      setEnCours(false);
    }
  }

  const chapeau = tAcces("reinitialisation.chapeau");

  // ─── Les trois échecs de lien : trois messages, trois sorties ───
  if (echec) {
    const panneaux = {
      expire: {
        classe: "alert-warn",
        icone: "⏱",
        message: t("reinitialisation.expire"),
        explication: t("reinitialisation.expireExplication"),
        principal: { href: "/mot-de-passe-oublie", libelle: t("reinitialisation.nouveauLien") },
        second: { href: "/connexion", libelle: t("oubli.retour") },
      },
      utilise: {
        classe: "alert-warn",
        icone: "✓",
        message: t("reinitialisation.utilise"),
        explication: t("reinitialisation.utiliseExplication"),
        principal: { href: "/connexion", libelle: t("inscription.seConnecter") },
        second: { href: "/mot-de-passe-oublie", libelle: t("reinitialisation.nouveauLien") },
      },
      invalide: {
        classe: "alert-error",
        icone: "!",
        message: t("reinitialisation.invalide"),
        explication: t("reinitialisation.invalideExplication"),
        principal: { href: "/mot-de-passe-oublie", libelle: t("reinitialisation.nouveauLien") },
        second: { href: "/connexion", libelle: t("oubli.retour") },
      },
    }[echec];

    return (
      <GabaritAcces chapeau={chapeau} titre={t("reinitialisation.titreLienInutilisable")}>
        <div className={`alert ${panneaux.classe}`} role="alert">
          <span className="alert-icon" aria-hidden="true">
            {panneaux.icone}
          </span>
          <span>{panneaux.message}</span>
        </div>
        <p className="lede" style={{ marginBottom: 24 }}>
          {panneaux.explication}
        </p>
        <div className="btn-stack">
          <a href={panneaux.principal.href} className="btn btn-primary btn-block">
            {panneaux.principal.libelle}
          </a>
          <a href={panneaux.second.href} className="btn btn-secondary btn-block">
            {panneaux.second.libelle}
          </a>
        </div>
      </GabaritAcces>
    );
  }

  if (succes) {
    return (
      <GabaritAcces chapeau={chapeau} titre={t("reinitialisation.titre")}>
        <div className="alert alert-success" role="status">
          <span className="alert-icon" aria-hidden="true">
            ✓
          </span>
          <span>{t("reinitialisation.succes")}</span>
        </div>
        <p className="redirect">
          <span className="spinner spinner-ink" aria-hidden="true" />
          <span>{t("reinitialisation.redirection")}</span>
        </p>
      </GabaritAcces>
    );
  }

  return (
    <GabaritAcces
      chapeau={chapeau}
      titre={t("reinitialisation.titre")}
      intro={t("reinitialisation.intro")}
    >
      <form onSubmit={soumettre} noValidate autoComplete="on">
        <p className="sent-addr">
          <span className="eyebrow">{t("reinitialisation.compteConcerne")}</span>
          <span className="sent-mail">{compte}</span>
        </p>

        <ChampMotDePasse
          libelle={t("reinitialisation.nouveau")}
          idChamp={ID_MOT_DE_PASSE}
          value={motDePasse}
          onChange={setMotDePasse}
          isDisabled={enCours}
          autoComplete="new-password"
          politique
        />

        <ChampMotDePasse
          libelle={t("reinitialisation.confirmation")}
          value={confirmation}
          onChange={(v) => {
            setConfirmation(v);
            setErreur(undefined);
          }}
          isDisabled={enCours}
          autoComplete="new-password"
          erreur={erreur}
          reserve
        />

        <div className="submit-row">
          <Button type="submit" className="btn btn-primary btn-block" isDisabled={enCours}>
            {enCours ? <span className="spinner" aria-hidden="true" /> : null}
            <span>
              {enCours ? t("reinitialisation.enCours") : t("reinitialisation.reinitialiser")}
            </span>
          </Button>
        </div>

        <div className="signup-row" style={{ textAlign: "center" }}>
          <a href="/connexion" className="link">
            {t("oubli.retourFleche")}
          </a>
        </div>
      </form>
    </GabaritAcces>
  );
}
