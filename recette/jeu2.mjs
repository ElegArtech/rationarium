/**
 * **Le second jeu d'illustration — la recette par persona.**
 *
 * Le premier jeu (`packages/db/src/maquette.ts`) reconstitue la Ville de
 * Roqueville et sert à MESURER : la boucle de conformité compare le rendu du
 * produit à ses maquettes, et cette comparaison n'a de sens que si les deux
 * montrent la même chose.
 *
 * Celui-ci sert à REGARDER. Chaque parcours de recette est joué dessus, par
 * une persona du cadrage munie d'un compte réel. Il n'a donc pas le droit de
 * partager une seule valeur visible avec le premier : si « Camille Durand » ou
 * « Refonte du portail citoyen » apparaît à l'écran pendant une recette jouée
 * sur ce jeu-ci, c'est que la vue lit une donnée qu'elle ne devrait pas lire —
 * un cache, une route mal câblée, un jeu d'essai resté branché. La divergence
 * totale des deux jeux est ce qui rend ce défaut VISIBLE. Elle n'est pas une
 * coquetterie de rédaction.
 *
 * Autre commune — Valmorin —, autres gens, autre portefeuille. Seuls les
 * libellés du produit lui-même (statuts, priorités, vocabulaires de
 * `@rationarium/contracts`) sont partagés : ce ne sont pas des données.
 *
 * **Il se pose sur une instance déjà amorcée.** `amorcage.js` a créé le compte
 * `admin` et le référentiel des 26 rôles ; ce module ne crée pas le premier
 * administrateur, sous peine d'en devenir une seconde source de vérité.
 *
 * **Idempotent, et rejouable à date décalée.** Identifiants stables, `upsert`
 * partout, et l'`update` de chaque `upsert` reflète son `create` — valeur nulle
 * comprise. Un champ absent de l'`update` est un champ qui ne change jamais, et
 * les identifiants stables rendent l'oubli invisible : la ligne existe et
 * paraît juste. Les congés, eux, se heurtent à la contrainte d'exclusion GiST
 * dès que le jeu est rejoué un autre jour : ils sont effacés puis reposés.
 *
 * Usage :
 *
 *     DATABASE_URL="postgresql://…" node recette/jeu2.mjs
 *     RECETTE_AUJOURDHUI=2026-09-16 DATABASE_URL="…" node recette/jeu2.mjs
 */

import { creerClient } from "../packages/db/dist/index.js";
import { hacherMotDePasse } from "../apps/api/dist/auth/mots-de-passe.js";
import { pathToFileURL } from "node:url";

/** Le mot de passe de tous les comptes de recette. */
export const MOT_DE_PASSE = "Recette-2026!";

/**
 * Identifiants stables — le jeu doit être rejouable sans doublon.
 *
 * Le marqueur est `0b` là où le jeu des maquettes porte `0a` : les deux jeux
 * ne doivent jamais se recouvrir, même posés par erreur sur la même base.
 */
const idStable = (prefixe, n) => {
  const code = prefixe.charCodeAt(0).toString(16).padStart(2, "0");
  return `0000${code}0b-0000-4000-8000-${String(n).padStart(12, "0")}`;
};

/**
 * Les six personas de `cadrage/01 § 3.1`, avec le compte qui les incarne.
 *
 * Les clés nomment la persona du cadrage ; les identités, elles, sont
 * INÉDITES — ni celles des maquettes, ni les prénoms du cadrage. Le harnais de
 * recette lit cette constante pour ouvrir la session de chaque parcours.
 */
