import { Fragment, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useBlocker } from "@tanstack/react-router";
import { Button } from "react-aria-components";
import * as api from "../../api/administration.js";
import { messageErreur } from "../../api/erreurs.js";
import { usePeut } from "../../session/session.js";
import { Chargement, ErreurDeChargement, AccesRefuse } from "../../composants/etats.js";
import { useMessages } from "../../composants/messages.js";
import { Fenetre } from "../../composants/fenetre.js";
import { formaterDate } from "../../formats.js";
import "../../composants/partages.css";
import "../taches/liste.css";
import "../projets/jalons.css";
import "./parametres.css";

/**
 * Vue 31 — Paramètres.
 *
 * **Un jour férié marqué « ouvré » compte comme travaillé dans le décompte des
 * congés.** Le brief le pose en point d'attention : « c'est un paramètre à
 * effet de bord lointain », et la conséquence doit être explicite au moment du
 * réglage. La ligne concernée est donc teintée, la bascule porte son libellé,
 * et l'aide dit ce que le réglage change ailleurs.
 *
 * **Les modifications non enregistrées sont annoncées en permanence.** Un
 * bandeau collant, pas un message qui passe : quatre onglets se remplissent en
 * plusieurs minutes, et une alerte fugace n'y survit pas.
 */

type Onglet = "affichage" | "planning" | "feries" | "vacances";

const FORMATS_DATE = [
  { cle: "JJ/MM/AAAA", exemple: "31/12/2025" },
  { cle: "MM/JJ/AAAA", exemple: "12/31/2025" },
  { cle: "AAAA-MM-JJ", exemple: "2025-12-31" },
  { cle: "J Mois AAAA", exemple: "31 décembre 2025" },
  { cle: "Jour J Mois AAAA", exemple: "mercredi 31 décembre 2025" },
] as const;

const FORMATS_HEURE = [
  { cle: "24h", exemple: "14:30" },
  { cle: "24h-secondes", exemple: "14:30:45" },
  { cle: "12h", exemple: "02:30 PM" },
] as const;

const JOURS = [1, 2, 3, 4, 5, 6, 0] as const;

/** Les régions offertes. Elles décident du nom des mois et des jours. */
const REGIONS = [
  { cle: "fr-FR", exemple: "jeudi 31 décembre" },
  { cle: "en-US", exemple: "Thursday, December 31" },
] as const;

/**
 * Les deux natures de jour férié que le produit **compte** déjà.
 *
 * `legal` est ce que pose l'import du calendrier français, et c'est lui que le
 * compteur « Fériés légaux » de cette vue additionne ; `local` est le jour
 * particulier de la collectivité, et c'est le défaut du serveur pour un jour
 * déclaré à la main. La maquette 31 en propose un troisième — « Jour de
 * pont » — qu'aucune définition ne porte, ni au cadrage, ni dans
 * `@rationarium/contracts`, ni au serveur : il n'est pas inventé ici, il est
 * remonté en question.
 */
const TYPES_FERIE = ["local", "legal"] as const;

/** Les valeurs par défaut du produit, celles que « Réinitialiser » restaure. */
const DEFAUTS: Record<string, string> = {
  "display.dateFormat": "JJ/MM/AAAA",
  "display.timeFormat": "24h",
  "display.locale": "fr-FR",
  "display.firstDayOfWeek": "1",
  "planning.visibleDays": "1,2,3,4,5",
};

