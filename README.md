# LibPDF content-stream reproduction

LibPDF’s high-level drawing methods create a new content stream for every call. With many
calls, the PDF grows far beyond what the visible content requires. The low-level
`page.drawOperators([...])` API can batch the same operations into one stream.

This repo is a minimal reproduction for an upstream issue.

## Result

100 text lines, 6pt Helvetica, one A4 page:

| Variant | Bytes | Indirect stream objects |
|---|---:|---:|
| `@libpdf/core` high-level `drawText` × 100 | **24,029** | **102** |
| `@libpdf/core` `drawOperators()` once | **1,504** | **1** |
| `pdf-lib` `drawText` × 100 (baseline) | **3,028** | **1** |

The rendered page is pixel-identical in all three variants. QuickLook PNG previews have the same
SHA-256:

```
203b427611753f11fa62d41cdde55f4d69f64f0ddea95c3597c27e23aa7e01ff
```

Exact bytes can vary slightly by platform/Node version; the stream counts and the ~16× gap are
stable.

## Reproduce

```bash
npm install
npm run repro
```

PDFs are written to `out/`.

Environment used:

- `@libpdf/core` 0.5.3
- `pdf-lib` 1.17.1 (baseline)
- Node v26.8.2
- macOS arm64

## Root cause

As of `@libpdf/core` 0.5.3 and `main` at `37e756ae8ba3654a57f6f29df22e512e36717b51`:

- `PDFPage.appendContent()` creates a new content stream per call
  (`src/api/pdf-page.ts`, `appendContent` around line 2522).
- High-level `drawText()` calls `appendOperators()` once per invocation (around line 1217).
- `appendOperators()` delegates to `appendContent()` (around line 2658).
- `page.drawOperators()` appends one serialized operator array, so it can produce one stream.

The same applies to other high-level drawing methods (`drawRectangle`, `drawLine`, etc.): each call
is appended separately.

## Workaround

Register the font once, build one operator array per page, and call `drawOperators()` once:

```js
const fontName = page.registerFont(StandardFonts.Helvetica);

const operators = [
  ops.beginText(),
  ops.setFont(fontName, 6),
  ops.setNonStrokingRGB(0, 0, 0),
];

lines.forEach((line, i) => {
  operators.push(
    ops.setTextMatrix(1, 0, 0, 1, 48, 800 - i * 7),
    ops.showText(line),
  );
});

operators.push(ops.endText());
page.drawOperators(operators);
```

This is a significant API jump for users who only need the high-level drawing API, and it is not
mentioned in the low-level drawing docs as a way to control file size.

## What does not fix it

- `save({ compressionThreshold: 0 })`: reduced a 22-page document by ~1%, made small files larger.
- `save({ subsetFonts: true })`: no effect for standard fonts.
- `useXRefStream` changes: no meaningful effect.

## Issue draft

`ISSUE.md` contains the proposed upstream report.
