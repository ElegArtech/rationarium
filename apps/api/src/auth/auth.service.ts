import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { PrismaService } from "../prisma.service.js";
import { AuditService } from "../commun/audit.service.js";
import { FileService, FILE_COURRIEL } from "../notifications/file.service.js";
import {
  estVisuelAvatarPredefini,
  type VisuelAvatarPredefini,
} from "@rationarium/contracts";
import {
  hacherMotDePasse,
  verifierMotDePasse,
  engendrerJeton,
  hacherJeton,
} from "./mots-de-passe.js";
import {
  TAILLE_MAX_AVATAR,
  detecterTypeAvatar,
  lireAvatar,
  stockerAvatar,
  type TypeAvatar,
} from "./avatar.js";

/**
 * Erreurs métier de l'authentification.
 *
 * Chaque code correspond à un message rédigé pour les vues 01 à 05.
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
  | "nouveau_identique"
  | "email_deja_pris"
  | "login_deja_pris"
  | "domaine_non_autorise"
  | "domaine_email_non_autorise"
  | "mot_de_passe_actuel_requis"
  | "mot_de_passe_actuel_incorrect"
  | "inscription_desactivee"
  | "avatar_ambigu"
  | "avatar_predefini_invalide"
  | "avatar_format_invalide"
  | "avatar_vide"
  | "avatar_trop_volumineux"
  | "avatar_introuvable"
  | "conflit_de_version";

export class ErreurAuth extends Error {
  constructor(
    readonly code: EchecAuth,
    /** Le détail chiffré du refus, transmis au client tel quel (`detail`). */
    readonly detail?: Record<string, unknown>,
  ) {
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

/** `RG-AUTH-12` — borne de la mémoire des identifiants inconnus. */
const MAX_INCONNUS = 10_000;

/**
 * `RG-AUTH-13` — une session n'est réécrite qu'une fois par intervalle : sans
 * cette borne, chaque requête authentifiée coûtait une écriture en base.
 */
const INTERVALLE_GLISSEMENT_MS = 5 * 60_000;

/**
 * L'adresse publique de l'instance, pour le lien du courriel.
 *
 * `RATIONARIUM_HOTE` peut porter PLUSIEURS noms séparés par des virgules — le
 * fichier Compose l'autorise, Caddy les accepte —, et un lien n'en veut qu'un.
 * On prend le premier plutôt que de fabriquer une adresse illisible.
 */
const adressePubliqueInstance = (): string => {
  const explicite = process.env["RATIONARIUM_URL_PUBLIQUE"]?.trim();
  if (explicite) return explicite.replace(/\/+$/, "");
  const hote = process.env["RATIONARIUM_HOTE"]?.split(",")[0]?.trim();
  return hote ? `https://${hote}` : "http://localhost:4173";
};

@Injectable()
export class AuthService {
  private readonly journal = new Logger(AuthService.name);

  /** `RG-AUTH-12` — échecs sur des identifiants inconnus, voir `echecInconnu`. */
  private readonly inconnus = new Map<string, { echecs: number; verrouilleJusqua: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    /**
     * La file de travaux — `RG-NTF-04`.
     *
     * `@Optional()` pour que les tests d'intégration qui construisent le
     * service à la main continuent de le faire ; **le montage réel n'est pas
     * facultatif pour autant**, et `auth.module.test.ts` l'affirme. Un
     * fournisseur non monté ne casse rien : il se tait, et c'est exactement
     * ainsi que le courriel de réinitialisation a disparu sans un message.
     */
    @Optional() @Inject(FileService) private readonly file?: FileService,
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
      // RG-AUTH-14 — l'un des deux seuls lecteurs légitimes du haché.
      omit: { motDePasseHash: false },
    });

    if (!user) return this.echecInconnu(identifiant, motDePasse, r, contexte);

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

    const verdict = await this.verifierSousCompteur(user, motDePasse, r, contexte, {
      echec: "auth.login.failed",
    });
    if (verdict === "verrouille") throw new ErreurAuth("compte_verrouille");
    // RG-AUTH-02 — même code que pour un identifiant inconnu.
    if (verdict === "invalide") throw new ErreurAuth("identifiants_invalides");

    // RG-AUTH-05 — un utilisateur inactif ne peut pas se connecter.
    // Vérifié APRÈS le mot de passe : sinon l'inactivité d'un compte serait
    // devinable sans le connaître.
    if (!user.actif) {
      // La tentative réservée par `verifierSousCompteur` n'était pas un échec.
      await this.prisma.user.update({ where: { id: user.id }, data: { echecsConnexion: 0 } });
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
          derniereActivite: new Date(),
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

  /**
   * `RG-AUTH-01` — **le compteur d'échecs ne se contourne pas en parallèle.**
   *
   * Le service lisait `echecsConnexion`, attendait Argon2 — plusieurs dizaines
   * de millisecondes —, puis écrivait `lu + 1`. Vingt requêtes lancées
   * ensemble lisaient toutes zéro et écrivaient toutes un : vingt essais de
   * mot de passe pour un compte réglé à cinq, et jamais de verrou.
   *
   * La tentative est donc **réservée avant la vérification**, par un
   * incrément atomique qui rend la valeur obtenue (`UPDATE … RETURNING`) et
   * qui ne prend pas sur un compte déjà verrouillé. Chaque requête connaît
   * ainsi son rang sans avoir lu celui des autres :
   *
   * - au-delà du seuil, elle est refusée sans que le mot de passe soit
   *   vérifié, et pose le verrou — une réservation orpheline (processus tombé
   *   entre l'incrément et la fin) ne laisse donc pas le compteur au-dessus du
   *   seuil pour toujours ;
   * - au seuil, un échec verrouille ;
   * - une réussite remet le compteur à zéro, à la charge de l'appelant.
   *
   * Partagé par la connexion, le changement de mot de passe et le changement
   * d'adresse : un mot de passe se devine par n'importe laquelle de ces
   * portes, et une seule d'entre elles comptait.
   *
   * L'instant est passé en millisecondes et converti en UTC par la base :
   * Prisma écrit ses `DateTime` en UTC dans une colonne sans fuseau, et c'est
   * l'horloge du serveur — celle que les tests figent — qui fait foi.
   */
  private async verifierSousCompteur(
    user: { id: string; motDePasseHash: string },
    motDePasse: string,
    r: Reglages,
    contexte: { ip?: string | undefined },
    actions: { echec: string },
  ): Promise<"valide" | "invalide" | "verrouille"> {
    const maintenant = Date.now();
    const lignes = await this.prisma.$queryRaw<{ echecs: number }[]>`
      UPDATE "users" SET "echecsConnexion" = "echecsConnexion" + 1
      WHERE "id" = ${user.id}::uuid
        AND ("verrouilleJusqua" IS NULL
             OR "verrouilleJusqua" <= (to_timestamp(${maintenant}::double precision / 1000) AT TIME ZONE 'UTC'))
      RETURNING "echecsConnexion" AS "echecs"`;
    const rang = lignes[0]?.echecs;

    if (rang === undefined) {
      // Verrouillé entre la lecture de l'appelant et cette écriture.
      await this.audit.tracer({
        action: "auth.login.locked",
        typeEntite: "User",
        entiteId: user.id,
        acteurId: user.id,
        detail: { ip: contexte.ip },
      });
      return "verrouille";
    }
    if (rang > r.tentativesAvantVerrouillage) {
      await this.verrouiller(user.id, r);
      await this.audit.tracer({
        action: "auth.login.lockout",
        typeEntite: "User",
        entiteId: user.id,
        detail: { tentatives: rang, ip: contexte.ip },
      });
      return "verrouille";
    }

    if (await verifierMotDePasse(user.motDePasseHash, motDePasse)) return "valide";

    const verrouiller = rang >= r.tentativesAvantVerrouillage;
    if (verrouiller) await this.verrouiller(user.id, r);
    await this.audit.tracer({
      action: verrouiller ? "auth.login.lockout" : actions.echec,
      typeEntite: "User",
      entiteId: user.id,
      detail: { tentatives: rang, ip: contexte.ip },
    });
    return verrouiller ? "verrouille" : "invalide";
  }

  private async verrouiller(userId: string, r: Reglages): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        echecsConnexion: 0,
        verrouilleJusqua: new Date(Date.now() + r.dureeVerrouillageMinutes * 60_000),
      },
    });
  }

  /**
   * `RG-AUTH-12` — **un identifiant inconnu se verrouille comme un compte réel.**
   *
   * `RG-AUTH-02` rendait le même message aux deux échecs, mais le
   * verrouillage n'existait que pour un compte en base : cinq essais sur un
   * identifiant, et « Trop de tentatives » au cinquième voulait dire « ce
   * compte existe ». Chaque message était tenu ; leur séquence trahissait.
   *
   * Le compteur des inconnus vit en mémoire — rien à écrire en base pour un
   * compte qui n'y est pas —, avec le seuil et la durée des comptes réels, lus
   * aux mêmes réglages et appliqués avec la même mécanique : au seuil, le
   * compteur repart à zéro et le verrou court `dureeVerrouillageMinutes`.
   * L'identifiant est normalisé en minuscules : sans cela, varier la casse
   * remettrait le compteur à zéro.
   *
   * Borné à `MAX_INCONNUS` entrées : une `Map` garde l'ordre d'insertion, et
   * chaque écriture réinsère la clé, si bien que la première est toujours la
   * plus anciennement touchée. Un balayage d'identifiants inventés ne fait
   * donc pas grossir la mémoire du serveur sans fin.
   */
  private async echecInconnu(
    identifiant: string,
    motDePasse: string,
    r: Reglages,
    contexte: { ip?: string },
  ): Promise<never> {
    const cle = identifiant.toLowerCase();
    const maintenant = Date.now();
    const etat = this.inconnus.get(cle) ?? { echecs: 0, verrouilleJusqua: 0 };

    if (etat.verrouilleJusqua > maintenant) {
      // Comme un compte réel verrouillé : aucune vérification, refus direct.
      await this.audit.tracer({
        action: "auth.login.locked",
        typeEntite: "User",
        detail: { identifiant, motif: "inconnu", ip: contexte.ip },
      });
      throw new ErreurAuth("compte_verrouille");
    }

    /*
     * `RG-AUTH-01` — le compteur avance AVANT l'attente : lu, attendu, puis
     * écrit `lu + 1`, il laissait des requêtes parallèles lire toutes le même
     * état et ne compter qu'un échec. Sans `await` entre la lecture et
     * l'écriture, la boucle d'événements les sérialise.
     */
    const echecs = etat.echecs + 1;
    const verrouiller = echecs >= r.tentativesAvantVerrouillage;
    this.inconnus.delete(cle);
    this.inconnus.set(cle, {
      echecs: verrouiller ? 0 : echecs,
      verrouilleJusqua: verrouiller ? maintenant + r.dureeVerrouillageMinutes * 60_000 : 0,
    });
    while (this.inconnus.size > MAX_INCONNUS) {
      const plusAncienne = this.inconnus.keys().next().value;
      if (plusAncienne === undefined) break;
      this.inconnus.delete(plusAncienne);
    }

    // Empreinte factice : le coût de vérification doit être le même.
    await verifierMotDePasse(
      "$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRzb21lc2FsdA$0000000000000000000000000000000000000000000",
      motDePasse,
    );

    await this.audit.tracer({
      action: verrouiller ? "auth.login.lockout" : "auth.login.failed",
      typeEntite: "User",
      detail: { identifiant, motif: "inconnu", tentatives: echecs, ip: contexte.ip },
    });
    // RG-AUTH-02 — mêmes codes que pour un compte réel.
    throw new ErreurAuth(verrouiller ? "compte_verrouille" : "identifiants_invalides");
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

    /*
     * `EX-AUTH-02`, `RG-AUTH-13` — la session glisse : l'usage repousse
     * l'expiration. Le commentaire d'origine le disait, et le code ne
     * réécrivait que `derniereActivite` — une session ouverte expirait à
     * trente jours pile, utilisée ou non, au prix d'une écriture par requête.
     *
     * L'écriture est bornée à une par intervalle : l'expiration perd au plus
     * cinq minutes de glissement, la base gagne une écriture sur des centaines.
     */
    const maintenant = new Date();
    if (maintenant.getTime() - session.derniereActivite.getTime() >= INTERVALLE_GLISSEMENT_MS) {
      const { dureeSessionJours } = await this.reglages();
      await this.prisma.session.update({
        where: { id: session.id },
        data: {
          derniereActivite: maintenant,
          expireLe: new Date(maintenant.getTime() + dureeSessionJours * 86_400_000),
        },
      });
    }

    return {
      userId: session.userId,
      sessionId: session.id,
      motDePasseAChanger: session.user.motDePasseAChanger,
    };
  }

  /**
   * Révoque les sessions d'un compte — désactivation, suppression, changement
   * de mot de passe.
   *
   * `sauf` épargne **une** session : celle qui vient de faire le geste. Sans
   * elle, changer son mot de passe depuis la vue 05 revenait à se déconnecter
   * soi-même — voir `changerMotDePasse`. Les révocations décidées par un tiers
   * (désactivation d'un compte) ne la passent pas : elles doivent tout couper.
   */
  async revoquerSessions(userId: string, options: { sauf?: string } = {}): Promise<number> {
    const { count } = await this.prisma.session.deleteMany({
      where: { userId, ...(options.sauf ? { id: { not: options.sauf } } : {}) },
    });
    return count;
  }

  // ── Mot de passe ─────────────────────────────────────────────────────────

  /**
   * `RG-AUTH-07` — le changement par l'intéressé exige le mot de passe actuel.
   *
   * `EX-AUTH-07`, `RG-AUTH-06` — **la session qui fait le changement survit.**
   * Le service appelait `revoquerSessions(userId)`, qui supprime TOUTES les
   * sessions du compte, y compris celle qui venait de s'authentifier pour
   * changer le mot de passe. Séquence relevée en recette :
   * `POST /auth/change-password` → 200, navigation vers `/`, `GET /auth/me`
   * → 401, retour sur `/mot-de-passe-impose` avec un formulaire vide et
   * **aucun message**. L'utilisateur avait bel et bien changé son mot de passe
   * et restait enfermé sur la vue 05, condamné à recommencer avec un ancien
   * mot de passe qui n'existait plus.
   *
   * Le commentaire d'origine disait « invalide les AUTRES sessions » : il
   * décrivait l'intention juste et le code faisait autre chose. C'est
   * `conserverSessionId` qui la rend vraie, et le contrôleur la fournit —
   * l'appelant est le seul à savoir depuis quelle session on agit.
   */
  async changerMotDePasse(
    userId: string,
    actuel: string,
    nouveau: string,
    options: { conserverSessionId?: string; ip?: string } = {},
  ): Promise<void> {
    /*
     * `RG-AUTH-07`, `RG-AUTH-11` — le nouveau mot de passe diffère de l'actuel.
     * La vue 05 le refusait côté client seulement : une requête directe
     * levait l'obligation de changement en reposant le mot de passe
     * provisoire, que l'administrateur connaît.
     */
    if (nouveau === actuel) throw new ErreurAuth("nouveau_identique");

    const r = await this.reglages();
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      // RG-AUTH-14 — un lecteur légitime du haché : la vérification.
      select: { id: true, motDePasseHash: true, verrouilleJusqua: true },
    });
    /*
     * `RG-AUTH-01` — les échecs comptent ici comme à la connexion. Cette
     * route n'avait ni compteur ni limite de débit propre : une session volée
     * y essayait des mots de passe à volonté, et le bon la rendait
     * propriétaire du compte.
     */
    if (user.verrouilleJusqua && user.verrouilleJusqua > new Date()) {
      throw new ErreurAuth("compte_verrouille");
    }
    const verdict = await this.verifierSousCompteur(user, actuel, r, { ip: options.ip }, {
      echec: "auth.password.change_failed",
    });
    if (verdict === "verrouille") throw new ErreurAuth("compte_verrouille");
    if (verdict === "invalide") throw new ErreurAuth("ancien_mot_de_passe_incorrect");

    const motDePasseHash = await hacherMotDePasse(nouveau);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { motDePasseHash, motDePasseAChanger: false, echecsConnexion: 0 },
      }),
      /*
       * `RG-AUTH-04` — un lien de réinitialisation demandé AVANT le changement
       * ne vaut plus après : sinon le geste qu'on fait quand on soupçonne une
       * compromission laissait ouverte la porte que l'intrus venait de
       * demander.
       */
      this.prisma.passwordResetToken.deleteMany({ where: { userId, utiliseLe: null } }),
    ]);
    // Un changement de mot de passe invalide les autres sessions : c'est le
    // geste qu'on fait quand on soupçonne une compromission. Celle qui l'a
    // demandé n'en fait pas partie — elle vient de prouver qui elle est.
    await this.revoquerSessions(userId, {
      ...(options.conserverSessionId ? { sauf: options.conserverSessionId } : {}),
    });
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

    /*
     * `RG-AUTH-04` — **un seul lien actif par compte.** Chaque demande en
     * ajoutait un sans retirer les précédents : dix demandes, dix liens
     * valables deux heures dans une boîte aux lettres, et le dernier reçu
     * n'était pas le seul à ouvrir le compte. Les jetons non consommés sont
     * retirés dans la même transaction que la création du nouveau ; un ancien
     * lien répond désormais « invalide ». Les jetons consommés restent : ils
     * font l'historique, et « déjà utilisé » reste vrai pour eux.
     */
    const jeton = engendrerJeton();
    await this.prisma.$transaction([
      this.prisma.passwordResetToken.deleteMany({ where: { userId: user.id, utiliseLe: null } }),
      this.prisma.passwordResetToken.create({
        data: {
          jetonHash: hacherJeton(jeton),
          userId: user.id,
          expireLe: new Date(Date.now() + r.dureeJetonReinitialisationHeures * 3_600_000),
        },
      }),
    ]);

    await this.envoyerLienDeReinitialisation(
      user.email,
      jeton,
      r.dureeJetonReinitialisationHeures,
    );
    return { jeton, userId: user.id };
  }

  /**
   * `EX-AUTH-05` — **le lien part.**
   *
   * Le point d'entrée appelait `demanderReinitialisation`, recevait le jeton en
   * clair et le JETAIT : `AuthModule` n'importait aucun service de courriel,
   * rien n'était mis en file, et la vue 03 affirmait pourtant « un lien de
   * réinitialisation vient d'être envoyé ». La demande était donc enregistrée
   * en base, le jeton créé, valable deux heures — et personne ne pouvait
   * l'obtenir. La fonction entière était absente, ce qui ne fait échouer aucun
   * contrôle.
   *
   * `RG-NTF-04` — l'envoi est **toujours** une mise en file : un relais SMTP
   * en panne ne doit pas faire échouer la demande, et la vue 03 doit répondre
   * la même chose que l'adresse existe ou non. `publier` ne lève jamais ; le
   * `try` est le second filet, comme dans `NotificationsService`.
   *
   * Le corps est rédigé en français, comme les autres courriels sortants du
   * produit : le serveur ne connaît pas la langue du lecteur, et la traduction
   * des courriels est une décision qui n'a pas été prise (voir compte rendu).
   */
  private async envoyerLienDeReinitialisation(
    destinataire: string,
    jeton: string,
    heures: number,
  ): Promise<void> {
    const lien = `${adressePubliqueInstance()}/reinitialisation?jeton=${encodeURIComponent(jeton)}`;
    try {
      if (!this.file) {
        this.journal.error(
          "La file de travaux n'est pas injectée : aucun lien de réinitialisation ne peut partir.",
        );
        return;
      }
      await this.file.publier(FILE_COURRIEL, {
        destinataire,
        sujet: "Réinitialisation de votre mot de passe",
        corps: [
          "Une réinitialisation de mot de passe a été demandée pour votre compte Rationarium.",
          "",
          "Ouvrez ce lien pour choisir un nouveau mot de passe :",
          lien,
          "",
          `Ce lien est valable ${heures} h et ne peut servir qu'une seule fois.`,
          "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message :",
          "votre mot de passe reste inchangé.",
        ].join("\n"),
      });
    } catch {
      // Silencieux DE PROPOS DÉLIBÉRÉ : la demande a abouti, et la vue 03 doit
      // répondre la même chose dans tous les cas (RG-AUTH-02 dans l'esprit).
    }
  }

  /**
   * `RG-AUTH-04` — **l'état d'un jeton, AVANT d'ouvrir le formulaire.**
   *
   * Il n'existait aucun point d'entrée de vérification : la vue 04 ouvrait son
   * formulaire complet sur un jeton expiré, déjà consommé ou inconnu, et
   * l'utilisateur ne découvrait l'échec **qu'après** avoir choisi et confirmé
   * un mot de passe. Les trois messages distincts existaient et étaient justes ;
   * ils arrivaient après le geste que la règle existe pour épargner.
   *
   * Les trois échecs sont **les mêmes codes** que ceux de la réinitialisation
   * elle-même : la vue 04 a déjà leurs trois panneaux, avec leurs sorties
   * distinctes, et ils s'affichent désormais à l'ouverture.
   *
   * L'adresse est rendue parce que la vue l'affiche — « Compte concerné ». Elle
   * ne fuit rien : qui tient le jeton a reçu le courriel.
   */
  async verifierJetonReinitialisation(jeton: string): Promise<{ email: string }> {
    const enregistre = await this.prisma.passwordResetToken.findUnique({
      where: { jetonHash: hacherJeton(jeton) },
      include: { user: { select: { email: true, actif: true } } },
    });
    if (!enregistre) throw new ErreurAuth("jeton_invalide");
    if (enregistre.utiliseLe) throw new ErreurAuth("jeton_deja_utilise");
    if (enregistre.expireLe <= new Date()) throw new ErreurAuth("jeton_expire");
    // Un compte désactivé entre-temps : le lien ne mène plus nulle part, et
    // dire « expiré » serait faux. « Invalide » est la seule réponse juste.
    if (!enregistre.user.actif) throw new ErreurAuth("jeton_invalide");
    return { email: enregistre.user.email };
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

    const motDePasseHash = await hacherMotDePasse(nouveau);
    await this.prisma.$transaction(async (tx) => {
      /*
       * `RG-AUTH-04` — usage unique, y compris sous deux requêtes simultanées :
       * la consommation est conditionnelle, et seule la première l'obtient.
       */
      const { count } = await tx.passwordResetToken.updateMany({
        where: { id: enregistre.id, utiliseLe: null },
        data: { utiliseLe: new Date() },
      });
      if (count === 0) throw new ErreurAuth("jeton_deja_utilise");
      await tx.user.update({
        where: { id: enregistre.userId },
        data: { motDePasseHash, motDePasseAChanger: false },
      });
      // Les autres liens en cours tombent avec le mot de passe qu'ils visaient.
      await tx.passwordResetToken.deleteMany({
        where: { userId: enregistre.userId, utiliseLe: null },
      });
      await tx.session.deleteMany({ where: { userId: enregistre.userId } });
    });

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
   * depuis un jeton porté par le client. Elles servent à la
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
   * `docs/reference-fonctionnelle.md § 3.2`.
   */
  /** EX-AUTH-07, vue 05 — expliquer le blocage sans divulguer le journal. */
  async motifChangementMotDePasse(userId: string, impose: boolean): Promise<{
    motifChangementMotDePasse: "premiere" | "administrateur" | null;
    motDePasseReinitialiseLe: string | null;
  }> {
    if (!impose) return { motifChangementMotDePasse: null, motDePasseReinitialiseLe: null };
    // L'action réelle est user.reset_password ; seul l'horodatage du compte
    // authentifié est nécessaire. L'acteur et les détails ne sortent jamais.
    const reset = await this.prisma.auditLog.findFirst({
      where: { action: "user.reset_password", typeEntite: "User", entiteId: userId },
      orderBy: { horodatage: "desc" },
      select: { horodatage: true },
    });
    return {
      motifChangementMotDePasse: reset ? "administrateur" : "premiere",
      motDePasseReinitialiseLe: reset?.horodatage.toISOString() ?? null,
    };
  }

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
        motDePasseAChanger: true,
        derniereConnexion: true,
        creeLe: true,
        /* `RG-GEN-07` — `modificationProfilSchema` EXIGE la version lue. Elle
           manquait ici : la vue 35 ne pouvait donc pas composer une requête
           valide, et ses commandes d'enregistrement sont restées désactivées
           derrière un commentaire affirmant que la route n'existait pas. Elle
           existait. C'est ce champ qui manquait. */
        version: true,
        departement: { select: { nom: true } },
        services: { select: { service: { select: { nom: true } } } },
        role: { select: { code: true, nom: true, systeme: true, permissions: { select: { permission: true } } } },
      },
    });
    if (!u) throw new ErreurAuth("identifiants_invalides");

    const { role, creeLe, departement, services, ...identite } = u;
    const avatarPredefini = identite.avatarPredefini &&
      estVisuelAvatarPredefini(identite.avatarPredefini)
      ? identite.avatarPredefini
      : null;
    return {
      ...identite,
      /** Seul un identifiant du catalogue partagé traverse la session. */
      avatarPredefini,
      /** URL personnelle stable ; l'identifiant de compte ne circule pas. */
      avatarUrl: identite.avatarFichier ? "/api/auth/me/avatar" : null,
      role: role ? { code: role.code, nom: role.nom, systeme: role.systeme } : null,
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
      avatarPredefini?: VisuelAvatarPredefini | null | undefined;
      motDePasseActuel?: string | undefined;
      version: number;
    },
    contexte: { ip?: string | undefined } = {},
  ) {
    const avant = await this.prisma.user.findUnique({
      where: { id: userId },
      // RG-AUTH-14 — lu pour la seule vérification du changement d'adresse.
      omit: { motDePasseHash: false },
    });
    if (!avant) throw new ErreurAuth("identifiants_invalides");

    /*
     * `RG-AUTH-09` — l'avatar est soit un fichier, soit un visuel prédéfini,
     * soit rien. Le contrôle porte sur l'état RÉSULTANT, pas sur le corps
     * reçu : poser un fichier sans effacer le prédéfini déjà là produirait les
     * deux à la fois, et le schéma seul ne peut pas le voir.
     */
    if (d.avatarFichier && d.avatarPredefini) throw new ErreurAuth("avatar_ambigu");
    const fichier = d.avatarPredefini
      ? null
      : d.avatarFichier !== undefined
        ? d.avatarFichier
        : avant.avatarFichier;
    const predefini = d.avatarPredefini !== undefined ? d.avatarPredefini : avant.avatarPredefini;
    if (predefini && !estVisuelAvatarPredefini(predefini)) {
      throw new ErreurAuth("avatar_predefini_invalide");
    }
    if (fichier && predefini) throw new ErreurAuth("avatar_ambigu");

    /*
     * `RG-AUTH-16` — **changer d'adresse exige le mot de passe actuel.**
     *
     * L'adresse est la clé de la réinitialisation : qui la change reçoit le
     * prochain lien. Sans cette exigence, une session volée — un poste resté
     * ouvert suffit — remplaçait l'adresse puis demandait un lien, et devenait
     * propriétaire du compte sans avoir jamais connu son mot de passe.
     * `RG-USR-05` ferme la même porte côté administration ; le profil la
     * laissait ouverte.
     *
     * L'adresse est normalisée en minuscules comme à l'inscription et à
     * l'administration : la connexion la cherche en minuscules, et une adresse
     * en capitales ne s'y retrouvait plus. Les échecs comptent dans le compteur
     * de verrouillage (`RG-AUTH-01`), et la liste blanche de domaines de
     * l'inscription (`RG-AUTH-03`) s'applique à la nouvelle adresse.
     */
    const email = d.email?.trim().toLowerCase();
    const changeEmail = email !== undefined && email !== avant.email;
    if (changeEmail) {
      if (!d.motDePasseActuel) throw new ErreurAuth("mot_de_passe_actuel_requis");
      const r = await this.reglages();
      if (avant.verrouilleJusqua && avant.verrouilleJusqua > new Date()) {
        throw new ErreurAuth("compte_verrouille");
      }
      const verdict = await this.verifierSousCompteur(avant, d.motDePasseActuel, r, contexte, {
        echec: "user.email_change_failed",
      });
      if (verdict === "verrouille") throw new ErreurAuth("compte_verrouille");
      if (verdict === "invalide") throw new ErreurAuth("mot_de_passe_actuel_incorrect");
      await this.prisma.user.update({ where: { id: userId }, data: { echecsConnexion: 0 } });

      if (r.domainesAutorises.length > 0) {
        const domaine = email.split("@")[1] ?? "";
        if (!r.domainesAutorises.includes(domaine)) {
          throw new ErreurAuth("domaine_email_non_autorise");
        }
      }
      const pris = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
      if (pris) throw new ErreurAuth("email_deja_pris");
    }

    // `RG-GEN-07` — la version lue conditionne l'écriture. Jamais « dernier
    // arrivé gagne » : deux onglets ouverts sur le même profil se détectent.
    const { count } = await this.prisma.user.updateMany({
      where: { id: userId, version: d.version },
      data: {
        ...(d.prenom !== undefined ? { prenom: d.prenom } : {}),
        ...(d.nom !== undefined ? { nom: d.nom } : {}),
        ...(changeEmail ? { email } : {}),
        ...(d.langue !== undefined ? { langue: d.langue } : {}),
        ...(d.theme !== undefined ? { theme: d.theme } : {}),
        ...(d.avatarFichier !== undefined ? { avatarFichier: d.avatarFichier } : {}),
        ...(d.avatarPredefini ? { avatarFichier: null } : {}),
        ...(d.avatarPredefini !== undefined ? { avatarPredefini: d.avatarPredefini } : {}),
        version: { increment: 1 },
      },
    });
    if (count === 0) throw new ErreurAuth("conflit_de_version");

    if (changeEmail) {
      await this.audit.tracer({
        action: "user.email_changed",
        typeEntite: "User",
        entiteId: userId,
        acteurId: userId,
        detail: { avant: avant.email, apres: email, ip: contexte.ip },
      });
      await this.avertirChangementAdresse(avant.email, email, avant.langue);
    }

    return this.profil(userId);
  }

  /**
   * `RG-AUTH-16` — **l'ANCIENNE adresse est prévenue.** C'est la seule que le
   * titulaire lit encore si quelqu'un d'autre a fait le changement : prévenir
   * la nouvelle préviendrait l'intrus.
   *
   * Rédigé dans la langue enregistrée du compte : c'est la seule information
   * de langue dont dispose le serveur. Comme le lien de réinitialisation, une
   * mise en file qui ne lève jamais (`RG-NTF-04`) : le changement a eu lieu,
   * et un relais SMTP en panne ne le défait pas.
   */
  private async avertirChangementAdresse(
    ancienne: string,
    nouvelle: string,
    langue: string,
  ): Promise<void> {
    const instance = adressePubliqueInstance();
    const message =
      langue === "en"
        ? {
            sujet: "Your email address was changed",
            corps: [
              "The email address of your Rationarium account has just been changed.",
              "",
              `New address: ${nouvelle}`,
              "",
              "If you made this change, no action is needed.",
              "If you did not, contact your administrator immediately:",
              "someone may be using your account.",
              "",
              instance,
            ],
          }
        : {
            sujet: "Votre adresse de messagerie a été modifiée",
            corps: [
              "L'adresse de messagerie de votre compte Rationarium vient d'être modifiée.",
              "",
              `Nouvelle adresse : ${nouvelle}`,
              "",
              "Si vous êtes à l'origine de ce changement, vous n'avez rien à faire.",
              "Sinon, prévenez immédiatement votre administrateur :",
              "quelqu'un utilise peut-être votre compte.",
              "",
              instance,
            ],
          };
    try {
      if (!this.file) {
        this.journal.error(
          "La file de travaux n'est pas injectée : l'avis de changement d'adresse ne peut pas partir.",
        );
        return;
      }
      await this.file.publier(FILE_COURRIEL, {
        destinataire: ancienne,
        sujet: message.sujet,
        corps: message.corps.join("\n"),
      });
    } catch {
      // Le changement est fait ; l'avis manqué ne doit pas le faire échouer.
    }
  }

  /**
   * `EX-AUTH-09`, `RG-AUTH-09` — téléverser son avatar personnel.
   *
   * Le type est établi depuis la signature réelle. Le MIME déclaré n'est
   * qu'une vérification supplémentaire et ne peut jamais rendre valide un
   * contenu qui ne l'est pas. La version lue conditionne l'écriture.
   */
  async televerserAvatar(
    userId: string,
    donnees: { contenu: Buffer; typeMime: string; version: number },
  ) {
    if (donnees.contenu.byteLength === 0) throw new ErreurAuth("avatar_vide");
    if (donnees.contenu.byteLength > TAILLE_MAX_AVATAR) {
      throw new ErreurAuth("avatar_trop_volumineux", { maxOctets: TAILLE_MAX_AVATAR });
    }
    const typeMime = detecterTypeAvatar(donnees.contenu);
    if (!typeMime || typeMime !== donnees.typeMime) {
      throw new ErreurAuth("avatar_format_invalide");
    }

    const empreinte = await stockerAvatar(donnees.contenu);
    const { count } = await this.prisma.user.updateMany({
      where: { id: userId, version: donnees.version },
      data: {
        avatarFichier: empreinte,
        // Les trois états sont exclusifs : un fichier personnel remplace
        // proprement le visuel prédéfini sélectionné auparavant.
        avatarPredefini: null,
        version: { increment: 1 },
      },
    });
    if (count === 0) throw new ErreurAuth("conflit_de_version");
    return this.profil(userId);
  }

  /** `EX-AUTH-09` — lire uniquement l'avatar de la session courante. */
  async avatar(userId: string): Promise<{ contenu: Buffer; typeMime: TypeAvatar }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { avatarFichier: true },
    });
    if (!user?.avatarFichier) throw new ErreurAuth("avatar_introuvable");
    const contenu = await lireAvatar(user.avatarFichier);
    const typeMime = contenu ? detecterTypeAvatar(contenu) : null;
    if (!contenu || !typeMime) throw new ErreurAuth("avatar_introuvable");
    return { contenu, typeMime };
  }

  /** `EX-AUTH-09` — revenir à « aucun avatar », avec concurrence détectée. */
  async supprimerAvatar(userId: string, version: number) {
    const { count } = await this.prisma.user.updateMany({
      where: { id: userId, version },
      data: { avatarFichier: null, avatarPredefini: null, version: { increment: 1 } },
    });
    if (count === 0) throw new ErreurAuth("conflit_de_version");
    return this.profil(userId);
  }
}
