# Décisions de remédiation — 10 septembre 2026

Autorité : demande utilisateur du 10 septembre, exécution intégrale en autonomie avec choix et arbitrages délégués. Ces décisions sont prises par l’intégrateur ; elles ne constituent ni une revue humaine ni des résultats de recette. Les contrats T-RM restent la base des contrôles. Aucun verdict E9 n’est réécrit.

| Identifiant | Décision et justification | Source / conséquences |
| --- | --- | --- |
| D-RM-01 | Conserver les permissions de PORTFOLIO_MANAGER, y compris écritures projet et validation dans son périmètre. Les attentes de consultation d’Inès ne constituent pas une interdiction. Réviser P-116/117 selon le rôle réellement décidé, sans modifier E9. | 01 §3.1–3.3, RG-DROITS-01/03 ; RM-03. |
| D-RM-02 | Le calendrier reste administré par Karim. Hugo garde les droits de suivi RH ; P-100/101 sont rejoués sous Karim pour les écritures et sous Hugo pour les refus. Pas d’attribution implicite de holidays:create/import au rôle RH. | 01 §3.1 attribue explicitement le calendrier à Karim ; RM-10. |
| D-RM-03 | L’administration du référentiel des compétences et de la matrice est confiée au rôle RH complet, dans son périmètre ; le rôle RH léger reste en consultation. Permission par action, pas de gestion générale des comptes. | Décision explicite complétant §3.1 pour EX-CMP ; RM-03/07. À porter au cadrage et aux tests du catalogue. |
| D-RM-04 | Le reset administrateur demande un secret provisoire conforme à la politique, connu de l’administrateur qui le remet au titulaire par le canal interne de la collectivité. Confirmation avant action, changement imposé à la connexion, aucune journalisation du secret. | EX-USR-07, EX-AUTH-07, RG-AUTH-06/10 ; RM-02. Pas de secret généré puis perdu. |
| D-RM-05 | Les historiques dont les contributions ne peuvent pas être filtrées sont masqués aux périmètres restreints avec explication dédiée. Une courbe filtrée ne peut être reconstituée depuis une seule moyenne globale. | RG-RPT-01 et RG-SCOPE-04 ; RM-01. Limitation explicite, pas de fausse courbe à zéro. |
| D-RM-06 | Les dates/heures numériques et séparateurs restent ceux du paramétrage global ; noms de jours/mois et noms des rôles système suivent FR/EN. Les noms des rôles personnalisés restent ceux saisis. | RG-GEN-08/09, RG-DROITS-02 ; RM-12. |
| D-RM-07 | Recherche globale sur projets et tâches visibles par l’acteur, recherche textuelle nom/titre, résultats groupés avec lien vers fiche, état sans résultat explicite. Aucun résultat confidentiel interdit, aucune suggestion hors périmètre. | Nouveau contrat de conception pour le champ annoncé dans 02 coquille ; RM-13. |
| D-RM-08 | Recherche, projet, statut et autres filtres de listes ainsi qu’ancre/services du planning sont partageables par URL. Le retour depuis une fiche restaure l’URL source ; une entrée directe utilise la liste parente sans filtre. Les menus/modales sont locaux et ne persistent pas. | Nouveau contrat de navigation A-43, RM-13 ; RG-GEN-04 ne sert pas de justification à la persistance. |
| D-RM-09 | RM-00-v2 conserve tous incidents et distingue les refus HTTP précisément prévus avant action (méthode, chemin, statut, phase, nombre) des incidents inattendus. Bootstrap : un GET /api/auth/me 401 avant connexion est prévu. Aucun ERR_ABORTED exclu. | Contrat réseau explicite arrêté avant campagne ; un refus métier attendu ne devient pas une panne. Tests des excès et incidents inattendus requis. |
| D-RM-10 | P-49 vérifie le refus de suppression d’une tâche prérequise, conformément à RG-TSK-07 ; P-164 conserve semaine/mois/trimestre/année (EX-RPT-01), sans inventer une fenêtre 30 jours depuis EX-RPT-10 relatif à l’activité récente. | Contradictions de scénarios ; nouvelles versions sourcées, anciens rouges conservés. |

Les arbitrages sont à intégrer au cadrage avec leur motivation avant campagne finale. Statut de livraison distinct dans le journal ; cette table ne donne aucun vert.

D-RM-11 — Présence (RM-07) : l’affichage de présence consolide d’abord les congés approuvés, puis les déclarations bureau/télétravail, puis le non-déclaré. Un congé n’est pas un quatrième état stocké de télétravail : c’est une occupation prioritaire dans la grille commune. Les comptes affichés dans 06 et 20 portent sur la même population et la même date ; le non-déclaré exclut les agents en congé. Les jours non ouvrés sont distingués et ne fabriquent pas des absences de déclaration. Les statistiques de télétravail comptent les journées réellement déclarées ou générées, selon les périodes explicitement affichées. Motif : principe directeur de grille temporelle unique, EX-TLT-07/08 et RG-TLT-02.

