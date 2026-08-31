import { useMemo, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Tooltip, TooltipTrigger } from "react-aria-components";
import { NOMBRE_PERMISSIONS } from "@rationarium/contracts";
import * as api from "../../api/administration.js";
import { messageErreur } from "../../api/erreurs.js";
import { usePeut } from "../../session/session.js";
import { Chargement, ErreurDeChargement, AccesRefuse } from "../../composants/etats.js";
import { useMessages } from "../../composants/messages.js";
import { Barre, MarqueurCalcule } from "../../composants/pastilles.js";
import { Fenetre } from "../../composants/fenetre.js";
import "../../composants/partages.css";
import "../taches/liste.css";
import "../referentiels/competences.css";
import "./roles.css";

/**
 * Vue 32 — Rôles et permissions.
 *
 * **Les croisements invalides ne sont pas grisés : ils n'existent pas.** Le
 * brief l'exige — « il faut masquer les croisements invalides plutôt que les
 * afficher désactivés ». On n'« approuve » pas un département : dessiner une
 * case cochable puis la désactiver laisserait croire à un droit qu'on n'a pas,
 * plutôt qu'à une combinaison qui n'a pas de sens.
 *
 * C'est **le serveur** qui distingue les trois états d'une case — accordée,
 * refusée, inexistante — à partir du catalogue de `@rationarium/contracts`. Le
 * reconstruire ici créerait une seconde source de vérité, qui divergerait au
 * premier ajout de permission.
 *
 * **Une lecture de haut niveau précède le détail** : couverture par module, et
 * écart au dernier enregistrement. « Cocher une permission a des conséquences
 * invisibles depuis cette page » — on donne au moins de quoi voir ce qu'on
 * change avant d'enregistrer.
 */
export function Roles() {
  const { t } = useTranslation("administration");
  const { t: tErreursR } = useTranslation("erreurs");
  const peut = usePeut();
  const annoncerR = useMessages();
  const clientR = useQueryClient();
  const [roleId, setRoleId] = useState<string | null>(null);

  /**
   * `EX-ADM-03` — supprimer un rôle non système.
   *
   * La vue créait, ouvrait et modifiait les permissions d'un rôle ; elle n'en
   * supprimait aucun, alors que `DELETE /administration/roles/:id` existe depuis
   * L-08. La maquette 32 pose le bouton dans le même `.lv-acts`, désactivé et
   * expliqué pour un rôle système.
   */
  const suppression = useMutation({
    mutationFn: (id: string) => api.supprimerRole(id),
    onSuccess: (_, id) => {
      annoncerR("ok", t("roles.supprime"));
      if (roleId === id) setRoleId(null);
      void clientR.invalidateQueries({ queryKey: ["roles"] });
    },
    onError: (e) => annoncerR("err", messageErreur(e, tErreursR, t("roles.echecSuppression"))),
  });

  const liste = useQuery({
    queryKey: ["roles"],
    queryFn: api.roles,
    enabled: peut("users:manage_roles"),
  });

  if (!peut("users:manage_roles")) return <AccesRefuse />;
  if (liste.isPending) return <Chargement quoi={t("roles.lesRoles")} />;
  if (liste.isError)
    return <ErreurDeChargement erreur={liste.error} surReessai={() => void liste.refetch()} />;

  const selection = roleId ?? liste.data[0]?.id ?? null;

  return (
    <div className="page">
      <div className="pl-toolbar">
        <div>
          <span className="eyebrow">{t("roles.surtitre")}</span>
          <h1 className="h1 titre-vue">{t("roles.titre")}</h1>
          <p className="lede">{t("roles.chapeau")}</p>
        </div>
      </div>

      <section className="panel">
        <div className="panel-head">
          <span className="panel-title">{t("roles.listeTitre")}</span>
          <span className="eyebrow">{t("roles.compte", { n: liste.data.length })}</span>
        </div>

        {liste.data.length === 0 ? (
          <div className="empty">
            <p>{t("roles.videTitre")}</p>
            <small>{t("roles.videExplication")}</small>
          </div>
        ) : (
          <>
            <div className="role-grid role-head">
              <span>{t("roles.colNom")}</span>
              <span>{t("roles.colPermissions")}</span>
              <span>{t("roles.colUtilisateurs")}</span>
              <span>{t("roles.colOrigine")}</span>
              <span>{t("roles.colActions")}</span>
            </div>
            {liste.data.map((r) => (
              <div
                className={`role-grid role-row${selection === r.id ? " is-sel" : ""}`}
                key={r.id}
              >
                <div className="bloc-etroit">
                  <p className="role-n">{r.nom}</p>
                  <span className="role-c">{r.code}</span>
                </div>
                <span className="role-perm">
                  <Barre
                    valeur={(r.nombrePermissions / NOMBRE_PERMISSIONS) * 100}
                    libelle={t("roles.permissionsDe", { nom: r.nom })}
                  />
                  <span className="role-pn">
                    {r.nombrePermissions} / {NOMBRE_PERMISSIONS}
                  </span>
                </span>
                <span className="lv-when">
                  {t("roles.nUtilisateurs", { n: r.nombreUtilisateurs })}
                </span>
                <div>
                  <span
                    className="pill"
                    style={{ color: r.systeme ? "var(--accent)" : "var(--st-review)" }}
                  >
                    {r.systeme ? t("roles.systeme") : t("roles.personnalise")}
                  </span>
                </div>
                <div className="lv-acts">
                  <Button className="ms-toggle" onPress={() => setRoleId(r.id)}>
                    {t("roles.ouvrir")}
                  </Button>
                  {/* `RG-DROITS-02` — un rôle système ne se supprime pas. Le
                      client désactive PAR COURTOISIE et dit pourquoi ; le refus
                      qui compte est celui du serveur. */}
                  {peut("users:manage_roles") ? (
                    <TooltipTrigger>
                      <Button
                        className="ms-toggle"
                        isDisabled={r.systeme || suppression.isPending}
                        onPress={() => suppression.mutate(r.id)}
                      >
                        {t("roles.supprimer")}
                      </Button>
                      {r.systeme ? (
                        <Tooltip className="tip">{t("roles.systemeNonSupprimable")}</Tooltip>
                      ) : null}
                    </TooltipTrigger>
                  ) : null}
                </div>
              </div>
            ))}
          </>
        )}
      </section>

      {/* La matrice porte sur le rôle sélectionné. À l'ouverture, c'est le
          premier de la liste : une page qui n'affiche rien tant qu'on n'a pas
          cliqué se lit comme une page vide. */}
      {selection ? <MatricePermissions roleId={selection} /> : null}
    </div>
  );
}

