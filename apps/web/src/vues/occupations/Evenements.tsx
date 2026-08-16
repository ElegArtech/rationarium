import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "react-aria-components";
import * as api from "../../api/occupations.js";
import * as apiProjets from "../../api/projets.js";
import { appeler } from "../../api/client.js";
import { messageErreur } from "../../api/erreurs.js";
import { usePeut } from "../../session/session.js";
import { Chargement, ErreurDeChargement } from "../../composants/etats.js";
import { Fenetre } from "../../composants/fenetre.js";
import { useMessages } from "../../composants/messages.js";
import { formaterDate, formaterDateLongue } from "../../formats.js";
import "../../composants/partages.css";
import "../taches/liste.css";
import "./evenements.css";

/**
 * Vue 18 — Événements.
 *
 * **La portée du geste se choisit AVANT d'agir, jamais après.** Le brief le
 * pose en point d'attention : « la distinction entre modifier une occurrence
 * et modifier toute la série doit être explicite au moment de l'action, pas
 * découverte après coup ». D'où la fenêtre de portée, avec deux options
 * décrites — et non un bouton unique dont l'effet se révèle une fois exécuté.
 */

const JOURS = [0, 1, 2, 3, 4, 5, 6];

export function Evenements() {
  const { t } = useTranslation("occupations");
  const peut = usePeut();
  const [projectId, setProjectId] = useState("");
  const [vue, setVue] = useState<"liste" | "calendrier">("liste");
  const [creationOuverte, setCreationOuverte] = useState(false);
  const [mois, setMois] = useState(() => {
    const d = new Date();
    return { annee: d.getUTCFullYear(), mois: d.getUTCMonth() };
  });

  const debut = new Date(Date.UTC(mois.annee, mois.mois, 1)).toISOString().slice(0, 10);
  const fin = new Date(Date.UTC(mois.annee, mois.mois + 1, 0)).toISOString().slice(0, 10);

  const filtres = { debut, fin, projectId };
  const requete = useQuery({
    queryKey: ["evenements", filtres],
    queryFn: () => api.evenements(filtres),
  });
  const projets = useQuery({
    queryKey: ["projets", {}],
    queryFn: () => apiProjets.portefeuille({}),
  });

  const evenements = requete.data ?? [];

  /** Regroupés par jour : la liste se lit par date, pas par ordre d'insertion. */
  const parJour = useMemo(() => {
    const groupes = new Map<string, api.Evenement[]>();
    for (const e of evenements) {
      const cle = e.date.slice(0, 10);
      groupes.set(cle, [...(groupes.get(cle) ?? []), e]);
    }
    return [...groupes.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [evenements]);

  return (
    <div className="page">
      <div className="pl-toolbar">
        <div>
          <span className="eyebrow">{t("evenements.surtitre")}</span>
          <h1 className="h1 titre-vue">{t("evenements.titre")}</h1>
        </div>
        <span className="count-split">
          <b>{evenements.length}</b> {t("evenements.compte", { n: evenements.length })}
        </span>
        {peut("events:create") ? (
          <div className="pl-toolbar-fin">
            <Button className="btn btn-primary" onPress={() => setCreationOuverte(true)}>
              {t("evenements.creer")}
            </Button>
          </div>
        ) : null}
      </div>

      <div className="filters">
        <div className="pl-nav" role="group" aria-label={t("evenements.navigationMois")}>
          <Button
            className="nav-sq"
            onPress={() =>
              setMois((m) =>
                m.mois === 0 ? { annee: m.annee - 1, mois: 11 } : { ...m, mois: m.mois - 1 },
              )
            }
            aria-label={t("evenements.moisPrecedent")}
          >
            <span aria-hidden="true">‹</span>
          </Button>
          <span className="pl-period">
            {formaterDateLongue(`${debut}`).replace(/^\d+\s/, "")}
          </span>
          <Button
            className="nav-sq"
            onPress={() =>
              setMois((m) =>
                m.mois === 11 ? { annee: m.annee + 1, mois: 0 } : { ...m, mois: m.mois + 1 },
              )
            }
            aria-label={t("evenements.moisSuivant")}
          >
            <span aria-hidden="true">›</span>
          </Button>
        </div>

        <span className="vsep" aria-hidden="true" />

        <select
          className="f-input"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          aria-label={t("evenements.projet")}
        >
          <option value="">{t("evenements.tousProjets")}</option>
          {(projets.data?.projets ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.nom}
            </option>
          ))}
        </select>

        <div className="bascule-vue" role="group" aria-label={t("evenements.affichage")}>
          <Button className="tab" aria-selected={vue === "liste"} onPress={() => setVue("liste")}>
            {t("evenements.affichageListe")}
          </Button>
          <Button
            className="tab"
            aria-selected={vue === "calendrier"}
            onPress={() => setVue("calendrier")}
          >
            {t("evenements.affichageCalendrier")}
          </Button>
        </div>
      </div>

      {requete.isPending ? <Chargement quoi={t("evenements.lesEvenements")} /> : null}
      {requete.isError ? (
        <ErreurDeChargement erreur={requete.error} surReessai={() => void requete.refetch()} />
      ) : null}

      {requete.data ? (
        evenements.length === 0 ? (
          <div className="empty empty-large">
            <p>{t("evenements.videTitre")}</p>
            <small>{t("evenements.videExplication")}</small>
            {peut("events:create") ? (
              <Button className="btn btn-primary" onPress={() => setCreationOuverte(true)}>
                {t("evenements.creer")}
              </Button>
            ) : null}
          </div>
        ) : vue === "calendrier" ? (
          <CalendrierSimplifie evenements={evenements} annee={mois.annee} mois={mois.mois} />
        ) : (
          <div className="tlist">
            {parJour.map(([jour, liste]) => (
              <div key={jour}>
                <div className="ev-day">
                  <span className="ev-dnum">{Number(jour.slice(8, 10))}</span>
                  <span className="ev-dow">{formaterDateLongue(jour)}</span>
                </div>
                {liste.map((e) => (
                  <LigneEvenement key={e.id} evenement={e} />
                ))}
              </div>
            ))}
          </div>
        )
      ) : null}

      <FenetreCreation
        ouverte={creationOuverte}
        surFermeture={() => setCreationOuverte(false)}
        projets={projets.data?.projets ?? []}
      />
    </div>
  );
}