D-RM-12 — Les jours fixes appartiennent au calendrier personnel : les permissions `telework:manage_rules` et `telework:generate` entrent dans le socle personnel pour exercer EX-TLT-04/06. Aucun `telework:manage_any` ajouté ; agir sur une autre personne reste refusé sans droit et périmètre dédiés (RG-TLT-07). Les modèles observateurs, composés seulement de permissions de lecture, restent inchangés. Le parcours P-31 conserve son objectif.

D-RM-13 — Driss peut consulter l’annuaire (`users:read`) et les paramètres en lecture (`settings:read` du socle), sans gouverner les comptes ni modifier les réglages. P-72 doit tester l’absence des écritures et les refus de rôles/audit, pas interdire ces lectures utiles à la conduite de projet. Pour P-53 et P-113, les audits sont consultés par Karim, sans ouvrir audit:read aux personas métier. La suppression définitive projet (P-70) s’exerce par un acteur détenant projects:delete ; les acteurs sans ce droit vérifient son refus.

## D-RM-14 — qualification indépendante de P-26 et P-41

L’exploration des seules sources confirme EX-CNG-09 et le brief19 : les soldes personnels se consultent par type et année pendant la saisie ; le mot « Soldes » désigne l’onglet réservé à `leaves:manage_balances` (02 lignes626/657/659). P-26 retire donc ce titre de ses textes obligatoires pour Camille et affirme la zone personnelle. Aucun droit ajouté.

Le brief29 ligne864 prescrit le refus « 🔒 Accès restreint — Cette page est réservée aux administrateurs et responsables ». L’état Restreint de design/etats conserve la coquille et remplace le contenu principal : P-41 garde le refus nommé et l’absence de données, sans imposer une page plein écran. Aucun assouplissement lié au comportement actuel. E9 reste inchangé ; corpus10 passe à version4, oracle à version3 avant campagne.

## D-RM-15 — calendrier scolaire en réseau fermé

ADR-0017 : l'import année/zone s'appuie sur un instantané officiel embarqué, avec date et empreinte. Aucune connexion externe en exploitation, aucune date future inventée ; année/zone absente refusée explicitement. Les événements ponctuels sans fin sont distingués des périodes de vacances. La référence officielle reste dans l'image de production : ce n'est pas un jeu de mesure.

## D-RM-16 — messages du planning et des événements

Le brief07 lignes339/340 prescrit deux messages différents pour le refus d’un changement de date et le changement d’assigné d’une tâche multi-assignée. P62 couvre désormais les deux gestes avec leurs textes propres, au lieu de réclamer le texte de refus après une réassignation réussie. Le brief18 lignes589/591 nomme la case événement « Toute la journée » ; P65 et son oracle reprennent ce titre, distinct de la période « Journée entière » du vocabulaire partagé. Les assertions de dates, assignés et participants sont conservées. Corpus version5, oracle version4 ; aucune modification E9.

## D-RM-17 — échanges ICS et grille unifiée

EX-PLN-15 porte l’export du planning : il comprend les occupations visibles de la grille, pas uniquement événements et congés. Période, population et confidentialité restent les mêmes que la lecture ; la permission d’export n’élargit aucun périmètre.

À l’import, une représentation non supportée ne devient pas un événement tronqué. Elle porte un motif explicite parmi les lignes ignorées dans l’aperçu puis le bilan. Les récurrences représentables par le modèle existant sont à conserver ; les autres restent une limite déclarée de prise en charge, sans mutation cachée. Aucune modification de schéma implicite dans ce lot.

## D-RM-18 — fin de récurrence facultative

Le brief18 autorise une fin facultative ; RG-EVT-02 borne la génération par l’horizon configuré. L’absence de fin signifie une borne effective à la date de début augmentée de cet horizon, stockée et retournée par le serveur. Elle ne supprime pas silencieusement la récurrence et ne crée aucune série infinie. Le formulaire explique la borne appliquée ; une fin explicite supérieure à l’horizon reste refusée.

## D-RM-19 — invitation collective et membres inactifs

Le cas n’était pas précisé par EX-EVT-04. L’invitation d’un service porte les membres actifs autorisés, en cohérence avec les candidats individuels ; un compte inactif ne bloque pas l’ensemble et n’est pas invité. La désignation individuelle explicite d’un compte inactif reste refusée. Cette précision est portée au cadrage01 ; elle n’est pas attribuée artificiellement à RG-AUTH-05.
