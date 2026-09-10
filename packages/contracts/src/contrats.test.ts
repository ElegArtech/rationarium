import { describe, it, expect } from "vitest";
import {
  VOCABULAIRES,
  PRIORITES,
  STATUTS_PROJET,
  STATUTS_CONGE,
  avancementImposePar,
  progressionJalon,
} from "./vocabulaires.js";
import {
  PERMISSIONS,
  DOMAINES,
  NOMBRE_PERMISSIONS,
  estAuCatalogue,
  PERMISSIONS_GESTION_GLOBALE,
} from "./permissions.js";
import { MODELES_ROLES, NOMBRE_MODELES, modeleParCode } from "./roles.js";
import {
  IDS_VISUELS_AVATAR_PREDEFINIS,
  VISUELS_AVATAR_PREDEFINIS,
  estVisuelAvatarPredefini,
} from "./avatars.js";
import { modificationProfilSchema } from "./schemas.js";

describe("avatars prédéfinis — RG-AUTH-09", () => {
  it("RG-AUTH-09 — porte un petit catalogue stable, distinct et traduisible", () => {
    expect(IDS_VISUELS_AVATAR_PREDEFINIS).toHaveLength(6);
    expect(new Set(IDS_VISUELS_AVATAR_PREDEFINIS).size).toBe(6);
    for (const visuel of VISUELS_AVATAR_PREDEFINIS) {
      expect(visuel.cleLibelle).toBe(`profil.visuelsAvatar.${visuel.id}`);
      expect(estVisuelAvatarPredefini(visuel.id)).toBe(true);
    }
  });

  it("RG-AUTH-09 — le contrat refuse un identifiant de visuel hors catalogue", () => {
    expect(() =>
      modificationProfilSchema.parse({ avatarPredefini: "a-07", version: 1 }),
    ).toThrow("Choisissez un visuel proposé dans le catalogue, puis enregistrez.");
  });

  it("RG-AUTH-09 — le contrat accepte un visuel catalogué ou aucun visuel", () => {
    expect(modificationProfilSchema.parse({ avatarPredefini: "feuille", version: 1 }))
      .toMatchObject({ avatarPredefini: "feuille" });
    expect(modificationProfilSchema.parse({ avatarPredefini: null, version: 1 }))
      .toMatchObject({ avatarPredefini: null });
  });
});

describe("vocabulaires — cadrage/01 § 4.1", () => {
  it("§ 4.1 — priorité : quatre niveaux, conformes à l'arbitrage B1", () => {
    expect(PRIORITES.map((p) => p.code)).toEqual(["low", "normal", "high", "critical"]);
  });

  it("§ 4.1 — statut de projet : cinq valeurs, au libellé des maquettes", () => {
    expect(STATUTS_PROJET.map((s) => s.code)).toEqual([
      "draft",
      "active",
      "paused",
      "done",
      "cancelled",
    ]);
    expect(STATUTS_PROJET.find((s) => s.code === "paused")?.fr).toBe("Suspendu");
  });

  it("RG-CNG-01 — le statut de congé porte l'état transitoire d'annulation demandée", () => {
    expect(STATUTS_CONGE.map((s) => s.code)).toContain("cancellation_requested");
  });

  it("parti pris n° 5 — aucun doublon de code dans un vocabulaire", () => {
    for (const [nom, termes] of Object.entries(VOCABULAIRES)) {
      const codes = termes.map((t) => t.code);
      expect(new Set(codes).size, `doublon de code dans « ${nom} »`).toBe(codes.length);
    }
  });

  it("parti pris n° 5 — aucun doublon de libellé dans un vocabulaire", () => {
    for (const [nom, termes] of Object.entries(VOCABULAIRES)) {
      for (const langue of ["fr", "en"] as const) {
        const libelles = termes.map((t) => t[langue]);
        expect(new Set(libelles).size, `doublon de libellé ${langue} dans « ${nom} »`).toBe(
          libelles.length,
        );
      }
    }
  });

  it("RG-GEN-08 — chaque terme porte ses libellés français et anglais", () => {
    for (const [nom, termes] of Object.entries(VOCABULAIRES)) {
      for (const t of termes) {
        expect(t.fr.length, `libellé fr manquant dans « ${nom} »`).toBeGreaterThan(0);
        expect(t.en.length, `libellé en manquant dans « ${nom} »`).toBeGreaterThan(0);
      }
    }
  });
});

