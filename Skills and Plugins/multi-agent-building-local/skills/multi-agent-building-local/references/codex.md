# Codex: invocation, freshness, mandate, finding IDs, delta scoping, exit rule

Codex runs in the repo cwd and reads files itself; point it at paths, never
paste contents. Astra is **always read-only** here: never `-s
workspace-write`, never touches the repo, never reviews `DESIGN.md`.

Astra's job is to **challenge the implementation, not continue developing
it**. It is given the requirements, the plan (whose `## Intent` it serves and
may challenge only as advice), the findings table, and the
diff; it is never given the implementer's reasoning or transcript, so that
it tests the work instead of inheriting its assumptions.

## Invocation

```bash
# Review (read-only): plans, tests, diffs, release gate
cd <working tree> && codex exec --model gpt-6-astra -s read-only -c model_reasoning_effort=medium \
  -o <MAB>/reviews/round-<nn>-<kind>[-<ID>].md "$(cat <MAB>/briefs/codex-<kind>-r<n>[-<ID>].md)" \
  </dev/null ><MAB>/logs/codex-<kind>-r<n>[-<ID>].log 2>&1
```

`<MAB>` is the absolute path of this run's log root (`references/programme.md`, *Paths*: the repo's `.mab/`, or `.mab/runs/<run-id>/` in a programme); use it for
every `.mab/` path in the command and inside the prompt, because a
worktree has no `.mab/` of its own. `<working tree>` is the packet's tree
(its worktree for a parallel packet), so Codex sees the packet's diff.

Write the prompt to `<MAB>/briefs/codex-<kind>-r<n>[-<ID>].md` first and
run `codex exec` in the background under the stall watch. `-o` writes only
Codex's final reply to the reviews file; that file is all the session
reads. Codex's stdout (its own reasoning, tool calls, and file reads) goes
to the log and is **never** read into context, except its tail to diagnose
a failed call. Log `codex_call`.

Packet sessions run their own Codex loops with the same command from
their cwd (the worktree, for a parallel packet); Codex then sees the
packet's branch.

## Model freshness (once per full run, background, never blocking)

```bash
codex exec --model gpt-6.1-astra -c model_reasoning_effort=minimal "Reply OK"
```

Success: use the newer model for this run and tell the user "gpt-6.1-astra is
live; update multi-agent-building-local/references/codex.md." Error: continue with
`gpt-6-astra`. If `gpt-6-astra` itself errors as unknown, stop and tell the
user the skill needs updating; do not substitute silently.

## Reviewer mandate

Every code and release-gate prompt carries this block verbatim:

```
Priorities, in order: correctness, regressions, security, data integrity,
architectural violations, unhandled edge cases, test quality. Report only
defects you can point to at file:line with a concrete failure scenario.
Do NOT suggest refactors, generalisations, new abstractions, caching,
renames, documentation, or style changes unless they materially affect
correctness or maintainability; if you must mention one, tag it LOW.
Speculative edge cases with no realistic trigger are LOW. A finding you
cannot ground in the code is not a finding.
```

High-risk tier, code review round 1 only, prepend:

```
This change touches <auth | authz | payments | deletion | migration |
encryption | sync | user data>. Review first for: privilege escalation,
missing authorisation checks, injection, secrets in code or logs, unsafe
deserialisation, TOCTOU, partial writes without rollback, irreversible
data loss, and migration reversibility. Then apply the ordinary mandate.
```

## Intent block

Every review prompt (plan, tests, code, release gate) carries this block
verbatim, before the mandate:

```
`<MAB>/PLAN.md` opens with `## Intent`: the purpose and direction of this
change and a list of intent guards. Review in service of that intent. A
behaviour the intent deliberately chooses (a check it removes, a
permission it widens, a prompt it drops) is not a defect; do not report
it as one. If a fix you would propose moves against the intent or
crosses a guard, tag the finding INTENT-CONFLICT instead of a severity
and state the conflict in one line; it will not be applied. If you
believe the intent itself is mistaken, say so once under a final
`INTENT-CHALLENGE` heading, as advice, not as a finding.
```

## Stable finding IDs

Every review prompt carries this block:

```
Open findings are listed in <MAB>/FINDINGS.md (status column). For each open
finding relevant to what you are reviewing, state exactly one of:
  RESOLVED <id>   |   STILL-OPEN <id> — <one line why>
