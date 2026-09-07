import { describe, it, expect } from "vitest";
import { decouperLien, lectureALOuverture } from "./Notifications.js";

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
