# `.mab/` log: layout and formats

Paths here are relative to `<MAB>`, the run's log root: the repo's
`.mab/` for a single run, `.mab/runs/<run-id>/` for a run inside a
programme. Programme-wide files live in `<ROOT>`, the repo's `.mab/`:

```
.mab/                 <ROOT>
  PROGRAMME.md        programme only: intent, runs, director, pool target (references/programme.md)
  STATE.md            programme only: the director's state (same format, Sessions line lists runs)
  DIRECTION.md        one block per stint end, plus audit markers
  drift/<nn>.md       drift-audit verdicts; hold-<nn>-cleared.md after a ruling
  HOLD.md             present only while the relay is held
  spares/S<n>.md      spare registration; S<n>.claim when claimed
  HANDOFF-D<n>.md     director succession notes
  runs/<run-id>/      a programme run's <MAB>, or a finished single run
```

Everything a run knows lives here. Files are Markdown for humans plus one
JSONL stream for tooling. Paths are relative to `<MAB>`; packet sessions
in worktrees must write to the absolute `<MAB>` in the main repo (recorded
in their lane file and brief), never to a worktree copy.

```
.mab/
  STATE.md            rewritten at every boundary; ≤40 lines; the resume entry point
  PLAN.md             the contract: intent, goal, steps, acceptance criteria, test cases, gates, chunks, sessions
  DESIGN.md           taste design brief (frontend work only)
  DECISIONS.md        append-only, one line per decision with rationale
  JOURNAL.md          append-only human-readable event log
  events.jsonl        same events, one JSON object per line
  LEDGER.md           per-stint time, cost proxies, and context at stint end
  FINDINGS.md         every Codex finding by stable ID with status
  reviews/            Codex final replies per round: round-NN-<plan|test|code|release>[-<ID>].md; verify.md
  briefs/             every prompt sent to any agent, session, or Codex
  lanes/<ID>.md       one per session after O1: status, session title, claim, worktree, progress, next
  logs/               gate and codex stdout logs; read the tail, never the whole file
  HANDOFF-<id>.md     handoff notes from any agent or session being retired
  runs/<run-id>/      finished runs, moved here at run_complete (single runs only)
  apply/              release sheets RELEASE-<n>.md and their run logs RELEASE-<n>-run.md
  gates/<G>/          gate-qualification output
```

On Phase 0: create the folder, add `.mab/` to `.gitignore` unless the repo
already tracks planning docs (ask nothing; check for an existing `docs/plans`
or committed `PLAN.md` and follow that convention). If the root still holds
a finished run's files, move them to `runs/<its run id>/` first.

## STATE.md

```
# MABL — <repo name> — <task title>
- Pipeline: multi-agent-building-local  Qwen: qwen3.8-mab ctx <n> 100% GPU
- Run id: <yyyymmdd-hhmm>-<slug>        Mode: full | light   Tier: light | standard | high-risk
- This session: O1 | O2 | P3 | O3 …     Title: MABL <ID> · <repo>
- Context: <n>% at <hh:mm> (meter | no meter)
- Phase: <n> — <name>   Round: <x>/<cap>   Chunk: <x>/<y>
- Baseline: <branch> @ <sha>            Task branch: <branch> @ <sha>
- Authority: commit | commit+push | commit+push+deploy  (user, <date>)
- Director: <local_… id of O1> (single run) | see PROGRAMME.md (programme run)   Spares free: <n>   HOLD: none | <reason>
- Sessions: O2 DONE <sha> | P1 ACTIVE chunk 2/2 | P2 HOLDING | P3 PLANNED | O3 HOLDING   (summary; lane files are the truth)
- Ready: <IDs whose dependencies are all DONE and that are not yet active>
- Active agents: <id> (<model>[, qwen session_id]) — <assignment>, dispatched <hh:mm>, expect ~<n>m
- Last event: <type> <hh:mm>
- Open questions: <none | one per line>
- Next action: <one imperative line, addressed to a session ID>
- Read next: <only the files needed to act on Next action>
```

Rules: rewrite the whole file, never append, and check `wc -l` ≤ 40 after
each write. History belongs in `JOURNAL.md`; per-session detail belongs in
`lanes/<ID>.md` and `HANDOFF-<ID>.md`. If a resumer needs more than
`STATE.md` plus *Read next*, the state was written badly; fix the state,
not the resumer. Several sessions write this file, so every session
re-reads `STATE.md` immediately before rewriting it and changes only its
own entries. Registration and status live in `lanes/<ID>.md`, never only
here; while parallel packets are ACTIVE, each keeps its own next step in
its lane file and *Next action* names the relay's next step.

At `run_complete` of a **single** run, move the run's files into
`runs/<run-id>/`, so the next run starts with a fresh `STATE.md`. Leave
the `<ROOT>`-only entries in place: `runs/`, `PROGRAMME.md`,
`DIRECTION.md`, `drift/`, `spares/`, `HOLD.md`, `HANDOFF-D*.md` (a moved
`HOLD.md` would silently lift a hold). A programme run already lives in
`runs/<run-id>/` and is never moved.

## DECISIONS.md

One line each, appended as the decision is made:

```
- 2026-09-13 10:42 O1 · Packets P2 ∥ P3 on files api/* vs ui/* · both touch nothing shared after foundation packet P1
- 2026-09-13 11:05 P2 · Won't-fix F-P2-012 (MEDIUM) · duplicate of existing retry logic in http.ts
```

## JOURNAL.md and events.jsonl

Every event goes to both. Journal line:

