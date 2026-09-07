import { describe, it, expect } from "vitest";
import {
  champFige,
  codeTypeValide,
  corpsCreationType,
  corpsModificationType,
  couleurTypeValide,
  decisionOfferte,
  fautesDeSaisieType,
  lireJoursAttribues,
  lireLimiteAnnuelle,
  lireOrdre,
  motifDeRefusValide,
  ongletCourant,
  type Onglet,
  type SaisieType,
} from "./Conges.js";

/**
 * Vue 19 — les décisions de la vue, isolées du rendu.
 *
 * Chacune porte une règle que le rendu ne sait pas exercer seul : un changement
 * de droits en cours de session, un champ vidé, un fragment d'adresse écrit à
 * la main. Un parcours de bout en bout qui rechargerait la page remonterait le
 * composant et passerait au vert avec ET sans le correctif — un test qu'on n'a
 * pas vu échouer ne prouve pas ce qu'on croit.
 */
const TOUS: Onglet[] = [
  "mesDemandes",
  "aValider",
  "toutes",
  "delegations",
  "types",
  "soldes",
];

describe("RG-GEN-06 — l'onglet actif suit les droits", () => {
  it("RG-GEN-06 — un onglet qui existe est conservé", () => {
    expect(ongletCourant(TOUS, "soldes")).toBe("soldes");
  });

  it("RG-GEN-06 — un onglet DISPARU retombe sur le premier existant, pas sur rien", () => {
    /*
     * Le cas réel : Hugo ouvre « Soldes », `leaves:manage_balances` lui est
     * retiré, la liste se recalcule. Sans recalage, `onglet` vaut encore
     * `soldes`, aucune des six conditions de rendu n'est vraie, et la vue perd
     * TOUS ses panneaux — sans erreur, sans message, sans que rien ne le dise.
     */
    expect(ongletCourant(["mesDemandes", "aValider"], "soldes")).toBe("mesDemandes");
  });

  it("RG-GEN-06 — le recalage vise le PREMIER onglet restant, pas un défaut codé en dur", () => {
    // Une liste qui ne contiendrait pas « Mes demandes » ne doit pas y renvoyer :
    // ce serait désigner à nouveau une section absente.
    expect(ongletCourant(["types", "soldes"], "aValider")).toBe("types");
  });

  it("RG-GEN-06 — une liste vide ne rend pas `undefined` : la vue garderait un onglet nul", () => {
    expect(ongletCourant([], "soldes")).toBe("mesDemandes");
  });
});

describe("EX-CNG-10, RG-CNG-24 — le champ de solde se lit sur la CHAÎNE", () => {
  /*
   * Le défaut réel, joué en navigateur : Hugo vide le champ « Réduction du
   * temps de travail », le bouton reste actif, l'enregistrement répond « Le
   * solde de Réduction du temps de travail est enregistré. », et l'allocation
   * passe à ZÉRO. Le champ se réaffiche vide — indiscernable de l'état « aucune
   * allocation propre » — et l'agent visé, à « 0,0 jours disponibles », voit
   * toute demande de congé refusée par `RG-CNG-20`. Aucun chemin ne permet
   * ensuite de retirer l'allocation : seule une nouvelle valeur ≥ 0 est
   * écrivable.
   */
  it("le contrôle négatif : c'est `Number` qui ment, pas le champ", () => {
    // La ligne fautive était `joursAttribues: Number(jours)`. Voici pourquoi
    // elle passait toutes les boucles au vert : elle est parfaitement valide.
    expect(Number("")).toBe(0);
    expect(Number("   ")).toBe(0);
    // Et voici ce que le champ rend au navigateur sur une saisie qu'il juge
    // invalide — « 2,5 » à clavier français comprise : la chaîne vide.
    expect(lireJoursAttribues("")).toEqual({ valide: false, raison: "vide" });
  });

  it("EX-CNG-10 — un champ vide n'est pas zéro : il n'est pas enregistrable", () => {
    expect(lireJoursAttribues("").valide).toBe(false);
    expect(lireJoursAttribues("   ").valide).toBe(false);
  });

  it("EX-CNG-10 — zéro EXPLICITEMENT saisi reste enregistrable", () => {
    // La correction ne doit pas retirer une écriture légitime : attribuer zéro
    // jour est un geste que `RG-CNG-24` autorise, et le serveur l'accepte
    // (`min(0)`). C'est « rien » qui est refusé, pas « zéro ».
    expect(lireJoursAttribues("0")).toEqual({ valide: true, jours: 0 });
  });

  it("RG-CNG-24 — une demi-journée s'attribue", () => {
    expect(lireJoursAttribues("12.5")).toEqual({ valide: true, jours: 12.5 });
  });

  it("RG-GEN-06 — les bornes du serveur ne sont pas proposées à l'écriture", () => {
    // `PUT /conges/soldes` valide `min(0).max(365)`. On ne propose pas ce qui
    // sera refusé : la ligne refuse avant d'écrire, plutôt qu'après.
    expect(lireJoursAttribues("-1").valide).toBe(false);
    expect(lireJoursAttribues("400").valide).toBe(false);
    expect(lireJoursAttribues("365")).toEqual({ valide: true, jours: 365 });
  });

  it("EX-CNG-10 — une saisie qui n'est pas un nombre ne devient pas un nombre", () => {
    expect(lireJoursAttribues("abc").valide).toBe(false);
    expect(lireJoursAttribues("Infinity").valide).toBe(false);
  });
});

