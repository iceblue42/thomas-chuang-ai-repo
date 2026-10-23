---
name: multi-agent-building
description: >-
  Cross-vendor multi-agent pipeline for planning, building, and reviewing
  features with minimal human review: Sonnet recon, Fable plans, Codex GPT 6
  Astra (medium) reviews plans/tests/code, Opus (high effort) writes tests
  and implements (Astra advises if Opus stalls), Fable triages, loops until
  objective gates + reviewer approval are green, then commits and pauses
  before push/deploy. Keeps a `.mab/` project log, risk-based tiers
  (light / standard / high-risk), delta-scoped review rounds, acceptance
  criteria with a verification pass, and a P0/P1 release gate. v1.4 splits
  every run into short single-purpose sessions (plan, tests, one session
  per 1–2 chunk packet, ship), each held under 50% of its context window
  by a measured meter. v1.5 makes the plan's `## Intent` (purpose,
  direction, intent guards) binding on every brief, every Codex review,
  and triage. v1.6 starts the relay's sessions itself in the desktop app
  (`start_session`) instead of printing holding prompts to paste. v1.7
  scales to multi-day programmes: a director session above a sequence of
  ordinary runs, a pool of spare held sessions so unattended relays never
  stall, a per-stint direction log with distributed drift audits that can
  HOLD the relay, director succession, and gate-qualification and
  release-window stints for live releases. Use whenever the user says
  "multi agent building", "/multi-agent-building", "MAB", "build this
  with the pipeline", "full pipeline", "MAB programme", "MAB resume",
  "MAB spawn", "MAB pool", "MAB hold <id>", "MAB worker <id>", "activate",
  or asks to build a feature with multi-agent review, cross-model review,
  or "no human review needed". Do NOT use for ordinary single-model coding,
  quick questions, or /route.
---

# Multi-Agent Building

Ship features with as little broken code as possible by making sure **no agent
ever reviews its own work**. The reviewer (Codex GPT 6 Astra) is never the
author (Anthropic Claude), and the triager (Fable) is never the implementer.

The pipeline optimises for **risk closure, not review saturation**. Every
review round must earn its cost: a round that finds no new material defect
is the last one. Ten sequential passes by similar models are not ten
independent checks; they mostly find style and speculative edge cases, and
the fixes they trigger create their own defects.

## Entry modes

