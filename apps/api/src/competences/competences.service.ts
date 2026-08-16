import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service.js";
import { AuditService } from "../commun/audit.service.js";
import { PerimetreService, type Perimetre } from "../commun/perimetre.service.js";
import type { CategorieCompetence, NiveauCompetence } from "@trame/contracts";

/**
 * Compétences — M13, vue 22.
 *
 * L'objet de ce module n'est pas de collectionner des savoir-faire : c'est de
 * répondre à *« sommes-nous couverts ? »*. D'où la notion centrale
 * d'**effectif requis** (`RG-CMP-01`) et son corollaire, l'**écart de
 * compétence** (`RG-CMP-02`) — le nombre de personnes qui manquent.
 */

export type EchecCompetence =
  | "nom_deja_pris"
  | "competence_assignee"
  | "introuvable";

export class ErreurCompetence extends Error {
  constructor(
    readonly code: EchecCompetence,
    readonly detail?: Record<string, unknown>,
  ) {
    super(code);
  }
}

@Injectable()
export class CompetencesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly perimetres: PerimetreService,
  ) {}

  /** `EX-CMP-01` — le référentiel. `RG-CMP-05` — les noms sont uniques. */
  async creer(
    donnees: {
      nom: string; categorie: CategorieCompetence;
      description?: string; effectifRequis?: number;
    },
    acteurId: string,
  ) {
    const existe = await this.prisma.skill.findUnique({
      where: { nom: donnees.nom },
      select: { id: true },
    });
    if (existe) throw new ErreurCompetence("nom_deja_pris", { nom: donnees.nom });

    const competence = await this.prisma.skill.create({
      data: {
        nom: donnees.nom,
        categorie: donnees.categorie,
        description: donnees.description ?? null,
        effectifRequis: donnees.effectifRequis ?? 1,
      },
    });
    await this.audit.tracer({
      action: "skill.create", typeEntite: "Skill", entiteId: competence.id, acteurId,
    });
    return competence;
  }

  /**
   * `RG-CMP-04` — une compétence assignée à des agents ne peut pas être
   * supprimée.
   *
   * Le refus chiffre les détenteurs : supprimer une compétence effacerait leur
   * niveau, information qui n'existe nulle part ailleurs.
   */
  async supprimer(id: string, acteurId: string) {
    const detenteurs = await this.prisma.userSkill.count({ where: { skillId: id } });
    if (detenteurs > 0) {
      throw new ErreurCompetence("competence_assignee", { detenteurs });
    }
    await this.prisma.skill.delete({ where: { id } });
    await this.audit.tracer({
      action: "skill.delete", typeEntite: "Skill", entiteId: id, acteurId,
    });
  }

  /** `EX-CMP-02`, `EX-CMP-03`, `RG-CMP-06` — un agent détient une compétence à UN SEUL niveau. */
  async definirNiveau(
    userId: string,
    skillId: string,
    niveau: NiveauCompetence,
    acteurId: string,
  ) {
    // L'upsert porte la règle : il n'y a pas d'historique de niveaux, il y a
    // le niveau courant. Empiler des lignes créerait deux vérités.
    await this.prisma.userSkill.upsert({
      where: { userId_skillId: { userId, skillId } },
      create: { userId, skillId, niveau },
      update: { niveau },
    });
    await this.audit.tracer({
      action: "skill.set_level", typeEntite: "Skill", entiteId: skillId, acteurId,
      detail: { userId, niveau },
    });
  }

  async retirerCompetence(userId: string, skillId: string, acteurId: string) {
    await this.prisma.userSkill.delete({ where: { userId_skillId: { userId, skillId } } });
    await this.audit.tracer({
      action: "skill.remove", typeEntite: "Skill", entiteId: skillId, acteurId, detail: { userId },
    });
  }

  /**
   * `EX-CMP-01` — le référentiel, avec l'effectif détenteur de chaque
   * compétence.
   *
   * Le compte de détenteurs se lit à côté de l'effectif requis : c'est
   * l'écart entre les deux qui fait l'information, pas l'un des deux seul.
   */
  async referentiel(filtres: { categorie?: CategorieCompetence; recherche?: string } = {}) {
    const clauses: Record<string, unknown>[] = [];
    if (filtres.categorie) clauses.push({ categorie: filtres.categorie });
    if (filtres.recherche) {
      clauses.push({ nom: { contains: filtres.recherche, mode: "insensitive" } });
    }
    const competences = await this.prisma.skill.findMany({
      ...(clauses.length > 0 ? { where: { AND: clauses } } : {}),
      orderBy: [{ categorie: "asc" }, { nom: "asc" }],
      include: { _count: { select: { detenteurs: true } } },
    });
    return competences.map((c) => ({
      ...c,
      detenteurs: c._count.detenteurs,
      manque: Math.max(0, c.effectifRequis - c._count.detenteurs),
    }));
  }

  /**
   * `EX-CMP-04`, `EX-CMP-06` — la matrice collaborateurs × compétences, avec
   * la couverture et les écarts.
   *
   * `RG-CMP-02` — un écart existe lorsque l'effectif détenteur est inférieur à
   * l'effectif requis. **La matrice le signale et chiffre le manque** : dire
   * « couverture partielle » sans dire combien il manque ne permet pas d'agir.
   *
   * `RG-CMP-03` — la couverture est dite complète ou partielle, avec le ratio.
   */
  async matrice(perimetre: Perimetre, filtres: { categorie?: CategorieCompetence } = {}) {
    const [competences, agents] = await Promise.all([
      this.prisma.skill.findMany({
        where: filtres.categorie ? { categorie: filtres.categorie } : {},
        orderBy: [{ categorie: "asc" }, { nom: "asc" }],
      }),
      this.prisma.user.findMany({
        where: { AND: [this.perimetres.filtreUtilisateur(perimetre), { actif: true }] },
        orderBy: [{ nom: "asc" }, { prenom: "asc" }],
        select: { id: true, prenom: true, nom: true },
      }),
    ]);

    const detentions = await this.prisma.userSkill.findMany({
      where: {
        skillId: { in: competences.map((c) => c.id) },
        userId: { in: agents.map((a) => a.id) },
      },
      select: { userId: true, skillId: true, niveau: true },
    });

    const parCle = new Map(detentions.map((d) => [`${d.userId}|${d.skillId}`, d.niveau]));

    // L'effectif détenteur se compte sur TOUTE l'instance, pas sur le seul
    // périmètre visible : la couverture d'une compétence est une propriété de
    // l'organisation, pas de ce qu'on a le droit de voir.
    const effectifs = await this.prisma.userSkill.groupBy({
      by: ["skillId"],
      where: { skillId: { in: competences.map((c) => c.id) }, user: { actif: true } },
      _count: { userId: true },
    });
    const parCompetence = new Map(effectifs.map((e) => [e.skillId, e._count.userId]));

    const colonnes = competences.map((c) => {
      const detenteurs = parCompetence.get(c.id) ?? 0;
      const manque = Math.max(0, c.effectifRequis - detenteurs);
      return {
        id: c.id,
        nom: c.nom,
        categorie: c.categorie,
        effectifRequis: c.effectifRequis,
        detenteurs,
        manque,
        ecart: manque > 0,
        couverture: manque > 0 ? ("partielle" as const) : ("complete" as const),
        ratio: `${detenteurs}/${c.effectifRequis}`,
      };
    });

    return {
      colonnes,
      lignes: agents.map((a) => ({
        agent: a,
        niveaux: competences.map((c) => parCle.get(`${a.id}|${c.id}`) ?? null),
      })),
      synthese: {
        competences: colonnes.length,
        avecEcart: colonnes.filter((c) => c.ecart).length,
        couvertureMoyenne:
          colonnes.length === 0
            ? 0
            : Math.round(
                (colonnes.reduce(
                  (n, c) => n + Math.min(1, c.detenteurs / Math.max(1, c.effectifRequis)),
                  0,
                ) /
                  colonnes.length) *
                  100,
              ),
      },
    };
  }

  /** `EX-CMP-10` — rechercher les agents détenant une compétence donnée. */
  async detenteurs(skillId: string, niveauMinimum?: NiveauCompetence) {
    const ordre: NiveauCompetence[] = ["beginner", "intermediate", "expert", "master"];
    const acceptes = niveauMinimum ? ordre.slice(ordre.indexOf(niveauMinimum)) : ordre;

    return this.prisma.userSkill.findMany({
      where: { skillId, niveau: { in: acceptes }, user: { actif: true } },
      include: { user: { select: { id: true, prenom: true, nom: true } } },
      orderBy: { user: { nom: "asc" } },
    });
  }

  /** `EX-CMP-08` — export de la matrice en CSV. */
  async exporterMatrice(perimetre: Perimetre): Promise<string> {
    const m = await this.matrice(perimetre);
    const entete = ["Agent", ...m.colonnes.map((c) => c.nom)].join(";");
    const lignes = m.lignes.map((l) =>
      [`${l.agent.prenom} ${l.agent.nom}`, ...l.niveaux.map((n) => n ?? "")].join(";"),
    );
    return [entete, ...lignes].join("\n");
  }
}
