import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Button } from "react-aria-components";
import * as api from "../../api/administration.js";
import { usePeut } from "../../session/session.js";
import { Chargement, ErreurDeChargement, AccesRefuse } from "../../composants/etats.js";
import { formaterDateLongue } from "../../formats.js";
import "../../composants/partages.css";
import "../taches/liste.css";
import "./audit.css";

/**
 * Vue 33 — Journal d'audit. **Lecture seule stricte.**
 *
 * Le brief est catégorique : « aucune action de modification ni de suppression
 * ne doit exister sur cette vue, **même désactivée**. L'absence totale
 * d'affordance d'écriture fait partie de la garantie. »
 *
 * Ce fichier n'importe donc **ni `useMutation`, ni `Fenetre`, ni
 * `useMessages`** : il n'y a rien à muter, rien à confirmer, rien à annoncer.
 * L'absence est structurelle, pas conditionnelle — et elle est **énoncée** en
 * tête de vue plutôt que laissée à deviner.
 *
 * Elle est doublée côté serveur : le rôle SQL applicatif n'a que `INSERT` et
 * `SELECT` sur `audit_log`. Une affordance d'écriture ici mentirait sur ce que
 * la base autorise.
 */

/** La famille d'une action, pour la pastille de couleur. */
function couleurDe(action: string): string {
  if (action.startsWith("auth.") || action.includes("login")) return "var(--st-doing)";
  if (action.includes("delete") || action.includes("denied")) return "var(--st-blocked)";
  if (action.includes("approve") || action.includes("create")) return "var(--st-done)";
  if (action.includes("export") || action.includes("download")) return "var(--st-review)";
  return "var(--muted)";
}

