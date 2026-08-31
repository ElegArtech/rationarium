import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import "reflect-metadata";
import { RequestMethod } from "@nestjs/common";
import { PATH_METADATA, METHOD_METADATA } from "@nestjs/common/constants.js";
import { estAuCatalogue } from "@rationarium/contracts";
import { CLE_PERMISSION, CLE_PERSONNEL, CLE_PUBLIC } from "./permissions.garde.js";

import { AuthController } from "../auth/auth.controller.js";
import { OrganisationController } from "../organisation/organisation.controller.js";
import { UtilisateursController } from "../utilisateurs/utilisateurs.controller.js";
import { AdministrationController } from "../administration/administration.controller.js";
import { ParametrageController } from "../parametrage/parametrage.controller.js";
import { ProjetsController } from "../projets/projets.controller.js";
import { TachesController } from "../taches/taches.controller.js";
import { CongesController } from "../conges/conges.controller.js";
import { TeletravailController } from "../teletravail/teletravail.controller.js";
import { EvenementsController } from "../evenements/evenements.controller.js";
import { ActiviteController } from "../activite/activite.controller.js";
import { TempsController } from "../temps/temps.controller.js";
import { DocumentsController } from "../documents/documents.controller.js";
import { CompetencesController } from "../competences/competences.controller.js";
import { TiersController, ClientsController } from "../tiers/tiers.controller.js";
import { PlanningController } from "../planning/planning.controller.js";
import { TableauController } from "../tableau/tableau.controller.js";
import { RapportsController } from "../rapports/rapports.controller.js";
import { NotificationsController } from "../notifications/notifications.controller.js";
import { ImportsController } from "../imports/imports.controller.js";
import { SanteController } from "../exploitation/sante.controller.js";

/**
 * `RG-DROITS-03` — **aucun point d'entrée n'est ouvert par inadvertance.**
 *
 * La garde de permission est globale : elle ne peut pas être oubliée. Mais
 * elle laisse passer un point d'entrée qui ne déclare *aucune* permission —
 * c'est le comportement voulu pour les routes marquées `@Public()`, et c'est
 * exactement le trou par lequel une route métier passerait sans contrôle si
 * son décorateur manquait.
 *
 * Ce test ferme le trou : toute méthode d'un contrôleur doit déclarer soit une
 * permission du catalogue, soit `@Public()` — et la liste des routes publiques
 * est **énumérée ici**, donc toute nouvelle route publique demande une
 * modification visible en relecture.
 */

const CONTROLEURS = [
  AuthController,
  OrganisationController,
  UtilisateursController,
  AdministrationController,
  ParametrageController,
  ProjetsController,
  TachesController,
  CongesController,
  TeletravailController,
  EvenementsController,
  ActiviteController,
  TempsController,
  DocumentsController,
  CompetencesController,
  ClientsController,
  TiersController,
  PlanningController,
  TableauController,
  RapportsController,
  NotificationsController,
  ImportsController,
  SanteController,
];

/** Les seules routes autorisées à se passer de permission. */
const PUBLIQUES_ATTENDUES = new Set([
  "AuthController.login",
  "AuthController.logout",
  "AuthController.signup",
  "AuthController.forgotPassword",
  "AuthController.resetPassword",
  "AuthController.changePassword",
  "AuthController.me",
  // Ce que la page de connexion doit savoir avant toute session (vue 01).
  "AuthController.acces",
  // L-29 — une sonde d'exploitation n'a pas de session. Voir sante.controller.ts.
  "SanteController.vivant",
  "SanteController.pret",
]);

/**
 * Les seules routes autorisées à exiger une session **sans** permission.
 *
 * `RG-DSH-01` — les to-do sont strictement privées, et les vingt-quatre
 * domaines de `cadrage/01 § 3.2` n'en comportent aucun pour elles. La liste est
 * énumérée ici pour la même raison que la précédente : y ajouter une route
 * demande une modification visible en relecture.
 */
