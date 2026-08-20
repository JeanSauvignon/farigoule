"""Chiffre les notes pour publication sur un GitHub Pages public.

Le site étant public, un simple test de mot de passe en JavaScript ne
protégerait rien : le texte serait lisible dans le source. On chiffre donc le
contenu (AES-256-GCM, clé dérivée du mot de passe par PBKDF2-SHA256), et le
navigateur ne peut le déchiffrer qu'avec le bon mot de passe.

Usage :
    python encrypt_data.py                  # demande le mot de passe
    MDP_FARIGOULE=... python encrypt_data.py

Le mot de passe n'est stocké nulle part.
"""

import base64
import getpass
import json
import os
from pathlib import Path

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

RACINE = Path(__file__).resolve().parent.parent
SOURCE = RACINE / "build" / "notes.json"
SORTIE = RACINE / "docs" / "notes.enc"

ITERATIONS = 250_000


def derive(mot_de_passe, sel):
    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=sel,
                     iterations=ITERATIONS)
    return kdf.derive(mot_de_passe.encode("utf-8"))


def main():
    mot_de_passe = os.environ.get("MDP_FARIGOULE") or getpass.getpass(
        "Mot de passe du site : ")
    if not mot_de_passe:
        raise SystemExit("Mot de passe vide, rien n'a été écrit.")

    clair = SOURCE.read_bytes()
    sel = os.urandom(16)
    nonce = os.urandom(12)
    chiffre = AESGCM(derive(mot_de_passe, sel)).encrypt(nonce, clair, None)

    SORTIE.parent.mkdir(exist_ok=True)
    SORTIE.write_text(json.dumps({
        "v": 1,
        "iterations": ITERATIONS,
        "sel": base64.b64encode(sel).decode(),
        "nonce": base64.b64encode(nonce).decode(),
        "donnees": base64.b64encode(chiffre).decode(),
    }), encoding="utf-8")

    print(f"{SORTIE.relative_to(RACINE)} écrit "
          f"({len(chiffre) / 1024:.0f} Ko chiffrés)")


if __name__ == "__main__":
    main()
