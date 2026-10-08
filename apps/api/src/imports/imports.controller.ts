import {
  Body,
  Controller,
  ForbiddenException,
  HttpException,
  Get,
  Header,
  Param,
  Post,
  Query,
  Res,
} from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { z } from "zod";
import { ImportsService, TYPES_IMPORT, type TypeImport } from "./imports.service.js";
import {
  Demande,
  RequiertPermission,
  RequiertUnePermissionParmi,
  type ContexteDemande,
} from "../commun/permissions.garde.js";
import { valider } from "../commun/http.js";
import { compterLignesDeDonnees, MAX_LIGNES_IMPORT } from "../commun/import-csv.js";

/**
 * M21 — imports et exports.
 *
 * **Deux points d'entrée par import, jamais un.** `apercu` ne touche à rien,
 * `executer` écrit : c'est `RG-IMP-03` rendu structurel. Un seul point d'entrée
 * avec un drapeau « simulation » aurait la même signature pour deux
 * comportements de nature opposée, et l'oubli du drapeau aurait des
 * conséquences irréversibles.
 */

const typeImport = z.enum(TYPES_IMPORT);
const corpsFichier = z.object({ contenu: z.string().min(1).max(20_000_000) });

/**
 * `RG-IMP-09` — le plafond de lignes, contrôlé AVANT l'analyse : c'est
 * l'analyse elle-même qu'il protège. Le refus dit le nombre trouvé et le
 * plafond, pas un numéro de ligne — aucune ligne n'est fautive, il y en a
 * trop. Posé sur chaque point d'entrée qui reçoit un fichier, aperçu compris :
 * l'aperçu analyse tout autant que l'exécution.
 */
const plafonner = <T extends { contenu: string }>(corps: T): T => {
  const lignes = compterLignesDeDonnees(corps.contenu);
  if (lignes > MAX_LIGNES_IMPORT) {
    throw new HttpException(
      {
        cle: "erreurs:importTropDeLignes",
        message: "Le fichier contient trop de lignes. Découpez-le en plusieurs imports.",
        detail: { lignes, maxLignes: MAX_LIGNES_IMPORT },
      },
      422,
    );
  }
  return corps;
};

/**
 * `RG-IMP-02`, `RG-IMP-03` — **la permission d'un import suit le TYPE importé.**
 *
 * ══════════════════════════════════════════════════════════════════════════
 * Les deux points d'entrée partagés — le modèle et l'aperçu — exigeaient
 * `tasks:import`, quel que soit le type demandé. Le responsable RH détient
 * `leaves:import` et `users:import` et n'a aucune raison de détenir
 * `tasks:import` : son **écriture** passait, sa **prévisualisation** et son
 * **modèle** revenaient en 403.
 *
 * La conséquence n'est pas un désagrément d'ergonomie, c'est deux règles
 * vides sur tous les chemins RH : le format n'était documenté par aucun
 * modèle téléchargeable, et l'import en masse partait **sans que personne ait
 * pu regarder le fichier**. Sur un fichier de deux cents congés, c'est la
 * différence entre une correction et une restauration.
 *
 * Le motif est celui de `RG-TSK-02` et de `champs-gouvernes.ts` : **la garde
 * ouvre la route, le point d'entrée requestionne le paramètre.** La garde ne
 * peut pas trancher seule — la permission dépend d'une donnée de la requête,
 * qu'une métadonnée statique ne connaît pas. Elle laisse donc entrer qui
 * détient au moins une permission d'import, et le tri se fait ici, sur le
 * type réellement demandé.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `projet` prend `tasks:import` comme `POST /imports/projet/:id` : le modèle
 * et l'aperçu d'un type doivent exiger exactement ce qu'exige son exécution,
 * sans quoi on rouvre le défaut par l'autre bout.
 */
const PERMISSION_PAR_TYPE: Record<TypeImport, string> = {
  utilisateurs: "users:import",
  taches: "tasks:import",
  jalons: "milestones:import",
  projet: "tasks:import",
  conges: "leaves:import",
  competences: "skills:import",
};

