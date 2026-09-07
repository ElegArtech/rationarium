import { describe, it, expect } from "vitest";
import { TYPES_NOTIFICATION } from "./notifications.service.js";
import { encoderCorps, langueDe, rendreCorps, titreNotification } from "./libelles.js";

/**
 * `RG-NTF-01`, `EX-NTF-01`, `RG-GEN-08`.
 *
 * Ce que ces contrôles auraient vu (P-18, P-19, P-20) : des notifications
 * écrites en dur, en français, à l'émission — donc un panneau rendant un cadre
 * traduit et un contenu français en session anglaise —, et des titres hors du
 * vocabulaire fermé de `cadrage/01 § M18`.
 */

/** Les six intitulés de M18, à la lettre. */
const M18 = {
  tache_assignee: "Nouvelle tâche assignée",
  conge_a_valider: "Demande de congé à valider",
  conge_decide: "Décision sur votre demande de congé",
  tache_echeance_proche: "Tâche à échéance proche",
  tache_en_retard: "Tâche en retard",
  ajout_projet: "Ajout à un projet",
} as const;

describe("cadrage/01 § M18 — le vocabulaire des notifications est FERMÉ", () => {
  it("les six types portent l'intitulé de M18, mot pour mot", () => {
    for (const type of TYPES_NOTIFICATION) {
      expect(titreNotification(type, "fr"), type).toBe(M18[type]);
    }
  });

  it("aucun type n'est laissé sans intitulé anglais", () => {
    for (const type of TYPES_NOTIFICATION) {
      const en = titreNotification(type, "en");
      expect(en, type).toBeTruthy();
      expect(en, type).not.toBe(M18[type]);
    }
  });

  it("les formulations écartées par le cadrage ne reviennent pas", () => {
    // « Échéance proche : X », « En retard : X », « Nouvelle tâche : X » : ce
    // que le produit écrivait, et que M18 n'énonce pas.
    const titres = TYPES_NOTIFICATION.map((t) => titreNotification(t, "fr") ?? "");
    expect(titres.some((t) => t.includes(":"))).toBe(false);
  });

  it("un type inconnu ne fabrique pas d'intitulé", () => {
    expect(titreNotification("type_invente", "fr")).toBeNull();
  });
});

describe("RG-GEN-08 — le corps se compose à la LECTURE, dans la langue du lecteur", () => {
  const corps = encoderCorps("tache_en_retard", { tache: "Rédiger la note", date: "2026-09-01" });

  it("la même notification se lit en français et en anglais", () => {
    expect(rendreCorps(corps, "fr").texte).toBe(
      "La tâche « Rédiger la note » a dépassé son échéance du 2026-09-01.",
    );
    expect(rendreCorps(corps, "en").texte).toBe(
      "Task “Rédiger la note” is past its due date of 2026-09-01.",
    );
  });

  it("la clé et les paramètres accompagnent le texte, pour le client qui composerait", () => {
    const rendu = rendreCorps(corps, "fr");
    expect(rendu.cle).toBe("tache_en_retard");
    expect(rendu.params).toEqual({ tache: "Rédiger la note", date: "2026-09-01" });
  });

  it("une phrase déjà rédigée traverse telle quelle, sans clé", () => {
    // Le repli des émetteurs pas encore convertis : la cloche ne doit pas
    // devenir muette pendant qu'ils basculent un par un.
    const rendu = rendreCorps("Une demande de congé attend votre décision.", "en");
    expect(rendu.texte).toBe("Une demande de congé attend votre décision.");
    expect(rendu.cle).toBeNull();
  });

  it("un corps composable illisible ne rend jamais du JSON à l'écran", () => {
    expect(rendreCorps("i18n:{ceci n'est pas du JSON", "fr").texte).toBe("");
    expect(rendreCorps(`i18n:{"cle":"inconnue","params":{}}`, "fr").texte).toBe("");
  });
});

describe("la langue du lecteur", () => {
  it("tombe sur le français par défaut, et reconnaît les variantes régionales", () => {
    expect(langueDe("en")).toBe("en");
    expect(langueDe("en-GB")).toBe("en");
    expect(langueDe("fr")).toBe("fr");
    expect(langueDe(null)).toBe("fr");
    expect(langueDe("")).toBe("fr");
  });
});

