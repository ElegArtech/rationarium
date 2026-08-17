import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "react-aria-components";
import * as apiProjets from "../../api/projets.js";
import * as api from "../../api/taches.js";
import { usePeut } from "../../session/session.js";
import { Chargement, ErreurDeChargement } from "../../composants/etats.js";
import { CadreProjet } from "../projets/Fiche.js";
import { Kanban } from "./Kanban.js";
import { FenetreImport, useVolumesProjet } from "../../composants/Import.js";
import * as apiImports from "../../api/imports.js";
import { FenetreCreationTache } from "./FenetreCreationTache.js";
import "../projets/fiche.css";
import "./liste.css";

/**
 * Vue 12 — Projet, onglet Tâches (kanban).
 *
 * La vue reprend le tableau de la vue 16 dans le cadre du projet : mêmes
 * colonnes, même alternative clavier, mêmes règles de déplacement. Les
 * dupliquer aurait garanti leur divergence à la première correction.
 *
 * L'import CSV et l'import de projet appartiennent à L-24 (imports et
 * exports) : les boutons ne sont pas dessinés ici, car un bouton qui ne fait
 * rien est pire qu'un bouton absent.
 */
/**
 * La fenêtre d'import projet, isolée pour que les volumes ne soient chargés
 * qu'à son ouverture : les demander au chargement de l'onglet coûterait une
 * requête à chaque visite, pour une fenêtre qu'on ouvre rarement.
 */
function ImportProjet({ projetId, surFermer }: { projetId: string; surFermer: () => void }) {
  // Nommé `tImports` et non `t` : le contrôle i18n attribue les clés au
  // namespace du `t` du fichier, et deux `t` nus le rendraient aveugle.
  const { t: tImports } = useTranslation("imports");
  const client = useQueryClient();
  const volumes = useVolumesProjet(projetId);

  return (
    <FenetreImport
      type="projet"
      titre={tImports("titreProjet")}
      colonnes={[
        "rowType", "name", "dueDate", "title", "description", "status", "priority",
        "assigneeEmail", "milestoneName", "estimatedHours", "startDate", "endDate", "subtasks",
      ]}
      modeProjet
      volumes={volumes.data}
      surExecuter={async (contenu, mode) => {
        const rendu = await apiImports.importerProjet(projetId, contenu, mode);
        await client.invalidateQueries({ queryKey: ["taches"] });
        return rendu;
      }}
      surFermer={surFermer}
    />
  );
}

/**
 * L'import CSV des seules tâches — le premier des deux boutons d'import de la
 * maquette, distinct de l'import projet qui, lui, porte les jalons.
 */
function ImportTaches({ projetId, surFermer }: { projetId: string; surFermer: () => void }) {
  const { t: tImports } = useTranslation("imports");
  const client = useQueryClient();

  return (
    <FenetreImport
      type="taches"
      titre={tImports("titreTaches")}
      colonnes={[
        "title", "description", "status", "priority", "assigneeEmail",
        "milestoneName", "estimatedHours", "startDate", "endDate",
      ]}
      surExecuter={async (contenu) => {
        const rendu = await apiImports.importerTaches(projetId, contenu);
        await client.invalidateQueries({ queryKey: ["taches"] });
        return rendu;
      }}
      surFermer={surFermer}
    />
  );
}

