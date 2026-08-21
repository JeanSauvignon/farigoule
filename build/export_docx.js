/* Assemble les notes du journal en un document Word unique, à partager tel quel.
   Reprend le découpage produit par build_data.py (build/notes.json). */

const fs = require("fs");
const path = require("path");
const {
  AlignmentType, Document, Footer, HeadingLevel, LevelFormat, PageBreak,
  PageNumber, Packer, Paragraph, TableOfContents, TextRun,
} = require("./docx/node_modules/docx");

const RACINE = path.join(__dirname, "..");
const notes = JSON.parse(fs.readFileSync(path.join(RACINE, "build/notes.json"), "utf8"));

const SERIF = "Garamond";
const SANS = "Calibri";
const GRIS = "6B665D";
const VERT = "5A6E4C";
const ENCRE = "23211D";

/* Les transcriptions portent les marques **gras**, *italique* et ~~rature~~ :
   on les retraduit en vraies propriétés de run plutôt que de les laisser
   apparaître telles quelles dans le document. */
function enRuns(texte, options = {}) {
  const segments = [];
  const style = { bold: false, italics: false, strike: false };
  let tampon = "";
  const pousser = () => {
    if (tampon) segments.push(new TextRun({ text: tampon, ...style, ...options }));
    tampon = "";
  };
  for (let i = 0; i < texte.length; ) {
    if (texte.startsWith("~~", i)) { pousser(); style.strike = !style.strike; i += 2; }
    else if (texte.startsWith("**", i)) { pousser(); style.bold = !style.bold; i += 2; }
    else if (texte[i] === "*") { pousser(); style.italics = !style.italics; i += 1; }
    else { tampon += texte[i]; i += 1; }
  }
  pousser();
  return segments;
}

const sansMarques = (s) => s.replace(/~~(.+?)~~/g, "$1").replace(/\*/g, "");

const JOURS = /\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/g;
const cle = (s) => sansMarques(s).normalize("NFD").replace(/\p{Mn}/gu, "")
  .toLowerCase().replace(JOURS, "").replace(/[^a-z0-9]/g, "");
const titreDiffere = (n) => cle(n.titre) !== cle(n.libelle);

const enfants = [];

/* ---------- Page de titre ---------- */

enfants.push(
  new Paragraph({ spacing: { before: 2600 } }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "La Farigoule", font: SERIF, size: 72, bold: true })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 220 },
    children: [new TextRun({
      text: "Journal de la maison de famille, Grasse",
      font: SERIF, size: 28, italics: true, color: GRIS,
    })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 900 },
    children: [new TextRun({
      text: `${notes.length} notes, de novembre 2000 à juin 2026`,
      font: SANS, size: 22, color: GRIS,
    })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 120 },
    children: [new TextRun({
      text: "Transcription des 64 pages photographiées du cahier",
      font: SANS, size: 20, color: GRIS,
    })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 1400 },
    children: [new TextRun({
      text: "De nombreuses notes ne portent que le jour et le mois. L'année a été",
      font: SANS, size: 18, color: GRIS, italics: true,
    })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({
      text: "rétablie d'après la note précédente et figure en tête de chacune.",
      font: SANS, size: 18, color: GRIS, italics: true,
    })],
  }),
  new Paragraph({ children: [new PageBreak()] }),
);

/* ---------- Sommaire ---------- */

enfants.push(
  new Paragraph({
    spacing: { after: 240 },
    children: [new TextRun({ text: "Sommaire", font: SERIF, size: 36, bold: true })],
  }),
  new TableOfContents("Sommaire", { hyperlinks: true, headingStyleRange: "1-1" }),
  new Paragraph({ children: [new PageBreak()] }),
);

/* ---------- Les notes, année par année ---------- */

let anneeVue = null;
for (const note of notes) {
  const annee = note.date.slice(0, 4);
  if (annee !== anneeVue) {
    enfants.push(new Paragraph({
      heading: HeadingLevel.HEADING_1,
      pageBreakBefore: anneeVue !== null,
      spacing: { before: anneeVue === null ? 0 : 240, after: 200 },
      children: [new TextRun({ text: annee, font: SERIF, size: 52, bold: true, color: VERT })],
    }));
    anneeVue = annee;
  }

  enfants.push(new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 380, after: 60 },
    keepNext: true,
    children: [new TextRun({
      // Sans couleur explicite, Word applique le bleu de son style Heading 2.
      text: note.libelle, font: SERIF, size: 26, bold: true, color: ENCRE,
    })],
  }));

  if (titreDiffere(note)) {
    enfants.push(new Paragraph({
      spacing: { after: 120 },
      keepNext: true,
      children: enRuns(`Dans le cahier : « ${note.titre} »`,
        { font: SANS, size: 17, color: GRIS, italics: true }),
    }));
  }

  for (const p of note.paragraphes) {
    const puce = p.startsWith("- ");
    enfants.push(new Paragraph({
      spacing: { after: 120, line: 300 },
      alignment: AlignmentType.JUSTIFIED,
      indent: puce ? { left: 360, hanging: 180 } : undefined,
      children: enRuns(puce ? p.slice(2) : p, { font: SERIF, size: 22 }),
      bullet: puce ? { level: 0 } : undefined,
    }));
  }

  enfants.push(new Paragraph({
    spacing: { before: 60, after: 60 },
    children: [new TextRun({
      text: `Photos : ${note.photos.join(", ")}`,
      font: SANS, size: 15, color: GRIS,
    })],
  }));
}

/* ---------- Assemblage ---------- */

const doc = new Document({
  creator: "Journal de la Farigoule",
  title: "La Farigoule, journal de la maison",
  description: "Transcription du journal manuscrit de la maison de Grasse, 2000-2026",
  features: { updateFields: true },   // Word propose de calculer le sommaire à l'ouverture
  styles: {
    default: {
      document: { run: { font: SERIF, size: 22 }, paragraph: { spacing: { line: 300 } } },
    },
  },
  sections: [{
    properties: { page: { margin: { top: 1440, bottom: 1440, left: 1418, right: 1418 } } },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ children: [PageNumber.CURRENT], font: SANS, size: 16, color: GRIS })],
        })],
      }),
    },
    children: enfants,
  }],
});

const sortie = path.join(RACINE, "Journal de la Farigoule.docx");
Packer.toBuffer(doc).then((b) => {
  fs.writeFileSync(sortie, b);
  console.log(`${path.basename(sortie)} : ${notes.length} notes, ${(b.length / 1024).toFixed(0)} Ko`);
});
