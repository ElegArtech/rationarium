import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service.js";
import { AuditService } from "../commun/audit.service.js";
import {
  hacherMotDePasse,
  verifierMotDePasse,
  engendrerJeton,
  hacherJeton,
} from "./mots-de-passe.js";

/**
 * Erreurs métier de l'authentification.
 *
 * Chaque code correspond à un message rédigé dans `cadrage/02`, vues 01 à 05.
 * Ces messages sont **contractuels** : ils sont vérifiés à la lettre par la
 * boucle de conformité visuelle. Le service ne les formule pas — il nomme la
 * situation, la couche HTTP traduit.
 */
export type EchecAuth =
  | "identifiants_invalides"
  | "compte_verrouille"
  | "compte_inactif"
  | "jeton_expire"
  | "jeton_deja_utilise"
  | "jeton_invalide"
  | "ancien_mot_de_passe_incorrect"
  | "email_deja_pris"
  | "login_deja_pris"
  | "domaine_non_autorise"
  | "inscription_desactivee"
  | "avatar_ambigu"
  | "conflit_de_version";

export class ErreurAuth extends Error {
  constructor(readonly code: EchecAuth) {
    super(code);
  }
}

/** Réglages, tous paramétrables — parti pris n° 3 : jamais de valeur figée. */
type Reglages = {
  tentativesAvantVerrouillage: number;
  dureeVerrouillageMinutes: number;
  dureeSessionJours: number;
  dureeJetonReinitialisationHeures: number;
  inscriptionAutonome: boolean;
  domainesAutorises: string[];
};

