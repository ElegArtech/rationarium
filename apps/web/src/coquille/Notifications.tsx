import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button } from "react-aria-components";
import * as api from "../api/notifications.js";
import { formaterDate, formaterDateLongue } from "../formats.js";

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

/**
 * ════════════════════════════════════════════════════════════════════════════
 * `RG-GEN-08`, `EX-NTF-01`, `RG-NTF-01` — **le panneau compose ses phrases.**
 *
 * DÉFAUT CONSTATÉ EN SECONDE PASSE (P-18, P-19, P-20, P-166), et c'est un effet
 * de la correction précédente : le serveur avait cessé d'écrire la phrase à
 * l'ÉMISSION pour la rendre à la LECTURE — juste — mais il la rend dans la
 * langue du COMPTE (`users.langue`, `notifications.service.ts` § `lister`). Or
 * la langue affichée est celle de la SESSION, posée par la bascule FR/EN de
 * l'en-tête. Sous interface anglaise, le cadre disait « Notifications / Mark
 * all as read » et les entrées « Décision sur votre demande de congé ». Les six
 * équivalents anglais existaient dans `libelles.ts` et n'étaient jamais
 * atteints.
 *
 * **Deux réponses possibles, et on tranche pour la seconde.**
 *
 *  1. Faire voyager la langue de session jusqu'au serveur — un paramètre de
 *     plus sur la route, une seconde autorité sur un fait que le navigateur
 *     détient déjà, et un serveur qui devrait la préférer à `users.langue`
 *     pour la cloche mais surtout PAS pour le courriel de `EX-NTF-04`, qui
 *     part sans navigateur. Deux règles opposées sur le même paramètre.
 *  2. **Le client rend la clé.** La réponse porte déjà `cle` et `params`
 *     depuis la vague 1 — `lister()` les expose et personne ne les lisait —
 *     et le panneau a la langue sous la main. Le serveur garde son rendu pour
 *     le courriel, qui n'a pas de navigateur, et pour le repli.
 *
 * La seconde ne déplace aucune donnée et supprime la question : il n'y a plus
 * de langue à choisir côté serveur pour un écran. C'est le même contrat que
 * `messages-metier.ts` — une clé, et sa phrase de repli.
 *
 * Le repli est explicite : une clé absente du catalogue rend la phrase du
 * serveur plutôt qu'un identifiant technique. i18next rend la CLÉ quand elle
 * manque, ce qui afficherait « notifications.corps_… » à l'écran.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Les deux familles sont composées à l'exécution ; l'analyse statique de
 * `i18n:check` ne peut pas les voir, on les lui déclare.
 *
 * i18n-familles: coquille:notifications.type_, coquille:notifications.corps_
 */

/** `cadrage/01 § M18` — l'intitulé se déduit du TYPE. La liste est fermée. */
export const cleTitre = (type: string): string => `notifications.type_${type}`;

/**
 * La clé du corps, ou `null` quand le serveur a rendu une phrase déjà rédigée.
 *
 * `conge_decide` porte les DEUX faces de la décision — `M18` n'énonce qu'un
 * type —, et le motif de refus est facultatif : trois phrases pour une clé.
 * Le motif reste dans la langue où son auteur l'a écrit, c'est une citation.
 */
export const cleCorps = (n: {
  cle: string | null;
  params: Record<string, string>;
}): string | null => {
  if (!n.cle) return null;
  if (n.cle !== "conge_decide") return `notifications.corps_${n.cle}`;
  if (n.params["decision"] !== "refuse") return "notifications.corps_conge_decide_approuve";
  return n.params["motif"]
    ? "notifications.corps_conge_decide_refuse_motif"
    : "notifications.corps_conge_decide_refuse";
};

/**
 * Les paramètres, mis en forme pour ICU.
 *
 * Trois précautions, et chacune correspond à un piège déjà payé :
 *
 *  - **Un placeholder manquant fait LEVER `intl-messageformat`**, ce qui
 *    viderait le panneau entier. Les cinq noms employés par le catalogue sont
 *    donc toujours fournis.
 *  - **`Number("")` vaut zéro** : le filtre porte sur la CHAÎNE, pas sur sa
 *    conversion, sinon un décompte absent s'afficherait « 0 jour ».
 *  - La date arrive en `AAAA-MM-JJ` du serveur (`notifications.service.ts`) et
 *    se formate selon le paramétrage global — `RG-GEN-09`, jamais à la main.
 */
export const parametresCorps = (
  params: Record<string, string>,
): Record<string, string | number> => {
  const brut = params["jours"];
  const jours = brut === undefined || brut === "" ? Number.NaN : Number(brut);
  return {
    tache: "",
    projet: "",
    motif: "",
    ...params,
    jours: Number.isFinite(jours) ? jours : 0,
    date: params["date"] ? formaterDate(params["date"]) : "",
  };
};

/**
 * La fonction de traduction, réduite à ce que la composition en attend.
 *
 * `TFunction` d'i18next est un type surchargé une dizaine de fois ; le lier ici
 * rendrait la règle intestable hors d'un composant. Chaque appelant fournit
 * l'adaptateur d'une ligne, et la règle reste une fonction pure.
 */
export type Traduire = (cle: string, params?: Record<string, string | number>) => string;

/** Ce que le lecteur voit, dans la langue de SA session. */
export function rendreNotification(
  n: {
    type: string;
    titre: string;
    contenu: string;
    cle: string | null;
    params: Record<string, string>;
  },
  t: Traduire,
): { titre: string; contenu: string } {
  const cleT = cleTitre(n.type);
  const titre = t(cleT);
  const cleC = cleCorps(n);
  const contenu = cleC ? t(cleC, parametresCorps(n.params)) : n.contenu;
  return {
    // Une clé que le catalogue ne connaît pas se rend elle-même : afficher
    // « notifications.type_xxx » serait pire que la phrase du serveur.
    titre: titre === cleT ? n.titre : titre,
    contenu: cleC && contenu === cleC ? n.contenu : contenu,
  };
}

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
  /* `t` d'i18next est surchargé ; la composition n'en veut qu'une signature. */
  const traduire: Traduire = (cle, params) => (params === undefined ? t(cle) : t(cle, params));
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
        {entrees.map((n) => {
          // `RG-GEN-08` — la phrase se compose ICI, dans la langue de la
          // session ; le rendu du serveur ne sert plus que de repli.
          const vu = rendreNotification(n, traduire);
          return (
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
                    {vu.titre}
                  </Link>
                ) : (
                  <span className="pop-title">{vu.titre}</span>
                )}
                <span className="pop-meta">{vu.contenu}</span>
                <span className="pop-meta">{formaterDateLongue(n.creeLe)}</span>
              </span>
              {!n.lue ? (
                <Button
                  className="chip-btn"
                  aria-label={t("notifications.marquerLue", { titre: vu.titre })}
                  onPress={() => lecture.mutate(n.id)}
                >
                  <span aria-hidden="true">●</span>
                </Button>
              ) : null}
            </div>
          );
        })}
      </div>
    </>
  );
}
