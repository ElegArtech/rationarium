import { useMemo, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "react-aria-components";
import { NOMBRE_PERMISSIONS } from "@trame/contracts";
import * as api from "../../api/administration.js";
import { messageErreur } from "../../api/erreurs.js";
import { usePeut } from "../../session/session.js";
import { Chargement, ErreurDeChargement, AccesRefuse } from "../../composants/etats.js";
import { useMessages } from "../../composants/messages.js";
import { Barre } from "../../composants/pastilles.js";
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
 * refusée, inexistante — à partir du catalogue de `@trame/contracts`. Le
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
  const peut = usePeut();
  const [roleId, setRoleId] = useState<string | null>(null);

  const liste = useQuery({
    queryKey: ["roles"],
    queryFn: api.roles,
    enabled: peut("users:manage_roles"),
  });

  if (!peut("users:manage_roles")) return <AccesRefuse />;
  if (liste.isPending) return <Chargement quoi={t("roles.lesRoles")} />;
  if (liste.isError)
    return <ErreurDeChargement erreur={liste.error} surReessai={() => void liste.refetch()} />;

  return (
    <div className="page">
      <div className="pl-toolbar">
        <div>
          <span className="eyebrow">{t("roles.surtitre")}</span>
          <h1 className="h1 titre-vue">{t("roles.titre")}</h1>
          <p className="lede">{t("roles.chapeau")}</p>
        </div>
      </div>

      {liste.data.length === 0 ? (
        <div className="empty empty-large">
          <p>{t("roles.videTitre")}</p>
          <small>{t("roles.videExplication")}</small>
        </div>
      ) : (
        <div className="tlist">
          <div className="role-grid role-head" aria-hidden="true">
            <span>{t("roles.colNom")}</span>
            <span>{t("roles.colCode")}</span>
            <span>{t("roles.colPermissions")}</span>
            <span>{t("roles.colNature")}</span>
            <span>{t("roles.colActions")}</span>
          </div>
          {liste.data.map((r) => (
            <div
              className={`role-grid role-row${roleId === r.id ? " is-sel" : ""}`}
              key={r.id}
            >
              <div className="bloc-etroit">
                <p className="role-n">{r.nom}</p>
                {r.description ? <span className="role-c">{r.description}</span> : null}
              </div>
              <span className="role-c">{r.code}</span>
              <span className="role-perm">
                <Barre
                  valeur={(r.nombrePermissions / NOMBRE_PERMISSIONS) * 100}
                  libelle={t("roles.permissionsDe", { nom: r.nom })}
                />
                <span className="role-pn">{r.nombrePermissions}</span>
              </span>
              <span
                className="pill"
                style={{ color: r.systeme ? "var(--muted)" : "var(--st-doing)" }}
              >
                {r.systeme ? t("roles.systeme") : t("roles.personnalise")}
              </span>
              <span className="lv-acts">
                <Button className="chip-btn" onPress={() => setRoleId(r.id)}>
                  {t("roles.ouvrirMatrice")}
                </Button>
              </span>
            </div>
          ))}
        </div>
      )}

      {roleId ? <MatricePermissions roleId={roleId} /> : null}
    </div>
  );
}

function MatricePermissions({ roleId }: { roleId: string }) {
  const { t } = useTranslation("administration");
  const { t: tErreurs } = useTranslation("erreurs");
  const annoncer = useMessages();
  const client = useQueryClient();
  const [brouillon, setBrouillon] = useState<ReadonlySet<string> | null>(null);

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

  return (
    <section className="panel matrice-espace">
      <div className="panel-head">
        <span className="panel-title">{t("roles.matriceDe", { nom: role.nom })}</span>
        <span className="ligne-actions">
          {/* L'écart au dernier enregistrement : la seule chose qu'on puisse
              montrer honnêtement de l'impact, depuis cette page. */}
          {modifie ? (
            <>
              <span className="diff-pill diff-add">
                {t("roles.ajoutees", { n: ajoutees.length })}
              </span>
              <span className="diff-pill diff-rem">
                {t("roles.retirees", { n: retirees.length })}
              </span>
            </>
          ) : null}
          {systeme ? null : (
            <Button
              className="btn btn-primary"
              isDisabled={!modifie}
              isPending={enregistrement.isPending}
              onPress={() => enregistrement.mutate([...courantes])}
            >
              {t("roles.enregistrerPermissions")}
            </Button>
          )}
        </span>
      </div>

      {systeme ? (
        <div className="alert alert-neutral" role="status">
          <span className="alert-icon" aria-hidden="true">
            →
          </span>
          <span>{t("roles.roleSystemeLectureSeule")}</span>
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

      <p className="mx-foot">
        {t("roles.pied", { valides: etat.existantes.size, cases })}
      </p>
    </section>
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
        {systeme ? (
          <span />
        ) : (
          <Button
            className="pm-all"
            onPress={surTout}
            aria-label={t("roles.toutSelectionner", { module: nomDomaine })}
          >
            <span aria-hidden="true">⊞</span>
          </Button>
        )}
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
