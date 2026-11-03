# ADR — Les actions de l'agent rejouent les routes existantes

Date : 3 novembre 2026. Statut : adoptée pour le module M22 (assistant de suivi).

## Problème

L'agent de suivi écrit directement dans Rationarium, sans validation préalable
(`docs/assistant/SPEC-PHASE-1.md`). Ses écritures doivent obéir exactement aux mêmes contrôles
qu'une saisie faite dans l'interface : permission, périmètre, gardes de cible, validation du corps,
règles métier, verrouillage optimiste et audit.

Ces contrôles ne vivent pas en un seul endroit. Une partie est dans la garde globale, une partie
dans des gardes de route (`@CiblesPlanning`, `@CibleRH`), une partie dans les contrôleurs
(schémas Zod, champs gouvernés), le reste dans les services. Appeler les services directement
obligerait à recopier, type d'action par type d'action, ce que chaque route fait autour de son
service. La première règle ajoutée à une route sans être recopiée ouvrirait un passage à l'agent.

## Décision

Une action de l'agent est exécutée en **rejouant la route d'écriture existante**, dans le
processus, par `fastify.inject`, au nom du propriétaire du jeton (`ExecutionInterneService`).

- L'identité passe par un **ticket** de 256 bits tiré au hasard, rangé en mémoire le temps d'une
  seule requête et retiré dès qu'elle est servie (`commun/acces-agent.ts`). La garde globale le lit
  dans l'en-tête `x-rationarium-interne`. Un en-tête forgé de l'extérieur ne correspond à aucun
  ticket et la garde l'ignore : la requête retombe sur le cookie de session.
- Le compte doit être actif. Le changement de mot de passe imposé s'applique comme à une session.
- La limite de débit ignore les appels internes : l'agent a déjà été compté à l'entrée du guichet.
- Défaire une action rejoue de la même façon la route de modification ou de suppression, au nom de
  la personne qui défait.

Le guichet des agents (`/api/agent/v1`) est marqué `@Guichet()`. Sur ces routes seules, la garde
authentifie par le jeton d'agent (`Authorization: Bearer`), puis applique la permission et le
périmètre du propriétaire. Le cookie y est ignoré ; le jeton est ignoré partout ailleurs.

## Options écartées

1. **Appeler les services.** Rapide à écrire, mais chaque action aurait porté une copie des gardes
   et des schémas de sa route. C'est précisément la divergence que ce produit a déjà payée
   (`champs-gouvernes.ts`, `RG-TSK-02`).
2. **Ouvrir toute l'API au jeton d'agent.** L'agent aurait appelé lui-même les routes. Le
   serveur n'aurait alors su ni relire l'état d'avant, ni tracer l'action, ni la défaire, ni
   appliquer les règles du suivi (`RG-AST-07` à `RG-AST-13`).
3. **Contexte asynchrone (`AsyncLocalStorage`).** Il évite l'en-tête, mais sa propagation à
   travers `inject` dépend de détails internes de Fastify et d'avvio. Le ticket ne dépend de rien.

## Conséquences

- Une règle ajoutée demain à une route d'écriture s'applique à l'agent sans autre changement.
- Une action coûte un appel HTTP interne de plus qu'un appel de service : quelques millisecondes,
  négligeables devant le travail du modèle de langage sur le poste.
- `assistant.int.test.ts` prouve le chemin : une écriture hors périmètre est refusée par la route
  rejouée, une version périmée l'est en conflit, un en-tête interne forgé n'ouvre rien.
- Aucune dépendance n'est ajoutée.
