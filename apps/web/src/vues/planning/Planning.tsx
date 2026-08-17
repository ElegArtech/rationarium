import { useMemo, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Menu, MenuItem, MenuTrigger, Popover } from "react-aria-components";
import { STATUTS_TACHE } from "@trame/contracts";
import * as api from "../../api/planning.js";
import { messageErreur } from "../../api/erreurs.js";
import { usePeut } from "../../session/session.js";
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
  const annoncer = useMessages();
  const client = useQueryClient();

  const [ancre, setAncre] = useState(AUJOURDHUI);
  const [services, setServices] = useState<ReadonlySet<string>>(new Set());
  const [departementId, setDepartementId] = useState("");
  const [recherche, setRecherche] = useState("");
  const [monPerimetre, setMonPerimetre] = useState(false);
  const [couches, setCouches] = useState<Couches>(COUCHES_PAR_DEFAUT);
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
    enabled: peut("planning:read"),
  });

  /**
   * `RG-PLN-05` — si l'écriture aboutit mais que le rafraîchissement échoue,
   * l'utilisateur est averti que l'affichage peut être périmé. Le silence
   * serait pire que l'échec : il laisserait agir sur des données fausses.
   */
  const rafraichir = async () => {
    try {
      await client.refetchQueries({ queryKey: ["planning"] });
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

  if (!peut("planning:read")) return <AccesRefuse />;

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
    setServices(new Set());
    setDepartementId("");
    setRecherche("");
    setMonPerimetre(false);
    setCouches(COUCHES_PAR_DEFAUT);
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
                <MenuItem key={s.id} id={s.id}>
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
          onPress={() => setMonPerimetre((v) => !v)}
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
                onChange={(e) => setCouches((c) => ({ ...c, [cle]: e.target.checked }))}
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
            teletravailModifiable={peut("telework:create")}
            deplacementPossible={peut("tasks:update")}
            creationPossible={peut("tasks:create")}
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

/** La barre d'outils : mode, navigation, période, export, création. */
function BarreOutils({
  mode,
  periode,
  ancre,
  surAncre,
  filtresExport,
}: {
  mode: Mode;
  periode: { debut: string; fin: string };
  ancre: string;
  surAncre: (a: string) => void;
  filtresExport: api.FiltresPlanning;
}) {
  const { t } = useTranslation("planning");
  const peut = usePeut();

  return (
    <div className="pl-toolbar">
      <h1 className="h1 titre-vue">{t("titre")}</h1>

      <div className="seg" role="group" aria-label={t("modes.groupe")}>
        {(["semaine", "mois", "activite"] as const).map((m) => (
          <a
            key={m}
            href={m === "semaine" ? "/planning" : `/planning/${m}`}
            // Un lien N'EST PAS un bouton bascule : `aria-pressed` y est
            // interdit, et `axe` le refuse en « critique ». L'état courant
            // d'une navigation se dit par `aria-current`, et par lui seul.
            aria-current={m === mode ? "page" : undefined}
          >
            {t(`modes.${m}`)}
          </a>
        ))}
      </div>

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
        {peut("tasks:create") || peut("events:create") ? (
          <MenuTrigger>
            <Button className="btn btn-primary">{t("actions.creer")}</Button>
            <Popover>
              <Menu className="pop pop-sm">
                {peut("tasks:create") ? (
                  <MenuItem id="tache" href="/taches">
                    {t("actions.creerTache")}
                  </MenuItem>
                ) : null}
                {peut("events:create") ? (
                  <MenuItem id="evenement" href="/evenements">
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
