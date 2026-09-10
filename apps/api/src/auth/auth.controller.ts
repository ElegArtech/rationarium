import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpException,
  Post,
  Patch,
  Get,
  Req,
  Res,
  StreamableFile,
} from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import {
  connexionSchema,
  inscriptionSchema,
  changementMotDePasseSchema,
  modificationProfilSchema,
  motDePasse as politiqueMotDePasse,
} from "@rationarium/contracts";
import { z } from "zod";
import { AuthService, ErreurAuth } from "./auth.service.js";
import { Public, Personnel, Demande, type ContexteDemande } from "../commun/permissions.garde.js";
import { MESSAGES } from "./messages.js";

const COOKIE = "rationarium_session";

/** Le cookie de session : `HttpOnly`, `SameSite=Lax`, `Secure`. ADR-0008. */
const optionsCookie = (jours: number) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: jours * 86_400,
});

const valider = <T>(
  schema: z.ZodType<T>,
  donnees: unknown,
  erreurPersonnalisee?: (erreur: z.ZodError<T>) => never,
): T => {
  const r = schema.safeParse(donnees);
  if (!r.success) {
    if (erreurPersonnalisee) return erreurPersonnalisee(r.error);
    throw new HttpException(
      { message: "Données invalides", details: r.error.issues.map((i) => ({ champ: i.path.join("."), message: i.message })) },
      400,
    );
  }
  return r.data;
};

/**
 * `RG-AUTH-06` — la page doit pouvoir afficher la règle, pas seulement
 * « données invalides ». Le schéma partagé reste l'autorité de validation ;
 * cette fonction rend ses refus en langue naturelle au niveau supérieur de
 * la réponse, que tous les clients savent afficher.
 */
const erreurChangementMotDePasse = (erreur: z.ZodError<z.infer<typeof changementMotDePasseSchema>>): never => {
  const confirmation = erreur.issues.find((i) => i.path[0] === "confirmation");
  const actuel = erreur.issues.find((i) => i.path[0] === "actuel");
  const message = confirmation
    ? "Les mots de passe ne correspondent pas"
    : actuel
      ? "Saisissez votre mot de passe actuel."
      : "Le mot de passe doit contenir au moins 8 caractères, une majuscule, un chiffre et un caractère spécial.";
  throw new HttpException(
    {
      cle: "auth:erreurs.politiqueMotDePasse",
      message,
      details: erreur.issues.map((i) => ({ champ: i.path.join("."), message: i.message })),
    },
    400,
  );
};

