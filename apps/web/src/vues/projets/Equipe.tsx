import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "react-aria-components";
import { appeler } from "../../api/client.js";
import * as api from "../../api/projets.js";
import { messageErreur } from "../../api/erreurs.js";
import { usePeut } from "../../session/session.js";
import { Chargement, ErreurDeChargement } from "../../composants/etats.js";
import { Fenetre } from "../../composants/fenetre.js";
import { useMessages } from "../../composants/messages.js";
import { Barre } from "../../composants/pastilles.js";
import { formaterNombre } from "../../formats.js";
import { CadreProjet } from "./Fiche.js";
import "./fiche.css";
import "./equipe.css";

/**
 * Vue 14 — Projet, onglet Équipe.
 *
 * **Trois populations, trois formes.** Le brief le pose en point d'attention :
 * « un prestataire n'est pas un agent ». Le rond plein est l'agent, le carré
 * en tirets l'intervenant extérieur, le carré plein le bénéficiaire — et la
 * différence est doublée d'un libellé, parce qu'une forme seule ne se lit pas
 * à l'oreille.
 *
 * Ce qui les sépare vraiment n'est pas graphique : **seuls les agents portent
 * une allocation**. Un tiers ne consomme pas la charge des services, un
 * bénéficiaire ne contribue pas. C'est pourquoi l'allocation cumulée ne
 * compte que la première population.
 */

type Equipe = {
  agents: {
    userId: string;
    roleProjet: string;
    tauxAllocation: number | null;
    utilisateur: {
      id: string;
      prenom: string;
      nom: string;
      email: string;
      departement: { nom: string } | null;
    };
  }[];
  tiers: { id: string; type: string; organisation: string | null; contactNom: string | null }[];
  clients: { id: string; nom: string; contactNom: string | null }[];
  allocationCumulee: number;
};

/** `cadrage/02`, vue 14 — la liste est fermée et vient du brief, pas d'un choix. */
const ROLES_PROJET = [
  "sponsor",
  "chefDeProjet",
  "responsableTechnique",
  "architecte",
  "techLead",
  "developpeurSenior",
  "developpeur",
  "developpeurJunior",
  "devops",
  "qaLead",
  "testeur",
  "designer",
  "productOwner",
  "scrumMaster",
  "analysteMetier",
  "membre",
  "observateur",
] as const;