function LigneEvenement({ evenement }: { evenement: api.Evenement }) {
  const { t } = useTranslation("occupations");
  const [portee, setPortee] = useState(false);
  const serie = Boolean(evenement.parentId ?? evenement.frequenceSemaines);

  return (
    <div className="ev-row">
      <span className={`ev-time${evenement.journeeEntiere ? " is-all" : ""}`}>
        {evenement.journeeEntiere
          ? t("evenements.touteLaJournee")
          : `${evenement.heureDebut ?? "—"} – ${evenement.heureFin ?? "—"}`}
      </span>

      <div className="bloc-etroit">
        <p className="ev-name">{evenement.titre}</p>
        <span className="ev-sub">
          {serie ? <span className="ev-rec">{t("evenements.serie")}</span> : null}
          {evenement.interventionExterieure ? (
            <span className="badge badge-indep">{t("evenements.interventionExt")}</span>
          ) : null}
          <span className="ev-part">
            {t("evenements.participants", { n: evenement.participants.length })}
          </span>
        </span>
      </div>

      <span className="ev-part">
        {evenement.project ? evenement.project.nom : t("evenements.sansProjet")}
      </span>

      <span>
        {serie ? (
          <Button className="chip-btn" onPress={() => setPortee(true)}>
            {t("evenements.arreterRecurrence")}
          </Button>
        ) : null}
      </span>

      <span className="ev-go" aria-hidden="true">
        ›
      </span>

      <FenetrePortee
        evenement={evenement}
        ouverte={portee}
        surFermeture={() => setPortee(false)}
      />
    </div>
  );
}

/**
 * `RG-EVT-06` — arrêter une série **à partir d'une date**.
 *
 * La fenêtre nomme les deux portées et décrit ce que chacune fait. Le passé
 * n'est jamais touché : des occurrences déjà tenues figurent dans l'historique
 * de gens qui y étaient.
 */
