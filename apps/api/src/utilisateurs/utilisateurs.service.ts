import { presenceALaDate } from "../commun/presence.js";
import { CalendrierService } from "../parametrage/calendrier.service.js";
import { Injectable } from "@nestjs/common";
import { champRefuse, CHAMPS_GOUVERNES_UTILISATEUR } from "../commun/champs-gouvernes.js";
import { PrismaService } from "../prisma.service.js";
import { AuditService } from "../commun/audit.service.js";
import { PerimetreService, type Perimetre } from "../commun/perimetre.service.js";
import { hacherMotDePasse } from "../auth/mots-de-passe.js";

/**
 * Utilisateurs et annuaire — M3, `cadrage/01 § M3`.
 *
 * Le lot porte la distinction que `RG-GEN-10` et `§ D.4` exigent de ne
 * **jamais** confondre : la désactivation réversible et la suppression
 * définitive. Elles n'ont ni le même geste, ni les mêmes garde-fous, ni les
 * mêmes conséquences.
 */

export type EchecUtilisateur =
  | "email_deja_pris"
  | "login_deja_pris"
  | "introuvable"
  | "hors_perimetre"
  | "soi_meme_interdit"
  | "suppression_bloquee"
  | "service_hors_departement"
  | "conflit_de_version"
  | "champ_hors_permission";

export class ErreurUtilisateur extends Error {
  constructor(
    readonly code: EchecUtilisateur,
    readonly detail?: Record<string, unknown>,
  ) {
    super(code);
  }
}

/** Blocages nommés qui interdisent une suppression définitive — `RG-USR-03`. */
export type Blocage = { objet: string; nombre: number };

/**
 * `RG-CNG-20` — les statuts qui font qu'un jour est **consommé**.
 *
 * La même définition que `CongesService.solde`, et pour la même raison : deux
 * façons de compter les jours pris finissent par se contredire, et c'est
 * l'agent qui arbitre entre deux nombres dont aucun ne dit d'où il vient. Un
 * congé dont l'annulation est demandée reste pris tant qu'elle n'est pas
 * accordée.
 */
const CONSOMMES: ReadonlySet<string> = new Set(["approved", "cancellation_requested"]);

