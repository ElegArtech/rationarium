import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Tooltip, TooltipTrigger } from "react-aria-components";
import { DUREES_TACHE_PREDEFINIE, TYPES_RECURRENCE } from "@rationarium/contracts";
import * as api from "../../api/administration.js";
import * as apiPlanning from "../../api/planning.js";
import { messageErreur } from "../../api/erreurs.js";
import { usePeut } from "../../session/session.js";
import { Chargement, ErreurDeChargement, AccesRefuse } from "../../composants/etats.js";
import { useLibelle } from "../../composants/pastilles.js";
import { Fenetre } from "../../composants/fenetre.js";
import { useMessages } from "../../composants/messages.js";
import { formaterDate, formaterHeure } from "../../formats.js";
import "../../composants/partages.css";
/* Les sections dont cette vue emprunte le vocabulaire : `.hours-pair` et
   `.slider` (tâches), `.rec-prev*` (événements), `.quoted` et
   `.phrase-confirmation` (projets). Le nom est celui de la maquette ; la règle
   vit là où sa section a été portée (`DESIGN.md § 4`). */
import "../taches/liste.css";
import "../taches/fiche.css";
import "../occupations/evenements.css";
import "../projets/fiche.css";
import "./predefinies.css";

/**
 * Vue 34 — Catalogue des tâches prédéfinies.
 *
 * **La prévisualisation en langage naturel de la règle est indispensable** —
 * le brief le dit ainsi. « type: ordinal, ordinal: 3, jourSemaine: 2 » ne se
 * relit pas ; « le 3ᵉ mardi de chaque mois, à partir du 1er septembre » si.
 * C'est la seule forme sous laquelle une récurrence se vérifie d'un coup d'œil.
 *
 * **Le poids est une jauge de cinq crans, doublée de son libellé.** Un nombre
 * de 1 à 5 ne dit pas s'il est léger ou lourd ; « 4 — Lourde » si, et la jauge
 * le montre sans lecture.
 *
 * Une tâche désactivée reste au catalogue (`RG-ACT-05`) : la faire disparaître
 * laisserait des assignations passées rattachées à un objet introuvable.
 *
 * **Le catalogue n'était que consulté.** La maquette pose sur chaque ligne ses
 * deux commandes — « Modifier », « Désactiver » —, un bouton de création en
 * tête, et deux commandes sur les règles. Elles n'existaient pas, alors que le
 * serveur les servait déjà toutes : `creerTache`, `modifierTache`,
 * `creerRecurrence`, `basculerRecurrence`, `genererDepuisRecurrences`. Une vue
 * d'administration en lecture seule sur un module qui s'administre est un
 * manque, pas une prudence.
 */

const POIDS = [1, 2, 3, 4, 5] as const;

/** Les jours ouvrés, tels que la maquette les propose. Dimanche = 0 côté moteur. */
const JOURS_OUVRES = [1, 2, 3, 4, 5] as const;

/** Les couleurs proposées, reprises de la maquette — jetons, jamais littéraux. */
const COULEURS = [
  "var(--activity)",
  "var(--st-doing)",
  "var(--telework)",
  "var(--st-review)",
  "var(--event)",
  "var(--leave)",
  "var(--st-done)",
  "var(--muted)",
] as const;

/** `-1` désigne « le dernier », comme le moteur de génération l'entend. */
const ORDINAUX = [1, 2, 3, 4, -1] as const;

