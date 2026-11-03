import { useQuery } from "@tanstack/react-query";
import { SECONDES_AGENT_JOIGNABLE } from "@rationarium/contracts";
import * as api from "../../api/assistant.js";
import { ErreurApi } from "../../api/client.js";
import { usePeut } from "../../session/session.js";

/**
 * M22 — **le module existe-t-il pour cet utilisateur ?**
 *
 * `RG-AST-01` : désactivé, le module n'a ni route, ni écran, ni entrée de
 * menu. Le client ne lit pas les réglages pour le savoir — ils sont gardés par
 * `assistant:configure`, que presque personne ne détient. Il interroge
 * `GET /assistant/etat`, gardé par `assistant:use` : un `404` dit « désactivé »,
 * une réponse dit « actif ». C'est le serveur qui tranche, le client masque par
 * courtoisie (`RG-GEN-06`).
 *
 * **Une seule déclaration des options de la requête.** La coquille, la fiche
 * projet, le profil et l'écran d'activité lisent tous la même clé : deux
 * observateurs qui divergent sur le réessai se relancent l'un l'autre dès que
 * la lecture échoue (piège consigné, sept cent quarante-sept appels en deux
 * secondes et demie). Ici, un module désactivé échoue PAR CONSTRUCTION — le
 * cas n'est pas rare, il est le cas par défaut.
 */
export const CLE_ETAT_ASSISTANT = ["assistant", "etat"] as const;

export const optionsEtatAssistant = {
  queryKey: CLE_ETAT_ASSISTANT,
  queryFn: api.etat,
  retry: false,
  retryOnMount: false,
  staleTime: 30_000,
} as const;

/** Vrai quand l'échec veut dire « module désactivé », et non « panne ». */
export const moduleDesactive = (erreur: unknown): boolean =>
  erreur instanceof ErreurApi && erreur.statut === 404;

/**
 * L'état du module, tel que la coquille et les vues le consomment.
 *
 * `actif` ne devient vrai que sur une réponse du serveur : tant qu'on ne sait
 * pas, l'entrée de navigation et l'onglet « Suivi » restent absents plutôt que
 * d'apparaître pour disparaître.
 */
export function useModuleAssistant(): {
  actif: boolean;
  etat: api.EtatAssistant | undefined;
} {
  const peut = usePeut();
  const autorise = peut("assistant:use");
  const requete = useQuery({ ...optionsEtatAssistant, enabled: autorise });
  /*
   * Une relecture en échec GARDE la dernière réponse réussie : désactiver le
   * module depuis le paramétrage laissait l'entrée de menu en place jusqu'au
   * rechargement suivant. Un `404` récent l'emporte sur une donnée ancienne.
   */
  const desactive = requete.isError && moduleDesactive(requete.error);
  return { actif: autorise && requete.data !== undefined && !desactive, etat: desactive ? undefined : requete.data };
}

/**
 * `docs/assistant/SPEC-PHASE-1.md § 4` — **un agent est joignable s'il a
 * donné signe de vie depuis moins d'une minute.**
 *
 * Le serveur rend `joignable` au moment de la lecture ; l'écran, lui, reste
 * ouvert. Un témoin calculé une fois resterait vert une heure après que le
 * poste s'est éteint. La règle est donc recalculée contre l'horloge, à partir
 * du dernier contact, et la vue se rafraîchit d'elle-même.
 *
 * Un contact daté dans le futur — horloges du poste et du serveur décalées de
 * quelques secondes — reste un contact récent : le serveur vient de le voir.
 */
export function agentJoignable(dernierContact: string | null, maintenant: number): boolean {
  if (!dernierContact) return false;
  const instant = Date.parse(dernierContact);
  if (Number.isNaN(instant)) return false;
  return maintenant - instant < SECONDES_AGENT_JOIGNABLE * 1000;
}

/** Les trois visages du témoin : un agent qui répond, qui s'est tu, qui n'a jamais parlé. */
export type TemoinAgent = "joignable" | "silencieux" | "jamais";

export function temoinAgent(dernierContact: string | null, maintenant: number): TemoinAgent {
  if (!dernierContact || Number.isNaN(Date.parse(dernierContact))) return "jamais";
  return agentJoignable(dernierContact, maintenant) ? "joignable" : "silencieux";
}
