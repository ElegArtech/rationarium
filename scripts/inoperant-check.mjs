#!/usr/bin/env node
/**
 * Contrôle des inertes déclarés — lot L-40.
 *
 * Deux familles de défauts silencieux, rendues bruyantes.
 *
 * **(a) Les commandes inertes.** Un `<Button isDisabled>` sans expression est
 * parfois légitime — l'action n'a aucun sens dans cette branche — et parfois le
 * vestige d'un commentaire périmé. Quatre l'étaient : leurs motifs affirmaient
 * qu'aucune route serveur n'existait, et les quatre routes existaient. Une
 * commande peut rester inerte ; elle ne peut pas le rester **en silence**.
 * Chaque occurrence doit donc être déclarée dans `design/inoperants.json`, avec
 * son motif et la règle qui la porte.
 *
 * **(b) Les champs gouvernés.** `PATCH /utilisateurs/:id`, gardé par
 * `users:update`, écrivait `roleId` — et `IT_SUPPORT` détient `users:update`
 * sans `users:manage_roles` (`L-38`). La garde protège un *point d'entrée*, pas
 * les *champs* qu'il accepte. La règle est désormais déclarée en données dans
 * `apps/api/src/commun/champs-gouvernes.ts` ; ce contrôle vérifie qu'aucun champ
 * sensible n'échappe à cette déclaration sans être inscrit, motivé, en
 * `champsAdmis`.
 *
 * **Le piège que ce script doit éviter.** Le dépôt a payé trois fois un contrôle
 * qui passait au vert en ne mesurant rien : `pnpm perf` sur un projet Playwright
 * vide, `pnpm ui:diff` dont la branche de comparaison sortait en 0, la suite
 * d'accessibilité sur une liste tenue à la main. Ce script **affirme donc son
 * inventaire** : sous ses seuils, il échoue en le disant, et il imprime toujours
 * ce qu'il a mesuré. Symétriquement, une déclaration qui ne correspond à rien
 * est un écart : sans quoi le fichier pourrirait sans que personne ne le voie.
 *
 * `INOPERANT_DETAIL=1` détaille l'inventaire, occurrence par occurrence — utile
 * pour instruire un écart, inutile dans la boucle.
 */

import fs from "node:fs";
import path from "node:path";

const RACINE = process.cwd();
const VUES = path.join(RACINE, "apps/web/src");
const API = path.join(RACINE, "apps/api/src");
const DECLARATION = path.join(RACINE, "design/inoperants.json");
const CHAMPS_GOUVERNES = path.join(API, "commun/champs-gouvernes.ts");
const CONTRATS = path.join(RACINE, "packages/contracts/src/schemas.ts");

/**
 * Les champs qu'on ne laisse pas écrire sans se poser la question.
 *
 * `roleId`, `permissions`, `systeme` : ils donnent des droits.
 * `chefId`, `sponsorId` : `RG-SCOPE-02` — les nommer donne la visibilité du
 * projet, donc c'est un geste d'appartenance.
 * `userId` : agir sur quelqu'un d'autre que soi. Il n'est sensible que si la
 * garde de la route n'est pas déjà une permission `manage_*` — auquel cas le
 * droit d'agir sur autrui est précisément ce que la route exige.
 */
const CHAMPS_SENSIBLES = ["roleId", "chefId", "sponsorId", "permissions", "systeme"];
const CHAMP_AUTRUI = "userId";

/**
 * Seuils d'inventaire. Un balayage qui trouve moins que cela est cassé.
 *
 * Ils sont posés SOUS l'état du jour — 54 fichiers, 89 routes, 79 corps
 * résolus, 3 champs gouvernés — avec juste ce qu'il faut de marge pour qu'une
 * route retirée n'allume pas un faux rouge, et pas plus : un seuil complaisant
 * ne mesure rien de mieux qu'un contrôle vide. Baisser l'un d'eux pour faire
 * passer une boucle, c'est refaire le défaut que ce script existe pour tenir.
 */
const SEUIL_FICHIERS_TSX = 45;
const SEUIL_ROUTES_ECRITURE = 75;
const SEUIL_ROUTES_AVEC_CORPS = 65;
const SEUIL_CHAMPS_GOUVERNES = 1;

const ecarts = [];
const RE_REGLE = /^(EX|RG)-[A-Z]+-\d+$/;

