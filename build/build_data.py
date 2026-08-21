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



FIN_DE_PHRASE = re.compile(r'[.!?:;…)\]"»]\s*$')
DEBUT_DE_SUITE = re.compile(r'^[a-zà-ÿ(]')


MOTS_SUSPENDUS = {
    "le", "la", "les", "l", "de", "du", "des", "d", "a", "au", "aux", "et", "ou",
    "que", "qu", "qui", "chez", "avec", "par", "pour", "dans", "sur", "en", "un",
    "une", "ainsi", "notre", "nos", "leur", "leurs", "son", "sa", "ses", "mon",
    "ma", "mes", "ce", "cette", "ces", "plus", "tres", "tout", "toute", "tous",
    "depuis", "vers", "jusque", "jusqu", "apres", "avant", "nous", "vous", "ils",
    "elles", "il", "elle", "on", "je", "+", "&",
}


def dernier_mot(texte):
    mots = re.findall(r"[\wÀ-ſ'’+&]+", texte.rstrip())
    return mots[-1].lower().replace("’", "'").rstrip("'") if mots else ""


def recoller_pages(paragraphes, origines):
    """Recolle les phrases coupees par le tournage de page.

    Une note court souvent d'une page sur l'autre, et la phrase en cours est
    tranchee au milieu : chaque moitie se retrouve dans un paragraphe distinct.
    On ne rejoint que deux paragraphes venus de pages differentes, sinon on
    souderait des phrases que l'autrice a laissees en suspens elle-meme (elle
    ecrit par exemple "au Sofitel de" sans jamais completer le nom).
    """
    recollees, sources = [], []
    for paragraphe, origine in zip(paragraphes, origines):
        precedent = recollees[-1] if recollees else None
        suite = (precedent
                 and origine != sources[-1]
                 and not FIN_DE_PHRASE.search(precedent.rstrip())
                 and not paragraphe.startswith(("**", "*("))
                 and precedent.startswith("- ") == paragraphe.startswith("- ")
                 and (DEBUT_DE_SUITE.match(paragraphe)
                      or dernier_mot(precedent) in MOTS_SUSPENDUS))
        if suite:
            recollees[-1] = precedent.rstrip() + " " + paragraphe
        else:
            recollees.append(paragraphe)
            sources.append(origine)
    return recollees


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
            hote["origines"].append(brute["origines"][0] if brute["origines"] else "?")
            hote["paragraphes"].extend(brute["lignes"])
            hote["origines"].extend(brute["origines"])
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
            "origines": list(brute["origines"]),
        }
        notes.append(note)
        par_index[entree["index"]] = note

    for note in notes:
        note["paragraphes"] = recoller_pages(
            note["paragraphes"], note.pop("origines"))
        corps = "\n".join(note["paragraphes"])
        note["recherche"] = sans_balises(note["titre"] + " " + corps)

    SORTIE.parent.mkdir(exist_ok=True)
    SORTIE.write_text(json.dumps(notes, ensure_ascii=False), encoding="utf-8")

    annees = sorted({n["date"][:4] for n in notes})
    mots = sum(len(n["recherche"].split()) for n in notes)
    print(f"{len(notes)} notes, {annees[0]}-{annees[-1]}, ~{mots} mots")


if __name__ == "__main__":
    main()
