import { useMemo, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { adresseExportCompetences } from "../../api/imports.js";
import * as apiImports from "../../api/imports.js";
import { FenetreImport } from "../../composants/Import.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "react-aria-components";
import { CATEGORIES_COMPETENCE, NIVEAUX_COMPETENCE } from "@rationarium/contracts";
import * as api from "../../api/referentiels.js";
import { messageErreur } from "../../api/erreurs.js";
import { usePeut } from "../../session/session.js";
import { Chargement, ErreurDeChargement } from "../../composants/etats.js";
import { Fenetre } from "../../composants/fenetre.js";
import { useMessages } from "../../composants/messages.js";
import { AvatarAgent, MarqueurCalcule, jetonDe, useLibelle } from "../../composants/pastilles.js";
import "../../composants/partages.css";
/*
 * Les maquettes sont cumulatives : la section 26 réemploie des classes
 * introduites plus tôt sans les redéfinir. On charge leurs feuilles plutôt que
 * de recopier les règles, ce qui les ferait diverger à la première retouche.
 *
 *   `.kpi-head`, `.kpi-bar`   section 15 → `projets/fiche.css`
 *   `.raci-none`              section 21 → `taches/fiche.css`
 *   `.mname`                  section 18 → `projets/equipe.css`
 *   `.split-legend`, `.sl`    section 25 → `occupations/temps.css`
 */
import "../projets/fiche.css";
import "../projets/equipe.css";
import "../taches/fiche.css";
import "../occupations/temps.css";
import "./competences.css";

/**
 * Vue 22 — Compétences. **La vue la plus dense du produit.**
 *
 * Le brief fixe la cible : 50 lignes × 40 colonnes, en-têtes figés sur les
 * deux axes, cellules cliquables à la taille de cible tactile — et surtout :
 * « **la couverture insuffisante doit sauter aux yeux** : c'est l'information
 * qu'on vient chercher ».
 *
 * D'où la ligne de couverture, figée sous les en-têtes de colonnes, qui porte
 * le ratio détenteurs/requis. Un écart y est rouge **et** écrit — la couleur
 * ne dit rien à qui ne la voit pas.
 *
 * Le niveau d'une cellule est rendu par un dégradé d'accent à quatre pas, et
 * **doublé d'une abréviation lisible** : quatre nuances de bleu ne se
 * distinguent pas d'un coup d'œil, trois lettres si.
 */

type Vue = "parUtilisateur" | "referentiel" | "matrice";

/**
 * `EX-CMP-07` — **deux vocabulaires de tri, un par objet trié.**
 *
 * L'exigence disait « trier par nom, couverture ou compétence » et le produit
 * proposait « nom / nombre de compétences / par niveau sur une compétence ».
 * Les deux listes parlaient d'objets différents sans le dire : la
 * **couverture** est le ratio détenteurs/requis (`RG-CMP-03`), donc une
 * propriété de compétence, qui ordonne le RÉFÉRENTIEL ; « par compétence » ne
 * veut rien dire d'autre que « par niveau sur une compétence choisie », et
 * cela n'ordonne que la MATRICE, dont les lignes sont des agents. Tranché, et
 * porté dans `cadrage/01 § M13`.
 */
type TriMatrice = "nom" | "nombre" | "competence";
type TriReferentiel = "nom" | "couverture";

const RANG: Record<string, number> = {
  beginner: 1,
  intermediate: 2,
  expert: 3,
  master: 4,
};

/** Les trois lettres qui doublent la nuance. */
const abreger = (libelle: string) => libelle.slice(0, 3);

export function Competences() {
  const { t } = useTranslation("referentiels");
  const { t: tImports } = useTranslation("imports");
  const libelle = useLibelle();
  const peut = usePeut();
  const client = useQueryClient();

  const [importOuvert, setImportOuvert] = useState(false);
  const [vue, setVue] = useState<Vue>("matrice");
  const [categorie, setCategorie] = useState("");
  const [recherche, setRecherche] = useState("");
  const [niveau, setNiveau] = useState("");
  const [tri, setTri] = useState<TriMatrice>("nom");
  const [triReferentiel, setTriReferentiel] = useState<TriReferentiel>("nom");
  const [competenceTri, setCompetenceTri] = useState("");
  const [ecartsDeplies, setEcartsDeplies] = useState(false);
  const [creationOuverte, setCreationOuverte] = useState(false);

  /*
   * `EX-CMP-07` — **la recherche, le filtre de niveau et le tri sont passés au
   * serveur, plus appliqués ici.**
   *
   * Ils vivaient dans cette vue, appliqués aux lignes déjà reçues. Tant que la
   * matrice tient entière en mémoire les deux se ressemblent ; le jour où la
   * liste d'agents se pagine — le brief l'annonce à « 50 lignes × 40 colonnes »
   * —, un tri d'écran ordonne une tranche en se donnant l'air d'ordonner
   * l'ensemble, et rien ne le signale. Un filtre et un tri sont des propriétés
   * du point d'entrée.
   */
  const requete = useQuery({
    queryKey: ["competences", "matrice", { categorie, recherche, niveau, tri, competenceTri }],
    queryFn: () =>
      api.matrice({
        categorie,
        recherche,
        niveau,
        tri,
        ...(tri === "competence" && competenceTri ? { competenceId: competenceTri } : {}),
      }),
  });

  const colonnes = requete.data?.colonnes ?? [];
  const lignes = requete.data?.lignes ?? [];

  const ecarts = colonnes.filter((c) => c.ecart);
  const affichees = ecartsDeplies ? ecarts : ecarts.slice(0, 3);
  const detenues = lignes.reduce((s, l) => s + l.niveaux.filter(Boolean).length, 0);
  const experts = lignes.reduce(
    (s, l) => s + l.niveaux.filter((n) => n !== null && (RANG[n] ?? 0) >= 3).length,
    0,
  );
  const couverture = requete.data?.synthese.couvertureMoyenne ?? 0;
  const moyenne = lignes.length ? (detenues / lignes.length).toFixed(1) : "0";

  return (
    <>
      <div className="pl-toolbar">
        <div>
          <span className="eyebrow">{t("competences.surtitre")}</span>
          <h1 className="h1">{t("competences.titre")}</h1>
        </div>
        <div className="pl-toolbar-fin">
          <div className="seg" role="group" aria-label={t("competences.vue")}>
            <Button
              aria-pressed={vue === "parUtilisateur"}
              onPress={() => setVue("parUtilisateur")}
            >
              {t("competences.vueParUtilisateur")}
            </Button>
            <Button aria-pressed={vue === "referentiel"} onPress={() => setVue("referentiel")}>
              {t("competences.vueReferentiel")}
            </Button>
            <Button aria-pressed={vue === "matrice"} onPress={() => setVue("matrice")}>
              {t("competences.vueMatrice")}
            </Button>
          </div>
          {peut("skills:create") ? (
            <Button className="chip-btn" onPress={() => setImportOuvert(true)}>
              {t("competences.importerCsv")}
            </Button>
          ) : null}
          {peut("skills:create") ? (
            <Button className="btn btn-primary" onPress={() => setCreationOuverte(true)}>
              {t("competences.nouvelleAction")}
            </Button>
          ) : null}
        </div>
      </div>

      {requete.isPending ? <Chargement quoi={t("competences.laMatrice")} /> : null}
      {requete.isError ? (
        <ErreurDeChargement erreur={requete.error} surReessai={() => void requete.refetch()} />
      ) : null}

      {requete.isSuccess ? (
        <>
          {/* Écarts de couverture : l'information qu'on vient chercher. */}
          {ecarts.length > 0 ? (
            <div className="alert alert-error">
              <div style={{ display: "flex", gap: "10px", alignItems: "flex-start", flex: 1 }}>
                <span className="alert-icon" aria-hidden="true">
                  !
                </span>
                <div style={{ flex: 1 }}>
                  <strong>{t("competences.bandeauEcarts")}</strong>
                  <p style={{ margin: "6px 0 0", fontSize: "12.5px", lineHeight: 1.6 }}>
                    {affichees
                      .map((c) => t("competences.ecartLigne", { nom: c.nom, ratio: c.ratio, n: c.manque }))
                      .join(" · ")}
                  </p>
                </div>
                {ecarts.length > 3 ? (
                  <Button
                    className="chip-btn"
                    style={{ flex: "none" }}
                    onPress={() => setEcartsDeplies(!ecartsDeplies)}
                  >
                    {ecartsDeplies
                      ? t("competences.reduire")
                      : t("competences.plusAutres", { n: ecarts.length - 3 })}
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="kpi-grid">
            <div className="kpi">
              <div className="kpi-head">
                <span className="eyebrow">{t("competences.couvertureMoyenne")}</span>
                <MarqueurCalcule explication={t("competences.couvertureCalcul")} />
              </div>
              <p className="kpi-val">{couverture} %</p>
              <div className="bar kpi-bar" aria-hidden="true">
                <i style={{ width: `${couverture}%` }} />
              </div>
            </div>
            <div className="kpi is-alert">
              <span className="eyebrow">{t("competences.ecarts")}</span>
              <p className="kpi-val">{ecarts.length}</p>
              <span className="kpi-sub">{t("competences.aRenforcer", { n: ecarts.length })}</span>
            </div>
            <div className="kpi">
              <span className="eyebrow">{t("competences.competencesDetenues")}</span>
              <p className="kpi-val">{detenues}</p>
              <span className="kpi-sub">{t("competences.moyenneParAgent", { v: moyenne })}</span>
            </div>
            <div className="kpi">
              <span className="eyebrow">{t("competences.expertsMaitres")}</span>
              <p className="kpi-val">{experts}</p>
              <span className="kpi-sub">{t("competences.niveaux34")}</span>
            </div>
          </div>

          {/*
            `EX-CMP-07` — **la barre de filtres sert aussi le référentiel.**

            Elle était enfermée dans la branche « matrice » et le composant
            `Referentiel` recevait pourtant `categorie` et `recherche` : sur
            l'onglet Référentiel, les filtres gardaient donc la dernière valeur
            posée ailleurs, sans un seul contrôle pour les changer. L'exigence
            demande de rechercher et filtrer — sur les trois vues du module.
          */}
          {vue !== "parUtilisateur" ? (
            <>
              <div className="filters">
                {/*
                  La recherche ne cherche pas la même chose selon la vue : la
                  matrice range des agents, le référentiel range des
                  compétences. Un placeholder unique en désignerait un pour
                  l'autre — « Rechercher un collaborateur… » au-dessus d'une
                  liste de compétences.
                */}
                <input
                  className="f-input"
                  type="search"
                  style={{ width: "210px" }}
                  value={recherche}
                  onChange={(e) => setRecherche(e.target.value)}
                  placeholder={
                    vue === "matrice"
                      ? t("competences.rechercher")
                      : t("competences.rechercherCompetence")
                  }
                  aria-label={
                    vue === "matrice"
                      ? t("competences.rechercher")
                      : t("competences.rechercherCompetence")
                  }
                />
                <select
                  className="f-input"
                  value={categorie}
                  onChange={(e) => setCategorie(e.target.value)}
                  aria-label={t("competences.categorie")}
                >
                  <option value="">{t("competences.toutesCategories")}</option>
                  {CATEGORIES_COMPETENCE.map((c) => (
                    <option key={c.code} value={c.code}>
                      {libelle(c.code, CATEGORIES_COMPETENCE)}
                    </option>
                  ))}
                </select>
                <select
                  className="f-input"
                  value={niveau}
                  onChange={(e) => setNiveau(e.target.value)}
                  aria-label={t("competences.niveau")}
                >
                  <option value="">{t("competences.tousNiveaux")}</option>
                  {NIVEAUX_COMPETENCE.map((n) => (
                    <option key={n.code} value={n.code}>
                      {libelle(n.code, NIVEAUX_COMPETENCE)}
                    </option>
                  ))}
                </select>
                {/*
                  Deux vocabulaires de tri, un par objet trié. Le référentiel
                  range des compétences — nom, couverture ; la matrice range
                  des agents — nom, nombre de compétences, niveau sur l'une
                  d'elles. Un sélecteur unique aux six entrées demanderait au
                  lecteur de deviner lesquelles s'appliquent à ce qu'il regarde.
                */}
                {vue === "matrice" ? (
                  <select
                    className="f-input"
                    value={tri}
                    onChange={(e) => setTri(e.target.value as TriMatrice)}
                    aria-label={t("competences.tri")}
                  >
                    <option value="nom">{t("competences.triNom")}</option>
                    <option value="nombre">{t("competences.triNombre")}</option>
                    <option value="competence">{t("competences.triCompetence")}</option>
                  </select>
                ) : (
                  <select
                    className="f-input"
                    value={triReferentiel}
                    onChange={(e) => setTriReferentiel(e.target.value as TriReferentiel)}
                    aria-label={t("competences.tri")}
                  >
                    <option value="nom">{t("competences.triNom")}</option>
                    {/* `RG-CMP-03` — le ratio détenteurs/requis. Le tri qui
                        manquait, et celui qui répond à la question du module :
                        « sommes-nous couverts ? ». Le moins couvert en tête. */}
                    <option value="couverture">{t("competences.triCouverture")}</option>
                  </select>
                )}
                {/* Le sélecteur de compétence n'apparaît que lorsqu'il sert. */}
                <select
                  className="f-input"
                  hidden={vue !== "matrice" || tri !== "competence"}
                  value={competenceTri}
                  onChange={(e) => setCompetenceTri(e.target.value)}
                  aria-label={t("competences.competenceDeTri")}
                >
                  {colonnes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nom}
                    </option>
                  ))}
                </select>
                {/*
                  `EX-CMP-08` — « Exporter la **matrice** en CSV ».

                  Ce bouton téléchargeait le RÉFÉRENTIEL : la liste des
                  compétences, sans un seul agent. Le libellé de la maquette
                  (« Export CSV »), sa place — la barre de filtres de la
                  matrice — et l'exigence disent tous les trois la matrice.
                  Les deux exports existent et sont distincts, ils portent
                  donc désormais deux noms distincts.
                */}
                {peut("skills:export") && vue === "matrice" ? <ExportMatrice /> : null}
                {peut("skills:export") ? (
                  <a className="chip-btn" href={adresseExportCompetences()} download>
                    {t("competences.exportReferentiel")}
                  </a>
                ) : null}
                {vue === "matrice" ? (
                  <span className="field-hint" style={{ margin: "0 0 0 auto" }}>
                    {t("competences.indiceCellule")}
                  </span>
                ) : null}
              </div>

              {vue !== "matrice" ? null : colonnes.length === 0 || lignes.length === 0 ? (
                <div className="empty empty-encadre">
                  <p>{t("competences.videTitre")}</p>
                  <small>{t("competences.videExplication")}</small>
                </div>
              ) : (
                <>
                  {/* Zone défilante : atteignable au clavier, et nommée. */}
                  <div
                    className="mx-wrap"
                    role="region"
                    tabIndex={0}
                    aria-label={t("competences.matriceZone")}
                  >
                    <div
                      className="mx"
                      style={
                        {
                          "--cols": `218px repeat(${colonnes.length}, minmax(44px,1fr))`,
                        } as CSSProperties
                      }
                    >
                      <div className="mx-corner">
                        <span className="eyebrow">{t("competences.collaborateur")}</span>
                      </div>
                      {colonnes.map((c) => (
                        <div
                          className={`mx-head${c.ecart ? " is-gap" : ""}`}
                          key={c.id}
                          style={{ color: jetonDe(c.categorie) }}
                          title={`${c.nom} · ${libelle(c.categorie, CATEGORIES_COMPETENCE)} · ${c.ratio}`}
                        >
                          <span>{c.nom}</span>
                        </div>
                      ))}

                      <div className="mx-covlab">
                        <span className="eyebrow">{t("competences.couverture")}</span>
                      </div>
                      {colonnes.map((c) => (
                        <div
                          className={`mx-cov ${classeCouverture(c)}`}
                          key={c.id}
                          // Le ratio est lu en toutes lettres : la couleur ne dit
                          // rien à qui ne la voit pas, et le manque est
                          // l'information centrale.
                          aria-label={
                            c.ecart
                              ? t("competences.ecartDe", {
                                  nom: c.nom,
                                  n: c.manque,
                                  ratio: c.ratio,
                                })
                              : t("competences.couvertureComplete", { nom: c.nom, ratio: c.ratio })
                          }
                        >
                          <span className="mx-cov-n">{c.ratio}</span>
                          <div className="mx-cov-bar" aria-hidden="true">
                            <i
                              style={{
                                width: `${Math.min(100, (c.detenteurs / Math.max(1, c.effectifRequis)) * 100)}%`,
                                background: c.ecart
                                  ? c.detenteurs > 0
                                    ? "var(--st-review)"
                                    : "var(--st-blocked)"
                                  : "var(--st-done)",
                              }}
                            />
                          </div>
                        </div>
                      ))}

                      {lignes.map((ligne) => (
                        <Ligne key={ligne.agent.id} ligne={ligne} colonnes={colonnes} />
                      ))}
                    </div>
                  </div>

                  <div className="mx-foot">
                    {t("competences.pied", { agents: lignes.length, n: colonnes.length })}
                  </div>

                  <div className="panel" style={{ marginTop: "12px" }}>
                    <div
                      className="panel-body"
                      style={{
                        display: "flex",
                        gap: "24px",
                        flexWrap: "wrap",
                        alignItems: "center",
                      }}
                    >
                      <div className="cat-legend">
                        {CATEGORIES_COMPETENCE.map((c) => (
                          <span className="cat-l" key={c.code}>
                            <span
                              className="cat-sw"
                              style={{ background: jetonDe(c.code) }}
                              aria-hidden="true"
                            />
                            <span>{libelle(c.code, CATEGORIES_COMPETENCE)}</span>
                          </span>
                        ))}
                      </div>
                      <div className="split-legend" style={{ margin: 0 }}>
                        {NIVEAUX_COMPETENCE.map((n) => (
                          <span className="sl" key={n.code}>
                            <span className={`lvl lvl-${RANG[n.code] ?? 1}`} aria-hidden="true">
                              {abreger(libelle(n.code, NIVEAUX_COMPETENCE))}
                            </span>
                            <span>{libelle(n.code, NIVEAUX_COMPETENCE)}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </>
          ) : null}

          {vue === "parUtilisateur" ? (
            <ParUtilisateur lignes={lignes} colonnes={colonnes} />
          ) : null}
          {vue === "referentiel" ? (
            <Referentiel
              categorie={categorie}
              recherche={recherche}
              niveau={niveau}
              tri={triReferentiel}
            />
          ) : null}
        </>
      ) : null}

      <FenetreCreation ouverte={creationOuverte} surFermeture={() => setCreationOuverte(false)} />

      {importOuvert ? (
        <FenetreImport
          type="competences"
          titre={tImports("titreCompetences")}
          colonnes={["name", "category", "description", "requiredCount"]}
          surExecuter={async (contenu) => {
            const rendu = await apiImports.importerCompetences(contenu);
            await client.invalidateQueries({ queryKey: ["competences"] });
            return rendu;
          }}
          surFermer={() => setImportOuvert(false)}
        />
      ) : null}
    </>
  );
}

/**
 * `EX-CMP-08` — l'export de la matrice.
 *
 * **Pourquoi un bouton et non un lien, contrairement aux autres exports du
 * produit.** `GET /competences/export` porte le nom d'un export et n'en sert
 * pas un : pas de `Content-Type: text/csv`, pas de `Content-Disposition`,
 * juste un JSON `{ csv }`. Un `<a href download>` téléchargerait donc
 * `{"csv":"Agent;Cartographie SIG;…"}` — un fichier qu'aucun tableur n'ouvre.
 * On demande la charge, on fabrique le fichier.
 *
 * Le brief de la vue 22 nomme d'ailleurs l'état de retour : « Export CSV
 * téléchargé ». Un lien n'en produit aucun ; un bouton, si.
 */
function ExportMatrice() {
  const { t } = useTranslation("referentiels");
  const { t: tErreurs } = useTranslation("erreurs");
  const annoncer = useMessages();

  const exporter = useMutation({
    mutationFn: api.exporterMatrice,
    onSuccess: ({ csv }) => {
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const lien = document.createElement("a");
      lien.href = url;
      lien.download = "competences-matrice.csv";
      lien.click();
      URL.revokeObjectURL(url);
      annoncer("ok", t("competences.exportFait"));
    },
    onError: (e) => annoncer("err", messageErreur(e, tErreurs, t("competences.exportEchec"))),
  });

  return (
    <Button
      className="chip-btn"
      isPending={exporter.isPending}
      onPress={() => exporter.mutate()}
    >
      {t("competences.exportCsv")}
    </Button>
  );
}

/** `is-full`, `is-part` ou `is-gap` — et `is-gap` en plus dès qu'il manque du monde. */
function classeCouverture(c: api.ColonneMatrice): string {
  if (!c.ecart) return "is-full";
  return c.detenteurs > 0 ? "is-part is-gap" : "is-gap";
}

function Ligne({
  ligne,
  colonnes,
}: {
  ligne: api.LigneMatrice;
  colonnes: api.ColonneMatrice[];
}) {
  const { t } = useTranslation("referentiels");
  const { t: tErreurs } = useTranslation("erreurs");
  const libelle = useLibelle();
  const peut = usePeut();
  const annoncer = useMessages();
  const client = useQueryClient();

  const modifiable = peut("skills:manage_matrix");
  const detenues = ligne.niveaux.filter(Boolean).length;

  const definir = useMutation({
    mutationFn: ({ skillId, niveau }: { skillId: string; niveau: string }) =>
      niveau === ""
        ? api.retirerCompetence(ligne.agent.id, skillId)
        : api.definirNiveau(ligne.agent.id, skillId, niveau),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["competences"] }),
    onError: (e) => annoncer("err", messageErreur(e, tErreurs, t("competences.echecNiveau"))),
  });

  /**
   * Le cycle : rien → débutant → … → maître → rien.
   *
   * Un clic parcourt les niveaux plutôt que d'ouvrir une fenêtre : sur une
   * matrice de 2000 cellules, une fenêtre par saisie rendrait le remplissage
   * impraticable. Le cycle est annoncé par le libellé du bouton.
   */
  const suivant = (actuel: string | null): string => {
    const codes: string[] = NIVEAUX_COMPETENCE.map((n) => n.code);
    if (actuel === null) return codes[0]!;
    const i = codes.indexOf(actuel);
    // Le dernier niveau ramène à l'absence : le cycle se referme, sinon une
    // cellule remplie par erreur ne pourrait plus être vidée d'un clic.
    return i === codes.length - 1 ? "" : codes[i + 1]!;
  };

  return (
    <>
      <div className="mx-name">
        <AvatarAgent prenom={ligne.agent.prenom} nom={ligne.agent.nom} />
        <span className="mx-nm">
          {ligne.agent.prenom} {ligne.agent.nom}
        </span>
        <span className="mx-cnt">{detenues}</span>
      </div>
      {colonnes.map((c, i) => {
        const niveau = ligne.niveaux[i] ?? null;
        const nomComplet = `${ligne.agent.prenom} ${ligne.agent.nom}`;
        return (
          <Button
            key={c.id}
            className="mx-cell"
            isDisabled={!modifiable}
            aria-label={
              niveau
                ? t("competences.celluleNiveau", {
                    qui: nomComplet,
                    competence: c.nom,
                    niveau: libelle(niveau, NIVEAUX_COMPETENCE),
                  })
                : t("competences.celluleVide", { qui: nomComplet, competence: c.nom })
            }
            onPress={() => definir.mutate({ skillId: c.id, niveau: suivant(niveau) })}
          >
            {niveau ? (
              <span className={`lvl lvl-${RANG[niveau] ?? 1}`}>
                {abreger(libelle(niveau, NIVEAUX_COMPETENCE))}
              </span>
            ) : (
              <span className="mx-add" aria-hidden="true">
                +
              </span>
            )}
          </Button>
        );
      })}
    </>
  );
}

/**
 * La vue par utilisateur — la troisième présentation du brief.
 *
 * Ce n'est pas une redondance de la matrice : la matrice répond à « où
 * manque-t-il du monde ? », celle-ci à « que sait faire cette personne ? ».
 * Elle est aussi la forme **lisible sans grille figée** — sur un écran étroit
 * ou à la lecture d'écran, une liste de chips se parcourt là où une matrice de
 * 2000 cellules ne se parcourt pas.
 */
function ParUtilisateur({
  lignes,
  colonnes,
}: {
  lignes: api.LigneMatrice[];
  colonnes: api.ColonneMatrice[];
}) {
  const { t } = useTranslation("referentiels");
  const { t: tErreurs } = useTranslation("erreurs");
  const libelle = useLibelle();
  const peut = usePeut();
  const annoncer = useMessages();
  const client = useQueryClient();

  const modifiable = peut("skills:manage_matrix");

  const retrait = useMutation({
    mutationFn: ({ userId, skillId }: { userId: string; skillId: string }) =>
      api.retirerCompetence(userId, skillId),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["competences"] }),
    onError: (e) => annoncer("err", messageErreur(e, tErreurs, t("competences.echecNiveau"))),
  });

  const ajout = useMutation({
    mutationFn: ({ userId, skillId }: { userId: string; skillId: string }) =>
      api.definirNiveau(userId, skillId, NIVEAUX_COMPETENCE[0].code),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["competences"] }),
    onError: (e) => annoncer("err", messageErreur(e, tErreurs, t("competences.echecNiveau"))),
  });

  if (lignes.length === 0) {
    return (
      <section className="panel">
        <div className="empty">
          <p>{t("competences.videTitre")}</p>
          <small>{t("competences.videExplication")}</small>
        </div>
      </section>
    );
  }

  return (
    <section className="panel">
      <div>
        {lignes.map((ligne) => {
          const detenues = ligne.niveaux
            .map((niveau, i) => ({ niveau, competence: colonnes[i]! }))
            .filter((x) => x.niveau !== null);
          const libres = colonnes.filter((_, i) => ligne.niveaux[i] == null);

          return (
            <div className="sk-user" key={ligne.agent.id}>
              <div className="sk-head">
                <AvatarAgent prenom={ligne.agent.prenom} nom={ligne.agent.nom} />
                <div>
                  <span className="mname">
                    {ligne.agent.prenom} {ligne.agent.nom}
                  </span>
                </div>
                <span className="kcol-n">
                  {t("competences.competencesCompte", { n: detenues.length })}
                </span>
                {modifiable ? (
                  <Button
                    className="chip-btn"
                    style={{ marginLeft: "auto" }}
                    onPress={() => {
                      const libre = libres[0];
                      if (!libre) {
                        annoncer("warn", t("competences.toutesAssignees"));
                        return;
                      }
                      ajout.mutate({ userId: ligne.agent.id, skillId: libre.id });
                    }}
                  >
                    {t("competences.ajouterDes")}
                  </Button>
                ) : null}
              </div>

              <div className="sk-chips">
                {detenues.length === 0 ? (
                  <span className="raci-none">{t("competences.aucuneAssignee")}</span>
                ) : (
                  detenues.map(({ niveau, competence }) => (
                    <span className="sk-chip" key={competence.id}>
                      <span>{competence.nom}</span>
                      <span className={`lvl lvl-${RANG[niveau!] ?? 1}`}>
                        {abreger(libelle(niveau!, NIVEAUX_COMPETENCE))}
                      </span>
                      {modifiable ? (
                        <Button
                          onPress={() =>
                            retrait.mutate({ userId: ligne.agent.id, skillId: competence.id })
                          }
                          aria-label={t("competences.retirerA", {
                            competence: competence.nom,
                            qui: `${ligne.agent.prenom} ${ligne.agent.nom}`,
                          })}
                        >
                          <span aria-hidden="true">×</span>
                        </Button>
                      ) : null}
                    </span>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Referentiel({
  categorie,
  recherche,
  niveau,
  tri,
}: {
  categorie: string;
  recherche: string;
  /** `EX-CMP-07` — filtre et tri passés au serveur, jamais appliqués ici. */
  niveau: string;
  tri: TriReferentiel;
}) {
  const { t } = useTranslation("referentiels");
  const { t: tErreurs } = useTranslation("erreurs");
  const libelle = useLibelle();
  const peut = usePeut();
  const annoncer = useMessages();
  const client = useQueryClient();

  /** `EX-CMP-10` — la compétence dont on regarde les détenteurs, ou aucune. */
  const [detenteursDe, setDetenteursDe] = useState<api.Competence | null>(null);

  const requete = useQuery({
    queryKey: ["competences", "referentiel", { categorie, recherche, niveau, tri }],
    queryFn: () => api.referentiel({ categorie, recherche, niveau, tri }),
  });

  const suppression = useMutation({
    mutationFn: (id: string) => api.supprimerCompetence(id),
    onSuccess: () => {
      annoncer("ok", t("competences.supprimee"));
      void client.invalidateQueries({ queryKey: ["competences"] });
    },
    onError: (e) => annoncer("err", messageErreur(e, tErreurs, t("competences.echecSuppression"))),
  });

  if (requete.isPending) return <Chargement quoi={t("competences.leReferentiel")} />;
  if (requete.isError)
    return <ErreurDeChargement erreur={requete.error} surReessai={() => void requete.refetch()} />;

  if (requete.data.length === 0) {
    return (
      <section className="panel">
        <div className="empty">
          <p>{t("competences.referentielVide")}</p>
          <small>{t("competences.referentielVideExplication")}</small>
        </div>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="rf-grid rf-head">
        <span>{t("competences.colNom")}</span>
        <span>{t("competences.colCategorie")}</span>
        <span>{t("competences.colDescription")}</span>
        <span>{t("competences.colRessources")}</span>
        <span>{t("competences.colCouverture")}</span>
      </div>
      <div>
        {requete.data.map((c) => (
          <div className="rf-grid rf-row" key={c.id}>
            <div style={{ minWidth: 0 }}>
              <p className="rf-n" style={{ margin: 0 }}>
                {c.nom}
              </p>
            </div>
            <div>
              <span className="pill" style={{ color: jetonDe(c.categorie) }}>
                {libelle(c.categorie, CATEGORIES_COMPETENCE)}
              </span>
            </div>
            <span className="rf-d">{c.description ?? t("competences.sansDescription")}</span>
            <div className="rf-req">
              <span>{t("competences.personnesRequises", { n: c.effectifRequis })}</span>
            </div>
            <div className="rf-req">
              <span
                className="pill"
                style={{
                  color:
                    c.manque === 0
                      ? "var(--st-done)"
                      : c.detenteurs > 0
                        ? "var(--st-review)"
                        : "var(--st-blocked)",
                }}
              >
                {c.manque === 0
                  ? t("competences.pillComplete", { ratio: `${c.detenteurs}/${c.effectifRequis}` })
                  : t("competences.pillPartielle", {
                      ratio: `${c.detenteurs}/${c.effectifRequis}`,
                    })}
              </span>
              {/*
                `EX-CMP-10` — « Rechercher les agents détenant une compétence
                donnée ». Le brief de la vue 22 n'en dit rien : ni écran, ni
                forme, ni état vide (consigné au rapport). La colonne
                « Actions » du référentiel est le seul endroit que le brief
                offre, et c'est le bon : la couverture y est déjà affichée en
                ratio — « Partielle 1/3 » —, et la question qu'on se pose
                devant ce ratio est précisément « lesquels ? ».

                `skills:read` et non un droit plus strict : c'est la
                permission que porte la route, et `RG-GEN-06` demande au
                client de refléter le serveur, pas de le durcir.
              */}
              {peut("skills:read") ? (
                <Button
                  className="ms-toggle"
                  onPress={() => setDetenteursDe(c)}
                  aria-label={t("competences.voirDetenteursDe", { nom: c.nom })}
                >
                  {t("competences.detenteurs")}
                </Button>
              ) : null}
              {peut("skills:delete") ? (
                <Button
                  className="ms-toggle"
                  onPress={() => {
                    if (c.detenteurs > 0) {
                      annoncer("err", t("competences.suppressionBloquee", { n: c.detenteurs }));
                      return;
                    }
                    suppression.mutate(c.id);
                  }}
                  aria-label={t("competences.supprimerLa", { nom: c.nom })}
                >
                  {t("supprimer")}
                </Button>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      <FenetreDetenteurs
        competence={detenteursDe}
        surFermeture={() => setDetenteursDe(null)}
      />
    </section>
  );
}

/**
 * `EX-CMP-10` — qui détient cette compétence, et à quel niveau.
 *
 * **Le filtre est un PLANCHER, et le libellé doit le dire.** Le serveur prend
 * `niveauMinimum` et rend tout ce qui est au-dessus : demander « Expert » rend
 * les experts *et* les maîtres. « Niveau : Expert » aurait menti sur la
 * réponse ; « Au moins Expert » la décrit.
 *
 * Le tri est refait ici. Le serveur ordonne par nom de famille — utile pour
 * retrouver quelqu'un, inutile pour la question posée : devant un écart de
 * couverture, on cherche d'abord les niveaux hauts. Les maîtres d'abord, puis
 * l'alphabet à niveau égal.
 */
function FenetreDetenteurs({
  competence,
  surFermeture,
}: {
  competence: api.Competence | null;
  surFermeture: () => void;
}) {
  const { t } = useTranslation("referentiels");
  const libelle = useLibelle();
  const [minimum, setMinimum] = useState("");

  const requete = useQuery({
    queryKey: ["competences", "detenteurs", competence?.id, minimum],
    // `minimum` vide n'est pas « niveau zéro » : c'est l'absence de filtre.
    // `params()` le laisserait tomber de toute façon ; on le dit ici aussi,
    // parce que c'est la chaîne qui porte l'information, pas sa conversion.
    queryFn: () => api.detenteurs(competence!.id, minimum === "" ? undefined : minimum),
    enabled: competence !== null,
  });

  /* Les maîtres d'abord ; à niveau égal, l'ordre alphabétique du serveur. */
  const classes = useMemo(
    () =>
      [...(requete.data ?? [])].sort(
        (a, b) =>
          (RANG[b.niveau] ?? 0) - (RANG[a.niveau] ?? 0) ||
          `${a.user.nom} ${a.user.prenom}`.localeCompare(`${b.user.nom} ${b.user.prenom}`),
      ),
    [requete.data],
  );

  return (
    <Fenetre
      ouverte={competence !== null}
      surFermeture={surFermeture}
      categorie={competence?.nom ?? ""}
      titre={t("competences.detenteursTitre")}
      actions={
        <Button className="btn btn-secondary" onPress={surFermeture}>
          {t("fermer")}
        </Button>
      }
    >
      {/*
        **Aucun ratio n'est réaffiché ici, et c'est délibéré.** Trois lectures
        du mot « détenteurs » coexistent au serveur et ne donnent pas le même
        nombre : `referentiel()` compte toutes les lignes de `user_skills`,
        `detenteurs()` écarte les comptes désactivés, `matrice()` applique en
        plus le périmètre. Recopier « 1/3 » au-dessus d'une liste de trois noms
        aurait produit une contradiction à l'écran, sans qu'aucune des deux
        moitiés soit fausse. La couverture est dite là où elle est calculée —
        la pastille « Partielle 1/3 » de la ligne, `RG-CMP-03` —, et cette
        fenêtre ne parle que de ce qu'elle a reçu.
      */}
      <div className="field-block">
        <label className="field-label" htmlFor="sk-min">
          {t("competences.niveauMinimum")}
        </label>
        <select
          className="field"
          id="sk-min"
          value={minimum}
          onChange={(e) => setMinimum(e.target.value)}
        >
          <option value="">{t("competences.tousNiveaux")}</option>
          {NIVEAUX_COMPETENCE.map((n) => (
            <option key={n.code} value={n.code}>
              {t("competences.auMoins", { niveau: libelle(n.code, NIVEAUX_COMPETENCE) })}
            </option>
          ))}
        </select>
        <p className="field-hint">{t("competences.niveauMinimumAide")}</p>
      </div>

      {requete.isPending ? <Chargement quoi={t("competences.lesDetenteurs")} /> : null}
      {requete.isError ? (
        <ErreurDeChargement erreur={requete.error} surReessai={() => void requete.refetch()} />
      ) : null}

      {requete.isSuccess && classes.length === 0 ? (
        <div className="empty">
          <p>{t("competences.detenteursVide")}</p>
          <small>
            {minimum === ""
              ? t("competences.detenteursVideAide")
              : t("competences.detenteursVideFiltre")}
          </small>
        </div>
      ) : null}

      {classes.length > 0 ? (
        <>
          <div className="sk-chips">
            {classes.map((d) => (
              <span className="sk-chip" key={d.userId}>
                <span>
                  {d.user.prenom} {d.user.nom}
                </span>
                <span className={`lvl lvl-${RANG[d.niveau] ?? 1}`}>
                  {abreger(libelle(d.niveau, NIVEAUX_COMPETENCE))}
                </span>
              </span>
            ))}
          </div>
          <p className="field-hint">
            {t("competences.detenteursCompte", { n: classes.length })}
          </p>
        </>
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
  const { t } = useTranslation("referentiels");
  const { t: tErreurs } = useTranslation("erreurs");
  const libelle = useLibelle();
  const annoncer = useMessages();
  const client = useQueryClient();

  const [nom, setNom] = useState("");
  const [categorie, setCategorie] = useState(CATEGORIES_COMPETENCE[0].code);
  const [description, setDescription] = useState("");
  const [effectif, setEffectif] = useState("1");
  const [erreur, setErreur] = useState<string | null>(null);

  const creation = useMutation({
    mutationFn: () =>
      api.creerCompetence({
        nom,
        categorie,
        ...(description ? { description } : {}),
        effectifRequis: Number(effectif),
      }),
    onSuccess: () => {
      annoncer("ok", t("competences.creee"));
      setNom("");
      setDescription("");
      surFermeture();
      void client.invalidateQueries({ queryKey: ["competences"] });
    },
    onError: (e) => setErreur(messageErreur(e, tErreurs, t("competences.echecCreation"))),
  });

  const valider = () => {
    setErreur(null);
    if (!nom.trim()) {
      setErreur(t("competences.nomRequis"));
      return;
    }
    creation.mutate();
  };

  return (
    <Fenetre
      ouverte={ouverte}
      surFermeture={surFermeture}
      categorie={t("competences.nouvelle")}
      titre={t("competences.creerTitre")}
      mention={t("champObligatoire")}
      actions={
        <>
          <Button className="btn btn-secondary" onPress={surFermeture}>
            {t("annuler")}
          </Button>
          <Button className="btn btn-primary" isPending={creation.isPending} onPress={valider}>
            {t("competences.creer")}
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

      <div className="field-block">
        <label className="field-label" htmlFor="sk-nom">
          {t("competences.colNom")} <span className="req">*</span>
        </label>
        <input
          className="field"
          id="sk-nom"
          type="text"
          value={nom}
          onChange={(e) => setNom(e.target.value)}
        />
      </div>

      <div className="field-block">
        <label className="field-label" htmlFor="sk-cat">
          {t("competences.colCategorie")}
        </label>
        <select
          className="field"
          id="sk-cat"
          value={categorie}
          onChange={(e) => setCategorie(e.target.value as typeof categorie)}
        >
          {CATEGORIES_COMPETENCE.map((c) => (
            <option key={c.code} value={c.code}>
              {libelle(c.code, CATEGORIES_COMPETENCE)}
            </option>
          ))}
        </select>
      </div>

      <div className="field-block">
        <label className="field-label" htmlFor="sk-desc">
          {t("competences.colDescription")}
        </label>
        <textarea
          className="field"
          id="sk-desc"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div className="field-block">
        <label className="field-label" htmlFor="sk-eff">
          {t("competences.colRessources")}
        </label>
        <input
          className="field"
          id="sk-eff"
          type="number"
          min={0}
          value={effectif}
          onChange={(e) => setEffectif(e.target.value)}
        />
        <p className="field-hint">{t("competences.effectifAide")}</p>
      </div>
    </Fenetre>
  );
}
