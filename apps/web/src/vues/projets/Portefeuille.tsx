import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button } from "react-aria-components";
import { STATUTS_PROJET, PRIORITES } from "@trame/contracts";
import * as api from "../../api/projets.js";
import { messageErreur } from "../../api/erreurs.js";
import { usePeut } from "../../session/session.js";
import { Chargement, ErreurDeChargement } from "../../composants/etats.js";
import { Fenetre } from "../../composants/fenetre.js";
import { useMessages } from "../../composants/messages.js";
import { Pastille, Barre, AvatarAgent, useLibelle } from "../../composants/pastilles.js";
import { formaterDate } from "../../formats.js";
import "../../composants/partages.css";
import "./portefeuille.css";

/**
 * Vue 10 — Portefeuille de projets.
 *
 * **Deux états vides, pas un.** « Le portefeuille est vide » et « aucun projet
 * ne correspond à votre recherche » appellent des sorties opposées : créer
 * dans un cas, réinitialiser les filtres dans l'autre. Les confondre laisse
 * l'utilisateur devant un bouton qui ne répond pas à sa situation
 * (`RG-GEN-04`, et note explicite de `design/etats.json`).
 *
 * **Le filtrage est fait au serveur**, pas sur un tableau déjà chargé : le
 * périmètre s'applique à la requête, et le compteur « {n} sur {total} » n'a de
 * sens que si le total vient de la même source que la liste.
 */

const CHAMPS_OBLIGATOIRES = ["nom", "dateDebut", "dateFin"] as const;
type ChampObligatoire = (typeof CHAMPS_OBLIGATOIRES)[number];

export function Portefeuille() {
  const { t } = useTranslation("projets");
  const { t: tErreurs } = useTranslation("erreurs");
  const libelle = useLibelle();
  const peut = usePeut();
  const annoncer = useMessages();
  const client = useQueryClient();

  const [recherche, setRecherche] = useState("");
  const [statut, setStatut] = useState("");
  const [priorite, setPriorite] = useState("");
  const [creationOuverte, setCreationOuverte] = useState(false);

  const filtres = { recherche, statut, priorite };
  const filtre = Boolean(recherche || statut || priorite);

  const requete = useQuery({
    queryKey: ["projets", filtres],
    queryFn: () => api.portefeuille(filtres),
  });

  const reinitialiser = () => {
    setRecherche("");
    setStatut("");
    setPriorite("");
  };

  return (
    <div className="page">
      <div className="pl-toolbar">
        <div>
          <span className="eyebrow">{t("portefeuille.surtitre")}</span>
          <h1 className="h1 titre-vue">{t("portefeuille.titre")}</h1>
        </div>
        <span className="pcount">
          {requete.data
            ? filtre
              ? t("portefeuille.compteFiltre", {
                  n: requete.data.affiches,
                  total: requete.data.total,
                })
              : t("portefeuille.compte", { n: requete.data.total })
            : "—"}
        </span>
        {peut("projects:create") ? (
          <div className="pl-toolbar-fin">
            <Button className="btn btn-primary" onPress={() => setCreationOuverte(true)}>
              {t("portefeuille.creer")}
            </Button>
          </div>
        ) : null}
      </div>

      <div className="filters">
        <input
          className="f-input filtre-recherche"
          type="search"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder={t("portefeuille.rechercher")}
          aria-label={t("portefeuille.rechercher")}
        />
        <select
          className="f-input"
          value={statut}
          onChange={(e) => setStatut(e.target.value)}
          aria-label={t("portefeuille.statut")}
        >
          <option value="">{t("portefeuille.tousStatuts")}</option>
          {STATUTS_PROJET.map((s) => (
            <option key={s.code} value={s.code}>
              {libelle(s.code, STATUTS_PROJET)}
            </option>
          ))}
        </select>
        <select
          className="f-input"
          value={priorite}
          onChange={(e) => setPriorite(e.target.value)}
          aria-label={t("portefeuille.priorite")}
        >
          <option value="">{t("portefeuille.toutesPriorites")}</option>
          {PRIORITES.map((p) => (
            <option key={p.code} value={p.code}>
              {libelle(p.code, PRIORITES)}
            </option>
          ))}
        </select>
      </div>

      {requete.isPending ? <Chargement quoi={t("portefeuille.lesProjets")} /> : null}
      {requete.isError ? (
        <ErreurDeChargement erreur={requete.error} surReessai={() => void requete.refetch()} />
      ) : null}

      {requete.data ? (
        requete.data.projets.length > 0 ? (
          <div className="plist">
            {requete.data.projets.map((p) => (
              <LigneProjet key={p.id} projet={p} />
            ))}
          </div>
        ) : filtre ? (
          <div className="empty empty-large">
            <p>{t("portefeuille.videTitre")}</p>
            <small>{t("portefeuille.videFiltre")}</small>
            <Button className="chip-btn" onPress={reinitialiser}>
              {t("portefeuille.reinitialiser")}
            </Button>
          </div>
        ) : (
          <div className="empty empty-large">
            <p>{t("portefeuille.videTitre")}</p>
            <small>{t("portefeuille.videAucun")}</small>
            {peut("projects:create") ? (
              <Button className="btn btn-primary" onPress={() => setCreationOuverte(true)}>
                {t("portefeuille.creer")}
              </Button>
            ) : null}
          </div>
        )
      ) : null}

      <FenetreCreation
        ouverte={creationOuverte}
        surFermeture={() => setCreationOuverte(false)}
        surSucces={() => {
          setCreationOuverte(false);
          annoncer("ok", t("portefeuille.cree"));
          void client.invalidateQueries({ queryKey: ["projets"] });
        }}
        traduireErreur={(e) => messageErreur(e, tErreurs, t("portefeuille.echecCreation"))}
      />
    </div>
  );
}

