import { describe, it, expect, afterEach, vi } from "vitest";

/**
 * `EX-AUTH-02`, `EX-AUTH-03`, `RG-GEN-02`, `RG-GEN-03` — **une session expirée
 * ne laisse pas la vue à l'écran.**
 *
 * Le parcours P-12 a supprimé la session au serveur puis fait un geste réel
 * sur la vue 07 : `GET /api/planning` a rendu `401`, et la vue est restée
 * affichée — coquille, barre latérale, compteur de notifications et données
 * périmées compris. Rien n'écoutait le `401` hors de la requête de session, et
 * celle-ci est en cache une minute : la coquille continuait de croire à une
 * session qui n'existait plus.
 *
 * Le contrôle est écrit sur le client HTTP parce que c'est le seul endroit qui
 * voit **toutes** les requêtes. Le vérifier vue par vue reviendrait à faire
 * dépendre la règle de la vigilance de chaque appel — ce qui n'est pas une
 * règle.
 */

/** Un faux `window` : emplacement, stockage de session, et le départ observé. */
function fenetre(chemin: string) {
  const stockage = new Map<string, string>();
  const parti: string[] = [];
  vi.stubGlobal("window", {
    location: {
      pathname: chemin,
      search: "",
      assign: (url: string) => parti.push(url),
    },
    sessionStorage: {
      getItem: (c: string) => stockage.get(c) ?? null,
      setItem: (c: string, v: string) => void stockage.set(c, v),
      removeItem: (c: string) => void stockage.delete(c),
    },
  });
  return { parti, stockage };
}

const repondre = (statut: number) =>
  vi.stubGlobal("fetch", () =>
    Promise.resolve(
      new Response(JSON.stringify({ cle: "auth:erreurs.sessionRequise", message: "Session requise" }), {
        status: statut,
        headers: { "content-type": "application/json" },
      }),
    ),
  );

/** Le module est réimporté à chaque cas : sa garde « une seule sortie » est persistante. */
const clientNeuf = async () => {
  vi.resetModules();
  return import("./client.js");
};

afterEach(() => vi.unstubAllGlobals());

describe("EX-AUTH-02 — un 401 sur une vue ramène à la connexion", () => {
  it("le planning refusé renvoie à la vue 01, en gardant la destination", async () => {
    const { parti, stockage } = fenetre("/planning");
    repondre(401);
    const { appeler, CLE_SESSION_EXPIREE } = await clientNeuf();

    await appeler("/planning?debut=2026-09-07").catch(() => undefined);

    expect(parti).toHaveLength(1);
    expect(parti[0]).toBe(`/connexion?suite=${encodeURIComponent("/planning")}`);
    // RG-GEN-03 : la page d'arrivée doit pouvoir DIRE pourquoi on y est.
    expect(stockage.get(CLE_SESSION_EXPIREE)).toBe("1");
  });

  it("dix requêtes refusées ne produisent qu'une seule sortie", async () => {
    const { parti } = fenetre("/planning");
    repondre(401);
    const { appeler } = await clientNeuf();

    await Promise.all(
      Array.from({ length: 10 }, () => appeler("/notifications").catch(() => undefined)),
    );

    expect(parti).toHaveLength(1);
  });

  it("l'erreur est levée quand même — l'appelant a le droit de le savoir", async () => {
    fenetre("/planning");
    repondre(401);
    const { appeler, ErreurApi } = await clientNeuf();

    const echec = await appeler("/planning").catch((e: unknown) => e);
    expect(echec).toBeInstanceOf(ErreurApi);
    expect((echec as InstanceType<typeof ErreurApi>).statut).toBe(401);
  });
});

describe("les refus d'AVANT la session ne déclenchent aucune sortie", () => {
  it("« personne n'est connecté » n'est pas une expiration", async () => {
    const { parti } = fenetre("/planning");
    repondre(401);
    const { appeler } = await clientNeuf();

    await appeler("/auth/me").catch(() => undefined);

    expect(parti).toEqual([]);
  });

  it("des identifiants refusés ne renvoient pas la page de connexion sur elle-même", async () => {
    const { parti } = fenetre("/connexion");
    repondre(401);
    const { appeler } = await clientNeuf();

    await appeler("/auth/login", { methode: "POST", corps: {} }).catch(() => undefined);

    expect(parti).toEqual([]);
  });

  it("déjà sur la vue 01, on n'en repart pas", async () => {
    const { parti } = fenetre("/connexion");
    repondre(401);
    const { appeler } = await clientNeuf();

    await appeler("/notifications").catch(() => undefined);

    expect(parti).toEqual([]);
  });
});

describe("un refus qui n'est pas un 401 ne fait rien", () => {
  it("un 403 reste un refus de droits, pas une expiration", async () => {
    const { parti } = fenetre("/projets");
    repondre(403);
    const { appeler } = await clientNeuf();

    await appeler("/projets/abc").catch(() => undefined);

    expect(parti).toEqual([]);
  });
});
