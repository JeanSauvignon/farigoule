/* La Farigoule, lecture du journal.
   Les notes arrivent chiffrées ; rien n'est lisible sans le mot de passe. */

(() => {
  "use strict";

  const $ = (sel) => document.querySelector(sel);
  const porte = $("#porte");
  const app = $("#app");
  const champRecherche = $("#recherche");
  const frise = $("#frise");
  const lecture = $("#lecture");

  let notes = [];
  let noteCourante = null;
  let coffre = null;
  let occurrences = [];
  let iOccurrence = -1;
  let derniereRequete = null;

  /* ---------- Déchiffrement ---------- */

  const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

  // 340 Ko : on ne les télécharge qu'une fois, sinon chaque essai de mot de
  // passe repayerait l'attente. Le fichier est statique, le cache du
  // navigateur fait le reste au retour sur le site.
  async function chargerCoffre() {
    if (!coffre) coffre = await (await fetch("notes.enc")).json();
    return coffre;
  }

  async function dechiffrer(coffre, motDePasse) {
    const base = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(motDePasse), "PBKDF2", false, ["deriveKey"]);
    const cle = await crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: b64(coffre.sel), iterations: coffre.iterations, hash: "SHA-256" },
      base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
    const clair = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: b64(coffre.nonce) }, cle, b64(coffre.donnees));
    return JSON.parse(new TextDecoder().decode(clair));
  }

  /* ---------- Texte ---------- */

  const echapper = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

  // Version comparable : minuscules, sans accents, avec la correspondance
  // vers les positions du texte d'origine (les accents décomposés en NFD
  // décalent les index, il faut donc les suivre un à un).
  function normaliser(texte) {
    let norm = "";
    const positions = [];
    for (let i = 0; i < texte.length; i++) {
      const plie = texte[i].normalize("NFD").replace(/\p{Mn}/gu, "").toLowerCase();
      for (const c of plie) { norm += c; positions.push(i); }
    }
    return { norm, positions };
  }

  // Découpe le texte en segments {texte, styles} d'après les marques ** * ~~.
  function decouperStyles(texte) {
    const segments = [];
    const styles = { gras: false, italique: false, rature: false };
    let tampon = "";
    const pousser = () => {
      if (tampon) segments.push({ texte: tampon, ...styles });
      tampon = "";
    };
    for (let i = 0; i < texte.length; ) {
      if (texte.startsWith("~~", i)) { pousser(); styles.rature = !styles.rature; i += 2; }
      else if (texte.startsWith("**", i)) { pousser(); styles.gras = !styles.gras; i += 2; }
      else if (texte[i] === "*") { pousser(); styles.italique = !styles.italique; i += 1; }
      else { tampon += texte[i]; i += 1; }
    }
    pousser();
    return segments;
  }

  function surligner(texte, termes) {
    if (!termes.length) return echapper(texte);
    const { norm, positions } = normaliser(texte);
    const zones = [];
    for (const terme of termes) {
      let depuis = 0, trouve;
      while ((trouve = norm.indexOf(terme, depuis)) !== -1) {
        zones.push([positions[trouve], positions[trouve + terme.length - 1] + 1]);
        depuis = trouve + terme.length;
      }
    }
    if (!zones.length) return echapper(texte);

    zones.sort((a, b) => a[0] - b[0]);
    const fusion = [zones[0]];
    for (const [d, f] of zones.slice(1)) {
      const dernier = fusion[fusion.length - 1];
      if (d <= dernier[1]) dernier[1] = Math.max(dernier[1], f);
      else fusion.push([d, f]);
    }

    let html = "", curseur = 0;
    for (const [d, f] of fusion) {
      html += echapper(texte.slice(curseur, d));
      html += "<mark>" + echapper(texte.slice(d, f)) + "</mark>";
      curseur = f;
    }
    return html + echapper(texte.slice(curseur));
  }

  function rendre(texte, termes) {
    return decouperStyles(texte).map((seg) => {
      let html = surligner(seg.texte, termes);
      if (seg.rature) html = `<del>${html}</del>`;
      if (seg.gras) html = `<strong>${html}</strong>`;
      if (seg.italique) html = `<em>${html}</em>`;
      return html;
    }).join("");
  }

  /* ---------- Affichage ---------- */

  const JOURS = /\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/g;

  // Le titre manuscrit ne mérite d'être affiché que s'il dit autre chose que la
  // date résolue : « Mardi 2 Avril » (année implicite), « Noël 2004 »…
  function titreInformatif(note) {
    const cle = (s) => normaliser(s.replace(/~~.+?~~/g, "")).norm
      .replace(JOURS, "").replace(/[^a-z0-9]/g, "");
    return cle(note.titre) !== cle(note.libelle);
  }

  function termesDe(requete) {
    return normaliser(requete.trim()).norm.split(/\s+/).filter(Boolean);
  }

  function filtrer(termes) {
    if (!termes.length) return notes;
    return notes.filter((n) => termes.every((t) => n.recherche.includes(t)));
  }

  function afficherNotes(visibles, termes) {
    if (!visibles.length) {
      lecture.innerHTML = `<p class="vide">Aucune note ne contient ces mots.</p>`;
      return;
    }
    let html = "", anneeVue = null;
    for (const note of visibles) {
      const annee = note.date.slice(0, 4);
      if (annee !== anneeVue) {
        html += `<h2 class="jalon-annee" id="annee-${annee}">${annee}</h2>`;
        anneeVue = annee;
      }
      const corps = note.paragraphes
        .map((p) => `<p>${rendre(p, termes)}</p>`).join("");
      const sources = note.photos.join(", ");
      const titre = titreInformatif(note)
        ? `<h3 class="note-titre">${rendre(note.titre, termes)}</h3>` : "";
      html += `<article class="note" id="note-${note.id}" data-id="${note.id}" data-annee="${annee}">
        <p class="note-date">${echapper(note.libelle)}</p>
        ${titre}
        <div class="note-corps">${corps}</div>
        <p class="note-source">Photos&nbsp;: ${echapper(sources)}</p>
      </article>`;
    }
    lecture.innerHTML = html;
    observerNotes();
    // L'observateur ne se déclenche qu'au défilement : on marque d'emblée la
    // première note pour que la frise ne s'ouvre pas sur une année muette.
    const premiere = visibles[0];
    marquerCourante(premiere.date.slice(0, 4), String(premiere.id));
  }

  function construireFrise(visibles) {
    const annees = new Map();
    for (const note of visibles) {
      const annee = note.date.slice(0, 4);
      if (!annees.has(annee)) annees.set(annee, []);
      annees.get(annee).push(note);
    }
    frise.innerHTML = [...annees].map(([annee, liste]) => `
      <div class="frise-annee" data-annee="${annee}">
        <button type="button" data-cible="annee-${annee}">
          <span>${annee}</span><span class="nb">${liste.length}</span>
        </button>
        <div class="frise-notes">
          ${liste.map((n) => `<button type="button" data-note="${n.id}"
             data-cible="note-${n.id}">${echapper(n.libelle)}</button>`).join("")}
        </div>
      </div>`).join("");
  }

  frise.addEventListener("click", (e) => {
    const bouton = e.target.closest("button[data-cible]");
    if (!bouton) return;
    document.getElementById(bouton.dataset.cible)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  // Met en évidence, dans la frise, l'année et la note en cours de lecture.
  let observateur = null;

  function observerNotes() {
    observateur?.disconnect();
    observateur = new IntersectionObserver((entrees) => {
      const visible = entrees
        .filter((e) => e.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (!visible) return;
      marquerCourante(visible.target.dataset.annee, visible.target.dataset.id);
    }, { rootMargin: "-15% 0px -70% 0px" });
    lecture.querySelectorAll(".note").forEach((n) => observateur.observe(n));
  }

  function marquerCourante(annee, id) {
    if (noteCourante === id) return;
    noteCourante = id;
    frise.querySelectorAll(".frise-annee").forEach((bloc) => {
      bloc.classList.toggle("active", bloc.dataset.annee === annee);
    });
    frise.querySelectorAll(".frise-notes button").forEach((b) => {
      b.classList.toggle("courante", b.dataset.note === id);
    });
    const actif = frise.querySelector(".frise-annee.active");
    if (actif && frise.scrollHeight > frise.clientHeight) {
      const haut = actif.offsetTop - frise.clientHeight / 2;
      frise.scrollTo({ top: Math.max(0, haut), behavior: "smooth" });
    }
  }

  /* ---------- Saut d'une occurrence à l'autre ---------- */

  function allerAOccurrence(cible) {
    if (!occurrences.length) return;
    // On boucle : après la dernière occurrence on repart de la première.
    const total = occurrences.length;
    iOccurrence = ((cible % total) + total) % total;
    occurrences.forEach((m) => m.classList.remove("actif"));
    const marque = occurrences[iOccurrence];
    marque.classList.add("actif");
    marque.scrollIntoView({ behavior: "smooth", block: "center" });
    majCompteur();
  }

  function majCompteur() {
    const compteur = $("#compteur");
    const navigation = $("#navigation-occurrences");
    if (!occurrences.length) {
      compteur.textContent = champRecherche.value.trim() ? "aucune occurrence" : "";
      navigation.hidden = true;
      return;
    }
    const rang = iOccurrence < 0 ? "-" : iOccurrence + 1;
    const notesTrouvees = new Set(
      occurrences.map((m) => m.closest(".note").dataset.id)).size;
    compteur.textContent =
      `${rang} / ${occurrences.length} · ${notesTrouvees} note${notesTrouvees > 1 ? "s" : ""}`;
    navigation.hidden = false;
  }

  function rafraichir() {
    derniereRequete = champRecherche.value;
    const termes = termesDe(champRecherche.value);
    const visibles = filtrer(termes);
    noteCourante = null;
    construireFrise(visibles);
    afficherNotes(visibles, termes);
    occurrences = [...lecture.querySelectorAll("mark")];
    iOccurrence = -1;
    majCompteur();
  }

  $("#occ-suivante").addEventListener("click", () => allerAOccurrence(iOccurrence + 1));
  $("#occ-precedente").addEventListener("click", () => allerAOccurrence(iOccurrence - 1));

  /* ---------- Entrée dans le site ---------- */

  $("#form-mdp").addEventListener("submit", async (e) => {
    e.preventDefault();
    const bouton = $("#bouton-entrer");
    const erreur = $("#erreur-mdp");
    erreur.hidden = true;
    bouton.disabled = true;
    bouton.textContent = coffre ? "Ouverture…" : "Téléchargement du journal…";
    try {
      notes = await dechiffrer(await chargerCoffre(), $("#mdp").value);
      ouvrir();
    } catch (erreurAttrapee) {
      // Un mot de passe faux fait échouer le déchiffrement ; tout le reste
      // (réseau, fichier absent) mérite un message distinct.
      erreur.textContent = coffre
        ? "Mot de passe incorrect."
        : "Le journal n'a pas pu être téléchargé. Vérifiez la connexion.";
      erreur.hidden = false;
      $("#mdp").select();
      if (!coffre) console.error(erreurAttrapee);
    } finally {
      bouton.disabled = false;
      bouton.textContent = "Entrer";
    }
  });

  function ouvrir() {
    porte.hidden = true;
    app.hidden = false;
    const premiere = notes[0].date.slice(0, 4);
    const derniere = notes[notes.length - 1].date.slice(0, 4);
    $("#resume").textContent =
      `${notes.length} notes · ${premiere}-${derniere}`;
    rafraichir();
    champRecherche.focus();
  }

  let minuteur;
  champRecherche.addEventListener("input", () => {
    clearTimeout(minuteur);
    minuteur = setTimeout(rafraichir, 120);
  });

  // Entrée passe à l'occurrence suivante, Maj+Entrée à la précédente.
  champRecherche.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    clearTimeout(minuteur);
    rafraichirSiBesoin();
    allerAOccurrence(e.shiftKey ? iOccurrence - 1 : iOccurrence + 1);
  });

  // La frappe la plus récente n'a peut-être pas encore été prise en compte :
  // on n'appelle rafraichir() que dans ce cas, sinon le saut repartirait de la
  // première occurrence à chaque Entrée.
  function rafraichirSiBesoin() {
    if (champRecherche.value !== derniereRequete) rafraichir();
  }

  // Ctrl+F cherche dans le journal plutôt que dans la page rendue.
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "f" && !app.hidden) {
      e.preventDefault();
      champRecherche.focus();
      champRecherche.select();
    }
    if (e.key === "Escape" && document.activeElement === champRecherche) {
      champRecherche.value = "";
      rafraichir();
    }
  });
})();
