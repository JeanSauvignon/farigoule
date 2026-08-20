"""Assemble les transcriptions page par page en notes datées.

Le cahier est écrit au fil de l'eau : chaque note commence par un titre de date
en gras. Une note court souvent sur plusieurs pages (donc plusieurs photos), et
beaucoup de titres n'indiquent que le jour et le mois, l'année étant héritée de
la note précédente. On reconstitue donc le flux continu, on découpe aux titres,
puis on applique la table de résolution des années (dates_resolues.json).
"""

import json
import re
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
TRANSCRIPTIONS = RACINE / "transcriptions"

# Lignes en gras qui ne sont pas des titres de note.
NON_TITRES = re.compile(r"^\*\*(X|PS|Lundi 22/6)\*\*")
TITRE = re.compile(r"^\*\*(.+?)\*\*\s*(.*)$")


def lire_pages():
    """Renvoie les fichiers de transcription triés par ordre de photo."""
    pages = []
    for chemin in sorted(TRANSCRIPTIONS.glob("IMG_*.md")):
        texte = chemin.read_text(encoding="utf-8")
        entete, corps = texte.split("---", 2)[1:]
        ordre = int(re.search(r"ordre:\s*(\d+)", entete).group(1))
        photo = re.search(r"photo:\s*(\S+)", entete).group(1)
        pages.append({"ordre": ordre, "photo": photo, "corps": corps})
    return sorted(pages, key=lambda p: p["ordre"])


def decouper_en_notes(pages):
    """Découpe le flux continu du cahier aux titres de date."""
    notes = []
    courante = None
    for page in pages:
        for ligne in page["corps"].splitlines():
            nu = ligne.strip()
            if not nu or nu.startswith("## ") or nu.startswith("*(suite"):
                continue
            if nu == "*(page vierge)*" or nu.startswith("*(page vierge,"):
                continue

            m = TITRE.match(nu)
            if m and not NON_TITRES.match(nu):
                reste = m.group(2).strip()
                courante = {
                    "titre_manuscrit": m.group(1).strip(),
                    "annotation": reste,
                    "photos": [],
                    "lignes": [],
                }
                notes.append(courante)
                # Un titre suivi d'un simple rappel d'année en italique n'a pas
                # de corps sur cette ligne ; tout autre texte en fait partie.
                if reste and not re.fullmatch(r"\*\(.*\)\*", reste):
                    courante["lignes"].append(reste)
            elif nu.startswith("*(séjour non daté"):
                courante = {
                    "titre_manuscrit": "(séjour non daté)",
                    "annotation": nu,
                    "photos": [],
                    "lignes": [],
                }
                notes.append(courante)
                continue

            if courante is None:
                continue
            if m and not NON_TITRES.match(nu):
                pass  # le titre lui-même ne va pas dans le corps
            else:
                courante["lignes"].append(nu)
            if page["photo"] not in courante["photos"]:
                courante["photos"].append(page["photo"])
    return notes


def main():
    notes = decouper_en_notes(lire_pages())
    for i, note in enumerate(notes):
        print(f"{i:3d}  {note['titre_manuscrit']}  {note['annotation']}"
              f"   [{note['photos'][0]}]")
    print(f"\nTotal : {len(notes)} notes")
    (RACINE / "build" / "notes_brutes.json").write_text(
        json.dumps(notes, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