/** Une ligne du portefeuille. Les colonnes s'alignent, donc se comparent. */
function LigneProjet({ projet }: { projet: api.LigneProjet }) {
  const { t } = useTranslation("projets");

  return (
    <Link
      to="/projets/$id"
      params={{ id: projet.id }}
      className={`prow-card${projet.statut === "cancelled" ? " is-cancelled" : ""}`}
    >
      <span className="picon-box" aria-hidden="true">
        <span className="picon-glyphe">{projet.icone ?? "◇"}</span>
      </span>

      <div className="prow-main">
        <p className="prow-title">{projet.nom}</p>
        <p className={`prow-desc${projet.description ? "" : " is-none"}`}>
          {projet.description ?? t("portefeuille.sansDescription")}
        </p>
      </div>

      <div className="prow-col">
        <div className="pills">
          <Pastille code={projet.statut} vocabulaire={STATUTS_PROJET} />
          <Pastille code={projet.priorite} vocabulaire={PRIORITES} />
        </div>
      </div>

      <div className="prow-col c-dates">
        <span className="prow-k">{t("portefeuille.periode")}</span>
        <span className="prow-v">
          {formaterDate(projet.dateDebut)} → {formaterDate(projet.dateFin)}
        </span>
      </div>

      <div className="prow-col c-budget">
        <span className="prow-k">{t("portefeuille.budget")}</span>
        <span className="prow-v">
          {projet.budgetHeures ? t("heures", { n: Number(projet.budgetHeures) }) : "—"}
        </span>
      </div>

      <div className="prow-col c-lead">
        <span className="prow-k">{t("portefeuille.chef")}</span>
        {projet.chef ? (
          <div className="prow-lead">
            <AvatarAgent prenom={projet.chef.prenom} nom={projet.chef.nom} />
            <span>
              {projet.chef.prenom} {projet.chef.nom}
            </span>
          </div>
        ) : (
          <span className="prow-v">{t("nonRenseigne")}</span>
        )}
      </div>

      <div className="prow-col c-prog">
        <span className="prow-k">{t("portefeuille.avancement")}</span>
        <div className="prow-progline">
          <Barre
            valeur={projet.progression}
            termine={projet.statut === "done"}
            libelle={t("portefeuille.avancementDe", { nom: projet.nom })}
          />
          <span className="prow-pct">{projet.progression} %</span>
        </div>
      </div>

      <span className="prow-go" aria-hidden="true">
        ›
      </span>
    </Link>
  );
}

/**
 * La fenêtre de création.
 *
 * Les champs obligatoires sont validés **avant** l'envoi, et le message
 * d'ensemble est celui de la maquette. La validation locale ne remplace pas
 * celle du serveur : elle évite un aller-retour pour une erreur que le
 * formulaire connaît déjà.
 */
