import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import {
  tacheSchema,
  projetSchema,
  jalonSchema,
  epopeeSchema,
  evenementSchema,
  utilisateurSchema,
} from "@rationarium/contracts";

/**
 * **Un schéma de route qui ment sur le contrat.**
 *
 * `tacheSchema` déclarait `avancement` et le schéma en ligne de
 * `POST /taches` ne l'avait pas. Zod retire les clés inconnues **en silence** :
 * la requête rendait `201`, le champ disparaissait avant d'atteindre le
 * service, et un projet chargé avec son historique affichait zéro pour cent de
 * progression — `RG-PRJ-07` moyennant un champ que rien n'écrivait.
 *
 * Ce n'était pas la première fois. Le commentaire de `taches.controller.ts`
 * documente le même incident sur les horaires : « Ils manquaient au schéma :
 * Zod les retirait en silence et le créneau d'une réunion était
 * insaisissable. » Deux fois la même classe, au même endroit, et rien qui la
 * voie.
 *
 * **Ce que ce contrôle refuse.** Un écart entre les clés d'un schéma de route
 * d'écriture et celles du schéma correspondant de `@rationarium/contracts`,
 * qui ne soit pas écrit ici avec sa raison. Un écart peut exister — une
 * création n'est pas une modification, et `version` n'a rien à faire dans un
 * contrat d'entité. Il ne peut pas exister en silence.
 */

const RACINE = path.resolve(import.meta.dirname, "..");

/** Les clés de premier niveau d'un `z.object({ … })`, commentaires retirés. */
function clesDe(source: string, depart: number): string[] {
  const nu = source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ");
  const decalage = source.length - nu.length;
  void decalage;
  return extraire(nu, nu.indexOf("z.object(", 0) >= 0 ? nu.indexOf("z.object(") : depart);
}

