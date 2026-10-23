---
name: laymanize
description: >-
  Translate a dense technical or research paper into a plain-language, depth-preserving HTML walkthrough: keep the rigour, follow the paper's own section order, explain the jargon and notation instead of stripping it, and teach the reader to discuss the work fluently. The output is one self-contained HTML file with accurate analogies, original diagrams and charts, a glossary, tap-to-reveal term tooltips, talking points, and per-section self-test questions — not a summary. Use it whenever the user shares or points to a technical or scientific paper (a PDF, an arXiv or other URL, or pasted text) and wants to understand, decode, or work through it, or get its terminology explained — especially AI, machine-learning and computer-science papers, but also adjacent technical or regulatory material. Trigger even when the user never says 'laymanize', 'ELI5', or 'explain' (e.g. 'help me understand this paper' or 'break this down'). Do not use it for a short summary, a TL;DR, or plain text extraction.
---

# Laymanize — decode a technical paper without losing the rigour

This skill turns a hard technical paper into something the reader can actually follow, **without dumbing it down**. The reader (Tommy) is sharp and trained in law, not in maths or computer science. He wants to understand AI/ML papers at full depth, learn the real vocabulary, and be able to hold his own in a technical conversation afterwards. He does **not** want a summary that lets him skip the paper.

The name says the goal plainly — put the paper into a layman's terms — but read that as a brief for *clarity*, not for childishness. The job is closer to **translation** than simplification: keep the structure, keep the notation, keep the technical terms — just render them in language he can follow, and teach the terms as you go. Whenever you feel the pull to flatten an idea into a cute one-liner that loses the real concept, that pull is the thing to resist.

## What you are producing

A single self-contained **HTML file** that walks through the paper **section by section, at the paper's own depth**, and along the way:

- keeps every technical term and teaches it (never silently swaps it for baby-talk);
- gives full plain-language treatment to the equations that carry the ideas, and a lighter touch to the ones that don't;
- builds intuition with accurate analogies, flagging where each analogy breaks down;
- illustrates structure and relationships with **original** inline-SVG diagrams (and charts where something is genuinely quantitative);
- carries four learning aids — a glossary panel, inline term tooltips, "talking points", and self-test questions.

Save the file to `/mnt/user-data/outputs/` and present it with the `present_files` tool. The file uses CDN-hosted fonts and MathJax, so it needs a network connection to render fully; that is fine for normal use. (If the user later wants a fully offline version, that is a follow-up, not the default.)

---

## The prime directive: translate, don't summarise

A summary tells the reader the gist so they can skip the paper. A translation lets the reader read *this* paper at full depth in language they understand. You are doing the second thing.

Concretely:

- **Mirror the paper's structure.** Use the paper's actual sections and roughly its order (Abstract, Introduction, Related Work, Method/Architecture, Experiments, Results, Ablations, Limitations, Conclusion — or whatever this paper uses). Do not collapse three sections into one tidy paragraph.
- **Cover every claim and mechanism.** Each idea, step, result, and caveat in the paper should appear in the walkthrough, re-expressed accessibly. The **map-back test**: a reader should be able to point at any part of your walkthrough and find the part of the paper it corresponds to, and vice versa. If a section of the paper has no counterpart in your output, you have summarised, not translated.
- **Length is not a constraint.** Faithful depth on a long paper produces a long document. That is correct. Do not trim ideas to hit a length target.

The *why*: the entire value here is that Tommy can afterwards open the original PDF and recognise everything in it. A Cliff's Notes version actively defeats that.

---

## Core principles

### 1. Keep the jargon — teach it, don't replace it

When a technical term first appears, introduce it **both ways at once**: state the real term and define it precisely, *and* give the plain-language intuition (and an analogy if it helps). Then keep using the real term for the rest of the document, with a tooltip attached for recall.

Do this: "The model uses an **attention mechanism** — a way for each word to look at every other word and decide which ones matter for interpreting it, weighting them accordingly." Then keep saying "attention", not "the looking-at-things part".

The *why*: Tommy's stated goal is to converse fluently using the correct vocabulary. Stripping the terms out would leave him able to nod along but unable to speak the language. Every term you teach is a word he can now use.

### 2. Maths where it matters (adaptive treatment)

Not every equation deserves the same effort. Decide whether an equation is **load-bearing**:

> An equation is load-bearing if it *is* the contribution, or if you genuinely cannot understand the mechanism without it — the attention formula in a transformer paper, the loss function being introduced, the core update rule, the key inequality a proof hinges on.

For **load-bearing** equations:
1. Show the equation, rendered properly (MathJax — see the template).
2. Name and define **every symbol** in plain language ("$Q$ is the *query* matrix — one row per token, each row asking 'what am I looking for?'").
3. Explain what the equation *does* operationally: what goes in, what comes out, and why this particular form.
4. Where it helps, add a tiny **worked micro-example** with small concrete numbers, or an analogy.

