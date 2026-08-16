import { memo } from "react";

/**
 * Les cinquante symboles de projet — `mockups/10`, bibliothèque d'icônes.
 *
 * **Aucune dépendance**, comme pour les icônes d'interface : `cadrage/03 § 4,
 * D12` écarte les bibliothèques au rendu non pilotable, et `C1` interdit la
 * requête sortante d'une police d'icônes.
 *
 * Le produit rangeait jusqu'ici un CARACTÈRE dans `icone` et l'affichait tel
 * quel à 8 px : la pastille montrait une lettre là où la maquette dessine un
 * symbole. Le vocabulaire vit dans `@trame/contracts` ; les tracés vivent ici.
 */
export const BibliothequeIconesProjet = memo(function BibliothequeIconesProjet() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <symbol id="p-folder" viewBox="0 0 16 16">
        <path d="M2 4h4l1.4 2H14v7.5H2z"/>
      </symbol>
      <symbol id="p-target" viewBox="0 0 16 16">
        <circle cx="8" cy="8" r="5.8"/><circle cx="8" cy="8" r="2.4"/>
      </symbol>
      <symbol id="p-clipboard" viewBox="0 0 16 16">
        <rect x="3" y="3" width="10" height="11"/><path d="M6 3V1.8h4V3"/><path d="M5.8 9l1.6 1.6L10.6 7.4"/>
      </symbol>
      <symbol id="p-flow" viewBox="0 0 16 16">
        <rect x="6" y="1.6" width="4" height="3"/><rect x="1.6" y="11" width="4" height="3"/><rect x="10.4" y="11" width="4" height="3"/><path d="M8 4.6v3M3.6 11V7.6h8.8V11"/>
      </symbol>
      <symbol id="p-calcheck" viewBox="0 0 16 16">
        <rect x="2" y="3" width="12" height="11"/><path d="M2 6.5h12M5 1.8v2.4M11 1.8v2.4M5.6 9.7l1.6 1.6 3.2-3.2"/>
      </symbol>
      <symbol id="p-screen" viewBox="0 0 16 16">
        <rect x="2" y="3" width="12" height="8"/><path d="M6 14h4M8 11v3"/>
      </symbol>
      <symbol id="p-server" viewBox="0 0 16 16">
        <rect x="2" y="2.5" width="12" height="4.6"/><rect x="2" y="9" width="12" height="4.6"/><path d="M4.4 4.8h.01M4.4 11.3h.01"/>
      </symbol>
      <symbol id="p-cloud" viewBox="0 0 16 16">
        <path d="M4.6 12.4a3 3 0 0 1 .3-6 4.1 4.1 0 0 1 7.7 1.2 2.6 2.6 0 0 1-.7 4.8z"/>
      </symbol>
      <symbol id="p-code" viewBox="0 0 16 16">
        <path d="M6 4.6L2.4 8 6 11.4M10 4.6L13.6 8 10 11.4"/>
      </symbol>
      <symbol id="p-database" viewBox="0 0 16 16">
        <path d="M13.5 4c0 1.1-2.5 2-5.5 2S2.5 5.1 2.5 4 5 2 8 2s5.5.9 5.5 2z"/><path d="M2.5 4v8c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2V4M2.5 8c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2"/>
      </symbol>
      <symbol id="p-coin" viewBox="0 0 16 16">
        <circle cx="8" cy="8" r="6"/><path d="M10 6.1a2.7 2.7 0 1 0 0 3.8M5.4 7.4h3.3M5.4 8.9h3.3"/>
      </symbol>
      <symbol id="p-chart" viewBox="0 0 16 16">
        <path d="M2.5 13.5h11M4.6 11.4V7M8 11.4V3.4M11.4 11.4V8.6"/>
      </symbol>
      <symbol id="p-wallet" viewBox="0 0 16 16">
        <rect x="2" y="4" width="12" height="9"/><path d="M2 6.6h12"/><circle cx="11" cy="9.6" r="1"/>
      </symbol>
      <symbol id="p-calc" viewBox="0 0 16 16">
        <rect x="3" y="2" width="10" height="12"/><path d="M5.4 5h5.2M5.6 8h.01M8 8h.01M10.4 8h.01M5.6 11h.01M8 11h.01M10.4 11h.01"/>
      </symbol>
      <symbol id="p-person" viewBox="0 0 16 16">
        <circle cx="8" cy="5.4" r="2.7"/><path d="M3 13.8a5 5 0 0 1 10 0"/>
      </symbol>
      <symbol id="p-group" viewBox="0 0 16 16">
        <circle cx="6" cy="5.6" r="2.3"/><circle cx="11.4" cy="6.4" r="1.8"/><path d="M1.8 13.2a4.3 4.3 0 0 1 8.4 0M11.6 9.8a3.4 3.4 0 0 1 2.6 2.6"/>
      </symbol>
      <symbol id="p-badge" viewBox="0 0 16 16">
        <rect x="3" y="2" width="10" height="12"/><circle cx="8" cy="6.4" r="2"/><path d="M5.4 12.2a2.7 2.7 0 0 1 5.2 0"/>
      </symbol>
      <symbol id="p-handshake" viewBox="0 0 16 16">
        <path d="M2 7.4l3-2.9 3 2.4 3-2.4 3 2.9M5 10.6l2 2 2-2"/>
      </symbol>
      <symbol id="p-map" viewBox="0 0 16 16">
        <path d="M2 4.2l4-1.6 4 1.6 4-1.6v9.8l-4 1.6-4-1.6-4 1.6z"/><path d="M6 2.6v10.8M10 4.2V15"/>
      </symbol>
      <symbol id="p-pin" viewBox="0 0 16 16">
        <path d="M8 14.2s4.8-4.4 4.8-8a4.8 4.8 0 1 0-9.6 0c0 3.6 4.8 8 4.8 8z"/><circle cx="8" cy="6.1" r="1.9"/>
      </symbol>
      <symbol id="p-road" viewBox="0 0 16 16">
        <path d="M4.4 14L6 2M11.6 14L10 2M8 3.4v2M8 7.4v2M8 11.4v2"/>
      </symbol>
      <symbol id="p-cityhall" viewBox="0 0 16 16">
        <path d="M2 6.6L8 2.2l6 4.4M3.6 6.8V13h8.8V6.8M1.6 13.6h12.8M6.4 13V9.4h3.2V13"/>
      </symbol>
      <symbol id="p-bridge" viewBox="0 0 16 16">
        <path d="M1.4 9h13.2M1.8 12.6V9a6.2 6.2 0 0 1 12.4 0v3.6M5.2 12.6V9.4M10.8 12.6V9.4"/>
      </symbol>
      <symbol id="p-heart" viewBox="0 0 16 16">
        <path d="M8 13.6S2.4 10 2.4 6.3A3.3 3.3 0 0 1 8 4.3a3.3 3.3 0 0 1 5.6 2c0 3.7-5.6 7.3-5.6 7.3z"/>
      </symbol>
      <symbol id="p-ring" viewBox="0 0 16 16">
        <circle cx="8" cy="8" r="6"/><circle cx="8" cy="8" r="2.5"/><path d="M3.8 3.8l2.4 2.4M12.2 3.8L9.8 6.2M3.8 12.2l2.4-2.4M12.2 12.2L9.8 9.8"/>
      </symbol>
      <symbol id="p-house" viewBox="0 0 16 16">
        <path d="M2 7.2l6-5 6 5M4 7v7h8V7"/>
      </symbol>
      <symbol id="p-basket" viewBox="0 0 16 16">
        <path d="M2.4 6h11.2l-1.2 7.6H3.6z"/><path d="M5.6 6l1.4-3.6M10.4 6L9 2.4"/>
      </symbol>
      <symbol id="p-book" viewBox="0 0 16 16">
        <path d="M2.4 3.4h4.2c.8 0 1.4.5 1.4 1.1v9c0-.6-.6-1.1-1.4-1.1H2.4z"/><path d="M13.6 3.4H9.4c-.8 0-1.4.5-1.4 1.1v9c0-.6.6-1.1 1.4-1.1h4.2z"/>
      </symbol>
      <symbol id="p-palette" viewBox="0 0 16 16">
        <path d="M8 2a6 6 0 0 0 0 12c1 0 1.4-.6 1.4-1.2 0-.9-.8-1.2-.8-2 0-.6.5-1.1 1.2-1.1H11A3 3 0 0 0 14 6.7C14 4 11.3 2 8 2z"/><circle cx="5.4" cy="6.6" r=".9"/><circle cx="8.8" cy="4.9" r=".9"/>
      </symbol>
      <symbol id="p-mask" viewBox="0 0 16 16">
        <path d="M2.6 4h10.8v4a5.4 5.4 0 0 1-10.8 0z"/><circle cx="6" cy="7" r=".85"/><circle cx="10" cy="7" r=".85"/>
      </symbol>
      <symbol id="p-graduate" viewBox="0 0 16 16">
        <path d="M8 2.6l6 2.6-6 2.6-6-2.6z"/><path d="M4.6 7.4v3.2c0 1 1.5 1.8 3.4 1.8s3.4-.8 3.4-1.8V7.4"/>
      </symbol>
      <symbol id="p-music" viewBox="0 0 16 16">
        <path d="M6 11.8V4l7.2-1.6v8"/><circle cx="4.4" cy="11.9" r="1.6"/><circle cx="11.6" cy="10.3" r="1.6"/>
      </symbol>
      <symbol id="p-shield" viewBox="0 0 16 16">
        <path d="M8 1.8l5 2v4.3c0 3-2.1 5.1-5 6.1-2.9-1-5-3.1-5-6.1V3.8z"/>
      </symbol>
      <symbol id="p-helmet" viewBox="0 0 16 16">
        <path d="M2.6 11a5.4 5.4 0 0 1 10.8 0z"/><path d="M5.6 11V6.6a2.4 2.4 0 0 1 4.8 0V11M1.4 11.6h13.2"/>
      </symbol>
      <symbol id="p-extinguisher" viewBox="0 0 16 16">
        <rect x="5.4" y="5" width="4.8" height="9" rx="1"/><path d="M6.6 5V3.4h2.6V5M10.2 6.6l2.6-2"/>
      </symbol>
      <symbol id="p-camera" viewBox="0 0 16 16">
        <rect x="2" y="5" width="8" height="6"/><path d="M10 7l3.6-2v6L10 9"/>
      </symbol>
      <symbol id="p-lock" viewBox="0 0 16 16">
        <rect x="3" y="7" width="10" height="7"/><path d="M5.4 7V5a2.6 2.6 0 0 1 5.2 0v2"/><circle cx="8" cy="10.4" r="1"/>
      </symbol>
      <symbol id="p-leaf" viewBox="0 0 16 16">
        <path d="M13.4 2.6C7.2 2.6 3 5.2 3 9.8c0 1.6.6 2.7.6 2.7S6.2 8 13.4 2.6z"/><path d="M3.4 12.8C5 9.2 8.2 6.6 12.4 5"/>
      </symbol>
      <symbol id="p-tree" viewBox="0 0 16 16">
        <path d="M8 14.2v-3.4M8 1.8L4.2 7h7.6zM8 5.2L3 11h10z"/>
      </symbol>
      <symbol id="p-drop" viewBox="0 0 16 16">
        <path d="M8 2.2s4.3 4.8 4.3 7.4a4.3 4.3 0 0 1-8.6 0C3.7 7 8 2.2 8 2.2z"/>
      </symbol>
      <symbol id="p-sun" viewBox="0 0 16 16">
        <circle cx="8" cy="8" r="3.2"/><path d="M8 1.4v1.7M8 12.9v1.7M1.4 8h1.7M12.9 8h1.7M3.3 3.3l1.2 1.2M11.5 11.5l1.2 1.2M12.7 3.3l-1.2 1.2M4.5 11.5l-1.2 1.2"/>
      </symbol>
      <symbol id="p-recycle" viewBox="0 0 16 16">
        <path d="M8 1.8l2.4 4.1H5.6z"/><path d="M2.2 12.4l2.4-4.1L7 12.4z"/><path d="M13.8 12.4H6.4"/>
      </symbol>
      <symbol id="p-scales" viewBox="0 0 16 16">
        <path d="M8 2.4v11M3 13.6h10M2 5.8h12M2 5.8L.6 9.4h2.8zM14 5.8l1.4 3.6h-2.8z"/>
      </symbol>
      <symbol id="p-gavel" viewBox="0 0 16 16">
        <path d="M2.6 13.4l5-5M5.4 5.8l3-3 3 3-3 3z"/><path d="M9.4 9.8l3.8 3.8"/>
      </symbol>
      <symbol id="p-scroll" viewBox="0 0 16 16">
        <path d="M4 2.4h8v9.2a2 2 0 0 1-2 2H4a2 2 0 0 0 2-2z"/><path d="M6.6 5.4h3.8M6.6 8h3.8"/>
      </symbol>
      <symbol id="p-stamp" viewBox="0 0 16 16">
        <path d="M4.6 13.6h6.8"/><path d="M5.4 11.6h5.2v-1.4c0-1-1-1.5-1-2.5V5a1.6 1.6 0 0 0-3.2 0v2.7c0 1-1 1.5-1 2.5z"/>
      </symbol>
      <symbol id="p-star" viewBox="0 0 16 16">
        <path d="M8 2.2l1.8 3.7 4 .6-2.9 2.8.7 4-3.6-1.9-3.6 1.9.7-4L2.2 6.5l4-.6z"/>
      </symbol>
      <symbol id="p-bolt" viewBox="0 0 16 16">
        <path d="M9 1.8L3.6 9h3.8l-.4 5.2L12.4 7H8.6z"/>
      </symbol>
      <symbol id="p-flag" viewBox="0 0 16 16">
        <path d="M4 14V2.4M4 2.8h8.4l-1.6 2.8 1.6 2.8H4"/>
      </symbol>
      <symbol id="p-bulb" viewBox="0 0 16 16">
        <path d="M8 1.8a4.2 4.2 0 0 0-2.4 7.7c.5.4.8 1 .8 1.6v.3h3.2v-.3c0-.6.3-1.2.8-1.6A4.2 4.2 0 0 0 8 1.8z"/><path d="M6.4 13h3.2M7 14.4h2"/>
      </symbol>
    </svg>
  );
});

/**
 * La pastille d'un projet.
 *
 * Sans icône choisie, elle rend l'initiale du nom plutôt qu'un carré vide :
 * une pastille muette occupe la place sans rien dire, et la maquette prévoit
 * explicitement l'état « Aucune icône ».
 */
export function IconeProjet({
  icone,
  nom,
  petite = false,
}: {
  icone: string | null | undefined;
  nom: string;
  petite?: boolean;
}) {
  return (
    <i className={petite ? "pglyph" : "picon-box"} title={nom}>
      {icone ? (
        <svg className={petite ? "pgi" : "picon"} aria-hidden="true">
          <use href={`#${icone}`} />
        </svg>
      ) : (
        <span aria-hidden="true">{nom.slice(0, 1).toUpperCase()}</span>
      )}
    </i>
  );
}