export function Predefinies() {
  const { t } = useTranslation("administration");
  const libelle = useLibelle();
  const peut = usePeut();
  const [inactives, setInactives] = useState(false);

  /* Ce que la vue tient ouvert. Une seule fenêtre à la fois : les trois du
     brief se ferment mutuellement, et l'état le dit plutôt qu'un booléen par
     fenêtre, qui autoriserait deux fenêtres empilées. */
  const [edition, setEdition] = useState<api.TachePredefinie | "nouvelle" | null>(null);
  const [bascule, setBascule] = useState<api.TachePredefinie | null>(null);
  const [regleNouvelle, setRegleNouvelle] = useState(false);
  const [generation, setGeneration] = useState(false);

  const requete = useQuery({
    queryKey: ["predefinies", inactives],
    queryFn: () => api.cataloguePredefini(inactives),
    enabled: peut("predefined_tasks:read"),
  });

  if (!peut("predefined_tasks:read")) return <AccesRefuse />;
  if (requete.isPending) return <Chargement quoi={t("predefinies.leCatalogue")} />;
  if (requete.isError)
    return <ErreurDeChargement erreur={requete.error} surReessai={() => void requete.refetch()} />;

  const nombreDeRegles = requete.data.reduce((s, x) => s + x.recurrences.length, 0);
  /* Les comptes se calculent AVANT l'appel de traduction : `t(...)` n'accepte
     qu'un niveau de parenthèses dans le contrôle `i18n:check`, et une clé
     enfouie sous un `.filter((x) => …)` y passe pour orpheline. */
  const nombreActives = requete.data.filter((x) => x.actif).length;
  const nombreReglesActives = requete.data.reduce(
    (s, x) => s + x.recurrences.filter((r) => r.active).length,
    0,
  );

  /*
   * `RG-GEN-06` — le client masque par COURTOISIE. Le contrôle reste au
   * serveur : `predefined_tasks:create`, `:update` et `:generate` sont
   * exigées par la garde, et le seraient même si ces boutons s'affichaient.
   */
  const peutCreer = peut("predefined_tasks:create");
  const peutModifier = peut("predefined_tasks:update");
  const peutGenerer = peut("predefined_tasks:generate");

  const boutonCreer = peutCreer ? (
    <Button className="btn btn-primary" onPress={() => setEdition("nouvelle")}>
      {t("predefinies.nouvelle")}
    </Button>
  ) : null;

  return (
    <div className="page">
      <div className="pl-toolbar">
        <div>
          <span className="eyebrow">{t("predefinies.surtitre")}</span>
          <h1 className="h1 titre-vue">{t("predefinies.titre")}</h1>
          <p className="lede">{t("predefinies.chapeau")}</p>
        </div>
        <div className="pt-actions">{boutonCreer}</div>
      </div>

      <section className="panel">
        <div className="panel-head">
          <span className="panel-title">{t("predefinies.catalogue")}</span>
          {/* La maquette compte deux choses : le total affiché et les actives.
              Le second est ce qui reste assignable ; sans lui, une liste où
              l'on vient de cocher « afficher les inactives » ne dit plus
              combien de permanences tiennent encore. */}
          <span className="eyebrow">
            {t("predefinies.compte", { n: requete.data.length, a: nombreActives })}
          </span>
          <label className="check check-espace">
            <input
              type="checkbox"
              checked={inactives}
              onChange={(e) => setInactives(e.target.checked)}
            />
            <span>{t("predefinies.afficherInactives")}</span>
          </label>
        </div>

        <div className="pt-row pt-head">
          <span />
          <span>{t("predefinies.colNom")}</span>
          <span>{t("predefinies.colDuree")}</span>
          <span>{t("predefinies.colTeletravail")}</span>
          <span>{t("predefinies.colPoids")}</span>
          <span>{t("predefinies.colStatut")}</span>
          <span className="pt-col-actions">{t("predefinies.colActions")}</span>
        </div>

        {requete.data.length === 0 ? (
          <div className="empty">
            <p>{t("predefinies.videTitre")}</p>
            <small>{t("predefinies.videExplication")}</small>
            {boutonCreer}
          </div>
        ) : (
          <>
            {requete.data.map((tache) => (
              <div className={`pt-row${tache.actif ? "" : " is-off"}`} key={tache.id}>
                <span
                  className="pt-ic"
                  style={{ background: tache.couleur ?? "var(--accent)" }}
                  aria-hidden="true"
                >
                  {/* La maquette dessine un symbole, pas une lettre : quand la
                      tâche porte une icône du vocabulaire, c'est elle qui est
                      rendue. Sans icône, le glyphe de repli tient la place. */}
                  {tache.icone ? (
                    <svg className="picon">
                      <use href={`#${tache.icone}`} />
                    </svg>
                  ) : (
                    "◍"
                  )}
                </span>

                <div className="bloc-etroit">
                  <p className="pt-n">{tache.nom}</p>
                  {tache.description ? <span className="pt-d">{tache.description}</span> : null}
                </div>

                <span className="bloc-etroit">
                  {/* La durée est une PASTILLE de vocabulaire, comme le statut
                      — c'est ce que la maquette dessine. Elle était rendue en
                      texte nu : même mot, autre registre, et la colonne
                      perdait la lecture d'un coup d'œil. */}
                  <span className="pill" style={{ color: "var(--accent)" }}>
                    {libelle(tache.dureeParDefaut, DUREES_TACHE_PREDEFINIE)}
                  </span>
                  {/* `RG-ACT-02` — un créneau exige ses horaires. Les afficher
                      ici évite d'ouvrir la fiche pour vérifier. */}
                  {tache.heureDebut && tache.heureFin ? (
                    <span className="pt-slot">
                      {formaterHeure(tache.heureDebut)} → {formaterHeure(tache.heureFin)}
                    </span>
                  ) : null}
                </span>

                <span>
                  <span className={`tt-ok ${tache.teletravailAutorise ? "is-yes" : "is-no"}`}>
                    {tache.teletravailAutorise
                      ? t("predefinies.teletravailOui")
                      : t("predefinies.teletravailNon")}
                  </span>
                </span>

                <Poids valeur={tache.poids} />

                <span>
                  <span
                    className="pill"
                    style={{ color: tache.actif ? "var(--st-done)" : "var(--muted)" }}
                  >
                    {tache.actif ? t("predefinies.active") : t("predefinies.inactive")}
                  </span>
                </span>

                {/*
                  `RG-GEN-06` — sans `predefined_tasks:update`, les commandes
                  sont MASQUÉES et non désactivées : elles n'ont aucun sens
                  pour un profil de consultation, et la vue reste crédible en
                  variante « droits minimaux » (`02 § D.3`). Le nombre
                  d'assignations, lui, se lit là où il compte : la fenêtre de
                  désactivation le nomme, parce que c'est ce qu'elle conserve.
                */}
                <span className="lv-acts">
                  {peutModifier ? (
                    <>
                      <Button className="ms-toggle" onPress={() => setEdition(tache)}>
                        {t("modifier")}
                      </Button>
                      {/* `RG-ACT-05` — la désactivation ne supprime rien, et la
                          fenêtre le dit avant d'agir. */}
                      <Button className="ms-toggle" onPress={() => setBascule(tache)}>
                        {tache.actif
                          ? t("predefinies.desactiver")
                          : t("predefinies.reactiver")}
                      </Button>
                    </>
                  ) : null}
                </span>
              </div>
            ))}
          </>
        )}
      </section>

      <section className="panel matrice-espace">
        <div className="panel-head">
          <span className="panel-title">{t("predefinies.reglesTitre")}</span>
          <span className="eyebrow">
            {t("predefinies.compteRegles", { n: nombreDeRegles, a: nombreReglesActives })}
          </span>
          {peutGenerer ? (
            <Button className="chip-btn regles-generer" onPress={() => setGeneration(true)}>
              {t("predefinies.genererAssignations")}
            </Button>
          ) : null}
          {peutModifier && requete.data.length > 0 ? (
            <Button className="btn btn-primary" onPress={() => setRegleNouvelle(true)}>
              {t("predefinies.nouvelleRegle")}
            </Button>
          ) : null}
        </div>
        <div className="panel-body">
          {/* Une règle décrit un rythme ; elle ne crée rien. Le dire ici évite
              d'attendre des assignations qui ne viendront qu'à la génération. */}
          <p className="field-hint hint-regles">{t("predefinies.reglesAide")}</p>
          {requete.data.every((x) => x.recurrences.length === 0) ? (
            <div className="empty">
              <p>{t("predefinies.aucuneRegle")}</p>
              <small>{t("predefinies.aucuneRegleAide")}</small>
            </div>
          ) : (
            requete.data.flatMap((tache) =>
              tache.recurrences.map((r) => (
                <CarteRegle
                  key={r.id}
                  regle={r}
                  tache={tache}
                  modifiable={peutModifier}
                  dureeLisible={libelle(tache.dureeParDefaut, DUREES_TACHE_PREDEFINIE)}
                />
              )),
            )
          )}
        </div>
      </section>

      <FenetreTache
        cible={edition}
        surFermeture={() => setEdition(null)}
      />
      <FenetreBascule tache={bascule} surFermeture={() => setBascule(null)} />
      <FenetreRegle
        ouverte={regleNouvelle}
        taches={requete.data}
        surFermeture={() => setRegleNouvelle(false)}
      />
      <FenetreGeneration
        ouverte={generation}
        taches={requete.data}
        surFermeture={() => setGeneration(false)}
      />
    </div>
  );
}

