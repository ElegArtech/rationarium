import { describe, it, expect, beforeAll } from "vitest";
import i18next, { type TFunction } from "i18next";
import ICU from "i18next-icu";
import {
  decouperLien,
  lectureALOuverture,
  parametresCorps,
  rendreNotification,
  type Traduire,
} from "./Notifications.js";
import coquilleFr from "../locales/fr/coquille.json" with { type: "json" };
import coquilleEn from "../locales/en/coquille.json" with { type: "json" };

/* Lue par Vite plutôt que par `node:fs` : le paquet web ne type pas Node. */
const source = import.meta.glob("./Notifications.tsx", {
  query: "?raw",
  import: "default",
  eager: true,
})["./Notifications.tsx"] as string;

/**
 * `EX-NTF-02` — « consulter une notification la marque comme lue ».
 *
 * Le parcours P-18 a relevé un compteur à trois avant l'ouverture d'une
 * notification et à trois après : seule la pastille « ● » marquait. Le lien
 * menait bien à l'objet, ce qui rendait le défaut discret — l'utilisateur
 * obtenait ce qu'il demandait, et la cloche gardait un compte faux.
 *
 * Deux moitiés à tenir, et c'est le RACCORD qui manquait : la règle, et son
 * branchement. Une règle exportée que personne n'appelle est la famille de
 * défauts la plus coûteuse du dépôt — `peuplerMaquette` y a vécu plusieurs
 * lots. Le second contrôle lit donc la source du panneau pour vérifier que le
 * lien l'appelle vraiment.
 */
describe("EX-NTF-02 — ouvrir une notification la marque lue", () => {
  it("une notification non lue est à marquer", () => {
    expect(lectureALOuverture({ id: "n1", lue: false })).toBe("n1");
  });

  it("une notification déjà lue n'est pas réécrite", () => {
    expect(lectureALOuverture({ id: "n1", lue: true })).toBeNull();
  });

  it("le lien du panneau appelle la règle — sinon elle ne sert à rien", () => {
    // Le lien de titre porte un gestionnaire d'activation…
    expect(source).toMatch(/className="pop-title"[^>]*onClick=\{\(\) => ouvrir\(n\)\}/);
    // …et ce gestionnaire passe bien par la règle.
    expect(source).toMatch(/const ouvrir[\s\S]{0,200}lectureALOuverture\(n\)/);
    expect(source).toMatch(/lecture\.mutate\(aMarquer\)/);
  });
});

/**
 * `EX-NTF-03`, `RG-NTF-01` — **la notification mène à l'objet, fragment
 * compris.**
 *
 * `P-74` restait rouge : le lien du serveur est `/conges#aValider`, et
 * `<Link to="/conges#aValider">` fabrique un `pathname` de `"/conges#aValider"`
 * — TanStack Router ne découpe pas le `#` d'un `to`, `to` et `hash` sont deux
 * options distinctes. Mesuré sur le routeur réel :
 *
 *   buildLocation({ to: "/conges#aValider" })          → pathname "/conges#aValider", hash ""
 *   buildLocation({ to: "/conges", hash: "aValider" }) → pathname "/conges",          hash "aValider"
 *
 * Le serveur pointait le bon onglet, la vue 19 savait le lire : c'est le
 * RACCORD qui cassait. Et il cassait en silence — un lien qui ne mène nulle
 * part n'est ni une erreur de typage, ni une violation d'accessibilité.
 */
