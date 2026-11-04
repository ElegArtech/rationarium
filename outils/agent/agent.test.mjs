/* global process, Buffer */
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { after, before, describe, test } from "node:test";
import { baseGuichet, decouperEnLots, lireFichierEnv, masquer, normaliserActions } from "./lib/guichet.mjs";
import { AGENT, JETON, PASSAGE, demarrerFauxGuichet, dossierTemporaire, executer } from "./faux-guichet.mjs";

const PROPRIETAIRE = { id: "0a6d9b8e-5f4c-4d3b-8a2e-7c1f0e9d8b7a", prenom: "Camille", nom: "Durand" };
const etatGuichet = (passageActif = null) => ({
  proprietaire: PROPRIETAIRE,
  mode: "relais",
  jalonObligatoire: true,
  typesAutorises: [],
  passageActif,
});

const action = (n) => ({
  type: "commentaire_ajouter",
  justification: `action ${n}`,
  preuves: [{ source: "depot", reference: `commit-${n}`, date: "2026-11-02" }],
  charge: { projectId: PROPRIETAIRE.id, contenu: `contenu ${n}` },
});

/** Le guichet répond à chaque action de chaque lot ; l'action « refusee » est refusée. */
function routeActions(lots, { echecAuLot } = {}) {
  return (r) => {
    lots.push(r.corps.actions);
    if (echecAuLot === lots.length) {
      return { statut: 409, corps: { cle: "assistant:erreurs.passageClos", message: "Ce passage n'est plus en cours." } };
    }
    const resultats = r.corps.actions.map((a, index) => {
      const refusee = a.justification === "refusee";
      return {
        index,
        type: a.type,
        reference: a.reference ?? null,
        etat: refusee ? "refusee" : "effectuee",
        actionId: `act-${lots.length}-${index}`,
        cibleType: refusee ? null : "comment",
        cibleId: refusee ? null : `cible-${a.justification}`,
        version: refusee ? null : 1,
        motif: refusee ? { regle: "RG-AST-08", cle: "assistant:erreurs.jalonObligatoire", message: "Une tâche de projet porte un jalon.", statut: 422 } : null,
        rejouee: false,
      };
    });
    return {
      corps: {
        resultats,
        effectuees: resultats.filter((x) => x.etat === "effectuee").length,
        refusees: resultats.filter((x) => x.etat === "refusee").length,
      },
    };
  };
}

describe("bibliothèque du guichet", () => {
  test("le découpage garde l'ordre, et ne dépasse ni 50 actions ni la taille d'un lot", () => {
    const actions = Array.from({ length: 120 }, (_, n) => action(n));
    const lots = decouperEnLots(actions);
    assert.deepEqual(
      lots.map((l) => l.length),
      [50, 50, 20],
    );
    assert.deepEqual(lots.flat(), actions);
    const lourdes = Array.from({ length: 6 }, (_, n) => ({ ...action(n % 10), justification: "x".repeat(400) }));
    const poids = Buffer.byteLength(JSON.stringify(lourdes[0])) + 1;
    assert.deepEqual(
      decouperEnLots(lourdes, 50, 2 * poids + 10).map((l) => l.length),
      [2, 2, 2],
    );
  });

  test("l'adresse du guichet se complète, et http n'est permis que vers le poste", () => {
    assert.equal(baseGuichet("https://localhost:8443"), "https://localhost:8443/api/agent/v1");
    assert.equal(baseGuichet("https://rationarium.example/api/"), "https://rationarium.example/api/agent/v1");
    assert.equal(baseGuichet("https://x.example/api/agent/v1/"), "https://x.example/api/agent/v1");
    assert.equal(baseGuichet("http://127.0.0.1:3000"), "http://127.0.0.1:3000/api/agent/v1");
    assert.throws(() => baseGuichet("http://rationarium.example"), { codeSortie: 2 });
    assert.throws(() => baseGuichet(undefined), { codeSortie: 2 });
  });

  test("les actions s'acceptent en tableau ou sous la clé actions", () => {
    assert.equal(normaliserActions([action(1)]).length, 1);
    assert.equal(normaliserActions({ actions: [action(1), action(2)] }).length, 2);
    assert.throws(() => normaliserActions({}), { codeSortie: 2 });
    assert.throws(() => normaliserActions([]), { codeSortie: 2 });
    assert.throws(() => normaliserActions([{ justification: "sans type" }]), { codeSortie: 2 });
  });

  test("le fichier de configuration et le masquage du jeton", () => {
    const v = lireFichierEnv("# commentaire\nRATIONARIUM_URL=https://localhost:8443\nexport RATIONARIUM_CA='/etc/ca.pem'\n\nnimporte quoi\n");
    assert.deepEqual(v, { RATIONARIUM_URL: "https://localhost:8443", RATIONARIUM_CA: "/etc/ca.pem" });
    assert.equal(masquer(`Bearer ${JETON} refusé`, JETON), "Bearer rat_… refusé");
  });
});

