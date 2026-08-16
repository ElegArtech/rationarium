import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "react-aria-components";
import { DEMI_JOURNEES, STATUTS_CONGE } from "@trame/contracts";
import * as api from "../../api/occupations.js";
import { messageErreur } from "../../api/erreurs.js";
import { usePeut, useSession } from "../../session/session.js";
import { Chargement, ErreurDeChargement } from "../../composants/etats.js";
import { Fenetre } from "../../composants/fenetre.js";
import { useMessages } from "../../composants/messages.js";
import { Pastille, AvatarAgent, useLibelle } from "../../composants/pastilles.js";
import { formaterDate, formaterNombre } from "../../formats.js";
import "../../composants/partages.css";
import "../taches/liste.css";
import "./conges.css";

/**
 * Vue 19 — Congés. **Le module le plus riche en règles du produit.**
 *
 * Trois publics cohabitent dans un seul écran : celui qui demande quatre fois
 * par an, celui qui valide chaque semaine, celui qui administre en continu.
 * Le brief l'exige : « les onglets doivent apparaître **selon les droits** :
 * Camille en voit un, Hugo en voit six ». Ce n'est pas de la courtoisie —
 * cinq onglets vides seraient un écran illisible pour la personne qui pose
 * quatre congés par an.
 *
 * **Le solde disponible est l'information la plus attendue au moment de la
 * demande : il ne doit pas être à chercher.** Il est donc en tête de vue, en
 * permanence, et recalculé par année dans la fenêtre de demande.
 */

type Onglet = "mesDemandes" | "aValider" | "toutes" | "delegations" | "types";

export function Conges() {
  const { t } = useTranslation("occupations");
  const peut = usePeut();
  const { session } = useSession();
  const annee = new Date().getUTCFullYear();

  /**
   * Les onglets visibles, calculés à partir des droits.
   *
   * `RG-GEN-06` — on ne propose pas ce qui sera refusé. Le contrôle reste au
   * serveur ; ici, c'est l'écran qu'on adapte à qui le regarde.
   */
  const onglets = useMemo(() => {
    const liste: { cle: Onglet; libelle: string }[] = [
      { cle: "mesDemandes", libelle: t("conges.ongletMesDemandes") },
    ];
    if (peut("leaves:approve")) liste.push({ cle: "aValider", libelle: t("conges.ongletAValider") });
    if (peut("leaves:readAll")) liste.push({ cle: "toutes", libelle: t("conges.ongletToutes") });
    if (peut("leaves:manage_delegations")) {
      liste.push({ cle: "delegations", libelle: t("conges.ongletDelegations") });
    }
    if (peut("leaves:manage_types")) liste.push({ cle: "types", libelle: t("conges.ongletTypes") });
    return liste;
  }, [peut, t]);

  const [onglet, setOnglet] = useState<Onglet>("mesDemandes");
  const [demandeOuverte, setDemandeOuverte] = useState(false);

  const soldes = useQuery({
    queryKey: ["conges", "soldes", annee],
    queryFn: () => api.soldes(annee),
  });

  return (
    <div className="page">
      <div className="pl-toolbar">
        <div>
          <span className="eyebrow">{t("conges.surtitre")}</span>
          <h1 className="h1 titre-vue">{t("conges.titre")}</h1>
        </div>
        {peut("leaves:create") ? (
          <div className="pl-toolbar-fin">
            <Button className="btn btn-primary" onPress={() => setDemandeOuverte(true)}>
              {t("conges.nouvelleDemande")}
            </Button>
          </div>
        ) : null}
      </div>

      {/* Le solde en tête, toujours. Il ne se cherche pas. */}
      {soldes.data ? (
        <div className="bal-grid soldes-espace">
          {soldes.data.map((s) => (
            <CarteSolde key={s.type.id} entree={s} />
          ))}
        </div>
      ) : null}

      <nav className="tabbar" aria-label={t("conges.sections")}>
        {onglets.map((o) => (
          <a
            key={o.cle}
            href={`#${o.cle}`}
            className={o.cle === onglet ? "is-active" : ""}
            aria-current={o.cle === onglet ? "page" : undefined}
            onClick={(e) => {
              e.preventDefault();
              setOnglet(o.cle);
            }}
          >
            {o.libelle}
          </a>
        ))}
      </nav>

      {onglet === "mesDemandes" ? <MesDemandes userId={session.id} /> : null}
      {onglet === "aValider" ? <AValider /> : null}
      {onglet === "toutes" ? <ToutesLesDemandes /> : null}
      {onglet === "delegations" ? <Delegations /> : null}
      {onglet === "types" ? <TypesDeConge /> : null}

      <FenetreDemande
        ouverte={demandeOuverte}
        surFermeture={() => setDemandeOuverte(false)}
        annee={annee}
      />
    </div>
  );
}

