import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service.js";
import { AuditService } from "../commun/audit.service.js";
import { PerimetreService, type Perimetre } from "../commun/perimetre.service.js";
import type { CategorieCompetence, NiveauCompetence } from "@rationarium/contracts";

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

/**
 * `EX-CMP-07` — les tris, et la divergence de vocabulaire qu'ils portaient.
 *
 * L'exigence disait « trier par nom, **couverture** ou compétence » ; le
 * produit proposait « nom / nombre de compétences / par niveau sur une
 * compétence ». Les deux listes parlaient d'objets différents sans le dire :
 * la **couverture** est le ratio détenteurs/requis (`RG-CMP-03`), donc une
 * propriété de COMPÉTENCE, qui ordonne le référentiel ; « par compétence » ne
 * veut rien dire d'autre que « par niveau sur une compétence choisie », et
 * cela n'ordonne que la matrice, dont les lignes sont des agents.
 *
 * Tranché : deux vocabulaires, un par objet trié. `cadrage/01 § M13` porte
 * désormais la distinction, et le tri par couverture — qui manquait
 * entièrement — existe.
 */
export const TRIS_REFERENTIEL = ["nom", "couverture"] as const;
export type TriReferentiel = (typeof TRIS_REFERENTIEL)[number];

export const TRIS_MATRICE = ["nom", "nombre", "competence"] as const;
export type TriMatrice = (typeof TRIS_MATRICE)[number];

