# Diagram patterns for Laymanize

Read this when you are about to draw a diagram. Author **original** inline SVG — never reproduce the paper's figures. Every diagram should make one specific idea clearer; if it doesn't, cut it.

## Colours: use the theme variables, so light and dark mode both work

The template themes everything through CSS variables on `#lz-root`, and it ships a light/dark toggle. Your SVG must use those variables too — applied through a `style="…"` attribute, **not** the old `fill="#hex"` form — or the diagram turns dark-on-dark (or glares white-on-dark) the moment the reader switches mode.

- Lines / arrows / "active" stroke: `var(--accent)`
- Filled "active" box: `fill:var(--accent-tint)`, `stroke:var(--accent)`
- Plain box: `fill:var(--surface)`, `stroke:var(--accent)`
- Muted / "prior" box: `fill:var(--surface-2)`, `stroke:var(--line-strong)`
- Primary text: `fill:var(--ink)`; secondary text: `fill:var(--ink-faint)`; emphasis label: `fill:var(--accent-deep)`
- Font: set `style="font-family:var(--display)"` on the `<svg>` (Space Grotesk); `<text>` children inherit it.
- Keep stroke widths at `1.5`, corner radius `8`–`10`, font-size `13`–`15`.

An element takes only one `style` attribute, so combine fill and stroke together: `style="fill:var(--surface); stroke:var(--accent);"`. Numeric attributes like `stroke-width` stay as ordinary attributes.

Wrap every diagram in the template's `<figure>` … `<figcaption>` so it inherits spacing and caption styling. State "redrawn from Fig. n / Table n" in the caption when it mirrors the paper's data.

## When SVG, when Chart.js

- **Inline SVG** — architecture, data flow, sequence/pipeline, conceptual relationships, before/after, "shape of the idea" schematics. Almost everything.
- **Chart.js** (uncomment its CDN line in the template head) — only genuinely quantitative redraws: a loss/accuracy curve's shape, an ablation bar comparison, a scaling trend. Read the theme colours at run time (see the example below) so the chart matches the active mode; label it as illustrative and attribute the numbers to the paper.

## Shared arrowhead

Put this `<defs>` once inside any SVG that uses arrows:

```html
<defs>
  <marker id="arrow" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto">
    <path d="M0,0 L7,3 L0,6 Z" style="fill:var(--accent);"/>
  </marker>
</defs>
```

Then add `marker-end="url(#arrow)"` to any `<line>` or `<path>`.

---

## Pattern 1 — horizontal pipeline (A → B → C)

Good for "input goes through these stages and out comes the result".

```html
<svg viewBox="0 0 680 140" role="img" aria-label="Pipeline: tokens to embeddings to output" xmlns="http://www.w3.org/2000/svg" style="font-family:var(--display);">
  <defs><marker id="arrow" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" style="fill:var(--accent);"/></marker></defs>
  <g font-size="14">
    <rect x="20"  y="45" width="150" height="50" rx="8" style="fill:var(--surface); stroke:var(--accent);" stroke-width="1.5"/>
    <text x="95"  y="75" text-anchor="middle" style="fill:var(--ink);">Tokens</text>
    <line x1="170" y1="70" x2="245" y2="70" style="stroke:var(--accent);" stroke-width="1.5" marker-end="url(#arrow)"/>
    <rect x="250" y="45" width="170" height="50" rx="8" style="fill:var(--accent-tint); stroke:var(--accent);" stroke-width="1.5"/>
    <text x="335" y="75" text-anchor="middle" style="fill:var(--ink);">Embeddings</text>
    <line x1="420" y1="70" x2="495" y2="70" style="stroke:var(--accent);" stroke-width="1.5" marker-end="url(#arrow)"/>
    <rect x="500" y="45" width="160" height="50" rx="8" style="fill:var(--surface); stroke:var(--accent);" stroke-width="1.5"/>
    <text x="580" y="75" text-anchor="middle" style="fill:var(--ink);">Output</text>
  </g>
</svg>
```

## Pattern 2 — stacked layers (bottom-up architecture)

Good for "this sits on top of that". Draw from bottom (input) to top (output).

