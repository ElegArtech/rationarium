# Agent de référence de l'assistant de suivi

Ce dossier fournit l'agent de référence du module M22, « Assistant de suivi »
(`docs/assistant/SPEC-PHASE-1.md`, § 14). L'agent tourne sur le poste de l'utilisateur. Il emploie
le client de modèle de langage de ce poste, Claude Code (`claude -p`) ou Codex (`codex exec`), avec
l'abonnement de l'utilisateur. Il lit les sources avec les moyens du poste, puis agit directement
dans Rationarium pour le compte du propriétaire de son jeton. Le serveur n'appelle jamais de
modèle : il ne reçoit que les actions et leurs preuves.

L'agent n'a aucune dépendance. Il demande seulement Node.js 24, dont il emploie le `fetch` natif.

## Contenu du dossier

| Fichier | Rôle |
| --- | --- |
| `rationarium-agent` | Client en ligne de commande du guichet des agents (`/api/agent/v1`) |
| `rationarium-relais` | Boucle d'attente : lance la commande d'exécution quand un passage arrive |
| `lib/guichet.mjs` | Configuration, jeton, client HTTP et découpage en lots, partagés par les deux exécutables |
| `consignes/claude-code.md` | Consigne d'un passage pour Claude Code |
| `consignes/codex.md` | Consigne d'un passage pour Codex |
| `systemd/rationarium-relais.service` | Unité utilisateur du relais |
| `systemd/rationarium-passage.service` | Unité utilisateur qui crée un passage de secours |
| `systemd/rationarium-passage.timer` | Planification du passage de secours, les jours ouvrés à 7 h 30 |
| `exemples/agent.env` | Fichier de configuration à copier |
| `exemples/actions.json` | Fichier d'actions d'exemple, conforme au contrat |
| `exemples/bilan.json` | Bilan de passage d'exemple, conforme au contrat |
| `*.test.mjs`, `faux-guichet.mjs`, `tests.mjs` | Tests contre un faux guichet |

## Prérequis

- Node.js 24 ou plus récent.
- Claude Code ou Codex, installé et connecté à l'abonnement de l'utilisateur.
- `secret-tool`, du paquet `libsecret-tools`, pour ranger le jeton dans le trousseau. Il est
  facultatif mais recommandé.
- Le module activé dans Rationarium, en mode `relais` (Paramétrage › Assistant).
- Un jeton d'agent, créé dans Mon compte › Agents. Le jeton ne s'affiche qu'une fois, à sa
  création. Limitez-le aux types d'action dont l'agent a besoin.

## Installation

Les deux exécutables chargent `lib/guichet.mjs` à côté d'eux. On copie donc le dossier entier, et
on place des liens symboliques dans `~/.local/bin`. Les commandes suivantes se lancent depuis la
racine du dépôt.

```bash
install -d ~/.local/share/rationarium-agent ~/.local/bin ~/.config/rationarium-agent ~/.config/systemd/user
cp -r outils/agent/. ~/.local/share/rationarium-agent/
ln -sf ~/.local/share/rationarium-agent/rationarium-agent ~/.local/bin/rationarium-agent
ln -sf ~/.local/share/rationarium-agent/rationarium-relais ~/.local/bin/rationarium-relais
install -m 600 outils/agent/exemples/agent.env ~/.config/rationarium-agent/agent.env
```

Renseignez ensuite l'adresse de l'instance dans `~/.config/rationarium-agent/agent.env`
(`RATIONARIUM_URL`). Rangez le jeton dans le trousseau. La commande demande le secret, qu'il faut
coller puis valider par Entrée :

```bash
secret-tool store --label='Rationarium agent' service rationarium-agent usage jeton
```

Vérifiez le branchement. La commande doit nommer le propriétaire du jeton :

```bash
rationarium-agent etat
```

Installez enfin les unités systemd. Le relais attend les passages en permanence. Le minuteur crée
un passage de secours les jours ouvrés, et il est facultatif quand la planification du serveur est
réglée.

```bash
cp outils/agent/systemd/rationarium-* ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now rationarium-relais.service
systemctl --user enable --now rationarium-passage.timer
journalctl --user -u rationarium-relais -f
```