function FenetrePortee({
  evenement,
  ouverte,
  surFermeture,
}: {
  evenement: api.Evenement;
  ouverte: boolean;
  surFermeture: () => void;
}) {
  const { t } = useTranslation("occupations");
  const { t: tErreurs } = useTranslation("erreurs");
  const annoncer = useMessages();
  const client = useQueryClient();
  const [portee, setPortee] = useState<"future" | "occurrence">("future");

  const arret = useMutation({
    mutationFn: () => api.arreterRecurrence(evenement.id, evenement.date.slice(0, 10)),
    onSuccess: (r) => {
      annoncer("ok", t("evenements.recurrenceArretee", { n: r.supprimees }));
      surFermeture();
      void client.invalidateQueries({ queryKey: ["evenements"] });
    },
    onError: (e) => annoncer("err", messageErreur(e, tErreurs, t("evenements.echecArret"))),
  });

  const options = [
    { cle: "future", titre: t("evenements.porteeSerie"), detail: t("evenements.porteeSerieDetail") },
    {
      cle: "occurrence",
      titre: t("evenements.porteeOccurrence"),
      detail: t("evenements.porteeOccurrenceDetail"),
    },
  ] as const;

  return (
    <Fenetre
      ouverte={ouverte}
      surFermeture={surFermeture}
      categorie={t("evenements.serieRecurrente")}
      titre={t("evenements.arreterTitre")}
      mention={t("evenements.passeIntact")}
      actions={
        <>
          <Button className="btn btn-secondary" onPress={surFermeture}>
            {t("annuler")}
          </Button>
          <Button
            className="btn btn-danger"
            isPending={arret.isPending}
            isDisabled={portee !== "future"}
            onPress={() => arret.mutate()}
          >
            {t("evenements.arreterConfirmer")}
          </Button>
        </>
      }
    >
      <p className="phrase-confirmation">{t("evenements.arreterQuestion")}</p>
      <div className="scope-opts" role="radiogroup" aria-label={t("evenements.porteeDuGeste")}>
        {options.map((o) => (
          <Button
            key={o.cle}
            className="scope-opt"
            aria-pressed={portee === o.cle}
            onPress={() => setPortee(o.cle)}
          >
            <span className="scope-mark" aria-hidden="true" />
            <span>
              <span className="scope-t">{o.titre}</span>
              <span className="scope-d">{o.detail}</span>
            </span>
          </Button>
        ))}
      </div>
    </Fenetre>
  );
}