export function Parametres() {
  const { t } = useTranslation("administration");
  const { t: tErreurs } = useTranslation("erreurs");
  const peut = usePeut();
  const annoncer = useMessages();
  const client = useQueryClient();
  const [onglet, setOnglet] = useState<Onglet>("affichage");
  const [brouillon, setBrouillon] = useState<Record<string, string>>({});

  const requete = useQuery({
    queryKey: ["parametrage"],
    queryFn: api.reglages,
    enabled: peut("settings:read"),
  });

  // Le brouillon part des valeurs enregistrées, et se resynchronise quand
  // elles changent sous lui — cas d'un enregistrement fait ailleurs.
  useEffect(() => {
    if (requete.data) setBrouillon(requete.data);
  }, [requete.data]);

  const enregistrement = useMutation({
    mutationFn: () => api.enregistrerReglages(brouillon),
    onSuccess: () => {
      annoncer("ok", t("parametres.enregistre"));
      void client.invalidateQueries({ queryKey: ["parametrage"] });
    },
    onError: (e) => annoncer("err", messageErreur(e, tErreurs, t("parametres.echecAction"))),
  });

  /*
   * `RG-PRM-05` — quitter la page avec des modifications non enregistrées
   * déclenche un avertissement.
   *
   * **Le bandeau ne suffisait pas, et ce n'était pas une variante du même
   * geste.** Il annonce qu'il y a quelque chose à enregistrer ; il n'empêche
   * pas de le perdre. On cliquait sur un autre menu et la saisie disparaissait
   * sans un mot — quatre onglets qui se remplissent en plusieurs minutes.
   *
   * `enableBeforeUnload` couvre la fermeture de l'onglet, que le routeur ne
   * voit pas : le navigateur y pose sa propre demande de confirmation, dont le
   * texte ne nous appartient pas. La navigation interne, elle, est arrêtée et
   * la question posée dans nos mots.
   *
   * Déclaré AVANT les retours anticipés : un `useBlocker` placé après n'est
   * pas appelé au premier rendu, et React s'arrête sur « rendered more hooks
   * than during the previous render ».
   */
  const enregistreOuVide = requete.data ?? {};
  const modifie = Object.keys(brouillon).some((c) => brouillon[c] !== enregistreOuVide[c]);
  const sortie = useBlocker({
    shouldBlockFn: () => modifie,
    enableBeforeUnload: () => modifie,
    withResolver: true,
  });

  if (!peut("settings:read")) return <AccesRefuse />;
  if (requete.isPending) return <Chargement quoi={t("parametres.lesReglages")} />;
  if (requete.isError)
    return <ErreurDeChargement erreur={requete.error} surReessai={() => void requete.refetch()} />;

  const enregistre = requete.data;
  const lire = (cle: string, defaut: string) => brouillon[cle] ?? defaut;
  const ecrire = (cle: string, valeur: string) =>
    setBrouillon((b) => ({ ...b, [cle]: valeur }));

  const onglets: { cle: Onglet; libelle: string }[] = [
    { cle: "affichage", libelle: t("parametres.ongletAffichage") },
    { cle: "planning", libelle: t("parametres.ongletPlanning") },
    { cle: "feries", libelle: t("parametres.ongletFeries") },
    { cle: "vacances", libelle: t("parametres.ongletVacances") },
  ];

  return (
    <div className="page">
      <div className="pl-toolbar">
        <div>
          <span className="eyebrow">{t("parametres.surtitre")}</span>
          <h1 className="h1 titre-vue">{t("parametres.titre")}</h1>
          <p className="lede lede-vue">{t("parametres.lede")}</p>
        </div>
        {peut("settings:update") ? (
          <div className="ligne-actions-fin">
            {/* « Réinitialiser » ramène le brouillon aux valeurs par défaut du
                produit ; c'est l'enregistrement qui les applique. Rien n'est
                écrit en base tant que la personne n'a pas confirmé. */}
            <Button className="chip-btn" onPress={() => setBrouillon({ ...brouillon, ...DEFAUTS })}>
              {t("parametres.reinitialiser")}
            </Button>
            <Button
              className="btn btn-primary"
              isDisabled={!modifie}
              isPending={enregistrement.isPending}
              onPress={() => enregistrement.mutate()}
            >
              {t("parametres.enregistrer")}
            </Button>
          </div>
        ) : null}
      </div>

      {/* Le bandeau reste : quatre onglets se remplissent en plusieurs minutes,
          et une alerte fugace n'y survivrait pas. */}
      {modifie ? (
        <div className="dirty-bar" role="status">
          <span aria-hidden="true" className="dirty-mark">
            !
          </span>
          <span className="bloc-etroit">
            <span className="dirty-t">{t("parametres.modificationsNonEnregistrees")}</span>
            <span className="dirty-d">{t("parametres.modificationsAide")}</span>
          </span>
          <Button className="chip-btn" onPress={() => setBrouillon(enregistre)}>
            {t("parametres.annulerModifications")}
          </Button>
          <Button
            className="btn btn-primary"
            isPending={enregistrement.isPending}
            onPress={() => enregistrement.mutate()}
          >
            {t("parametres.enregistrer")}
          </Button>
        </div>
      ) : null}

      <nav className="tabbar" aria-label={t("parametres.sections")}>
        {onglets.map((o) => (
          <a
            key={o.cle}
            href={`#${o.cle}`}
            className={o.cle === onglet ? "is-active" : ""}
            aria-current={o.cle === onglet ? "page" : undefined}
            onClick={(e) => {
              e.preventDefault();
              setOnglet(o.cle);
            }}
          >
            {o.libelle}
          </a>
        ))}
      </nav>

      {onglet === "affichage" ? <Affichage lire={lire} ecrire={ecrire} /> : null}
      {onglet === "planning" ? <Planning lire={lire} ecrire={ecrire} /> : null}
      {onglet === "feries" ? <Feries /> : null}
      {onglet === "vacances" ? <VacancesScolaires /> : null}
      {/*
        `RG-PRM-05` — la question est posée dans NOS mots, avec la sortie et le
        retour clairement nommés. « Quitter sans enregistrer » dit ce qui se
        perd ; « Rester » est le geste par défaut, parce que c'est celui qui ne
        détruit rien.
      */}
      <Fenetre
        ouverte={sortie.status === "blocked"}
        surFermeture={() => sortie.reset?.()}
        categorie={t("confirmation")}
        titre={t("parametres.quitterTitre")}
        mention={t("parametres.modificationsAide")}
        actions={
          <>
            <Button className="btn btn-secondary" onPress={() => sortie.reset?.()}>
              {t("parametres.rester")}
            </Button>
            <Button className="btn btn-danger" onPress={() => sortie.proceed?.()}>
              {t("parametres.quitterSansEnregistrer")}
            </Button>
          </>
        }
      >
        <p className="phrase-confirmation">{t("parametres.quitterTexte")}</p>
      </Fenetre>
    </div>
  );
}