Une mise à jour de l'agent recopie le dossier, puis redémarre le relais par
`systemctl --user restart rationarium-relais.service`.

## Configuration

Les variables se lisent dans l'environnement, puis dans `~/.config/rationarium-agent/agent.env`.
Une variable déjà présente dans l'environnement l'emporte sur le fichier. Le fichier ne fournit
que les clés qui commencent par `RATIONARIUM_`.

| Variable | Rôle | Défaut |
| --- | --- | --- |
| `RATIONARIUM_URL` | Adresse de l'instance ; `/api/agent/v1` est ajouté s'il manque | obligatoire |
| `RATIONARIUM_JETON` | Jeton d'agent | le trousseau, par `secret-tool lookup service rationarium-agent usage jeton` |
| `RATIONARIUM_CA` | Certificat racine de l'instance, au format PEM | les autorités du système |
| `RATIONARIUM_REESSAIS` | Nouvelles tentatives sur une coupure réseau, pour les appels qu'on peut rejouer | `2` |
| `RATIONARIUM_CONFIG` | Chemin du fichier de configuration | `~/.config/rationarium-agent/agent.env` |
| `RATIONARIUM_COMMANDE` | Commande lancée par le relais, par `bash -c`, dans le dossier du passage | Claude Code, voir plus bas |
| `RATIONARIUM_CONSIGNE` | Modèle de consigne écrit dans le dossier du passage | `consignes/claude-code.md` |
| `RATIONARIUM_TRAVAIL` | Racine des dossiers de passage | `~/.local/state/rationarium-agent/passages` |
| `RATIONARIUM_DUREE_MAX` | Durée maximale d'une exécution, en minutes | `180` |
| `RATIONARIUM_OUTILS_CLAUDE` | Outils permis à Claude Code ; remplace la liste par défaut | voir plus bas |
| `RATIONARIUM_OUTILS_SUPPLEMENTAIRES` | Outils ajoutés à la liste par défaut | vide |

**Certificat.** Node.js ne lit `NODE_EXTRA_CA_CERTS` qu'à son démarrage. Quand `RATIONARIUM_CA` est
renseignée, l'exécutable se relance donc lui-même avec `NODE_EXTRA_CA_CERTS` posée sur ce fichier.
Le certificat s'ajoute aux autorités du système, sans les remplacer. La vérification TLS n'est
jamais désactivée : l'agent refuse même de fonctionner quand `NODE_TLS_REJECT_UNAUTHORIZED=0` est
posée. Le protocole `http://` n'est accepté que vers le poste lui-même (`localhost`, `127.0.0.1`,
`[::1]`). Aucune redirection n'est suivie, si bien que le jeton ne part que vers l'adresse
configurée.

## Commandes

| Commande | Effet |
| --- | --- |
| `rationarium-agent etat [--json]` | Vérifie le jeton : propriétaire, mode, jalon obligatoire, types autorisés, passage actif |
| `rationarium-agent attendre [--secondes N] [--pause S]` | Attend un passage, 25 s par défaut ; écrit `passage <id>` ou `aucun`. Au-delà de 25 s, les appels longs s'enchaînent, espacés de `S` secondes |
| `rationarium-agent prendre [<id>]` | Prend le passage désigné, ou le passage en attente ; écrit `passage <id> pris`, ou `aucun` |
| `rationarium-agent contexte <id> [--sortie fichier.json]` | Écrit le contexte du passage en JSON |
| `rationarium-agent temps <id> --du AAAA-MM-JJ --au AAAA-MM-JJ [--sortie fichier.json]` | Écrit les temps déjà déclarés sur la période |
| `rationarium-agent progression <id> <libellé…>` | Signale l'avancement ; vaut signe de vie |
| `rationarium-agent agir <id> <fichier.json\|-> [--sortie fichier.json]` | Exécute les actions par lots de 50 ; écrit un résumé et les résultats en JSON |
| `rationarium-agent fin <id> --etat terminee\|echec [--bilan fichier.json\|-] [--erreur texte]` | Clôt le passage avec son bilan |
| `rationarium-agent lancer [--projets id,id] [--tolerer-actif]` | Crée un passage manuel, que le relais prendra |
| `rationarium-relais [--pause S] [--secondes N] [--une-fois]` | Attend les passages et lance leur exécution |

