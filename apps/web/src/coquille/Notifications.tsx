import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button } from "react-aria-components";
import * as api from "../api/notifications.js";
import { formaterDateLongue } from "../formats.js";

/**
 * `EX-NTF-01` à `EX-NTF-03` — le panneau de la cloche.
 *
 * **Une notification lue reste visible.** La faire disparaître au clic ferait
 * perdre ce qu'on vient de lire avant d'avoir eu le temps d'agir dessus ; elle
 * change d'apparence, elle ne s'efface pas.
 *
 * Le panneau ne pousse rien : il interroge à l'ouverture et sur un intervalle
 * long. `C1` — réseau fermé, pas de canal poussé ; et une cloche qui
 * interrogerait toutes les secondes coûterait plus qu'elle ne rapporte pour
 * quelques centaines de notifications par jour.
 */

export const CLE_NOTIFICATIONS = ["notifications"] as const;

/**
 * `EX-NTF-02` — **ouvrir une notification, c'est la lire.**
 *
 * Ce que le parcours a relevé : compteur à trois, l'objet ouvert, compteur
 * toujours à trois. Seule la pastille « ● » marquait, si bien que l'agent
 * devait faire deux gestes pour un seul acte — et que la cloche continuait
 * d'annoncer un travail déjà fait, ce qui la rend inutile à force.
 *
 * La règle est isolée ici pour être vérifiable : elle rend l'identifiant à
 * marquer, ou `null` quand il n'y a rien à écrire. Réécrire une notification
 * déjà lue serait une requête pour rien, et un `409` en puissance.
 */
export const lectureALOuverture = (n: { id: string; lue: boolean }): string | null =>
  n.lue ? null : n.id;

/**
 * `EX-NTF-03`, `RG-NTF-01` — **le lien d'une notification, découpé pour le
 * routeur.**
 *
 * TanStack Router NE DÉCOUPE PAS le `#` d'un `to` : `to` et `hash` sont deux
 * options distinctes, et `buildLocation({ to: "/conges#aValider" })` rend un
 * `pathname` de `"/conges#aValider"`, qui ne correspond à aucune route. Le
 * serveur écrit pourtant ses liens sous cette forme — `/conges#aValider`,
 * `/conges#mesDemandes` — parce que l'onglet de la vue 19 est un état
 * d'adresse porté par le fragment.
 *
 * Les deux moitiés étaient justes : le serveur pointait le bon onglet, la vue
 * savait le lire. C'est le raccord qui cassait, et il cassait en silence — un
 * lien qui ne mène nulle part n'est ni une erreur de typage, ni une violation
 * d'accessibilité, ni un échec de rendu.
 */
export const decouperLien = (lien: string): { to: string; hash?: string } => {
  const coupe = lien.indexOf("#");
  if (coupe < 0) return { to: lien };
  const to = lien.slice(0, coupe);
  const hash = lien.slice(coupe + 1);
  // Un fragment vide n'est pas un fragment : `to: "/conges", hash: ""` poserait
  // un « # » nu dans l'adresse. Et un lien réduit à un fragment garde sa forme.
  return hash ? { to: to || lien, hash } : { to: to || lien };
};

export function PanneauNotifications({
  surOuverture,
}: {
  /**
   * Referme le panneau quand on suit une notification.
   *
   * Nécessaire depuis que le lien passe par le routeur : l'ancre brute
   * rechargeait le document, ce qui refermait tout par accident. La
   * surcouche, elle, reste ouverte au-dessus de la vue d'arrivée si personne
   * ne la referme — un effet de bord de la correction, pas une préférence.
   */
  surOuverture?: () => void;
} = {}) {
  const { t } = useTranslation("coquille");
  const client = useQueryClient();

  const requete = useQuery({
    queryKey: CLE_NOTIFICATIONS,
    queryFn: () => api.notifications({ limite: 20 }),
  });

  const rafraichir = () => client.invalidateQueries({ queryKey: CLE_NOTIFICATIONS });

  const lecture = useMutation({
    mutationFn: (id: string) => api.marquerLue(id),
    onSuccess: () => void rafraichir(),
  });

  const toutLu = useMutation({
    mutationFn: api.toutMarquerLu,
    onSuccess: () => void rafraichir(),
  });

  const entrees = requete.data?.entrees ?? [];

  /**
   * L'invalidation survit au départ de la vue : elle passe par le
   * `MutationCache` de `main.tsx`, qui périme `["notifications"]` après toute
   * écriture réussie — le panneau, lui, est démonté par la navigation qui
   * suit le clic.
   */
  const ouvrir = (n: { id: string; lue: boolean }) => {
    const aMarquer = lectureALOuverture(n);
    if (aMarquer) lecture.mutate(aMarquer);
    surOuverture?.();
  };

  return (
    <>
      <div className="pop-head">
        <p className="panel-title">{t("notifications.titre")}</p>
        {(requete.data?.nonLues ?? 0) > 0 ? (
          <Button
            className="chip-btn"
            isPending={toutLu.isPending}
            onPress={() => toutLu.mutate()}
          >
            {t("notifications.toutMarquerLu")}
          </Button>
        ) : null}
      </div>

      {requete.isPending ? <p className="empty">{t("notifications.chargement")}</p> : null}

      {requete.data && entrees.length === 0 ? (
        <div className="empty">
          <p>{t("notifications.aucune")}</p>
          <small>{t("notifications.aucuneAide")}</small>
        </div>
      ) : null}

      <div className="pop-list">
        {entrees.map((n) => (
          <div className={`pop-item${n.lue ? "" : " is-unread"}`} key={n.id}>
            {/* La pastille de non-lu est portée par la liste, pas par un point
                dans le texte : c'est ce que fait la maquette, et c'est ce qui
                permet de la lire en survolant la colonne de gauche. */}
            <span className="pop-mark" aria-hidden="true" />
            <span className="pop-body">
              {/* Le lien mène à l'objet : une notification qui ne mène nulle
                  part oblige à le retrouver à la main. */}
              {n.lien ? (
                /*
                 * `Link`, et non `<a href>` : une ancre brute sort du routeur
                 * et RECHARGE le document entier — le lot, la session, les
                 * réglages et le compteur qu'on vient de décrémenter. Le
                 * défaut était corrigé pour la barre latérale et resté ici.
                 */
                <Link
                  className="pop-title"
                  {...decouperLien(n.lien)}
                  onClick={() => ouvrir(n)}
                >
                  {n.titre}
                </Link>
              ) : (
                <span className="pop-title">{n.titre}</span>
              )}
              <span className="pop-meta">{n.contenu}</span>
              <span className="pop-meta">{formaterDateLongue(n.creeLe)}</span>
            </span>
            {!n.lue ? (
              <Button
                className="chip-btn"
                aria-label={t("notifications.marquerLue", { titre: n.titre })}
                onPress={() => lecture.mutate(n.id)}
              >
                <span aria-hidden="true">●</span>
              </Button>
            ) : null}
          </div>
        ))}
      </div>
    </>
  );
}