/**
 * Une carte de solde : total, utilisés, en attente, disponible.
 *
 * La barre empilée montre les trois parts d'un coup. Le chiffre mis en avant
 * est le **disponible** — c'est celui qu'on cherche, pas le total attribué.
 */
function CarteSolde({ entree }: { entree: api.SoldeParType }) {
  const { t } = useTranslation("occupations");
  const { solde, type } = entree;
  const total = Math.max(solde.attribues, solde.consommes + solde.engages, 1);

  return (
    <div className="bal">
      <div className="bal-head">
        <span className="bal-ic" style={{ background: type.couleur ?? "var(--accent)" }} aria-hidden="true">
          {type.code.slice(0, 2).toUpperCase()}
        </span>
        <span className="bal-n">{type.nom}</span>
        <span className="bal-y">{solde.annee}</span>
      </div>

      <p className="bal-val">
        {formaterNombre(solde.disponibles, 1)}
        <span className="bal-unit">{t("conges.joursDisponibles")}</span>
      </p>

      <div
        className="bal-stack"
        role="img"
        aria-label={t("conges.repartitionSolde", {
          type: type.nom,
          utilises: solde.consommes,
          attente: solde.engages,
          disponibles: solde.disponibles,
        })}
      >
        <i className="bal-part-utilises" style={{ width: `${(solde.consommes / total) * 100}%` }} />
        <i className="bal-part-attente" style={{ width: `${(solde.engages / total) * 100}%` }} />
      </div>

      <div className="bal-legend">
        <span className="bal-l">
          <span className="bal-sw bal-part-total" aria-hidden="true" />
          {t("conges.total", { n: formaterNombre(solde.attribues, 1) })}
        </span>
        <span className="bal-l">
          <span className="bal-sw bal-part-utilises" aria-hidden="true" />
          {t("conges.utilises", { n: formaterNombre(solde.consommes, 1) })}
        </span>
        <span className="bal-l">
          <span className="bal-sw bal-part-attente" aria-hidden="true" />
          {t("conges.enAttente", { n: formaterNombre(solde.engages, 1) })}
        </span>
      </div>
    </div>
  );
}

function MesDemandes({ userId }: { userId: string }) {
  const { t } = useTranslation("occupations");
  const requete = useQuery({
    queryKey: ["conges", { userId }],
    queryFn: () => api.conges({ userId }),
  });

  if (requete.isPending) return <Chargement quoi={t("conges.lesDemandes")} />;
  if (requete.isError)
    return <ErreurDeChargement erreur={requete.error} surReessai={() => void requete.refetch()} />;

  if (requete.data.length === 0) {
    return (
      <div className="empty empty-large">
        <p>{t("conges.videMesDemandes")}</p>
        <small>{t("conges.videMesDemandesExplication")}</small>
      </div>
    );
  }

  return (
    <div className="tlist">
      <div className="lv-row lv-head" aria-hidden="true">
        <span>{t("conges.colType")}</span>
        <span>{t("conges.colPeriode")}</span>
        <span className="num">{t("conges.colJours")}</span>
        <span>{t("conges.colStatut")}</span>
        <span className="c-val">{t("conges.colValidateur")}</span>
        <span className="end">{t("conges.colActions")}</span>
      </div>
      {requete.data.map((d) => (
        <LigneDemande key={d.id} demande={d} avecActions />
      ))}
    </div>
  );
}

