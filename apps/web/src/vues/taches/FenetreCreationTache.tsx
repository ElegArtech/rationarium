import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "react-aria-components";
import { STATUTS_TACHE, PRIORITES } from "@rationarium/contracts";
import * as api from "../../api/taches.js";
import * as apiProjets from "../../api/projets.js";
import { appeler } from "../../api/client.js";
import { messageErreur } from "../../api/erreurs.js";
import { usePeut, useSession } from "../../session/session.js";
import { Fenetre } from "../../composants/fenetre.js";
import { useMessages } from "../../composants/messages.js";
import { useLibelle } from "../../composants/pastilles.js";
import { assignables, CHEMIN_ANNUAIRE, PERMISSION_ANNUAIRE, type Candidat } from "./assignables.js";
import "../../composants/partages.css";
import "./liste.css";

/**
 * La fenêtre de création.
 *
 * **« Aucun projet (tâche indépendante) » est une option nommée**, avec son
 * indice — pas un champ qu'on laisse vide. Le jalon reste inerte tant qu'aucun
 * projet n'est choisi, et le dit : « Sélectionnez d'abord un projet ».
 *
 * La liste d'assignés suit le projet : membres du projet s'il en a, sinon tous
 * les utilisateurs, avec un avertissement qui explique pourquoi. La règle
 * (`RG-TSK-15`) et ses deux cas limites — annuaire illisible, compte
 * désactivé — vivent dans `assignables.ts`, partagés avec la vue 17.
 */