const PERSONNELLES_ATTENDUES = new Set([
  "TableauController.todos",
  "TableauController.ajouter",
  "TableauController.modifier",
  "TableauController.supprimer",
  // `cadrage/01 § M18` — une notification appartient à son destinataire.
  "NotificationsController.lister",
  "NotificationsController.marquerLue",
  "NotificationsController.toutMarquerLu",
  /*
   * `EX-AUTH-09` — son propre profil. Le catalogue des vingt-quatre domaines
   * de `cadrage/01 § 3.2` n'en comporte pas pour « modifier son identité, sa
   * langue, son thème » : inventer un domaine hors catalogue serait pire.
   *
   * La route est bornée à `d.userId` — jamais à un identifiant reçu du client.
   * Une permission n'y ajouterait rien, et `@Public()` aurait menti : elle
   * signifie « AVANT la session », or celle-ci en exige une. Ce test a refusé
   * les deux erreurs successivement.
   */
  "AuthController.modifierProfil",
]);

type Route = {
  nom: string;
  permission: string | undefined;
  publique: boolean;
  personnelle: boolean;
};

function routes(): Route[] {
  const trouvees: Route[] = [];
  for (const controleur of CONTROLEURS) {
    const prototype = controleur.prototype as object;
    for (const methode of Object.getOwnPropertyNames(prototype)) {
      if (methode === "constructor") continue;
      const fn = (prototype as Record<string, unknown>)[methode];
      if (typeof fn !== "function") continue;
      // Une méthode sans verbe HTTP n'est pas une route : c'est un utilitaire.
      if (Reflect.getMetadata(METHOD_METADATA, fn) === undefined) continue;
      trouvees.push({
        nom: `${controleur.name}.${methode}`,
        permission: Reflect.getMetadata(CLE_PERMISSION, fn) as string | undefined,
        publique: Reflect.getMetadata(CLE_PUBLIC, fn) === true,
        personnelle: Reflect.getMetadata(CLE_PERSONNEL, fn) === true,
      });
    }
  }
  return trouvees;
}

describe("RG-DROITS-03 — la surface HTTP est entièrement gardée", () => {
  const toutes = routes();

  it("la lecture des métadonnées trouve bien des routes — sinon le test ne teste rien", () => {
    expect(toutes.length).toBeGreaterThan(60);
    expect(new Set(toutes.map((r) => r.nom.split(".")[0])).size).toBe(CONTROLEURS.length);
  });

  it("chaque route déclare une permission, ou est explicitement publique ou personnelle", () => {
    const nues = toutes
      .filter((r) => !r.permission && !r.publique && !r.personnelle)
      .map((r) => r.nom);
    expect(nues).toEqual([]);
  });

  it("les routes personnelles sont exactement celles d'une donnée strictement privée", () => {
    const personnelles = toutes.filter((r) => r.personnelle).map((r) => r.nom).sort();
    expect(personnelles).toEqual([...PERSONNELLES_ATTENDUES].sort());
  });

  it("aucune route n'est à la fois personnelle et publique — elle exige une session", () => {
    const ambigues = toutes.filter((r) => r.personnelle && r.publique).map((r) => r.nom);
    expect(ambigues).toEqual([]);
  });

  it("les routes publiques sont exactement celles qui précèdent la session", () => {
    const publiques = toutes.filter((r) => r.publique).map((r) => r.nom).sort();
    expect(publiques).toEqual([...PUBLIQUES_ATTENDUES].sort());
  });

  it("aucune route n'est à la fois publique et gardée — l'intention serait ambiguë", () => {
    const deuxFois = toutes.filter((r) => r.publique && r.permission).map((r) => r.nom);
    expect(deuxFois).toEqual([]);
  });

  it("toute permission exigée existe au catalogue", () => {
    // Le décorateur échoue déjà au chargement ; ce test le constate au lieu de
    // laisser la garantie reposer sur un effet de bord d'importation.
    const inconnues = toutes
      .filter((r) => r.permission && !estAuCatalogue(r.permission))
      .map((r) => `${r.nom} → ${r.permission}`);
    expect(inconnues).toEqual([]);
  });

  it("les contrôleurs portent un préfixe de chemin distinct", () => {
    // Deux contrôleurs sur le même préfixe rendent l'ordre de résolution des
    // routes significatif — donc fragile au réordonnancement des importations.
    const chemins = CONTROLEURS.map((c) => Reflect.getMetadata(PATH_METADATA, c) as string);
    expect(new Set(chemins).size).toBe(CONTROLEURS.length);
  });
});