function LigneDemande({
  demande,
  avecActions = false,
  avecValidation = false,
  avecDemandeur = false,
}: {
  demande: api.DemandeConge;
  avecActions?: boolean;
  avecValidation?: boolean;
  avecDemandeur?: boolean;
}) {
  const { t } = useTranslation("occupations");
  const { t: tErreurs } = useTranslation("erreurs");
  const annoncer = useMessages();
  const client = useQueryClient();
  const [refusOuvert, setRefusOuvert] = useState(false);

  const rafraichir = () => {
    void client.invalidateQueries({ queryKey: ["conges"] });
  };

  const action = useMutation({
    mutationFn: (geste: "approuver" | "annulation" | "supprimer") =>
      geste === "approuver"
        ? api.approuverConge(demande.id)
        : geste === "annulation"
          ? api.demanderAnnulation(demande.id)
          : api.supprimerConge(demande.id),
    onSuccess: (_, geste) => {
      annoncer("ok", t(`conges.${geste}Fait`));
      rafraichir();
    },
    onError: (e) => annoncer("err", messageErreur(e, tErreurs, t("conges.echecAction"))),
  });

  const classe = avecValidation ? "lv-row is-todo" : avecDemandeur ? "lv-row is-all" : "lv-row";

  return (
    <div className={classe}>
      {avecDemandeur || avecValidation ? (
        <span className="lv-who">
          <AvatarAgent prenom={demande.user.prenom} nom={demande.user.nom} />
          <span className="bloc-etroit">
            <span className="lv-wn">
              {demande.user.prenom} {demande.user.nom}
            </span>
            <span className="lv-ws">{demande.type.nom}</span>
          </span>
        </span>
      ) : (
        <span className="lv-type">
          <span
            className="bal-ic"
            style={{ background: demande.type.couleur ?? "var(--accent)" }}
            aria-hidden="true"
          >
            {demande.type.nom.slice(0, 2).toUpperCase()}
          </span>
          <span className="lv-tn">{demande.type.nom}</span>
        </span>
      )}

      <span className="bloc-etroit">
        <span className="lv-when">
          {t("conges.periode", {
            debut: formaterDate(demande.dateDebut),
            fin: formaterDate(demande.dateFin),
          })}
        </span>
        {demande.motif ? <span className="lv-motif">{demande.motif}</span> : null}
      </span>

      <span>
        <span className="lv-days">{formaterNombre(Number(demande.joursOuvres), 1)}</span>
        {/* `RG-CNG-19` — une demande à cheval sur deux ans se répartit, et la
            répartition est montrée : le solde de chaque année est distinct. */}
        {demande.repartitions.length > 1 ? (
          <span className="lv-split">
            {demande.repartitions
              .map((r) => `${r.annee} : ${formaterNombre(Number(r.jours), 1)}`)
              .join(" · ")}
          </span>
        ) : null}
      </span>

      {avecValidation ? (
        <span className="lv-acts">
          <Button className="chip-btn" onPress={() => action.mutate("approuver")}>
            {t("conges.approuver")}
          </Button>
          <Button className="chip-btn chip-danger" onPress={() => setRefusOuvert(true)}>
            {t("conges.refuser")}
          </Button>
        </span>
      ) : (
        <>
          <Pastille code={demande.statut} vocabulaire={STATUTS_CONGE} />
          {avecDemandeur ? null : (
            <span className="lv-val c-val">
              {demande.validateur
                ? `${demande.validateur.prenom} ${demande.validateur.nom}`
                : t("conges.sansValidateur")}
            </span>
          )}
          {avecActions ? (
            <span className="lv-acts">
              {demande.statut === "pending" ? (
                <Button className="chip-btn" onPress={() => action.mutate("supprimer")}>
                  {t("conges.supprimer")}
                </Button>
              ) : null}
              {/* `RG-CNG-12` — un congé approuvé ne s'annule pas directement :
                  il se demande. Le bouton dit ce qu'il fait. */}
              {demande.statut === "approved" ? (
                <Button className="chip-btn" onPress={() => action.mutate("annulation")}>
                  {t("conges.demanderAnnulation")}
                </Button>
              ) : null}
            </span>
          ) : null}
        </>
      )}

      <FenetreRefus
        demande={demande}
        ouverte={refusOuvert}
        surFermeture={() => setRefusOuvert(false)}
      />
    </div>
  );
}

