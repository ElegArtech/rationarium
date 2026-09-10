import { describe, it, expect } from "vitest";
import { idsDeLaPortee, vueVide, type Portee } from "./Rapports.js";
import type { SanteLigne } from "../../api/rapports.js";
import fr from "../../locales/fr/rapports.json";
import en from "../../locales/en/rapports.json";

const ligne = (id: string, sante: SanteLigne["sante"], completion: number): SanteLigne => ({
  id,
  nom: id,
  icone: null,
  completion,
  restantes: 0,
  enRetard: 0,
  jalons: 0,
  jalonsAVenir: 0,
  tachesActives: 0,
  dateFin: "2026-12-31",
  chef: null,
  service: null,
  budgetHeures: null,
  sante,
});

const PORTEFEUILLE = [
  ligne("bon-fini", "good", 100),
  ligne("bon-en-cours", "good", 40),
  ligne("attention", "warning", 60),
  ligne("critique", "critical", 20),
];

/**
 * Vue 30 — les filtres de la barre restreignent TOUTE la page.
 *
 * Le défaut constaté (P-113, P-115) : « Projets » et « Responsable » étaient
 * appliqués aux lignes déjà reçues et ne restreignaient donc que « Santé des
 * projets » et deux des quatre indicateurs. « Avancement réel et attendu »,
 * « Complétion des jalons », « Ce qui est en retard », « Répartition de
 * charge », les répartitions par priorité et par statut, « Activité récente »
 * et le Gantt portefeuille les ignoraient : ils sont agrégés par le serveur.
 *
 * `EX-RPT-02`, `RG-RPT-06`, `RG-GEN-05`.
 */
describe("EX-RPT-02 — la portée devient une liste de projets", () => {
  it("sans portée, tout le portefeuille est retenu", () => {
    expect(idsDeLaPortee(PORTEFEUILLE, "")).toHaveLength(4);
  });

  it("« Projets en cours seulement » écarte ce qui est achevé", () => {
    expect(idsDeLaPortee(PORTEFEUILLE, "active")).toEqual([
      "bon-en-cours",
      "attention",
      "critique",
    ]);
  });

  it("« Projets à risque » ne garde que ce qui n'est pas de bonne santé", () => {
    expect(idsDeLaPortee(PORTEFEUILLE, "risk")).toEqual(["attention", "critique"]);
  });

  it("un portefeuille entièrement sain ne retient RIEN sous « à risque »", () => {
    // C'est le cas qui produisait le défaut visible : zéro projet retenu, et
    // le serveur laissait tomber une liste vide, donc rendait tout.
    expect(idsDeLaPortee([ligne("a", "good", 10)], "risk")).toEqual([]);
  });
});

describe("RG-RPT-06, RG-GEN-05 — le portefeuille vide ne ment sur aucun module", () => {
  const vide = vueVide({ nature: "mois", debut: "2026-09-01", fin: "2026-09-07" });

  it("EX-RPT-02 — sur zéro projet, AUCUN indicateur ne garde une valeur", () => {
    /*
     * Le symptôme exact du parcours : « Avancement moyen » restait à 50 % et
     * « Jalons échus tenus » à 13/20 sur un périmètre à zéro projet, parce que
     * les agrégats venaient d'une requête non filtrée. Ici, tout est à zéro et
     * chaque panneau déclenche son propre état vide rédigé.
     */
    expect(vide.progression.projets).toEqual([]);
    expect(vide.progression.total).toBe(0);
    expect(vide.jalons.echus).toBe(0);
    expect(vide.jalons.aTemps).toBe(0);
    expect(vide.jalons.retards).toEqual([]);
    expect(vide.charge.agents).toEqual([]);
    expect(vide.charge.moyenne).toBe(0);
    expect(vide.repartitions.priorite).toEqual([]);
    expect(vide.repartitions.statut).toEqual([]);
    expect(vide.repartitions.actives).toBe(0);
    expect(vide.alerte.tachesEnRetard).toBe(0);
    expect(vide.sante).toEqual([]);
  });

  it("`RG-RPT-04` — sans donnée, l'activité ne prétend pas à une interprétation", () => {
    // « Stable » serait une affirmation ; `null` dit qu'il n'y a rien à dire.
    expect(vide.activite.ratio).toBeNull();
    expect(vide.activite.interpretation).toBeNull();
  });

  it("`RG-RPT-03` — sans relevé, l'historique est déclaré insuffisant", () => {
    expect(vide.tendance.historiqueSuffisant).toBe(false);
    expect(vide.tendance.stagnation).toBe(false);
  });

  it("la période reste celle qu'on a demandée : le vide n'efface pas le contexte", () => {
    expect(vide.periode.fin).toBe("2026-09-07");
  });
});