/**
 * **Aucune capacité serveur sans écran qui l'atteigne.**
 *
 * Une route qu'aucun client n'appelle est du code mort *ou* une fonctionnalité
 * oubliée — et rien ne peut le voir : **une fonctionnalité absente ne fait
 * échouer aucun contrôle.** L'audit du 31/08 en a trouvé treize, dont quatre
 * corrigées le jour même après qu'un utilisateur les ait signalées.
 *
 * Ce test croise la table des routes avec les chemins littéraux passés à
 * `appeler(…)` côté client. Toute route ni appelée ni **énumérée** dans
 * `SANS_CLIENT` échoue : par analogie avec `RG-DROITS-03`, la liste blanche est
 * stricte et toute nouvelle route demande une modification visible en
 * relecture.
 *
 * Il lit les sources du client, comme `messages-metier.test.ts` lit celles des
 * services : les types sont effacés à l'exécution, et c'est le seul moyen de
 * savoir ce qui est réellement appelé.
 */

/** Le segment qui vaut n'importe quoi : `:id` côté serveur, `${id}` côté client. */
const JOKER = "*";

const WEB = path.resolve(import.meta.dirname, "../../../web/src");

type Point = { verbe: string; chemin: string; segments: string[]; nom: string };

/** La table `{verbe, chemin}` complète, lue par réflexion sur les contrôleurs. */
function pointsDEntree(): Point[] {
  const trouves: Point[] = [];
  for (const controleur of CONTROLEURS) {
    const prefixe = Reflect.getMetadata(PATH_METADATA, controleur) as string;
    const prototype = controleur.prototype as object;
    for (const methode of Object.getOwnPropertyNames(prototype)) {
      if (methode === "constructor") continue;
      const fn = (prototype as Record<string, unknown>)[methode];
      if (typeof fn !== "function") continue;
      const verbe = Reflect.getMetadata(METHOD_METADATA, fn) as number | undefined;
      if (verbe === undefined) continue;
      const suffixe = (Reflect.getMetadata(PATH_METADATA, fn) as string | undefined) ?? "/";
      const chemin = `/${prefixe}/${suffixe}`.replace(/\/+/g, "/").replace(/\/+$/, "");
      trouves.push({
        verbe: RequestMethod[verbe] ?? String(verbe),
        chemin: chemin === "" ? "/" : chemin,
        segments: chemin.split("/").filter(Boolean).map((s) => (s.startsWith(":") ? JOKER : s)),
        nom: `${controleur.name}.${methode}`,
      });
    }
  }
  return trouves;
}

type Appel = { verbe: string; brut: string; segments: string[] | null; fichier: string };

function sourcesClient(dossier: string): string[] {
  return readdirSync(dossier).flatMap((entree) => {
    const chemin = path.join(dossier, entree);
    if (statSync(chemin).isDirectory()) return sourcesClient(chemin);
    if (!/\.tsx?$/.test(entree)) return [];
    // `client.ts` **déclare** `appeler` ; un test pourrait en simuler un appel.
    if (entree === "client.ts" || /\.(test|spec)\.tsx?$/.test(entree)) return [];
    return [chemin];
  });
}

/**
 * Le premier argument de `appeler(…)`, chaque `${…}` réduit au joker.
 *
 * Le client construit ses chemins par interpolation : le littéral vaut
 * `` `/rapports${query(f)}` ``. On saute l'interpolation en équilibrant les
 * accolades — un `` ${s ? `?${s}` : ""} `` en imbrique une seconde — plutôt
 * qu'en la reconnaissant par une expression rationnelle, qui s'arrêterait au
 * premier `}` venu.
 */
function litteralDeChemin(args: string): string | null {
  const debut = args.search(/\S/);
  const guillemet = args[debut];
  if (guillemet !== "`" && guillemet !== '"' && guillemet !== "'") return null;
  let sortie = "";
  let i = debut + 1;
  while (i < args.length && args[i] !== guillemet) {
    if (args[i] === "\\") {
      sortie += args[i + 1];
      i += 2;
      continue;
    }
    if (guillemet === "`" && args[i] === "$" && args[i + 1] === "{") {
      let profondeur = 1;
      i += 2;
      while (i < args.length && profondeur > 0) {
        if (args[i] === "{") profondeur++;
        else if (args[i] === "}") profondeur--;
        i++;
      }
      sortie += JOKER;
      continue;
    }
    sortie += args[i];
    i++;
  }
  return sortie;
}