describe("rationarium-agent contre un faux guichet", () => {
  let guichet;
  let maison;
  let lots;
  let reponseEtat;
  let reponseSuivant;
  let reponsePrise;
  let reponseCreation;

  before(async () => {
    maison = dossierTemporaire();
    guichet = await demarrerFauxGuichet({
      "GET /etat": (r) => (r.autorisation === `Bearer ${JETON}` ? reponseEtat() : { statut: 401, corps: { cle: "erreurs:nonAuthentifie", message: "Non authentifié." } }),
      "GET /passages/suivant": () => reponseSuivant(),
      "POST /passages": () => reponseCreation(),
      "POST /passages/:id/prise": () => reponsePrise(),
      "POST /passages/:id/actions": (r) => lots.handler(r),
    });
  });
  after(async () => {
    await guichet.fermer();
    maison.nettoyer();
  });

  const lancer = (args, options = {}) =>
    executer(AGENT, args, {
      maison: maison.chemin,
      ...options,
      env: { RATIONARIUM_URL: guichet.url, RATIONARIUM_JETON: JETON, ...options.env },
    });

  test("le jeton se lit dans RATIONARIUM_JETON, part en Bearer, et ne s'affiche jamais", async () => {
    reponseEtat = () => ({ corps: etatGuichet() });
    const avant = guichet.requetes.length;
    const r = await lancer(["etat"]);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /Camille Durand/);
    assert.match(r.stdout, /Passage actif : aucun/);
    const requete = guichet.requetes[avant];
    assert.equal(requete.autorisation, `Bearer ${JETON}`);
    assert.ok(requete.prefixe, "le chemin porte le préfixe /api/agent/v1");
    assert.ok(!r.stdout.includes(JETON) && !r.stderr.includes(JETON));
  });

  test("le jeton se lit dans le trousseau quand la variable est absente", async () => {
    reponseEtat = () => ({ corps: etatGuichet() });
    const outils = join(maison.chemin, "outils-trousseau");
    mkdirSync(outils, { recursive: true });
    const faux = join(outils, "secret-tool");
    writeFileSync(faux, `#!/bin/sh\n[ "$*" = "lookup service rationarium-agent usage jeton" ] && printf '%s\\n' '${JETON}'\n`);
    chmodSync(faux, 0o755);
    const r = await lancer(["etat", "--json"], { env: { RATIONARIUM_JETON: "", PATH: `${outils}:${dirname(process.execPath)}:/usr/bin:/bin` } });
    assert.equal(r.code, 0, r.stderr);
    assert.equal(JSON.parse(r.stdout).proprietaire.nom, "Durand");
  });

  test("sans jeton ni trousseau, la commande sort en usage (code 2)", async () => {
    const vide = join(maison.chemin, "vide");
    mkdirSync(vide, { recursive: true });
    const r = await lancer(["etat"], { env: { RATIONARIUM_JETON: "", PATH: vide } });
    assert.equal(r.code, 2);
    assert.match(r.stderr, /RATIONARIUM_JETON/);
  });

  test("un 401 sort en refus HTTP (code 3), sans afficher le jeton que le guichet renverrait", async () => {
    reponseEtat = () => ({ statut: 401, corps: { cle: "erreurs:nonAuthentifie", message: `Jeton ${JETON} révoqué.` } });
    const r = await lancer(["etat"]);
    assert.equal(r.code, 3);
    assert.match(r.stderr, /refus HTTP 401/);
    assert.ok(!r.stderr.includes(JETON) && !r.stdout.includes(JETON));
    assert.match(r.stderr, /rat_…/);
  });

  test("un 409 à la prise sort en refus HTTP (code 3)", async () => {
    reponsePrise = () => ({ statut: 409, corps: { cle: "assistant:erreurs.passageDejaPris", message: "Ce passage a déjà été pris en charge." } });
    const r = await lancer(["prendre", PASSAGE]);
    assert.equal(r.code, 3);
    assert.match(r.stderr, /refus HTTP 409/);
    assert.match(r.stderr, /passageDejaPris/);
  });

  test("prendre sans identifiant prend le passage en attente", async () => {
    reponseSuivant = () => ({ corps: { passage: { id: PASSAGE, etat: "en_attente" } } });
    reponsePrise = () => ({ corps: { id: PASSAGE, etat: "prise", declenchement: "manuel", projectIds: [] } });
    const r = await lancer(["prendre"]);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, new RegExp(`^passage ${PASSAGE} pris`));
  });

  test("attendre rend « aucun » quand aucun passage n'arrive", async () => {
    reponseSuivant = () => ({ corps: { passage: null } });
    const avant = guichet.requetes.length;
    const r = await lancer(["attendre", "--secondes", "0"]);
    assert.equal(r.code, 0, r.stderr);
    assert.equal(r.stdout.trim(), "aucun");
    assert.equal(guichet.requetes[avant].requete.attendre, "0");
  });

  test("attendre rend « passage <id> » quand un passage arrive", async () => {
    reponseSuivant = () => ({ corps: { passage: { id: PASSAGE, etat: "en_attente" } } });
    const avant = guichet.requetes.length;
    const r = await lancer(["attendre"]);
    assert.equal(r.code, 0, r.stderr);
    assert.equal(r.stdout.trim(), `passage ${PASSAGE}`);
    assert.equal(guichet.requetes[avant].requete.attendre, "25");
  });

  test("agir découpe 120 actions en lots de 50, 50 et 20, dans l'ordre, et renumérote les résultats", async () => {
    const recus = [];
    lots = { handler: routeActions(recus) };
    const actions = Array.from({ length: 120 }, (_, n) => action(n));
    actions[73].justification = "refusee";
    const fichier = join(maison.chemin, "actions.json");
    const resultats = join(maison.chemin, "resultats.json");
    writeFileSync(fichier, JSON.stringify(actions));
    const r = await lancer(["agir", PASSAGE, fichier, "--sortie", resultats]);
    assert.equal(r.code, 0, r.stderr);
    assert.deepEqual(
      recus.map((l) => l.length),
      [50, 50, 20],
    );
    assert.deepEqual(recus.flat().map((a) => a.justification), actions.map((a) => a.justification));
    const bilan = JSON.parse(readFileSync(resultats, "utf8"));
    assert.equal(bilan.lots, 3);
    assert.equal(bilan.effectuees, 119);
    assert.equal(bilan.refusees, 1);
    assert.deepEqual(bilan.resultats.map((x) => x.index), [...Array(120).keys()]);
    assert.equal(bilan.resultats[73].etat, "refusee");
    assert.equal(bilan.resultats[73].lot, 2);
    assert.match(r.stdout, /120 actions envoyées en 3 lots : 119 effectuées, 1 refusée/);
    assert.match(r.stdout, /\[73\] commentaire_ajouter : refusée \(RG-AST-08\)/);
  });

  test("agir accepte { actions: [...] } sur l'entrée standard, et écrit les résultats en JSON", async () => {
    const recus = [];
    lots = { handler: routeActions(recus) };
    const r = await lancer(["agir", PASSAGE, "-"], { entree: JSON.stringify({ actions: [action(1), action(2)] }) });
    assert.equal(r.code, 0, r.stderr);
    assert.equal(recus.length, 1);
    const bilan = JSON.parse(r.stdout);
    assert.equal(bilan.effectuees, 2);
    assert.match(r.stderr, /2 actions envoyées en 1 lot/);
  });

  test("agir garde les résultats des lots exécutés quand un lot suivant est refusé", async () => {
    const recus = [];
    lots = { handler: routeActions(recus, { echecAuLot: 2 }) };
    const fichier = join(maison.chemin, "actions-2.json");
    const resultats = join(maison.chemin, "resultats-2.json");
    writeFileSync(fichier, JSON.stringify(Array.from({ length: 70 }, (_, n) => action(n))));
    const r = await lancer(["agir", PASSAGE, fichier, "--sortie", resultats]);
    assert.equal(r.code, 3);
    const partiel = JSON.parse(readFileSync(resultats, "utf8"));
    assert.equal(partiel.resultats.length, 50);
    assert.equal(partiel.interrompu.lot, 2);
    assert.match(r.stderr, /passageClos/);
  });

  test("un fichier d'actions illisible sort en usage (code 2), sans rien envoyer", async () => {
    const recus = [];
    lots = { handler: routeActions(recus) };
    const fichier = join(maison.chemin, "casse.json");
    writeFileSync(fichier, "{ pas du json");
    const r = await lancer(["agir", PASSAGE, fichier]);
    assert.equal(r.code, 2);
    assert.equal(recus.length, 0);
  });

  test("lancer tolère un passage déjà actif sur demande", async () => {
    reponseCreation = () => ({
      statut: 409,
      corps: { cle: "assistant:erreurs.passageActif", message: "Un passage de l'agent est déjà en cours ou en attente.", regle: "RG-AST-15", passageId: PASSAGE },
    });
    const strict = await lancer(["lancer"]);
    assert.equal(strict.code, 3);
    assert.match(strict.stderr, /RG-AST-15/);
    const tolerant = await lancer(["lancer", "--tolerer-actif"]);
    assert.equal(tolerant.code, 0, tolerant.stderr);
    assert.match(tolerant.stdout, new RegExp(`déjà actif : ${PASSAGE}`));
  });

  test("le fichier agent.env fournit l'adresse quand l'environnement ne la donne pas", async () => {
    reponseEtat = () => ({ corps: etatGuichet() });
    mkdirSync(join(maison.chemin, ".config", "rationarium-agent"), { recursive: true });
    writeFileSync(join(maison.chemin, ".config", "rationarium-agent", "agent.env"), `RATIONARIUM_URL=${guichet.url}\n`);
    try {
      const r = await lancer(["etat"], { env: { RATIONARIUM_URL: "" } });
      assert.equal(r.code, 0, r.stderr);
    } finally {
      writeFileSync(join(maison.chemin, ".config", "rationarium-agent", "agent.env"), "");
    }
  });

  test("les erreurs d'usage sortent en code 2", async () => {
    assert.equal((await lancer(["inconnue"])).code, 2);
    assert.equal((await lancer(["temps", PASSAGE, "--du", "hier"])).code, 2);
    assert.equal((await lancer(["fin", PASSAGE, "--etat", "abandon"])).code, 2);
    assert.equal((await lancer(["etat", "--option-inconnue"])).code, 2);
    assert.equal((await lancer(["etat"], { env: { RATIONARIUM_URL: "http://rationarium.example" } })).code, 2);
    const tls = await lancer(["etat"], { env: { NODE_TLS_REJECT_UNAUTHORIZED: "0" } });
    assert.equal(tls.code, 2);
    assert.match(tls.stderr, /RATIONARIUM_CA/);
  });
});

test("un guichet injoignable sort en erreur réseau (code 4)", async () => {
  const maison = dossierTemporaire();
  const ferme = await demarrerFauxGuichet({});
  await ferme.fermer();
  try {
    const r = await executer(AGENT, ["etat"], { maison: maison.chemin, env: { RATIONARIUM_URL: ferme.url, RATIONARIUM_JETON: JETON } });
    assert.equal(r.code, 4);
    assert.match(r.stderr, /injoignable/);
    assert.ok(!r.stderr.includes(JETON));
  } finally {
    maison.nettoyer();
  }
});