describe("catalogue de permissions — cadrage/01 § 3.2", () => {
  it("couvre les 24 domaines du cadrage", () => {
    expect(DOMAINES).toHaveLength(24);
    for (const d of DOMAINES) {
      expect(
        PERMISSIONS.some((p) => p.startsWith(`${d}:`)),
        `aucune permission pour le domaine « ${d} »`,
      ).toBe(true);
    }
  });

  it("respecte la nomenclature domaine:action, sans exception", () => {
    for (const p of PERMISSIONS) {
      expect(p, `nomenclature invalide : ${p}`).toMatch(/^[a-z_]+:[a-z_A-Z]+$/);
      const [domaine] = p.split(":");
      expect(DOMAINES, `domaine inconnu : ${domaine}`).toContain(domaine);
    }
  });

  it("ne contient aucun doublon", () => {
    expect(new Set(PERMISSIONS).size).toBe(PERMISSIONS.length);
  });

  it("le nombre de permissions ne dérive pas en silence", () => {
    // Le cadrage annonçait « ≈ 125 ». L'énumération dérivée en donne davantage :
    // voir la décision consignée en tête de permissions.ts. Ce test n'impose pas
    // une valeur juste, il impose qu'un changement de volume soit VU.
    expect(NOMBRE_PERMISSIONS).toBe(152);
  });

  it("RG-SCOPE-03 — les permissions de gestion globale appartiennent au catalogue", () => {
    for (const p of PERMISSIONS_GESTION_GLOBALE) {
      expect(estAuCatalogue(p), `hors catalogue : ${p}`).toBe(true);
    }
  });

  it("RG-DROITS-03 — une permission inventée n'est pas au catalogue", () => {
    expect(estAuCatalogue("projects:do_whatever")).toBe(false);
    expect(estAuCatalogue("inexistant:read")).toBe(false);
  });
});