export function Audit() {
  const { t } = useTranslation("administration");
  const peut = usePeut();

  const [filtres, setFiltres] = useState({
    typeEntite: "",
    entiteId: "",
    acteurId: "",
    action: "",
    depuis: "",
    jusqua: "",
  });
  const [curseurs, setCurseurs] = useState<api.Curseur[]>([]);

  const curseur = curseurs[curseurs.length - 1];
  const requete = useQuery({
    queryKey: ["audit", filtres, curseur],
    queryFn: () =>
      api.journal({
        ...filtres,
        ...(curseur
          ? { curseurHorodatage: curseur.horodatage, curseurId: curseur.id }
          : {}),
      }),
    enabled: peut("audit:read"),
  });

  const facettes = useQuery({
    queryKey: ["audit", "facettes"],
    queryFn: api.facettesAudit,
    enabled: peut("audit:read"),
  });

  // `RG-ADM-03` — l'accès refusé est tracé côté serveur. Ici on dit seulement
  // ce qui manque, sans détailler ce qu'il y a derrière.
  if (!peut("audit:read")) return <AccesRefuse />;

  const champ = (cle: keyof typeof filtres) => ({
    value: filtres[cle],
    onChange: (e: { target: { value: string } }) => {
      setCurseurs([]);
      setFiltres((f) => ({ ...f, [cle]: e.target.value }));
    },
  });

  return (
    <div className="page">
      <div className="pl-toolbar">
        <div>
          <span className="eyebrow">{t("audit.surtitre")}</span>
          <h1 className="h1 titre-vue">{t("audit.titre")}</h1>
        </div>
      </div>

      {/*
        La garantie est énoncée, pas devinée. Elle est vraie à trois niveaux :
        cette vue n'offre aucune écriture, le serveur ne l'expose pas, et le
        rôle SQL applicatif n'a que INSERT et SELECT sur la table.
      */}
      <p className="ro-badge">
        <span aria-hidden="true">🔒</span>
        <span>
          <span className="ro-t">{t("audit.lectureSeule")}</span>
          <span className="ro-d">{t("audit.lectureSeuleExplication")}</span>
        </span>
      </p>

      <div className="filters">
        <select
          className="f-input"
          aria-label={t("audit.typeEntite")}
          {...champ("typeEntite")}
        >
          <option value="">{t("audit.tousTypes")}</option>
          {(facettes.data?.typesEntite ?? []).map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
        <select className="f-input" aria-label={t("audit.action")} {...champ("action")}>
          <option value="">{t("audit.toutesActions")}</option>
          {(facettes.data?.actions ?? []).map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
        <input
          className="f-input"
          type="date"
          aria-label={t("audit.depuis")}
          {...champ("depuis")}
        />
        <input
          className="f-input"
          type="date"
          aria-label={t("audit.jusqua")}
          {...champ("jusqua")}
        />
        <Button
          className="chip-btn"
          onPress={() => {
            setCurseurs([]);
            setFiltres({
              typeEntite: "",
              entiteId: "",
              acteurId: "",
              action: "",
              depuis: "",
              jusqua: "",
            });
          }}
        >
          {t("audit.reinitialiser")}
        </Button>
      </div>

      {requete.isPending ? <Chargement quoi={t("audit.leJournal")} /> : null}
      {requete.isError ? (
        <ErreurDeChargement erreur={requete.error} surReessai={() => void requete.refetch()} />
      ) : null}

      {requete.data ? (
        requete.data.entrees.length === 0 ? (
          <div className="empty empty-large">
            <p>{t("audit.videTitre")}</p>
            <small>{t("audit.videExplication")}</small>
          </div>
        ) : (
          <div className="tlist">
            <div className="au-grid au-head" aria-hidden="true">
              <span>{t("audit.colDate")}</span>
              <span>{t("audit.colAction")}</span>
              <span>{t("audit.colType")}</span>
              <span>{t("audit.colEntite")}</span>
              <span>{t("audit.colActeur")}</span>
            </div>

            {requete.data.entrees.map((e) => (
              <div className="au-grid au-row" key={e.id}>
                <span className="au-when">{formaterDateLongue(e.horodatage)}</span>

                <span className="au-act" style={{ color: couleurDe(e.action) }}>
                  <span className="au-dot" aria-hidden="true" />
                  <span className="bloc-etroit">
                    {/* Le point est le séparateur de niveau d'i18next : le
                        code `leave.approve` deviendrait une clé imbriquée.
                        Il est aplati, et le code brut reste la valeur de
                        repli — une action non traduite reste lisible. */}
                    <span className="au-lab">
                      {t(`audit.action_${e.action.replaceAll(".", "_")}`, e.action)}
                    </span>
                    <span className="au-code">{e.action}</span>
                  </span>
                </span>

                <span className="au-ent">{e.typeEntite}</span>

                <span className="bloc-etroit">
                  <span className="au-id">{e.entiteId}</span>
                </span>

                <span className="au-who">
                  {/* `RG-ADM-09` — une action système n'est pas une action
                      humaine, et un acteur supprimé laisse sa trace : l'entrée
                      survit à la personne, c'est le point d'un journal. */}
                  {e.systeme || !e.acteur ? (
                    <>
                      <span className="au-sys" aria-hidden="true">
                        SYS
                      </span>
                      <span className="au-wn">{t("audit.systeme")}</span>
                    </>
                  ) : e.acteur.supprime ? (
                    <span className="au-wn">{t("audit.acteurSupprime")}</span>
                  ) : (
                    <span className="au-wn">
                      {e.acteur.prenom} {e.acteur.nom}
                    </span>
                  )}
                </span>
              </div>
            ))}

            <div className="pager">
              <Button
                className="chip-btn"
                isDisabled={curseurs.length === 0}
                onPress={() => setCurseurs((c) => c.slice(0, -1))}
              >
                {t("audit.precedent")}
              </Button>
              <span className="pager-n">
                {t("audit.pageCourante", { n: curseurs.length + 1 })}
              </span>
              {/*
                Pagination par CURSEUR, pas par décalage : sur une table
                partitionnée qui grossit en continu, un OFFSET profond coûte
                cher et fait sauter des lignes quand de nouvelles s'insèrent
                pendant la lecture.
              */}
              <Button
                className="chip-btn"
                isDisabled={!requete.data.curseurSuivant}
                onPress={() =>
                  setCurseurs((c) =>
                    requete.data.curseurSuivant ? [...c, requete.data.curseurSuivant] : c,
                  )
                }
              >
                {t("audit.suivant")}
              </Button>
            </div>
          </div>
        )
      ) : null}
    </div>
  );
}
