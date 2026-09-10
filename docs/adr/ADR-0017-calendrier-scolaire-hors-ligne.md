# ADR-0017 — Référence scolaire officielle hors ligne

Statut : accepté par délégation explicite des arbitrages, remédiation RM-10, 10 septembre 2026.

## Contexte

Le cadrage01 M19 demande un import du calendrier officiel par année et zone ; C1 impose un réseau fermé. Aucun fournisseur ni instantané n'était disponible dans le produit. Un appel HTTP de l'application rendrait l'import inexécutable dans l'environnement prévu.

## Décision

Un instantané du [jeu officiel du ministère](https://data.education.gouv.fr/explore/dataset/fr-en-calendrier-scolaire/) est embarqué dans la distribution applicative. L'import sélectionne l'année scolaire et la zone A, B ou C ; il crée des périodes marquées importées et compte séparément celles déjà présentes. Aucune dépendance logicielle nouvelle. Cette référence de fonctionnement n'est pas un jeu de mesure et reste dans le conditionnement de production.

Le JSON source et son SHA sont conservés dans `docs/references/calendrier/`. Les dates horodatées sont ramenées aux jours civils Europe/Paris. La reprise est exclusive dans le calendrier officiel ; la date de fin enregistrée dans la grille inclusive est la veille. Le calendrier retenu est celui des élèves et des périodes communes ; les dates propres aux enseignants (pré-rentrée notamment) ne créent pas une seconde période scolaire superposée. Les doublons des académies d'une même zone sont regroupés par année, zone, libellé et dates.

Les événements ponctuels, dont « Début des Vacances d'Été » sans date de reprise, ne sont pas des périodes complètes. Ils sont exclus du relevé des périodes et ne sont jamais prolongés par estimation. L'interface indique cette limite. Une année/zone absente est refusée par un message explicite, jamais annoncée comme import réussi à zéro ligne.

## Mise à jour

Une mise à jour du lot collecte une nouvelle version de la même source, conserve date/empreinte, régénère les périodes et vérifie les bornes, les zones et l'idempotence. Aucune requête extérieure n'est nécessaire à l'exécution. Une future alimentation par fichier administrateur constituerait une capacité distincte, non promise par cet ADR.

## Vérification

Contrôler l'import puis son rejeu, la séparation entre zones et années, le refus hors droit, l'absence de périodes inventées et l'effet sur la trame du planning. Les changements de statut ouvré/récurrent des fériés restent versionnés et contrôlés indépendamment.
