# Programme: director, runs, direction log, drift audits, HOLD

A single run (one `PLAN.md`, one relay) holds up to about ten packets
and at most one release. Work bigger than that, like EVI's Phase R
(251 findings, ~30 packets, three live releases, 8 sessions over four
days), becomes a **programme**: one director session above a sequence
of ordinary runs. There is no middle tier of orchestrators. Every run is
the normal relay, and the direction checks run inside the relay itself,
so the director is the user's window, not a process the run depends on.

## When a task is a programme

`O1` decides in Phase 0, before recon, and tells the user. It is a
programme when any of these holds: more than about ten packets are
likely; more than one release window (a live deploy) is needed; the
work spans several days or several release trains (candidate branches);
or the user says so (`MABL programme <task>`). When in doubt, use a
single run. A single run is promoted only between stints with nothing
ACTIVE: move its files to `runs/<run-id>/` (as at `run_complete`), point
every unstarted brief's and lane file's `<MAB>` there, then write
`PROGRAMME.md` around it.

The session that decides becomes director `D1` instead of `O1`.

## Paths

- `<ROOT>` = the absolute path of the repo's `.mab/`. Programme files,
  `DIRECTION.md`, `drift/`, `spares/`, and `HOLD.md` live here.
- `<MAB>` = the run's log root: `<ROOT>` for a single run;
  `<ROOT>/runs/<run-id>/` for a run inside a programme (created there
  from the start; it is never moved at `run_complete`). Every path
  `references/logging.md` gives is relative to `<MAB>`.

## Director stint (`D1`)

1. **Open the programme.** Create `<ROOT>` per `references/logging.md`,
   record baseline branch and SHA, the user's authority with its date,
   and any between-phase gates the user or the project's brief requires.
   Record your own session id (`mcp__ccd_session_mgmt__get_session`
   with `"self"`) as `Director:`.
2. **Recon** as SKILL.md Phase 1, but with questions aimed at splitting:
   release trains, natural boundaries, shared foundations, which parts go
   live and how, how long the full gate takes, known baseline failures.
3. **Write `PROGRAMME.md`** (shape below). The programme `## Intent`
   follows `references/intent.md`; print it to the user with the run
   list. One Codex round (cap 2) on `PROGRAMME.md` with the plan template
   in `references/codex.md`, reading `<ROOT>/PROGRAMME.md` where the
   template says `<MAB>/PLAN.md`, no `DESIGN.md`, reply files in
   `<ROOT>/reviews/`, and asking only: does each run serve the intent,
   are run boundaries and dependencies right, does any run's scope narrow
   the direction. Triage as Phase 2.
4. **Start run 1** (and every run with no unmet dependencies): write
   `<ROOT>/briefs/run-<run-id>-O1.md` (the run's scope from the run
   table, the programme `## Intent` verbatim, authority, baseline, the
   runs it depends on and their final SHAs, `<MAB>` for the run), then
   start its `O1` with the prompt `Invoke the multi-agent-building-local skill:
   run <run-id>, brief <abs path>` by the spawn ladder in
   `references/sessions.md`, together with the spare pool. Then become
   the director.

## Director mode (after `D1`'s stint, and every successor)

The director never runs a stint, never reads diffs, and never activates
sessions, with one exception: lifting a HOLD on the user's ruling, it
activates exactly the *Ready* list the hold recorded. It:

- **Reports** on every wake (a side-session note, a message, a user turn):
  re-read `<ROOT>/STATE.md`, the active runs' `STATE.md` top lines, new
  blocks in `DIRECTION.md`, new `drift/` verdicts. Reply in two or three
  lines: what moved, the direction trend, anything BLOCKED, ON-OWNER or
  HOLD with its reason.
- **Owns the intent.** Only the user changes it. On the user's ruling,
  update `## Intent` in `PROGRAMME.md`, in each active run's `PLAN.md`,
  and in every brief whose session has not started (PLANNED or
  HOLDING), log it in both `DECISIONS.md` files, and send `INTENT
  UPDATED` to every ACTIVE session (they re-read it from `PLAN.md`).
