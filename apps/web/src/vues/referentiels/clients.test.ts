import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Vue 23 — « Détacher » détache.
 *
 * Le défaut constaté (P-142) : le bouton « Détacher » d'un projet du
 * portefeuille d'un client appelait `definirClientsDuProjet` avec la liste des
 * bénéficiaires privée du client courant. Ce point d'entrée n'AJOUTE que —
 * `POST /clients/projets/:id` rattache les identifiants qu'on lui donne et ne
 * retire jamais ceux qu'on omet. Le geste rendait donc `201`, le projet restait
 * rattaché, **aucun message d'erreur n'apparaissait**, et le journal d'audit
 * enregistrait `client.attach_project` : la trace disait le contraire du geste.
 *
 * `detacherClientDuProjet` — `DELETE /clients/projets/:projet/:client` —
 * existait déjà et n'était appelée par personne.
 *
 * `EX-PRJ-10`, `RG-PRJ-12`.
 */
vi.mock("../../api/referentiels.js", () => ({
  detacherClientDuProjet: vi.fn(() => Promise.resolve()),
  definirClientsDuProjet: vi.fn(() => Promise.resolve({ rattaches: 0, dejaRattaches: 0 })),
}));

const api = await import("../../api/referentiels.js");
const { detacherProjetDuClient } = await import("./Clients.js");

describe("RG-PRJ-12 — détacher un projet du portefeuille d'un client", () => {
  beforeEach(() => {
    vi.mocked(api.detacherClientDuProjet).mockClear();
    vi.mocked(api.definirClientsDuProjet).mockClear();
  });

  it("EX-PRJ-10 — le détachement appelle la route de détachement", async () => {
    await detacherProjetDuClient("projet-1", "client-1");
    expect(api.detacherClientDuProjet).toHaveBeenCalledWith("projet-1", "client-1");
  });

  it("RG-PRJ-12 — il n'emprunte JAMAIS la route qui rattache", async () => {
    /*
     * C'est l'assertion qui porte le défaut : `definirClientsDuProjet` réussit
     * sur une liste raccourcie sans rien détacher. Un contrôle qui se
     * contenterait de vérifier « la mutation ne lève pas » serait vert avec et
     * sans le correctif.
     */
    await detacherProjetDuClient("projet-1", "client-1");
    expect(api.definirClientsDuProjet).not.toHaveBeenCalled();
  });
});
