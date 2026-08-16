import { useTranslation } from "react-i18next";
import {
  STATUTS_PROJET,
  STATUTS_TACHE,
  STATUTS_JALON,
  PRIORITES,
  type Terme,
} from "@trame/contracts";
import "./partages.css";

/**
 * Pastilles de vocabulaire, barre de progression, avatar, marqueur de calcul.
 *
 * **Le libellé vient du vocabulaire, jamais d'une table locale.** Les
 * vocabulaires de `cadrage/01 § 4.1` portent déjà `fr` et `en` ; les recopier
 * dans un catalogue i18n créerait une seconde source de vérité, et la première
 * divergence passerait inaperçue.
 *
 * **La couleur d'un statut est portée par un jeton, pas choisie ici.** La carte
 * ci-dessous fait le lien entre un code de vocabulaire et son jeton — c'est
 * une correspondance, pas une décision graphique.
 */

const JETON: Record<string, string> = {
  // Statuts de tâche et de jalon — cadrage/01 § 4.1
  todo: "var(--st-todo)",
  doing: "var(--st-doing)",
  review: "var(--st-review)",
  done: "var(--st-done)",
  blocked: "var(--st-blocked)",
  pending: "var(--st-todo)",
  // Statuts de projet
  draft: "var(--st-todo)",
  active: "var(--st-doing)",
  paused: "var(--st-review)",
  cancelled: "var(--st-blocked)",
  // Priorités
  low: "var(--muted)",
  normal: "var(--st-doing)",
  high: "var(--st-review)",
  critical: "var(--st-blocked)",
  // Catégories de compétence — couleurs de la section 26 des maquettes.
  technical: "var(--st-doing)",
  methodology: "var(--activity)",
  soft_skill: "var(--event)",
  business: "var(--leave)",
};

/**
 * Le jeton d'un code de vocabulaire.
 *
 * Exposé parce que la matrice de compétences colore ses en-têtes de colonnes
 * par catégorie, comme la maquette : c'est une correspondance code → jeton,
 * pas une décision graphique prise sur place.
 */
export const jetonDe = (code: string): string => JETON[code] ?? "var(--muted)";

const TOUS: readonly Terme<string>[] = [
  ...STATUTS_PROJET,
  ...STATUTS_TACHE,
  ...STATUTS_JALON,
  ...PRIORITES,
];

/** Le libellé d'un code, dans la langue courante. */
export function useLibelle(): (code: string, vocabulaire?: readonly Terme<string>[]) => string {
  const { i18n } = useTranslation();
  const langue = i18n.language.startsWith("en") ? "en" : "fr";
  return (code, vocabulaire) =>
    (vocabulaire ?? TOUS).find((t) => t.code === code)?.[langue] ?? code;
}

/**
 * Une pastille de vocabulaire.
 *
 * `vocabulaire` est explicite quand le code est ambigu : `done` existe pour
 * une tâche comme pour un projet, avec deux libellés différents.
 */
export function Pastille({
  code,
  vocabulaire,
}: {
  code: string;
  vocabulaire?: readonly Terme<string>[];
}) {
  const libelle = useLibelle();
  return (
    <span className="pill" style={{ color: JETON[code] ?? "var(--muted)" }}>
      {libelle(code, vocabulaire)}
    </span>
  );
}

/**
 * Une barre de progression.
 *
 * Elle porte `role="progressbar"` et ses bornes : une barre purement
 * décorative laisserait un lecteur d'écran devant une valeur invisible. Le
 * pourcentage est également écrit en clair à côté, dans les vues qui en ont la
 * place — la couleur seule ne dit rien.
 */
export function Barre({
  valeur,
  libelle,
  termine = false,
  classe = "bar",
}: {
  valeur: number;
  libelle: string;
  termine?: boolean;
  classe?: string;
}) {
  const borne = Math.max(0, Math.min(100, Math.round(valeur)));
  return (
    <div
      className={classe}
      role="progressbar"
      aria-valuenow={borne}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={libelle}
    >
      <i style={{ width: `${borne}%`, ...(termine ? { background: "var(--st-done)" } : {}) }} />
    </div>
  );
}

/** Les initiales d'une personne, en pastille ronde. */
export function AvatarAgent({
  prenom,
  nom,
  classe = "agent-av",
}: {
  prenom: string;
  nom: string;
  classe?: string;
}) {
  const initiales = `${prenom[0] ?? ""}${nom[0] ?? ""}`.toUpperCase();
  // L'avatar double le nom écrit à côté : le répéter aux assistances
  // techniques ferait entendre le nom deux fois.
  return (
    <span className={classe} aria-hidden="true">
      {initiales}
    </span>
  );
}

/**
 * Le marqueur « Calculé ».
 *
 * `cadrage/02` insiste, vues 11 et 13 : la progression, le budget consommé et
 * le statut d'un jalon sont **calculés, jamais saisis**. C'est contre-intuitif,
 * donc dit à l'écran plutôt qu'en aide contextuelle. L'explication est portée
 * par `title` **et** par `aria-description` : une infobulle au survol n'existe
 * pas pour qui navigue au clavier.
 */
export function MarqueurCalcule({ explication }: { explication: string }) {
  const { t } = useTranslation("commun");
  return (
    <span className="calc-tag" title={explication} aria-description={explication}>
      {t("calcule")}
    </span>
  );
}
