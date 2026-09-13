#!/usr/bin/env python3
"""Vérifie qu'une archive Docker contient sa configuration et toutes ses couches."""
import gzip
import hashlib
import json
import sys
import tarfile


def empreinte(flux):
    hache = hashlib.sha256()
    while bloc := flux.read(1024 * 1024):
        hache.update(bloc)
    return hache.hexdigest()


for chemin in sys.argv[1:]:
    with tarfile.open(chemin) as archive:
        noms = set(archive.getnames())
        manifeste = json.load(archive.extractfile("manifest.json"))
        if not manifeste:
            raise SystemExit(f"Archive sans image : {chemin}")
        for image in manifeste:
            requis = [image["Config"], *image["Layers"]]
            absents = set(requis) - noms
            if absents:
                raise SystemExit(f"Archive Docker incomplète : {chemin} ({len(absents)} fichiers absents)")
            config = json.load(archive.extractfile(image["Config"]))
            if config.get("os") != "linux" or config.get("architecture") != "amd64":
                raise SystemExit(f"Architecture attendue : linux/amd64 ({chemin})")
            couches = config["rootfs"]["diff_ids"]
            if len(couches) != len(image["Layers"]):
                raise SystemExit(f"Liste de couches incohérente : {chemin}")
            # Les archives docker-archive et docker save classiques portent des tar
            # non compressés ; leur empreinte doit correspondre au système de fichiers.
            for nom, attendu in zip(image["Layers"], couches):
                flux = archive.extractfile(nom)
                signature = flux.read(2)
                flux.seek(0)
                if signature == b"\x1f\x8b":
                    flux = gzip.GzipFile(fileobj=flux)
                if "sha256:" + empreinte(flux) != attendu:
                    raise SystemExit(f"Couche altérée : {chemin} ({nom})")
            print(f"Image complète : {', '.join(image['RepoTags'])}")