// ── Outillage de lecture de source ──────────────────────────────────────────

/** Rend l'indice qui suit le littéral commencé en `i`. */
function finLitteral(src, i) {
  const guillemet = src[i];
  let j = i + 1;
  while (j < src.length) {
    if (src[j] === "\\") {
      j += 2;
      continue;
    }
    if (src[j] === guillemet) return j + 1;
    j++;
  }
  return src.length;
}

/**
 * Remplace les commentaires par des espaces, sans déplacer un seul caractère :
 * les numéros de ligne et les décalages restent vrais. Un `isDisabled` cité dans
 * un commentaire n'est pas une commande.
 */
function sansCommentaires(src) {
  const out = [...src];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '"' || c === "'" || c === "`") {
      i = finLitteral(src, i);
      continue;
    }
    if (c === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") out[i++] = " ";
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      const fin = src.indexOf("*/", i + 2);
      const stop = fin === -1 ? src.length : fin + 2;
      for (; i < stop; i++) if (src[i] !== "\n") out[i] = " ";
      continue;
    }
    i++;
  }
  return out.join("");
}

/** Parcourt en ignorant les littéraux ; rend l'indice du caractère cherché. */
function scanner(src, depart, surCaractere) {
  let i = depart;
  while (i < src.length) {
    const c = src[i];
    if (c === '"' || c === "'" || c === "`") {
      i = finLitteral(src, i);
      continue;
    }
    if (surCaractere(c, i)) return i;
    i++;
  }
  return -1;
}

/** Le bloc `{…}` qui commence en `i`, accolades appariées, littéraux ignorés. */
function bloc(src, i) {
  let prof = 0;
  const fin = scanner(src, i, (c) => {
    if (c === "{") prof++;
    else if (c === "}") {
      prof--;
      if (prof === 0) return true;
    }
    return false;
  });
  return fin === -1 ? null : src.slice(i, fin + 1);
}

/** Les arguments de l'appel dont la parenthèse ouvrante est en `i`. */
function argumentsDe(src, i) {
  const args = [];
  let prof = 0;
  let debut = i + 1;
  const fin = scanner(src, i, (c, j) => {
    if (c === "(" || c === "[" || c === "{") prof++;
    else if (c === ")" || c === "]" || c === "}") {
      prof--;
      if (prof === 0) {
        args.push(src.slice(debut, j));
        return true;
      }
    } else if (c === "," && prof === 1) {
      args.push(src.slice(debut, j));
      debut = j + 1;
    }
    return false;
  });
  if (fin === -1) return null;
  const nets = args.map((a) => a.trim());
  // Virgule finale : `valider(schema, corps,)` rend un dernier argument vide.
  // Le laisser passer faisait croire qu'aucun schéma ne décrivait le corps —
  // et le contrôle des champs sensibles devenait aveugle sur soixante routes.
  while (nets.length > 0 && nets[nets.length - 1] === "") nets.pop();
  return nets;
}

/** Les clés de premier niveau du littéral d'objet qui commence en `i`. */
function clesDuLitteral(src, i) {
  const cles = [];
  let prof = 0;
  let attenduUneCle = false;
  scanner(src, i, (c, j) => {
    if (c === "(" || c === "[" || c === "{") {
      prof++;
      if (prof === 1) attenduUneCle = true;
      return false;
    }
    if (c === ")" || c === "]" || c === "}") {
      prof--;
      return prof === 0;
    }
    if (c === "," && prof === 1) {
      attenduUneCle = true;
      return false;
    }
    if (prof === 1 && attenduUneCle && /\S/.test(c)) {
      const m = /^([A-Za-z_$][\w$]*)\s*:/.exec(src.slice(j));
      if (m) cles.push(m[1]);
      attenduUneCle = false;
    }
    return false;
  });
  return cles;
}

/**
 * La méthode dont la signature commence en `depart` : sa signature seule, et
 * son corps. Les deux séparément — un `@Body() corps` se lit dans la signature,
 * et le confondre avec celle de la méthode suivante rendait des faux positifs.
 */