function MatricePermissions({ roleId }: { roleId: string }) {
  const { t } = useTranslation("administration");
  const { t: tErreurs } = useTranslation("erreurs");
  const annoncer = useMessages();
  const client = useQueryClient();
  const [brouillon, setBrouillon] = useState<ReadonlySet<string> | null>(null);
  const [impactOuvert, setImpactOuvert] = useState(false);

  const matrice = useQuery({
    queryKey: ["roles", roleId, "matrice"],
    queryFn: () => api.matriceRole(roleId),
  });

  const enregistrement = useMutation({
    mutationFn: (permissions: string[]) => api.definirPermissions(roleId, permissions),
    onSuccess: () => {
      annoncer("ok", t("roles.permissionsEnregistrees"));
      setBrouillon(null);
      void client.invalidateQueries({ queryKey: ["roles"] });
    },
    onError: (e) => annoncer("err", messageErreur(e, tErreurs, t("roles.echecAction"))),
  });

  /** Les permissions accordées à l'enregistrement, et les cases existantes. */
  const etat = useMemo(() => {
    const accordees = new Set<string>();
    const existantes = new Set<string>();
    for (const ligne of matrice.data?.lignes ?? []) {
      for (const c of ligne.cases) {
        if (c.detenue === null) continue;
        existantes.add(c.permission);
        if (c.detenue) accordees.add(c.permission);
      }
    }
    return { accordees, existantes };
  }, [matrice.data]);

  if (matrice.isPending) return <Chargement quoi={t("roles.laMatrice")} />;
  if (matrice.isError)
    return <ErreurDeChargement erreur={matrice.error} surReessai={() => void matrice.refetch()} />;

  const { role, actions, lignes } = matrice.data;
  const courantes = brouillon ?? etat.accordees;
  const systeme = role.systeme;

  const ajoutees = [...courantes].filter((p) => !etat.accordees.has(p));
  const retirees = [...etat.accordees].filter((p) => !courantes.has(p));
  const modifie = ajoutees.length > 0 || retirees.length > 0;

  const basculer = (permission: string) => {
    if (systeme) return;
    const suivant = new Set(courantes);
    if (suivant.has(permission)) suivant.delete(permission);
    else suivant.add(permission);
    setBrouillon(suivant);
  };

  const toutDuDomaine = (domaine: string) => {
    if (systeme) return;
    const ligne = lignes.find((l) => l.domaine === domaine);
    const duDomaine = (ligne?.cases ?? [])
      .filter((c) => c.detenue !== null)
      .map((c) => c.permission);
    const toutCoche = duDomaine.every((p) => courantes.has(p));
    const suivant = new Set(courantes);
    for (const p of duDomaine) {
      if (toutCoche) suivant.delete(p);
      else suivant.add(p);
    }
    setBrouillon(suivant);
  };

  const cases = lignes.length * actions.length;

  /* Les modules effectivement couverts : au moins une case accordée. */
  const modulesCouverts = lignes.filter((l) =>
    l.cases.some((c) => c.detenue !== null && courantes.has(c.permission)),
  ).length;

  return (
    <div className="matrice-espace">
      <div className="pl-toolbar">
        <div>
          <span className="eyebrow">{t("roles.matriceSurtitre")}</span>
          <h2 className="panel-title titre-matrice">{role.nom}</h2>
        </div>
        <div className="ligne-actions-fin">
          <Button
            className="chip-btn"
            isDisabled={!modifie}
            onPress={() => setBrouillon(null)}
          >
            {t("roles.revenirAuModele")}
          </Button>
          <Button
            className="chip-btn"
            isDisabled={!modifie}
            onPress={() => setImpactOuvert(true)}
          >
            {t("roles.voirImpact")}
          </Button>
          {/* `RG-GEN-06` — désactivé plutôt qu'absent, et l'explication est au
              survol : une commande qui disparaît laisse chercher où elle est. */}
          {systeme ? (
            <TooltipTrigger delay={200}>
              <Button className="btn btn-primary" isDisabled>
                {t("roles.enregistrerPermissions")}
              </Button>
              <Tooltip className="tooltip">{t("roles.roleSystemeLectureSeule")}</Tooltip>
            </TooltipTrigger>
          ) : (
            <Button
              className="btn btn-primary"
              isDisabled={!modifie}
              isPending={enregistrement.isPending}
              onPress={() => enregistrement.mutate([...courantes])}
            >
              {t("roles.enregistrerPermissions")}
            </Button>
          )}
        </div>
      </div>

      {/* Lecture de haut niveau, avant le détail case à case. */}
      <div className="mx-top">
        <div className="kpi">
          <span className="eyebrow">{t("roles.permissionsAccordees")}</span>
          <p className="kpi-val">{courantes.size}</p>
          <Barre
            valeur={(courantes.size / Math.max(1, etat.existantes.size)) * 100}
            libelle={t("roles.permissionsAccordees")}
            classe="bar kpi-bar"
          />
        </div>

        <div className="kpi">
          <div className="kpi-head">
            <span className="eyebrow">{t("roles.croisementsValides")}</span>
            <MarqueurCalcule
              libelle={t("roles.surTotal", { n: cases })}
              explication={t("roles.croisementsExplication")}
            />
          </div>
          <p className="kpi-val">{etat.existantes.size}</p>
          <span className="kpi-sub">
            {t("roles.croisementsAide", { n: etat.existantes.size, total: cases })}
          </span>
        </div>

        <div className={`kpi${modifie ? " is-alert" : ""}`}>
          <span className="eyebrow">{t("roles.ecartAuModele")}</span>
          <p className="kpi-val kpi-val-ecart">
            {modifie ? (
              <>
                <span className="diff-pill diff-add">
                  {t("roles.ajoutees", { n: ajoutees.length })}
                </span>{" "}
                <span className="diff-pill diff-rem">
                  {t("roles.retirees", { n: retirees.length })}
                </span>
              </>
            ) : (
              t("roles.aucunEcart")
            )}
          </p>
          <span className="kpi-sub">
            {modifie
              ? t("roles.parRapportAu", { code: role.code })
              : t("roles.identiqueAu", { code: role.code })}
          </span>
        </div>

        <div className="kpi">
          <span className="eyebrow">{t("roles.modulesCouverts")}</span>
          <p className="kpi-val">{modulesCouverts}</p>
          <span className="kpi-sub">{t("roles.surNModules", { n: lignes.length })}</span>
        </div>
      </div>

      {systeme ? (
        <div className="alert alert-warn" role="status">
          <span className="alert-icon" aria-hidden="true">
            ⌸
          </span>
          <span className="alert-corps">{t("roles.roleSystemeLectureSeule")}</span>
        </div>
      ) : null}

      <div className="pm-wrap">
        <div
          className="pm"
          style={{ "--cols": `290px repeat(${actions.length}, 38px)` } as CSSProperties}
        >
          <div className="pm-corner">
            <span className="eyebrow">{t("roles.module")}</span>
          </div>
          {actions.map((a) => (
            <div className="pm-head" key={a}>
              <span title={a}>{t(`roles.action_${a}`, a)}</span>
            </div>
          ))}

          {lignes.map((ligne) => (
            <LigneDomaine
              key={ligne.domaine}
              ligne={ligne}
              courantes={courantes}
              accordees={etat.accordees}
              systeme={systeme}
              surBascule={basculer}
              surTout={() => toutDuDomaine(ligne.domaine)}
            />
          ))}
        </div>
      </div>

      {/* Les cases hachurées ne sont pas des refus : le croisement n'existe
          pas au catalogue. Le dire évite de le lire comme une interdiction. */}
      <p className="field-hint mx-foot">{t("roles.pied")}</p>

      {/* « Cocher une permission a des conséquences invisibles depuis cette
          page. » On montre donc l'écart avant d'écrire, et on rappelle que
          rien n'est écrit tant qu'on n'a pas confirmé. */}
      <Fenetre
        ouverte={impactOuvert}
        surFermeture={() => setImpactOuvert(false)}
        categorie={t("roles.avantEnregistrer")}
        titre={`${role.nom} · ${role.code}`}
        large
        mention={t("roles.rienNEstEcrit")}
        actions={
          <>
            <Button className="btn btn-secondary" onPress={() => setImpactOuvert(false)}>
              {t("roles.continuerAModifier")}
            </Button>
            <Button
              className="btn btn-primary"
              isDisabled={systeme}
              onPress={() => {
                setImpactOuvert(false);
                enregistrement.mutate([...courantes]);
              }}
            >
              {t("roles.confirmerEtEnregistrer")}
            </Button>
          </>
        }
      >
        <p className="lede impact-lede">
          {t("roles.impactLede", { n: ajoutees.length + retirees.length })}
        </p>
        {ajoutees.map((p) => (
          <div className="impact-row" key={p}>
            <span className="impact-k diff-add">{t("roles.impactAjout")}</span>
            <span>
              <span className="impact-t">{p}</span>
              <span className="impact-d">{t("roles.impactAjoutAide")}</span>
            </span>
          </div>
        ))}
        {retirees.map((p) => (
          <div className="impact-row" key={p}>
            <span className="impact-k diff-rem">{t("roles.impactRetrait")}</span>
            <span>
              <span className="impact-t">{p}</span>
              <span className="impact-d">{t("roles.impactRetraitAide")}</span>
            </span>
          </div>
        ))}
      </Fenetre>
    </div>
  );
}