type Acces = {
  lire: (cle: string, defaut: string) => string;
  ecrire: (cle: string, valeur: string) => void;
};

/**
 * L'aperçu, appliqué en direct au **brouillon**.
 *
 * Il ne passe pas par `formats.ts` : celui-ci lit les réglages *enregistrés*,
 * et l'aperçu doit montrer ce que produirait le brouillon — sans quoi il
 * afficherait l'ancien réglage jusqu'à l'enregistrement, c'est-à-dire
 * exactement l'inverse de ce qu'on lui demande.
 */
function Apercu({
  formatDate,
  formatHeure,
  region,
  premierJour,
}: {
  formatDate: string;
  formatHeure: string;
  region: string;
  premierJour: string;
}) {
  const { t } = useTranslation("administration");
  const d = new Date(Date.UTC(2026, 11, 31));

  const date = new Intl.DateTimeFormat(region, {
    ...(formatDate === "AAAA-MM-JJ" || formatDate === "MM/JJ/AAAA"
      ? { day: "2-digit" as const, month: "2-digit" as const, year: "numeric" as const }
      : (OPTIONS_APERCU[formatDate] ?? OPTIONS_APERCU["JJ/MM/AAAA"]!)),
    timeZone: "UTC",
  }).format(d);
  const dateFinale =
    formatDate === "AAAA-MM-JJ" ? "2026-12-31" : formatDate === "MM/JJ/AAAA" ? "12/31/2026" : date;

  const heure =
    formatHeure === "24h-secondes" ? "14:30:45" : formatHeure === "12h" ? "02:30 PM" : "14:30";

  const lignes: [string, string][] = [
    [t("parametres.apercuEcheance"), dateFinale],
    [t("parametres.apercuHoraire"), `${heure} → 16:00`],
    [t("parametres.apercuConge"), t("parametres.apercuDuAu", { debut: dateFinale, fin: dateFinale })],
    [t("parametres.apercuEnTete"), t(`parametres.ordreSemaine_${premierJour}`)],
    [t("parametres.apercuAudit"), `${dateFinale} · ${heure}`],
  ];

  return (
    <section className="panel">
      <div className="panel-head">
        <span className="panel-title">{t("parametres.apercu")}</span>
        <span className="eyebrow">{t("parametres.appliqueEnDirect")}</span>
      </div>
      <div className="panel-body">
        <div className="preview-box">
          <dl className="preview-l">
            {lignes.map(([cle, valeur]) => (
              <Fragment key={cle}>
                <dt>{cle}</dt>
                <dd>{valeur}</dd>
              </Fragment>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}

const OPTIONS_APERCU: Record<string, Intl.DateTimeFormatOptions> = {
  "JJ/MM/AAAA": { day: "2-digit", month: "2-digit", year: "numeric" },
  "J Mois AAAA": { day: "numeric", month: "long", year: "numeric" },
  "Jour J Mois AAAA": { weekday: "long", day: "numeric", month: "long", year: "numeric" },
};

/** Chaque format se choisit sur un exemple, pas sur son code. */
function Affichage({ lire, ecrire }: Acces) {
  const { t } = useTranslation("administration");
  const formatDate = lire("display.dateFormat", "JJ/MM/AAAA");
  const formatHeure = lire("display.timeFormat", "24h");
  const region = lire("display.locale", "fr-FR");
  const premierJour = lire("display.firstDayOfWeek", "1");

  return (
    <div className="two-col">
      <div>
        <section className="panel panel-espace">
          <div className="panel-head">
            <span className="panel-title">{t("parametres.formatDate")}</span>
          </div>
          <div className="panel-body">
            <div className="opt-list" role="radiogroup" aria-label={t("parametres.formatDate")}>
              {FORMATS_DATE.map((f) => (
                <Button
                  key={f.cle}
                  className="opt"
                  aria-pressed={formatDate === f.cle}
                  onPress={() => ecrire("display.dateFormat", f.cle)}
                >
                  <span className="opt-mark" aria-hidden="true" />
                  <span className="opt-n">{f.cle}</span>
                  {/* L'exemple est ce qu'on lit ; le code ne dit rien. */}
                  <span className="opt-ex">{f.exemple}</span>
                </Button>
              ))}
            </div>
          </div>
        </section>

        <section className="panel panel-espace">
          <div className="panel-head">
            <span className="panel-title">{t("parametres.formatHeure")}</span>
          </div>
          <div className="panel-body">
            <div className="opt-list" role="radiogroup" aria-label={t("parametres.formatHeure")}>
              {FORMATS_HEURE.map((f) => (
                <Button
                  key={f.cle}
                  className="opt"
                  aria-pressed={formatHeure === f.cle}
                  onPress={() => ecrire("display.timeFormat", f.cle)}
                >
                  <span className="opt-mark" aria-hidden="true" />
                  <span className="opt-n">{t(`parametres.heure_${f.cle}`)}</span>
                  <span className="opt-ex">{f.exemple}</span>
                </Button>
              ))}
            </div>
          </div>
        </section>
      </div>

      <div>
        <section className="panel panel-espace">
          <div className="panel-head">
            <span className="panel-title">{t("parametres.langueEtRegion")}</span>
          </div>
          <div className="panel-body">
            <div className="opt-list" role="radiogroup" aria-label={t("parametres.langueEtRegion")}>
              {REGIONS.map((r) => (
                <Button
                  key={r.cle}
                  className="opt"
                  aria-pressed={region === r.cle}
                  onPress={() => ecrire("display.locale", r.cle)}
                >
                  <span className="opt-mark" aria-hidden="true" />
                  <span className="opt-n">{t(`parametres.region_${r.cle}`)}</span>
                  <span className="opt-ex">{r.exemple}</span>
                </Button>
              ))}
            </div>
            <p className="field-hint">{t("parametres.langueEtRegionAide")}</p>
          </div>
        </section>

        <section className="panel panel-espace">
          <div className="panel-head">
            <span className="panel-title">{t("parametres.premierJour")}</span>
          </div>
          <div className="panel-body">
            <div className="opt-list" role="radiogroup" aria-label={t("parametres.premierJour")}>
              {[1, 0].map((j) => (
                <Button
                  key={j}
                  className="opt"
                  aria-pressed={premierJour === String(j)}
                  onPress={() => ecrire("display.firstDayOfWeek", String(j))}
                >
                  <span className="opt-mark" aria-hidden="true" />
                  <span className="opt-n">{t(`jours.long.${j}`)}</span>
                  <span className="opt-ex">{t(`parametres.ordreSemaine_${j}`)}</span>
                </Button>
              ))}
            </div>
          </div>
        </section>

        {/* L'exemple en direct porte sur des cas réels du produit, pas sur une
            date abstraite : c'est ce qui permet de vérifier qu'un réglage
            **s'applique**, et pas seulement qu'il s'enregistre. */}
        <Apercu
          formatDate={formatDate}
          formatHeure={formatHeure}
          region={region}
          premierJour={premierJour}
        />
      </div>

    </div>
  );
}

/** `RG-PRM-01` — au moins un jour doit rester visible. */
function Planning({ lire, ecrire }: Acces) {
  const { t } = useTranslation("administration");
  const visibles = new Set(lire("planning.visibleDays", "1,2,3,4,5").split(","));

  const basculer = (jour: string) => {
    const suivant = new Set(visibles);
    if (suivant.has(jour)) suivant.delete(jour);
    else suivant.add(jour);
    // Un planning sans aucun jour n'affiche rien : la règle est appliquée ici
    // et rappelée par l'aide, plutôt que découverte devant une grille vide.
    if (suivant.size === 0) return;
    ecrire("planning.visibleDays", [...suivant].sort().join(","));
  };

  return (
    <section className="panel">
      <div className="panel-head">
        <span className="panel-title">{t("parametres.joursVisibles")}</span>
      </div>
      <div className="panel-body">
        <p className="field-hint">{t("parametres.joursVisiblesAide")}</p>
        <div className="days-row" role="group" aria-label={t("parametres.joursVisibles")}>
          {JOURS.map((j) => {
            const cle = String(j);
            const actif = visibles.has(cle);
            const dernier = actif && visibles.size === 1;
            return (
              <Button
                key={j}
                className="day-opt"
                aria-pressed={actif}
                isDisabled={dernier}
                onPress={() => basculer(cle)}
              >
                <span className="day-n">{t(`jours.${["dim", "lun", "mar", "mer", "jeu", "ven", "sam"][j]}`)}</span>
                <span className="day-s">{actif ? t("parametres.visible") : t("parametres.masque")}</span>
              </Button>
            );
          })}
        </div>
        <p className="field-hint">{t("parametres.auMoinsUnJour")}</p>
      </div>
    </section>
  );
}

/**
 * `RG-PRM-02` — un férié **ouvré** compte comme travaillé.
 *
 * Le brief le nomme « un paramètre à effet de bord lointain » : la ligne est
 * teintée, la bascule porte son libellé, et l'aide dit ce qu'elle change dans
 * le décompte des congés. Découvrir la conséquence sur un solde faux serait
 * l'apprentissage le plus cher possible.
 */
function Feries() {
  const { t } = useTranslation("administration");
  const { t: tErreurs } = useTranslation("erreurs");
  const peut = usePeut();
  const annoncer = useMessages();
  const client = useQueryClient();
  const [annee, setAnnee] = useState(new Date().getUTCFullYear());
  const [ajoutOuvert, setAjoutOuvert] = useState(false);

  const requete = useQuery({
    queryKey: ["parametrage", "feries", annee],
    queryFn: () => api.joursFeries(annee),
  });

  const importation = useMutation({
    mutationFn: () => api.importerFeries(annee),
    onSuccess: (r) => {
      annoncer("ok", t("parametres.importTermine", { crees: r.crees, existants: r.existants }));
      void client.invalidateQueries({ queryKey: ["parametrage", "feries"] });
    },
    onError: (e) => annoncer("err", messageErreur(e, tErreurs, t("parametres.echecAction"))),
  });

  if (requete.isPending) return <Chargement quoi={t("parametres.lesFeries")} />;
  if (requete.isError)
    return <ErreurDeChargement erreur={requete.error} surReessai={() => void requete.refetch()} />;

  const { feries, statistiques } = requete.data;

  return (
    <>
      <div className="filters">
        <input
          className="f-input"
          type="number"
          min={1970}
          max={2200}
          value={annee}
          onChange={(e) => setAnnee(Number(e.target.value))}
          aria-label={t("parametres.annee")}
        />
        {peut("holidays:import") ? (
          <Button
            className="chip-btn"
            isPending={importation.isPending}
            onPress={() => importation.mutate()}
          >
            {t("parametres.importerFeries", { annee: String(annee) })}
          </Button>
        ) : null}
        {/* `M19 § Jours fériés` — « Créer […] un jour ». L'import ne connaît
            que le calendrier national ; la fermeture propre à la collectivité
            n'entre que par ici. */}
        {peut("holidays:create") ? (
          <Button className="btn btn-primary" onPress={() => setAjoutOuvert(true)}>
            {t("parametres.ajouterJour")}
          </Button>
        ) : null}
      </div>

      <div className="set-stats">
        <div className="kpi">
          <span className="eyebrow">{t("parametres.totalFeries")}</span>
          <p className="kpi-val">{statistiques.total}</p>
        </div>
        <div className="kpi">
          <span className="eyebrow">{t("parametres.joursChomes")}</span>
          <p className="kpi-val">{statistiques.chomes}</p>
        </div>
        <div className={`kpi${statistiques.ouvres > 0 ? " is-alert" : ""}`}>
          <span className="eyebrow">{t("parametres.joursOuvres")}</span>
          <p className="kpi-val">{statistiques.ouvres}</p>
          <span className="kpi-sub">{t("parametres.joursOuvresAide")}</span>
        </div>
        <div className="kpi">
          <span className="eyebrow">{t("parametres.feriesLegaux")}</span>
          <p className="kpi-val">{statistiques.legaux}</p>
        </div>
      </div>

      {feries.length === 0 ? (
        <div className="empty empty-large">
          <p>{t("parametres.aucunFerie", { annee: String(annee) })}</p>
          <small>{t("parametres.aucunFerieAide")}</small>
        </div>
      ) : (
        <div className="tlist">
          <div className="hol-grid set-head" aria-hidden="true">
            <span>{t("parametres.colDate")}</span>
            <span>{t("parametres.colLibelle")}</span>
            <span>{t("parametres.colType")}</span>
            <span>{t("parametres.colJourOuvre")}</span>
            <span>{t("parametres.colRecurrent")}</span>
            <span>{t("parametres.colActions")}</span>
          </div>
          {feries.map((f) => (
            <div className={`hol-grid set-row${f.ouvre ? " is-work" : ""}`} key={f.id}>
              <span className="lv-when">{formaterDate(f.date)}</span>
              <span className="lnk-n">{f.libelle}</span>
              <span className="us-org">{t(`parametres.typeFerie_${f.type}`, f.type)}</span>
              <span className="toggle-wrap">
                <span className="toggle" aria-hidden="true" data-etat={f.ouvre} />
                <span className="toggle-lab">
                  {f.ouvre ? t("parametres.compteTravaille") : t("parametres.chome")}
                </span>
              </span>
              <span className="us-org">
                {f.recurrent ? t("parametres.recurrent") : t("parametres.ponctuel")}
              </span>
              <span />
            </div>
          ))}
        </div>
      )}

      <FenetreFerie
        annee={annee}
        ouverte={ajoutOuvert}
        surFermeture={() => setAjoutOuvert(false)}
      />
    </>
  );
}

/**
 * Déclarer un jour férié — `M19 § Jours fériés`, `RG-PRM-01`, `RG-PRM-02`.
 *
 * **Ce formulaire n'enregistre pas un libellé : il change ce qu'est un jour
 * ouvré.** Le brief nomme `ouvre` « un paramètre à effet de bord lointain ».
 * La conséquence est donc dite *au moment du geste*, et l'enregistrement
 * invalide aussi le planning — dont la trame de fond vient du même calendrier.
 * Sans cette seconde invalidation, la grille garderait pendant trente secondes
 * un jour ouvré que le décompte des congés considère déjà comme chômé : deux
 * lectures de la même donnée qui se contredisent, le piège maison.
 */
function FenetreFerie({
  annee,
  ouverte,
  surFermeture,
}: {
  annee: number;
  ouverte: boolean;
  surFermeture: () => void;
}) {
  const { t } = useTranslation("administration");
  const { t: tErreurs } = useTranslation("erreurs");
  const annoncer = useMessages();
  const client = useQueryClient();
  const [date, setDate] = useState("");
  const [libelle, setLibelle] = useState("");
  const [type, setType] = useState<string>("local");
  const [ouvre, setOuvre] = useState(false);
  const [recurrent, setRecurrent] = useState(true);
  const [touche, setTouche] = useState(false);

  const declaration = useMutation({
    mutationFn: () => api.declarerFerie({ date, libelle: libelle.trim(), type, ouvre, recurrent }),
    onSuccess: () => {
      annoncer("ok", t("parametres.ferieAjoute", { libelle: libelle.trim() }));
      // La liste ET ses compteurs se relisent : « total », « chômés » et
      // « ouvrés » sont l'effet visible ici, et un compteur resté juste à côté
      // d'une ligne neuve est le symptôme même du réglage qui s'enregistre
      // sans s'appliquer.
      void client.invalidateQueries({ queryKey: ["parametrage"] });
      /*
       * Le calendrier décide aussi de la trame de fond du planning : le jour
       * déclaré doit s'y voir. Mais la barre latérale navigue aujourd'hui par
       * des `<a href>` — chaque changement de vue recharge la page et vide le
       * cache —, donc cette ligne n'a **pas d'effet observable** et aucun
       * contrôle ne peut la tenir. Elle reste parce qu'elle décrit la
       * dépendance réelle : le jour où la navigation deviendra interne, son
       * absence rendrait le planning faux sans que rien ne le dise.
       */
      void client.invalidateQueries({ queryKey: ["planning"] });
      setDate("");
      setLibelle("");
      setType("local");
      setOuvre(false);
      setRecurrent(true);
      setTouche(false);
      surFermeture();
    },
    onError: (e) => annoncer("err", messageErreur(e, tErreurs, t("parametres.echecAction"))),
  });

  const dateManquante = date === "";
  const libelleManquant = libelle.trim().length === 0;
  const invalide = dateManquante || libelleManquant;

  return (
    <Fenetre
      ouverte={ouverte}
      surFermeture={surFermeture}
      categorie={t("parametres.calendrier")}
      titre={t("parametres.ajouterJourFerie")}
      mention={t("champObligatoire")}
      actions={
        <>
          <Button className="btn btn-secondary" onPress={surFermeture}>
            {t("annuler")}
          </Button>
          <Button
            className="btn btn-primary"
            isPending={declaration.isPending}
            onPress={() => {
              setTouche(true);
              if (!invalide) declaration.mutate();
            }}
          >
            {t("parametres.ajouter")}
          </Button>
        </>
      }
    >
      <div className="form-grid">
        <div className="field-block">
          <label className="field-label" htmlFor="h-date">
            {t("parametres.colDate")} <span className="req">*</span>
          </label>
          <input
            className="field"
            id="h-date"
            type="date"
            value={date}
            aria-invalid={touche && dateManquante}
            onChange={(e) => setDate(e.target.value)}
          />
          <p className={touche && dateManquante ? "field-error" : "field-error is-quiet"}>
            <span aria-hidden="true">↑</span>
            <span>{t("parametres.dateObligatoire")}</span>
          </p>
        </div>

        <div className="field-block">
          <label className="field-label" htmlFor="h-nom">
            {t("parametres.colLibelle")} <span className="req">*</span>
          </label>
          <input
            className="field"
            id="h-nom"
            type="text"
            value={libelle}
            placeholder={t("parametres.libelleExemple")}
            aria-invalid={touche && libelleManquant}
            onChange={(e) => setLibelle(e.target.value)}
          />
          <p className={touche && libelleManquant ? "field-error" : "field-error is-quiet"}>
            <span aria-hidden="true">↑</span>
            <span>{t("parametres.libelleObligatoire")}</span>
          </p>
        </div>

        <div className="field-block span2">
          <label className="field-label" htmlFor="h-type">
            {t("parametres.colType")}
          </label>
          <select
            className="field"
            id="h-type"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            {TYPES_FERIE.map((code) => (
              <option key={code} value={code}>
                {t(`parametres.typeFerie_${code}`)}
              </option>
            ))}
          </select>
          <p className="field-hint">{t("parametres.typeAide")}</p>
        </div>
      </div>

      <label className="check">
        <input type="checkbox" checked={ouvre} onChange={(e) => setOuvre(e.target.checked)} />
        <span>{t("parametres.colJourOuvre")}</span>
      </label>
      <p className="field-hint">{t("parametres.jourOuvreAide")}</p>

      {/* `RG-PRM-01` — l'effet de bord lointain, rendu concret AVANT le geste.
          Découvrir la conséquence sur un solde de congés faux serait
          l'apprentissage le plus cher possible. */}
      {ouvre ? (
        <div className="explain is-alert consequence">
          <span aria-hidden="true" className="explain-sigle">
            ⚠
          </span>
          <div>
            <p className="explain-t">{t("parametres.consequenceTitre")}</p>
            <p className="explain-d">{t("parametres.consequenceTexte")}</p>
          </div>
        </div>
      ) : null}

      <label className="check consequence">
        <input
          type="checkbox"
          checked={recurrent}
          onChange={(e) => setRecurrent(e.target.checked)}
        />
        <span>{t("parametres.recurrentLabel")}</span>
      </label>
      {/* `RG-PRM-02` — un récurrent est stocké une fois et vaut pour toutes les
          années : le dire ici évite de le redéclarer chaque janvier. */}
      <p className="field-hint">{t("parametres.recurrentAide", { annee: String(annee) })}</p>
    </Fenetre>
  );
}

function VacancesScolaires() {
  const { t } = useTranslation("administration");
  const peut = usePeut();
  const [ajoutOuvert, setAjoutOuvert] = useState(false);
  const requete = useQuery({
    queryKey: ["parametrage", "vacances"],
    queryFn: () => api.vacancesScolaires(),
  });

  if (requete.isPending) return <Chargement quoi={t("parametres.lesVacances")} />;
  if (requete.isError)
    return <ErreurDeChargement erreur={requete.error} surReessai={() => void requete.refetch()} />;

  const { vacances, statistiques } = requete.data;

  return (
    <>
      {/* `M19 § Vacances scolaires` — « Créer […] une période ». */}
      {peut("school_vacations:create") ? (
        <div className="filters">
          <span className="ligne-actions-fin">
            <Button className="btn btn-primary" onPress={() => setAjoutOuvert(true)}>
              {t("parametres.ajouterPeriode")}
            </Button>
          </span>
        </div>
      ) : null}

      <div className="set-stats">
        <div className="kpi">
          <span className="eyebrow">{t("parametres.totalVacances")}</span>
          <p className="kpi-val">{statistiques.total}</p>
        </div>
        <div className="kpi">
          <span className="eyebrow">{t("parametres.importees")}</span>
          <p className="kpi-val">{statistiques.importees}</p>
        </div>
        <div className="kpi">
          <span className="eyebrow">{t("parametres.manuelles")}</span>
          <p className="kpi-val">{statistiques.manuelles}</p>
        </div>
      </div>

      {vacances.length === 0 ? (
        <div className="empty empty-large">
          <p>{t("parametres.aucuneVacance")}</p>
          <small>{t("parametres.aucuneVacanceAide")}</small>
        </div>
      ) : (
        <div className="tlist">
          <div className="vac-grid set-head" aria-hidden="true">
            <span>{t("parametres.colPeriode")}</span>
            <span>{t("parametres.colDebut")}</span>
            <span>{t("parametres.colFin")}</span>
            <span>{t("parametres.colSource")}</span>
            <span>{t("parametres.colActions")}</span>
          </div>
          {vacances.map((v) => (
            <div className="vac-grid set-row" key={v.id}>
              <span className="bloc-etroit">
                <span className="lnk-n">{v.libelle}</span>
                <span className="us-svc">
                  {t("parametres.zoneEtAnnee", { zone: v.zone, annee: v.anneeScolaire })}
                </span>
              </span>
              <span className="lv-when">{formaterDate(v.dateDebut)}</span>
              <span className="lv-when">{formaterDate(v.dateFin)}</span>
              <span className="us-org">
                {/* La source dit si la donnée est rejouable par un import ou
                    saisie à la main : les deux ne se corrigent pas pareil. */}
                {v.importee ? t("parametres.sourceImport") : t("parametres.sourceManuelle")}
              </span>
              <span />
            </div>
          ))}
        </div>
      )}

      <FenetreVacances ouverte={ajoutOuvert} surFermeture={() => setAjoutOuvert(false)} />
    </>
  );
}

/**
 * Déclarer une période de vacances scolaires — `M19`, `RG-PRM-04`.
 *
 * `RG-PRM-04` — « les dates sont cohérentes : fin postérieure au début ». Le
 * serveur refuse `dates_incoherentes` ; le client le dit **avant** d'envoyer,
 * pour que la correction se fasse là où la saisie a lieu. Ce n'est pas le
 * contrôle : c'est la courtoisie qui l'entoure.
 *
 * `zone` est absente de la maquette 31 alors que le serveur l'exige et que la
 * liste l'affiche. Elle est portée ici plutôt que devinée : une période rangée
 * sous une zone arbitraire fausserait la trame de fond du planning, qui filtre
 * par zone. À trancher au cadrage — voir le compte rendu de tâche.
 */
function FenetreVacances({
  ouverte,
  surFermeture,
}: {
  ouverte: boolean;
  surFermeture: () => void;
}) {
  const { t } = useTranslation("administration");
  const { t: tErreurs } = useTranslation("erreurs");
  const annoncer = useMessages();
  const client = useQueryClient();
  const [libelle, setLibelle] = useState("");
  const [debut, setDebut] = useState("");
  const [fin, setFin] = useState("");
  const [zone, setZone] = useState("");
  const [anneeScolaire, setAnneeScolaire] = useState("");
  const [touche, setTouche] = useState(false);

  const declaration = useMutation({
    mutationFn: () =>
      api.declarerVacances({
        libelle: libelle.trim(),
        dateDebut: debut,
        dateFin: fin,
        zone: zone.trim(),
        anneeScolaire: anneeScolaire.trim(),
      }),
    onSuccess: () => {
      annoncer("ok", t("parametres.vacancesAjoutees", { libelle: libelle.trim() }));
      void client.invalidateQueries({ queryKey: ["parametrage"] });
      // Les vacances scolaires font partie de la même trame de fond, et la
      // même réserve vaut : voir la fenêtre de jour férié, plus haut.
      void client.invalidateQueries({ queryKey: ["planning"] });
      setLibelle("");
      setDebut("");
      setFin("");
      setZone("");
      setAnneeScolaire("");
      setTouche(false);
      surFermeture();
    },
    onError: (e) => annoncer("err", messageErreur(e, tErreurs, t("parametres.echecAction"))),
  });

  const champsManquants =
    libelle.trim() === "" ||
    debut === "" ||
    fin === "" ||
    zone.trim() === "" ||
    anneeScolaire.trim() === "";
  /** `RG-PRM-04` — la fin ne précède jamais le début. */
  const datesIncoherentes = debut !== "" && fin !== "" && fin < debut;
  const invalide = champsManquants || datesIncoherentes;

  return (
    <Fenetre
      ouverte={ouverte}
      surFermeture={surFermeture}
      categorie={t("parametres.calendrier")}
      titre={t("parametres.ajouterPeriodeVacances")}
      mention={t("parametres.sourceSaisieManuelle")}
      actions={
        <>
          <Button className="btn btn-secondary" onPress={surFermeture}>
            {t("annuler")}
          </Button>
          <Button
            className="btn btn-primary"
            isPending={declaration.isPending}
            onPress={() => {
              setTouche(true);
              if (!invalide) declaration.mutate();
            }}
          >
            {t("parametres.ajouter")}
          </Button>
        </>
      }
    >
      {datesIncoherentes ? (
        <div className="alert alert-error" role="alert">
          <span className="alert-icon" aria-hidden="true">
            !
          </span>
          <span className="alert-corps">{t("parametres.datesIncoherentes")}</span>
        </div>
      ) : null}

      <div className="field-block">
        <label className="field-label" htmlFor="v-nom">
          {t("parametres.colLibelle")} <span className="req">*</span>
        </label>
        <input
          className="field"
          id="v-nom"
          type="text"
          value={libelle}
          placeholder={t("parametres.periodeExemple")}
          aria-invalid={touche && libelle.trim() === ""}
          onChange={(e) => setLibelle(e.target.value)}
        />
      </div>

      <div className="form-grid">
        <div className="field-block">
          <label className="field-label" htmlFor="v-debut">
            {t("parametres.colDebut")} <span className="req">*</span>
          </label>
          <input
            className="field"
            id="v-debut"
            type="date"
            value={debut}
            aria-invalid={touche && debut === ""}
            onChange={(e) => setDebut(e.target.value)}
          />
        </div>
        <div className="field-block">
          <label className="field-label" htmlFor="v-fin">
            {t("parametres.colFin")} <span className="req">*</span>
          </label>
          <input
            className="field"
            id="v-fin"
            type="date"
            value={fin}
            aria-invalid={(touche && fin === "") || datesIncoherentes}
            onChange={(e) => setFin(e.target.value)}
          />
        </div>
        <div className="field-block">
          <label className="field-label" htmlFor="v-zone">
            {t("parametres.champZone")} <span className="req">*</span>
          </label>
          <input
            className="field"
            id="v-zone"
            type="text"
            value={zone}
            placeholder="B"
            aria-invalid={touche && zone.trim() === ""}
            onChange={(e) => setZone(e.target.value)}
          />
          <p className="field-hint">{t("parametres.zoneAide")}</p>
        </div>
        <div className="field-block">
          <label className="field-label" htmlFor="v-annee">
            {t("parametres.champAnneeScolaire")} <span className="req">*</span>
          </label>
          <input
            className="field"
            id="v-annee"
            type="text"
            value={anneeScolaire}
            placeholder="2026-2027"
            aria-invalid={touche && anneeScolaire.trim() === ""}
            onChange={(e) => setAnneeScolaire(e.target.value)}
          />
        </div>
      </div>

      <p className={touche && champsManquants ? "field-error" : "field-error is-quiet"}>
        <span aria-hidden="true">↑</span>
        <span>{t("parametres.champsRequis")}</span>
      </p>
    </Fenetre>
  );
}
