import { describe, it, expect } from "vitest";
import "reflect-metadata";
import { ForbiddenException } from "@nestjs/common";
import { estAuCatalogue } from "@rationarium/contracts";
import { CLE_PERMISSION } from "../commun/permissions.garde.js";
import { ImportsController } from "./imports.controller.js";
import { TYPES_IMPORT, type TypeImport } from "./imports.service.js";
import type { ContexteDemande } from "../commun/permissions.garde.js";

/**
 * `RG-IMP-02`, `RG-IMP-03` — **le modèle et l'aperçu suivent le type importé.**
 *
 * Le défaut que ces contrôles tiennent : `GET /imports/modele` et
 * `POST /imports/apercu` exigeaient `tasks:import` quel que soit le type
 * demandé. Le responsable RH détient `leaves:import` et `users:import` ; son
 * écriture passait, sa prévisualisation et son modèle revenaient en 403. Les
 * deux règles étaient donc **vides sur tous les chemins RH** — parcours P-96 à
 * P-99 —, et l'import en masse partait sans que personne ait pu regarder le
 * fichier.
 *
 * Le contrôle se fait ici et non en intégration parce que la faute est dans la
 * **déclaration** du point d'entrée, pas dans une donnée : c'est une table de
 * correspondance entre un paramètre de requête et une permission, et elle se
 * lit sans base.
 */

/** Une session porteuse d'un jeu de permissions donné. */
const demandeAvec = (...permissions: string[]): ContexteDemande => ({
  userId: "00000000-0000-4000-8000-000000000001",
  permissions: new Set(permissions),
  perimetre: {
    userId: "00000000-0000-4000-8000-000000000001",
    global: true,
    departements: new Set(),
    utilisateurs: new Set(),
    confidentiel: true,
  },
});

/** Une réponse Fastify réduite à ce que `modele` en emploie. */
const reponseFactice = () => {
  const envoye: string[] = [];
  const reponse = {
    header: () => reponse,
    send: (corps: string) => {
      envoye.push(corps);
      return reponse;
    },
    envoye,
  };
  return reponse;
};

/** Le service, réduit à ce que le contrôleur lui demande sur ces deux routes. */
const serviceFactice = {
  modele: (type: TypeImport) => `modele-${type}`,
  analyser: (type: TypeImport) => ({ lignes: [], total: 0, erreurs: [], type }),
};

const controleur = () => new ImportsController(serviceFactice as never);

/**
 * Le profil du responsable RH, tel que la recette le joue : il importe des
 * congés et des comptes, il n'a rien à faire des tâches d'un projet.
 */
const RH = ["leaves:import", "users:import"];

describe("RG-IMP-02 — le modèle est téléchargeable pour CHAQUE type d'import", () => {
  it("le responsable RH obtient le modèle de congés et celui d'utilisateurs", () => {
    for (const type of ["conges", "utilisateurs"] as const) {
      const reponse = reponseFactice();
      controleur().modele(type, demandeAvec(...RH), reponse as never);
      expect(reponse.envoye, type).toEqual([`modele-${type}`]);
    }
  });

  it("SANS la permission du type demandé, le modèle est refusé — pas selon `tasks:import`", () => {
    // Le détenteur de `tasks:import` seul n'a rien à faire du modèle de congés.
    const reponse = reponseFactice();
    expect(() =>
      controleur().modele("conges", demandeAvec("tasks:import"), reponse as never),
    ).toThrow(ForbiddenException);
    expect(reponse.envoye).toEqual([]);
  });

  it("chaque type a son modèle pour qui détient SA permission, et pour personne d'autre", () => {
    for (const type of TYPES_IMPORT) {
      const requise = permissionAttendue(type);
      const reponse = reponseFactice();
      controleur().modele(type, demandeAvec(requise), reponse as never);
      expect(reponse.envoye, type).toEqual([`modele-${type}`]);

      // Et le même appel, avec toutes les AUTRES permissions d'import, échoue.
      const autres = TYPES_IMPORT.map(permissionAttendue).filter((p) => p !== requise);
      expect(() =>
        controleur().modele(type, demandeAvec(...autres), reponseFactice() as never),
      ).toThrow(ForbiddenException);
    }
  });
});

