import { appeler } from "./client.js";
import type { Personne } from "./projets.js";

/**
 * Les appels des modules d'occupation — M9, M10, M11, M12.
 * Vues 18 (événements), 19 (congés), 20 (télétravail), 21 (temps passé).
 */

const params = (filtres: Record<string, string | number | boolean | undefined>) => {
  const q = new URLSearchParams();
  for (const [cle, valeur] of Object.entries(filtres)) {
    if (valeur !== undefined && valeur !== "" && valeur !== false) q.set(cle, String(valeur));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
};

// ── M9 — Événements, vue 18 ─────────────────────────────────────────────────

/**
 * Un événement, **tel que le serveur le rend**.
 *
 * Ce type déclarait `frequenceSemaines`, `jourSemaine` et `recurrenceJusqua` —
 * les noms du corps de CRÉATION. `EvenementsService.surPlage` rend les lignes
 * Prisma brutes, donc `recurrenceFrequence`, `recurrenceJourSemaine` et
 * `recurrenceFin`. Trois champs qui valaient donc toujours `undefined` : la
 * moitié de la détection de série — `parentId ?? frequenceSemaines` — était
 * morte, et un événement PARENT ne se signalait pas comme série. Rien ne
 * pouvait le voir : `appeler<T>` ne valide aucune forme, le typage n'a que
 * cette déclaration pour vérité, et le jeu d'essai de bout en bout recopiait
 * l'invention plutôt que la signature du service. Troisième occurrence de ce
 * couple client/fixture dans le dépôt.
 *
 * `version` en fait partie : sans elle, aucune écriture n'est composable
 * (`RG-GEN-07`). C'est exactement ce qui avait fait conclure, à tort, que
 * `PATCH /auth/me` n'existait pas.
 */
export type Evenement = {
  id: string;
  titre: string;
  description: string | null;
  date: string;
  journeeEntiere: boolean;
  heureDebut: string | null;
  heureFin: string | null;
  interventionExterieure: boolean;
  parentId: string | null;
  recurrenceFrequence: number | null;
  recurrenceJourSemaine: number | null;
  recurrenceFin: string | null;
  version: number;
  project: { id: string; nom: string } | null;
  participants: { userId: string; user: { prenom: string; nom: string } }[];
};

/**
 * `EX-EVT-08` — ajouter et retirer un participant.
 *
 * Deux gestes unitaires, pas une liste réécrite : réécrire l'ensemble ferait
 * disparaître puis réapparaître les participants inchangés, avec la
 * notification d'invitation qui prévient quelqu'un d'un événement qu'il n'a
 * jamais quitté. Même raisonnement que sur les membres d'un projet.
 */
export const ajouterParticipant = (evenementId: string, userId: string) =>
  appeler<unknown>(`/evenements/${evenementId}/participants`, {
    methode: "POST",
    corps: { userId },
  });

export const retirerParticipant = (evenementId: string, userId: string) =>
  appeler<unknown>(`/evenements/${evenementId}/participants/${userId}`, { methode: "DELETE" });

/** `RG-EVT-07` — la portée d'un geste porté sur une occurrence d'une série. */
export type PorteeEvenement = "occurrence" | "serie";

/** `RG-EVT-07` — un événement appartient-il à une série ? */
export const estDUneSerie = (e: Evenement): boolean =>
  e.parentId !== null || e.recurrenceFrequence !== null;

export const evenements = (filtres: { debut?: string; fin?: string; projectId?: string }) =>
  appeler<Evenement[]>(`/evenements${params(filtres)}`);

export const creerEvenement = (donnees: {
  titre: string;
  description?: string;
  date: string;
  journeeEntiere?: boolean;
  heureDebut?: string | null;
  heureFin?: string | null;
  projectId?: string | null;
  interventionExterieure?: boolean;
  participantIds?: string[];
  recurrence?: { frequenceSemaines: number; jourSemaine: number; jusqua: string };
}) => appeler<{ id: string }>("/evenements", { methode: "POST", corps: donnees });

/**
 * `EX-EVT-06` — modifier un événement.
 *
 * `version` est obligatoire (`RG-GEN-07`) et `portee` l'est dès que
 * l'événement appartient à une série (`RG-EVT-07`) : le serveur refuse
 * l'absence de portée sur une série, et sa présence hors série. La date ne se
 * propage pas à une série — elle est ce qui distingue deux occurrences.
 */
export const modifierEvenement = (
  id: string,
  donnees: {
    version: number;
    portee?: PorteeEvenement;
    titre?: string;
    description?: string | null;
    date?: string;
    journeeEntiere?: boolean;
    heureDebut?: string | null;
    heureFin?: string | null;
    projectId?: string | null;
    interventionExterieure?: boolean;
  },
) => appeler<Evenement>(`/evenements/${id}`, { methode: "PATCH", corps: donnees });

/**
 * `EX-EVT-06` — supprimer un événement.
 *
 * `version` et `portee` voyagent en paramètres de requête : le serveur les y
 * attend, un corps sur un `DELETE` étant mal traité par les intermédiaires.
 */
export const supprimerEvenement = (
  id: string,
  donnees: { version: number; portee?: PorteeEvenement },
) => {
  /* La chaîne de requête se compose à part : deux interpolations collées dans
     un même gabarit produisent un chemin que `surface-http.test.ts` ne sait pas
     segmenter, et une route illisible y est comptée comme jamais appelée. */
  const requete = new URLSearchParams({
    version: String(donnees.version),
    ...(donnees.portee ? { portee: donnees.portee } : {}),
  });
  return appeler<{ supprimees: number }>(`/evenements/${id}?${requete.toString()}`, {
    methode: "DELETE",
  });
};

export const arreterRecurrence = (id: string, aPartirDe: string) =>
  appeler<{ supprimees: number }>(`/evenements/${id}/arreter`, {
    methode: "POST",
    corps: { aPartirDe },
  });

// ── M10 — Congés, vue 19 ────────────────────────────────────────────────────

export type TypeConge = {
  id: string;
  code: string;
  nom: string;
  description: string | null;
  icone: string | null;
  couleur: string | null;
  remunere: boolean;
  validationRequise: boolean;
  limiteAnnuelle: number | null;
  actif: boolean;
  systeme: boolean;
  utilisations: number;
};

export type Solde = {
  annee: number;
  attribues: number;
  consommes: number;
  engages: number;
  disponibles: number;
};

export type SoldeParType = {
  type: {
    id: string;
    code: string;
    nom: string;
    couleur: string | null;
    icone: string | null;
    validationRequise: boolean;
  };
  solde: Solde;
};

export type DemandeConge = {
  id: string;
  statut: string;
  dateDebut: string;
  dateFin: string;
  demiJourneeDebut: string | null;
  demiJourneeFin: string | null;
  motif: string | null;
  motifRefus: string | null;
  joursOuvres: string;
  version: number;
  type: { id: string; nom: string; couleur: string | null; icone: string | null };
  user: Personne;
  validateur: Personne | null;
  /** `RG-CNG-19` — une demande à cheval sur deux ans se répartit par année. */
  repartitions: { annee: number; jours: string }[];
};

export type Delegation = {
  id: string;
  dateDebut: string;
  dateFin: string;
  active: boolean;
  delegue?: Personne;
  delegant?: Personne;
};

export const conges = (filtres: {
  userId?: string;
  aValider?: boolean;
  statut?: string;
  annee?: number;
}) => appeler<DemandeConge[]>(`/conges${params(filtres)}`);

export const typesDeConge = (inclureInactifs = false) =>
  appeler<TypeConge[]>(`/conges/types${params({ inclureInactifs })}`);

export const soldes = (annee: number, userId?: string) =>
  appeler<SoldeParType[]>(`/conges/soldes${params({ annee, ...(userId ? { userId } : {}) })}`);

/**
 * `EX-CNG-09` — « Consulter son solde par type et par année » : **UN** type,
 * **UNE** année.
 *
 * Ce n'est pas un doublon allégé de `soldes(annee)`, et le remplacement n'est
 * pas une économie de requête : les deux routes ne rendent pas le même
 * ensemble. `GET /conges/soldes` boucle sur `leaveType where actif: true` —
 * un type **désactivé** n'y figure pas. Or `RG-CNG-29` conserve les congés
 * posés sur un type désactivé, et `EX-CNG-05` les laisse modifier : la
 * fenêtre de modification cherchait alors son type dans une liste qui ne le
 * contenait plus, ne trouvait rien, et **le bloc « Contrôle du solde »
 * disparaissait entièrement** — sur la demande précise où il compte le plus,
 * puisque le dépôt sera quand même contrôlé par `RG-CNG-21` au serveur.
 *
 * `GET /conges/solde` ne filtre pas sur `actif` : elle répond pour le type
 * qu'on lui nomme. C'est la route juste ici, et la seule.
 */
export const solde = (typeId: string, annee: number, userId?: string) =>
  appeler<Solde>(`/conges/solde${params({ typeId, annee, ...(userId ? { userId } : {}) })}`);

/**
 * `RG-CNG-08` — **qui** validera une demande déposée à cette date.
 *
 * Manager du service, à défaut responsable du département, à défaut personne
 * — et une délégation active (`RG-CNG-10`) substitue le délégué au délégant.
 * Aucune de ces trois branches ne se devine à l'écran : c'est le serveur qui
 * les tranche, et il les tranche **à la date**, parce qu'une délégation a un
 * début et une fin.
 *
 * **La réponse ne porte qu'un identifiant, jamais un nom.** Le point d'entrée
 * est gardé par `leaves:read` ; `GET /utilisateurs`, le seul annuaire du
 * produit, l'est par `users:read`, qu'un agent ordinaire n'a pas. Un client
 * qui n'a que `leaves:read` reçoit donc un UUID qu'il n'a aucun moyen de
 * nommer. Voir le commentaire de `FenetreDemande` pour le contournement, et
 * le compte rendu du lot pour le défaut.
 */
export const validateurDeConge = (date: string) =>
  appeler<{ validateurId: string | null }>(`/conges/validateur${params({ date })}`);

export const delegations = () =>
  appeler<{ donnees: Delegation[]; recues: Delegation[] }>("/conges/delegations");

export const deposerConge = (donnees: {
  typeId: string;
  dateDebut: string;
  dateFin: string;
  demiJourneeDebut?: string | null;
  demiJourneeFin?: string | null;
  motif?: string;
  userId?: string;
}) => appeler<{ id: string }>("/conges", { methode: "POST", corps: donnees });

/**
 * `EX-CNG-05` — modifier une demande **encore en attente**.
 *
 * Le serveur refuse tout autre statut (`statut_incompatible`) : une demande
 * décidée ne se réécrit pas, elle s'annule. Le type de congé n'est pas
 * modifiable — changer de type, c'est une autre demande, avec un autre solde.
 */
export const modifierConge = (
  id: string,
  donnees: {
    dateDebut: string;
    dateFin: string;
    demiJourneeDebut?: string | null;
    demiJourneeFin?: string | null;
    motif?: string;
  },
) => appeler<void>(`/conges/${id}`, { methode: "PATCH", corps: donnees });

export const approuverConge = (id: string) =>
  appeler<void>(`/conges/${id}/approuver`, { methode: "POST" });

export const refuserConge = (id: string, motifRefus: string) =>
  appeler<void>(`/conges/${id}/refuser`, { methode: "POST", corps: { motifRefus } });

export const demanderAnnulation = (id: string) =>
  appeler<void>(`/conges/${id}/annulation`, { methode: "POST" });

/**
 * `EX-CNG-07` — accepter ou refuser une demande d'annulation.
 *
 * Le serveur exige `cancellation_requested` et refuse tout autre statut
 * (`statut_incompatible`). C'est la route que le validateur doit appeler sur
 * une demande d'annulation : `POST /conges/:id/approuver` y échoue, parce que
 * `RG-CNG-02` ne réapprouve pas une demande déjà décidée.
 *
 * `accepte` à vrai écrit `cancelled` ; à faux, le congé **revient à
 * `approved`** (`RG-CNG-01`, `RG-CNG-06`) — ce n'est donc pas un refus qui
 * laisse la demande en l'état, et l'interface doit le dire.
 */
export const traiterAnnulation = (id: string, accepte: boolean) =>
  appeler<void>(`/conges/${id}/annulation/traiter`, { methode: "POST", corps: { accepte } });

/**
 * `EX-CNG-13` — retirer un type du référentiel.
 *
 * **La réponse n'est pas triviale, et l'interface doit la lire.** Le serveur
 * *désactive* au lieu de supprimer dès que le type est système (`RG-CNG-30`)
 * ou qu'il porte des congés (`RG-CNG-31`), et rend le nombre concerné : dire
 * « supprimé » dans ce cas serait faux, et le chiffre est précisément ce que
 * `RG-CNG-31` veut voir annoncé.
 */
export const supprimerTypeDeConge = (id: string) =>
  appeler<{ desactive: boolean; conges: number; systeme: boolean }>(`/conges/types/${id}`, {
    methode: "DELETE",
  });

/**
 * `RG-CNG-16`, `RG-CNG-17`, `RG-CNG-19` — le décompte en jours ouvrés.
 *
 * **Il ne se calcule pas au client.** Les week-ends s'y devinent, mais pas les
 * jours fériés ni les jours chômés du paramétrage : une découpe de chaîne
 * annonçait « 7 jours » là où le serveur en compte 5, et le dépôt était refusé
 * après coup sur un chiffre que l'écran n'avait jamais montré.
 */
export type DecompteJoursOuvres = {
  jours: number;
  parAnnee: { annee: number; jours: number }[];
};

export const joursOuvres = (requete: {
  debut: string;
  fin: string;
  demiJourneeDebut?: boolean;
  demiJourneeFin?: boolean;
}) => appeler<DecompteJoursOuvres>(`/parametrage/jours-ouvres${params(requete)}`);

export const supprimerConge = (id: string) =>
  appeler<void>(`/conges/${id}`, { methode: "DELETE" });

export const desactiverDelegation = (id: string) =>
  appeler<void>(`/conges/delegations/${id}`, { methode: "DELETE" });

export const creerDelegation = (donnees: {
  delegantId: string;
  delegueId: string;
  dateDebut: string;
  dateFin: string;
}) => appeler<{ id: string }>("/conges/delegations", { methode: "POST", corps: donnees });

// ── M11 — Télétravail, vue 20 ───────────────────────────────────────────────

/**
 * Le serveur ne rend pas un tableau : il rend le calendrier **et** son cumul.
 *
 * Le type déclaré ici disait `JourTeletravail[]`, et la vue faisait `.map`
 * dessus — donc une exception à chaque rendu, et la vue 20 ne s'affichait pas
 * du tout. Rien ne pouvait le voir : `appeler<T>` ne valide pas la forme, le
 * typage n'a que cette déclaration pour vérité, et aucune boucle n'ouvrait la
 * page. Le type suit désormais `TeletravailService.planning`.
 */
export type JourTeletravail = {
  date: string;
  etat: string;
  weekend: boolean;
  issuDeRegle: boolean;
  exception: boolean;
};
export type PlanningTeletravail = {
  calendrier: JourTeletravail[];
  cumul: { teletravail: number; bureau: number; nonDeclares: number };
};
export type AgentTeletravail = {
  id: string;
  prenom: string;
  nom: string;
  etat: string;
};
export type RegleTeletravail = {
  id: string;
  jourSemaine: number;
  dateDebut: string;
  dateFin: string | null;
  active: boolean;
  /** `RG-GEN-07` — la version lue, que la modification devra renvoyer. Sans
   *  elle, aucune requête de modification n'est composable depuis la lecture. */
  version: number;
};

export const planningTeletravail = (debut: string, fin: string, userId?: string) =>
  appeler<PlanningTeletravail>(
    `/teletravail${params({ debut, fin, ...(userId ? { userId } : {}) })}`,
  );

export const equipeTeletravail = (date: string) =>
  appeler<AgentTeletravail[]>(`/teletravail/equipe${params({ date })}`);

export const reglesTeletravail = (userId?: string) =>
  appeler<RegleTeletravail[]>(`/teletravail/regles${params(userId ? { userId } : {})}`);

export const basculerTeletravail = (date: string, etat: string, userId?: string) =>
  appeler<unknown>("/teletravail", {
    methode: "POST",
    corps: { date, etat, ...(userId ? { userId } : {}) },
  });

export const apercuRegle = (regle: {
  jourSemaine: number;
  dateDebut: string;
  dateFin?: string | null;
}) => appeler<{ dates: string[]; total: number }>("/teletravail/regles/apercu", {
  methode: "POST",
  corps: regle,
});

export const creerRegleTeletravail = (donnees: {
  jourSemaine: number;
  dateDebut: string;
  dateFin?: string | null;
}) => appeler<{ id: string }>("/teletravail/regles", { methode: "POST", corps: donnees });

/**
 * `EX-TLT-04` — **modifier une règle, l'activer ou la désactiver.**
 *
 * L'exigence énumère quatre facettes — « jour de la semaine, date de début,
 * date de fin facultative, actif » — et la quatrième ne s'écrivait nulle part :
 * ni service, ni route, ni appel. Une règle posée était définitive.
 *
 * `version` accompagne toute modification (`RG-GEN-07`) : c'est celle qu'a
 * rendue `reglesTeletravail`. `dateFin: null` efface la borne, son absence la
 * laisse — une règle bornée doit pouvoir se rouvrir.
 */
export const modifierRegleTeletravail = (
  id: string,
  donnees: {
    version: number;
    jourSemaine?: number;
    dateDebut?: string;
    dateFin?: string | null;
    active?: boolean;
  },
) =>
  appeler<RegleTeletravail>(`/teletravail/regles/${id}`, {
    methode: "PATCH",
    corps: donnees,
  });

/** `EX-TLT-04` — supprimer une règle. Les jours déjà générés restent : ce sont
 *  des déclarations posées, pas une projection de la règle. */
export const supprimerRegleTeletravail = (id: string) =>
  appeler<void>(`/teletravail/regles/${id}`, { methode: "DELETE" });

export const genererTeletravail = (debut: string, fin: string) =>
  appeler<{ crees: number; ignores: number }>("/teletravail/generer", {
    methode: "POST",
    corps: { debut, fin },
  });

// ── M12 — Temps passé, vue 21 ───────────────────────────────────────────────

export type SaisieTemps = {
  id: string;
  date: string;
  /** Un NOMBRE, comme partout ailleurs dans le module : le service convertit
   *  le `Decimal` de Prisma avant de rendre, sinon `GET /temps` rendrait une
   *  chaîne là où `GET /temps/rapport` rend un nombre. */
  heures: number;
  typeActivite: string;
  description: string | null;
  creeLe: string;
  project: { id: string; nom: string } | null;
  task: { id: string; titre: string } | null;
  user: Personne | null;
  thirdParty: { id: string; organisation: string | null; contactNom: string | null } | null;
};

export const temps = (filtres: {
  userId?: string;
  projectId?: string;
  debut?: string;
  fin?: string;
}) =>
  appeler<{
    saisies: SaisieTemps[];
    cumul: {
      entrees: number;
      heures: number;
      /** `RG-TMP-02` — le plafond journalier en vigueur. Il vient du serveur,
       *  parce que c'est un paramètre d'administration : la vue n'en garde
       *  aucune copie. */
      plafondJournalier: number;
    };
  }>(`/temps${params(filtres)}`);

export const saisirTemps = (donnees: {
  date: string;
  heures: number;
  typeActivite?: string;
  projectId?: string | null;
  taskId?: string | null;
  description?: string;
  userId?: string | null;
  thirdPartyId?: string | null;
}) => appeler<{ id: string }>("/temps", { methode: "POST", corps: donnees });

export const supprimerTemps = (id: string) =>
  appeler<void>(`/temps/${id}`, { methode: "DELETE" });

/**
 * Une ligne d'agrégat du rapport.
 *
 * **Deux formes, parce qu'il y a deux natures.** Sur les axes « agent » et
 * « projet », la ligne porte un vrai libellé — un nom de personne, un nom de
 * projet — que le serveur seul connaît. Sur l'axe « type », il n'y a pas de
 * libellé à rendre : il y a un CODE d'énumération que le client traduit par
 * `TYPES_ACTIVITE`, comme `RG-GEN-08` l'impose.
 *
 * Le serveur rendait ce code dans un champ nommé `libelle`. Le nom mentait, et
 * rien ne pouvait le dire : le client lisait `cle` et ignorait `libelle` sur
 * cet axe. Il porte désormais son nom.
 */
export type LigneRapportTemps =
  | { cle: string | null; libelle: string; heures: number; entrees: number }
  | { cle: string; codeActivite: string; heures: number; entrees: number };

/**
 * `EX-TMP-07` — le rapport agrégé, par agent, par projet ou par type d'activité.
 *
 * L'agrégation est faite **en base**, sur le périmètre de l'appelant : la vue
 * ne redescend pas cinq ans de lignes pour les additionner. C'est le versant
 * ÉQUIPE de la vue 21, distinct de la répartition personnelle qui, elle, se
 * calcule sur les saisies déjà chargées.
 *
 * `debut` et `fin` sont **obligatoires** côté serveur : un rapport sans fenêtre
 * n'a pas de sens, et le laisser facultatif le ferait tomber en 400 à la
 * première ouverture.
 */
export const rapportTemps = (q: { axe: "agent" | "projet" | "type"; debut: string; fin: string }) =>
  appeler<LigneRapportTemps[]>(`/temps/rapport${params(q)}`);

/** `RG-TMP-07` — ce qui est déjà déclaré sur une tâche, tous contributeurs confondus. */
export const contexteTemps = (taskId: string) =>
  appeler<{ heuresDeclarees: number; entrees: number; contributeurs: number }>(
    `/temps/contexte/${taskId}`,
  );

/**
 * `EX-TMP-06`, `EX-DSH-06` — clore une tâche terminée **sans** déclaration.
 *
 * Ce n'est pas « déclarer zéro heure » : c'est dire que la question ne se pose
 * pas. La distinction compte pour les rapports, qui excluent les renoncements
 * au lieu de compter des zéros.
 */
export const validerSansDeclaration = (taskId: string) =>
  appeler<void>(`/temps/renoncement/${taskId}`, { methode: "POST" });