describe("RG-CNG-09 — nul ne décide de sa propre demande", () => {
  /*
   * Le défaut réel, joué en navigateur (P-81) : la demande de Fatou figurait
   * dans son propre onglet « À valider », avec « Approuver » et « Refuser »
   * actifs. Le serveur refusait après coup en `auto_validation_interdite` —
   * une commande offerte qui ne peut pas aboutir, ce que `RG-GEN-06` interdit.
   */
  it("RG-CNG-09 — sa propre demande ne porte pas de commande de décision", () => {
    expect(decisionOfferte("fatou", "fatou", false)).toBe(false);
  });

  it("RG-CNG-09 — la demande d'autrui la porte", () => {
    expect(decisionOfferte("camille", "fatou", false)).toBe(true);
  });

  it("RG-CNG-09 — `leaves:self_approve` est la seule exception, et elle est celle du serveur", () => {
    // Retirer la commande à un détenteur d'auto-validation retirerait une
    // écriture que le serveur, lui, accepte : l'écran suivrait la règle qu'il
    // s'invente au lieu de celle qui s'applique.
    expect(decisionOfferte("fatou", "fatou", true)).toBe(true);
  });
});

describe("EX-CNG-05, RG-CNG-02 — le motif de refus est obligatoire", () => {
  /*
   * Le défaut réel, joué en navigateur (P-76) : la fenêtre libellait « Motif du
   * refus (optionnel) » et un refus vide s'enregistrait. Le client substituait
   * « Aucun motif indiqué » à la chaîne vide, ce qui satisfaisait le `min(1)`
   * du serveur : la règle était vide DES DEUX CÔTÉS, et rien ne pouvait le
   * dire — deux moitiés cohérentes entre elles et fausses ensemble.
   */
  it("EX-CNG-05 — un refus sans motif n'est pas composable", () => {
    expect(motifDeRefusValide("")).toBe(false);
  });

  it("EX-CNG-05 — des espaces ne sont pas un motif", () => {
    // Le contrôle négatif du repli fautif : `"   ".trim() || "Aucun motif
    // indiqué"` rendait une chaîne non vide, donc un refus accepté.
    expect("   ".trim() || "Aucun motif indiqué").toBe("Aucun motif indiqué");
    expect(motifDeRefusValide("   ")).toBe(false);
  });

  it("EX-CNG-05 — un motif écrit passe", () => {
    expect(motifDeRefusValide("Effectif insuffisant sur la période")).toBe(true);
  });
});

