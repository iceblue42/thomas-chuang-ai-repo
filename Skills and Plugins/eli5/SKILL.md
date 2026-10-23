---
name: eli5
description: >-
  Generate a from-scratch, plain-language HTML explainer of a single concept the user names, in any field, when they have NOT supplied a source document. Build understanding from zero for a smart non-specialist: lead with intuition and an accurate analogy, then introduce and teach the real technical vocabulary (never strip the jargon), unpack any load-bearing equations, and ground claims without fabricating citations. The output is one self-contained, illustrated HTML file with diagrams, a glossary, tooltips, talking points, and self-test questions — not a quick definition. Use it whenever the user types '/ELI5 [topic]' or asks to explain, break down, demystify, or 'ELI5' a concept, even without the word 'ELI5' (e.g. 'help me understand gradient descent', 'what actually is a futures contract'). Do NOT use it when the user gives a paper, PDF, URL, or pasted text to walk through (that is the 'laymanize' skill), or when a one-line answer is all they want.
---

# ELI5 — explain any concept from scratch, without leaving the jargon behind

This skill builds a genuine, ground-up understanding of **one concept** for a reader who is sharp but not a specialist in the topic. The reader (Tommy) is trained in law and fluent in business, AI, music, and fitness, but an ELI5 might land on *any* field — derivatives pricing, diffusion models, the doctrine of consideration, VO2 max — including ones he knows nothing about. He wants to come out the other side actually understanding the idea **and able to use its real vocabulary**, not holding a vague gist.

The crucial difference from the sister skill `laymanize`: **there is no source document.** Laymanize decodes a paper the user hands you, mirroring its structure. ELI5 starts from a bare term and *you* generate the explainer. That changes two things fundamentally — you supply the structure (there is nothing to mirror), and you are responsible for the accuracy of every claim (there is no source to be faithful to). Both are addressed below.

Read the name as a brief for a **gentle on-ramp**, not for childishness. "Explain like I'm five" means *assume no prior knowledge and start from intuition* — it does **not** mean dumb the idea down or hide the real terms. The reader should finish able to say "gradient descent", "convexity", "force-major­e clause" correctly, not "the downhill-walking thing".

## What you are producing

A single self-contained **HTML file** that walks the reader from "never heard of it" to "I get this and can talk about it", and along the way:

- opens with plain intuition and an accurate analogy, *then* names and teaches the real term on top of the intuition the reader now holds;
- keeps every technical term and teaches it (never silently swaps it for baby-talk);
- gives full plain-language treatment to any load-bearing equation, ramping into the notation rather than opening with it;
- illustrates structure and relationships with **original** inline-SVG diagrams (and charts where something is genuinely quantitative);
- names the common misconceptions — the errors that reveal someone *doesn't* really understand it;
- carries four learning aids — a glossary panel, inline term tooltips, "talking points", and self-test questions.

Save the file to `/mnt/user-data/outputs/` and present it with the `present_files` tool. It uses CDN-hosted fonts and MathJax, so it needs a network connection to render fully; that is fine for normal use. (A fully offline version is a follow-up, not the default.)

---

## The prime directive: build understanding, don't just define

A dictionary entry tells the reader what a word means. An explainer makes the reader *understand the thing* — well enough to reconstruct it, use the vocabulary, and spot when someone else has it wrong. You are doing the second thing. If the document could be replaced by a two-line definition, you have under-built it.

Two non-negotiable commitments follow from there being no source:

- **Earn the depth.** Cover the concept properly — what it is, why it matters, how it actually works, a worked example, where people go wrong — at real depth. But do not pad. Length should track the genuine complexity of the concept, not a target. A simple idea gets a short, complete explainer; a deep one gets a long one.
- **Ground every claim (principle 2 below).** Because nothing anchors you to a source, accuracy is *your* job, and the failure mode to fear is confident invention.

---

## Core principles

### 1. Beginner on-ramp, fluent exit — the register

This is the heart of ELI5 and the thing most easily got wrong. The sequence for every new idea is **intuition first, real term second**:

1. Build the plain intuition, ideally with an accurate analogy, assuming the reader knows nothing.
2. *Then* land the real term on top of the intuition they now hold, and define it precisely.
3. Keep using the real term afterwards, with a tooltip attached for recall and a glossary entry behind it.