function extraire(source: string, depart: number): string[] {
  let i = source.indexOf("{", depart);
  if (i < 0) return [];
  let profondeur = 0;
  const cles: string[] = [];
  for (; i < source.length; i++) {
    const c = source[i];
    if (c === "{" || c === "(" || c === "[") profondeur += 1;
    else if (c === "}" || c === ")" || c === "]") {
      profondeur -= 1;
      if (profondeur === 0) break;
    } else if (profondeur === 1) {
      const m = /^([A-Za-z_$][\w$]*)\s*:/.exec(source.slice(i));
      if (m && /[\s{,]/.test(source[i - 1] ?? "")) cles.push(m[1]!);
    }
  }
  return [...new Set(cles)];
}

/** Les clés d'un schéma Zod, à travers ses `refine` et ses enveloppes. */
function clesContrat(schema: unknown): string[] {
  let n = schema as { shape?: Record<string, unknown>; _def?: Record<string, unknown> };
  for (let i = 0; i < 12 && n && !("shape" in n); i++) {
    const d = n._def as Record<string, unknown> | undefined;
    n = (d?.["innerType"] ?? d?.["schema"] ?? d?.["in"] ?? null) as typeof n;
  }
  if (!n || !n.shape) throw new Error("schéma de contrat dont les clés sont illisibles");
  return Object.keys(n.shape).sort();
}

/** Le relevé des schémas en ligne, par route. */
function schemasEnLigne(): Map<string, string[]> {
  const par = new Map<string, string[]>();
  const fichiers: string[] = [];
  for (const d of readdirSync(RACINE, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    for (const f of readdirSync(path.join(RACINE, d.name))) {
      if (f.endsWith(".controller.ts")) fichiers.push(path.join(RACINE, d.name, f));
    }
  }
  for (const f of fichiers.sort()) {
    const s = readFileSync(f, "utf8");
    const module = path.basename(f).replace(".controller.ts", "");
    const re = /@(Post|Patch|Put)\((?:"([^"]*)")?\)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(s))) {
      const suite = s.slice(m.index, m.index + 3000);
      if (!suite.includes("z.object(")) continue;
      par.set(`${m[1]!.toUpperCase()} ${module}:${m[2] ?? ""}`, clesDe(suite, 0).sort());
    }
  }
  return par;
}

/**
 * Les appariements route ↔ contrat, et les écarts admis.
 *
 * `absentesDeLaRoute` : la clé est au contrat, pas à la route. C'est la forme
 * qui a mordu — celle qui se perd en silence. Chacune porte sa raison.
 *
 * `absentesDuContrat` : la clé est à la route, pas au contrat. Moins
 * dangereuse (rien ne se perd), mais elle dit qu'un des deux textes n'est pas
 * à jour.
 */
const APPARIEMENTS: {
  route: string;
  contrat: unknown;
  nom: string;
  absentesDeLaRoute: Record<string, string>;
  absentesDuContrat: Record<string, string>;
}[] = [
  {
    route: "POST taches:",
    contrat: tacheSchema,
    nom: "tacheSchema",
    absentesDeLaRoute: {},
    absentesDuContrat: {},
  },
  {
    route: "PATCH taches::id",
    contrat: tacheSchema,
    nom: "tacheSchema",
    absentesDeLaRoute: {
      assigneIds:
        "`EX-TSK-05` — les assignés ont leur propre point d'entrée, `PUT :id/assignes`, avec confrontation de version : la liste se pose ENTIÈRE, jamais par différence. Ce n'est pas un oubli du `PATCH`.",
      serviceIds:
        "Même raison que les assignés : le geste vit sur `PUT :id/assignes`.",
      interventionExterieure:
        "`EX-TSK-14` — la marque « EXT » se pose à la création avec le tiers qu'elle désigne ; la retirer après coup laisserait la tâche assignée à un intervenant sans en porter le signe.",
    },
    absentesDuContrat: {
      version:
        "`RG-GEN-07` — la version lue accompagne toute écriture. Elle appartient au protocole d'écriture, pas à l'entité : un contrat qui la porterait obligerait chaque lecture à l'inventer.",
    },
  },
  {
    route: "POST projets:",
    contrat: projetSchema,
    nom: "projetSchema",
    absentesDeLaRoute: {},
    absentesDuContrat: {},
  },
  {
    route: "PATCH projets::id",
    contrat: projetSchema,
    nom: "projetSchema",
    absentesDeLaRoute: {},
    absentesDuContrat: {
      version: "`RG-GEN-07`, même raison que sur la tâche.",
    },
  },
  {
    route: "POST projets::id/jalons",
    contrat: jalonSchema,
    nom: "jalonSchema",
    absentesDeLaRoute: {
      projectId:
        "`RG-JAL-02` — un jalon appartient à UN projet, et c'est l'adresse qui le dit (`/projets/:id/jalons`). L'accepter aussi dans le corps ouvrirait deux sources pour un même fait.",
    },
    absentesDuContrat: {},
  },
  {
    route: "PATCH projets:jalons/:id",
    contrat: jalonSchema,
    nom: "jalonSchema",
    absentesDeLaRoute: {
      projectId:
        "`RG-JAL-02` — modifier un jalon ne change JAMAIS son projet.",
    },
    absentesDuContrat: {
      version: "`RG-GEN-07`, même raison que sur la tâche.",
    },
  },
  {
    route: "POST evenements:",
    contrat: evenementSchema,
    nom: "evenementSchema",
    absentesDeLaRoute: {
      recurrenceFrequence:
        "Écart de FORME, pas de fond : la route groupe la récurrence dans un sous-objet `recurrence: { frequenceSemaines, jourSemaine, jusqua }`, là où le contrat aplatit les trois champs sur l'entité. Les trois arrivent bien en base — c'est une récurrence entière ou pas de récurrence, et un sous-objet le dit mieux que trois champs indépendants qu'on pourrait remplir à moitié.",
      recurrenceJourSemaine: "Même sous-objet `recurrence` que la fréquence : voir ci-dessus.",
      recurrenceFin:
        "Même sous-objet `recurrence`, sous le nom `jusqua`. Le contrat porte la borne telle qu'elle est stockée, la route telle qu'on la formule.",
    },
    absentesDuContrat: {
      recurrence:
        "Le sous-objet lui-même, contrepartie des trois champs aplatis du contrat. C'est le pendant exact de la déclaration ci-dessus.",
    },
  },
  {
    route: "POST utilisateurs:",
    contrat: utilisateurSchema,
    nom: "utilisateurSchema",
    absentesDeLaRoute: {
      actif:
        "`RG-AUTH-05` — un compte naît actif. Le créer désactivé n'a pas de sens : la désactivation est un geste de cycle de vie, servi par `PATCH :id`, et l'ouvrir à la création donnerait deux façons de produire un compte que personne ne peut employer.",
    },
    absentesDuContrat: {},
  },
  {
    route: "POST projets::id/epopees",
    contrat: epopeeSchema,
    nom: "epopeeSchema",
    absentesDeLaRoute: {
      projectId: "Comme le jalon : le projet est dans l'adresse, pas dans le corps.",
    },
    absentesDuContrat: {},
  },
  {
    route: "PATCH projets:epopees/:id",
    contrat: epopeeSchema,
    nom: "epopeeSchema",
    absentesDeLaRoute: {
      projectId: "Modifier une épopée ne change pas son projet.",
    },
    absentesDuContrat: {
      version: "`RG-GEN-07`, même raison que sur la tâche.",
    },
  },
];

describe("les schémas d'écriture ne mentent pas sur le contrat", () => {
  const enLigne = schemasEnLigne();

  it("l'inventaire est réel : les routes appariées existent toutes", () => {
    /*
     * Sans cette garde, un renommage de route ferait passer le contrôle en ne
     * comparant plus rien. Le dépôt a payé quatre fois un contrôle qui
     * réussissait sur un corpus vide.
     */
    expect(enLigne.size).toBeGreaterThan(60);
    expect(APPARIEMENTS.length).toBeGreaterThanOrEqual(8);
    for (const a of APPARIEMENTS) {
      expect(enLigne.has(a.route), `route appariée introuvable : ${a.route}`).toBe(true);
    }
  });

  for (const a of APPARIEMENTS) {
    it(`${a.route} — tout écart avec ${a.nom} est écrit`, () => {
      const route = enLigne.get(a.route) ?? [];
      const contrat = clesContrat(a.contrat);

      const manquantes = contrat.filter((c) => !route.includes(c));
      const surnumeraires = route.filter((c) => !contrat.includes(c));

      const nonDeclareesCote = manquantes.filter((c) => !(c in a.absentesDeLaRoute));
      const nonDeclareesContrat = surnumeraires.filter((c) => !(c in a.absentesDuContrat));

      expect(
        nonDeclareesCote,
        `au contrat et PAS à la route — la forme qui se perd en silence : ${nonDeclareesCote.join(", ")}`,
      ).toEqual([]);
      expect(
        nonDeclareesContrat,
        `à la route et PAS au contrat : ${nonDeclareesContrat.join(", ")}`,
      ).toEqual([]);
    });
  }

  it("aucun écart déclaré n'est périmé", () => {
    /*
     * Le pendant du contrôle : une raison qui décrit un écart comblé devient
     * une affirmation fausse que rien ne relit. Le dépôt en a déjà payé trois.
     */
    const perimes: string[] = [];
    for (const a of APPARIEMENTS) {
      const route = enLigne.get(a.route) ?? [];
      const contrat = clesContrat(a.contrat);
      for (const c of Object.keys(a.absentesDeLaRoute)) {
        if (route.includes(c)) perimes.push(`${a.route} : « ${c} » est désormais à la route`);
      }
      for (const c of Object.keys(a.absentesDuContrat)) {
        if (contrat.includes(c)) perimes.push(`${a.route} : « ${c} » est désormais au contrat`);
      }
    }
    expect(perimes, perimes.join(" · ")).toEqual([]);
  });

  it("chaque écart admis porte une raison écrite, pas un mot", () => {
    for (const a of APPARIEMENTS) {
      for (const [cle, raison] of [
        ...Object.entries(a.absentesDeLaRoute),
        ...Object.entries(a.absentesDuContrat),
      ]) {
        expect(raison.trim().length, `${a.route} / ${cle} : raison trop courte`).toBeGreaterThan(40);
      }
    }
  });
});
