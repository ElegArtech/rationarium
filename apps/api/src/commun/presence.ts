import type { PrismaService } from "../prisma.service.js";
import type { CalendrierService } from "../parametrage/calendrier.service.js";
import type { Perimetre, PerimetreService } from "./perimetre.service.js";
import { debutDuJour } from "./dates.js";

/** D-RM-11, EX-USR-09, EX-TLT-07 — une population et une date pour les vues 06 et 20. */
export async function presenceALaDate(
  prisma: PrismaService, perimetres: PerimetreService, calendrier: CalendrierService,
  perimetre: Perimetre, reference: Date,
) {
  const date = debutDuJour(reference);
  const agents = await prisma.user.findMany({
    where: { AND: [perimetres.filtreUtilisateur(perimetre), { actif: true }] },
    select: { id: true, prenom: true, nom: true }, orderBy: [{ nom: "asc" }, { id: "asc" }],
  });
  const ids = agents.map((a) => a.id);
  const [conges, declarations, chomes] = await Promise.all([
    prisma.leave.findMany({
      where: { userId: { in: ids }, statut: { in: ["approved", "cancellation_requested"] }, dateDebut: { lte: date }, dateFin: { gte: date } },
      select: { userId: true, type: { select: { nom: true } } },
    }),
    prisma.telework.findMany({ where: { userId: { in: ids }, date }, select: { userId: true, etat: true } }),
    calendrier.joursChomes(date, date),
  ]);
  const nonOuvre = [0, 6].includes(date.getUTCDay()) || chomes.has(date.toISOString().slice(0, 10));
  const absences = new Map(conges.map((c) => [c.userId, c.type.nom]));
  const declares = new Map(declarations.map((d) => [d.userId, d.etat]));
  return agents.map((a) => ({
    ...a, etat: declares.get(a.id) ?? "undeclared" as const,
    enConge: !nonOuvre && absences.has(a.id), nonOuvre,
    typeConge: !nonOuvre ? absences.get(a.id) ?? null : null,
  }));
}
