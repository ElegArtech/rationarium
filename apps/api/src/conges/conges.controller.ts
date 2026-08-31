import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from "@nestjs/common";
import { z } from "zod";
import { enumDe, DEMI_JOURNEES, STATUTS_CONGE } from "@rationarium/contracts";
import { CongesService } from "./conges.service.js";
import { Demande, RequiertPermission, type ContexteDemande } from "../commun/permissions.garde.js";
import { valider, dateSchema } from "../commun/http.js";

/** M10 — congés : cycle de vie, validation, délégations, soldes. Vue 19. */

const demi = enumDe(DEMI_JOURNEES).nullish();
const plageDemandee = z.object({
  dateDebut: dateSchema,
  dateFin: dateSchema,
  demiJourneeDebut: demi,
  demiJourneeFin: demi,
  motif: z.string().max(2000).optional(),
});

@Controller("conges")
export class CongesController {
  constructor(private readonly conges: CongesService) {}

  @Get()
  @RequiertPermission("leaves:read")
  lister(@Demande() d: ContexteDemande, @Query() requete: unknown) {
    const filtres = valider(
      z.object({
        userId: z.uuid().optional(),
        aValider: z.stringbool().optional(),
        statut: enumDe(STATUTS_CONGE).optional(),
        annee: z.coerce.number().int().optional(),
      }),
      requete,
    );
    return this.conges.lister(d.perimetre, filtres, d.userId);
  }

  /** `EX-CNG-16` — le catalogue des types de congé, avec leur usage. */
  @Get("types")
  @RequiertPermission("leaves:read")
  types(@Query("inclureInactifs") inclureInactifs?: string) {
    return this.conges.typesDeConge(inclureInactifs === "true");
  }

  /** `EX-CNG-19` — les délégations données et reçues. */
  @Get("delegations")
  @RequiertPermission("leaves:read")
  delegations(@Demande() d: ContexteDemande, @Query("userId") userId?: string) {
    return this.conges.delegations(userId ?? d.userId);
  }

  /**
   * Tous les soldes d'une personne pour une année, en un appel.
   *
   * Six appels afficheraient six compteurs qui arrivent l'un après l'autre,
   * là où la vue 19 les montre ensemble.
   */
  @Get("soldes")
  @RequiertPermission("leaves:read")
  soldes(@Demande() d: ContexteDemande, @Query() requete: unknown) {
    const q = valider(
      z.object({ userId: z.uuid().optional(), annee: z.coerce.number().int() }),
      requete,
    );
    return this.conges.soldes(q.userId ?? d.userId, q.annee);
  }

  /**
   * `RG-CNG-24` — attribuer des jours, par agent ou globalement.
   *
   * Le point d'entrée manquait, et rien n'écrivait une seule allocation : sur
   * une instance neuve tous les soldes valaient zéro, donc `RG-CNG-20`
   * refusait toute demande. Le module était inutilisable et aucun contrôle ne
   * le disait — chaque test fabriquait son allocation avant de commencer.
   *
   * `userId` omis vaut le **défaut global**, que l'allocation propre à l'agent
   * surclasse.
   */
  @Put("soldes")
  @RequiertPermission("leaves:manage_balances")
  attribuerSolde(@Body() corps: unknown, @Demande() d: ContexteDemande) {
    const donnees = valider(
      z.object({
        userId: z.uuid().nullable().optional(),
        typeId: z.uuid(),
        annee: z.number().int().min(2000).max(2100),
        joursAttribues: z.number().min(0).max(365),
        version: z.number().int().optional(),
      }),
      corps,
    );
    return this.conges.attribuerSolde(
      { ...donnees, userId: donnees.userId ?? null },
      d.userId,
    );
  }

  /**
   * `EX-CNG-13` — le solde d'un type, pour une année.
   *
   * Il est **calculé**, jamais stocké comme un compteur décrémenté : un
   * compteur diverge dès la première annulation mal propagée, et rien ne le
   * signale.
   */
  @Get("solde")
  @RequiertPermission("leaves:read")
  solde(@Demande() d: ContexteDemande, @Query() requete: unknown) {
    const q = valider(
      z.object({
        userId: z.uuid().optional(),
        typeId: z.uuid(),
        annee: z.coerce.number().int(),
      }),
      requete,
    );
    return this.conges.solde(q.userId ?? d.userId, q.typeId, q.annee);
  }

