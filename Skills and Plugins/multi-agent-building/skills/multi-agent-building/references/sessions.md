# Sessions: stints, holding, activation, relay, overflow

Every full-mode run is a relay of short sessions, each doing one stint and
staying under 50% of its context window (SKILL.md, *Context budget*).
Coordination is **file-based** (`.mab/`) so it works anywhere; desktop
session spawning and cross-session messaging are the accelerators.

## Session IDs and stints

| ID | Stint | Starts when |
|----|-------|-------------|
| `O1` | Phases 0–2 (light tier: the whole run) | `start` |
| `O2` | Phase 3: tests, RED commit, per-packet test map | `O1` finishes |
| `P1` | foundation packet, Phases 4–5 | `O2` finishes |
| `P2…Pn` | Phases 4–5 for one packet (1–2 chunks) | every session it depends on is DONE |
| `O3` | merge parallel packets, Phase 6 | every packet is DONE |
| `G<n>` | gate qualification of a release candidate (`references/release.md`) | `O3` finishes |
| `RW<n>` | release window: the live release sheet (`references/release.md`) | `G<n>` qualified (or `O3`) |
| `<ID>b`, `<ID>c` | the rest of an overflowing stint | the overflowing session hands off |
| `S<n>` | spare: holds with no stint until claimed | spawned with the pool |
| `D<n>` | programme director (`references/programme.md`) | programme start, or succession |

## Apportioning (Phase 2, after plan approval)

`PLAN.md ## Sessions`:

```
| Session | Stint | Chunks | Depends on | Worktree | Brief |
|---------|-------|--------|------------|----------|-------|
| O1 | phases 0–2 | — | — | main | — |
| O2 | phase 3 | — | O1 | main | briefs/O2.md |
| P1 | foundation packet | 1 | O2 | main | briefs/P1.md |
| P2 | packet | 2, 3 | P1 | main | briefs/P2.md |
| P3 | packet | 4 | P2 | yes | briefs/P3.md |
| P4 | packet | 5, 6 | P2 | yes | briefs/P4.md |
| O3 | merge + phase 6 | — | P3, P4 | main | briefs/O3.md |
```

Here `P3` and `P4` run in parallel worktrees after `P2`; `O3` merges them.
Sequential packets use `main` (the task branch in the main tree). Rules for
sizing and splitting live in SKILL.md Phase 2. Write a `lanes/<ID>.md`
(`Status: PLANNED`) for every session after `O1`.

## Briefs (`.mab/briefs/<ID>.md`)

A brief is everything the session needs for its stint, so it never reads
the whole plan. Copy, don't link.

- **Every brief:** session ID and stint; repo path; the absolute paths
  `<MAB>` (this run's log root) and `<ROOT>` (the repo's `.mab/`, home
  of `DIRECTION.md`, `HOLD.md`, `spares/`; the same as `<MAB>` outside a
  programme; `references/programme.md`, *Paths*); the absolute working-tree path
  every command and subagent runs in; task branch and baseline SHA; tier;
  ship authority; `## Intent` from `PLAN.md`, copied verbatim; gate
  commands; the 50% budget rule with the meter
  thresholds; its *Depends on* and who depends on it; the `CONTEXT:` and
  ≤15-line report rules for its subagents.
- **Packet:** chunk IDs with their plan steps; the acceptance criteria and
  test cases those chunks satisfy; the file claim; worktree yes/no and
  branch name; parallel packets to merge first, if any; `DESIGN.md`
  reference and which taste sub-skill to load for UI chunks; the
  packet-scoped Codex prompt prefix and finding-ID prefix `F-<ID>`. `O2`
  appends after the RED commit: the packet's test files and test IDs
  (which no one may modify) and its **expected-RED list**.
- **O2:** the enumerated test cases with the packet each belongs to, so it
  can append the test map to every packet brief.