function AValider() {
  const { t } = useTranslation("occupations");
  const requete = useQuery({
    queryKey: ["conges", { aValider: true }],
    queryFn: () => api.conges({ aValider: true }),
  });

  if (requete.isPending) return <Chargement quoi={t("conges.lesDemandes")} />;
  if (requete.isError)
    return <ErreurDeChargement erreur={requete.error} surReessai={() => void requete.refetch()} />;

  if (requete.data.length === 0) {
    return (
      <div className="empty empty-large">
        <p>{t("conges.videAValider")}</p>
        <small>{t("conges.videAValiderExplication")}</small>
      </div>
    );
  }

  return (
    <>
      <div className="alert alert-neutral" role="status">
        <span className="alert-icon" aria-hidden="true">
          →
        </span>
        <span>{t("conges.enAttenteDeValidation", { n: requete.data.length })}</span>
      </div>
      <div className="tlist">
        {requete.data.map((d) => (
          <LigneDemande key={d.id} demande={d} avecValidation />
        ))}
      </div>
    </>
  );
}

function ToutesLesDemandes() {
  const { t } = useTranslation("occupations");
  const requete = useQuery({ queryKey: ["conges", {}], queryFn: () => api.conges({}) });

  if (requete.isPending) return <Chargement quoi={t("conges.lesDemandes")} />;
  if (requete.isError)
    return <ErreurDeChargement erreur={requete.error} surReessai={() => void requete.refetch()} />;

  if (requete.data.length === 0) {
    return (
      <div className="empty empty-large">
        <p>{t("conges.videToutes")}</p>
        <small>{t("conges.videToutesExplication")}</small>
      </div>
    );
  }

  return (
    <div className="tlist">
      {requete.data.map((d) => (
        <LigneDemande key={d.id} demande={d} avecDemandeur />
      ))}
    </div>
  );
}

/** `EX-CNG-19` — les délégations, dans les deux sens, avec leur explication. */
function Delegations() {
  const { t } = useTranslation("occupations");
  const { t: tErreurs } = useTranslation("erreurs");
  const annoncer = useMessages();
  const client = useQueryClient();
  const requete = useQuery({ queryKey: ["conges", "delegations"], queryFn: api.delegations });

  const desactiver = useMutation({
    mutationFn: (id: string) => api.desactiverDelegation(id),
    onSuccess: () => {
      annoncer("ok", t("conges.delegationDesactivee"));
      void client.invalidateQueries({ queryKey: ["conges", "delegations"] });
    },
    onError: (e) => annoncer("err", messageErreur(e, tErreurs, t("conges.echecAction"))),
  });

  if (requete.isPending) return <Chargement quoi={t("conges.lesDelegations")} />;
  if (requete.isError)
    return <ErreurDeChargement erreur={requete.error} surReessai={() => void requete.refetch()} />;

  const bloc = (
    titre: string,
    liste: api.Delegation[],
    vide: string,
    qui: (d: api.Delegation) => string,
    avecDesactivation: boolean,
  ) => (
    <section className="panel panel-espace">
      <div className="panel-head">
        <span className="panel-title">{titre}</span>
      </div>
      {liste.length === 0 ? (
        <div className="empty">
          <p>{vide}</p>
        </div>
      ) : (
        liste.map((d) => (
          <div className="dg-row" key={d.id}>
            <span className="lv-wn">{qui(d)}</span>
            <span className="lv-when">
              {t("conges.deA", { debut: formaterDate(d.dateDebut), fin: formaterDate(d.dateFin) })}
            </span>
            <span className="pill" style={{ color: d.active ? "var(--st-done)" : "var(--muted)" }}>
              {d.active ? t("conges.active") : t("conges.inactive")}
            </span>
            <span className="lv-acts">
              {avecDesactivation && d.active ? (
                <Button className="chip-btn" onPress={() => desactiver.mutate(d.id)}>
                  {t("conges.desactiver")}
                </Button>
              ) : null}
            </span>
          </div>
        ))
      )}
    </section>
  );

  return (
    <>
      <p className="dg-note">{t("conges.delegationExplication")}</p>
      {bloc(
        t("conges.delegationsDonnees"),
        requete.data.donnees,
        t("conges.videDelegationsDonnees"),
        (d) => `${d.delegue?.prenom ?? ""} ${d.delegue?.nom ?? ""}`.trim(),
        true,
      )}
      {bloc(
        t("conges.delegationsRecues"),
        requete.data.recues,
        t("conges.videDelegationsRecues"),
        (d) => `${d.delegant?.prenom ?? ""} ${d.delegant?.nom ?? ""}`.trim(),
        false,
      )}
    </>
  );
}