Quand une commande écrit du JSON sur la sortie standard, son résumé part sur la sortie d'erreur, ce
qui permet de lire le JSON avec `jq`. Avec `--sortie`, le JSON part dans le fichier et le résumé sur
la sortie standard.

| Code de sortie | Sens |
| --- | --- |
| `0` | Réussite |
| `1` | Erreur interne inattendue |
| `2` | Usage ou configuration : commande mal formée, adresse ou jeton absent, fichier illisible |
| `3` | Refus HTTP du guichet : jeton refusé (401), droit absent (403), module désactivé (404), conflit (409) |
| `4` | Guichet injoignable : réseau, délai dépassé, certificat non reconnu |

Le jeton ne s'affiche jamais. Aucun message ne le contient, et il est effacé de tout texte qui le
porterait, y compris une réponse du serveur ou la sortie de la commande d'exécution.

## Fichiers d'actions

Un fichier d'actions contient un tableau d'actions, ou un objet `{ "actions": [...] }`. La forme de
chaque action est fixée par `packages/contracts/src/assistant.ts` : un `type`, une `justification`,
de une à dix `preuves`, une `charge` propre au type, et une `reference` facultative.

```json
[
  {
    "type": "jalon_creer",
    "reference": "remise-rapport",
    "justification": "Le commanditaire fixe la remise du rapport au 28 novembre.",
    "preuves": [{ "source": "courriel", "reference": "<20261102.0915@exemple.org>", "date": "2026-11-02" }],
    "charge": { "projectId": "6f1c2a7e-0b3d-4c5e-9a8b-1d2e3f405162", "nom": "Remise du rapport", "dateEcheance": "2026-11-28" }
  },
  {
    "type": "tache_creer",
    "justification": "La relecture du chapitre 3 est demandée avant la remise.",
    "preuves": [{ "source": "courriel", "reference": "<20261102.0915@exemple.org>", "date": "2026-11-02" }],
    "charge": { "projectId": "6f1c2a7e-0b3d-4c5e-9a8b-1d2e3f405162", "milestoneId": "@remise-rapport", "titre": "Relire le chapitre 3" }
  }
]
```

`exemples/actions.json` montre aussi une tâche close, un événement et un projet créé avec son plan
de suivi et son jalon. Les règles suivantes s'appliquent.

- `agir` découpe le fichier en lots de 50 actions au plus, et sous la limite de taille du guichet.
  Les lots partent dans l'ordre du fichier, et les résultats sont renumérotés dans ce même ordre
  (`index`), avec le numéro de leur lot (`lot`).
- Une action qui déclare `reference: "nom"` se désigne ensuite par `"@nom"` dans `projectId`,
  `milestoneId`, `taskId` ou `eventId`, y compris d'un lot ou d'un fichier à l'autre du même passage.
- Rejouer une action identique dans le même passage rend le premier résultat, avec
  `rejouee: true`. Un lot interrompu par une coupure réseau se renvoie donc sans risque, et `agir`
  le fait de lui-même.
- Un refus d'action ne change pas le code de sortie : le compte des refus figure dans `refusees`,
  et chaque refus porte son `motif`, avec la règle en cause. Un lot refusé en entier par le guichet
  arrête l'envoi avec le code 3 ; les résultats des lots déjà exécutés sont tout de même écrits,
  avec le champ `interrompu`.

Le bilan d'un passage suit `bilanPassageSchema` ; `exemples/bilan.json` en donne un exemple.

## Le relais

Le relais appelle `passages/suivant` en attente longue, 25 s par appel. Cette attente ne lance
aucun processus et ne consomme rien sur l'abonnement du modèle de langage. Chaque appel vaut signe
de vie : l'écran « Activité de l'agent » montre l'agent joignable.

Quand un passage arrive, le relais procède ainsi.

1. Il crée un dossier de passage, `~/.local/state/rationarium-agent/passages/<date>-<id>/`, lisible
   du seul utilisateur.