```html
<svg viewBox="0 0 360 260" role="img" aria-label="Stacked layers" xmlns="http://www.w3.org/2000/svg" style="font-family:var(--display);">
  <g font-size="13" text-anchor="middle">
    <rect x="70" y="200" width="220" height="44" rx="8" style="fill:var(--surface); stroke:var(--accent);" stroke-width="1.5"/><text x="180" y="227" style="fill:var(--ink);">Input layer</text>
    <rect x="70" y="146" width="220" height="44" rx="8" style="fill:var(--accent-tint); stroke:var(--accent);" stroke-width="1.5"/><text x="180" y="173" style="fill:var(--ink);">Hidden block ×N</text>
    <rect x="70" y="92"  width="220" height="44" rx="8" style="fill:var(--accent-tint); stroke:var(--accent);" stroke-width="1.5"/><text x="180" y="119" style="fill:var(--ink);">Attention + FFN</text>
    <rect x="70" y="38"  width="220" height="44" rx="8" style="fill:var(--surface); stroke:var(--accent);" stroke-width="1.5"/><text x="180" y="65" style="fill:var(--ink);">Output head</text>
  </g>
</svg>
```

## Pattern 3 — two-column comparison (before / after, ours / theirs)

```html
<svg viewBox="0 0 660 200" role="img" aria-label="Comparison" xmlns="http://www.w3.org/2000/svg" style="font-family:var(--display);">
  <g>
    <text x="170" y="28" text-anchor="middle" font-size="13" font-weight="600" style="fill:var(--ink-faint);">PRIOR APPROACH</text>
    <rect x="30" y="44" width="280" height="130" rx="10" style="fill:var(--surface-2); stroke:var(--line-strong);" stroke-width="1.5"/>
    <text x="170" y="115" text-anchor="middle" font-size="14" style="fill:var(--ink);">[[what it did / its limit]]</text>

    <text x="490" y="28" text-anchor="middle" font-size="13" font-weight="600" style="fill:var(--accent-deep);">THIS PAPER</text>
    <rect x="350" y="44" width="280" height="130" rx="10" style="fill:var(--accent-tint); stroke:var(--accent);" stroke-width="1.5"/>
    <text x="490" y="115" text-anchor="middle" font-size="14" style="fill:var(--ink);">[[the change / the gain]]</text>
  </g>
</svg>
```

## Pattern 4 — labelled loop / feedback

For training loops or iterative procedures, draw boxes around a cycle and use a curved `<path>` with `marker-end="url(#arrow)"` to close the loop back to the start. Add a short label on the return arrow (e.g. "update weights").

---

## Quick Chart.js example (only when quantitative)

Read the theme colours from `#lz-root` at run time so the chart matches the active mode:

```html
<figure>
  <canvas id="c1" height="220" aria-label="Accuracy vs model size (redrawn)"></canvas>
  <figcaption style="font-family:var(--mono); font-size:.74rem; color:var(--ink-faint); margin-top:.7rem; text-align:center;"><span style="color:var(--accent-deep); font-weight:500;">Figure B.</span> Accuracy vs. model size — redrawn from Table 2.</figcaption>
</figure>
<script>
  (function(){
    var css = getComputedStyle(document.getElementById('lz-root'));
    var accent = css.getPropertyValue('--accent').trim();
    var tint   = css.getPropertyValue('--accent-tint').trim();
    var ink    = css.getPropertyValue('--ink-soft').trim();
    new Chart(document.getElementById('c1'), {
      type:'line',
      data:{ labels:['S','M','L','XL'], datasets:[{ label:'Accuracy', data:[71,78,84,88],
        borderColor:accent, backgroundColor:tint, tension:.3, fill:true }]},
      options:{ plugins:{legend:{labels:{color:ink, font:{family:'Space Grotesk'}}}},
        scales:{ x:{ticks:{color:ink, font:{family:'Space Grotesk'}}}, y:{ticks:{color:ink, font:{family:'Space Grotesk'}}} } }
    });
  })();
</script>
```

The chart is coloured for whichever mode is active when it loads; it will not repaint on a later toggle (the SVG diagrams above do adapt live). Keep charts honest: if the paper reports four data points, draw four — do not invent a smooth curve the data doesn't support.
