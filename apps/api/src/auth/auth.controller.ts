import {
  Body,
  Controller,
  HttpCode,
  HttpException,
  Post,
  Patch,
  Get,
  Req,
  Res,
} from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import {
  connexionSchema,
  inscriptionSchema,
  changementMotDePasseSchema,
  modificationProfilSchema,
  motDePasse as politiqueMotDePasse,
} from "@trame/contracts";
import { z } from "zod";
import { AuthService, ErreurAuth } from "./auth.service.js";
import { Public } from "../commun/permissions.garde.js";
import { MESSAGES } from "./messages.js";

const COOKIE = "trame_session";

/** Le cookie de session : `HttpOnly`, `SameSite=Lax`, `Secure`. ADR-0008. */
const optionsCookie = (jours: number) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: jours * 86_400,
});

const valider = <T>(schema: z.ZodType<T>, donnees: unknown): T => {
  const r = schema.safeParse(donnees);
  if (!r.success) {
    throw new HttpException(
      { message: "Données invalides", details: r.error.issues.map((i) => ({ champ: i.path.join("."), message: i.message })) },
      400,
    );
  }
  return r.data;
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
  @Public()
  @Post("change-password")
  @HttpCode(200)
  async changePassword(@Body() corps: unknown, @Req() req: FastifyRequest) {
    const jeton = req.cookies?.[COOKIE];
    const session = jeton ? await this.auth.resoudreSession(jeton) : null;
    if (!session) throw new HttpException({ message: "Session requise" }, 401);

    const d = valider(changementMotDePasseSchema, corps);
    try {
      await this.auth.changerMotDePasse(session.userId, d.actuel, d.nouveau);
      return { cle: "auth.motDePasseChange", message: "Mot de passe modifié" };
    } catch (e) {
      return traduire(e);
    }
  }

  /** EX-AUTH-09, EX-AUTH-10 — qui suis-je, et quand me suis-je connecté ? */
  @Public()
  @Get("me")
  async me(@Req() req: FastifyRequest) {
    const jeton = req.cookies?.[COOKIE];
    const session = jeton ? await this.auth.resoudreSession(jeton) : null;
    if (!session) throw new HttpException({ cle: "auth:erreurs.sessionRequise", message: "Session requise" }, 401);
    return {
      ...(await this.auth.profil(session.userId)),
      motDePasseAChanger: session.motDePasseAChanger,
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
   * Pas de `@RequirePermission` : le catalogue des vingt-quatre domaines est
   * FERMÉ par `cadrage/01 § 3.2`, et modifier son propre profil n'y trouve pas
   * de domaine — en inventer un serait ajouter au catalogue par initiative. Le
   * cloisonnement est ici l'identité de la session : on n'écrit que sur la
   * ligne dont on tient le jeton, jamais sur un identifiant reçu du client.
   */
  @Public()
  @Patch("me")
  async modifierProfil(@Body() corps: unknown, @Req() req: FastifyRequest) {
    const jeton = req.cookies?.[COOKIE];
    const session = jeton ? await this.auth.resoudreSession(jeton) : null;
    if (!session)
      throw new HttpException({ cle: "auth:erreurs.sessionRequise", message: "Session requise" }, 401);

    const d = valider(modificationProfilSchema, corps);
    try {
      return await this.auth.modifierProfil(session.userId, d);
    } catch (e) {
      return traduire(e);
    }
  }
}