/**
 * Les segments d'un chemin client, ou `null` si sa forme n'est pas lisible.
 *
 * Un joker vaut **un segment entier** : c'est ce qui distingue `/projets/${id}`
 * de `/projets/jalons/${id}`, et un chemin client plus profond qu'une route
 * serveur n'est pas une correspondance. Un `String.includes` ou une
 * comparaison de préfixe rendrait ici les 29 faux positifs de l'audit — et un
 * test qui crie au loup cesse d'être lu.
 *
 * Seul cas de joker collé à du texte : la chaîne de requête,
 * `` `/rapports${query(f)}` ``. Elle ne peut être qu'en **fin** de chemin ;
 * toute autre forme est déclarée illisible et fait échouer le test, plutôt que
 * d'être devinée dans un sens ou dans l'autre.
 */
function segmentsClient(chemin: string): string[] | null {
  const bruts = chemin.split("?")[0]!.split("/").filter(Boolean);
  const segments: string[] = [];
  for (const [rang, brut] of bruts.entries()) {
    if (brut === JOKER) {
      segments.push(JOKER);
      continue;
    }
    if (!brut.includes(JOKER)) {
      segments.push(brut);
      continue;
    }
    const prefixe = brut.slice(0, brut.indexOf(JOKER));
    const dernier = rang === bruts.length - 1;
    if (!dernier || !brut.endsWith(JOKER) || prefixe.length === 0) return null;
    segments.push(prefixe);
  }
  return segments;
}

/**
 * Les adresses `/api/…` construites pour le **navigateur**, pas pour `fetch`.
 *
 * Un export CSV, un modèle d'import, une pièce jointe : le client en fabrique
 * l'adresse et la pose en `href`, le navigateur la télécharge. Ces routes-là
 * sont bel et bien atteintes par un écran — les ignorer donnerait sept fausses
 * orphelines, c'est-à-dire sept invitations à supprimer du code vivant.
 *
 * Un `href` est toujours un `GET`. `/api` est le préfixe global posé par
 * `main.ts` ; il ne fait pas partie du chemin de la route.
 */
