import { describe, it, expect } from "vitest";

/**
 * `RG-GEN-06` — **une action interdite est désactivée avec explication.**
 *
 * « Désactivée » dit deux choses, et le produit n'en tenait plus qu'une. Depuis
 * que `composants/action-protegee.tsx` a troqué l'attribut natif contre
 * `aria-disabled` — sans quoi un `<button disabled>` ne reçoit ni survol ni
 * focus, donc jamais son infobulle —, **plus aucune règle de style ne
 * s'appliquait** : `grep -rn "aria-disabled\]" --include=*.css` ne rendait
 * rien. `action-protegee.tsx` étant le composant par lequel passe TOUTE action
 * refusée pour cause de droits, un bouton refusé avait, dans tout le produit,
 * exactement l'air d'un bouton cliquable.
 *
 * Septième membre de la famille « inerte et invisible » : `axe` ne réclame
 * rien — `aria-disabled` est correctement annoncé —, le typage ne regarde pas
 * la mise en page, et aucun parcours ne juge une couleur. Seule la source peut
 * le dire, d'où ce contrôle de FORME : il ne cherche pas l'occurrence corrigée,
 * il refuse la prochaine — toute règle du socle qui traiterait `:disabled` sans
 * traiter `[aria-disabled="true"]`.
 *
 * ── Sur la lecture du fichier ──────────────────────────────────────────────
 * `import socle from "./socle.css?raw"` rend une chaîne VIDE sous Vitest : le
 * traitement CSS y est désactivé, et le greffon qui le désactive vide aussi les
 * imports bruts. Un contrôle écrit ainsi passerait au vert sans rien mesurer —
 * le piège consigné, quatrième occurrence. Le fichier se lit donc par `node:fs`,
 * que le paquet web ne déclare pas dans `types` : d'où l'import dynamique
 * annoté, et le typage explicite qui lui rend sa forme.
 */
// @ts-expect-error — `@types/node` n'est pas dans le champ `types` du paquet web.
const fs = (await import("node:fs")) as { readFileSync: (p: URL, e: string) => string };

const socle = fs.readFileSync(new URL("./socle.css", import.meta.url), "utf8");

/** Les sélecteurs du fichier, commentaires retirés — ils PARLENT du défaut. */
const selecteurs = (): string[] =>
  socle
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("}")
    .flatMap((bloc) => {
      const tete = bloc.split("{")[0] ?? "";
      return tete.includes("@") ? [] : tete.split(",").map((s) => s.trim()).filter(Boolean);
    });

describe("RG-GEN-06 — une commande désactivée se VOIT désactivée", () => {
  it("le contrôle a quelque chose à mesurer", () => {
    // Un contrôle qui ne mesure rien passe au vert : quatrième fois dans ce
    // dépôt. On affirme donc d'abord la matière.
    expect(socle.length).toBeGreaterThan(5000);
    expect(selecteurs().length).toBeGreaterThan(50);
    expect(selecteurs()).toContain(".btn-primary");
  });

  it("le socle donne une apparence à `[aria-disabled]`, pas seulement à `:disabled`", () => {
    const cibles = selecteurs().filter((s) => /\[aria-disabled/.test(s));
    expect(cibles.some((s) => s.startsWith(".btn["))).toBe(true);
    expect(cibles.some((s) => s.startsWith(".chip-btn["))).toBe(true);
  });

  it("aucune commande stylée en `:disabled` n'oublie son jumeau `aria-disabled`", () => {
    // La forme, pas l'occurrence : c'est elle qui attrapera la règle écrite
    // demain sur `.btn-danger` ou sur `.icon-btn`.
    //
    // `.field` est hors sujet et le reste : un champ de saisie inerte n'est
    // pas une COMMANDE refusée pour cause de droits, et l'attribut natif y est
    // le bon outil — il n'a pas d'infobulle de motif à déclencher.
    const tous = selecteurs();
    const orphelines = tous
      .filter((s) => s.includes(":disabled") && !s.includes(":not(") && !s.startsWith(".field"))
      .filter((s) => !tous.includes(s.replace(":disabled", '[aria-disabled="true"]')));
    expect(orphelines).toEqual([]);
  });

  it("un survol ne rattrape jamais une commande refusée", () => {
    // `.btn-primary:hover:not(:disabled)` pèse trois classes de spécificité :
    // sans l'exclusion d'`aria-disabled`, il repeint le bouton refusé en accent
    // au premier passage de souris, et la règle de désactivation, plus faible,
    // perd. Le défaut serait alors « refusé, mais seulement quand on ne le
    // regarde pas ».
    const survols = selecteurs().filter((s) => s.includes(":hover") && s.includes(":not("));
    expect(survols.length).toBeGreaterThan(0);
    expect(survols.filter((s) => !s.includes('[aria-disabled="true"])'))).toEqual([]);
  });

  it("l'atténuation ne passe pas par l'opacité — DESIGN.md § 4", () => {
    // « L'opacité ne sert jamais à atténuer du texte » : le contraste tombe
    // sous AA à chaque fois. C'est le fond qui porte la distinction.
    const sansCommentaires = socle.replace(/\/\*[\s\S]*?\*\//g, "");
    const bloc = /\.btn:disabled[^{]*\{([^}]*)\}/.exec(sansCommentaires);
    expect(bloc).not.toBeNull();
    expect(bloc?.[1] ?? "").not.toMatch(/opacity/);
  });
});
