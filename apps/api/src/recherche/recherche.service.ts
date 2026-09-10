import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service.js";
import { PerimetreService, type Perimetre } from "../commun/perimetre.service.js";

export type ResultatRecherche = {
  terme: string;
  total: number;
  projets: Array<{ id: string; nom: string; destination: string }>;
  taches: Array<{
    id: string;
    titre: string;
    destination: string;
    projet: { id: string; nom: string } | null;
  }>;
};

/** D-RM-07 — recherche globale bornée aux projets et tâches visibles. */
@Injectable()
export class RechercheService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly perimetres: PerimetreService,
  ) {}

  async rechercher(
    terme: string,
    perimetre: Perimetre,
    permissions: ReadonlySet<string>,
  ): Promise<ResultatRecherche> {
    const recherche = terme.trim();

    // La garde ouvre la route à qui possède au moins un des deux droits. Le
    // service ne transforme jamais ce droit en accès à l'autre famille.
    const [projets, taches] = await Promise.all([
      permissions.has("projects:read")
        ? this.prisma.project.findMany({
            where: {
              AND: [
                this.perimetres.filtreProjet(perimetre, permissions),
                { nom: { contains: recherche, mode: "insensitive" } },
              ],
            },
            orderBy: [{ nom: "asc" }, { id: "asc" }],
            select: { id: true, nom: true },
          })
        : Promise.resolve([]),
      permissions.has("tasks:read")
        ? this.prisma.task.findMany({
            where: {
              AND: [
                this.perimetres.filtreTache(perimetre, permissions),
                { titre: { contains: recherche, mode: "insensitive" } },
              ],
            },
            orderBy: [{ titre: "asc" }, { id: "asc" }],
            select: {
              id: true,
              titre: true,
              project: { select: { id: true, nom: true } },
            },
          })
        : Promise.resolve([]),
    ]);

    const groupes = {
      projets: projets.map((projet) => ({
        id: projet.id,
        nom: projet.nom,
        destination: `/projets/${projet.id}`,
      })),
      taches: taches.map((tache) => ({
        id: tache.id,
        titre: tache.titre,
        destination: `/taches/${tache.id}`,
        projet: tache.project,
      })),
    };

    return {
      terme: recherche,
      total: groupes.projets.length + groupes.taches.length,
      ...groupes,
    };
  }
}
