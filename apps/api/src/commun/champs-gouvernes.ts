/**
 * Un champ gouverné par une permission plus stricte que sa route.
 *
 * **Le défaut que ce module ferme.** La garde de permission protège un *point
 * d'entrée* ; elle ne dit rien des *champs* qu'il accepte. `PATCH
 * /utilisateurs/:id` est gardé par `users:update` et acceptait `roleId` —
 * autrement dit, tout rôle capable de corriger un nom pouvait attribuer un
 * rôle. `IT_SUPPORT` le détient, et sa propre description dit « pas de gestion
 * des rôles, c'est la limite qui sépare le support de l'administration ». La
 * limite était écrite dans le catalogue et tenue nulle part : un support
 * pouvait s'attribuer `ADMIN`. Même motif sur `PATCH /projets/:id`, qui écrit
 * `chefId` et `sponsorId` sous `projects:update` alors que toucher aux membres
 * exige `projects:manage_members` — et chef comme sponsor donnent la visibilité
 * du projet (`RG-SCOPE-02`).
 *
 * **Pourquoi ici et pas dans chaque service.** La règle est la même partout et
 * doit être énonçable une fois : « ce champ, cette permission ». Dupliquée, elle
 * diverge, et le troisième cas s'écrira sans le quatrième. Le contrôle de
 * `scripts/inoperant-check.mjs` cherche cette déclaration : un champ sensible
 * qui n'y figure pas est un défaut, pas une omission.
 *
 * **Ce n'est pas un remplacement de la garde.** L'ordre reste celui de
 * `.claude/rules/api.md` — permission d'abord, périmètre ensuite. Ceci s'ajoute
 * à l'intérieur du point d'entrée, une fois la permission de route acquise.
 */

export type ChampGouverne = {
  /** Le nom du champ dans le corps de la requête. */
  readonly champ: string;
  /** La permission sans laquelle ce champ ne peut pas être écrit. */
  readonly permission: string;
};

/**
 * Rend le premier champ gouverné que l'appelant n'a pas le droit d'écrire, ou
 * `null` si l'écriture est permise.
 *
 * Le test porte sur `!== undefined` et non sur la véracité : `roleId: null`
 * — retirer son rôle à quelqu'un — est une écriture aussi gouvernée que
 * l'attribution. Un `??` ou un test de véracité laisserait passer exactement le
 * geste le plus dangereux.
 */
export function champRefuse(
  donnees: Readonly<Record<string, unknown>>,
  gouvernes: readonly ChampGouverne[],
  permissions: ReadonlySet<string>,
): ChampGouverne | null {
  for (const gouverne of gouvernes) {
    if (donnees[gouverne.champ] !== undefined && !permissions.has(gouverne.permission)) {
      return gouverne;
    }
  }
  return null;
}

/** `EX-USR-04` — modifier un compte « y compris son rôle et ses rattachements ». */
export const CHAMPS_GOUVERNES_UTILISATEUR: readonly ChampGouverne[] = [
  { champ: "roleId", permission: "users:manage_roles" },
];

/**
 * `RG-SCOPE-02` — un projet est visible par son créateur, son chef, son sponsor
 * et ses membres. Nommer un chef ou un sponsor donne donc un accès, au même
 * titre qu'ajouter un membre.
 */
export const CHAMPS_GOUVERNES_PROJET: readonly ChampGouverne[] = [
  { champ: "chefId", permission: "projects:manage_members" },
  { champ: "sponsorId", permission: "projects:manage_members" },
];

/**
 * Le second motif : **agir sur quelqu'un d'autre que soi**.
 *
 * Ici le champ est toujours permis — c'est sa *valeur* qui décide. Déclarer son
 * propre temps relève de `time_tracking:create` ; le déclarer pour un
 * collègue est un autre geste, et `RG-TMP-04` le dit : « Déclarer pour un tiers
 * exige une permission dédiée. » Le module des congés le tient déjà ainsi
 * (`conges.service.ts`, `leaves:declare_for_other`) ; c'est ce modèle qui est
 * repris.
 *
 * Le défaut trouvé au balayage : `temps.service.ts` **calculait** `pourAutrui`
 * pour le journal d'audit et ne refusait rien — la trace disait ce que le
 * contrôle aurait dû empêcher. `teletravail.basculer` ne comparait même pas
 * `userId` à l'acteur, alors que `RG-TLT-07` exige « une permission dédiée,
 * distincte selon l'action ».
 */
export function autruiRefuse(
  cible: string | null | undefined,
  acteurId: string,
  permission: string,
  permissions: ReadonlySet<string>,
): { champ: string; permission: string } | null {
  if (!cible || cible === acteurId) return null;
  if (permissions.has(permission)) return null;
  return { champ: "userId", permission };
}

/** `RG-TMP-04` — déclarer du temps pour un tiers. */
/**
 * `RG-TMP-04`. Le catalogue la nomme `declare_for_third_party` et non
 * `declare_for_other` comme le domaine des congés : les deux domaines ont été
 * écrits à des moments différents. On emploie le nom réel du catalogue —
 * l'harmoniser serait une modification du catalogue fermé, donc une décision à
 * part.
 */
export const PERMISSION_TEMPS_AUTRUI = "time_tracking:declare_for_third_party";

/** `RG-TLT-07` — agir sur le télétravail d'autrui. */
export const PERMISSION_TELETRAVAIL_AUTRUI = "telework:manage_any";
