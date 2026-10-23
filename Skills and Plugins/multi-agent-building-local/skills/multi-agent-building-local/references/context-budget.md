# Context budget: no session past 50%

Every session in a run (`O1`, `O2`, each packet, `O3`, a light-tier
session) stays **under 50% of its context window**. Compaction mid-run
loses decisions and corrupts triage; a fresh session reading `STATE.md`
costs a few thousand tokens. Splitting is cheap, so split early.

- **Measure, don't feel.** At every step boundary (a subagent or Codex
  call returns, a chunk closes, a review round is triaged, a phase ends)
  call `mcp__ccd_session_mgmt__get_usage` (session `self`) and write the
  percent into `STATE.md`'s `Context:` line. At the same boundary check
  `<ROOT>/HOLD.md`; if it exists, stop there (`references/programme.md`,
  *HOLD*).
  - **Below 35%:** carry on within the stint.
  - **35% or more:** finish only the step in hand. Start no new chunk,
    review round, or phase; hand off (`references/sessions.md`, Overflow).
  - **45% or more:** hand off now, even mid-step: TaskStop any live
    subagent or `codex exec`, then write `STATE.md` and `HANDOFF-<ID>.md`
    with exactly what is half-applied and what the stopped agents were
    doing.
  - No meter (plain CLI, tool missing): the stint limits below are the
    only guard. Hand off at the stint's end, never later, and treat any
    self-watch smell (re-reading files, forgetting logged decisions,
    vaguer replies) as the 45% line.
- **Stints are fixed at plan time and small.** A session does one stint,
  then hands off and stops:

  | Session | Stint |
  |---------|-------|
  | `O1` | Phases 0–2: triage, recon, plan, plan review, apportion, spawn the held sessions |
  | `O2` | Phase 3: tests, test review, RED commit, per-packet test map |
  | `P1…Pn` | Phases 4–5 for one packet (1–2 chunks; `P1` is the foundation): implement, gates, code review, commit |
  | `O3` | Merge any parallel packets, Phase 6: verify, release gate, final report (or the release sheet) |
  | `G<n>` | Qualify one candidate SHA against the full gate and its baseline |
  | `RW<n>` | One release window: the sheet's steps, post-release checks, final report |
  | `D<n>` | Programme planning (`D1`), then directing; succession at 35% |

  Light tier is one session (`O1` runs everything); the meter still
  applies.
- **Never absorb another session's stint.** A finished session does not
  "continue in-session" because the next session is not open yet; it marks
  the next ID *Ready* in `STATE.md`, activates it if held, and stops.
- **Keep what enters the context small:**
  - Codex replies come from the `-o` file only, never from `codex exec`
    stdout (`references/codex.md`).
  - Gate runs write to `<MAB>/logs/gates-<ID>.log` (`<MAB>` = the run's
    log root, absolute; `references/programme.md`, *Paths*); read the summary or
    tail (≤20 lines), and the full log only to diagnose a failure.
  - Subagent reports are ≤15 lines: what changed, gate result, blockers,
    `CONTEXT:`. No diffs, no logs, no file dumps.
  - Briefs copy the stint's plan steps, criteria, and test cases; stint
    sessions read `PLAN.md` sections only when the brief points there.
  - Fable reads a diff only to adjudicate a disputed finding.
