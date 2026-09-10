/**
 * Catalogue partagé des visuels d'avatar prédéfinis (`RG-AUTH-09`).
 *
 * Le cadrage exige le choix sans en fixer la bibliothèque. L'arbitrage de
 * remédiation retient volontairement un petit ensemble stable, indépendant
 * d'une image distante et de la couleur : chaque visuel doit rester
 * reconnaissable par son motif et être nommé par sa clé traduisible.
 *
 * Les identifiants sont persistés en base. Ils ne doivent donc jamais être
 * renommés pour une simple évolution graphique.
 */
export const VISUELS_AVATAR_PREDEFINIS = [
  { id: "constellation", cleLibelle: "profil.visuelsAvatar.constellation" },
  { id: "feuille", cleLibelle: "profil.visuelsAvatar.feuille" },
  { id: "montagne", cleLibelle: "profil.visuelsAvatar.montagne" },
  { id: "vagues", cleLibelle: "profil.visuelsAvatar.vagues" },
  { id: "soleil", cleLibelle: "profil.visuelsAvatar.soleil" },
  { id: "mosaique", cleLibelle: "profil.visuelsAvatar.mosaique" },
] as const;

export const IDS_VISUELS_AVATAR_PREDEFINIS = VISUELS_AVATAR_PREDEFINIS.map(
  (visuel) => visuel.id,
) as [
  (typeof VISUELS_AVATAR_PREDEFINIS)[number]["id"],
  ...(typeof VISUELS_AVATAR_PREDEFINIS)[number]["id"][],
];

export type VisuelAvatarPredefini = (typeof VISUELS_AVATAR_PREDEFINIS)[number]["id"];

const idsVisuels = new Set<string>(IDS_VISUELS_AVATAR_PREDEFINIS);

export const estVisuelAvatarPredefini = (valeur: string): valeur is VisuelAvatarPredefini =>
  idsVisuels.has(valeur);