/**
 * `EX-RPT-01` — **un libellé de période ne promet pas une durée fixe.**
 *
 * Le défaut constaté (exploration Inès T-2) : les quatre boutons étaient
 * libellés « 7 jours · 30 jours · 90 jours · 365 jours » alors que `debutDe()`
 * rend le lundi courant, le 1er du mois, le 1er du trimestre et le 1er
 * janvier — ce que `EX-RPT-01` demande, « choisir une période : semaine, mois,
 * trimestre, année ». Mesuré le lundi 07/09/2026, « 7 jours » analysait
 * `{"debut":"2026-09-07","fin":"2026-09-07"}` : zéro jour. Le décalage ne se
 * lisait qu'au nom du fichier exporté.
 */
describe("EX-RPT-01 — les libellés de période disent une période, pas une durée", () => {
  const cles = ["semaine", "mois", "trimestre", "annee"] as const;

  it("aucun libellé ne promet un nombre de jours", () => {
    for (const cle of cles) {
      expect(fr.periode[cle]).not.toMatch(/\d/);
      expect(en.periode[cle]).not.toMatch(/\d/);
    }
  });

  it("les quatre libellés restent distincts, dans les deux langues", () => {
    expect(new Set(cles.map((c) => fr.periode[c])).size).toBe(4);
    expect(new Set(cles.map((c) => en.periode[c])).size).toBe(4);
  });
});

/**
 * `EX-RPT-06` — **la colonne dit ce qu'elle affiche.**
 *
 * Le défaut constaté (exploration Driss T-3) : le tableau « Santé des
 * projets » portait la colonne **Avancement** et affichait `completion`
 * (terminées / total) ; trente lignes plus bas, « Avancement réel et attendu »
 * affiche la moyenne des avancements, comme la vue 11. Le même projet valait
 * 20 % ici et 46 % là, sous le même mot. Le nom accessible de la cellule
 * disait pourtant déjà « Complétion de … » : l'en-tête visible et l'en-tête lu
 * ne parlaient pas de la même chose.
 */
describe("EX-RPT-06 — l'en-tête vu et l'en-tête lu disent la même chose", () => {
  it("l'en-tête de colonne se retrouve dans le nom accessible de la cellule", () => {
    for (const catalogue of [fr, en]) {
      expect(catalogue.sante.completionDe.toLowerCase()).toContain(
        catalogue.sante.colCompletion.toLowerCase(),
      );
    }
  });

  it("la colonne ne s'appelle plus « Avancement » : ce mot désigne l'autre nombre", () => {
    expect(fr.sante.colCompletion.toLowerCase()).not.toContain("avancement");
    expect(en.sante.colCompletion.toLowerCase()).not.toContain("progress");
  });
});

/** Le type est exercé ici : une portée inconnue ne doit pas compiler. */
const PORTEES: Portee[] = ["", "active", "risk"];
describe("les portées offertes", () => {
  it("sont trois, et « tous » est la première", () => {
    expect(PORTEES[0]).toBe("");
  });
});

