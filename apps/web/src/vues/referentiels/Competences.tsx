import { useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "react-aria-components";
import { CATEGORIES_COMPETENCE, NIVEAUX_COMPETENCE } from "@trame/contracts";
import * as api from "../../api/referentiels.js";
import { messageErreur } from "../../api/erreurs.js";
import { usePeut } from "../../session/session.js";
import { Chargement, ErreurDeChargement } from "../../composants/etats.js";
import { Fenetre } from "../../composants/fenetre.js";
import { useMessages } from "../../composants/messages.js";
import { useLibelle } from "../../composants/pastilles.js";
import "../../composants/partages.css";
import "../taches/liste.css";
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

type Vue = "matrice" | "parUtilisateur" | "referentiel";

const RANG: Record<string, number> = {
  beginner: 1,
  intermediate: 2,
  expert: 3,
  master: 4,
};

export function Competences() {
  const { t } = useTranslation("referentiels");
  const libelle = useLibelle();
  const peut = usePeut();
  const [vue, setVue] = useState<Vue>("matrice");
  const [categorie, setCategorie] = useState("");
  const [recherche, setRecherche] = useState("");
  const [creationOuverte, setCreationOuverte] = useState(false);

  return (
    <div className="page">
      <div className="pl-toolbar">
        <div>
          <span className="eyebrow">{t("competences.surtitre")}</span>
          <h1 className="h1 titre-vue">{t("competences.titre")}</h1>
          <p className="lede">{t("competences.chapeau")}</p>
        </div>
        {peut("skills:create") ? (
          <div className="pl-toolbar-fin">
            <Button className="btn btn-primary" onPress={() => setCreationOuverte(true)}>
              {t("competences.nouvelle")}
            </Button>
          </div>
        ) : null}
      </div>

      <div className="filters">
        <input
          className="f-input filtre-recherche"
          type="search"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder={t("competences.rechercher")}
          aria-label={t("competences.rechercher")}
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

        <div className="bascule-vue" role="group" aria-label={t("competences.affichage")}>
          <Button className="tab" aria-selected={vue === "matrice"} onPress={() => setVue("matrice")}>
            {t("competences.vueMatrice")}
          </Button>
          <Button
            className="tab"
            aria-selected={vue === "parUtilisateur"}
            onPress={() => setVue("parUtilisateur")}
          >
            {t("competences.vueParUtilisateur")}
          </Button>
          <Button
            className="tab"
            aria-selected={vue === "referentiel"}
            onPress={() => setVue("referentiel")}
          >
            {t("competences.vueReferentiel")}
          </Button>
        </div>
      </div>

      {vue === "matrice" ? <Matrice categorie={categorie} recherche={recherche} /> : null}
      {vue === "parUtilisateur" ? (
        <ParUtilisateur categorie={categorie} recherche={recherche} />
      ) : null}
      {vue === "referentiel" ? (
        <Referentiel categorie={categorie} recherche={recherche} />
      ) : null}

      <FenetreCreation ouverte={creationOuverte} surFermeture={() => setCreationOuverte(false)} />
    </div>
  );
}

function Matrice({ categorie, recherche }: { categorie: string; recherche: string }) {
  const { t } = useTranslation("referentiels");
  const libelle = useLibelle();
  const requete = useQuery({
    queryKey: ["competences", "matrice", categorie],
    queryFn: () => api.matrice({ categorie }),
  });

  if (requete.isPending) return <Chargement quoi={t("competences.laMatrice")} />;
  if (requete.isError)
    return <ErreurDeChargement erreur={requete.error} surReessai={() => void requete.refetch()} />;

  const { colonnes, synthese } = requete.data;
  const lignes = recherche
    ? requete.data.lignes.filter((l) =>
        `${l.agent.prenom} ${l.agent.nom}`.toLowerCase().includes(recherche.toLowerCase()),
      )
    : requete.data.lignes;

  if (colonnes.length === 0) {
    return (
      <div className="empty empty-large">
        <p>{t("competences.videTitre")}</p>
        <small>{t("competences.videExplication")}</small>
      </div>
    );
  }

  const manquantes = colonnes.filter((c) => c.ecart);

  return (
    <>
      <div className="kpi-grid">
        <div className="kpi">
          <span className="eyebrow">{t("competences.couvertureMoyenne")}</span>
          <p className="kpi-val">{synthese.couvertureMoyenne} %</p>
        </div>
        <div className={`kpi${synthese.avecEcart > 0 ? " is-alert" : ""}`}>
          <span className="eyebrow">{t("competences.ecarts")}</span>
          <p className="kpi-val">{synthese.avecEcart}</p>
          <span className="kpi-sub">{t("competences.aRenforcer", { n: synthese.avecEcart })}</span>
        </div>
      </div>

      {/* L'information qu'on vient chercher, en tête et nommée. */}
      {manquantes.length > 0 ? (
        <div className="alert alert-warn" role="status">
          <span className="alert-icon" aria-hidden="true">
            ⚠
          </span>
          <span>
            {t("competences.bandeauEcarts")} —{" "}
            {manquantes
              .slice(0, 4)
              .map((c) => `${c.nom} (${c.ratio})`)
              .join(", ")}
            {manquantes.length > 4
              ? ` ${t("competences.etAutres", { n: manquantes.length - 4 })}`
              : ""}
          </span>
        </div>
      ) : null}

      <div className="mx-wrap">
        <div
          className="mx"
          style={{ "--cols": `216px repeat(${colonnes.length}, 36px)` } as CSSProperties}
        >
          <div className="mx-corner">
            <span className="eyebrow">{t("competences.collaborateur")}</span>
          </div>
          {colonnes.map((c) => (
            <div className={`mx-head${c.ecart ? " is-gap" : ""}`} key={c.id}>
              <span title={c.nom}>{c.nom}</span>
            </div>
          ))}

          <div className="mx-covlab">
            <span className="eyebrow">{t("competences.couverture")}</span>
          </div>
          {colonnes.map((c) => (
            <div
              className={`mx-cov${c.ecart ? " is-gap" : " is-full"}`}
              key={c.id}
              // Le ratio est lu en toutes lettres : la couleur ne dit rien à
              // qui ne la voit pas, et le manque est l'information centrale.
              aria-label={
                c.ecart
                  ? t("competences.ecartDe", { nom: c.nom, n: c.manque, ratio: c.ratio })
                  : t("competences.couvertureComplete", { nom: c.nom, ratio: c.ratio })
              }
            >
              <span className="mx-cov-n">{c.ratio}</span>
              <span className="mx-cov-bar" aria-hidden="true">
                <i
                  className={c.ecart ? "mx-cov-part" : "mx-cov-plein"}
                  style={{
                    width: `${Math.min(100, (c.detenteurs / Math.max(1, c.effectifRequis)) * 100)}%`,
                  }}
                />
              </span>
            </div>
          ))}

          {lignes.map((ligne) => (
            <Ligne key={ligne.agent.id} ligne={ligne} colonnes={colonnes} />
          ))}
        </div>

        <div className="mx-foot">
          <span>{t("competences.pied", { agents: lignes.length, n: colonnes.length })}</span>
          <span className="cat-legend">
            {NIVEAUX_COMPETENCE.map((n) => (
              <span className="cat-l" key={n.code}>
                <span className={`lvl lvl-${RANG[n.code] ?? 1}`} aria-hidden="true">
                  {libelle(n.code, NIVEAUX_COMPETENCE).slice(0, 3)}
                </span>
                {libelle(n.code, NIVEAUX_COMPETENCE)}
              </span>
            ))}
          </span>
        </div>
      </div>
    </>
  );
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
                {libelle(niveau, NIVEAUX_COMPETENCE).slice(0, 3)}
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
function ParUtilisateur({ categorie, recherche }: { categorie: string; recherche: string }) {
  const { t } = useTranslation("referentiels");
  const { t: tErreurs } = useTranslation("erreurs");
  const libelle = useLibelle();
  const peut = usePeut();
  const annoncer = useMessages();
  const client = useQueryClient();

  const requete = useQuery({
    queryKey: ["competences", "matrice", categorie],
    queryFn: () => api.matrice({ categorie }),
  });

  const retrait = useMutation({
    mutationFn: ({ userId, skillId }: { userId: string; skillId: string }) =>
      api.retirerCompetence(userId, skillId),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["competences"] }),
    onError: (e) => annoncer("err", messageErreur(e, tErreurs, t("competences.echecNiveau"))),
  });

  if (requete.isPending) return <Chargement quoi={t("competences.laMatrice")} />;
  if (requete.isError)
    return <ErreurDeChargement erreur={requete.error} surReessai={() => void requete.refetch()} />;

  const { colonnes } = requete.data;
  const lignes = recherche
    ? requete.data.lignes.filter((l) =>
        `${l.agent.prenom} ${l.agent.nom}`.toLowerCase().includes(recherche.toLowerCase()),
      )
    : requete.data.lignes;

  if (lignes.length === 0) {
    return (
      <div className="empty empty-large">
        <p>{t("competences.videTitre")}</p>
        <small>{t("competences.videExplication")}</small>
      </div>
    );
  }

  return (
    <div className="tlist">
      {lignes.map((ligne) => {
        const detenues = ligne.niveaux
          .map((niveau, i) => ({ niveau, competence: colonnes[i]! }))
          .filter((x) => x.niveau !== null);

        return (
          <div className="sk-user" key={ligne.agent.id}>
            <div className="sk-head">
              <span className="lv-wn">
                {ligne.agent.prenom} {ligne.agent.nom}
              </span>
              <span className="kcol-n">
                {t("competences.competencesCompte", { n: detenues.length })}
              </span>
            </div>

            {detenues.length === 0 ? (
              <p className="dep-none">{t("competences.aucuneAssignee")}</p>
            ) : (
              <div className="sk-chips">
                {detenues.map(({ niveau, competence }) => (
                  <span className="sk-chip" key={competence.id}>
                    <span>{competence.nom}</span>
                    <span className={`lvl lvl-${RANG[niveau!] ?? 1}`}>
                      {libelle(niveau!, NIVEAUX_COMPETENCE).slice(0, 3)}
                    </span>
                    {peut("skills:manage_matrix") ? (
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
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Referentiel({ categorie, recherche }: { categorie: string; recherche: string }) {
  const { t } = useTranslation("referentiels");
  const { t: tErreurs } = useTranslation("erreurs");
  const libelle = useLibelle();
  const peut = usePeut();
  const annoncer = useMessages();
  const client = useQueryClient();

  const requete = useQuery({
    queryKey: ["competences", "referentiel", categorie, recherche],
    queryFn: () => api.referentiel({ categorie, recherche }),
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
      <div className="empty empty-large">
        <p>{t("competences.referentielVide")}</p>
        <small>{t("competences.referentielVideExplication")}</small>
      </div>
    );
  }

  return (
    <div className="tlist">
      <div className="rf-grid rf-head" aria-hidden="true">
        <span>{t("competences.colNom")}</span>
        <span>{t("competences.colCategorie")}</span>
        <span>{t("competences.colDescription")}</span>
        <span>{t("competences.colRessources")}</span>
        <span>{t("competences.colActions")}</span>
      </div>
      {requete.data.map((c) => (
        <div className="rf-grid rf-row" key={c.id}>
          <span className="rf-n">{c.nom}</span>
          <span className="rf-d">{libelle(c.categorie, CATEGORIES_COMPETENCE)}</span>
          <span className="rf-d">{c.description ?? t("competences.sansDescription")}</span>
          <span className="rf-req">
            <span className={c.manque > 0 ? "rf-manque" : ""}>
              {c.detenteurs}/{c.effectifRequis}
            </span>
            {c.manque > 0 ? (
              <span className="badge badge-late">{t("competences.manque", { n: c.manque })}</span>
            ) : null}
          </span>
          <span className="lv-acts">
            {peut("skills:delete") ? (
              <Button
                className="chip-btn"
                onPress={() => suppression.mutate(c.id)}
                aria-label={t("competences.supprimerLa", { nom: c.nom })}
              >
                {t("supprimer")}
              </Button>
            ) : null}
          </span>
        </div>
      ))}
    </div>
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
