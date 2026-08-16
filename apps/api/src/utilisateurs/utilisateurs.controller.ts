import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { motDePasse } from "@trame/contracts";
import { UtilisateursService } from "./utilisateurs.service.js";
import { Demande, RequiertPermission, type ContexteDemande } from "../commun/permissions.garde.js";
import { valider, dateSchema } from "../commun/http.js";

/** M3 — comptes, annuaire, suivi individuel. Vues 27 et 28. */

@Controller("utilisateurs")
export class UtilisateursController {
  constructor(private readonly utilisateurs: UtilisateursService) {}

  /** `EX-USR-01` — l'annuaire, borné au périmètre de l'appelant. */
  @Get()
  @RequiertPermission("users:read")
  lister(@Demande() d: ContexteDemande, @Query() requete: unknown) {
    const filtres = valider(
      z.object({
        recherche: z.string().max(120).optional(),
        departementId: z.uuid().optional(),
        serviceId: z.uuid().optional(),
        roleId: z.uuid().optional(),
        actif: z.stringbool().optional(),
      }),
      requete,
    );
    return this.utilisateurs.lister(d.perimetre, filtres);
  }

  /** `EX-USR-06` — qui est là aujourd'hui : présent, en congé, en télétravail. */
  @Get("presence")
  @RequiertPermission("users:read")
  presence(@Demande() d: ContexteDemande, @Query("jour") jour?: string) {
    const j = jour ? valider(dateSchema, jour) : new Date();
    return this.utilisateurs.presenceDuJour(d.perimetre, j);
  }

  /**
   * `EX-USR-07` — le suivi individuel. Vue 28.
   *
   * Sa permission est **distincte** de la lecture de l'annuaire : voir la
   * liste des agents et voir tout ce qu'une personne a fait ne sont pas le
   * même droit.
   */
  @Get(":id/suivi")
  @RequiertPermission("users:read_individual_tracking")
  suivi(@Param("id") id: string, @Query() requete: unknown) {
    const q = valider(z.object({ debut: dateSchema, fin: dateSchema }), requete);
    return this.utilisateurs.suiviIndividuel(id, q);
  }

  @Post()
  @RequiertPermission("users:create")
  creer(@Body() corps: unknown, @Demande() d: ContexteDemande) {
    const donnees = valider(
      z.object({
        prenom: z.string().min(1).max(80),
        nom: z.string().min(1).max(80),
        email: z.email(),
        login: z.string().min(3).max(60),
        motDePasse,
        roleId: z.uuid().nullish(),
        departementId: z.uuid().nullish(),
        serviceIds: z.array(z.uuid()).optional(),
      }),
      corps,
    );
    return this.utilisateurs.creer(donnees, d.userId);
  }

  /**
   * `RG-GEN-10` — désactiver et supprimer sont **deux gestes distincts**, donc
   * deux points d'entrée et deux permissions. Les confondre ferait de
   * l'irréversible le chemin par défaut.
   */
  /**
   * `EX-USR-02` — modifier un compte.
   *
   * `RG-AUTH-08` : l'identifiant de connexion n'est pas dans les champs
   * acceptés. C'est la clé sous laquelle les traces d'audit ont été écrites,
   * et la changer réécrirait l'histoire.
   */
  @Patch(":id")
  @RequiertPermission("users:update")
  modifier(@Param("id") id: string, @Body() corps: unknown, @Demande() d: ContexteDemande) {
    const donnees = valider(
      z.object({
        version: z.number().int().min(1),
        prenom: z.string().min(1).max(80).optional(),
        nom: z.string().min(1).max(80).optional(),
        email: z.string().email().optional(),
        roleId: z.uuid().nullable().optional(),
        departementId: z.uuid().nullable().optional(),
        serviceIds: z.array(z.uuid()).optional(),
      }),
      corps,
    );
    return this.utilisateurs.modifier(id, donnees, d.userId);
  }

  @Post(":id/desactiver")
  @RequiertPermission("users:deactivate")
  desactiver(@Param("id") id: string, @Demande() d: ContexteDemande) {
    return this.utilisateurs.desactiver(id, d.userId);
  }

  @Post(":id/reactiver")
  @RequiertPermission("users:deactivate")
  reactiver(@Param("id") id: string, @Demande() d: ContexteDemande) {
    return this.utilisateurs.reactiver(id, d.userId);
  }

  /** L'inventaire de ce qui sera perdu — présenté **avant** la confirmation. */
  @Get(":id/impact")
  @RequiertPermission("users:delete_permanently")
  impact(@Param("id") id: string) {
    return this.utilisateurs.impactSuppression(id);
  }

  @Delete(":id")
  @RequiertPermission("users:delete_permanently")
  supprimer(@Param("id") id: string, @Demande() d: ContexteDemande) {
    return this.utilisateurs.supprimerDefinitivement(id, d.userId);
  }

  @Post(":id/mot-de-passe")
  @RequiertPermission("users:reset_password")
  reinitialiser(@Param("id") id: string, @Body() corps: unknown, @Demande() d: ContexteDemande) {
    const { nouveau } = valider(z.object({ nouveau: motDePasse }), corps);
    return this.utilisateurs.reinitialiserMotDePasse(id, nouveau, d.userId);
  }
}
