import { useMemo, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Button, Menu, MenuItem, MenuTrigger, Popover } from "react-aria-components";
import { STATUTS_TACHE } from "@rationarium/contracts";
import * as api from "../../api/planning.js";
import { ErreurApi } from "../../api/client.js";
import { messageErreur } from "../../api/erreurs.js";
import { usePeut, useSession } from "../../session/session.js";
import { Chargement, ErreurDeChargement, AccesRefuse } from "../../composants/etats.js";
import { useMessages } from "../../composants/messages.js";
import { formaterDate, formaterMois } from "../../formats.js";
import {
  COUCHES_PAR_DEFAUT,
  decaler,
  indexer,
  iso,
  periodeDe,
  trameDesJours,
  type Couches,
  type Filtres,
} from "./grille.js";
import { teletravailModifiablePar } from "./droits.js";
import { adressePlanning, lirePlanning } from "./adresse.js";
import { GrilleSemaine } from "./Semaine.js";
import { GrilleMois } from "./Mois.js";
import { PanneauDetail, type Selection } from "./Detail.js";
import "../../composants/partages.css";
import "./semaine.css";
import "./mois.css";

/**
 * Vues 07 et 08 — le planning unifié, semaine et mois.
 *
 * **C'est la vue centrale du produit.** Le problème de conception principal est
 * énoncé dans le brief : une cellule peut porter six informations de natures
 * différentes, sur vingt lignes et cinq à vingt-deux colonnes, sans devenir
 * illisible. La réponse tient en trois dispositifs, et aucun n'est décoratif :
 *
 * 1. **Trois strates** par cellule — absence, lieu, occupations —, dessinées
 *    dans cet ordre parce qu'une absence rend le reste sans objet.
 * 2. **Des couches activables** (`EX-PLN-06`) et une **légende filtrante**
 *    (`EX-PLN-07`) : ce sont les soupapes, et le brief exige qu'elles soient
 *    immédiatement accessibles, pas enfouies.
 * 3. **Le repli par service** (`EX-PLN-04`), qui rend vingt lignes à cinq.
 *
 * **`C6` — le glisser-déposer est toujours doublé d'une action au clavier.**
 * Chaque occupation porte un menu « Déplacer vers… » / « Réassigner à… ».
 * Ce n'est pas une traînée simulée : c'est une action découvrable, annonçable
 * et testable. Une grille qui ne se manipule qu'à la souris exclut, purement.
 */

const AUJOURDHUI = () => iso(new Date());

const TOUS_STATUTS = STATUTS_TACHE.map((s) => s.code);

const FILTRES_COMPLETS: Filtres = {
  statuts: new Set(TOUS_STATUTS),
  typesTache: new Set(["projet", "hors_projet"]),
  presence: new Set(["office", "telework"]),
  absences: new Set(["valide", "attente"]),
  evenements: new Set(["interne", "externe"]),
};

type Mode = "semaine" | "mois";