/** L'ordre des niveaux, du plus faible au plus fort — `cadrage/01 § 4.1`. */
const RANG: Record<NiveauCompetence, number> = {
  beginner: 1,
  intermediate: 2,
  expert: 3,
  master: 4,
};

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
   * `EX-CMP-01`, `EX-CMP-07` — le référentiel, avec l'effectif détenteur de
   * chaque compétence, sa recherche, ses filtres et ses tris.
   *
   * Le compte de détenteurs se lit à côté de l'effectif requis : c'est
   * l'écart entre les deux qui fait l'information, pas l'un des deux seul.
   *
   * **`EX-CMP-07` était à moitié tenue, et la moitié manquante vivait dans la
   * vue.** La recherche et le filtre par catégorie étaient ici ; le filtre par
   * niveau et les tris étaient dans `Competences.tsx`, appliqués à ce que la
   * réponse contenait. Tant que la liste tient entière en mémoire, les deux se
   * ressemblent ; à la première pagination, trier la page affichée n'est plus
   * trier, et rien ne l'aurait signalé. Un filtre et un tri sont des
   * propriétés du point d'entrée, pas de l'écran qui l'appelle.
   *
   * **Le tri par COUVERTURE se calcule après agrégation, et c'est voulu.** La
   * couverture est `détenteurs / effectifRequis` (`RG-CMP-03`) : PostgreSQL ne
   * peut pas l'ordonner dans le `findMany` qui la compte. Le tri porte donc
   * sur l'ensemble des lignes retenues — jamais sur une tranche —, ce qui est
   * exactement la propriété que le tri côté client n'avait pas. Le moins
   * couvert vient en premier : c'est l'information qu'on vient chercher.
   */
  async referentiel(
    filtres: {
      categorie?: CategorieCompetence;
      recherche?: string;
      niveau?: NiveauCompetence;
      tri?: TriReferentiel;
    } = {},
  ) {
    const clauses: Record<string, unknown>[] = [];
    if (filtres.categorie) clauses.push({ categorie: filtres.categorie });
    if (filtres.recherche) {
      clauses.push({ nom: { contains: filtres.recherche, mode: "insensitive" } });
    }
    /*
     * `EX-CMP-07` — « filtrer par niveau ». Sur le référentiel, dont les
     * lignes sont des compétences, cela ne peut vouloir dire qu'une chose :
     * ne montrer que celles qui sont détenues à ce niveau AU MOINS UNE FOIS.
     * Les comptes désactivés ne comptent pas — une compétence tenue par la
     * seule personne partie n'est pas une compétence couverte.
     */
    if (filtres.niveau) {
      clauses.push({
        detenteurs: { some: { niveau: filtres.niveau, user: { actif: true } } },
      });
    }

    const competences = await this.prisma.skill.findMany({
      ...(clauses.length > 0 ? { where: { AND: clauses } } : {}),
      orderBy: [{ categorie: "asc" }, { nom: "asc" }],
      include: { _count: { select: { detenteurs: true } } },
    });

    const lignes = competences.map((c) => ({
      ...c,
      detenteurs: c._count.detenteurs,
      manque: Math.max(0, c.effectifRequis - c._count.detenteurs),
    }));

    if (filtres.tri === "couverture") {
      // Le ratio, pas le manque brut : 0/1 et 0/10 manquent de 1 et de 10, et
      // c'est pourtant le premier qui est le plus près d'être couvert.
      const ratio = (c: (typeof lignes)[number]) =>
        c.detenteurs / Math.max(1, c.effectifRequis);
      return [...lignes].sort((a, b) => ratio(a) - ratio(b) || a.nom.localeCompare(b.nom));
    }
    if (filtres.tri === "nom") return [...lignes].sort((a, b) => a.nom.localeCompare(b.nom));
    // Sans tri demandé, l'ordre du référentiel reste catégorie puis nom : il
    // groupe ce qui se lit ensemble.
    return lignes;
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
  async matrice(
    perimetre: Perimetre,
    filtres: {
      categorie?: CategorieCompetence;
      recherche?: string;
      niveau?: NiveauCompetence;
      tri?: TriMatrice;
      competenceId?: string;
    } = {},
  ) {
    /*
     * `EX-CMP-07` — recherche, filtre par niveau et tris, sur la matrice.
     *
     * Les trois vivaient dans `Competences.tsx`, appliqués aux lignes déjà
     * reçues. Ils appartiennent au point d'entrée : sur une matrice annoncée à
     * « 50 lignes × 40 colonnes », le jour où la liste d'agents se pagine, un
     * tri d'écran ordonne une tranche et se donne l'air d'ordonner l'ensemble.
     */
    const clausesAgent: Record<string, unknown>[] = [
      this.perimetres.filtreUtilisateur(perimetre),
      { actif: true },
    ];
    if (filtres.recherche) {
      clausesAgent.push({
        OR: [
          { nom: { contains: filtres.recherche, mode: "insensitive" } },
          { prenom: { contains: filtres.recherche, mode: "insensitive" } },
        ],
      });
    }
    /*
     * « Filtrer par niveau » sur la matrice, dont les lignes sont des agents :
     * ne garder que ceux qui détiennent au moins une compétence à ce niveau.
     * Le filtre se pose EN BASE, sur la même catégorie que les colonnes —
     * sinon un agent expert d'une compétence exclue par le filtre de catégorie
     * resterait affiché avec une ligne entièrement vide.
     */
    if (filtres.niveau) {
      clausesAgent.push({
        competences: {
          some: {
            niveau: filtres.niveau,
            ...(filtres.categorie ? { skill: { categorie: filtres.categorie } } : {}),
          },
        },
      });
    }

    const [competences, agents] = await Promise.all([
      this.prisma.skill.findMany({
        where: filtres.categorie ? { categorie: filtres.categorie } : {},
        orderBy: [{ categorie: "asc" }, { nom: "asc" }],
      }),
      this.prisma.user.findMany({
        where: { AND: clausesAgent },
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
      lignes: this.trierLignes(
        agents.map((a) => ({
          agent: a,
          niveaux: competences.map((c) => parCle.get(`${a.id}|${c.id}`) ?? null),
        })),
        colonnes.map((c) => c.id),
        filtres.tri,
        filtres.competenceId,
      ),
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

  /**
   * `EX-CMP-07` — l'ordre des lignes de la matrice.
   *
   * Trois tris, trois questions différentes : « qui, par ordre alphabétique »,
   * « qui en détient le plus » et « qui est le plus fort sur celle-ci ». Les
   * deux derniers portent sur la composition de la ligne, que seule cette
   * méthode connaît — les calculer en SQL demanderait de reconstruire la
   * matrice deux fois.
   *
   * Le tri se fait sur TOUTES les lignes retenues, jamais sur une tranche :
   * c'est ce qui le distingue du tri d'écran qu'il remplace.
   */
  private trierLignes<L extends { agent: { prenom: string; nom: string }; niveaux: (NiveauCompetence | null)[] }>(
    lignes: L[],
    ordreColonnes: string[],
    tri: TriMatrice | undefined,
    competenceId: string | undefined,
  ): L[] {
    const parNom = (a: L, b: L) =>
      `${a.agent.nom} ${a.agent.prenom}`.localeCompare(`${b.agent.nom} ${b.agent.prenom}`);

    if (tri === "nombre") {
      const detenues = (l: L) => l.niveaux.filter(Boolean).length;
      return [...lignes].sort((a, b) => detenues(b) - detenues(a) || parNom(a, b));
    }
    if (tri === "competence") {
      /*
       * La compétence non nommée, ou nommée hors des colonnes retenues,
       * retombe sur la PREMIÈRE colonne. Refuser serait plus sévère que ce que
       * demande l'exigence, et rendre l'ordre par défaut ferait passer un
       * paramètre invalide pour un tri appliqué.
       */
      const i = competenceId ? ordreColonnes.indexOf(competenceId) : -1;
      const j = i === -1 ? 0 : i;
      const rang = (l: L) => {
        const n = l.niveaux[j];
        return n ? RANG[n] : 0;
      };
      return [...lignes].sort((a, b) => rang(b) - rang(a) || parNom(a, b));
    }
    // « nom » et l'absence de tri disent la même chose : l'ordre alphabétique,
    // celui que la requête a déjà posé.
    return lignes;
  }

  /** `EX-CMP-10` — rechercher les agents détenant une compétence donnée. */
  /**
   * `EX-CMP-05` — qui détient cette compétence, au moins à ce niveau.
   *
   * **Le périmètre manquait.** `skills:read` appartient au socle, donc à tout
   * compte : cette route énumérait `id`, prénom, nom et niveau de **tous les
   * agents actifs de l'instance**, département ignoré. Ses deux voisines du
   * même service — `matrice()` et `exporterMatrice()` — l'appliquent ; celle-ci
   * ne recevait même pas le périmètre en argument.
   *
   * `.claude/rules/api.md` : « un point d'entrée qui vérifie la permission mais
   * pas le périmètre est un défaut de cloisonnement, pas une optimisation. »
   * Trouvé par l'agent qui branchait la vue, en comparant les trois méthodes.
   */
  async detenteurs(skillId: string, perimetre: Perimetre, niveauMinimum?: NiveauCompetence) {
    const ordre: NiveauCompetence[] = ["beginner", "intermediate", "expert", "master"];
    const acceptes = niveauMinimum ? ordre.slice(ordre.indexOf(niveauMinimum)) : ordre;

    return this.prisma.userSkill.findMany({
      where: {
        skillId,
        niveau: { in: acceptes },
        user: { actif: true },
        ...this.perimetres.filtreParAgent(perimetre),
      },
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
