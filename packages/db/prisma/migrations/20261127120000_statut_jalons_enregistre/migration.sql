-- RG-JAL-01 : le statut d'un jalon qui porte des tâches est désormais ENREGISTRÉ
-- à chaque écriture de tâche. Reprise des lignes existantes : la colonne restait
-- « pending » sur des jalons dont toutes les tâches étaient terminées.
-- Les jalons sans tâche gardent leur marque manuelle (RG-JAL-06).
UPDATE "milestones" AS m
SET "statut" = c.statut
FROM (
  SELECT t."milestoneId" AS id,
         CASE
           WHEN bool_and(t."statut" = 'done') THEN 'done'::"StatutJalon"
           WHEN bool_and(t."statut" = 'todo') THEN 'pending'::"StatutJalon"
           ELSE 'doing'::"StatutJalon"
         END AS statut
  FROM "tasks" AS t
  WHERE t."milestoneId" IS NOT NULL
  GROUP BY t."milestoneId"
) AS c
WHERE m."id" = c.id AND m."statut" <> c.statut;