/**
 * Une règle, telle que la maquette la pose : la phrase, sa tâche, sa bascule
 * d'activité et ses deux commandes.
 *
 * « Modifier » et « Supprimer » sont **désactivées avec leur explication**
 * (`RG-GEN-06`) : le serveur sait créer une règle et l'arrêter, il ne sait ni
 * la réécrire ni l'effacer. Les proposer puis échouer serait pire que de dire
 * pourquoi elles ne sont pas offertes.
 */
function CarteRegle({
  regle,
  tache,
  modifiable,
  dureeLisible,
}: {
  regle: api.RecurrencePredefinie;
  tache: api.TachePredefinie;
  modifiable: boolean;
  dureeLisible: string;
}) {
  const { t } = useTranslation("administration");
  const { t: tErreurs } = useTranslation("erreurs");
  const annoncer = useMessages();
  const client = useQueryClient();

  const bascule = useMutation({
    mutationFn: (active: boolean) => api.basculerRecurrencePredefinie(regle.id, active),
    onSuccess: (r) => {
      annoncer("ok", r.active ? t("predefinies.regleReprise") : t("predefinies.regleArretee"));
      void client.invalidateQueries({ queryKey: ["predefinies"] });
    },
    onError: (e) => annoncer("err", messageErreur(e, tErreurs, t("predefinies.echecAction"))),
  });

  return (
    <div className={`rule-card${regle.active ? "" : " is-off"}`}>
      <span
        className="pt-ic pt-ic-sm"
        style={{ background: tache.couleur ?? "var(--accent)" }}
        aria-hidden="true"
      >
        {tache.icone ? (
          <svg className="picon">
            <use href={`#${tache.icone}`} />
          </svg>
        ) : (
          "◍"
        )}
      </span>
      <span className="bloc-etroit">
        {/* La phrase, pas les champs. */}
        <span className="rule-nl2">
          <PhraseRecurrence regle={regle} />
        </span>
        <span className="rule-meta">
          {tache.nom} · {dureeLisible} ·{" "}
          {regle.dateFin
            ? t("predefinies.jusquAu", { fin: formaterDate(regle.dateFin) })
            : t("predefinies.sansDateDeFin")}
        </span>
      </span>

      <label className="check">
        <input
          type="checkbox"
          checked={regle.active}
          disabled={!modifiable || bascule.isPending}
          onChange={(e) => bascule.mutate(e.target.checked)}
        />
        <span>{t("predefinies.regleActive")}</span>
      </label>

      <span className="lv-acts">
        {/* `RG-GEN-06` — désactivées AVEC leur explication. Ce n'est pas une
            question de droits mais de capacité : le serveur sait poser une
            règle et l'arrêter, il ne sait ni la réécrire ni l'effacer. */}
        {/* `RG-GEN-06` — `aria-disabled` et non `isDisabled` : un bouton
            nativement désactivé ne reçoit ni survol ni focus, donc son
            infobulle ne s'ouvre jamais et l'explication promise n'existe pas.
            Voir `action-protegee.tsx`, où le même défaut vivait pour TOUTE
            action refusée pour cause de droits. */}
        <TooltipTrigger delay={200}>
          <Button className="ms-toggle" aria-disabled onPress={() => undefined}>
            {t("modifier")}
          </Button>
          <Tooltip className="tooltip">{t("predefinies.regleNonModifiable")}</Tooltip>
        </TooltipTrigger>
        <TooltipTrigger delay={200}>
          <Button className="ms-toggle" aria-disabled onPress={() => undefined}>
            {t("supprimer")}
          </Button>
          <Tooltip className="tooltip">{t("predefinies.regleNonSupprimable")}</Tooltip>
        </TooltipTrigger>
      </span>
    </div>
  );
}