- **Clears HOLD** only on the user's ruling (below).
- **Tops up the spare pool** to `Spare pool target` on every user turn
  (`references/sessions.md`, *Spare pool*), and offers a "Top up spares"
  button when fewer are free than the target, or when the user says they
  are stepping away.
- **Forwards escalations** it receives after a succession to the current
  `Director:` (*Succession*).
- **Starts runs** whose dependencies are DONE when `Between runs: ask`
  and the user says go (that turn is the user's, so `start_session`
  works).
- **Measures itself.** Meter at every wake; at 35% it hands over
  (*Succession*).

Escalations do not rely on the director being woken: a session that
sets BLOCKED, BLOCKED-ON-OWNER or HOLD sends a one-line `ESCALATE <ID>:
<reason>` (`SendMessage`) to the director, resolved **at send time**:
the `Director:` id in `<ROOT>/PROGRAMME.md` in a programme, or in a
single run the `Director:` id in `STATE.md` (`O1`, which recorded
itself). It also sends a `PushNotification` with
the same line if the tool exists, since the user may be away.

## `PROGRAMME.md` (≤80 lines)

```
# MABL programme — <repo> — <title>
- Programme id: <yyyymmdd-hhmm>-<slug>   Baseline: <branch> @ <sha>
- Authority: <commit | +push | +deploy> (user, <date>)   Owner gates: <none | list>
- Director: D<n> <local_… id> since <time>     Between runs: continue | ask
- Spare pool target: <n>   (3 + the largest `Est. sessions` among runs not yet planned)

## Intent
<references/intent.md shape; guards numbered IG1…>

## Runs
| Run | Scope | Train / branch | Depends on | Release | Est. sessions | Status | Final SHA |
|-----|-------|----------------|------------|---------|---------------|--------|-----------|
| R1  | foundation, findings 1–40 | mab/<slug>-r1 | — | no | 6 | DONE | 1a2b3c4 |
| R2  | lane W, findings 41–90 | mab/<slug>-r2 | R1 | release 2 | 9 | ACTIVE | |

`Est. sessions` counts the run's `O1`…`RW` sessions plus one for
overflow; it sizes the pool so a chained run's Phase 2 can claim spares
for its whole relay without a user turn.

## Programme decisions
<one line each, or a pointer to <ROOT>/DECISIONS.md>
```

`Between runs` defaults to `continue`, or `ask` when the user or the
project's brief requires an approval between phases. A run's `## Intent`
copies the programme's verbatim and may add guards or narrow its own
scope, but never drops a guard or reverses the direction.

## Run chaining

The last session in the run's `## Sessions` (`O3`, `G<n>`, or `RW<n>`)
sets the run `DONE <sha>` in `PROGRAMME.md`. Then, for each run whose
dependencies are now all DONE: with `Between runs: continue` it writes
the run's O1 brief and claims a spare for it (`run <run-id>`); with
`ask`, it puts the run under *Ready* in `<ROOT>/STATE.md` and escalates
to the director, which asks the user. Runs marked parallel in the table
need disjoint claims and their own branches.

## Direction log (`<ROOT>/DIRECTION.md`)

Every session in full mode appends one block at the end of its stint,
before handing off (single runs too):

```
## <run>/<ID> <yyyy-mm-dd hh:mm>
- Toward intent: <what this stint moved in the stated direction>
- Against / narrowed: <anything that narrows, restricts, or adds friction; "none">
- Intent-conflict findings: <IDs rejected as intent-conflict; IDs escalated>
- Guards touched: <IG# and how; "none">
- Fixes that restricted behaviour: <finding IDs whose fix added a check, prompt, or limit>
```

Write it from triage records, not from memory. "None" everywhere on a
packet that applied several HIGH fixes is a reason to look again.

## Drift audit (distributed, no director needed)