export function Equipe({ projetId }: { projetId: string }) {
  const { t } = useTranslation("projets");
  const peut = usePeut();
  const [ajoutOuvert, setAjoutOuvert] = useState(false);

  const projet = useQuery({ queryKey: ["projet", projetId], queryFn: () => api.fiche(projetId) });
  const equipe = useQuery({
    queryKey: ["projet", projetId, "equipe"],
    queryFn: () => appeler<Equipe>(`/projets/${projetId}/equipe`),
  });

  if (projet.isPending || equipe.isPending) return <Chargement quoi={t("equipe.lEquipe")} />;
  if (projet.isError)
    return <ErreurDeChargement erreur={projet.error} surReessai={() => void projet.refetch()} />;
  if (equipe.isError)
    return <ErreurDeChargement erreur={equipe.error} surReessai={() => void equipe.refetch()} />;

  const { agents, tiers, clients, allocationCumulee } = equipe.data;

  return (
    <CadreProjet projet={projet.data} onglet="equipe">
      <div className="pl-toolbar">
        <div>
          <h2 className="panel-title sous-titre-vue">{t("equipe.titre")}</h2>
          <p className="lede">{t("equipe.chapeau")}</p>
        </div>
        {peut("projects:manage_members") ? (
          <div className="pl-toolbar-fin">
            <Button className="btn btn-primary" onPress={() => setAjoutOuvert(true)}>
              {t("equipe.ajouter")}
            </Button>
          </div>
        ) : null}
      </div>

      <div className="team-bar">
        <div className="tb-item">
          <span className="eyebrow">{t("equipe.agents")}</span>
          <span className="tb-val">{agents.length}</span>
        </div>
        <span className="tb-sep" aria-hidden="true" />
        <div className="tb-item">
          <span className="eyebrow">{t("equipe.tiers")}</span>
          <span className="tb-val">{tiers.length}</span>
        </div>
        <span className="tb-sep" aria-hidden="true" />
        <div className="tb-item">
          <span className="eyebrow">{t("equipe.clients")}</span>
          <span className="tb-val">{clients.length}</span>
        </div>
        <div className="tb-item tb-etp">
          <span className="eyebrow">{t("equipe.allocationCumulee")}</span>
          {/* L'ETP est l'information de pilotage : « 340 % » ne parle qu'aux
              initiés, « 3,4 ETP » se comprend en réunion budgétaire. */}
          <span className="tb-val">
            {t("equipe.etp", {
              pct: allocationCumulee,
              etp: formaterNombre(allocationCumulee / 100, 1),
            })}
          </span>
        </div>
      </div>

      <Section
        classePastille="mav mav-sm"
        glyphe="◍"
        titre={t("equipe.sectionAgents")}
        nombre={agents.length}
        nature={t("equipe.compteDansLaCharge")}
        classeNature="sec-kind sec-kind-agents"
        vide={{ titre: t("equipe.aucunMembre"), explication: t("equipe.aucunMembreExplication") }}
      >
        {agents.map((m) => (
          <LigneAgent key={m.userId} projetId={projetId} membre={m} />
        ))}
      </Section>

      <Section
        classePastille="mav is-ext mav-sm"
        glyphe="◇"
        titre={t("equipe.sectionTiers")}
        nombre={tiers.length}
        nature={t("equipe.horsCharge")}
        classeNature="sec-kind sec-kind-tiers"
        vide={{ titre: t("equipe.aucunTiers"), explication: t("equipe.aucunTiersExplication") }}
      >
        {tiers.map((x) => (
          <div className="mrow" key={x.id}>
            <span className="mav is-ext" aria-hidden="true">
              ◇
            </span>
            <div className="bloc-etroit">
              <p className="mname">{x.organisation ?? x.contactNom ?? "—"}</p>
              <span className="msub">{t(`equipe.type_${x.type}`)}</span>
            </div>
            <span className="malloc-na">{t("equipe.sansAllocation")}</span>
            <span />
            <span />
          </div>
        ))}
      </Section>

      <Section
        classePastille="mav is-client mav-sm"
        glyphe="▣"
        titre={t("equipe.sectionClients")}
        nombre={clients.length}
        nature={t("equipe.commanditaires")}
        classeNature="sec-kind sec-kind-clients"
        vide={{ titre: t("equipe.aucunClient"), explication: t("equipe.aucunClientExplication") }}
      >
        {clients.map((c) => (
          <div className="mrow" key={c.id}>
            <span className="mav is-client" aria-hidden="true">
              ▣
            </span>
            <div className="bloc-etroit">
              <p className="mname">{c.nom}</p>
              {c.contactNom ? <span className="msub">{c.contactNom}</span> : null}
            </div>
            <span className="malloc-na">{t("equipe.neContribuePas")}</span>
            <span />
            <span />
          </div>
        ))}
      </Section>

      <FenetreAjout
        projetId={projetId}
        ouverte={ajoutOuvert}
        surFermeture={() => setAjoutOuvert(false)}
        dejaMembres={new Set(agents.map((a) => a.userId))}
      />
    </CadreProjet>
  );
}

function Section({
  classePastille,
  glyphe,
  titre,
  nombre,
  nature,
  classeNature,
  vide,
  children,
}: {
  classePastille: string;
  glyphe: string;
  titre: string;
  nombre: number;
  nature: string;
  classeNature: string;
  vide: { titre: string; explication: string };
  children: ReactNode;
}) {
  return (
    <section className="panel panel-espace">
      <div className="sec-head">
        <span className={classePastille} aria-hidden="true">
          {glyphe}
        </span>
        <span className="panel-title">{titre}</span>
        <span className="kcol-n">{nombre}</span>
        <span className={classeNature}>{nature}</span>
      </div>
      {nombre > 0 ? (
        children
      ) : (
        <div className="empty">
          <p>{vide.titre}</p>
          <small>{vide.explication}</small>
        </div>
      )}
    </section>
  );
}

