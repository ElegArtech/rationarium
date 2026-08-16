import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FenetreImport } from "../../composants/Import.js";
import * as apiImports from "../../api/imports.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Menu, MenuItem, MenuTrigger, Popover } from "react-aria-components";
import * as api from "../../api/administration.js";
import { messageErreur } from "../../api/erreurs.js";
import { usePeut, useSession } from "../../session/session.js";
import { Chargement, ErreurDeChargement } from "../../composants/etats.js";
import { Fenetre } from "../../composants/fenetre.js";
import { useMessages } from "../../composants/messages.js";
import { AvatarAgent } from "../../composants/pastilles.js";
import "../../composants/partages.css";
import "../taches/liste.css";
import "./utilisateurs.css";

/**
 * Vue 27 — Utilisateurs.
 *
 * **Deux suppressions coexistent, et elles doivent être impossibles à
 * confondre** — c'est le point d'attention du brief. La désactivation est
 * réversible, tient en un clic et se lit « Désactiver » ; la suppression
 * définitive est irréversible, passe par une **séquence en trois temps** et
 * s'écrit en rouge. Libellés, couleurs et parcours distincts.
 *
 * **On ne se désactive ni ne se supprime soi-même** (`RG-USR-04`). Les actions
 * ne sont pas masquées mais **désactivées avec leur raison** : masquer laisserait
 * croire à un défaut d'affichage, désactiver sans dire pourquoi laisserait
 * chercher.
 */
