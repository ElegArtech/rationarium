import i18next from "i18next";

/** D-RM06 : seul un rôle marqué système reçoit un nom traduit ; le nom libre est une donnée.
 * i18n-familles: coquille:rolesSysteme.
 */
export const nomRole = (role: { code: string; nom: string; systeme?: boolean } | null | undefined): string => {
  if (!role) return "";
  return role.systeme === true ? String(i18next.t(`coquille:rolesSysteme.${role.code}`, { defaultValue: role.nom })) : role.nom;
};