/**
 * Les permissions qui ouvrent la porte, dérivées de la table — jamais
 * réénumérées. Une liste recopiée finirait par oublier le type ajouté au
 * `TYPES_IMPORT`, et l'oubli se lirait en 403 sur un chemin, pas en erreur.
 */
const PERMISSIONS_IMPORT = [...new Set(Object.values(PERMISSION_PAR_TYPE))];

@Controller("imports")
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  /**
   * La permission du type demandé, contrôlée après celle de la route.
   *
   * Permission puis périmètre, et ici permission de
   * route puis permission de type. Il n'y a rien à cloisonner en dessous :
   * ni le modèle ni l'aperçu ne lisent la base.
   */
  private exigerPermissionDuType(type: TypeImport, d: ContexteDemande): void {
    const requise = PERMISSION_PAR_TYPE[type];
    if (!d.permissions.has(requise)) {
      throw new ForbiddenException({
        cle: "commun:droits.permissionRequise",
        message: `Importer « ${type} » demande la permission « ${requise} ».`,
        detail: { permission: requise, type },
      });
    }
  }

  /** `RG-IMP-02` — le modèle téléchargeable, avec sa ligne d'exemple. */
  @Get("modele")
  @RequiertUnePermissionParmi(...PERMISSIONS_IMPORT)
  @Header("Content-Type", "text/csv; charset=utf-8")
  modele(
    @Query("type") type: string,
    @Demande() d: ContexteDemande,
    @Res() reponse: FastifyReply,
  ) {
    const t = valider(typeImport, type);
    this.exigerPermissionDuType(t, d);
    return reponse
      .header("Content-Disposition", `attachment; filename="modele-${t}.csv"`)
      .send(this.imports.modele(t));
  }

  /** `RG-IMP-03` — la prévisualisation. **Aucune écriture.** */
  @Post("apercu")
  @RequiertUnePermissionParmi(...PERMISSIONS_IMPORT)
  apercu(@Query("type") type: string, @Body() corps: unknown, @Demande() d: ContexteDemande) {
    const t = valider(typeImport, type);
    this.exigerPermissionDuType(t, d);
    const { contenu } = plafonner(valider(corpsFichier, corps));
    return this.imports.analyser(t, contenu);
  }

  @Post("utilisateurs")
  @RequiertPermission("users:import")
  importerUtilisateurs(@Body() corps: unknown, @Demande() d: ContexteDemande) {
    const { contenu } = plafonner(valider(corpsFichier, corps));
    // RG-USR-10 — droits et périmètre de l'acteur, comme pour POST /utilisateurs.
    return this.imports.importerUtilisateurs(contenu, d.userId, d.permissions, d.perimetre);
  }

  /**
   * `EX-CMP-09` — l'import du référentiel de compétences.
   *
   * `skills:import`, pas `tasks:import` : le catalogue de `docs/reference-fonctionnelle.md § 3.2`
   * donne à chaque domaine son action d'import, et emprunter celle d'un autre
   * domaine ouvrirait le référentiel à qui n'a que des droits sur les tâches.
   *
   * Aucun périmètre en dessous : une compétence n'appartient à aucun
   * département. C'est une propriété du référentiel, énoncée dans le service.
   */
  @Post("competences")
  @RequiertPermission("skills:import")
  importerCompetences(@Body() corps: unknown, @Demande() d: ContexteDemande) {
    const { contenu } = plafonner(valider(corpsFichier, corps));
    return this.imports.importerCompetences(contenu, d.userId);
  }

  /**
   * `EX-CNG-14`, `RG-CNG-32` — l'import de congés en masse.
   *
   * Le **périmètre** est transmis au service et appliqué ligne à ligne : la
   * permission dit qui peut importer, le périmètre dit pour qui. Les deux, dans
   * cet ordre.
   */
  @Post("conges")
  @RequiertPermission("leaves:import")
  importerConges(@Body() corps: unknown, @Demande() d: ContexteDemande) {
    const { contenu } = plafonner(valider(corpsFichier, corps));
    return this.imports.importerConges(contenu, d.userId, d.perimetre);
  }

  /** Les volumes que le mode Remplacer va supprimer, avant de le faire. */
  @Get("projet/:id/volumes")
  @RequiertPermission("tasks:import")
  volumes(@Param("id") id: string, @Demande() d: ContexteDemande) {
    return this.imports.volumesRemplacement(id, d.userId, d.permissions);
  }

  /** `RG-IMP-05`, `RG-IMP-06` — l'import projet complet. */
  @Post("projet/:id")
  @RequiertPermission("tasks:import")
  importerProjet(@Param("id") id: string, @Body() corps: unknown, @Demande() d: ContexteDemande) {
    const donnees = plafonner(
      valider(corpsFichier.extend({ mode: z.enum(["ajouter", "remplacer"]).default("ajouter") }), corps),
    );
    return this.imports.importerProjet(id, donnees.contenu, donnees.mode, d.userId, d.permissions);
  }

  /**
   * `EX-TSK-18` — les tâches seules d'un projet. Le client la déclarait, le
   * serveur ne l'exposait pas : un 404 que seule l'action révélait.
   */
  @Post("projet/:id/taches")
  @RequiertPermission("tasks:import")
  importerTaches(@Param("id") id: string, @Body() corps: unknown, @Demande() d: ContexteDemande) {
    const donnees = plafonner(valider(corpsFichier, corps));
    return this.imports.importerTachesProjet(id, donnees.contenu, d.userId, d.permissions);
  }

  /** `EX-JAL-06` — les jalons seuls. Même histoire, même remède. */
  @Post("projet/:id/jalons")
  @RequiertPermission("milestones:import")
  importerJalons(@Param("id") id: string, @Body() corps: unknown, @Demande() d: ContexteDemande) {
    const donnees = plafonner(valider(corpsFichier, corps));
    return this.imports.importerJalonsProjet(id, donnees.contenu, d.userId, d.permissions);
  }

  @Get("export/projet/:id/taches")
  @RequiertPermission("tasks:export")
  async exporterTaches(
    @Param("id") id: string,
    @Demande() d: ContexteDemande,
    @Res() reponse: FastifyReply,
  ) {
    /*
     * `RG-IMP-07` — le contenu est calculé AVANT les en-têtes, et le type CSV
     * n'est posé qu'une fois le contenu obtenu. Posé par `@Header` sur la
     * route, il valait aussi pour la réponse d'ERREUR : le refus de périmètre,
     * un objet JSON, partait sous `text/csv`, Fastify refusait de le
     * sérialiser, et un 403 rédigé devenait un 500.
     */
    const contenu = await this.imports.exporterTaches(id, d.perimetre, d.permissions);
    return reponse
      .header("Content-Type", "text/csv; charset=utf-8")
      .header("Content-Disposition", `attachment; filename="taches-${id}.csv"`)
      .send(contenu);
  }

  @Get("export/projet/:id/jalons")
  @RequiertPermission("tasks:export")
  async exporterJalons(
    @Param("id") id: string,
    @Demande() d: ContexteDemande,
    @Res() reponse: FastifyReply,
  ) {
    const contenu = await this.imports.exporterJalons(id, d.perimetre, d.permissions);
    return reponse
      .header("Content-Type", "text/csv; charset=utf-8")
      .header("Content-Disposition", `attachment; filename="jalons-${id}.csv"`)
      .send(contenu);
  }

  @Get("export/competences")
  @RequiertPermission("skills:export")
  @Header("Content-Type", "text/csv; charset=utf-8")
  async exporterCompetences(@Res() reponse: FastifyReply) {
    return reponse
      .header("Content-Disposition", 'attachment; filename="competences.csv"')
      .send(await this.imports.exporterCompetences());
  }
}