export function FenetreCreationTache({
  ouverte,
  surFermeture,
  projets,
  projetImpose,
  dateInitiale,
  assignesInitiaux,
}: {
  ouverte: boolean;
  surFermeture: () => void;
  /**
   * Les projets proposés au rattachement.
   *
   * Structurellement minimal, et c'est délibéré : l'onglet d'un projet
   * (vue 12) n'a pas de portefeuille sous la main, seulement le projet
   * courant. Il passait `[]` avec `projetImpose`, ce qui donnait une valeur
   * de `<select>` sans option correspondante — le champ affichait « Aucun
   * projet (tâche indépendante) » pendant que la tâche se créait bel et bien
   * dans le projet.
   */
  projets: { id: string; nom: string }[];
  /** Depuis l'onglet d'un projet, le rattachement est connu et non modifiable. */
  projetImpose?: string;
  /**
   * `EX-PLN-11` — le « + » d'une cellule de planning promet de créer **ici**.
   *
   * Il annonçait « Créer ici — Rémi Chastagner, 2026-09-10 » et menait à
   * `/taches` sans un paramètre : la liste s'ouvrait, aucune fenêtre, et tout
   * était à ressaisir. La personne et la date voyagent donc dans l'adresse et
   * arrivent ici comme valeurs de départ — modifiables, ce ne sont pas des
   * impositions.
   */
  dateInitiale?: string;
  assignesInitiaux?: string[];
}) {
  const { t } = useTranslation("taches");
  const { t: tErreurs } = useTranslation("erreurs");
  const libelle = useLibelle();
  const annoncer = useMessages();
  const client = useQueryClient();
  const peut = usePeut();
  const { session } = useSession();

  const [titre, setTitre] = useState("");
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState(projetImpose ?? "");
  const [milestoneId, setMilestoneId] = useState("");
  const [statut, setStatut] = useState("todo");
  const [priorite, setPriorite] = useState("normal");
  const [dateDebut, setDateDebut] = useState(dateInitiale ?? "");
  const [dateFin, setDateFin] = useState(dateInitiale ?? "");
  /*
   * `EX-TSK-04` — les horaires font partie des onze champs de l'exigence, et
   * ils manquaient partout : au formulaire, au schéma de la route, à
   * l'écriture. Un créneau de réunion était insaisissable, et la vue 07 ne
   * pouvait afficher qu'une bande de journée entière.
   */
  const [heureDebut, setHeureDebut] = useState("");
  const [heureFin, setHeureFin] = useState("");
  const [estimation, setEstimation] = useState("");
  const [assignes, setAssignes] = useState<string[]>(assignesInitiaux ?? []);
  const [titreManquant, setTitreManquant] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const equipe = useQuery({
    queryKey: ["projet", projectId, "equipe"],
    queryFn: () =>
      appeler<{ agents: { userId: string; utilisateur: { prenom: string; nom: string } }[] }>(
        `/projets/${projectId}/equipe`,
      ),
    enabled: ouverte && Boolean(projectId),
  });

  /*
   * `RG-GEN-06` — on ne demande pas ce qui sera refusé. `GET /utilisateurs`
   * est gardé par `users:read` : ouverte par un contributeur, cette fenêtre
   * journalisait un `403` à chaque fois et n'en tirait qu'une liste vide.
   * `RG-AUTH-05` — l'annuaire est demandé ACTIF : un compte désactivé ne se
   * propose plus à l'assignation.
   */
  const annuaireLisible = peut(PERMISSION_ANNUAIRE);
  const tous = useQuery({
    queryKey: ["utilisateurs", "assignables"],
    queryFn: () => appeler<CandidatAvecServices[]>(CHEMIN_ANNUAIRE),
    enabled: ouverte && annuaireLisible,
  });

  const route = useQuery({
    queryKey: ["projet", projectId, "route"],
    queryFn: () => apiProjets.feuilleDeRoute(projectId),
    enabled: ouverte && Boolean(projectId),
  });

  const membresDuProjet = (equipe.data?.agents ?? []).map((a) => ({
    id: a.userId,
    prenom: a.utilisateur.prenom,
    nom: a.utilisateur.nom,
  }));
  const { candidats, indice, alerte } = assignables({
    projectId: projectId || null,
    membres: membresDuProjet,
    equipeChargee: equipe.isSuccess,
    annuaire: tous.data ?? [],
    annuaireLisible,
    moi: { id: session.id, prenom: session.prenom, nom: session.nom },
  });

  const creation = useMutation({
    mutationFn: () =>
      api.creer({
        titre,
        ...(description ? { description } : {}),
        projectId: projectId || null,
        ...(milestoneId ? { milestoneId } : {}),
        statut,
        priorite,
        ...(dateDebut ? { dateDebut } : {}),
        ...(dateFin ? { dateFin } : {}),
        ...(heureDebut ? { heureDebut } : {}),
        ...(heureFin ? { heureFin } : {}),
        ...(estimation ? { estimationHeures: Number(estimation) } : {}),
        ...(assignes.length > 0 ? { assigneIds: assignes } : {}),
      }),
    onSuccess: () => {
      annoncer("ok", t("liste.creee"));
      setTitre("");
      setDescription("");
      setHeureDebut("");
      setHeureFin("");
      setAssignes([]);
      surFermeture();
      void client.invalidateQueries({ queryKey: ["taches"] });
    },
    onError: (e) => setErreur(messageErreur(e, tErreurs, t("liste.echecCreation"))),
  });

  const valider = () => {
    setErreur(null);
    const vide = !titre.trim();
    setTitreManquant(vide);
    if (vide) {
      setErreur(t("liste.titreObligatoire"));
      return;
    }
    /*
     * Par courtoisie seulement : le serveur refuse la même chose en
     * `horaires_incoherents`. Le dire ici évite un aller-retour, il ne
     * remplace pas le contrôle.
     */
    if (heureDebut && heureFin && heureFin <= heureDebut) {
      setErreur(t("liste.horairesIncoherents"));
      return;
    }
    if (dateDebut && dateFin && dateFin < dateDebut) {
      setErreur(tErreurs("datesIncoherentes"));
      return;
    }
    creation.mutate();
  };

  return (
    <Fenetre
      ouverte={ouverte}
      surFermeture={surFermeture}
      categorie={t("liste.nouvelleTache")}
      titre={t("liste.creer")}
      large
      mention={t("champObligatoire")}
      actions={
        <>
          <Button className="btn btn-secondary" onPress={surFermeture}>
            {t("annuler")}
          </Button>
          <Button className="btn btn-primary" isPending={creation.isPending} onPress={valider}>
            {t("liste.creerLaTache")}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          valider();
        }}
        noValidate
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
            <label className="field-label" htmlFor="tk-titre">
              {t("liste.titreChamp")} <span className="req">*</span>
            </label>
            <input
              className="field"
              id="tk-titre"
              type="text"
              value={titre}
              aria-invalid={titreManquant}
              onChange={(e) => setTitre(e.target.value)}
              placeholder={t("liste.titreExemple")}
            />
            <p className={`field-error${titreManquant ? "" : " is-quiet"}`}>
              <span aria-hidden="true">↑</span>
              <span>{t("liste.titreObligatoire")}</span>
            </p>
          </div>

          <div className="field-block span2">
            <label className="field-label" htmlFor="tk-desc">
              {t("liste.descriptionChamp")}
            </label>
            <textarea
              className="field"
              id="tk-desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="field-block span2">
            <label className="field-label" htmlFor="tk-projet">
              {t("liste.projet")}
            </label>
            <select
              className="field"
              id="tk-projet"
              value={projectId}
              disabled={Boolean(projetImpose)}
              onChange={(e) => {
                setProjectId(e.target.value);
                setMilestoneId("");
                setAssignes([]);
              }}
            >
              <option value="">{t("liste.aucunProjet")}</option>
              {projets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nom}
                </option>
              ))}
            </select>
            <p className="field-hint">{t("liste.aucunProjetAide")}</p>
          </div>

          <div className="field-block">
            <label className="field-label" htmlFor="tk-jalon">
              {t("liste.jalon")}
            </label>
            <select
              className="field"
              id="tk-jalon"
              value={milestoneId}
              disabled={!projectId}
              onChange={(e) => setMilestoneId(e.target.value)}
            >
              <option value="">
                {projectId ? t("liste.sansJalon") : t("liste.choisirProjetDabord")}
              </option>
              {(route.data?.jalons ?? []).map((j) => (
                <option key={j.id} value={j.id}>
                  {j.nom}
                </option>
              ))}
            </select>
          </div>

          <div className="field-block">
            <label className="field-label" htmlFor="tk-estim">
              {t("liste.estimation")}
            </label>
            <input
              className="field"
              id="tk-estim"
              type="number"
              min={0}
              step={0.5}
              value={estimation}
              onChange={(e) => setEstimation(e.target.value)}
            />
          </div>

          <div className="field-block">
            <label className="field-label" htmlFor="tk-statut">
              {t("liste.colStatut")}
            </label>
            <select
              className="field"
              id="tk-statut"
              value={statut}
              onChange={(e) => setStatut(e.target.value)}
            >
              {STATUTS_TACHE.map((s) => (
                <option key={s.code} value={s.code}>
                  {libelle(s.code, STATUTS_TACHE)}
                </option>
              ))}
            </select>
          </div>

          <div className="field-block">
            <label className="field-label" htmlFor="tk-prio">
              {t("liste.priorite")}
            </label>
            <select
              className="field"
              id="tk-prio"
              value={priorite}
              onChange={(e) => setPriorite(e.target.value)}
            >
              {PRIORITES.map((p) => (
                <option key={p.code} value={p.code}>
                  {libelle(p.code, PRIORITES)}
                </option>
              ))}
            </select>
          </div>

          <div className="field-block">
            <label className="field-label" htmlFor="tk-debut">
              {t("liste.dateDebut")}
            </label>
            <input
              className="field"
              id="tk-debut"
              type="date"
              value={dateDebut}
              onChange={(e) => setDateDebut(e.target.value)}
            />
          </div>

          <div className="field-block">
            <label className="field-label" htmlFor="tk-fin">
              {t("liste.dateFin")}
            </label>
            <input
              className="field"
              id="tk-fin"
              type="date"
              value={dateFin}
              onChange={(e) => setDateFin(e.target.value)}
            />
          </div>

          <div className="field-block">
            <label className="field-label" htmlFor="tk-h-debut">
              {t("liste.heureDebut")}
            </label>
            <input
              className="field"
              id="tk-h-debut"
              type="time"
              value={heureDebut}
              onChange={(e) => setHeureDebut(e.target.value)}
            />
          </div>

          <div className="field-block">
            <label className="field-label" htmlFor="tk-h-fin">
              {t("liste.heureFin")}
            </label>
            <input
              className="field"
              id="tk-h-fin"
              type="time"
              value={heureFin}
              onChange={(e) => setHeureFin(e.target.value)}
            />
            <p className="field-hint">{t("liste.horairesAide")}</p>
          </div>

          <InvitationService annuaire={tous.data ?? []} candidats={candidats} choisis={assignes} surChangement={setAssignes} />
          <div className="field-block span2">
            <span className="field-label" id="tk-assignes-lab">
              {t("liste.assignes")}
            </span>
            <div className="pickbox" role="group" aria-labelledby="tk-assignes-lab">
              <p className={`pick-hint${alerte ? " is-warn" : ""}`}>{t(`liste.${indice}`)}</p>
              {candidats.map((u) => (
                <label className="pick-item" key={u.id}>
                  <input
                    type="checkbox"
                    checked={assignes.includes(u.id)}
                    onChange={(e) =>
                      setAssignes((s) =>
                        e.target.checked ? [...s, u.id] : s.filter((x) => x !== u.id),
                      )
                    }
                  />
                  <span>
                    {u.prenom} {u.nom}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </form>
    </Fenetre>
  );
}


export type CandidatAvecServices = Candidat & { services?: { service: { id: string; nom: string } }[] };

/** Une invitation explicite déplie les membres admissibles et refuse les doublons nommément. */
export function InvitationService({ annuaire, candidats, choisis, surChangement }: {
  annuaire: CandidatAvecServices[]; candidats: Candidat[]; choisis: string[]; surChangement: (ids: string[]) => void;
}) {
  const { t } = useTranslation("taches");
  const [serviceId, setServiceId] = useState("");
  const [doublons, setDoublons] = useState<string | null>(null);
  const groupes = new Map<string, {nom: string; membres: Candidat[]} >();
  for (const personne of annuaire) for (const {service} of personne.services ?? []) {
    const groupe = groupes.get(service.id) ?? {nom: service.nom, membres: []};
    groupe.membres.push(personne); groupes.set(service.id, groupe);
  }
  const disponibles = [...groupes].filter(([,g]) => g.membres.every(p => candidats.some(c => c.id === p.id)));
  if (!disponibles.length) return null;
  const groupe = disponibles.find(([id]) => id === serviceId)?.[1];
  return <div className="field-block span2">
    <label className="field-label">{t("liste.inviterService")}<select className="field" value={groupe ? serviceId : ""} onChange={e => {setServiceId(e.target.value); setDoublons(null);}}><option value="">{t("liste.choisirService")}</option>{disponibles.map(([id,g]) => <option key={id} value={id}>{g.nom}</option>)}</select></label>
    <p className="field-hint">{t("liste.servicesAdmissibles")}</p>
    <Button className="btn btn-secondary" isDisabled={!groupe} onPress={() => {
      if (!groupe) return;
      const deja = groupe.membres.filter(p => choisis.includes(p.id));
      const nouveaux = groupe.membres.filter(p => !choisis.includes(p.id));
      setDoublons(deja.length ? deja.map(p => `${p.prenom} ${p.nom}`).join(", ") : null);
      if (nouveaux.length) surChangement([...choisis, ...nouveaux.map(p => p.id)]);
    }}>{t("liste.ajouterService")}</Button>
    {doublons ? <p className="alert alert-error" role="alert">{t("liste.serviceDoublons", {noms:doublons})}</p> : null}
  </div>;
}