/** La vue calendrier, annoncée comme simplifiée — elle l'est, et le dit. */
function CalendrierSimplifie({
  evenements,
  annee,
  mois,
}: {
  evenements: api.Evenement[];
  annee: number;
  mois: number;
}) {
  const { t } = useTranslation("occupations");
  const premier = new Date(Date.UTC(annee, mois, 1));
  // La grille commence au lundi : le calendrier de travail français.
  const decalage = (premier.getUTCDay() + 6) % 7;
  const nbJours = new Date(Date.UTC(annee, mois + 1, 0)).getUTCDate();
  const cellules = Array.from({ length: decalage + nbJours }, (_, i) =>
    i < decalage ? null : i - decalage + 1,
  );

  const jours = ["lun", "mar", "mer", "jeu", "ven", "sam", "dim"];

  return (
    <div className="tlist">
      <p className="cal-note">{t("evenements.calendrierSimplifie")}</p>
      <div className="cal">
        {jours.map((j) => (
          <div className="cal-dow" key={j}>
            {t(`jours.${j}`)}
          </div>
        ))}
        {cellules.map((jour, i) => (
          <div className={`cal-cell${jour === null ? " is-out" : ""}`} key={i}>
            {jour === null ? null : (
              <>
                <span className="cal-n">{jour}</span>
                {evenements
                  .filter((e) => Number(e.date.slice(8, 10)) === jour)
                  .slice(0, 3)
                  .map((e) => (
                    <span className="cal-ev" key={e.id}>
                      <span>{e.titre}</span>
                    </span>
                  ))}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * La fenêtre de création.
 *
 * « Toute la journée » masque les horaires plutôt que de les désactiver : un
 * champ grisé invite à chercher comment le réactiver.
 *
 * `RG-EVT-05` — l'horizon de récurrence est borné, et le refus le chiffre.
 */
function FenetreCreation({
  ouverte,
  surFermeture,
  projets,
}: {
  ouverte: boolean;
  surFermeture: () => void;
  projets: apiProjets.LigneProjet[];
}) {
  const { t } = useTranslation("occupations");
  const { t: tErreurs } = useTranslation("erreurs");
  const annoncer = useMessages();
  const client = useQueryClient();

  const [titre, setTitre] = useState("");
  const [date, setDate] = useState("");
  const [journeeEntiere, setJourneeEntiere] = useState(false);
  const [heureDebut, setHeureDebut] = useState("09:00");
  const [heureFin, setHeureFin] = useState("10:00");
  const [projectId, setProjectId] = useState("");
  const [participants, setParticipants] = useState<string[]>([]);
  const [recurrent, setRecurrent] = useState(false);
  const [frequence, setFrequence] = useState(1);
  const [jourSemaine, setJourSemaine] = useState<number | "auto">("auto");
  const [jusqua, setJusqua] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [manquants, setManquants] = useState<string[]>([]);

  const utilisateurs = useQuery({
    queryKey: ["utilisateurs", "tous"],
    queryFn: () =>
      appeler<{ utilisateurs: { id: string; prenom: string; nom: string }[] }>("/utilisateurs"),
    enabled: ouverte,
  });

  const creation = useMutation({
    mutationFn: () =>
      api.creerEvenement({
        titre,
        date,
        journeeEntiere,
        ...(journeeEntiere ? {} : { heureDebut, heureFin }),
        projectId: projectId || null,
        ...(participants.length > 0 ? { participantIds: participants } : {}),
        ...(recurrent && jusqua
          ? {
              recurrence: {
                frequenceSemaines: frequence,
                jourSemaine:
                  jourSemaine === "auto"
                    ? new Date(`${date}T00:00:00.000Z`).getUTCDay()
                    : jourSemaine,
                jusqua,
              },
            }
          : {}),
      }),
    onSuccess: () => {
      annoncer("ok", t("evenements.cree"));
      setTitre("");
      setDate("");
      surFermeture();
      void client.invalidateQueries({ queryKey: ["evenements"] });
    },
    onError: (e) => setErreur(messageErreur(e, tErreurs, t("evenements.echecCreation"))),
  });

  const valider = () => {
    setErreur(null);
    const vides = [!titre.trim() && "titre", !date && "date"].filter(Boolean) as string[];
    setManquants(vides);
    if (vides.length > 0) {
      setErreur(t("champsObligatoires"));
      return;
    }
    creation.mutate();
  };

  /** L'aperçu en langage naturel : une récurrence se relit, elle ne se devine pas. */
  const apercu =
    recurrent && date
      ? t("evenements.apercuRecurrence", {
          n: frequence,
          jour:
            jourSemaine === "auto"
              ? t("evenements.memeJourQueLaDate")
              : t(`jours.long.${jourSemaine}`),
          fin: jusqua ? formaterDate(jusqua) : t("evenements.sansFin"),
        })
      : null;

  return (
    <Fenetre
      ouverte={ouverte}
      surFermeture={surFermeture}
      categorie={t("evenements.nouvelEvenement")}
      titre={t("evenements.creer")}
      large
      mention={t("champsObligatoires")}
      actions={
        <>
          <Button className="btn btn-secondary" onPress={surFermeture}>
            {t("annuler")}
          </Button>
          <Button className="btn btn-primary" isPending={creation.isPending} onPress={valider}>
            {t("evenements.creerEvenement")}
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
          <label className="field-label" htmlFor="ev-titre">
            {t("evenements.titreChamp")} <span className="req">*</span>
          </label>
          <input
            className="field"
            id="ev-titre"
            type="text"
            value={titre}
            aria-invalid={manquants.includes("titre")}
            onChange={(e) => setTitre(e.target.value)}
          />
        </div>

        <div className="field-block">
          <label className="field-label" htmlFor="ev-date">
            {t("evenements.date")} <span className="req">*</span>
          </label>
          <input
            className="field"
            id="ev-date"
            type="date"
            value={date}
            aria-invalid={manquants.includes("date")}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        <div className="field-block">
          <label className="check">
            <input
              type="checkbox"
              checked={journeeEntiere}
              onChange={(e) => setJourneeEntiere(e.target.checked)}
            />
            <span>{t("evenements.touteLaJournee")}</span>
          </label>
        </div>

        {/* Les horaires disparaissent au lieu d'être grisés : un champ grisé
            invite à chercher comment le réactiver. */}
        {journeeEntiere ? null : (
          <>
            <div className="field-block">
              <label className="field-label" htmlFor="ev-h1">
                {t("evenements.heureDebut")}
              </label>
              <input
                className="field"
                id="ev-h1"
                type="time"
                value={heureDebut}
                onChange={(e) => setHeureDebut(e.target.value)}
              />
            </div>
            <div className="field-block">
              <label className="field-label" htmlFor="ev-h2">
                {t("evenements.heureFin")}
              </label>
              <input
                className="field"
                id="ev-h2"
                type="time"
                value={heureFin}
                onChange={(e) => setHeureFin(e.target.value)}
              />
            </div>
          </>
        )}

        <div className="field-block span2">
          <label className="field-label" htmlFor="ev-projet">
            {t("evenements.projet")}
          </label>
          <select
            className="field"
            id="ev-projet"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          >
            <option value="">{t("evenements.sansProjet")}</option>
            {projets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nom}
              </option>
            ))}
          </select>
        </div>

        <div className="field-block span2">
          <span className="field-label" id="ev-part-lab">
            {t("evenements.participantsChamp")}
          </span>
          <div className="pickbox" role="group" aria-labelledby="ev-part-lab">
            {(utilisateurs.data?.utilisateurs ?? []).map((u) => (
              <label className="pick-item" key={u.id}>
                <input
                  type="checkbox"
                  checked={participants.includes(u.id)}
                  onChange={(e) =>
                    setParticipants((s) =>
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

        <div className="field-block span2">
          <label className="check">
            <input
              type="checkbox"
              checked={recurrent}
              onChange={(e) => setRecurrent(e.target.checked)}
            />
            <span>{t("evenements.evenementRecurrent")}</span>
          </label>
        </div>

        {recurrent ? (
          <div className="field-block span2">
            <div className="rec-box">
              <div className="rec-grid">
                <div className="field-block">
                  <label className="field-label" htmlFor="ev-freq">
                    {t("evenements.frequence")}
                  </label>
                  <input
                    className="field"
                    id="ev-freq"
                    type="number"
                    min={1}
                    max={52}
                    value={frequence}
                    onChange={(e) => setFrequence(Number(e.target.value))}
                  />
                </div>
                <div className="field-block">
                  <label className="field-label" htmlFor="ev-jour">
                    {t("evenements.jourSemaine")}
                  </label>
                  <select
                    className="field"
                    id="ev-jour"
                    value={String(jourSemaine)}
                    onChange={(e) =>
                      setJourSemaine(e.target.value === "auto" ? "auto" : Number(e.target.value))
                    }
                  >
                    <option value="auto">{t("evenements.memeJourQueLaDate")}</option>
                    {JOURS.map((j) => (
                      <option key={j} value={j}>
                        {t(`jours.long.${j}`)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field-block">
                  <label className="field-label" htmlFor="ev-jusqua">
                    {t("evenements.jusqua")}
                  </label>
                  <input
                    className="field"
                    id="ev-jusqua"
                    type="date"
                    value={jusqua}
                    onChange={(e) => setJusqua(e.target.value)}
                  />
                </div>
              </div>

              {apercu ? (
                <div className="rec-prev">
                  <span aria-hidden="true">↻</span>
                  <div>
                    <p className="rec-prev-t">{t("evenements.apercuTitre")}</p>
                    <p className="rec-prev-d">{apercu}</p>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </Fenetre>
  );
}
