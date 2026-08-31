import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "react-aria-components";
import { STATUTS_TACHE, PRIORITES } from "@rationarium/contracts";
import * as api from "../../api/taches.js";
import * as apiProjets from "../../api/projets.js";
import { appeler } from "../../api/client.js";
import { messageErreur } from "../../api/erreurs.js";
import { Fenetre } from "../../composants/fenetre.js";
import { useMessages } from "../../composants/messages.js";
import { useLibelle } from "../../composants/pastilles.js";
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
 * les utilisateurs, avec un avertissement qui explique pourquoi.
 */
export function FenetreCreationTache({
  ouverte,
  surFermeture,
  projets,
  projetImpose,
}: {
  ouverte: boolean;
  surFermeture: () => void;
  projets: apiProjets.LigneProjet[];
  /** Depuis l'onglet d'un projet, le rattachement est connu et non modifiable. */
  projetImpose?: string;
}) {
  const { t } = useTranslation("taches");
  const { t: tErreurs } = useTranslation("erreurs");
  const libelle = useLibelle();
  const annoncer = useMessages();
  const client = useQueryClient();

  const [titre, setTitre] = useState("");
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState(projetImpose ?? "");
  const [milestoneId, setMilestoneId] = useState("");
  const [statut, setStatut] = useState("todo");
  const [priorite, setPriorite] = useState("normal");
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");
  /*
   * `EX-TSK-04` — les horaires font partie des onze champs de l'exigence, et
   * ils manquaient partout : au formulaire, au schéma de la route, à
   * l'écriture. Un créneau de réunion était insaisissable, et la vue 07 ne
   * pouvait afficher qu'une bande de journée entière.
   */
  const [heureDebut, setHeureDebut] = useState("");
  const [heureFin, setHeureFin] = useState("");
  const [estimation, setEstimation] = useState("");
  const [assignes, setAssignes] = useState<string[]>([]);
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

  const tous = useQuery({
    queryKey: ["utilisateurs", "tous"],
    queryFn: () =>
      appeler<{ id: string; prenom: string; nom: string }[]>("/utilisateurs"),
    enabled: ouverte,
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
  const projetSansMembre = Boolean(projectId) && equipe.isSuccess && membresDuProjet.length === 0;
  const candidats = projectId && !projetSansMembre ? membresDuProjet : (tous.data ?? []);

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

          <div className="field-block span2">
            <span className="field-label" id="tk-assignes-lab">
              {t("liste.assignes")}
            </span>
            <div className="pickbox" role="group" aria-labelledby="tk-assignes-lab">
              <p className={`pick-hint${projetSansMembre ? " is-warn" : ""}`}>
                {projectId
                  ? projetSansMembre
                    ? t("liste.projetSansMembre")
                    : t("liste.membresDuProjet")
                  : t("liste.tousLesUtilisateurs")}
              </p>
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
