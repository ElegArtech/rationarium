import {
  TextField,
  Label,
  Input,
  FieldError,
  Button,
  type TextFieldProps,
} from "react-aria-components";
import { useId, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

/**
 * Champs de formulaire — React Aria Components, `ADR-0003`.
 *
 * On achète le comportement et l'accessibilité, on apporte le style.
 *
 * **Le vocabulaire de classes est celui des maquettes, pas un vocabulaire
 * parallèle.** `.field-block`, `.field-label`, `.field-head`, `.field-wrap`,
 * `.pw-toggle`, `.policy` : ces noms viennent de `mockups/01` à `05`, et le
 * socle les définit déjà. Les versions précédentes de ce fichier employaient
 * `.label`, `.field-avec-action`, `.politique` — des noms inventés, que rien
 * ne stylait. Le rendu était donc celui d'un formulaire nu, et **aucune boucle
 * ne pouvait le voir** : un attribut `class` sans règle en face ne produit ni
 * erreur, ni avertissement, ni test rouge.
 *
 * **La place du message d'erreur est réservée en permanence** (`reserve`).
 * C'est la règle des maquettes 02 à 05 : `.field-error.is-quiet` est
 * `visibility:hidden`, donc invisible mais encombrante. Sans elle, l'apparition
 * d'un message pousse tout le formulaire vers le bas et l'utilisateur perd le
 * champ qu'il regardait. Un emplacement muet n'est pas un blanc perdu : c'est
 * ce qui empêche la page de sauter.
 */

type ChampProps = TextFieldProps & {
  libelle: string;
  erreur?: string | undefined;
  placeholder?: string | undefined;
  autoComplete?: string | undefined;
  /** Rendu à droite du libellé, sur la ligne d'en-tête — vue 01. */
  action?: ReactNode;
  aide?: string | undefined;
  /** Réserve la hauteur du message d'erreur même muet — vues 02 à 05. */
  reserve?: boolean;
  /**
   * Identifiant posé sur la zone de saisie.
   *
   * Il sert à y **ramener le curseur** quand la politique de mot de passe n'est
   * pas tenue : ce cas-là n'a pas de message — les quatre critères sont déjà
   * énoncés sous le champ —, donc le seul geste possible est de désigner le
   * champ. Un sélecteur d'attribut ferait le même travail et casserait le jour
   * où deux champs partagent la même valeur d'`autocomplete`.
   */
  idChamp?: string;
  /** Le message tient sur deux lignes : `.is-tall`, maquette 02, champ email. */
  reserveHaute?: boolean;
};

/**
 * L'emplacement du message, muet ou parlant.
 *
 * Muet, il est `aria-hidden` : il n'a rien à annoncer, et une assistance
 * technique n'a pas à traverser un gabarit vide. Parlant, c'est le
 * `FieldError` de React Aria, qui porte le lien `aria-describedby` avec le
 * champ et l'annonce au bon moment.
 */
function Message({
  erreur,
  reserve,
  haute,
}: {
  erreur?: string | undefined;
  reserve?: boolean | undefined;
  haute?: boolean | undefined;
}) {
  const classes = `field-error${haute ? " is-tall" : ""}`;
  if (erreur) {
    return (
      <FieldError className={classes}>
        <span aria-hidden="true">↑</span>
        <span>{erreur}</span>
      </FieldError>
    );
  }
  if (!reserve) return null;
  return (
    <p className={`${classes} is-quiet`} aria-hidden="true">
      <span>↑</span>
      <span />
    </p>
  );
}

function EnTete({ libelle, action }: { libelle: string; action?: ReactNode }) {
  if (!action) return <Label className="field-label">{libelle}</Label>;
  return (
    <div className="field-head">
      <Label className="field-label">{libelle}</Label>
      {action}
    </div>
  );
}

export function Champ({
  libelle,
  erreur,
  placeholder,
  autoComplete,
  action,
  aide,
  reserve,
  reserveHaute,
  idChamp,
  ...props
}: ChampProps) {
  return (
    <TextField {...props} isInvalid={Boolean(erreur)} className="field-block">
      <EnTete libelle={libelle} action={action} />
      <Input
        className="field"
        {...(idChamp ? { id: idChamp } : {})}
        {...(placeholder ? { placeholder } : {})}
        {...(autoComplete ? { autoComplete } : {})}
      />
      {aide ? <p className="field-hint">{aide}</p> : null}
      <Message erreur={erreur} reserve={reserve} haute={reserveHaute} />
    </TextField>
  );
}

/**
 * Champ de mot de passe, avec bascule d'affichage — vue 01.
 *
 * La bascule porte **un mot**, pas une icône : « AFFICHER » / « MASQUER ». Une
 * assistance technique doit pouvoir annoncer l'action, et un œil doit pouvoir
 * la lire sans l'interpréter. C'est ce que fait la maquette ; l'émoji qui la
 * remplaçait ne s'annonce pas.
 *
 * `politique` place l'indicateur de politique **dans** le bloc de champ, comme
 * les maquettes 02, 04 et 05, et le déclare en `aria-describedby` du champ :
 * la liste des critères décrit le mot de passe attendu, elle ne flotte pas à
 * côté.
 */
export function ChampMotDePasse({
  libelle,
  erreur,
  autoComplete,
  action,
  aide,
  reserve,
  idChamp,
  politique = false,
  ...props
}: ChampProps & { politique?: boolean }) {
  const { t } = useTranslation("auth");
  const [visible, setVisible] = useState(false);
  const idPolitique = useId();

  return (
    <TextField
      {...props}
      type={visible ? "text" : "password"}
      isInvalid={Boolean(erreur)}
      className="field-block"
    >
      <EnTete libelle={libelle} action={action} />
      <div className="field-wrap">
        <Input
          className="field"
          {...(idChamp ? { id: idChamp } : {})}
          {...(autoComplete ? { autoComplete } : {})}
          {...(politique ? { "aria-describedby": idPolitique } : {})}
        />
        <Button type="button" className="pw-toggle" onPress={() => setVisible((v) => !v)}>
          {visible ? t("connexion.masquer") : t("connexion.afficher")}
        </Button>
      </div>
      {aide ? <p className="field-hint">{aide}</p> : null}
      {politique ? (
        <PolitiqueMotDePasse id={idPolitique} valeur={String(props.value ?? "")} />
      ) : null}
      <Message erreur={erreur} reserve={reserve} />
    </TextField>
  );
}

/**
 * Indicateur de politique de mot de passe — vues 02, 04, 05.
 *
 * `cadrage/02` exige que **chaque critère soit validé au fil de la frappe**.
 * D'où quatre lignes distinctes plutôt qu'un message global : l'utilisateur
 * doit voir lequel manque, pas qu'il en manque un.
 *
 * Le bloc est **toujours visible**, jamais surgissant : la maquette le dit en
 * toutes lettres. Un critère non tenu porte le point médian, un critère tenu
 * la coche — deux marques distinctes, pas une marque et un vide, parce qu'un
 * vide ne se lit pas comme un « non ».
 *
 * `aria-live="polite"` : les changements sont annoncés sans interrompre la
 * saisie.
 */
export function PolitiqueMotDePasse({ valeur, id }: { valeur: string; id?: string }) {
  const { t } = useTranslation("auth");

  const criteres = [
    { cle: "longueur", tenu: valeur.length >= 8 },
    { cle: "majuscule", tenu: /[A-ZÀ-Þ]/.test(valeur) },
    { cle: "chiffre", tenu: /\d/.test(valeur) },
    { cle: "special", tenu: /[^\p{L}\p{N}]/u.test(valeur) },
  ] as const;

  return (
    <div className="policy" aria-live="polite" {...(id ? { id } : {})}>
      {criteres.map((c) => (
        <span key={c.cle} className={`policy-item${c.tenu ? " is-met" : ""}`}>
          <span className="policy-mark" aria-hidden="true">
            {c.tenu ? "✓" : "·"}
          </span>
          <span>{t(`politique.${c.cle}`)}</span>
        </span>
      ))}
    </div>
  );
}

/** Les quatre critères de `politiqueMotDePasse` (`@rationarium/contracts`), côté client. */
export const politiqueTenue = (valeur: string): boolean =>
  valeur.length >= 8 &&
  /[A-ZÀ-Þ]/.test(valeur) &&
  /\d/.test(valeur) &&
  /[^\p{L}\p{N}]/u.test(valeur);
