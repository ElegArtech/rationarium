#!/usr/bin/env node
/**
 * Jeu de données minimal pour éprouver les états des vues 22 à 29.
 *
 * **Le jeu de volumétrie n'atteint pas six états centraux de ces vues.** Il ne
 * contient ni tiers ni client — les vues 24 et 26 n'avaient donc aucune route
 * déclarée dans `design/routes.json`. Il ne produit non plus **aucun écart de
 * couverture** (toutes les compétences y sont détenues par douze personnes
 * pour un effectif requis de un), si bien que le bandeau « Compétences à
 * renforcer », les classes `is-gap` et `is-part` et l'alerte de la vue 22
 * n'étaient jamais rendus. Enfin aucune direction n'y est vide et aucun
 * département n'y est sans service, donc les états vides de l'arborescence de
 * la vue 29 ne l'étaient pas davantage.
 *
 * Ce programme crée le strict nécessaire, **et il est idempotent** : le
 * relancer ne duplique rien.
 *
 * ATTENTION — les identifiants créés sont aléatoires. Les routes 24 et 26 de
 * `design/routes.json` pointent sur ceux de l'instance courante : sur une base
 * remise à neuf, il faut relancer ce programme **et** reporter les
 * identifiants qu'il affiche.
 *
 *   node scripts/donnees-vues-22-29.mjs
 */

const BASE = process.env["TRAME_API"] ?? "http://localhost:3000";
const IDENTIFIANT = process.env["TRAME_LOGIN"] ?? "admin";
const MOT_DE_PASSE = process.env["TRAME_MOTDEPASSE"] ?? "TrameLocal!2026";

const connexion = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ identifiant: IDENTIFIANT, motDePasse: MOT_DE_PASSE }),
});
if (connexion.status !== 200) throw new Error(`connexion refusée : ${connexion.status}`);
const cookie = connexion.headers
  .getSetCookie()
  .map((c) => c.split(";")[0])
  .join("; ");

async function appel(methode, chemin, corps) {
  const res = await fetch(`${BASE}${chemin}`, {
    method: methode,
    headers: { cookie, ...(corps ? { "content-type": "application/json" } : {}) },
    ...(corps ? { body: JSON.stringify(corps) } : {}),
  });
  const texte = await res.text();
  return { statut: res.status, corps: texte ? JSON.parse(texte) : null };
}

const trace = (quoi, r) => console.log(quoi.padEnd(26), r.statut);

// ── Vue 22 — une compétence à couverture partielle ──────────────────────────

const competences = await appel("GET", "/api/competences?recherche=Cartographie");
let sig = competences.corps.find((c) => c.nom === "Cartographie SIG");
if (!sig) {
  const cree = await appel("POST", "/api/competences", {
    nom: "Cartographie SIG",
    categorie: "business",
    description: "Production et mise à jour des couches cartographiques",
    effectifRequis: 4,
  });
  trace("compétence à écart", cree);
  sig = cree.corps;
}
const agents = await appel("GET", "/api/utilisateurs?limite=2");
const premier = agents.corps[0];
trace(
  "niveau détenu",
  await appel("PUT", `/api/competences/agents/${premier.id}/${sig.id}`, { niveau: "expert" }),
);

// ── Vues 23 et 24 — un tiers de chaque type ─────────────────────────────────

const tiers = await appel("GET", "/api/tiers");
if (!tiers.corps.some((t) => t.organisation === "Atelier Numérique SARL")) {
  trace(
    "tiers personne morale",
    await appel("POST", "/api/tiers", {
      type: "organisation",
      organisation: "Atelier Numérique SARL",
      contactEmail: "contact@atelier-numerique.fr",
      contactTelephone: "01 02 03 04 05",
      notes: "Prestataire de conception d'interfaces",
    }),
  );
}
if (!tiers.corps.some((t) => t.contactNom === "Marc Delaunay")) {
  trace(
    "tiers personne physique",
    await appel("POST", "/api/tiers", {
      type: "individual",
      contactNom: "Marc Delaunay",
      contactEmail: "m.delaunay@consultant.fr",
      notes: "Consultant accessibilité",
    }),
  );
}

// ── Vues 25 et 26 — un client ───────────────────────────────────────────────

const clients = await appel("GET", "/api/clients");
if (!clients.corps.some((c) => c.nom === "Communauté d'agglomération Val-de-Seine")) {
  trace(
    "client",
    await appel("POST", "/api/clients", {
      nom: "Communauté d'agglomération Val-de-Seine",
      contactNom: "Sophie Marchand",
      contactEmail: "numerique@valdeseine.fr",
      contactTelephone: "01 44 55 66 77",
      adresse: "12 place de la République, 92000 Val-de-Seine",
    }),
  );
}

// ── Rattachements : sans eux, les fiches 24 et 26 sont vides ────────────────

const t2 = await appel("GET", "/api/tiers");
const c2 = await appel("GET", "/api/clients");
const moral = t2.corps.find((x) => x.organisation === "Atelier Numérique SARL");
const cli = c2.corps.find((c) => c.nom === "Communauté d'agglomération Val-de-Seine");

const projets = await appel("GET", "/api/projets?limite=1");
const projet = projets.corps.projets[0];

if (moral && projet) {
  trace(
    "tiers → projet",
    await appel("POST", `/api/tiers/projets/${projet.id}/rattacher`, { thirdPartyId: moral.id }),
  );
  const taches = await appel("GET", `/api/taches?projectId=${projet.id}&limite=1`);
  const tache = (taches.corps.taches ?? taches.corps)[0];
  if (tache) {
    trace(
      "tiers → tâche",
      await appel("POST", `/api/tiers/taches/${tache.id}/assigner`, { thirdPartyId: moral.id }),
    );
  }
}
if (cli && projet) {
  trace(
    "client → projet",
    await appel("POST", `/api/clients/projets/${projet.id}`, { clientIds: [cli.id] }),
  );
}

// ── Vue 29 — une direction vide et un département sans service ──────────────

const orga = await appel("GET", "/api/organisation");
if (!orga.corps.directions.some((d) => d.nom === "Direction générale")) {
  trace(
    "direction vide",
    await appel("POST", "/api/organisation/directions", {
      nom: "Direction générale",
      description: "Cabinet et pilotage",
      responsableId: premier.id,
    }),
  );
}
const tousDepartements = [
  ...orga.corps.directions.flatMap((d) => d.departements),
  ...orga.corps.departementsSansDirection,
];
if (!tousDepartements.some((d) => d.nom === "Gestion administrative")) {
  trace(
    "département sans service",
    await appel("POST", "/api/organisation/departements", {
      nom: "Gestion administrative",
      description: "Carrières, paie, formation",
      responsableId: premier.id,
    }),
  );
}

console.log("\nÀ reporter dans design/routes.json :");
console.log(`  "24": "/tiers/${moral?.id ?? "—"}"`);
console.log(`  "26": "/clients/${cli?.id ?? "—"}"`);