@Injectable()
export class UtilisateursService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly perimetres: PerimetreService,
  ) {}

  // ── Lecture — EX-USR-01, EX-USR-02 ───────────────────────────────────────

  async lister(
    perimetre: Perimetre,
    filtres: {
      recherche?: string;
      departementId?: string;
      serviceId?: string;
      roleId?: string;
      actif?: boolean;
    } = {},
  ) {
    const clauses: Record<string, unknown>[] = [this.perimetres.filtreUtilisateur(perimetre)];

    if (filtres.recherche) {
      const r = filtres.recherche;
      clauses.push({
        OR: [
          { prenom: { contains: r, mode: "insensitive" } },
          { nom: { contains: r, mode: "insensitive" } },
          { email: { contains: r, mode: "insensitive" } },
          { login: { contains: r, mode: "insensitive" } },
        ],
      });
    }
    if (filtres.departementId) clauses.push({ departementId: filtres.departementId });
    if (filtres.serviceId) clauses.push({ services: { some: { serviceId: filtres.serviceId } } });
    if (filtres.roleId) clauses.push({ roleId: filtres.roleId });
    if (filtres.actif !== undefined) clauses.push({ actif: filtres.actif });

    return this.prisma.user.findMany({
      where: { AND: clauses },
      orderBy: [{ nom: "asc" }, { prenom: "asc" }],
      select: {
        id: true, prenom: true, nom: true, email: true, login: true, actif: true,
        derniereConnexion: true, version: true,
        role: { select: { id: true, code: true, nom: true, systeme: true } },
        departement: { select: { id: true, nom: true } },
        services: { select: { service: { select: { id: true, nom: true } } } },
      },
    });
  }

  /**
   * `EX-USR-07` — le suivi individuel : tout ce qui concerne un agent, sur une
   * période. Vue 28.
   *
   * **La période commande les six onglets à la fois**, et c'est justement ce
   * qui rend l'agrégat délicat : certains chiffres n'ont de sens que sur la
   * période demandée (heures saisies, jours de télétravail), d'autres sur
   * l'année civile (le solde de congés), d'autres à l'instant (les tâches
   * actives). Les mélanger sous un même en-tête « cette semaine » produirait
   * des nombres justes séparément et faux ensemble.
   *
   * Chaque bloc porte donc son **étendue**, et la vue l'affiche à côté du
   * chiffre plutôt que dans une note de bas de page.
   */
  async suiviIndividuel(
    userId: string,
    fenetre: { debut: Date; fin: Date },
    perimetre: Perimetre,
  ) {
    /*
     * `RG-SCOPE-01` — le périmètre par défaut est le DÉPARTEMENT, et le suivi
     * individuel ne le contrôlait pas.
     *
     * C'est la lecture la plus indiscrète du produit : congés posés, jours de
     * télétravail, temps déclaré, tâche par tâche. Tout porteur de
     * `users:read_individual_tracking` obtenait celui de n'importe quel agent
     * de l'instance en devinant son identifiant — alors que la liste des
     * utilisateurs, elle, filtrait bien. Même dissymétrie que sur les projets :
     * la liste tenait, l'adresse directe non.
     */
    const visible = await this.prisma.user.findFirst({
      where: { AND: [{ id: userId }, this.perimetres.filtreUtilisateur(perimetre)] },
      select: { id: true },
    });
    if (!visible) {
      const existe = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });
      throw new ErreurUtilisateur(existe ? "hors_perimetre" : "introuvable");
    }

    const agent = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, prenom: true, nom: true, email: true, login: true, actif: true,
        creeLe: true, derniereConnexion: true,
        role: { select: { code: true, nom: true, systeme: true } },
        departement: { select: { id: true, nom: true } },
        services: { select: { service: { select: { id: true, nom: true } } } },
      },
    });
    if (!agent) throw new ErreurUtilisateur("introuvable");

    const annee = fenetre.fin.getUTCFullYear();
    const dansLaPeriode = { gte: fenetre.debut, lte: fenetre.fin };

    const [taches, conges, teletravail, temps, competences] = await Promise.all([
      this.prisma.task.findMany({
        /*
         * `RG-SCOPE-04`, `RG-TSK-13` — **les tâches confidentielles sortent
         * d'ici aussi.** Trouvé le 2026-09-07 : le suivi listait le TITRE de
         * toutes les tâches assignées à l'agent, confidentielles comprises, à
         * qui détient `users:read_individual_tracking` sans
         * `tasks:read_confidential`. La règle était tenue sur `/taches` et
         * contournée par la vue 28 — la même dissymétrie que « la liste filtre,
         * l'adresse directe non », déplacée d'un module à l'autre.
         *
         * `filtreTache` en entier ne conviendrait PAS : il borne aussi aux
         * tâches de l'appelant et de ses projets, ce qui viderait un suivi dont
         * l'objet est précisément de montrer le travail d'un AUTRE. Seule la
         * moitié « confidentialité » s'applique, et elle se lit sur
         * `perimetre.confidentiel`, calculé une seule fois par
         * `PerimetreService.resoudre`.
         */
        where: {
          assignes: { some: { userId } },
          ...(perimetre.confidentiel ? {} : { confidentielle: false }),
        },
        orderBy: [{ dateFin: "asc" }],
        select: {
          id: true, titre: true, statut: true, priorite: true, avancement: true, dateFin: true,
          project: { select: { id: true, nom: true } },
        },
      }),
      this.prisma.leave.findMany({
        where: { userId },
        orderBy: { dateDebut: "desc" },
        select: {
          id: true, statut: true, dateDebut: true, dateFin: true, joursOuvres: true,
          type: { select: { id: true, nom: true, couleur: true } },
          repartitions: { where: { annee }, select: { annee: true, jours: true } },
        },
      }),
      this.prisma.telework.findMany({
        where: { userId, date: dansLaPeriode, etat: "telework" },
        orderBy: { date: "asc" },
        select: { date: true, etat: true, issuDeRegle: true },
      }),
      this.prisma.timeEntry.findMany({
        where: { userId, date: dansLaPeriode },
        orderBy: { date: "desc" },
        select: {
          id: true, date: true, heures: true, typeActivite: true, description: true,
          project: { select: { id: true, nom: true } },
        },
      }),
      this.prisma.userSkill.findMany({
        where: { userId },
        select: {
          niveau: true,
          skill: { select: { id: true, nom: true, categorie: true } },
        },
      }),
    ]);

    const actives = taches.filter((t) => t.statut !== "done");

    return {
      agent: { ...agent, services: agent.services.map((s) => s.service) },
      periode: { debut: fenetre.debut, fin: fenetre.fin, annee },
      taches,
      conges,
      teletravail,
      temps,
      competences: competences.map((c) => ({ ...c.skill, niveau: c.niveau })),
      statistiques: {
        /** À l'instant : « actives » n'a pas de sens sur une période passée. */
        tachesActives: actives.length,
        tachesTerminees: taches.length - actives.length,
        tachesBloquees: taches.filter((t) => t.statut === "blocked").length,
        /** Sur la période demandée. */
        joursTeletravail: teletravail.length,
        heuresSaisies: temps.reduce((n, e) => n + Number(e.heures), 0),
        /**
         * « Jours pris cette année » — sur l'année civile : un droit à congés
         * ne se découpe pas en trimestres.
         *
         * **Les refusés et les annulés en faisaient partie.** La somme portait
         * sur TOUTES les répartitions, quel que soit le statut de la demande :
         * un agent dont trois demandes avaient été refusées lisait ces jours
         * comme pris. `RG-CNG-20` dit ce que « consommé » veut dire — les
         * jours approuvés —, et `CongesService.solde` le calcule déjà ainsi.
         * Deux lectures d'un même fait qui se contredisent, et aucune des deux
         * ne pouvait le signaler : c'est le motif consigné de `joursFeries` /
         * `joursChomes`.
         *
         * `cancellation_requested` compte comme consommé, exactement comme
         * dans le solde : tant que l'annulation n'est pas accordée, le congé
         * est pris.
         */
        congesAnnee: conges
          .filter((c) => CONSOMMES.has(c.statut))
          .flatMap((c) => c.repartitions)
          .reduce((n, r) => n + Number(r.jours), 0),
        projetsActifs: new Set(
          actives.map((t) => t.project?.id).filter((x): x is string => Boolean(x)),
        ).size,
        competences: competences.length,
      },
    };
  }

  /**
   * `EX-USR-09` — la présence du jour : qui est là, en congé, en télétravail.
   *
   * Une seule sollicitation, comme le planning : trois requêtes indexées, pas
   * une par agent.
   *
   * ══════════════════════════════════════════════════════════════════════════
   * `RG-TLT-02` — **TROIS états de lieu, pas deux.**
   *
   * La méthode rendait `"present"` pour tout ce qui n'était ni congé ni
   * télétravail : les vingt agents qui n'avaient rien déclaré étaient comptés
   * au bureau. Le même jour, pour les mêmes personnes, la vue 20 affichait
   * « sur site 9 · non déclaré 20 » — **deux lectures du même fait, et c'est
   * celle qui affirmait le plus qui était fausse.** Chacune avait ses tests,
   * tous verts : quand deux fonctions lisent la même table, le contrôle qui
   * compte est celui qui les compare.
   *
   * `RG-TLT-02` pose « télétravail · bureau (déclaré) · non déclaré ». « Bureau
   * DÉCLARÉ » est le mot qui décide : `present` ne se dit que d'une ligne
   * `Telework` à l'état `office`. L'absence de déclaration n'est pas une
   * présence — c'est ce qu'on ne sait pas.
   *
   * D-RM-11 tranche désormais le week-end et les jours fériés non ouvrés :
   * ils sont distingués, sans fabriquer de non-déclaration. Les deux vues
   * partagent le calcul de commun/presence.ts.
   */
  async presenceDuJour(perimetre: Perimetre, jour: Date) {
    const agents = await presenceALaDate(this.prisma, this.perimetres, new CalendrierService(this.prisma, this.audit), perimetre, jour);
    return agents.map((a) => ({
      ...a,
      etat: a.nonOuvre ? "non_ouvre" as const : a.enConge ? "conge" as const
        : a.etat === "telework" ? "teletravail" as const
          : a.etat === "office" ? "present" as const : "non_declare" as const,
    }));
  }

  // ── Création — EX-USR-03 ─────────────────────────────────────────────────

  /**
   * `RG-USR-01` — email et identifiant uniques, et **les collisions produisent
   * des messages distincts**. Un message unique « déjà pris » obligerait
   * l'utilisateur à deviner lequel des deux corriger.
   *
   * `RG-USR-08` — les services sélectionnables dépendent du département choisi.
   * Contrôlé ici et pas seulement dans l'interface : une requête forgée doit
   * échouer comme un formulaire.
   */
  /**
   * `EX-USR-02` — **modifier un compte** : identité, rôle, rattachement.
   *
   * Il se créait, se désactivait, se supprimait ; rien ne le modifiait. La
   * maquette 27 pose pourtant « Modifier » sur chaque ligne — et corriger une
   * faute dans un nom, ou changer quelqu'un de service, n'avait aucun chemin.
   *
   * **`RG-AUTH-08` — l'identifiant de connexion n'est JAMAIS modifiable.** Il
   * n'est donc pas dans les champs acceptés : c'est la clé sous laquelle les
   * traces d'audit ont été écrites, et la changer réécrirait l'histoire.
   *
   * `RG-GEN-07` — la version transmise est celle qu'on a lue.
   */
  async modifier(
    id: string,
    donnees: {
      version: number;
      prenom?: string; nom?: string; email?: string;
      roleId?: string | null; departementId?: string | null; serviceIds?: string[];
    },
    acteurId: string,
    permissions: ReadonlySet<string>,
  ) {
    /*
     * `users:update` garde la route ; il ne gouverne pas `roleId`. Sans ce
     * refus, tout rôle capable de corriger un nom pouvait attribuer un rôle —
     * `IT_SUPPORT` et `RH` détiennent `users:update` sans `users:manage_roles`,
     * et pouvaient donc s'attribuer `ADMIN`. La séparation était énoncée dans le
     * catalogue et tenue nulle part.
     */
    const refuse = champRefuse(donnees, CHAMPS_GOUVERNES_UTILISATEUR, permissions);
    if (refuse) throw new ErreurUtilisateur("champ_hors_permission", refuse);

    const avant = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true, version: true, prenom: true, nom: true, email: true,
        roleId: true, departementId: true,
        role: { select: { nom: true } },
      },
    });
    if (!avant) throw new ErreurUtilisateur("introuvable");
    if (avant.version !== donnees.version) throw new ErreurUtilisateur("conflit_de_version");

    const email = donnees.email?.toLowerCase();
    if (email && email !== avant.email) {
      const pris = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
      if (pris) throw new ErreurUtilisateur("email_deja_pris");
    }

    const departementId =
      donnees.departementId !== undefined ? donnees.departementId : avant.departementId;
    if (donnees.serviceIds) {
      await this.verifierServices(departementId, donnees.serviceIds);
    }

    /*
     * Les champs sont ÉNUMÉRÉS, jamais propagés. Un `...champs` laissait
     * passer `login` : le schéma du contrôleur l'écarte, mais un appel interne
     * ou un second point d'entrée ne passerait pas par lui. `RG-AUTH-08` est
     * une règle du domaine — elle se tient dans le service, pas seulement à la
     * frontière HTTP. Un test l'a montré en une ligne.
     */
    const { serviceIds } = donnees;
    let user;
    try {
      user = await this.prisma.user.update({
        // La version fait partie de l'écriture : le précontrôle seul laisserait
        // deux requêtes franchir la lecture puis s'écraser.
        where: { id, version: donnees.version },
        data: {
          ...(donnees.prenom !== undefined ? { prenom: donnees.prenom } : {}),
          ...(donnees.nom !== undefined ? { nom: donnees.nom } : {}),
          ...(donnees.roleId !== undefined ? { roleId: donnees.roleId } : {}),
          ...(donnees.departementId !== undefined ? { departementId: donnees.departementId } : {}),
          ...(email ? { email } : {}),
          version: { increment: 1 },
          ...(serviceIds
            ? { services: { deleteMany: {}, create: serviceIds.map((serviceId) => ({ serviceId })) } }
            : {}),
        },
      });
    } catch (erreur) {
      if (codePrisma(erreur) === "P2025") throw new ErreurUtilisateur("conflit_de_version");
      if (codePrisma(erreur) === "P2002") throw new ErreurUtilisateur("email_deja_pris");
      throw erreur;
    }

    const roleApres = donnees.roleId === undefined
      ? avant.role
      : donnees.roleId === null
        ? null
        : await this.prisma.role.findUnique({ where: { id: donnees.roleId }, select: { nom: true } });

    await this.audit.tracer({
      action: "user.update",
      typeEntite: "User",
      entiteId: id,
      acteurId,
      detail: {
        avant: { prenom: avant.prenom, nom: avant.nom, email: avant.email, role: avant.role?.nom ?? null },
        apres: { prenom: user.prenom, nom: user.nom, email: user.email, role: roleApres?.nom ?? null },
      },
    });
    return user;
  }

  async creer(
    donnees: {
      prenom: string; nom: string; email: string; login: string;
      motDePasse: string; roleId?: string | null;
      departementId?: string | null; serviceIds?: string[];
    },
    acteurId: string,
    permissions: ReadonlySet<string>,
  ) {
    /*
     * Le jumeau du refus de `modifier`, et il compte autant : créer un compte
     * porteur du rôle `ADMIN` est exactement l'élévation que le refus sur
     * `PATCH` empêche. La fermer d'un seul côté n'aurait rien fermé.
     */
    const refuse = champRefuse(donnees, CHAMPS_GOUVERNES_UTILISATEUR, permissions);
    if (refuse) throw new ErreurUtilisateur("champ_hors_permission", refuse);

    const email = donnees.email.toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email }, select: { id: true } })) {
      throw new ErreurUtilisateur("email_deja_pris");
    }
    if (await this.prisma.user.findUnique({ where: { login: donnees.login }, select: { id: true } })) {
      throw new ErreurUtilisateur("login_deja_pris");
    }
    await this.verifierServices(donnees.departementId ?? null, donnees.serviceIds ?? []);

    let user;
    try {
      user = await this.prisma.user.create({
        data: {
          prenom: donnees.prenom,
          nom: donnees.nom,
          email,
          login: donnees.login,
          motDePasseHash: await hacherMotDePasse(donnees.motDePasse),
          // EX-AUTH-07 — mot de passe défini par un tiers : changement imposé.
          motDePasseAChanger: true,
          roleId: donnees.roleId ?? null,
          departementId: donnees.departementId ?? null,
          services: { create: (donnees.serviceIds ?? []).map((serviceId) => ({ serviceId })) },
        },
      });
    } catch (erreur) {
      if (codePrisma(erreur) === "P2002") {
        const cible = String((erreur as { meta?: { target?: unknown } }).meta?.target ?? "");
        const emailPris = cible.includes("email") || Boolean(await this.prisma.user.findUnique({
          where: { email }, select: { id: true },
        }));
        throw new ErreurUtilisateur(emailPris ? "email_deja_pris" : "login_deja_pris");
      }
      throw erreur;
    }

    await this.audit.tracer({
      action: "user.create", typeEntite: "User", entiteId: user.id, acteurId,
    });
    return user;
  }

  /**
   * `RG-USR-08` — un service doit appartenir au département choisi.
   *
   * Sans ce contrôle, on pourrait rattacher un agent du département A à un
   * service du département B, ce qui élargirait silencieusement son périmètre
   * de lecture (`RG-SCOPE-01`). Une règle de formulaire est ici une règle de
   * cloisonnement.
   */
  private async verifierServices(departementId: string | null, serviceIds: string[]) {
    if (serviceIds.length === 0) return;
    if (!departementId) throw new ErreurUtilisateur("service_hors_departement");

    const services = await this.prisma.service.findMany({
      where: { id: { in: serviceIds } },
      select: { id: true, departementId: true, nom: true },
    });
    const intrus = services.filter((s) => s.departementId !== departementId);
    if (intrus.length > 0 || services.length !== serviceIds.length) {
      throw new ErreurUtilisateur("service_hors_departement", {
        services: intrus.map((s) => s.nom),
      });
    }
  }

  // ── Cycle de vie — EX-USR-05, EX-USR-06 ──────────────────────────────────

  /**
   * `EX-USR-05` — désactivation, **réversible**.
   *
   * `RG-USR-02` — nul ne peut se désactiver soi-même.
   * `RG-AUTH-05` — un compte désactivé perd ses sessions : sans cela, la
   * désactivation ne prendrait effet qu'à la prochaine connexion, c'est-à-dire
   * jamais pour quelqu'un déjà connecté.
   */
  async desactiver(id: string, acteurId: string, version: number) {
    if (id === acteurId) throw new ErreurUtilisateur("soi_meme_interdit");
    const avant = await this.prisma.user.findUnique({ where: { id }, select: { actif: true, version: true } });
    if (!avant) throw new ErreurUtilisateur("introuvable");
    if (avant.version !== version) throw new ErreurUtilisateur("conflit_de_version");
    if (!avant.actif) throw new ErreurUtilisateur("conflit_de_version");
    try {
      await this.prisma.$transaction([
        this.prisma.user.update({
          where: { id, version, actif: true },
          data: { actif: false, version: { increment: 1 } },
        }),
        this.prisma.session.deleteMany({ where: { userId: id } }),
      ]);
    } catch (erreur) {
      if (codePrisma(erreur) === "P2025") throw new ErreurUtilisateur("conflit_de_version");
      throw erreur;
    }
    await this.audit.tracer({
      action: "user.deactivate", typeEntite: "User", entiteId: id, acteurId,
    });
  }

  async reactiver(id: string, acteurId: string, version: number) {
    if (id === acteurId) throw new ErreurUtilisateur("soi_meme_interdit");
    const avant = await this.prisma.user.findUnique({ where: { id }, select: { actif: true, version: true } });
    if (!avant) throw new ErreurUtilisateur("introuvable");
    if (avant.version !== version) throw new ErreurUtilisateur("conflit_de_version");
    if (avant.actif) throw new ErreurUtilisateur("conflit_de_version");
    try {
      await this.prisma.user.update({
        where: { id, version, actif: false },
        data: { actif: true, version: { increment: 1 } },
      });
    } catch (erreur) {
      if (codePrisma(erreur) === "P2025") throw new ErreurUtilisateur("conflit_de_version");
      throw erreur;
    }
    await this.audit.tracer({
      action: "user.reactivate", typeEntite: "User", entiteId: id, acteurId,
    });
  }

  /**
   * `RG-USR-03` — **contrôle de dépendances avant suppression définitive.**
   *
   * Exposé comme opération à part entière : la fenêtre de confirmation
   * l'appelle pour se peupler, et l'action n'est possible qu'ensuite. Le
   * cadrage est explicite — « si des éléments actifs subsistent, elle est
   * refusée et la liste des blocages est affichée ».
   *
   * Distinction assumée : ce qui **bloque** et ce qui sera **effacé**. Du temps
   * déclaré bloque, parce qu'il est comptable ; des to-do personnelles
   * s'effacent, parce qu'elles n'appartiennent qu'à l'intéressé.
   */
  async impactSuppression(id: string): Promise<{
    nom: string;
    login: string;
    version: number;
    blocages: Blocage[];
    effacements: Blocage[];
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { prenom: true, nom: true, login: true, version: true },
    });
    if (!user) throw new ErreurUtilisateur("introuvable");

    const [temps, projetsDiriges, tachesAssignees, congesApprouves, todos, notifications] =
      await Promise.all([
        this.prisma.timeEntry.count({ where: { userId: id } }),
        this.prisma.project.count({ where: { OR: [{ chefId: id }, { sponsorId: id }] } }),
        this.prisma.taskAssignee.count({ where: { userId: id } }),
        this.prisma.leave.count({ where: { userId: id, statut: "approved" } }),
        this.prisma.todo.count({ where: { userId: id } }),
        this.prisma.notification.count({ where: { userId: id } }),
      ]);

    const blocages: Blocage[] = [];
    if (temps > 0) blocages.push({ objet: "temps", nombre: temps });
    if (projetsDiriges > 0) blocages.push({ objet: "projets", nombre: projetsDiriges });
    if (congesApprouves > 0) blocages.push({ objet: "conges", nombre: congesApprouves });

    const effacements: Blocage[] = [];
    if (tachesAssignees > 0) effacements.push({ objet: "assignations", nombre: tachesAssignees });
    if (todos > 0) effacements.push({ objet: "todos", nombre: todos });
    if (notifications > 0) effacements.push({ objet: "notifications", nombre: notifications });

    return {
      nom: `${user.prenom} ${user.nom}`,
      login: user.login,
      version: user.version,
      blocages,
      effacements,
    };
  }

  /**
   * `EX-USR-06`, `RG-USR-04` — suppression définitive, **irréversible**.
   *
   * Le contrôle de dépendances est rejoué ici, et pas seulement à
   * l'affichage : entre la confirmation et l'exécution, une saisie de temps a
   * pu apparaître. Se fier au contrôle d'affichage serait un « dernier arrivé
   * gagne » déguisé.
   */
  async supprimerDefinitivement(id: string, acteurId: string, version: number) {
    if (id === acteurId) throw new ErreurUtilisateur("soi_meme_interdit");

    const impact = await this.impactSuppression(id);
    if (impact.version !== version) throw new ErreurUtilisateur("conflit_de_version");
    if (impact.blocages.length > 0) {
      throw new ErreurUtilisateur("suppression_bloquee", { blocages: impact.blocages });
    }

    // La trace est écrite AVANT la suppression : après, l'acteur et la cible
    // seraient perdus. RG-USR-04 efface l'historique de l'utilisateur, pas
    // celui du journal — qui est en ajout seul.
    await this.audit.tracer({
      action: "user.delete_permanently",
      typeEntite: "User",
      entiteId: id,
      acteurId,
      detail: { nom: impact.nom, efface: impact.effacements },
    });

    try {
      await this.prisma.user.delete({ where: { id, version } });
    } catch (erreur) {
      if (codePrisma(erreur) === "P2025") throw new ErreurUtilisateur("conflit_de_version");
      throw erreur;
    }
  }

  /**
   * `EX-USR-07` — réinitialiser le mot de passe d'un utilisateur.
   *
   * `RG-USR-05` — **un administrateur ne peut pas réinitialiser le sien par cet
   * outil** : il passe par le changement de mot de passe personnel, qui exige
   * le mot de passe actuel. Sans cette règle, un poste laissé ouvert
   * permettrait de s'approprier le compte sans connaître son mot de passe.
   */
  async reinitialiserMotDePasse(id: string, nouveau: string, acteurId: string) {
    if (id === acteurId) throw new ErreurUtilisateur("soi_meme_interdit");

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: { motDePasseHash: await hacherMotDePasse(nouveau), motDePasseAChanger: true },
      }),
      this.prisma.session.deleteMany({ where: { userId: id } }),
    ]);
    await this.audit.tracer({
      action: "user.reset_password", typeEntite: "User", entiteId: id, acteurId,
    });
  }
}

const codePrisma = (erreur: unknown): string | undefined =>
  typeof erreur === "object" && erreur !== null && "code" in erreur
    ? String((erreur as { code?: unknown }).code)
    : undefined;
