import { z } from "zod";

/**
 * Zod, sans compilation à la volée — parce que le client vit sous une CSP.
 *
 * Zod 4 compile ses objets en une fonction spécialisée pour aller plus vite, et
 * il commence par **sonder** le navigateur avec un `new Function("")` pour
 * savoir s'il en a le droit. La sonde est enveloppée d'un `try` : sous une
 * politique qui ne porte pas `'unsafe-eval'`, l'exception est avalée et Zod
 * retombe proprement sur son interprète. **Rien ne casse.**
 *
 * Mais le navigateur, lui, signale la violation avant que le `try` ne l'attrape :
 * la console de l'instance déployée portait, à chaque chargement, un
 * « Note that 'script-src' was not explicitly set, so 'default-src' is used as a
 * fallback » sans cause visible, pointant du code minifié. Un avertissement de
 * sécurité permanent et sans objet est pire qu'inutile : il apprend à ne plus
 * lire la console, et c'est là que se signalent les violations qui, elles,
 * comptent.
 *
 * `jitless` supprime la sonde. Le coût est une validation de formulaire
 * interprétée plutôt que compilée — quelques microsecondes sur des objets de
 * dix champs, contre un serveur qui, lui, garde la compilation là où le volume
 * la justifie et où aucune CSP ne s'applique.
 *
 * **Ce module doit être évalué AVANT le premier schéma.** `globalConfig` est lu
 * à la CONSTRUCTION de chaque `z.object`, pas à l'analyse : un réglage posé
 * après coup ne s'appliquerait à rien — et `@rationarium/contracts` construit
 * les siens au chargement. D'où l'import en toute première ligne de `main.tsx`,
 * et le contrôle de `csp.e2e.spec.ts` qui mesure l'EFFET sous la politique du
 * déploiement, pas la présence du réglage.
 */
z.config({ jitless: true });