/**
 * Créer ou modifier une tâche prédéfinie — `EX-ACT-01`, `EX-ACT-02`.
 *
 * `RG-ACT-02` : un créneau horaire **exige** ses horaires. Le contrôle est
 * doublé — ici pour ne pas envoyer une requête vouée à l'échec, et au serveur
 * parce que c'est lui qui garantit la règle.
 */
function FenetreTache({
  cible,
  surFermeture,
}: {
  cible: api.TachePredefinie | "nouvelle" | null;
  surFermeture: () => void;
}) {
  const { t } = useTranslation("administration");
  const { t: tErreurs } = useTranslation("erreurs");
  const libelle = useLibelle();
  const annoncer = useMessages();
  const client = useQueryClient();

  const existante = cible && cible !== "nouvelle" ? cible : null;

  const [nom, setNom] = useState("");
  const [description, setDescription] = useState("");
  const [couleur, setCouleur] = useState<string>(COULEURS[0]);
  const [duree, setDuree] = useState("half_day");
  const [debut, setDebut] = useState("09:00");
  const [fin, setFin] = useState("12:00");
  const [teletravail, setTeletravail] = useState(false);
  const [poids, setPoids] = useState(3);
  const [touche, setTouche] = useState(false);

  /* La fenêtre se remplit à l'OUVERTURE, pas au montage : sans cela, ouvrir
     « Modifier » sur une seconde tâche rejouerait les valeurs de la première. */
  useEffect(() => {
    if (!cible) return;
    setTouche(false);
    setNom(existante?.nom ?? "");
    setDescription(existante?.description ?? "");
    setCouleur(existante?.couleur ?? COULEURS[0]);
    setDuree(existante?.dureeParDefaut ?? "half_day");
    setDebut(existante?.heureDebut ?? "09:00");
    setFin(existante?.heureFin ?? "12:00");
    setTeletravail(existante?.teletravailAutorise ?? false);
    setPoids(existante?.poids ?? 3);
  }, [cible, existante]);

  const creneau = duree === "time_slot";
  const nomManquant = nom.trim().length === 0;
  const horairesManquants = creneau && (debut === "" || fin === "");
  const invalide = nomManquant || horairesManquants;

  const enregistrement = useMutation({
    mutationFn: () => {
      const donnees = {
        nom: nom.trim(),
        description: description.trim() === "" ? null : description.trim(),
        couleur,
        dureeParDefaut: duree,
        // Hors créneau, les horaires ne veulent rien dire : on les efface.
        heureDebut: creneau ? debut : null,
        heureFin: creneau ? fin : null,
        teletravailAutorise: teletravail,
        poids,
      };
      return existante
        ? api.modifierTachePredefinie(existante.id, donnees)
        : api.creerTachePredefinie(donnees);
    },
    onSuccess: () => {
      annoncer("ok", existante ? t("predefinies.tacheModifiee") : t("predefinies.tacheCreee"));
      void client.invalidateQueries({ queryKey: ["predefinies"] });
      surFermeture();
    },
    onError: (e) => annoncer("err", messageErreur(e, tErreurs, t("predefinies.echecAction"))),
  });

  return (
    <Fenetre
      ouverte={cible !== null}
      surFermeture={surFermeture}
      categorie={t("predefinies.catalogue")}
      titre={existante ? t("predefinies.modifierTache") : t("predefinies.nouvelle")}
      large
      mention={t("champObligatoire")}
      actions={
        <>
          <Button className="btn btn-secondary" onPress={surFermeture}>
            {t("annuler")}
          </Button>
          <Button
            className="btn btn-primary"
            isPending={enregistrement.isPending}
            onPress={() => {
              setTouche(true);
              if (!invalide) enregistrement.mutate();
            }}
          >
            {t("enregistrer")}
          </Button>
        </>
      }
    >
      <div className="form-grid">
        <div className="field-block">
          <label className="field-label" htmlFor="pt-nom">
            {t("predefinies.champNom")} <span className="req">*</span>
          </label>
          <input
            className="field"
            id="pt-nom"
            type="text"
            value={nom}
            placeholder={t("predefinies.nomExemple")}
            onChange={(e) => setNom(e.target.value)}
          />
          <p className={touche && nomManquant ? "field-error" : "field-error is-quiet"}>
            <span aria-hidden="true">↑</span>
            <span>{t("predefinies.nomObligatoire")}</span>
          </p>
        </div>

        <div className="field-block">
          <label className="field-label">{t("predefinies.champCouleur")}</label>
          <div className="swatches" role="group" aria-label={t("predefinies.champCouleur")}>
            {COULEURS.map((c, i) => (
              <Button
                key={c}
                className="sw"
                style={{ background: c }}
                aria-pressed={couleur === c}
                aria-label={t(`predefinies.couleur_${i}`)}
                onPress={() => setCouleur(c)}
              />
            ))}
          </div>
        </div>

        <div className="field-block span2">
          <label className="field-label" htmlFor="pt-desc">
            {t("predefinies.champDescription")}
          </label>
          <input
            className="field"
            id="pt-desc"
            type="text"
            value={description}
            placeholder={t("predefinies.descriptionExemple")}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="field-block span2">
          <label className="field-label">{t("predefinies.colDuree")}</label>
          <div className="type-seg" role="group" aria-label={t("predefinies.colDuree")}>
            {DUREES_TACHE_PREDEFINIE.map((d) => (
              <Button
                key={d.code}
                className="type-opt"
                aria-pressed={duree === d.code}
                onPress={() => setDuree(d.code)}
              >
                <span className="type-n">{libelle(d.code, DUREES_TACHE_PREDEFINIE)}</span>
                <span className="type-d">{t(`predefinies.dureeAide_${d.code}`)}</span>
              </Button>
            ))}
          </div>
          {/* `RG-ACT-02` — les horaires n'apparaissent que là où ils comptent. */}
          {creneau ? (
            <div className="hours-pair">
              <input
                className="field"
                type="time"
                value={debut}
                aria-label={t("predefinies.heureDebut")}
                onChange={(e) => setDebut(e.target.value)}
              />
              <span aria-hidden="true">→</span>
              <input
                className="field"
                type="time"
                value={fin}
                aria-label={t("predefinies.heureFin")}
                onChange={(e) => setFin(e.target.value)}
              />
            </div>
          ) : null}
          {touche && horairesManquants ? (
            <p className="field-error">
              <span aria-hidden="true">↑</span>
              <span>{t("predefinies.horairesRequis")}</span>
            </p>
          ) : null}
        </div>

        <div className="field-block span2">
          <label className="field-label" htmlFor="pt-poids">
            {t("predefinies.colPoids")}
          </label>
          <div className="slider-row">
            <input
              className="slider"
              id="pt-poids"
              type="range"
              min={1}
              max={5}
              step={1}
              value={poids}
              onChange={(e) => setPoids(Number(e.target.value))}
            />
            <span className="weight-lab">{t(`predefinies.poids_${poids}`)}</span>
          </div>
          <p className="field-hint">{t("predefinies.poidsAide")}</p>
        </div>

        <div className="field-block span2">
          <label className="check">
            <input
              type="checkbox"
              checked={teletravail}
              onChange={(e) => setTeletravail(e.target.checked)}
            />
            <span>{t("predefinies.teletravailRealisable")}</span>
          </label>
          <p className="field-hint">{t("predefinies.teletravailAide")}</p>
        </div>
      </div>
    </Fenetre>
  );
}

