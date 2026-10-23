# Intent is the contract

Review loops drift. Each round a reviewer proposes a guard, a check, or a
narrowing that is locally reasonable, triage accepts it because it is
tagged HIGH, and three packets later the feature does the opposite of
what was asked (an "autonomy" brief shipped as a more restricted agent).
The defence is written down once and carried everywhere:

- `PLAN.md` opens with `## Intent`: the purpose in one or two sentences,
  the **direction** of the change (what gets more and what gets less:
  "more autonomous, fewer approval prompts"), and 3–8 **intent guards**,
  each a concrete thing no finding may undo ("no new confirmation prompt
  on actions the brief lists as self-directed"). `O1` writes it from the
  user's request before anything else in the plan, prints it to the user
  with the tier so a misread is caught before any review, and only the
  user may change it afterwards. At least one acceptance criterion tests
  the direction, not just the mechanics.
- Every brief copies `## Intent` verbatim; every Codex prompt carries the
  intent block (`references/codex.md`), which forbids grading the intent's
  deliberate choices as defects and makes Codex tag any finding whose fix
  would cross a guard `INTENT-CONFLICT`.
- **Triage checks intent before severity.** A finding whose fix would
  move against `## Intent` or cross a guard is `intent-conflict`: never
  fix-now, whatever Codex tagged it. If it is nonetheless a real hole (a
  true security or data-loss risk the user did not foresee), do not fix
  it quietly; escalate to the user with the conflict named and continue
  the run without it. A reviewer `INTENT-CHALLENGE` note goes to
  `DECISIONS.md` as advice for the user, never into the plan.
- The implementer and test author stop and report instead of applying a
  step or fix they believe contradicts `## Intent`.
- The Phase 6 verifier grades `INTENT` as its first criterion; a FAIL
  there is escalated to the user, not patched.

- Each stint's `DIRECTION.md` block and the periodic drift audit catch
  what per-finding triage cannot: many small, individually reasonable
  narrowings adding up across packets. `OFF-COURSE` holds the relay
  (`references/programme.md`).
- In a programme, `PROGRAMME.md` holds the intent; each run's `PLAN.md`
  copies it verbatim and may add guards or narrow its own scope, never
  drop a guard or reverse the direction.

## `## Intent` in `PLAN.md` (shape)

```
## Intent
Purpose: <one or two sentences, in the user's words where possible>
Direction: more <x>, fewer <y>   (what this change adds and what it removes)
Guards (no finding may undo these):
- IG1 <concrete behaviour the change must keep or deliver>
- IG2 ...

(`IG` for intent guard, so guards never collide with gate stints `G<n>`.)
```