- **O3:** which packets ran in worktrees (merge the branch each lane file
  records), acceptance criteria, release-gate
  condition for this tier, and the final report contents (or, with a
  release, the release sheet to write).
- **G<n>, RW<n>:** as `references/release.md` lists.

## Spawning the held sessions (end of Phase 2, and overflow)

The relay's sessions are **started by MAB, not pasted by the user**. Each
one is started with the holding prompt below as its first message: it
registers HOLDING, finds itself under *Ready* or waits for `ACTIVATE`,
exactly as a pasted session would. Spawning all of them at once, plus a
pool of spares, means no later session ever has to start another, which
matters because the app refuses `start_session` on a turn that another
session's message or an automated event (a subagent or Codex finishing,
a side-session note) started. Overnight nobody clicks a card; only the
pool keeps an unattended relay moving.

Ladder, per session, first rung that works:

1. **`mcp__ccd_session__start_session`** (desktop app; load it with
   ToolSearch if deferred). Invoking MAB in full mode is the user's
   request for these sessions, so `initiation: "user_asked"`;
   `context: "fresh"`; `prompt` = the holding prompt; `background` = one
   paragraph (run id, task, `## Intent` purpose line, "you are one stint
   of a MAB relay; follow the skill's hold mode"); `title` = `MAB <ID> ·
   <repo>`; `name` = `mab-<id>-<repo slug>` (≤24 chars, `[a-z0-9-]`);
   `use_worktree: false` (packets make their own worktrees on activation;
   if the app rejects `false`, omit it). Before two or more starts, call
   `mcp__ccd_session__mark_chapter` ("MAB <run id> relay"), then send all
   the starts in one message, the spare pool's included (*Spare pool*).
   Write each returned `local_…` id into the lane file's `Session id`
   (a spare's into `spares/S<n>.md`).
2. **Claim spares** (*Spare pool*) when the start is refused or the tool
   is missing on this turn: claim one free spare per session (mode
   `hold <ID>`, or `worker <ID>` for a session already *Ready*), as many
   as are free.
3. **Refused, pool short:** for whatever rung 2 could not cover. For one
   session (an overflow), propose it instead (`initiation:
   "own_initiative"`, same `prompt`/`background`/`title`); it shows as a
   card the user starts with one click. For two or more (the Phase 2
   batch, a fix-packet set), do not scatter cards: write `STATE.md`
   (`Next action: spawn`), escalate, then end the turn asking the user to
   reply `spawn` (desktop: `wrap_up` with a "Start sessions" button
   sending `MAB spawn`). The `spawn` mode, run on that user turn, starts
   every session in `## Sessions` whose lane file is PLANNED with no
   `Session id`, every spare file not yet started, every pending
   `<ROOT>/briefs/run-*-O1.md` with no session, and the pool's
   shortfall.
4. **No tool** (plain CLI, web): print the holding prompts, one fenced
   block per session in relay order, and say "Paste each into a new
   session; each holds until its turn, then starts by itself."

After the batch, tell the user in one line which sessions now exist
(link each: `[MAB <ID> · <repo>](#local_<id>)`).

### O1 after spawning

`O1`'s stint is over, but it stays the user's window on the run (its
session id is `STATE.md`'s `Director:`, recorded in Phase 0 with
`get_session("self")`): the app continues it whenever a spawned session
ends a turn, and escalations arrive as `ESCALATE` messages. On every user
turn it tops up the spare pool. It follows the director's rules in
`references/programme.md` (*Director mode*, *HOLD*, *Succession*); in a
programme the director plays this part. On such a
`<side-sessions-event>` turn, re-read `STATE.md` and the lane files and
reply in one or two lines (who is ACTIVE, who is DONE). Surface anything
BLOCKED or escalated with its reason, and any session that should be
HOLDING but never registered. Start nothing but spares on user turns,
activate nothing (except lifting a HOLD on the user's ruling), and do
not take over a stint: the relay's own `ACTIVATE` messages run it.

### Holding prompt (the spawned session's first message)

```
Invoke the multi-agent-building skill in hold mode: `hold <ID>`.
Project: <absolute repo path>  ·  Run: <run id>  ·  Task: <one-line title>
Stint: <tests | packet: chunks <ids> — <summary> | merge + verify + ship>
Starts after: <IDs>   Files: <claim summary>   Worktree: <yes|no>
Log root <MAB>: <abs path>   Root <ROOT>: <abs path to the repo's .mab/>
Brief: <MAB>/briefs/<ID>.md   State: <MAB>/STATE.md   Lane: <MAB>/lanes/<ID>.md
Set this session's title to "MAB <ID> · <repo>". Register as HOLDING in
<MAB>/lanes/<ID>.md, then read <MAB>/STATE.md: if it lists <ID> under "Ready",
start your stint now. Otherwise confirm in one line and stop; you will be
activated by "ACTIVATE <ID>" from another MAB session or by the user
typing "activate". On "RELEASE <ID>" acknowledge in one line and stop.
```

## Spare pool (`<ROOT>/spares/`)

Spares are held sessions with no stint yet. A session that needs another
session on a turn the app will not let it start one (an overflow, a fix
packet, a new run's `O1`, a director successor, a planned session the
batch could not start) claims a spare instead of waiting for the user.

- **Size.** Target: 2 for a single run; `Spare pool target` in
  `PROGRAMME.md` for a programme (3 + the largest `Est. sessions` among
  runs not yet planned). Spawned with the Phase 2 batch, and topped up to the target
  by any session on a user turn (`O1` / director every user turn, or the
  user's `MAB pool <n>`). Each starts by rung 1 with the spare prompt.
- **Spare prompt:**

  ```
  Invoke the multi-agent-building skill in hold mode: `hold S<n>` (spare).
  Project: <absolute repo path>  ·  Programme/Run: <id>  ·  Spares: <ROOT>/spares/
  Register as SPARE in spares/S<n>.md, then check for spares/S<n>.claim:
  if it exists, take on the mode it names now. Otherwise confirm in one
  line and stop; "ACTIVATE <ID> as S<n>" wakes you. On "RELEASE S<n>"
  acknowledge in one line and stop.
  ```

- **Spare file** `spares/S<n>.md`: `Session id` and `Status: STARTED`
  (written by the spawner from the `start_session` result), then
  `SPARE` (written by the spare when it registers), `CLAIMED <ID> by
  <claimer> <time>`, or `RELEASED`.
- **Claim** (claimer): write the brief and the lane file for `<ID>`
  first, with `Session id` = the spare's. Only spares whose file says
  STARTED or SPARE are candidates. Create the claim file atomically,
  `set -C; printf '%s\n' "<mode> | brief <abs path> | lane <abs path>
  | MAB <abs path> | by <claimer> <time>" > <ROOT>/spares/S<n>.claim`,
  where `<mode>` is `hold <ID>`, `worker <ID>`, `run <run-id>`, or
  `director` (lane `—` for the last two). If it already exists, the spare
  is taken: try the next. **Then** re-read `spares/S<n>.md`: SPARE, send
  `ACTIVATE <ID> as S<n>` to its `Session id`; STARTED, it has not
  registered yet and will find the claim when it does; RELEASED (lost a
  race with a release), delete your claim file and try the next. Log
  `spare_claim`.
- **Claimed** (spare): read the claim, set `Status: CLAIMED`, retitle
  the session `MAB <ID> · <repo>` (director: `MAB D<n> · <repo>`), and
  run the claimed mode as if it had been its first message.
- No free spare: fall back to rungs 3–4, and note `pool empty` in
  `STATE.md` *Open questions* so the next user turn refills it.
- At `run_complete` (programme: at programme end), `RELEASE` every spare
  still SPARE.

## Adding a session mid-run

A fix packet (a NOT QUALIFIED gate, a verification FAIL too big for a
targeted fix, a follow-up the user rules in) is added, not squeezed into
a running stint: add its row to `## Sessions` (next free `P<n>`, with
*Depends on*), write its brief and lane file (claim checked against
every ACTIVE packet), update the *Depends on* of the sessions that must
now wait for it, and claim a spare with `hold <ID>`. Log a `decision`.

## Hold mode (`hold <ID>`)

1. Set the session title to `MAB <ID> · <repo>` (desktop:
   `mcp__ccd_session_mgmt__set_session_title`; otherwise skip).
2. **Register first:** `Status: HOLDING` and the session title in
   `<MAB>/lanes/<ID>.md` (paths from the holding prompt or claim); log
   `lane_status` in `<MAB>`.
3. **Then** read `STATE.md` and the brief. Do not read `PLAN.md` and do
   not explore the codebase; that happens on activation. If
   `<ROOT>/HOLD.md` exists, stay holding whatever *Ready* says
   (`references/programme.md`, *HOLD*).
4. If `STATE.md` *Ready* lists `<ID>`, activate yourself now (Worker mode
   below). Otherwise reply exactly: `Holding as <ID>. Activate with
   "ACTIVATE <ID>" or type "activate".` and end the turn. Do not poll,
   loop, or schedule wakeups; the message wakes the session.

Registering before reading, and handing off by writing *Ready* before
reading lane files, means one side always sees the other: no session can
be left holding with its turn already passed.

## Handing off (end of every stint)

1. Close out: stint commit made (`O2`, packets), `lanes/<ID>.md`
   `Status: DONE <sha>`, ledger row with the context percent, and
   `HANDOFF-<ID>.md` (gotchas the next session may need). Append your
   block to `<ROOT>/DIRECTION.md` and run the drift audit if it is due
   (`references/programme.md`); on `OFF-COURSE` do step 2, then write
   `HOLD.md` with the *Ready* list, escalate, and stop without step 3.
2. Compute *Ready*: every row in `## Sessions` whose *Depends on* are all
   DONE (per their lane files) and whose own lane file is not ACTIVE or
   DONE. Name it by its lane file's `Session` field (after an overflow
   that is `<ID>b`, not `<ID>`).
   Re-read `STATE.md`, then rewrite it with *Ready*, *Next action* for the
   first of them, and *Read next*.
3. **Then** read the ready sessions' lane files (and, if `HOLD.md`
   exists, activate no one). For each one that says HOLDING, send
   `ACTIVATE <Session>`:
   - `SendMessage` with `to` = the lane file's `Session id` (`local_…`)
     when it has one;
   - otherwise `ListAgents` then `SendMessage` to the row whose name
     matches the lane file's `Session title`;
   - otherwise desktop `mcp__ccd_session_mgmt__send_message` to it;
   - otherwise leave it under *Ready*; it starts when the user opens it.
   Before activating a packet, confirm its claim overlaps no ACTIVE packet.
4. Log `handoff` and `activate`; tell the user in one line who is next
   (and to open it if its lane file is not HOLDING yet). **Stop.** Do not
   start the next stint here, however much context is left.

Two parallel packets may finish together and both activate the same
successor; a session that is already ACTIVE ignores a second `ACTIVATE`.
A lane that says `HELD <step>` (stopped by a HOLD) is not ACTIVE: its
session resumes on `ACTIVATE`.

## Worker mode (a held session activated, or `worker <ID>`)

1. If `<ROOT>/HOLD.md` exists, reply `Held by HOLD: <reason>` and stop.
   If the lane file says `HELD <step>`, set it back to ACTIVE and resume
   from its *Next*; skip the rest of this step and step 2.
   Read `STATE.md`, the brief, `lanes/<ID>.md`, and the `HANDOFF-*.md` of
   the sessions it depends on. Set `Status: ACTIVE` in the lane file;
   re-read `STATE.md`, take `<ID>` off *Ready*, set `This session:`, and
   rewrite it. Log it in `<MAB>` (absolute, in the main repo). An
   overflow successor `<ID>b` uses its parent's lane file,
   `lanes/<ID>.md`, as its claim line or holding prompt names.
2. Verify `git rev-parse HEAD` matches the SHA the predecessor recorded
   (log drift if not).
3. Working tree:
   - Sequential packet, `O2`, `O3`: the main tree on the task branch;
     touch only claimed files.
   - Worktree packet: if the lane file already records a worktree (an
     overflow successor), reuse it. Otherwise `git worktree add <abs
     path> -b mab/<slug>/<ID> <task branch>`, or `EnterWorktree` when
     available so this session's cwd moves there. Record the **actual**
     path and branch in the lane file (EnterWorktree may choose its own);
     merges use the lane file's branch, never the planned name. Without
     EnterWorktree, run every command with the absolute path and give it
     to every subagent as its working directory.
   - Merge any parallel dependencies into your own branch now (SKILL.md
     Phase 4 step 1), then run the gates once.
4. Codex runs with its cwd in your working tree; every `.mab/` path in
   its command and prompt is the absolute `<MAB>` path (a worktree has no
   `.mab/`; it is gitignored).
5. Run the stint (SKILL.md: `O2` Phase 3; packet Phases 4–5; `O3` Phase 6;
   `G<n>` and `RW<n>` per `references/release.md`),
   reading the meter at every step boundary, keeping the lane file's
   *Next* line current, then hand off as above.
6. Blocked (cap hit, test seems wrong, claim would need to grow): set
   `Status: BLOCKED <why>`, write `STATE.md`, escalate (`ESCALATE <ID>:
   <why>` to the director, plus a push notification; see
   `references/programme.md`), stop. Do not
   widen the claim yourself. **Never push. Packets merge nothing except
   the parallel dependencies their brief names.**

## Overflow (meter at 45% with work left, or 50% at any point)

1. Finish the step in hand; at 45%, TaskStop any live subagent or `codex
   exec` instead. Write `HANDOFF-<ID>.md` with exact state: what is done,
   what is half-applied (uncommitted files stay in the tree), what the
   stopped agents were doing, the next step.
2. Write `briefs/<ID>b.md`: the original brief minus what is done, plus
   the handoff path. `O1` (or a light-tier run) has no brief; write it
   from `STATE.md`, `PLAN.md`, and the handoff.
3. `<ID>b` **takes over `<ID>`'s row and lane file**: set `Status: SPLIT
   -> <ID>b`, `Session: <ID>b`, `Session title: MAB <ID>b · <repo>`;
   `<ID>b` then writes HOLDING/ACTIVE/DONE there. Same worktree, branch,
   claim, and *Depends on*; `## Sessions` keeps the single `<ID>` row, so
   dependents keep depending on `<ID>`, which is DONE when `<ID>b` writes
   `DONE <sha>`. Put `<ID>b` under *Ready*; any later *Ready* computation
   finds it through the lane file's `Session` field, and ACTIVATE goes to
   `<ID>b`'s `Session id`, never to the stopped `<ID>` session.
4. Spawn `<ID>b` with its holding prompt (its lane file is
   `lanes/<ID>.md`) by the ladder above: started outright when this turn
   was the user's, otherwise a claimed spare (mode `worker <ID>b`, since
   it is already *Ready*), otherwise a one-click card, otherwise a printed
   prompt to paste. Write its `Session id` into the lane file, log `handoff` with
   reason `budget <n>%`, and stop. Because it is under *Ready*, it starts
   its stint as soon as it registers.

The ledger's context column shows when packets are sized too big; the next
plan should split them smaller.

## Release

`RELEASE <ID>` (or `RELEASE S<n>`) to any session no longer needed (its
packet was folded into another, the run ended, or a spare was not
used). The held session sets `Status: RELEASED`, acks
in one line, and stops.
