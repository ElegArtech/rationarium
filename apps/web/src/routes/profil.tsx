import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { changerLangue, LANGUES } from "../i18n/index.js";
import { definirTheme, themeCourant, THEMES, type Theme } from "../theme/index.js";
import i18next from "i18next";
import { Button } from "react-aria-components";
import { ChampMotDePasse, PolitiqueMotDePasse } from "../composants/champs.js";
import { AvatarAgent } from "../composants/pastilles.js";
import { changerMotDePasse, deconnexion, modifierProfil } from "../api/session.js";
import { CLE_SESSION } from "../session/session.js";
import { messageErreur } from "../api/erreurs.js";
import { formaterDateLongue } from "../formats.js";
import "../composants/partages.css";
import "./profil.css";

/**
 * Vue 35 — Mon profil. Section 39 de la maquette.
 *
 * **Ce que je peux changer / ce qui relève de l'administration : deux blocs
 * séparés, et chaque champ verrouillé dit pourquoi et par qui.** C'est le point
 * de la vue : un champ grisé sans motif se lit comme un défaut de l'outil, pas
 * comme une règle de l'organisation.
 *
 * `EX-AUTH-09` : identité et préférences. `EX-AUTH-10` : dernière connexion.
 * `EX-AUTH-08` : changement de mot de passe. `RG-AUTH-08` — **l'identifiant de
 * connexion n'est jamais modifiable après création** : il sert de référence
 * dans le journal d'audit, et c'est ce que dit son explication.
 */

type Onglet = "info" | "sec";

export function Profil({
  utilisateur,
}: {
  utilisateur: {
    prenom: string;
    nom: string;
    email: string;
    login: string;
    role: string;
    roleCode: string;
    derniereConnexion: string | null;
    departement: string | null;
    services: string[];
    membreDepuis: string;
    version: number;
  };
}) {
  const { t } = useTranslation("coquille");
  const { t: tAuth } = useTranslation("auth");
  const [onglet, setOnglet] = useState<Onglet>("info");

  return (
    <div className="page">
      <div className="proj-head profil-head">
        <AvatarAgent prenom={utilisateur.prenom} nom={utilisateur.nom} classe="agent-av avatar-xl" />
        <div className="bloc-etroit">
          <span className="eyebrow">{t("profil.monCompte")}</span>
          <h1 className="proj-name nom-profil">
            {utilisateur.prenom} {utilisateur.nom}
          </h1>
          <div className="pills">
            <span className="pill" style={{ color: "var(--st-doing)" }}>
              {utilisateur.roleCode || utilisateur.role}
            </span>
            <span className="pill" style={{ color: "var(--st-done)" }}>
              {t("profil.compteActif")}
            </span>
          </div>
        </div>
        <div className="proj-acts">
          <Button
            className="chip-btn"
            onPress={() => {
              void deconnexion().then(() => {
                window.location.href = "/connexion";
              });
            }}
          >
            {t("profil.seDeconnecter")}
          </Button>
        </div>
      </div>

      <nav className="tabbar" aria-label={t("profil.sections")}>
        {(["info", "sec"] as const).map((o) => (
          <button
            key={o}
            type="button"
            className={o === onglet ? "is-active" : ""}
            aria-current={o === onglet ? "true" : undefined}
            onClick={() => setOnglet(o)}
          >
            <span>{t(`profil.onglet_${o}`)}</span>
          </button>
        ))}
      </nav>

      {onglet === "info" ? (
        <Informations utilisateur={utilisateur} />
      ) : (
        <Securite tAuth={tAuth} t={t} />
      )}
    </div>
  );
}

