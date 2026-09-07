import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button } from "react-aria-components";
import * as api from "../../api/administration.js";
import { ErreurApi } from "../../api/client.js";
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
  });

  const facettes = useQuery({
    queryKey: ["audit", "facettes"],
    queryFn: api.facettesAudit,
  });

  /*
   * `RG-ADM-03` — **l'accès refusé est tracé, et c'est le SERVEUR qui le
   * trace.**
   *
   * DÉFAUT ACTIF CORRIGÉ (P-91). Les deux requêtes portaient
   * `enabled: peut("audit:read")` et la vue rendait ce refus **avant tout
   * appel** : aucune requête n'atteignait le serveur, donc
   * `permissions.garde.ts` — le seul endroit du produit qui trace un refus —
   * n'avait rien à refuser et rien à tracer. La règle vivait au serveur, juste
   * et prouvée, et le client la rendait inatteignable. Le commentaire qui
   * tenait cette ligne disait « l'accès refusé est tracé côté serveur »,
   * douze caractères au-dessus de ce qui garantissait le contraire.
   *
   * La requête part donc toujours, et c'est le `403` reçu qui prononce le
   * refus. Le masque de courtoisie de `RG-GEN-06` porte sur les COMMANDES
   * — on ne propose pas une écriture qui sera refusée ; il ne porte pas sur
   * la lecture d'une vue entière, qui est précisément l'accès dont
   * `RG-ADM-03` veut la trace.
   *
   * Aucune boucle de reprise à craindre : `main.tsx` ne réessaie pas une
   * réponse en dessous de 500 — « réessayer un refus n'a jamais fait changer
   * d'avis un serveur ».
   */
  if (requete.error instanceof ErreurApi && requete.error.statut === 403)
    return <AccesRefuse />;

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
 * `EX-ADM-03` — **la vue qui montre l'entité tracée, quand elle en a une.**
 *
 * Le journal ne stocke qu'un type et un identifiant. Trois types ont une vue à
 * eux dans le produit ; les autres — un réglage, un jour férié, un point
 * d'entrée refusé — n'en ont pas, et un lien mort vaut moins qu'un texte nu.
 *
 * L'identifiant est vérifié avant d'être suivi : `typeEntite` vaut `Endpoint`
 * pour un refus tracé par la garde, et `entiteId` y porte alors
 * « GET /api/… », pas un UUID.
 *
 * **Ce que cette fonction ne fait toujours pas** : NOMMER l'entité. Le nom
 * n'est pas dans la trace — le serveur ne joint aucun libellé —, et l'inventer
 * ici demanderait une requête par ligne. Remonté.
 */
export type VueDEntite = "utilisateur" | "projet" | "tache" | null;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function vueDeLEntite(typeEntite: string, entiteId: string): VueDEntite {
  if (!UUID.test(entiteId)) return null;
  if (typeEntite === "User") return "utilisateur";
  if (typeEntite === "Project") return "projet";
  if (typeEntite === "Task") return "tache";
  return null;
}