export const PERSONAS = {
  camille: {
    persona: "Camille — agent contributeur",
    login: "l.vasseur",
    prenom: "Léa",
    nom: "Vasseur",
    role: "PROJECT_CONTRIBUTOR",
    motDePasse: MOT_DE_PASSE,
  },
  driss: {
    persona: "Driss — chef de projet",
    login: "m.oueslati",
    prenom: "Malik",
    nom: "Oueslati",
    role: "PROJECT_LEAD",
    motDePasse: MOT_DE_PASSE,
  },
  fatou: {
    persona: "Fatou — manager de service",
    login: "s.pichon",
    prenom: "Solène",
    nom: "Pichon",
    role: "MANAGER",
    motDePasse: MOT_DE_PASSE,
  },
  hugo: {
    persona: "Hugo — responsable RH",
    login: "t.grasset",
    prenom: "Thibaut",
    nom: "Grasset",
    role: "HR_OFFICER",
    motDePasse: MOT_DE_PASSE,
  },
  ines: {
    persona: "Inès — direction",
    login: "a.delcourt",
    prenom: "Aurélie",
    nom: "Delcourt",
    role: "PORTFOLIO_MANAGER",
    motDePasse: MOT_DE_PASSE,
  },
  karim: {
    persona: "Karim — administrateur",
    login: "n.bouchard",
    prenom: "Nathan",
    nom: "Bouchard",
    role: "ADMIN",
    motDePasse: MOT_DE_PASSE,
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// Les données
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Les trente agents. Les six premiers sont les personas.
 *
 * `service` renvoie au code de service ; `role` au code de rôle système du
 * référentiel d'amorçage. Un agent est INACTIF (`thevenin`) — `RG-AUTH-05` est
 * un état que la vue 27 doit pouvoir montrer.
 */
const AGENTS = [
  { cle: "lea", prenom: "Léa", nom: "Vasseur", login: "l.vasseur", service: "applications", role: "PROJECT_CONTRIBUTOR" },
  { cle: "malik", prenom: "Malik", nom: "Oueslati", login: "m.oueslati", service: "applications", role: "PROJECT_LEAD" },
  { cle: "solene", prenom: "Solène", nom: "Pichon", login: "s.pichon", service: "carrieres", role: "MANAGER" },
  { cle: "thibaut", prenom: "Thibaut", nom: "Grasset", login: "t.grasset", service: "carrieres", role: "HR_OFFICER" },
  { cle: "aurelie", prenom: "Aurélie", nom: "Delcourt", login: "a.delcourt", service: "donnees", role: "PORTFOLIO_MANAGER" },
  { cle: "nathan", prenom: "Nathan", nom: "Bouchard", login: "n.bouchard", service: "infrastructure", role: "ADMIN" },

  { cle: "prevost", prenom: "Yohan", nom: "Prévost", login: "y.prevost", service: "instruction", role: "MANAGER" },
  { cle: "corbin", prenom: "Maëlys", nom: "Corbin", login: "m.corbin", service: "instruction", role: "PROJECT_CONTRIBUTOR" },
  { cle: "sanchez", prenom: "Ludovic", nom: "Sanchez", login: "l.sanchez", service: "instruction", role: "PROJECT_LEAD_JUNIOR" },
  { cle: "rebours", prenom: "Anaïs", nom: "Rebours", login: "a.rebours", service: "mobilites", role: "MANAGER_PROJECT_FOCUS" },
  { cle: "fournel", prenom: "Bastien", nom: "Fournel", login: "b.fournel", service: "mobilites", role: "PROJECT_CONTRIBUTOR" },
  { cle: "menard", prenom: "Clarisse", nom: "Ménard", login: "c.menard", service: "proprete", role: "MANAGER" },
  { cle: "tavernier", prenom: "Élias", nom: "Tavernier", login: "e.tavernier", service: "proprete", role: "PROJECT_CONTRIBUTOR" },
  { cle: "bardin", prenom: "Ophélie", nom: "Bardin", login: "o.bardin", service: "proprete", role: "PROJECT_LEAD" },
  { cle: "chastagner", prenom: "Rémi", nom: "Chastagner", login: "r.chastagner", service: "carrieres", role: "BASIC_USER" },
  { cle: "lemoal", prenom: "Sabrina", nom: "Lemoal", login: "s.lemoal", service: "carrieres", role: "HR_OFFICER_LIGHT" },
  { cle: "halard", prenom: "Victor", nom: "Halard", login: "v.halard", service: "carrieres", role: "PROJECT_CONTRIBUTOR" },
  { cle: "ducasse", prenom: "Noémie", nom: "Ducasse", login: "n.ducasse", service: "carrieres", role: "FUNCTIONAL_REFERENT" },
  { cle: "poulain", prenom: "Adrien", nom: "Poulain", login: "a.poulain", service: "carrieres", role: "BASIC_USER" },
  { cle: "ferrandi", prenom: "Jasmine", nom: "Ferrandi", login: "j.ferrandi", service: "carrieres", role: "BASIC_USER" },
  { cle: "brossard", prenom: "Kevin", nom: "Brossard", login: "k.brossard", service: "carrieres", role: "STAGIAIRE_ALTERNANT" },
  { cle: "vaneau", prenom: "Lucie", nom: "Vaneau", login: "l.vaneau", service: "carrieres", role: "BASIC_USER" },
  { cle: "delalande", prenom: "Marius", nom: "Delalande", login: "m.delalande", service: "carrieres", role: "CONTROLLER" },
  { cle: "gomez", prenom: "Priscilla", nom: "Gomez", login: "p.gomez", service: "carrieres", role: "BASIC_USER" },
  { cle: "aubriot", prenom: "Quentin", nom: "Aubriot", login: "q.aubriot", service: "carrieres", role: "BUDGET_ANALYST" },
  { cle: "thevenin", prenom: "Roxane", nom: "Thevenin", login: "r.thevenin", service: "carrieres", role: "OBSERVER_HR_ONLY", inactif: true },
  { cle: "nguema", prenom: "Samuel", nom: "Nguema", login: "s.nguema", service: "infrastructure", role: "IT_INFRASTRUCTURE" },
  { cle: "roussille", prenom: "Tiphaine", nom: "Roussille", login: "t.roussille", service: "infrastructure", role: "IT_SUPPORT" },
  { cle: "cambon", prenom: "Ulysse", nom: "Cambon", login: "u.cambon", service: "applications", role: "TECHNICAL_LEAD" },
  { cle: "lachaud", prenom: "Vanessa", nom: "Lachaud", login: "v.lachaud", service: "donnees", role: "DATA_ANALYST", langue: "en" },
];

/** Deux directions. La seconde est celle d'Inès — le portefeuille entier. */
const DIRECTIONS = [
  { cle: "amenagement", nom: "Direction de l'aménagement et du cadre de vie", responsable: "prevost" },
  { cle: "ressources", nom: "Direction des ressources et de la modernisation", responsable: "aurelie" },
];

/** Quatre départements. */
const DEPARTEMENTS = [
  { cle: "urbanisme", nom: "Urbanisme et mobilités", direction: "amenagement", responsable: "prevost" },
  { cle: "espaces", nom: "Espaces publics", direction: "amenagement", responsable: "menard" },
  { cle: "rh", nom: "Ressources humaines et dialogue social", direction: "ressources", responsable: "solene" },
  { cle: "si", nom: "Systèmes d'information et innovation", direction: "ressources", responsable: "malik" },
];

/**
 * Sept services. Le dernier n'a **délibérément pas de responsable** :
 * `RG-ORG-03` l'autorise, et « Aucun responsable désigné » est un état que rien
 * d'autre ne produit.
 *
 * « Carrières et paie » compte quatorze agents : c'est le service de Fatou, et
 * son parcours suppose un effectif qui remplit une grille.
 */
const SERVICES = [
  { cle: "instruction", nom: "Instruction des autorisations", departement: "urbanisme", manager: "prevost" },
  { cle: "mobilites", nom: "Mobilités douces", departement: "urbanisme", manager: "rebours" },
  { cle: "proprete", nom: "Propreté et déchets", departement: "espaces", manager: "menard" },
  { cle: "carrieres", nom: "Carrières et paie", departement: "rh", manager: "solene" },
  { cle: "infrastructure", nom: "Infrastructure et postes de travail", departement: "si", manager: "nguema" },
  { cle: "applications", nom: "Applications métier", departement: "si", manager: "malik" },
  { cle: "donnees", nom: "Données et pilotage", departement: "si", manager: null },
];

/**
 * Seize projets. Le tableau de santé de la vue 30 se REPLIE au-delà de dix :
 * il en faut donc plus de dix pour que « Tout afficher » existe.
 *
 * Y figurent un projet ANNULÉ, un projet ACHEVÉ dont toutes les tâches sont à
 * cent pour cent, deux brouillons, un suspendu, et trois projets dont
 * l'échéance est passée avec au moins une tâche en retard — ce qui les rend
 * CRITIQUES au sens de `cadrage/01 § M17`.
 */
const PROJETS = [
  { cle: "berges", nom: "Requalification des berges de l'Orbe", icone: "p-tree", statut: "active", priorite: "high", debut: -180, fin: 120, budget: 1800, chef: "prevost", sponsor: "aurelie", departement: "urbanisme" },
  { cle: "mobilite", nom: "Zones à mobilité apaisée", icone: "p-road", statut: "active", priorite: "normal", debut: -150, fin: 90, budget: 950, chef: "rebours", sponsor: "prevost", departement: "urbanisme" },
  { cle: "collecte", nom: "Collecte pneumatique des déchets", icone: "p-recycle", statut: "paused", priorite: "low", debut: -240, fin: 200, budget: 2400, chef: "menard", sponsor: "aurelie", departement: "espaces" },
  // Échéance passée + trois tâches en retard : santé CRITIQUE.
  { cle: "ecoles", nom: "Rénovation thermique des écoles", icone: "p-graduate", statut: "active", priorite: "critical", debut: -300, fin: -20, budget: 3200, chef: "tavernier", sponsor: "aurelie", departement: "espaces" },
  { cle: "guichet", nom: "Guichet unique d'urbanisme", icone: "p-stamp", statut: "active", priorite: "high", debut: -120, fin: 150, budget: 1400, chef: "corbin", sponsor: "prevost", departement: "urbanisme" },
  { cle: "paie", nom: "Modernisation de la paie", icone: "p-calc", statut: "active", priorite: "high", debut: -90, fin: 210, budget: 1600, chef: "solene", sponsor: "aurelie", departement: "rh" },
  { cle: "telephonie", nom: "Socle de téléphonie unifiée", icone: "p-server", statut: "active", priorite: "normal", debut: -200, fin: 45, budget: 800, chef: "nguema", sponsor: "malik", departement: "si" },
  { cle: "solaire", nom: "Cadastre solaire", icone: "p-sun", statut: "draft", priorite: "low", debut: 10, fin: 300, budget: 400, chef: "lachaud", sponsor: "aurelie", departement: "si" },
  { cle: "tilleuls", nom: "Salle de spectacle Les Tilleuls", icone: "p-mask", statut: "active", priorite: "normal", debut: -260, fin: -12, budget: 2100, chef: "bardin", sponsor: "menard", departement: "espaces" },
  // ACHEVÉ : statut `done`, et toutes ses tâches à 100 % (`RG-TSK-17`).
  { cle: "sobriete", nom: "Plan de sobriété énergétique", icone: "p-bulb", statut: "done", priorite: "normal", debut: -400, fin: -60, budget: 1200, chef: "fournel", sponsor: "prevost", departement: "urbanisme" },
  // ANNULÉ : le filtre « Annulés » du portefeuille n'a aucune autre source.
  { cle: "video", nom: "Régie de vidéoprotection", icone: "p-camera", statut: "cancelled", priorite: "low", debut: -330, fin: -90, budget: 700, chef: "roussille", sponsor: "nguema", departement: "si" },
  { cle: "observatoire", nom: "Observatoire de la donnée locale", icone: "p-chart", statut: "active", priorite: "normal", debut: -70, fin: 260, budget: 900, chef: "lachaud", sponsor: "aurelie", departement: "si" },
  // Le projet transverse de Driss : cinq services représentés à l'équipe.
  { cle: "intranet", nom: "Refonte de l'intranet agents", icone: "p-screen", statut: "active", priorite: "high", debut: -100, fin: 130, budget: 2000, chef: "malik", sponsor: "aurelie", departement: "si" },
  { cle: "accueil", nom: "Parcours d'accueil des nouveaux agents", icone: "p-badge", statut: "draft", priorite: "normal", debut: 20, fin: 320, budget: 300, chef: "thibaut", sponsor: "solene", departement: "rh" },
  { cle: "halle", nom: "Halle gourmande du centre-ville", icone: "p-basket", statut: "active", priorite: "normal", debut: -140, fin: 100, budget: 1100, chef: "sanchez", sponsor: "prevost", departement: "urbanisme" },
  { cle: "cyclable", nom: "Schéma des liaisons cyclables", icone: "p-pin", statut: "active", priorite: "high", debut: -220, fin: -5, budget: 1300, chef: "fournel", sponsor: "rebours", departement: "urbanisme" },
];

/**
 * Les équipes. `roleProjet` vient de `ROLES_PROJET` — vocabulaire fermé.
 *
 * Léa (Camille) est membre de DEUX projets ; l'équipe de `intranet` couvre
 * cinq services, ce que le parcours de Driss suppose.
 */
const EQUIPES = {
  intranet: [
    { agent: "malik", role: "chef_de_projet", taux: 50 },
    { agent: "lea", role: "designer", taux: 40 },
    { agent: "corbin", role: "analyste_metier", taux: 20 },
    { agent: "tavernier", role: "testeur", taux: 15 },
    { agent: "ducasse", role: "product_owner", taux: 25 },
    { agent: "nguema", role: "devops", taux: 10 },
    { agent: "aurelie", role: "sponsor", taux: 5 },
  ],
  guichet: [
    { agent: "corbin", role: "chef_de_projet", taux: 40 },
    { agent: "lea", role: "developpeur", taux: 30 },
    { agent: "sanchez", role: "analyste_metier", taux: 20 },
    { agent: "prevost", role: "sponsor", taux: 5 },
  ],
  paie: [
    { agent: "solene", role: "chef_de_projet", taux: 30 },
    { agent: "thibaut", role: "analyste_metier", taux: 40 },
    { agent: "ducasse", role: "testeur", taux: 20 },
    { agent: "halard", role: "developpeur", taux: 25 },
  ],
  ecoles: [
    { agent: "tavernier", role: "chef_de_projet", taux: 45 },
    { agent: "bardin", role: "responsable_technique", taux: 30 },
    { agent: "menard", role: "sponsor", taux: 10 },
  ],
  tilleuls: [
    { agent: "bardin", role: "chef_de_projet", taux: 40 },
    { agent: "menard", role: "membre", taux: 15 },
    { agent: "sanchez", role: "observateur", taux: null },
  ],
  cyclable: [
    { agent: "fournel", role: "chef_de_projet", taux: 35 },
    { agent: "rebours", role: "sponsor", taux: 10 },
    { agent: "sanchez", role: "membre", taux: 15 },
  ],
  berges: [
    { agent: "prevost", role: "chef_de_projet", taux: 25 },
    { agent: "sanchez", role: "membre", taux: 30 },
    { agent: "aurelie", role: "sponsor", taux: 5 },
  ],
  mobilite: [
    { agent: "rebours", role: "chef_de_projet", taux: 35 },
    { agent: "fournel", role: "developpeur", taux: 25 },
  ],
  collecte: [
    { agent: "menard", role: "chef_de_projet", taux: 20 },
    { agent: "tavernier", role: "membre", taux: 20 },
  ],
  telephonie: [
    { agent: "nguema", role: "chef_de_projet", taux: 40 },
    { agent: "roussille", role: "membre", taux: 30 },
    { agent: "cambon", role: "tech_lead", taux: 15 },
  ],
  solaire: [{ agent: "lachaud", role: "chef_de_projet", taux: 15 }],
  sobriete: [
    { agent: "fournel", role: "chef_de_projet", taux: 10 },
    { agent: "prevost", role: "membre", taux: 10 },
  ],
  video: [
    { agent: "roussille", role: "chef_de_projet", taux: 10 },
    { agent: "nguema", role: "sponsor", taux: 5 },
  ],
  observatoire: [
    { agent: "lachaud", role: "chef_de_projet", taux: 40 },
    { agent: "aurelie", role: "sponsor", taux: 10 },
    { agent: "cambon", role: "architecte", taux: 15 },
  ],
  accueil: [
    { agent: "thibaut", role: "chef_de_projet", taux: 15 },
    { agent: "solene", role: "sponsor", taux: 5 },
  ],
  halle: [
    { agent: "sanchez", role: "chef_de_projet", taux: 35 },
    { agent: "prevost", role: "sponsor", taux: 5 },
  ],
};

/**
 * Les jalons. `intranet` les porte tous les cinq états : terminé, en retard,
 * à venir, SANS ÉCHÉANCE (le schéma la dit facultative, et « pas de date »
 * n'a aucune autre source) et lointain.
 */
const JALONS = {
  intranet: [
    { nom: "Diagnostic", dans: -60 },
    { nom: "Consultation des entreprises", dans: -10 },
    { nom: "Livraison technique", dans: 45 },
    { nom: "Mise en service", dans: null },
    { nom: "Bilan à six mois", dans: 180 },
  ],
  guichet: [
    { nom: "Diagnostic", dans: -45 },
    { nom: "Livraison technique", dans: 60 },
    { nom: "Mise en service", dans: 140 },
  ],
  paie: [
    { nom: "Diagnostic", dans: -50 },
    { nom: "Livraison technique", dans: 75 },
    { nom: "Bilan à six mois", dans: 200 },
  ],
  ecoles: [
    { nom: "Diagnostic", dans: -210 },
    { nom: "Consultation des entreprises", dans: -35 },
    { nom: "Mise en service", dans: -15 },
  ],
  tilleuls: [
    { nom: "Diagnostic", dans: -180 },
    { nom: "Réception des travaux", dans: -14 },
  ],
  cyclable: [
    { nom: "Diagnostic", dans: -150 },
    { nom: "Consultation des entreprises", dans: -8 },
  ],
  sobriete: [
    { nom: "Diagnostic", dans: -300 },
    { nom: "Bilan à six mois", dans: -70 },
  ],
  berges: [
    { nom: "Diagnostic", dans: -120 },
    { nom: "Consultation des entreprises", dans: 30 },
  ],
  mobilite: [
    { nom: "Diagnostic", dans: -100 },
    { nom: "Livraison technique", dans: 55 },
  ],
  telephonie: [
    { nom: "Diagnostic", dans: -140 },
    { nom: "Mise en service", dans: 40 },
  ],
  observatoire: [
    { nom: "Diagnostic", dans: -40 },
    { nom: "Livraison technique", dans: 110 },
  ],
  halle: [
    { nom: "Diagnostic", dans: -90 },
    { nom: "Mise en service", dans: 95 },
  ],
  collecte: [{ nom: "Diagnostic", dans: -190 }],
  video: [{ nom: "Diagnostic", dans: -270 }],
  solaire: [{ nom: "Diagnostic", dans: 40 }],
  accueil: [{ nom: "Diagnostic", dans: 60 }],
};

/** Les épopées — un regroupement transverse aux jalons. */
const EPOPEES = [
  { cle: "socle", projet: "intranet", nom: "Socle technique" },
  { cle: "parcours", projet: "intranet", nom: "Parcours agent" },
  { cle: "reprise", projet: "guichet", nom: "Reprise de l'existant" },
];

/**
 * Les tâches.
 *
 * Les cinq statuts y sont, les quatre priorités aussi. S'y ajoutent les cas
 * que rien d'autre ne produit : des tâches EN RETARD (échéance passée, statut
 * non terminé), des tâches HORS PROJET, une tâche CONFIDENTIELLE, des tâches
 * SANS ASSIGNÉ et des tâches à quatre porteurs.
 *
 * **Une tâche `done` est à 100 %** (`RG-TSK-17`) : le lien entre les deux
 * champs vaut pour TOUS les chemins d'écriture, jeux de données compris.
 */
const TACHES = [
  // ── Refonte de l'intranet agents — le projet de Driss ───────────────────
  { cle: "intra-carto", projet: "intranet", jalon: "Diagnostic", titre: "Cartographie des contenus existants", statut: "done", avancement: 100, heures: 40, debut: -95, fin: -70, agents: ["corbin"] },
  { cle: "intra-entretiens", projet: "intranet", jalon: "Diagnostic", titre: "Entretiens avec les directions", statut: "done", avancement: 100, heures: 24, debut: -90, fin: -75, agents: ["malik", "corbin"] },
  // EN RETARD, sur un jalon échu : la tâche et le jalon le sont ensemble.
  { cle: "intra-cdc", projet: "intranet", jalon: "Consultation des entreprises", titre: "Rédaction du cahier des charges", statut: "doing", priorite: "high", avancement: 65, heures: 60, debut: -60, fin: -12, agents: ["malik"] },
  { cle: "intra-consultation", projet: "intranet", jalon: "Consultation des entreprises", titre: "Consultation des prestataires", statut: "blocked", priorite: "critical", avancement: 20, heures: 30, debut: -30, fin: -8, agents: ["lea", "malik"] },
  { cle: "intra-maquette", projet: "intranet", jalon: "Livraison technique", epopee: "parcours", titre: "Maquette de la page d'accueil", statut: "doing", avancement: 45, heures: 35, debut: 0, fin: 12, agents: ["lea"] },
  { cle: "intra-annuaire", projet: "intranet", jalon: "Livraison technique", epopee: "socle", titre: "Reprise des annuaires", statut: "todo", heures: 50, debut: 5, fin: 25, agents: ["nguema", "cambon"] },
  // Quatre porteurs : la pile d'avatars montre trois visages puis un compte.
  { cle: "intra-recette", projet: "intranet", jalon: "Livraison technique", titre: "Recette fonctionnelle", statut: "todo", priorite: "low", heures: 45, debut: 20, fin: 40, agents: ["tavernier", "ducasse", "corbin", "lea"] },
  // SANS assigné : « Personne » est un état qui existe.
  { cle: "intra-ouverture", projet: "intranet", jalon: "Mise en service", titre: "Ouverture aux agents", statut: "todo", debut: 60, fin: 75, agents: [] },
  // CONFIDENTIELLE — `RG-TSK-13` : y être assigné ne suffit pas à la lire.
  { cle: "intra-secu", projet: "intranet", titre: "Note de sécurité sur les accès annuaire", statut: "review", priorite: "high", avancement: 80, heures: 8, debut: -5, fin: 3, agents: ["nathan"], confidentielle: true },
  { cle: "intra-comite", projet: "intranet", titre: "Comité de suivi hebdomadaire", statut: "doing", avancement: 50, heures: 4, debut: -3, fin: 3, agents: ["malik", "aurelie"] },

  // ── Rénovation thermique des écoles — santé CRITIQUE ────────────────────
  { cle: "eco-audit", projet: "ecoles", jalon: "Diagnostic", titre: "Audit énergétique des bâtiments", statut: "done", avancement: 100, heures: 120, debut: -280, fin: -200, agents: ["tavernier"] },
  { cle: "eco-menuiseries", projet: "ecoles", jalon: "Consultation des entreprises", titre: "Remplacement des menuiseries", statut: "doing", priorite: "critical", avancement: 55, heures: 400, debut: -150, fin: -30, agents: ["bardin", "tavernier"] },
  { cle: "eco-chaufferies", projet: "ecoles", jalon: "Mise en service", titre: "Réglage des chaufferies", statut: "blocked", priorite: "high", avancement: 10, heures: 90, debut: -60, fin: -15, agents: ["tavernier"], externe: true },
  { cle: "eco-bilan", projet: "ecoles", titre: "Bilan des consommations", statut: "todo", debut: -40, fin: -10, agents: ["menard"] },

  // ── Salle de spectacle Les Tilleuls — échéance dépassée ─────────────────
  { cle: "til-acoustique", projet: "tilleuls", jalon: "Diagnostic", titre: "Étude acoustique", statut: "done", avancement: 100, heures: 60, debut: -240, fin: -180, agents: ["bardin"] },
  { cle: "til-scene", projet: "tilleuls", jalon: "Réception des travaux", titre: "Chantier de la scène", statut: "doing", priorite: "high", avancement: 70, heures: 320, debut: -170, fin: -20, agents: ["bardin", "menard"] },
  { cle: "til-reception", projet: "tilleuls", jalon: "Réception des travaux", titre: "Réception des travaux du gril technique", statut: "todo", debut: -30, fin: -8, agents: ["menard"] },

  // ── Schéma des liaisons cyclables — échéance dépassée ───────────────────
  { cle: "cyc-comptages", projet: "cyclable", jalon: "Diagnostic", titre: "Comptages vélo", statut: "done", avancement: 100, heures: 45, debut: -200, fin: -150, agents: ["rebours"] },
  { cle: "cyc-trace", projet: "cyclable", jalon: "Consultation des entreprises", titre: "Tracé des itinéraires", statut: "doing", priorite: "high", avancement: 60, heures: 110, debut: -140, fin: -10, agents: ["fournel", "rebours"] },
  { cle: "cyc-concertation", projet: "cyclable", titre: "Concertation des riverains", statut: "review", avancement: 85, heures: 30, debut: -60, fin: -6, agents: ["fournel"] },

  // ── Plan de sobriété énergétique — ACHEVÉ, tout à 100 % ─────────────────
  { cle: "sob-extinction", projet: "sobriete", jalon: "Diagnostic", titre: "Plan d'extinction nocturne", statut: "done", avancement: 100, heures: 70, debut: -380, fin: -300, agents: ["fournel"] },
  { cle: "sob-luminaires", projet: "sobriete", jalon: "Bilan à six mois", titre: "Remplacement des luminaires", statut: "done", avancement: 100, heures: 260, debut: -300, fin: -120, agents: ["fournel", "prevost"] },
  { cle: "sob-rapport", projet: "sobriete", jalon: "Bilan à six mois", titre: "Rapport final au conseil", statut: "done", avancement: 100, heures: 20, debut: -120, fin: -65, agents: ["prevost"] },

  // ── Régie de vidéoprotection — ANNULÉ ───────────────────────────────────
  { cle: "vid-impact", projet: "video", jalon: "Diagnostic", titre: "Étude d'impact sur les libertés", statut: "done", avancement: 100, heures: 35, debut: -320, fin: -260, agents: ["roussille"] },
  { cle: "vid-cnil", projet: "video", titre: "Consultation de l'autorité de contrôle", statut: "blocked", priorite: "low", avancement: 30, heures: 15, debut: -250, fin: -120, agents: ["roussille", "nguema"] },

  // ── Le reste du portefeuille ────────────────────────────────────────────
  { cle: "ber-diagnostic", projet: "berges", jalon: "Diagnostic", titre: "Diagnostic écologique de la ripisylve", statut: "done", avancement: 100, heures: 80, debut: -170, fin: -120, agents: ["prevost"] },
  { cle: "ber-marche", projet: "berges", jalon: "Consultation des entreprises", titre: "Marché de travaux d'aménagement", statut: "doing", priorite: "high", avancement: 40, heures: 150, debut: -100, fin: 30, agents: ["prevost", "sanchez"] },
  { cle: "ber-concertation", projet: "berges", titre: "Concertation citoyenne sur les usages", statut: "todo", debut: 15, fin: 60, agents: ["sanchez"] },

  { cle: "mob-comptage", projet: "mobilite", jalon: "Diagnostic", titre: "Comptage des flux motorisés", statut: "done", avancement: 100, heures: 40, debut: -140, fin: -100, agents: ["rebours"] },
  { cle: "mob-plan", projet: "mobilite", jalon: "Livraison technique", titre: "Plan de circulation apaisée", statut: "review", avancement: 75, heures: 90, debut: -90, fin: 20, agents: ["rebours", "fournel"] },
  { cle: "mob-signalisation", projet: "mobilite", titre: "Signalisation horizontale", statut: "todo", priorite: "low", debut: 30, fin: 70, agents: ["fournel"] },

  { cle: "col-faisabilite", projet: "collecte", jalon: "Diagnostic", titre: "Étude de faisabilité du réseau", statut: "done", avancement: 100, heures: 100, debut: -230, fin: -180, agents: ["menard"] },
  { cle: "col-chiffrage", projet: "collecte", titre: "Chiffrage des bornes d'apport", statut: "doing", avancement: 25, heures: 60, debut: -170, fin: 60, agents: ["menard", "tavernier"] },

  { cle: "gui-formulaire", projet: "guichet", jalon: "Diagnostic", epopee: "reprise", titre: "Paramétrage du formulaire de dépôt", statut: "doing", priorite: "high", avancement: 50, heures: 70, debut: -80, fin: 15, agents: ["corbin", "lea"] },
  { cle: "gui-dossiers", projet: "guichet", jalon: "Livraison technique", epopee: "reprise", titre: "Reprise des dossiers papier", statut: "todo", heures: 120, debut: 10, fin: 50, agents: ["sanchez"] },
  { cle: "gui-formation", projet: "guichet", jalon: "Mise en service", titre: "Formation des instructeurs", statut: "todo", debut: 40, fin: 80, agents: ["corbin"] },

  { cle: "pai-cadrage", projet: "paie", jalon: "Diagnostic", titre: "Cadrage des règles de paie", statut: "done", avancement: 100, heures: 55, debut: -85, fin: -40, agents: ["solene", "thibaut"] },
  { cle: "pai-moteur", projet: "paie", jalon: "Livraison technique", titre: "Paramétrage du moteur de calcul", statut: "doing", priorite: "high", avancement: 35, heures: 140, debut: -40, fin: 70, agents: ["thibaut", "ducasse"] },
  { cle: "pai-double", projet: "paie", jalon: "Bilan à six mois", titre: "Double paie de contrôle", statut: "todo", heures: 45, debut: 80, fin: 120, agents: ["solene"] },
  { cle: "pai-historiques", projet: "paie", titre: "Reprise des historiques de carrière", statut: "review", avancement: 60, heures: 80, debut: -20, fin: 25, agents: ["halard"] },

  { cle: "tel-recensement", projet: "telephonie", jalon: "Diagnostic", titre: "Recensement des postes fixes", statut: "done", avancement: 100, heures: 30, debut: -190, fin: -140, agents: ["nguema"] },
  { cle: "tel-deploiement", projet: "telephonie", jalon: "Mise en service", titre: "Déploiement site par site", statut: "doing", avancement: 80, heures: 160, debut: -130, fin: 30, agents: ["nguema", "roussille"] },
  { cle: "tel-formation", projet: "telephonie", titre: "Prise en main par les utilisateurs", statut: "todo", priorite: "low", debut: 20, fin: 44, agents: ["roussille"] },

  { cle: "sol-cadastre", projet: "solaire", jalon: "Diagnostic", titre: "Recueil des données cadastrales", statut: "todo", heures: 25, debut: 15, fin: 60, agents: ["lachaud"] },

  { cle: "obs-indicateurs", projet: "observatoire", jalon: "Diagnostic", titre: "Choix des indicateurs de pilotage", statut: "doing", avancement: 45, heures: 40, debut: -60, fin: 20, agents: ["lachaud", "aurelie"] },
  { cle: "obs-sources", projet: "observatoire", jalon: "Livraison technique", titre: "Collecte des sources de données", statut: "todo", heures: 65, debut: 10, fin: 90, agents: ["lachaud"] },

  { cle: "acc-livret", projet: "accueil", jalon: "Diagnostic", titre: "Rédaction du livret d'accueil", statut: "todo", heures: 30, debut: 25, fin: 70, agents: ["thibaut"] },

  { cle: "hal-programmation", projet: "halle", jalon: "Diagnostic", titre: "Étude de programmation", statut: "done", avancement: 100, heures: 55, debut: -130, fin: -80, agents: ["sanchez"] },
  { cle: "hal-candidatures", projet: "halle", titre: "Appel à candidatures des commerçants", statut: "doing", avancement: 30, heures: 40, debut: -70, fin: 60, agents: ["sanchez", "prevost"] },
  { cle: "hal-amenagement", projet: "halle", jalon: "Mise en service", titre: "Aménagement intérieur", statut: "todo", heures: 200, debut: 60, fin: 99, agents: ["sanchez"] },

  // ── HORS PROJET — `RG-TSK-01` : c'est un cas nominal ─────────────────────
  { cle: "hp-point", projet: null, titre: "Point hebdomadaire du service", statut: "doing", avancement: 50, heures: 2, debut: 1, fin: 1, agents: ["lea"] },
  { cle: "hp-courriers", projet: null, titre: "Réponse aux courriers des usagers", statut: "todo", heures: 6, debut: 2, fin: 4, agents: ["thibaut"] },
  { cle: "hp-conseil", projet: null, titre: "Préparation du conseil municipal", statut: "doing", priorite: "high", avancement: 60, heures: 12, debut: -2, fin: 1, agents: ["aurelie"] },
  { cle: "hp-inventaire", projet: null, titre: "Inventaire du parc informatique", statut: "todo", heures: 16, debut: 3, fin: 9, agents: ["nathan"] },
  // Hors projet ET en retard : l'indicateur du tableau de bord les compte aussi.
  { cle: "hp-habilitations", projet: null, titre: "Revue annuelle des habilitations", statut: "review", priorite: "high", avancement: 70, heures: 10, debut: -8, fin: -1, agents: ["nathan"] },
];

/**
 * Les dépendances. Les deux extrémités sont dans le même projet
 * (`RG-TSK-06`), et l'une d'elles est INCOHÉRENTE — le prérequis finit après
 * le début de la tâche, ce que le bandeau du Gantt signale.
 */
const DEPENDANCES = [
  { tache: "intra-maquette", prerequis: "intra-cdc" },
  { tache: "intra-annuaire", prerequis: "intra-cdc" },
  { tache: "intra-recette", prerequis: "intra-annuaire" },
  { tache: "intra-ouverture", prerequis: "intra-recette" },
  { tache: "pai-double", prerequis: "pai-moteur" },
  { tache: "gui-formation", prerequis: "gui-dossiers" },
];

/** Le RACI de la tâche de tête du projet transverse. */
const RACI = [
  { tache: "intra-cdc", agent: "malik", role: "responsible" },
  { tache: "intra-cdc", agent: "aurelie", role: "accountable" },
  { tache: "intra-cdc", agent: "corbin", role: "consulted" },
  { tache: "intra-cdc", agent: "lea", role: "informed" },
  { tache: "pai-moteur", agent: "thibaut", role: "responsible" },
  { tache: "pai-moteur", agent: "solene", role: "accountable" },
];

const SOUS_TACHES = [
  { tache: "intra-maquette", libelle: "Grille et gabarits", fait: true },
  { tache: "intra-maquette", libelle: "Bloc actualités", fait: true },
  { tache: "intra-maquette", libelle: "Bandeau de recherche", fait: false },
  { tache: "intra-maquette", libelle: "Version mobile", fait: false },
  { tache: "pai-moteur", libelle: "Règles d'ancienneté", fait: true },
  { tache: "pai-moteur", libelle: "Primes de sujétion", fait: false },
  { tache: "pai-moteur", libelle: "Supplément familial", fait: false },
];

/**
 * Cinq types de congé. `MAL` ne demande pas de validation : `RG-CNG-13`
 * l'approuve automatiquement, et c'est un chemin distinct de tous les autres.
 */
const TYPES_CONGE = [
  /*
   * Deux types **système**. `RG-CNG-30` — « les types système ne sont pas
   * modifiables dans leur structure » — ne s'observait sur aucun type : les
   * cinq étaient ordinaires, et la restriction que la vue 19 applique
   * désormais champ par champ n'avait rien à quoi s'appliquer. Une règle
   * qu'aucune donnée n'expose est une règle qu'aucun parcours ne peut juger.
   *
   * Et chacun porte une description : la ligne du référentiel la rend, et
   * cinq lignes vides se lisent comme une colonne cassée, pas comme un choix.
   */
  { cle: "rtt", code: "RTT", nom: "Réduction du temps de travail", couleur: "#2F6F4E", ordre: 1, limite: 18, validation: true, systeme: true, description: "Jours acquis au titre de la réduction du temps de travail. Solde arrêté au 31 décembre." },
  { cle: "cet", code: "CET", nom: "Compte épargne-temps", couleur: "#8A5A2B", ordre: 2, limite: 10, validation: true, description: "Jours épargnés les années précédentes, mobilisables sur accord du responsable." },
  { cle: "sante", code: "SAN", nom: "Absence pour raison de santé", couleur: "#9B3B3B", ordre: 3, limite: null, validation: false, systeme: true, description: "Arrêt de travail. Approuvé d'office ; le justificatif se dépose au service du personnel." },
  { cle: "famille", code: "FAM", nom: "Événement familial", couleur: "#3F5C9A", ordre: 4, limite: 5, validation: true, description: "Naissance, mariage, décès d'un proche — barème fixé par le règlement intérieur." },
  { cle: "formation", code: "FOR", nom: "Formation professionnelle", couleur: "#6B4E9B", ordre: 5, limite: 6, validation: true, description: "Jours consacrés à une formation inscrite au plan annuel." },
];

/** Les défauts globaux (`userId` nul) — `RG-CNG-24`, premier chemin. */
const SOLDES_GLOBAUX = { rtt: 18, cet: 10, sante: 90, famille: 5, formation: 6 };

/** Les allocations nominatives — `RG-CNG-24`, second chemin. */
const SOLDES_NOMINATIFS = [
  { agent: "lea", type: "rtt", jours: 20 },
  { agent: "lea", type: "cet", jours: 12 },
  { agent: "malik", type: "rtt", jours: 22 },
  { agent: "solene", type: "rtt", jours: 22 },
  { agent: "thibaut", type: "rtt", jours: 20 },
  { agent: "aurelie", type: "rtt", jours: 25 },
  { agent: "nathan", type: "rtt", jours: 20 },
  { agent: "chastagner", type: "rtt", jours: 16 },
  { agent: "lemoal", type: "rtt", jours: 16 },
  { agent: "halard", type: "rtt", jours: 18 },
];

/**
 * Les congés. Les cinq statuts sont représentés.
 *
 * `validateur` porte le validateur NOMMÉ (`RG-CNG-08`) : c'est lui, et non le
 * périmètre, que la file « à valider » interroge. Quatre demandes attendent
 * Solène, une cinquième attend Thibaut à qui elle a délégué la semaine où elle
 * est elle-même absente.
 *
 * Les offsets tombent tous en semaine et **ne se chevauchent jamais pour un
 * même agent** : la contrainte d'exclusion GiST refuse deux congés qui se
 * recouvrent dès lors qu'ils sont en attente, approuvés ou en annulation.
 */
const CONGES = [
  { cle: "c01", agent: "lea", type: "rtt", debut: -21, fin: -19, jours: 3, statut: "approved", validateur: "malik" },
  { cle: "c02", agent: "lea", type: "cet", debut: 7, fin: 9, jours: 3, statut: "pending", validateur: "malik" },
  { cle: "c03", agent: "lea", type: "rtt", debut: 21, fin: 21, jours: 0.5, statut: "approved", demiDebut: "morning", validateur: "malik" },
  { cle: "c04", agent: "lea", type: "famille", debut: 35, fin: 36, jours: 2, statut: "cancellation_requested", motif: "Déménagement reporté", validateur: "malik" },
  { cle: "c05", agent: "malik", type: "rtt", debut: -14, fin: -12, jours: 3, statut: "approved", validateur: "aurelie" },
  { cle: "c06", agent: "malik", type: "rtt", debut: 28, fin: 32, jours: 5, statut: "pending", validateur: "aurelie" },
  { cle: "c07", agent: "solene", type: "rtt", debut: 14, fin: 18, jours: 5, statut: "approved", validateur: "aurelie" },
  { cle: "c08", agent: "solene", type: "cet", debut: -7, fin: -6, jours: 2, statut: "refused", motifRefus: "Deux absences simultanées dans le service", validateur: "aurelie" },
  // ── Les demandes qui attendent Fatou ────────────────────────────────────
  { cle: "c09", agent: "thibaut", type: "rtt", debut: 3, fin: 4, jours: 2, statut: "pending", validateur: "solene" },
  { cle: "c10", agent: "chastagner", type: "rtt", debut: 2, fin: 3, jours: 2, statut: "pending", validateur: "solene" },
  { cle: "c11", agent: "lemoal", type: "cet", debut: 1, fin: 4, jours: 4, statut: "pending", validateur: "solene" },
  { cle: "c12", agent: "halard", type: "rtt", debut: 9, fin: 9, jours: 0.5, statut: "pending", demiDebut: "afternoon", validateur: "solene" },
  { cle: "c13", agent: "ferrandi", type: "famille", debut: 10, fin: 11, jours: 2, statut: "cancellation_requested", motif: "Cérémonie annulée", validateur: "solene" },
  // Pendant la délégation de Solène : c'est Thibaut qui décide.
  { cle: "c14", agent: "poulain", type: "rtt", debut: 16, fin: 17, jours: 2, statut: "pending", validateur: "thibaut" },
  // ── Le reste de l'organisation ──────────────────────────────────────────
  { cle: "c15", agent: "brossard", type: "formation", debut: -13, fin: -11, jours: 3, statut: "approved", validateur: "solene" },
  { cle: "c16", agent: "vaneau", type: "rtt", debut: 23, fin: 24, jours: 2, statut: "approved", validateur: "solene" },
  { cle: "c17", agent: "delalande", type: "rtt", debut: 0, fin: 0, jours: 1, statut: "approved", validateur: "solene" },
  { cle: "c18", agent: "gomez", type: "rtt", debut: 4, fin: 4, jours: 0.5, statut: "approved", demiDebut: "morning", validateur: "solene" },
  { cle: "c19", agent: "aubriot", type: "cet", debut: -14, fin: -12, jours: 3, statut: "approved", validateur: "solene" },
  { cle: "c20", agent: "thevenin", type: "rtt", debut: 30, fin: 31, jours: 2, statut: "approved", validateur: "solene" },
  { cle: "c21", agent: "nguema", type: "rtt", debut: 7, fin: 8, jours: 2, statut: "refused", motifRefus: "Astreinte déjà planifiée", validateur: "malik" },
  { cle: "c22", agent: "roussille", type: "rtt", debut: -3, fin: -3, jours: 1, statut: "refused", motifRefus: "Justificatif manquant", validateur: "nguema" },
  { cle: "c23", agent: "cambon", type: "rtt", debut: 11, fin: 11, jours: 1, statut: "cancelled", validateur: "malik" },
  { cle: "c24", agent: "lachaud", type: "rtt", debut: 2, fin: 3, jours: 2, statut: "approved", validateur: "malik" },
  { cle: "c25", agent: "prevost", type: "rtt", debut: -28, fin: -26, jours: 3, statut: "approved", validateur: "aurelie" },
  { cle: "c26", agent: "corbin", type: "rtt", debut: 1, fin: 2, jours: 2, statut: "approved", validateur: "prevost" },
  { cle: "c27", agent: "sanchez", type: "cet", debut: 17, fin: 18, jours: 2, statut: "pending", validateur: "prevost" },
  { cle: "c28", agent: "rebours", type: "sante", debut: 3, fin: 3, jours: 1, statut: "approved", autoValide: true },
  { cle: "c29", agent: "fournel", type: "rtt", debut: -5, fin: -4, jours: 2, statut: "approved", validateur: "rebours" },
  { cle: "c30", agent: "menard", type: "rtt", debut: 24, fin: 25, jours: 2, statut: "approved", validateur: "aurelie" },
  { cle: "c31", agent: "tavernier", type: "famille", debut: 8, fin: 8, jours: 1, statut: "approved", validateur: "menard" },
  { cle: "c32", agent: "bardin", type: "formation", debut: 35, fin: 39, jours: 5, statut: "pending", validateur: "menard" },
  { cle: "c33", agent: "nathan", type: "rtt", debut: -6, fin: -6, jours: 1, statut: "approved", validateur: "malik" },
  { cle: "c34", agent: "aurelie", type: "rtt", debut: 38, fin: 39, jours: 2, statut: "approved" },
];

/**
 * Le congé à cheval sur le 31 décembre — `RG-CNG-19`. Sa date est ABSOLUE :
 * ancrée sur le lundi courant, elle cesserait de chevaucher l'année dès la
 * semaine suivante. La répartition par année est POSÉE, parce que ce module
 * écrit en base sans passer par le service qui la calcule.
 */
const CONGE_A_CHEVAL = { agent: "roussille", type: "rtt", jours: 6, statut: "approved", avant: 2, apres: 4 };

/**
 * Deux délégations de validation. L'une est active pendant l'absence de
 * Solène ; l'autre est révolue et désactivée — `RG-CNG-11`.
 */
const DELEGATIONS = [
  { cle: "d1", delegant: "solene", delegue: "thibaut", debut: 14, fin: 18, active: true },
  { cle: "d2", delegant: "aurelie", delegue: "malik", debut: -40, fin: -30, active: false },
];

/** Les règles de télétravail récurrentes — dont une bornée et une arrêtée. */
const REGLES_TELETRAVAIL = [
  { cle: "w1", agent: "lea", jourSemaine: 2, debut: -180, fin: null, active: true },
  { cle: "w2", agent: "lea", jourSemaine: 4, debut: -180, fin: null, active: true },
  { cle: "w3", agent: "malik", jourSemaine: 3, debut: -90, fin: null, active: true },
  { cle: "w4", agent: "thibaut", jourSemaine: 1, debut: -30, fin: null, active: true },
  { cle: "w5", agent: "ducasse", jourSemaine: 3, debut: -60, fin: 60, active: true },
  { cle: "w6", agent: "lemoal", jourSemaine: 5, debut: -200, fin: null, active: false },
  { cle: "w7", agent: "aurelie", jourSemaine: 5, debut: -120, fin: null, active: true },
];

/**
 * La présence déclarée. `teletravail` liste les jours de la semaine (0 = lundi)
 * où l'agent télétravaille ; les autres jours ouvrés sont au bureau.
 */
const PRESENCE = [
  { agent: "lea", teletravail: [1, 3], regle: true },
  { agent: "malik", teletravail: [2], regle: true },
  { agent: "solene", teletravail: [] },
  { agent: "thibaut", teletravail: [0], regle: true },
  { agent: "aurelie", teletravail: [4], regle: true },
  { agent: "nathan", teletravail: [1] },
  { agent: "corbin", teletravail: [3] },
  { agent: "ducasse", teletravail: [2], regle: true },
  { agent: "nguema", teletravail: [] },
  { agent: "halard", teletravail: [1] },
];

/**
 * Les saisies de temps. Chacune est rejouée sur quatre semaines, deux jours
 * par semaine : la vue 21 se lit sur une période, et une saisie isolée ne
 * montre ni cumul, ni tendance.
 */
const SAISIES = [
  { agent: "lea", tache: "intra-maquette", heures: 3.5, type: "development", jours: [0, 2] },
  { agent: "lea", tache: "gui-formulaire", heures: 2, type: "development", jours: [1, 3] },
  { agent: "malik", tache: "intra-cdc", heures: 4, type: "other", jours: [0, 3] },
  { agent: "malik", tache: "intra-comite", heures: 1.5, type: "meeting", jours: [1] },
  { agent: "corbin", tache: "intra-carto", heures: 3, type: "development", jours: [2, 4] },
  { agent: "thibaut", tache: "pai-moteur", heures: 5, type: "development", jours: [0, 1] },
  { agent: "solene", tache: "pai-cadrage", heures: 2, type: "meeting", jours: [3] },
  { agent: "ducasse", tache: "pai-moteur", heures: 3, type: "support", jours: [2, 4] },
  { agent: "nguema", tache: "tel-deploiement", heures: 6, type: "development", jours: [0, 2] },
  { agent: "tavernier", tache: "eco-menuiseries", heures: 4, type: "other", jours: [1, 3] },
  { agent: "fournel", tache: "cyc-trace", heures: 3.5, type: "development", jours: [2] },
  { agent: "halard", tache: "pai-historiques", heures: 4, type: "development", jours: [1, 4] },
  // Hors projet : le temps ne se rattache pas toujours à un portefeuille.
  { agent: "lea", tache: "hp-point", heures: 1, type: "meeting", jours: [1] },
  { agent: "nathan", tache: "hp-inventaire", heures: 2, type: "support", jours: [0, 4] },
  { agent: "aurelie", tache: "hp-conseil", heures: 3, type: "other", jours: [3] },
  { agent: "thibaut", tache: "hp-courriers", heures: 1.5, type: "support", jours: [2] },
];

/**
 * Le référentiel de compétences. Les trois états de couverture de `RG-CMP-01`
 * y sont : couverture complète, couverture partielle, et manque total — une
 * matrice où tout est en écart ne montre aucun écart.
 */
const COMPETENCES = [
  { cle: "ads", nom: "Instruction des autorisations d'urbanisme", categorie: "business", requis: 3, detenteurs: ["corbin", "sanchez", "prevost", "lea"] },
  { cle: "paie", nom: "Paie et déroulement de carrière", categorie: "business", requis: 2, detenteurs: ["thibaut", "halard", "solene"] },
  { cle: "pg", nom: "Administration PostgreSQL", categorie: "technical", requis: 2, detenteurs: ["nguema", "cambon"] },
  { cle: "reseau", nom: "Réseaux et téléphonie", categorie: "technical", requis: 3, detenteurs: ["nguema"] },
  { cle: "data", nom: "Analyse de données", categorie: "technical", requis: 3, detenteurs: ["lachaud"] },
  { cle: "crise", nom: "Gestion de crise", categorie: "soft_skill", requis: 2, detenteurs: ["menard", "prevost", "aurelie"] },
  { cle: "mediation", nom: "Médiation avec les usagers", categorie: "soft_skill", requis: 4, detenteurs: ["corbin", "tavernier"] },
  // Manque TOTAL : personne ne la détient.
  { cle: "achat", nom: "Achat public et sourcing", categorie: "business", requis: 2, detenteurs: [] },
  { cle: "indicateurs", nom: "Pilotage par les indicateurs", categorie: "methodology", requis: 2, detenteurs: ["lachaud", "aurelie"] },
  { cle: "changement", nom: "Conduite du changement", categorie: "methodology", requis: 3, detenteurs: ["malik"] },
];

/** Les niveaux, distribués en boucle : les quatre existent, `master` compris. */
const NIVEAUX = ["expert", "intermediate", "beginner", "master"];

/**
 * Les tiers. Les deux types de `RG-TRS-01` y sont : une personne morale ne
 * porte pas de contact nommé — son identité vient du champ `organisation` —,
 * une personne physique si. Un tiers est ARCHIVÉ : `RG-TRS-02` le rend non
 * assignable, et c'est un état que rien d'autre ne produit.
 */
const TIERS = [
  { cle: "bertoli", type: "organisation", organisation: "Ateliers Bertoli & Fils", email: "contact@ateliers-bertoli.fr", adresse: "14 route des Sablons, Valmorin", actif: true },
  { cle: "vernaud", type: "organisation", organisation: "Cabinet Vernaud Conseil", email: "accueil@vernaud-conseil.fr", adresse: "2 avenue du Belvédère, Valmorin", actif: true },
  { cle: "sirvent", type: "individual", contactNom: "Élodie Sirvent", email: "e.sirvent@independante.fr", adresse: "9 chemin de la Cure, Valmorin", actif: true },
  { cle: "peyrol", type: "individual", contactNom: "Marc-Antoine Peyrol", email: "map@peyrol-acoustique.fr", adresse: null, actif: false },
];

/** Le rôle est celui du RATTACHEMENT, pas du tiers. */
const TIERS_PROJETS = [
  { tiers: "bertoli", projet: "tilleuls", role: "Lot scénique" },
  { tiers: "bertoli", projet: "ecoles", role: "Menuiseries extérieures" },
  { tiers: "vernaud", projet: "intranet", role: "Appui au pilotage" },
  { tiers: "vernaud", projet: "paie", role: "Audit des règles de gestion" },
  { tiers: "sirvent", projet: "intranet", role: "Rédaction éditoriale" },
  { tiers: "peyrol", projet: "tilleuls", role: "Étude acoustique" },
];

const TIERS_TACHES = [
  { tiers: "vernaud", tache: "intra-cdc" },
  { tiers: "vernaud", tache: "intra-consultation" },
  { tiers: "sirvent", tache: "intra-maquette" },
  { tiers: "bertoli", tache: "til-scene" },
  { tiers: "bertoli", tache: "eco-menuiseries" },
  { tiers: "peyrol", tache: "til-acoustique" },
];

/**
 * Les bénéficiaires. Les deux natures de `NATURES_CLIENT` y sont ; l'un n'a
 * AUCUN projet — la puce « Aucun projet » n'a pas d'autre source —, un autre
 * est inactif, et `RG-PRJ-10` ne rend rattachables que les actifs.
 */
const CLIENTS = [
  { cle: "education", nom: "Direction de l'éducation et de la jeunesse", nature: "internal", contact: "Hélène Trioux", adresse: "5 place du Vieux-Puits, Valmorin", actif: true, projets: ["ecoles", "accueil"] },
  { cle: "ccas", nom: "Centre communal d'action sociale", nature: "internal", contact: "Gaspard Meunier", adresse: "18 rue Basse, Valmorin", actif: true, projets: ["halle"] },
  { cle: "syndicat", nom: "Syndicat mixte du Val d'Orbe", nature: "external", contact: null, adresse: null, actif: true, projets: [] },
  { cle: "metiers", nom: "Chambre de métiers de Valmorin", nature: "external", contact: "Bruno Estèves", adresse: "31 quai de l'Écluse, Valmorin", actif: false, projets: ["halle"] },
  { cle: "agglo", nom: "Communauté de communes de l'Orbe amont", nature: "external", contact: "Ingrid Rouzeau", adresse: "1 esplanade des Tanneurs, Valmorin", actif: true, projets: ["cyclable", "mobilite", "berges"] },
];

/**
 * Les événements. Réunions, ateliers avec un prestataire, et une séance
 * d'assemblée sur la journée entière. Les cinq premiers tombent dans la
 * semaine courante : le planning et la grille d'activité les montrent.
 */
const EVENEMENTS = [
  { cle: "e1", titre: "Comité de pilotage de l'intranet", jour: 1, debut: "10:00", fin: "11:30", projet: "intranet", participants: ["malik", "lea", "aurelie", "corbin"] },
  { cle: "e2", titre: "Revue de direction", jour: 0, debut: "09:00", fin: "10:00", participants: ["aurelie", "prevost", "menard", "solene", "malik"] },
  { cle: "e3", titre: "Visite de chantier aux Tilleuls", jour: 3, debut: "14:00", fin: "17:00", externe: true, projet: "tilleuls", participants: ["bardin", "menard"] },
  { cle: "e4", titre: "Atelier paie avec l'éditeur", jour: 2, debut: "09:30", fin: "12:00", externe: true, projet: "paie", participants: ["solene", "thibaut", "halard"] },
  { cle: "e5", titre: "Point ressources humaines mensuel", jour: 4, debut: "11:00", fin: "12:00", participants: ["solene", "thibaut", "ducasse", "lemoal"] },
  { cle: "e6", titre: "Séance du conseil municipal", jour: 8, journee: true, participants: ["aurelie", "prevost"] },
  { cle: "e7", titre: "Formation à l'accessibilité numérique", jour: -4, debut: "09:00", fin: "17:00", participants: ["lea", "corbin", "tavernier"] },
  { cle: "e8", titre: "Passation d'astreinte", jour: 5, debut: "08:00", fin: "09:00", participants: ["nguema", "roussille"] },
  { cle: "e9", titre: "Réunion de cadrage du cadastre solaire", jour: 11, debut: "14:00", fin: "15:30", projet: "solaire", participants: ["lachaud", "aurelie", "cambon"] },
];

/**
 * Le catalogue d'activité récurrente. Les cinq poids y sont, les trois durées
 * aussi, et l'une des tâches est INACTIVE : `RG-ACT-05` la rend non assignable
 * tout en conservant son passé.
 */
const PERMANENCES = [
  { cle: "etatcivil", nom: "Guichet état civil", duree: "half_day", debut: "08:30", fin: "12:00", poids: 3, description: "Actes, livrets de famille, recensement", icone: "p-stamp", teletravail: false, actif: true },
  { cle: "viabilite", nom: "Astreinte viabilité hivernale", duree: "full_day", debut: null, fin: null, poids: 5, description: "Salage et déneigement, sur alerte météo", icone: "p-shield", teletravail: false, actif: true },
  { cle: "standard", nom: "Standard téléphonique du soir", duree: "time_slot", debut: "17:00", fin: "19:00", poids: 1, description: "Appels entrants après la fermeture des guichets", icone: "p-badge", teletravail: true, actif: true },
  { cle: "regie", nom: "Régie technique du théâtre", duree: "full_day", debut: null, fin: null, poids: 4, description: "Son, lumière et sécurité des représentations", icone: "p-mask", teletravail: false, actif: true },
  { cle: "veille", nom: "Veille réglementaire", duree: "time_slot", debut: "08:00", fin: "08:30", poids: 2, description: "Dépouillement du journal officiel", icone: "p-book", teletravail: true, actif: true },
  { cle: "magasin", nom: "Tenue du magasin municipal", duree: "half_day", debut: "14:00", fin: "17:00", poids: 2, description: "Suspendue depuis le transfert au centre technique", icone: "p-house", teletravail: false, actif: false },
];

/**
 * Les assignations. La première permanence pose CINQ agents sur le même jour :
 * la cellule montre trois visages puis un compte, et un agent par jour ne le
 * produit jamais.
 */
const ASSIGNATIONS = [
  { permanence: "etatcivil", agents: ["corbin", "sanchez", "prevost", "ducasse", "gomez"], jour: 0, periode: "morning" },
  { permanence: "etatcivil", agents: ["corbin"], jour: 2, periode: "morning" },
  { permanence: "etatcivil", agents: ["sanchez"], jour: 4, periode: "morning" },
  { permanence: "viabilite", agents: ["tavernier"], jour: 1, periode: "full_day" },
  { permanence: "viabilite", agents: ["bardin"], jour: 3, periode: "full_day" },
  { permanence: "standard", agents: ["roussille", "halard"], jour: 1, periode: "afternoon" },
  { permanence: "standard", agents: ["nguema"], jour: 3, periode: "afternoon" },
  { permanence: "regie", agents: ["bardin"], jour: 4, periode: "full_day" },
  { permanence: "veille", agents: ["lemoal", "delalande"], jour: 0, periode: "morning" },
  { permanence: "veille", agents: ["lemoal"], jour: 2, periode: "morning" },
  { permanence: "magasin", agents: ["poulain"], jour: -7, periode: "afternoon" },
];

/** Les trois types de récurrence, plus une règle suspendue. */
const RECURRENCES = [
  { cle: "r1", permanence: "etatcivil", type: "weekly", jourSemaine: 1, frequence: 1 },
  { cle: "r2", permanence: "etatcivil", type: "weekly", jourSemaine: 3, frequence: 1 },
  { cle: "r3", permanence: "veille", type: "weekly", jourSemaine: 1, frequence: 1 },
  { cle: "r4", permanence: "viabilite", type: "monthly_fixed", jourMois: 1, frequence: 1 },
  { cle: "r5", permanence: "standard", type: "monthly_ordinal", jourSemaine: 2, ordinal: 3, frequence: 1 },
  { cle: "r6", permanence: "regie", type: "weekly", jourSemaine: 5, frequence: 2, active: false },
];

const DOCUMENTS = [
  { cle: "f1", tache: "intra-cdc", auteur: "malik", nom: "Cahier-des-charges-intranet-v2.pdf", octets: 986_400, type: "application/pdf" },
  { cle: "f2", tache: "intra-cdc", auteur: "corbin", nom: "Grille-analyse-des-offres.ods", octets: 61_200, type: "application/vnd.oasis.opendocument.spreadsheet" },
  { cle: "f3", tache: "intra-maquette", auteur: "lea", nom: "Maquettes-accueil-agents.pdf", octets: 2_140_000, type: "application/pdf" },
  { cle: "f4", tache: "pai-moteur", auteur: "thibaut", nom: "Regles-de-paie-2026.odt", octets: 118_700, type: "application/vnd.oasis.opendocument.text" },
  // Un document rattaché au PROJET et non à une tâche : le périmètre de
  // lecture n'a alors pas la même origine.
  { cle: "f5", projet: "intranet", auteur: "malik", nom: "Note-de-lancement.odt", octets: 34_800, type: "application/vnd.oasis.opendocument.text" },
  { cle: "f6", projet: "ecoles", auteur: "tavernier", nom: "Diagnostic-thermique-ecoles.pdf", octets: 4_320_000, type: "application/pdf" },
  // Sur la tâche confidentielle : le document hérite du périmètre de sa tâche.
  { cle: "f7", tache: "intra-secu", auteur: "nathan", nom: "Note-acces-annuaire.pdf", octets: 72_500, type: "application/pdf" },
];

const COMMENTAIRES = [
  { cle: "m1", tache: "intra-cdc", auteur: "corbin", contenu: "Les directions demandent un accès hors réseau interne : à trancher avant la consultation." },
  { cle: "m2", tache: "intra-cdc", auteur: "aurelie", contenu: "Hors périmètre pour cette version. On le note pour le bilan à six mois." },
  { cle: "m3", tache: "intra-maquette", auteur: "malik", contenu: "La recherche doit rester visible sans défilement sur un écran de bureau." },
  { cle: "m4", tache: "pai-moteur", auteur: "solene", contenu: "Le supplément familial attend la confirmation du service juridique." },
  { cle: "m5", tache: "til-scene", auteur: "menard", contenu: "Le gril technique est livré, la réception reste à programmer." },
  { cle: "m6", projet: "intranet", auteur: "lea", contenu: "Les gabarits sont partagés avec les référents de chaque direction." },
];

const TODOS = [
  { agent: "lea", libelle: "Relire les gabarits avant le comité", fait: false },
  { agent: "lea", libelle: "Demander les visuels à la communication", fait: false },
  { agent: "lea", libelle: "Déclarer le temps de la semaine passée", fait: true },
  { agent: "lea", libelle: "Préparer la démonstration aux référents", fait: false },
  { agent: "malik", libelle: "Relancer le cabinet sur le devis", fait: false },
  { agent: "malik", libelle: "Arbitrer l'accès hors réseau interne", fait: false },
  { agent: "malik", libelle: "Valider les congés en attente", fait: true },
  { agent: "solene", libelle: "Préparer l'entretien annuel de Rémi", fait: false },
  { agent: "solene", libelle: "Vérifier la délégation pendant mon absence", fait: true },
  { agent: "aurelie", libelle: "Arbitrer le report du cadastre solaire", fait: false },
  { agent: "aurelie", libelle: "Préparer le point portefeuille du mois", fait: false },
  { agent: "thibaut", libelle: "Mettre à jour le livret d'accueil", fait: false },
  { agent: "nathan", libelle: "Purger les sessions expirées", fait: false },
];

/**
 * Les notifications — les six types de `cadrage/01 § M18`, liste FERMÉE :
 * `tache_assignee`, `tache_echeance_proche`, `tache_en_retard`,
 * `conge_a_valider`, `conge_decide`, `ajout_projet`. Ce sont exactement les
 * six que `apps/api/src` émet ; aucun autre n'est écrivable ici.
 *
 * Plusieurs personas en ont des NON LUES : la pastille du compteur n'a pas
 * d'autre source, et une recette qui n'en voit jamais ne peut pas juger de
 * l'accusé de lecture.
 *
 * **Chacune porte de quoi construire son lien.** Le produit ÉCRIT `lien` —
 * `/taches/{id}` pour les trois types de tâche, `/projets/{id}` pour l'ajout à
 * un projet, `/conges` pour les deux types de congé. Une notification sans lien
 * est une ligne inerte : le panneau de la cloche s'ouvre, rien n'est cliquable,
 * et aucun parcours qui part d'une notification n'est jouable. La cible se
 * désigne donc par sa CLÉ (`tache` ou `projet`), jamais par un chemin écrit à
 * la main : `lienNotification()` refuse toute notification qu'elle ne sait pas
 * relier, plutôt que d'en poser une muette.
 */
const NOTIFICATIONS = [
  { agent: "lea", type: "tache_assignee", tache: "intra-recette", titre: "Nouvelle tâche assignée", contenu: "Recette fonctionnelle — Refonte de l'intranet agents", lue: false },
  { agent: "lea", type: "tache_echeance_proche", tache: "intra-maquette", titre: "Échéance proche", contenu: "Maquette de la page d'accueil — dans trois jours", lue: false },
  { agent: "lea", type: "ajout_projet", projet: "guichet", titre: "Ajout à un projet", contenu: "Guichet unique d'urbanisme", lue: true },
  { agent: "lea", type: "conge_decide", titre: "Décision sur votre demande de congé", contenu: "Réduction du temps de travail — une demi-journée", lue: true },
  { agent: "malik", type: "conge_a_valider", titre: "Demande de congé à valider", contenu: "Léa Vasseur — trois jours de compte épargne-temps", lue: false },
  { agent: "malik", type: "tache_en_retard", tache: "intra-cdc", titre: "Tâche en retard", contenu: "Rédaction du cahier des charges", lue: false },
  { agent: "malik", type: "tache_assignee", tache: "intra-comite", titre: "Nouvelle tâche assignée", contenu: "Comité de suivi hebdomadaire", lue: true },
  { agent: "solene", type: "conge_a_valider", titre: "Demande de congé à valider", contenu: "Rémi Chastagner — deux jours", lue: false },
  { agent: "solene", type: "conge_a_valider", titre: "Demande de congé à valider", contenu: "Sabrina Lemoal — quatre jours", lue: false },
  { agent: "solene", type: "conge_decide", titre: "Décision sur votre demande de congé", contenu: "Votre semaine du mois prochain est validée", lue: true },
  { agent: "solene", type: "tache_echeance_proche", tache: "pai-double", titre: "Échéance proche", contenu: "Double paie de contrôle", lue: false },
  { agent: "thibaut", type: "conge_decide", titre: "Congé en attente de décision", contenu: "Deux jours — la délégation est active", lue: false },
  { agent: "thibaut", type: "tache_assignee", tache: "acc-livret", titre: "Nouvelle tâche assignée", contenu: "Rédaction du livret d'accueil", lue: false },
  { agent: "aurelie", type: "tache_en_retard", tache: "eco-menuiseries", titre: "Tâche en retard", contenu: "Remplacement des menuiseries — Rénovation thermique des écoles", lue: false },
  { agent: "aurelie", type: "ajout_projet", projet: "observatoire", titre: "Ajout à un projet", contenu: "Observatoire de la donnée locale", lue: false },
  { agent: "nathan", type: "tache_assignee", tache: "hp-habilitations", titre: "Nouvelle tâche assignée", contenu: "Revue annuelle des habilitations", lue: false },
  { agent: "nathan", type: "tache_en_retard", tache: "hp-habilitations", titre: "Tâche en retard", contenu: "Revue annuelle des habilitations", lue: false },
  { agent: "corbin", type: "ajout_projet", projet: "intranet", titre: "Ajout à un projet", contenu: "Refonte de l'intranet agents", lue: true },
  { agent: "chastagner", type: "conge_decide", titre: "Demande enregistrée", contenu: "En attente de la décision de votre responsable", lue: false },
];

/**
 * Les jours fériés.
 *
 * Deux lectures de la même table se contredisent quand une seule année est
 * peuplée : `joursFeries(annee)` liste les lignes stockées, `joursChomes`
 * projette les récurrents sur toutes. Les fériés RÉCURRENTS sont donc semés
 * sur l'année courante ET la suivante, explicitement.
 *
 * `recurrent: false` — « Cette année seulement » à l'écran — n'est semé que sur
 * l'année courante : le semer deux fois ferait dire au jeu le contraire de sa
 * propre colonne, et donnerait à la vue 31 un jour non récurrent qui reparaît
 * l'année d'après.
 *
 * `ouvre` marque le jour férié TRAVAILLÉ de `RG-PRM-01` : il compte comme jour
 * ouvré, et le décompte des congés doit le montrer.
 */
const FERIES = [
  { mois: 1, jour: 1, libelle: "Jour de l'An", type: "legal", recurrent: true },
  { mois: 5, jour: 1, libelle: "Fête du Travail", type: "legal", recurrent: true },
  { mois: 5, jour: 8, libelle: "Victoire 1945", type: "legal", recurrent: true },
  { mois: 6, jour: 1, libelle: "Journée de solidarité", type: "local", recurrent: true, ouvre: true },
  { mois: 7, jour: 14, libelle: "Fête nationale", type: "legal", recurrent: true },
  { mois: 8, jour: 15, libelle: "Assomption", type: "legal", recurrent: true },
  { mois: 9, jour: 8, libelle: "Fête patronale de Valmorin", type: "local", recurrent: false },
  { mois: 11, jour: 1, libelle: "Toussaint", type: "legal", recurrent: true },
  { mois: 11, jour: 11, libelle: "Armistice 1918", type: "legal", recurrent: true },
  { mois: 12, jour: 25, libelle: "Noël", type: "legal", recurrent: true },
];

/** Les vacances scolaires, zone B, sur deux années scolaires. */
const VACANCES = [
  { libelle: "Vacances d'automne", debut: [0, 10, 17], fin: [0, 11, 2] },
  { libelle: "Vacances de fin d'année", debut: [0, 12, 19], fin: [1, 1, 4] },
  { libelle: "Vacances d'hiver", debut: [1, 2, 13], fin: [1, 3, 1] },
  { libelle: "Vacances de printemps", debut: [1, 4, 10], fin: [1, 4, 26] },
  { libelle: "Vacances d'été", debut: [1, 7, 4], fin: [1, 8, 31] },
];

/** Les réglages d'affichage, à leur valeur par défaut. */
const REGLAGES = {
  "display.dateFormat": "JJ/MM/AAAA",
  "display.timeFormat": "24h",
  "display.locale": "fr-FR",
  "display.firstDayOfWeek": "1",
  "planning.visibleDays": "1,2,3,4,5",
};

/**
 * Le journal d'audit — vue 33.
 *
 * Les codes d'action sont ceux que `apps/api/src` ÉCRIT — pas ceux qu'on
 * croirait qu'il écrit. Un code voisin (`auth.login_success` pour
 * `auth.login.success`) n'échoue nulle part : il ajoute une seconde entrée au
 * filtre « Action » de la vue 33, et fait accuser le produit d'un doublon qui
 * vient du jeu. La liste se croise avec
 * `grep -rho 'action: "[a-z_.]*"' apps/api/src`.
 *
 * Deux sont des actions SYSTÈME (`RG-ADM-09`), et ce sont les plus récentes :
 * une seule ligne enfouie ne prouverait rien.
 */
const AUDIT = [
  { action: "telework.generate", systeme: true },
  { action: "holiday.import", systeme: true },
  { action: "leave.create", agent: "chastagner" },
  { action: "leave.update", agent: "solene" },
  { action: "task.create", agent: "malik" },
  { action: "task.update", agent: "lea" },
  { action: "time_entry.create", agent: "thibaut" },
  { action: "third_party.create", agent: "malik" },
  { action: "skill.set_level", agent: "solene" },
  { action: "settings.update", agent: "nathan" },
  { action: "user.create", agent: "nathan" },
  { action: "role.set_permissions", agent: "nathan" },
  { action: "auth.login.success", agent: "aurelie" },
  { action: "access.denied", agent: "brossard" },
];

// ═══════════════════════════════════════════════════════════════════════════
// Le peuplement
// ═══════════════════════════════════════════════════════════════════════════

const lundiDe = (reference) => {
  const d = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d;
};

/**
 * La répartition par année d'un congé — `RG-CNG-19`, table `leave_year_allocations`.
 *
 * **Elle n'est pas décorative : c'est d'ELLE que le solde se lit.**
 * `conges.service.ts › solde()` compte les jours consommés et engagés en
 * interrogeant `leaveYearAllocation`, jamais `leave.joursOuvres`. Un congé posé
 * sans sa répartition existe, s'affiche dans la liste, se valide — et ne
 * décompte rien. Toutes les cartes de solde de l'instance restent alors à
 * « Utilisés 0,0 · En attente 0,0 » à côté des demandes qui les contredisent,
 * et c'est le PRODUIT qu'on accuse. Un jeu de données se calque sur ce que le
 * service écrit, pas sur ce qu'on croit qu'il écrit.
 *
 * Le service la construit par `repartitionParAnnee()` du calendrier ; ce module
 * écrit en base sans passer par lui, donc il la pose. L'invariant que le produit
 * garantit et que celle-ci tient : **la somme des parts vaut `joursOuvres`.**
 * Les week-ends servent de clé de partage quand la demande enjambe le
 * 31 décembre ; le reste va à la dernière année pour qu'aucun demi-jour ne se
 * perde à l'arrondi.
 */
const repartirParAnnee = (debut, fin, jours) => {
  const parAnnee = new Map();
  for (const d = new Date(debut); d <= fin; d.setUTCDate(d.getUTCDate() + 1)) {
    const semaine = d.getUTCDay();
    if (semaine === 0 || semaine === 6) continue;
    const a = d.getUTCFullYear();
    parAnnee.set(a, (parAnnee.get(a) ?? 0) + 1);
  }
  const annees = [...parAnnee.keys()].sort((x, y) => x - y);
  if (annees.length <= 1) return [{ annee: annees[0] ?? debut.getUTCFullYear(), jours }];

  const total = annees.reduce((n, a) => n + parAnnee.get(a), 0);
  const parts = [];
  let reste = jours;
  for (const [k, a] of annees.entries()) {
    // La dernière année emporte le reste : la somme vaut `jours`, à coup sûr.
    const part = k === annees.length - 1 ? reste : Math.round(((jours * parAnnee.get(a)) / total) * 2) / 2;
    parts.push({ annee: a, jours: part });
    reste -= part;
  }
  return parts.filter((part) => part.jours > 0);
};

/**
 * Peuple l'instance de recette.
 *
 * `aujourdhui` gouverne TOUTES les dates relatives : le jeu doit se rejouer à
 * date décalée sans se heurter à ses propres lignes. Le seul ancrage absolu
 * est le congé à cheval sur le 31 décembre, qui perdrait son sens autrement.
 */
export async function peuplerJeu2(prisma, aujourdhui = new Date()) {
  const lundi = lundiDe(aujourdhui);
  const annee = lundi.getUTCFullYear();
  const jour = (n) => {
    const d = new Date(lundi);
    d.setUTCDate(d.getUTCDate() + n);
    return d;
  };
  const compte = {};

  // ── Les rôles, posés par l'amorçage ─────────────────────────────────────
  const roles = new Map(
    (await prisma.role.findMany({ select: { id: true, code: true } })).map((r) => [r.code, r.id]),
  );
  if (roles.size === 0) {
    throw new Error(
      "Aucun rôle en base. Le jeu de recette se pose sur une instance déjà amorcée : lancez `node dist/exploitation/amorcage.js` d'abord.",
    );
  }
  for (const p of Object.values(PERSONAS)) {
    if (!roles.has(p.role)) {
      throw new Error(`Le rôle système « ${p.role} » n'existe pas : le référentiel d'amorçage est incomplet.`);
    }
  }

  // ── Les personnes ───────────────────────────────────────────────────────
  const hash = await hacherMotDePasse(MOT_DE_PASSE);
  const agents = new Map();
  for (const [i, a] of AGENTS.entries()) {
    const donnees = {
      email: `${a.login}@valmorin.fr`,
      motDePasseHash: hash,
      prenom: a.prenom,
      nom: a.nom,
      langue: a.langue ?? "fr",
      actif: a.inactif !== true,
      motDePasseAChanger: false,
      roleId: roles.get(a.role) ?? null,
    };
    const user = await prisma.user.upsert({
      where: { login: a.login },
      create: { id: idStable("U", i), login: a.login, ...donnees },
      // L'`update` REFLÈTE le `create`, le rôle et l'état actif compris : un
      // champ absent de l'`update` est un champ qui ne change jamais.
      update: donnees,
    });
    agents.set(a.cle, user);
  }
  const id = (cle) => agents.get(cle).id;
  compte.agents = agents.size;

  // ── L'organisation ──────────────────────────────────────────────────────
  const directions = new Map();
  for (const [i, d] of DIRECTIONS.entries()) {
    const donnees = { nom: d.nom, responsableId: id(d.responsable) };
    directions.set(
      d.cle,
      await prisma.direction.upsert({
        where: { id: idStable("D", i) },
        create: { id: idStable("D", i), ...donnees },
        update: donnees,
      }),
    );
  }
  compte.directions = directions.size;

  const departements = new Map();
  for (const [i, e] of DEPARTEMENTS.entries()) {
    const donnees = {
      nom: e.nom,
      directionId: directions.get(e.direction).id,
      responsableId: id(e.responsable),
    };
    departements.set(
      e.cle,
      await prisma.departement.upsert({
        where: { id: idStable("E", i) },
        create: { id: idStable("E", i), ...donnees },
        update: donnees,
      }),
    );
  }
  compte.departements = departements.size;

  const services = new Map();
  for (const [i, s] of SERVICES.entries()) {
    // `RG-ORG-03` — le dernier service n'a PAS de responsable, et c'est un
    // état légitime que rien d'autre ne produit. `managerId` est dans
    // l'`update` : sans lui, un service qui perd son responsable le garderait.
    const donnees = {
      nom: s.nom,
      departementId: departements.get(s.departement).id,
      managerId: s.manager ? id(s.manager) : null,
    };
    services.set(
      s.cle,
      await prisma.service.upsert({
        where: { id: idStable("S", i) },
        create: { id: idStable("S", i), ...donnees },
        update: donnees,
      }),
    );
  }
  compte.services = services.size;

  for (const a of AGENTS) {
    const service = services.get(a.service);
    const departement = DEPARTEMENTS.find(
      (e) => e.cle === SERVICES.find((s) => s.cle === a.service).departement,
    );
    await prisma.user.update({
      where: { id: id(a.cle) },
      data: { departementId: departements.get(departement.cle).id },
    });
    await prisma.userService.upsert({
      where: { userId_serviceId: { userId: id(a.cle), serviceId: service.id } },
      create: { userId: id(a.cle), serviceId: service.id },
      update: {},
    });
  }

  // ── Les projets ─────────────────────────────────────────────────────────
  const projets = new Map();
  for (const [i, p] of PROJETS.entries()) {
    const donnees = {
      nom: p.nom,
      icone: p.icone,
      statut: p.statut,
      priorite: p.priorite,
      dateDebut: jour(p.debut),
      dateFin: jour(p.fin),
      budgetHeures: p.budget,
      chefId: id(p.chef),
      sponsorId: id(p.sponsor),
      departementId: departements.get(p.departement).id,
    };
    projets.set(
      p.cle,
      await prisma.project.upsert({
        where: { id: idStable("P", i) },
        create: { id: idStable("P", i), createurId: id(p.chef), ...donnees },
        update: donnees,
      }),
    );
  }
  compte.projets = projets.size;

  let membres = 0;
  for (const [cle, equipe] of Object.entries(EQUIPES)) {
    for (const m of equipe) {
      const donnees = { roleProjet: m.role, tauxAllocation: m.taux };
      await prisma.projectMember.upsert({
        where: { projectId_userId: { projectId: projets.get(cle).id, userId: id(m.agent) } },
        create: { projectId: projets.get(cle).id, userId: id(m.agent), ...donnees },
        update: donnees,
      });
      membres += 1;
    }
  }
  compte.membresProjet = membres;

  const jalons = new Map();
  for (const [cle, liste] of Object.entries(JALONS)) {
    for (const j of liste) {
      const echeance = j.dans === null ? null : jour(j.dans);
      const jalon = await prisma.milestone.upsert({
        where: { projectId_nom: { projectId: projets.get(cle).id, nom: j.nom } },
        create: { projectId: projets.get(cle).id, nom: j.nom, dateEcheance: echeance },
        update: { dateEcheance: echeance },
      });
      jalons.set(`${cle}|${j.nom}`, jalon);
    }
  }
  compte.jalons = jalons.size;

  const epopees = new Map();
  for (const e of EPOPEES) {
    epopees.set(
      e.cle,
      await prisma.epic.upsert({
        where: { projectId_nom: { projectId: projets.get(e.projet).id, nom: e.nom } },
        create: { projectId: projets.get(e.projet).id, nom: e.nom },
        update: {},
      }),
    );
  }
  compte.epopees = epopees.size;

  // ── Les tâches ──────────────────────────────────────────────────────────
  const taches = new Map();
  for (const [i, t] of TACHES.entries()) {
    const projet = t.projet ? projets.get(t.projet) : null;
    const jalon = t.jalon ? jalons.get(`${t.projet}|${t.jalon}`) : null;
    /*
     * `RG-TSK-17` — une tâche terminée est à cent pour cent. La règle vaut
     * pour TOUS les chemins d'écriture, et un jeu de données en est un :
     * `RG-PRJ-07` moyenne l'avancement des tâches, `RG-JAL-01` en déduit le
     * statut d'un jalon. Un projet entièrement clos qui afficherait 92 % ne
     * serait pas un défaut de la vue.
     */
    const avancement = t.statut === "done" ? 100 : (t.avancement ?? 0);
    const donnees = {
      titre: t.titre,
      statut: t.statut,
      priorite: t.priorite ?? "normal",
      dateDebut: jour(t.debut),
      dateFin: jour(t.fin),
      avancement,
      estimationHeures: t.heures ?? null,
      confidentielle: t.confidentielle === true,
      interventionExterieure: t.externe === true,
      projectId: projet ? projet.id : null,
      milestoneId: jalon ? jalon.id : null,
      epicId: t.epopee ? epopees.get(t.epopee).id : null,
    };
    const tache = await prisma.task.upsert({
      where: { id: idStable("T", i) },
      create: { id: idStable("T", i), ...donnees },
      update: donnees,
    });
    taches.set(t.cle, tache);

    // Les assignations : elles se REPRENNENT, sinon un porteur retiré du jeu
    // reste attaché pour toujours.
    await prisma.taskAssignee.deleteMany({
      where: { taskId: tache.id, userId: { notIn: t.agents.map((a) => id(a)) } },
    });
    for (const [k, a] of t.agents.entries()) {
      await prisma.taskAssignee.upsert({
        where: { taskId_userId: { taskId: tache.id, userId: id(a) } },
        create: { taskId: tache.id, userId: id(a), porteur: k === 0 },
        update: { porteur: k === 0 },
      });
    }
  }
  compte.taches = taches.size;

  for (const d of DEPENDANCES) {
    await prisma.taskDependency.upsert({
      where: {
        taskId_prerequisId: {
          taskId: taches.get(d.tache).id,
          prerequisId: taches.get(d.prerequis).id,
        },
      },
      create: { taskId: taches.get(d.tache).id, prerequisId: taches.get(d.prerequis).id },
      update: {},
    });
  }
  compte.dependances = DEPENDANCES.length;

  for (const r of RACI) {
    await prisma.taskRaci.upsert({
      where: {
        taskId_userId_role: { taskId: taches.get(r.tache).id, userId: id(r.agent), role: r.role },
      },
      create: { taskId: taches.get(r.tache).id, userId: id(r.agent), role: r.role },
      update: {},
    });
  }
  compte.raci = RACI.length;

  for (const [i, st] of SOUS_TACHES.entries()) {
    const donnees = { taskId: taches.get(st.tache).id, libelle: st.libelle, fait: st.fait };
    await prisma.subtask.upsert({
      where: { id: idStable("B", i) },
      create: { id: idStable("B", i), ordre: i, ...donnees },
      update: donnees,
    });
  }
  compte.sousTaches = SOUS_TACHES.length;

  for (const [i, d] of DOCUMENTS.entries()) {
    const donnees = {
      nom: d.nom,
      tailleOctets: d.octets,
      typeMime: d.type,
      auteurId: id(d.auteur),
      taskId: d.tache ? taches.get(d.tache).id : null,
      projectId: d.projet ? projets.get(d.projet).id : null,
    };
    await prisma.document.upsert({
      where: { id: idStable("F", i) },
      create: { id: idStable("F", i), empreinte: `recette-${d.cle}`, ...donnees },
      update: donnees,
    });
  }
  compte.documents = DOCUMENTS.length;

  for (const [i, c] of COMMENTAIRES.entries()) {
    const donnees = {
      contenu: c.contenu,
      auteurId: id(c.auteur),
      taskId: c.tache ? taches.get(c.tache).id : null,
      projectId: c.projet ? projets.get(c.projet).id : null,
    };
    await prisma.comment.upsert({
      where: { id: idStable("C", i) },
      create: { id: idStable("C", i), ...donnees },
      update: donnees,
    });
  }
  compte.commentaires = COMMENTAIRES.length;

  for (const [i, t] of TODOS.entries()) {
    const donnees = { userId: id(t.agent), libelle: t.libelle, fait: t.fait, ordre: i };
    await prisma.todo.upsert({
      where: { id: idStable("O", i) },
      create: { id: idStable("O", i), ...donnees },
      update: donnees,
    });
  }
  compte.todos = TODOS.length;

  /*
   * Le lien de chaque notification, celui que le PRODUIT poserait pour ce type
   * (`notifications.service.ts`, `taches.service.ts`, `projets.service.ts`,
   * `conges.service.ts`). Une notification dont la cible n'est pas déclarée
   * fait échouer le jeu : elle serait posée muette, et le panneau de la cloche
   * ne se plaindrait de rien.
   */
  const lienNotification = (n) => {
    if (n.type.startsWith("conge_")) return "/conges";
    if (n.type.startsWith("tache_")) {
      if (!taches.has(n.tache)) throw new Error(`Notification « ${n.titre} » : tâche « ${n.tache} » inconnue.`);
      return `/taches/${taches.get(n.tache).id}`;
    }
    if (n.type === "ajout_projet") {
      if (!projets.has(n.projet)) throw new Error(`Notification « ${n.titre} » : projet « ${n.projet} » inconnu.`);
      return `/projets/${projets.get(n.projet).id}`;
    }
    throw new Error(`Type de notification hors du catalogue fermé de \`cadrage/01 § M18\` : « ${n.type} ».`);
  };

  for (const [i, n] of NOTIFICATIONS.entries()) {
    const donnees = {
      userId: id(n.agent),
      type: n.type,
      titre: n.titre,
      contenu: n.contenu,
      lien: lienNotification(n),
      lue: n.lue,
    };
    await prisma.notification.upsert({
      where: { id: idStable("N", i) },
      create: { id: idStable("N", i), ...donnees },
      update: donnees,
    });
  }
  compte.notifications = NOTIFICATIONS.length;
  compte.notificationsNonLues = NOTIFICATIONS.filter((n) => !n.lue).length;

  // ── Compétences ─────────────────────────────────────────────────────────
  let detenteurs = 0;
  for (const [i, c] of COMPETENCES.entries()) {
    const competence = await prisma.skill.upsert({
      where: { nom: c.nom },
      create: { id: idStable("K", i), nom: c.nom, categorie: c.categorie, effectifRequis: c.requis },
      update: { categorie: c.categorie, effectifRequis: c.requis },
    });
    for (const [k, a] of c.detenteurs.entries()) {
      const niveau = NIVEAUX[(i + k) % NIVEAUX.length];
      await prisma.userSkill.upsert({
        where: { userId_skillId: { userId: id(a), skillId: competence.id } },
        create: { userId: id(a), skillId: competence.id, niveau },
        update: { niveau },
      });
      detenteurs += 1;
    }
  }
  compte.competences = COMPETENCES.length;
  compte.detenteursCompetence = detenteurs;

  // ── Tiers et bénéficiaires ──────────────────────────────────────────────
  const tiers = new Map();
  for (const [i, t] of TIERS.entries()) {
    // `RG-TRS-01` — une personne morale ne porte pas de contact nommé : son
    // identité vient du champ `organisation`. La base le refuse, pas seulement
    // le service.
    const donnees = {
      type: t.type,
      organisation: t.organisation ?? null,
      contactNom: t.type === "organisation" ? null : (t.contactNom ?? null),
      contactEmail: t.email ?? null,
      adresse: t.adresse ?? null,
      actif: t.actif,
    };
    tiers.set(
      t.cle,
      await prisma.thirdParty.upsert({
        where: { id: idStable("Y", i) },
        create: { id: idStable("Y", i), ...donnees },
        update: donnees,
      }),
    );
  }
  compte.tiers = tiers.size;

  for (const r of TIERS_PROJETS) {
    await prisma.projectThirdParty.upsert({
      where: {
        projectId_thirdPartyId: {
          projectId: projets.get(r.projet).id,
          thirdPartyId: tiers.get(r.tiers).id,
        },
      },
      create: { projectId: projets.get(r.projet).id, thirdPartyId: tiers.get(r.tiers).id, role: r.role },
      update: { role: r.role },
    });
  }
  for (const r of TIERS_TACHES) {
    await prisma.taskThirdParty.upsert({
      where: {
        taskId_thirdPartyId: { taskId: taches.get(r.tache).id, thirdPartyId: tiers.get(r.tiers).id },
      },
      create: { taskId: taches.get(r.tache).id, thirdPartyId: tiers.get(r.tiers).id },
      update: {},
    });
  }

  const clients = new Map();
  for (const [i, c] of CLIENTS.entries()) {
    const donnees = {
      nom: c.nom,
      nature: c.nature,
      contactNom: c.contact,
      adresse: c.adresse,
      actif: c.actif,
    };
    const client = await prisma.client.upsert({
      where: { id: idStable("Z", i) },
      create: { id: idStable("Z", i), ...donnees },
      update: donnees,
    });
    clients.set(c.cle, client);
    for (const p of c.projets) {
      await prisma.projectClient.upsert({
        where: { projectId_clientId: { projectId: projets.get(p).id, clientId: client.id } },
        create: { projectId: projets.get(p).id, clientId: client.id },
        update: {},
      });
    }
  }
  compte.clients = clients.size;

  // ── Les événements ──────────────────────────────────────────────────────
  for (const [i, e] of EVENEMENTS.entries()) {
    const donnees = {
      titre: e.titre,
      date: jour(e.jour),
      journeeEntiere: e.journee === true,
      heureDebut: e.debut ?? null,
      heureFin: e.fin ?? null,
      interventionExterieure: e.externe === true,
      projectId: e.projet ? projets.get(e.projet).id : null,
    };
    const evenement = await prisma.event.upsert({
      where: { id: idStable("V", i) },
      create: { id: idStable("V", i), ...donnees },
      update: donnees,
    });
    await prisma.eventParticipant.deleteMany({
      where: { eventId: evenement.id, userId: { notIn: e.participants.map((a) => id(a)) } },
    });
    for (const a of e.participants) {
      await prisma.eventParticipant.upsert({
        where: { eventId_userId: { eventId: evenement.id, userId: id(a) } },
        create: { eventId: evenement.id, userId: id(a) },
        update: {},
      });
    }
  }
  compte.evenements = EVENEMENTS.length;

  // ── Le catalogue d'activité récurrente ──────────────────────────────────
  const permanences = new Map();
  for (const [i, p] of PERMANENCES.entries()) {
    const donnees = {
      nom: p.nom,
      description: p.description,
      icone: p.icone,
      dureeParDefaut: p.duree,
      heureDebut: p.debut,
      heureFin: p.fin,
      poids: p.poids,
      teletravailAutorise: p.teletravail,
      actif: p.actif,
    };
    permanences.set(
      p.cle,
      await prisma.predefinedTask.upsert({
        where: { id: idStable("Q", i) },
        create: { id: idStable("Q", i), ...donnees },
        update: donnees,
      }),
    );
  }
  compte.permanences = permanences.size;

  let rangAssignation = 0;
  for (const a of ASSIGNATIONS) {
    for (const agent of a.agents) {
      const donnees = {
        predefinedTaskId: permanences.get(a.permanence).id,
        userId: id(agent),
        date: jour(a.jour),
        periode: a.periode,
        realisee: a.jour < 0,
      };
      await prisma.predefinedTaskAssignment.upsert({
        where: { id: idStable("A", rangAssignation) },
        create: { id: idStable("A", rangAssignation), ...donnees },
        update: donnees,
      });
      rangAssignation += 1;
    }
  }
  compte.assignations = rangAssignation;

  for (const [i, r] of RECURRENCES.entries()) {
    const donnees = {
      predefinedTaskId: permanences.get(r.permanence).id,
      type: r.type,
      frequence: r.frequence,
      jourSemaine: r.jourSemaine ?? null,
      jourMois: r.jourMois ?? null,
      ordinal: r.ordinal ?? null,
      dateDebut: jour(-60),
      dateFin: null,
      active: r.active !== false,
    };
    await prisma.predefinedTaskRecurrence.upsert({
      where: { id: idStable("R", i) },
      create: { id: idStable("R", i), ...donnees },
      update: donnees,
    });
  }
  compte.recurrences = RECURRENCES.length;

  // ── Les congés ──────────────────────────────────────────────────────────
  const typesConge = new Map();
  for (const [i, t] of TYPES_CONGE.entries()) {
    const donnees = {
      nom: t.nom,
      description: t.description ?? null,
      couleur: t.couleur,
      ordre: t.ordre,
      limiteAnnuelle: t.limite,
      validationRequise: t.validation,
      // `update` reflète `create`, valeur nulle comprise : un champ absent de
      // l'`update` est un champ qui ne change jamais, et les identifiants
      // stables rendent l'oubli invisible.
      systeme: t.systeme === true,
      actif: true,
    };
    typesConge.set(
      t.cle,
      await prisma.leaveType.upsert({
        where: { code: t.code },
        create: { id: idStable("t", i), code: t.code, ...donnees },
        update: donnees,
      }),
    );
  }
  compte.typesConge = typesConge.size;

  /*
   * Les soldes, sur l'année courante ET la suivante : sans allocation,
   * `RG-CNG-20` refuse toute demande, et une demande posée en décembre porte
   * sur l'année suivante.
   */
  let rangSolde = 0;
  for (const decalage of [0, 1]) {
    for (const [cle, jours] of Object.entries(SOLDES_GLOBAUX)) {
      const donnees = { userId: null, typeId: typesConge.get(cle).id, annee: annee + decalage, joursAttribues: jours };
      await prisma.leaveBalance.upsert({
        where: { id: idStable("L", rangSolde) },
        create: { id: idStable("L", rangSolde), ...donnees },
        update: donnees,
      });
      rangSolde += 1;
    }
    for (const s of SOLDES_NOMINATIFS) {
      const donnees = { userId: id(s.agent), typeId: typesConge.get(s.type).id, annee: annee + decalage, joursAttribues: s.jours };
      await prisma.leaveBalance.upsert({
        where: { id: idStable("L", rangSolde) },
        create: { id: idStable("L", rangSolde), ...donnees },
        update: donnees,
      });
      rangSolde += 1;
    }
  }
  compte.soldes = rangSolde;

  /*
   * `RG-CNG-25` — la base refuse deux congés qui se chevauchent pour la même
   * personne, par contrainte d'exclusion GiST. Or tout ce jeu est ancré sur le
   * lundi courant : rejoué neuf jours plus tard, les nouvelles dates
   * chevauchent celles que le rejeu n'a pas encore réécrites, et l'insertion
   * est refusée à mi-parcours. L'idempotence ne vaudrait qu'à date constante —
   * ce qu'un rejeu le même jour ne peut pas révéler.
   *
   * Les congés du jeu portent des identifiants stables et connus : ils sont
   * effacés puis reposés, et rien d'autre n'est touché.
   */
  const idsConges = CONGES.map((_, i) => idStable("c", i));
  const idCheval = idStable("c", 900);
  await prisma.leave.deleteMany({ where: { id: { in: [...idsConges, idCheval] } } });
  let repartitions = 0;
  for (const [i, c] of CONGES.entries()) {
    // La répartition par année accompagne CHAQUE congé, pas seulement celui qui
    // enjambe le 31 décembre : c'est elle que `solde()` compte.
    const parts = repartirParAnnee(jour(c.debut), jour(c.fin), c.jours);
    await prisma.leave.create({
      data: {
        id: idStable("c", i),
        userId: id(c.agent),
        typeId: typesConge.get(c.type).id,
        dateDebut: jour(c.debut),
        dateFin: jour(c.fin),
        joursOuvres: c.jours,
        statut: c.statut,
        demiJourneeDebut: c.demiDebut ?? null,
        motif: c.motif ?? null,
        motifRefus: c.motifRefus ?? null,
        validateurId: c.validateur ? id(c.validateur) : null,
        autoValide: c.autoValide === true,
        decideLe: ["approved", "refused"].includes(c.statut) ? jour(c.debut - 7) : null,
        repartitions: { create: parts },
      },
    });
    repartitions += parts.length;
  }
  /*
   * Le congé à cheval sur le 31 décembre — `RG-CNG-19`. Sa date est ABSOLUE :
   * ancrée sur le lundi courant, elle cesserait de chevaucher l'année dès la
   * semaine suivante. La répartition par année est POSÉE ici, parce que ce
   * module écrit en base sans passer par le service qui la calcule : sans
   * elle, il fabriquerait une ligne que le produit n'aurait jamais pu produire.
   */
  await prisma.leave.create({
    data: {
      id: idCheval,
      userId: id(CONGE_A_CHEVAL.agent),
      typeId: typesConge.get(CONGE_A_CHEVAL.type).id,
      dateDebut: new Date(Date.UTC(annee, 11, 28)),
      dateFin: new Date(Date.UTC(annee + 1, 0, 4)),
      joursOuvres: CONGE_A_CHEVAL.jours,
      statut: CONGE_A_CHEVAL.statut,
      validateurId: id("nguema"),
      repartitions: {
        create: [
          { annee, jours: CONGE_A_CHEVAL.avant },
          { annee: annee + 1, jours: CONGE_A_CHEVAL.apres },
        ],
      },
    },
  });
  compte.conges = CONGES.length + 1;
  compte.congesEnAttente = CONGES.filter((c) => c.statut === "pending").length;
  compte.repartitionsConge = repartitions + 2;

  for (const [i, d] of DELEGATIONS.entries()) {
    const donnees = {
      delegantId: id(d.delegant),
      delegueId: id(d.delegue),
      dateDebut: jour(d.debut),
      dateFin: jour(d.fin),
      active: d.active,
    };
    await prisma.leaveDelegation.upsert({
      where: { id: idStable("J", i) },
      create: { id: idStable("J", i), ...donnees },
      update: donnees,
    });
  }
  compte.delegations = DELEGATIONS.length;

  // ── Le télétravail ──────────────────────────────────────────────────────
  for (const [i, r] of REGLES_TELETRAVAIL.entries()) {
    const donnees = {
      userId: id(r.agent),
      jourSemaine: r.jourSemaine,
      dateDebut: jour(r.debut),
      dateFin: r.fin === null ? null : jour(r.fin),
      active: r.active,
    };
    await prisma.teleworkRule.upsert({
      where: { id: idStable("W", i) },
      create: { id: idStable("W", i), ...donnees },
      update: donnees,
    });
  }
  compte.reglesTeletravail = REGLES_TELETRAVAIL.length;

  /*
   * Les jours déclarés, sur trois semaines. L'`upsert` porte sur le couple
   * (agent, date) et non sur un identifiant stable : c'est l'unicité que le
   * schéma déclare (`RG-TLT-01`), et un identifiant stable rejoué à date
   * décalée irait buter dessus.
   */
  let joursPresence = 0;
  for (const p of PRESENCE) {
    for (const semaine of [-7, 0, 7]) {
      for (let j = 0; j < 5; j += 1) {
        const teletravaille = p.teletravail.includes(j);
        // Une EXCEPTION : le jour vient d'une règle et l'agent l'a modifié.
        const exception = semaine === 7 && p.agent === "lea" && j === 1;
        // Un jour NON DÉCLARÉ : l'état existe, et rien d'autre ne le produit.
        const inconnu = semaine === 7 && p.agent === "halard" && j === 3;
        const etat = inconnu ? "undeclared" : exception ? "office" : teletravaille ? "telework" : "office";
        const donnees = {
          etat,
          issuDeRegle: teletravaille && p.regle === true,
          exception,
        };
        await prisma.telework.upsert({
          where: { userId_date: { userId: id(p.agent), date: jour(semaine + j) } },
          create: { userId: id(p.agent), date: jour(semaine + j), ...donnees },
          update: donnees,
        });
        joursPresence += 1;
      }
    }
  }
  compte.joursTeletravail = joursPresence;

  // ── Le temps passé ──────────────────────────────────────────────────────
  let rangSaisie = 0;
  for (const s of SAISIES) {
    const tache = taches.get(s.tache);
    for (const semaine of [0, -7, -14, -21]) {
      for (const j of s.jours) {
        const donnees = {
          userId: id(s.agent),
          taskId: tache.id,
          projectId: tache.projectId,
          date: jour(semaine + j),
          heures: s.heures,
          typeActivite: s.type,
          creeParId: id(s.agent),
          description: null,
        };
        await prisma.timeEntry.upsert({
          where: { id: idStable("H", rangSaisie) },
          create: { id: idStable("H", rangSaisie), ...donnees },
          update: donnees,
        });
        rangSaisie += 1;
      }
    }
  }

  /*
   * Un jour AU-DESSUS du plafond journalier — `RG-TMP-02`. Le plafond vaut
   * douze heures ; trois saisies de cinq heures le dépassent franchement. Sans
   * ce cas, la jauge de la vue 21 ne montre jamais son état d'alerte.
   */
  for (const [n, cle] of ["intra-maquette", "gui-formulaire", "hp-point"].entries()) {
    const tache = taches.get(cle);
    const donnees = {
      userId: id("lea"),
      taskId: tache.id,
      projectId: tache.projectId,
      date: jour(2),
      heures: 5,
      typeActivite: n === 2 ? "meeting" : "development",
      creeParId: id("lea"),
      description: "Atelier de reprise des contenus",
    };
    await prisma.timeEntry.upsert({
      where: { id: idStable("H", 900 + n) },
      create: { id: idStable("H", 900 + n), ...donnees },
      update: donnees,
    });
    rangSaisie += 1;
  }

  /*
   * Le temps déclaré POUR UN TIERS. La table porte `userId` OU `thirdPartyId`,
   * jamais les deux : sans `creeParId`, une telle saisie n'apparaîtrait dans le
   * journal de personne — pas même de celui qui l'a posée.
   */
  for (let n = 0; n < 8; n += 1) {
    const donnees = {
      userId: null,
      thirdPartyId: tiers.get("vernaud").id,
      taskId: taches.get("intra-cdc").id,
      projectId: projets.get("intranet").id,
      date: jour(n % 5),
      heures: 2 + (n % 3),
      typeActivite: "other",
      creeParId: id("malik"),
      description: "Assistance à maîtrise d'ouvrage — atelier de cadrage",
    };
    await prisma.timeEntry.upsert({
      where: { id: idStable("H", 950 + n) },
      create: { id: idStable("H", 950 + n), ...donnees },
      update: donnees,
    });
    rangSaisie += 1;
  }
  compte.saisiesTemps = rangSaisie;

  /*
   * `RG-TMP-06` — une tâche terminée peut être close SANS déclaration. La
   * validation est enregistrée pour distinguer « oublié » de « rien à
   * déclarer ».
   */
  await prisma.taskTimeWaiver.upsert({
    where: { taskId_userId: { taskId: taches.get("sob-rapport").id, userId: id("prevost") } },
    create: { taskId: taches.get("sob-rapport").id, userId: id("prevost") },
    update: {},
  });

  /*
   * `RG-PRJ-09` — les instantanés, sans lesquels la courbe de tendance d'un
   * projet n'a qu'un seul point.
   */
  const progressions = [12, 20, 28, 35, 41, 48];
  for (const [n, progression] of progressions.entries()) {
    const date = jour(-150 + n * 25);
    const donnees = {
      progression,
      tachesTotal: 10,
      tachesFinies: Math.floor(progression / 25),
      heuresConsommees: 40 + n * 35,
    };
    await prisma.projectSnapshot.upsert({
      // Par identifiant STABLE et non par (projet, date) : rejoué à date
      // décalée, un instantané doit se DÉPLACER, pas s'ajouter à côté de
      // celui de la veille.
      where: { id: idStable("I", n) },
      create: { id: idStable("I", n), projectId: projets.get("intranet").id, date, ...donnees },
      update: { projectId: projets.get("intranet").id, date, ...donnees },
    });
  }
  compte.instantanes = progressions.length;

  // ── Le calendrier ───────────────────────────────────────────────────────
  let rangFerie = 0;
  // La récurrence déclarée commande le semis : un férié « Cette année
  // seulement » ne se pose que sur l'année courante.
  for (const f of FERIES) {
    for (const decalage of f.recurrent ? [0, 1] : [0]) {
      const date = new Date(Date.UTC(annee + decalage, f.mois - 1, f.jour));
      const donnees = {
        date,
        libelle: f.libelle,
        type: f.type,
        ouvre: f.ouvre === true,
        recurrent: f.recurrent,
      };
      await prisma.holiday.upsert({
        where: { date },
        create: { id: idStable("h", rangFerie), ...donnees },
        update: donnees,
      });
      rangFerie += 1;
    }
  }
  compte.feries = rangFerie;

  let rangVacances = 0;
  for (const decalage of [0, 1]) {
    const anneeScolaire = `${annee + decalage}-${annee + decalage + 1}`;
    for (const v of VACANCES) {
      const donnees = {
        libelle: v.libelle,
        zone: "B",
        anneeScolaire,
        dateDebut: new Date(Date.UTC(annee + decalage + v.debut[0], v.debut[1] - 1, v.debut[2])),
        dateFin: new Date(Date.UTC(annee + decalage + v.fin[0], v.fin[1] - 1, v.fin[2])),
        importee: true,
      };
      await prisma.schoolVacation.upsert({
        where: { id: idStable("v", rangVacances) },
        create: { id: idStable("v", rangVacances), ...donnees },
        update: donnees,
      });
      rangVacances += 1;
    }
  }
  compte.vacances = rangVacances;

  // ── Les réglages d'affichage, à leur valeur par défaut ──────────────────
  for (const [cle, valeur] of Object.entries(REGLAGES)) {
    await prisma.setting.upsert({
      where: { cle },
      create: { cle, valeur, public: true },
      update: { valeur, public: true },
    });
  }
  compte.reglages = Object.keys(REGLAGES).length;

  /*
   * Le journal d'audit. Il est en AJOUT SEUL (`RG-ADM-01`) : le rôle applicatif
   * n'y a que `INSERT` et `SELECT`, donc un jeu de données ne peut pas y être
   * idempotent par `upsert`. Il se rejoue en effaçant d'abord ses propres
   * lignes, ce qui n'est possible que par la connexion propriétaire — légitime
   * sur une base de recette, impossible depuis l'application.
   *
   * L'horodatage est à la MINUTE : le journal réel porte des lignes de
   * connexion et d'écriture, et un événement de recette daté d'il y a huit
   * heures serait enseveli avant d'avoir été vu.
   */
  await prisma.auditLog.deleteMany({ where: { typeEntite: "JeuRecette" } });
  for (const [i, e] of AUDIT.entries()) {
    await prisma.auditLog.create({
      data: {
        action: e.action,
        typeEntite: "JeuRecette",
        entiteId: idStable("G", i),
        acteurId: e.systeme === true ? null : id(e.agent),
        systeme: e.systeme === true,
        horodatage: new Date(aujourdhui.getTime() - (i + 1) * 60_000),
      },
    });
  }
  compte.audit = AUDIT.length;

  return compte;
}

// ═══════════════════════════════════════════════════════════════════════════
// Exécution directe
// ═══════════════════════════════════════════════════════════════════════════

const executeDirectement = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (executeDirectement) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL n'est pas renseignée. Indiquez la base de recette à peupler.");
    process.exit(1);
  }
  /*
   * `RECETTE_AUJOURDHUI` déplace l'horloge du jeu. Un rejeu le MÊME jour ne
   * prouve rien de l'idempotence : ce sont les dates ancrées sur le lundi
   * courant qui se heurtent aux contraintes, et il faut décaler pour le voir.
   */
  const jourDit = process.env.RECETTE_AUJOURDHUI;
  const aujourdhui = jourDit ? new Date(`${jourDit}T12:00:00.000Z`) : new Date();
  if (Number.isNaN(aujourdhui.getTime())) {
    console.error(`RECETTE_AUJOURDHUI « ${jourDit} » n'est pas une date ISO lisible (attendu : AAAA-MM-JJ).`);
    process.exit(1);
  }

  const prisma = creerClient(url);
  try {
    const compte = await peuplerJeu2(prisma, aujourdhui);
    console.log(`Jeu de recette posé — horloge au ${aujourdhui.toISOString().slice(0, 10)}`);
    for (const [cle, valeur] of Object.entries(compte)) {
      console.log(`  ${cle.padEnd(24)} ${valeur}`);
    }
    console.log("Comptes de recette :");
    for (const [nom, p] of Object.entries(PERSONAS)) {
      console.log(`  ${nom.padEnd(9)} ${p.login.padEnd(14)} ${p.prenom} ${p.nom} — ${p.role}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}