export function Planning({ mode }: { mode: Mode }) {
  const { t } = useTranslation("planning");
  const { t: tErreurs } = useTranslation("erreurs");
  const peut = usePeut();
  const { session } = useSession();
  const annoncer = useMessages();
  const client = useQueryClient();

  /*
   * `EX-PLN-01` — **la période et les filtres vivent dans l'adresse.**
   *
   * « Semaine / Mois / Activité » est un mode d'affichage d'une même vue, avec
   * une seule barre de filtres : tout garder en `useState` local faisait
   * repartir de zéro à chaque changement de mode. Voir `adresse.ts`.
   */
  const navigate = useNavigate();
  const brut = useRouterState({ select: (e) => e.location.search }) as Record<string, unknown>;
  const aujourdhui = AUJOURDHUI();
  /*
   * `useMemo` : `couches` alimente la dépendance de `indexer`, qui reconstruit
   * quatre cent quarante cellules. Un objet neuf à chaque rendu referait ce
   * travail pour rien, à chaque frappe dans la barre de recherche.
   */
  const etat = useMemo(() => lirePlanning(brut, aujourdhui), [brut, aujourdhui]);
  const { ancre, departementId, monPerimetre, couches } = etat;
  const services: ReadonlySet<string> = useMemo(() => new Set(etat.services), [etat.services]);

  /*
   * La recherche tient sa valeur EN LOCAL pendant la frappe.
   *
   * Le champ est à valeurs rapprochées : lu depuis l'adresse, chaque caractère
   * attendrait un aller-retour du routeur pour s'afficher, et une frappe
   * rapide en perdrait. C'est la même règle que le curseur d'avancement de la
   * vue 17 — la valeur est locale pendant le geste, l'adresse suit.
   */
  const [recherche, setRechercheLocale] = useState(etat.recherche);

  /*
   * `replace` : régler un filtre n'est pas une navigation qu'on veut défaire
   * pas à pas. Changer de PÉRIODE en est une — c'est le geste que le retour
   * arrière doit annuler —, d'où le paramètre.
   */
  const majEtat = (partiel: Partial<typeof etat>, empiler = false) => {
    void navigate({
      to: ".",
      search: adressePlanning({ ...etat, ...partiel }, aujourdhui),
      replace: !empiler,
    });
  };
  const setAncre = (a: string) => majEtat({ ancre: a }, true);
  const setServices = (v: ReadonlySet<string>) => majEtat({ services: [...v] });
  const setDepartementId = (v: string) => majEtat({ departementId: v });
  const setRecherche = (v: string) => {
    setRechercheLocale(v);
    majEtat({ recherche: v });
  };
  const setMonPerimetre = (v: boolean) => majEtat({ monPerimetre: v });
  const setCouches = (c: Couches) => majEtat({ couches: c });

  /*
   * `RG-GEN-06` — **deux droits, pas un.** Créer une tâche DANS un projet et
   * créer une tâche hors projet sont deux permissions distinctes
   * (`TachesService.creer` : `tasks:create` ou `tasks:create_standalone`
   * selon le rattachement), et `SOCLE` porte la seconde sans la première. Le
   * « + » d'une cellule crée une tâche hors projet : le masquer sur la seule
   * `tasks:create` le retirait à ceux-là mêmes à qui il est destiné.
   */
  const peutCreerUneTache = peut("tasks:create") || peut("tasks:create_standalone");

  const [filtres, setFiltres] = useState<Filtres>(FILTRES_COMPLETS);
  const [replies, setReplies] = useState<ReadonlySet<string>>(new Set());
  const [selection, setSelection] = useState<Selection | null>(null);

  const periode = periodeDe(mode, ancre);

  const requete = useQuery({
    queryKey: ["planning", periode.debut, periode.fin, [...services], departementId, monPerimetre],
    queryFn: () =>
      api.planning({
        debut: periode.debut,
        fin: periode.fin,
        ...(services.size ? { services: [...services] } : {}),
        ...(departementId ? { departementId } : {}),
        ...(monPerimetre ? { monPerimetre: true } : {}),
      }),
  });

  /**
   * `RG-PLN-05` — si l'écriture aboutit mais que le rafraîchissement échoue,
   * l'utilisateur est averti que l'affichage peut être périmé. Le silence
   * serait pire que l'échec : il laisserait agir sur des données fausses.
   *
   * **`throwOnError` n'est pas un détail : sans lui, la règle était vide.**
   * `refetchQueries` résout sa promesse même quand les requêtes tombent —
   * l'échec vit dans l'état de chaque requête, pas dans le rejet. Le `catch`
   * ci-dessous n'était donc JAMAIS atteint : l'écriture aboutissait, la
   * relecture échouait, et l'utilisateur restait devant une grille périmée
   * sans un mot. Le commentaire décrivait exactement ce que le code ne faisait
   * pas — même famille que le contrôle de `RG-ADM-02` sur les rôles système.
   */
  const rafraichir = async () => {
    try {
      await client.refetchQueries({ queryKey: ["planning"] }, { throwOnError: true });
    } catch {
      annoncer("warn", t("erreurs.rafraichissement"));
    }
  };

  const deplacement = useMutation({
    mutationFn: api.deplacerTache,
    onSuccess: async (r) => {
      // Le serveur dit ce qui a EFFECTIVEMENT bougé. Annoncer « déplacée »
      // quand seule l'assignation a changé serait un mensonge d'un mot.
      if (r.avertissement === "multi_assignee_date") {
        annoncer("warn", t("erreurs.multiAssigneeDate"));
      } else if (r.avertissement === "multi_assignee_assigne_seul") {
        annoncer("warn", t("erreurs.multiAssigneeAssigne"));
      } else {
        annoncer("ok", t("messages.deplacee"));
      }
      await rafraichir();
    },
    onError: (e) => annoncer("err", messageErreur(e, tErreurs, t("erreurs.deplacement"))),
  });

  const bascule = useMutation({
    mutationFn: api.basculerTeletravail,
    onSuccess: async () => {
      annoncer("ok", t("messages.teletravailBascule"));
      await rafraichir();
    },
    onError: (e) => annoncer("err", messageErreur(e, tErreurs, t("erreurs.teletravail"))),
  });

  const donnees = requete.data;

  const index = useMemo(
    () => (donnees ? indexer(donnees, couches, filtres) : new Map()),
    [donnees, couches, filtres],
  );
  const trame = useMemo(() => (donnees ? trameDesJours(donnees) : new Map()), [donnees]);

  /** La recherche par ressource se fait ici : elle n'a pas à repartir au serveur. */
  const groupes = useMemo(() => {
    if (!donnees) return [];
    const terme = recherche.trim().toLowerCase();
    if (!terme) return donnees.groupes;
    return donnees.groupes
      .map((g) => ({
        ...g,
        personnes: g.personnes.filter((p) =>
          `${p.prenom} ${p.nom}`.toLowerCase().includes(terme),
        ),
      }))
      .filter((g) => g.personnes.length > 0);
  }, [donnees, recherche]);

  /*
   * `RG-ADM-03` — **l'accès refusé est tracé, et c'est le SERVEUR qui le
   * trace.**
   *
   * La vue portait `enabled: peut("planning:read")` et rendait ce refus
   * **avant tout appel** : aucune requête n'atteignait le serveur, donc
   * `permissions.garde.ts` — le seul endroit du produit qui trace un refus —
   * n'avait rien à refuser et rien à tracer. La règle vivait au serveur, juste
   * et prouvée, et le client la rendait inatteignable. Neuf vues ont été
   * corrigées d'un même geste ; celle-ci et `Activite.tsx` étaient restées.
   *
   * La requête part donc toujours, et c'est le `403` reçu qui prononce le
   * refus. Le masque de courtoisie de `RG-GEN-06` porte sur les COMMANDES —
   * on ne propose pas une écriture qui sera refusée ; il ne porte pas sur la
   * lecture d'une vue entière, qui est précisément l'accès dont `RG-ADM-03`
   * veut la trace.
   *
   * Aucune boucle de reprise à craindre : `main.tsx` ne réessaie pas une
   * réponse en dessous de 500.
   */
  if (requete.error instanceof ErreurApi && requete.error.statut === 403)
    return <AccesRefuse />;

  const servicesConnus = donnees
    ? [
        ...new Map(
          donnees.groupes
            .filter((g) => g.service !== null)
            .map((g) => [g.service!.id, g.service!]),
        ).values(),
      ]
    : [];

  const departements = donnees
    ? [
        ...new Map(
          donnees.groupes
            .flatMap((g) => g.personnes)
            .filter((p) => p.departement)
            .map((p) => [p.departement!.id, p.departement!]),
        ).values(),
      ]
    : [];

  const reinitialiser = () => {
    majEtat({
      services: [],
      departementId: "",
      recherche: "",
      monPerimetre: false,
      couches: COUCHES_PAR_DEFAUT,
    });
    setRechercheLocale("");
    setFiltres(FILTRES_COMPLETS);
  };

  const personnes = groupes.flatMap((g) => g.personnes);

  return (
    <div className="page">
      {/*
        `cadrage/01 § 7` — le planning dispose d'une mise en page imprimable.
        L'en-tête n'existe qu'à l'impression : à l'écran, la barre d'outils dit
        déjà la période. Sur papier, une feuille sans date ni périmètre est
        inexploitable dès qu'elle a quitté la main de qui l'a imprimée.
      */}
      <div className="print-head">
        <p className="print-title">{t("titre")}</p>
        <p className="print-meta">
          {mode === "mois"
            ? t("navigation.libelle_mois", { mois: formaterMois(periode.debut) })
            : t("navigation.libelle_semaine", {
                debut: formaterDate(periode.debut),
                fin: formaterDate(periode.fin),
              })}
        </p>
      </div>

      <BarreOutils
        mode={mode}
        periode={periode}
        ancre={ancre}
        surAncre={setAncre}
        filtresExport={{
          debut: periode.debut,
          fin: periode.fin,
          ...(services.size ? { services: [...services] } : {}),
          ...(monPerimetre ? { monPerimetre: true } : {}),
        }}
        recherche={adressePlanning(etat, aujourdhui)}
      />

      <div className="filters">
        <MenuTrigger>
          <Button className="f-input">
            {services.size === 0
              ? t("filtres.tousServices")
              : t("filtres.nServices", { n: services.size })}
          </Button>
          <Popover>
            <Menu
              className="pop pop-sm"
              selectionMode="multiple"
              selectedKeys={services}
              onSelectionChange={(cles) => setServices(new Set([...cles].map(String)))}
            >
              {servicesConnus.map((s) => (
                <MenuItem className="pop-action" key={s.id} id={s.id}>
                  {s.nom}
                </MenuItem>
              ))}
            </Menu>
          </Popover>
        </MenuTrigger>

        <select
          className="f-input"
          aria-label={t("filtres.departement")}
          value={departementId}
          onChange={(e) => setDepartementId(e.target.value)}
        >
          <option value="">{t("filtres.tousDepartements")}</option>
          {departements.map((d) => (
            <option key={d.id} value={d.id}>
              {d.nom}
            </option>
          ))}
        </select>

        {/* `EX-PLN-05` — se restreindre à son périmètre est un confort de
            lecture, pas un contrôle : le contrôle est au serveur. */}
        <Button
          className="chip-btn"
          aria-pressed={monPerimetre}
          onPress={() => setMonPerimetre(!monPerimetre)}
        >
          {t("filtres.monPerimetre")}
        </Button>

        <input
          className="f-input filtre-recherche"
          type="search"
          aria-label={t("filtres.ressource")}
          placeholder={t("filtres.ressourcePlaceholder")}
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
        />

        <span className="vsep" />

        <div className="layers">
          {(
            [
              ["disponibilites", t("couches.disponibilites")],
              ["activites", t("couches.activites")],
              ["tachesProjet", t("couches.tachesProjet")],
              ["tachesHorsProjet", t("couches.tachesHorsProjet")],
              ["evenements", t("couches.evenements")],
            ] as const
          ).map(([cle, libelle]) => (
            <label key={cle} className={`layer${couches[cle] ? " is-on" : ""}`}>
              <input
                type="checkbox"
                checked={couches[cle]}
                onChange={(e) => setCouches({ ...couches, [cle]: e.target.checked })}
              />
              <span>{libelle}</span>
            </label>
          ))}
        </div>

        <span className="vsep" />

        <Button className="chip-btn" onPress={() => setReplies(new Set(groupes.map(cleGroupe)))}>
          {t("actions.toutReplier")}
        </Button>
        <Button className="chip-btn" onPress={() => setReplies(new Set())}>
          {t("actions.toutDeplier")}
        </Button>
      </div>

      {requete.isPending ? (
        <div className="pl-wrap" role="region" tabIndex={0} aria-label={t("grilleRegion")}>
          <Chargement quoi={t("leplanning")} />
        </div>
      ) : null}

      {requete.isError ? (
        <ErreurDeChargement erreur={requete.error} surReessai={() => void requete.refetch()} />
      ) : null}

      {donnees ? (
        groupes.length === 0 ? (
          <div className="pl-wrap" role="region" tabIndex={0} aria-label={t("grilleRegion")}>
            <div className="pl-empty">
              <p>{t("vide.titre")}</p>
              {/* Le brief le dit : l'état vide vient le plus souvent des
                  filtres. Le proposer explicitement évite de chercher
                  ailleurs une cause qui est sous la main. */}
              <small>{t("vide.explication")}</small>
              <p className="ligne-actions">
                <Button className="chip-btn" onPress={reinitialiser}>
                  {t("vide.reinitialiser")}
                </Button>
              </p>
            </div>
          </div>
        ) : mode === "semaine" ? (
          <GrilleSemaine
            donnees={donnees}
            groupes={groupes}
            index={index}
            trame={trame}
            replies={replies}
            surReplier={(cle) =>
              setReplies((r) => {
                const suivant = new Set(r);
                if (suivant.has(cle)) suivant.delete(cle);
                else suivant.add(cle);
                return suivant;
              })
            }
            personnes={personnes}
            teletravailModifiable={(userId) =>
              teletravailModifiablePar(peut, session.id, userId)
            }
            deplacementPossible={peut("tasks:update")}
            creationPossible={peutCreerUneTache}
            surSelection={setSelection}
            surDeplacer={(donnees) => deplacement.mutate(donnees)}
            surBasculerTeletravail={(userId, date, etat) =>
              bascule.mutate({ userId, date, etat })
            }
          />
        ) : (
          <GrilleMois
            donnees={donnees}
            groupes={groupes}
            index={index}
            trame={trame}
            replies={replies}
            surReplier={(cle) =>
              setReplies((r) => {
                const suivant = new Set(r);
                if (suivant.has(cle)) suivant.delete(cle);
                else suivant.add(cle);
                return suivant;
              })
            }
            surSelection={setSelection}
          />
        )
      ) : null}

      {/* Maquette 08 — la vue Mois est muette par construction : sans cette
          phrase, rien ne dit que le détail existe et comment l'atteindre. */}
      {mode === "mois" ? <p className="field-hint">{t("mois.indication")}</p> : null}

      <Legende
        filtres={filtres}
        surFiltres={setFiltres}
        couches={couches}
        surCouches={setCouches}
      />

      <PanneauDetail
        selection={selection}
        genreParDefaut={mode === "mois" ? "cellule" : "tache"}
        surFermer={() => setSelection(null)}
      />
    </div>
  );
}