/**
 * `RG-ACT-05` — désactiver n'efface rien, et la fenêtre le dit **avant**.
 *
 * Le nombre d'assignations déjà posées y est nommé : c'est exactement ce que
 * la désactivation conserve, et c'est ce qui distingue « désactiver » de
 * « supprimer » pour qui hésite.
 */
function FenetreBascule({
  tache,
  surFermeture,
}: {
  tache: api.TachePredefinie | null;
  surFermeture: () => void;
}) {
  const { t } = useTranslation("administration");
  const { t: tErreurs } = useTranslation("erreurs");
  const annoncer = useMessages();
  const client = useQueryClient();

  const bascule = useMutation({
    mutationFn: () =>
      api.modifierTachePredefinie(tache!.id, { actif: !tache!.actif }),
    onSuccess: (r) => {
      annoncer("ok", r.actif ? t("predefinies.tacheReactivee") : t("predefinies.tacheDesactivee"));
      void client.invalidateQueries({ queryKey: ["predefinies"] });
      surFermeture();
    },
    onError: (e) => annoncer("err", messageErreur(e, tErreurs, t("predefinies.echecAction"))),
  });

  return (
    <Fenetre
      ouverte={tache !== null}
      surFermeture={surFermeture}
      categorie={t("confirmation")}
      titre={
        tache?.actif ? t("predefinies.desactiverTache") : t("predefinies.reactiverTache")
      }
      mention={t("predefinies.mentionBascule")}
      actions={
        <>
          <Button className="btn btn-secondary" onPress={surFermeture}>
            {t("annuler")}
          </Button>
          <Button
            className="btn btn-primary"
            isPending={bascule.isPending}
            onPress={() => bascule.mutate()}
          >
            {tache?.actif ? t("predefinies.desactiver") : t("predefinies.reactiver")}
          </Button>
        </>
      }
    >
      <p className="phrase-confirmation">
        {tache?.actif
          ? t("predefinies.confirmerDesactivation")
          : t("predefinies.confirmerReactivation")}{" "}
        <span className="quoted">« {tache?.nom} »</span> ?
      </p>
      <p className="field-hint">
        {t("predefinies.assignationsConservees", { n: tache?._count.assignations ?? 0 })}
      </p>
    </Fenetre>
  );
}