function LigneAgent({
  projetId,
  membre,
}: {
  projetId: string;
  membre: Equipe["agents"][number];
}) {
  const { t } = useTranslation("projets");
  const { t: tErreurs } = useTranslation("erreurs");
  const peut = usePeut();
  const annoncer = useMessages();
  const client = useQueryClient();
  const [retraitOuvert, setRetraitOuvert] = useState(false);

  const nomComplet = `${membre.utilisateur.prenom} ${membre.utilisateur.nom}`;
  const allocation = membre.tauxAllocation ?? 0;

  const retrait = useMutation({
    mutationFn: () =>
      appeler<void>(`/projets/${projetId}/membres/${membre.userId}`, { methode: "DELETE" }),
    onSuccess: () => {
      annoncer("ok", t("equipe.retire", { nom: nomComplet }));
      setRetraitOuvert(false);
      void client.invalidateQueries({ queryKey: ["projet", projetId] });
    },
    onError: (e) => annoncer("err", messageErreur(e, tErreurs, t("fiche.echecAction"))),
  });

  return (
    <div className="mrow">
      <span className="mav" aria-hidden="true">
        {`${membre.utilisateur.prenom[0] ?? ""}${membre.utilisateur.nom[0] ?? ""}`.toUpperCase()}
      </span>

      <div className="bloc-etroit">
        <p className="mname">{nomComplet}</p>
        <span className="msub">
          {membre.utilisateur.departement?.nom ?? membre.utilisateur.email}
        </span>
      </div>

      <span className="mini-select-libelle">{t(`equipe.role_${membre.roleProjet}`, membre.roleProjet)}</span>

      <div className="malloc">
        <span className="prow-pct">{allocation} %</span>
        <Barre valeur={allocation} libelle={t("equipe.allocationDe", { nom: nomComplet })} />
      </div>

      {peut("projects:manage_members") ? (
        <Button
          className="mdel"
          onPress={() => setRetraitOuvert(true)}
          aria-label={t("equipe.retirerDu", { nom: nomComplet })}
        >
          <span aria-hidden="true">×</span>
        </Button>
      ) : (
        <span />
      )}

      <Fenetre
        ouverte={retraitOuvert}
        surFermeture={() => setRetraitOuvert(false)}
        categorie={t("confirmation")}
        titre={t("equipe.retirerTitre")}
        // Retirer quelqu'un de l'équipe n'efface ni son temps déclaré ni ses
        // tâches. Le dire ici évite de confondre retrait et suppression.
        mention={t("equipe.aucuneDonneeSupprimee")}
        actions={
          <>
            <Button className="btn btn-secondary" onPress={() => setRetraitOuvert(false)}>
              {t("annuler")}
            </Button>
            <Button
              className="btn btn-danger"
              isPending={retrait.isPending}
              onPress={() => retrait.mutate()}
            >
              {t("equipe.retirerTitre")}
            </Button>
          </>
        }
      >
        <p className="phrase-confirmation">{t("equipe.confirmerRetrait", { nom: nomComplet })}</p>
        <div className="alert alert-neutral">
          <span className="alert-icon" aria-hidden="true">
            →
          </span>
          <span>{t("equipe.effetRetrait")}</span>
        </div>
      </Fenetre>
    </div>
  );
}

/**
 * La fenêtre d'ajout.
 *
 * **Le type se choisit d'abord**, parce que les trois populations ne se
 * saisissent pas pareil : seul l'agent a un rôle et une allocation. Présenter
 * un formulaire unique avec des champs qui s'éteignent laisserait croire qu'un
 * tiers pourrait en avoir une.
 */