const traduire = (e: unknown): never => {
  if (e instanceof ErreurAuth) {
    const m = MESSAGES[e.code];
    throw new HttpException({ cle: m.cle, message: m.message }, m.statut);
  }
  throw e;
};

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /**
   * Ce que la page de connexion doit savoir **avant** toute session.
   *
   * `design/etats.json` déclare pour la vue 01 un axe « Inscription autonome :
   * activée · désactivée ». Sans ce point d'entrée, le client ne pouvait pas
   * connaître le réglage : il passait `false` en dur, et la variante activée
   * était **inatteignable** — un état spécifié, maquetté, et impossible à
   * produire. Trouvé par le comparateur de conformité, pas par une boucle.
   *
   * Il ne rend que ce qui est nécessaire à l'affichage, et rien d'autre : une
   * route publique n'est pas une fenêtre sur le paramétrage.
   */
  @Public()
  @Get("acces")
  async acces() {
    return { inscriptionAutonome: await this.auth.inscriptionAutonome() };
  }

  /** EX-AUTH-01 — se connecter par identifiant ou email. */
  @Public()
  @Post("login")
  @HttpCode(200)
  async login(
    @Body() corps: unknown,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const d = valider(connexionSchema, corps);
    try {
      const agent = req.headers["user-agent"];
      const r = await this.auth.connecter(d.identifiant, d.motDePasse, {
        ip: req.ip,
        ...(agent ? { agent } : {}),
      });
      res.setCookie(COOKIE, r.jeton, optionsCookie(30));
      // EX-AUTH-07 — le client saura qu'il doit rediriger vers la vue 05.
      return { userId: r.userId, motDePasseAChanger: r.motDePasseAChanger };
    } catch (e) {
      return traduire(e);
    }
  }

  /** EX-AUTH-03 — se déconnecter, en invalidant la session. */
  @Public()
  @Post("logout")
  @HttpCode(204)
  async logout(@Req() req: FastifyRequest, @Res({ passthrough: true }) res: FastifyReply) {
    const jeton = req.cookies?.[COOKIE];
    if (jeton) {
      const session = await this.auth.resoudreSession(jeton);
      await this.auth.deconnecter(jeton, session?.userId);
    }
    res.clearCookie(COOKIE, { path: "/" });
  }

  /** EX-AUTH-04 — créer un compte en autonomie, quand l'organisation l'autorise. */
  @Public()
  @Post("signup")
  @HttpCode(201)
  async signup(@Body() corps: unknown) {
    const d = valider(inscriptionSchema, corps);
    try {
      const userId = await this.auth.inscrire(d);
      return { userId };
    } catch (e) {
      return traduire(e);
    }
  }

  /**
   * EX-AUTH-05 — demander une réinitialisation.
   *
   * RG-AUTH-02 dans l'esprit : la réponse est **identique** que l'adresse
   * existe ou non. La vue 03 l'exige explicitement.
   */
  @Public()
  @Post("forgot-password")
  @HttpCode(202)
  async forgotPassword(@Body() corps: unknown) {
    const d = valider(z.object({ email: z.string().email() }), corps);
    await this.auth.demanderReinitialisation(d.email);
    return {
      cle: "auth.reinitialisationEnvoyee",
      message: "Si un compte existe pour cette adresse, un lien de réinitialisation a été envoyé.",
    };
  }

  /**
   * `RG-AUTH-04` — **l'état du lien, avant le formulaire.**
   *
   * Il n'existait aucun point d'entrée de vérification : la vue 04 ouvrait son
   * formulaire complet sur un jeton expiré, consommé ou inconnu, et
   * l'utilisateur ne l'apprenait qu'après avoir choisi ET confirmé un mot de
   * passe. La règle veut épargner ce geste ; elle ne le pouvait pas.
   *
   * `POST` et non `GET` : un jeton dans un chemin d'URL finit dans les journaux
   * du serveur frontal et dans l'historique du navigateur. Le corps de requête
   * n'y finit pas.
   */
  @Public()
  @Post("verify-reset-token")
  @HttpCode(200)
  async verifierJeton(@Body() corps: unknown) {
    const d = valider(z.object({ jeton: z.string().min(1) }), corps);
    try {
      return await this.auth.verifierJetonReinitialisation(d.jeton);
    } catch (e) {
      return traduire(e);
    }
  }

  /** EX-AUTH-06 — définir un nouveau mot de passe depuis un lien reçu. */
  @Public()
  @Post("reset-password")
  @HttpCode(200)
  async resetPassword(@Body() corps: unknown) {
    const d = valider(
      z.object({ jeton: z.string().min(1), motDePasse: politiqueMotDePasse }),
      corps,
    );
    try {
      await this.auth.reinitialiserMotDePasse(d.jeton, d.motDePasse);
      return { cle: "auth.motDePasseReinitialise", message: "Mot de passe réinitialisé" };
    } catch (e) {
      return traduire(e);
    }
  }

  /** EX-AUTH-08 — changer son mot de passe depuis son profil. */
  @Personnel()
  @Post("change-password")
  @HttpCode(200)
  async changePassword(@Body() corps: unknown, @Req() req: FastifyRequest) {
    const jeton = req.cookies?.[COOKIE];
    const session = jeton ? await this.auth.resoudreSession(jeton) : null;
    if (!session) throw new HttpException({ message: "Session requise" }, 401);

    const d = valider(changementMotDePasseSchema, corps, erreurChangementMotDePasse);
    try {
      /*
       * La session courante est ÉPARGNÉE : sans cela, le changement de mot de
       * passe imposé révoquait la session qui venait de le faire, et
       * l'utilisateur revenait sur la vue 05 avec un formulaire vide et aucun
       * message (`EX-AUTH-07`, `RG-AUTH-06`).
       */
      await this.auth.changerMotDePasse(session.userId, d.actuel, d.nouveau, {
        conserverSessionId: session.sessionId,
      });
      return { cle: "auth.motDePasseChange", message: "Mot de passe modifié" };
    } catch (e) {
      return traduire(e);
    }
  }

  /** EX-AUTH-09, EX-AUTH-10 — qui suis-je, et quand me suis-je connecté ? */
  @Personnel()
  @Get("me")
  async me(@Demande() demande: ContexteDemande) {
    const profil = await this.auth.profil(demande.userId);
    return {
      ...profil,
      ...(await this.auth.motifChangementMotDePasse(demande.userId, profil.motDePasseAChanger)),
    };
  }

  /**
   * `EX-AUTH-09` — modifier son profil.
   *
   * L'exigence disait « consulter **et** modifier » ; seule la consultation
   * existait. Le thème ne vivait que dans le stockage local du navigateur : il
   * s'appliquait, mais ne suivait personne d'une machine à l'autre, alors que
   * la colonne l'attendait en base.
   *
   * `@Personnel()` et non `@Public()` : le catalogue des vingt-quatre domaines
   * est FERMÉ par `cadrage/01 § 3.2` et modifier son propre profil n'y trouve
   * pas de domaine — en inventer un serait ajouter au catalogue par
   * initiative. Mais `@Public()` signifie « AVANT la session », et cette route
   * en exige une. `surface-http.test.ts` l'a refusée sur-le-champ : sa liste
   * blanche de routes publiques est nominative, et une route de plus s'y voit.
   *
   * Le cloisonnement est l'identité de la session : on n'écrit que sur la ligne
   * dont on tient le jeton, jamais sur un identifiant reçu du client.
   */
  @Personnel()
  @Patch("me")
  async modifierProfil(@Body() corps: unknown, @Demande() demande: ContexteDemande) {
    const d = valider(modificationProfilSchema, corps);
    try {
      return await this.auth.modifierProfil(demande.userId, d);
    } catch (e) {
      return traduire(e);
    }
  }

  /** `EX-AUTH-09`, `RG-AUTH-09` — téléverser une image personnelle réelle. */
  @Personnel()
  @Post("me/avatar")
  async televerserAvatar(@Body() corps: unknown, @Demande() demande: ContexteDemande) {
    const d = valider(
      z.object({
        // La chaîne vide est une base64 syntaxiquement valide ; le service
        // la distingue ensuite comme fichier vide pour rendre un message
        // actionnable au lieu du générique de validation.
        contenuBase64: z.base64(),
        typeMime: z.enum(["image/jpeg", "image/png", "image/webp"]),
        version: z.number().int().positive(),
      }),
      corps,
    );
    try {
      return await this.auth.televerserAvatar(demande.userId, {
        contenu: Buffer.from(d.contenuBase64, "base64"),
        typeMime: d.typeMime,
        version: d.version,
      });
    } catch (e) {
      return traduire(e);
    }
  }

  /** `EX-AUTH-09` — l'image de l'utilisateur authentifié, jamais celle d'un id reçu. */
  @Personnel()
  @Get("me/avatar")
  async lireAvatar(
    @Demande() demande: ContexteDemande,
    @Res({ passthrough: true }) reponse: FastifyReply,
  ) {
    try {
      const avatar = await this.auth.avatar(demande.userId);
      // L'URL personnelle reste stable après remplacement : sans cette
      // directive, le navigateur pourrait conserver l'ancienne image.
      reponse.header("Cache-Control", "private, no-store");
      return new StreamableFile(avatar.contenu, {
        type: avatar.typeMime,
        disposition: "inline",
        length: avatar.contenu.byteLength,
      });
    } catch (e) {
      return traduire(e);
    }
  }

  /** `EX-AUTH-09` — supprimer son avatar, avec la version qui a été lue. */
  @Personnel()
  @Delete("me/avatar")
  async supprimerAvatar(@Body() corps: unknown, @Demande() demande: ContexteDemande) {
    const { version } = valider(z.object({ version: z.number().int().positive() }), corps);
    try {
      return await this.auth.supprimerAvatar(demande.userId, version);
    } catch (e) {
      return traduire(e);
    }
  }
}
