/**
 * Le secret de signature des cookies.
 *
 * `main.ts` lisait `process.env.COOKIE_SECRET ?? "rationarium-dev"` : une
 * instance de production démarrée sans la variable signait ses cookies avec
 * un secret publié dans le dépôt, sans un avertissement. Et `??` ne voit que
 * `undefined` — Compose transmet les variables non renseignées **vides**, et
 * une chaîne vide passait pour un secret (piège déjà payé sur le mot de passe
 * du premier administrateur).
 *
 * En production, le secret absent, vide ou blanc **arrête le démarrage** : un
 * serveur qui refuse de partir se voit à l'installation, un secret par défaut
 * ne se voit jamais. Hors production, le repli de développement reste.
 */
export const SECRET_DE_DEVELOPPEMENT = "rationarium-dev";

export function secretDesCookies(env: NodeJS.ProcessEnv = process.env): string {
  const declare = env["COOKIE_SECRET"]?.trim();
  if (declare) return declare;
  if (env["NODE_ENV"] === "production") {
    throw new Error(
      "COOKIE_SECRET est absent ou vide : le serveur ne démarre pas en production sans secret de session. " +
        "Renseignez COOKIE_SECRET dans deploiement/.env (configurer.sh l'engendre).",
    );
  }
  return SECRET_DE_DEVELOPPEMENT;
}
