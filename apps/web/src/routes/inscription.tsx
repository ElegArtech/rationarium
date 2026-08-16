import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "react-aria-components";
import { Champ, ChampMotDePasse, politiqueTenue } from "../composants/champs.js";
import { inscription } from "../api/session.js";
import { messageErreur } from "../api/erreurs.js";
import { ErreurApi } from "../api/client.js";
import { GabaritAcces } from "./gabarit-acces.js";

/**
 * Vue 02 — Inscription.
 *
 * **Attention (brief)** : six messages d'erreur distincts à loger **sans que
 * le formulaire ne saute**. La maquette y répond en réservant la place du
 * message sous chaque champ (`.field-error.is-quiet`), pas par une zone
 * d'alerte en tête : le message doit désigner le champ fautif, et un message
 * global ne le désigne pas.
 *
 * États couverts (`design/etats.json` + panneau de revue de la maquette) :
 * nominal · politique en cours de frappe · champs requis · mots de passe
 * différents · email pris · login pris · domaine refusé · fonctionnalité
 * désactivée · soumission · succès.
 *
 * **Ce que le client ne décide pas** : ni l'unicité de l'email, ni celle du
 * login, ni la liste des domaines autorisés. Ces trois-là sont des réponses du
 * serveur, replacées sur le champ concerné par leur clé — un client qui
 * pré-jugerait de l'unicité d'une adresse dirait au visiteur qui possède un
 * compte.
 */

type Champs = {
  prenom: string;
  nom: string;
  email: string;
  login: string;
  motDePasse: string;
  confirmation: string;
};

type Erreurs = Partial<Record<keyof Champs, string>>;

const VIDE: Champs = {
  prenom: "",
  nom: "",
  email: "",
  login: "",
  motDePasse: "",
  confirmation: "",
};

const ID_MOT_DE_PASSE = "inscription-mot-de-passe";

/** Clé d'erreur du serveur → champ qui la porte. */
const CHAMP_DE_LA_CLE: Record<string, keyof Champs> = {
  "auth:erreurs.emailDejaPris": "email",
  "auth:erreurs.domaineNonAutorise": "email",
  "auth:erreurs.loginDejaPris": "login",
};

