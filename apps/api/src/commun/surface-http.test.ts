import { describe, it, expect } from "vitest";
import "reflect-metadata";
import { PATH_METADATA, METHOD_METADATA } from "@nestjs/common/constants.js";
import { estAuCatalogue } from "@trame/contracts";
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