Do this: "Imagine you're lost on a foggy hillside and want to reach the bottom. You can't see the valley, but you can feel which way the ground slopes under your feet, so you take a step downhill, then feel again, and repeat. That is exactly what **gradient descent** does — it's a method for finding the lowest point of a function by repeatedly stepping in the direction the function falls most steeply." Then keep saying "gradient descent", not "the downhill-walking method".

Contrast this with `laymanize`, which names the term *first* and then defines it — appropriate there because that reader is already technical-adjacent and reading a paper that uses the term. ELI5's reader may be meeting the word for the first time, so the intuition has to arrive before the label or the label means nothing.

The *why*: the two failure modes are opposite and equally bad. Strip the jargon and the reader feels they understood but can't speak the language or read anything real afterwards. Lead with the jargon and a true beginner bounces off the first sentence. Intuition-then-term threads between them: nobody is left behind, and everybody leaves fluent. Every term you teach this way is a word the reader can now actually use.

### 2. Ground every claim; never fabricate a citation

With no source document, accuracy rests entirely on you, and the temptation to invent is the real danger.

- **Established concepts:** rely on settled knowledge, but hold yourself to the standard of *would this survive a check against a standard textbook?* If you are not confident a specific detail is correct, treat it as the next bullet.
- **Recent, contested, numeric, or named-specific claims:** verify by web search before asserting — anything with a date, a figure, a "the largest / the first / the standard", a recent development, or a contested interpretation. Misremembered specifics are where hallucination bites hardest.
- **Never fabricate a citation.** A skill told to "be authoritative" will, unguarded, manufacture plausible-looking references — a worse outcome than none. Cite only what you actually verified or what is genuinely standard knowledge stated as such. An honest, near-empty sources note beats a fake-full one. Do not invent paper titles, page numbers, or URLs.
- **Flag genuine uncertainty** rather than smoothing it over, and **distinguish settled consensus from contested or interpretive territory.** If experts disagree, say so and give the shape of the disagreement; do not present one camp's view as fact.

The body of the document stays **self-contained** — no flow-breaking "go and read this to follow along" links. Grounding is a discipline, not a bibliography. The template provides one *collapsed* "Sources & accuracy" block at the end, invisible to the main read, where you record the authoritative sources you actually leaned on or verified. It is fine for that block to be short, or to note simply that the explanation reflects standard textbook treatment of a well-established idea.

### 3. Maths where it matters — and ramp into the notation

Not every concept has maths; many (a legal doctrine, an economic idea) have none, and that is fine. Where maths appears, decide whether an equation is **load-bearing**:

> An equation is load-bearing if it *is* the idea, or if you genuinely cannot understand the mechanism without it — the update rule in gradient descent, the compound-interest formula, the core inequality a result hinges on.

For **load-bearing** equations, because the reader is a beginner:
1. Build the idea in words *first*, so the symbols have meaning to attach to.
2. Then show the equation, rendered properly (MathJax — see the template).
3. Name and define **every symbol** in plain language, framing the notation as a compact shorthand for what the reader already understands.
4. Add a small **worked micro-example** with concrete numbers wherever it helps — for a beginner this is often the moment it clicks.

For **non-load-bearing** maths, say in a sentence what it establishes and move on, or tuck a fuller derivation inside the expandable **"For the curious"** disclosure the template provides, so it is available without slowing the main read.

The *why*: hiding the real maths would betray the jargon-teaching promise; opening with a wall of symbols would lose the beginner. Ramping in keeps both the rigour and the reader.

### 4. Analogies — accurate, honest about their limits, well-chosen

For a beginner the analogy is the **primary path in**, not an optional aside, so it lives in a *visible* analogy block (the template provides one), not hidden behind a fold.

- **Accurate over evocative.** A vivid analogy that quietly misleads is worse than a plain explanation. Make the mapping correct.
- **Flag the leak.** Every analogy breaks somewhere. Say where: "This is like X — though unlike X, here Y." This stops the reader over-extending the metaphor into a misconception.
- **Reach for the reader's world only where it genuinely fits.** Tommy knows law, business, music, fitness, and Japanese craftsmanship — an analogy from one can land hard *when it fits*, but a forced courtroom metaphor is worse than a plain everyday one. The plainest accurate analogy wins, whatever its domain.

### 5. Original visuals only

Generate your **own** explanatory diagrams; do not lift images from anywhere (cleaner on copyright, and drawing it forces real understanding — you cannot diagram what you do not understand).