```
- 10:42 phase_start 2 plan
- 10:58 dispatch impl-1 qwen3.8-mab chunk 1 (brief briefs/impl-1.md) expect ~20m
- 11:31 chunk_done 1 gates PASS 43/43 ctx 22%
- 12:04 review_round code 2 P2 findings +3 open CRITICAL 0 HIGH 1 ctx 31%
- 12:10 kill impl-1 reason rot handoff HANDOFF-impl-1.md
- 12:40 handoff P2 -> P3 reason stint-done ctx 33%
```

JSONL object: `{"t":"2026-09-13T10:42:00","session":"O1","type":"dispatch","agent":"impl-1","model":"qwen3.8-mab","chunk":1,"brief":"briefs/impl-1.md","expect_min":20,"ctx":18}`.
Fields beyond `t`, `session`, `type` are free-form but stable per type;
`ctx` (meter percent) is included whenever it was read.

Event vocabulary: `run_start`, `phase_start`, `phase_end`, `dispatch`,
`agent_done`, `chunk_done`, `gates`, `review_round`, `triage`, `kill`,
`respawn`, `handoff`, `activate`, `release`, `lane_status`, `merge`,
`codex_call`, `consult`, `decision`, `escalate`, `resume`, `verify`,
`release_gate`, `commit`, `run_complete`, `spare_claim`, `drift_audit`,
`hold`, `unhold`, `gate_qualify`, `release_step`, `refused`,
`director_handoff`, `run_chain`. `handoff` carries a reason:
`stint-done` or `budget <n>%`.

## LEDGER.md

Appended at every stint end (and `phase_end` within `O1`) and at run end.
Tokens are not observable, so log the proxies that are:

```
| Phase | Session | Start | End | Wall | Rounds | Agents spawned/killed | Codex calls | Ctx end | Notes |
|-------|---------|-------|-----|------|--------|-----------------------|-------------|---------|-------|
| 2 plan | O1 | 10:42 | 11:20 | 38m | 3 | 1/0 | 3 | 31% | approved r3 |
| 4–5 P2 | P2 | 12:00 | 12:40 | 40m | 2 | 1/0 | 2 | 33% | DONE 4f1c2a0 |
```

At run end add a totals row and one line: which stint cost the most
context, whether any stint overflowed (and how the next plan should size
packets), whether a lower tier would have been enough, and whether any
review round after the first found a real defect, and how many chunks
Qwen finished versus how many escalated to Sonnet/Opus. This calibrates
future triage and shows whether the local model earns its place.

## FINDINGS.md

Single table, one row per finding, IDs never reused. Packet sessions
prefix IDs with their ID (`F-P2-003`); `O1`/`O2`/`O3` findings use
`F-003`.

```
| ID | Sev | Status | Phase/Round | Session | File:line | Summary | Resolution |
|----|-----|--------|-------------|---------|-----------|---------|------------|
| F-001 | HIGH | fixed | 2/1 | O1 | PLAN.md step 4 | token expiry unchecked | fixed rev 2 |
| F-002 | MEDIUM | wontfix | 3/1 | O2 | … | … | duplicate retry (see DECISIONS) |
| F-P2-001 | CRITICAL | open | 5/2 | P2 | api/auth.ts:88 | … | |
| F-P3-001 | HIGH | plan-challenge | 5/1 | P3 | … | … | plan step 4 assumed sync API |
```

Status values: `open`, `fixed`, `wontfix`, `plan-challenge`,
`intent-conflict`, `followup`.
`## Follow-ups` at the bottom lists MEDIUM/LOW left open at exit. `##
Astra-advised chunks` lists chunks shaped by a Phase 4 consult. A packet
session reads only its own rows plus open rows from earlier sessions.

## lanes/<ID>.md (one per session after `O1`)

```
# Packet P2
- Session: P2             Session title: MABL P2 · <repo>
- Session id: local_… (from start_session; — when pasted by hand)
- Status: PLANNED | HOLDING | ACTIVE | DONE <sha> | BLOCKED <why> | BLOCKED-ON-OWNER <step> | SPLIT -> P2b | RELEASED
  | HELD <step> (stopped by HOLD; resumes on ACTIVATE)
  (G<n>: DONE QUALIFIED <sha> | DONE NOT QUALIFIED <ids> (fix rows added) | BLOCKED NOT QUALIFIED <ids>)
- Depends on: P1          Merge first: —
- Worktree: yes → <actual abs path>   Branch: <actual branch>     (or: no → main tree, task branch)
- Main repo .mab: <abs path>
- Chunks: 2, 3
- Claim (files owned, globs allowed):
  - src/api/**
  - tests/api/**
- Progress: chunk 2 DONE 11:40 · chunk 3 ACTIVE
- Qwen session_id: <id> (current implementer / test-author session; — when escalated)
- Review: round 2/3, open CRITICAL 0 HIGH 1
- Context: 28% at 12:04
- Next: <this session's next step, for `resume P2`>
- Last update: 12:04 by P2
```

`O2` and `O3` lane files carry only Session, Session title, Session id,
Status, Context, Next, and Last update. An overflow successor (`P2b`) writes into its parent's lane
file.

Claim enforcement: before activating a packet, the session doing the
activation checks its claim against every packet that is ACTIVE. Any
overlap means the plan is wrong; fix the plan, do not activate.
Sequential packets may share files; they are never ACTIVE together.

## briefs/

Filename is the agent or session ID (`impl-1.md`, `test-author.md`,
`P2.md`, `O2.md`, `P2b.md`, `codex-plan-r2.md`). Content is the exact
prompt sent. A resuming session can re-dispatch any agent from its brief
without reconstructing context.

## HANDOFF-<id>.md

```
# Handoff — <id> — <hh:mm>
## Done
## In progress (exact state, what is half-applied)
## Next
## Files touched
## Gotchas learned (not yet in PLAN.md)
## Context: <n>% (meter) | OK | FILLING | GONE
```