export const cleGroupe = (g: { service: { id: string } | null }): string => g.service?.id ?? "";

const CHEMIN_MODE = {
  semaine: "/planning",
  mois: "/planning/mois",
  activite: "/planning/activite",
} as const;

/**
 * `EX-PLN-01` — le sélecteur de mode, **partagé par les vues 07, 08 et 09**.
 *
 * Deux défauts tenaient à ce qu'il était recopié dans deux fichiers :
 *
 *  - il posait une **ancre nue**, donc chaque changement de mode rechargeait
 *    le document entier — le lot, la session, les réglages, le compteur de
 *    notifications ;
 *  - il ne transmettait rien, donc la période et les filtres repartaient de
 *    zéro. Le mode se change désormais **avec l'adresse courante**.
 *
 * Un lien n'est pas un bouton bascule : `aria-pressed` y est interdit, et
 * `axe` le refuse en « critique ». L'état courant d'une navigation se dit par
 * `aria-current`, et par lui seul.
 */
export function SelecteurMode({
  mode,
  recherche,
}: {
  mode: Mode | "activite";
  recherche: Record<string, string>;
}) {
  const { t } = useTranslation("planning");
  return (
    <div className="seg" role="group" aria-label={t("modes.groupe")}>
      {(["semaine", "mois", "activite"] as const).map((m) => (
        <Link
          key={m}
          to={CHEMIN_MODE[m]}
          search={recherche}
          /*
           * **`exact`, sinon deux segments sur trois s'affichent courants.**
           *
           * `Link` pose son propre `aria-current` dès qu'il se juge actif, et
           * son appariement est un PRÉFIXE par défaut : `/planning` est un
           * préfixe de `/planning/mois` et de `/planning/activite`. Sur la vue
           * Mois, « Semaine » et « Mois » portaient tous deux
           * `aria-current="page"` — et comme le socle peint ce sélecteur sur
           * cet attribut, l'état visuel était faux autant que l'annonce.
           */
          activeOptions={{ exact: true }}
          aria-current={m === mode ? "page" : undefined}
        >
          {t(`modes.${m}`)}
        </Link>
      ))}
    </div>
  );
}