- **Inline SVG** for structure, data-flow, process/sequence, conceptual relationships, before/after comparisons, "shape of the idea" schematics. Reusable scaffolds are in `references/diagram-patterns.md` — read that file when you are about to build diagrams.
- **Charts (Chart.js via CDN)** only for genuinely quantitative content — a growth curve, a comparison, a trend. If the numbers depict something real, say so in the caption.
- Every visual must earn its place by making one specific idea clearer. Cut decorative diagrams — restraint reads as quality.

---

## The canonical arc — your structure

Laymanize mirrors a paper's sections; you have no paper, so use this arc as the default spine. Each step is one `<section>`. Not every concept needs every step — skip the equation work when there is no maths, skip a step that genuinely does not apply — but this is the order that takes a beginner to fluency:

1. **The one-sentence version** — what it is, honestly, in a single line (this is the header *lede* in the template).
2. **Why it matters / where you meet it** — the motivation and real stakes, so the idea is not abstract.
3. **The core intuition** — the central analogy, done accurately, leak flagged. This is where the beginner on-ramp lives.
4. **How it actually works** — the real mechanism at proper depth, introducing and teaching the real vocabulary; load-bearing maths gets its full ramped treatment here.
5. **A worked example** — small concrete numbers, or a concrete scenario walked end to end. For a beginner this is often where it all lands.
6. **Common misconceptions** — the specific errors that reveal someone *doesn't* really get it. This has no laymanize equivalent and is where a lot of ELI5's value sits; it doubles as a comprehension check.
7. **Where it connects** — adjacent ideas, what it's often confused with, and what to learn next.

For a very broad term ("machine learning", "contract law") do not try to teach the whole field — pick the core meaning, explain that well, and offer to go deeper on a named sub-part.

---

## The learning apparatus — build all four

These serve the meta-goal: not understanding the concept once, but being able to *recall* and *discuss* it. Active recall and rehearsal are how understanding consolidates; passive reading feels like learning but largely isn't.

- **Glossary panel.** Every technical term you taught, each with a concise plain definition (and the formal one too, where they differ). It lives in a slide-in panel and is the canonical source the tooltips draw from. Build it as you go.
- **Inline term tooltips.** Mark glossary terms in the body so the reader can tap to reveal the definition in place. The tooltip is **tap-to-toggle**, so it works on mobile (Tommy reads on his phone). Mark at least the first occurrence of each term.
- **Talking points** ("How to say it"). For each major idea, a few sample sentences modelling how to phrase it aloud and sound fluent — the direct bridge to holding a conversation about it.
- **Self-test** ("Check your understanding"). At the end of each major section, a few reveal-on-click questions that test genuine understanding — ask the reader to explain *why* something works, or predict what changes if a piece changes, not to recall trivia.

Keep **talking points and self-test per section**; keep the **glossary consolidated** in its panel with tooltips throughout. The template implements all of this.

---

## Workflow

**Step 0 — Read the request: topic, scope, depth.** Identify the concept and how broad it is. The default register is **true beginner** (assume no background). If the user explicitly asks for more or less depth ("keep it simple", "go deeper", "I already know calculus"), honour that — it adjusts the entry level, not the structure.

**Step 1 — Get the concept right before writing anything.** Assemble: an honest one-sentence definition; the real vocabulary you will need to teach (your glossary seed); which equations (if any) are load-bearing; the best accurate analogy and where it leaks; the common misconceptions; the genuine areas of uncertainty or expert disagreement. **Verify the shaky bits now** — search for any recent, contested, numeric, or named-specific claim per principle 2. Do not start writing on a foundation you are not sure of.

**Step 2 — Plan the arc** using the canonical structure: which steps this concept needs, where a diagram earns its place, which maths gets the full ramped treatment versus a "for the curious" fold.

**Step 3 — Build the HTML.** Copy `assets/template.html` into your working directory (it is the scaffold: styles, fonts, MathJax, the tooltip/glossary/self-test JavaScript, and a worked example of every component). Then populate it:
- Replace the title and the header (concept name, field, the one-sentence lede).
- Write each section following the template's patterns and the principles above.
- Render equations with MathJax (`$...$` inline, `$$...$$` display).
- Author original inline-SVG diagrams using the scaffolds in `references/diagram-patterns.md`.
- Put the core-intuition analogy in the visible analogy block; mark glossary terms for tooltips; attach per-section talking points and self-test; build up the glossary panel.
- Fill the collapsed "Sources & accuracy" block with what you actually relied on or verified.
- Add Chart.js (the template shows where) only if you are drawing a quantitative chart.

