import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ROLES_PROJET, TYPES_TIERS } from "@rationarium/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "react-aria-components";
import { Link } from "@tanstack/react-router";
import { appeler } from "../../api/client.js";
import * as api from "../../api/projets.js";
import * as apiReferentiels from "../../api/referentiels.js";
import { messageErreur } from "../../api/erreurs.js";
import { usePeut } from "../../session/session.js";
import {
  CHEMIN_ANNUAIRE,
  PERMISSION_ANNUAIRE,
  type Candidat,
} from "../taches/assignables.js";
import { Chargement, ErreurDeChargement } from "../../composants/etats.js";
import { Fenetre } from "../../composants/fenetre.js";
import { useMessages } from "../../composants/messages.js";
import { Barre, useLibelle } from "../../composants/pastilles.js";
import { formaterNombre } from "../../formats.js";
import { CadreProjet } from "./Fiche.js";
import "../../composants/partages.css";
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
    /** `RG-PRJ-12` — ce que le retrait retirera. Annoncé AVANT le geste. */
    tachesAssignees: number;
    /** `RG-PRJ-12` — le second attachement au travail du projet. */
    raciSurTaches: number;
  }[];
  tiers: {
    id: string;
    type: string;
    organisation: string | null;
    contactNom: string | null;
    /** `RG-PRJ-12` — ce que le détachement retirera. Annoncé AVANT le geste. */
    tachesAssignees: number;
  }[];
  clients: { id: string; nom: string; contactNom: string | null }[];
  allocationCumulee: number;
};

/*
 * La liste des rôles vit dans `@rationarium/contracts` : `cadrage/01 § M4` l'énumère,
 * ce n'est donc pas une liste locale. Elle en était une ici — dix-sept chaînes
 * recopiées avec leurs propres clés de traduction, à côté d'un contrat qui
 * acceptait n'importe quelle chaîne.
 */

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
          <LigneTiers key={x.id} projetId={projetId} tiers={x} />
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
          <LigneClient key={c.id} projetId={projetId} client={c} />
        ))}
      </Section>

      <FenetreAjout
        projetId={projetId}
        ouverte={ajoutOuvert}
        surFermeture={() => setAjoutOuvert(false)}
        dejaMembres={new Set(agents.map((a) => a.userId))}
        dejaTiers={new Set(tiers.map((x) => x.id))}
        clientsRattaches={clients.map((c) => c.id)}
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

/**
 * La ligne d'un intervenant extérieur.
 *
 * **Le type vient de `TYPES_TIERS`, pas d'une clé i18n locale.** Il en venait :
 * `equipe.type_${x.type}` cherchait `type_organization` quand le vocabulaire de
 * `cadrage/01 § 4.1` code `organisation` — la clé ne résolvait pas et **le
 * produit affichait `equipe.type_organisation` à l'écran**. Une énumération
 * locale doublant un vocabulaire du cadrage est un interdit structurel ; ici
 * elle avait en plus divergé, et rien ne pouvait le dire.
 */
function LigneTiers({
  projetId,
  tiers,
}: {
  projetId: string;
  tiers: Equipe["tiers"][number];
}) {
  const { t } = useTranslation("projets");
  const { t: tErreurs } = useTranslation("erreurs");
  const peut = usePeut();
  const annoncer = useMessages();
  const client = useQueryClient();
  const libelle = useLibelle();
  const [detachementOuvert, setDetachementOuvert] = useState(false);

  const nom = tiers.organisation ?? tiers.contactNom ?? "—";

  const detachement = useMutation({
    mutationFn: () => apiReferentiels.detacherTiersDuProjet(projetId, tiers.id),
    onSuccess: () => {
      annoncer("ok", t("equipe.tiersDetache", { nom }));
      setDetachementOuvert(false);
      void client.invalidateQueries({ queryKey: ["projet", projetId] });
    },
    onError: (e) => annoncer("err", messageErreur(e, tErreurs, t("fiche.echecAction"))),
  });

  return (
    <div className="mrow">
      <span className="mav is-ext" aria-hidden="true">
        {tiers.type === "organisation" ? "⌷" : "◇"}
      </span>
      <div className="bloc-etroit">
        <p className="mname">{nom}</p>
        <span className="msub">
          {libelle(tiers.type, TYPES_TIERS)}
          {tiers.type !== "organisation" && tiers.contactNom ? ` · ${tiers.contactNom}` : ""}
        </span>
      </div>
      <span className="malloc-na">{t("equipe.sansAllocation")}</span>
      <span />

      {peut("third_parties:assign") ? (
        <Button
          className="mdel"
          onPress={() => setDetachementOuvert(true)}
          aria-label={t("equipe.detacherDu", { nom })}
        >
          <span aria-hidden="true">×</span>
        </Button>
      ) : (
        <span />
      )}

      <FenetreRetrait
        ouverte={detachementOuvert}
        surFermeture={() => setDetachementOuvert(false)}
        titre={t("equipe.detacherTitre")}
        question={t("equipe.confirmerDetachementTiers", { nom })}
        tachesRetirees={tiers.tachesAssignees}
        conserve={t("equipe.tiersConserve")}
        enCours={detachement.isPending}
        surConfirmer={() => detachement.mutate()}
      />
    </div>
  );
}

