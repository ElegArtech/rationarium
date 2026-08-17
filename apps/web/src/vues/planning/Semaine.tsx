import { useState, type CSSProperties, type DragEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button, Menu, MenuItem, MenuTrigger, Popover, SubmenuTrigger } from "react-aria-components";
import { IconeProjet } from "../../composants/icones-projet.js";
import { Fenetre } from "../../composants/fenetre.js";
import { formaterDateAvecJour } from "../../formats.js";
import type { Planning, PersonnePlanning } from "../../api/planning.js";
import { CELLULE_VIDE, initiales, joursAffiches, type Cellule } from "./grille.js";
import { cleGroupe } from "./Planning.js";
import type { Selection } from "./Detail.js";

/**
 * Vue 07 — la grille personnes × jours.
 *
 * **Trois strates, dans cet ordre** :
 *
 * 1. l'**absence** occupe la cellule — quand quelqu'un est en congé, le reste
 *    n'a pas à se disputer la place ;
 * 2. le **lieu** est discret et cliquable (`EX-PLN-09`) ;
 * 3. les **occupations** portent la grammaire du produit : la couleur au
 *    statut, la pastille au projet, le filet interrompu au hors-projet.
 *
 * **`C6`** — chaque occupation est déplaçable à la souris **et** par un menu
 * clavier « Déplacer vers… » / « Réassigner à… ». Les deux chemins mènent à la
 * même mutation : il n'y a pas un geste principal et une alternative dégradée.
 */

const MAX_VISIBLES = 3;

export type Deplacement = {
  taskId: string;
  nouvelleDate?: string;
  nouvelAssigneId?: string;
  ancienAssigneId?: string;
};

