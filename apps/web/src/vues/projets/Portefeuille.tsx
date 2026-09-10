import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { IconeProjet, SelecteurIconeProjet } from "../../composants/icones-projet.js";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Button } from "react-aria-components";
import { STATUTS_PROJET, PRIORITES } from "@rationarium/contracts";
import * as api from "../../api/projets.js";
import { appeler } from "../../api/client.js";
import { arborescence } from "../../api/administration.js";
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

import {
  adressePortefeuille,
  lirePortefeuille,
  PORTEFEUILLE_VIDE,
  type EtatPortefeuille,
} from "./adresse.js";

export function Portefeuille() {
  const { t } = useTranslation("projets");
  const { t: tErreurs } = useTranslation("erreurs");
  const libelle = useLibelle();
  const peut = usePeut();
  const annoncer = useMessages();
  const client = useQueryClient();

  /*
   * `EX-PRJ-02`, `RG-GEN-04` — **les filtres vivent dans l'adresse.**
   *
   * Posés en `useState`, ils se défaisaient au premier aller-retour : un
   * filtre sur « Actif », un projet ouvert, « ← Retour aux projets », et la
   * liste revenait à « Tous les statuts » sans un mot. Voir `adresse.ts`.
   *
   * Maquette 10 — « Mes projets ». Le brief en fait une VARIANTE : sans droit
   * de gestion globale, on ne voit déjà que ses projets et le bouton ne change
   * rien ; avec ce droit, il resserre la lecture sur les siens. Le filtrage
   * reste au serveur — le client ne trie pas une liste qu'il a déjà reçue.
   */
  const navigate = useNavigate();
  const brut = useRouterState({ select: (e) => e.location.search }) as Record<string, unknown>;
  const etat = lirePortefeuille(brut);
  const { statut, priorite, mesProjets, archives = false } = etat;

  /*
   * La recherche tient sa valeur EN LOCAL pendant la frappe : lue depuis
   * l'adresse, chaque caractère attendrait un aller-retour du routeur, et une
   * frappe rapide en perdrait. Même règle que le curseur d'avancement de la
   * vue 17 — la valeur est locale pendant le geste, l'adresse suit.
   */
  const [recherche, setRechercheLocale] = useState(etat.recherche);

  const majEtat = (partiel: Partial<EtatPortefeuille>) => {
    // `replace` : régler un filtre n'est pas une navigation qu'on veut défaire
    // pas à pas — sinon le retour arrière rejouerait chaque frappe.
    void navigate({
      to: ".",
      search: adressePortefeuille({ ...etat, ...partiel }),
      replace: true,
    });
  };
  const setRecherche = (v: string) => {
    setRechercheLocale(v);
    majEtat({ recherche: v });
  };
  const setStatut = (v: string) => majEtat({ statut: v });
  const setPriorite = (v: string) => majEtat({ priorite: v });
  const setMesProjets = (v: boolean) => majEtat({ mesProjets: v });

  const [creationOuverte, setCreationOuverte] = useState(false);
  const [annulationOuverte, setAnnulationOuverte] = useState(false);
  const [projetAnnuleId, setProjetAnnuleId] = useState("");
  const [erreurAnnulation, setErreurAnnulation] = useState<string | null>(null);
  const annulation = useMutation({
    mutationFn: (id: string) => api.annulerProjet(id),
    onSuccess: () => {
      annoncer("ok", t("fiche.annulerFait"));
      setAnnulationOuverte(false);
      setProjetAnnuleId("");
      return client.invalidateQueries({ queryKey: ["projets"] });
    },
    onError: e => setErreurAnnulation(messageErreur(e, tErreurs, t("fiche.echecAction"))),
  });

  const filtres = { recherche, statut, priorite, archive: archives, ...(mesProjets ? { mesProjets } : {}) };
  const filtre = Boolean(recherche || statut || priorite || mesProjets || archives);

  const requete = useQuery({
    queryKey: ["projets", filtres],
    queryFn: () => api.portefeuille(filtres),
  });

  // La confirmation porte uniquement sur un projet encore présent et nommé.
  const projetAAnnuler = requete.isFetching ? undefined : requete.data?.projets.find(
    p => p.id === projetAnnuleId && p.statut !== "cancelled",
  );
  const fermerAnnulation = () => {
    setAnnulationOuverte(false);
    setProjetAnnuleId("");
    setErreurAnnulation(null);
  };

  const reinitialiser = () => {
    setRechercheLocale("");
    majEtat({ ...PORTEFEUILLE_VIDE, archives: false });
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

        {peut("projects:update") ? <Button className="chip-btn" onPress={() => { setProjetAnnuleId(""); setAnnulationOuverte(true); setErreurAnnulation(null); }}>
          {t("portefeuille.annulerUnProjet")}
        </Button> : null}
        <span className="vsep" />

        {/* `RG-GEN-06` — un resserrement de lecture, pas un contrôle de droit :
            l'état courant se dit par `aria-pressed`, le bouton reste un bouton
            bascule et le serveur reste seul juge de ce qui est visible. */}
        <Button
          className="chip-btn"
          aria-pressed={mesProjets}
          onPress={() => setMesProjets(!mesProjets)}
        >
          {t("portefeuille.mesProjets")}
        </Button>
        <Button className="chip-btn" aria-pressed={archives} onPress={() => majEtat({ archives: !archives })}>
          {t("portefeuille.archives")}
        </Button>
      </div>

      {requete.isPending ? <Chargement quoi={t("portefeuille.lesProjets")} /> : null}
      {requete.isError ? (
        <ErreurDeChargement erreur={requete.error} surReessai={() => void requete.refetch()} />
      ) : null}

      {requete.data ? (
        requete.data.projets.length > 0 ? (
          <div className="plist">
            {/* La carte emporte l'adresse du portefeuille : c'est elle que le
                « ← Retour aux projets » de la fiche rendra intacte. */}
            {requete.data.projets.map((p) => (
              <LigneProjet key={p.id} projet={p} retour={adressePortefeuille(etat)} />
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

      <Fenetre
        ouverte={annulationOuverte}
        surFermeture={fermerAnnulation}
        categorie={t("confirmation")}
        titre={t("fiche.annulerProjet")}
        mention={t("fiche.annulationReversible")}
        actions={<>
          <Button className="btn btn-secondary" onPress={fermerAnnulation}>{t("fiche.annulationRenoncer")}</Button>
          <Button className="btn btn-danger" isDisabled={!projetAAnnuler} isPending={annulation.isPending} onPress={() => { if (projetAAnnuler) annulation.mutate(projetAAnnuler.id); }}>{t("fiche.annulationConfirmer")}</Button>
        </>}
      >
        {erreurAnnulation ? <div className="alert alert-error" role="alert">{erreurAnnulation}</div> : null}
        <label className="field-label" htmlFor="pf-annuler">{t("portefeuille.projetAAnnuler")}</label>
        <select className="field" id="pf-annuler" value={projetAAnnuler?.id ?? ""} onChange={e => setProjetAnnuleId(e.target.value)}>
          <option value="">{t("portefeuille.choisirProjet")}</option>
          {(requete.data?.projets ?? []).filter(p => p.statut !== "cancelled").map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}
        </select>
        {projetAAnnuler ? <>
          <p className="phrase-confirmation">{t("fiche.confirmationAnnulation")} <span className="quoted">« {projetAAnnuler.nom} »</span> ?</p>
          <div className="danger-box"><strong>{t("fiche.annulationConsequencesTitre")}</strong><ul>
            <li>{t("fiche.annulationEffetFige")}</li>
            <li>{t("fiche.annulationEffetTaches", { n: projetAAnnuler._count.taches })}</li>
            <li>{t("fiche.annulationEffetRestaurable")}</li>
          </ul></div>
        </> : <p className="field-hint">{t("portefeuille.annulationListe")}</p>}
      </Fenetre>

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
function LigneProjet({
  projet,
  retour,
}: {
  projet: api.LigneProjet;
  /** L'adresse du portefeuille filtré, que la fiche rendra au retour. */
  retour: Record<string, string>;
}) {
  const { t } = useTranslation("projets");

  /*
   * L'ACHÈVEMENT se lit sur la progression, pas sur le statut.
   *
   * `RG-PRJ-07` — la progression est calculée depuis l'avancement des tâches et
   * n'est jamais saisie ; le statut, lui, est une décision de gestion, qui peut
   * dire « Terminé » alors qu'il reste du travail. C'est la progression qui
   * répond à « ce projet est-il fini ? », et c'est elle qui teinte la ligne.
   *
   * Un projet ABANDONNÉ n'est pas un projet achevé, même à cent pour cent : il
   * garde son atténuation et rien de plus.
   */
  const acheve = projet.progression === 100 && projet.statut !== "cancelled";

  return (
    <Link
      to="/projets/$id"
      params={{ id: projet.id }}
      search={retour}
      className={`prow-card${projet.statut === "cancelled" ? " is-cancelled" : ""}${
        acheve ? " is-complete" : ""
      }`}
    >
      {/* La pastille porte le SYMBOLE du référentiel, pas un caractère : deux
          projets peuvent commencer par la même lettre, pas porter la même
          icône. Sans icône choisie, l'initiale plutôt qu'un carré vide. */}
      <IconeProjet icone={projet.icone} nom={projet.nom} />

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
            termine={acheve}
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
 * La fenêtre de création — **et de modification**.
 *
 * `existant` vaut `null` en création. Deux fenêtres pour les mêmes champs
 * finiraient par diverger : une règle ajoutée d'un côté manquerait de l'autre,
 * et rien ne le dirait. C'est le parti pris déjà retenu pour l'organisation
 * (vue 29) et les bénéficiaires (vue 26).
 *
 * Les champs obligatoires sont validés **avant** l'envoi, et le message
 * d'ensemble est celui de la maquette. La validation locale ne remplace pas
 * celle du serveur : elle évite un aller-retour pour une erreur que le
 * formulaire connaît déjà.
 */
export function FenetreCreation({
  ouverte,
  existant = null,
  surFermeture,
  surSucces,
  traduireErreur,
}: {
  ouverte: boolean;
  existant?: {
    id: string;
    nom: string;
    description: string | null;
    statut: string;
    priorite: string;
    dateDebut: string;
    dateFin: string;
    budgetHeures: number | null;
    /** `EX-PRJ-04` — la fenêtre sert aussi à CHANGER l'icône d'un projet. */
    icone: string | null;
    chefId?: string | null;
    sponsorId?: string | null;
    departementId?: string | null;
    version: number;
  } | null;
  surFermeture: () => void;
  surSucces: () => void;
  traduireErreur: (e: unknown) => string;
}) {
  const { t } = useTranslation("projets");
  const { t: tErreurs } = useTranslation("erreurs");
  const libelle = useLibelle();
  const peut = usePeut();
  const personnes = useQuery({
    queryKey: ["utilisateurs", "assignables"],
    queryFn: () => appeler<api.Personne[]>("/utilisateurs?actif=true"),
    enabled: ouverte && peut("users:read") && peut("projects:manage_members"),
  });
  const organisation = useQuery({
    queryKey: ["organisation", "choix-projet"],
    queryFn: () => arborescence(),
    enabled: ouverte && peut("directions:read"),
  });

  const [valeurs, setValeurs] = useState({
    nom: "",
    description: "",
    statut: "active",
    priorite: "normal",
    dateDebut: "",
    dateFin: "",
    budgetHeures: "",
    chefId: "", sponsorId: "", departementId: "",
  });
  /*
   * L'icône vit à part de `valeurs` : c'est un code de vocabulaire fermé, pas
   * une chaîne saisie, et « aucune icône » est `null`, pas la chaîne vide.
   * Les mêler ferait passer `""` au serveur, que la bibliothèque refuse — un
   * refus juste, sur une intention qui ne l'était pas.
   */
  const [icone, setIcone] = useState<string | null>(null);
  const [manquants, setManquants] = useState<ChampObligatoire[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  /*
   * Les champs ne se rechargent qu'à l'OUVERTURE : sans cette clé, chaque
   * rendu écraserait la saisie en cours par la valeur d'origine, et le champ
   * paraîtrait refuser la frappe.
   */
  const [ouvertSur, setOuvertSur] = useState<string | null>(null);
  const cle = ouverte ? (existant?.id ?? "nouveau") : null;
  if (cle !== ouvertSur) {
    setOuvertSur(cle);
    setValeurs({
      nom: existant?.nom ?? "",
      description: existant?.description ?? "",
      statut: existant?.statut ?? "active",
      priorite: existant?.priorite ?? "normal",
      dateDebut: existant?.dateDebut?.slice(0, 10) ?? "",
      dateFin: existant?.dateFin?.slice(0, 10) ?? "",
      budgetHeures: existant?.budgetHeures != null ? String(existant.budgetHeures) : "",
      chefId: existant?.chefId ?? "",
      sponsorId: existant?.sponsorId ?? "",
      departementId: existant?.departementId ?? "",
    });
    setIcone(existant?.icone ?? null);
    setManquants([]);
    setErreur(null);
  }

  const creation = useMutation({
    mutationFn: () =>
      existant
        ? api.modifierProjet(existant.id, {
            nom: valeurs.nom,
            description: valeurs.description || null,
            statut: valeurs.statut,
            priorite: valeurs.priorite,
            dateDebut: valeurs.dateDebut,
            dateFin: valeurs.dateFin,
            budgetHeures: valeurs.budgetHeures ? Number(valeurs.budgetHeures) : null,
            // `null` retire l'icône ; l'omettre la laisserait telle quelle.
            icone,
            ...(peut("projects:manage_members") ? { chefId: valeurs.chefId || null, sponsorId: valeurs.sponsorId || null } : {}),
            ...(peut("directions:read") ? { departementId: valeurs.departementId || null } : {}),
            version: existant.version,
          })
        : api.creerProjet({
        nom: valeurs.nom,
        ...(peut("projects:manage_members") ? { chefId: valeurs.chefId || null, sponsorId: valeurs.sponsorId || null } : {}),
        ...(valeurs.departementId ? { departementId: valeurs.departementId } : {}),
        ...(valeurs.description ? { description: valeurs.description } : {}),
        statut: valeurs.statut,
        priorite: valeurs.priorite,
        dateDebut: valeurs.dateDebut,
        dateFin: valeurs.dateFin,
        ...(valeurs.budgetHeures ? { budgetHeures: Number(valeurs.budgetHeures) } : {}),
        // À la création, « aucune icône » se dit par l'absence du champ : le
        // schéma le veut optionnel, jamais nul.
        ...(icone ? { icone } : {}),
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
    if (valeurs.dateFin < valeurs.dateDebut) {
      setErreur(tErreurs("datesIncoherentes"));
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
      /*
       * **La fenêtre sert aux DEUX gestes, et elle doit le dire des deux
       * côtés.** Le surtitre annonçait « Nouveau projet » et la commande
       * « Créer le projet » alors qu'on venait de cliquer sur « Modifier » :
       * le titre était le seul des trois à suivre. Une commande qui nomme le
       * mauvais geste fait douter de ce qu'elle va faire — et la seule sortie
       * visible était alors « Annuler ».
       *
       * Le surtitre porte désormais la FAMILLE d'objet et le titre le geste,
       * comme le font déjà les fenêtres de tiers, de client, de jalon et
       * d'épopée. C'est le motif du produit ; celle-ci en était sortie seule.
       */
      categorie={t("portefeuille.categorie")}
      titre={existant ? t("portefeuille.modifier") : t("portefeuille.creer")}
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
            {existant ? t("enregistrer") : t("portefeuille.creerLeProjet")}
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

        {/*
          `EX-PRJ-04` — le sélecteur ouvre le formulaire, comme la maquette 10 :
          « L'icône de projet est un repère d'identification fort, réutilisé
          dans le planning, les tâches et le Gantt. » Le mettre en dernier, à
          côté du budget, en ferait une décoration facultative.
        */}
        <div className="field-block span2 ipick-bloc">
          <label className="field-label" htmlFor="pf-icone-recherche">
            {t("portefeuille.iconeDuProjet")}
          </label>
          <SelecteurIconeProjet
            valeur={icone}
            surChangement={setIcone}
            idRecherche="pf-icone-recherche"
          />
        </div>

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

          {(["chefId", "sponsorId", "departementId"] as const).map((cle) => {
            const org = cle === "departementId";
            const permis = org ? peut("directions:read") : peut("projects:manage_members") && peut("users:read");
            const choix = org ? organisation.data?.departements ?? [] : (personnes.data ?? []).map(p => ({ id: p.id, nom: `${p.prenom} ${p.nom}` }));
            const selection = cle === "chefId" ? existant?.chefId : cle === "sponsorId" ? existant?.sponsorId : existant?.departementId;
            return <div className="field-block" key={cle}>
              <label className="field-label" htmlFor={`pf-${cle}`}>{t(`portefeuille.${cle}`)}</label>
              <select className="field" id={`pf-${cle}`} {...champ(cle)} disabled={!permis} aria-describedby={!permis ? `pf-${cle}-aide` : undefined}>
                <option value="">{t("nonRenseigne")}</option>
                {selection && !choix.some(c => c.id === selection) ? <option value={selection}>{t("portefeuille.selectionConservee")}</option> : null}
                {choix.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
              </select>
              {!permis ? <p className="field-hint" id={`pf-${cle}-aide`}>{t("portefeuille.choixRestreint")}</p> : null}
              {permis && (org ? organisation.isError : personnes.isError) ? <p className="field-error" role="alert">{t("portefeuille.choixErreur")}</p> : null}
            </div>;
          })}
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
