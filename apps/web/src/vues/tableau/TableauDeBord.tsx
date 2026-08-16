import { useState, type CSSProperties, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Tab, TabList, TabPanel, Tabs } from "react-aria-components";
import { STATUTS_TACHE } from "@trame/contracts";
import * as api from "../../api/tableau.js";
import * as apiTaches from "../../api/taches.js";
import { saisirTemps, validerSansDeclaration } from "../../api/occupations.js";
import { messageErreur } from "../../api/erreurs.js";
import { useSession, usePeut } from "../../session/session.js";
import { Chargement, ErreurDeChargement, AccesRefuse } from "../../composants/etats.js";
import { useMessages } from "../../composants/messages.js";
import { formaterDate } from "../../formats.js";
import { CELLULE_VIDE, indexer, COUCHES_PAR_DEFAUT } from "../planning/grille.js";
import "../../composants/partages.css";

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
 * Le CSS de cette vue vit dans `coquille/coquille.css` : les sections 8 et 9 de
 * la maquette y ont été portées au L-05, parce que c'est la vue 06 qui les
 * introduit et que la coquille les partage.
 */

const MAX_PROJETS_VISIBLES = 5;

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
          c'est ce qui dit que la page parle de vous et pas de l'instance. */}
      <div className="greet">
        <span className="eyebrow">{t("surtitre")}</span>
        <h1 className="h1">{t("bonjour", { prenom: session.prenom })}</h1>
        <p className="lede">{t("apercu")}</p>
      </div>

      <Indicateurs indicateurs={indicateurs} />

      <div className="dash-grid">
        <div>
          <MonPlanning planning={planning} />
          <MesTaches aVenir={taches.aVenir} nonDeclarees={taches.nonDeclarees} />
        </div>
        <div>
          <MaToDo todos={todos} />
          <MesProjets projets={projets} />
        </div>
      </div>
    </div>
  );
}