export function Utilisateurs() {
  const { t } = useTranslation("administration");
  const { t: tImports } = useTranslation("imports");
  const peut = usePeut();
  const [recherche, setRecherche] = useState("");
  const [actif, setActif] = useState<"" | "true" | "false">("");
  const [creationOuverte, setCreationOuverte] = useState(false);
  const [importOuvert, setImportOuvert] = useState(false);
  const client = useQueryClient();

  const filtres = {
    recherche,
    ...(actif === "" ? {} : { actif: actif === "true" }),
  };
  const requete = useQuery({
    queryKey: ["utilisateurs", filtres],
    queryFn: () => api.utilisateurs(filtres),
  });

  const liste = requete.data?.utilisateurs ?? [];

  return (
    <div className="page">
      <div className="pl-toolbar">
        <div>
          <span className="eyebrow">{t("utilisateurs.surtitre")}</span>
          <h1 className="h1 titre-vue">{t("utilisateurs.titre")}</h1>
        </div>
        <span className="count-split">
          <b>{liste.length}</b> {t("utilisateurs.compte", { n: liste.length })}
        </span>
        <div className="pl-toolbar-fin">
          {/* `RG-IMP-03` — l'import ouvre une fenêtre à trois temps : choisir,
              prévisualiser, exécuter. Jamais un import direct. */}
          {peut("users:import") ? (
            <Button className="chip-btn" onPress={() => setImportOuvert(true)}>
              {tImports("ouvrirImport")}
            </Button>
          ) : null}
          {peut("users:create") ? (
            <Button className="btn btn-primary" onPress={() => setCreationOuverte(true)}>
              {t("utilisateurs.creer")}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="filters">
        <input
          className="f-input filtre-recherche"
          type="search"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder={t("utilisateurs.rechercher")}
          aria-label={t("utilisateurs.rechercher")}
        />
        <select
          className="f-input"
          value={actif}
          onChange={(e) => setActif(e.target.value as typeof actif)}
          aria-label={t("utilisateurs.statut")}
        >
          <option value="">{t("utilisateurs.tousStatuts")}</option>
          <option value="true">{t("utilisateurs.actifs")}</option>
          <option value="false">{t("utilisateurs.inactifs")}</option>
        </select>
      </div>

      {requete.isPending ? <Chargement quoi={t("utilisateurs.lesComptes")} /> : null}
      {requete.isError ? (
        <ErreurDeChargement erreur={requete.error} surReessai={() => void requete.refetch()} />
      ) : null}

      {requete.data ? (
        liste.length === 0 ? (
          <div className="empty empty-large">
            <p>{t("utilisateurs.videTitre")}</p>
            <small>{t("utilisateurs.videExplication")}</small>
          </div>
        ) : (
          <div className="tlist">
            <div className="us-grid us-head" aria-hidden="true">
              <span>{t("utilisateurs.colUtilisateur")}</span>
              <span>{t("utilisateurs.colEmail")}</span>
              <span>{t("utilisateurs.colRole")}</span>
              <span>{t("utilisateurs.colOrganisation")}</span>
              <span>{t("utilisateurs.colStatut")}</span>
              <span>{t("utilisateurs.colActions")}</span>
            </div>
            {liste.map((u) => (
              <LigneUtilisateur key={u.id} utilisateur={u} />
            ))}
          </div>
        )
      ) : null}

      <FenetreCreation ouverte={creationOuverte} surFermeture={() => setCreationOuverte(false)} />

      {importOuvert ? (
        <FenetreImport
          type="utilisateurs"
          titre={tImports("titreUtilisateurs")}
          colonnes={[
            "email", "login", "password", "firstName", "lastName",
            "role", "departmentName", "serviceNames",
          ]}
          surExecuter={async (contenu) => {
            const rendu = await apiImports.importerUtilisateurs(contenu);
            await client.invalidateQueries({ queryKey: ["utilisateurs"] });
            return rendu;
          }}
          surFermer={() => setImportOuvert(false)}
        />
      ) : null}
    </div>
  );
}

function LigneUtilisateur({ utilisateur }: { utilisateur: api.Utilisateur }) {
  const { t } = useTranslation("administration");
  const { t: tErreurs } = useTranslation("erreurs");
  const peut = usePeut();
  const { session } = useSession();
  const annoncer = useMessages();
  const client = useQueryClient();
  const [suppressionOuverte, setSuppressionOuverte] = useState(false);

  /** `RG-USR-04` — soi-même est le cas qu'on n'a pas le droit de traiter. */
  const soiMeme = utilisateur.id === session.id;
  const nomComplet = `${utilisateur.prenom} ${utilisateur.nom}`;

  const cycle = useMutation({
    mutationFn: (geste: "desactiver" | "reactiver") =>
      geste === "desactiver"
        ? api.desactiverUtilisateur(utilisateur.id)
        : api.reactiverUtilisateur(utilisateur.id),
    onSuccess: (_, geste) => {
      annoncer("ok", t(`utilisateurs.${geste}Fait`, { nom: nomComplet }));
      void client.invalidateQueries({ queryKey: ["utilisateurs"] });
    },
    onError: (e) => annoncer("err", messageErreur(e, tErreurs, t("utilisateurs.echecAction"))),
  });

  return (
    <div
      className={`us-grid us-row${utilisateur.actif ? "" : " is-off"}${soiMeme ? " is-me" : ""}`}
    >
      <span className="us-who">
        <AvatarAgent prenom={utilisateur.prenom} nom={utilisateur.nom} />
        <span className="bloc-etroit">
          <span className="us-n">
            {nomComplet}
            {soiMeme ? <span className="us-me">{t("utilisateurs.moi")}</span> : null}
          </span>
        </span>
      </span>

      <span className="bloc-etroit">
        <span className="us-mail">{utilisateur.email}</span>
        <span className="us-login">{utilisateur.login}</span>
      </span>

      <span className="us-org">{utilisateur.role?.nom ?? t("utilisateurs.sansRole")}</span>

      <span className="bloc-etroit">
        <span className="us-org">
          {utilisateur.departement?.nom ?? t("utilisateurs.sansDepartement")}
        </span>
        {utilisateur.services.length > 0 ? (
          <span className="us-svc">
            {utilisateur.services.map((s) => s.service.nom).join(" · ")}
          </span>
        ) : null}
      </span>

      <span
        className="pill"
        style={{ color: utilisateur.actif ? "var(--st-done)" : "var(--muted)" }}
      >
        {utilisateur.actif ? t("utilisateurs.actif") : t("utilisateurs.inactif")}
      </span>

      <span className="lv-acts">
        <MenuTrigger>
          <Button className="chip-btn" aria-label={t("utilisateurs.actionsPour", { nom: nomComplet })}>
            {t("utilisateurs.actions")}
          </Button>
          <Popover>
            <Menu className="pop-list">
              {peut("users:read_individual_tracking") ? (
                <MenuItem href={`/utilisateurs/${utilisateur.id}/suivi`} className="pop-action">
                  {t("utilisateurs.voirSuivi")}
                </MenuItem>
              ) : null}

              {peut("users:deactivate") ? (
                <MenuItem
                  className="pop-action"
                  isDisabled={soiMeme}
                  onAction={() => cycle.mutate(utilisateur.actif ? "desactiver" : "reactiver")}
                >
                  {utilisateur.actif ? t("utilisateurs.desactiver") : t("utilisateurs.reactiver")}
                  {/* La raison accompagne l'interdit : désactiver sans dire
                      pourquoi laisserait chercher. */}
                  {soiMeme ? (
                    <span className="pop-why">{t("utilisateurs.pasSoiMemeDesactiver")}</span>
                  ) : null}
                </MenuItem>
              ) : null}

              {peut("users:delete_permanently") ? (
                <MenuItem
                  className="pop-action is-danger menu-sep"
                  isDisabled={soiMeme}
                  onAction={() => setSuppressionOuverte(true)}
                >
                  {t("utilisateurs.supprimerDefinitivement")}
                  {soiMeme ? (
                    <span className="pop-why">{t("utilisateurs.pasSoiMemeSupprimer")}</span>
                  ) : null}
                </MenuItem>
              ) : null}
            </Menu>
          </Popover>
        </MenuTrigger>
      </span>

      <FenetreSuppression
        utilisateur={utilisateur}
        ouverte={suppressionOuverte}
        surFermeture={() => setSuppressionOuverte(false)}
      />
    </div>
  );
}

/**
 * La suppression définitive, **en trois temps**.
 *
 * Vérification des dépendances → verdict → action. La séquence est montrée
 * telle quelle : c'est ce qui distingue ce parcours de la désactivation, qui
 * tient en un clic. Un utilisateur qui voit trois étapes sait qu'il ne fait
 * pas la même chose.
 */
function FenetreSuppression({
  utilisateur,
  ouverte,
  surFermeture,
}: {
  utilisateur: api.Utilisateur;
  ouverte: boolean;
  surFermeture: () => void;
}) {
  const { t } = useTranslation("administration");
  const { t: tErreurs } = useTranslation("erreurs");
  const annoncer = useMessages();
  const client = useQueryClient();

  const impact = useQuery({
    queryKey: ["utilisateurs", utilisateur.id, "impact"],
    queryFn: () => api.impactUtilisateur(utilisateur.id),
    enabled: ouverte,
  });

  const suppression = useMutation({
    mutationFn: () => api.supprimerUtilisateur(utilisateur.id),
    onSuccess: () => {
      annoncer("ok", t("utilisateurs.supprimeFait"));
      surFermeture();
      void client.invalidateQueries({ queryKey: ["utilisateurs"] });
    },
    onError: (e) => annoncer("err", messageErreur(e, tErreurs, t("utilisateurs.echecAction"))),
  });

  const bloque = impact.data ? impact.data.blocages.length > 0 : false;
  const etapes = [
    {
      cle: "verification",
      etat: impact.isPending ? "en-cours" : "fait",
      titre: t("utilisateurs.etapeVerification"),
      detail: impact.isPending ? t("utilisateurs.etapeVerificationEnCours") : null,
    },
    {
      cle: "verdict",
      etat: impact.isPending ? "attente" : bloque ? "refus" : "fait",
      titre: bloque ? t("utilisateurs.etapeBloquee") : t("utilisateurs.etapePossible"),
      detail: impact.isPending
        ? null
        : bloque
          ? t("utilisateurs.etapeBloqueeDetail")
          : t("utilisateurs.etapePossibleDetail"),
    },
    {
      cle: "action",
      etat: bloque ? "attente" : impact.isPending ? "attente" : "en-cours",
      titre: t("utilisateurs.etapeAction"),
      detail: null,
    },
  ] as const;

  const marque = (etat: string) =>
    etat === "fait" ? "is-ok" : etat === "refus" ? "is-ko" : etat === "en-cours" ? "is-on" : "";

  return (
    <Fenetre
      ouverte={ouverte}
      surFermeture={surFermeture}
      categorie={t("utilisateurs.actionIrreversible")}
      titre={t("utilisateurs.supprimerDefinitivement")}
      mention={t("utilisateurs.desactiverEstReversible")}
      actions={
        <>
          <Button className="btn btn-secondary" onPress={surFermeture}>
            {t("annuler")}
          </Button>
          {bloque ? null : (
            <Button
              className="btn btn-danger"
              isDisabled={impact.isPending}
              isPending={suppression.isPending}
              onPress={() => suppression.mutate()}
            >
              {t("utilisateurs.supprimerDefinitivement")}
            </Button>
          )}
        </>
      }
    >
      <div className="seq">
        {etapes.map((e, i) => (
          <div className="seq-step" key={e.cle}>
            <span className={`seq-mark ${marque(e.etat)}`} aria-hidden="true">
              {e.etat === "fait" ? "✓" : e.etat === "refus" ? "×" : i + 1}
            </span>
            <span>
              <span className="seq-t">{e.titre}</span>
              {e.detail ? <span className="seq-d">{e.detail}</span> : null}
            </span>
          </div>
        ))}
      </div>

      {impact.data && bloque ? (
        <>
          <div className="alert alert-error alerte-espace" role="alert">
            <span className="alert-icon" aria-hidden="true">
              !
            </span>
            <span>{t("utilisateurs.suppressionRefusee")}</span>
          </div>
          <ul className="imp-list">
            {impact.data.blocages.map((b) => (
              <li key={b.objet}>
                <span className="imp-k">{b.nombre}</span>
                <span>{b.objet}</span>
              </li>
            ))}
          </ul>
          <p className="field-hint">{t("utilisateurs.reassignerDabord")}</p>
        </>
      ) : null}

      {impact.data && !bloque ? (
        <div className="danger-box danger-espace">
          <strong>{t("utilisateurs.irreversible")}</strong>{" "}
          <span>{t("utilisateurs.toutesLesDonnees")}</span>
        </div>
      ) : null}
    </Fenetre>
  );
}

function FenetreCreation({
  ouverte,
  surFermeture,
}: {
  ouverte: boolean;
  surFermeture: () => void;
}) {
  const { t } = useTranslation("administration");
  const { t: tErreurs } = useTranslation("erreurs");
  const annoncer = useMessages();
  const client = useQueryClient();

  const [valeurs, setValeurs] = useState({
    prenom: "",
    nom: "",
    email: "",
    login: "",
    motDePasse: "",
  });
  const [erreur, setErreur] = useState<string | null>(null);

  const creation = useMutation({
    mutationFn: () => api.creerUtilisateur(valeurs),
    onSuccess: () => {
      annoncer("ok", t("utilisateurs.cree"));
      setValeurs({ prenom: "", nom: "", email: "", login: "", motDePasse: "" });
      surFermeture();
      void client.invalidateQueries({ queryKey: ["utilisateurs"] });
    },
    onError: (e) => setErreur(messageErreur(e, tErreurs, t("utilisateurs.echecCreation"))),
  });

  const champ = (cle: keyof typeof valeurs) => ({
    value: valeurs[cle],
    onChange: (e: { target: { value: string } }) =>
      setValeurs((v) => ({ ...v, [cle]: e.target.value })),
  });

  return (
    <Fenetre
      ouverte={ouverte}
      surFermeture={surFermeture}
      categorie={t("utilisateurs.nouveauCompte")}
      titre={t("utilisateurs.creer")}
      large
      mention={t("champsObligatoires")}
      actions={
        <>
          <Button className="btn btn-secondary" onPress={surFermeture}>
            {t("annuler")}
          </Button>
          <Button
            className="btn btn-primary"
            isPending={creation.isPending}
            onPress={() => creation.mutate()}
          >
            {t("utilisateurs.creerLeCompte")}
          </Button>
        </>
      }
    >
      {erreur ? (
        <div className="alert alert-error" role="alert">
          <span className="alert-icon" aria-hidden="true">
            !
          </span>
          <span>{erreur}</span>
        </div>
      ) : null}

      <div className="form-grid form-grid-espace">
        <div className="field-block">
          <label className="field-label" htmlFor="us-prenom">
            {t("utilisateurs.prenom")} <span className="req">*</span>
          </label>
          <input className="field" id="us-prenom" type="text" {...champ("prenom")} />
        </div>
        <div className="field-block">
          <label className="field-label" htmlFor="us-nom">
            {t("utilisateurs.nom")} <span className="req">*</span>
          </label>
          <input className="field" id="us-nom" type="text" {...champ("nom")} />
        </div>
        <div className="field-block">
          <label className="field-label" htmlFor="us-email">
            {t("utilisateurs.email")} <span className="req">*</span>
          </label>
          <input className="field" id="us-email" type="email" {...champ("email")} />
        </div>
        <div className="field-block">
          <label className="field-label" htmlFor="us-login">
            {t("utilisateurs.login")} <span className="req">*</span>
          </label>
          <input className="field" id="us-login" type="text" {...champ("login")} />
          {/* `RG-AUTH-08` — l'identifiant n'est jamais modifiable après
              création. Le dire à la création évite de le découvrir ensuite. */}
          <p className="field-hint">{t("utilisateurs.loginDefinitif")}</p>
        </div>
        <div className="field-block span2">
          <label className="field-label" htmlFor="us-mdp">
            {t("utilisateurs.motDePasse")} <span className="req">*</span>
          </label>
          <input className="field" id="us-mdp" type="password" {...champ("motDePasse")} />
        </div>
      </div>
    </Fenetre>
  );
}