/**
 * `EX-CNG-16` — le catalogue des types.
 *
 * Le compte d'utilisations est affiché **avant** toute action : `RG-CNG-17`
 * refuse la suppression d'un type employé et le désactive à la place.
 * Découvrir la règle en la heurtant serait un mauvais apprentissage.
 */
function TypesDeConge() {
  const { t } = useTranslation("occupations");
  const [inactifs, setInactifs] = useState(false);
  const requete = useQuery({
    queryKey: ["conges", "types", inactifs],
    queryFn: () => api.typesDeConge(inactifs),
  });

  if (requete.isPending) return <Chargement quoi={t("conges.lesTypes")} />;
  if (requete.isError)
    return <ErreurDeChargement erreur={requete.error} surReessai={() => void requete.refetch()} />;

  return (
    <>
      <div className="filters">
        <label className="check">
          <input
            type="checkbox"
            checked={inactifs}
            onChange={(e) => setInactifs(e.target.checked)}
          />
          <span>{t("conges.afficherInactifs")}</span>
        </label>
      </div>

      <div className="tlist">
        <div className="ty-grid ty-head" aria-hidden="true">
          <span>{t("conges.colCode")}</span>
          <span>{t("conges.colNom")}</span>
          <span>{t("conges.colOptions")}</span>
          <span>{t("conges.colValidation")}</span>
          <span className="c-lim">{t("conges.colLimite")}</span>
          <span className="c-use">{t("conges.colUtilisations")}</span>
          <span>{t("conges.colStatut")}</span>
        </div>
        {requete.data.map((type) => (
          <div className={`ty-grid ty-row${type.actif ? "" : " is-off"}`} key={type.id}>
            <span className="ty-code">{type.code}</span>
            <span className="bloc-etroit">
              <span className="ty-n">{type.nom}</span>
              {type.description ? <span className="ty-d">{type.description}</span> : null}
            </span>
            <span className="ty-use">
              {type.remunere ? t("conges.remunere") : t("conges.nonRemunere")}
            </span>
            <span className="ty-use">
              {type.validationRequise ? t("conges.validationRequise") : t("conges.validationAuto")}
            </span>
            <span className="ty-use c-lim">
              {type.limiteAnnuelle === null
                ? t("conges.illimite")
                : t("conges.joursParAn", { n: type.limiteAnnuelle })}
            </span>
            <span className="ty-use c-use">
              {t("conges.utilisations", { n: type.utilisations })}
            </span>
            <span className="pill" style={{ color: type.systeme ? "var(--muted)" : type.actif ? "var(--st-done)" : "var(--st-todo)" }}>
              {type.systeme ? t("conges.systeme") : type.actif ? t("conges.actif") : t("conges.inactif")}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

/** `RG-CNG-10` — le motif est facultatif au refus, mais la fenêtre l'invite. */
function FenetreRefus({
  demande,
  ouverte,
  surFermeture,
}: {
  demande: api.DemandeConge;
  ouverte: boolean;
  surFermeture: () => void;
}) {
  const { t } = useTranslation("occupations");
  const { t: tErreurs } = useTranslation("erreurs");
  const annoncer = useMessages();
  const client = useQueryClient();
  const [motif, setMotif] = useState("");

  const refus = useMutation({
    mutationFn: () => api.refuserConge(demande.id, motif.trim() || t("conges.refusSansMotif")),
    onSuccess: () => {
      annoncer("ok", t("conges.refuserFait"));
      surFermeture();
      void client.invalidateQueries({ queryKey: ["conges"] });
    },
    onError: (e) => annoncer("err", messageErreur(e, tErreurs, t("conges.echecAction"))),
  });

  return (
    <Fenetre
      ouverte={ouverte}
      surFermeture={surFermeture}
      categorie={t("conges.validation")}
      titre={t("conges.refuserLaDemande")}
      mention={t("conges.motifTransmis")}
      actions={
        <>
          <Button className="btn btn-secondary" onPress={surFermeture}>
            {t("annuler")}
          </Button>
          <Button className="btn btn-danger" isPending={refus.isPending} onPress={() => refus.mutate()}>
            {t("conges.confirmerRefus")}
          </Button>
        </>
      }
    >
      <div className="field-block">
        <label className="field-label" htmlFor="cg-motif">
          {t("conges.motifRefus")}
        </label>
        <textarea
          className="field"
          id="cg-motif"
          rows={3}
          value={motif}
          onChange={(e) => setMotif(e.target.value)}
          placeholder={t("conges.motifRefusExemple")}
        />
      </div>
    </Fenetre>
  );
}

/**
 * La fenêtre de demande.
 *
 * **Le contrôle de solde est fait par année**, parce qu'une demande à cheval
 * sur deux années civiles se répartit et que chaque année a son propre solde
 * (`RG-CNG-19`). Montrer un total unique cacherait exactement le cas qui pose
 * problème.
 *
 * Un type approuvé automatiquement le dit : la personne n'attendra pas une
 * validation qui ne viendra jamais.
 */
function FenetreDemande({
  ouverte,
  surFermeture,
  annee,
}: {
  ouverte: boolean;
  surFermeture: () => void;
  annee: number;
}) {
  const { t } = useTranslation("occupations");
  const { t: tErreurs } = useTranslation("erreurs");
  const libelle = useLibelle();
  const annoncer = useMessages();
  const client = useQueryClient();

  const [typeId, setTypeId] = useState("");
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");
  const [demiDebut, setDemiDebut] = useState("");
  const [demiFin, setDemiFin] = useState("");
  const [motif, setMotif] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);

  const types = useQuery({
    queryKey: ["conges", "types", false],
    queryFn: () => api.typesDeConge(false),
    enabled: ouverte,
  });
  const soldes = useQuery({
    queryKey: ["conges", "soldes", annee],
    queryFn: () => api.soldes(annee),
    enabled: ouverte,
  });

  const type = types.data?.find((x) => x.id === typeId);
  const solde = soldes.data?.find((s) => s.type.id === typeId)?.solde;

  /** Les années couvertes par la demande : une, ou deux si elle est à cheval. */
  const annees = useMemo(() => {
    if (!dateDebut || !dateFin) return [];
    const a = Number(dateDebut.slice(0, 4));
    const b = Number(dateFin.slice(0, 4));
    return a === b ? [a] : [a, b];
  }, [dateDebut, dateFin]);

  const depot = useMutation({
    mutationFn: () =>
      api.deposerConge({
        typeId,
        dateDebut,
        dateFin,
        ...(demiDebut ? { demiJourneeDebut: demiDebut } : {}),
        ...(demiFin ? { demiJourneeFin: demiFin } : {}),
        ...(motif ? { motif } : {}),
      }),
    onSuccess: () => {
      annoncer("ok", t("conges.demandeDeposee"));
      setDateDebut("");
      setDateFin("");
      setMotif("");
      surFermeture();
      void client.invalidateQueries({ queryKey: ["conges"] });
    },
    onError: (e) => setErreur(messageErreur(e, tErreurs, t("conges.echecDepot"))),
  });

  const valider = () => {
    setErreur(null);
    if (!typeId || !dateDebut || !dateFin) {
      setErreur(t("champsObligatoires"));
      return;
    }
    depot.mutate();
  };

  return (
    <Fenetre
      ouverte={ouverte}
      surFermeture={surFermeture}
      categorie={t("conges.demande")}
      titre={t("conges.nouvelleDemande")}
      large
      mention={t("champsObligatoires")}
      actions={
        <>
          <Button className="btn btn-secondary" onPress={surFermeture}>
            {t("annuler")}
          </Button>
          <Button className="btn btn-primary" isPending={depot.isPending} onPress={valider}>
            {t("conges.deposer")}
          </Button>
        </>
      }
    >
      {erreur ? (
        <div className="alert alert-error" role="alert">
          <span className="alert-icon" aria-hidden="true">
            !
          </span>
          <span>{erreur}</span>
        </div>
      ) : null}

      <div className="form-grid form-grid-espace">
        <div className="field-block span2">
          <label className="field-label" htmlFor="cg-type">
            {t("conges.typeDeConge")} <span className="req">*</span>
          </label>
          <select
            className="field"
            id="cg-type"
            value={typeId}
            onChange={(e) => setTypeId(e.target.value)}
          >
            <option value="">{t("selectionner")}</option>
            {(types.data ?? []).map((x) => (
              <option key={x.id} value={x.id}>
                {x.nom}
              </option>
            ))}
          </select>
          {/* Un type auto-approuvé le dit : sinon la personne attend une
              validation qui ne viendra jamais. */}
          {type && !type.validationRequise ? (
            <p className="field-hint">{t("conges.approuveAutomatiquement")}</p>
          ) : null}
        </div>

        <div className="field-block">
          <label className="field-label" htmlFor="cg-debut">
            {t("conges.dateDebut")} <span className="req">*</span>
          </label>
          <input
            className="field"
            id="cg-debut"
            type="date"
            value={dateDebut}
            onChange={(e) => setDateDebut(e.target.value)}
          />
        </div>

        <div className="field-block">
          <label className="field-label" htmlFor="cg-fin">
            {t("conges.dateFin")} <span className="req">*</span>
          </label>
          <input
            className="field"
            id="cg-fin"
            type="date"
            value={dateFin}
            onChange={(e) => setDateFin(e.target.value)}
          />
        </div>

        <div className="field-block">
          <label className="field-label" htmlFor="cg-dd">
            {t("conges.demiJourneeDebut")}
          </label>
          <select
            className="field"
            id="cg-dd"
            value={demiDebut}
            onChange={(e) => setDemiDebut(e.target.value)}
          >
            <option value="">{t("conges.journeeComplete")}</option>
            {DEMI_JOURNEES.map((d) => (
              <option key={d.code} value={d.code}>
                {libelle(d.code, DEMI_JOURNEES)}
              </option>
            ))}
          </select>
        </div>

        <div className="field-block">
          <label className="field-label" htmlFor="cg-df">
            {t("conges.demiJourneeFin")}
          </label>
          <select
            className="field"
            id="cg-df"
            value={demiFin}
            onChange={(e) => setDemiFin(e.target.value)}
          >
            <option value="">{t("conges.journeeComplete")}</option>
            {DEMI_JOURNEES.map((d) => (
              <option key={d.code} value={d.code}>
                {libelle(d.code, DEMI_JOURNEES)}
              </option>
            ))}
          </select>
        </div>

        <div className="field-block span2">
          <label className="field-label" htmlFor="cg-motif-dem">
            {t("conges.motif")}
          </label>
          <textarea
            className="field"
            id="cg-motif-dem"
            rows={2}
            value={motif}
            onChange={(e) => setMotif(e.target.value)}
          />
        </div>

        {/* Le contrôle de solde, par année. À cheval sur deux ans, deux blocs. */}
        {solde && annees.length > 0 ? (
          <div className="field-block span2">
            <div className="check-bal">
              <div className="cb-head">
                <span className="eyebrow">{t("conges.controleSolde")}</span>
                {annees.length > 1 ? (
                  <span className="cb-tag">{t("conges.aChevalSurDeuxAns")}</span>
                ) : null}
              </div>
              {annees.map((a) => (
                <div className="cb-year" key={a}>
                  <p className="cb-line">
                    <span>{t("conges.annee", { annee: a })}</span>
                    <b>{formaterNombre(solde.attribues, 1)}</b>
                  </p>
                  <p className="cb-line">
                    <span>{t("conges.dejaUtilises")}</span>
                    <b>{formaterNombre(solde.consommes, 1)}</b>
                  </p>
                  <p className="cb-line is-total">
                    <span>{t("conges.disponible")}</span>
                    <b>{formaterNombre(solde.disponibles, 1)}</b>
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {type?.validationRequise ? (
          <div className="field-block span2">
            <div className="alert alert-neutral">
              <span className="alert-icon" aria-hidden="true">
                →
              </span>
              <span>{t("conges.soumiseAValidation")}</span>
            </div>
          </div>
        ) : null}
      </div>
    </Fenetre>
  );
}
