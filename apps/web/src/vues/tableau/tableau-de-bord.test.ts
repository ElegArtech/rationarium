import { describe, it, expect } from "vitest";
import fr from "../../locales/fr/tableau.json";
import en from "../../locales/en/tableau.json";

/* Même idiome que `coquille/liens.test.ts` : on lit la source, pas le rendu —
   ni `axe`, ni la conformité, ni le typage ne regardent ce qu'une ligne
   AFFIRME. */
const brut = import.meta.glob("./TableauDeBord.tsx", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;
const contrat = import.meta.glob("../../api/tableau.ts", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const sansCommentaires = (texte: string): string =>
  texte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const vue = sansCommentaires(Object.values(brut)[0] ?? "");
const api = Object.values(contrat)[0] ?? "";

/**
 * `RG-TMP-07` — « les heures déjà saisies sur une tâche sont visibles, tous
 * contributeurs confondus », pour éviter la double saisie.
 *
 * Le défaut constaté (P-35) : l'onglet « Non déclarées » affirmait « aucune
 * heure déclarée » **sans jamais vérifier** — la mention se rendait sans
 * condition, et la charge utile ne transportait aucun nombre. Avec trois
 * heures déjà saisies par un collègue, l'écran disait le contraire de la
 * vérité et poussait à ressaisir. L'onglet voisin « À venir » le faisait déjà
 * correctement : **deux moitiés de la même règle qui divergeaient**, donc
 * aucune divergence pour les signaler.
 */
describe("RG-TMP-07 — la ligne ne dit « aucune heure » que si elle a compté", () => {
  it("le contrôle a quelque chose à mesurer", () => {
    expect(vue.length).toBeGreaterThan(10_000);
    expect(vue).toContain("taches.aucuneHeure");
  });

  it("le contrat du client porte le nombre que le serveur rend", () => {
    // Une signature de client se calque sur ce que le service rend, jamais sur
    // ce que la vue croit recevoir : le champ était rendu par
    // `tableau.service.ts` et absent d'ici, donc invisible et inutilisable.
    expect(api).toMatch(/TacheNonDeclaree = \{[\s\S]*?heuresDeclarees: number;[\s\S]*?\};/);
  });

  it("AUCUNE MENTION « AUCUNE HEURE » N'EST RENDUE SANS CONSULTER LE NOMBRE", () => {
    const fautes: string[] = [];
    for (const m of vue.matchAll(/taches\.aucuneHeure/g)) {
      const amont = vue.slice(Math.max(0, m.index - 200), m.index);
      if (!amont.includes("heuresDeclarees")) fautes.push(`caractère ${m.index}`);
    }
    expect(fautes).toEqual([]);
  });

  it("les deux onglets emploient LA MÊME phrase pour le même fait", () => {
    // « 33 h déjà déclarées, tous contributeurs » — une seule formulation, ou
    // les deux moitiés se remettent à diverger.
    expect(vue.match(/taches\.dejaDeclare/g)?.length).toBeGreaterThanOrEqual(2);
    expect(fr.taches.dejaDeclare).toContain("tous contributeurs");
    expect(en.taches.dejaDeclare).toContain("all contributors");
  });
});

/**
 * `RG-TLT-02` — « **trois** états par jour : télétravail · bureau (déclaré) ·
 * non déclaré ».
 *
 * Le défaut constaté (exploration Fatou T-3) : la carte « Qui est là
 * aujourd'hui » annonçait « 28 AU BUREAU » quand la vue 20 comptait « SUR SITE
 * 9 · NON DÉCLARÉ 20 » pour les mêmes trente personnes, le même jour. Le non
 * déclaré était additionné au bureau déclaré — et c'est la lecture qui affirme
 * le plus qui était fausse.
 */
describe("RG-TLT-02 — la présence du jour connaît le non déclaré", () => {
  const etats = (/etat: ((?:"[a-z_]+"(?: \| )?)+);/.exec(api)?.[1] ?? "")
    .split("|")
    .map((x) => x.trim().replaceAll('"', ""))
    .filter(Boolean);

  it("le contrôle a quelque chose à mesurer", () => {
    expect(etats.length).toBeGreaterThanOrEqual(4);
  });

  it("LE TROISIÈME ÉTAT DE LIEU EXISTE, à côté du congé", () => {
    expect(etats).toContain("non_declare");
    expect(etats).toContain("present");
    expect(etats).toContain("teletravail");
    expect(etats).toContain("conge");
  });

  it("chaque état porte son libellé, dans les deux langues", () => {
    // La chip rend `t(`presence.${agent.etat}`)` : un état sans libellé rend
    // la clé brute, et rien ne le signale.
    const presenceFr = fr.presence as Record<string, string>;
    const presenceEn = en.presence as Record<string, string>;
    for (const etat of etats) {
      expect(presenceFr[etat], `manque en fr : presence.${etat}`).toBeTruthy();
      expect(presenceEn[etat], `manque en en : presence.${etat}`).toBeTruthy();
    }
  });

  it("le compteur d'en-tête porte les quatre nombres", () => {
    for (const jeton of ["{p}", "{c}", "{tt}", "{nd,"]) {
      expect(presenceCompte(fr)).toContain(jeton);
      expect(presenceCompte(en)).toContain(jeton);
    }
    expect(vue).toContain('nd: compte("non_declare")');
  });
});

const presenceCompte = (catalogue: { presence: Record<string, string> }) =>
  catalogue.presence["compte"] ?? "";
