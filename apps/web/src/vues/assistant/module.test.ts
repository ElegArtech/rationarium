import { describe, it, expect } from "vitest";
import { REGLAGES_ASSISTANT_DEFAUT, SECONDES_AGENT_JOIGNABLE } from "@rationarium/contracts";
import { ErreurApi } from "../../api/client.js";
import { agentJoignable, moduleDesactive, optionsEtatAssistant, temoinAgent } from "./module.js";
import { ecartAuPresent, minutesEntre } from "./formes.js";
import { brouillonsEgaux, depuisBrouillon, versBrouillon } from "./Reglages.js";

/**
 * `docs/assistant/SPEC-PHASE-1.md § 4` — **un agent est joignable s'il a donné
 * signe de vie depuis moins d'une minute.**
 *
 * Le témoin est recalculé contre l'horloge de l'écran : figé à la lecture, il
 * resterait vert une heure après l'extinction du poste. Chaque cas porte une
 * horloge fixe — un contrôle de durée qui lirait `Date.now()` passerait ou
 * tomberait selon la seconde où il s'exécute.
 */
const MAINTENANT = Date.parse("2026-11-03T09:00:00.000Z");
const ilYa = (secondes: number) => new Date(MAINTENANT - secondes * 1000).toISOString();

describe("§ 4 — le témoin « agent joignable »", () => {
  it("le seuil est celui du contrat : une minute", () => {
    expect(SECONDES_AGENT_JOIGNABLE).toBe(60);
  });

  it("un contact il y a moins d'une minute : joignable", () => {
    expect(agentJoignable(ilYa(0), MAINTENANT)).toBe(true);
    expect(agentJoignable(ilYa(59), MAINTENANT)).toBe(true);
  });

  it("un contact il y a une minute pile, ou plus : injoignable", () => {
    expect(agentJoignable(ilYa(60), MAINTENANT)).toBe(false);
    expect(agentJoignable(ilYa(3600), MAINTENANT)).toBe(false);
  });

  it("le témoin VIEILLIT avec l'écran : vert à la lecture, éteint une minute plus tard", () => {
    const contact = ilYa(10);
    expect(agentJoignable(contact, MAINTENANT)).toBe(true);
    expect(agentJoignable(contact, MAINTENANT + 50_000)).toBe(false);
  });

  it("aucun contact, ou un contact illisible : jamais joignable", () => {
    expect(agentJoignable(null, MAINTENANT)).toBe(false);
    expect(agentJoignable("hier", MAINTENANT)).toBe(false);
  });

  it("un contact daté de quelques secondes DANS LE FUTUR — horloges décalées — reste un contact récent", () => {
    expect(agentJoignable(ilYa(-5), MAINTENANT)).toBe(true);
  });

  it("trois visages : joignable, silencieux, jamais vu", () => {
    expect(temoinAgent(ilYa(5), MAINTENANT)).toBe("joignable");
    expect(temoinAgent(ilYa(120), MAINTENANT)).toBe("silencieux");
    expect(temoinAgent(null, MAINTENANT)).toBe("jamais");
  });
});

describe("RG-AST-01 — le module désactivé se reconnaît à son 404", () => {
  it("404 : désactivé ; 403 ou panne : autre chose", () => {
    expect(moduleDesactive(new ErreurApi(404, "erreurs:introuvable", "Ressource introuvable."))).toBe(true);
    expect(moduleDesactive(new ErreurApi(403, "erreurs:permissionRequise", "Refus"))).toBe(false);
    expect(moduleDesactive(new ErreurApi(500, undefined, "Panne"))).toBe(false);
    expect(moduleDesactive(new Error("réseau"))).toBe(false);
  });

  it("la sonde ne réessaie pas, ni au montage : un module désactivé échoue PAR CONSTRUCTION", () => {
    // Piège consigné : deux observateurs d'une clé en échec qui divergent sur
    // le réessai se relancent l'un l'autre. La coquille, la fiche projet, le
    // profil et l'écran d'activité lisent cette clé.
    expect(optionsEtatAssistant.retry).toBe(false);
    expect(optionsEtatAssistant.retryOnMount).toBe(false);
  });
});

describe("les durées d'un passage", () => {
  it("se comptent en minutes entières, et ne se calculent pas sans fin", () => {
    expect(minutesEntre("2026-11-03T06:00:00Z", "2026-11-03T06:42:30Z")).toBe(42);
    expect(minutesEntre("2026-11-03T06:00:00Z", null)).toBeNull();
    expect(minutesEntre("2026-11-03T07:00:00Z", "2026-11-03T06:00:00Z")).toBeNull();
  });

  it("l'écart au présent choisit son unité", () => {
    expect(ecartAuPresent(ilYa(30), MAINTENANT)).toEqual({ unite: "secondes", n: 30 });
    expect(ecartAuPresent(ilYa(300), MAINTENANT)).toEqual({ unite: "minutes", n: 5 });
    expect(ecartAuPresent(ilYa(7200), MAINTENANT)).toEqual({ unite: "heures", n: 2 });
    expect(ecartAuPresent(ilYa(3 * 86400), MAINTENANT)).toEqual({ unite: "jours", n: 3 });
  });
});

describe("EX-AST-01, EX-AST-05 — les réglages du module se valident par le contrat", () => {
  const defaut = versBrouillon(REGLAGES_ASSISTANT_DEFAUT);

  it("les réglages par défaut passent tels quels", () => {
    expect(depuisBrouillon(defaut)).toEqual({ valeurs: REGLAGES_ASSISTANT_DEFAUT, erreurs: {} });
  });

  it("`Number(\"\")` vaut zéro : un champ vidé est une erreur, jamais « zéro jour »", () => {
    const r = depuisBrouillon({ ...defaut, conservationJours: "" });
    expect(r.valeurs).toBeNull();
    expect(r.erreurs.conservationJours).toBe(true);
  });

  it("les bornes de § 7 : conservation de 30 à 1 830 jours, plafond de 1 à 1 000 actions", () => {
    expect(depuisBrouillon({ ...defaut, conservationJours: "29" }).erreurs.conservationJours).toBe(true);
    expect(depuisBrouillon({ ...defaut, conservationJours: "1830" }).erreurs.conservationJours).toBeUndefined();
    expect(depuisBrouillon({ ...defaut, actionsParPassage: "1001" }).erreurs.actionsParPassage).toBe(true);
    expect(depuisBrouillon({ ...defaut, actionsParPassage: "2.5" }).erreurs.actionsParPassage).toBe(true);
  });

  it("une planification vide vaut « aucune » ; une expression cron a cinq champs", () => {
    expect(depuisBrouillon({ ...defaut, planification: "" }).valeurs?.planification).toBe("");
    expect(depuisBrouillon({ ...defaut, planification: "0 6 * * 1-5" }).valeurs?.planification).toBe("0 6 * * 1-5");
    expect(depuisBrouillon({ ...defaut, planification: "  0  6 * * 1-5 " }).valeurs?.planification).toBe("0 6 * * 1-5");
    expect(depuisBrouillon({ ...defaut, planification: "tous les matins" }).erreurs.planification).toBe(true);
    expect(depuisBrouillon({ ...defaut, planification: "0 6 * *" }).erreurs.planification).toBe(true);
  });

  it("un brouillon revenu à l'enregistré n'est pas une modification", () => {
    expect(brouillonsEgaux(defaut, { ...defaut })).toBe(true);
    expect(brouillonsEgaux(defaut, { ...defaut, mode: "relais" })).toBe(false);
    expect(brouillonsEgaux(defaut, { ...defaut, conservationJours: " 180 " })).toBe(true);
  });
});