/**
 * La ligne d'un bénéficiaire.
 *
 * Un client n'est jamais assigné à une tâche — le modèle ne lui donne que ses
 * projets. Le détacher ne retire donc que le rattachement, et la fenêtre ne
 * promet rien d'autre.
 */
function LigneClient({
  projetId,
  client: beneficiaire,
}: {
  projetId: string;
  client: Equipe["clients"][number];
}) {
  const { t } = useTranslation("projets");
  const { t: tErreurs } = useTranslation("erreurs");
  const peut = usePeut();
  const annoncer = useMessages();
  const cache = useQueryClient();
  const [detachementOuvert, setDetachementOuvert] = useState(false);

  const detachement = useMutation({
    mutationFn: () => apiReferentiels.detacherClientDuProjet(projetId, beneficiaire.id),
    onSuccess: () => {
      annoncer("ok", t("equipe.clientDetache", { nom: beneficiaire.nom }));
      setDetachementOuvert(false);
      void cache.invalidateQueries({ queryKey: ["projet", projetId] });
    },
    onError: (e) => annoncer("err", messageErreur(e, tErreurs, t("fiche.echecAction"))),
  });

  return (
    <div className="mrow">
      <span className="mav is-client" aria-hidden="true">
        ▣
      </span>
      <div className="bloc-etroit">
        <p className="mname">{beneficiaire.nom}</p>
        {beneficiaire.contactNom ? (
          <span className="msub">{beneficiaire.contactNom}</span>
        ) : null}
      </div>
      {/* La maquette dit la nature du rattachement sur la ligne même :
          un bénéficiaire n'est pas un contributeur, et la colonne
          d'allocation ne suffit pas à le dire. */}
      <div>
        <span className="pill pill-muted">{t("equipe.beneficiaire")}</span>
      </div>
      <span className="malloc-na">{t("equipe.neContribuePas")}</span>

      {peut("clients:update") ? (
        <Button
          className="mdel"
          onPress={() => setDetachementOuvert(true)}
          aria-label={t("equipe.detacherDu", { nom: beneficiaire.nom })}
        >
          <span aria-hidden="true">×</span>
        </Button>
      ) : (
        <span />
      )}

      <FenetreRetrait
        ouverte={detachementOuvert}
        surFermeture={() => setDetachementOuvert(false)}
        titre={t("equipe.detacherTitre")}
        question={t("equipe.confirmerDetachementClient", { nom: beneficiaire.nom })}
        tachesRetirees={0}
        conserve={t("equipe.clientConserve")}
        enCours={detachement.isPending}
        surConfirmer={() => detachement.mutate()}
      />
    </div>
  );
}

/**
 * La confirmation d'un retrait d'équipe, pour les trois natures.
 *
 * `RG-PRJ-12` — le retrait emporte les affectations aux tâches DU PROJET. La
 * fenêtre le dit **avec son nombre**, avant le geste : « retirer » sans
 * annoncer ce qui part est la moitié d'une confirmation. Le compte vient de
 * l'équipe, déjà chargée — l'écran qui pose la question lit la réponse qu'il a
 * déjà sous les yeux.
 *
 * Et elle dit aussi ce qui RESTE. C'est ce qui distingue « retirer du projet »
 * de « supprimer », et la confusion des deux est le seul risque du geste.
 */
