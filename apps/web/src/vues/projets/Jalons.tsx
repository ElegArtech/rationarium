import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { adresseExportJalons } from "../../api/imports.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "react-aria-components";
import { STATUTS_JALON, STATUTS_TACHE } from "@trame/contracts";
import * as api from "../../api/projets.js";
import { messageErreur } from "../../api/erreurs.js";
import { usePeut } from "../../session/session.js";
import { Chargement, ErreurDeChargement } from "../../composants/etats.js";
import { Fenetre } from "../../composants/fenetre.js";
import { useMessages } from "../../composants/messages.js";
import { Pastille, Barre, MarqueurCalcule } from "../../composants/pastilles.js";
import { formaterDate, joursAvant } from "../../formats.js";
import { FenetreCreationTache } from "../taches/FenetreCreationTache.js";
import { CadreProjet } from "./Fiche.js";
import "../../composants/partages.css";
import "./fiche.css";
import "./jalons.css";

/**
 * Vue 13 — Projet, onglet Jalons (feuille de route).
 *
 * **Le statut d'un jalon est calculé, jamais saisi.** Le brief le dit
 * contre-intuitif et exige que l'encart explicatif soit « visible, pas relégué
 * en aide contextuelle » : il est donc **dans le flux** de la fenêtre de
 * création, avec les trois règles écrites. Un utilisateur qui cherche le champ
 * « statut » doit trouver la raison de son absence là où il le cherche.
 *
 * **Les tâches sans jalon existent et sont montrées**, dans un bloc à part,
 * hors chronologie. Les taire ferait croire que le projet n'a que ce que la
 * feuille de route affiche.
 */
/**
 * La pile d'avatars d'une ligne de tâche — `avs`, maquette 13.
 *
 * Trois visages au plus, puis un compte. Au-delà, la pile cesse d'informer et
 * commence à occuper : « +4 » se lit, quatre pastilles de 18 px ne se lisent
 * pas.
 */
function Assignes({ tache }: { tache: api.TacheDeJalon }) {
  const { t } = useTranslation("projets");
  if (tache.assignes.length === 0) {
    return <span className="tk-sub is-none">{t("jalons.sansAssigne")}</span>;
  }
  const montres = tache.assignes.slice(0, 3);
  // Le libellé est calculé AVANT le rendu : le contrôle i18n lit les appels à
  // `t` par expression régulière et ne suit pas une fonction imbriquée à deux
  // niveaux de parenthèses. Une clé qu'il ne voit pas est déclarée orpheline.
  const gens = tache.assignes.map((a) => `${a.user.prenom} ${a.user.nom}`).join(", ");
  const libelle = t("jalons.assignesDe", { nom: tache.titre, gens });
  /*
   * `role="img"` n'est pas un ornement : `aria-label` est INTERDIT sur un
   * élément générique — `axe` le refuse en « serious » (aria-prohibited-attr).
   * La pile d'avatars est bien une image au sens ARIA : trois initiales qui ne
   * se lisent pas une par une, et dont le sens tient dans le libellé.
   */
  return (
    <span className="avs" role="img" aria-label={libelle}>
      {montres.map((a) => (
        <span className="agent-av" key={a.user.id} aria-hidden="true">
          {`${a.user.prenom[0] ?? ""}${a.user.nom[0] ?? ""}`.toUpperCase()}
        </span>
      ))}
      {tache.assignes.length > montres.length ? (
        <span className="avs-more" aria-hidden="true">
          +{tache.assignes.length - montres.length}
        </span>
      ) : null}
    </span>
  );
}

/** La charge estimée, ou un tiret cadratin : l'absence se lit aussi. */
function Charge({ tache }: { tache: api.TacheDeJalon }) {
  const { t } = useTranslation("projets");
  const h = tache.estimationHeures;
  return (
    <span className="tk-est">
      {h === null || h === undefined ? "—" : t("jalons.heures", { n: Number(h) })}
    </span>
  );
}