  /** `RG-CNG-08` — qui validera cette demande, à cette date. */
  @Get("validateur")
  @RequiertPermission("leaves:read")
  validateur(@Demande() d: ContexteDemande, @Query() requete: unknown) {
    const q = valider(
      z.object({ userId: z.uuid().optional(), date: dateSchema }),
      requete,
    );
    return this.conges
      .determinerValidateur(q.userId ?? d.userId, q.date)
      .then((validateurId) => ({ validateurId }));
  }

  @Post()
  @RequiertPermission("leaves:create")
  async deposer(@Body() corps: unknown, @Demande() d: ContexteDemande) {
    const donnees = valider(
      plageDemandee.extend({ typeId: z.uuid(), userId: z.uuid().optional() }),
      corps,
    );
    const pour = donnees.userId ?? d.userId;

    // `EX-CNG-11` — déclarer pour un collaborateur est une permission à part,
    // et le périmètre s'y applique en plus : avoir le droit ne dit pas sur qui.
    if (pour !== d.userId) {
      await this.conges.verifierDeclarationPourAutrui(pour, d.perimetre, d.permissions);
    }
    return this.conges.deposer({ ...donnees, userId: pour }, d.userId);
  }

  @Patch(":id")
  @RequiertPermission("leaves:update")
  modifier(@Param("id") id: string, @Body() corps: unknown, @Demande() d: ContexteDemande) {
    return this.conges.modifier(id, valider(plageDemandee, corps), d.userId);
  }

  @Delete(":id")
  @RequiertPermission("leaves:delete")
  supprimer(@Param("id") id: string, @Demande() d: ContexteDemande) {
    return this.conges.supprimer(id, d.userId);
  }

  // ── Circuit de validation ────────────────────────────────────────────────

  /**
   * `RG-CNG-22` — le solde est **recontrôlé à l'approbation**, sous verrou.
   *
   * Entre le dépôt et la validation, d'autres demandes ont pu passer. Valider
   * sur la foi du solde affiché à l'écran laisserait passer un dépassement que
   * personne ne verrait.
   */
  @Post(":id/approuver")
  @RequiertPermission("leaves:approve")
  approuver(@Param("id") id: string, @Demande() d: ContexteDemande) {
    return this.conges.approuver(id, d.userId, d.permissions);
  }

  @Post(":id/refuser")
  @RequiertPermission("leaves:approve")
  refuser(@Param("id") id: string, @Body() corps: unknown, @Demande() d: ContexteDemande) {
    // `RG-CNG-10` — le motif est obligatoire au refus. Un refus sans motif
    // renvoie l'agent au manager pour poser la question de vive voix.
    const { motifRefus } = valider(z.object({ motifRefus: z.string().min(1).max(2000) }), corps);
    return this.conges.refuser(id, motifRefus, d.userId);
  }

  @Post(":id/annulation")
  @RequiertPermission("leaves:request_cancellation")
  demanderAnnulation(@Param("id") id: string, @Demande() d: ContexteDemande) {
    return this.conges.demanderAnnulation(id, d.userId);
  }

  @Post(":id/annulation/traiter")
  @RequiertPermission("leaves:approve")
  traiterAnnulation(@Param("id") id: string, @Body() corps: unknown, @Demande() d: ContexteDemande) {
    const { accepte } = valider(z.object({ accepte: z.boolean() }), corps);
    return this.conges.traiterAnnulation(id, accepte, d.userId);
  }

  // ── Délégations — EX-CNG-19 ──────────────────────────────────────────────

  @Post("delegations")
  @RequiertPermission("leaves:manage_delegations")
  creerDelegation(@Body() corps: unknown, @Demande() d: ContexteDemande) {
    const donnees = valider(
      z.object({
        delegantId: z.uuid(),
        delegueId: z.uuid(),
        dateDebut: dateSchema,
        dateFin: dateSchema,
      }),
      corps,
    );
    return this.conges.creerDelegation(donnees, d.userId);
  }

  @Delete("delegations/:id")
  @RequiertPermission("leaves:manage_delegations")
  desactiverDelegation(@Param("id") id: string, @Demande() d: ContexteDemande) {
    return this.conges.desactiverDelegation(id, d.userId, d.permissions);
  }

  @Delete("types/:id")
  @RequiertPermission("leaves:manage_types")
  supprimerType(@Param("id") id: string, @Demande() d: ContexteDemande) {
    return this.conges.supprimerType(id, d.userId);
  }
}
