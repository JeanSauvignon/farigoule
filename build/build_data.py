"""Produit docs/data.js : les notes du journal, datées et prêtes à afficher."""

import json
import re
import unicodedata
from pathlib import Path

from extract_notes import decouper_en_notes, lire_pages

RACINE = Path(__file__).resolve().parent.parent
# Les notes ne sont jamais écrites en clair dans docs/ : le site est public,
# c'est encrypt_data.py qui y dépose la version chiffrée.
SORTIE = RACINE / "build" / "notes.json"

MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet",
        "août", "septembre", "octobre", "novembre", "décembre"]


def libelle(date, precision):
    annee, mois, jour = (int(x) for x in date.split("-"))
    if precision == "mois":
        return f"{MOIS[mois - 1]} {annee}"
    if precision == "approx":
        return f"vers {MOIS[mois - 1]} {annee}"
    return f"{jour} {MOIS[mois - 1]} {annee}"


def sans_balises(texte):
    """Version indexable : sans gras, italiques, ratures ni accents."""
    texte = re.sub(r"~~(.+?)~~", r"\1", texte)
    texte = re.sub(r"\*+", "", texte)
    texte = unicodedata.normalize("NFD", texte)
    texte = "".join(c for c in texte if unicodedata.category(c) != "Mn")
    return texte.lower()


def main():
    brutes = decouper_en_notes(lire_pages())
    table = json.loads((RACINE / "build" / "dates_resolues.json")
                       .read_text(encoding="utf-8"))["notes"]
    if len(table) != len(brutes):
        raise SystemExit(
            f"Table de dates désynchronisée : {len(table)} entrées "
            f"pour {len(brutes)} notes détectées.")

    notes = []
    par_index = {}
    for entree, brute in zip(table, brutes):
        cible = entree.get("fusion_avec")
        if cible is not None:
            hote = par_index[cible]
            hote["paragraphes"].append("**" + brute["titre_manuscrit"] + "**")
            hote["paragraphes"].extend(brute["lignes"])
            for photo in brute["photos"]:
                if photo not in hote["photos"]:
                    hote["photos"].append(photo)
            continue

        note = {
            "id": len(notes) + 1,
            "date": entree["date"],
            "precision": entree["precision"],
            "libelle": libelle(entree["date"], entree["precision"]),
            "titre": brute["titre_manuscrit"],
            "photos": list(brute["photos"]),
            "paragraphes": list(brute["lignes"]),
        }
        notes.append(note)
        par_index[entree["index"]] = note

    for note in notes:
        corps = "\n".join(note["paragraphes"])
        note["recherche"] = sans_balises(note["titre"] + " " + corps)

    SORTIE.parent.mkdir(exist_ok=True)
    SORTIE.write_text(json.dumps(notes, ensure_ascii=False), encoding="utf-8")

    annees = sorted({n["date"][:4] for n in notes})
    mots = sum(len(n["recherche"].split()) for n in notes)
    print(f"{len(notes)} notes, {annees[0]}–{annees[-1]}, ~{mots} mots")


if __name__ == "__main__":
    main()
