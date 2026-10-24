## Summary

Each high-level drawing call (`drawText`, `drawRectangle`, `drawLine`, etc.) creates a new content
stream on the page. With many calls the output is much larger than necessary, even though the
visible content is identical. The low-level `page.drawOperators([...])` API can batch the same
operations into one stream and is dramatically smaller.

100 text lines, 6pt Helvetica, one page:

| Variant | Bytes | Indirect stream objects |
|---|---:|---:|
| `@libpdf/core` high-level `drawText` × 100 | 24,029 | 102 |
| `@libpdf/core` `drawOperators()` once | **1,504** | **1** |
| `pdf-lib` `drawText` × 100 (baseline) | 3,028 | 1 |

The rendered page is pixel-identical in all three variants (QuickLook PNG SHA-256 is the same).

## Environment

- `@libpdf/core` 0.5.3
- Node v26.8.2
- macOS arm64
- `pdf-lib` 1.17.1 for the baseline
- `main` at `37e756ae8ba3654a57f6f29df22e512e36717b51`

## Reproduction

Repo: https://github.com/AndreasGalster2/libpdf-content-stream-repro

```bash
npm install
npm run repro
```

Minimal fragment:

```js
const page = pdf.addPage();
const fontName = page.registerFont(StandardFonts.Helvetica);

const operators = [ops.beginText(), ops.setFont(fontName, 6)];
for (let i = 0; i < 100; i++) {
  operators.push(
    ops.setTextMatrix(1, 0, 0, 1, 48, 800 - i * 7),
    ops.showText(`Line ${i + 1}: The quick brown fox jumps over the lazy dog.`),
  );
}
operators.push(ops.endText());

page.drawOperators(operators); // one stream
// vs. 100 × page.drawText(...)  // 100 streams
```

## Root cause

As of 0.5.3 / the commit above:

- `PDFPage.appendContent()` creates a new content stream per call
  (`src/api/pdf-page.ts`, around line 2522).
- High-level `drawText()` calls `appendOperators()` once per invocation (around line 1217).
- `appendOperators()` delegates to `appendContent()` (around line 2658).
- `page.drawOperators()` appends one serialized array, so it can produce one stream.

The same applies to every other high-level drawing method.

## What I tried

- `save({ compressionThreshold: 0 })`: reduced a 22-page document by ~1%, made small files larger.
- `save({ subsetFonts: true })`: no effect for standard fonts.
- `useXRefStream` changes: no meaningful effect.
- Batching multi-line text into one `drawText` call helps, but it cannot merge separate fields or
  columns.

## Impact

- A receipt with ~25 high-level draws: ~4.7 KB vs ~1.7 KB with pdf-lib.
- A 22-page, ~400-block document: ~161 KB vs ~36 KB with pdf-lib.
- The extra objects also have to be serialized and compressed, which likely contributes to slower
  generation on many-draw documents.

## Request

1. Is the per-call stream creation intentional?
2. Would you consider coalescing page content streams on full save (not incremental), or an opt-in
   `save({ coalesceContentStreams: true })`? Incremental saves and signed documents would obviously
   need to keep the append-only behavior.
3. If `drawOperators` is the intended path, could the docs call out the file-size/performance
   tradeoff and show the batched pattern? The low-level drawing docs currently present
   `drawOperators` for transforms/gradients, not as the remedy for many high-level draws.
4. Could `benchmarks/drawing.bench.ts` record output bytes as well as time, so this stays visible in
   the weekly benchmark report?

I’m happy to open a PR with a docs note and/or a benchmark if that would be useful. I did not find an
existing issue for this; apologies if it is tracked elsewhere.