/**
 * `RG-ACT-08` — poser une règle de récurrence.
 *
 * **Les trois types ont des champs différents, et le formulaire se reconfigure
 * proprement au changement de type** — c'est l'« Attention » du brief. La
 * prévisualisation en langage naturel est réécrite à chaque frappe : c'est la
 * seule forme commune sous laquelle les trois types se comparent.
 */
function FenetreRegle({
  ouverte,
  taches,
  surFermeture,
}: {
  ouverte: boolean;
  taches: api.TachePredefinie[];
  surFermeture: () => void;
}) {
  const { t } = useTranslation("administration");
  const { t: tErreurs } = useTranslation("erreurs");
  const libelle = useLibelle();
  const annoncer = useMessages();
  const client = useQueryClient();

  const [tacheId, setTacheId] = useState("");
  const [type, setType] = useState<string>("weekly");
  const [jourSemaine, setJourSemaine] = useState(2);
  const [frequence, setFrequence] = useState(1);
  const [jourMois, setJourMois] = useState(15);
  const [ordinal, setOrdinal] = useState(3);
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");

  useEffect(() => {
    if (!ouverte) return;
    setTacheId(taches[0]?.id ?? "");
    setType("weekly");
    setJourSemaine(2);
    setFrequence(1);
    setJourMois(15);
    setOrdinal(3);
    setDateDebut(new Date().toISOString().slice(0, 10));
    setDateFin("");
  }, [ouverte, taches]);

  /*
   * La règle telle qu'elle partira, et telle qu'elle se relit. Les deux se
   * construisent au même endroit : une prévisualisation qui décrirait autre
   * chose que ce qui est envoyé serait pire que pas de prévisualisation.
   */
  const saisie: api.SaisieRecurrence = {
    type,
    frequence: type === "weekly" ? frequence : 1,
    jourSemaine: type === "monthly_fixed" ? null : jourSemaine,
    jourMois: type === "monthly_fixed" ? jourMois : null,
    ordinal: type === "monthly_ordinal" ? ordinal : null,
    dateDebut,
    dateFin: dateFin === "" ? null : dateFin,
  };

  const creation = useMutation({
    mutationFn: () => api.creerRecurrencePredefinie(tacheId, saisie),
    onSuccess: () => {
      annoncer("ok", t("predefinies.regleCreee"));
      void client.invalidateQueries({ queryKey: ["predefinies"] });
      surFermeture();
    },
    onError: (e) => annoncer("err", messageErreur(e, tErreurs, t("predefinies.echecAction"))),
  });

  const apercu: api.RecurrencePredefinie = {
    id: "apercu",
    type,
    frequence: saisie.frequence ?? 1,
    jourSemaine: saisie.jourSemaine ?? null,
    jourMois: saisie.jourMois ?? null,
    ordinal: saisie.ordinal ?? null,
    dateDebut,
    dateFin: saisie.dateFin ?? null,
    active: true,
  };

  return (
    <Fenetre
      ouverte={ouverte}
      surFermeture={surFermeture}
      categorie={t("predefinies.recurrence")}
      titre={t("predefinies.nouvelleRegleTitre")}
      large
      mention={t("predefinies.mentionRegle")}
      actions={
        <>
          <Button className="btn btn-secondary" onPress={surFermeture}>
            {t("annuler")}
          </Button>
          <Button
            className="btn btn-primary"
            isDisabled={tacheId === "" || dateDebut === ""}
            isPending={creation.isPending}
            onPress={() => creation.mutate()}
          >
            {t("predefinies.creerLaRegle")}
          </Button>
        </>
      }
    >
      <div className="field-block">
        <label className="field-label" htmlFor="rg-tache">
          {t("predefinies.champTache")}
        </label>
        <select
          className="field"
          id="rg-tache"
          value={tacheId}
          onChange={(e) => setTacheId(e.target.value)}
        >
          {taches.map((x) => (
            <option key={x.id} value={x.id}>
              {x.nom}
            </option>
          ))}
        </select>
      </div>

      <div className="field-block">
        <label className="field-label">{t("predefinies.champTypeRecurrence")}</label>
        <div className="type-seg" role="group" aria-label={t("predefinies.champTypeRecurrence")}>
          {TYPES_RECURRENCE.map((x) => (
            <Button
              key={x.code}
              className="type-opt"
              aria-pressed={type === x.code}
              onPress={() => setType(x.code)}
            >
              <span className="type-n">{libelle(x.code, TYPES_RECURRENCE)}</span>
              <span className="type-d">{t(`predefinies.typeAide_${x.code}`)}</span>
            </Button>
          ))}
        </div>
      </div>

      {/* Chaque type a ses champs : le formulaire se reconfigure. */}
      {type === "weekly" ? (
        <div className="form-grid">
          <div className="field-block">
            <label className="field-label" htmlFor="rg-jour">
              {t("predefinies.champJourSemaine")}
            </label>
            <select
              className="field"
              id="rg-jour"
              value={jourSemaine}
              onChange={(e) => setJourSemaine(Number(e.target.value))}
            >
              {JOURS_OUVRES.map((j) => (
                <option key={j} value={j}>
                  {t(`predefinies.jour_${j}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="field-block">
            <label className="field-label" htmlFor="rg-freq">
              {t("predefinies.champFrequence")}
            </label>
            <input
              className="field"
              id="rg-freq"
              type="number"
              min={1}
              max={12}
              value={frequence}
              onChange={(e) => setFrequence(Math.max(1, Number(e.target.value) || 1))}
            />
            <p className="field-hint">{t("predefinies.frequenceAide")}</p>
          </div>
        </div>
      ) : null}

      {type === "monthly_fixed" ? (
        <div className="form-grid">
          <div className="field-block span2">
            <label className="field-label" htmlFor="rg-jourmois">
              {t("predefinies.champJourMois")}
            </label>
            <input
              className="field"
              id="rg-jourmois"
              type="number"
              min={1}
              max={31}
              value={jourMois}
              onChange={(e) => setJourMois(Math.min(31, Math.max(1, Number(e.target.value) || 1)))}
            />
            {/* `RG-ACT-04` — le 31 février n'existe pas. */}
            <p className="field-hint">{t("predefinies.clampageAide")}</p>
          </div>
        </div>
      ) : null}

      {type === "monthly_ordinal" ? (
        <div className="form-grid">
          <div className="field-block">
            <label className="field-label" htmlFor="rg-ord">
              {t("predefinies.champOccurrence")}
            </label>
            <select
              className="field"
              id="rg-ord"
              value={ordinal}
              onChange={(e) => setOrdinal(Number(e.target.value))}
            >
              {ORDINAUX.map((o) => (
                <option key={o} value={o}>
                  {t(`predefinies.ordinal_${o}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="field-block">
            <label className="field-label" htmlFor="rg-ojour">
              {t("predefinies.champJourSemaine")}
            </label>
            <select
              className="field"
              id="rg-ojour"
              value={jourSemaine}
              onChange={(e) => setJourSemaine(Number(e.target.value))}
            >
              {JOURS_OUVRES.map((j) => (
                <option key={j} value={j}>
                  {t(`predefinies.jour_${j}`)}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : null}

      <div className="form-grid">
        <div className="field-block">
          <label className="field-label" htmlFor="rg-du">
            {t("predefinies.champAPartirDu")}
          </label>
          <input
            className="field"
            id="rg-du"
            type="date"
            value={dateDebut}
            onChange={(e) => setDateDebut(e.target.value)}
          />
        </div>
        <div className="field-block">
          <label className="field-label" htmlFor="rg-au">
            {t("predefinies.champJusquAu")}
          </label>
          <input
            className="field"
            id="rg-au"
            type="date"
            value={dateFin}
            onChange={(e) => setDateFin(e.target.value)}
          />
        </div>
      </div>

      {/* La prévisualisation en langage naturel est indispensable. */}
      <div className="rec-prev">
        <span aria-hidden="true" className="rec-prev-glyphe">
          ↻
        </span>
        <div>
          <p className="rec-prev-t">
            <PhraseRecurrence regle={apercu} />
          </p>
          <p className="rec-prev-d">
            {dateDebut === ""
              ? t("predefinies.apercuSansDate")
              : dateFin === ""
                ? t("predefinies.aPartirDe", { debut: formaterDate(dateDebut) })
                : t("predefinies.duAu", {
                    debut: formaterDate(dateDebut),
                    fin: formaterDate(dateFin),
                  })}
          </p>
        </div>
      </div>
    </Fenetre>
  );
}

/**
 * `EX-ACT-05`, `RG-ACT-06` — générer sur une plage, et **rendre compte**.
 *
 * La maquette ne choisit pas d'agents ; le serveur en exige au moins un, parce
 * qu'une assignation est toujours nominative. Les agents proposés viennent de
 * l'épreuve d'éligibilité (`RG-ACT-07`), qui dit aussi **pourquoi** un agent ne
 * peut pas être retenu — congé, télétravail sur une tâche qui l'exclut, ou
 * permanence déjà tenue. L'écart avec la maquette est remonté ; il n'est pas
 * comblé au jugé : on montre ce que le serveur sait, sans l'inventer.
 */
function FenetreGeneration({
  ouverte,
  taches,
  surFermeture,
}: {
  ouverte: boolean;
  taches: api.TachePredefinie[];
  surFermeture: () => void;
}) {
  const { t } = useTranslation("administration");
  const { t: tErreurs } = useTranslation("erreurs");
  const annoncer = useMessages();
  const client = useQueryClient();

  const [tacheId, setTacheId] = useState("");
  const [debut, setDebut] = useState("");
  const [fin, setFin] = useState("");
  const [choisis, setChoisis] = useState<ReadonlySet<string>>(new Set());
  const [bilan, setBilan] = useState<{ crees: number; ignores: number } | null>(null);

  useEffect(() => {
    if (!ouverte) return;
    const aujourdHui = new Date().toISOString().slice(0, 10);
    setTacheId(taches[0]?.id ?? "");
    setDebut(aujourdHui);
    setFin(aujourdHui);
    setChoisis(new Set());
    setBilan(null);
  }, [ouverte, taches]);

  const agents = useQuery({
    queryKey: ["activite", "eligibilite", tacheId, debut],
    queryFn: () => apiPlanning.eligibilite(tacheId, debut),
    enabled: ouverte && tacheId !== "" && debut !== "",
  });

  const generation = useMutation({
    mutationFn: () =>
      api.genererAssignations({
        predefinedTaskId: tacheId,
        debut,
        fin,
        userIds: [...choisis],
      }),
    onSuccess: (r) => {
      setBilan(r);
      annoncer("ok", t("predefinies.generationFaite", { n: r.crees }));
      void client.invalidateQueries({ queryKey: ["predefinies"] });
    },
    onError: (e) => annoncer("err", messageErreur(e, tErreurs, t("predefinies.echecAction"))),
  });

  const basculer = (id: string) =>
    setChoisis((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <Fenetre
      ouverte={ouverte}
      surFermeture={surFermeture}
      categorie={t("predefinies.assignationsTitre")}
      titre={t("predefinies.genererAssignations")}
      mention={t("predefinies.nSelectionnes", { n: choisis.size })}
      actions={
        <>
          <Button className="btn btn-secondary" onPress={surFermeture}>
            {t("predefinies.fermer")}
          </Button>
          <Button
            className="btn btn-primary"
            isDisabled={tacheId === "" || debut === "" || fin === "" || choisis.size === 0}
            isPending={generation.isPending}
            onPress={() => generation.mutate()}
          >
            {t("predefinies.generer")}
          </Button>
        </>
      }
    >
      <p className="field-hint hint-regles">{t("predefinies.generationAide")}</p>

      <div className="field-block">
        <label className="field-label" htmlFor="gn-tache">
          {t("predefinies.champTache")}
        </label>
        <select
          className="field"
          id="gn-tache"
          value={tacheId}
          onChange={(e) => setTacheId(e.target.value)}
        >
          {taches.map((x) => (
            <option key={x.id} value={x.id}>
              {x.nom}
            </option>
          ))}
        </select>
      </div>

      <div className="form-grid">
        <div className="field-block">
          <label className="field-label" htmlFor="gn-du">
            {t("predefinies.du")}
          </label>
          <input
            className="field"
            id="gn-du"
            type="date"
            value={debut}
            onChange={(e) => setDebut(e.target.value)}
          />
        </div>
        <div className="field-block">
          <label className="field-label" htmlFor="gn-au">
            {t("predefinies.au")}
          </label>
          <input
            className="field"
            id="gn-au"
            type="date"
            value={fin}
            onChange={(e) => setFin(e.target.value)}
          />
        </div>
      </div>

      <div className="field-block">
        <span className="field-label">{t("predefinies.champAgents")}</span>
        {agents.isPending ? <Chargement quoi={t("predefinies.lesAgents")} /> : null}
        {(agents.data ?? []).map((a) => (
          <label className="check" key={a.userId}>
            <input
              type="checkbox"
              checked={choisis.has(a.userId)}
              disabled={a.motif !== null}
              onChange={() => basculer(a.userId)}
            />
            <span>
              {a.prenom} {a.nom}
              {/* `RG-ACT-07` — l'inéligibilité est annoncée AVANT, avec son
                  motif : un agent grisé sans raison fait chercher pourquoi. */}
              {a.motif ? (
                <span className="pt-slot">{t(`predefinies.motif_${a.motif}`)}</span>
              ) : null}
            </span>
          </label>
        ))}
      </div>

      {bilan ? (
        <p className="field-hint" role="status">
          {t("predefinies.bilanGeneration", { crees: bilan.crees, ignores: bilan.ignores })}
        </p>
      ) : null}
    </Fenetre>
  );
}

/**
 * La règle, en une phrase.
 *
 * Les trois types ont des champs différents, et c'est justement pourquoi la
 * phrase est nécessaire : elle est la seule forme commune sous laquelle les
 * trois se comparent.
 */
function PhraseRecurrence({ regle }: { regle: api.RecurrencePredefinie }) {
  const { t } = useTranslation("administration");

  if (regle.type === "weekly") {
    return (
      <>
        {t("predefinies.phraseHebdo", {
          n: regle.frequence,
          jour: t(`predefinies.jour_${regle.jourSemaine ?? 1}`),
        })}
      </>
    );
  }

  if (regle.type === "monthly_fixed") {
    return (
      <>
        {t("predefinies.phraseMensuelleDate", { jour: regle.jourMois ?? 1 })}
        {/* `RG-ACT-04` — un 31 février n'existe pas : l'assignation est
            ramenée au dernier jour du mois. Le dire ici évite de découvrir la
            règle en constatant une date inattendue. */}
        {(regle.jourMois ?? 1) > 28 ? (
          <span className="rule-meta">{t("predefinies.clampage")}</span>
        ) : null}
      </>
    );
  }

  return (
    <>
      {t("predefinies.phraseOrdinale", {
        ordinal: t(`predefinies.ordinal_${regle.ordinal ?? 1}`),
        jour: t(`predefinies.jour_${regle.jourSemaine ?? 1}`),
      })}
    </>
  );
}

/** Le poids : une jauge de cinq crans, doublée de son libellé. */
function Poids({ valeur }: { valeur: number }) {
  const { t } = useTranslation("administration");
  return (
    <span className="gauge">
      <span
        className="gauge-seg"
        role="img"
        aria-label={t("predefinies.poidsLibelle", {
          n: valeur,
          niveau: t(`predefinies.poids_${valeur}`),
        })}
      >
        {POIDS.map((p) => (
          <i
            key={p}
            className={p <= valeur ? (valeur >= 4 ? "is-hot" : "is-on") : ""}
          />
        ))}
      </span>
      {/* Un nombre de 1 à 5 ne dit pas s'il est léger ou lourd. */}
      <span className="gauge-l">{t(`predefinies.poids_${valeur}`)}</span>
    </span>
  );
}
