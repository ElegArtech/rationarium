import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { changerLangue, LANGUES } from "../i18n/index.js";
import { Button } from "react-aria-components";
import i18next from "i18next";

/**
 * Gabarit des vues d'accès — vues 01 à 05.
 *
 * Page pleine, sans coquille applicative : deux zones, l'identité du produit
 * et le formulaire. Le sélecteur de langue reste accessible avant connexion,
 * sans quoi un utilisateur anglophone ne pourrait pas lire la page qui lui
 * demande de s'identifier.
 */
export function GabaritAcces({ titre, children }: { titre: string; children: ReactNode }) {
  const { t } = useTranslation("coquille");
  const courante = i18next.language;

  return (
    <div className="acces">
      <aside className="acces-marque" aria-hidden="true">
        <p className="marque-nom">Trame</p>
        <p className="marque-signature">
          Une seule grille temporelle réconcilie tout ce qui occupe une personne.
        </p>
      </aside>

      <main className="acces-panneau">
        <div className="acces-barre">
          <div role="group" aria-label={t("entete.langue")} className="lang-switch">
            {LANGUES.map((l) => (
              <Button
                key={l}
                className="chip-btn"
                aria-pressed={courante === l}
                onPress={() => void changerLangue(l)}
              >
                {l.toUpperCase()}
              </Button>
            ))}
          </div>
        </div>
        <h1 className="acces-titre">{titre}</h1>
        {children}
      </main>
    </div>
  );
}