function FenetreRetrait({
  ouverte,
  surFermeture,
  titre,
  question,
  tachesRetirees,
  raciRetires = 0,
  conserve,
  enCours,
  surConfirmer,
}: {
  ouverte: boolean;
  surFermeture: () => void;
  titre: string;
  question: string;
  tachesRetirees: number;
  /**
   * Les rôles RACI que le retrait emporte. Nommés À PART des affectations :
   * ce sont deux attachements distincts, et un total les rendrait
   * irrecoupables à l'écran. Un tiers et un client n'en portent pas — la
   * matrice RACI est nominative.
   */
  raciRetires?: number;
  conserve: string;
  enCours: boolean;
  surConfirmer: () => void;
}) {
  const { t } = useTranslation("projets");

  return (
    <Fenetre
      ouverte={ouverte}
      surFermeture={surFermeture}
      categorie={t("confirmation")}
      titre={titre}
      mention={conserve}
      actions={
        <>
          <Button className="btn btn-secondary" onPress={surFermeture}>
            {t("annuler")}
          </Button>
          <Button className="btn btn-danger" isPending={enCours} onPress={surConfirmer}>
            {t("equipe.retirerAction")}
          </Button>
        </>
      }
    >
      <p className="phrase-confirmation">{question}</p>
      <div className="alert alert-neutral">
        <span className="alert-icon" aria-hidden="true">
          →
        </span>
        <span>
          {tachesRetirees > 0
            ? t("equipe.effetRetraitTaches", { n: tachesRetirees })
            : t("equipe.effetRetraitAucuneTache")}
          {raciRetires > 0 ? ` ${t("equipe.effetRetraitRaci", { n: raciRetires })}` : ""}
        </span>
      </div>
    </Fenetre>
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
  /*
   * La saisie est une CHAÎNE, jamais un nombre : `Number("")` vaut zéro, et un
   * champ vidé le temps de retaper « 80 » vaudrait 0 % à la première frappe.
   */
  const [saisieAllocation, setSaisieAllocation] = useState(String(allocation));

  const libelle = useLibelle();

  /*
   * `EX-PRJ-09` — le changement de rôle, sans retrait ni réajout. La
   * notification d'ajout n'est PAS renvoyée : on ne prévient pas quelqu'un
   * qu'il rejoint un projet qu'il n'a jamais quitté.
   */
  const changementRole = useMutation({
    mutationFn: (roleProjet: string) =>
      api.changerRoleMembre(projetId, membre.userId, { roleProjet }),
    onSuccess: () => {
      annoncer("ok", t("equipe.roleChange", { nom: nomComplet }));
      void client.invalidateQueries({ queryKey: ["projet", projetId] });
    },
    onError: (e) => annoncer("err", messageErreur(e, tErreurs, t("fiche.echecAction"))),
  });

  const changementAllocation = useMutation({
    mutationFn: (tauxAllocation: number) =>
      api.changerRoleMembre(projetId, membre.userId, { tauxAllocation }),
    onSuccess: () => {
      annoncer("ok", t("equipe.allocationChangee", { nom: nomComplet }));
      void client.invalidateQueries({ queryKey: ["projet", projetId] });
    },
    onError: (e) => {
      annoncer("err", messageErreur(e, tErreurs, t("fiche.echecAction")));
      // La valeur revient à celle du serveur : on ne garde pas à l'écran un
      // chiffre que la base a refusé.
      setSaisieAllocation(String(allocation));
    },
  });

  const retrait = useMutation({
    mutationFn: () =>
      appeler<{ tachesRetirees: number; raciRetires: number }>(
        `/projets/${projetId}/membres/${membre.userId}`,
        { methode: "DELETE" },
      ),
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

      {/*
        Le sélecteur de rôle de la maquette 14, sur chaque ligne. Il n'existait
        pas — le rôle s'affichait en texte figé — et le point d'entrée qui
        l'aurait changé n'existait pas non plus : corriger un rôle imposait de
        retirer la personne puis de la rajouter.
      */}
      {peut("projects:manage_members") ? (
        <select
          className="mini-select"
          value={membre.roleProjet}
          aria-label={t("equipe.roleDe", { nom: nomComplet })}
          disabled={changementRole.isPending}
          onChange={(e) => changementRole.mutate(e.target.value)}
        >
          {ROLES_PROJET.map((r) => (
            <option key={r.code} value={r.code}>
              {libelle(r.code, ROLES_PROJET)}
            </option>
          ))}
        </select>
      ) : (
        <span className="mini-select-libelle">{libelle(membre.roleProjet, ROLES_PROJET)}</span>
      )}

      {/*
        L'allocation se corrige sur la ligne, comme le rôle : la maquette pose
        un champ de saisie, son unité et sa barre. Elle était affichée en texte
        figé — « modifier » figure pourtant aux actions du brief, et le point
        d'entrée `PATCH …/membres/:userId` accepte déjà `tauxAllocation`.
        L'écriture part à la validation (`onBlur`), pas à chaque frappe : une
        requête par caractère saisi ferait dix écritures pour « 100 ».
      */}
      <div className="malloc">
        {peut("projects:manage_members") ? (
          <input
            type="number"
            min={0}
            max={100}
            step={5}
            value={saisieAllocation}
            aria-label={t("equipe.allocationDe", { nom: nomComplet })}
            onChange={(e) => setSaisieAllocation(e.target.value)}
            onBlur={() => {
              const valeur = Math.max(0, Math.min(100, Number(saisieAllocation)));
              if (saisieAllocation !== "" && valeur !== allocation) {
                changementAllocation.mutate(valeur);
              }
            }}
          />
        ) : (
          <span className="prow-pct">{allocation}</span>
        )}
        <span className="hours-unit">%</span>
        <Barre
          valeur={Number(saisieAllocation) || 0}
          libelle={t("equipe.allocationDe", { nom: nomComplet })}
        />
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

      {/*
       * La confirmation est la MÊME que celle des tiers et des bénéficiaires.
       * Elle disait jusqu'ici « le temps déclaré et les tâches assignées sont
       * conservés » : la seconde moitié était fausse depuis `RG-PRJ-12`, et
       * elle l'était déjà de fait — garder une affectation après le retrait
       * laissait quelqu'un porteur d'une tâche d'un projet que `RG-SCOPE-02`
       * lui ferme.
       */}
      <FenetreRetrait
        ouverte={retraitOuvert}
        surFermeture={() => setRetraitOuvert(false)}
        titre={t("equipe.retirerTitre")}
        question={t("equipe.confirmerRetrait", { nom: nomComplet })}
        tachesRetirees={membre.tachesAssignees}
        raciRetires={membre.raciSurTaches}
        conserve={t("equipe.membreConserve")}
        enCours={retrait.isPending}
        surConfirmer={() => retrait.mutate()}
      />
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
 *
 * **Deux des trois onglets ne faisaient rien.** « Tiers » et « Client »
 * n'affichaient qu'un paragraphe explicatif, aucune liste, et le bouton
 * d'ajout y était désactivé : il n'existait aucun moyen, dans tout le produit,
 * de rattacher un intervenant extérieur ou un bénéficiaire à un projet.
 * `rattacherTiersAuProjet` et `definirClientsDuProjet` étaient écrites côté
 * client et **appelées par personne** — deux capacités sans client, de la
 * famille la plus coûteuse : une fonctionnalité absente ne fait échouer aucun
 * contrôle.
 *
 * La conséquence débordait cette vue : `RG-TRS-04` borne les tiers assignables
 * à une tâche à ceux qui sont rattachés au projet parent. Un rattachement
 * impossible rendait donc **toute assignation de tiers impossible**, et la
 * fiche tâche affichait une liste de candidats qui ne pouvait jamais qu'être
 * vide.
 *
 * Trois différences de forme entre les trois natures, chacune imposée par le
 * serveur :
 *
 * - L'agent porte un rôle et une allocation ; les deux autres non.
 * - Le tiers se rattache à l'unité (`POST /tiers/projets/:id/rattacher`).
 * - Les clients se **remplacent en bloc** (`RG-PRJ-10`) : ajouter, c'est
 *   renvoyer la liste courante augmentée d'un, jamais un ajout incrémental.
 */
function FenetreAjout({
  projetId,
  ouverte,
  surFermeture,
  dejaMembres,
  dejaTiers,
  clientsRattaches,
}: {
  projetId: string;
  ouverte: boolean;
  surFermeture: () => void;
  dejaMembres: ReadonlySet<string>;
  dejaTiers: ReadonlySet<string>;
  clientsRattaches: string[];
}) {
  const { t } = useTranslation("projets");
  const { t: tErreurs } = useTranslation("erreurs");
  const peut = usePeut();
  const annoncer = useMessages();
  const client = useQueryClient();

  const [nature, setNature] = useState<"agent" | "tiers" | "client">("agent");
  const [qui, setQui] = useState("");
  const [role, setRole] = useState<string>("membre");
  const libelleAjout = useLibelle();
  const [allocation, setAllocation] = useState(50);
  const [erreur, setErreur] = useState<string | null>(null);

  /*
   * `RG-AUTH-05` — l'annuaire est demandé ACTIF : un compte désactivé ne se
   * propose plus au rattachement. Le filtre est au serveur, qui sait le faire ;
   * tronquer la liste après coup laisserait le compte traverser toute autre
   * lecture de la même clé de cache.
   *
   * `RG-GEN-06` — la route est gardée par `users:read` : la demander sans la
   * permission ne rendrait qu'un `403` journalisé et une liste vide.
   */
  const candidats = useQuery({
    queryKey: ["utilisateurs", "assignables"],
    queryFn: () => appeler<Candidat[]>(CHEMIN_ANNUAIRE),
    enabled: ouverte && nature === "agent" && peut(PERMISSION_ANNUAIRE),
  });

  /* `archive` vaut `false` par défaut au serveur : la liste est celle des
     tiers ACTIFS. Un tiers archivé serait refusé au rattachement. */
  const tiersDisponibles = useQuery({
    queryKey: ["tiers", "candidats"],
    queryFn: () => apiReferentiels.listerTiers({}),
    enabled: ouverte && nature === "tiers",
  });

  const clientsDisponibles = useQuery({
    queryKey: ["clients", "candidats"],
    queryFn: () => apiReferentiels.listerClients({ actif: true }),
    enabled: ouverte && nature === "client",
  });

  const rattachables = (tiersDisponibles.data ?? []).filter((x) => !dejaTiers.has(x.id));
  const dejaClients = new Set(clientsRattaches);
  const clientsRattachables = (clientsDisponibles.data ?? []).filter((c) => !dejaClients.has(c.id));

  const apresAjout = (message: string) => {
    annoncer("ok", message);
    setQui("");
    surFermeture();
    void client.invalidateQueries({ queryKey: ["projet", projetId] });
  };

  const ajout = useMutation({
    mutationFn: () =>
      api.ajouterMembre(projetId, { userId: qui, roleProjet: role, tauxAllocation: allocation }),
    onSuccess: () => apresAjout(t("equipe.ajoute")),
    onError: (e) => setErreur(messageErreur(e, tErreurs, t("fiche.echecAction"))),
  });

  const rattachementTiers = useMutation({
    mutationFn: () => apiReferentiels.rattacherTiersAuProjet(projetId, qui),
    onSuccess: () => apresAjout(t("equipe.tiersRattache")),
    onError: (e) => setErreur(messageErreur(e, tErreurs, t("fiche.echecAction"))),
  });

  const rattachementClient = useMutation({
    // `RG-PRJ-10` — remplacement EN BLOC : la liste courante, plus celui-ci.
    mutationFn: () =>
      apiReferentiels.definirClientsDuProjet(projetId, [...clientsRattaches, qui]),
    onSuccess: () => apresAjout(t("equipe.clientRattache")),
    onError: (e) => setErreur(messageErreur(e, tErreurs, t("fiche.echecAction"))),
  });

  const enCours =
    ajout.isPending || rattachementTiers.isPending || rattachementClient.isPending;

  const valider = () => {
    setErreur(null);
    if (!qui) {
      setErreur(
        t(
          nature === "agent"
            ? "equipe.choisirUtilisateur"
            : nature === "tiers"
              ? "equipe.choisirTiers"
              : "equipe.choisirClient",
        ),
      );
      return;
    }
    if (nature === "tiers") {
      rattachementTiers.mutate();
      return;
    }
    if (nature === "client") {
      rattachementClient.mutate();
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

  /*
   * `RG-GEN-06` — une nature qu'on n'a pas le droit de rattacher n'est pas
   * proposée. Le déclencheur de la fenêtre exige déjà `projects:manage_members`,
   * donc l'agent est toujours là ; les deux autres ont leur propre permission,
   * et elles ne sont pas les mêmes — rattacher un prestataire et désigner un
   * commanditaire ne relèvent pas du même métier.
   */
  const natures = (
    [
      { cle: "agent", glyphe: "◍", classe: "mav", permise: true },
      { cle: "tiers", glyphe: "◇", classe: "mav is-ext", permise: peut("third_parties:assign") },
      { cle: "client", glyphe: "▣", classe: "mav is-client", permise: peut("clients:update") },
    ] as const
  ).filter((n) => n.permise);

  const changerNature = (cle: "agent" | "tiers" | "client") => {
    setNature(cle);
    // Un identifiant d'agent n'a rien à faire dans une requête de tiers.
    setQui("");
    setErreur(null);
  };

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
          <Button className="btn btn-primary" isPending={enCours} onPress={valider}>
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
            onPress={() => changerNature(n.cle)}
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
              {(candidats.data ?? []).map((u) => (
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
                <option key={r.code} value={r.code}>
                  {libelleAjout(r.code, ROLES_PROJET)}
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
        <>
          {/* L'explication de la nature reste : elle dit ce qu'un tiers ou un
              bénéficiaire N'A PAS — allocation, charge —, ce qu'aucune liste
              ne dirait. Elle précède le choix, elle ne le remplace plus. */}
          <p className="field-hint">{t(`equipe.aide_${nature}`)}</p>

          <div className="field-block">
            <label className="field-label" htmlFor="eq-externe">
              {t(nature === "tiers" ? "equipe.champTiers" : "equipe.champClient")}{" "}
              <span className="req">*</span>
            </label>
            <select
              className="field"
              id="eq-externe"
              value={qui}
              onChange={(e) => setQui(e.target.value)}
            >
              <option value="">{t("selectionner")}</option>
              {nature === "tiers"
                ? rattachables.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.organisation ?? x.contactNom ?? "—"}
                    </option>
                  ))
                : clientsRattachables.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nom}
                    </option>
                  ))}
            </select>
            {/*
             * `RG-GEN-04` — une liste vide s'explique ET propose la sortie, et
             * les deux raisons de l'être ne se disent pas pareil : « le
             * répertoire est vide » mène à le remplir, « tous sont déjà là »
             * n'appelle aucune action. Les confondre enverrait créer un
             * doublon.
             */}
            <ListeVideRattachement
              nature={nature}
              chargee={
                nature === "tiers"
                  ? tiersDisponibles.data !== undefined
                  : clientsDisponibles.data !== undefined
              }
              repertoireVide={
                nature === "tiers"
                  ? (tiersDisponibles.data ?? []).length === 0
                  : (clientsDisponibles.data ?? []).length === 0
              }
              restants={nature === "tiers" ? rattachables.length : clientsRattachables.length}
            />
          </div>
        </>
      )}
    </Fenetre>
  );
}

/** L'état vide de la liste à rattacher, et sa sortie. */
function ListeVideRattachement({
  nature,
  chargee,
  repertoireVide,
  restants,
}: {
  nature: "tiers" | "client";
  chargee: boolean;
  repertoireVide: boolean;
  restants: number;
}) {
  const { t } = useTranslation("projets");
  if (!chargee || restants > 0) return null;

  if (repertoireVide) {
    return (
      <p className="field-hint">
        {t(nature === "tiers" ? "equipe.repertoireTiersVide" : "equipe.repertoireClientsVide")}{" "}
        <Link className="link link-sm" to={nature === "tiers" ? "/tiers" : "/clients"}>
          {t(nature === "tiers" ? "equipe.ouvrirRepertoireTiers" : "equipe.ouvrirRepertoireClients")}
        </Link>
      </p>
    );
  }
  return (
    <p className="field-hint">
      {t(nature === "tiers" ? "equipe.tousTiersRattaches" : "equipe.tousClientsRattaches")}
    </p>
  );
}
