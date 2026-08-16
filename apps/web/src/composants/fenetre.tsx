import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button, Dialog, Modal, ModalOverlay } from "react-aria-components";
import "./partages.css";

/**
 * La fenêtre modale du produit.
 *
 * Le comportement vient de `react-aria-components` — piège de focus, retour au
 * déclencheur à la fermeture, fermeture à l'échappement, `aria-modal`. Le
 * style vient des maquettes, à la classe près.
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
        <Dialog className="modal-dialogue" aria-label={titre}>
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