2. Il y écrit `consigne.md`, tirée du modèle, où `{{PASSAGE}}` et `{{DOSSIER}}` sont remplacés par
   l'identifiant du passage et le chemin du dossier.
3. Il lance `RATIONARIUM_COMMANDE` par `bash -c`, dans ce dossier. La commande reçoit
   `RATIONARIUM_PASSAGE`, `RATIONARIUM_DOSSIER_PASSAGE` et `RATIONARIUM_CONSIGNE_PASSAGE`, et trouve
   `rationarium-agent` dans son `PATH`.
4. Il relaie la sortie de la commande dans son journal, et la recopie dans `execution.log`.
5. Quand la commande s'arrête, il vérifie que le passage est clos. Sinon, il le clôt en échec, avec
   une erreur qui le dit. Sans ce garde-fou, un passage resté en attente reviendrait au tour
   suivant, et la commande serait relancée sans fin. Un même passage n'est jamais confié deux fois
   à la commande.
6. Il reprend l'attente après la pause (`--pause`, 30 s par défaut).

Une exécution qui dépasse `RATIONARIUM_DUREE_MAX` est arrêtée. À l'arrêt du relais, l'exécution en
cours reçoit `SIGTERM`, et son passage est clos en échec. Une coupure réseau ne fait pas sortir le
relais : il réessaie, de plus en plus espacé, jusqu'à une minute. Un trousseau verrouillé à
l'ouverture de la session est relu chaque minute.

### Commande par défaut : Claude Code

```bash
claude -p "$(cat "$RATIONARIUM_CONSIGNE_PASSAGE")" --permission-mode acceptEdits --allowedTools "$RATIONARIUM_OUTILS_CLAUDE"
```

`--permission-mode acceptEdits` confine les écritures de fichiers au dossier du passage. Les
outils permis sans demande sont des lectures, plus le client du guichet :

```text
Bash(rationarium-agent *) Bash(git log *) Bash(git show *) Bash(git -C * log *) Bash(git -C * show *)
Bash(gh issue list *) Bash(gh issue view *) Bash(gh pr list *) Bash(gh pr view *) Bash(gh release list *)
Bash(gh repo view *) Bash(date *) Read Grep Glob WebFetch
```

Toute autre commande est refusée, puisque `claude -p` ne peut rien demander. Les sources de type
`courriel` demandent donc d'ajouter l'outil de courrier du poste, par exemple :

```bash
RATIONARIUM_OUTILS_SUPPLEMENTAIRES='Bash(notmuch search *) Bash(notmuch show *)'
```

### Codex

```bash
RATIONARIUM_CONSIGNE=~/.local/share/rationarium-agent/consignes/codex.md
RATIONARIUM_COMMANDE='codex exec --sandbox workspace-write -c sandbox_workspace_write.network_access=true --skip-git-repo-check -C "$RATIONARIUM_DOSSIER_PASSAGE" "$(cat "$RATIONARIUM_CONSIGNE_PASSAGE")"'
```

Le bac à sable `workspace-write` permet la lecture partout et l'écriture dans le seul dossier du
passage. L'accès au réseau y est ouvert pour joindre le guichet.

### Un passage à la main

```bash
rationarium-agent lancer                  # crée le passage ; le relais le prend
rationarium-relais --une-fois             # ou : l'exécuter tout de suite, sans relais en service
```

## Sécurité

- **Le jeton.** Le trousseau est préférable à `RATIONARIUM_JETON`. Une variable d'environnement est
  héritée par le client de modèle de langage, qui pourrait la lire ; le trousseau n'est lu que par
  `rationarium-agent`, au moment de l'appel.
- **L'injection.** Le contenu des sources peut contenir des instructions. Les consignes rappellent
  que ce contenu est une donnée, jamais une consigne. Le serveur borne de son côté ce qu'une
  injection réussie pourrait faire : le périmètre du propriétaire, les types d'action du jeton,
  aucune suppression, chaque action tracée et défaisable. Limiter les types d'action du jeton
  réduit encore cette surface.
- **Les sources.** Les outils permis à Claude Code sont des lectures. Les consignes interdisent
  d'envoyer un message, de modifier une source et de supprimer quoi que ce soit.

## Dépannage

