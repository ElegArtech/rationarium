import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "react-aria-components";
import { ChampMotDePasse, politiqueTenue } from "../composants/champs.js";
import { changerMotDePasse } from "../api/session.js";
import { messageErreur } from "../api/erreurs.js";
import { GabaritAcces } from "./gabarit-acces.js";

/**
 * Vue 05 — Changement de mot de passe imposé.
 *
 * **Attention (brief)** : l'utilisateur doit comprendre **pourquoi** il est
 * bloqué là. Deux chemins y mènent — un compte créé avec un mot de passe
 * provisoire, une réinitialisation décidée par un administrateur — et ils
 * n'appellent pas la même explication. D'où le motif en tête, dans une alerte
 * neutre : c'est l'information principale de la page, pas un chapô.
 *
 * La seule issue latérale est la **sortie de session**, dans la barre de
 * service : la maquette la porte, et elle seule. Aucun lien vers l'application
 * — l'utilisateur y serait renvoyé ici.
 *
 * États couverts : nominal · ancien mot de passe faux · politique en cours de
 * frappe · nouveau identique à l'actuel · mots de passe différents ·
 * enregistrement · succès. Motifs : première connexion · réinitialisation
 * administrateur.
 */

const ID_MOT_DE_PASSE = "impose-mot-de-passe";

export type MotifBlocage = "premiere" | "admin";

type Erreurs = {
  actuel?: string | undefined;
  nouveau?: string | undefined;
  confirmation?: string | undefined;
};

export function MotDePasseImpose({
  surSucces,
  surDeconnexion,
  utilisateur,
  motif = "premiere",
  dateReinitialisation = "",
}: {
  surSucces: () => void;
  surDeconnexion: () => void;
  /** Qui est connecté. La maquette le rappelle : on change *ce* mot de passe. */
  utilisateur?: { prenom: string; nom: string; login: string } | undefined;
  /**
   * Le motif du blocage.
   *
   * `design/etats.json` en déclare deux ; **le serveur n'expose rien qui
   * permette de les distinguer** — `/auth/me` ne rend qu'un booléen
   * `motDePasseAChanger`. Voir le compte rendu.
   */
  motif?: MotifBlocage;
  /** La date de la réinitialisation administrateur, déjà formatée. */
  dateReinitialisation?: string;
}) {
  const { t } = useTranslation("auth");
  const { t: tAcces } = useTranslation("acces");
  const [actuel, setActuel] = useState("");
  const [nouveau, setNouveau] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [erreurs, setErreurs] = useState<Erreurs>({});
  const [enCours, setEnCours] = useState(false);
  const [change, setChange] = useState(false);

  useEffect(() => {
    if (!change) return;
    const minuteur = setTimeout(surSucces, 1_100);
    return () => clearTimeout(minuteur);
  }, [change, surSucces]);

  async function soumettre(e: FormEvent) {
    e.preventDefault();
    setErreurs({});

    if (!actuel) {
      setErreurs({ actuel: t("erreurs.ancienRequis") });
      return;
    }
    if (!politiqueTenue(nouveau)) {
      document.getElementById(ID_MOT_DE_PASSE)?.focus();
      return;
    }
    if (nouveau === actuel) {
      setErreurs({ nouveau: t("erreurs.nouveauIdentique") });
      return;
    }
    if (!confirmation) {
      setErreurs({ confirmation: t("erreurs.confirmationRequise") });
      return;
    }
    if (nouveau !== confirmation) {
      setErreurs({ confirmation: t("erreurs.motsDePasseDifferents") });
      return;
    }

    setEnCours(true);
    try {
      await changerMotDePasse(actuel, nouveau, confirmation);
      setChange(true);
    } catch (e) {
      // Le seul échec que le serveur puisse rendre ici porte sur l'ancien mot
      // de passe : les autres ont été écartés avant l'envoi.
      setErreurs({ actuel: messageErreur(e, t, t("erreurs.ancienMotDePasseIncorrect")) });
      setEnCours(false);
    }
  }

  const gabarit = {
    chapeau: tAcces("impose.chapeau"),
    titre: t("impose.titre"),
    avecAide: false,
    actions: (
      <Button className="chip-btn" onPress={surDeconnexion}>
        {t("impose.seDeconnecter")}
      </Button>
    ),
  };

  if (change) {
    return (
      <GabaritAcces {...gabarit}>
        <div className="alert alert-success" role="status">
          <span className="alert-icon" aria-hidden="true">
            ✓
          </span>
          <span>{t("impose.succes")}</span>
        </div>
        <p className="redirect">
          <span className="spinner spinner-ink" aria-hidden="true" />
          <span>{t("impose.redirection")}</span>
        </p>
      </GabaritAcces>
    );
  }

  return (
    <GabaritAcces {...gabarit}>
      {/* Le motif du blocage : information principale de la page. */}
      <div className="alert alert-neutral">
        <span className="alert-icon" aria-hidden="true">
          →
        </span>
        <span>
          {motif === "admin"
            ? t("impose.motif.admin", { date: dateReinitialisation })
            : t("impose.motif.premiere")}
        </span>
      </div>

      <form onSubmit={soumettre} noValidate autoComplete="on">
        <p className="sent-addr">
          <span className="eyebrow">{t("impose.compteConnecte")}</span>
          <span className="sent-mail">
            {utilisateur ? `${utilisateur.prenom} ${utilisateur.nom} · ${utilisateur.login}` : ""}
          </span>
        </p>

        <ChampMotDePasse
          libelle={t("impose.actuel")}
          value={actuel}
          onChange={(v) => {
            setActuel(v);
            setErreurs((e) => ({ ...e, actuel: undefined }));
          }}
          isDisabled={enCours}
          autoComplete="current-password"
          aide={t("impose.actuelAide")}
          erreur={erreurs.actuel}
          reserve
        />

        <ChampMotDePasse
          libelle={t("reinitialisation.nouveau")}
          idChamp={ID_MOT_DE_PASSE}
          value={nouveau}
          onChange={(v) => {
            setNouveau(v);
            setErreurs((e) => ({ ...e, nouveau: undefined, confirmation: undefined }));
          }}
          isDisabled={enCours}
          autoComplete="new-password"
          politique
          erreur={erreurs.nouveau}
          reserve
        />

        <ChampMotDePasse
          libelle={t("reinitialisation.confirmation")}
          value={confirmation}
          onChange={(v) => {
            setConfirmation(v);
            setErreurs((e) => ({ ...e, confirmation: undefined }));
          }}
          isDisabled={enCours}
          autoComplete="new-password"
          erreur={erreurs.confirmation}
          reserve
        />

        <div className="submit-row">
          <Button type="submit" className="btn btn-primary btn-block" isDisabled={enCours}>
            {enCours ? <span className="spinner" aria-hidden="true" /> : null}
            <span>{enCours ? t("impose.enCours") : t("impose.changer")}</span>
          </Button>
        </div>

        <p className="field-hint" style={{ textAlign: "center", marginTop: 14 }}>
          {t("impose.obligatoire")}
        </p>
      </form>
    </GabaritAcces>
  );
}
