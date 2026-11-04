import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import { JETON, PASSAGE, RELAIS, demarrerFauxGuichet, dossierTemporaire, executer } from "./faux-guichet.mjs";

const PROPRIETAIRE = { id: "0a6d9b8e-5f4c-4d3b-8a2e-7c1f0e9d8b7a", prenom: "Camille", nom: "Durand" };

/** Un guichet qui tient l'état d'un passage : en attente, pris, puis clos. */
async function guichetAvecPassage({ passageEnAttente = true } = {}) {
  const suivi = { etat: passageEnAttente ? "en_attente" : null, servi: false, fins: [], prises: 0 };
  const guichet = await demarrerFauxGuichet({
    "GET /etat": () => ({
      corps: {
        proprietaire: PROPRIETAIRE,
        mode: "relais",
        jalonObligatoire: true,
        typesAutorises: [],
        passageActif: suivi.etat ? { id: PASSAGE, etat: suivi.etat } : null,
      },
    }),
    "GET /passages/suivant": () => {
      if (suivi.etat !== "en_attente" || suivi.servi) return { corps: { passage: null } };
      suivi.servi = true;
      return { corps: { passage: { id: PASSAGE, etat: "en_attente", declenchement: "manuel", projectIds: [] } } };
    },
    "POST /passages/:id/prise": () => {
      if (suivi.etat !== "en_attente") return { statut: 409, corps: { cle: "assistant:erreurs.passageDejaPris", message: "Déjà pris." } };
      suivi.etat = "prise";
      suivi.prises += 1;
      return { corps: { id: PASSAGE, etat: "prise", declenchement: "manuel", projectIds: [] } };
    },
    "POST /passages/:id/fin": (r) => {
      if (suivi.etat !== "prise" && suivi.etat !== "en_cours") return { statut: 409, corps: { cle: "assistant:erreurs.passageClos", message: "Clos." } };
      suivi.fins.push(r.corps);
      suivi.etat = null;
      return { corps: { id: PASSAGE, etat: r.corps.etat } };
    },
  });
  return { guichet, suivi };
}

describe("rationarium-relais contre un faux guichet", () => {
  let maison;
  let travail;
  let consigne;

  beforeEach(() => {
    maison = dossierTemporaire();
    travail = join(maison.chemin, "passages");
    consigne = join(maison.chemin, "consigne-modele.md");
    writeFileSync(consigne, "Traite le passage {{PASSAGE}} dans {{DOSSIER}}.\n");
  });
  afterEach(() => maison.nettoyer());

  const relais = (url, commande, args = ["--une-fois", "--secondes", "1"]) =>
    executer(RELAIS, args, {
      maison: maison.chemin,
      env: {
        RATIONARIUM_URL: url,
        RATIONARIUM_JETON: JETON,
        RATIONARIUM_COMMANDE: commande,
        RATIONARIUM_CONSIGNE: consigne,
        RATIONARIUM_TRAVAIL: travail,
      },
    });

  test("un passage lance la commande dans son dossier, et le garde-fou clôt en échec le passage laissé en attente", async () => {
    const { guichet, suivi } = await guichetAvecPassage();
    try {
      const commande = [
        'printf "%s" "$RATIONARIUM_PASSAGE" > vu.txt',
        'echo "ligne de la commande, jeton $RATIONARIUM_JETON"',
        "exit 3",
      ].join("; ");
      const r = await relais(guichet.url, commande);
      assert.equal(r.code, 0, r.stdout + r.stderr);
      const [dossier] = readdirSync(travail);
      assert.ok(dossier.endsWith(PASSAGE));
      assert.equal(readFileSync(join(travail, dossier, "vu.txt"), "utf8"), PASSAGE);
      assert.equal(
        readFileSync(join(travail, dossier, "consigne.md"), "utf8"),
        `Traite le passage ${PASSAGE} dans ${join(travail, dossier)}.\n`,
      );
      assert.match(r.stdout, /│ ligne de la commande, jeton rat_…/);
      assert.ok(!r.stdout.includes(JETON), "le relais ne relaie jamais le jeton");
      assert.ok(!readFileSync(join(travail, dossier, "execution.log"), "utf8").includes(JETON));
      assert.equal(suivi.prises, 1);
      assert.equal(suivi.fins.length, 1);
      assert.equal(suivi.fins[0].etat, "echec");
      assert.match(suivi.fins[0].erreur, /code 3\) sans prendre le passage/);
    } finally {
      await guichet.fermer();
    }
  });

  test("une commande qui prend et clôt son passage avec rationarium-agent n'est pas reprise par le garde-fou", async () => {
    const { guichet, suivi } = await guichetAvecPassage();
    try {
      const commande =
        'rationarium-agent prendre "$RATIONARIUM_PASSAGE" && rationarium-agent fin "$RATIONARIUM_PASSAGE" --etat terminee';
      const r = await relais(guichet.url, commande);
      assert.equal(r.code, 0, r.stdout + r.stderr);
      assert.match(r.stdout, new RegExp(`│ passage ${PASSAGE} pris`));
      assert.match(r.stdout, /clos par l'exécution/);
      assert.deepEqual(
        suivi.fins.map((f) => f.etat),
        ["terminee"],
      );
    } finally {
      await guichet.fermer();
    }
  });

  test("sans passage, --une-fois s'arrête sans rien lancer", async () => {
    const { guichet, suivi } = await guichetAvecPassage({ passageEnAttente: false });
    try {
      const r = await relais(guichet.url, "touch lance.txt");
      assert.equal(r.code, 0, r.stdout + r.stderr);
      assert.match(r.stdout, /aucun passage en attente/);
      assert.ok(!existsSync(travail));
      assert.equal(suivi.fins.length, 0);
    } finally {
      await guichet.fermer();
    }
  });

  test("un jeton refusé au démarrage arrête le relais en refus HTTP (code 3)", async () => {
    const guichet = await demarrerFauxGuichet({
      "GET /etat": () => ({ statut: 401, corps: { cle: "erreurs:nonAuthentifie", message: "Non authentifié." } }),
    });
    try {
      const r = await relais(guichet.url, "touch lance.txt", []);
      assert.equal(r.code, 3);
      assert.match(r.stdout, /refus HTTP 401/);
    } finally {
      await guichet.fermer();
    }
  });
});
