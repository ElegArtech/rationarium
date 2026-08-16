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
 */

type ChampProps = TextFieldProps & {
  libelle: string;
  erreur?: string | undefined;
  placeholder?: string | undefined;
  autoComplete?: string | undefined;
  /** Rendu à droite du libellé, sur la ligne d'en-tête — vue 01. */
  action?: ReactNode;
  aide?: string | undefined;
};

export function Champ({
  libelle,
  erreur,
  placeholder,
  autoComplete,
  action,
  aide,
  ...props
}: ChampProps) {
  return (
    <TextField {...props} isInvalid={Boolean(erreur)} className="field-block">
      {action ? (
        <div className="field-head">
          <Label className="field-label">{libelle}</Label>
          {action}
        </div>
      ) : (
        <Label className="field-label">{libelle}</Label>
      )}
      <Input
        className="field"
        {...(placeholder ? { placeholder } : {})}
        {...(autoComplete ? { autoComplete } : {})}
      />
      {aide ? <p className="field-hint">{aide}</p> : null}
      {erreur ? (
        <FieldError className="field-error">
          <span aria-hidden="true">↑</span>
          <span>{erreur}</span>
        </FieldError>
      ) : null}
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
 */
export function ChampMotDePasse({
  libelle,
  erreur,
  autoComplete,
  action,
  ...props
}: ChampProps) {
  const { t } = useTranslation("auth");
  const [visible, setVisible] = useState(false);

  return (
    <TextField
      {...props}
      type={visible ? "text" : "password"}
      isInvalid={Boolean(erreur)}
      className="field-block"
    >
      {action ? (
        <div className="field-head">
          <Label className="field-label">{libelle}</Label>
          {action}
        </div>
      ) : (
        <Label className="field-label">{libelle}</Label>
      )}
      <div className="field-wrap">
        <Input className="field" {...(autoComplete ? { autoComplete } : {})} />
        <Button
          type="button"
          className="pw-toggle"
          onPress={() => setVisible((v) => !v)}
        >
          {visible ? t("connexion.masquer") : t("connexion.afficher")}
        </Button>
      </div>
      {erreur ? (
        <FieldError className="field-error">
          <span aria-hidden="true">↑</span>
          <span>{erreur}</span>
        </FieldError>
      ) : null}
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
 * `aria-live="polite"` : les changements sont annoncés sans interrompre la
 * saisie.
 */
export function PolitiqueMotDePasse({ valeur }: { valeur: string }) {
  const { t } = useTranslation("auth");
  const id = useId();

  const criteres = [
    { cle: "longueur", tenu: valeur.length >= 8 },
    { cle: "majuscule", tenu: /[A-ZÀ-Þ]/.test(valeur) },
    { cle: "chiffre", tenu: /\d/.test(valeur) },
    { cle: "special", tenu: /[^\p{L}\p{N}]/u.test(valeur) },
  ] as const;

  return (
    <>
      <p id={id} className="field-hint">
        {t("politique.titre")}
      </p>
      <div className="policy" aria-labelledby={id} aria-live="polite">
        {criteres.map((c) => (
          <span key={c.cle} className={`policy-item${c.tenu ? " is-met" : ""}`}>
            <span className="policy-mark" aria-hidden="true">
              {c.tenu ? "✓" : ""}
            </span>
            {t(`politique.${c.cle}`)}
          </span>
        ))}
      </div>
    </>
  );
}