describe("modèles de rôles — cadrage/01 § 3.2", () => {
  it("les 26 modèles annoncés existent", () => {
    expect(NOMBRE_MODELES).toBe(26);
  });

  it("couvre les neuf familles, avec les effectifs du cadrage", () => {
    const attendu: Record<string, number> = {
      Administration: 2,
      Management: 4,
      "Conduite de projet": 3,
      Contribution: 3,
      RH: 2,
      Transverse: 4,
      Informatique: 2,
      Observation: 3,
      Restreints: 3,
    };
    const constate: Record<string, number> = {};
    for (const m of MODELES_ROLES) constate[m.famille] = (constate[m.famille] ?? 0) + 1;
    expect(constate).toEqual(attendu);
  });

  it("les codes attendus par le cadrage sont tous présents", () => {
    const attendus = [
      "ADMIN", "ADMIN_DELEGATED",
      "PORTFOLIO_MANAGER", "MANAGER", "MANAGER_PROJECT_FOCUS", "MANAGER_HR_FOCUS",
      "PROJECT_LEAD", "PROJECT_LEAD_JUNIOR", "TECHNICAL_LEAD",
      "PROJECT_CONTRIBUTOR", "PROJECT_CONTRIBUTOR_LIGHT", "FUNCTIONAL_REFERENT",
      "HR_OFFICER", "HR_OFFICER_LIGHT",
      "THIRD_PARTY_MANAGER", "CONTROLLER", "BUDGET_ANALYST", "DATA_ANALYST",
      "IT_SUPPORT", "IT_INFRASTRUCTURE",
      "OBSERVER_FULL", "OBSERVER_PROJECTS_ONLY", "OBSERVER_HR_ONLY",
      "BASIC_USER", "EXTERNAL_PRESTATAIRE", "STAGIAIRE_ALTERNANT",
    ];
    for (const code of attendus) {
      expect(modeleParCode(code), `modèle manquant : ${code}`).toBeDefined();
    }
  });

  it("RG-DROITS-03 — aucun modèle ne référence une permission hors catalogue", () => {
    for (const m of MODELES_ROLES) {
      for (const p of m.permissions) {
        expect(estAuCatalogue(p), `${m.code} référence une permission hors catalogue : ${p}`).toBe(
          true,
        );
      }
    }
  });

  it("aucun modèle ne contient de permission en double", () => {
    for (const m of MODELES_ROLES) {
      expect(new Set(m.permissions).size, `doublon dans ${m.code}`).toBe(m.permissions.length);
    }
  });

  it("RG-DROITS-02 — les rôles système sont marqués comme tels", () => {
    const systeme = MODELES_ROLES.filter((m) => m.systeme).map((m) => m.code);
    expect(systeme).toEqual([
      "ADMIN",
      "ADMIN_DELEGATED",
      "PORTFOLIO_MANAGER",
      "MANAGER",
      "PROJECT_LEAD",
      "PROJECT_CONTRIBUTOR",
      "HR_OFFICER",
      "BASIC_USER",
    ]);
  });

  it("RM-03 EX-TLT-04/06, RG-TLT-07 — Camille gère ses règles sans gérer autrui", () => {
    const p = modeleParCode("PROJECT_CONTRIBUTOR")!.permissions;
    expect(p).toContain("telework:manage_rules");
    expect(p).toContain("telework:generate");
    expect(p).not.toContain("telework:manage_any");
  });

  it("RM-03 EX-CMP — le RH complet administre les compétences, le RH léger consulte", () => {
    const complet = modeleParCode("HR_OFFICER")!.permissions;
    const leger = modeleParCode("HR_OFFICER_LIGHT")!.permissions;
    for (const permission of ["skills:create", "skills:update", "skills:delete", "skills:manage_matrix", "skills:import", "skills:export"]) {
      expect(complet).toContain(permission);
      expect(leger).not.toContain(permission);
    }
    expect(complet).not.toContain("users:manage_roles");
    expect(complet).not.toContain("holidays:create");
    expect(complet).not.toContain("holidays:import");
  });

  it("ADMIN détient l'intégralité du catalogue", () => {
    expect(modeleParCode("ADMIN")?.permissions).toHaveLength(NOMBRE_PERMISSIONS);
  });

  it("ADMIN_DELEGATED ne peut ni gouverner les droits ni lire le journal d'audit", () => {
    const p = modeleParCode("ADMIN_DELEGATED")!.permissions;
    expect(p).not.toContain("users:manage_roles");
    expect(p).not.toContain("users:manage_permissions");
    expect(p).not.toContain("users:delete_permanently");
    expect(p.some((x) => x.startsWith("audit:"))).toBe(false);
  });

  it("les observateurs n'écrivent jamais", () => {
    const ecriture = /:(create|update|delete|manage_|approve|assign|import|generate|archive|reset|deactivate)/;
    for (const code of ["OBSERVER_FULL", "OBSERVER_PROJECTS_ONLY", "OBSERVER_HR_ONLY"]) {
      const p = modeleParCode(code)!.permissions;
      expect(p.filter((x) => ecriture.test(x)), `${code} détient une permission d'écriture`).toEqual(
        [],
      );
    }
  });

  it("IT_SUPPORT ne gouverne pas les rôles — la limite entre support et administration", () => {
    const p = modeleParCode("IT_SUPPORT")!.permissions;
    expect(p).toContain("users:reset_password");
    expect(p).not.toContain("users:manage_roles");
    expect(p).not.toContain("users:manage_permissions");
  });

  it("EXTERNAL_PRESTATAIRE n'accède ni aux congés, ni au télétravail, ni à l'annuaire", () => {
    const p = modeleParCode("EXTERNAL_PRESTATAIRE")!.permissions;
    expect(p.some((x) => x.startsWith("leaves:"))).toBe(false);
    expect(p.some((x) => x.startsWith("telework:"))).toBe(false);
    expect(p.some((x) => x.startsWith("users:"))).toBe(false);
  });

  it("CONTROLLER lit le journal d'audit et n'agit sur les données de personne", () => {
    const p = modeleParCode("CONTROLLER")!.permissions;
    expect(p).toContain("audit:read");

    // Un contrôleur reste un agent : il pose ses propres congés, déclare son
    // temps. Ce qu'il ne doit jamais avoir, c'est le pouvoir d'agir sur les
    // données d'autrui — c'est ce qui rend son observation crédible.
    const surAutrui = p.filter((x) =>
      /:(manage_any|approve|self_approve|declare_for_other|manage_roles|manage_permissions|deactivate|delete_permanently|reset_password|manage_balances|manage_types)$/.test(
        x,
      ),
    );
    expect(surAutrui).toEqual([]);
  });

  it("tout modèle non système reste composable — RG-DROITS-01", () => {
    // Un modèle est un point de départ : aucun ne doit être vide ni figé.
    for (const m of MODELES_ROLES) {
      expect(m.permissions.length, `${m.code} est vide`).toBeGreaterThan(0);
    }
  });

  it("RG-TSK-02 — un modèle dont la DESCRIPTION suppose une création en porte le droit", () => {
    /*
     * `STAGIAIRE_ALTERNANT` disait « Pas de création de tâche hors projet »,
     * ce qui affirme en creux qu'il en crée DANS un projet. Or `SOCLE` porte
     * `tasks:create_standalone` et non `tasks:create` : retirer le premier ne
     * lui laissait AUCUN droit de création. Le stagiaire ne pouvait rien
     * créer, nulle part.
     *
     * Le trou est resté invisible tant que la route de création n'exigeait que
     * `tasks:create` quel que soit le corps. `RG-TSK-02` a rendu les deux
     * droits distincts, et c'est en la portant qu'on l'a vu.
     *
     * L'assertion porte sur la description parce que c'est elle qui décrit
     * l'intention : un modèle qui parle d'une restriction de création promet
     * une création.
     */
    for (const m of MODELES_ROLES) {
      const parleDeCreation = /création de tâche/i.test(m.description);
      if (!parleDeCreation) continue;
      const peutCreer =
        m.permissions.includes("tasks:create") ||
        m.permissions.includes("tasks:create_standalone");
      expect(peutCreer, `${m.code} restreint une création qu'il ne peut pas faire`).toBe(true);
    }
  });

  it("RG-TSK-02 — les deux droits de création sont DISTINCTS au catalogue", () => {
    // Si un modèle les portait toujours ensemble, la distinction ne servirait
    // à rien et le contrôle de la route serait un ornement.
    const seulementDansProjet = MODELES_ROLES.filter(
      (m) => m.permissions.includes("tasks:create") && !m.permissions.includes("tasks:create_standalone"),
    );
    const seulementHorsProjet = MODELES_ROLES.filter(
      (m) => m.permissions.includes("tasks:create_standalone") && !m.permissions.includes("tasks:create"),
    );
    expect(seulementDansProjet.length, "aucun rôle ne crée SEULEMENT dans un projet").toBeGreaterThan(0);
    expect(seulementHorsProjet.length, "aucun rôle ne crée SEULEMENT hors projet").toBeGreaterThan(0);
  });
});