Do not restate findings whose status is fixed, wontfix, or followup unless
you believe the resolution is wrong; then say CONTEST <id> — <why>.
New findings get the next unused ID in the sequence <prefix>-NNN and are
tagged CRITICAL / HIGH / MEDIUM / LOW (or INTENT-CONFLICT) with file:line.
End with exactly `VERDICT: APPROVED` if no CRITICAL or HIGH finding is open
after this round, otherwise `VERDICT: REVISE`.
```

`<prefix>` is `F` for `O1`/`O2`/`O3` and `F-<ID>` for a packet session.
Fable triage after each round updates `FINDINGS.md`: new rows, status
changes, `wontfix` with a `DECISIONS.md` line, `plan-challenge` rows treated
as high priority regardless of severity tag. `intent-conflict` rows (any
finding whose fix would move against `## Intent`, whether or not Codex
tagged it so) are never fix-now; a real hole among them is escalated to
the user, not fixed. A `CONTEST` on a wontfix gets
one honest re-look; if still wontfix, log it and it is closed.

## Delta scoping (rounds after the first)

Round 1 of any loop reviews the whole scope. Every later round carries:

```
This is round <n>. Review ONLY (a) the changes since round <n-1>, listed in
`git diff <sha-after-round-n-1>` [or: the files named in
<MAB>/reviews/round-<nn-1>-<kind>.md], and (b) the findings marked open in
<MAB>/FINDINGS.md. Do not re-audit code the fixes did not touch. A new
finding is valid only if it is in the delta or was caused by the delta.
```

Fable records the post-triage SHA (or, for uncommitted work, the list of
files the implementer touched) in the round file so the next prompt can
cite it. A round that ignores this and re-reports across the whole diff is
triaged strictly: findings outside the delta are `followup`, not `open`.

## Exit rule

A review loop exits when the objective gates pass and **either**:

- `FINDINGS.md` shows no open CRITICAL or HIGH for the scope under review, or
- the round just completed raised **no new** CRITICAL or HIGH (everything
  it reported was RESOLVED, STILL-OPEN on an item already triaged wontfix
  with a reason, or MEDIUM/LOW).

Codex's `VERDICT` line is its opinion; Fable's status table is the truth. If
they disagree (Codex says REVISE with only MEDIUM/LOW open, or APPROVED
while Fable holds a HIGH open), run one more round with the disagreement
named explicitly, then exit on the table. MEDIUM/LOW left open at exit move
to `## Follow-ups`.

Caps: **plan 3, test 2, code 3, release gate 2**. A dirty cap means stop
and escalate, never an extra round. The caps are ceilings, not targets; a
typical standard-tier run should see one plan round, one test round, and
one or two code rounds.

## Prompt templates

Plan: "Read `<MAB>/PLAN.md`. Review it against this codebase for design
flaws, missing edge cases, acceptance criteria that are incomplete or not
checkable as PASS/FAIL, missing test cases, integration risks, and whether
the packets marked parallel in `## Chunks` are truly disjoint (files and
dependencies), and whether any packet exceeds 2 chunks or ~8 files, and whether every
step serves `## Intent` with none quietly narrowing it. Do not propose
guards, confirmations, or restrictions the intent removes. Do
not review `<MAB>/DESIGN.md`. Do not propose alternative architectures
unless the planned one is wrong." + intent block + ID block.

Tests (one round, cap 2): "Review the new and changed test files (`git diff
--name-only` plus untracked under the test dirs) against `<MAB>/PLAN.md`'s
enumerated test cases. Report only: a listed case with no test, a test that
asserts something other than its case, any assertion that would hold
regardless of whether the feature works, and any test that locks in
behaviour `## Intent` removes. Coverage beyond the listed cases
was already decided at plan review; do not propose more tests." + intent
block + ID block.

Code round 1 (packet `<ID>`): "Review the uncommitted diff (`git diff`
plus untracked files) against `<MAB>/PLAN.md` chunks <ids>. Earlier
packets are committed and out of scope. Chunks listed
under `## Astra-advised chunks` in `<MAB>/FINDINGS.md` were shaped by your
own earlier advice; review them as if they were not." + intent block + mandate block (+
high-risk prefix) + ID block.

Code rounds 2–3: intent block + mandate block + delta block + ID block.

Release gate (`O3`, Phase 6): "Review only the diff of the task
branch against `<baseline sha>` for unresolved P0/P1 correctness,
security, data-loss, or regression risks. Each packet was reviewed alone,
so also look for cross-packet interaction bugs, duplicated logic between
packets, and interface mismatches a packet-scoped review could not see.
Do not suggest refactoring,
stylistic improvements, additional abstractions, documentation changes, or
speculative edge cases. If nothing at that level is present, say so in one
line." + intent block + ID block. Round 2, if any: intent block + delta
block.

Advisory consult (Phase 4, Opus implementer stalled at the top of the escalation ladder): describe what was tried and where
it is stuck; ask for analysis or alternative approaches, explicitly not
code. Record the chunk under `## Astra-advised chunks`.