describe("EX-NTF-03 — le lien d'une notification se découpe pour le routeur", () => {
  it("les deux fragments écrits par le serveur passent en `hash`, pas en `to`", () => {
    // Les seuls que le serveur écrit — `conges.service.ts`, vue 19.
    expect(decouperLien("/conges#aValider")).toEqual({ to: "/conges", hash: "aValider" });
    expect(decouperLien("/conges#mesDemandes")).toEqual({ to: "/conges", hash: "mesDemandes" });
  });

  it("le fragment voyage SANS son croisillon — c'est ainsi que la vue 19 le lit", () => {
    expect(decouperLien("/conges#aValider").hash).not.toContain("#");
  });

  it("un lien sans fragment traverse intact, et ne fabrique pas de `hash` vide", () => {
    expect(decouperLien("/taches/t1")).toEqual({ to: "/taches/t1" });
    expect(decouperLien("/projets/p1")).toEqual({ to: "/projets/p1" });
    // Un « # » terminal ne pose pas un fragment vide : l'adresse porterait un
    // croisillon nu.
    expect(decouperLien("/conges#")).toEqual({ to: "/conges" });
  });

  it("aucun `to` ne garde de croisillon — c'est exactement le défaut", () => {
    for (const lien of ["/conges#aValider", "/conges#mesDemandes", "/taches/t1", "/conges#"]) {
      expect(decouperLien(lien).to, lien).not.toContain("#");
    }
  });

  it("le panneau APPELLE le découpage — une règle que personne n'appelle ne sert à rien", () => {
    expect(source).toMatch(/<Link[\s\S]{0,120}\{\.\.\.decouperLien\(n\.lien\)\}/);
    // Et plus jamais le lien brut en `to` : c'est la forme du défaut.
    expect(source).not.toMatch(/to=\{n\.lien\}/);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * `RG-GEN-08`, `EX-NTF-01`, `RG-NTF-01` — **la notification se lit dans la
 * langue de la SESSION, jamais dans celle du compte.**
 *
 * Défaut relevé en seconde passe de recette (P-18, P-19, P-20, P-166), et
 * c'est un EFFET de la correction précédente : le serveur avait cessé d'écrire
 * la phrase à l'émission — juste — mais il la rend dans la langue de
 * `users.langue`. Sous interface anglaise, le cadre disait « Notifications /
 * Mark all as read » et les entrées « Décision sur votre demande de congé ».
 * Les six équivalents anglais existaient dans `libelles.ts`, jamais atteints.
 *
 * Le contrôle monte le **vrai** catalogue et le **vrai** moteur ICU : un
 * pluriel faux, un placeholder manquant ou une variante mal formée échouent
 * ici, pas au navigateur. Et il lit la source du panneau, parce qu'une règle
 * exportée que personne n'appelle est la famille de défauts la plus coûteuse
 * du dépôt.
 * ════════════════════════════════════════════════════════════════════════════
 */
describe("RG-GEN-08 — le panneau compose ses phrases dans la langue de la session", () => {
  const instance = i18next.createInstance();
  /* Le même adaptateur d'une ligne que le panneau : le contrôle exerce donc la
     règle exactement comme la vue l'appelle. */
  let t: Traduire;
  let tEn: Traduire;
  const lier = (brut: TFunction): Traduire => (cle, params) =>
    params === undefined ? brut(cle) : brut(cle, params);

  beforeAll(async () => {
    await instance.use(ICU).init({
      lng: "fr",
      fallbackLng: "fr",
      ns: ["coquille"],
      defaultNS: "coquille",
      resources: { fr: { coquille: coquilleFr }, en: { coquille: coquilleEn } },
      interpolation: { escapeValue: false },
    });
    t = lier(instance.getFixedT("fr", "coquille"));
    tEn = lier(instance.getFixedT("en", "coquille"));
  });

  /** Ce que le serveur rend : `titre`/`contenu` en français, plus `cle`/`params`. */
  const entree = (
    type: string,
    cle: string | null,
    params: Record<string, string>,
    repli = { titre: "titre du serveur", contenu: "phrase du serveur" },
  ) => ({ type, cle, params, ...repli });

  /**
   * Les six types de `cadrage/01 § M18` avec les paramètres que les émetteurs
   * envoient RÉELLEMENT — `taches.service.ts`, `conges.service.ts`,
   * `projets.service.ts` et le travail quotidien de `notifications.service.ts`.
   * Un jeu d'essai se calque sur la signature du service, jamais sur ce que le
   * client croit recevoir.
   */
  const EMIS: Record<string, Record<string, string>> = {
    tache_assignee: { tache: "Rédiger la note" },
    conge_a_valider: { jours: "3" },
    conge_decide: { decision: "approuve" },
    tache_echeance_proche: { tache: "Rédiger la note", date: "2026-09-01" },
    tache_en_retard: { tache: "Rédiger la note", date: "2026-09-01" },
    ajout_projet: { projet: "Refonte du portail" },
  };

  it("le contrôle a quelque chose à mesurer — les SIX types de M18", () => {
    // Un contrôle qui n'a rien à mesurer doit échouer, jamais réussir en
    // silence : le dépôt a payé quatre fois cette leçon.
    expect(Object.keys(EMIS)).toHaveLength(6);
  });

  for (const [type, params] of Object.entries(EMIS)) {
    it(`${type} — titre ET corps changent de langue`, () => {
      const fr = rendreNotification(entree(type, type, params), t);
      const en = rendreNotification(entree(type, type, params), tEn);

      // Le repli du serveur ne doit JAMAIS s'afficher : c'est exactement le
      // défaut — la phrase du compte rendue dans une interface d'une autre
      // langue.
      expect(fr.titre, `${type} fr`).not.toBe("titre du serveur");
      expect(fr.contenu, `${type} fr`).not.toBe("phrase du serveur");
      expect(en.titre, `${type} en`).not.toBe("titre du serveur");
      expect(en.contenu, `${type} en`).not.toBe("phrase du serveur");

      // Deux langues, deux phrases.
      expect(en.titre, `${type} titre`).not.toBe(fr.titre);
      expect(en.contenu, `${type} corps`).not.toBe(fr.contenu);

      // Et jamais une clé technique ni un reste d'ICU à l'écran.
      for (const texte of [fr.titre, fr.contenu, en.titre, en.contenu]) {
        expect(texte, type).not.toContain("notifications.");
        expect(texte, type).not.toContain("{");
      }
    });
  }

  it("les six intitulés anglais de M18 sont ceux du serveur, mot pour mot", () => {
    // `libelles.ts` les porte depuis la vague 1 sans que rien ne les atteigne.
    const attendus: Record<string, string> = {
      tache_assignee: "New task assigned",
      conge_a_valider: "Leave request to approve",
      conge_decide: "Decision on your leave request",
      tache_echeance_proche: "Task due soon",
      tache_en_retard: "Overdue task",
      ajout_projet: "Added to a project",
    };
    for (const [type, libelle] of Object.entries(attendus)) {
      expect(rendreNotification(entree(type, type, EMIS[type] ?? {}), tEn).titre, type).toBe(
        libelle,
      );
    }
  });

  it("la décision de congé porte ses TROIS faces", () => {
    const face = (params: Record<string, string>, tr: Traduire) =>
      rendreNotification(entree("conge_decide", "conge_decide", params), tr).contenu;

    expect(face({ decision: "approuve" }, t)).toContain("approuvée");
    expect(face({ decision: "approuve" }, tEn)).toContain("approved");
    expect(face({ decision: "refuse" }, t)).toBe("Votre demande de congé a été refusée.");
    // Le motif est une CITATION : il reste dans la langue où son auteur l'a
    // écrit, seule la phrase qui l'entoure se rend.
    expect(face({ decision: "refuse", motif: "Effectif insuffisant" }, tEn)).toBe(
      "Your leave request was declined. Reason: Effectif insuffisant",
    );
  });

  it("le pluriel de ZÉRO diffère entre les deux langues", () => {
    const rendu = (jours: string, tr: Traduire) =>
      rendreNotification(entree("conge_a_valider", "conge_a_valider", { jours }), tr).contenu;
    expect(rendu("1", t)).toContain("1 jour ");
    expect(rendu("1", tEn)).toContain("1 day ");
    // « 0 utilisateur » et « 0 users » : une règle ICU recopiée d'un catalogue
    // à l'autre est fausse dans l'un des deux.
    expect(rendu("0", t)).toContain("0 jour ");
    expect(rendu("0", tEn)).toContain("0 days");
  });

  it("UN DÉCOMPTE ABSENT NE FAIT PAS TOMBER LE PANNEAU", () => {
    // `intl-messageformat` LÈVE sur un placeholder manquant : une entrée
    // malformée viderait la cloche entière. `Number("")` valant zéro, le
    // filtre porte sur la chaîne — pièges déjà consignés tous les deux.
    expect(parametresCorps({})).toMatchObject({ jours: 0, tache: "", projet: "", motif: "", date: "" });
    expect(parametresCorps({ jours: "" })["jours"]).toBe(0);
    expect(parametresCorps({ jours: "4" })["jours"]).toBe(4);
    expect(() =>
      rendreNotification(entree("conge_a_valider", "conge_a_valider", {}), t),
    ).not.toThrow();
  });

  it("un type ou une clé INCONNUS retombent sur la phrase du serveur", () => {
    // i18next rend la CLÉ quand elle manque : sans ce repli, l'écran
    // afficherait « notifications.corps_… ».
    const rendu = rendreNotification(entree("type_invente", "cle_inventee", {}), t);
    expect(rendu.titre).toBe("titre du serveur");
    expect(rendu.contenu).toBe("phrase du serveur");
  });

  it("un corps sans clé — phrase déjà rédigée — traverse tel quel", () => {
    const rendu = rendreNotification(entree("tache_assignee", null, {}), t);
    expect(rendu.contenu).toBe("phrase du serveur");
    // Le titre, lui, se déduit toujours du type.
    expect(rendu.titre).toBe("Nouvelle tâche assignée");
  });

  it("LE PANNEAU APPELLE LA COMPOSITION — sinon elle ne sert à rien", () => {
    // Le raccord, et rien d'autre : `rendreNotification` exportée et jamais
    // branchée laisserait le défaut intact, tests verts compris.
    expect(source).toMatch(/const vu = rendreNotification\(n, traduire\)/);
    expect(source).toMatch(/className="pop-title"[\s\S]{0,200}\{vu\.titre\}/);
    expect(source).toMatch(/<span className="pop-meta">\{vu\.contenu\}<\/span>/);
    // Et plus jamais le rendu du serveur affiché tel quel : c'est la forme du
    // défaut.
    expect(source).not.toMatch(/>\{n\.titre\}</);
    expect(source).not.toMatch(/>\{n\.contenu\}</);
  });
});
