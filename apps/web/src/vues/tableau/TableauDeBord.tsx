import { useState, type CSSProperties, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { IconeProjet } from "../../composants/icones-projet.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Tab, TabList, TabPanel, Tabs } from "react-aria-components";
import { Link } from "@tanstack/react-router";
import { STATUTS_PROJET, STATUTS_TACHE } from "@rationarium/contracts";
import * as api from "../../api/tableau.js";
import * as apiTaches from "../../api/taches.js";
import { saisirTemps, validerSansDeclaration } from "../../api/occupations.js";
import { messageErreur } from "../../api/erreurs.js";
import { useSession, usePeut } from "../../session/session.js";
import { Chargement, ErreurDeChargement, AccesRefuse } from "../../composants/etats.js";
import { useMessages } from "../../composants/messages.js";
import { AvatarAgent, useLibelle } from "../../composants/pastilles.js";
import { formaterDate, formaterDateAvecJour } from "../../formats.js";
import {
  CELLULE_VIDE,
  indexer,
  joursAffiches,
  COUCHES_PAR_DEFAUT,
  type Occupation,
} from "../planning/grille.js";
import "./tableau.css";

/**
 * Vue 06 — le tableau de bord.
 *
 * **La vue la plus consultée du produit**, et pour un contributeur la seule
 * qu'il ouvre. Deux exigences s'y opposent, et il faut les tenir ensemble :
 *
 * - **Complète en un écran, sans défilement** pour Camille, qui n'ira pas
 *   chercher ailleurs ce qui manque ici.
 * - **Digne quand tous les compteurs sont à zéro** pour Inès, dont les
 *   indicateurs personnels n'ont pas de sens. D'où des états vides rédigés,
 *   jamais des zéros nus.
 *
 * **La saisie se fait sans quitter la page ni ouvrir de fenêtre** — c'est le
 * point d'attention du brief. Statut, heures et to-do se modifient en place :
 * une fenêtre modale pour saisir « 2 h » coûterait plus que la saisie.
 *
 * Le balisage suit `mockups/06-tableau-de-bord.html` **classe par classe** ;
 * le style vit dans `tableau.css`, porté des sections 8 et 9 de cette même
 * maquette. La vue avait vécu sans aucune feuille : ses classes étaient
 * posées, aucune règle ne les recevait, et la page était nue.
 */

const MAX_PROJETS_VISIBLES = 5;

/** Le style d'un jeton de couleur, quand la valeur vient de la donnée. */
export const couleurDe = (jeton: string): CSSProperties => ({ color: `var(--${jeton})` });

export function TableauDeBord() {
  const { t } = useTranslation("tableau");
  const peut = usePeut();
  const { session } = useSession();

  const requete = useQuery({
    queryKey: ["tableau-de-bord"],
    queryFn: api.tableauDeBord,
    enabled: peut("planning:read"),
  });

  if (!peut("planning:read")) return <AccesRefuse />;
  if (requete.isPending) return <Chargement quoi={t("letableau")} />;
  if (requete.isError)
    return <ErreurDeChargement erreur={requete.error} surReessai={() => void requete.refetch()} />;

  const { indicateurs, taches, todos, projets, planning } = requete.data;

  return (
    <div className="page">
      {/* `EX-DSH-01` — l'accueil est nominatif. Ce n'est pas une politesse :
          c'est ce qui dit que la page parle de vous et pas de l'instance.
          Le surtitre porte la date du jour, comme la maquette : elle situe
          tout ce qui suit — « à venir », « en retard », « cette semaine ». */}
      <div className="greet">
        <span className="eyebrow">
          {formaterDateAvecJour(new Date().toISOString().slice(0, 10))}
        </span>
        <h1 className="h1">{t("bonjour", { prenom: session.prenom })}</h1>
        <p className="lede">{t("apercu")}</p>
      </div>

      <Indicateurs indicateurs={indicateurs} />

      {/* Le planning occupe la largeur entière : c'est la seule tuile dont le
          contenu est une grille de jours, et cinq colonnes serrées dans une
          demi-page tronquaient les intitulés au premier mot. Le reste se lit
          en deux colonnes — la gauche large pour ce qui demande un geste
          (tâches, projets), la droite pour ce qui se consulte. */}
      <MonPlanning planning={planning} />

      <div className="dash-grid">
        <MesTaches aVenir={taches.aVenir} nonDeclarees={taches.nonDeclarees} />
        <MaToDo todos={todos} />
        <MesProjets projets={projets} />
        <PresenceDuJour />
      </div>
    </div>
  );
}

/**
 * `EX-DSH-02` — quatre indicateurs, chacun avec son dénominateur.
 *
 * « 3 » ne dit rien. « 3 sur 7 » situe. Le sous-titre n'est pas décoratif :
 * c'est lui qui rend le chiffre lisible. À zéro, il ne montre pas « 0 % » —
 * un pourcentage sans population ne veut rien dire — mais le dit en toutes
 * lettres, comme la maquette.
 */
function Indicateurs({ indicateurs }: { indicateurs: api.TableauDeBord["indicateurs"] }) {
  const { t } = useTranslation("tableau");
  const { projets, tachesEnCours, tachesTerminees, tachesEnRetard } = indicateurs;

  return (
    <div className="kpi-grid">
      <div className="kpi">
        <span className="eyebrow">{t("kpi.projetsActifs")}</span>
        <p className="kpi-val">{projets.actifs}</p>
        <span className="kpi-sub">{t("kpi.surNProjets", { n: projets.total })}</span>
      </div>
      <div className="kpi">
        <span className="eyebrow">{t("kpi.tachesEnCours")}</span>
        <p className="kpi-val">{tachesEnCours.valeur}</p>
        <span className="kpi-sub">{t("kpi.surNTaches", { n: tachesEnCours.total })}</span>
      </div>
      <div className="kpi">
        <span className="eyebrow">{t("kpi.tachesTerminees")}</span>
        <p className="kpi-val">{tachesTerminees.valeur}</p>
        <span className="kpi-sub">
          {tachesEnCours.total === 0
            ? t("kpi.rienAAfficher")
            : t("kpi.pourcentageCompletees", { n: tachesTerminees.pourcentage })}
        </span>
      </div>
      {/* Le seul indicateur qui alerte. Les trois autres informent — les
          teinter tous ferait perdre le seul qui demande une action. */}
      <div className={`kpi${tachesEnRetard > 0 ? " is-alert" : ""}`}>
        <span className="eyebrow">{t("kpi.tachesEnRetard")}</span>
        <p className="kpi-val">{tachesEnRetard}</p>
        <span className="kpi-sub">
          {tachesEnRetard > 0 ? t("kpi.echeanceDepassee") : t("kpi.aucunRetard")}
        </span>
      </div>
    </div>
  );
}

/** La pastille d'un projet — `RG-PRJ-11` : l'icône du référentiel, pas une initiale. */
/** La pastille de projet, en petit — même symbole que partout ailleurs. */
function Pastille({ icone, titre }: { icone: string | null; titre: string }) {
  return <IconeProjet icone={icone} nom={titre} petite />;
}

/**
 * `EX-DSH-03` — l'extrait de planning personnel de la semaine.
 *
 * Autant de colonnes que le paramétrage en montre : la semaine ouvrée par
 * défaut, le week-end compris si l'instance l'affiche. C'est le même réglage
 * que la vue 07 (`RG-PLN-03`) — deux extraits de la même semaine qui ne
 * montrent pas les mêmes jours, c'est l'un des deux qui a tort.
 */
function MonPlanning({ planning }: { planning: api.TableauDeBord["planning"] }) {
  const { t } = useTranslation("tableau");
  const aujourdhui = new Date().toISOString().slice(0, 10);

  const index = indexer(planning, COUCHES_PAR_DEFAUT, {
    statuts: new Set(STATUTS_TACHE.map((s) => s.code)),
    typesTache: new Set(["projet", "hors_projet"]),
    presence: new Set(["office", "telework"]),
    absences: new Set(["valide", "attente"]),
    evenements: new Set(["interne", "externe"]),
  });

  const moi = planning.groupes[0]?.personnes[0]?.id;
  /*
   * `RG-PLN-03` — les jours visibles suivent le PARAMÉTRAGE, pas une tranche
   * en dur. Un `slice(0, 5)` donnait toujours du lundi au vendredi : activer
   * le samedi et le dimanche changeait la vue 07 et laissait celle-ci
   * intacte, sans que rien ne le dise. Troisième occurrence du même défaut —
   * un réglage qui s'enregistre n'est pas un réglage qui s'applique —, et la
   * deuxième pour ce réglage-là, qui ne s'appliquait déjà nulle part avant
   * `joursAffiches`.
   */
  const jours = joursAffiches(planning.periode.jours);
  const cellules = jours.map((jour) =>
    moi ? (index.get(`${moi}|${jour}`) ?? CELLULE_VIDE) : CELLULE_VIDE,
  );

  // `RG-GEN-04` — la semaine entièrement vide ne se dit pas par cinq tirets :
  // elle s'explique, et elle annonce ce qui viendra la remplir.
  const vide = cellules.every(
    (c) => !c.conge && !c.lieu && c.occupations.length === 0,
  );

  return (
    <section className="panel">
      <div className="panel-head">
        <span className="panel-title">{t("planning.titre")}</span>
        <a className="link link-sm" href="/planning">
          {t("planning.ouvrir")}
        </a>
      </div>
      <div className="panel-body is-flush">
        {vide ? (
          <div className="empty">
            <p>{t("planning.vide")}</p>
            <small>{t("planning.videAide")}</small>
          </div>
        ) : (
          <div className="week" style={{ "--jours": jours.length } as CSSProperties}>
            {jours.map((jour, i) => {
              const cellule = cellules[i] ?? CELLULE_VIDE;
              const d = new Date(`${jour}T00:00:00.000Z`);
              return (
                <div className={`week-col${jour === aujourdhui ? " is-today" : ""}`} key={jour}>
                  <p className="week-day">
                    {t(`jours.court.${d.getUTCDay()}`)} {jour.slice(8)}
                  </p>
                  <div className="week-cell">
                    {cellule.conge ? (
                      <span className="tchip tchip-flat" style={couleurDe("leave")}>
                        <span>{cellule.conge.type.nom}</span>
                      </span>
                    ) : null}
                    {cellule.lieu?.etat === "telework" ? (
                      <span className="tchip tchip-flat" style={couleurDe("telework")}>
                        <span>{t("planning.teletravail")}</span>
                      </span>
                    ) : null}
                    {cellule.occupations.map((o) => (
                      <JetonOccupation key={o.cle} occupation={o} />
                    ))}
                    {!cellule.conge && !cellule.lieu && cellule.occupations.length === 0 ? (
                      <span className="week-none">{t("planning.rien")}</span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * Une occupation de la semaine — et, pour une tâche, le chemin vers sa fiche.
 *
 * L'extrait de planning montrait le travail sans y donner accès : on y lisait
 * « Reprise des libellés » sans pouvoir l'ouvrir, alors que la vue existe et
 * que le jeton en connaît l'identifiant. Une tâche mène donc à `/taches/$id`.
 *
 * Trois précisions sur la forme, chacune pour une raison :
 *
 * - Un `Link` du routeur, pas une ancre nue. Une `<a href>` dans une
 *   application à routeur RECHARGE le document entier — le lot, la session,
 *   les réglages —, ce que rien ne signale : l'URL change, la vue s'affiche.
 * - `RG-GEN-06` : sans `tasks:read`, la fiche est inaccessible, le jeton
 *   reste donc un simple libellé plutôt qu'un lien qui mène à un refus.
 * - Un `title`, parce que le jeton tronque. La colonne d'un jour a une
 *   largeur fixe et l'intitulé s'y coupe : sans lui, le titre complet n'est
 *   lisible nulle part. Même geste qu'à la vue 08, pour la même raison.
 *
 * Un événement et une permanence n'ont pas de fiche : ils restent muets.
 */
function JetonOccupation({ occupation: o }: { occupation: Occupation }) {
  const peut = usePeut();

  const libelle =
    o.genre === "tache"
      ? o.tache.titre
      : o.genre === "evenement"
        ? o.evenement.titre
        : o.permanence.predefinedTask.nom;

  const classe = `tchip${
    o.genre === "tache" && o.tache.horsProjet
      ? " tchip-indep"
      : o.genre === "permanence"
        ? " tchip-flat"
        : ""
  }`;

  const style = couleurDe(
    o.genre === "tache"
      ? `st-${o.tache.statut}`
      : o.genre === "evenement"
        ? "event"
        : "activity",
  );

  const contenu = (
    <>
      {o.genre === "tache" && o.tache.project ? (
        <Pastille icone={o.tache.project.icone} titre={o.tache.project.nom} />
      ) : null}
      <span>{libelle}</span>
    </>
  );

  if (o.genre === "tache" && peut("tasks:read")) {
    return (
      <Link to="/taches/$id" params={{ id: o.tache.id }} className={classe} style={style} title={libelle}>
        {contenu}
      </Link>
    );
  }

  return (
    <span className={classe} style={style} title={libelle}>
      {contenu}
    </span>
  );
}

/**
 * `EX-DSH-05`, `EX-DSH-06` — mes tâches, et de quoi agir sans changer de page.
 *
 * Deux onglets pour deux gestes distincts : faire avancer, ou clore ce qui
 * traîne. Les mêler dans une seule liste mélangerait « ce que je dois faire »
 * et « ce que je dois déclarer », qui n'appellent pas la même décision. Chaque
 * onglet porte son compte : c'est ce qui dit s'il vaut la peine d'être ouvert.
 */
function MesTaches({
  aVenir,
  nonDeclarees,
}: {
  aVenir: api.TacheAVenir[];
  nonDeclarees: api.TacheNonDeclaree[];
}) {
  const { t } = useTranslation("tableau");

  // Les onglets viennent de l'inventaire (`DESIGN.md § 2`). Réécrire
  // `role="tab"` à la main sur des boutons produit un composant qui ressemble
  // à des onglets sans en avoir le comportement clavier — flèches, `Home`,
  // `End` — ni la relation au panneau.
  return (
    <section className="panel">
      <Tabs>
        <div className="panel-head">
          <span className="panel-title">{t("taches.titre")}</span>
          <TabList className="tabs" aria-label={t("taches.titre")}>
            <Tab className="tab" id="aVenir">
              {t("taches.ongletAVenir", { n: aVenir.length })}
            </Tab>
            <Tab className="tab" id="nonDeclarees">
              {t("taches.ongletNonDeclarees", { n: nonDeclarees.length })}
            </Tab>
          </TabList>
        </div>

        <TabPanel className="panel-body is-flush" id="aVenir">
          {aVenir.length === 0 ? (
            <div className="empty">
              <p>{t("taches.videAVenir")}</p>
              <small>{t("taches.videAVenirAide")}</small>
            </div>
          ) : (
            aVenir.map((tache) => <LigneTache key={tache.id} tache={tache} />)
          )}
        </TabPanel>

        <TabPanel className="panel-body is-flush" id="nonDeclarees">
          {nonDeclarees.length === 0 ? (
            <div className="empty">
              <p>{t("taches.videNonDeclarees")}</p>
              <small>{t("taches.videNonDeclareesAide")}</small>
            </div>
          ) : (
            nonDeclarees.map((tache) => <LigneNonDeclaree key={tache.id} tache={tache} />)
          )}
        </TabPanel>
      </Tabs>
    </section>
  );
}

/** Le champ d'heures et son unité — le geste que le brief veut réduit à une frappe. */
function ChampHeures({
  libelle,
  surValidation,
}: {
  libelle: string;
  surValidation: (heures: number) => void;
}) {
  const { t } = useTranslation("tableau");
  const [heures, setHeures] = useState("");

  /** Une frappe, puis Entrée. Le brief demande « une frappe », pas un parcours. */
  const valider = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    const valeur = Number(heures.replace(",", "."));
    if (!Number.isFinite(valeur) || valeur <= 0) return;
    surValidation(valeur);
    setHeures("");
  };

  return (
    <div className="hours">
      <input
        type="text"
        inputMode="decimal"
        placeholder={t("taches.heuresPlaceholder")}
        aria-label={libelle}
        value={heures}
        onChange={(e) => setHeures(e.target.value)}
        onKeyDown={valider}
      />
      <span className="hours-unit">{t("taches.unite")}</span>
    </div>
  );
}

/** La période d'une tâche : « 11 → 12 août », ou la seule date connue. */
function periode(debut: string | null, fin: string | null): string | null {
  if (debut && fin && debut !== fin) return `${formaterDate(debut)} → ${formaterDate(fin)}`;
  const seule = fin ?? debut;
  return seule ? formaterDate(seule) : null;
}

function LigneTache({ tache }: { tache: api.TacheAVenir }) {
  const { t } = useTranslation("tableau");
  const { t: tErreurs } = useTranslation("erreurs");
  const libelleDe = useLibelle();
  const annoncer = useMessages();
  const client = useQueryClient();

  const rafraichir = () => client.invalidateQueries({ queryKey: ["tableau-de-bord"] });

  const statut = useMutation({
    mutationFn: (nouveau: string) =>
      apiTaches.modifier(tache.id, { version: tache.version, statut: nouveau }),
    onSuccess: () => {
      annoncer("ok", t("taches.statutEnregistre"));
      void rafraichir();
    },
    onError: (e) => annoncer("err", messageErreur(e, tErreurs, t("taches.echecStatut"))),
  });

  const saisie = useMutation({
    mutationFn: (valeur: number) =>
      saisirTemps({
        date: new Date().toISOString().slice(0, 10),
        heures: valeur,
        taskId: tache.id,
        ...(tache.project ? { projectId: tache.project.id } : {}),
      }),
    onSuccess: () => {
      annoncer("ok", t("taches.tempsSaisi"));
      void rafraichir();
    },
    onError: (e) => annoncer("err", messageErreur(e, tErreurs, t("taches.echecTemps"))),
  });

  const intervalle = periode(tache.dateDebut, tache.dateFin);

  return (
    <div className="trow">
      <div>
        <p className="trow-title">
          {tache.project ? <Pastille icone={tache.project.icone} titre={tache.project.nom} /> : null}
          <span>{tache.titre}</span>
          {/* `RG-DSH-04` — le marqueur est textuel autant que coloré. */}
          {tache.enRetard ? <span className="badge badge-late">{t("taches.enRetard")}</span> : null}
          {!tache.project ? (
            <span className="badge badge-indep">{t("taches.sansProjet")}</span>
          ) : null}
        </p>
        <span className="trow-meta">
          {tache.project?.nom ?? t("taches.sansProjet")}
          {intervalle ? ` · ${intervalle}` : ""}
          {tache.estimationHeures !== null
            ? ` · ${t("taches.estimation", { n: tache.estimationHeures })}`
            : ""}
        </span>
      </div>

      <select
        className="mini-select"
        aria-label={t("taches.statutDe", { titre: tache.titre })}
        value={tache.statut}
        onChange={(e) => statut.mutate(e.target.value)}
      >
        {STATUTS_TACHE.map((s) => (
          <option key={s.code} value={s.code}>
            {libelleDe(s.code, STATUTS_TACHE)}
          </option>
        ))}
      </select>

      <div>
        <ChampHeures
          libelle={t("taches.heuresSur", { titre: tache.titre })}
          surValidation={(valeur) => saisie.mutate(valeur)}
        />
        {/* `RG-TMP-07` — dire ce qui est DÉJÀ déclaré, tous contributeurs
            confondus : c'est ce qui évite de saisir deux fois trois heures
            parce qu'un collègue l'avait fait. */}
        {tache.heuresDeclarees > 0 ? (
          <span className="hours-note">{t("taches.dejaDeclare", { n: tache.heuresDeclarees })}</span>
        ) : null}
      </div>
    </div>
  );
}

function LigneNonDeclaree({ tache }: { tache: api.TacheNonDeclaree }) {
  const { t } = useTranslation("tableau");
  const { t: tErreurs } = useTranslation("erreurs");
  const annoncer = useMessages();
  const client = useQueryClient();

  const rafraichir = () => client.invalidateQueries({ queryKey: ["tableau-de-bord"] });

  const renoncement = useMutation({
    mutationFn: () => validerSansDeclaration(tache.id),
    onSuccess: () => {
      annoncer("ok", t("taches.valideeSansDeclaration"));
      void rafraichir();
    },
    onError: (e) => annoncer("err", messageErreur(e, tErreurs, t("taches.echecValidation"))),
  });

  // La maquette laisse les deux sorties côte à côte : déclarer les heures
  // manquantes, ou dire que la question ne se pose pas. Ce ne sont pas les
  // mêmes faits, et l'une ne remplace pas l'autre.
  const saisie = useMutation({
    mutationFn: (valeur: number) =>
      saisirTemps({
        date: new Date().toISOString().slice(0, 10),
        heures: valeur,
        taskId: tache.id,
      }),
    onSuccess: () => {
      annoncer("ok", t("taches.tempsSaisi"));
      void rafraichir();
    },
    onError: (e) => annoncer("err", messageErreur(e, tErreurs, t("taches.echecTemps"))),
  });

  return (
    <div className="trow">
      <div>
        <p className="trow-title">
          <span>{tache.titre}</span>
        </p>
        <span className="trow-meta">
          {tache.dateFin
            ? `${t("taches.termineeLe", { date: formaterDate(tache.dateFin) })} · ${t("taches.aucuneHeure")}`
            : t("taches.aucuneHeure")}
        </span>
      </div>

      <label className="check">
        {/* La case garde son état coché pendant l'écriture : une case qui
            revient toute seule ferait croire que le clic n'a pas pris. La
            ligne disparaît quand le serveur confirme. */}
        <input
          type="checkbox"
          checked={renoncement.isPending || renoncement.isSuccess}
          disabled={renoncement.isPending || renoncement.isSuccess}
          onChange={() => renoncement.mutate()}
        />
        {/* « Valider sans déclaration » n'est pas « déclarer zéro heure » :
            c'est dire que la question ne se pose pas. */}
        <span>{t("taches.validerSansDeclaration")}</span>
      </label>

      <ChampHeures
        libelle={t("taches.heuresSur", { titre: tache.titre })}
        surValidation={(valeur) => saisie.mutate(valeur)}
      />
    </div>
  );
}

/**
 * `EX-DSH-04` — la to-do personnelle.
 *
 * `RG-DSH-01` strictement privée et plafonnée · `RG-DSH-02` édition par
 * double-clic · `RG-DSH-03` complétées regroupées à part.
 *
 * Le double-clic est doublé d'une entrée clavier : le champ s'ouvre aussi à
 * `Entrée` sur le libellé, sans quoi l'édition n'existerait pas au clavier.
 */
function MaToDo({ todos }: { todos: api.Todos }) {
  const { t } = useTranslation("tableau");
  const { t: tErreurs } = useTranslation("erreurs");
  const annoncer = useMessages();
  const client = useQueryClient();
  const [libelle, setLibelle] = useState("");
  const [edite, setEdite] = useState<{ id: string; texte: string } | null>(null);

  const rafraichir = () => client.invalidateQueries({ queryKey: ["tableau-de-bord"] });
  const echec = (e: unknown, defaut: string) => annoncer("err", messageErreur(e, tErreurs, defaut));

  const ajout = useMutation({
    mutationFn: () => api.ajouterTodo(libelle.trim()),
    onSuccess: () => {
      setLibelle("");
      void rafraichir();
    },
    onError: (e) => echec(e, t("todo.echecAjout")),
  });

  const modification = useMutation({
    mutationFn: (donnees: { id: string; libelle?: string; fait?: boolean }) =>
      api.modifierTodo(donnees.id, {
        ...(donnees.libelle === undefined ? {} : { libelle: donnees.libelle }),
        ...(donnees.fait === undefined ? {} : { fait: donnees.fait }),
      }),
    onSuccess: () => {
      setEdite(null);
      void rafraichir();
    },
    onError: (e) => echec(e, t("todo.echecModification")),
  });

  const suppression = useMutation({
    mutationFn: (id: string) => api.supprimerTodo(id),
    onSuccess: () => void rafraichir(),
    onError: (e) => echec(e, t("todo.echecSuppression")),
  });

  const total = todos.actives.length + todos.faites.length;

  const ligne = (todo: api.Todo) => (
    <div className={`todo-item${todo.fait ? " is-done" : ""}`} key={todo.id}>
      <input
        type="checkbox"
        checked={todo.fait}
        aria-label={t("todo.basculer", { libelle: todo.libelle })}
        onChange={(e) => modification.mutate({ id: todo.id, fait: e.target.checked })}
      />
      {edite?.id === todo.id ? (
        <input
          className="todo-label"
          autoFocus
          aria-label={t("todo.editer", { libelle: todo.libelle })}
          value={edite.texte}
          onChange={(e) => setEdite({ id: todo.id, texte: e.target.value })}
          onBlur={() => setEdite(null)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && edite.texte.trim()) {
              modification.mutate({ id: todo.id, libelle: edite.texte.trim() });
            }
            if (e.key === "Escape") setEdite(null);
          }}
        />
      ) : (
        // `RG-DSH-02` — double-clic. Doublé d'un bouton pour le clavier : une
        // action qui n'existe qu'à la souris n'existe pas. La maquette pose en
        // plus un `title` d'aide au survol ; `Button` de l'inventaire ne le
        // prend pas, et l'indication vit donc dans l'état vide du panneau.
        <Button
          className="todo-label"
          onDoubleClick={() => setEdite({ id: todo.id, texte: todo.libelle })}
          onPress={() => setEdite({ id: todo.id, texte: todo.libelle })}
        >
          {todo.libelle}
        </Button>
      )}
      <Button
        className="todo-del"
        aria-label={t("todo.supprimer", { libelle: todo.libelle })}
        onPress={() => suppression.mutate(todo.id)}
      >
        <span aria-hidden="true">×</span>
      </Button>
    </div>
  );

  return (
    <section className="panel">
      <div className="panel-head">
        <span className="panel-title">{t("todo.titre")}</span>
        {/* `RG-DSH-01` — la limite se lit AVANT d'être atteinte : « 3 / 20 »
            dit combien il reste, un champ qui refuse ne dit que le refus. */}
        <span className="eyebrow">{t("todo.compte", { n: total, limite: todos.limite })}</span>
      </div>

      {todos.limiteAtteinte ? (
        <p className="todo-limit">{t("todo.limiteAtteinte", { n: todos.limite })}</p>
      ) : null}

      <div className="todo-add">
        <input
          type="text"
          aria-label={t("todo.nouvelle")}
          placeholder={t("todo.placeholder")}
          disabled={todos.limiteAtteinte}
          value={libelle}
          onChange={(e) => setLibelle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && libelle.trim()) ajout.mutate();
          }}
        />
        <Button
          className="btn btn-primary"
          aria-label={t("todo.ajouter")}
          isDisabled={todos.limiteAtteinte || libelle.trim() === ""}
          onPress={() => ajout.mutate()}
        >
          <span aria-hidden="true">+</span>
        </Button>
      </div>

      {todos.actives.map(ligne)}

      {/* `RG-DSH-03` — les complétées à part, avec leur compte. */}
      {todos.faites.length > 0 ? (
        <>
          <div className="todo-sep">
            <span className="eyebrow">{t("todo.completees", { n: todos.faites.length })}</span>
          </div>
          {todos.faites.map(ligne)}
        </>
      ) : null}

      {total === 0 ? (
        <div className="empty">
          <p>{t("todo.vide")}</p>
          <small>{t("todo.videAide")}</small>
        </div>
      ) : null}
    </section>
  );
}

/**
 * `EX-USR-09` — la présence du jour : qui est là, en congé, en télétravail.
 *
 * **Pourquoi ici, et pas sur la vue 27.** Aucun brief ne porte cette
 * exigence — ni celui de la 06, ni celui de la 27 : c'est un manque de spec,
 * consigné comme tel. Trois raisons ont tranché.
 *
 * 1. **« Du jour ».** La vue 06 est la seule dont l'axe est *aujourd'hui* —
 *    son brief l'écrit : « ce qui concerne l'utilisateur aujourd'hui », et son
 *    surtitre porte la date. La vue 27 administre des comptes ; la notion de
 *    journée n'y existe nulle part.
 * 2. **Le destinataire.** `cadrage/01 § 2` donne le besoin à Fatou, manager de
 *    service : « voir le taux de présence ». Fatou détient `users:read` par
 *    `ENCADREMENT` ; Camille, contributrice, ne l'a pas.
 * 3. **La contrainte du brief tient.** « Pour Camille, la vue doit être
 *    complète en un écran, sans défilement » — et le bloc ne s'affiche pas
 *    pour elle, faute de `users:read`. Il apparaît exactement pour qui l'a
 *    demandé, et pour personne d'autre.
 *
 * La vue 27 reste le bon hôte d'un annuaire de présence complet, filtrable ;
 * ce bloc-ci répond à « qui est là ce matin », pas à « donne-moi la liste ».
 */
function PresenceDuJour() {
  const { t } = useTranslation("tableau");
  const peut = usePeut();

  /*
   * `EX-USR-09` — la date est ENVOYÉE, jamais laissée au serveur.
   *
   * Sans elle la route retombe sur `new Date()`, un instant avec son heure,
   * qu'elle compare à des colonnes `date` stockées à minuit : plus aucun
   * télétravail ne ressort, et tout congé qui s'achève aujourd'hui est
   * manqué. Le bloc dirait « tout le monde est présent » — faux, et
   * plausible. Voir `api/tableau.ts`.
   */
  const jour = new Date().toISOString().slice(0, 10);

  const requete = useQuery({
    queryKey: ["presence", jour],
    queryFn: () => api.presenceDuJour(jour),
    enabled: peut("users:read"),
  });

  // `RG-GEN-06` — sans le droit de lire l'annuaire, le bloc n'existe pas.
  // Ni grisé, ni vide : absent. Une présence d'équipe n'est pas une donnée
  // qu'on annonce à qui n'y a pas droit.
  if (!peut("users:read")) return null;

  const agents = requete.data ?? [];
  const compte = (etat: api.PresenceAgent["etat"]) =>
    agents.filter((a) => a.etat === etat).length;

  return (
    <section className="panel">
      <div className="panel-head">
        <span className="panel-title">{t("presence.titre")}</span>
        {requete.isSuccess ? (
          <span className="eyebrow">
            {t("presence.compte", {
              p: compte("present"),
              c: compte("conge"),
              tt: compte("teletravail"),
            })}
          </span>
        ) : null}
      </div>
      <div className="panel-body is-flush">
        {requete.isPending ? <Chargement quoi={t("presence.laPresence")} /> : null}
        {requete.isError ? (
          <ErreurDeChargement erreur={requete.error} surReessai={() => void requete.refetch()} />
        ) : null}

        {requete.isSuccess && agents.length === 0 ? (
          <div className="empty">
            <p>{t("presence.vide")}</p>
            <small>{t("presence.videAide")}</small>
          </div>
        ) : null}

        {agents.map((agent) => (
          <div className="prow" key={agent.id}>
            <AvatarAgent prenom={agent.prenom} nom={agent.nom} />
            <p className="prow-name">
              {agent.prenom} {agent.nom}
            </p>
            {/*
              Le mot AVANT la couleur. Trois jetons distinguent les trois
              états, mais « en congé » et « en télétravail » ne se devinent pas
              d'une nuance — et le type de congé, quand il est connu, dit
              davantage que « en congé ».
            */}
            <span className="tchip tchip-flat" style={couleurDe(JETON_PRESENCE[agent.etat])}>
              <span>
                {agent.etat === "conge"
                  ? (agent.typeConge ?? t("presence.conge"))
                  : t(`presence.${agent.etat}`)}
              </span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Les trois jetons de `socle.css` — section « Présence & absences ». */
const JETON_PRESENCE: Record<api.PresenceAgent["etat"], string> = {
  present: "office",
  conge: "leave",
  teletravail: "telework",
};

/** `EX-DSH-07` — mes projets, retrouvés d'un clic. */
function MesProjets({ projets }: { projets: api.ProjetTableau[] }) {
  const { t } = useTranslation("tableau");
  const libelleDe = useLibelle();

  return (
    <section className="panel">
      <div className="panel-head">
        <span className="panel-title">{t("projets.titre")}</span>
        <a className="link link-sm" href="/projets">
          {t("projets.tous")}
        </a>
      </div>
      <div className="panel-body is-flush">
        {projets.length === 0 ? (
          <div className="empty">
            <p>{t("projets.vide")}</p>
            <small>{t("projets.videAide")}</small>
          </div>
        ) : (
          projets.slice(0, MAX_PROJETS_VISIBLES).map((projet) => (
            <a className="prow" href={`/projets/${projet.id}`} key={projet.id}>
              <Pastille icone={projet.icone} titre={projet.nom} />
              <div>
                <p className="prow-name">{projet.nom}</p>
                <span className="prow-role">
                  {libelleDe(projet.statut, STATUTS_PROJET)} ·{" "}
                  {t("projets.nTaches", { n: projet._count.taches })}
                </span>
                {/* `RG-PRJ-07` — la jauge de la maquette. La liste disait
                    jusqu'ici que ces projets existent ; elle dit maintenant
                    où ils en sont, ce qui est la question qu'on se pose en
                    les regardant. Le chiffre est à côté : une barre seule ne
                    se lit ni au clavier, ni en niveaux de gris. */}
                <div className="bar" aria-hidden="true">
                  <i style={{ width: `${projet.progression}%` }} />
                </div>
              </div>
              <span className="prow-pct">{t("projets.pourcent", { n: projet.progression })}</span>
            </a>
          ))
        )}
      </div>
    </section>
  );
}
