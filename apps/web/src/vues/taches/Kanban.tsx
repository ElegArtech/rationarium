import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button, Menu, MenuItem, MenuTrigger, Popover } from "react-aria-components";
import { STATUTS_TACHE, PRIORITES } from "@rationarium/contracts";
import * as api from "../../api/taches.js";
import { messageErreur } from "../../api/erreurs.js";
import { usePeut } from "../../session/session.js";
import { useMessages } from "../../composants/messages.js";
import { Pastille, Barre, useLibelle } from "../../composants/pastilles.js";
import "../../composants/partages.css";
import "./kanban.css";

/**
 * Le tableau kanban — vue 12, et bascule de la vue 16.
 *
 * **Les colonnes « À faire » et « Terminé » ne peuvent jamais être masquées**
 * (brief de la vue 12). Elles ne sont donc pas paramétrables ici : la liste
 * des colonnes est le vocabulaire de `cadrage/01 § 4.1`, dans son ordre.
 *
 * **Le glisser-déposer est toujours doublé d'une action explicite au clavier**
 * (`C6`). Le menu « Déplacer vers… » n'est pas un repli dégradé : c'est le
 * chemin nominal pour qui n'a pas de souris, et il est découvrable, annonçable
 * et testable — ce qu'une traînée simulée n'est pas.
 *
 * **En cas d'échec, la carte revient à sa place d'origine** — état nommé par
 * `design/etats.json`. C'est l'invalidation de la requête qui s'en charge : on
 * ne parie jamais sur le succès d'une écriture.
 */

const COULEUR: Record<string, string> = {
  todo: "var(--st-todo)",
  doing: "var(--st-doing)",
  review: "var(--st-review)",
  done: "var(--st-done)",
  blocked: "var(--st-blocked)",
};

