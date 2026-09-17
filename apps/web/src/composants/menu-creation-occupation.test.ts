import { describe, expect, it } from "vitest";

const sources = import.meta.glob(
  [
    "./menu-creation-occupation.tsx",
    "../vues/planning/Planning.tsx",
    "../vues/tableau/TableauDeBord.tsx",
  ],
  { query: "?raw", import: "default", eager: true },
) as Record<string, string>;

const lire = (fin: string) =>
  Object.entries(sources).find(([chemin]) => chemin.endsWith(fin))?.[1] ?? "";

const menu = lire("menu-creation-occupation.tsx");
const planning = lire("Planning.tsx");
const tableau = lire("TableauDeBord.tsx");

describe("la création d'une occupation reste identique du planning au tableau de bord", () => {
  it("les deux vues rendent la même commande partagée", () => {
    expect(menu.length).toBeGreaterThan(1_000);
    expect(planning).toContain("<MenuCreationOccupation />");
    expect(tableau).toContain("<MenuCreationOccupation />");
  });

  it("la tâche respecte ses deux droits et l'événement le sien", () => {
    expect(menu).toContain('peut("tasks:create") || peut("tasks:create_standalone")');
    expect(menu).toContain('peut("events:create")');
    expect(menu).toContain('to: "/taches", search: { creer: 1 }');
    expect(menu).toContain('to: "/evenements"');
  });

  it("le tableau de bord aligne la commande sur le bonjour", () => {
    expect(tableau).toMatch(
      /className="ligne-actions"[\s\S]*?t\("bonjour"[\s\S]*?<MenuCreationOccupation \/>/,
    );
  });
});