const PAR_DEFAUT: Reglages = {
  tentativesAvantVerrouillage: 5,
  dureeVerrouillageMinutes: 15,
  dureeSessionJours: 30,
  dureeJetonReinitialisationHeures: 2,
  inscriptionAutonome: false,
  domainesAutorises: [],
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Le seul réglage que la page de connexion a besoin de connaître. */
  async inscriptionAutonome(): Promise<boolean> {
    return (await this.reglages()).inscriptionAutonome;
  }

  private async reglages(): Promise<Reglages> {
    const lignes = await this.prisma.setting.findMany({
      where: { cle: { startsWith: "auth." } },
    });
    const lu = Object.fromEntries(lignes.map((l) => [l.cle.slice(5), l.valeur]));
    return {
      tentativesAvantVerrouillage: Number(lu.tentativesAvantVerrouillage ?? PAR_DEFAUT.tentativesAvantVerrouillage),
      dureeVerrouillageMinutes: Number(lu.dureeVerrouillageMinutes ?? PAR_DEFAUT.dureeVerrouillageMinutes),
      dureeSessionJours: Number(lu.dureeSessionJours ?? PAR_DEFAUT.dureeSessionJours),
      dureeJetonReinitialisationHeures: Number(
        lu.dureeJetonReinitialisationHeures ?? PAR_DEFAUT.dureeJetonReinitialisationHeures,
      ),
      inscriptionAutonome: (lu.inscriptionAutonome ?? String(PAR_DEFAUT.inscriptionAutonome)) === "true",
      domainesAutorises: (lu.domainesAutorises ?? "").split(",").map((d) => d.trim()).filter(Boolean),
    };
  }

  // ── Connexion — EX-AUTH-01 ───────────────────────────────────────────────

  /**
   * RG-AUTH-02 — le message d'échec ne distingue **jamais** « identifiant
   * inconnu » de « mot de passe erroné ». C'est pourquoi ce service lève le
   * même code dans les deux cas, et pourquoi il vérifie tout de même le mot
   * de passe contre une empreinte factice quand l'utilisateur n'existe pas :
   * sans cela, le temps de réponse trahirait l'existence du compte.
   */
  async connecter(
    identifiant: string,
    motDePasse: string,
    contexte: { ip?: string; agent?: string } = {},
  ): Promise<{ userId: string; jeton: string; motDePasseAChanger: boolean }> {
    const r = await this.reglages();
    const user = await this.prisma.user.findFirst({
      where: { OR: [{ login: identifiant }, { email: identifiant.toLowerCase() }] },
    });

    if (!user) {
      // Empreinte factice : le coût de vérification doit être le même.
      await verifierMotDePasse(
        "$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRzb21lc2FsdA$0000000000000000000000000000000000000000000",
        motDePasse,
      );
      await this.audit.tracer({
        action: "auth.login.failed",
        typeEntite: "User",
        detail: { identifiant, motif: "inconnu", ip: contexte.ip },
      });
      throw new ErreurAuth("identifiants_invalides");
    }

    // RG-AUTH-01 — verrouillage temporaire après N tentatives.
    if (user.verrouilleJusqua && user.verrouilleJusqua > new Date()) {
      await this.audit.tracer({
        action: "auth.login.locked",
        typeEntite: "User",
        entiteId: user.id,
        acteurId: user.id,
        detail: { ip: contexte.ip },
      });
      throw new ErreurAuth("compte_verrouille");
    }

    const valide = await verifierMotDePasse(user.motDePasseHash, motDePasse);

    if (!valide) {
      const echecs = user.echecsConnexion + 1;
      const verrouiller = echecs >= r.tentativesAvantVerrouillage;
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          echecsConnexion: verrouiller ? 0 : echecs,
          verrouilleJusqua: verrouiller
            ? new Date(Date.now() + r.dureeVerrouillageMinutes * 60_000)
            : null,
        },
      });
      await this.audit.tracer({
        action: verrouiller ? "auth.login.lockout" : "auth.login.failed",
        typeEntite: "User",
        entiteId: user.id,
        detail: { tentatives: echecs, ip: contexte.ip },
      });
      // RG-AUTH-02 — même code que pour un identifiant inconnu.
      throw new ErreurAuth(verrouiller ? "compte_verrouille" : "identifiants_invalides");
    }

    // RG-AUTH-05 — un utilisateur inactif ne peut pas se connecter.
    // Vérifié APRÈS le mot de passe : sinon l'inactivité d'un compte serait
    // devinable sans le connaître.
    if (!user.actif) {
      await this.audit.tracer({
        action: "auth.login.failed",
        typeEntite: "User",
        entiteId: user.id,
        detail: { motif: "inactif", ip: contexte.ip },
      });
      throw new ErreurAuth("compte_inactif");
    }

    const jeton = engendrerJeton();
    await this.prisma.$transaction([
      this.prisma.session.create({
        data: {
          jetonHash: hacherJeton(jeton),
          userId: user.id,
          expireLe: new Date(Date.now() + r.dureeSessionJours * 86_400_000),
          adresseIp: contexte.ip ?? null,
          agentUtilisateur: contexte.agent ?? null,
        },
      }),
      this.prisma.user.update({
        where: { id: user.id },
        data: { echecsConnexion: 0, verrouilleJusqua: null, derniereConnexion: new Date() },
      }),
    ]);

    await this.audit.tracer({
      action: "auth.login.success",
      typeEntite: "User",
      entiteId: user.id,
      acteurId: user.id,
      detail: { ip: contexte.ip },
    });

    return { userId: user.id, jeton, motDePasseAChanger: user.motDePasseAChanger };
  }

  // ── Session ──────────────────────────────────────────────────────────────

  /** EX-AUTH-03 — la déconnexion invalide la session. Suppression, pas marquage. */
  async deconnecter(jeton: string, acteurId?: string): Promise<void> {
    const { count } = await this.prisma.session.deleteMany({
      where: { jetonHash: hacherJeton(jeton) },
    });
    if (count > 0) {
      await this.audit.tracer({
        action: "auth.logout",
        typeEntite: "User",
        entiteId: acteurId ?? null,
        acteurId: acteurId ?? null,
      });
    }
  }

  /**
   * Résout une session. Renvoie `null` plutôt que de lever : c'est la garde
   * qui décide de la réponse HTTP, pas le service.
   *
   * RG-AUTH-05 — un compte désactivé après ouverture de session perd l'accès
   * immédiatement : la vérification porte sur l'état courant, pas sur celui
   * qui prévalait à la connexion.
   */
  async resoudreSession(
    jeton: string,
  ): Promise<{ userId: string; sessionId: string; motDePasseAChanger: boolean } | null> {
    const session = await this.prisma.session.findUnique({
      where: { jetonHash: hacherJeton(jeton) },
      include: { user: true },
    });
    if (!session) return null;
    if (session.expireLe <= new Date()) {
      await this.prisma.session.delete({ where: { id: session.id } });
      return null;
    }
    if (!session.user.actif) return null;

    // EX-AUTH-02 — la session glisse : rester connecté entre deux sessions de
    // navigateur suppose que l'usage repousse l'expiration.
    await this.prisma.session.update({
      where: { id: session.id },
      data: { derniereActivite: new Date() },
    });

    return {
      userId: session.userId,
      sessionId: session.id,
      motDePasseAChanger: session.user.motDePasseAChanger,
    };
  }

  /** Révoque toutes les sessions d'un compte — désactivation, suppression, changement de mot de passe. */
  async revoquerSessions(userId: string): Promise<number> {
    const { count } = await this.prisma.session.deleteMany({ where: { userId } });
    return count;
  }

  // ── Mot de passe ─────────────────────────────────────────────────────────

  /** RG-AUTH-07 — le changement par l'intéressé exige le mot de passe actuel. */
  async changerMotDePasse(userId: string, actuel: string, nouveau: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await verifierMotDePasse(user.motDePasseHash, actuel))) {
      throw new ErreurAuth("ancien_mot_de_passe_incorrect");
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { motDePasseHash: await hacherMotDePasse(nouveau), motDePasseAChanger: false },
    });
    // Un changement de mot de passe invalide les autres sessions : c'est le
    // geste qu'on fait quand on soupçonne une compromission.
    await this.revoquerSessions(userId);
    await this.audit.tracer({
      action: "auth.password.changed",
      typeEntite: "User",
      entiteId: userId,
      acteurId: userId,
    });
  }

  /**
   * EX-AUTH-05 — demande de réinitialisation.
   *
   * Ne dit **jamais** si l'adresse existe : la vue 03 exige une confirmation
   * identique dans les deux cas. Le service ne lève donc aucune erreur ici.
   */
  async demanderReinitialisation(email: string): Promise<{ jeton: string; userId: string } | null> {
    const r = await this.reglages();
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || !user.actif) return null;

    const jeton = engendrerJeton();
    await this.prisma.passwordResetToken.create({
      data: {
        jetonHash: hacherJeton(jeton),
        userId: user.id,
        expireLe: new Date(Date.now() + r.dureeJetonReinitialisationHeures * 3_600_000),
      },
    });
    return { jeton, userId: user.id };
  }

  /**
   * EX-AUTH-06 — RG-AUTH-04 : le jeton est à usage unique et il expire.
   * **Les deux cas produisent des messages distincts**, plus un troisième pour
   * le jeton inconnu. Trois sorties, trois codes — vue 04.
   */
  async reinitialiserMotDePasse(jeton: string, nouveau: string): Promise<void> {
    const enregistre = await this.prisma.passwordResetToken.findUnique({
      where: { jetonHash: hacherJeton(jeton) },
    });
    if (!enregistre) throw new ErreurAuth("jeton_invalide");
    if (enregistre.utiliseLe) throw new ErreurAuth("jeton_deja_utilise");
    if (enregistre.expireLe <= new Date()) throw new ErreurAuth("jeton_expire");

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: enregistre.userId },
        data: { motDePasseHash: await hacherMotDePasse(nouveau), motDePasseAChanger: false },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: enregistre.id },
        data: { utiliseLe: new Date() },
      }),
      this.prisma.session.deleteMany({ where: { userId: enregistre.userId } }),
    ]);

    await this.audit.tracer({
      action: "auth.password.reset",
      typeEntite: "User",
      entiteId: enregistre.userId,
      acteurId: enregistre.userId,
    });
  }

  // ── Inscription autonome — EX-AUTH-04 ────────────────────────────────────

  /**
   * RG-AUTH-03 — l'inscription autonome peut être désactivée globalement, et
   * restreinte à une liste de domaines de messagerie autorisés.
   * RG-USR-01 — email et identifiant uniques, avec des messages **distincts**.
   */
  async inscrire(donnees: {
    prenom: string;
    nom: string;
    email: string;
    login: string;
    motDePasse: string;
  }): Promise<string> {
    const r = await this.reglages();
    if (!r.inscriptionAutonome) throw new ErreurAuth("inscription_desactivee");

    const email = donnees.email.toLowerCase();
    if (r.domainesAutorises.length > 0) {
      const domaine = email.split("@")[1] ?? "";
      if (!r.domainesAutorises.includes(domaine)) throw new ErreurAuth("domaine_non_autorise");
    }

    if (await this.prisma.user.findUnique({ where: { email } })) {
      throw new ErreurAuth("email_deja_pris");
    }
    if (await this.prisma.user.findUnique({ where: { login: donnees.login } })) {
      throw new ErreurAuth("login_deja_pris");
    }

    const user = await this.prisma.user.create({
      data: {
        prenom: donnees.prenom,
        nom: donnees.nom,
        email,
        login: donnees.login,
        motDePasseHash: await hacherMotDePasse(donnees.motDePasse),
        // Inscription autonome : le mot de passe est choisi par l'intéressé,
        // pas imposé. Aucun changement forcé à la première connexion.
        motDePasseAChanger: false,
      },
    });

    await this.audit.tracer({
      action: "auth.signup",
      typeEntite: "User",
      entiteId: user.id,
      acteurId: user.id,
    });
    return user.id;
  }

  /**
   * Le profil complet de la session : identité, rôle et **permissions
   * effectives**.
   *
   * Les permissions sont résolues côté serveur à chaque appel, jamais lues
   * depuis un jeton porté par le client (`ADR-0008`). Elles servent à la
   * coquille pour masquer ce qui serait refusé (`RG-GEN-06`) — une courtoisie,
   * pas un contrôle : le contrôle reste la garde, côté serveur.
   *
   * **Le rattachement organisationnel en fait partie** (`EX-AUTH-09`, vue 35).
   * Département, services et date d'entrée sont en lecture seule pour le
   * porteur du compte : ils déterminent son validateur de congés et son
   * périmètre de visibilité, et relèvent de la gestion RH, jamais du profil.
   * Les omettre laissait la vue 35 incapable de dire à l'agent à quelle
   * organisation il appartient — la question à laquelle cette page répond.
   *
   * Aucune permission n'est exigée et aucun périmètre ne s'applique : la
   * lecture porte **exclusivement** sur `userId`, qui vient de la session
   * résolue depuis le cookie et jamais d'un paramètre d'appel. C'est une
   * donnée strictement personnelle, sans domaine au catalogue de
   * `cadrage/01 § 3.2`.
   */
  async profil(userId: string) {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        prenom: true,
        nom: true,
        email: true,
        login: true,
        avatarFichier: true,
        avatarPredefini: true,
        langue: true,
        theme: true,
        derniereConnexion: true,
        creeLe: true,
        departement: { select: { nom: true } },
        services: { select: { service: { select: { nom: true } } } },
        role: { select: { code: true, nom: true, permissions: { select: { permission: true } } } },
      },
    });
    if (!u) throw new ErreurAuth("identifiants_invalides");

    const { role, creeLe, departement, services, ...identite } = u;
    return {
      ...identite,
      role: role ? { code: role.code, nom: role.nom } : null,
      /* Un agent peut appartenir à PLUSIEURS services : la vue les énumère,
         elle n'en choisit pas un. */
      departement: departement?.nom ?? null,
      services: services.map((s) => s.service.nom).sort((a, b) => a.localeCompare(b)),
      /** `EX-AUTH-09` — « Membre depuis » : la date de création du compte. */
      membreDepuis: creeLe,
      // Un compte sans rôle n'a AUCUNE permission : la liste blanche
      // appliquée au cas dégradé.
      permissions: role?.permissions.map((p) => p.permission) ?? [],
    };
  }

  /**
   * `EX-AUTH-09` — **modifier** son profil : identité, avatar, langue, thème.
   *
   * L'exigence dit « consulter ET modifier ». Seule la consultation existait :
   * `GET /auth/me` répondait depuis le premier lot, aucune route n'écrivait
   * jamais. Le thème ne vivait donc que dans le stockage local du navigateur —
   * il s'appliquait, mais ne suivait personne d'une machine à l'autre, alors
   * que la colonne l'attendait en base.
   *
   * Aucune permission n'est exigée : c'est **son** profil. Le périmètre est
   * l'identité de la session, pas un prédicat organisationnel — on ne modifie
   * que la ligne dont on tient le jeton.
   *
   * Les champs sont ÉNUMÉRÉS, jamais diffusés depuis le corps de la requête.
   * Un `...champs` a déjà laissé passer `login` ici, et une règle du domaine se
   * tient dans le service, pas seulement à la frontière HTTP.
   */
  async modifierProfil(
    userId: string,
    d: {
      prenom?: string | undefined;
      nom?: string | undefined;
      email?: string | undefined;
      langue?: string | undefined;
      theme?: string | undefined;
      avatarFichier?: string | null | undefined;
      avatarPredefini?: string | null | undefined;
      version: number;
    },
  ) {
    const avant = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!avant) throw new ErreurAuth("identifiants_invalides");

    /*
     * `RG-AUTH-09` — l'avatar est soit un fichier, soit un visuel prédéfini,
     * soit rien. Le contrôle porte sur l'état RÉSULTANT, pas sur le corps
     * reçu : poser un fichier sans effacer le prédéfini déjà là produirait les
     * deux à la fois, et le schéma seul ne peut pas le voir.
     */
    const fichier = d.avatarFichier !== undefined ? d.avatarFichier : avant.avatarFichier;
    const predefini = d.avatarPredefini !== undefined ? d.avatarPredefini : avant.avatarPredefini;
    if (fichier && predefini) throw new ErreurAuth("avatar_ambigu");

    if (d.email && d.email !== avant.email) {
      const pris = await this.prisma.user.findUnique({ where: { email: d.email } });
      if (pris) throw new ErreurAuth("email_deja_pris");
    }

    // `RG-GEN-07` — la version lue conditionne l'écriture. Jamais « dernier
    // arrivé gagne » : deux onglets ouverts sur le même profil se détectent.
    const { count } = await this.prisma.user.updateMany({
      where: { id: userId, version: d.version },
      data: {
        ...(d.prenom !== undefined ? { prenom: d.prenom } : {}),
        ...(d.nom !== undefined ? { nom: d.nom } : {}),
        ...(d.email !== undefined ? { email: d.email } : {}),
        ...(d.langue !== undefined ? { langue: d.langue } : {}),
        ...(d.theme !== undefined ? { theme: d.theme } : {}),
        ...(d.avatarFichier !== undefined ? { avatarFichier: d.avatarFichier } : {}),
        ...(d.avatarPredefini !== undefined ? { avatarPredefini: d.avatarPredefini } : {}),
        version: { increment: 1 },
      },
    });
    if (count === 0) throw new ErreurAuth("conflit_de_version");

    return this.profil(userId);
  }
}