describe("RG-NTF-01 — les SIX types rendent un corps, pas une chaîne vide", () => {
  /*
   * Le défaut : `CORPS` ne portait que les deux modèles de tâche à échéance.
   * Les quatre autres émetteurs avaient bien basculé en paramètres, donc leur
   * corps était encodé — et `rendreCorps` rendait "" faute de modèle. Le
   * panneau affichait un titre seul, et le MOTIF d'un refus de congé, la
   * première chose qu'on cherche, était perdu à l'écran. Deux moitiés justes,
   * et c'est le raccord qui manquait : rien ne comparait la liste des types
   * émis à la liste des modèles rendus.
   */
  const params: Record<string, Record<string, string>> = {
    tache_assignee: { tache: "Rédiger la note" },
    conge_a_valider: { jours: "3" },
    conge_decide: { decision: "approuve" },
    tache_echeance_proche: { tache: "Rédiger la note", date: "2026-09-01" },
    tache_en_retard: { tache: "Rédiger la note", date: "2026-09-01" },
    ajout_projet: { projet: "Refonte du portail" },
  };

  for (const type of TYPES_NOTIFICATION) {
    it(`${type} rend un corps en français et en anglais`, () => {
      const corps = encoderCorps(type, params[type] ?? {});
      const fr = rendreCorps(corps, "fr");
      const en = rendreCorps(corps, "en");
      expect(fr.texte, `${type} fr`).not.toBe("");
      expect(en.texte, `${type} en`).not.toBe("");
      // Deux langues, deux phrases : un modèle recopié tel quel serait un
      // corps français rendu en session anglaise.
      expect(en.texte, `${type} en`).not.toBe(fr.texte);
      // Et jamais du JSON ni la marque à l'écran.
      expect(fr.texte).not.toContain("i18n:");
      expect(fr.texte).not.toContain("{");
    });
  }
});

describe("RG-GEN-08 — la décision de congé porte sa face et son motif", () => {
  it("un refus cite son motif, dans les deux langues", () => {
    const corps = encoderCorps("conge_decide", { decision: "refuse", motif: "Effectif insuffisant" });
    expect(rendreCorps(corps, "fr").texte).toBe(
      "Votre demande de congé a été refusée. Motif : Effectif insuffisant",
    );
    expect(rendreCorps(corps, "en").texte).toBe(
      "Your leave request was declined. Reason: Effectif insuffisant",
    );
  });

  it("une approbation ne parle pas de refus", () => {
    const corps = encoderCorps("conge_decide", { decision: "approuve" });
    expect(rendreCorps(corps, "fr").texte).toContain("approuvée");
    expect(rendreCorps(corps, "en").texte).toContain("approved");
  });

  it("un refus sans motif reste une phrase entière", () => {
    const corps = encoderCorps("conge_decide", { decision: "refuse" });
    expect(rendreCorps(corps, "fr").texte).toBe("Votre demande de congé a été refusée.");
    expect(rendreCorps(corps, "fr").texte).not.toContain("Motif");
  });
});

describe("le pluriel du décompte de jours", () => {
  const rendu = (n: string, langue: "fr" | "en") =>
    rendreCorps(encoderCorps("conge_a_valider", { jours: n }), langue).texte;

  it("un jour est au singulier dans les deux langues", () => {
    expect(rendu("1", "fr")).toContain("1 jour ");
    expect(rendu("1", "en")).toContain("1 day ");
  });

  it("au-delà, le pluriel", () => {
    expect(rendu("3", "fr")).toContain("3 jours");
    expect(rendu("3", "en")).toContain("3 days");
  });

  it("le pluriel de ZÉRO diffère entre les deux langues", () => {
    // « 0 utilisateur » et « 0 users » : une règle recopiée d'un catalogue à
    // l'autre est fausse dans l'un des deux. Un congé fait au moins un jour,
    // donc le cas ne se présente pas — la forme est juste quand même.
    expect(rendu("0", "fr")).toContain("0 jour ");
    expect(rendu("0", "en")).toContain("0 days");
  });
});