describe("EX-CNG-05 — l'onglet actif se lit dans l'ADRESSE", () => {
  /*
   * Le défaut réel (exploration Hugo T-5) : la barre posait `<a href="#soldes">`
   * puis `e.preventDefault()`. L'URL ne bougeait jamais de `/conges`, donc
   * `/conges#soldes` ouvrait « Mes demandes » — l'ancre copiée, ouverte dans un
   * nouvel onglet ou envoyée à un collègue ne menait pas où elle disait.
   *
   * L'onglet vient désormais du fragment. `ongletCourant` reçoit donc une
   * chaîne quelconque, et non plus un `Onglet` : c'est l'utilisateur qui écrit
   * l'adresse, et il y écrit ce qu'il veut.
   */
  it("EX-CNG-05 — un fragment qui nomme un onglet permis l'ouvre", () => {
    expect(ongletCourant(TOUS, "soldes")).toBe("soldes");
  });

  it("EX-CNG-05 — un fragment INCONNU retombe sur le premier onglet, pas sur du vide", () => {
    expect(ongletCourant(TOUS, "n-importe-quoi")).toBe("mesDemandes");
  });

  it("RG-GEN-06 — un fragment qui nomme un onglet INTERDIT ne l'ouvre pas", () => {
    // Camille recopie l'adresse de Hugo : `/conges#soldes`. Le serveur refuserait
    // l'écriture ; l'écran, lui, ne doit pas même l'ouvrir.
    expect(ongletCourant(["mesDemandes"], "soldes")).toBe("mesDemandes");
  });

  it("EX-CNG-05 — l'absence de fragment ouvre le premier onglet", () => {
    // `useLocation` rend la chaîne vide quand l'adresse n'en porte pas.
    expect(ongletCourant(TOUS, "")).toBe("mesDemandes");
  });
});

/**
 * `EX-CNG-13`, `RG-CNG-30` — **le référentiel des types s'écrit.**
 *
 * Le défaut réel, joué en navigateur (`P-92`, `P-93`, exploration Hugo T-4) :
 * l'onglet « Types de congés » n'offrait que « Désactiver ». Pas de création —
 * alors que l'état vide de l'onglet « Soldes » invite à « en créer un dans
 * l'onglet Types de congés » —, pas de modification, et la colonne
 * « Limite/an » affichait un nombre que rien ne permettait de corriger.
 *
 * `POST /conges/types` et `PATCH /conges/types/:id` existaient, gardées et
 * testées, **sans un seul appel client**. C'est la famille de défauts la plus
 * coûteuse du dépôt : une fonctionnalité absente ne fait échouer aucun
 * contrôle.
 */
describe("RG-CNG-30 — un type système ne laisse ouverts que cinq champs", () => {
  const SAISIE: SaisieType = {
    code: "CP",
    nom: "Congés payés",
    description: "Congés annuels légaux",
    icone: "sun",
    couleur: "#3B6EA5",
    remunere: true,
    validationRequise: true,
    limiteAnnuelle: "25",
    ordre: "1",
    actif: true,
  };

  it("RG-CNG-30 — les cinq champs ouverts le sont, les cinq autres sont figés", () => {
    for (const champ of ["nom", "description", "icone", "couleur", "validationRequise"] as const) {
      expect(champFige(true, champ)).toBe(false);
    }
    for (const champ of ["code", "remunere", "limiteAnnuelle", "ordre", "actif"] as const) {
      expect(champFige(true, champ)).toBe(true);
    }
  });

  it("RG-CNG-30 — sur un type ORDINAIRE, aucun champ n'est figé", () => {
    for (const champ of ["code", "remunere", "limiteAnnuelle", "ordre", "actif"] as const) {
      expect(champFige(false, champ)).toBe(false);
    }
  });

  it("RG-CNG-30 — le corps envoyé sur un type système ne porte QUE les cinq champs ouverts", () => {
    /*
     * Le serveur refuse tout autre champ **présent**, fût-il inchangé
     * (`modificationTypeSystemeSchema`, `superRefine` champ par champ) :
     * renvoyer le formulaire entier rendrait un `400 donneesInvalides` sur un
     * type qu'on n'a pourtant pas cherché à altérer. Le filtre est au client.
     */
    expect(Object.keys(corpsModificationType(SAISIE, true, 3)).sort()).toEqual([
      "couleur",
      "description",
      "icone",
      "nom",
      "validationRequise",
      "version",
    ]);
  });

  it("RG-CNG-30 — sur un type ordinaire, les dix champs partent", () => {
    expect(Object.keys(corpsModificationType(SAISIE, false, 3)).sort()).toEqual([
      "actif",
      "code",
      "couleur",
      "description",
      "icone",
      "limiteAnnuelle",
      "nom",
      "ordre",
      "remunere",
      "validationRequise",
      "version",
    ]);
  });

  it("RG-GEN-07 — la version lue accompagne toute modification", () => {
    // `GET /conges/types` la rend ; sans elle dans le type du client, aucune
    // requête n'est composable — c'est ce qui a laissé la vue 35 en lecture
    // seule pendant tout le projet.
    expect(corpsModificationType(SAISIE, true, 7).version).toBe(7);
    expect(corpsModificationType(SAISIE, false, 7).version).toBe(7);
  });
});