/**
 * `EX-RPT-12` — **le bandeau d'alerte arrive sur les tâches AVEC son filtre.**
 *
 * Le lien annonçait « Ouvrir les tâches » sous un compte de tâches en retard
 * et pointait `/taches` sans rien : on arrivait sur les cinquante-cinq, filtre
 * éteint. Corrigé en deux temps et par deux mains — `Rapports.tsx` a posé
 * `search={{ retard: 1 }}` une vague avant que `Liste.tsx` ne le lise —, ce
 * qui est exactement la forme du défaut de raccord : **un paramètre qui voyage
 * sans que personne le lise ne fait échouer aucun contrôle.** Le typage ne le
 * voit pas (`/taches` n'a pas de schéma de recherche), le parcours de bout en
 * bout non plus (la liste s'affiche, elle affiche juste tout).
 *
 * Le contrôle lit donc les DEUX sources et les compare. Il tombe si l'une des
 * moitiés disparaît.
 */
const sources = import.meta.glob("../{rapports,taches}/*.tsx", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const fichier = (suffixe: string): string => {
  const trouve = Object.entries(sources).find(([chemin]) => chemin.endsWith(suffixe));
  if (!trouve) throw new Error(`source introuvable : ${suffixe}`);
  return trouve[1];
};

describe("EX-RPT-12 — le filtre « en retard » traverse le lien", () => {
  it("le contrôle a quelque chose à mesurer", () => {
    // Un contrôle qui ne mesure rien passe au vert : troisième fois dans ce
    // dépôt. On affirme d'abord la matière.
    expect(fichier("/Rapports.tsx").length).toBeGreaterThan(1000);
    expect(fichier("/Liste.tsx").length).toBeGreaterThan(1000);
  });

  it("le bandeau ÉCRIT le paramètre sur la route des tâches", () => {
    expect(fichier("/Rapports.tsx")).toMatch(
      /<Link\s+to="\/taches"\s+search=\{\{\s*retard:\s*1\s*\}\}/,
    );
  });

  it("la liste LIT le paramètre pour amorcer son filtre — la moitié qui manquait", () => {
    const liste = fichier("/Liste.tsx");
    expect(liste).toMatch(/const enRetard = adresse\["retard"\] === 1/);
    // Et plus jamais l'amorçage en dur : c'est la forme du défaut.
    expect(liste).not.toMatch(/const \[enRetard, setEnRetard\] = useState\(false\)/);
  });

  it("les deux moitiés nomment le MÊME paramètre", () => {
    const ecrit = /search=\{\{\s*(\w+):\s*1/.exec(fichier("/Rapports.tsx"))?.[1];
    const lu = /const enRetard = adresse\["(\w+)"\] === 1/.exec(
      fichier("/Liste.tsx"),
    );
    expect(ecrit).toBe("retard");
    expect(lu?.[1]).toBe("retard");
  });
});

/**
 * `RG-GEN-08` — **la vue POSE la langue dans les filtres, elle ne la
 * concatène plus.**
 *
 * `adresseExport` savait porter `langue` depuis une vague, et la vue joignait
 * quand même `&langue=` à la main derrière l'adresse construite : la forme de
 * l'adresse était connue de deux endroits, ce qui donne un jour deux
 * paramètres `langue` ou aucun. Le raccord se ferme du côté de l'appelant.
 */
describe("RG-GEN-08 — l'export part avec la langue du lecteur", () => {
  const vue = fichier("/Rapports.tsx");

  it("la langue est posée dans les filtres", () => {
    expect(vue).toMatch(/langue:\s*i18n\.language/);
  });

  it("l'adresse ne concatène plus la langue derrière `adresseExport`", () => {
    // La forme du défaut, mot pour mot.
    expect(vue).not.toContain("&langue=");
    expect(vue).toMatch(/const adresse = \(format: "xlsx" \| "json"\) =>\s*api\.adresseExport\(filtres, format\)/);
  });
});