function LienEntite({ typeEntite, entiteId }: { typeEntite: string; entiteId: string }) {
  const cible = vueDeLEntite(typeEntite, entiteId);
  if (cible === "utilisateur")
    return (
      <Link to="/utilisateurs/$id/suivi" params={{ id: entiteId }}>
        {entiteId}
      </Link>
    );
  if (cible === "projet")
    return (
      <Link to="/projets/$id" params={{ id: entiteId }}>
        {entiteId}
      </Link>
    );
  if (cible === "tache")
    return (
      <Link to="/taches/$id" params={{ id: entiteId }}>
        {entiteId}
      </Link>
    );
  return <>{entiteId}</>;
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

  const lignes: [string, ReactNode][] = evenement
    ? [
        [t("audit.detailHorodatage"), formaterDateLongue(evenement.horodatage)],
        [t("audit.detailAction"), evenement.action],
        [t("audit.detailType"), evenement.typeEntite],
        /* `EX-ADM-03` — l'entité visée est ATTEIGNABLE quand elle a une vue.
           Elle restait un UUID nu : Karim voyait qu'un projet avait changé,
           sans pouvoir aller voir lequel. */
        [
          t("audit.detailEntite"),
          <LienEntite key="entite" typeEntite={evenement.typeEntite} entiteId={evenement.entiteId} />,
        ],
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

        {/*
          `EX-ADM-03` — **le contexte se lit avant de se citer.**

          Le tiroir ne rendait que le JSON brut :
          `{"apres":{…,"roleId":"cdb5aaa8-…"},"avant":{…,"roleId":"539c0a16-…"}}`.
          Karim y voyait qu'un rôle avait changé, jamais lequel, et devait
          apparier deux objets à la main pour trouver le champ qui diffère.
          Les champs modifiés sont donc énumérés en clair, avant → après.
        */}
        {evenement ? <ChangementsLisibles detail={evenement.detail} /> : null}

        {/* Le contexte brut, tel qu'il a été enregistré. On ne le reformate
            pas : ce qui est montré doit être ce qui est stocké. Il reste
            au-dessous de la lecture, il ne la remplace pas. */}
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
 * `EX-ADM-03` — **ce qui a changé, champ par champ.**
 *
 * Le journal enregistre son contexte sous la forme `{ avant, apres }` : deux
 * objets entiers, dont un seul champ diffère la plupart du temps. Le tiroir
 * n'en rendait que le JSON, et retrouver ce champ demandait d'apparier deux
 * listes de clés à l'œil — sur une écriture de compte, dix champs identiques
 * encadrant celui qui a bougé.
 *
 * Isolé du rendu pour être vérifiable : c'est le calcul qui porte la règle.
 *
 * **Ce que cette fonction ne fait pas, et ne peut pas faire ici** : nommer ce
 * qu'un identifiant désigne. `roleId: "cdb5aaa8-…"` reste un UUID tant que le
 * serveur ne joint pas le libellé à la trace — remonté.
 */
export type Changement = { champ: string; avant: string; apres: string };

const enTexte = (v: unknown): string =>
  v === undefined || v === null
    ? "—"
    : typeof v === "string"
      ? v
      : typeof v === "number" || typeof v === "boolean"
        ? String(v)
        : JSON.stringify(v);

export function changements(detail: unknown): Changement[] {
  if (typeof detail !== "object" || detail === null || Array.isArray(detail)) return [];
  const d = detail as Record<string, unknown>;
  if (!("avant" in d) && !("apres" in d)) return [];

  const estObjet = (v: unknown) => typeof v === "object" && v !== null && !Array.isArray(v);
  if (estObjet(d.avant) || estObjet(d.apres)) {
    const avant = estObjet(d.avant) ? (d.avant as Record<string, unknown>) : {};
    const apres = estObjet(d.apres) ? (d.apres as Record<string, unknown>) : {};
    // L'union des deux jeux de clés : un champ AJOUTÉ n'existe que dans
    // `apres`, un champ retiré que dans `avant` — n'en lire qu'un des deux
    // ferait disparaître la moitié des écarts.
    const cles = [...new Set([...Object.keys(avant), ...Object.keys(apres)])].sort();
    return cles
      .filter((c) => enTexte(avant[c]) !== enTexte(apres[c]))
      .map((c) => ({ champ: c, avant: enTexte(avant[c]), apres: enTexte(apres[c]) }));
  }

  // `direction.update` et ses voisins tracent deux scalaires : le nom d'avant
  // et celui d'après, sans nom de champ.
  return enTexte(d.avant) === enTexte(d.apres)
    ? []
    : [{ champ: "", avant: enTexte(d.avant), apres: enTexte(d.apres) }];
}

function ChangementsLisibles({ detail }: { detail: unknown }) {
  const { t } = useTranslation("administration");
  const lignes = changements(detail);
  if (lignes.length === 0) return null;

  return (
    <>
      <p className="eyebrow">{t("audit.champsModifies")}</p>
      <dl className="au-detail">
        {lignes.map((c) => (
          <Fragment key={c.champ}>
            <dt>{c.champ === "" ? t("audit.champValeur") : c.champ}</dt>
            <dd>{t("audit.avantApres", { avant: c.avant, apres: c.apres })}</dd>
          </Fragment>
        ))}
      </dl>
    </>
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