export function OngletTaches({ projetId }: { projetId: string }) {
  const { t } = useTranslation("taches");
  const { t: tImports } = useTranslation("imports");
  const peut = usePeut();
  const [recherche, setRecherche] = useState("");
  const [jalon, setJalon] = useState("");
  const [annonce, setAnnonce] = useState("");
  const [creationOuverte, setCreationOuverte] = useState(false);
  const [importOuvert, setImportOuvert] = useState(false);
  const [importTachesOuvert, setImportTachesOuvert] = useState(false);

  const projet = useQuery({
    queryKey: ["projet", projetId],
    queryFn: () => apiProjets.fiche(projetId),
  });
  const cle = ["taches", { projectId: projetId }] as const;
  const taches = useQuery({ queryKey: cle, queryFn: () => api.lister({ projectId: projetId }) });

  if (projet.isPending || taches.isPending) return <Chargement quoi={t("lesTaches")} />;
  if (projet.isError)
    return <ErreurDeChargement erreur={projet.error} surReessai={() => void projet.refetch()} />;
  if (taches.isError)
    return <ErreurDeChargement erreur={taches.error} surReessai={() => void taches.refetch()} />;

  /*
   * Les jalons proposés au filtre viennent des tâches chargées, pas d'une
   * requête de plus : filtrer par un jalon qui ne porte aucune tâche ne
   * changerait rien à l'écran.
   */
  const jalons = [
    ...new Map(
      taches.data
        .map((x) => x.milestone)
        .filter((m): m is NonNullable<typeof m> => m !== null)
        .map((m) => [m.id, m] as const),
    ).values(),
  ].sort((a, b) => a.nom.localeCompare(b.nom));

  const filtrees = taches.data.filter(
    (x) =>
      (!recherche || x.titre.toLowerCase().includes(recherche.toLowerCase())) &&
      (!jalon || x.milestone?.id === jalon),
  );

  return (
    <CadreProjet projet={projet.data} onglet="taches">
      {/* Le vocabulaire de la maquette : `.filters`, et non une barre d'outils
          réinventée. Le séparateur `.vsep` marque la coupure entre ce qui
          filtre le tableau et ce qui y verse du contenu. */}
      <div className="filters">
        <span className="panel-title">{t("onglet.titre")}</span>
        <input
          className="f-input filtre-recherche"
          type="search"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder={t("onglet.rechercher")}
          aria-label={t("onglet.rechercher")}
        />
        <select
          className="f-input"
          value={jalon}
          onChange={(e) => setJalon(e.target.value)}
          aria-label={t("onglet.jalon")}
        >
          <option value="">{t("onglet.tousLesJalons")}</option>
          {jalons.map((j) => (
            <option key={j.id} value={j.id}>
              {j.nom}
            </option>
          ))}
        </select>

        <span className="vsep" />

        {peut("tasks:export") ? (
          <a className="chip-btn" href={apiImports.adresseExportTaches(projetId)} download>
            {tImports("exporterTaches")}
          </a>
        ) : null}
        {/* `RG-IMP-05`, `RG-IMP-06` — l'import projet complet : deux modes,
            prévisualisation obligatoire, tout-ou-rien en mode Remplacer.
            L'import CSV des seules tâches est le second bouton de la maquette. */}
        {peut("tasks:import") ? (
          <Button className="chip-btn" onPress={() => setImportTachesOuvert(true)}>
            {tImports("importerCsv")}
          </Button>
        ) : null}
        {peut("tasks:import") ? (
          <Button className="chip-btn" onPress={() => setImportOuvert(true)}>
            {tImports("ouvrirImportProjet")}
          </Button>
        ) : null}

        <div className="ligne-actions-fin">
          {peut("tasks:create") ? (
            <Button className="btn btn-primary" onPress={() => setCreationOuverte(true)}>
              {t("onglet.nouvelleTache")}
            </Button>
          ) : null}
        </div>
      </div>

      {/* L'indice n'est pas décoratif : il annonce le raccourci que la carte
          implémente réellement (Alt + ← / →). Un indice qui mentirait vaudrait
          moins que pas d'indice du tout. */}
      <p className="field-hint" style={{ margin: "0 0 12px" }}>
        {t("kanban.indice")}
      </p>

      <Kanban
        taches={filtrees}
        cleRequete={cle}
        surRechargement={() => void taches.refetch()}
        surAnnonce={setAnnonce}
        {...(peut("tasks:create") ? { surCreation: () => setCreationOuverte(true) } : {})}
      />

      {/* La région vive de la maquette : elle dit où la carte a atterri. */}
      <p className="sr-only" aria-live="polite">
        {annonce}
      </p>

      {/* La même fenêtre que la vue 16, avec le projet imposé : deux
          formulaires de création divergeraient à la première correction. */}
      <FenetreCreationTache
        ouverte={creationOuverte}
        surFermeture={() => setCreationOuverte(false)}
        projets={[]}
        projetImpose={projetId}
      />

      {importTachesOuvert ? (
        <ImportTaches projetId={projetId} surFermer={() => setImportTachesOuvert(false)} />
      ) : null}

      {importOuvert ? <ImportProjet projetId={projetId} surFermer={() => setImportOuvert(false)} /> : null}
    </CadreProjet>
  );
}
