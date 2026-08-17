import { Fragment, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useQuery } from "@tanstack/react-query";
import { Button } from "react-aria-components";
import * as api from "../../api/administration.js";
import { usePeut } from "../../session/session.js";
import { Chargement, ErreurDeChargement, AccesRefuse } from "../../composants/etats.js";
import { AvatarAgent } from "../../composants/pastilles.js";
import { formaterDateLongue } from "../../formats.js";
import "../../composants/partages.css";
import "../taches/liste.css";
import "./audit.css";

/**
 * Vue 33 — Journal d'audit. **Lecture seule stricte.**
 *
 * Le brief est catégorique : « aucune action de modification ni de suppression
 * ne doit exister sur cette vue, **même désactivée**. L'absence totale
 * d'affordance d'écriture fait partie de la garantie. »
 *
 * Ce fichier n'importe donc **ni `useMutation`, ni `Fenetre`, ni
 * `useMessages`** : il n'y a rien à muter, rien à confirmer, rien à annoncer.
 * L'absence est structurelle, pas conditionnelle — et elle est **énoncée** en
 * tête de vue plutôt que laissée à deviner.
 *
 * Elle est doublée côté serveur : le rôle SQL applicatif n'a que `INSERT` et
 * `SELECT` sur `audit_log`. Une affordance d'écriture ici mentirait sur ce que
 * la base autorise.
 */

/** La famille d'une action, pour la pastille de couleur. */
function couleurDe(action: string): string {
  if (action.startsWith("auth.") || action.includes("login")) return "var(--st-doing)";
  if (action.includes("delete") || action.includes("denied")) return "var(--st-blocked)";
  if (action.includes("approve") || action.includes("create")) return "var(--st-done)";
  if (action.includes("export") || action.includes("download")) return "var(--st-review)";
  return "var(--muted)";
}

