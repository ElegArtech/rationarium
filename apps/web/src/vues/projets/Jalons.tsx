import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import * as apiImports from "../../api/imports.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "react-aria-components";
import { STATUTS_JALON, STATUTS_TACHE } from "@rationarium/contracts";
import * as api from "../../api/projets.js";
import * as apiTaches from "../../api/taches.js";
import { messageErreur } from "../../api/erreurs.js";
import { usePeut } from "../../session/session.js";
import { Chargement, ErreurDeChargement } from "../../composants/etats.js";
import { Fenetre } from "../../composants/fenetre.js";
import { FenetreImport } from "../../composants/Import.js";
import { useMessages } from "../../composants/messages.js";
import { Pastille, Barre, MarqueurCalcule, useLibelle } from "../../composants/pastilles.js";
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

/**
 * Une ligne de tâche de la chronologie — `.tk`, maquette 13.
 *
 * **Le statut de la tâche se saisit ici, à la différence de celui du jalon.**
 * La maquette pose l'opposition dans le même écran : `select.mini-select` sur
 * la tâche, `pill` + `calc-tag` sur le jalon. `cadrage/02` la reprend — « Chaque
 * tâche affiche titre, statut modifiable en ligne, assignés, estimation ». Une
 * pastille figée aurait rendu la même image et perdu le geste.
 *
 * Sans le droit d'écrire, la liste déroulante reste, désactivée : `RG-GEN-06`
 * demande de désactiver par courtoisie, pas d'escamoter — et une ligne qui
 * change de forme selon les droits fait douter de ce qu'on lit.
 */
function LigneTache({
  tache,
  modifiable,
  surStatut,
}: {
  tache: api.TacheDeJalon;
  modifiable: boolean;
  surStatut: (statut: string) => void;
}) {
  const { t } = useTranslation("projets");
  const libelle = useLibelle();
  /*
   * La seconde ligne dit l'AVANCEMENT, pas l'échéance — maquette 13, `tk-sub`.
   *
   * Ce que la ligne doit faire lire, c'est où en est la tâche : la colonne du
   * statut donne déjà l'étape, le pourcentage donne la distance qui reste. La
   * date, elle, est portée par le jalon juste au-dessus, et la répéter par
   * tâche remplissait la ligne sans rien apprendre.
   */
  const enRetard = tache.statut !== "done" && (joursAvant(tache.dateFin) ?? 1) < 0;

  return (
    <div className="tk">
      <div className="bloc-etroit">
        <span className="tk-name">{tache.titre}</span>
        <span className={`tk-sub${enRetard ? " is-late" : ""}`}>
          {t("jalons.avancementPourcent", { pct: tache.avancement })}
          {enRetard ? t("jalons.etEnRetard") : ""}
        </span>
      </div>
      <select
        className="mini-select"
        value={tache.statut}
        disabled={!modifiable}
        aria-label={t("jalons.statutDe", { titre: tache.titre })}
        onChange={(e) => surStatut(e.target.value)}
      >
        {STATUTS_TACHE.map((s) => (
          <option key={s.code} value={s.code}>
            {libelle(s.code, STATUTS_TACHE)}
          </option>
        ))}
      </select>
      <Assignes tache={tache} />
      <Charge tache={tache} />
    </div>
  );
}

/**
 * La fenêtre d'import des jalons — action « Importer CSV » de la maquette 13.
 *
 * Les colonnes sont celles que `cadrage/01 § M21` impose pour « Jalons d'un
 * projet » : `name*`, `description`, `dueDate*`. Ce sont exactement celles que
 * l'export de la vue produit, donc le fichier exporté se réimporte tel quel.
 *
 * **La route serveur d'exécution n'existe pas encore.** `POST /imports/jalons`
 * est absent du contrôleur M21, qui n'expose que l'aperçu (`analyser`, qui
 * connaît bien le type `jalons`) et l'export. Même situation, et même parti
 * pris, que `importerCompetences` : le manque est remonté au cadrage plutôt
 * que comblé ici.
 */
function ImportJalons({ projetId, surFermer }: { projetId: string; surFermer: () => void }) {
  // Nommé `tImports` et non `t` : le contrôle i18n attribue les clés au
  // namespace de LA liaison qui les porte, et deux `t` nus le rendraient aveugle.
  const { t: tImports } = useTranslation("imports");
  const client = useQueryClient();

  return (
    <FenetreImport
      type="jalons"
      titre={tImports("titreJalons")}
      colonnes={["name", "description", "dueDate"]}
      surExecuter={async (contenu) => {
        const rendu = await apiImports.importerJalons(projetId, contenu);
        await client.invalidateQueries({ queryKey: ["projet", projetId] });
        return rendu;
      }}
      surFermer={surFermer}
    />
  );
}