function methodeDepuis(src, depart) {
  let prof = 0;
  const accolade = scanner(src, depart, (c) => {
    if (c === "(") prof++;
    else if (c === ")") prof--;
    else if (c === "{" && prof === 0) return true;
    return false;
  });
  if (accolade === -1) return null;
  const corps = bloc(src, accolade);
  if (corps === null) return null;
  return { signature: src.slice(depart, accolade), corps };
}

/** Le corps seul, quand la signature n'intéresse pas. */
function corpsDeMethode(src, depart) {
  return methodeDepuis(src, depart)?.corps ?? null;
}

function fichiersRecursifs(dir, filtre) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return fichiersRecursifs(p, filtre);
    return filtre(p) ? [p] : [];
  });
}

const relatif = (p) => path.relative(RACINE, p).split(path.sep).join("/");

// ── (a) Les commandes inertes ───────────────────────────────────────────────

/**
 * Une commande inerte, sous ses **deux** écritures.
 *
 * `isDisabled` sans expression était la seule reconnue à l'origine. Mais
 * `RG-GEN-06` exige qu'une action désactivée « porte une explication au
 * survol », et un bouton **nativement** désactivé ne reçoit ni survol ni focus :
 * son infobulle ne s'ouvre jamais. Le motif correct est donc `aria-disabled`,
 * qui garde la commande joignable — et le contrôle serait devenu **aveugle à
 * exactement ce qu'il existe pour voir** s'il n'avait reconnu que l'ancienne
 * écriture. Il a d'ailleurs signalé les deux premières conversions comme des
 * déclarations orphelines : c'est ce qui a révélé le trou.
 */
