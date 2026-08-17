import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { appeler, ErreurApi } from "../api/client.js";

/**
 * La session courante, telle que **le serveur** la décrit.
 *
 * Le point important : les permissions ne sont jamais lues d'un jeton porté
 * par le client, ni mémorisées entre deux sessions. Elles sont demandées au
 * serveur, qui les recalcule à chaque appel (`ADR-0008`). Un client qui
 * garderait sa liste de permissions en cache continuerait d'afficher des
 * actions révoquées le matin même — et le serveur les refuserait, ce qui
 * donnerait à l'utilisateur l'impression d'un défaut.
 *
 * Ce que le client en fait relève de la **courtoisie** (`RG-GEN-06`) : masquer
 * ce qui serait refusé. Le contrôle, lui, reste entièrement au serveur.
 */

export type Session = {
  id: string;
  prenom: string;
  nom: string;
  email: string;
  login: string;
  avatarFichier: string | null;
  avatarPredefini: string | null;
  langue: string;
  theme: string;
  derniereConnexion: string | null;
  /** `EX-AUTH-09` — rattachement organisationnel, en lecture seule (vue 35). */
  departement: string | null;
  services: string[];
  membreDepuis: string;
  role: { code: string; nom: string } | null;
  permissions: string[];
  motDePasseAChanger: boolean;
};

type ContexteSession = {
  session: Session;
  permissions: ReadonlySet<string>;
  /** Vraie si la permission est détenue. Aucune inférence, aucun joker. */
  peut: (permission: string) => boolean;
  /** Oublie la session côté client après une déconnexion. */
  oublier: () => void;
};

const Contexte = createContext<ContexteSession | null>(null);

export const CLE_SESSION = ["session"] as const;

const chargerSession = () => appeler<Session>("/auth/me");

/**
 * Charge la session, ou rend l'alternative fournie.
 *
 * `enAttente` et `sansSession` sont des paramètres et non des rendus figés :
 * la coquille et la page de connexion n'ont pas la même idée de « pas encore
 * prêt ».
 */
export function FournisseurSession({
  children,
  enAttente,
  sansSession,
}: {
  children: (session: Session) => ReactNode;
  enAttente: ReactNode;
  sansSession: ReactNode;
}) {
  const client = useQueryClient();

  const requete = useQuery({
    queryKey: CLE_SESSION,
    queryFn: chargerSession,
    // Une session absente est une réponse, pas une panne : réessayer trois
    // fois un 401 retarde l'affichage de la page de connexion sans rien
    // changer au résultat.
    retry: (echecs, erreur) =>
      !(erreur instanceof ErreurApi && erreur.statut === 401) && echecs < 2,
    staleTime: 60_000,
  });

  const valeur = useMemo<ContexteSession | null>(() => {
    if (!requete.data) return null;
    const permissions = new Set(requete.data.permissions);
    return {
      session: requete.data,
      permissions,
      peut: (p) => permissions.has(p),
      oublier: () => client.setQueryData(CLE_SESSION, undefined),
    };
  }, [requete.data, client]);

  if (requete.isPending) return <>{enAttente}</>;
  if (!valeur) return <>{sansSession}</>;

  return <Contexte.Provider value={valeur}>{children(valeur.session)}</Contexte.Provider>;
}

/** La session, garantie présente : le fournisseur ne rend ses enfants qu'ensuite. */
export function useSession(): ContexteSession {
  const valeur = useContext(Contexte);
  if (!valeur) {
    throw new Error(
      "useSession hors de FournisseurSession — la vue serait rendue sans savoir qui la regarde.",
    );
  }
  return valeur;
}

/** Raccourci de lecture des droits, pour les rendus conditionnels. */
export const usePeut = (): ((permission: string) => boolean) => useSession().peut;