export function Inscription({
  ouverte = true,
  surSucces,
}: {
  ouverte?: boolean;
  surSucces?: () => void;
}) {
  const { t } = useTranslation("auth");
  const { t: tAcces } = useTranslation("acces");
  const [champs, setChamps] = useState<Champs>(VIDE);
  const [erreurs, setErreurs] = useState<Erreurs>({});
  const [enCours, setEnCours] = useState(false);
  const [cree, setCree] = useState(false);

  // La redirection est différée : sans ce délai, l'écran saute sans que la
  // confirmation ait eu le temps d'être lue.
  useEffect(() => {
    if (!cree || !surSucces) return;
    const minuteur = setTimeout(surSucces, 1_100);
    return () => clearTimeout(minuteur);
  }, [cree, surSucces]);

  const modifier = (cle: keyof Champs) => (v: string) => {
    setChamps((c) => ({ ...c, [cle]: v }));
    // Validation vivante : le message disparaît dès que l'on corrige.
    setErreurs((e) => {
      if (!(cle in e)) return e;
      const suite = { ...e };
      delete suite[cle];
      return suite;
    });
  };

  const entete = {
    chapeau: tAcces("inscription.chapeau"),
    titre: t("inscription.titre"),
    intro: t("inscription.intro"),
  };

  async function soumettre(e: FormEvent) {
    e.preventDefault();

    const trouves: Erreurs = {};
    if (!champs.prenom.trim()) trouves.prenom = t("erreurs.prenomRequis");
    if (!champs.nom.trim()) trouves.nom = t("erreurs.nomRequis");
    if (!champs.email.trim()) trouves.email = t("erreurs.emailRequis");
    if (!champs.login.trim()) trouves.login = t("erreurs.identifiantRequis");
    if (!champs.confirmation) trouves.confirmation = t("erreurs.confirmationRequise");
    setErreurs(trouves);
    if (Object.keys(trouves).length > 0) return;

    // La politique n'a pas de message : elle est déjà énoncée, critère par
    // critère, sous le champ. On y ramène le curseur, comme la maquette.
    if (!politiqueTenue(champs.motDePasse)) {
      document.getElementById(ID_MOT_DE_PASSE)?.focus();
      return;
    }
    if (champs.motDePasse !== champs.confirmation) {
      setErreurs({ confirmation: t("erreurs.motsDePasseDifferents") });
      return;
    }

    setEnCours(true);
    try {
      await inscription(champs);
      setCree(true);
    } catch (erreur) {
      const cle = erreur instanceof ErreurApi ? erreur.cle : undefined;
      const champ = (cle ? CHAMP_DE_LA_CLE[cle] : undefined) ?? "email";
      setErreurs({ [champ]: messageErreur(erreur, t, t("erreurs.emailDejaPris")) });
      setEnCours(false);
    }
  }

  // Page atteinte par URL directe alors que la fonction est désactivée.
  if (!ouverte) {
    return (
      <GabaritAcces {...entete} large>
        <div className="alert alert-error">
          <span className="alert-icon" aria-hidden="true">
            !
          </span>
          <span>{t("erreurs.inscriptionDesactivee")}</span>
        </div>
        <p className="lede" style={{ marginBottom: 20 }}>
          {t("inscription.desactiveeExplication")}
        </p>
        <a href="/connexion" className="btn btn-primary btn-block">
          {t("oubli.retour")}
        </a>
      </GabaritAcces>
    );
  }

  if (cree) {
    return (
      <GabaritAcces {...entete} large>
        <div className="alert alert-success" role="status">
          <span className="alert-icon" aria-hidden="true">
            ✓
          </span>
          <span>{t("inscription.creee")}</span>
        </div>
        <p className="redirect">
          <span className="spinner spinner-ink" aria-hidden="true" />
          <span>{t("inscription.redirection")}</span>
        </p>
      </GabaritAcces>
    );
  }

  return (
    <GabaritAcces {...entete} large>
      <form onSubmit={soumettre} noValidate autoComplete="on">
        <div className="name-row">
          <Champ
            libelle={t("inscription.prenom")}
            value={champs.prenom}
            onChange={modifier("prenom")}
            isDisabled={enCours}
            autoComplete="given-name"
            erreur={erreurs.prenom}
            reserve
          />
          <Champ
            libelle={t("inscription.nom")}
            value={champs.nom}
            onChange={modifier("nom")}
            isDisabled={enCours}
            autoComplete="family-name"
            erreur={erreurs.nom}
            reserve
          />
        </div>

        <Champ
          libelle={t("inscription.email")}
          type="email"
          placeholder={t("inscription.emailExemple")}
          value={champs.email}
          onChange={modifier("email")}
          isDisabled={enCours}
          autoComplete="email"
          erreur={erreurs.email}
          reserve
          reserveHaute
        />

        <Champ
          libelle={t("inscription.login")}
          placeholder={t("inscription.loginExemple")}
          value={champs.login}
          onChange={modifier("login")}
          isDisabled={enCours}
          autoComplete="username"
          aide={t("inscription.loginAide")}
          erreur={erreurs.login}
          reserve
        />

        <ChampMotDePasse
          libelle={t("connexion.motDePasse")}
          idChamp={ID_MOT_DE_PASSE}
          value={champs.motDePasse}
          onChange={modifier("motDePasse")}
          isDisabled={enCours}
          autoComplete="new-password"
          politique
        />

        <ChampMotDePasse
          libelle={t("inscription.confirmation")}
          value={champs.confirmation}
          onChange={modifier("confirmation")}
          isDisabled={enCours}
          autoComplete="new-password"
          erreur={erreurs.confirmation}
          reserve
        />

        <div className="submit-row">
          <Button type="submit" className="btn btn-primary btn-block" isDisabled={enCours}>
            {enCours ? <span className="spinner" aria-hidden="true" /> : null}
            <span>{enCours ? t("inscription.enCours") : t("connexion.sInscrire")}</span>
          </Button>
        </div>

        <div className="signup-row">
          <span>{t("inscription.dejaUnCompte")}</span>
          <a href="/connexion" className="link">
            {t("inscription.seConnecter")}
          </a>
        </div>
      </form>
    </GabaritAcces>
  );
}