/**
 * `EX-DSH-02` — quatre indicateurs, chacun avec son dénominateur.
 *
 * « 3 » ne dit rien. « 3 sur 7 » situe. Le sous-titre n'est pas décoratif :
 * c'est lui qui rend le chiffre lisible.
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
          {t("kpi.pourcentageCompletees", { n: tachesTerminees.pourcentage })}
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

/** `EX-DSH-03` — l'extrait de planning personnel de la semaine. */
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
  // La semaine complète compte sept jours ; l'extrait n'en montre que cinq —
  // le brief cale la grille sur cinq colonnes, et le week-end d'un tableau de
  // bord personnel n'apprend rien.
  const jours = planning.periode.jours.slice(0, 5);

  return (
    <section className="panel">
      <div className="panel-head">
        <span className="panel-title">{t("planning.titre")}</span>
        <a className="chip-btn" href="/planning">
          {t("planning.ouvrir")}
        </a>
      </div>
      <div className="panel-body is-flush">
        <div className="week">
          {jours.map((jour) => {
            const cellule = moi ? (index.get(`${moi}|${jour}`) ?? CELLULE_VIDE) : CELLULE_VIDE;
            const d = new Date(`${jour}T00:00:00.000Z`);
            return (
              <div
                className={`week-col${jour === aujourdhui ? " is-today" : ""}`}
                key={jour}
              >
                <p className="week-day">
                  {t(`jours.court.${d.getUTCDay()}`)} {jour.slice(8)}
                </p>
                <div className="week-cell">
                  {cellule.conge ? (
                    <span className="tchip tchip-flat" style={{ color: "var(--leave)" }}>
                      <span>{cellule.conge.type.nom}</span>
                    </span>
                  ) : null}
                  {cellule.lieu?.etat === "telework" ? (
                    <span className="tchip tchip-flat" style={{ color: "var(--telework)" }}>
                      <span>{t("planning.teletravail")}</span>
                    </span>
                  ) : null}
                  {cellule.occupations.map((o) => (
                    <span
                      key={o.cle}
                      className={`tchip${
                        o.genre === "tache" && o.tache.horsProjet ? " tchip-indep" : ""
                      }`}
                      style={{
                        color:
                          o.genre === "tache"
                            ? `var(--st-${o.tache.statut})`
                            : o.genre === "evenement"
                              ? "var(--event)"
                              : "var(--accent)",
                      }}
                    >
                      <span>
                        {o.genre === "tache"
                          ? o.tache.titre
                          : o.genre === "evenement"
                            ? o.evenement.titre
                            : o.permanence.predefinedTask.nom}
                      </span>
                    </span>
                  ))}
                  {!cellule.conge && !cellule.lieu && cellule.occupations.length === 0 ? (
                    <span className="week-none">{t("planning.rien")}</span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/**
 * `EX-DSH-05`, `EX-DSH-06` — mes tâches, et de quoi agir sans changer de page.
 *
 * Deux onglets pour deux gestes distincts : faire avancer, ou clore ce qui
 * traîne. Les mêler dans une seule liste mélangerait « ce que je dois faire »
 * et « ce que je dois déclarer », qui n'appellent pas la même décision.
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
              {t("taches.ongletAVenir")}
            </Tab>
            <Tab className="tab" id="nonDeclarees">
              {t("taches.ongletNonDeclarees")}
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

function LigneTache({ tache }: { tache: api.TacheAVenir }) {
  const { t } = useTranslation("tableau");
  const { t: tErreurs } = useTranslation("erreurs");
  const annoncer = useMessages();
  const client = useQueryClient();
  const [heures, setHeures] = useState("");

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
      setHeures("");
      void rafraichir();
    },
    onError: (e) => annoncer("err", messageErreur(e, tErreurs, t("taches.echecTemps"))),
  });

  /** Une frappe, puis Entrée. Le brief demande « une frappe », pas un parcours. */
  const valider = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    const valeur = Number(heures.replace(",", "."));
    if (!Number.isFinite(valeur) || valeur <= 0) return;
    saisie.mutate(valeur);
  };

  return (
    <div className="trow">
      <div className="bloc-etroit">
        <p className="trow-title">
          {tache.project?.icone ? (
            <i className="pglyph" aria-hidden="true">
              {tache.project.icone}
            </i>
          ) : null}
          <span>{tache.titre}</span>
          {/* `RG-DSH-04` — le marqueur est textuel autant que coloré. */}
          {tache.enRetard ? <span className="badge badge-late">{t("taches.enRetard")}</span> : null}
          {!tache.project ? (
            <span className="badge badge-indep">{t("taches.sansProjet")}</span>
          ) : null}
        </p>
        <span className="trow-meta">
          {tache.project?.nom ?? t("taches.sansProjet")}
          {tache.dateFin ? ` · ${formaterDate(tache.dateFin)}` : ""}
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
            {t(`statuts.${s.code}`)}
          </option>
        ))}
      </select>

      <div>
        <div className="hours">
          <input
            type="text"
            inputMode="decimal"
            aria-label={t("taches.heuresSur", { titre: tache.titre })}
            value={heures}
            onChange={(e) => setHeures(e.target.value)}
            onKeyDown={valider}
          />
          <span className="hours-unit">{t("taches.unite")}</span>
        </div>
        {/* `RG-TMP-07` — dire ce qui est DÉJÀ déclaré, tous contributeurs
            confondus : c'est ce qui évite de saisir deux fois trois heures
            parce qu'un collègue l'avait fait. */}
        {tache.heuresDeclarees > 0 ? (
          <span className="hours-note">
            {t("taches.dejaDeclare", { n: tache.heuresDeclarees })}
          </span>
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

  const renoncement = useMutation({
    mutationFn: () => validerSansDeclaration(tache.id),
    onSuccess: () => {
      annoncer("ok", t("taches.valideeSansDeclaration"));
      void client.invalidateQueries({ queryKey: ["tableau-de-bord"] });
    },
    onError: (e) => annoncer("err", messageErreur(e, tErreurs, t("taches.echecValidation"))),
  });

  return (
    <div className="trow">
      <div className="bloc-etroit">
        <p className="trow-title">
          <span>{tache.titre}</span>
        </p>
        <span className="trow-meta">
          {tache.projet ?? t("taches.sansProjet")}
          {tache.dateFin ? ` · ${formaterDate(tache.dateFin)}` : ""}
        </span>
      </div>
      <span />
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
  const echec = (e: unknown, defaut: string) =>
    annoncer("err", messageErreur(e, tErreurs, defaut));

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
        // action qui n'existe qu'à la souris n'existe pas.
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
        <span className="grp-meta">{t("todo.prive")}</span>
      </div>
      <div className="panel-body is-flush">
        {/* `RG-DSH-01` — la limite est ANNONCÉE avant d'être atteinte, pas
            découverte sur un champ qui ne répond plus. */}
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
            className="chip-btn"
            isDisabled={todos.limiteAtteinte || libelle.trim() === ""}
            onPress={() => ajout.mutate()}
          >
            {t("todo.ajouter")}
          </Button>
        </div>

        {todos.actives.length === 0 && todos.faites.length === 0 ? (
          <div className="empty">
            <p>{t("todo.vide")}</p>
            <small>{t("todo.videAide")}</small>
          </div>
        ) : null}

        {todos.actives.map(ligne)}

        {/* `RG-DSH-03` — les complétées à part, avec leur compte. */}
        {todos.faites.length > 0 ? (
          <>
            <p className="todo-sep">
              <span className="eyebrow">{t("todo.completees", { n: todos.faites.length })}</span>
            </p>
            {todos.faites.map(ligne)}
          </>
        ) : null}
      </div>
    </section>
  );
}

/** `EX-DSH-07` — mes projets, retrouvés d'un clic. */
function MesProjets({ projets }: { projets: api.ProjetTableau[] }) {
  const { t } = useTranslation("tableau");

  return (
    <section className="panel">
      <div className="panel-head">
        <span className="panel-title">{t("projets.titre")}</span>
        <a className="chip-btn" href="/projets">
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
              <i className="pglyph" aria-hidden="true">
                {projet.icone ?? "◆"}
              </i>
              <span className="bloc-etroit">
                <span className="prow-name">{projet.nom}</span>
                <span className="prow-role">
                  {t(`statutsProjet.${projet.statut}`)} ·{" "}
                  {t("projets.nTaches", { n: projet._count.taches })}
                </span>
              </span>
              <span className="prow-pct">{formaterDate(projet.dateFin)}</span>
            </a>
          ))
        )}
      </div>
    </section>
  );
}

/** Le style d'un jeton de couleur, quand la valeur vient de la donnée. */
export const couleurDe = (jeton: string): CSSProperties => ({ color: `var(--${jeton})` });