function adressesNavigateur(source: string, fichier: string): Appel[] {
  const trouves: Appel[] = [];
  const re = /[`"']\/api\//g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    const brut = litteralDeChemin(source.slice(m.index));
    if (brut === null) continue;
    const segments = segmentsClient(brut);
    if (segments?.[0] === "api") segments.shift();
    trouves.push({ verbe: "GET", brut, segments, fichier });
  }
  return trouves;
}

/** Tout appel à `appeler(…)` dans `apps/web/src`, `api/*.ts` comme `**\/*.tsx`. */
function appelsClient(): Appel[] {
  const trouves: Appel[] = [];
  for (const fichier of sourcesClient(WEB)) {
    const source = readFileSync(fichier, "utf8");
    trouves.push(...adressesNavigateur(source, path.relative(WEB, fichier)));
    const re = /\bappeler\s*</g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(source))) {
      // Saute le générique `<T>` en équilibrant les chevrons.
      let i = m.index + m[0].length;
      let chevrons = 1;
      while (i < source.length && chevrons > 0) {
        if (source[i] === "<") chevrons++;
        else if (source[i] === ">") chevrons--;
        i++;
      }
      while (i < source.length && /\s/.test(source[i]!)) i++;
      if (source[i] !== "(") continue;
      let j = i + 1;
      let parentheses = 1;
      while (j < source.length && parentheses > 0) {
        if (source[j] === "(") parentheses++;
        else if (source[j] === ")") parentheses--;
        j++;
      }
      const args = source.slice(i + 1, j - 1);
      const relatif = path.relative(WEB, fichier);
      const brut = litteralDeChemin(args);
      if (brut === null) {
        trouves.push({ verbe: "?", brut: args.slice(0, 60), segments: null, fichier: relatif });
        continue;
      }
      const verbe = /methode\s*:\s*["'](\w+)["']/.exec(args);
      trouves.push({
        verbe: verbe ? verbe[1]! : "GET",
        brut,
        segments: segmentsClient(brut),
        fichier: relatif,
      });
    }
  }
  return trouves;
}

function apparie(route: string[], appel: string[]): boolean {
  if (route.length !== appel.length) return false;
  return route.every((s, i) => s === JOKER || appel[i] === JOKER || s === appel[i]);
}

/** Une route qu'aucun écran n'appelle **et dont c'est la place**. */
const A_BRANCHER = "à brancher — vague 7-3";

/**
 * Les seules routes autorisées à n'être appelées par aucun écran.
 *
 * Trois familles, et chacune se lit à sa raison :
 *
 * 1. **Les sondes d'exploitation** — elles n'ont pas d'écran, par construction.
 * 2. **Les redondantes** — la donnée arrive déjà par une autre route ; leur
 *    sort est une décision de suppression, pas de branchement (vague 7-4 bis).
 * 3. **Les non branchées** — une capacité serveur que le produit n'offre pas
 *    encore. C'est la liste que la vague 7-3 doit vider, entrée par entrée.
 */
const SANS_CLIENT: { verbe: string; chemin: string; raison: string }[] = [
  // ── 1. Sondes d'exploitation (L-29) ──────────────────────────────────────
  { verbe: "GET", chemin: "/sante", raison: "sonde de vivacité — interrogée par l'orchestrateur, pas par un écran" },
  { verbe: "GET", chemin: "/sante/pret", raison: "sonde de disponibilité — interrogée par l'orchestrateur, pas par un écran" },

  // ── 2. Redondantes : la donnée arrive déjà ailleurs ──────────────────────
  {
    verbe: "GET",
    chemin: "/organisation/statistiques/:niveau/:id",
    raison: "redondante — la vue 29 lit le `_count` embarqué dans `GET /organisation`",
  },
  {
    verbe: "GET",
    chemin: "/projets/:id/budget",
    raison: "redondante — le budget est déjà servi dans `GET /projets/:id`",
  },
  {
    verbe: "GET",
    chemin: "/activite/grille",
    raison: "redondante — `GET /planning/activite` la sert et y ajoute la trame de fond",
  },
  /*
   * Vague 7-3 bis — deux entrées passées de « à brancher » à « redondante »
   * après lecture de ce qu'elles font RÉELLEMENT. Les brancher aurait ajouté
   * un second chemin vers un comportement déjà servi : ce n'est pas du
   * branchement, c'est du doublon.
   */
  {
    verbe: "GET",
    chemin: "/documents/commentaires/fil",
    raison:
      "redondante — `GET /taches/:id` embarque déjà le fil de la tâche, auteur et identifiant compris, et c'est le SEUL écran qui affiche des commentaires : aucun brief de vue projet (11 à 15) ne prévoit de fil de projet",
  },
  {
    verbe: "POST",
    chemin: "/taches/:id/deplacer",
    raison:
      "redondante — même service que `PATCH /planning/taches/deplacer` (`deplacerDepuisPlanning`), que la vue 07 appelle déjà ; elle déplace une DATE ou un ASSIGNÉ, jamais un statut, donc elle ne peut pas servir le kanban de la vue 12, dont les colonnes sont des statuts",
  },

  // ── 3. Capacités serveur qu'aucun écran n'offre encore ───────────────────
  { verbe: "POST", chemin: "/administration/roles", raison: A_BRANCHER },
  { verbe: "PATCH", chemin: "/administration/roles/:id", raison: A_BRANCHER },
  { verbe: "GET", chemin: "/competences/:id/detenteurs", raison: A_BRANCHER },
  { verbe: "GET", chemin: "/competences/export", raison: A_BRANCHER },
  { verbe: "POST", chemin: "/conges/:id/annulation/traiter", raison: A_BRANCHER },
  { verbe: "GET", chemin: "/conges/solde", raison: A_BRANCHER },
  { verbe: "PUT", chemin: "/conges/soldes", raison: A_BRANCHER },
  { verbe: "DELETE", chemin: "/conges/types/:id", raison: A_BRANCHER },
  { verbe: "GET", chemin: "/conges/validateur", raison: A_BRANCHER },
  { verbe: "POST", chemin: "/evenements/:id/participants", raison: A_BRANCHER },
  { verbe: "DELETE", chemin: "/evenements/:id/participants/:userId", raison: A_BRANCHER },
  { verbe: "POST", chemin: "/parametrage/feries", raison: A_BRANCHER },
  { verbe: "GET", chemin: "/parametrage/feries/statistiques", raison: A_BRANCHER },
  { verbe: "GET", chemin: "/parametrage/jours-ouvres", raison: A_BRANCHER },
  { verbe: "GET", chemin: "/parametrage/trame", raison: A_BRANCHER },
  { verbe: "POST", chemin: "/parametrage/vacances", raison: A_BRANCHER },
  { verbe: "POST", chemin: "/projets/:id/instantane", raison: A_BRANCHER },
  { verbe: "GET", chemin: "/temps/non-declarees", raison: A_BRANCHER },
  { verbe: "GET", chemin: "/temps/rapport", raison: A_BRANCHER },
  { verbe: "POST", chemin: "/tiers/taches/:taskId/assigner", raison: A_BRANCHER },
  { verbe: "GET", chemin: "/utilisateurs/presence", raison: A_BRANCHER },
];

describe("aucune route serveur sans appel client", () => {
  const routes = pointsDEntree();
  const appels = appelsClient();

  it("la table des routes et la table des appels sont pleines — sinon le test ne teste rien", () => {
    // Sans cette garde, une réflexion muette ou une regex cassée ferait passer
    // le test à vide. Le dépôt a payé ce piège trois fois.
    expect(routes.length).toBeGreaterThan(150);
    expect(new Set(appels.map((a) => `${a.verbe} ${a.brut}`)).size).toBeGreaterThan(100);
    expect(new Set(routes.map((r) => r.verbe))).toEqual(
      new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]),
    );
  });

  it("tout chemin client a une forme que ce test sait lire", () => {
    // Un chemin illisible serait silencieusement compté comme « non appelé » :
    // il doit rendre le test rouge, pas grossir la liste des orphelines.
    const illisibles = appels
      .filter((a) => a.segments === null)
      .map((a) => `${a.fichier} → ${a.brut}`);
    expect(illisibles).toEqual([]);
  });

  const atteinte = (route: Point) =>
    appels.some(
      (a) => a.segments !== null && a.verbe === route.verbe && apparie(route.segments, a.segments),
    );

  const cle = (r: { verbe: string; chemin: string }) => `${r.verbe} ${r.chemin}`;

  it("toute route serveur est appelée par un écran, ou énumérée avec sa raison", () => {
    const enumerees = new Set(SANS_CLIENT.map(cle));
    const inattendues = routes
      .filter((r) => !atteinte(r) && !enumerees.has(cle(r)))
      // Le nom de la méthode, pour que l'échec dise où regarder.
      .map((r) => `${cle(r)} → ${r.nom}`);
    expect(inattendues).toEqual([]);
  });

  it("`SANS_CLIENT` ne conserve pas d'entrée périmée", () => {
    // Une route branchée en vague 7-3 doit **sortir** de la liste : sans ce
    // test, la liste blanche grossirait sans jamais maigrir, et finirait par
    // couvrir la surface entière — c'est-à-dire ne plus rien garantir. Il
    // attrape aussi la faute de frappe : une entrée qui ne désigne aucune route.
    const existantes = new Set(routes.map(cle));
    const enumerees = new Set(SANS_CLIENT.map(cle));
    const perimees = SANS_CLIENT.filter((e) => !existantes.has(cle(e))).map(cle);
    const branchees = routes.filter((r) => atteinte(r) && enumerees.has(cle(r))).map(cle);
    expect(perimees).toEqual([]);
    expect(branchees).toEqual([]);
  });

  it("chaque route sans client porte une raison écrite, jamais un code", () => {
    const muettes = SANS_CLIENT.filter((e) => e.raison.trim().length < 12).map(cle);
    expect(muettes).toEqual([]);
    expect(new Set(SANS_CLIENT.map(cle)).size).toBe(SANS_CLIENT.length);
  });

  it("aucun écran n'appelle un point d'entrée qui n'existe pas", () => {
    // Le sens inverse : un chemin client sans route en face est un 404 que
    // seule l'action de l'utilisateur révèle — ni le typage, ni les parcours,
    // ni aucune autre boucle ne peut le voir.
    //
    // **La liste est vide, et elle doit le rester.** Elle en portait trois à
    // l'ouverture de la vague 7 : `POST /imports/competences` en est sorti en
    // L-43, `/projet/:id/taches` et `/projet/:id/jalons` en L-44. Un quatrième
    // ferait rougir ce test, et c'est tout ce qu'on lui demande.
    const dansLeVide = appels
      .filter((a) => {
        const segments = a.segments;
        if (segments === null) return false;
        return !routes.some((r) => r.verbe === a.verbe && apparie(r.segments, segments));
      })
      .map((a) => `${a.verbe} ${a.brut}`);
    expect([...new Set(dansLeVide)].sort()).toEqual([]);
  });
});