**Step 4 — Accuracy pass.** Re-read the draft as a sceptic. Is every claim either standard knowledge or verified? Is any citation real? Have you distinguished consensus from contested? Have you flagged real uncertainty? Does the intuition genuinely arrive before each term? Fix what fails.

**Step 5 — Deliver.** Save to `/mnt/user-data/outputs/`, present with `present_files`, and offer sensible follow-ups (e.g. "I can go deeper on the maths in §4", "I can add a diagram of the training loop", "I can make a fully offline version", "I can do a companion ELI5 on the adjacent concept X").

---

## Reading and rendering notes

- **No browser storage.** Do not use `localStorage`/`sessionStorage` — keep all interactive state in memory. (The file may render inside a sandboxed viewer that blocks storage.)
- **Use the theme variables for every colour — never hard-code hex.** The template ships a light/dark toggle that works by swapping CSS variables (`--ink`, `--accent`, `--surface`, and the rest) on `#lz-root`. Any colour you write — in prose, callouts, **and your SVG diagrams** — must reference those variables (e.g. `style="fill:var(--accent-tint); stroke:var(--accent)"`), or it will look broken in the other mode (dark text on a dark figure background, glaring white boxes, and so on). `references/diagram-patterns.md` already follows this.
- **Hover states use the `style-hover` pattern.** Because styling is inline (which survives sandboxing that strips `<style>` blocks), there is no `:hover` in CSS. A small script revives a `style-hover="..."` attribute into real hover behaviour. If you add an interactive element that needs a hover state, give it both `style="..."` and `style-hover="..."`, matching the existing buttons — do not reach for a `<style>` block.
- **Mobile matters.** Tooltips are tap-to-toggle; the layout is responsive; check that nothing depends on hover alone.
- **MathJax** (tex-svg) is wired in the head and typeset is scoped to `#lz-root`; just write `$...$` and `$$...$$`. **Chart.js** is left out by default to keep the file lean — uncomment the CDN line (shown in the head) only when you actually chart something.
- **The chrome is already built.** Section navigation, the reading-progress bar, the slide-in Contents and Glossary drawers, tap-to-toggle tooltips, the light/dark theme toggle, chevron-rotating disclosures, the open-by-default analogy block, the collapsible "for the curious" and "Sources & accuracy" asides, and the per-section self-test are all wired. Write content into the components — do not rebuild the apparatus, and do not rename its JS-wired element IDs (`lz-root`, `lz-progress`, `lz-popover`, `lz-overlay`, `nav-drawer`, `gloss-drawer`, `nav-list`, `gloss-body`, `open-nav`, `open-gloss`, `theme-toggle`, `theme-ico`, `theme-lbl`, `glo-<slug>`) or its classes (`.paper-section`, `.section-title`, `.eyebrow`, `.term`, `.chev`) or the `[style-hover]` / `[data-close]` hooks, or the JavaScript will stop finding them.

---

## Edge cases

- **Concepts with no maths.** The maths policy simply produces no equations; everything else is unchanged.
- **Highly technical concepts.** Still start from the beginner on-ramp — that is the whole point. A hard concept means a longer climb, not a higher starting step.
- **Contested or uncertain topics.** Present the disagreement honestly (principle 2); do not manufacture a false consensus to keep the explanation tidy.
- **Very broad topics.** Scope down to the core meaning, explain it well, and offer to expand a named sub-part rather than attempting a whole field in one document.
- **The user asks for "simpler" or "deeper".** Adjust the entry level and the amount tucked into "for the curious"; keep the arc and the apparatus intact.

---

## Files in this skill

- `assets/template.html` — the HTML scaffold. Copy it, then fill it in. It carries the styling, distinctive fonts, a light/dark theme toggle, MathJax wiring, the tooltip/glossary/self-test/section-nav/reading-progress JavaScript, and a worked example of every content component (including the open-by-default analogy block and the collapsed "Sources & accuracy" block) so you can see the exact markup each one expects. Styling is inline (robust against sandboxing) and colours are CSS variables (so dark mode works) — keep both conventions when you add anything.
- `references/diagram-patterns.md` — reusable inline-SVG scaffolds (box-and-arrow, horizontal flow, comparison, annotated formula), already written with theme variables so the diagrams adapt to light and dark mode. Read it when you are about to draw diagrams.
