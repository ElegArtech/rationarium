import { useEffect, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button, Dialog, Modal, ModalOverlay } from "react-aria-components";
import "./partages.css";

/**
 * La fenêtre modale du produit.
 *
 * Le comportement vient de `react-aria-components` — piège de focus, retour au
 * déclencheur à la fermeture, `aria-modal`. Le style vient des maquettes, à la
 * classe près.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * DÉFAUT TROUVÉ PAR L'AUDIT L-25 — **la fenêtre ne prenait pas le focus.**
 *
 * À l'ouverture, `document.activeElement` restait `BODY` : l'arrière-plan
 * devient inerte, le déclencheur perd le focus, et rien ne le reprend. Trois
 * conséquences, dont deux invisibles à `axe` :
 *
 *   1. Échap ne fermait pas — l'événement n'atteignait pas la surcouche ;
 *   2. l'utilisateur au clavier était renvoyé en tête de document ;
 *   3. un lecteur d'écran n'annonçait pas l'ouverture.
 *
 * Le focus est donc **posé explicitement** ici. Ce n'est pas contourner la
 * bibliothèque : c'est une garantie que ce composant doit à ses appelants, et
 * qui ne peut pas dépendre d'un détail d'assemblage.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * **Le pied porte toujours une mention de gauche.** Dans les maquettes ce n'est
 * jamais un ornement : c'est là que se dit « * champ obligatoire », « aucune
 * donnée n'est supprimée », « aucune tâche n'est supprimée ». L'information qui
 * lève l'inquiétude est placée à côté du bouton qui l'inspire.
 */
export function Fenetre({
  ouverte,
  surFermeture,
  categorie,
  titre,
  large = false,
  mention,
  actions,
  children,
}: {
  ouverte: boolean;
  surFermeture: () => void;
  /** La ligne de surtitre : « Action irréversible », « Nouveau projet »… */
  categorie: string;
  titre: string;
  large?: boolean;
  mention?: string;
  actions: ReactNode;
  children: ReactNode;
}) {
  const { t } = useTranslation("commun");
  const dialogue = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ouverte) return;
    // Un cadre : le contenu monte au tour suivant, et focaliser trop tôt
    // viserait un nœud qui n'existe pas encore.
    const image = requestAnimationFrame(() => {
      /*
       * Le **premier élément focalisable**, et non le conteneur. Le conteneur
       * porte bien `tabindex="-1"`, mais le focaliser ne suffit pas : les
       * gestionnaires de touches de la surcouche n'écoutent que depuis un
       * descendant réellement focalisable. C'est ce qui faisait qu'Échap ne
       * fermait pas — vérifié en focalisant un champ à la main, où Échap
       * fonctionne aussitôt.
       */
      const cible = dialogue.current?.querySelector<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      (cible ?? dialogue.current)?.focus();
    });
    return () => cancelAnimationFrame(image);
  }, [ouverte]);

  return (
    <ModalOverlay
      className="scrim-modal"
      isOpen={ouverte}
      onOpenChange={(o) => {
        if (!o) surFermeture();
      }}
      isDismissable
    >
      <Modal className={large ? "modal modal-lg" : "modal"}>
        <Dialog className="modal-dialogue" aria-label={titre} ref={dialogue}>
          <div className="modal-head">
            <div>
              <span className="eyebrow">{categorie}</span>
              <p className="panel-title modal-titre">{titre}</p>
            </div>
            <Button className="icon-btn" onPress={surFermeture} aria-label={t("fenetre.fermer")}>
              <span aria-hidden="true">×</span>
            </Button>
          </div>

          <div className="modal-body">{children}</div>

          <div className="modal-foot">
            <span className="eyebrow">{mention ?? ""}</span>
            <span className="modal-actions">{actions}</span>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
