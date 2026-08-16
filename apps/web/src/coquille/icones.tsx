import { memo } from "react";

/**
 * La bibliothèque d'icônes d'interface — 23 symboles, reprise à l'identique des
 * maquettes (section « Bibliothèque d'icônes »).
 *
 * **Aucune dépendance.** `cadrage/03 § 4, D12` écarte les bibliothèques dont le
 * rendu n'est pas pilotable ; une police d'icônes en serait une, et elle
 * apporterait en plus une requête sortante que `C1` interdit. Les symboles sont
 * déclarés une fois dans le document et référencés par `<use href="#i-…">`.
 *
 * Le trait, la graisse et les jointures viennent de `.ico` dans le socle : un
 * symbole ne porte jamais sa couleur, il hérite de `currentColor`.
 */
export const BibliothequeIcones = memo(function BibliothequeIcones() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <symbol id="i-dash" viewBox="0 0 16 16">
        <rect x="2" y="2" width="5" height="5"/><rect x="9" y="2" width="5" height="5"/><rect x="2" y="9" width="5" height="5"/><rect x="9" y="9" width="5" height="5"/>
      </symbol>
      <symbol id="i-planning" viewBox="0 0 16 16">
        <rect x="2" y="3" width="12" height="11"/><path d="M2 6.5h12M6 6.5v7.5M10 6.5v7.5"/>
      </symbol>
      <symbol id="i-reports" viewBox="0 0 16 16">
        <path d="M3 13.5V8.5M8 13.5V3M13 13.5v-4"/><path d="M1.5 13.5h13"/>
      </symbol>
      <symbol id="i-projects" viewBox="0 0 16 16">
        <path d="M2 4h4l1.4 2H14v7.5H2z"/>
      </symbol>
      <symbol id="i-tasks" viewBox="0 0 16 16">
        <rect x="2" y="2.5" width="12" height="11.5" rx="1"/><path d="M5 8.6l2.1 2.1L11.3 6.4"/>
      </symbol>
      <symbol id="i-events" viewBox="0 0 16 16">
        <rect x="2" y="3" width="12" height="11"/><path d="M2 6.5h12M5 2v2.5M11 2v2.5"/><circle cx="8" cy="10" r="1.1"/>
      </symbol>
      <symbol id="i-leaves" viewBox="0 0 16 16">
        <path d="M8 13.5V7"/><path d="M2 7a6 6 0 0 1 12 0z"/>
      </symbol>
      <symbol id="i-telework" viewBox="0 0 16 16">
        <path d="M2 7.2l6-5 6 5"/><path d="M4 7v7h8V7"/>
      </symbol>
      <symbol id="i-time" viewBox="0 0 16 16">
        <circle cx="8" cy="8" r="6"/><path d="M8 4.6V8l2.4 1.5"/>
      </symbol>
      <symbol id="i-skills" viewBox="0 0 16 16">
        <path d="M8 2.2l1.7 3.7 4 .5-3 2.8.8 4-3.5-2-3.5 2 .8-4-3-2.8 4-.5z"/>
      </symbol>
      <symbol id="i-users" viewBox="0 0 16 16">
        <circle cx="8" cy="5.4" r="2.7"/><path d="M2.8 13.8a5.2 5.2 0 0 1 10.4 0"/>
      </symbol>
      <symbol id="i-depts" viewBox="0 0 16 16">
        <rect x="6" y="1.6" width="4" height="3.4"/><rect x="1.6" y="10.8" width="4" height="3.4"/><rect x="10.4" y="10.8" width="4" height="3.4"/><path d="M8 5v3M3.6 10.8V8h8.8v2.8"/>
      </symbol>
      <symbol id="i-third" viewBox="0 0 16 16">
        <circle cx="5.6" cy="8" r="3.1"/><circle cx="10.4" cy="8" r="3.1"/>
      </symbol>
      <symbol id="i-clients" viewBox="0 0 16 16">
        <rect x="3" y="2" width="10" height="12"/><path d="M5.8 5h1.2M9 5h1.2M5.8 8h1.2M9 8h1.2M6 11.5h4"/>
      </symbol>
      <symbol id="i-roles" viewBox="0 0 16 16">
        <path d="M8 1.8l5 2v4.3c0 3-2.1 5.1-5 6.1-2.9-1-5-3.1-5-6.1V3.8z"/>
      </symbol>
      <symbol id="i-audit" viewBox="0 0 16 16">
        <path d="M3 4h10M3 8h10M3 12h6"/>
      </symbol>
      <symbol id="i-predef" viewBox="0 0 16 16">
        <path d="M13.2 8a5.2 5.2 0 1 1-1.7-3.9"/><path d="M13.2 2v3.2H10"/>
      </symbol>
      <symbol id="i-settings" viewBox="0 0 16 16">
        <path d="M2 5h12M2 11h12"/><circle cx="6" cy="5" r="1.7"/><circle cx="10.5" cy="11" r="1.7"/>
      </symbol>
      <symbol id="i-bell" viewBox="0 0 16 16">
        <path d="M4 7a4 4 0 0 1 8 0v3l1.2 2H2.8L4 10z"/><path d="M6.4 12a1.6 1.6 0 0 0 3.2 0"/>
      </symbol>
      <symbol id="i-search" viewBox="0 0 16 16">
        <circle cx="7" cy="7" r="4.6"/><path d="M10.4 10.4L14 14"/>
      </symbol>
      <symbol id="i-collapse" viewBox="0 0 16 16">
        <path d="M9.5 4L5.5 8l4 4"/>
      </symbol>
      <symbol id="i-burger" viewBox="0 0 16 16">
        <path d="M2 4h12M2 8h12M2 12h12"/>
      </symbol>
      <symbol id="i-arrow" viewBox="0 0 16 16">
        <path d="M3 8h10M9 4l4 4-4 4"/>
      </symbol>
    </svg>
  );
});

/** Une icône d'interface. `petite` correspond à `.ico-sm` des maquettes. */
export function Icone({ nom, petite = false }: { nom: string; petite?: boolean }) {
  return (
    <svg className={petite ? "ico ico-sm" : "ico"} aria-hidden="true">
      <use href={`#${nom}`} />
    </svg>
  );
}