Parse `$ARGUMENTS` (or the user's phrasing) for the mode. Default is `start`.

| Mode | Trigger | What it does |
|------|---------|--------------|
| `start <task>` | new request | This session becomes `O1` and runs Phases 0–2 only (light tier: the whole run) |
| `resume [<ID>]` | "MAB resume", or a session that finds `.mab/STATE.md` with an unfinished run | Resolve `<MAB>` first: your brief's path, else, if `.mab/PROGRAMME.md` exists, the active run's `.mab/runs/<run-id>/` from its run table (none of that: you are the director; use `director` mode). Read `<MAB>/STATE.md`, then only the files it lists under *Read next*, verify baseline, re-run gates if the last event was a kill, continue from *Next action* within this session's stint. With `<ID>` (required while parallel packets are ACTIVE) take over that session: read `lanes/<ID>.md` and `HANDOFF-<ID>.md` and continue from the lane file's *Next*. Never ask the user what was happening. |
| `programme <task>` | "MAB programme", or `start` finds the task programme-scale | This session becomes director `D1`: open the programme, split it into runs, start run 1, then direct. See `references/programme.md`. |
| `run <run-id>` | a programme run's `O1` (spawned, or a claimed spare) | Act as that run's `O1` from its brief, with `<MAB>` = `<ROOT>/runs/<run-id>/` and the programme intent inherited. |
| `director` | director succession (spawned, or a claimed spare): `director, programme <PROGRAMME.md>` or, for a single run, `director, run state <MAB>/STATE.md` | Take over as `D<n+1>` per `references/programme.md`, *Succession*. |
| `pool <n>` | user asks to top up spares (e.g. before stepping away) | Start spares until `<n>` are free, per `references/sessions.md`, *Spare pool*. |
| `unhold` | user rules on a HOLD | Director (or `O1`) records the ruling and lifts the hold per `references/programme.md`, *HOLD*. |
| `spawn` | user replies `spawn` / `MAB spawn` after a refused start | Start every session in `PLAN.md ## Sessions` whose lane file is PLANNED with no `Session id`, every spare file not yet started, every pending `<ROOT>/briefs/run-*-O1.md` with no session, and the pool's shortfall, per `references/sessions.md` *Spawning*. |
| `INTENT UPDATED` | message from the director after a user ruling | Re-read `## Intent` from `PLAN.md` (it now matches your brief), log it, and continue the stint under the new intent. |
| `hold <ID>` / `hold S<n>` | holding or spare prompt (a spawned session's first message, or pasted) | Register as session `<ID>`; if `STATE.md` already lists `<ID>` under *Ready*, activate at once, otherwise stop and wait. See `references/sessions.md`. |
| `worker <ID>` / "activate" | ACTIVATE message or user typing `activate` | Run the stint in `briefs/<ID>.md` (O2: Phase 3; a packet: Phases 4–5 for its chunks; O3: Phase 6), hand off, stop. See `references/sessions.md`. |
| `release` | another MAB session sends RELEASE | The holding session ends with a one-line ack. |

## Roles

| Role | Who | Never does |
|------|-----|-----------|
| Recon | Sonnet subagents (parallel) | write code |
| Planner / triager | Fable, in every stint session (`O1`, `O2`, `P1…Pn`, `O3`) | write implementation code |
| Packet session | A Fable session running this skill for one packet of 1–2 chunks | touch files outside its claim, push, run a second packet |
| Plan, test & code reviewer | Codex `gpt-6-astra`, medium effort, read-only | write code, review design, propose refactors |
| Design brief author | Sonnet subagent with the taste plugin loaded | write code |
| Test author | Opus subagent, high effort (dedicated) | implement the feature |
| Implementer | Opus subagent(s), high effort; Astra consult if stalled | modify tests (light tier: writes its own tests first, then leaves them alone), review own code, refactor beyond the chunk or finding |
| Verifier | Sonnet subagent (read-only) | fix anything; it reports PASS/FAIL per acceptance criterion |
| Drift auditor | Sonnet subagent (read-only), dispatched at handoffs | fix anything; it grades the cumulative change against `## Intent` |
| Director | `O1` after its stint, or `D<n>` in a programme: the user's window | run a stint, read diffs, activate sessions (except the recorded *Ready* list when lifting a HOLD), change the intent without the user |
| Release operator | `RW<n>` session | improvise live fixes, retry a refused step, act on an owner step |

Blind spots to keep in mind: Fable wrote the plan and triages against it, so a
code-review finding that challenges the *plan* is high priority, never
out-of-scope. Astra sees only a plan and a diff; shown a removed check
without the reason it was removed, it files a regression, and the fix
quietly re-adds the check. `references/intent.md` exists for
that. When Astra advises a stalled Opus (Phase 4) it later reviews
the diff that advice shaped; flag those chunks in `FINDINGS.md` and give them
the same skepticism as anything else.

## Context budget: no session past 50%

Every session (`O1`, `O2`, each packet, `O3`, a light-tier run) stays
under 50% of its context window; the meter, thresholds, stint table, and
context-hygiene rules are in `references/context-budget.md`. Read it in
every session. Summary: measure with `mcp__ccd_session_mgmt__get_usage`
at every step boundary and record the percent in `STATE.md`; at 45%
finish only the step in hand and hand off, at 50% hand off now; stints
are fixed at plan time (`O1` phases 0–2, `O2` phase 3, `P1…Pn` one packet
each, `O3` merge + phase 6, `G<n>` qualification, `RW<n>` release
window) and a session never absorbs the next one's;
Codex replies via `-o` only, gates to log files, ≤15-line agent reports.

## The `.mab/` log is the shared memory

Every run keeps its state in `<repo>/.mab/` (gitignored unless the repo
already tracks planning docs). Layout, file formats, and the event vocabulary
are in `references/logging.md`; read it once per session and follow it.

Non-negotiable rules:

- **`STATE.md` is rewritten at every phase boundary, every triage round,
  every dispatch, every kill, and every handoff, *before* the next step is
  taken.** It is at most 40 lines (check with `wc -l`) and is the only file
  a resuming session must read. History goes to `JOURNAL.md`, not `STATE.md`.
- Every decision gets one line in `DECISIONS.md` with its rationale, as it is
  made. Every event gets a line in `JOURNAL.md` and a row in `events.jsonl`.
- Every prompt sent to any agent, session, or Codex is written to
  `briefs/<id>.md` first; the agent is pointed at the path. Prompts pass
  file paths, never pasted file contents.
- Per-phase wall time, rounds, agents spawned/killed, Codex calls, and the
  context percent at stint end go in `LEDGER.md`.
- The test: `STATE.md` plus the files it lists must be enough for a fresh
  session to continue the run without asking the user anything.

## Intent is the contract

Review loops drift: each round a reviewer proposes a locally reasonable
guard, triage accepts it because it is tagged HIGH, and three packets
later the feature does the opposite of what was asked. The defence is in
`references/intent.md`; read it in every session. Summary: `PLAN.md`
opens with `## Intent` (purpose, direction, 3–8 intent guards), printed
to the user by `O1` and changed only by the user; every brief copies it
and every Codex prompt carries the intent block; **triage checks intent
before severity**, and a finding whose fix would move against the intent
is `intent-conflict`, never fix-now (a real hole is escalated to the
user, not fixed quietly); implementer and test author stop and report
rather than contradict it; the Phase 6 verifier grades `INTENT` first and
a FAIL there is escalated, not patched.

## Sessions

Protocol, the `## Sessions` table, brief contents, holding-prompt template,
handoff, and overflow are in `references/sessions.md`; read it in every
session. `O1` starts every later session itself at the end of Phase 2
(desktop `start_session`, all at once, each holding); the user pastes
nothing. The relay runs itself: each session ends its stint by writing
`STATE.md` with *Ready* (the IDs whose dependencies are now all DONE),
sending `ACTIVATE <ID>` to each ready session that is holding, and
stopping. A session that registers after its predecessor finished finds
itself under *Ready* and starts on its own. Nobody polls.

The batch also starts a **spare pool**: held sessions with no stint that
any session claims (atomic claim file, then `ACTIVATE <ID> as S<n>`) when
it needs a new session on a turn the app will not let it start one:
overflow, a fix packet, a programme's next run, a director successor.
Every stint ends by appending a five-line block to `DIRECTION.md`; every
third block, and before `O3`, `G<n>` or `RW<n>`, the handing-off session
has a read-only Sonnet auditor grade the cumulative diff against
`## Intent`, and `OFF-COURSE` writes `HOLD.md`, which every session
obeys until the user rules. Escalations go to the director by message
and push notification, so none of this depends on the director being
awake.

## Programmes and live releases

Work bigger than one run (more than about ten packets, more than one
live release, several days or release trains) is a **programme**: a
director `D<n>` above a sequence of ordinary runs, each with its own log
under `.mab/runs/<run-id>/`, the programme intent inherited, and runs
chained by the relay itself (`references/programme.md`). No middle tier
of orchestrators. A run that goes live adds `G<n>` (qualify the
candidate SHA against a long gate and its baseline failures) and `RW<n>`
(run the reviewed release sheet one logged step at a time; owner steps
and refusals become BLOCKED-ON-OWNER, never a retry in another form)
after `O3` (`references/release.md`).

## Keeping agents alive and fresh

Applies to every long-lived subagent and every Codex call.

- **Stall watch.** Note roughly how long a dispatch should take; at ~2× that
  with no notification, check the output tail (TaskOutput, tail only). Repeated
  identical tool calls, a permission prompt, or silence means stalled. One
  SendMessage nudge; still stuck, TaskStop and respawn via the handoff
  protocol. Run `codex exec` in the background under the same watch.
- **Context-rot watch.** Standing order in every persistent agent's brief:
  "End each report with `CONTEXT: OK` or `CONTEXT: FILLING`." Treat FILLING,
  or your own smell test (sloppier diffs, forgotten constraints, bloated
  replies), as a respawn trigger. Packets are small enough that one
  implementer normally lives for the whole packet.
- **Handoff protocol.** Before killing a long-lived agent it writes
  `.mab/HANDOFF-<id>.md`: done / in-progress / next, files touched, gotchas,
  anything learned that is not yet in `PLAN.md`. If it is too far gone, write
  it from its reports. The fresh agent gets its brief + `FINDINGS.md` + the
  handoff. After any kill, re-run the objective gates before the
  replacement starts.

## Codex

Invocation, the model-freshness probe, the reviewer mandate, the stable
finding-ID protocol, delta scoping, and the exit rule are in
`references/codex.md`. Summary: Astra is always read-only; every review
prompt carries the intent block and the reviewer mandate (correctness, regressions, security,
data integrity, architectural violations, unhandled edge cases, test
quality; **no stylistic refactors**) and points at `.mab/FINDINGS.md`,
referencing open IDs rather than re-reporting. Round 1 of any loop reviews
the whole scope; later rounds review only the fix delta and STILL-OPEN
IDs. **A loop exits when no CRITICAL or HIGH finding is open, or when a
round raises no new CRITICAL/HIGH**, with MEDIUM/LOW logged as follow-ups.
Caps: plan 3, test 2, code 3 (per packet), release gate 2. If
`gpt-6-astra` errors as unknown, stop and tell the user this skill needs
updating.

Claude side: request subagents by tier (`model: "opus"` / `"sonnet"`), never
by pinned version. If a newer family is known to exist, use it and flag this
file as stale. The test author and implementer are the plugin's agents
`multi-agent-building:mab-test-author` and
`multi-agent-building:mab-implementer` (`model: opus`, `effort: high`;
Opus 5.5 as of v1.3.0). If those agent types are unavailable, dispatch
`general-purpose` with `model: "opus"` and log a `decision` that effort
fell back to the session default.

## Phase 0 — Triage and open the log (`O1`)

0. **Scale.** If the task is programme-scale (`references/programme.md`,
   *When a task is a programme*), tell the user, become `D1`, and follow
   that file instead of this section. A programme run's `O1` (`run
   <run-id>`) does this Phase 0 for its scope, under `<MAB>` =
   `<ROOT>/runs/<run-id>/`.
1. Classify and tell the user which **tier**. The tier sets the QA budget;
   models and roles never change with it.
   - **Light**: single-file fix, small refactor, layout, labels, animation,
     navigation, or isolated component behaviour; no new data paths. No
     recon fan-out, no plan-review loop, no test author, no extra sessions.
     `O1` writes a short `PLAN.md` (Phase 2 step 2 only: criteria and
     test cases, no review loop), then runs Phases 4–6 itself as a single
     packet: the implementer writes the tests first, one code-review
     round, verification, commit. No holding prompts; hand off only on
     overflow.
   - **Standard**: new feature, multi-file work, ordinary application
     logic. Recon, reviewed plan, tests first, packets with code review
     (max 3 rounds each), verification, commit. Release gate when the run
     had two or more packets beyond the foundation `P1`, or any
     packet's loop needed all three rounds.
   - **High-risk**: anything touching authentication, authorisation,
     payments, deletion, migrations, encryption, synchronisation, or that
     can corrupt user data. Standard plus a security-and-data-integrity
     framing in each packet's code review round 1 and a mandatory release
     gate.

   When in doubt between two tiers, take the higher one and log why.
   Everywhere else in this skill, *light mode* means the light tier and
   *full mode* means standard or high-risk; `STATE.md` records the tier.
2. Create `<MAB>` per `references/logging.md`; write the first `STATE.md`,
   record baseline branch and SHA, and record the user's ship authority
   (commit only / push / deploy) with the date it was given. Record your
   own session id (`mcp__ccd_session_mgmt__get_session` with `"self"`)
   as `Director:` in `STATE.md`; escalations go there. In a programme
   run write `Director: see PROGRAMME.md` instead; escalations resolve
   the id from `<ROOT>/PROGRAMME.md` at send time.
3. In full mode tell the user: this session plans only; after plan
   approval it starts one held session per remaining stint (tests, each
   packet, ship) itself, and the relay then runs on its own.

## Phase 1 — Recon (full mode)

Recon is a Workflow call (script in `references/recon-workflow.md`); this
skill instructing it is the Workflow tool's opt-in. Fall back to 2–4 Explore
subagents in one message if the tool is unavailable. Pass 3–5 questions:
modules and entry points, conventions, test infrastructure, blast radius,
and always one for the repo's **build, test, and lint commands** (the
objective gates). Add one question whenever the task might touch UI:
"Does this touch frontend code? List framework, styling method, existing
design tokens, and whether this is new UI or a redesign." Distill the
returned summaries into `PLAN.md`; log `phase_end` with the ledger row.

## Phase 2 — Plan, reviewed until approved, then apportioned

1. **Design brief first, when recon flagged frontend work.** Dispatch the
   design-brief subagent per `references/taste.md`; it writes
   `<MAB>/DESIGN.md`. Skip with a logged note if the taste plugin is absent.
2. Write `<MAB>/PLAN.md`: `## Intent` first (`references/intent.md`),
   then goal, assumptions, files to touch, step-by-step
   changes, **acceptance criteria** (3–8 observable statements the Phase 6
   verifier will check, each answerable PASS/FAIL from a test name, a
   command, or a specific observation), **enumerated test cases** (Phase
   3's spec, each mapped to a criterion), gate commands, non-goals, and a
   link to `DESIGN.md` for UI steps. This is the highest-value pass in the
   run: a bad plan fixed after three review rounds costs more than any
   review saves.
3. **Chunk and packet the plan** (`## Chunks` table: id, steps, files,
   depends_on, packet). Rules:
   - A chunk is a small, independently verifiable group of 1–3 plan steps.
   - Shared prerequisites (types, schemas, migrations, interfaces) form the
     **foundation packet** `P1`, built and reviewed first like any packet;
     every packet that needs it depends on it.
   - A **packet** is 1–2 chunks, about 8 files at most, sized to finish
     implement + review in well under 45% context. A hard-reasoning chunk
     is a packet on its own. When in doubt, split.
   - Packets run sequentially by default, each starting from the previous
     packet's commit. A packet may run **in parallel** only when its file
     set is fully disjoint from every concurrent packet and nothing
     between them depends on the other; it then gets its own worktree
     (`worktree: yes`). Parallelize only when it saves real time (more
     than about six chunks overall); a false parallel costs a merge plus a
     release-gate round.
4. Codex plan review loop (max 3 rounds) per `references/codex.md`, using
   the plan template there: design flaws, missing edge cases, incomplete or
   uncheckable acceptance criteria, missing test cases, integration risks,
   packet disjointness, and whether every step serves `## Intent`.
   Intent check first: a finding that would narrow the intent or guard
   against it is `intent-conflict`, not a revision. Then revise for
   CRITICAL/HIGH; argue MEDIUM/LOW if warranted. Exit when no CRITICAL/HIGH is open or a round raises none
   new. Round 3 still dirty: stop and escalate.
Steps 5–6 are full mode only; light tier goes from step 2 to Phase 4.

5. **Apportion across sessions** once approved: write the `## Sessions`
   table into `PLAN.md` (ID, stint, chunks, depends_on, worktree, brief),
   each packet's claim to `<MAB>/lanes/<ID>.md`, and every session's brief
   to `<MAB>/briefs/<ID>.md` (`references/sessions.md` has the contents).
   A run with a long or baseline-classified full gate adds `G<n>`; one
   with a live release and deploy authority adds `RW<n>` and puts the
   release outline in `PLAN.md ## Release` (`references/release.md`).
6. **Spawn the relay.** Set *Ready: O2* in `STATE.md`, write
   `HANDOFF-O1.md`, your `DIRECTION.md` block, and the ledger row, then
   start every remaining session at once with its holding prompt, plus
   the spare pool (`references/sessions.md`, *Spawning*: `start_session`,
   else claimed spares, else one `spawn` reply from the user, else
   printed prompts to paste). `O2` registers, sees itself *Ready*,
   and starts; the rest hold. `O1`'s stint is done; it now only reports
   the relay's progress to the user when the app wakes it.

## Phase 3 — Tests first, independently (`O2`)

1. Dispatch a **dedicated** Opus test author (`mab-test-author`) to write
   failing tests for exactly the test cases in `PLAN.md`, all packets
   included. It writes no implementation code and adds no test cases
   beyond the spec; a gap it notices is reported, not filled.
2. Run the tests; confirm RED. A test that passes before the feature exists
   tests nothing. This run is the proof that the suite depends on the
   feature; do not ask Codex to re-derive it.
3. One Codex **test-conformance** round (cap 2) per `references/codex.md`:
   do the tests implement exactly `PLAN.md`'s cases, and does any
   assertion hold regardless of the feature? Coverage was judged at plan
   review; do not ask for it again.
4. Test author fixes CRITICAL/HIGH. The second round, if any, checks only
   those fixes.
5. The build and lint must stay green: tests may fail, but every test
   file must compile and be collected. Commit the RED tests on the task
   branch (`test: …`) so every packet, and every worktree, starts from
   them.
6. **Map tests to packets.** Append to each packet's brief the test files
   and test IDs for its cases, and its **expected-RED list**: the tests
   owned by packets that will not be DONE when it runs. Update the
   packets' lane files to match.
7. Hand off: *Ready* = `P1`, `ACTIVATE` it, stop.

Light mode: the implementer writes the tests first, then the code, and the
single Codex code-review round must explicitly audit test quality. A
finding against a test lets the implementer edit exactly that test.

## Phase 4 — Implement one packet (tracer bullets)

Runs inside each packet session `P<n>` (light tier: inside `O1`), which
owns its chunks, claim, implementer, gates, and Codex loop. Deliberately **not** a Workflow: it
depends on mid-run SendMessage steering, stall/rot watches,
kill-and-respawn, and Fable's triage between rounds. Phases 2, 3, and 5
likewise pivot on Fable acting mid-loop. Do not "improve" them into a
workflow.

1. If the packet depends on parallel packets, merge their branches
   (`--no-ff`) into your own branch first: the task branch in the main
   tree, or your packet branch right after creating its worktree. Run
   the gates.
2. Dispatch **one** Opus implementer (`mab-implementer`) with the brief
   path, the absolute working-tree path, the CONTEXT line order, the
   ≤15-line report rule, and two standing rules: **"You may not modify
   any test file. If a test seems wrong, stop and report it."** (light
   tier: "Write the tests the brief lists first; after that, the same
   rule.") and **"Change only what the chunk or the
   cited finding requires. No opportunistic refactors, generalisations,
   abstractions, or caching; if you believe one is needed, report it
   instead of doing it."**
3. Direct it chunk by chunk via SendMessage. It runs build plus relevant
   tests itself and reports pass/fail per step. At each chunk boundary
   **you** re-run build plus relevant tests once (to the log file), log
   `chunk_done`, read the meter, and update `STATE.md`.
4. **Kill and respawn** a fresh Opus implementer on over-engineering, a
   tripped stall watch, or a tripped rot watch.
5. On two attempts without progress, or failure on genuinely hard logic,
   go **straight to an Astra consult**: **you** run a read-only Astra
   consult describing what was tried, relay the analysis to the
   implementer, and note the consult in `FINDINGS.md`. Still stuck: it is
   a plan problem; set the packet `BLOCKED` and escalate.

## Phase 5 — Packet review loop (max 3 rounds; light tier: 1)

Each round, cheap gates before expensive review:

1. **Objective gates:** build, full test suite, lint. The only failures
   allowed are tests on the brief's expected-RED list (later packets'
   cases); every other failure, including this packet's own tests, goes
   straight back to the implementer (or a build-error-resolver subagent).
   Never spend a Codex call on code that does not compile.
2. **Codex code review** per `references/codex.md`. **Round 1** reviews the
   packet's diff (uncommitted changes plus new files) against its chunks in
   `PLAN.md` with the reviewer mandate; high-risk tier adds the
   security-and-data-integrity framing. **Rounds 2 and 3** review only the
   fix diff since the previous round plus the STILL-OPEN IDs; Codex may not
   re-audit code the fixes did not touch.
3. **Fable triage:** per finding, the intent check first
   (`intent-conflict` is never fix-now, whatever the tag), then fix-now /
   won't-fix (say why) / plan-challenge (high priority). You are the judge, not a relay; a
   reviewer hallucination rejected with a reason is a good outcome. Fix-now
   is the default only for CRITICAL/HIGH. A MEDIUM is fixed only when the
   fix is local and smaller than the finding; otherwise it is a follow-up.
   Update `FINDINGS.md` statuses, write `reviews/round-NN-code-<ID>.md`,
   log the round.
4. Point the implementer at the round file, restating the fix-only rule.
   Loop. Respawn rules apply.

Exit when gates pass and either no CRITICAL/HIGH finding is open or the
last round raised no new CRITICAL/HIGH. Then commit the packet
(`feat(<ID>): …`; on the task branch, or the packet branch when it has a
worktree), set `Status: DONE <sha>`, hand off (*Ready* = the next
packet(s) or `O3`), and stop. Light tier: go on to Phase 6 in this
session instead. **Never push.** Round 3 dirty: set
`BLOCKED`, write `STATE.md` with gates status, open findings, and a
recommendation, and escalate. Never loop past 3; a fourth round finds
style, not defects.

## Phase 6 — Verify, release gate, ship (`O3`; light tier: `O1`)

With `G<n>`/`RW<n>` in `## Sessions`, `O3` runs steps 1–4, writes and
reviews the release sheet instead of step 5, and hands off;
`references/release.md` covers the rest, and `RW<n>` gives the report.

From here the expected-RED list is empty: every gate allows no failures.

1. **Merge** any parallel packet branches not yet merged (the branch each lane file records) (`--no-ff`) and
   run full gates. A merge that breaks gates goes to an Opus implementer
   as a targeted fix.
2. **Verification pass** (every tier). Run the full gates once more on the
   final tree. Dispatch one read-only Sonnet verifier (`general-purpose`)
   with `## Intent` and the acceptance criteria from `PLAN.md`: first
   `INTENT` (does the change as built move in the stated direction and
   cross no guard? cite the evidence), then for each criterion PASS or
   FAIL with the evidence (test name, command output, or a specific
   observation), then `CONTEXT:`. Write the result to
   `<MAB>/reviews/verify.md`. An `INTENT` FAIL is escalated to the user with the
   verifier's evidence, never patched. A criterion FAIL goes to the
   implementer as a targeted fix of that criterion; re-run gates and that criterion only. Never
   answer a verification failure with another general review round.
3. **Release gate** (high-risk tier always; standard tier when the run had
   two or more packets beyond `P1`, or any packet's loop needed all three
   rounds; never in
   light). This is the only review of the whole change, so it carries the
   cross-packet framing. One Codex round per `references/codex.md` on the
   diff of the task branch against the baseline SHA, with the constrained
   release template: unresolved P0/P1 correctness, security, data-loss,
   and regression risks only, plus cross-packet interaction. Cap 2: the
   second round re-checks only fixes to round-1 findings. CRITICAL/HIGH is
   fixed by a targeted implementer pass and re-verified; anything else is
   a follow-up, not a change.
4. Commit any verify or release-gate fixes locally on the task branch:
   conventional format, body summarizing what was built, the acceptance
   criteria verified, and the review rounds survived. Exclude `.mab/`
   unless the repo tracks planning docs. Commit by explicit path when the
   tree carries unrelated changes.
5. **Stop. Do not push or deploy.** Report: what was built, the packet
   commits, gates status, verification result, rounds per packet, files
   changed, follow-ups from `FINDINGS.md`, and the ledger.
6. **Override:** honor exactly what the user's original prompt authorized
   (recorded in `STATE.md`); push-only authorization does not include deploy.
7. Single run: send `RELEASE` to any session still holding and to unused
   spares, and mark the run `complete` in `STATE.md`. Programme run: set
   the run `DONE <sha>` in `PROGRAMME.md`, follow *Run chaining* first
   (it may claim a spare), then `RELEASE` only this run's own holding
   sessions and mark it `complete`; spares are released at programme
   end. With `G<n>`/`RW<n>` this step belongs to the last of them
   (`references/release.md`).

## Escalation, always

Whenever a loop hits its cap, a gate command does not exist, Codex CLI is
unavailable, or a needed session never appeared: write `STATE.md`, report
honestly (green, not green, blocked), and ask. A truthful "stuck after
three rounds" beats a fake "all green".