export function Jalons({ projetId }: { projetId: string }) {
  const { t } = useTranslation("projets");
  const { t: tImports } = useTranslation("imports");
  const peut = usePeut();
  const [creationOuverte, setCreationOuverte] = useState(false);
  const [tacheOuverte, setTacheOuverte] = useState(false);
  /*
   * Dépliés d'emblée, ceux qui portent des tâches.
   *
   * La maquette ouvre deux de ses six jalons — ceux qui ont du contenu. Tout
   * replier fait arriver sur une frise de titres qui n'apprend rien ; tout
   * déplier noie la chronologie sous les lignes. Le critère est donc celui de
   * la maquette : on ouvre ce qu'il y a à lire.
   *
   * `null` tant que la feuille n'est pas chargée : l'état initial se calcule
   * depuis les données, il ne peut pas les précéder.
   */
  const [deplies, setDeplies] = useState<ReadonlySet<string> | null>(null);
  // Replié par défaut, comme la maquette : le bloc signale, il n'encombre pas.
  const [orphelinesOuvertes, setOrphelinesOuvertes] = useState(false);

  const projet = useQuery({ queryKey: ["projet", projetId], queryFn: () => api.fiche(projetId) });
  const route = useQuery({
    queryKey: ["projet", projetId, "route"],
    queryFn: () => api.feuilleDeRoute(projetId),
  });

  if (projet.isPending || route.isPending) return <Chargement quoi={t("jalons.laFeuille")} />;
  if (projet.isError)
    return <ErreurDeChargement erreur={projet.error} surReessai={() => void projet.refetch()} />;
  if (route.isError)
    return <ErreurDeChargement erreur={route.error} surReessai={() => void route.refetch()} />;

  const { jalons, indicateurs } = route.data;
  const ouverts = deplies ?? new Set(jalons.filter((j) => j.taches.length > 0).map((j) => j.id));
  // Repli sur une liste vide : un serveur antérieur à `RG-JAL-05` ne rend pas
  // ce champ, et une page blanche est le pire des modes de défaillance — bien
  // pire que le bloc manquant qu'elle remplacerait.
  const sansJalon = route.data.sansJalon ?? [];
  const sansDate = jalons.filter((j) => !j.dateEcheance).length;
  const enRetard = jalons.filter(
    (j) => j.statut !== "done" && (joursAvant(j.dateEcheance) ?? 1) < 0,
  ).length;

  // La première bascule fige l'état initial calculé : à partir de là, c'est
  // le choix de l'utilisateur qui commande, jamais le contenu.
  const basculer = (id: string, actuels: ReadonlySet<string>) =>
    setDeplies(() => {
      const n = new Set(actuels);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <CadreProjet projet={projet.data} onglet="jalons">
      <div className="pl-toolbar">
        <div>
          <h2 className="panel-title sous-titre-vue">{t("jalons.titre")}</h2>
          <p className="lede">{t("jalons.chapeau")}</p>
        </div>
        <div className="ligne-actions-fin">
          {/* La réversibilité : le CSV exporté se réimporte tel quel. */}
          {peut("tasks:export") ? (
            <a className="chip-btn" href={adresseExportJalons(projetId)} download>
              {tImports("exporterJalons")}
            </a>
          ) : null}
          {/* `cadrage/02`, vue 13 — la barre d'actions porte « + Nouveau jalon,
              + Nouvelle tâche, Importer CSV ». La création de tâche emploie la
              fenêtre des vues 12 et 16, projet imposé : trois formulaires de
              création divergeraient à la première correction. */}
          {peut("tasks:create") ? (
            <Button className="chip-btn" onPress={() => setTacheOuverte(true)}>
              {t("jalons.nouvelleTache")}
            </Button>
          ) : null}
          {peut("milestones:create") ? (
            <Button className="btn btn-primary" onPress={() => setCreationOuverte(true)}>
              {t("jalons.nouveau")}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi">
          <span className="eyebrow">{t("onglets.jalons")}</span>
          <p className="kpi-val">{indicateurs.total}</p>
          <span className="kpi-sub">{t("jalons.dontSansDate", { n: sansDate })}</span>
        </div>
        <div className="kpi">
          <div className="kpi-head">
            <span className="eyebrow">{t("jalons.termines")}</span>
            <MarqueurCalcule explication={t("jalons.regleDone")} />
          </div>
          <p className="kpi-val">{indicateurs.termines}</p>
          <span className="kpi-sub">{t("jalons.surTotal", { total: indicateurs.total })}</span>
        </div>
        <div className="kpi">
          <div className="kpi-head">
            <span className="eyebrow">{t("jalons.enCours")}</span>
            <MarqueurCalcule explication={t("jalons.regleDoing")} />
          </div>
          <p className="kpi-val">{indicateurs.enCours}</p>
          <span className="kpi-sub">{t("jalons.dontEnRetard", { n: enRetard })}</span>
        </div>
        <div className="kpi">
          <span className="eyebrow">{t("onglets.taches")}</span>
          <p className="kpi-val">{indicateurs.taches}</p>
          <span className="kpi-sub">
            {t("jalons.dontSansJalon", { n: projet.data.taches.total - indicateurs.taches })}
          </span>
        </div>
      </div>

      {jalons.length > 0 ? (
        <div className="tl">
          {jalons.map((j) => (
            <LigneJalon
              key={j.id}
              projetId={projetId}
              jalon={j}
              deplie={ouverts.has(j.id)}
              surBascule={() => basculer(j.id, ouverts)}
            />
          ))}
        </div>
      ) : (
        <div className="empty empty-encadre">
          <p>{t("jalons.videTitre")}</p>
          <small>{t("jalons.videExplication")}</small>
          {peut("milestones:create") ? (
            <Button className="btn btn-primary" onPress={() => setCreationOuverte(true)}>
              {t("jalons.creerPremier")}
            </Button>
          ) : null}
        </div>
      )}

      {/*
        `RG-JAL-05` — les tâches détachées d'un jalon supprimé existent encore,
        et elles ne figuraient nulle part. La maquette leur réserve ce bloc,
        **hors de la chronologie** : une tâche rattachée à rien n'a pas de
        place sur une frise, mais elle a une place à l'écran. C'est même celle
        qu'on oublie le plus sûrement.
      */}
      {sansJalon.length > 0 ? (
        <div className="orphan">
          <div className="orphan-head">
            <span className="panel-title">{t("jalons.sansJalonTitre")}</span>
            <span className="kcol-n">{sansJalon.length}</span>
            <Button
              className="ms-toggle"
              style={{ marginLeft: "auto" }}
              aria-expanded={orphelinesOuvertes}
              onPress={() => setOrphelinesOuvertes((o) => !o)}
            >
              {t(orphelinesOuvertes ? "jalons.masquer" : "jalons.afficher")}
            </Button>
          </div>
          {orphelinesOuvertes ? (
            <div className="ms-tasks">
              {sansJalon.map((tache) => (
                <div className="tk" key={tache.id}>
                  <div className="bloc-etroit">
                    <span className="tk-name">{tache.titre}</span>
                    <span className="tk-sub">
                      {tache.dateFin ? formaterDate(tache.dateFin) : t("jalons.sansDate")}
                    </span>
                  </div>
                  <Pastille code={tache.statut} vocabulaire={STATUTS_TACHE} />
                  <Assignes tache={tache} />
                  <Charge tache={tache} />
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <FenetreCreationTache
        ouverte={tacheOuverte}
        surFermeture={() => setTacheOuverte(false)}
        projets={[]}
        projetImpose={projetId}
      />

      <FenetreJalon
        projetId={projetId}
        ouverte={creationOuverte}
        surFermeture={() => setCreationOuverte(false)}
      />
    </CadreProjet>
  );
}

function LigneJalon({
  projetId,
  jalon,
  deplie,
  surBascule,
}: {
  projetId: string;
  jalon: api.Jalon;
  deplie: boolean;
  surBascule: () => void;
}) {
  const { t } = useTranslation("projets");
  const { t: tErreurs } = useTranslation("erreurs");
  const peut = usePeut();
  const annoncer = useMessages();
  const client = useQueryClient();
  const [suppressionOuverte, setSuppressionOuverte] = useState(false);

  const retard = jalon.statut === "done" ? 0 : Math.min(0, joursAvant(jalon.dateEcheance) ?? 1);
  const enRetard = retard < 0;
  const progression =
    jalon.taches.length === 0
      ? 0
      : Math.round(jalon.taches.reduce((n, x) => n + x.avancement, 0) / jalon.taches.length);

  const suppression = useMutation({
    mutationFn: () => api.supprimerJalon(jalon.id),
    onSuccess: () => {
      annoncer("ok", t("jalons.supprime"));
      setSuppressionOuverte(false);
      void client.invalidateQueries({ queryKey: ["projet", projetId] });
    },
    onError: (e) => annoncer("err", messageErreur(e, tErreurs, t("fiche.echecAction"))),
  });

  return (
    <div className="tli">
      <span
        className={`tl-dot${jalon.statut === "done" ? " is-done" : jalon.statut === "doing" ? " is-doing" : ""}${enRetard ? " is-late" : ""}`}
        aria-hidden="true"
      >
        {jalon.statut === "done" ? "✓" : ""}
      </span>

      <div className={`ms${enRetard ? " is-late" : ""}`}>
        <div className="ms-head">
          <div className="bloc-etroit">
            <p className="ms-name">{jalon.nom}</p>
            <span className={`ms-sub${jalon.dateEcheance ? "" : " is-none"}`}>
              {jalon.dateEcheance
                ? t("jalons.echeanceEtTaches", {
                    date: formaterDate(jalon.dateEcheance),
                    n: jalon.taches.length,
                  })
                : t("jalons.sansDateEtTaches", { n: jalon.taches.length })}
              {enRetard ? (
                <span className="ms-late"> {t("jalons.retardDe", { n: -retard })}</span>
              ) : null}
            </span>
          </div>

          <div className="ms-statut">
            <Pastille code={jalon.statut} vocabulaire={STATUTS_JALON} />
            <MarqueurCalcule explication={t("jalons.statutCalcul")} />
          </div>

          <div className="ms-prog">
            <Barre
              valeur={progression}
              termine={jalon.statut === "done"}
              libelle={t("jalons.avancementDe", { nom: jalon.nom })}
            />
            <span className="prow-pct">{progression} %</span>
          </div>

          <div className="ms-acts">
            <Button className="ms-toggle" onPress={surBascule} aria-expanded={deplie}>
              {deplie ? t("jalons.masquer") : t("jalons.afficher")}
            </Button>
            {peut("milestones:delete") ? (
              <Button
                className="ms-ico is-del"
                onPress={() => setSuppressionOuverte(true)}
                aria-label={t("jalons.supprimerLe", { nom: jalon.nom })}
              >
                <span aria-hidden="true">×</span>
              </Button>
            ) : null}
          </div>
        </div>

        {deplie ? (
          <div className="ms-tasks">
            {jalon.taches.length > 0 ? (
              jalon.taches.map((tache) => (
                <div className="tk" key={tache.id}>
                  <div className="bloc-etroit">
                    <span className="tk-name">{tache.titre}</span>
                    <span className="tk-sub">
                      {tache.dateFin ? formaterDate(tache.dateFin) : t("jalons.sansDate")}
                    </span>
                  </div>
                  <Pastille code={tache.statut} vocabulaire={STATUTS_TACHE} />
                  <Assignes tache={tache} />
                  <Charge tache={tache} />
                </div>
              ))
            ) : (
              <p className="ms-none">{t("jalons.aucuneTache")}</p>
            )}
          </div>
        ) : null}
      </div>

      <Fenetre
        ouverte={suppressionOuverte}
        surFermeture={() => setSuppressionOuverte(false)}
        categorie={t("confirmation")}
        titre={t("jalons.supprimerTitre")}
        // RG-JAL-05 — la suppression détache les tâches, elle ne les supprime pas.
        // Le dire dans le pied, à côté du bouton rouge, est ce qui lève l'inquiétude.
        mention={t("jalons.aucuneTacheSupprimee")}
        actions={
          <>
            <Button className="btn btn-secondary" onPress={() => setSuppressionOuverte(false)}>
              {t("annuler")}
            </Button>
            <Button
              className="btn btn-danger"
              isPending={suppression.isPending}
              onPress={() => suppression.mutate()}
            >
              {t("jalons.supprimerTitre")}
            </Button>
          </>
        }
      >
        <p className="phrase-confirmation">
          {t("jalons.confirmerSuppression")} <span className="quoted">« {jalon.nom} »</span> ?
        </p>
        <div className="alert alert-neutral">
          <span className="alert-icon" aria-hidden="true">
            →
          </span>
          <span>{t("jalons.effetSuppression", { n: jalon.taches.length })}</span>
        </div>
      </Fenetre>
    </div>
  );
}

/**
 * La fenêtre de jalon.
 *
 * L'encart « statut calculé » est **dans le flux**, pas en aide contextuelle :
 * exigence explicite du brief de la vue 13. Les trois règles y sont écrites,
 * chacune avec sa pastille de couleur — et le libellé porte le sens, la
 * couleur ne fait que le doubler.
 */
function FenetreJalon({
  projetId,
  ouverte,
  surFermeture,
}: {
  projetId: string;
  ouverte: boolean;
  surFermeture: () => void;
}) {
  const { t } = useTranslation("projets");
  const { t: tErreurs } = useTranslation("erreurs");
  const annoncer = useMessages();
  const client = useQueryClient();

  const [nom, setNom] = useState("");
  const [description, setDescription] = useState("");
  const [echeance, setEcheance] = useState("");
  const [nomManquant, setNomManquant] = useState(false);

  const creation = useMutation({
    mutationFn: () =>
      api.creerJalon(projetId, {
        nom,
        ...(description ? { description } : {}),
        ...(echeance ? { dateEcheance: echeance } : {}),
      }),
    onSuccess: () => {
      annoncer("ok", t("jalons.cree"));
      setNom("");
      setDescription("");
      setEcheance("");
      surFermeture();
      void client.invalidateQueries({ queryKey: ["projet", projetId] });
    },
    onError: (e) => annoncer("err", messageErreur(e, tErreurs, t("fiche.echecAction"))),
  });

  const valider = () => {
    const vide = !nom.trim();
    setNomManquant(vide);
    if (!vide) creation.mutate();
  };

  const regles = [
    { code: "pending", classe: "regle-pending" },
    { code: "doing", classe: "regle-doing" },
    { code: "done", classe: "regle-done" },
  ] as const;

  return (
    <Fenetre
      ouverte={ouverte}
      surFermeture={surFermeture}
      categorie={t("jalons.categorie")}
      titre={t("jalons.nouveauTitre")}
      mention={t("champObligatoire")}
      actions={
        <>
          <Button className="btn btn-secondary" onPress={surFermeture}>
            {t("annuler")}
          </Button>
          <Button className="btn btn-primary" isPending={creation.isPending} onPress={valider}>
            {t("enregistrer")}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          valider();
        }}
        noValidate
      >
        <div className="field-block">
          <label className="field-label" htmlFor="jl-nom">
            {t("portefeuille.nom")} <span className="req">*</span>
          </label>
          <input
            className="field"
            id="jl-nom"
            type="text"
            value={nom}
            aria-invalid={nomManquant}
            onChange={(e) => setNom(e.target.value)}
            placeholder={t("jalons.nomExemple")}
          />
          <p className={`field-error${nomManquant ? "" : " is-quiet"}`}>
            <span aria-hidden="true">↑</span>
            <span>{t("jalons.nomRequis")}</span>
          </p>
        </div>

        <div className="field-block">
          <label className="field-label" htmlFor="jl-desc">
            {t("portefeuille.description")}
          </label>
          <textarea
            className="field"
            id="jl-desc"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("jalons.descriptionExemple")}
          />
        </div>

        <div className="field-block">
          <label className="field-label" htmlFor="jl-date">
            {t("jalons.echeance")}
          </label>
          <input
            className="field"
            id="jl-date"
            type="date"
            value={echeance}
            onChange={(e) => setEcheance(e.target.value)}
          />
          <p className="field-hint">{t("jalons.echeanceFacultative")}</p>
        </div>

        <div className="explain">
          <span aria-hidden="true" className="explain-sigle">
            ∑
          </span>
          <div>
            <p className="explain-t">{t("jalons.statutCalculeTitre")}</p>
            <p className="explain-d">{t("jalons.statutCalculeTexte")}</p>
            <ul className="explain-rules">
              {regles.map((r) => (
                <li key={r.code} className={r.classe}>
                  <span className="explain-sw" aria-hidden="true" />
                  <span className="explain-libelle">{t(`jalons.regle_${r.code}`)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </form>
    </Fenetre>
  );
}
