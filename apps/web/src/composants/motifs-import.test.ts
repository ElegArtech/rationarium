import { describe, it, expect } from "vitest";
import motifsFr from "../locales/fr/imports.json";
import motifsEn from "../locales/en/imports.json";

/**
 * `RG-GEN-08`, `RG-IMP-04` — **le compte rendu d'import parle la langue de la
 * session.**
 *
 * Le serveur nomme la situation (`apps/api/src/imports/motifs.ts`), le client
 * la formule. C'était le seul endroit du produit où le serveur rédigeait des
 * phrases destinées à l'écran, et une session anglaise y lisait « Row 6 —
 * aucun compte ne porte l'adresse « … » ».
 *
 * Le raccord entre les deux moitiés est **exactement** ce qui casse quand
 * chaque moitié est juste : le serveur a ses tests de motifs, le client a son
 * catalogue vérifié par `pnpm i18n:check`, et rien ne les confronte. Pire,
 * `i18n:check` ne PEUT pas voir l'écart : `t(e.cle)` est résolu à l'exécution,
 * donc la famille `imports:motifs.` est déclarée employée en bloc — un motif
 * ajouté au serveur sans clé en face passerait au vert, et s'afficherait à
 * l'écran sous sa phrase française.
 *
 * Ce contrôle lit la SOURCE du serveur et la compare au catalogue, dans les
 * deux sens, noms **et paramètres**. Un paramètre renommé d'un côté laisse un
 * `{email}` littéral dans la phrase de l'autre : le genre de défaut qu'on ne
 * voit qu'en provoquant l'erreur qu'il décrit.
 */
// @ts-expect-error — `@types/node` n'est pas dans le champ `types` du paquet web.
const fs = (await import("node:fs")) as { readFileSync: (p: URL, e: string) => string };

const source = fs
  .readFileSync(new URL("../../../api/src/imports/motifs.ts", import.meta.url), "utf8")
  // Les commentaires s'intercalent ENTRE le nom du motif et ses paramètres —
  // `avancementIncoherent` en porte deux lignes. Les laisser en place faisait
  // manquer ce motif-là au relevé, et le contrôle se serait cru complet à 21.
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

/**
 * Les motifs du serveur, avec les paramètres qu'ils nomment.
 *
 * Ils se lisent sur l'appel `motif("nom", { … }, "…")`, seul endroit où les
 * deux se trouvent ensemble. `NOMS_MOTIFS` ne donnerait que les noms.
 */
const motifsServeur = (): Map<string, string[]> => {
  const trouves = new Map<string, string[]>();
  for (const m of source.matchAll(/\bmotif\(\s*"(\w+)"\s*,\s*\{([^}]*)\}/g)) {
    const params = (m[2] ?? "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean)
      // `{ colonne: "progress", statut: "done", attendu }` — le nom est à gauche
      // du deux-points quand il y en a un, et la valeur ne nous regarde pas.
      .map((x) => (x.split(":")[0] ?? "").trim())
      .filter(Boolean);
    trouves.set(m[1]!, params);
  }
  return trouves;
};

/** Les arguments nommés d'un patron ICU : `{email}`, `{n, plural, …}`. */
const arguments_ = (patron: string): Set<string> =>
  new Set([...patron.matchAll(/\{\s*(\w+)\s*[,}]/g)].map((m) => m[1]!));

const catalogue = (langue: "fr" | "en"): Record<string, string> =>
  (langue === "fr" ? motifsFr : motifsEn).motifs as Record<string, string>;

describe("RG-GEN-08 — les motifs d'import se traduisent", () => {
  const serveur = motifsServeur();

  it("le contrôle a quelque chose à mesurer", () => {
    // Un contrôle qui ne mesure rien passe au vert. On affirme la matière
    // avant de la juger — la source du serveur, et les deux catalogues.
    expect(source.length).toBeGreaterThan(2000);
    expect(serveur.size).toBe(22);
    expect(serveur.get("emailDejaPris")).toEqual(["email"]);
    expect(serveur.get("chevauchement")).toEqual([]);
  });

  it("chaque motif du serveur a sa clé dans les deux catalogues", () => {
    for (const langue of ["fr", "en"] as const) {
      const manquantes = [...serveur.keys()].filter((nom) => !(nom in catalogue(langue)));
      expect({ langue, manquantes }).toEqual({ langue, manquantes: [] });
    }
  });

  it("aucune clé de motif ne survit au motif qu'elle traduisait", () => {
    // Le sens inverse : `i18n:check` déclare la famille employée en bloc, donc
    // une clé dont le motif serveur a disparu resterait orpheline sans témoin.
    for (const langue of ["fr", "en"] as const) {
      const orphelines = Object.keys(catalogue(langue)).filter((nom) => !serveur.has(nom));
      expect({ langue, orphelines }).toEqual({ langue, orphelines: [] });
    }
  });

  it("chaque paramètre nommé par le serveur est interpolé dans les deux langues", () => {
    // C'est ici que se loge le défaut le plus discret : un paramètre que la
    // traduction n'emploie pas fait disparaître l'information — « un compte
    // porte déjà cette adresse » sans dire laquelle.
    const manques: string[] = [];
    for (const langue of ["fr", "en"] as const) {
      for (const [nom, params] of serveur) {
        const patron = catalogue(langue)[nom];
        if (patron === undefined) continue;
        const employes = arguments_(patron);
        for (const p of params) if (!employes.has(p)) manques.push(`${langue}/${nom} — {${p}}`);
      }
    }
    expect(manques).toEqual([]);
  });

  it("aucune traduction n'interpole un paramètre que le serveur n'envoie pas", () => {
    // Un `{motif}` sans valeur reste écrit tel quel à l'écran par ICU : la
    // phrase se rend, avec une accolade dedans, et rien ne le signale.
    const inventes: string[] = [];
    for (const langue of ["fr", "en"] as const) {
      for (const [nom, patron] of Object.entries(catalogue(langue))) {
        const params = serveur.get(nom) ?? [];
        for (const a of arguments_(patron)) {
          if (!params.includes(a)) inventes.push(`${langue}/${nom} — {${a}}`);
        }
      }
    }
    expect(inventes).toEqual([]);
  });
});