const RE_INERTE = /\b(?:isDisabled|aria-disabled)\b(?!\s*=)/g;
/** `t("…")`, `tImports('…')` — les liaisons i18next, jamais `formaterDate(`. */
const RE_CLE_I18N = /(?<![\w.$])(t|t[A-Z][\w$]*)\s*\(\s*(["'])([^"']+)\2/g;

/**
 * Le repère d'une occurrence : ce qui l'identifie quand les lignes bougent.
 *
 * La dernière clé i18next de l'élément — l'intitulé visible vient en dernier,
 * après les `aria-description` de l'ouvrante —, sinon son `id` littéral, sinon
 * le nom de la balise. Un numéro de ligne ne ferait pas l'affaire : il change à
 * chaque insertion au-dessus, et la déclaration deviendrait fausse sans que
 * rien n'ait bougé.
 */
function repereDeLOccurrence(src, indice) {
  const ouverture = src.lastIndexOf("<", indice);
  if (ouverture === -1) return { repere: "?", balise: "?" };
  const balise = /^<\s*([A-Za-z][\w.]*)/.exec(src.slice(ouverture))?.[1] ?? "?";

  // Fin de la balise ouvrante : le `>` hors accolade et hors littéral.
  let prof = 0;
  const finOuvrante = scanner(src, ouverture, (c) => {
    if (c === "{") prof++;
    else if (c === "}") prof--;
    else if (c === ">" && prof === 0) return true;
    return false;
  });
  if (finOuvrante === -1) return { repere: balise, balise };

  let region = src.slice(ouverture, finOuvrante + 1);
  if (src[finOuvrante - 1] !== "/") {
    // Les enfants, jusqu'à la fermeture appariée de la même balise.
    const ouvrantes = new RegExp(`<${balise}[\\s/>]`, "g");
    const fermantes = new RegExp(`</${balise}\\s*>`, "g");
    let profondeur = 1;
    let curseur = finOuvrante + 1;
    while (profondeur > 0 && curseur < src.length) {
      ouvrantes.lastIndex = curseur;
      fermantes.lastIndex = curseur;
      const o = ouvrantes.exec(src);
      const f = fermantes.exec(src);
      if (!f) break;
      if (o && o.index < f.index) {
        profondeur++;
        curseur = o.index + o[0].length;
      } else {
        profondeur--;
        curseur = f.index + f[0].length;
        if (profondeur === 0) region = src.slice(ouverture, f.index);
      }
    }
  }

  const cles = [...region.matchAll(RE_CLE_I18N)].map((m) => m[3]);
  if (cles.length > 0) return { repere: cles[cles.length - 1], balise };
  const id = /\bid\s*=\s*"([^"]+)"/.exec(region)?.[1];
  return { repere: id ?? balise, balise };
}

function balayerCommandes() {
  const fichiers = fichiersRecursifs(VUES, (p) => p.endsWith(".tsx"));
  const trouvees = [];
  for (const fichier of fichiers) {
    const src = sansCommentaires(fs.readFileSync(fichier, "utf8"));
    RE_INERTE.lastIndex = 0;
    let m;
    while ((m = RE_INERTE.exec(src))) {
      const ligne = src.slice(0, m.index).split("\n").length;
      const { repere, balise } = repereDeLOccurrence(src, m.index);
      trouvees.push({ fichier: relatif(fichier), ligne, repere, balise });
    }
  }
  return { fichiers: fichiers.length, trouvees };
}

// ── (b) Les champs gouvernés ────────────────────────────────────────────────

/** Les `const X = …` d'un fichier, initialiseur compris. */
function definitions(src, dans = new Map()) {
  const re = /(?:^|\n)[ \t]*(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*(?::[^=\n]*)?=\s*/g;
  let m;
  while ((m = re.exec(src))) {
    const debut = m.index + m[0].length;
    let prof = 0;
    const fin = scanner(src, debut, (c) => {
      if (c === "(" || c === "[" || c === "{") prof++;
      else if (c === ")" || c === "]" || c === "}") prof--;
      else if (c === ";" && prof === 0) return true;
      return false;
    });
    dans.set(m[1], src.slice(debut, fin === -1 ? src.length : fin));
  }
  return dans;
}

/**
 * Les champs qu'un schéma accepte. Les identifiants sont suivis : un
 * `valider(plageDemandee, corps)` qui ne serait pas résolu rendrait le contrôle
 * aveugle exactement là où il doit voir.
 */
function champsDuSchema(src, defs, vus = new Set()) {
  const champs = new Set();
  const re = /(?:z\.(?:object|strictObject|looseObject)|\.extend)\s*\(/g;
  let m;
  while ((m = re.exec(src))) {
    const args = argumentsDe(src, m.index + m[0].length - 1);
    if (!args || args.length === 0) continue;
    const debut = args[0].indexOf("{");
    if (debut === -1) continue;
    for (const c of clesDuLitteral(args[0], debut)) champs.add(c);
  }
  for (const [, id] of src.matchAll(/(?<![\w.$])([A-Za-z_$][\w$]*)/g)) {
    if (!defs.has(id) || vus.has(id)) continue;
    vus.add(id);
    for (const c of champsDuSchema(defs.get(id), defs, vus)) champs.add(c);
  }
  return champs;
}

/** Les méthodes d'une classe : nom → corps. */
function methodesDe(src) {
  const methodes = new Map();
  const re =
    /(?:^|\n)[ \t]{2}(?:(?:private|public|protected|readonly|static)\s+)*(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(/g;
  let m;
  while ((m = re.exec(src))) {
    if (m[1] === "constructor") continue;
    const corps = corpsDeMethode(src, m.index + m[0].length - 1);
    if (corps) methodes.set(m[1], (methodes.get(m[1]) ?? "") + corps);
  }
  return methodes;
}

/** Les constantes de `champs-gouvernes.ts` : nom → champs gouvernés. */
function lireChampsGouvernes() {
  if (!fs.existsSync(CHAMPS_GOUVERNES)) {
    ecarts.push(`déclaration introuvable : ${relatif(CHAMPS_GOUVERNES)}`);
    return new Map();
  }
  const src = sansCommentaires(fs.readFileSync(CHAMPS_GOUVERNES, "utf8"));
  const gouvernes = new Map();
  for (const [nom, init] of definitions(src)) {
    const champs = [...init.matchAll(/\bchamp\s*:\s*"([^"]+)"/g)].map((m) => m[1]);
    if (champs.length > 0) gouvernes.set(nom, champs);
  }
  return gouvernes;
}

/**
 * Toutes les classes de service de l'API : nom de classe → méthodes.
 *
 * **Toutes**, et chacune avec SON corps. Prendre la première classe exportée du
 * fichier attribuait les méthodes de `UtilisateursService` à
 * `ErreurUtilisateur`, déclarée au-dessus : la résolution ne trouvait plus rien,
 * et les deux routes que `L-38` venait de gouverner repassaient pour ouvertes.
 * Un contrôle qui se trompe dans ce sens-là est le pire des trois : il accuse
 * du code juste, et on finit par le désarmer.
 */
function servicesDeLApi() {
  const classes = new Map();
  for (const f of fichiersRecursifs(API, (p) => p.endsWith(".service.ts"))) {
    const src = sansCommentaires(fs.readFileSync(f, "utf8"));
    for (const m of src.matchAll(/(?:^|\n)(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/g)) {
      const accolade = src.indexOf("{", m.index + m[0].length);
      if (accolade === -1) continue;
      const corps = bloc(src, accolade);
      if (corps) classes.set(m[1], methodesDe(corps));
    }
  }
  return classes;
}

const RE_ROUTE = /(?:^|\n)[ \t]*@(Post|Patch|Put)\(\s*(?:(["'])([^"']*)\2)?\s*\)/g;
const RE_DECORATEUR = /^[ \t]*@[A-Za-z_$][\w$]*\s*\(/;

function balayerRoutes(gouvernes, services) {
  const controleurs = fichiersRecursifs(API, (p) => p.endsWith(".controller.ts"));
  const defsContrats = definitions(sansCommentaires(fs.readFileSync(CONTRATS, "utf8")));
  const routes = [];

  for (const fichier of controleurs) {
    const src = sansCommentaires(fs.readFileSync(fichier, "utf8"));
    const defs = definitions(src, new Map(defsContrats));

    /*
     * Un fichier peut porter DEUX contrôleurs — `tiers.controller.ts` en
     * déclare un pour `tiers` et un pour `clients`. Prendre le premier
     * `@Controller` du fichier attribuait à `/tiers` des routes de `/clients`,
     * et faisait apparaître deux fois la même URL. Chaque route se rattache au
     * `@Controller` et au `constructor` qui la PRÉCÈDENT.
     */
    const prefixes = [...src.matchAll(/@Controller\(\s*"([^"]*)"\s*\)/g)].map((m) => ({
      indice: m.index,
      valeur: m[1],
    }));
    const constructeurs = [...src.matchAll(/\bconstructor\s*\(/g)].map((m) => {
      const injections = new Map();
      for (const a of argumentsDe(src, m.index + m[0].length - 1) ?? []) {
        const p = /([A-Za-z_$][\w$]*)\s*:\s*([A-Za-z_$][\w$]*)/.exec(a);
        if (p) injections.set(p[1], p[2]);
      }
      return { indice: m.index, injections };
    });
    const precedent = (liste, indice) =>
      liste.filter((e) => e.indice < indice).slice(-1)[0] ?? null;

    const lignes = src.split("\n");
    const debutDeLigne = [];
    let curseur = 0;
    for (const l of lignes) {
      debutDeLigne.push(curseur);
      curseur += l.length + 1;
    }

    RE_ROUTE.lastIndex = 0;
    let m;
    while ((m = RE_ROUTE.exec(src))) {
      const verbe = m[1];
      const chemin = m[3] ?? "";
      const prefixe = precedent(prefixes, m.index)?.valeur ?? "";
      const injections = precedent(constructeurs, m.index)?.injections ?? new Map();
      const url = `${verbe.toUpperCase()} /${[prefixe, chemin].filter(Boolean).join("/")}`;
      const iLigne = src.slice(0, m.index + m[0].length).split("\n").length - 1;

      // Les décorateurs voisins, au-dessus comme au-dessous.
      const voisins = [lignes[iLigne]];
      for (let k = iLigne - 1; k >= 0 && RE_DECORATEUR.test(lignes[k]); k--) voisins.push(lignes[k]);
      let k = iLigne + 1;
      while (k < lignes.length && (RE_DECORATEUR.test(lignes[k]) || lignes[k].trim() === "")) {
        voisins.push(lignes[k]);
        k++;
      }
      const decorateurs = voisins.join("\n");
      const permission = /@RequiertPermission\(\s*"([^"]+)"\s*\)/.exec(decorateurs)?.[1] ?? null;
      const garde =
        permission ??
        (/@Personnel\(\)/.test(decorateurs)
          ? "@Personnel"
          : /@Public\(\)/.test(decorateurs)
            ? "@Public"
            : "aucune");

      // La signature commence à la première ligne qui n'est plus un décorateur.
      if (k >= lignes.length) {
        ecarts.push(`${relatif(fichier)} — ${url} n'est suivi d'aucune signature de méthode.`);
        continue;
      }
      const methode = methodeDepuis(src, debutDeLigne[k]);
      if (methode === null) {
        ecarts.push(`${relatif(fichier)} — corps de méthode illisible pour ${url}`);
        continue;
      }
      const { signature, corps } = methode;

      // Les schémas appliqués au CORPS de la requête, pas à la requête d'URL.
      const champs = new Set();
      let schemaTrouve = false;
      const reValider = /\bvalider\s*\(/g;
      let v;
      while ((v = reValider.exec(corps))) {
        const args = argumentsDe(corps, v.index + v[0].length - 1);
        if (!args || args.length < 2 || !args.slice(1).includes("corps")) continue;
        schemaTrouve = true;
        for (const c of champsDuSchema(args[0], defs)) champs.add(c);
      }

      /*
       * Un corps accepté sans schéma est un angle mort, pas une absence de
       * risque — et un corps nommé autrement que `corps` en est un aussi : la
       * lecture des schémas s'ancre sur ce nom, et une convention rompue rendrait
       * la route invisible sans que rien ne le dise.
       */
      const nomDuCorps = /@Body\(\)\s*([A-Za-z_$][\w$]*)/.exec(signature)?.[1] ?? null;
      if (nomDuCorps !== null && nomDuCorps !== "corps") {
        ecarts.push(
          `${relatif(fichier)} — ${url} nomme son corps « ${nomDuCorps} » et non « corps ». ` +
            `La convention des 79 autres points d'entrée s'appelle « corps » ; hors d'elle, ce ` +
            `contrôle ne sait plus quel schéma décrit le corps.`,
        );
      } else if (nomDuCorps === "corps" && !schemaTrouve) {
        ecarts.push(
          `${relatif(fichier)} — ${url} accepte un corps qu'aucun \`valider(…, corps)\` ne décrit : ` +
            `le contrôle des champs sensibles y est aveugle.`,
        );
      }

      /*
       * Ce qui requestionne les champs une fois la permission de route acquise
       * — dans le point d'entrée lui-même comme dans les méthodes de service
       * qu'il appelle. Les deux : `champs-gouvernes.ts` s'applique « à
       * l'intérieur du point d'entrée », et rien n'impose que ce soit le
       * service qui s'en charge.
       */
      const gardesDuService = new Set();
      let autrui = false;
      const requestionne = (source) => {
        if (/\bautruiRefuse\s*\(/.test(source)) autrui = true;
        for (const [, constante] of source.matchAll(/\bchampRefuse\s*\([^)]*?,\s*([A-Z][\w$]*)/g)) {
          for (const c of gouvernes.get(constante) ?? []) gardesDuService.add(c);
        }
      };
      requestionne(corps);
      for (const appel of corps.matchAll(/this\.([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)\s*\(/g)) {
        const methode = services.get(injections.get(appel[1]))?.get(appel[2]);
        if (methode) requestionne(methode);
      }

      routes.push({
        url,
        fichier: relatif(fichier),
        garde,
        champs: [...champs],
        aUnCorps: schemaTrouve,
        gardesDuService,
        autrui,
      });
    }
  }
  return { controleurs: controleurs.length, routes };
}

/** Le champ est-il sensible sur cette route ? */
function sensible(champ, garde) {
  if (CHAMPS_SENSIBLES.includes(champ)) return true;
  // `userId` : agir sur autrui. Une garde `manage_*` exige déjà ce droit-là.
  if (champ === CHAMP_AUTRUI) return !/:.*\bmanage_/.test(garde);
  return false;
}

// ── La déclaration ──────────────────────────────────────────────────────────

function lireDeclaration() {
  if (!fs.existsSync(DECLARATION)) {
    ecarts.push(`déclaration introuvable : ${relatif(DECLARATION)}`);
    return { commandesInertes: [], champsAdmis: [] };
  }
  let contenu;
  try {
    contenu = JSON.parse(fs.readFileSync(DECLARATION, "utf8"));
  } catch (e) {
    ecarts.push(`${relatif(DECLARATION)} illisible — ${e.message}`);
    return { commandesInertes: [], champsAdmis: [] };
  }
  const commandesInertes = Array.isArray(contenu.commandesInertes) ? contenu.commandesInertes : [];
  const champsAdmis = Array.isArray(contenu.champsAdmis) ? contenu.champsAdmis : [];

  const motive = (e, ou, i) => {
    if (!e.raison || e.raison.trim().length < 20)
      ecarts.push(`${ou}[${i}] — \`raison\` absente ou trop brève pour être un motif`);
    if (!Array.isArray(e.regles) || e.regles.length === 0)
      ecarts.push(`${ou}[${i}] — aucune \`EX-…\`/\`RG-…\` citée`);
    else
      for (const r of e.regles)
        if (!RE_REGLE.test(r)) ecarts.push(`${ou}[${i}] — « ${r} » n'est pas une \`EX-…\`/\`RG-…\``);
  };

  commandesInertes.forEach((e, i) => {
    if (!e.fichier) ecarts.push(`commandesInertes[${i}] — \`fichier\` manquant`);
    if (!e.repere) ecarts.push(`commandesInertes[${i}] — \`repere\` manquant`);
    motive(e, `commandesInertes (${e.fichier} · ${e.repere})`, i);
  });

  champsAdmis.forEach((e, i) => {
    if (!e.route) ecarts.push(`champsAdmis[${i}] — \`route\` manquante`);
    if (!e.champ) ecarts.push(`champsAdmis[${i}] — \`champ\` manquant`);
    motive(e, `champsAdmis (${e.route} · ${e.champ})`, i);
  });

  return { commandesInertes, champsAdmis };
}

// ── Exécution ───────────────────────────────────────────────────────────────

/*
 * Les arbres à balayer existent-ils seulement ? Lancé d'ailleurs que la racine,
 * le script ne trouverait aucun fichier — et sans ce contrôle-ci il rendrait
 * « aucun écart » sur un balayage vide, ce qu'il existe précisément pour
 * refuser. Les seuils l'attraperaient ; la lecture des contrats, elle, lèverait
 * d'abord une exception illisible.
 */
for (const [quoi, ou] of [
  ["les vues", VUES],
  ["l'API", API],
  ["les contrats", CONTRATS],
]) {
  if (!fs.existsSync(ou)) {
    console.error(
      `inoperant-check : ${quoi} — ${relatif(ou)} est introuvable depuis ${RACINE}. ` +
        `Ce contrôle se lance depuis la racine du dépôt ; il n'a rien à mesurer d'ici.`,
    );
    process.exit(1);
  }
}

const declaration = lireDeclaration();
const commandes = balayerCommandes();
const gouvernes = lireChampsGouvernes();
const services = servicesDeLApi();
const scan = balayerRoutes(gouvernes, services);
const routesAvecCorps = scan.routes.filter((r) => r.aUnCorps).length;
const nbGouvernes = [...gouvernes.values()].flat().length;

// Inventaire — un balayage qui ne trouve rien est un balayage cassé.
if (commandes.fichiers < SEUIL_FICHIERS_TSX)
  ecarts.push(
    `inventaire : ${commandes.fichiers} fichier(s) .tsx balayé(s) sous ${relatif(VUES)} — ` +
      `moins de ${SEUIL_FICHIERS_TSX}. Le balayage ne mesure rien : chemin ou filtre cassé.`,
  );
if (scan.routes.length < SEUIL_ROUTES_ECRITURE)
  ecarts.push(
    `inventaire : ${scan.routes.length} route(s) d'écriture trouvée(s) dans ${scan.controleurs} ` +
      `contrôleur(s) — moins de ${SEUIL_ROUTES_ECRITURE}. L'analyse des décorateurs ne mord plus.`,
  );
if (routesAvecCorps < SEUIL_ROUTES_AVEC_CORPS)
  ecarts.push(
    `inventaire : ${routesAvecCorps} route(s) d'écriture dont le schéma de corps a été résolu — ` +
      `moins de ${SEUIL_ROUTES_AVEC_CORPS}. La lecture des schémas zod ne rend plus de champs.`,
  );
if (nbGouvernes < SEUIL_CHAMPS_GOUVERNES)
  ecarts.push(
    `inventaire : ${nbGouvernes} champ(s) gouverné(s) lu(s) dans ${relatif(CHAMPS_GOUVERNES)} — ` +
      `moins de ${SEUIL_CHAMPS_GOUVERNES}. Sans cette déclaration, tout paraîtrait couvert.`,
  );

// (a) — chaque occurrence déclarée, chaque déclaration employée.
const cleCommande = (e) => `${e.fichier}::${e.repere}`;
const vues = new Map();
for (const o of commandes.trouvees) {
  const cle = cleCommande(o);
  if (vues.has(cle))
    ecarts.push(
      `repère ambigu : ${o.fichier} porte deux commandes inertes de repère « ${o.repere} » ` +
        `(lignes ${vues.get(cle)} et ${o.ligne}). Donnez à l'une de quoi se distinguer — un intitulé, un \`id\`.`,
    );
  else vues.set(cle, o.ligne);
}
const declarees = new Set(declaration.commandesInertes.map(cleCommande));
for (const o of commandes.trouvees) {
  if (!declarees.has(cleCommande(o)))
    ecarts.push(
      `commande inerte non déclarée : ${o.fichier}:${o.ligne} — <${o.balise} … désactivé> ` +
        `(repère « ${o.repere} »). Déclarez-la dans design/inoperants.json avec son motif et sa ` +
        `règle, ou rendez-la agissante.`,
    );
}
for (const e of declaration.commandesInertes) {
  if (!vues.has(cleCommande(e)))
    ecarts.push(
      `déclaration orpheline : ${e.fichier} · « ${e.repere} » ne correspond à aucune commande ` +
        `inerte. La commande a bougé, ou elle n'est plus inerte — retirez l'entrée.`,
    );
}

// (b) — chaque champ sensible couvert ou admis.
const admis = new Set(declaration.champsAdmis.map((e) => `${e.route}::${e.champ}`));
const admisRencontres = new Set();
const sensiblesTrouves = [];
for (const r of scan.routes) {
  for (const champ of r.champs) {
    if (!sensible(champ, r.garde)) continue;
    const couvert = champ === CHAMP_AUTRUI ? r.autrui : r.gardesDuService.has(champ);
    sensiblesTrouves.push(`${r.url} · ${champ}${couvert ? " (gouverné)" : ""}`);
    if (couvert) continue;
    const cle = `${r.url}::${champ}`;
    if (admis.has(cle)) {
      admisRencontres.add(cle);
      continue;
    }
    ecarts.push(
      `champ sensible non gouverné : ${r.url} (garde « ${r.garde} », ${r.fichier}) accepte ` +
        `« ${champ} » sans qu'aucune déclaration de commun/champs-gouvernes.ts ne le requestionne. ` +
        `Gouvernez-le, ou inscrivez-le en \`champsAdmis\` avec sa raison.`,
    );
  }
}
for (const e of declaration.champsAdmis) {
  const cle = `${e.route}::${e.champ}`;
  if (!admisRencontres.has(cle))
    ecarts.push(
      `admission orpheline : ${e.route} · « ${e.champ} » n'est plus un champ sensible non gouverné. ` +
        `Le champ a disparu, ou il est désormais gouverné — retirez l'entrée.`,
    );
}

// ── Ce qui a été mesuré ─────────────────────────────────────────────────────

console.log("Contrôle des inertes déclarés — L-40");
console.log(
  `  (a) ${commandes.fichiers} fichiers .tsx balayés · ` +
    `${commandes.trouvees.length} commandes inertes trouvées · ` +
    `${declaration.commandesInertes.length} déclarées`,
);
console.log(
  `  (b) ${scan.controleurs} contrôleurs · ${scan.routes.length} routes d'écriture examinées · ` +
    `${routesAvecCorps} au schéma de corps résolu · ` +
    `${sensiblesTrouves.length} occurrence(s) de champ sensible · ` +
    `${nbGouvernes} champs gouvernés déclarés · ${declaration.champsAdmis.length} admis`,
);
if (process.env.INOPERANT_DETAIL) {
  for (const o of commandes.trouvees)
    console.log(`      (a) ${o.fichier}:${o.ligne} <${o.balise}> « ${o.repere} »`);
  for (const s of sensiblesTrouves) console.log(`      (b) ${s}`);
}

if (ecarts.length > 0) {
  console.error(`\n${ecarts.length} écart(s) :\n`);
  for (const e of ecarts) console.error(`  · ${e}`);
  console.error("");
  process.exit(1);
}

console.log("Aucun écart.");