export function Audit() {
  const { t } = useTranslation("administration");
  const peut = usePeut();
  const [detail, setDetail] = useState<api.EvenementAudit | null>(null);

  const [filtres, setFiltres] = useState({
    typeEntite: "",
    entiteId: "",
    acteurId: "",
    action: "",
    depuis: "",
    jusqua: "",
  });
  const [curseurs, setCurseurs] = useState<api.Curseur[]>([]);

  const curseur = curseurs[curseurs.length - 1];

  /*
   * L'identifiant d'acteur est un UUID côté serveur. Une saisie en cours — six
   * caractères tapés sur trente-six — n'est pas un filtre : la transmettre
   * ferait tomber la page entière en erreur à chaque frappe. Elle n'agit donc
   * qu'une fois complète. Ce n'est pas un contrôle de validité qui remplacerait
   * celui du serveur : le serveur valide toujours ce qu'il reçoit.
   */
  const acteurUtilisable = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    filtres.acteurId,
  );

  const requete = useQuery({
    queryKey: ["audit", filtres, acteurUtilisable, curseur],
    queryFn: () =>
      api.journal({
        ...filtres,
        acteurId: acteurUtilisable ? filtres.acteurId : "",
        ...(curseur
          ? { curseurHorodatage: curseur.horodatage, curseurId: curseur.id }
          : {}),
      }),
    enabled: peut("audit:read"),
  });

  const facettes = useQuery({
    queryKey: ["audit", "facettes"],
    queryFn: api.facettesAudit,
    enabled: peut("audit:read"),
  });

  // `RG-ADM-03` — l'accès refusé est tracé côté serveur. Ici on dit seulement
  // ce qui manque, sans détailler ce qu'il y a derrière.
  if (!peut("audit:read")) return <AccesRefuse />;

  const champ = (cle: keyof typeof filtres) => ({
    value: filtres[cle],
    onChange: (e: { target: { value: string } }) => {
      setCurseurs([]);
      setFiltres((f) => ({ ...f, [cle]: e.target.value }));
    },
  });

  /* `RG-GEN-04` — l'état vide propose l'action suivante ; sur une vue de
     consultation filtrée, cette action est de relâcher les filtres. */
  const reinitialiser = () => {
    setCurseurs([]);
    setFiltres({
      typeEntite: "",
      entiteId: "",
      acteurId: "",
      action: "",
      depuis: "",
      jusqua: "",
    });
  };

  return (
    <div className="page">
      <div className="pl-toolbar">
        <div>
          <span className="eyebrow">{t("audit.surtitre")}</span>
          <h1 className="h1 titre-vue">{t("audit.titre")}</h1>
          <p className="lede lede-vue">{t("audit.chapeau")}</p>
        </div>
      </div>

      {/*
        La garantie est énoncée, pas devinée. Elle est vraie à trois niveaux :
        cette vue n'offre aucune écriture, le serveur ne l'expose pas, et le
        rôle SQL applicatif n'a que INSERT et SELECT sur la table.
      */}
      <p className="ro-badge">
        <span aria-hidden="true">🔒</span>
        <span>
          <span className="ro-t">{t("audit.lectureSeule")}</span>
          <span className="ro-d">{t("audit.lectureSeuleExplication")}</span>
        </span>
      </p>

      <div className="filters">
        <select
          className="f-input"
          aria-label={t("audit.typeEntite")}
          {...champ("typeEntite")}
        >
          <option value="">{t("audit.tousTypes")}</option>
          {(facettes.data?.typesEntite ?? []).map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
        <select className="f-input" aria-label={t("audit.action")} {...champ("action")}>
          <option value="">{t("audit.toutesActions")}</option>
          {(facettes.data?.actions ?? []).map((x) => (
            <option key={x} value={x}>
              {/*
                `RG-GEN-03` — un code technique n'est pas un libellé. Ce menu
                n'offrait que `auth.login.success` : lisible pour qui a écrit
                le serveur, opaque pour l'administrateur qui cherche « Congé
                approuvé ». Le code reste affiché à côté, comme la maquette le
                fait, parce que c'est lui qu'on retrouve dans un signalement.
              */}
              {t(`audit.action_${x.replaceAll(".", "_")}`, x)} · {x}
            </option>
          ))}
        </select>
        {/*
          `EX-ADM-08` — « filtrer par type d'entité, ENTITÉ, ACTEUR, action,
          plage de dates ». Les deux champs du milieu existaient dans l'état de
          la vue et n'avaient **aucun contrôle** : le filtre était déclaré,
          jamais atteignable. C'est le genre d'absence qu'aucune boucle ne voit,
          parce que l'état par défaut d'un filtre vide est un filtre inactif.
        */}
        <input
          className="f-input f-input-recherche"
          type="search"
          aria-label={t("audit.entiteId")}
          placeholder={t("audit.entiteId")}
          {...champ("entiteId")}
        />
        <input
          className="f-input f-input-recherche"
          type="search"
          aria-label={t("audit.acteurId")}
          placeholder={t("audit.acteurId")}
          {...champ("acteurId")}
        />
        <label className="field-label label-inline" htmlFor="audit-depuis">
          {t("audit.du")}
        </label>
        <input
          className="f-input"
          id="audit-depuis"
          type="date"
          aria-label={t("audit.depuis")}
          {...champ("depuis")}
        />
        <label className="field-label label-inline" htmlFor="audit-jusqua">
          {t("audit.au")}
        </label>
        <input
          className="f-input"
          id="audit-jusqua"
          type="date"
          aria-label={t("audit.jusqua")}
          {...champ("jusqua")}
        />
        <Button className="chip-btn" onPress={reinitialiser}>
          {t("audit.reinitialiser")}
        </Button>
      </div>

      {requete.isPending ? <Chargement quoi={t("audit.leJournal")} /> : null}
      {requete.isError ? (
        <ErreurDeChargement erreur={requete.error} surReessai={() => void requete.refetch()} />
      ) : null}

      {requete.data ? (
        requete.data.entrees.length === 0 ? (
          <section className="panel">
            <div className="empty">
              <p>{t("audit.videTitre")}</p>
              <small>{t("audit.videExplication")}</small>
              <Button className="chip-btn" onPress={reinitialiser}>
                {t("reinitialiserFiltres")}
              </Button>
            </div>
          </section>
        ) : (
          <section className="panel">
            <div className="au-grid au-head">
              <span>{t("audit.colDate")}</span>
              <span>{t("audit.colAction")}</span>
              <span>{t("audit.colType")}</span>
              <span>{t("audit.colEntite")}</span>
              <span>{t("audit.colActeur")}</span>
            </div>

            {requete.data.entrees.map((e) => (
              /* La ligne ouvre le détail. C'est une CONSULTATION : le tiroir
                 n'offre aucune écriture, et le dit. */
              <Button className="au-grid au-row" key={e.id} onPress={() => setDetail(e)}>
                <span className="bloc-etroit">
                  <span className="au-when">{formaterDateLongue(e.horodatage)}</span>
                  <span className="au-ago">{ilYA(e.horodatage, t)}</span>
                </span>

                <span className="au-act" style={{ color: couleurDe(e.action) }}>
                  <span className="au-dot" aria-hidden="true" />
                  <span className="bloc-etroit">
                    {/* Le point est le séparateur de niveau d'i18next : le
                        code `leave.approve` deviendrait une clé imbriquée.
                        Il est aplati, et le code brut reste la valeur de
                        repli — une action non traduite reste lisible. */}
                    <span className="au-lab">
                      {t(`audit.action_${e.action.replaceAll(".", "_")}`, e.action)}
                    </span>
                    <span className="au-code">{e.action}</span>
                  </span>
                </span>

                <span>
                  <span className="pill" style={{ color: couleurDe(e.action) }}>
                    {t(`audit.type_${e.typeEntite}`, e.typeEntite)}
                  </span>
                </span>

                <span className="bloc-etroit">
                  <span className="au-ent">{e.typeEntite}</span>
                  <span className="au-id">{e.entiteId}</span>
                </span>

                <span className="au-who">
                  {/*
                    `RG-ADM-09` — une action système n'est pas une action
                    humaine, et un acteur supprimé laisse sa trace : l'entrée
                    survit à la personne, c'est le point d'un journal.

                    **Trois cas, pas deux.** « Système » et « acteur inconnu »
                    étaient confondus (`e.systeme || !e.acteur`), si bien qu'un
                    `auth.login.failed` — une tentative HUMAINE, par définition
                    non authentifiée, donc sans acteur — s'affichait « Système ».
                    Le journal affirmait alors qu'un traitement automatique
                    avait échoué à se connecter. Un journal d'audit qui se
                    trompe d'auteur ne vaut rien.
                  */}
                  {e.systeme ? (
                    <>
                      <span className="au-sys" aria-hidden="true">
                        SYS
                      </span>
                      <span className="au-wn">{t("audit.systeme")}</span>
                    </>
                  ) : !e.acteur ? (
                    <>
                      <span className="agent-av" aria-hidden="true">
                        ?
                      </span>
                      <span className="au-wn">{t("audit.acteurInconnu")}</span>
                    </>
                  ) : e.acteur.supprime ? (
                    <span className="au-wn">{t("audit.acteurSupprime")}</span>
                  ) : (
                    <>
                      <AvatarAgent prenom={e.acteur.prenom ?? ""} nom={e.acteur.nom ?? ""} />
                      <span className="au-wn">
                        {e.acteur.prenom} {e.acteur.nom}
                      </span>
                    </>
                  )}
                </span>
              </Button>
            ))}

            <div className="pager">
              {/* Le brief pose « {n} événement(s) » à gauche de la pagination.
                  Le compte est celui de la PAGE : sur une table partitionnée
                  qui grossit en continu, un total exact coûterait un balayage
                  complet à chaque frappe de filtre. Le libellé le dit. */}
              <span className="pager-n pager-compte">
                {t("audit.compteEvenements", { n: requete.data.entrees.length })}
              </span>
              <Button
                className="chip-btn"
                isDisabled={curseurs.length === 0}
                onPress={() => setCurseurs((c) => c.slice(0, -1))}
              >
                {t("audit.precedent")}
              </Button>
              <span className="pager-n">
                {t("audit.pageCourante", { n: curseurs.length + 1 })}
              </span>
              {/*
                Pagination par CURSEUR, pas par décalage : sur une table
                partitionnée qui grossit en continu, un OFFSET profond coûte
                cher et fait sauter des lignes quand de nouvelles s'insèrent
                pendant la lecture.
              */}
              <Button
                className="chip-btn"
                isDisabled={!requete.data.curseurSuivant}
                onPress={() =>
                  setCurseurs((c) =>
                    requete.data.curseurSuivant ? [...c, requete.data.curseurSuivant] : c,
                  )
                }
              >
                {t("audit.suivant")}
              </Button>
            </div>
          </section>
        )
      ) : null}

      <TiroirEvenement evenement={detail} surFermeture={() => setDetail(null)} />
    </div>
  );
}

