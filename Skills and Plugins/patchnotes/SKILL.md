---
name: patchnotes
description: Write Blizzard-style patch notes as a standalone HTML file, in plain English for non-technical readers, styled with the repo's own design theme, with hover tooltips for any unavoidable jargon. Use after a plan, release, MAB run or other major step in a repo is finished AND deployed (or shipped/merged when there is no deploy), and whenever the user says "patch notes", "patchnotes", "/patchnotes", "release notes for this" or "what changed, for normal people". Do NOT use mid-implementation, for a single typo fix, or for a developer-facing CHANGELOG.md.
argument-hint: "optional: plan file, version, or git range (e.g. v1.2.0..HEAD)"
---

# Patch Notes

Produce one HTML file that tells a non-technical person **what changed and what it means for them**, laid out like World of Warcraft patch notes, looking like it belongs to this project.

Input: $ARGUMENTS (optional plan file, version label, or git range).

## 1. Work out what changed

1. **Find the range.** Use `$ARGUMENTS` if it is a range. Otherwise find the newest existing patch note in `patch-notes/` and read its `<meta name="patchnotes-to" content="<sha>">`; the range is `<that sha>..HEAD`. No previous note: use the last tag (`git describe --tags --abbrev=0`), else the commits of the plan just finished.
2. **Read the sources**, in this order of trust:
   - The plan that was just executed (`.mab/PLAN.md` and its `## Intent`, the TRIP plan file, or whatever plan this session followed): this gives the *why*.
   - `git log --no-merges <range>` and `git diff --stat <range>`; open diffs only where the log is vague.
   - The release/deploy output in this session (version number, where it went live).
3. **Translate every change into an effect.** For each change answer: *what can someone now do, see, or stop worrying about?* Drop anything with no effect a user, operator or stakeholder would notice (pure refactors, test-only changes, lint) — or fold them into one line under "Under the Hood".
4. **Never invent.** Every line must trace to a commit, diff or plan item. If an effect is a guess, leave it out or say "should" in a Developers' note. Unverified or not-yet-deployed parts go under **Known Issues**.

## 2. Write it Blizzard style

Study the house style (WoW patch notes):

- **Header:** product name, `Patch <version>` (repo version from package.json / pyproject / Cargo.toml / tag; else `Update <YYYY-MM-DD>`), the date, and one or two sentences of overview.
- **Sections, in this order, only those that have content:**
  1. **Headline Features** — the one to three big things, each with a short paragraph.
  2. **Changes and Updates** — grouped under bold **area headings** named the way a user knows the product (e.g. "Rooms", "Sign-in", "Reports"), like Blizzard groups by class then spec. Nest at most three levels: area → feature → detail.
  3. **Bug Fixes** — flat list, one line each, every line starting "Fixed an issue where…" or "Fixed a bug causing…". No nesting, no commentary.
  4. **Under the Hood** — optional, at most three lines, plain English ("The app now starts faster on slow connections").
  5. **Known Issues** — anything incomplete, unverified, or behind a flag.
- **Phrasing:**
  - State the new reality: "Search now finds results as you type." Use *now*, *Increased*, *Reduced*, *Added*, *Removed*.
  - Show before/after in parentheses: "Pages load in about 1 second (was 4 seconds)."
  - Lead with the feature name and a colon when changing an existing thing: "**Export:** Now includes attachments."
  - **Developers' notes:** an italic sub-block under a change explaining *why* in a friendly, conversational voice ("We heard the old menu was hard to find, so…"). Use them for the important changes, not every line.
  - Neutral, confident, occasionally dry. No hype, no apologies, no emoji.

## 3. Plain English is the whole point

- Write for a smart reader who has never seen the code. Read every sentence and ask: would my non-technical colleague understand this without asking?
- Replace jargon first: "server" → "the system behind the app", "cache" → "a saved copy so it loads faster", "deploy" → "put live".
- Never mention file names, function names, commit hashes, library names, or ticket IDs in the body.
- When a technical term is genuinely clearer or unavoidable, wrap **every occurrence's first use per section** in a tooltip:
  ```html
  <span class="term" tabindex="0" data-tip="A saved copy of something so it can be shown faster next time.">cache</span>
  ```
  The tip is one plain-English sentence, under ~25 words, with no jargon of its own. Tooltips must work on hover AND keyboard focus (the template's CSS does both); do not rely on the `title` attribute.

## 4. Match the repo's design theme

1. Look for the project's visual identity, in this order: CSS custom properties (`:root { --… }` in global/theme CSS), Tailwind config (`tailwind.config.*`, `@theme` blocks), design-token files (`tokens.json`, `theme.ts`), a `DESIGN.md`/brand doc, then the main app stylesheet. Note: background, surface, text, muted text, accent/brand colour, border, font families, corner radius, and whether the app is dark or light.
2. Copy `template.html` (next to this file) and replace the values in its `:root` token block with the repo's. Keep the structure and the tooltip CSS. If the repo uses web fonts from Google Fonts, link the same ones; otherwise use its font stack.
3. Repo has no UI or no theme: keep the template's default (dark, gold-accented, Blizzard-ish).
4. Keep it one self-contained file: inline CSS, no JS frameworks, no external images. It must read well at phone width and in both light and dark if the repo supports both.

## 5. Save, check, deliver

1. Save to `patch-notes/<YYYY-MM-DD>-<short-slug>.html` at the repo root (create the folder). Set `<meta name="patchnotes-from">` and `<meta name="patchnotes-to">` to the range's start/end SHAs so the next run picks up where this left off.
2. Open it in the built-in browser (`preview_start` with a `file:///` URL) and check: theme matches, tooltips appear on hover, nothing overflows at mobile width (`resize_window` preset mobile, then back to desktop).
3. Jargon sweep: grep the visible text for file extensions, `()`, camelCase/snake_case words and acronyms; each must be rewritten or wrapped in a `.term`.
4. Commit it with the release if the repo is under git (`docs: patch notes for <version>`), unless the user said otherwise. Do not push unless this run's release already pushes.
5. Send the file to the user (SendUserFile, `display: "render"`) with a one-line caption. If the notes are for people outside the user's machine, offer once to publish it as a shareable Artifact.
