import { describe, it, expect } from "vitest";

/**
 * `RG-ADM-03` — **l'accès refusé est lui-même tracé.**
 *
 * Le défaut constaté (P-91, exploration Karim) : la vue 33 portait
 * `enabled: peut("audit:read")` sur ses requêtes et rendait `<AccesRefuse />`
 * **avant tout appel**. Aucune requête n'atteignait le serveur, donc
 * `permissions.garde.ts` — le seul endroit du produit qui trace un refus —
 * n'avait rien à refuser et rien à tracer. Le côté serveur était juste et
 * prouvé ; le client le rendait inatteignable.
 *
 * Le commentaire qui tenait cette ligne disait « `RG-ADM-03` — l'accès refusé
 * est tracé côté serveur », douze caractères au-dessus de ce qui garantissait
 * le contraire. Famille déjà consignée dans `CLAUDE.md` : *écrire le motif
 * d'un contrôle n'est pas l'écrire.*
 *
 * **Ce contrôle lit la source, pas le rendu.** Rien d'autre ne pouvait le
 * voir : la vue s'affiche, le refus est correct à l'écran, `axe` ne réclame
 * rien, et l'absence d'une ligne dans un journal ne fait échouer aucune
 * assertion. Il attrape la prochaine occurrence, pas celle-ci.
 *
 * **Portée : les six répertoires de vues qui prononcent un refus.**
 * `vues/planning/` a été ajouté après coup : la forme y vivait encore deux
 * fois (`Planning.tsx`, `Activite.tsx`) alors que neuf autres vues étaient
 * corrigées, et **rien ne tenait la correction** tant que ce contrôle ne les
 * regardait pas. Un correctif de forme dont le contrôle ne couvre pas toutes
 * les occurrences revient par celle qu'il ne voit pas.
 */

/* Même idiome que `coquille/liens.test.ts` : `import.meta.glob` et non
   `node:fs`, le paquet web ne déclarant pas les types de Node. */
const brut = import.meta.glob(
  "../{administration,referentiels,rapports,tableau,projets,planning}/**/*.tsx",
  { query: "?raw", import: "default", eager: true },
) as Record<string, string>;

/** La source, commentaires retirés — ils PARLENT du défaut, ils ne le sont pas. */
const sansCommentaires = (texte: string): string =>
  texte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const sources = Object.entries(brut)
  .filter(([chemin]) => !/\.test\.tsx?$/.test(chemin))
  .map(([chemin, texte]) => ({ chemin, texte: sansCommentaires(texte) }));

const refusants = sources.filter(({ texte }) => texte.includes("<AccesRefuse"));