/**
 * Le détail d'un événement — **consultation seule**.
 *
 * Le tiroir n'offre aucune commande d'écriture, et il l'énonce : l'immuabilité
 * du journal est une garantie, donc elle se lit, elle ne se devine pas à
 * l'absence de boutons.
 */
function TiroirEvenement({
  evenement,
  surFermeture,
}: {
  evenement: api.EvenementAudit | null;
  surFermeture: () => void;
}) {
  const { t } = useTranslation("administration");
  const { t: tCommun } = useTranslation("commun");
  const fermeture = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (evenement) fermeture.current?.focus();
  }, [evenement]);

  /* Les mêmes trois cas que la ligne, et pour la même raison : le tiroir ne
     peut pas nommer un auteur autrement que la ligne qui l'a ouvert. */
  const acteur = !evenement
    ? ""
    : evenement.systeme
      ? t("audit.systeme")
      : !evenement.acteur
        ? t("audit.acteurInconnu")
        : evenement.acteur.supprime
          ? t("audit.acteurSupprime")
          : `${evenement.acteur.prenom ?? ""} ${evenement.acteur.nom ?? ""}`.trim();

  const lignes: [string, string][] = evenement
    ? [
        [t("audit.detailHorodatage"), formaterDateLongue(evenement.horodatage)],
        [t("audit.detailAction"), evenement.action],
        [t("audit.detailType"), evenement.typeEntite],
        [t("audit.detailEntite"), evenement.entiteId],
        [t("audit.detailActeur"), acteur],
        [t("audit.detailIdentifiant"), evenement.id],
      ]
    : [];

  /*
   * Le tiroir reste dans le document, comme la maquette : il glisse, il
   * n'apparaît pas. Fermé, il est `inert` — la maquette, elle, se contente
   * d'`aria-hidden`, ce qui laisse un bouton focalisable hors écran : `axe` le
   * refuse (`aria-hidden-focus`), et le clavier y tombe sans rien voir.
   */
  return (
    <aside
      className={evenement ? "drawer is-open" : "drawer"}
      aria-label={t("audit.evenementTrace")}
      inert={!evenement}
    >
      <div className="drawer-head">
        <div className="bloc-etroit">
          <span className="eyebrow">{t("audit.evenementTrace")}</span>
          <p className="panel-title titre-tiroir">
            {evenement
              ? t(`audit.action_${evenement.action.replaceAll(".", "_")}`, evenement.action)
              : "—"}
          </p>
        </div>
        <Button
          className="icon-btn"
          ref={fermeture}
          onPress={surFermeture}
          aria-label={tCommun("fermer")}
        >
          <span aria-hidden="true">×</span>
        </Button>
      </div>
      <div className="drawer-body">
        <dl className="au-detail">
          {lignes.map(([cle, valeur]) => (
            <Fragment key={cle}>
              <dt>{cle}</dt>
              <dd>{valeur}</dd>
            </Fragment>
          ))}
        </dl>

        {/* Le contexte brut, tel qu'il a été enregistré. On ne le reformate
            pas : ce qui est montré doit être ce qui est stocké. */}
        <div className="au-ctx">
          {evenement?.detail === null || evenement?.detail === undefined
            ? t("audit.aucunContexte")
            : JSON.stringify(evenement.detail, null, 2)}
        </div>

        <p className="field-hint hint-tiroir">{t("audit.immuable")}</p>
      </div>
    </aside>
  );
}

/**
 * L'écart au présent, en mots.
 *
 * Il complète l'horodatage, il ne le remplace pas : « il y a 3 heures » se lit
 * d'un coup d'œil, mais un journal d'audit se cite à la seconde près. Les trois
 * clés sont appelées en clair — une clé construite échapperait au contrôle
 * `i18n:check`, qui ne verrait plus qu'une famille sans emploi.
 */
function ilYA(horodatage: string, t: TFunction<"administration">): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(horodatage).getTime()) / 60000));
  if (minutes < 60) return t("audit.ilYAMinutes", { n: minutes });
  const heures = Math.round(minutes / 60);
  if (heures < 24) return t("audit.ilYAHeures", { n: heures });
  return t("audit.ilYAJours", { n: Math.round(heures / 24) });
}
