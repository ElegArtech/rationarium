import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "react-aria-components";
import { Champ } from "../composants/champs.js";
import { demanderReinitialisation } from "../api/session.js";
import { GabaritAcces } from "./gabarit-acces.js";

/**
 * Vue 03 — Mot de passe oublié.
 *
 * **Attention (brief)** : la confirmation est **identique** que l'adresse
 * existe ou non. Cette vue n'a donc aucun état « adresse inconnue » : il n'en
 * existe pas, et en ajouter un trahirait l'existence des comptes. C'est aussi
 * pourquoi le renvoi est différé de quarante-cinq secondes — sans ce délai, la
 * page devient un compteur d'adresses valides à qui sait mesurer.
 *
 * États couverts : nominal · email requis · format invalide · envoi · envoyé
 * (avec décompte de renvoi) · envoi de courriel indisponible sur l'instance.
 */

/** Le délai de renvoi, en secondes. Valeur de la maquette. */
const DELAI_RENVOI = 45;

/** Contrôle de forme, pas de validité : le serveur reste seul juge. */
const FORME_EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

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
  const [erreur, setErreur] = useState<string | undefined>(undefined);
  const [envoye, setEnvoye] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [restant, setRestant] = useState(0);
  const horloge = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => clearInterval(horloge.current ?? undefined), []);

  function lancerDecompte() {
    setRestant(DELAI_RENVOI);
    clearInterval(horloge.current ?? undefined);
    horloge.current = setInterval(() => {
      setRestant((r) => {
        if (r <= 1) clearInterval(horloge.current ?? undefined);
        return r - 1;
      });
    }, 1_000);
  }

  const entete = {
    chapeau: tAcces("oubli.chapeau"),
    titre: t("oubli.titre"),
    intro: t("oubli.intro"),
  };

  async function envoyer(adresse: string) {
    setEnCours(true);
    try {
      await demanderReinitialisation(adresse);
    } catch {
      // Succès comme échec : **même issue affichée**. Une panne visible ici
      // dirait au visiteur qu'il a touché quelque chose.
    } finally {
      setEnvoye(adresse);
      setEnCours(false);
      lancerDecompte();
    }
  }

  async function soumettre(e: FormEvent) {
    e.preventDefault();
    const adresse = email.trim();
    if (!adresse) {
      setErreur(t("erreurs.emailRequis"));
      return;
    }
    if (!FORME_EMAIL.test(adresse)) {
      setErreur(t("erreurs.emailFormat"));
      return;
    }
    setErreur(undefined);
    await envoyer(adresse);
  }

  const retour = (
    <div className="signup-row" style={{ textAlign: "center" }}>
      <a href="/connexion" className="link">
        {t("oubli.retourFleche")}
      </a>
    </div>
  );

  // ─── L'envoi de courriel n'est pas activé sur cette instance ───
  if (!disponible) {
    return (
      <GabaritAcces {...entete} intro={undefined}>
        <div className="alert alert-warn">
          <span className="alert-icon" aria-hidden="true">
            !
          </span>
          <span>{t("oubli.indisponible")}</span>
        </div>
        <p className="lede" style={{ marginBottom: 24 }}>
          {t("oubli.indisponibleExplication")}
        </p>
        <a href="/connexion" className="btn btn-primary btn-block">
          {t("oubli.retour")}
        </a>
      </GabaritAcces>
    );
  }

  // ─── Lien envoyé — confirmation volontairement neutre ───
  if (envoye !== null) {
    return (
      <GabaritAcces {...entete} intro={undefined}>
        <div className="alert alert-neutral" role="status">
          <span className="alert-icon" aria-hidden="true">
            →
          </span>
          <span>{t("oubli.envoye")}</span>
        </div>

        <p className="sent-addr">
          <span className="eyebrow">{t("oubli.adresseSaisie")}</span>
          <span className="sent-mail">{envoye}</span>
        </p>

        <p className="lede" style={{ marginBottom: 24 }}>
          {t("oubli.delai")}
        </p>

        <Button
          className="btn btn-secondary btn-block"
          isDisabled={restant > 0 || enCours}
          onPress={() => void envoyer(envoye)}
        >
          <span>
            {restant > 0 ? t("oubli.renvoyerDans", { n: restant }) : t("oubli.renvoyer")}
          </span>
        </Button>

        {retour}
      </GabaritAcces>
    );
  }

  return (
    <GabaritAcces {...entete}>
      <form onSubmit={soumettre} noValidate autoComplete="on">
        <Champ
          libelle={t("inscription.email")}
          type="email"
          placeholder={t("inscription.emailExemple")}
          value={email}
          onChange={(v) => {
            setEmail(v);
            setErreur(undefined);
          }}
          isDisabled={enCours}
          autoComplete="email"
          erreur={erreur}
          reserve
        />

        <div className="submit-row">
          <Button type="submit" className="btn btn-primary btn-block" isDisabled={enCours}>
            {enCours ? <span className="spinner" aria-hidden="true" /> : null}
            <span>{enCours ? t("oubli.enCours") : t("oubli.envoyerLien")}</span>
          </Button>
        </div>

        {retour}
      </form>
    </GabaritAcces>
  );
}