function FenetreAjout({
  projetId,
  ouverte,
  surFermeture,
  dejaMembres,
}: {
  projetId: string;
  ouverte: boolean;
  surFermeture: () => void;
  dejaMembres: ReadonlySet<string>;
}) {
  const { t } = useTranslation("projets");
  const { t: tErreurs } = useTranslation("erreurs");
  const annoncer = useMessages();
  const client = useQueryClient();

  const [nature, setNature] = useState<"agent" | "tiers" | "client">("agent");
  const [qui, setQui] = useState("");
  const [role, setRole] = useState<string>("membre");
  const [allocation, setAllocation] = useState(50);
  const [erreur, setErreur] = useState<string | null>(null);

  const candidats = useQuery({
    queryKey: ["utilisateurs", "candidats"],
    queryFn: () =>
      appeler<{ utilisateurs: { id: string; prenom: string; nom: string }[] }>("/utilisateurs"),
    enabled: ouverte && nature === "agent",
  });

  const ajout = useMutation({
    mutationFn: () =>
      api.ajouterMembre(projetId, { userId: qui, roleProjet: role, tauxAllocation: allocation }),
    onSuccess: () => {
      annoncer("ok", t("equipe.ajoute"));
      setQui("");
      surFermeture();
      void client.invalidateQueries({ queryKey: ["projet", projetId] });
    },
    onError: (e) => setErreur(messageErreur(e, tErreurs, t("fiche.echecAction"))),
  });

  const valider = () => {
    setErreur(null);
    if (!qui) {
      setErreur(t("equipe.choisirUtilisateur"));
      return;
    }
    // RG-PRJ-06 — le doublon est refusé au serveur ; l'annoncer ici évite un
    // aller-retour pour une information que la page a déjà sous les yeux.
    if (dejaMembres.has(qui)) {
      setErreur(t("equipe.dejaMembre"));
      return;
    }
    ajout.mutate();
  };

  const natures = [
    { cle: "agent", glyphe: "◍", classe: "mav" },
    { cle: "tiers", glyphe: "◇", classe: "mav is-ext" },
    { cle: "client", glyphe: "▣", classe: "mav is-client" },
  ] as const;

  return (
    <Fenetre
      ouverte={ouverte}
      surFermeture={surFermeture}
      categorie={t("equipe.categorie")}
      titre={t("equipe.ajouterTitre")}
      mention={t("champObligatoire")}
      actions={
        <>
          <Button className="btn btn-secondary" onPress={surFermeture}>
            {t("annuler")}
          </Button>
          <Button
            className="btn btn-primary"
            isDisabled={nature !== "agent"}
            isPending={ajout.isPending}
            onPress={valider}
          >
            {t("equipe.ajouterAction")}
          </Button>
        </>
      }
    >
      <div className="kind-seg" role="group" aria-label={t("equipe.natureDuMembre")}>
        {natures.map((n) => (
          <Button
            key={n.cle}
            className="kind-opt"
            aria-pressed={nature === n.cle}
            onPress={() => setNature(n.cle)}
          >
            <span className={n.classe} aria-hidden="true">
              {n.glyphe}
            </span>
            <span>
              <span className="kind-name">{t(`equipe.nature_${n.cle}`)}</span>
              <span className="kind-desc">{t(`equipe.natureDesc_${n.cle}`)}</span>
            </span>
          </Button>
        ))}
      </div>

      {erreur ? (
        <div className="alert alert-error" role="alert">
          <span className="alert-icon" aria-hidden="true">
            !
          </span>
          <span>{erreur}</span>
        </div>
      ) : null}

      {nature === "agent" ? (
        <>
          <div className="field-block">
            <label className="field-label" htmlFor="eq-qui">
              {t("equipe.utilisateur")} <span className="req">*</span>
            </label>
            <select
              className="field"
              id="eq-qui"
              value={qui}
              onChange={(e) => setQui(e.target.value)}
            >
              <option value="">{t("selectionner")}</option>
              {(candidats.data?.utilisateurs ?? []).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.prenom} {u.nom}
                </option>
              ))}
            </select>
          </div>

          <div className="field-block">
            <label className="field-label" htmlFor="eq-role">
              {t("equipe.roleProjet")}
            </label>
            <select
              className="field"
              id="eq-role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              {ROLES_PROJET.map((r) => (
                <option key={r} value={r}>
                  {t(`equipe.role_${r}`)}
                </option>
              ))}
            </select>
          </div>

          <div className="field-block">
            <label className="field-label" htmlFor="eq-alloc">
              {t("equipe.allocation")}
            </label>
            <div className="malloc">
              <input
                id="eq-alloc"
                type="number"
                min={0}
                max={100}
                step={5}
                value={allocation}
                onChange={(e) => setAllocation(Number(e.target.value))}
              />
              <span className="hours-unit">%</span>
              <Barre valeur={allocation} libelle={t("equipe.allocation")} />
            </div>
            <p className="field-hint">{t("equipe.allocationAide")}</p>
          </div>
        </>
      ) : (
        <p className="field-hint">{t(`equipe.aide_${nature}`)}</p>
      )}
    </Fenetre>
  );
}