After appending its block, the session counts the blocks since the last
audit marker. It runs an audit when the count is 3 or more, or when the
next session is an `O3`, `O3r`, `G<n>`, or `RW<n>`, or the run is ending:

1. Dispatch one read-only Sonnet subagent (`general-purpose`,
   `model: "sonnet"`). Brief: the programme or run `## Intent`; the
   direction blocks since the last audit; the commands to see the
   cumulative change itself (`git diff <programme baseline>..<this
   branch> --stat`, then the files it judges relevant); the last
   verdict. It reads the diff; you do not.
2. It answers `ON-COURSE`, `DRIFTING`, or `OFF-COURSE`, then for each
   guard KEPT or CROSSED and the direction MOVING, STALLED or REVERSED,
   each with file:line evidence, then `CONTEXT:`. ≤15 lines to you; the
   full verdict goes to `<ROOT>/drift/<nn>.md`.
3. Append `--- audit drift/<nn>.md <verdict> <time>` to `DIRECTION.md`
   and log a `drift_audit` event.
   - `ON-COURSE`: hand off normally.
   - `DRIFTING`: hand off, add the verdict to *Open questions* in
     `STATE.md`, and escalate to the director as advice.
   - `OFF-COURSE`: finish the handoff's bookkeeping first (compute
     *Ready* and write it to `STATE.md`), then write `<ROOT>/HOLD.md`
     (reason, verdict path, which guard or direction, the SHA audited,
     and the *Ready* list with each session's `Session id`), escalate,
     do **not** activate anyone, and stop. Your own stint stays DONE;
     the relay pauses.

## HOLD

Every session checks for `<ROOT>/HOLD.md` before starting a stint,
before activating or claiming any session, before every release window
step, and at every step boundary inside a stint (with the meter read),
so ACTIVE parallel packets, `O3` and `G<n>` stop at their next boundary
too. If it exists: finish nothing further, leave uncommitted work in the
tree, set the lane file `Status: HELD <step>` with *Next* saying exactly
where to resume, reply `Held by HOLD: <reason>`, and stop. On `ACTIVATE`
after the hold lifts, resume from *Next* (`references/sessions.md`,
*Worker mode*). Only the user
lifts it: on their ruling the director moves `HOLD.md` to
`drift/hold-<nn>-cleared.md` with the ruling appended, logs a
`decision`, updates the intent if the user changed it, and sends
`ACTIVATE` to the *Ready* list `HOLD.md` recorded plus every session
whose lane file says `HELD`.
A ruling that the drift was wanted is an intent change; record it as one.

## Succession

At 35% on its meter (or 45% at once), the director writes
`<ROOT>/HANDOFF-D<n>.md` (what the user last asked, open escalations,
pending rulings, the pool), then starts `D<n+1>` with the prompt
`Invoke the multi-agent-building-local skill: director, programme <abs path
to PROGRAMME.md>` (a single run's `O1`: `director, run state <abs path
to <MAB>/STATE.md>`): by `start_session` on a user turn, otherwise by
claiming a spare (`director`). It updates `Director:` in
`PROGRAMME.md` to the new session's id, tells the user in one line to
continue in the new session (link it). From then on it answers any wake
with `Director moved to D<n+1>`, except that an `ESCALATE` message it
receives is forwarded verbatim to the current `Director:` first.
Side-session notes keep going to whichever session started each
session, so the new director learns of progress from escalations, its
own wakes, and the files on each user turn.

A single run's `O1`, acting as director after its stint, follows the
same rule at 35%: its successor is `D2`, and `STATE.md`'s `Director:`
is updated instead of `PROGRAMME.md`'s.

`director` mode: get your own id (`mcp__ccd_session_mgmt__get_session`
with `"self"`), read `PROGRAMME.md` (or the run's `STATE.md`),
`HANDOFF-D<n>.md`, `<ROOT>/STATE.md` and the active runs' `STATE.md` top
lines; set `Director:` to your id if it is not already; report in three
lines; continue as director.
