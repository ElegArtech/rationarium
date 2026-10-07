# Sécurité

## Versions prises en charge

| Version | Correctifs de sécurité |
| --- | --- |
| 1.0.x | Oui |
| 1.0.0-rc.1 | Non — mettre à jour vers 1.0.0 |

## Signaler une faille

Ne publiez pas de faille dans une issue, une discussion ou une demande de fusion.

Utilisez le signalement privé de GitHub : onglet **Security** du dépôt, puis
**Report a vulnerability**. Le signalement reste visible uniquement par les mainteneurs
jusqu'à la publication d'un avis.

Merci d'indiquer :

- la version concernée (tag ou commit) et le mode d'installation ;
- le rôle ou les permissions du compte utilisé ;
- les étapes pour reproduire, et ce que vous avez obtenu ;
- l'impact que vous en déduisez.

Une première réponse est donnée en principe sous sept jours. Rationarium est maintenu
bénévolement : ce délai est un objectif, pas un engagement contractuel. Une fois la faille
corrigée, un avis de sécurité GitHub est publié avec la version corrigée, et l'auteur du
signalement y est crédité s'il le souhaite.

## Périmètre

Sont dans le périmètre : l'API, l'interface web, les images publiées et les scripts du
dossier `deploiement/`. Le contrôle des droits est fait côté serveur, par permission puis
par périmètre ; tout contournement de ce contrôle est une faille.

Hors périmètre : les instances que vous n'administrez pas, les attaques par déni de service
volumétrique, l'ingénierie sociale, et les défauts d'une configuration qui contredit la
[documentation d'installation](docs/installation.md) (par exemple, exposer l'API ou PostgreSQL
hors du réseau Docker).

## Avis publiés

Les avis sont listés dans l'onglet **Security** du dépôt.

---

**English summary.** Do not report vulnerabilities in public issues. Use GitHub private
vulnerability reporting (Security tab → Report a vulnerability). Supported version: 1.0.x.
We aim to answer within seven days; this is a volunteer project, not a contractual SLA.