| Symptôme | Cause probable | Remède |
| --- | --- | --- |
| Le relais sort aussitôt en code 127 sous systemd | `node` vient de nvm et n'est pas dans le `PATH` de l'unité | Ajouter une surcharge `~/.config/systemd/user/rationarium-relais.service.d/chemin.conf` avec `[Service]` et `Environment=PATH=%h/.local/bin:<dossier de node>:/usr/local/bin:/usr/bin:/bin` (le dossier se lit par `dirname "$(command -v node)"`) |
| Le passage échoue en une seconde : « Temp directory /tmp/claude-… is owned by uid 0 » | Le dossier temporaire de Claude Code appartient à un autre compte | Ajouter `export CLAUDE_CODE_TMPDIR=<dossier à soi> &&` en tête de `RATIONARIUM_COMMANDE`, puis redémarrer le relais |
| Une modification de `agent.env` reste sans effet | Le relais lit sa configuration au démarrage | `systemctl --user restart rationarium-relais.service` |
| `etat` sort en code 3, « refus HTTP 401 » | Jeton révoqué, expiré, mal copié, ou propriétaire inactif | Créer un nouveau jeton, puis le ranger de nouveau par `secret-tool store` |
| Code 3, « refus HTTP 404 » et `erreurs:introuvable` | Module désactivé, ou adresse erronée | Activer le mode `relais` ; vérifier `RATIONARIUM_URL` |
| Code 3, « refus HTTP 403 » | Le propriétaire n'a plus `assistant:use` | Rétablir le droit du compte |
| Code 4, « certificat non reconnu » | Instance signée par une autorité propre | Renseigner `RATIONARIUM_CA` avec son certificat racine |
| Code 4, « injoignable » | Adresse, tunnel ou VPN | Vérifier l'accès à l'instance depuis le poste |
| Code 2, « le trousseau ne rend aucun jeton » | Jeton non rangé, ou trousseau verrouillé | Ouvrir la session ; sinon, `secret-tool store` |
| Code 2, « NODE_TLS_REJECT_UNAUTHORIZED=0 » | La vérification TLS a été désactivée ailleurs | Retirer la variable, et renseigner `RATIONARIUM_CA` |
| Le passage reste « en attente du poste » | Le relais ne tourne pas | `systemctl --user status rationarium-relais` et `journalctl --user -u rationarium-relais` |
| Le relais s'arrête au démarrage, « claude est introuvable dans PATH » | Claude Code absent du `PATH` de l'unité | Corriger `Environment=PATH=` dans l'unité, ou renseigner `RATIONARIUM_COMMANDE` |
| Passage en échec, « sans prendre le passage » | La commande d'exécution n'a pas démarré, ou a échoué d'emblée | Lire `execution.log` dans le dossier du passage, puis lancer la commande à la main |
| Passage « interrompu » | Aucun signe de vie pendant trente minutes | La consigne demande une progression au moins toutes les dix minutes ; vérifier le journal |
| `lancer` sort en code 3, `RG-AST-15` | Un passage est déjà actif | Attendre sa fin, ou l'annuler depuis l'écran « Activité de l'agent » |
| Action refusée, `RG-AST-08` | Tâche de projet sans jalon | Rattacher la tâche à un jalon existant ou créé dans le passage |
| Action refusée, `RG-AST-09` | `dateDebut` du projet absente des dates des preuves | Dater le projet de sa première preuve |
| Action refusée, `RG-AST-12` | Action défaite par l'utilisateur depuis moins de 90 jours | Ne pas la refaire ; c'est voulu |
| Action refusée, statut 409 | L'entité a changé depuis la lecture du contexte | Relire le contexte, puis réessayer avec la nouvelle `version` |

## Tests

Les tests emploient `node:test` contre un faux guichet `node:http`, sans réseau extérieur ni
dépendance :

```bash
node --test outils/agent/
```

Node.js 24 ne parcourt pas un dossier passé à `--test` : il le résout par le champ `main` de
`package.json`, qui désigne `tests.mjs`, lequel charge chaque `*.test.mjs`. La commande
`node --test 'outils/agent/*.test.mjs'` lance les mêmes tests, un fichier par processus.
