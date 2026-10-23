# Taste plugin integration (frontend work)

When recon reports `touches_ui: true`, the plan gets a design brief before
any UI step is written, and every UI implementer loads the same taste
sub-skill. Codex never reviews design; it reviews code only.

## Which sub-skill

| Recon says | Load |
|------------|------|
| new marketing page, landing, portfolio, editorial | `taste-skill:taste-skill` |
| modifying existing UI of any kind | `taste-skill:redesign-skill` (plus `taste-skill` for direction) |
| product UI, dashboard, forms, data tables | `taste-skill:taste-skill` anyway; it self-scopes ("pull only what fits") |
| brand assets missing (logo, palette, type) | add `taste-skill:brandkit` for direction only, no image generation |

The plugin is available when `taste-skill:taste-skill` appears in the
session's skill list. If absent: log a `decision` line "taste plugin not
installed; DESIGN.md skipped" and continue. Never block on it.

## Design-brief subagent (Phase 2, step 1)

Dispatch one Sonnet `general-purpose` subagent with brief
`.mab/briefs/design-brief.md`:

```
Invoke the Skill tool for `taste-skill:taste-skill` (and
`taste-skill:redesign-skill` if this modifies existing UI) before anything
else. Then read .mab/PLAN.md (draft) and the recon `frontend` summary.
Write .mab/DESIGN.md, at most 80 lines:
1. Design read (one line, per the skill's format).
2. Direction: aesthetic family, reference points, what to avoid (name the
   LLM defaults the skill warns against that would otherwise creep in).
3. Type, color, spacing, motion decisions, reusing existing tokens where
   they exist.
4. Component and state inventory for the UI steps in PLAN.md (empty,
   loading, error, success, responsive breakpoints).
5. Accessibility floor (contrast, focus, keyboard, reduced motion).
6. Open design questions, if any, phrased as one question each.
Do not write code. End with CONTEXT: OK or CONTEXT: FILLING.
```

If the subagent returns an open design question that would change the
plan materially, ask the user that one question; otherwise decide and log
it in `DECISIONS.md`.

## Plan and briefs

`PLAN.md` UI steps reference `DESIGN.md` sections. Every implementer brief
for a UI chunk (packet session) includes:

```
Before writing any UI: invoke Skill `taste-skill:<sub-skill>` and read
.mab/DESIGN.md. Follow its direction; where the skill and DESIGN.md
disagree, DESIGN.md wins and you report the disagreement.
```

## Verification

Codex reviews only code. Design conformance is checked by the implementer
against `DESIGN.md`'s component and state inventory and reported per chunk.
When the Browser pane is available, the packet session may take one
screenshot per UI chunk and compare to the design read; a mismatch is a
`plan-challenge` finding in `FINDINGS.md`, not a Codex round.
