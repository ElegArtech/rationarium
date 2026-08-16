import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

export function PanneauNotifications() {
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

  return (
    <>
      <div className="notif-head">
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

      <div className="notif-liste">
        {entrees.map((n) => (
          <div className={`notif${n.lue ? " is-lue" : ""}`} key={n.id}>
            <span className="notif-corps">
              {/* Le lien mène à l'objet : une notification qui ne mène nulle
                  part oblige à le retrouver à la main. */}
              {n.lien ? (
                <a className="notif-titre" href={n.lien}>
                  {n.titre}
                </a>
              ) : (
                <span className="notif-titre">{n.titre}</span>
              )}
              <span className="notif-texte">{n.contenu}</span>
              <span className="notif-quand">{formaterDateLongue(n.creeLe)}</span>
            </span>
            {!n.lue ? (
              <Button
                className="notif-lue"
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
