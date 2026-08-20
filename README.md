# La Farigoule

Numérisation du journal manuscrit de la maison de famille à Grasse, tenu de
novembre 2000 à juin 2026, et petit site pour le relire.

**145 notes, ~19 000 mots, 64 photos de pages.**

## Organisation

| Dossier | Contenu |
| --- | --- |
| `photo_sources/` | Les 64 photos d'origine, `IMG_4173` → `IMG_4236`, dans l'ordre du cahier |
| `transcriptions/` | Une transcription Markdown par photo, page gauche / page droite |
| `build/` | Scripts d'assemblage et de chiffrement |
| `docs/` | Le site publié (GitHub Pages) |

## Les transcriptions

Chaque fichier de `transcriptions/` correspond à une photo et respecte la mise
en page du cahier : `## Page gauche`, `## Page droite`. Les conventions :

- `**Mardi 2 Avril**` — un titre de note tel qu'il est écrit ;
- `*(2002)*` — l'année rétablie quand elle n'est pas dans le manuscrit ;
- `*(suite du …)*` — la page continue la note commencée plus tôt ;
- `~~Vendredi 25 Octobre~~ Lundi 4 Novembre` — une rature de l'autrice ;
- `**X**` — le repère qu'elle utilise pour signaler un événement extérieur ;
- `*(annotation marginale : …)*` — un ajout dans la marge.

L'ordre des photos a été vérifié sur les métadonnées EXIF (prises en série, à
quelques secondes d'intervalle). Il est essentiel : de nombreuses notes ne
datent que le jour et le mois, l'année n'étant lisible que sur une note
antérieure, parfois plusieurs pages plus haut.

## Reconstruire le site

```bash
cd build && python build_data.py && python encrypt_data.py
```

`build_data.py` recolle le flux continu du cahier, le découpe aux titres de
date, applique `dates_resolues.json` (la table qui rétablit les années
implicites) et écrit `build/notes.json`.

`encrypt_data.py` demande le mot de passe et écrit `docs/notes.enc`.

### Changer le mot de passe

Relancer `python encrypt_data.py` avec le nouveau mot de passe, puis publier le
`docs/notes.enc` obtenu. Rien d'autre à modifier.

## À propos du mot de passe

Le site est public, donc un simple test de mot de passe en JavaScript ne
protégerait rien : le texte serait lisible dans le code source de la page. Les
notes sont donc **chiffrées** (AES-256-GCM, clé dérivée par PBKDF2-SHA256,
250 000 itérations). Le navigateur ne peut les déchiffrer qu'avec le bon mot de
passe, et `notes.json` en clair n'est jamais versionné (`.gitignore`).

Un mot de passe court reste attaquable hors ligne par force brute : préférer
une phrase de passe de plusieurs mots.

**Ce que le dépôt public ne contient pas.** Les photos des pages et les
transcriptions en clair rendraient le mot de passe inutile si elles étaient
publiées : `.gitignore` les exclut. Elles existent en local dans
`photo_sources/` et `transcriptions/` et sont à sauvegarder ailleurs — un
dépôt privé séparé, ou un disque de sauvegarde. Pour tout versionner au même
endroit, il faut un dépôt privé, et GitHub Pages y demande alors un plan payant.

## Publication

Le site est le dossier `docs/` : dans les réglages GitHub du dépôt,
*Pages → Source: Deploy from a branch → main / docs*.

Aucune dépendance, aucun script externe, tout tient en trois fichiers
(`index.html`, `style.css`, `app.js`) plus les données chiffrées.

## Le site

- lecture continue de 2000 à 2026, avec un repère d'année ;
- frise latérale : les années, et le détail des notes de l'année en cours ;
- recherche plein texte insensible aux accents et à la casse, avec surlignage
  des occurrences (`Ctrl+F` ouvre cette recherche plutôt que celle du
  navigateur, `Échap` l'efface).
