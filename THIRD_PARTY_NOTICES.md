# Ressources et dépendances tierces

Le code propre à Rationarium est distribué sous licence MIT, voir [LICENSE](LICENSE).
Les dépendances et ressources tierces conservent leurs licences respectives.

Les notices des paquets JavaScript et des polices sont réunies dans
[le fichier des licences tierces](apps/web/public/licences/tierces.txt). Ce fichier est
également servi par l’application à l’adresse `/licences/tierces.txt`. Les paquets du
serveur conservent leurs fichiers de licence dans l’image Docker.

Les polices IBM Plex Sans, Sans Condensed, Serif et Mono sont distribuées sous licence
SIL Open Font License 1.1. Elles sont embarquées localement avec les paquets Fontsource ;
aucun service de polices distant n’est utilisé.

Les périodes de vacances scolaires proviennent du
[jeu de données du ministère de l’Éducation nationale](https://data.education.gouv.fr/explore/dataset/fr-en-calendrier-scolaire/).
Ces données sont publiées sous [Licence Ouverte 2.0 (Etalab)](https://www.etalab.gouv.fr/wp-content/uploads/2017/04/ETALAB-Licence-Ouverte-v2.0.pdf).
Le producteur est la DNE, ministère de l’Éducation nationale.
Les données sources et leur normalisation sont conservées dans `docs/references/calendrier/`,
avec l’adresse de provenance, la date de collecte et l’empreinte du fichier source.

Les images PostgreSQL, Node.js, Debian et Caddy contiennent leurs propres composants et
notices. La licence MIT de Rationarium ne remplace pas les licences de ces composants.