function LigneDomaine({
  ligne,
  courantes,
  accordees,
  systeme,
  surBascule,
  surTout,
}: {
  ligne: api.Matrice["lignes"][number];
  courantes: ReadonlySet<string>;
  accordees: ReadonlySet<string>;
  systeme: boolean;
  surBascule: (permission: string) => void;
  surTout: () => void;
}) {
  const { t } = useTranslation("administration");
  const nomDomaine = t(`roles.domaine_${ligne.domaine}`, ligne.domaine);
  const existantes = ligne.cases.filter((c) => c.detenue !== null);
  const cochees = existantes.filter((c) => courantes.has(c.permission)).length;

  return (
    <>
      <div className="pm-mod">
        <span className="pm-mn">{nomDomaine}</span>
        <span className="pm-cnt">
          <Barre
            valeur={existantes.length === 0 ? 0 : (cochees / existantes.length) * 100}
            libelle={t("roles.couvertureDe", { module: nomDomaine })}
          />
          <span className="pm-cn">
            {cochees}/{existantes.length}
          </span>
        </span>
        {/* Sur un rôle système la commande reste visible et désactivée, avec
            son explication : la faire disparaître ferait croire que le module
            ne se coche pas en bloc, au lieu que ce rôle-ci ne se modifie pas. */}
        {/* Pas d'infobulle ici : le motif est déjà énoncé par le bandeau au-
            dessus de la matrice, et vingt-quatre infobulles pèseraient sur le
            budget de rendu de la grille. */}
        <Button
          className="pm-all"
          onPress={surTout}
          isDisabled={systeme}
          aria-label={t("roles.toutSelectionner", { module: nomDomaine })}
        >
          <span aria-hidden="true">{cochees === existantes.length ? "−" : "✓"}</span>
        </Button>
      </div>

      {ligne.cases.map((c) => {
        // Le croisement n'existe pas : on ne dessine pas de case du tout.
        if (c.detenue === null) {
          return (
            <div
              className="pm-cell is-void"
              key={c.permission}
              aria-hidden="true"
              title={t("roles.croisementInexistant")}
            />
          );
        }
        const cochee = courantes.has(c.permission);
        const change = cochee !== accordees.has(c.permission);
        return (
          <div
            className={`pm-cell${change ? " is-changed" : ""}${systeme ? " is-ro" : ""}`}
            key={c.permission}
          >
            <Button
              className="pm-box"
              aria-pressed={cochee}
              isDisabled={systeme}
              aria-label={t("roles.casePermission", {
                module: nomDomaine,
                action: t(`roles.action_${c.action}`, c.action),
                etat: cochee ? t("roles.accordee") : t("roles.refusee"),
              })}
              onPress={() => surBascule(c.permission)}
            >
              <span aria-hidden="true">✓</span>
            </Button>
          </div>
        );
      })}
    </>
  );
}