/** La barre d'outils : mode, navigation, période, export, création. */
function BarreOutils({
  mode,
  periode,
  ancre,
  surAncre,
  filtresExport,
  recherche,
}: {
  mode: Mode;
  periode: { debut: string; fin: string };
  ancre: string;
  surAncre: (a: string) => void;
  filtresExport: api.FiltresPlanning;
  /** L'adresse courante, que le changement de mode emporte avec lui. */
  recherche: Record<string, string>;
}) {
  const { t } = useTranslation("planning");
  const peut = usePeut();
  const navigate = useNavigate();
  /* Deux droits, pas un — voir le commentaire de `Planning`. */
  const peutCreerUneTache = peut("tasks:create") || peut("tasks:create_standalone");

  return (
    <div className="pl-toolbar">
      <h1 className="h1 titre-vue">{t("titre")}</h1>

      <SelecteurMode mode={mode} recherche={recherche} />

      <div className="pl-nav">
        <Button
          className="nav-sq"
          aria-label={t(`navigation.precedent_${mode}`)}
          onPress={() => surAncre(decaler(mode, ancre, -1))}
        >
          <span aria-hidden="true">‹</span>
        </Button>
        <Button
          className="nav-sq"
          aria-label={t(`navigation.suivant_${mode}`)}
          onPress={() => surAncre(decaler(mode, ancre, 1))}
        >
          <span aria-hidden="true">›</span>
        </Button>
        <Button className="chip-btn" onPress={() => surAncre(AUJOURDHUI())}>
          {t("navigation.aujourdhui")}
        </Button>
      </div>

      <span className="pl-period">
        {mode === "mois"
          ? t("navigation.libelle_mois", { mois: formaterMois(periode.debut) })
          : t("navigation.libelle_semaine", {
              debut: formaterDate(periode.debut),
              fin: formaterDate(periode.fin),
            })}
      </span>

      <div className="ligne-actions-fin">
        {/* L'export part par le navigateur, pas par la mémoire : un fichier
            d'agenda se télécharge, il ne se lit pas dans une variable. */}
        {/* L'impression passe par le navigateur : c'est lui qui produit le
            PDF, et un second chemin de mise en page ferait diverger deux
            rendus du même contenu (décision de L-22, refermée en L-27). */}
        <Button className="chip-btn no-print" onPress={() => window.print()}>
          {t("actions.imprimer")}
        </Button>
        {peut("planning:export_ics") ? (
          <a className="chip-btn" href={api.adresseExportIcs(filtresExport)} download>
            {t("actions.exporterIcs")}
          </a>
        ) : null}
        {peutCreerUneTache || peut("events:create") ? (
          <MenuTrigger>
            <Button className="btn btn-primary">{t("actions.creer")}</Button>
            <Popover>
              <Menu className="pop pop-sm">
                {/*
                  **`onAction`, et non `href`.** Un `MenuItem` porteur d'un
                  `href` rend une ancre, et sans le `RouterProvider` de
                  react-aria cette ancre est brute : créer depuis la barre
                  d'outils RECHARGEAIT l'application entière.
                */}
                {peutCreerUneTache ? (
                  <MenuItem
                    className="pop-action"
                    id="tache"
                    onAction={() => void navigate({ to: "/taches", search: { creer: "1" } })}
                  >
                    {t("actions.creerTache")}
                  </MenuItem>
                ) : null}
                {peut("events:create") ? (
                  <MenuItem
                    className="pop-action"
                    id="evenement"
                    onAction={() => void navigate({ to: "/evenements" })}
                  >
                    {t("actions.creerEvenement")}
                  </MenuItem>
                ) : null}
              </Menu>
            </Popover>
          </MenuTrigger>
        ) : null}
      </div>
    </div>
  );
}

