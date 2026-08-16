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

export function OngletTaches({ projetId }: { projetId: string }) {
  const { t } = useTranslation("taches");
  const { t: tImports } = useTranslation("imports");
  const peut = usePeut();
  const [recherche, setRecherche] = useState("");
  const [creationOuverte, setCreationOuverte] = useState(false);
  const [importOuvert, setImportOuvert] = useState(false);

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

  const filtrees = recherche
    ? taches.data.filter((x) => x.titre.toLowerCase().includes(recherche.toLowerCase()))
    : taches.data;

  return (
    <CadreProjet projet={projet.data} onglet="taches">
      <div className="pl-toolbar">
        <div>
          <h2 className="panel-title sous-titre-vue">{t("onglet.titre")}</h2>
        </div>
        <div className="ligne-actions-fin">
          <input
            className="f-input filtre-recherche"
            type="search"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder={t("onglet.rechercher")}
            aria-label={t("onglet.rechercher")}
          />
          {peut("tasks:export") ? (
            <a className="chip-btn" href={apiImports.adresseExportTaches(projetId)} download>
              {tImports("exporterTaches")}
            </a>
          ) : null}
          {/* `RG-IMP-05`, `RG-IMP-06` — l'import projet complet : deux modes,
              prévisualisation obligatoire, tout-ou-rien en mode Remplacer. */}
          {peut("tasks:import") ? (
            <Button className="chip-btn" onPress={() => setImportOuvert(true)}>
              {tImports("ouvrirImportProjet")}
            </Button>
          ) : null}
          {peut("tasks:create") ? (
            <Button className="btn btn-primary" onPress={() => setCreationOuverte(true)}>
              {t("onglet.nouvelleTache")}
            </Button>
          ) : null}
        </div>
      </div>

      <Kanban
        taches={filtrees}
        cleRequete={cle}
        surRechargement={() => void taches.refetch()}
      />

      {/* La même fenêtre que la vue 16, avec le projet imposé : deux
          formulaires de création divergeraient à la première correction. */}
      <FenetreCreationTache
        ouverte={creationOuverte}
        surFermeture={() => setCreationOuverte(false)}
        projets={[]}
        projetImpose={projetId}
      />

      {importOuvert ? <ImportProjet projetId={projetId} surFermer={() => setImportOuvert(false)} /> : null}
    </CadreProjet>
  );
}
