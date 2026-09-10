import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { changerLangue, LANGUES } from "../i18n/index.js";
import { definirTheme, themeCourant, THEMES, type Theme } from "../theme/index.js";
import i18next from "i18next";
import { Button, Radio, RadioGroup } from "react-aria-components";
import {
  VISUELS_AVATAR_PREDEFINIS,
  estVisuelAvatarPredefini,
  type VisuelAvatarPredefini,
} from "@rationarium/contracts";
import { ChampMotDePasse, PolitiqueMotDePasse, politiqueTenue } from "../composants/champs.js";
import { AvatarUtilisateur } from "../composants/pastilles.js";
import {
  adresseAvatar,
  changerMotDePasse,
  deconnexion,
  modifierProfil,
  supprimerAvatar,
  televerserAvatar,
} from "../api/session.js";
import { CLE_SESSION } from "../session/session.js";
import { useMessages } from "../composants/messages.js";
import { messageErreur } from "../api/erreurs.js";
import { formaterDate } from "../formats.js";
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

type Onglet = "info" | "sec" | "pref";

/* Les appels restent littéraux pour que le contrôle i18n puisse prouver les
   six clés. Le catalogue partagé fournit les identifiants persistés ; cette
   fonction ne définit que leur libellé d'interface. */
function libelleVisuelAvatar(
  t: ReturnType<typeof useTranslation>["t"],
  visuel: VisuelAvatarPredefini,
): string {
  switch (visuel) {
    case "constellation": return t("profil.visuelsAvatar.constellation");
    case "feuille": return t("profil.visuelsAvatar.feuille");
    case "montagne": return t("profil.visuelsAvatar.montagne");
    case "vagues": return t("profil.visuelsAvatar.vagues");
    case "soleil": return t("profil.visuelsAvatar.soleil");
    case "mosaique": return t("profil.visuelsAvatar.mosaique");
  }
}

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
    avatarUrl: string | null;
    avatarPredefini: VisuelAvatarPredefini | null;
    version: number;
  };
}) {
  const { t } = useTranslation("coquille");
  const { t: tAuth } = useTranslation("auth");
  const [onglet, setOnglet] = useState<Onglet>("info");
  const navigate = useNavigate();
  const client = useQueryClient();

  return (
    <div className="page">
      <div className="proj-head profil-head">
        <AvatarUtilisateur
          prenom={utilisateur.prenom}
          nom={utilisateur.nom}
          url={utilisateur.avatarUrl ? adresseAvatar(utilisateur.version) : null}
          predefini={utilisateur.avatarPredefini}
          classe="agent-av avatar-xl"
        />
        <div className="bloc-etroit">
          <span className="eyebrow">{t("profil.monCompte")}</span>
          <h1 className="proj-name nom-profil">
            {utilisateur.prenom} {utilisateur.nom}
          </h1>
          <div className="pills">
            {/*
              **Le NOM du rôle, le code au survol.** Le bandeau rendait
              `roleCode || role`, donc `CHEF_DE_PROJET` — l'identifiant que
              l'audit et les imports manipulent, pas ce qui se lit sur son
              propre profil. Le code passe au `title` : il reste joignable
              pour qui doit le citer, et il ne se lit plus à la place du nom.
              Même geste que la vue 27 (`administration/Utilisateurs.tsx`) et
              que le suivi individuel. `role` peut être vide — un compte sans
              rôle existe (`RG-USR-…`) — et le code sert alors de repli plutôt
              qu'une pastille muette.
            */}
            <span
              className="pill"
              style={{ color: "var(--st-doing)" }}
              title={utilisateur.roleCode || undefined}
            >
              {utilisateur.role || utilisateur.roleCode}
            </span>
            <span className="pill" style={{ color: "var(--st-done)" }}>
              {t("profil.compteActif")}
            </span>
          </div>
        </div>
        <div className="proj-acts">
          <Button
            className="chip-btn"
            /*
             * La sortie de session passe par le routeur, comme celle de la
             * coquille : `window.location.href` relançait l'application
             * entière pour aller à la vue voisine. Le cache est vidé
             * explicitement — c'est ce que le rechargement faisait par
             * accident, et ce qu'il ne faut surtout pas perdre en route.
             */
            onPress={() => {
              void deconnexion().then(async () => {
                client.clear();
                await navigate({ to: "/connexion", search: {} });
              });
            }}
          >
            {t("profil.seDeconnecter")}
          </Button>
        </div>
      </div>

      <nav className="tabbar" aria-label={t("profil.sections")}>
        {(["info", "sec", "pref"] as const).map((o) => (
          <Button
            key={o}
            className={o === onglet ? "is-active" : ""}
            {...(o === onglet ? { "aria-current": "true" as const } : {})}
            onPress={() => setOnglet(o)}
          >
            <span>{t(`profil.onglet_${o}`)}</span>
          </Button>
        ))}
      </nav>

      {onglet === "info" ? (
        <Informations utilisateur={utilisateur} />
      ) : (
        onglet === "pref" ? <Preferences version={utilisateur.version} /> : <Securite tAuth={tAuth} t={t} derniereConnexion={utilisateur.derniereConnexion} />
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
    avatarUrl: string | null;
    avatarPredefini: VisuelAvatarPredefini | null;
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
  const [retour, setRetour] = useState<{ type: "succes" | "erreur"; texte: string } | null>(null);
  const [retourAvatar, setRetourAvatar] = useState<{ type: "succes" | "erreur"; texte: string } | null>(null);
  const saisieAvatar = useRef<HTMLInputElement>(null);

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

  const avatar = useMutation({
    mutationFn: async (fichier: File) => {
      const types = ["image/jpeg", "image/png", "image/webp"] as const;
      if (!types.includes(fichier.type as (typeof types)[number])) {
        throw new Error("avatar-format");
      }
      const octets = new Uint8Array(await fichier.arrayBuffer());
      let binaire = "";
      for (const octet of octets) binaire += String.fromCharCode(octet);
      return televerserAvatar({
        contenuBase64: btoa(binaire),
        typeMime: fichier.type as (typeof types)[number],
        version: utilisateur.version,
      });
    },
    onSuccess: (session) => {
      client.setQueryData(CLE_SESSION, session);
      setRetourAvatar({ type: "succes", texte: t("profil.avatarEnregistre") });
      if (saisieAvatar.current) saisieAvatar.current.value = "";
    },
    onError: (e) => {
      const texte = e instanceof Error && e.message === "avatar-format"
        ? tAuth("erreurs.avatarFormatInvalide")
        : messageErreur(e, tAuth, t("profil.avatarEchec"));
      setRetourAvatar({ type: "erreur", texte });
      if (saisieAvatar.current) saisieAvatar.current.value = "";
    },
  });

  const suppressionAvatar = useMutation({
    mutationFn: () => supprimerAvatar(utilisateur.version),
    onSuccess: (session) => {
      client.setQueryData(CLE_SESSION, session);
      setRetourAvatar({ type: "succes", texte: t("profil.avatarSupprime") });
    },
    onError: (e) =>
      setRetourAvatar({
        type: "erreur",
        texte: messageErreur(e, tAuth, t("profil.avatarEchec")),
      }),
  });

  const avatarPredefini = useMutation({
    mutationFn: (visuel: VisuelAvatarPredefini) => modifierProfil({
      avatarFichier: null,
      avatarPredefini: visuel,
      version: utilisateur.version,
    }),
    onSuccess: (session) => {
      client.setQueryData(CLE_SESSION, session);
      setRetourAvatar({ type: "succes", texte: t("profil.avatarPredefiniEnregistre") });
    },
    onError: (e) => setRetourAvatar({
      type: "erreur",
      texte: messageErreur(e, tAuth, t("profil.avatarEchec")),
    }),
  });

  const choisirAvatar = (e: ChangeEvent<HTMLInputElement>) => {
    const fichier = e.currentTarget.files?.[0];
    if (fichier) avatar.mutate(fichier);
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
        // Le nom se lit, le code s'identifie : la fiche rend le premier, le
        // bandeau porte le second au survol. `mono` était le signe qu'on
        // rendait un identifiant ; ce n'en est plus un.
        valeur: utilisateur.role || utilisateur.roleCode,
        mono: false,
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
        valeur: formaterDate(utilisateur.membreDepuis),
        mono: true,
        pourquoi: t("profil.pourquoiMembreDepuis"),
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
          <div className="field-block">
            <label className="field-label" htmlFor="profil-avatar">
              {t("profil.avatar")}
            </label>
            <div className="avatar-actions">
              <AvatarUtilisateur
                prenom={utilisateur.prenom}
                nom={utilisateur.nom}
                url={utilisateur.avatarUrl ? adresseAvatar(utilisateur.version) : null}
                predefini={utilisateur.avatarPredefini}
                classe="agent-av avatar-xl"
              />
              <input
                ref={saisieAvatar}
                className="sr-only"
                id="profil-avatar"
                type="file"
                accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                disabled={avatar.isPending || suppressionAvatar.isPending}
                onChange={choisirAvatar}
              />
              <Button
                className="btn btn-secondary"
                isDisabled={avatar.isPending || avatarPredefini.isPending || suppressionAvatar.isPending}
                onPress={() => saisieAvatar.current?.click()}
              >
                {t("profil.avatarChoisir")}
              </Button>
              {utilisateur.avatarUrl || utilisateur.avatarPredefini ? (
                <Button
                  className="btn btn-secondary"
                  isDisabled={avatar.isPending || avatarPredefini.isPending || suppressionAvatar.isPending}
                  onPress={() => suppressionAvatar.mutate()}
                >
                  {t("profil.avatarSupprimer")}
                </Button>
              ) : null}
            </div>
            <p className="field-hint">{t("profil.avatarFormats")}</p>
            <RadioGroup
              className="avatar-catalogue"
              aria-label={t("profil.avatarPredefinis")}
              value={utilisateur.avatarPredefini ?? ""}
              isDisabled={avatar.isPending || avatarPredefini.isPending || suppressionAvatar.isPending}
              onChange={(valeur) => {
                if (estVisuelAvatarPredefini(valeur)) avatarPredefini.mutate(valeur);
              }}
            >
              {VISUELS_AVATAR_PREDEFINIS.map((visuel) => (
                <Radio
                  key={visuel.id}
                  value={visuel.id}
                  className={({ isSelected }) => `avatar-option${isSelected ? " is-selected" : ""}`}
                >
                  <AvatarUtilisateur
                    prenom=""
                    nom=""
                    predefini={visuel.id}
                    classe="agent-av avatar-option-visuel"
                  />
                  <span>{libelleVisuelAvatar(t, visuel.id)}</span>
                </Radio>
              ))}
            </RadioGroup>
          </div>
          <div aria-live="polite" className="avatar-retour">
            {retourAvatar ? (
              <div
                className={`alert ${retourAvatar.type === "succes" ? "alert-success" : "alert-error"}`}
                role={retourAvatar.type === "succes" ? "status" : "alert"}
              >
                <span className="alert-icon" aria-hidden="true">!</span>
                <span>{retourAvatar.texte}</span>
              </div>
            ) : null}
          </div>
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
  derniereConnexion,
}: {
  derniereConnexion: string | null;
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
    if (!politiqueTenue(nouveau)) {
      const absents = [
        nouveau.length < 8 ? t("profil.motDePasseCourt") : "",
        !/[A-ZÀ-Þ]/.test(nouveau) ? tAuth("politique.majuscule") : "",
        !/\d/.test(nouveau) ? tAuth("politique.chiffre") : "",
        !/[^\p{L}\p{N}]/u.test(nouveau) ? tAuth("politique.special") : "",
      ].filter(Boolean);
      setMessage({ type: "erreur", texte: absents.join(" · ") });
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
      <section className="panel">
        <div className="panel-head"><span className="panel-title">{t("profil.historiqueConnexion")}</span></div>
        <div className="panel-body"><span className="field-label">{t("profil.derniereConnexion")}</span><p>{derniereConnexion ? formaterDate(derniereConnexion) : t("profil.jamaisConnecte")}</p><p className="field-hint">{t("profil.pourquoiDerniereConnexion")}</p></div>
      </section>
    </div>
  );
}

function Preferences({ version }: { version: number }) {
  const { t } = useTranslation("coquille");
  const { t: tErreurs } = useTranslation("erreurs");
  const client = useQueryClient();
  const annoncer = useMessages();
  const [theme, setTheme] = useState<Theme>(themeCourant);
  const [langue, setLangue] = useState(() => i18next.language.startsWith("en") ? "en" : "fr");
  const [retour, setRetour] = useState<string | null>(null);
  const enregistrement = useMutation({
    mutationFn: () => modifierProfil({ langue, theme, version }),
    onSuccess: async () => { annoncer("ok", t("profil.enregistre")); setRetour(null); await client.invalidateQueries({ queryKey: CLE_SESSION }); },
    onError: (e) => setRetour(messageErreur(e, tErreurs, t("profil.echecEnregistrement"))),
  });
  return <div className="two-col">
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
                  {t(`profil.langue_${l}`)}
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
          {retour ? <p className="alert alert-error" role="alert">{retour}</p> : null}
          <Button className="btn btn-primary" isDisabled={enregistrement.isPending} onPress={() => enregistrement.mutate()}>{t("profil.enregistrerPreferences")}</Button>
        </div>
      </section>

  </div>;
}
