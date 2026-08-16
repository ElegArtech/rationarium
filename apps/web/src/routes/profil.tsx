import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button, Radio, RadioGroup, Label } from "react-aria-components";
import { Champ, ChampMotDePasse, PolitiqueMotDePasse } from "../composants/champs.js";
import { changerMotDePasse } from "../api/session.js";
import { messageErreur } from "../api/erreurs.js";
import { changerLangue, LANGUES, type Langue } from "../i18n/index.js";
import { definirTheme, themeCourant, THEMES, type Theme } from "../theme/index.js";
import i18next from "i18next";

/**
 * Vue 35 — Mon profil.
 *
 * `EX-AUTH-09` : identité, avatar, langue, thème. `EX-AUTH-10` : dernière
 * connexion. `EX-AUTH-08` : changement de mot de passe.
 *
 * `RG-AUTH-08` — **l'identifiant de connexion n'est jamais modifiable après
 * création**. Il est donc affiché en lecture seule, avec l'explication : un
 * champ grisé sans motif se lit comme un défaut.
 */
export function Profil({
  utilisateur,
}: {
  utilisateur: {
    prenom: string;
    nom: string;
    email: string;
    login: string;
    role: string;
    derniereConnexion: string | null;
  };
}) {
  const { t } = useTranslation("coquille");
  const { t: tAuth } = useTranslation("auth");

  const [langue, setLangue] = useState<Langue>(i18next.language as Langue);
  const [theme, setTheme] = useState<Theme>(themeCourant);

  const [actuel, setActuel] = useState("");
  const [nouveau, setNouveau] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState<{ type: "succes" | "erreur"; texte: string } | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function soumettreMotDePasse(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (nouveau !== confirmation) {
      setMessage({ type: "erreur", texte: tAuth("erreurs.motsDePasseDifferents") });
      return;
    }
    setEnCours(true);
    try {
      await changerMotDePasse(actuel, nouveau, confirmation);
      setMessage({ type: "succes", texte: tAuth("reinitialisation.succes") });
      setActuel("");
      setNouveau("");
      setConfirmation("");
    } catch (e) {
      setMessage({
        type: "erreur",
        texte: messageErreur(e, t, tAuth("erreurs.ancienMotDePasseIncorrect")),
      });
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="page">
      <h1 className="page-titre">{t("profil.titre")}</h1>

      <section className="carte" aria-labelledby="profil-identite">
        <h2 id="profil-identite" className="carte-titre">
          {t("profil.identite")}
        </h2>
        <dl className="paires">
          <dt>{tAuth("inscription.prenom")}</dt>
          <dd>{utilisateur.prenom}</dd>
          <dt>{tAuth("inscription.nom")}</dt>
          <dd>{utilisateur.nom}</dd>
          <dt>{tAuth("inscription.email")}</dt>
          <dd>{utilisateur.email}</dd>
          <dt>{tAuth("inscription.login")}</dt>
          {/* RG-AUTH-08 : non modifiable, et on dit pourquoi. */}
          <dd>
            <span className="mono">{utilisateur.login}</span>{" "}
            <span className="muted">— non modifiable après création</span>
          </dd>
          <dt>{t("profil.derniereConnexion")}</dt>
          <dd>
            {utilisateur.derniereConnexion ? (
              <time dateTime={utilisateur.derniereConnexion}>
                {new Intl.DateTimeFormat(langue, { dateStyle: "long", timeStyle: "short" }).format(
                  new Date(utilisateur.derniereConnexion),
                )}
              </time>
            ) : (
              <span className="muted">{t("profil.jamaisConnecte")}</span>
            )}
          </dd>
        </dl>
      </section>

      <section className="carte" aria-labelledby="profil-preferences">
        <h2 id="profil-preferences" className="carte-titre">
          {t("profil.preferences")}
        </h2>

        <RadioGroup
          value={langue}
          onChange={(v) => {
            const l = v as Langue;
            setLangue(l);
            void changerLangue(l);
          }}
        >
          <Label className="label">{t("entete.langue")}</Label>
          {LANGUES.map((l) => (
            <Radio key={l} value={l} className="radio">
              {l === "fr" ? "Français" : "English"}
            </Radio>
          ))}
        </RadioGroup>

        <RadioGroup
          value={theme}
          onChange={(v) => {
            const m = v as Theme;
            setTheme(m);
            definirTheme(m);
          }}
        >
          <Label className="label">{t("entete.theme")}</Label>
          {THEMES.map((m) => (
            <Radio key={m} value={m} className="radio">
              {t(
                m === "clair"
                  ? "entete.themeClair"
                  : m === "sombre"
                    ? "entete.themeSombre"
                    : "entete.themeAuto",
              )}
            </Radio>
          ))}
        </RadioGroup>
      </section>

      <section className="carte" aria-labelledby="profil-securite">
        <h2 id="profil-securite" className="carte-titre">
          {t("profil.securite")}
        </h2>
        <form onSubmit={soumettreMotDePasse} noValidate>
          <div className="zone-alerte" aria-live="polite">
            {message ? (
              <div
                className={`alert ${message.type === "succes" ? "alert-success" : "alert-danger"}`}
                role={message.type === "succes" ? "status" : "alert"}
              >
                {message.texte}
              </div>
            ) : null}
          </div>

          <ChampMotDePasse
            libelle={tAuth("impose.actuel")}
            value={actuel}
            onChange={setActuel}
            isDisabled={enCours}
            autoComplete="current-password"
          />
          <ChampMotDePasse
            libelle={tAuth("reinitialisation.nouveau")}
            value={nouveau}
            onChange={setNouveau}
            isDisabled={enCours}
            autoComplete="new-password"
          />
          <PolitiqueMotDePasse valeur={nouveau} />
          <ChampMotDePasse
            libelle={tAuth("inscription.confirmation")}
            value={confirmation}
            onChange={setConfirmation}
            isDisabled={enCours}
            autoComplete="new-password"
          />
          <Button type="submit" className="btn btn-primary" isDisabled={enCours}>
            {t("profil.changerMotDePasse")}
          </Button>
        </form>
      </section>

      <section className="carte" aria-labelledby="profil-avatar">
        <h2 id="profil-avatar" className="carte-titre">
          {t("profil.avatar")}
        </h2>
        {/* RG-AUTH-09 — fichier téléversé, visuel prédéfini, ou rien.
            Le téléversement relève de L-19 (documents) : la vue déclare
            l'emplacement, elle n'invente pas le mécanisme. */}
        <Champ libelle={t("profil.avatar")} isReadOnly value="" />
      </section>
    </div>
  );
}