function FenetreCreation({
  ouverte,
  surFermeture,
  surSucces,
  traduireErreur,
}: {
  ouverte: boolean;
  surFermeture: () => void;
  surSucces: () => void;
  traduireErreur: (e: unknown) => string;
}) {
  const { t } = useTranslation("projets");
  const libelle = useLibelle();

  const [valeurs, setValeurs] = useState({
    nom: "",
    description: "",
    statut: "active",
    priorite: "normal",
    dateDebut: "",
    dateFin: "",
    budgetHeures: "",
  });
  const [manquants, setManquants] = useState<ChampObligatoire[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);

  const creation = useMutation({
    mutationFn: () =>
      api.creerProjet({
        nom: valeurs.nom,
        ...(valeurs.description ? { description: valeurs.description } : {}),
        statut: valeurs.statut,
        priorite: valeurs.priorite,
        dateDebut: valeurs.dateDebut,
        dateFin: valeurs.dateFin,
        ...(valeurs.budgetHeures ? { budgetHeures: Number(valeurs.budgetHeures) } : {}),
      }),
    onSuccess: surSucces,
    onError: (e) => setErreur(traduireErreur(e)),
  });

  const valider = () => {
    setErreur(null);
    const vides = CHAMPS_OBLIGATOIRES.filter((c) => !valeurs[c].trim());
    setManquants(vides);
    if (vides.length > 0) {
      setErreur(t("portefeuille.champsObligatoires"));
      return;
    }
    creation.mutate();
  };

  const soumettre = (e: FormEvent) => {
    e.preventDefault();
    valider();
  };

  const champ = (cle: keyof typeof valeurs) => ({
    value: valeurs[cle],
    onChange: (e: { target: { value: string } }) =>
      setValeurs((v) => ({ ...v, [cle]: e.target.value })),
  });

  return (
    <Fenetre
      ouverte={ouverte}
      surFermeture={surFermeture}
      categorie={t("portefeuille.nouveauProjet")}
      titre={t("portefeuille.creer")}
      large
      mention={t("champsObligatoires")}
      actions={
        <>
          <Button className="btn btn-secondary" onPress={surFermeture}>
            {t("annuler")}
          </Button>
          <Button
            className="btn btn-primary"
            isPending={creation.isPending}
            onPress={valider}
          >
            {t("portefeuille.creerLeProjet")}
          </Button>
        </>
      }
    >
      <form onSubmit={soumettre} noValidate>
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
            <label className="field-label" htmlFor="pf-nom">
              {t("portefeuille.nom")} <span className="req">*</span>
            </label>
            <input
              className="field"
              id="pf-nom"
              type="text"
              aria-invalid={manquants.includes("nom")}
              placeholder={t("portefeuille.nomExemple")}
              {...champ("nom")}
            />
            <p className={`field-error${manquants.includes("nom") ? "" : " is-quiet"}`}>
              <span aria-hidden="true">↑</span>
              <span>{t("portefeuille.nomRequis")}</span>
            </p>
          </div>

          <div className="field-block span2">
            <label className="field-label" htmlFor="pf-desc">
              {t("portefeuille.description")}
            </label>
            <textarea
              className="field"
              id="pf-desc"
              rows={2}
              placeholder={t("portefeuille.descriptionExemple")}
              {...champ("description")}
            />
          </div>

          <div className="field-block">
            <label className="field-label" htmlFor="pf-statut">
              {t("portefeuille.statut")}
            </label>
            <select className="field" id="pf-statut" {...champ("statut")}>
              {STATUTS_PROJET.map((s) => (
                <option key={s.code} value={s.code}>
                  {libelle(s.code, STATUTS_PROJET)}
                </option>
              ))}
            </select>
          </div>

          <div className="field-block">
            <label className="field-label" htmlFor="pf-priorite">
              {t("portefeuille.priorite")}
            </label>
            <select className="field" id="pf-priorite" {...champ("priorite")}>
              {PRIORITES.map((p) => (
                <option key={p.code} value={p.code}>
                  {libelle(p.code, PRIORITES)}
                </option>
              ))}
            </select>
          </div>

          <div className="field-block">
            <label className="field-label" htmlFor="pf-debut">
              {t("portefeuille.dateDebut")} <span className="req">*</span>
            </label>
            <input
              className="field"
              id="pf-debut"
              type="date"
              aria-invalid={manquants.includes("dateDebut")}
              {...champ("dateDebut")}
            />
            <p className={`field-error${manquants.includes("dateDebut") ? "" : " is-quiet"}`}>
              <span aria-hidden="true">↑</span>
              <span>{t("portefeuille.dateDebutRequise")}</span>
            </p>
          </div>

          <div className="field-block">
            <label className="field-label" htmlFor="pf-fin">
              {t("portefeuille.dateFin")} <span className="req">*</span>
            </label>
            <input
              className="field"
              id="pf-fin"
              type="date"
              aria-invalid={manquants.includes("dateFin")}
              {...champ("dateFin")}
            />
            <p className={`field-error${manquants.includes("dateFin") ? "" : " is-quiet"}`}>
              <span aria-hidden="true">↑</span>
              <span>{t("portefeuille.dateFinApres")}</span>
            </p>
          </div>

          <div className="field-block">
            <label className="field-label" htmlFor="pf-budget">
              {t("portefeuille.budgetHeures")}
            </label>
            <input
              className="field"
              id="pf-budget"
              type="number"
              min={0}
              step={10}
              {...champ("budgetHeures")}
            />
          </div>
        </div>
      </form>
    </Fenetre>
  );
}