For **non-load-bearing** maths (routine derivations, notation-heavy restatements, standard algebra): say in a sentence or two what it establishes and move on. If the full derivation is interesting but not essential, tuck it inside an expandable **"For the curious"** disclosure (the template provides one) so it is available without clogging the main read.

The *why*: unpacking every symbol of every equation would bury the ideas that actually matter under a mountain of routine notation. Spending the deep treatment on the load-bearing equations keeps the rigour exactly where it counts and the pace readable everywhere else.

### 3. Analogies — accurate, honest about their limits, and well-chosen

Analogies are ladders to the real concept, not substitutes for it.

- **Accurate over evocative.** A vivid analogy that quietly misleads is worse than a plain explanation. Make the mapping correct.
- **Flag the leak.** Every analogy breaks down somewhere. Say where: "This is like X — though unlike X, here Y." This stops the reader over-extending the metaphor into a misconception.
- **Use the reader's world where it genuinely fits.** Tommy knows law, business strategy, music, fitness/sport, and Japanese craftsmanship. An analogy from one of these can land hard *when it fits* — but never force a strained courtroom metaphor where a plainer one is clearer. The plainest accurate analogy wins.
- **Put it in the collapsible analogy block.** The template provides a dedicated `<details class="analogy">` that sits **collapsed by default** — folded behind an "Analogy" summary the reader taps open. Use it for every analogy rather than weaving the metaphor into the running prose: a reader who already has the intuition reads straight through at the paper's own register, and one who wants the ladder opens it. (This is distinct from principle 6: *added context* — a prerequisite the paper assumes — is not an analogy, and stays in the always-visible "Background — added by EVI" callout.)

### 4. Original visuals only

Generate your **own** explanatory diagrams. Do **not** reproduce the paper's figures (cleaner on copyright, and redrawing forces real understanding — you cannot diagram what you do not understand).

- **Inline SVG** for architecture and data-flow diagrams, process/sequence flows, conceptual relationships, before/after comparisons, "shape of the idea" schematics. Patterns and reusable scaffolds are in `references/diagram-patterns.md` — read that file when you are about to build diagrams.
- **Charts (Chart.js via CDN)** only for genuinely quantitative content — redrawing the *shape* of a results curve, an ablation comparison, a scaling trend. Label these as illustrative redrawings and attribute the underlying numbers to the paper (e.g. "redrawn from Table 2").
- Every visual must earn its place by making one specific idea clearer. Cut decorative diagrams — restraint reads as quality.

### 5. Register: a sharp colleague, not a child

Write the content as if explaining to an intelligent professional from a different discipline. Respect the reader's intelligence; never condescend. Keep sentences clean and readable, but assume curiosity and capacity. This is the practical guardrail against the name being read as "dumb it down": a layman is a non-specialist, not a simpleton.

### 6. Fidelity and honesty

- Do not invent results or claims the paper does not make.
- Do not smooth over the paper's own hedges, assumptions, or limitations — those are part of understanding it honestly.
- If the paper omits background the reader needs, you may add it, **clearly marked** as added context (the template provides a callout; label it, e.g. "Background — added by EVI"). Do not put added context in the paper's mouth.
- If you are unsure whether the paper actually says something, flag the uncertainty rather than asserting. Where confirming a prerequisite concept (a cited method, a standard definition) would improve accuracy, it is fine to search the web for it.

---

## The learning apparatus (build all four)

These serve the meta-goal: not just reading the paper once, but being able to *recall* and *discuss* it. Active recall and rehearsal are how understanding consolidates; passive reading feels like learning but largely isn't.

- **Glossary panel.** A collected list of every technical term used, each with a concise plain definition (and the formal definition too, where the two differ). It lives in a slide-in panel the reader can open at any time, and it is the canonical source the tooltips draw from. Build it as you go, then surface it at the end.
- **Inline term tooltips.** Mark glossary terms in the body so the reader can click/tap to reveal the definition in place without losing their spot. The template's tooltip is **tap-to-toggle**, so it works on mobile (Tommy reads on his phone) as well as desktop. Mark at least the first occurrence of each term; mark later occurrences too if the document is long and the reader may have forgotten.
- **Talking points** ("How to say it"). For each major concept or section, give a few sample sentences modelling how to phrase the idea aloud in a real technical conversation — the kind of thing he could say to an ML engineer and sound fluent. This is the direct bridge to "hold a conversation about it".
- **Self-test** ("Check your understanding"). At the end of each major section, a few reveal-on-click questions that test genuine understanding and recall — not trivia. Good questions ask the reader to explain *why* something works, or to predict what would happen if a piece changed.

