#!/usr/bin/env python3
"""ADR-0017 : régénérer le relevé local depuis l'export officiel archivé.

Aucun accès réseau. Python 3.9+ (zoneinfo de la bibliothèque standard).
Usage : python3 scripts/calendrier-scolaire.py
"""
import collections
import datetime
import hashlib
import json
from pathlib import Path
from zoneinfo import ZoneInfo

racine = Path(__file__).resolve().parent.parent
source = racine / 'docs/references/calendrier/calendrier-scolaire-officiel.json'
sortie = source.with_name('periodes-metropole.json')
ancien = json.loads(sortie.read_text()) if sortie.exists() else {}
periodes = {}
ponctuels = collections.Counter()
for ligne in json.loads(source.read_text()):
    if ligne['zones'] not in ('Zone A', 'Zone B', 'Zone C') or ligne['population'] not in ('-', 'Élèves'):
        continue
    debut = datetime.datetime.fromisoformat(ligne['start_date']).astimezone(ZoneInfo('Europe/Paris')).date()
    reprise = datetime.datetime.fromisoformat(ligne['end_date']).astimezone(ZoneInfo('Europe/Paris')).date()
    if reprise <= debut:
        ponctuels[ligne['description']] += 1
        continue
    cle = (ligne['annee_scolaire'], ligne['zones'][-1], ligne['description'], str(debut), str(reprise - datetime.timedelta(days=1)))
    periodes[cle] = dict(zip(('anneeScolaire', 'zone', 'libelle', 'dateDebut', 'dateFin'), cle))
assert periodes, 'La source ne contient aucune période A/B/C exploitable'
releve = {
    'source': 'https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-calendrier-scolaire/exports/json',
    'page': 'https://data.education.gouv.fr/explore/dataset/fr-en-calendrier-scolaire/',
    'collecte': ancien.get('collecte', str(datetime.date.today())) if ancien.get('sha256Source') == hashlib.sha256(source.read_bytes()).hexdigest() else str(datetime.date.today()),
    'sha256Source': hashlib.sha256(source.read_bytes()).hexdigest(),
    'transformation': 'Zones A/B/C, population élèves ou commune (pré-rentrée enseignants exclue), dates civiles Europe/Paris, fin de période inclusive = veille de reprise ; dédoublonnage académies à dates identiques ; événements ponctuels exclus sans prolongation inventée.',
    'evenementsPonctuelsExclus': dict(ponctuels),
    'periodes': sorted(periodes.values(), key=lambda r: (r['anneeScolaire'], r['zone'], r['dateDebut'])),
}
sortie.write_text(json.dumps(releve, ensure_ascii=False, indent=2) + '\n')
print(f'{len(periodes)} périodes normalisées ; source SHA-256 {releve["sha256Source"]}')