export function GrilleSemaine({
  donnees,
  groupes,
  index,
  trame,
  replies,
  surReplier,
  personnes,
  teletravailModifiable,
  deplacementPossible,
  creationPossible,
  surSelection,
  surDeplacer,
  surBasculerTeletravail,
}: {
  donnees: Planning;
  groupes: { service: { id: string; nom: string } | null; personnes: PersonnePlanning[] }[];
  index: Map<string, Cellule>;
  trame: Map<string, { ferie: boolean; vacances: string | null }>;
  replies: ReadonlySet<string>;
  surReplier: (cle: string) => void;
  personnes: PersonnePlanning[];
  teletravailModifiable: boolean;
  deplacementPossible: boolean;
  /** `RG-GEN-06` — sans le droit de créer, le « + » de cellule n'est pas proposé. */
  creationPossible: boolean;
  surSelection: (s: Selection) => void;
  surDeplacer: (d: Deplacement) => void;
  surBasculerTeletravail: (userId: string, date: string, etat: string) => void;
}) {
  const { t } = useTranslation("planning");
  const [glisse, setGlisse] = useState<{ taskId: string; userId: string } | null>(null);
  const [cible, setCible] = useState<string | null>(null);

  // `RG-PLN-03` — les jours visibles suivent le paramétrage global.
  const jours = joursAffiches(donnees.periode.jours);
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const styleGrille = { "--cols": `210px repeat(${jours.length}, minmax(122px, 1fr))` } as CSSProperties;

  const deposer = (userId: string, date: string) => {
    if (!glisse) return;
    setCible(null);
    const changementAssigne = glisse.userId !== userId;
    surDeplacer({
      taskId: glisse.taskId,
      nouvelleDate: date,
      ...(changementAssigne ? { nouvelAssigneId: userId, ancienAssigneId: glisse.userId } : {}),
    });
    setGlisse(null);
  };

  return (
    // Un cadre défilant dont le contenu n'est ni lien ni bouton est
    // inatteignable au clavier — `axe` le refuse en « serious »
    // (`scrollable-region-focusable`). La maquette pose le même repère.
    <div className="pl-wrap" role="region" tabIndex={0} aria-label={t("grilleRegion")}>
      <div className="pl" style={styleGrille}>
        <div className="pl-corner">
          <span className="eyebrow">{t("colonneRessource")}</span>
        </div>

        {jours.map((jour) => {
          const info = trame.get(jour);
          const d = new Date(`${jour}T00:00:00.000Z`);
          const weekend = d.getUTCDay() === 0 || d.getUTCDay() === 6;
          return (
            <div
              key={jour}
              className={`pl-head${jour === aujourdhui ? " is-today" : ""}${weekend || info?.ferie ? " is-off" : ""}`}
            >
              <span className="pl-dow">{t(`jours.court.${d.getUTCDay()}`)}</span>
              <span className="pl-dnum">{jour.slice(8)}</span>
            </div>
          );
        })}

        {/* `EX-PLN-14` — la trame de fond est NOMMÉE, pas seulement teintée.
            Un aplat gris sans étiquette se prend pour un défaut d'affichage. */}
        <div className="pl-bandlab">
          <span className="eyebrow">{t("bandeau")}</span>
        </div>
        {jours.map((jour) => {
          const info = trame.get(jour);
          return (
            <div
              key={jour}
              className={`pl-bandcell${info?.ferie ? " is-ferie" : info?.vacances ? " is-vac" : ""}`}
            >
              {info?.ferie ? t("bandeauFerie") : (info?.vacances ?? "")}
            </div>
          );
        })}

        {groupes.map((groupe) => {
          const cle = cleGroupe(groupe);
          const replie = replies.has(cle);
          const nomGroupe = groupe.service?.nom ?? t("sansService");
          const tachesDuGroupe = groupe.personnes.reduce(
            (n, p) => n + jours.reduce((m, j) => m + (index.get(`${p.id}|${j}`)?.occupations.length ?? 0), 0),
            0,
          );

          return (
            <GroupeService
              key={cle || "sans"}
              cle={cle}
              nom={nomGroupe}
              personnes={groupe.personnes}
              replie={replie}
              tachesAgregees={tachesDuGroupe}
              surReplier={surReplier}
            >
              {groupe.personnes.map((personne) => (
                <LignePersonne
                  key={`${cle}-${personne.id}`}
                  personne={personne}
                  jours={jours}
                  index={index}
                  trame={trame}
                  aujourdhui={aujourdhui}
                  cible={cible}
                  personnes={personnes}
                  teletravailModifiable={teletravailModifiable}
                  deplacementPossible={deplacementPossible}
                  creationPossible={creationPossible}
                  surSelection={surSelection}
                  surDeplacer={surDeplacer}
                  surBasculerTeletravail={surBasculerTeletravail}
                  surGlisse={setGlisse}
                  surSurvolCible={setCible}
                  surDepot={deposer}
                />
              ))}
            </GroupeService>
          );
        })}

        {/* `EX-PLN-08` — la synthèse quotidienne « hors présentiel ». */}
        <div className="sum-lab">
          <span className="eyebrow">{t("synthese.titre")}</span>
        </div>
        {jours.map((jour) => {
          const s = donnees.synthese.find((x) => x.date === jour);
          const eleve = (s?.pourcentage ?? 0) >= 40;
          return (
            <div key={jour} className={`sum-cell${eleve ? " is-high" : ""}`}>
              <span className="sum-val">
                {s?.absents ?? 0}/{s?.total ?? 0}
              </span>
              <span className="sum-pct">{s?.pourcentage ?? 0} %</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GroupeService({
  cle,
  nom,
  personnes,
  replie,
  tachesAgregees,
  surReplier,
  children,
}: {
  cle: string;
  nom: string;
  personnes: PersonnePlanning[];
  replie: boolean;
  tachesAgregees: number;
  surReplier: (cle: string) => void;
  children: React.ReactNode;
}) {
  const { t } = useTranslation("planning");
  return (
    <>
      <div className="grp">
        <Button
          className="grp-caret"
          aria-expanded={!replie}
          onPress={() => surReplier(cle)}
          aria-label={t(replie ? "actions.deplierGroupe" : "actions.replierGroupe", { nom })}
        >
          <span aria-hidden="true">{replie ? "▸" : "▾"}</span>
        </Button>
        <span className="grp-name">{nom}</span>
        <span className="grp-meta">{t("groupe.effectif", { n: personnes.length })}</span>
        {/* Un groupe replié dit ce qu'il cache : sans ce compte, replier
            reviendrait à faire disparaître du travail. */}
        {replie ? (
          <span className="grp-meta">{t("groupe.replie", { n: tachesAgregees })}</span>
        ) : null}
      </div>
      {replie ? null : children}
    </>
  );
}

function LignePersonne({
  personne,
  jours,
  index,
  trame,
  aujourdhui,
  cible,
  personnes,
  teletravailModifiable,
  deplacementPossible,
  creationPossible,
  surSelection,
  surDeplacer,
  surBasculerTeletravail,
  surGlisse,
  surSurvolCible,
  surDepot,
}: {
  personne: PersonnePlanning;
  jours: string[];
  index: Map<string, Cellule>;
  trame: Map<string, { ferie: boolean; vacances: string | null }>;
  aujourdhui: string;
  cible: string | null;
  personnes: PersonnePlanning[];
  teletravailModifiable: boolean;
  deplacementPossible: boolean;
  creationPossible: boolean;
  surSelection: (s: Selection) => void;
  surDeplacer: (d: Deplacement) => void;
  surBasculerTeletravail: (userId: string, date: string, etat: string) => void;
  surGlisse: (g: { taskId: string; userId: string } | null) => void;
  surSurvolCible: (cle: string | null) => void;
  surDepot: (userId: string, date: string) => void;
}) {
  const { t } = useTranslation("planning");

  return (
    <>
      <div className="res">
        <span className="res-av" aria-hidden="true">
          {initiales(personne)}
        </span>
        <span className="res-name">
          {personne.prenom} {personne.nom}
        </span>
      </div>

      {jours.map((jour) => {
        const cellule = index.get(`${personne.id}|${jour}`) ?? CELLULE_VIDE;
        const cleCellule = `${personne.id}|${jour}`;
        const info = trame.get(jour);

        return (
          <div
            key={jour}
            className={`cell${jour === aujourdhui ? " is-today" : ""}${
              cible === cleCellule ? " is-drop" : ""
            }${info?.ferie ? " is-ferie" : info?.vacances ? " is-vac" : ""}`}
            onDragOver={(e: DragEvent) => {
              if (!deplacementPossible) return;
              e.preventDefault();
              surSurvolCible(cleCellule);
            }}
            onDragLeave={() => surSurvolCible(null)}
            onDrop={(e: DragEvent) => {
              e.preventDefault();
              surDepot(personne.id, jour);
            }}
          >
            {/* Strate 1 — l'absence occupe la cellule. */}
            {cellule.conge ? (
              <span
                className={`leave${cellule.conge.statut === "approved" ? "" : " leave-pending"}${
                  cellule.demiJournee ? " is-half" : ""
                }`}
                style={
                  cellule.conge.type.couleur
                    ? ({ "--leave": cellule.conge.type.couleur } as CSSProperties)
                    : undefined
                }
              >
                <span>{cellule.conge.type.nom}</span>
                {cellule.demiJournee ? (
                  <span className="leave-tag">{t(`demiJournee.${cellule.demiJournee}`)}</span>
                ) : null}
                {/* `EX-PLN-13` — la mention est textuelle : la trame et le
                    filet interrompu ne se lisent pas par tout le monde. */}
                {cellule.conge.statut !== "approved" ? (
                  <span className="leave-tag">{t("congeEnAttente")}</span>
                ) : null}
              </span>
            ) : null}

            {/* Strate 2 — le lieu. */}
            {!cellule.conge ? (
              <Lieu
                etat={cellule.lieu?.etat ?? null}
                modifiable={teletravailModifiable}
                nom={`${personne.prenom} ${personne.nom}`}
                date={jour}
                surBasculer={(etat) => surBasculerTeletravail(personne.id, jour, etat)}
              />
            ) : null}

            {/* Strate 3 — les occupations. */}
            {!cellule.conge
              ? cellule.occupations.slice(0, MAX_VISIBLES).map((o) => (
                  <Occupation
                    key={o.cle}
                    occupation={o}
                    personne={personne}
                    jour={jour}
                    jours={jours}
                    personnes={personnes}
                    deplacementPossible={deplacementPossible}
                    surSelection={surSelection}
                    surDeplacer={surDeplacer}
                    surGlisse={surGlisse}
                  />
                ))
              : null}

            {!cellule.conge && cellule.occupations.length > MAX_VISIBLES ? (
              <Button
                className="occ-more"
                onPress={() =>
                  surSelection({ genre: "cellule", cellule, personne, jour })
                }
              >
                {t("occupationsSupplementaires", {
                  n: cellule.occupations.length - MAX_VISIBLES,
                })}
              </Button>
            ) : null}

            {/* La maquette pose un « + » de création au coin de chaque
                cellule : créer se fait là où l'on regarde, sans remonter à
                la barre d'outils. Il n'apparaît qu'au survol et à la prise
                de focus — un « + » permanent sur cinq cents cellules serait
                du bruit. Masqué sans le droit (`RG-GEN-06`). */}
            {creationPossible ? (
              <a
                className="cell-add"
                href="/taches"
                aria-label={t("actions.creerIci", {
                  nom: `${personne.prenom} ${personne.nom}`,
                  date: jour,
                })}
              >
                <span aria-hidden="true">+</span>
              </a>
            ) : null}
          </div>
        );
      })}
    </>
  );
}

/**
 * `EX-PLN-09`, `RG-PLN-04` — le lieu se bascule depuis la cellule.
 *
 * Sans la permission, le marqueur reste **lisible mais inerte**, et il dit
 * pourquoi au survol : « Lecture seule — permission requise ». Le masquer
 * ferait croire que l'information n'existe pas.
 */
function Lieu({
  etat,
  modifiable,
  nom,
  date,
  surBasculer,
}: {
  etat: string | null;
  modifiable: boolean;
  nom: string;
  date: string;
  surBasculer: (etat: string) => void;
}) {
  const { t } = useTranslation("planning");
  const classe = etat === "telework" ? " is-tt" : etat === "office" ? " is-office" : "";
  const libelle = etat ? t(`presence.${etat}`) : t("presence.nonDeclare");

  if (!modifiable) {
    return (
      <span className={`pres is-locked${classe}`} title={t("teletravailLectureSeule")}>
        <span className="pres-dot" aria-hidden="true" />
        <span>{libelle}</span>
      </span>
    );
  }

  // Le cycle est explicite : non déclaré → télétravail → bureau → non déclaré.
  const suivant = etat === "telework" ? "office" : etat === "office" ? "undeclared" : "telework";

  return (
    <Button
      className={`pres${classe}`}
      aria-label={t("actions.basculerTeletravail", {
        nom,
        date,
        etat: libelle,
        suivant: t(`presence.${suivant === "undeclared" ? "nonDeclare" : suivant}`),
      })}
      onPress={() => surBasculer(suivant)}
    >
      <span className="pres-dot" aria-hidden="true" />
      <span>{libelle}</span>
    </Button>
  );
}

/**
 * Une occupation, et **les deux chemins pour la déplacer**.
 *
 * `C6` — le glisser-déposer est doublé d'un menu. Les libellés « Déplacer
 * vers… » et « Réassigner à… » sont ceux de la règle, mot pour mot.
 */
function Occupation({
  occupation,
  personne,
  jour,
  jours,
  personnes,
  deplacementPossible,
  surSelection,
  surDeplacer,
  surGlisse,
}: {
  occupation: import("./grille.js").Occupation;
  personne: PersonnePlanning;
  jour: string;
  jours: string[];
  personnes: PersonnePlanning[];
  deplacementPossible: boolean;
  surSelection: (s: Selection) => void;
  surDeplacer: (d: Deplacement) => void;
  surGlisse: (g: { taskId: string; userId: string } | null) => void;
}) {
  const { t } = useTranslation("planning");

  /*
   * La date choisie librement, hors de la semaine affichée.
   *
   * Les hooks sont déclarés AVANT les retours anticipés ci-dessous : un
   * événement et une permanence sortent plus tôt, et React exige un ordre
   * d'appel constant.
   */
  const [fenetreDate, setFenetreDate] = useState(false);
  const [dateLibre, setDateLibre] = useState("");

  if (occupation.genre === "evenement") {
    const e = occupation.evenement;
    return (
      <Button
        className="occ is-flat"
        style={{ color: "var(--event)" }}
        onPress={() => surSelection({ genre: "evenement", evenement: e })}
      >
        <span>{e.titre}</span>
        {/* `RG-EVT-06` — l'intervention extérieure est signalée distinctement. */}
        {e.interventionExterieure ? (
          <span className="occ-ext">{t("interventionExterieure")}</span>
        ) : null}
      </Button>
    );
  }

  if (occupation.genre === "permanence") {
    const p = occupation.permanence;
    return (
      <span
        className="occ is-flat"
        style={
          p.predefinedTask.couleur
            ? ({ color: p.predefinedTask.couleur } as CSSProperties)
            : // La maquette colore la permanence par `--activity`. Le repli
              // visait `--st-activity`, qui n'existe pas : la pastille
              // retombait sur l'accent et se confondait avec le reste.
              { color: "var(--activity)" }
        }
      >
        <span>{p.predefinedTask.nom}</span>
      </span>
    );
  }

  const tache = occupation.tache;
  /*
   * La pastille de projet est le SYMBOLE du référentiel, pas son code.
   * Le cadre posait `<i class="pglyph">{icone}</i>`, ce qui affichait la
   * chaîne « p-screen » en toutes lettres dans la cellule : la maquette y
   * dessine `<svg class="pgi"><use href="#p-screen"/></svg>`. `IconeProjet`
   * porte ce balisage, et il est déjà celui du tableau de bord.
   */
  const contenu = (
    <>
      {tache.project ? (
        <IconeProjet icone={tache.project.icone} nom={tache.project.nom} petite />
      ) : null}
      <span>{tache.titre}</span>
    </>
  );

  if (!deplacementPossible) {
    return (
      <Button
        className={`occ${tache.horsProjet ? " is-indep" : ""}`}
        style={{ color: `var(--st-${tache.statut})` }}
        onPress={() => surSelection({ genre: "tache", tache })}
      >
        {contenu}
      </Button>
    );
  }

  /*
   * Les deux listes du menu, calculées AVANT le rendu — parce qu'une liste vide
   * ne doit pas produire un sous-menu vide, mais une raison.
   *
   * Portée : le brief de la vue 07 définit le déplacement comme « autre colonne »
   * et « autre ligne ». Le menu étant le doublage clavier du glisser (`C6`), il
   * mime cette portée — pour les DATES, c'est le chemin rapide, doublé d'une
   * entrée « Une autre date… » qui ouvre le choix libre : aucune règle ne borne
   * la date d'une tâche à la semaine affichée.
   *
   * Pour les AGENTS, la portée reste la grille. Le brief dit « autre ligne », et
   * `RG-TSK-15` — les membres du projet — vaut là où l'on CHOISIT un assigné,
   * c'est-à-dire le formulaire de tâche, qui l'applique déjà.
   */
  const joursCibles = jours.filter((j) => j !== jour);

  /*
   * `RG-GEN-06` — une action interdite n'est jamais proposée puis refusée. Les
   * agents DÉJÀ assignés à la tâche étaient offerts : le serveur les refusait
   * ensuite au titre de `RG-PLN-06` (« l'assignation d'un agent déjà affecté est
   * refusée »). Le filtre ne retirait que la personne de la ligne courante, ce
   * qui suffisait sur une tâche à un seul assigné et laissait passer les autres
   * sur une tâche multi-assignée. `RG-PLN-06` reste le filet côté serveur.
   */
  const agentsCibles = personnes.filter(
    (p) => p.id !== personne.id && !tache.assignes.includes(p.id),
  );

  return (
    <>
    <MenuTrigger>
      {/* `react-aria-components` ne relaie pas les gestionnaires de glissement :
          l'enveloppe les porte. Le bouton reste le point d'entrée clavier — le
          menu s'ouvre au clic ET à l'entrée, comme partout ailleurs. C'est
          exactement ce que `C6` demande : deux chemins, pas une traînée
          simulée. */}
      <span
        draggable
        onDragStart={() => surGlisse({ taskId: tache.id, userId: personne.id })}
        onDragEnd={() => surGlisse(null)}
        style={{ display: "contents" }}
      >
        <Button
          className={`occ${tache.horsProjet ? " is-indep" : ""}`}
          style={{ color: `var(--st-${tache.statut})` }}
        >
          {contenu}
        </Button>
      </span>
      {/* `.pop.pop-sm` + `.pop-action` : le vocabulaire que la maquette donne à
          une liste d'actions flottante (`07 § 7`, menu utilisateur et menu
          « Créer »). Ce menu-ci n'existe dans aucune maquette — il naît de `C6`,
          qui exige un doublage clavier du glisser-déposer — mais un composant
          sans référence n'autorise pas un style sans référence : il emprunte
          l'idiome le plus proche, celui-là, comme le font déjà la coquille, les
          rapports et la vue 27. */}
      <Popover>
        <Menu className="pop pop-sm">
          <MenuItem
            className="pop-action"
            id="detail"
            onAction={() => surSelection({ genre: "tache", tache })}
          >
            {t("actions.voirDetail")}
          </MenuItem>

          {/* `RG-TSK-11` — sur une tâche multi-assignée, la date ne se déplace
              pas depuis le planning. L'action est absente, et la raison est
              dite : proposer puis refuser ferait perdre le geste. */}
          {tache.multiAssignee ? (
            <MenuItem className="pop-action" id="raison" isDisabled>
              {t("actions.dateVerrouillee")}
            </MenuItem>
          ) : joursCibles.length === 0 ? (
            /*
             * `RG-PLN-03` autorise « au moins un jour » : avec un seul jour
             * affiché, il n'existe aucune autre colonne où déposer la tâche. Le
             * sous-menu s'ouvrait alors en languette VIDE de 190 × 2 px — une
             * zone blanche que `RG-GEN-04` interdit. On dit la raison, comme
             * pour la date verrouillée juste au-dessus (`RG-GEN-06`).
             */
            <MenuItem className="pop-action" id="sansJour" isDisabled>
              {t("actions.aucunAutreJour")}
            </MenuItem>
          ) : (
            <SubmenuTrigger>
              <MenuItem className="pop-action" id="deplacer">
                {t("actions.deplacerVers")}
              </MenuItem>
              <Popover>
                <Menu
                  className="pop pop-sm"
                  onAction={(cle) => {
                    if (cle === "autre") {
                      setDateLibre(tache.dateDebut ?? jour);
                      setFenetreDate(true);
                      return;
                    }
                    surDeplacer({ taskId: tache.id, nouvelleDate: String(cle) });
                  }}
                >
                  {joursCibles.map((j) => (
                    /* `RG-GEN-09` — la clé reste la date ISO, ce que l'appel
                       attend ; l'intitulé passe par le formatage global. Il
                       affichait « 2026-08-18 » : une valeur de transport
                       montrée à l'utilisateur. */
                    <MenuItem className="pop-action" key={j} id={j}>
                      {formaterDateAvecJour(j)}
                    </MenuItem>
                  ))}
                  {/*
                   * La sortie de la semaine.
                   *
                   * Les jours ci-dessus recopient la portée du glisser-déposer —
                   * « autre colonne », brief de la vue 07 — et c'est le chemin
                   * rapide. Mais AUCUNE règle ne borne la date d'une tâche à la
                   * semaine affichée : s'arrêter là était une limite héritée du
                   * geste à la souris, pas une contrainte métier. Cette entrée
                   * ouvre le choix libre.
                   */}
                  <MenuItem className="pop-action menu-sep" id="autre">
                    {t("actions.uneAutreDate")}
                  </MenuItem>
                </Menu>
              </Popover>
            </SubmenuTrigger>
          )}

          {agentsCibles.length === 0 ? (
            <MenuItem className="pop-action" id="sansAgent" isDisabled>
              {t("actions.aucunAutreAgent")}
            </MenuItem>
          ) : (
            <SubmenuTrigger>
              <MenuItem className="pop-action" id="reassigner">
                {t("actions.reassignerA")}
              </MenuItem>
              <Popover>
                {/*
                 * `.pop-list` — le primitif de défilement de la maquette
                 * (`07 § 7`, la liste de notifications). Sans lui, la liste des
                 * agents n'avait ni `max-height` ni `overflow` : rangée de 38 px
                 * contre un survol plafonné à ~600 px, donc au-delà d'une
                 * quinzaine d'agents les dernières entrées débordaient de leur
                 * boîte sans qu'aucun défilement permette de les atteindre. Le
                 * brief prend pour référence « 20 lignes × 5 colonnes ».
                 */}
                <Menu
                  className="pop pop-sm pop-list"
                  onAction={(cle) =>
                    surDeplacer({
                      taskId: tache.id,
                      nouvelAssigneId: String(cle),
                      ancienAssigneId: personne.id,
                    })
                  }
                >
                  {agentsCibles.map((p) => (
                    <MenuItem className="pop-action" key={p.id} id={p.id}>
                      {p.prenom} {p.nom}
                    </MenuItem>
                  ))}
                </Menu>
              </Popover>
            </SubmenuTrigger>
          )}
        </Menu>
      </Popover>
    </MenuTrigger>

    {/*
     * Le choix libre de la date. `Fenetre` porte déjà le piège de focus, le
     * retour au déclencheur et la prise de focus sur le premier champ.
     *
     * Le champ est un `<input type="date">`, la convention du produit — 23
     * emplois ailleurs. `DESIGN.md § 2` inscrit bien un sélecteur de dates
     * `react-aria`, mais il n'est employé nulle part : introduire ici le premier
     * ferait deux écritures pour un même geste.
     */}
    <Fenetre
      ouverte={fenetreDate}
      surFermeture={() => setFenetreDate(false)}
      categorie={t("actions.deplacerVers")}
      titre={tache.titre}
      mention={t("fenetreDate.mention")}
      actions={
        <>
          <Button className="btn btn-secondary" onPress={() => setFenetreDate(false)}>
            {t("annuler")}
          </Button>
          <Button
            className="btn btn-primary"
            isDisabled={!dateLibre}
            onPress={() => {
              if (!dateLibre) return;
              surDeplacer({ taskId: tache.id, nouvelleDate: dateLibre });
              setFenetreDate(false);
            }}
          >
            {t("actions.deplacer")}
          </Button>
        </>
      }
    >
      <div className="field-block">
        <label className="field-label" htmlFor={`pl-date-${tache.id}-${personne.id}`}>
          {t("fenetreDate.nouvelleDate")}
        </label>
        <input
          className="field"
          id={`pl-date-${tache.id}-${personne.id}`}
          type="date"
          value={dateLibre}
          onChange={(e) => setDateLibre(e.target.value)}
        />
      </div>
    </Fenetre>
    </>
  );
}