describe("EX-CNG-13 — la limite annuelle se lit sur la CHAÎNE", () => {
  it("le contrôle négatif : c'est `Number` qui confond « aucune limite » et « zéro jour »", () => {
    expect(Number("")).toBe(0);
    // Zéro jour par an INTERDIT le type ; aucune limite l'ouvre. Deux états
    // légitimes du référentiel, que `Number` rend identiques.
    expect(lireLimiteAnnuelle("")).toEqual({ valide: true, limite: null });
    expect(lireLimiteAnnuelle("0")).toEqual({ valide: true, limite: 0 });
  });

  it("EX-CNG-13 — une limite chiffrée est lue telle quelle, demi-journées comprises", () => {
    expect(lireLimiteAnnuelle("25")).toEqual({ valide: true, limite: 25 });
    expect(lireLimiteAnnuelle("18.5")).toEqual({ valide: true, limite: 18.5 });
  });

  it("RG-GEN-06 — ce que le serveur refusera n'est pas proposé", () => {
    expect(lireLimiteAnnuelle("-1").valide).toBe(false);
    expect(lireLimiteAnnuelle("400").valide).toBe(false);
    expect(lireLimiteAnnuelle("abc").valide).toBe(false);
  });

  it("EX-CNG-13 — vider la limite l'EFFACE : `null`, pas l'omission", () => {
    // `undefined` ne touche pas au champ. Sans `null`, un type plafonné ne
    // pourrait plus jamais redevenir illimité : le geste serait offert et sans
    // effet — « un réglage qui s'enregistre n'est pas un réglage qui
    // s'applique », septième occurrence évitée.
    const corps = corpsModificationType(
      {
        code: "RTT", nom: "RTT", description: "", icone: "", couleur: "",
        remunere: true, validationRequise: true, limiteAnnuelle: "", ordre: "0", actif: true,
      },
      false,
      1,
    );
    expect(corps.limiteAnnuelle).toBeNull();
    expect("limiteAnnuelle" in corps).toBe(true);
  });
});

describe("EX-CNG-13 — la création compose ce que `typeCongeSchema` attend", () => {
  const vide: SaisieType = {
    code: " rtt ", nom: "  Réduction du temps de travail  ", description: "", icone: "",
    couleur: "", remunere: false, validationRequise: false, limiteAnnuelle: "", ordre: "",
    actif: true,
  };

  it("EX-CNG-13 — le code est normalisé en majuscules, comme le serveur le fait", () => {
    // Le serveur applique `toUpperCase()` avant de tester l'unicité : une casse
    // qui change en chemin rend un `409 codeDejaPris` incompréhensible.
    expect(corpsCreationType(vide).code).toBe("RTT");
    expect(corpsCreationType(vide).nom).toBe("Réduction du temps de travail");
  });

  it("EX-CNG-13 — un champ vide est OMIS, jamais envoyé à `null`", () => {
    /*
     * Différence de contrat entre les deux routes, et elle mord : `POST` déclare
     * `description`/`icone`/`couleur` en `z.string().optional()` — `null` y est
     * refusé —, quand `PATCH` les déclare `nullish` pour permettre l'effacement.
     * Zod retire les clés inconnues en silence, mais pas les valeurs du mauvais
     * type : celles-là rendent un `400`.
     */
    const corps = corpsCreationType(vide);
    expect("description" in corps).toBe(false);
    expect("icone" in corps).toBe(false);
    expect("couleur" in corps).toBe(false);
    expect("limiteAnnuelle" in corps).toBe(false);
    expect(corps.ordre).toBe(0);
  });

  it("EX-CNG-13 — un champ rempli part rempli", () => {
    const corps = corpsCreationType({ ...vide, couleur: "#3B6EA5", limiteAnnuelle: "18", ordre: "2" });
    expect(corps.couleur).toBe("#3B6EA5");
    expect(corps.limiteAnnuelle).toBe(18);
    expect(corps.ordre).toBe(2);
  });
});

