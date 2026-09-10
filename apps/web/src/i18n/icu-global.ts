import ICU from "i18next-icu";
import { IntlMessageFormat, type PrimitiveType } from "intl-messageformat";
import { localeNombre } from "../formats.js";

/** D-RM06 : nombres globaux, règles de pluriel de la langue du message. */
export class ICUGlobal extends ICU {
  private messages = new Map<string, IntlMessageFormat>();

  parse(texte: string, valeurs: Record<string, unknown>, langue: string): string {
    const locale = localeNombre();
    const cle = `${langue}\0${locale}\0${texte}`;
    try {
      let message = this.messages.get(cle);
      if (!message) {
        message = new IntlMessageFormat(texte, langue, undefined, {
          ignoreTag: true,
          formatters: {
            getNumberFormat: (_langue, options) => new Intl.NumberFormat(locale, options),
            getDateTimeFormat: (lng, options) => new Intl.DateTimeFormat(lng, options),
            getPluralRules: (lng, options) => new Intl.PluralRules(lng, options),
          },
        });
        this.messages.set(cle, message);
      }
      const rendu = message.format(valeurs as Record<string, PrimitiveType>);
      return Array.isArray(rendu) ? rendu.join("") : String(rendu ?? "");
    } catch {
      return texte;
    }
  }
}
