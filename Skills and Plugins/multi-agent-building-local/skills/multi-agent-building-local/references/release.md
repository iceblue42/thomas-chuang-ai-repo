# Release stints: gate qualification (`G<n>`) and release window (`RW<n>`)

Two stints for work that goes live, built from what Phase R did by hand:
qualify a release candidate against a long gate with known baseline
failures, then run a live release sheet step by step with owner steps
and refusals handled honestly.

## When a run has them

At Phase 2, `O1` adds them to `## Sessions` after `O3`:

- **`G<n>`** when the full gate is long (over about 20 minutes) or has
  a baseline of known failures that must be classified, not just
  counted. Otherwise `O3` runs the gates itself as Phase 6 says and there
  is no `G`.
- **`RW<n>`** when the run has a live release and the recorded authority
  includes deploy. Without deploy authority there is no window: `O3`
  commits (and pushes if authorised) and stops as before.

```
| O3  | phase 6 + release sheet         | — | P4     | main | briefs/O3.md |
| G1  | gate qualification              | — | O3     | main | briefs/G1.md |
| RW1 | release window 1                | — | G1     | main | briefs/RW1.md |
```

With a release, `O3` ends after verification, the release gate, and the
**release sheet** (below); the final report moves to `RW<n>`.

## Release sheet (`<MAB>/apply/RELEASE-<n>.md`, written by `O3`)

Numbered steps `R<n>-01…`, each with: **Check** (the precondition, as a
command and its expected result), **Action** (exact commands; the
target host or service), **Verify** (command and expected result),
**Rollback** (exact commands, or "none: stop and escalate"). Mark every
step that needs the user's own hands or decision `OWNER:` with the
exact instruction (PowerShell 5.1 syntax when they run it; secrets,
credentials, 2FA, identity, permission mode, anything the project
reserves to the owner). The sheet names the qualified SHA it deploys,
the pre-release backups it takes first, and the point of no return.

One Codex round (cap 2) per `references/codex.md` with the release
template plus: every step has check, verify, and rollback; ordering
(backups before mutation, nothing restarts before its dependency is in
place); owner steps marked; nothing that bypasses a safety check.
Triage as Phase 6.

## `G<n>`: gate qualification

Input (brief): candidate branch and SHA; gate commands; the **baseline**
file of known failing test IDs with its date; the **completion marker**
(the line or exit file that proves the gate finished, e.g. a final
`^ids ` summary line; the process starting proves nothing); expected
wall time.

1. Check `HOLD.md`. Verify the tree is clean at the candidate SHA
   (`git status --porcelain` empty, `rev-parse HEAD` equal). Anything
   else: BLOCKED.
2. Launch the gate as a background command (`run_in_background`), all
   output to `<MAB>/gates/<G>/`. Do not poll; the command's exit wakes
   the session. Note the expected end in the lane file. If nothing has
   arrived by twice the expected wall time, read the tail once (stall
   watch, SKILL.md).
3. On exit, confirm the completion marker. No marker = incomplete,
   whatever the exit code; record it and re-run once, then BLOCKED.
4. **Classify** with a script or a Sonnet subagent, never by reading
   the full log: failing IDs vs the baseline (novel failures), baseline
   IDs that now pass, **lost IDs** (tests in the baseline run that did
   not run now), and skip-count changes. Write
   `<MAB>/reviews/gate-<G>-classification.md`.
5. Verdict: `QUALIFIED <sha>` when there are no novel failures and no
   lost IDs; otherwise `NOT QUALIFIED` with the IDs. Record it in the
   lane file and log `gate_qualify`.
   - QUALIFIED: hand off to `RW<n>`. With no `RW<n>` in `## Sessions`
     (a long gate but no live release), `G<n>` finishes the run itself:
     SKILL.md Phase 6 steps 5–7.
   - NOT QUALIFIED, novel failures that look like real regressions:
     `G<n>` itself adds the fix (`references/sessions.md`, *Adding a
     session mid-run*): rows `P<k>` (the fix packet, depends on
     `G<n>`), `O3r` (re-verify and commit: Phase 6 steps 1, 2 and 4,
     recording the new candidate SHA for `G<n+1>`; depends on `P<k>`),
     `G<n+1>` (depends on `O3r`), and rewires `RW<n>` to depend on
     `G<n+1>`; claims spares for them (`hold`); sets its own lane `DONE
     NOT QUALIFIED <ids>`; escalates the IDs as advice; hands off
     (*Ready* = `P<k>`).
   - NOT QUALIFIED for any other reason (environment, flaky, lost IDs
     with no code cause, no completion marker twice): BLOCKED and
     escalate; the user rules.

   A qualification is for one SHA; any new commit on the candidate voids
   it.

Never edit tests, the baseline, or gate settings to qualify. A real
exclusion (an environment-only failure) is a `decision` with its reason,
escalated, and applied by the user's ruling.

## `RW<n>`: release window

Input (brief): the release sheet, the qualified SHA, the authority line,
the target hosts, and the owner steps.

1. **Preflight**, recorded before any mutation: `HOLD.md` absent;
   authority covers deploy to this target (otherwise BLOCKED-ON-OWNER
   before step 1); the qualified SHA equals the candidate head and, if
   the sheet pushes, a fresh `git ls-remote` shows the remote where the
   sheet expects it; the live state matches the sheet's first checks.
2. **One step at a time.** Run Check, Action, Verify; append the step,
   time, result, and evidence path to `<MAB>/apply/RELEASE-<n>-run.md`
   **before** starting the next step. Never batch steps, never run ahead
   of the log.
3. **Owner step:** set the lane file `Status: BLOCKED-ON-OWNER
   R<n>-<step>`, write `STATE.md` *Open questions* with the exact
   instruction, escalate (`references/programme.md`), and stop. On the
   user's `MABL resume RW<n>` (or "done"), verify the step's effect before
   continuing; never take their word as the verification.
4. **Refusal:** if a permission prompt is declined, the auto-mode
   classifier or sandbox refuses, or a safety check fails, stop that
   step. **Never retry it in another form** (another command, tool,
   script, or split into pieces). Log `REFUSED R<n>-<step> <reason>`,
   set BLOCKED-ON-OWNER with what the user must decide, escalate, stop.
5. **Verify fails:** run the step's Rollback if it has one, verify the
   rollback, then BLOCKED with the system state recorded. Never
   improvise a live fix: a code fix is a packet, re-verified and
   re-qualified, then a new window.
6. **Close:** post-release checks from the sheet, `DONE <sha>` in the
   lane file, `release` event, the final report (SKILL.md Phase 6 step
   5) with the live state and what remains the user's, then SKILL.md
   Phase 6 step 7 (release holding sessions, `run_complete`; in a
   programme, run `DONE` and *Run chaining* first).

Never push a branch the sheet does not name, never touch secrets or
security settings unless the step is the user's, and never mark a
window complete while a step is BLOCKED-ON-OWNER.