describe("RG-GEN-06 — la saisie d'un type refuse AVANT d'écrire, et dit quel champ", () => {
  const bon: SaisieType = {
    code: "RTT", nom: "RTT", description: "", icone: "", couleur: "#3B6EA5",
    remunere: true, validationRequise: true, limiteAnnuelle: "18", ordre: "0", actif: true,
  };

  it("RG-GEN-06 — une saisie complète ne porte aucune faute", () => {
    expect(fautesDeSaisieType(bon)).toEqual([]);
  });

  it("EX-CNG-13 — le code suit `^[A-Z0-9_]+$`, vingt caractères au plus", () => {
    expect(codeTypeValide("RTT_2")).toBe(true);
    // Le champ met en majuscules à la frappe : une saisie minuscule est licite.
    expect(codeTypeValide("rtt")).toBe(true);
    expect(codeTypeValide("RTT-2")).toBe(false);
    expect(codeTypeValide("CONGÉ")).toBe(false);
    expect(codeTypeValide("")).toBe(false);
    expect(codeTypeValide("A".repeat(21))).toBe(false);
    expect(fautesDeSaisieType({ ...bon, code: "RTT 2" })).toEqual(["code"]);
  });

  it("EX-CNG-13 — un nom vide est une faute nommée, pas un « certains champs »", () => {
    expect(fautesDeSaisieType({ ...bon, nom: "   " })).toEqual(["nom"]);
  });

  it("EX-CNG-13 — la couleur suit `#RRGGBB`, ou n'est pas", () => {
    expect(couleurTypeValide("")).toBe(true);
    expect(couleurTypeValide("#3b6ea5")).toBe(true);
    expect(couleurTypeValide("bleu")).toBe(false);
    expect(fautesDeSaisieType({ ...bon, couleur: "#XYZ" })).toEqual(["couleur"]);
  });

  it("EX-CNG-13 — les fautes sortent TOUTES, dans l'ordre des champs", () => {
    expect(fautesDeSaisieType({ ...bon, code: "", nom: "", limiteAnnuelle: "999", ordre: "1.5" }))
      .toEqual(["code", "nom", "limiteAnnuelle", "ordre"]);
  });

  it("EX-CNG-13 — l'ordre d'affichage est un entier", () => {
    expect(lireOrdre("")).toEqual({ valide: true, ordre: 0 });
    expect(lireOrdre("3")).toEqual({ valide: true, ordre: 3 });
    expect(lireOrdre("1.5").valide).toBe(false);
    expect(lireOrdre("-1").valide).toBe(false);
  });
});

/**
 * `EX-CNG-05`, `RG-GEN-02` — **le raccord entre le lien d'une notification et
 * l'onglet qu'il désigne.**
 *
 * `NotificationsService` écrit `lien: "/conges#aValider"` pour qui doit
 * décider et `"/conges#mesDemandes"` pour qui reçoit une décision. La vue lit
 * ce fragment et l'oppose à `ongletCourant`. Ce sont deux moitiés justes
 * séparément — et c'est le raccord qui casse : un fragment renommé d'un côté
 * ne fait échouer aucun contrôle de l'autre.
 *
 * Le test prend donc la SORTIE du serveur (le fragment, littéral) et compose
 * avec elle l'ENTRÉE de la vue.
 */
describe("EX-CNG-05 — les fragments écrits par le serveur ouvrent bien leur onglet", () => {
  /** Les liens tels que `apps/api/src/conges/conges.service.ts` les écrit. */
  const LIENS = ["/conges#aValider", "/conges#mesDemandes"] as const;

  it("EX-CNG-05 — chaque lien de notification nomme un onglet que la vue connaît", () => {
    for (const lien of LIENS) {
      const fragment = lien.split("#")[1] ?? "";
      // Ce que `useLocation({ select: (l) => l.hash })` rend : le fragment nu.
      expect(TOUS).toContain(fragment as Onglet);
      expect(ongletCourant(TOUS, fragment)).toBe(fragment);
    }
  });

  it("RG-GEN-06 — un destinataire sans le droit de valider n'atterrit pas sur du vide", () => {
    // Une délégation qui expire entre l'envoi de la notification et son clic :
    // `/conges#aValider` désigne alors un onglet que la personne n'a plus.
    expect(ongletCourant(["mesDemandes"], "aValider")).toBe("mesDemandes");
  });
});