/**
 * `EX-PLN-07` — la légende **filtre**, elle ne décrit pas.
 *
 * Chaque entrée est un bouton à deux états, et son état éteint est signalé
 * par un barré autant que par la couleur : sur une légende de couleurs, la
 * couleur seule ne peut pas porter l'information « éteint ».
 */
function Legende({
  filtres,
  surFiltres,
  couches,
  surCouches,
}: {
  filtres: Filtres;
  surFiltres: (f: Filtres) => void;
  /* La permanence n'est pas filtrée par la légende mais par sa COUCHE : la
     légende commande donc les deux, sans quoi son entrée « Permanence »
     serait la seule à ne rien faire. */
  couches: Couches;
  surCouches: (c: Couches) => void;
}) {
  const { t } = useTranslation("planning");

  const sections: {
    cle: keyof Filtres;
    titre: string;
    entrees: { valeur: string; libelle: string; style: CSSProperties; classe?: string }[];
  }[] = [
    {
      cle: "statuts",
      titre: t("legende.statuts"),
      entrees: TOUS_STATUTS.map((code) => ({
        valeur: code,
        libelle: t(`statuts.${code}`),
        style: { color: `var(--st-${code === "todo" ? "todo" : code})` },
      })),
    },
    {
      cle: "typesTache",
      titre: t("legende.typesTache"),
      entrees: [
        { valeur: "projet", libelle: t("legende.tacheProjet"), style: { color: "var(--accent)" } },
        {
          valeur: "hors_projet",
          libelle: t("legende.tacheHorsProjet"),
          style: { color: "var(--accent)" },
          classe: "is-dashed",
        },
      ],
    },
    {
      cle: "presence",
      titre: t("legende.presence"),
      entrees: [
        // La légende nomme le marqueur plus longuement que la cellule :
        // « Bureau » dans une cellule de 122 px, « Bureau déclaré » ici.
        { valeur: "office", libelle: t("legende.presenceBureau"), style: { color: "var(--office)" } },
        { valeur: "telework", libelle: t("presence.telework"), style: { color: "var(--telework)" } },
      ],
    },
    {
      cle: "absences",
      titre: t("legende.absences"),
      entrees: [
        { valeur: "valide", libelle: t("legende.congeValide"), style: { color: "var(--leave)" }, classe: "is-flat" },
        {
          valeur: "attente",
          libelle: t("legende.congeAttente"),
          style: { color: "var(--leave-pending)" },
          classe: "is-dashed",
        },
      ],
    },
    {
      cle: "evenements",
      titre: t("legende.evenements"),
      entrees: [
        { valeur: "interne", libelle: t("legende.evenementInterne"), style: { color: "var(--event)" } },
        { valeur: "externe", libelle: t("legende.evenementExterne"), style: { color: "var(--event)" }, classe: "is-dashed" },
      ],
    },
  ];

  const basculer = (cle: keyof Filtres, valeur: string) => {
    const courant = new Set(filtres[cle]);
    if (courant.has(valeur)) courant.delete(valeur);
    else courant.add(valeur);
    surFiltres({ ...filtres, [cle]: courant });
  };

  return (
    <section className="panel matrice-espace">
      <div className="panel-head">
        <span className="panel-title">{t("legende.titre")}</span>
        <Button className="chip-btn" onPress={() => surFiltres(FILTRES_COMPLETS)}>
          {t("legende.toutAfficher")}
        </Button>
      </div>
      <div className="legend">
        {sections.map((s) => (
          <div className="legend-sec" key={s.cle}>
            <span className="eyebrow">{s.titre}</span>
            <div className="legend-list">
              {s.entrees.map((e) => {
                const actif = filtres[s.cle].has(e.valeur);
                return (
                  <Button
                    key={e.valeur}
                    className="lg"
                    aria-pressed={actif}
                    onPress={() => basculer(s.cle, e.valeur)}
                  >
                    <span
                      className={`lg-sw${e.classe ? ` ${e.classe}` : ""}`}
                      style={e.style}
                      aria-hidden="true"
                    />
                    <span>{e.libelle}</span>
                  </Button>
                );
              })}

              {/* La permanence ferme la section « Autres occupations ». Elle
                  ne se filtre pas par statut mais par couche : ce bouton
                  commande la même case que « Activités » dans la barre de
                  filtres, et il en porte l'état. */}
              {s.cle === "evenements" ? (
                <Button
                  className="lg"
                  aria-pressed={couches.activites}
                  onPress={() => surCouches({ ...couches, activites: !couches.activites })}
                >
                  <span
                    className="lg-sw is-flat"
                    style={{ color: "var(--activity)" }}
                    aria-hidden="true"
                  />
                  <span>{t("legende.permanence")}</span>
                </Button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
