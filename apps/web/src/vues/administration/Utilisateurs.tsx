import { nomRole } from "../../roles.js";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FenetreImport } from "../../composants/Import.js";
import * as apiImports from "../../api/imports.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Menu, MenuItem, MenuTrigger, Popover } from "react-aria-components";
import * as api from "../../api/administration.js";
import { messageErreur } from "../../api/erreurs.js";
import { ErreurApi } from "../../api/client.js";
import { ChampMotDePasse, PolitiqueMotDePasse, politiqueTenue } from "../../composants/champs.js";
import { usePeut, useSession } from "../../session/session.js";
import { Chargement, ErreurDeChargement } from "../../composants/etats.js";
import { Fenetre } from "../../composants/fenetre.js";
import { useMessages } from "../../composants/messages.js";
import { AvatarAgent } from "../../composants/pastilles.js";
import "../../composants/partages.css";
/* Sections cumulatives : `.count-split` (20), `.ms-toggle` (17), `.lv-acts`
   (23), `.pill` / `.agent-av` (transverses). */
import "../taches/liste.css";
import "../projets/jalons.css";
import "../occupations/conges.css";
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
  const [departementId, setDepartementId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [roleId, setRoleId] = useState("");
  const [statut, setStatut] = useState("on");
  const [creationOuverte, setCreationOuverte] = useState(false);
  const [importOuvert, setImportOuvert] = useState(false);
  const client = useQueryClient();

  const reinitialiser = () => {
    setRecherche("");
    setDepartementId("");
    setServiceId("");
    setRoleId("");
    setStatut("on");
  };

  const filtres = {
    recherche,
    departementId,
    serviceId,
    roleId,
    ...(statut === "" ? {} : { actif: statut === "on" }),
  };
  const requete = useQuery({
    queryKey: ["utilisateurs", filtres],
    queryFn: () => api.utilisateurs(filtres),
  });

  /*
   * Les listes de filtres viennent de l'organisation et du catalogue de rôles :
   * une saisie libre ferait chercher un nom exact.
   *
   * `RG-GEN-06` — **les deux requêtes partaient sans condition de permission.**
   * `GET /organisation` exige `directions:read`, `GET /administration/roles`
   * exige `users:manage_roles` : tout porteur de `users:read` seul récoltait
   * deux `403` en console à chaque chargement, et se retrouvait devant trois
   * filtres — Département, Service, Rôle — vides et sans explication. On ne
   * demande pas ce qu'on n'a pas le droit de lire, et un filtre qui ne peut
   * rien proposer n'est pas proposé.
   */
  const orgaLisible = peut("directions:read");
  const rolesLisibles = peut("users:manage_roles");
  const orga = useQuery({
    queryKey: ["organisation"],
    queryFn: () => api.arborescence(),
    enabled: orgaLisible,
  });
  const roles = useQuery({
    queryKey: ["roles"],
    queryFn: () => api.roles(),
    enabled: rolesLisibles,
  });

  const departements = [
    ...(orga.data?.directions.flatMap((d) => d.departements) ?? []),
    ...(orga.data?.departementsSansDirection ?? []),
  ];
  const services = departements.flatMap((d) => d.services);

  const liste = requete.data ?? [];

  return (
    <>
      <div className="pl-toolbar">
        <div>
          <span className="eyebrow">{t("utilisateurs.surtitre")}</span>
          <h1 className="h1 titre-vue">{t("utilisateurs.titre")}</h1>
        </div>
        <span className="count-split">{t("utilisateurs.compte", { n: liste.length })}</span>
        <div className="pl-toolbar-fin">
          {/* `RG-IMP-03` — l'import ouvre une fenêtre à trois temps : choisir,
              prévisualiser, exécuter. Jamais un import direct. */}
          {peut("users:import") ? (
            <Button className="chip-btn" onPress={() => setImportOuvert(true)}>
              {tImports("importerCsv")}
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
          className="f-input"
          type="search"
          style={{ width: "220px" }}
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder={t("utilisateurs.rechercher")}
          aria-label={t("utilisateurs.rechercher")}
        />
        {orgaLisible ? (
          <select
            className="f-input"
            value={departementId}
            onChange={(e) => setDepartementId(e.target.value)}
            aria-label={t("utilisateurs.departement")}
          >
            <option value="">{t("utilisateurs.tousDepartements")}</option>
            {departements.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nom}
              </option>
            ))}
          </select>
        ) : null}
        {orgaLisible ? (
          <select
            className="f-input"
            value={serviceId}
            onChange={(e) => setServiceId(e.target.value)}
            aria-label={t("utilisateurs.service")}
          >
            <option value="">{t("utilisateurs.tousServices")}</option>
            {services.map((sv) => (
              <option key={sv.id} value={sv.id}>
                {sv.nom}
              </option>
            ))}
          </select>
        ) : null}
        {rolesLisibles ? (
          <select
            className="f-input"
            value={roleId}
            onChange={(e) => setRoleId(e.target.value)}
            aria-label={t("utilisateurs.colRole")}
          >
            <option value="">{t("utilisateurs.tousRoles")}</option>
            {(roles.data ?? []).map((r) => (
              <option key={r.id} value={r.id}>
                {nomRole(r)}
              </option>
            ))}
          </select>
        ) : null}
        <select
          className="f-input"
          value={statut}
          onChange={(e) => setStatut(e.target.value)}
          aria-label={t("utilisateurs.statut")}
        >
          <option value="on">{t("utilisateurs.filtreActifs")}</option>
          <option value="off">{t("utilisateurs.filtreDesactives")}</option>
          <option value="">{t("utilisateurs.filtreTous")}</option>
        </select>
        <Button className="chip-btn" onPress={reinitialiser}>
          {t("reinitialiser")}
        </Button>
      </div>

      {requete.isPending ? <Chargement quoi={t("utilisateurs.lesComptes")} /> : null}
      {requete.isError ? (
        <ErreurDeChargement erreur={requete.error} surReessai={() => void requete.refetch()} />
      ) : null}

      {requete.data ? (
        <section className="panel">
          <div
            className="us-scroll"
            role="region"
            aria-label={t("utilisateurs.tableauLibelle")}
            tabIndex={0}
          >
            <div className="us-grid us-head">
              <span>{t("utilisateurs.colUtilisateur")}</span>
              <span>{t("utilisateurs.colEmail")}</span>
              <span>{t("utilisateurs.colRole")}</span>
              <span>{t("utilisateurs.colOrganisation")}</span>
              <span>{t("utilisateurs.colStatut")}</span>
              <span style={{ textAlign: "right" }}>{t("utilisateurs.colActions")}</span>
            </div>
            <div>
              {liste.map((u) => (
                <LigneUtilisateur key={u.id} utilisateur={u} />
              ))}
            </div>
          </div>
          {liste.length === 0 ? (
            <div className="empty">
              <p>{t("utilisateurs.videTitre")}</p>
              <small>{t("utilisateurs.videExplication")}</small>
              <Button className="chip-btn" onPress={reinitialiser}>
                {t("reinitialiserFiltres")}
              </Button>
            </div>
          ) : null}
        </section>
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
    </>
  );
}

/**
 * La couleur d'une pastille de rôle.
 *
 * La maquette colore par famille : administration en rouge, encadrement et RH
 * en orangé, observation en gris, le reste en bleu. C'est une correspondance
 * code → jeton, comme la carte de `pastilles.tsx`.
 */
function jetonRole(code: string | undefined): string {
  if (!code) return "var(--muted)";
  const c = code.toUpperCase();
  if (c === "ADMIN") return "var(--st-blocked)";
  if (c.startsWith("MANAGER") || c.startsWith("HR")) return "var(--st-review)";
  if (c.startsWith("OBSERVER")) return "var(--muted)";
  return "var(--st-doing)";
}

function LigneUtilisateur({ utilisateur }: { utilisateur: api.Utilisateur }) {
  const { t } = useTranslation("administration");
  const { t: tErreurs } = useTranslation("erreurs");
  const peut = usePeut();
  const { session } = useSession();
  const annoncer = useMessages();
  const client = useQueryClient();
  const [suppressionOuverte, setSuppressionOuverte] = useState(false);
  const [modificationOuverte, setModificationOuverte] = useState(false);
  const [reinitialisationOuverte, setReinitialisationOuverte] = useState(false);
  const [cycleDemande, setCycleDemande] = useState<"desactiver" | "reactiver" | null>(null);

  /** `RG-USR-04` — soi-même est le cas qu'on n'a pas le droit de traiter. */
  const soiMeme = utilisateur.id === session.id;
  const nomComplet = `${utilisateur.prenom} ${utilisateur.nom}`;

  const cycle = useMutation({
    mutationFn: (geste: "desactiver" | "reactiver") =>
      geste === "desactiver"
        ? api.desactiverUtilisateur(utilisateur.id, utilisateur.version)
        : api.reactiverUtilisateur(utilisateur.id, utilisateur.version),
    onSuccess: (_, geste) => {
      annoncer("ok", t(`utilisateurs.${geste}Fait`, { nom: nomComplet }));
      setCycleDemande(null);
      void client.invalidateQueries({ queryKey: ["utilisateurs"] });
    },
    onError: (e) => annoncer("err", messageErreur(e, tErreurs, t("utilisateurs.echecAction"))),
  });


  return (
    <div
      className={`us-grid us-row${utilisateur.actif ? "" : " is-off"}${soiMeme ? " is-me" : ""}`}
    >
      <div className="us-who">
        <AvatarAgent prenom={utilisateur.prenom} nom={utilisateur.nom} />
        <div style={{ minWidth: 0 }}>
          <p className="us-n" style={{ margin: 0 }}>
            {nomComplet}
            {soiMeme ? <span className="us-me">{t("utilisateurs.moi")}</span> : null}
          </p>
        </div>
      </div>

      <div style={{ minWidth: 0 }}>
        <span className="us-mail">{utilisateur.email}</span>
        <span className="us-login">{utilisateur.login}</span>
      </div>

      <div>
        {/*
          **La pastille porte le LIBELLÉ du rôle, pas son code.**
          Elle rendait `PROJECT_CONTRIBUTOR` quand le filtre « Rôle » de la
          même barre rend « Contributeur projet », que la fenêtre « Modifier »
          rend « Contributeur projet » et que la vue 32 rend les deux : quatre
          rendus d'une même donnée dans un même produit, dont un seul
          illisible. La table `roles` porte `nom` à côté de `code` ; le code
          reste au survol, il est l'identifiant que l'audit et les imports
          manipulent, mais ce n'est pas ce qui se lit dans un annuaire.
        */}
        <span
          className="pill"
          style={{ color: jetonRole(utilisateur.role?.code) }}
          title={utilisateur.role?.code ?? undefined}
        >
          {nomRole(utilisateur.role) || t("utilisateurs.sansRole")}
        </span>
      </div>

      <div style={{ minWidth: 0 }}>
        <span className="us-org">
          {utilisateur.departement?.nom ?? t("utilisateurs.sansDepartement")}
        </span>
        {utilisateur.services.length > 0 ? (
          <span className="us-svc">
            {utilisateur.services.map((s) => s.service.nom).join(" · ")}
          </span>
        ) : null}
      </div>

      <div>
        <span
          className="pill"
          style={{ color: utilisateur.actif ? "var(--st-done)" : "var(--muted)" }}
        >
          {utilisateur.actif ? t("utilisateurs.actif") : t("utilisateurs.inactif")}
        </span>
      </div>

      <div className="lv-acts">
        {peut("users:read_individual_tracking") ? (
          <a className="ms-toggle" href={`/utilisateurs/${utilisateur.id}/suivi`}>
            {t("utilisateurs.suivi")}
          </a>
        ) : null}
        <MenuTrigger>
          <Button
            className="ms-toggle row-more"
            aria-label={t("utilisateurs.actionsPour", { nom: nomComplet })}
          >
            <span aria-hidden="true">⋯</span>
          </Button>
          {/* `.pop` sur la boîte, jamais `.pop-list` seul : `.pop-list` ne pose
              qu'une hauteur maximale et un défilement, et le menu se rendait
              donc SANS fond, SANS bordure et débordant de la fenêtre — les
              actions se lisaient par-dessus la ligne du dessous. Sixième
              occurrence du même piège, et la seule que `menus.a11y.spec.ts` ne
              couvrait pas : il ouvre les menus des vues 07, 12 et 15. */}
          <Popover>
            <Menu className="pop pop-sm">
              {/* `EX-USR-04`. Contrairement aux trois gestes suivants,
                  modifier son propre compte est légitime : la restriction de
                  `RG-USR-04` porte sur ce qui vous retirerait l'accès, pas sur
                  votre nom. */}
              {peut("users:update") ? (
                <MenuItem className="pop-action" onAction={() => setModificationOuverte(true)}>
                  {t("utilisateurs.modifier")}
                </MenuItem>
              ) : null}

              {peut("users:reset_password") ? (
                <MenuItem
                  className="pop-action"
                  data-disabled={soiMeme || undefined}
                  aria-disabled={soiMeme}
                  /* React Aria retire `aria-disabled` d'un MenuItem qui ne porte
                     pas `isDisabled`, mais `isDisabled` le retire aussi de la
                     navigation clavier. On pose donc la sémantique sur le nœud
                     rendu et le gestionnaire neutralise réellement le geste. */
                  ref={(element) => {
                    if (soiMeme) element?.setAttribute("aria-disabled", "true");
                  }}
                  onAction={() => {
                    if (!soiMeme) setReinitialisationOuverte(true);
                  }}
                >
                  {t("utilisateurs.reinitialiserMotDePasse")}
                  {soiMeme ? (
                    <span className="pop-why">{t("utilisateurs.pasSoiMemeMotDePasse")}</span>
                  ) : null}
                </MenuItem>
              ) : null}

              {peut("users:deactivate") ? (
                <MenuItem
                  className="pop-action"
                  data-disabled={soiMeme || undefined}
                  aria-disabled={soiMeme}
                  ref={(element) => {
                    if (soiMeme) element?.setAttribute("aria-disabled", "true");
                  }}
                  onAction={() => {
                    if (!soiMeme) setCycleDemande(utilisateur.actif ? "desactiver" : "reactiver");
                  }}
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
                  data-disabled={soiMeme || undefined}
                  aria-disabled={soiMeme}
                  ref={(element) => {
                    if (soiMeme) element?.setAttribute("aria-disabled", "true");
                  }}
                  onAction={() => {
                    if (!soiMeme) setSuppressionOuverte(true);
                  }}
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
      </div>

      {reinitialisationOuverte ? (
        <FenetreReinitialisation
          utilisateur={utilisateur}
          surFermeture={() => setReinitialisationOuverte(false)}
        />
      ) : null}

      <Fenetre
        ouverte={cycleDemande !== null}
        surFermeture={() => setCycleDemande(null)}
        categorie={t("utilisateurs.gestionCompte")}
        titre={cycleDemande
          ? t(`utilisateurs.${cycleDemande}Titre`, { nom: nomComplet })
          : ""}
        actions={
          <>
            <Button className="btn btn-secondary" onPress={() => setCycleDemande(null)}>
              {t("annuler")}
            </Button>
            <Button
              className={cycleDemande === "desactiver" ? "btn btn-danger" : "btn btn-primary"}
              isPending={cycle.isPending}
              onPress={() => cycleDemande && cycle.mutate(cycleDemande)}
            >
              {cycleDemande ? t(`utilisateurs.${cycleDemande}Confirmer`) : ""}
            </Button>
          </>
        }
      >
        <p className="lede">
          {cycleDemande ? t(`utilisateurs.${cycleDemande}Explication`) : ""}
        </p>
      </Fenetre>

      <FenetreModification
        utilisateur={modificationOuverte ? utilisateur : null}
        surFermeture={() => setModificationOuverte(false)}
      />

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

  /*
   * `EX-USR-06` — **le compte qu'on efface se nomme.** La fenêtre disait
   * « Action irréversible / Supprimer définitivement » et « Toutes les données
   * associées à cet utilisateur… » : ni le nom, ni le login n'y paraissaient,
   * alors que la fiche affichée dessous porte les deux. Sur un geste sans
   * retour, « cet utilisateur » demande au lecteur de se rappeler sur quelle
   * ligne il a cliqué.
   */
  const nomComplet = `${utilisateur.prenom} ${utilisateur.nom}`;

  const suppression = useMutation({
    mutationFn: () => api.supprimerUtilisateur(
      utilisateur.id,
      impact.data?.version ?? utilisateur.version,
    ),
    onSuccess: () => {
      annoncer("ok", t("utilisateurs.supprimeFaitDe", { nom: nomComplet }));
      surFermeture();
      /*
       * **La fiche d'impact du compte effacé ne se redemande pas.** Un
       * `invalidateQueries(["utilisateurs"])` nu emportait
       * `["utilisateurs", id, "impact"]`, dont l'observateur est encore monté
       * et actif à cet instant — `surFermeture()` n'a pas encore été rendu.
       * `GET /utilisateurs/:id/impact` répondait donc `404` à CHAQUE
       * suppression réussie, en console, sans que rien à l'écran ne le dise.
       * Seule la liste a besoin d'être relue.
       */
      void client.invalidateQueries({
        queryKey: ["utilisateurs"],
        predicate: (q) => q.queryKey[1] !== utilisateur.id,
      });
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
      titre={t("utilisateurs.supprimerLeCompteDe", { nom: nomComplet })}
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
                <span>{libelleImpact(t, b.objet)}</span>
              </li>
            ))}
          </ul>
          <p className="field-hint">{t("utilisateurs.reassignerDabord")}</p>
        </>
      ) : null}

      {impact.data && !bloque ? (
        <div className="danger-box danger-espace">
          <strong>{t("utilisateurs.irreversible")}</strong>{" "}
          {/* Le nom ET le login : deux comptes peuvent porter le même nom, le
              login est ce qui les sépare — et c'est lui que porte l'audit. */}
          <span>
            {t("utilisateurs.toutesLesDonneesDe", {
              nom: nomComplet,
              login: utilisateur.login,
            })}
          </span>
        </div>
      ) : null}
    </Fenetre>
  );
}

/** `RG-GEN-08` — l'API transporte des codes, jamais une phrase française. */
function libelleImpact(t: ReturnType<typeof useTranslation>["t"], objet: string): string {
  const cle = ({
    temps: "temps",
    "saisies de temps": "temps",
    projets: "projets",
    "projets dirigés ou sponsorisés": "projets",
    conges: "conges",
    "congés approuvés": "conges",
    assignations: "assignations",
    "assignations de tâches": "assignations",
    todos: "todos",
    "to-do personnelles": "todos",
    notifications: "notifications",
  } as Record<string, string>)[objet];
  return cle ? t(`utilisateurs.impact_${cle}`) : objet;
}

/**
 * `EX-USR-04` — modifier un compte, rôle et rattachements compris.
 *
 * La vue portait « Réinitialiser », « Désactiver » et « Supprimer », mais pas
 * « Modifier », derrière un commentaire affirmant que la route n'existait pas
 * côté serveur. `PATCH /utilisateurs/:id` existe et porte `users:update` ; le
 * commentaire était périmé, et rien ne pouvait le contredire — une action
 * absente ne casse aucun test.
 *
 * `RG-AUTH-08` — l'identifiant de connexion reste hors du formulaire : il
 * n'est modifiable par personne, et sert de référence au journal d'audit.
 */
/**
 * `EX-USR-04` — rôle, département et services : les trois rattachements.
 *
 * L'exigence dit « modifier un compte, **y compris son rôle et ses
 * rattachements** », et `POST`/`PATCH /utilisateurs` les acceptent tous les
 * trois depuis toujours. Aucune des deux fenêtres ne les proposait : un compte
 * créé depuis la vue 27 naissait sans rôle, donc sans une seule permission, et
 * **rien dans le produit ne pouvait l'en sortir**. Le seul chemin restant était
 * l'import CSV, qui les porte — une fonction de reprise employée comme unique
 * moyen d'administrer.
 *
 * Trois points de conception, chacun pour une raison :
 *
 * - **Le rôle est gouverné.** `users:update` autorise la route, `RG` réserve le
 *   champ `roleId` à `users:manage_roles` : c'est la ligne qui sépare le
 *   support de l'administration. Sans la permission, le sélecteur reste
 *   **lisible et inerte**, avec son motif — le masquer ferait croire qu'un
 *   compte n'a pas de rôle.
 * - **Les services suivent le département.** Le serveur refuse un service qui
 *   n'appartient pas au département choisi. Ne proposer que les siens, et
 *   retirer ceux qui ne le sont plus quand il change, évite un refus que
 *   l'utilisateur n'a pas provoqué.
 * - **Les listes viennent du cache.** `["organisation"]` et `["roles"]` sont
 *   déjà chargées par la liste qui porte ces fenêtres : les redemander ici par
 *   les mêmes clés ne produit aucune requête de plus.
 */
function ChampsRattachement({
  prefixe,
  roleId,
  departementId,
  serviceIds,
  surChangement,
}: {
  prefixe: string;
  roleId: string;
  departementId: string;
  serviceIds: ReadonlySet<string>;
  surChangement: (v: {
    roleId?: string;
    departementId?: string;
    serviceIds?: ReadonlySet<string>;
  }) => void;
}) {
  const { t } = useTranslation("administration");
  const peut = usePeut();
  /* Même forme, même garde que la barre de filtres ci-dessus : on ne demande
     pas ce qu'on n'a pas le droit de lire (`RG-GEN-06`). */
  const orgaLisible = peut("directions:read");
  const roleModifiable = peut("users:manage_roles");
  const orga = useQuery({
    queryKey: ["organisation"],
    queryFn: () => api.arborescence(),
    enabled: orgaLisible,
  });
  const roles = useQuery({
    queryKey: ["roles"],
    queryFn: () => api.roles(),
    enabled: roleModifiable,
  });

  const departements = [
    ...(orga.data?.directions.flatMap((d) => d.departements) ?? []),
    ...(orga.data?.departementsSansDirection ?? []),
  ];
  const servicesDuDepartement = departements.find((d) => d.id === departementId)?.services ?? [];

  const changerDepartement = (id: string) => {
    const permis = new Set(
      (departements.find((d) => d.id === id)?.services ?? []).map((sv) => sv.id),
    );
    surChangement({
      departementId: id,
      serviceIds: new Set([...serviceIds].filter((sv) => permis.has(sv))),
    });
  };

  const basculerService = (id: string) => {
    const suivants = new Set(serviceIds);
    if (!suivants.delete(id)) suivants.add(id);
    surChangement({ serviceIds: suivants });
  };

  return (
    <>
      <div className="field-block">
        <label className="field-label" htmlFor={`${prefixe}-role`}>
          {t("utilisateurs.colRole")}
        </label>
        <select
          className="field"
          id={`${prefixe}-role`}
          value={roleId}
          /*
           * Inerte tant que le catalogue n'est pas là. La VALEUR vient de la
           * fiche, pas de la liste — elle est donc juste dès l'ouverture —,
           * mais un `<select>` dont l'option courante manque affiche la
           * première : « Aucun rôle » sous les yeux de quelqu'un qui en a un.
           * Le laisser actif inviterait à corriger un affichage faux.
           */
          disabled={!roleModifiable || roles.isPending}
          onChange={(e) => surChangement({ roleId: e.target.value })}
        >
          <option value="">{t("utilisateurs.sansRole")}</option>
          {(roles.data ?? []).map((r) => (
            <option key={r.id} value={r.id}>
              {nomRole(r)}
            </option>
          ))}
        </select>
        {/* `RG-GEN-06` — l'interdit porte sa raison, et il la porte en clair :
            une explication au survol ne se lit ni au clavier ni au doigt. */}
        {roleModifiable ? null : (
          <p className="field-hint">{t("utilisateurs.roleNonModifiable")}</p>
        )}
      </div>

      <div className="field-block">
        <label className="field-label" htmlFor={`${prefixe}-departement`}>
          {t("utilisateurs.departement")}
        </label>
        <select
          className="field"
          id={`${prefixe}-departement`}
          value={departementId}
          disabled={!orgaLisible || orga.isPending}
          onChange={(e) => changerDepartement(e.target.value)}
        >
          <option value="">{t("utilisateurs.sansDepartement")}</option>
          {departements.map((d) => (
            <option key={d.id} value={d.id}>
              {d.nom}
            </option>
          ))}
        </select>
        {/* `RG-GEN-06` — sans `directions:read`, l'arborescence n'est pas
            demandée : le champ le dit plutôt que de rester vide sans raison. */}
        {orgaLisible ? null : (
          <p className="field-hint">{t("utilisateurs.organisationNonLisible")}</p>
        )}
      </div>

      <div className="field-block span2">
        <span className="field-label" id={`${prefixe}-services`}>
          {t("utilisateurs.services")}
        </span>
        {departementId === "" ? (
          <p className="field-hint">{t("utilisateurs.servicesSansDepartement")}</p>
        ) : servicesDuDepartement.length === 0 ? (
          <p className="field-hint">{t("utilisateurs.departementSansService")}</p>
        ) : (
          <div className="layers" role="group" aria-labelledby={`${prefixe}-services`}>
            {servicesDuDepartement.map((sv) => (
              <label key={sv.id} className={`layer${serviceIds.has(sv.id) ? " is-on" : ""}`}>
                <input
                  type="checkbox"
                  checked={serviceIds.has(sv.id)}
                  onChange={() => basculerService(sv.id)}
                />
                {sv.nom}
              </label>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function FenetreModification({
  utilisateur,
  surFermeture,
}: {
  utilisateur: api.Utilisateur | null;
  surFermeture: () => void;
}) {
  const { t } = useTranslation("administration");
  const { t: tErreurs } = useTranslation("erreurs");
  const annoncer = useMessages();
  const client = useQueryClient();

  const peut = usePeut();

  const [valeurs, setValeurs] = useState({
    prenom: "",
    nom: "",
    email: "",
    roleId: "",
    departementId: "",
  });
  const [serviceIds, setServiceIds] = useState<ReadonlySet<string>>(new Set());
  const [erreur, setErreur] = useState<string | null>(null);
  // Le formulaire se recharge quand la fenêtre change de compte : sans clé de
  // remontage, la fiche suivante afficherait les valeurs de la précédente.
  const [pour, setPour] = useState<string | null>(null);
  if (utilisateur && pour !== utilisateur.id) {
    setPour(utilisateur.id);
    setValeurs({
      prenom: utilisateur.prenom,
      nom: utilisateur.nom,
      email: utilisateur.email,
      roleId: utilisateur.role?.id ?? "",
      departementId: utilisateur.departement?.id ?? "",
    });
    setServiceIds(new Set(utilisateur.services.map((sv) => sv.service.id)));
    setErreur(null);
  }

  const modification = useMutation({
    mutationFn: () =>
      api.modifierUtilisateur(utilisateur!.id, {
        prenom: valeurs.prenom,
        nom: valeurs.nom,
        email: valeurs.email,
        version: utilisateur!.version,
        /*
         * `roleId` n'accompagne la requête QUE si l'appelant peut le changer :
         * le serveur refuse la présence du champ, pas sa valeur. L'envoyer
         * inchangé ferait échouer la correction d'une faute de frappe dans un
         * nom, pour un compte de support parfaitement dans son droit.
         */
        ...(peut("users:manage_roles") ? { roleId: valeurs.roleId || null } : {}),
        departementId: valeurs.departementId || null,
        serviceIds: [...serviceIds],
      }),
    onSuccess: () => {
      annoncer("ok", t("utilisateurs.modifie"));
      surFermeture();
      void client.invalidateQueries({ queryKey: ["utilisateurs"] });
      // Se modifier soi-même change ce que la coquille affiche.
      void client.invalidateQueries({ queryKey: ["session"] });
    },
    onError: (e) => setErreur(messageErreur(e, tErreurs, t("utilisateurs.echecModification"))),
  });

  const champ = (cle: keyof typeof valeurs) => ({
    value: valeurs[cle],
    onChange: (e: { target: { value: string } }) =>
      setValeurs((v) => ({ ...v, [cle]: e.target.value })),
  });

  return (
    <Fenetre
      ouverte={Boolean(utilisateur)}
      surFermeture={surFermeture}
      categorie={t("utilisateurs.categorieModification")}
      titre={t("utilisateurs.modifier")}
      large
      mention={t("champsObligatoires")}
      actions={
        <>
          <Button className="btn btn-secondary" onPress={surFermeture}>
            {t("annuler")}
          </Button>
          <Button
            className="btn btn-primary"
            isPending={modification.isPending}
            onPress={() => modification.mutate()}
          >
            {t("utilisateurs.enregistrer")}
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
          <label className="field-label" htmlFor="usm-prenom">
            {t("utilisateurs.prenom")} <span className="req">*</span>
          </label>
          <input className="field" id="usm-prenom" type="text" {...champ("prenom")} />
        </div>
        <div className="field-block">
          <label className="field-label" htmlFor="usm-nom">
            {t("utilisateurs.nom")} <span className="req">*</span>
          </label>
          <input className="field" id="usm-nom" type="text" {...champ("nom")} />
        </div>
        <div className="field-block span2">
          <label className="field-label" htmlFor="usm-email">
            {t("utilisateurs.email")} <span className="req">*</span>
          </label>
          <input className="field" id="usm-email" type="email" {...champ("email")} />
        </div>
        <div className="field-block span2">
          <label className="field-label" htmlFor="usm-login">
            {t("utilisateurs.login")}
          </label>
          <input className="field" id="usm-login" value={utilisateur?.login ?? ""} disabled />
          <p className="field-hint">{t("utilisateurs.loginDefinitif")}</p>
        </div>

        <ChampsRattachement
          prefixe="usm"
          roleId={valeurs.roleId}
          departementId={valeurs.departementId}
          serviceIds={serviceIds}
          surChangement={(v) => {
            if (v.roleId !== undefined) setValeurs((x) => ({ ...x, roleId: v.roleId! }));
            if (v.departementId !== undefined)
              setValeurs((x) => ({ ...x, departementId: v.departementId! }));
            if (v.serviceIds !== undefined) setServiceIds(v.serviceIds);
          }}
        />
      </div>
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

  const peut = usePeut();

  const [valeurs, setValeurs] = useState({
    prenom: "",
    nom: "",
    email: "",
    login: "",
    motDePasse: "",
    roleId: "",
    departementId: "",
  });
  const [serviceIds, setServiceIds] = useState<ReadonlySet<string>>(new Set());
  const [erreur, setErreur] = useState<string | null>(null);
  /*
   * Les champs que le SERVEUR a refusés.
   *
   * `valider()` renvoie un `details` — champ par champ, avec sa raison — que
   * `ErreurApi` transportait jusqu'ici et que PERSONNE ne lisait : un compte
   * refusé pour un mot de passe trop court affichait « Certaines informations
   * sont incomplètes ou mal formées » et rien d'autre. Le serveur savait
   * exactement quoi dire ; l'interface le jetait.
   *
   * Ce sont les NOMS des champs qui sont repris, traduits par le catalogue du
   * client. La raison, elle, arrive en français depuis le serveur : la
   * remonter telle quelle contredirait `RG-GEN-08`. Pour le mot de passe, qui
   * est le seul champ dont la règle ne se devine pas, la politique est
   * affichée en toutes lettres sous le champ — comme aux vues 02, 04 et 05.
   */
  const [refuses, setRefuses] = useState<readonly string[]>([]);

  /** Les libellés du formulaire, par nom de champ du serveur. */
  const libelles: Record<string, string> = {
    prenom: t("utilisateurs.prenom"),
    nom: t("utilisateurs.nom"),
    email: t("utilisateurs.email"),
    login: t("utilisateurs.login"),
    motDePasse: t("utilisateurs.motDePasse"),
  };

  const creation = useMutation({
    mutationFn: () =>
      api.creerUtilisateur({
        prenom: valeurs.prenom,
        nom: valeurs.nom,
        email: valeurs.email,
        login: valeurs.login,
        motDePasse: valeurs.motDePasse,
        // Même règle qu'à la modification : le champ n'accompagne la requête
        // que si l'appelant peut le poser (`champs-gouvernes.ts`).
        ...(peut("users:manage_roles") ? { roleId: valeurs.roleId || null } : {}),
        departementId: valeurs.departementId || null,
        serviceIds: [...serviceIds],
      }),
    onSuccess: () => {
      annoncer("ok", t("utilisateurs.cree"));
      setValeurs({
        prenom: "", nom: "", email: "", login: "", motDePasse: "",
        roleId: "", departementId: "",
      });
      setServiceIds(new Set());
      setRefuses([]);
      surFermeture();
      void client.invalidateQueries({ queryKey: ["utilisateurs"] });
    },
    onError: (e) => {
      const champs = e instanceof ErreurApi ? (e.details ?? []).map((d) => d.champ) : [];
      const message = messageErreur(e, tErreurs, t("utilisateurs.echecCreation"));
      setErreur(
        champs.length > 0
          ? `${message} ${t("utilisateurs.champsACorriger", {
              champs: champs.map((c) => libelles[c] ?? c).join(", "),
            })}`
          : message,
      );
      setRefuses(champs);
    },
  });

  /*
   * `RG-AUTH-06` se vérifie AVANT l'aller-retour.
   *
   * Le bouton n'est pas désactivé : un `<button disabled>` ne reçoit ni survol
   * ni focus, donc n'explique rien — et c'est le motif que le produit a déjà
   * payé une fois. Il reste joignable, et il dit ce qui manque.
   */
  const soumettre = () => {
    if (!politiqueTenue(valeurs.motDePasse)) {
      setErreur(t("utilisateurs.motDePasseFaible"));
      setRefuses(["motDePasse"]);
      return;
    }
    setErreur(null);
    setRefuses([]);
    creation.mutate();
  };

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
            onPress={soumettre}
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
          <input
            className="field"
            id="us-prenom"
            type="text"
            aria-invalid={refuses.includes("prenom") || undefined}
            {...champ("prenom")}
          />
        </div>
        <div className="field-block">
          <label className="field-label" htmlFor="us-nom">
            {t("utilisateurs.nom")} <span className="req">*</span>
          </label>
          <input
            className="field"
            id="us-nom"
            type="text"
            aria-invalid={refuses.includes("nom") || undefined}
            {...champ("nom")}
          />
        </div>
        <div className="field-block">
          <label className="field-label" htmlFor="us-email">
            {t("utilisateurs.email")} <span className="req">*</span>
          </label>
          <input
            className="field"
            id="us-email"
            type="email"
            aria-invalid={refuses.includes("email") || undefined}
            {...champ("email")}
          />
        </div>
        <div className="field-block">
          <label className="field-label" htmlFor="us-login">
            {t("utilisateurs.login")} <span className="req">*</span>
          </label>
          <input
            className="field"
            id="us-login"
            type="text"
            aria-invalid={refuses.includes("login") || undefined}
            {...champ("login")}
          />
          {/* `RG-AUTH-08` — l'identifiant n'est jamais modifiable après
              création. Le dire à la création évite de le découvrir ensuite. */}
          <p className="field-hint">{t("utilisateurs.loginDefinitif")}</p>
        </div>
        <div className="field-block span2">
          <label className="field-label" htmlFor="us-mdp">
            {t("utilisateurs.motDePasse")} <span className="req">*</span>
          </label>
          <input
            className="field"
            id="us-mdp"
            type="password"
            aria-describedby="us-mdp-politique"
            aria-invalid={refuses.includes("motDePasse") || undefined}
            {...champ("motDePasse")}
          />
          {/* `RG-AUTH-06` — les quatre critères, validés au fil de la frappe.
              Le même bloc qu'aux vues 02, 04 et 05 : l'administrateur qui crée
              un compte pour quelqu'un d'autre n'a aucune raison de connaître
              une politique que le produit ne montre qu'à l'intéressé. Sans
              lui, un mot de passe trop court partait au serveur et revenait en
              400 sans dire lequel des quatre critères manquait. */}
          <PolitiqueMotDePasse id="us-mdp-politique" valeur={valeurs.motDePasse} />
        </div>

        {/* `EX-USR-04` — un compte créé sans rôle n'a AUCUNE permission, et
            rien dans le produit ne l'en sortait. Les rattachements se posent
            donc dès la création, et se corrigent ensuite au même endroit. */}
        <ChampsRattachement
          prefixe="us"
          roleId={valeurs.roleId}
          departementId={valeurs.departementId}
          serviceIds={serviceIds}
          surChangement={(v) => {
            if (v.roleId !== undefined) setValeurs((x) => ({ ...x, roleId: v.roleId! }));
            if (v.departementId !== undefined)
              setValeurs((x) => ({ ...x, departementId: v.departementId! }));
            if (v.serviceIds !== undefined) setServiceIds(v.serviceIds);
          }}
        />
      </div>
    </Fenetre>
  );
}

/** RM-02 — le secret est choisi par l'administrateur, qui le remet au titulaire. */
function FenetreReinitialisation({ utilisateur, surFermeture }: {
  utilisateur: api.Utilisateur;
  surFermeture: () => void;
}) {
  const { t } = useTranslation("administration");
  const { t: tAuth } = useTranslation("auth");
  const { t: tErreurs } = useTranslation("erreurs");
  const annoncer = useMessages();
  const [nouveau, setNouveau] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const nom = `${utilisateur.prenom} ${utilisateur.nom}`;
  const mutation = useMutation({
    mutationFn: () => api.reinitialiserMotDePasse(utilisateur.id, nouveau),
    onSuccess: () => {
      annoncer("ok", t("utilisateurs.motDePasseReinitialise", { nom }));
      surFermeture();
    },
    onError: (e) => setErreur(messageErreur(e, tErreurs, t("utilisateurs.echecAction"))),
  });
  const soumettre = () => {
    if (mutation.isPending) return;
    setErreur(null);
    if (!politiqueTenue(nouveau)) {
      document.getElementById("us-reset-nouveau")?.focus();
      return;
    }
    if (nouveau !== confirmation) {
      setErreur(tAuth("erreurs.motsDePasseDifferents"));
      return;
    }
    mutation.mutate();
  };
  const fermer = () => { if (!mutation.isPending) surFermeture(); };
  return (
    <Fenetre
      ouverte
      surFermeture={fermer}
      categorie={nom}
      titre={t("utilisateurs.reinitialiserMotDePasse")}
      mention={t("champsObligatoires")}
      actions={<>
        <Button className="btn btn-secondary" isDisabled={mutation.isPending} onPress={fermer}>
          {t("annuler")}
        </Button>
        <Button className="btn btn-primary" isPending={mutation.isPending} onPress={soumettre}>
          {t("utilisateurs.reinitialiserMotDePasse")}
        </Button>
      </>}
    >
      <p className="field-hint">{t("utilisateurs.remiseMotDePasse", { nom })}</p>
      {erreur ? <div className="alert alert-error" role="alert">{erreur}</div> : null}
      <ChampMotDePasse
        libelle={tAuth("reinitialisation.nouveau")}
        idChamp="us-reset-nouveau"
        value={nouveau}
        onChange={setNouveau}
        autoComplete="new-password"
        isDisabled={mutation.isPending}
        politique
        reserve
      />
      <ChampMotDePasse
        libelle={tAuth("reinitialisation.confirmation")}
        value={confirmation}
        onChange={setConfirmation}
        autoComplete="new-password"
        isDisabled={mutation.isPending}
        reserve
      />
    </Fenetre>
  );
}
