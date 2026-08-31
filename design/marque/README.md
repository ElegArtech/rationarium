# Marque

`logo-source.png` — le logo d'origine, 1254 px, tel que fourni le 2026-08-31.
Un R stylisé dont le contre-poinçon porte un diagramme de Gantt : c'est le
principe directeur du produit — une grille temporelle — dessiné dans l'initiale.

Les fichiers servis vivent dans `apps/web/public/` et sont **dérivés** de
celui-ci :

| Fichier | Rôle |
| --- | --- |
| `logo.png` (512) | le R du repère de marque, thème clair |
| `logo-sombre.png` (512) | idem, thème sombre |
| `favicon.ico` (16/32/48) · `favicon-32.png` | onglet du navigateur |
| `apple-touch-icon.png` (180) | écran d'accueil iOS |

Deux traitements ont été nécessaires, à refaire si la source change :

1. **Le halo de bruit.** La source portait un voile d'alpha faible sur tout le
   fond ; son cadre utile allait de (87,21) à (1210,1212) alors que le dessin
   tient dans (264,225)–(993,979). Tout alpha sous 16 est annulé avant recadrage,
   sinon l'icône se borde d'un gris sale sur fond coloré.
2. **Le corps du R est en bleu nuit** (`#0A1D3A`). Sur `--surface` sombre
   (`#161922`) il disparaît : `logo-sombre.png` le remplace par `--ink` sombre
   (`#E7E9EE`) et laisse les barres colorées intactes, elles tiennent sur les
   deux fonds.

La bascule de thème se fait en CSS (`html.dark .side-logo`), pas en JavaScript :
le thème est une classe sur `html`, pas une préférence système, et un `src` en
dur obligerait la coquille à s'abonner au thème pour un dessin.
