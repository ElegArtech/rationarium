import {
  TextField,
  Label,
  Input,
  FieldError,
  Button,
  type TextFieldProps,
} from "react-aria-components";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * Champs de formulaire — React Aria Components, ADR-0003.
 *
 * On achète le comportement et l'accessibilité, on apporte le style. Le
 * libellé, l'association champ↔erreur et l'annonce vocale sont fournis ; les
 * classes viennent du socle graphique.
 */

type ChampProps = TextFieldProps & {
  libelle: string;
  erreur?: string | undefined;
  placeholder?: string | undefined;
  autoComplete?: string | undefined;
};

export function Champ({ libelle, erreur, placeholder, autoComplete, ...props }: ChampProps) {
  return (
    <TextField {...props} isInvalid={Boolean(erreur)} className="field-wrap">
      <Label className="label">{libelle}</Label>
      <Input
        className="field"
        {...(placeholder ? { placeholder } : {})}
        {...(autoComplete ? { autoComplete } : {})}
      />
      {erreur ? <FieldError className="field-error">{erreur}</FieldError> : null}
    </TextField>
  );
}

/**
 * Champ de mot de passe, avec bascule d'affichage — vue 01.
 *
 * La bascule change **le libellé du bouton**, pas seulement son icône : une
 * assistance technique doit pouvoir annoncer l'action, pas la deviner.
 */
export function ChampMotDePasse({ libelle, erreur, autoComplete, ...props }: ChampProps) {
  const { t } = useTranslation("auth");
  const [visible, setVisible] = useState(false);

  return (
    <TextField
      {...props}
      type={visible ? "text" : "password"}
      isInvalid={Boolean(erreur)}
      className="field-wrap"
    >
      <Label className="label">{libelle}</Label>
      <div className="field-avec-action">
        <Input className="field" {...(autoComplete ? { autoComplete } : {})} />
        <Button
          type="button"
          className="chip-btn"
          onPress={() => setVisible((v) => !v)}
          aria-label={visible ? t("connexion.masquerMotDePasse") : t("connexion.afficherMotDePasse")}
        >
          {visible ? "🙈" : "👁"}
        </Button>
      </div>
      {erreur ? <FieldError className="field-error">{erreur}</FieldError> : null}
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
    <div className="politique" aria-labelledby={id}>
      <p id={id} className="politique-titre">
        {t("politique.titre")}
      </p>
      <ul className="politique-liste" aria-live="polite">
        {criteres.map((c) => (
          <li key={c.cle} className={c.tenu ? "critere-tenu" : "critere-manquant"}>
            <span aria-hidden="true">{c.tenu ? "✓" : "○"}</span> {t(`politique.${c.cle}`)}
          </li>
        ))}
      </ul>
    </div>
  );
}