/** Les deux blocs : ce qui m'appartient, ce qui engage l'organisation. */
function Informations({
  utilisateur,
}: {
  utilisateur: {
    prenom: string;
    nom: string;
    email: string;
    login: string;
    role: string;
    roleCode: string;
    derniereConnexion: string | null;
    departement: string | null;
    services: string[];
    membreDepuis: string;
    version: number;
  };
}) {
  const { t } = useTranslation("coquille");
  const { t: tAuth } = useTranslation("auth");
  const { t: tErreurs } = useTranslation("erreurs");
  const client = useQueryClient();

  const [prenom, setPrenom] = useState(utilisateur.prenom);
  const [nom, setNom] = useState(utilisateur.nom);
  const [email, setEmail] = useState(utilisateur.email);
  const [theme, setTheme] = useState<Theme>(themeCourant);
  const [langue, setLangue] = useState(() => i18next.language);
  const [retour, setRetour] = useState<{ type: "succes" | "erreur"; texte: string } | null>(null);

  const modifie =
    prenom !== utilisateur.prenom || nom !== utilisateur.nom || email !== utilisateur.email;

  /**
   * `EX-AUTH-09` — « consulter **et** modifier ».
   *
   * Les deux commandes ont vécu désactivées derrière un commentaire affirmant
   * qu'aucun point d'entrée ne permettait de modifier son profil. `PATCH
   * /auth/me` existait depuis le début ; ce qui manquait était `version` dans
   * la réponse de `/auth/me`, que `modificationProfilSchema` exige au titre de
   * `RG-GEN-07`. Sans elle, aucune requête valide n'était composable — et la
   * conclusion tirée alors fut que la route n'existait pas.
   */
  const enregistrement = useMutation({
    mutationFn: () => modifierProfil({ prenom, nom, email, version: utilisateur.version }),
    onSuccess: async () => {
      setRetour({ type: "succes", texte: t("profil.enregistre") });
      await client.invalidateQueries({ queryKey: CLE_SESSION });
    },
    onError: (e) =>
      setRetour({ type: "erreur", texte: messageErreur(e, tErreurs, t("profil.echecEnregistrement")) }),
  });

  const annuler = () => {
    setPrenom(utilisateur.prenom);
    setNom(utilisateur.nom);
    setEmail(utilisateur.email);
    setRetour(null);
  };

  /*
   * Les champs verrouillés portent CHACUN son motif et son responsable — et
   * chacun nomme **qui** peut le changer, ce qui n'est pas toujours la même
   * personne : le login n'est modifiable par personne, le rôle par un
   * administrateur, le département par les ressources humaines, les services
   * par le manager de service. Un champ grisé sans motif se lit comme un
   * défaut de l'outil ; avec son motif, comme une règle de l'organisation.
   *
   * Les cinq de la maquette y sont. Département, services et date d'entrée ont
   * longtemps manqué **parce que la session ne les exposait pas** — ils sont
   * désormais rendus par `/auth/me` (`EX-AUTH-09`).
   */
  const verrouilles: { cle: string; valeur: string; mono: boolean; pourquoi: string; par: string }[] =
    [
      {
        cle: t("profil.champLogin"),
        valeur: utilisateur.login,
        mono: true,
        pourquoi: t("profil.pourquoiLogin"),
        par: t("profil.nonModifiable"),
      },
      {
        cle: t("profil.champRole"),
        valeur: utilisateur.roleCode || utilisateur.role,
        mono: true,
        pourquoi: t("profil.pourquoiRole"),
        par: t("profil.parAdministrateur"),
      },
      {
        cle: t("profil.champDepartement"),
        // Un agent peut n'être rattaché à aucun département (`RG-ORG-03`) :
        // le dire vaut mieux qu'une ligne vide.
        valeur: utilisateur.departement ?? t("profil.aucunDepartement"),
        mono: false,
        pourquoi: t("profil.pourquoiDepartement"),
        par: t("profil.parRessourcesHumaines"),
      },
      {
        cle: t("profil.champServices"),
        valeur:
          utilisateur.services.length > 0
            ? utilisateur.services.join(", ")
            : t("profil.aucunService"),
        mono: false,
        pourquoi: t("profil.pourquoiServices"),
        par: t("profil.parManagerService"),
      },
      {
        cle: t("profil.membreDepuis"),
        valeur: formaterDateLongue(utilisateur.membreDepuis),
        mono: true,
        pourquoi: t("profil.pourquoiMembreDepuis"),
        par: t("profil.nonModifiable"),
      },
      {
        cle: t("profil.derniereConnexion"),
        valeur: utilisateur.derniereConnexion
          ? formaterDateLongue(utilisateur.derniereConnexion)
          : t("profil.jamaisConnecte"),
        mono: true,
        pourquoi: t("profil.pourquoiDerniereConnexion"),
        par: t("profil.nonModifiable"),
      },
    ];

  return (
    <div className="two-col">
      <section className="panel">
        <div className="own-head">
          <span className="blk-ic blk-ic-propre" aria-hidden="true">
            ✎
          </span>
          <div>
            <span className="blk-t">{t("profil.modifiableParVous")}</span>
            <span className="blk-d">{t("profil.modifiableParVousAide")}</span>
          </div>
        </div>
        <div className="panel-body">
          <div className="form-grid">
            <div className="field-block">
              <label className="field-label" htmlFor="profil-prenom">
                {tAuth("inscription.prenom")}
              </label>
              <input
                className="field"
                id="profil-prenom"
                type="text"
                value={prenom}
                onChange={(e) => setPrenom(e.target.value)}
              />
            </div>
            <div className="field-block">
              <label className="field-label" htmlFor="profil-nom">
                {tAuth("inscription.nom")}
              </label>
              <input
                className="field"
                id="profil-nom"
                type="text"
                value={nom}
                onChange={(e) => setNom(e.target.value)}
              />
            </div>
            <div className="field-block span2">
              <label className="field-label" htmlFor="profil-email">
                {tAuth("inscription.email")}
              </label>
              <input
                className="field"
                id="profil-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <p className="field-hint">{t("profil.emailAide")}</p>
            </div>
          </div>
          <div aria-live="polite">
            {retour ? (
              <div
                className={`alert ${retour.type === "succes" ? "alert-success" : "alert-error"}`}
                role={retour.type === "succes" ? "status" : "alert"}
              >
                <span className="alert-icon" aria-hidden="true">
                  !
                </span>
                <span>{retour.texte}</span>
              </div>
            ) : null}
          </div>
          {/* Désactivées tant que rien n'a changé : proposer d'enregistrer
              l'identique ferait douter que l'action ait eu lieu. */}
          <div className="ligne-actions actions-profil">
            <Button
              className="btn btn-primary"
              isDisabled={!modifie || enregistrement.isPending}
              onPress={() => enregistrement.mutate()}
            >
              {t("profil.enregistrer")}
            </Button>
            <Button
              className="btn btn-secondary"
              isDisabled={!modifie || enregistrement.isPending}
              onPress={annuler}
            >
              {t("profil.annuler")}
            </Button>
          </div>
        </div>
      </section>

      {/*
        Les préférences d'affichage — maquette 35, section « Préférences ».
        Langue et thème en groupes segmentés, formats en listes.

        **Le thème y porte TROIS états** là où la maquette n'en dessine que
        deux : `cadrage/01 § 7` exige « clair, sombre et automatique », et le
        troisième n'a de place nulle part ailleurs — une bascule ne sait pas
        dire trois états, un choix de préférence si. C'est l'écart assumé entre
        ce que le produit doit faire et ce que la maquette montre.
      */}
      <section className="panel">
        <div className="panel-head">
          <span className="panel-title">{t("profil.preferences")}</span>
        </div>
        <div className="panel-body">
          <div className="field-block">
            <label className="field-label">{t("profil.langue")}</label>
            <div className="seg" role="group" aria-label={t("profil.langue")}>
              {LANGUES.map((l) => (
                <Button
                  key={l}
                  aria-pressed={langue.startsWith(l)}
                  onPress={() => {
                    void changerLangue(l);
                    setLangue(l);
                  }}
                >
                  {l === "fr" ? "Français" : "English"}
                </Button>
              ))}
            </div>
          </div>

          <div className="field-block" style={{ margin: 0 }}>
            <label className="field-label">{t("profil.theme")}</label>
            <div className="seg" role="group" aria-label={t("profil.theme")}>
              {THEMES.map((mode) => (
                <Button
                  key={mode}
                  aria-pressed={theme === mode}
                  onPress={() => {
                    definirTheme(mode);
                    setTheme(mode);
                  }}
                >
                  {t(
                    mode === "clair"
                      ? "profil.themeClair"
                      : mode === "sombre"
                        ? "profil.themeSombre"
                        : "profil.themeAuto",
                  )}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="adm-head">
          <span className="blk-ic blk-ic-admin" aria-hidden="true">
            ⌸
          </span>
          <div>
            <span className="blk-t">{t("profil.gereParAdministration")}</span>
            <span className="blk-d">{t("profil.gereParAdministrationAide")}</span>
          </div>
        </div>

        {verrouilles.map((f) => (
          <div className="lock-field" key={f.cle}>
            <div className="bloc-etroit">
              <span className="lock-k">{f.cle}</span>
              <span className={f.mono ? "lock-v lock-v-mono" : "lock-v"}>{f.valeur}</span>
              <span className="lock-why">{f.pourquoi}</span>
            </div>
            <span className="lock-tag">
              <span aria-hidden="true">⌸</span>
              <span>{f.par}</span>
            </span>
          </div>
        ))}

        {/*
          **Le bouton « Demander une modification » a été RETIRÉ le
          2026-08-31.**

          La maquette 35 le pose et le résout par un `askChange()` qui annonce
          une demande transmise au manager et à l'administrateur. Rien de tel
          n'existe : aucune exigence du cadrage n'ouvre ce geste, aucune route
          ne le porte, et il n'y a personne à qui transmettre.

          Il a vécu ici désactivé — et c'était le SEUL inerte du produit sans
          explication au survol, donc un écart franc à `RG-GEN-06` : une action
          interdite se masque, ou se désactive AVEC son motif. Entre inventer
          une fonctionnalité et retirer une commande que rien ne sert, on
          retire. Les champs verrouillés portent déjà, chacun, la raison de
          leur verrou et le service qui les tient — c'est ce qui répond
          réellement à la question « comment fait-on corriger ça ? ».

          Décision portée dans `cadrage/02` § vue 35 pour qu'elle ne revienne
          pas par la maquette.
        */}
      </section>
    </div>
  );
}

/** `EX-AUTH-08` — le changement de mot de passe, et la politique en direct. */
function Securite({
  t,
  tAuth,
}: {
  t: (cle: string) => string;
  tAuth: (cle: string) => string;
}) {
  const { t: tErreurs } = useTranslation("erreurs");
  const [actuel, setActuel] = useState("");
  const [nouveau, setNouveau] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState<{ type: "succes" | "erreur"; texte: string } | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function soumettre(e: FormEvent) {
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
    } catch (err) {
      setMessage({
        type: "erreur",
        texte: messageErreur(err, tErreurs, tAuth("erreurs.ancienMotDePasseIncorrect")),
      });
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="two-col">
      <section className="panel">
        <div className="panel-head">
          <span className="panel-title">{t("profil.changerMotDePasse")}</span>
        </div>
        <div className="panel-body">
          <form onSubmit={soumettre} noValidate>
            <div aria-live="polite">
              {message ? (
                <div
                  className={`alert ${message.type === "succes" ? "alert-success" : "alert-error"}`}
                  role={message.type === "succes" ? "status" : "alert"}
                >
                  <span className="alert-icon" aria-hidden="true">
                    !
                  </span>
                  <span>{message.texte}</span>
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
            <p className="field-hint hint-securite">{t("profil.autresSessions")}</p>
          </form>
        </div>
      </section>
    </div>
  );
}