describe("l'achèvement, dit une seule fois — RG-TSK-17, RG-JAL-06", () => {
  it("RG-TSK-17 — « Terminé » impose cent, et lui seul", () => {
    expect(avancementImposePar("done")).toBe(100);
    // À sens unique : « En revue » n'imposerait rien, sinon une tâche achevée
    // ne pourrait jamais attendre son contrôle.
    for (const autre of ["todo", "doing", "review", "blocked"] as const) {
      expect(avancementImposePar(autre), autre).toBeNull();
    }
  });

  it("RG-JAL-06 — un jalon SANS TÂCHE marqué atteint est à 100 %, pas à zéro", () => {
    /*
     * Le cas que `RG-JAL-06` ouvre à la marque manuelle : un jalon de comité,
     * de livraison contractuelle, de décision. La moyenne d'un ensemble vide
     * ne vaut pas zéro pour cent, elle ne vaut rien — et la vue affichait
     * « Terminé · 0 % », la pastille disant l'inverse de la barre.
     */
    expect(progressionJalon("done", [])).toBe(100);
    expect(progressionJalon("pending", [])).toBe(0);
  });

  it("RG-JAL-01 — avec des tâches, c'est la MOYENNE de leur avancement", () => {
    expect(progressionJalon("doing", [0, 50, 100])).toBe(50);
    expect(progressionJalon("pending", [0, 0])).toBe(0);
    // Arrondi, pas troncature : deux tiers font 67, jamais 66.
    expect(progressionJalon("doing", [100, 100, 0])).toBe(67);
  });
});