describe("RG-ADM-03 — un refus de lecture part au serveur, qui le trace", () => {
  it("le contrôle a quelque chose à mesurer", () => {
    // Un contrôle qui n'a rien à mesurer doit échouer, jamais réussir en
    // silence : le dépôt a payé quatre fois cette leçon.
    expect(sources.length).toBeGreaterThanOrEqual(18);
    expect(refusants.length).toBeGreaterThanOrEqual(9);
    expect(refusants.some((f) => f.chemin.endsWith("Audit.tsx"))).toBe(true);
    expect(refusants.some((f) => f.chemin.endsWith("TableauDeBord.tsx"))).toBe(true);
    // Les deux vues du planning : elles sont la raison de l'élargissement, et
    // un glob qui cesserait de les atteindre rendrait ce contrôle muet.
    expect(refusants.some((f) => f.chemin.endsWith("planning/Planning.tsx"))).toBe(true);
    expect(refusants.some((f) => f.chemin.endsWith("planning/Activite.tsx"))).toBe(true);
  });

  it("aucune LECTURE DE VUE n'est éteinte par la permission du client", () => {
    /*
     * L'autre moitié du même défaut, et la plus discrète : retirer le
     * `return <AccesRefuse />` ne sert à rien si la requête ne part toujours
     * pas. `enabled: peut(…)` sur la lecture QUI GARDE LA VUE empêche
     * exactement l'appel dont `RG-ADM-03` veut la trace — et la vue resterait
     * alors en chargement perpétuel plutôt qu'en refus, ce qui est pire.
     *
     * Le motif ne vise QUE la permission par laquelle la vue se garde, celle
     * qui figure dans son `@RequirePermission` de lecture. Une requête
     * secondaire éteinte par une AUTRE permission — un panneau de la vue, pas
     * la vue — reste licite et n'est pas regardée ici : c'est une courtoisie
     * de `RG-GEN-06`, et le serveur ne doit pas la refuser puisqu'on ne la lui
     * demande pas.
     */
    const gardiennes: Record<string, string> = {
      "planning/Planning.tsx": "planning:read",
      "planning/Activite.tsx": "predefined_tasks:read",
      // Ce fichier-ci vit dans `administration/`, que Vite normalise en `./` :
      // le suffixe se réduit donc au nom.
      "/Audit.tsx": "audit:read",
    };
    const fautes = Object.entries(gardiennes).flatMap(([suffixe, permission]) => {
      const fichier = sources.find((f) => f.chemin.endsWith(suffixe));
      if (!fichier) return [`${suffixe} — source introuvable, le contrôle ne mesure rien`];
      const motif = new RegExp(`enabled:\\s*peut\\(\\s*"${permission}"\\s*\\)`);
      return motif.test(fichier.texte)
        ? [`${suffixe} — lecture éteinte par peut("${permission}") : le serveur n'apprend rien`]
        : [];
    });
    expect(fautes).toEqual([]);
  });

  it("AUCUNE VUE NE PRONONCE LE REFUS SUR LA SEULE PERMISSION LUE AU CLIENT", () => {
    // C'est le défaut, mot pour mot : `if (!peut(…)) return <AccesRefuse />`.
    // La permission du client est une COURTOISIE ; elle masque une commande
    // d'écriture, elle ne remplace pas la lecture d'une vue entière — qui est
    // précisément l'accès dont `RG-ADM-03` veut la trace.
    const fautes = sources.flatMap(({ chemin, texte }) =>
      [...texte.matchAll(/!peut\(\s*"([^"]+)"\s*\)\s*\)\s*return\s*<AccesRefuse/g)].map(
        (m) => `${chemin} — refus prononcé sur peut("${m[1]}") sans appeler le serveur`,
      ),
    );
    expect(fautes).toEqual([]);
  });

  it("toute vue qui refuse le fait sur le 403 REÇU", () => {
    // Le pendant positif : retirer la garde fautive ne suffit pas, il faut
    // que le refus du serveur soit celui qui s'affiche.
    const fautes = refusants
      .filter(({ texte }) => !texte.includes("statut === 403"))
      .map(({ chemin }) => `${chemin} — <AccesRefuse /> sans lecture du 403 du serveur`);
    expect(fautes).toEqual([]);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * `RG-GEN-06` — **L'AUTRE MOITIÉ DE LA MÊME RÈGLE : la commande qui mène à une
 * vue gardée se masque.**
 *
 * Le contrôle ci-dessus interdit de court-circuiter la lecture d'une vue ; il
 * ne dit rien de ce qui **y mène**. La correction précédente a retiré le
 * `enabled: peut(…)` de la vue 09 — juste, `RG-ADM-03` veut le refus tracé —
 * et a laissé le lien « Activité » offert sans condition sur les vues 07, 08 et
 * 09 : clic, « Permission requise », et un `403` en console à chaque visite.
 *
 * Les deux moitiés ne disent pas la même chose, et c'est exactement ce qui a
 * fait confondre :
 *
 *   masquer la COMMANDE            → courtoisie, exigée par `RG-GEN-06` ;
 *   court-circuiter la LECTURE     → contournement du contrôle serveur.
 *
 * Le contrôle porte sur la FORME, pas sur l'occurrence : tout groupe de modes
 * ou d'onglets qui mène à une vue gardée par une permission autre que celle de
 * la page d'où il est offert. Les deux groupes du produit dans ce cas sont le
 * sélecteur de mode du planning et la barre de sections d'un projet ; chacun
 * déclare sa table, et le contrôle exige qu'elle soit APPLIQUÉE.
 * ════════════════════════════════════════════════════════════════════════════
 */
describe("RG-GEN-06 — une commande qui mène à une vue gardée est masquée", () => {
  /** Le groupe, la table qu'il déclare, et la permission qui doit y figurer. */
  const GROUPES = [
    {
      suffixe: "planning/Planning.tsx",
      table: "PERMISSION_DU_MODE",
      filtre: "modesOfferts",
      /* `planning.controller.ts` : `@RequiertPermission("predefined_tasks:read")`
         sur `GET /planning/activite`. */
      permission: "predefined_tasks:read",
    },
    {
      suffixe: "projets/Fiche.tsx",
      table: "PERMISSION_DE_L_ONGLET",
      filtre: "PERMISSION_DE_L_ONGLET[o.cle]",
      /* `projets.controller.ts` : `@RequiertPermission("milestones:read")` sur
         `GET /projets/:id/feuille-de-route`, que lisent les vues 13 et 15. */
      permission: "milestones:read",
    },
  ];

  it("le contrôle a quelque chose à mesurer", () => {
    // Un glob qui cesserait d'atteindre ces deux fichiers rendrait le contrôle
    // muet — et il l'est déjà par nature sur ce qu'il ne connaît pas.
    for (const g of GROUPES) {
      expect(sources.some((f) => f.chemin.endsWith(g.suffixe)), g.suffixe).toBe(true);
    }
  });

  for (const g of GROUPES) {
    it(`${g.suffixe} — la table est déclarée ET appliquée`, () => {
      const fichier = sources.find((f) => f.chemin.endsWith(g.suffixe));
      expect(fichier, `${g.suffixe} introuvable`).toBeDefined();
      const texte = fichier?.texte ?? "";

      // La permission de la route d'arrivée est nommée…
      expect(texte, `${g.suffixe} — ${g.table}`).toContain(g.table);
      expect(texte, `${g.suffixe} — ${g.permission}`).toContain(`"${g.permission}"`);
      // …et la table est effectivement passée au filtre. Une table déclarée
      // que personne n'applique est la famille de défauts la plus coûteuse du
      // dépôt : elle a l'air d'une règle et ne fait rien.
      expect(texte, `${g.suffixe} — filtre`).toContain(g.filtre);
      // Le filtre passe par `peut(…)`, sinon ce n'est pas un masque de droits.
      expect(texte, `${g.suffixe} — peut()`).toMatch(/peut\(/);
    });
  }
});
