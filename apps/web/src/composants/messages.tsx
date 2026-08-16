import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import "./partages.css";

/**
 * La file de messages d'action — les « toasts » des maquettes.
 *
 * **La région est vive (`role="status"`, `aria-live="polite"`).** Un retour
 * d'action qui n'est qu'affiché ne parvient jamais à qui ne regarde pas
 * l'écran : « Statut mis à jour » disparaît en trois secondes, et une personne
 * utilisant un lecteur d'écran n'aurait aucun moyen de savoir que son geste a
 * abouti.
 *
 * `assertive` est réservé à l'échec : une confirmation qui interromprait la
 * lecture en cours serait plus gênante qu'utile.
 */

export type NatureMessage = "ok" | "warn" | "err";

type Message = { id: number; nature: NatureMessage; texte: string };

const Contexte = createContext<((nature: NatureMessage, texte: string) => void) | null>(null);

/** Durée d'affichage. Assez pour être lu, assez court pour ne pas encombrer. */
const DUREE = 5_000;

export function FournisseurMessages({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<Message[]>([]);

  const annoncer = useCallback((nature: NatureMessage, texte: string) => {
    const id = Date.now() + Math.random();
    setMessages((f) => [...f, { id, nature, texte }]);
    setTimeout(() => setMessages((f) => f.filter((m) => m.id !== id)), DUREE);
  }, []);

  const separes = useMemo(
    () => ({
      calmes: messages.filter((m) => m.nature !== "err"),
      urgents: messages.filter((m) => m.nature === "err"),
    }),
    [messages],
  );

  return (
    <Contexte.Provider value={annoncer}>
      {children}
      <div className="toasts">
        <div role="status" aria-live="polite" className="toasts-groupe">
          {separes.calmes.map((m) => (
            <p key={m.id} className={`toast toast-${m.nature}`}>
              {m.texte}
            </p>
          ))}
        </div>
        <div role="alert" aria-live="assertive" className="toasts-groupe">
          {separes.urgents.map((m) => (
            <p key={m.id} className="toast toast-err">
              {m.texte}
            </p>
          ))}
        </div>
      </div>
    </Contexte.Provider>
  );
}

/**
 * Annonce un retour d'action.
 *
 * Hors fournisseur, la fonction ne fait rien plutôt que de lever : un message
 * de confirmation perdu est un défaut d'ergonomie, pas une raison de faire
 * tomber la vue qui l'émettait.
 */
export function useMessages(): (nature: NatureMessage, texte: string) => void {
  return useContext(Contexte) ?? (() => undefined);
}