describe("RG-IMP-03 — la prévisualisation précède l'écriture, sur CHAQUE chemin", () => {
  it("le responsable RH prévisualise ses congés — la règle n'est plus vide sur ce chemin", () => {
    const apercu = controleur().apercu(
      "conges",
      { contenu: "userEmail;leaveTypeName;startDate;endDate\n" },
      demandeAvec(...RH),
    );
    expect(apercu).toMatchObject({ type: "conges" });
  });

  it("le responsable RH prévisualise son fichier d'utilisateurs", () => {
    const apercu = controleur().apercu(
      "utilisateurs",
      { contenu: "email;login;password;firstName;lastName\n" },
      demandeAvec(...RH),
    );
    expect(apercu).toMatchObject({ type: "utilisateurs" });
  });

  it("un aperçu de projet reste refusé au responsable RH — l'ouverture n'est pas un blanc-seing", () => {
    expect(() =>
      controleur().apercu("projet", { contenu: "rowType\n" }, demandeAvec(...RH)),
    ).toThrow(ForbiddenException);
  });

  it("l'aperçu N'ÉCRIT RIEN, permission comprise : le refus précède la lecture du corps", () => {
    // Un corps illisible ne doit pas donner un 400 là où un 403 est dû : la
    // permission se contrôle AVANT le contenu, sinon le refus renseigne sur
    // ce que le fichier contenait.
    expect(() => controleur().apercu("conges", { contenu: 42 }, demandeAvec("tasks:import"))).toThrow(
      ForbiddenException,
    );
  });
});

/**
 * `cadrage/03 § 5.4` — **le modèle et l'aperçu d'un type exigent exactement ce
 * qu'exige son exécution.**
 *
 * Sans cette correspondance, on referme le défaut d'un côté et on le rouvre de
 * l'autre : un aperçu plus permissif que son écriture laisse lire le format
 * d'un import qu'on n'a pas le droit de faire ; plus strict, il rend
 * `RG-IMP-03` intenable pour qui a pourtant le droit d'écrire.
 */
const ROUTE_D_ECRITURE: Record<TypeImport, keyof ImportsController> = {
  utilisateurs: "importerUtilisateurs",
  competences: "importerCompetences",
  conges: "importerConges",
  projet: "importerProjet",
  taches: "importerTaches",
  jalons: "importerJalons",
};

/**
 * La permission déclarée par la route d'écriture d'un type — lue sur la
 * MÉTADONNÉE, jamais recopiée. Recopiée, elle cesserait de décrire le code au
 * premier changement de décorateur, et le contrôle passerait au vert sur une
 * table périmée.
 */
function permissionAttendue(type: TypeImport): string {
  const brut = Reflect.getMetadata(
    CLE_PERMISSION,
    ImportsController.prototype[ROUTE_D_ECRITURE[type]] as object,
  ) as string | string[] | undefined;
  const liste = brut === undefined ? [] : Array.isArray(brut) ? brut : [brut];
  if (liste.length !== 1) {
    throw new Error(`La route d'écriture de « ${type} » doit déclarer UNE permission.`);
  }
  return liste[0]!;
}

describe("RG-IMP-02, RG-IMP-03 — la table des permissions ne peut pas dériver", () => {
  it("chaque type d'import a une permission, et elle est au catalogue", () => {
    for (const type of TYPES_IMPORT) {
      const p = permissionAttendue(type);
      expect(p, type).toMatch(/^[a-z_]+:import$/);
      expect(estAuCatalogue(p), p).toBe(true);
    }
  });

  it("l'aperçu d'un type exige la MÊME permission que son exécution", () => {
    // Le contrôle est mené par la porte : pour chaque type, la permission de
    // sa route d'écriture — et elle seule — ouvre son aperçu.
    for (const type of TYPES_IMPORT) {
      expect(() =>
        controleur().apercu(type, { contenu: "x\n" }, demandeAvec(permissionAttendue(type))),
      ).not.toThrow(ForbiddenException);
    }
  });

  it("aucune permission d'import n'ouvre TOUS les types — sinon la table ne sépare rien", () => {
    // La garde de route laisse entrer au premier droit d'import détenu : sans
    // ce contrôle-ci, elle deviendrait un blanc-seing, ce qu'elle remplaçait.
    for (const type of TYPES_IMPORT) {
      const refuses = TYPES_IMPORT.filter(
        (autre) => permissionAttendue(autre) !== permissionAttendue(type),
      );
      expect(refuses.length, type).toBeGreaterThan(0);
    }
  });
});
