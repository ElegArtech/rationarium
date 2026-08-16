# ADR-0008 — Sessions opaques en base, pas de JWT

- **Statut** : accepté — 2026-08-16
- **Source** : `cadrage/03 § 4, D8`

## Contexte

Quatre exigences du cadrage portent sur la **révocation** :

- `EX-AUTH-02` — rester connecté entre deux sessions de navigateur ;
- `EX-AUTH-03` — se déconnecter en invalidant la session ;
- `RG-AUTH-05` — un utilisateur inactif ne peut pas se connecter ;
- `RG-USR-04` — la suppression définitive efface l'historique associé.

Un jeton auto-porté ne sait rien révoquer sans une liste de révocation — c'est-à-dire sans la table qu'il prétendait éviter.

## Décision

**Identifiant de session aléatoire dans un cookie `HttpOnly` / `SameSite=Lax` / `Secure`**, session en base avec dernière activité et date d'expiration, jeton anti-CSRF à double soumission. Mots de passe en **Argon2id**.

## Ce qui est désormais interdit

- Employer un JWT, ou tout jeton auto-porté, comme preuve de session.
- Placer un identifiant de session ailleurs que dans un cookie `HttpOnly`. Un jeton lisible par JavaScript est un jeton exfiltrable.
- Faire confiance à un ensemble de permissions transmis par le client. Les permissions sont résolues côté serveur à chaque requête.

## Alternatives écartées

**Better Auth** — bibliothèque de qualité, mais le cadrage impose un comportement entièrement spécifique : politique de mot de passe, verrouillage après tentatives, changement imposé à la première connexion, jetons de réinitialisation à usage unique avec **trois messages d'échec distincts**, traçage systématique au journal d'audit. L'écrire à la main représente quelques centaines de lignes, entièrement testables et auditables.

## Point ouvert

Le raccordement à un annuaire d'entreprise (`cadrage/01 § 9.5`) reste à arbitrer. Une **couture d'adaptation** LDAP / Active Directory est à prévoir dans la conception du module ; elle n'est pas implémentée tant que l'arbitrage n'est pas rendu.