export function Kanban({
  taches,
  surRechargement,
  cleRequete,
  surAnnonce,
  surCreation,
}: {
  taches: api.LigneTache[];
  surRechargement: () => void;
  cleRequete: readonly unknown[];
  /**
   * La région vive de la vue — `<p class="sr-only" aria-live="polite">` dans la
   * maquette. Elle ne double pas la bulle de confirmation : celle-ci dit
   * l'issue (« Statut mis à jour. »), celle-là dit **où la carte a atterri**,
   * que la bulle ne porte pas. La maquette dit les deux, dans cet ordre.
   */
  surAnnonce?: (message: string) => void;
  /** Le « + » de l'en-tête de colonne : créer une tâche dans ce statut. */
  surCreation?: (statut: string) => void;
}) {
  const { t } = useTranslation("taches");
  const { t: tErreurs } = useTranslation("erreurs");
  const libelle = useLibelle();
  const peut = usePeut();
  const annoncer = useMessages();
  const client = useQueryClient();
  const [survolee, setSurvolee] = useState<string | null>(null);

  const deplacer = useMutation({
    mutationFn: ({ tache, statut }: { tache: api.LigneTache; statut: string }) =>
      api.modifier(tache.id, { version: tache.version, statut }),
    onSuccess: (_donnees, { tache, statut }) => {
      annoncer("ok", t("kanban.statutMisAJour"));
      surAnnonce?.(
        t("kanban.deplaceeVers", {
          titre: tache.titre,
          colonne: libelle(statut, STATUTS_TACHE),
        }),
      );
      void client.invalidateQueries({ queryKey: cleRequete });
    },
    onError: (e, { tache }) => {
      annoncer("err", messageErreur(e, tErreurs, t("kanban.echecStatut")));
      surAnnonce?.(
        t("kanban.echecRetour", { colonne: libelle(tache.statut, STATUTS_TACHE) }),
      );
      // La carte revient à sa place : on recharge plutôt que de deviner.
      surRechargement();
    },
  });

  const modifiable = peut("tasks:update");

  return (
    <div className="kan" style={{ "--n": STATUTS_TACHE.length } as React.CSSProperties}>
      {STATUTS_TACHE.map((colonne) => {
        const cartes = taches.filter((x) => x.statut === colonne.code);
        return (
          <section
            key={colonne.code}
            className={`kcol${survolee === colonne.code ? " is-over" : ""}`}
            aria-label={`${libelle(colonne.code, STATUTS_TACHE)} — ${cartes.length}`}
            onDragOver={(e) => {
              if (!modifiable) return;
              e.preventDefault();
              setSurvolee(colonne.code);
            }}
            onDragLeave={() => setSurvolee(null)}
            onDrop={(e) => {
              e.preventDefault();
              setSurvolee(null);
              const id = e.dataTransfer.getData("text/plain");
              const tache = taches.find((x) => x.id === id);
              if (tache && tache.statut !== colonne.code) {
                deplacer.mutate({ tache, statut: colonne.code });
              }
            }}
          >
            <div className="kcol-head" style={{ color: COULEUR[colonne.code] }}>
              <span className="kcol-dot" aria-hidden="true" />
              <span className="kcol-name">{libelle(colonne.code, STATUTS_TACHE)}</span>
              <span className="kcol-n">{cartes.length}</span>
              {surCreation ? (
                <Button
                  className="kcol-add"
                  aria-label={t("kanban.creerDans", {
                    colonne: libelle(colonne.code, STATUTS_TACHE),
                  })}
                  onPress={() => surCreation(colonne.code)}
                >
                  <span aria-hidden="true">+</span>
                </Button>
              ) : null}
            </div>

            <div className="kcol-body">
              {cartes.length === 0 ? (
                <p className="kempty">{t("kanban.colonneVide")}</p>
              ) : (
                cartes.map((tache) => (
                  <Carte
                    key={tache.id}
                    tache={tache}
                    colonne={libelle(colonne.code, STATUTS_TACHE)}
                    modifiable={modifiable}
                    surDeplacement={(statut) => deplacer.mutate({ tache, statut })}
                    surDecalage={(pas) => {
                      const ordre: string[] = STATUTS_TACHE.map((s) => s.code);
                      const i = ordre.indexOf(tache.statut);
                      const cible = ordre[i + pas];
                      if (cible) deplacer.mutate({ tache, statut: cible });
                    }}
                  />
                ))
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function Carte({
  tache,
  colonne,
  modifiable,
  surDeplacement,
  surDecalage,
}: {
  tache: api.LigneTache;
  colonne: string;
  modifiable: boolean;
  surDeplacement: (statut: string) => void;
  /** Alt + ← / → : −1 pour la colonne précédente, +1 pour la suivante. */
  surDecalage: (pas: number) => void;
}) {
  const { t } = useTranslation("taches");
  const libelle = useLibelle();
  const [saisie, setSaisie] = useState(false);

  const visibles = tache.assignes.slice(0, 3);
  const reste = tache.assignes.length - visibles.length;

  return (
    <div
      className={`kcard${tache.enRetard ? " is-late" : ""}${saisie ? " is-dragging" : ""}`}
      draggable={modifiable}
      /*
       * La carte est un `article` focalisable, comme dans la maquette : c'est
       * elle qui porte le raccourci Alt + ← / →, l'alternative clavier au
       * glisser-déposer annoncée par l'indice de la barre d'outils (`C6`).
       * Sans `tabIndex`, l'indice mentirait — aucun moyen de « sélectionner »
       * la carte.
       */
      role="article"
      tabIndex={0}
      aria-label={`${tache.titre} — ${colonne}`}
      onKeyDown={(e) => {
        if (!e.altKey || !modifiable) return;
        if (e.key === "ArrowRight") {
          e.preventDefault();
          surDecalage(1);
        }
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          surDecalage(-1);
        }
      }}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", tache.id);
        setSaisie(true);
      }}
      onDragEnd={() => setSaisie(false)}
    >
      <div className="kcard-top">
        <Pastille code={tache.priorite} vocabulaire={PRIORITES} />
        {tache.enRetard ? <span className="badge badge-late">{t("enRetard")}</span> : null}
        {tache.pourAujourdhui ? (
          <span className="badge badge-today">{t("pourAujourdhui")}</span>
        ) : null}
        {tache.horsProjet ? (
          <span className="badge badge-indep">{t("tacheIndependante")}</span>
        ) : null}
        {tache.milestone ? <span className="kmile">{tache.milestone.nom}</span> : null}
      </div>

      <Link to="/taches/$id" params={{ id: tache.id }} className="kcard-lien">
        <p className="kcard-title">{tache.titre}</p>
      </Link>

      <div className="kcard-foot">
        <div className="avs">
          {visibles.map((a) => (
            <span key={a.userId} className="agent-av" aria-hidden="true">
              {`${a.user.prenom[0] ?? ""}${a.user.nom[0] ?? ""}`.toUpperCase()}
            </span>
          ))}
          {reste > 0 ? <span className="avs-more">{t("kanban.autres", { n: reste })}</span> : null}
        </div>
        {tache.estimationHeures ? (
          <span className="kcard-est">
            {t("kanban.estimees", { n: Number(tache.estimationHeures) })}
          </span>
        ) : null}
      </div>

      <Barre valeur={tache.avancement} libelle={t("kanban.avancementDe", { titre: tache.titre })} />

      {/*
        C6 — l'alternative clavier. Le menu nomme la destination : « Déplacer
        vers En cours » se comprend et s'annonce, là où une traînée simulée ne
        laisse aucune prise.
      */}
      {modifiable ? (
        <MenuTrigger>
          <Button className="kmove" aria-label={t("kanban.deplacerCette", { titre: tache.titre })}>
            <span aria-hidden="true">⇄</span>
          </Button>
          <Popover>
            <Menu className="pop pop-sm" onAction={(cle) => surDeplacement(String(cle))}>
              {STATUTS_TACHE.filter((s) => s.code !== tache.statut).map((s) => (
                <MenuItem className="pop-action" key={s.code} id={s.code}>
                  {t("kanban.deplacerVers", { colonne: libelle(s.code, STATUTS_TACHE) })}
                </MenuItem>
              ))}
            </Menu>
          </Popover>
        </MenuTrigger>
      ) : null}
    </div>
  );
}