Arrangement: keep **talking points and self-test per section** (attached to the section, collapsible), and keep the **glossary consolidated** in its panel with tooltips throughout. The template implements all of this.

---

## Workflow

**Step 0 — Get the paper into context.** If its content is not already visible:
- Uploaded PDF → read it. Consult `/mnt/skills/public/pdf-reading/SKILL.md` for how to read it well (text extraction, and rasterising pages when figures/equations matter).
- arXiv or other URL → fetch it (`web_fetch`; for arXiv prefer the `/abs/` or `/pdf/` page already given to you).
- Pasted text → use it directly.

**Step 1 — Read the whole paper first, before writing anything.** You cannot translate faithfully what you have not fully read. As you read, build an inventory: the paper's real section structure; its core contribution in one honest sentence; which equations are load-bearing; which terms will need defining (your glossary seed); which figures' *ideas* you will need to redraw as original SVG.

**Step 2 — Plan the walkthrough** to mirror the paper's structure. Decide section order, where diagrams will earn their place, and which maths gets the full treatment versus a "for the curious" disclosure.

**Step 3 — Build the HTML.** Copy `assets/template.html` into your working directory (it is the scaffold: styles, fonts, MathJax, tooltip/glossary/self-test JavaScript, and worked examples of every component). Then populate it:
- Replace the title and metadata.
- Write each section following the patterns in the template, applying the principles above.
- Render equations with MathJax (`$...$` inline, `$$...$$` display).
- Author original inline-SVG diagrams using the scaffolds in `references/diagram-patterns.md`.
- Mark glossary terms for tooltips; attach a per-section talking-points block and self-test block; build up the glossary panel entries.
- Add Chart.js (the template shows where) only if you are drawing a quantitative chart.

**Step 4 — Fidelity pass.** Re-skim the paper against your draft and confirm coverage: every section represented, every major claim and caveat present, the map-back test satisfied. Fix gaps.

**Step 5 — Deliver.** Save to `/mnt/user-data/outputs/`, present with `present_files`, and offer sensible follow-ups (e.g. "I can go deeper on the maths in §3", "I can add a diagram of the training loop", "I can make a fully offline version").

---

## Reading and rendering notes

- **No browser storage.** Do not use `localStorage`/`sessionStorage` — keep all interactive state in memory. (The file may render inside a sandboxed viewer that blocks storage.)
- **Mobile matters.** Tooltips are tap-to-toggle; the layout is responsive; check that nothing depends on hover alone.
- **CSS specificity.** When extending the template's styles, avoid element-plus-class selectors that fight each other on margins/padding (a common source of silent layout bugs). Prefer the class system already in place.
- **MathJax** is wired in the template head; just write LaTeX. **Chart.js** is left out by default to keep the file lean — add the CDN line (shown, commented, in the template) only when you actually chart something.
- **Use the theme variables for colour — including in your diagrams.** The light/dark toggle works by swapping CSS variables (`--ink`, `--accent`, `--surface`, and the rest) on `#lz-root`. Every colour you write — in callouts and especially in your SVG figures — must reference those variables (e.g. `style="fill:var(--accent-tint); stroke:var(--accent)"`), never a hard-coded hex, or it will look broken in the other mode (dark text on a dark figure, glaring white boxes). `references/diagram-patterns.md` follows this.
- **The chrome is already built.** Section navigation, the reading-progress bar, the slide-in Contents and Glossary drawers, tap-to-toggle tooltips, the collapsible "for the curious" and analogy asides, and a light/dark theme toggle are all wired in the template. You only write content into the components — do not rebuild the apparatus or rename its element IDs (`lz-root`, `nav-list`, `glo-<slug>`, and the rest), or the JavaScript will stop finding them.

---

## Edge cases

- **Very long papers.** Cover the whole thing; let the document be long. If it is enormous, you may group closely-related subsections under one heading, but never drop content.
- **Papers with little or no maths.** The maths policy simply produces fewer equations; everything else is unchanged.
- **Surveys / position papers.** Their structure differs from an empirical paper — follow whatever structure the paper actually has.
- **Adjacent (non-AI) technical papers.** Apply the identical method; the analogies may shift domain, and the load-bearing-maths test still applies.

---

## Files in this skill

- `assets/template.html` — the HTML scaffold. Copy it, then fill it in. It contains the styling, fonts, MathJax wiring, the tooltip/glossary/self-test/section-nav/reading-progress JavaScript, and a worked example of every content component so you can see the exact markup each one expects.
- `references/diagram-patterns.md` — reusable inline-SVG scaffolds (architecture box-and-arrow, horizontal flow, comparison, annotated formula), written with theme variables so the diagrams adapt to light and dark mode. Read it when you are about to draw diagrams.