export function Jalons({ projetId }: { projetId: string }) {
  const { t } = useTranslation("projets");
  const { t: tImports } = useTranslation("imports");
  const { t: tErreurs } = useTranslation("erreurs");
  const peut = usePeut();
  const annoncer = useMessages();
  const client = useQueryClient();
  const [creationOuverte, setCreationOuverte] = useState(false);
  const [tacheOuverte, setTacheOuverte] = useState(false);
  const [importOuvert, setImportOuvert] = useState(false);
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

  /*
   * `RG-JAL-01` — changer le statut d'une tâche **recalcule celui de son
   * jalon**. C'est tout l'objet du geste dans cette vue, et le message le dit :
   * sans lui, la frise se réordonne sous les yeux sans qu'on sache pourquoi.
   *
   * `RG-GEN-07` — la version lue part avec l'écriture ; un 409 est rendu tel
   * quel, jamais rejoué en silence.
   *
   * Déclarée **avant** les retours anticipés ci-dessous : un `useMutation` placé
   * après eux n'est pas appelé au premier rendu, et React s'arrête sur « rendered
   * more hooks than during the previous render » — une page morte, pour un
   * déplacement de quinze lignes.
   */
  const changerStatut = useMutation({
    mutationFn: ({ tache, statut }: { tache: api.TacheDeJalon; statut: string }) =>
      apiTaches.modifier(tache.id, { version: tache.version, statut }),
    onSuccess: () => {
      annoncer("ok", t("jalons.statutMisAJour"));
      void client.invalidateQueries({ queryKey: ["projet", projetId] });
      void client.invalidateQueries({ queryKey: ["taches"] });
    },
    onError: (e) => annoncer("err", messageErreur(e, tErreurs, t("jalons.echecStatut"))),
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
            <a className="chip-btn" href={apiImports.adresseExportJalons(projetId)} download>
              {tImports("exporterJalons")}
            </a>
          ) : null}
          {/* `cadrage/02`, vue 13 — « Importer CSV » ferme la boucle de
              l'export ci-dessus : mêmes colonnes, même fichier. */}
          {peut("tasks:import") ? (
            <Button className="chip-btn" onPress={() => setImportOuvert(true)}>
              {tImports("importerCsv")}
            </Button>
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
              surStatut={(tache, statut) => changerStatut.mutate({ tache, statut })}
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

        Il paraît **dès que la chronologie porte des jalons**, et non seulement
        quand il a des lignes : c'est la règle de la maquette, qui le lie à la
        présence de données (`orphan.hidden = !hasData`) et jamais au décompte.
        Un bloc qui n'apparaît qu'une fois peuplé n'apprend rien tant qu'il est
        vide, et surprend le jour où il surgit — alors qu'à zéro il répond déjà
        à la question qu'on se pose : « ai-je oublié quelque chose ? ».
      */}
      {jalons.length > 0 ? (
        <div className="orphan">
          <div className="orphan-head">
            <span className="panel-title">{t("jalons.sansJalonTitre")}</span>
            <span className="kcol-n">{sansJalon.length}</span>
            {/* Rien à déplier quand il n'y a rien : la maquette pose la bascule
                sans jamais montrer ce cas, et une commande sans effet est pire
                qu'une commande absente. */}
            {sansJalon.length > 0 ? (
              <Button
                className="ms-toggle"
                style={{ marginLeft: "auto" }}
                aria-expanded={orphelinesOuvertes}
                onPress={() => setOrphelinesOuvertes((o) => !o)}
              >
                {t(orphelinesOuvertes ? "jalons.masquer" : "jalons.afficher")}
              </Button>
            ) : null}
          </div>
          {orphelinesOuvertes && sansJalon.length > 0 ? (
            <div className="ms-tasks">
              {sansJalon.map((tache) => (
                <LigneTache
                  key={tache.id}
                  tache={tache}
                  modifiable={peut("tasks:update")}
                  surStatut={(statut) => changerStatut.mutate({ tache, statut })}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {/*
        `EX-JAL-07` — les épopées.

        Le jalon est une ÉCHÉANCE, l'épopée un THÈME : les deux coexistent sur
        une tâche et ne se remplacent pas. C'est pourquoi les épopées vivent
        hors de la chronologie, sous elle — les ranger dans la frise
        obligerait à leur inventer une date qu'elles n'ont pas.
      */}
      <Epopees projetId={projetId} />

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

      {importOuvert ? (
        <ImportJalons projetId={projetId} surFermer={() => setImportOuvert(false)} />
      ) : null}
    </CadreProjet>
  );
}

function LigneJalon({
  projetId,
  jalon,
  deplie,
  surBascule,
  surStatut,
}: {
  projetId: string;
  jalon: api.Jalon;
  deplie: boolean;
  surBascule: () => void;
  surStatut: (tache: api.TacheDeJalon, statut: string) => void;
}) {
  const { t } = useTranslation("projets");
  const { t: tErreurs } = useTranslation("erreurs");
  const peut = usePeut();
  const annoncer = useMessages();
  const client = useQueryClient();
  const [modificationOuverte, setModificationOuverte] = useState(false);

  /** `RG-JAL-06` — le geste n'existe que sur un jalon sans tâche. */
  const sansTache = jalon.taches.length === 0;

  const marque = useMutation({
    mutationFn: (atteint: boolean) => api.marquerJalon(jalon.id, atteint, jalon.version),
    onSuccess: (_, atteint) => {
      annoncer("ok", t(atteint ? "jalons.marque" : "jalons.rouvert"));
      void client.invalidateQueries({ queryKey: ["projet", projetId] });
    },
    onError: (e) => annoncer("err", messageErreur(e, tErreurs, t("fiche.echecAction"))),
  });
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
            {/*
              `RG-JAL-06` — le marqueur « calculé » ment sur un jalon sans
              tâche : il n'y a rien à calculer, et le statut vient d'une marque
              posée à la main. Afficher la même explication dans les deux cas
              ferait chercher un avancement qui n'existe pas.
            */}
            <MarqueurCalcule
              explication={t(sansTache ? "jalons.statutMarque" : "jalons.statutCalcul")}
              // Le mot aussi : « Calculé » sur un jalon où rien ne l'est
              // enverrait chercher un avancement qui n'existe pas.
              {...(sansTache ? { libelle: t("jalons.repereMarque") } : {})}
            />
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
            {/* `EX-JAL-01` — « créer, modifier, supprimer ». La moitié du milieu
                manquait : décaler une échéance imposait de supprimer le jalon,
                donc de détacher ses tâches (`RG-JAL-05`) et de les rattacher
                une à une. */}
            {/*
              `EX-JAL-02` — marquer un jalon SANS TÂCHE.

              La commande n'apparaît QUE là : sur un jalon qui porte des
              tâches, le serveur refuse, et proposer un geste voué au refus est
              précisément ce que `RG-GEN-06` interdit. C'est aussi la manière
              la plus courte d'expliquer la règle — la commande est là où elle
              a un sens, et absente ailleurs.
            */}
            {sansTache && peut("milestones:update") ? (
              <Button
                className="ms-toggle"
                isPending={marque.isPending}
                onPress={() => marque.mutate(jalon.statut !== "done")}
              >
                {t(jalon.statut === "done" ? "jalons.rouvrir" : "jalons.marquerAtteint")}
              </Button>
            ) : null}
            {peut("milestones:update") ? (
              <Button
                className="ms-ico"
                onPress={() => setModificationOuverte(true)}
                aria-label={t("jalons.modifierLe", { nom: jalon.nom })}
              >
                <span aria-hidden="true">✎</span>
              </Button>
            ) : null}
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
                <LigneTache
                  key={tache.id}
                  tache={tache}
                  modifiable={peut("tasks:update")}
                  surStatut={(statut) => surStatut(tache, statut)}
                />
              ))
            ) : (
              <p className="ms-none">{t("jalons.aucuneTache")}</p>
            )}
          </div>
        ) : null}
      </div>

      <FenetreJalon
        projetId={projetId}
        jalon={jalon}
        // Remontée à chaque écriture : les champs se réamorcent sur la valeur
        // enregistrée, jamais sur celle d'avant.
        key={jalon.version}
        ouverte={modificationOuverte}
        surFermeture={() => setModificationOuverte(false)}
      />

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
  jalon,
  ouverte,
  surFermeture,
}: {
  projetId: string;
  /** Absent : création. Présent : modification (`EX-JAL-01`). */
  jalon?: api.Jalon | undefined;
  ouverte: boolean;
  surFermeture: () => void;
}) {
  const { t } = useTranslation("projets");
  const { t: tErreurs } = useTranslation("erreurs");
  const annoncer = useMessages();
  const client = useQueryClient();

  const [nom, setNom] = useState(jalon?.nom ?? "");
  const [description, setDescription] = useState(jalon?.description ?? "");
  // La date arrive en ISO complet ; l'`input[type=date]` n'en veut que le jour.
  const [echeance, setEcheance] = useState(jalon?.dateEcheance?.slice(0, 10) ?? "");
  const [nomManquant, setNomManquant] = useState(false);

  const creation = useMutation({
    mutationFn: () =>
      jalon
        ? api.modifierJalon(jalon.id, {
            nom,
            description: description || null,
            // Vider le champ RETIRE l'échéance : elle est facultative, donc son
            // absence est un état, pas une omission à ignorer.
            dateEcheance: echeance || null,
            version: jalon.version,
          })
        : api.creerJalon(projetId, {
            nom,
            ...(description ? { description } : {}),
            ...(echeance ? { dateEcheance: echeance } : {}),
          }),
    onSuccess: () => {
      annoncer("ok", t(jalon ? "jalons.modifie" : "jalons.cree"));
      if (!jalon) {
        setNom("");
        setDescription("");
        setEcheance("");
      }
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
      titre={t(jalon ? "jalons.modifierTitre" : "jalons.nouveauTitre")}
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

        {/* L'encart n'explique une ABSENCE que là où on cherche le champ :
            à la création. En modification, il répéterait une évidence. */}
        <div className="explain" hidden={Boolean(jalon)}>
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

/**
 * `EX-JAL-07` — le panneau des épopées.
 *
 * **Ce qu'il répare.** L'épopée existait en base, au catalogue de permissions,
 * dans quatre modèles de rôles et dans le formulaire de création d'une tâche.
 * Elle n'avait aucun service et aucune route : `epicId` ne pouvait donc jamais
 * valoir autre chose que `null`, et le compteur « 3 épopées » de la vue 11
 * affichait un zéro perpétuel.
 *
 * Il emprunte le vocabulaire du bloc « sans jalon » juste au-dessus — `orphan`,
 * `tk`, `ms-ico` : deux listes hors chronologie qui se ressembleraient sans se
 * ressembler tout à fait seraient un défaut de finition, pas une nuance.
 */
function Epopees({ projetId }: { projetId: string }) {
  const { t } = useTranslation("projets");
  const { t: tErreurs } = useTranslation("erreurs");
  const peut = usePeut();
  const annoncer = useMessages();
  const client = useQueryClient();
  const [fenetre, setFenetre] = useState<{ epopee?: api.Epopee } | null>(null);
  const [aSupprimer, setASupprimer] = useState<api.Epopee | null>(null);

  const liste = useQuery({
    queryKey: ["projet", projetId, "epopees"],
    queryFn: () => api.epopees(projetId),
    enabled: peut("epics:read"),
  });

  const suppression = useMutation({
    mutationFn: (id: string) => api.supprimerEpopee(id),
    onSuccess: ({ tachesDetachees }) => {
      annoncer("ok", t("epopees.supprimee", { n: tachesDetachees }));
      setASupprimer(null);
      void client.invalidateQueries({ queryKey: ["projet", projetId] });
    },
    onError: (e) => annoncer("err", messageErreur(e, tErreurs, t("fiche.echecAction"))),
  });

  // Sans `epics:read`, le panneau n'est pas masqué par courtoisie : il n'a
  // rien à montrer. Le contrôle qui compte est au serveur (`RG-GEN-06`).
  if (!peut("epics:read")) return null;

  const epopees = liste.data ?? [];

  return (
    <div className="orphan">
      <div className="orphan-head">
        <span className="panel-title">{t("epopees.titre")}</span>
        <span className="kcol-n">{epopees.length}</span>
        {peut("epics:create") ? (
          <Button
            className="ms-toggle"
            style={{ marginLeft: "auto" }}
            onPress={() => setFenetre({})}
          >
            {t("epopees.nouvelle")}
          </Button>
        ) : null}
      </div>

      {epopees.length > 0 ? (
        <div className="ms-tasks">
          {epopees.map((e) => (
            <div className="tk" key={e.id}>
              <div className="bloc-etroit">
                <span className="tk-name">{e.nom}</span>
                {e.description ? <span className="tk-sub">{e.description}</span> : null}
              </div>
              <span className="tk-est">{t("epopees.nTaches", { n: e.taches })}</span>
              {peut("epics:update") ? (
                <Button
                  className="ms-ico"
                  onPress={() => setFenetre({ epopee: e })}
                  aria-label={t("epopees.modifierLa", { nom: e.nom })}
                >
                  <span aria-hidden="true">✎</span>
                </Button>
              ) : null}
              {peut("epics:delete") ? (
                <Button
                  className="ms-ico is-del"
                  onPress={() => setASupprimer(e)}
                  aria-label={t("epopees.supprimerLa", { nom: e.nom })}
                >
                  <span aria-hidden="true">×</span>
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="ms-none">{t("epopees.aucune")}</p>
      )}

      {fenetre ? (
        <FenetreEpopee
          projetId={projetId}
          epopee={fenetre.epopee}
          surFermeture={() => setFenetre(null)}
        />
      ) : null}

      <Fenetre
        ouverte={aSupprimer !== null}
        surFermeture={() => setASupprimer(null)}
        categorie={t("confirmation")}
        titre={t("epopees.supprimerTitre")}
        // Même promesse que pour le jalon : le regroupement disparaît, le
        // travail reste.
        mention={t("jalons.aucuneTacheSupprimee")}
        actions={
          <>
            <Button className="btn btn-secondary" onPress={() => setASupprimer(null)}>
              {t("annuler")}
            </Button>
            <Button
              className="btn btn-danger"
              isPending={suppression.isPending}
              onPress={() => aSupprimer && suppression.mutate(aSupprimer.id)}
            >
              {t("epopees.supprimerTitre")}
            </Button>
          </>
        }
      >
        <p className="phrase-confirmation">
          {t("epopees.confirmerSuppression")}{" "}
          <span className="quoted">« {aSupprimer?.nom} »</span> ?
        </p>
        <div className="alert alert-neutral">
          <span className="alert-icon" aria-hidden="true">
            →
          </span>
          <span>{t("epopees.effetSuppression", { n: aSupprimer?.taches ?? 0 })}</span>
        </div>
      </Fenetre>
    </div>
  );
}

/** La fenêtre d'épopée — création et modification, `EX-JAL-07`. */
function FenetreEpopee({
  projetId,
  epopee,
  surFermeture,
}: {
  projetId: string;
  epopee?: api.Epopee | undefined;
  surFermeture: () => void;
}) {
  const { t } = useTranslation("projets");
  const { t: tErreurs } = useTranslation("erreurs");
  const annoncer = useMessages();
  const client = useQueryClient();

  const [nom, setNom] = useState(epopee?.nom ?? "");
  const [description, setDescription] = useState(epopee?.description ?? "");
  const [nomManquant, setNomManquant] = useState(false);

  const ecriture = useMutation({
    mutationFn: () =>
      epopee
        ? api.modifierEpopee(epopee.id, {
            nom,
            description: description || null,
            version: epopee.version,
          })
        : api.creerEpopee(projetId, { nom, ...(description ? { description } : {}) }),
    onSuccess: () => {
      annoncer("ok", t(epopee ? "epopees.modifiee" : "epopees.creee"));
      surFermeture();
      void client.invalidateQueries({ queryKey: ["projet", projetId] });
    },
    onError: (e) => annoncer("err", messageErreur(e, tErreurs, t("fiche.echecAction"))),
  });

  const valider = () => {
    const vide = !nom.trim();
    setNomManquant(vide);
    if (!vide) ecriture.mutate();
  };

  return (
    <Fenetre
      ouverte
      surFermeture={surFermeture}
      categorie={t("epopees.categorie")}
      titre={t(epopee ? "epopees.modifierTitre" : "epopees.nouvelleTitre")}
      mention={t("champObligatoire")}
      actions={
        <>
          <Button className="btn btn-secondary" onPress={surFermeture}>
            {t("annuler")}
          </Button>
          <Button className="btn btn-primary" isPending={ecriture.isPending} onPress={valider}>
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
          <label className="field-label" htmlFor="ep-nom">
            {t("portefeuille.nom")} <span className="req">*</span>
          </label>
          <input
            className="field"
            id="ep-nom"
            type="text"
            value={nom}
            aria-invalid={nomManquant}
            onChange={(e) => setNom(e.target.value)}
            placeholder={t("epopees.nomExemple")}
          />
          <p className={`field-error${nomManquant ? "" : " is-quiet"}`}>
            <span aria-hidden="true">↑</span>
            <span>{t("epopees.nomRequis")}</span>
          </p>
        </div>

        <div className="field-block">
          <label className="field-label" htmlFor="ep-desc">
            {t("portefeuille.description")}
          </label>
          <textarea
            className="field"
            id="ep-desc"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("epopees.descriptionExemple")}
          />
          <p className="field-hint">{t("epopees.aideTheme")}</p>
        </div>
      </form>
    </Fenetre>
  );
}
