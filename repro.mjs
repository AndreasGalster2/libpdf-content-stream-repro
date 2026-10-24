import { mkdir, writeFile } from "node:fs/promises";

import { PDF, StandardFonts, ops } from "@libpdf/core";
import { PDFDocument, StandardFonts as PdfLibStandardFonts } from "pdf-lib";

const PAGE = { width: 595.28, height: 841.89 };
const LINE_COUNT = 100;
const FONT_SIZE = 6;
const LINE_HEIGHT = 7;
const START_Y = 800;
const LEFT = 48;

const lines = Array.from(
  { length: LINE_COUNT },
  (_, index) =>
    `Line ${index + 1}: The quick brown fox jumps over the lazy dog.`,
);

function pinnedLibPdf() {
  const pdf = PDF.create();
  pdf.setCreationDate(new Date(0));
  pdf.setModificationDate(new Date(0));
  pdf.setTitle("Content stream reproduction");
  pdf.setProducer("libpdf-content-stream-repro");
  return pdf;
}

async function libpdfHighLevel() {
  const pdf = pinnedLibPdf();
  const page = pdf.addPage(PAGE);

  lines.forEach((line, index) => {
    page.drawText(line, {
      x: LEFT,
      y: START_Y - index * LINE_HEIGHT,
      size: FONT_SIZE,
      font: StandardFonts.Helvetica,
    });
  });

  return pdf.save();
}

async function libpdfBatched() {
  const pdf = pinnedLibPdf();
  const page = pdf.addPage(PAGE);
  const fontName = page.registerFont(StandardFonts.Helvetica);

  const operators = [
    ops.beginText(),
    ops.setFont(fontName, FONT_SIZE),
    ops.setNonStrokingRGB(0, 0, 0),
  ];

  lines.forEach((line, index) => {
    operators.push(
      ops.setTextMatrix(1, 0, 0, 1, LEFT, START_Y - index * LINE_HEIGHT),
      ops.showText(line),
    );
  });

  operators.push(ops.endText());
  page.drawOperators(operators);

  return pdf.save();
}

async function pdfLib() {
  const pdf = await PDFDocument.create();
  pdf.setCreationDate(new Date(0));
  pdf.setModificationDate(new Date(0));
  pdf.setTitle("Content stream reproduction");
  pdf.setProducer("libpdf-content-stream-repro");

  const font = await pdf.embedFont(PdfLibStandardFonts.Helvetica);
  const page = pdf.addPage([PAGE.width, PAGE.height]);

  lines.forEach((line, index) => {
    page.drawText(line, {
      x: LEFT,
      y: START_Y - index * LINE_HEIGHT,
      size: FONT_SIZE,
      font,
    });
  });

  return pdf.save();
}

async function countStreamObjects(bytes) {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  return doc.context
    .enumerateIndirectObjects()
    .filter(([, object]) => object.constructor.name.includes("Stream")).length;
}

const variants = [
  ["libpdf-high-level", libpdfHighLevel],
  ["libpdf-batched", libpdfBatched],
  ["pdf-lib", pdfLib],
];

await mkdir("out", { recursive: true });

console.log(`Node ${process.version}`);
console.log(`@libpdf/core 0.5.3, pdf-lib 1.17.1`);
console.log(`${LINE_COUNT} text draws, ${FONT_SIZE}pt Helvetica\n`);

console.log("variant".padEnd(20), "bytes".padStart(8), "streams".padStart(8));
console.log("-".repeat(38));

for (const [name, render] of variants) {
  const bytes = await render();
  const streams = await countStreamObjects(bytes);
  console.log(
    name.padEnd(20),
    String(bytes.length).padStart(8),
    String(streams).padStart(8),
  );
  await writeFile(`out/${name}.pdf`, bytes);
}

console.log("\nWrote PDFs to out/");
