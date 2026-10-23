# Qwen: the local implementer and test author

The implementer and the test author are **`qwen3.8:27b` running locally in
Ollama**, driven through a headless Claude Code session pointed at Ollama's
Anthropic-compatible endpoint. Qwen gets Claude Code's own tools (Read,
Edit, Write, Bash, Glob, Grep) but is **not a subagent**: it is a background
Bash process. There is no SendMessage and no TaskOutput steering; every
instruction is one `claude -p` call, and continuity is `--resume`.

Verified 2026-09-19 on Ollama 0.34.2, Claude Code 2.1.276, RTX 5090 32 GB.

## Preflight (`O1` Phase 0, then every session that dispatches Qwen)

```bash
ollama list | grep -q '^qwen3.8-mab' || {
  ollama list | grep -q '^qwen3.8:27b' || { echo "MISSING BASE"; exit 1; }
  printf 'FROM qwen3.8:27b\nPARAMETER num_ctx 131072\n' > "$TMP/Modelfile.mab"
  ollama create qwen3.8-mab -f "$TMP/Modelfile.mab"
}
curl -s localhost:11434/api/chat -d '{"model":"qwen3.8-mab","stream":false,"messages":[{"role":"user","content":"hi"}]}' >/dev/null
ollama ps    # must show qwen3.8-mab at 100% GPU
```

- `qwen3.8-mab` is the base model with a fixed context window. It exists
  because the base model's default 262k window spills ~40% to CPU and takes
  over a minute to first token; 131072 fits the 5090 entirely (about 29 of
  32 GB VRAM with the desktop running).
- **Calibration knob:** if `ollama ps` shows anything but `100% GPU`
  (another GPU app is open, different card), recreate the variant with
  `num_ctx 65536` and log the decision. Never run the pipeline on a
  CPU-split model; it is slower than escalating.
- System RAM (96 GB here) is **not a lever**: layers or KV cache spilled to
  it run at CPU speed. It only makes model reloads fast (page cache). If
  more context is ever needed, the knob to discuss with the user is
  Ollama's server-side KV-cache quantisation, not CPU offload.
- `MISSING BASE`: stop and tell the user to `ollama pull qwen3.8:27b`
  (17 GB). Never pull it silently and never substitute another local model.
- Ollama down (`curl` fails): stop and tell the user to start Ollama.

## Invocation

Write the brief to `<MAB>/briefs/<id>.md` first, then run in the
**background** from the packet's working tree:

```bash
ANTHROPIC_BASE_URL=http://localhost:11434 ANTHROPIC_API_KEY=ollama ANTHROPIC_AUTH_TOKEN=ollama \
claude --bare -p "Read <abs MAB>/briefs/<id>.md and do exactly what it says." \
  --model qwen3.8-mab --effort max \
  --permission-mode acceptEdits --allowedTools "Read,Edit,Write,Bash,Glob,Grep" \
  --output-format json > <abs MAB>/logs/qwen-<id>.json 2>/dev/null
```

- The three env vars are set **inline on that command only**. Never export
  them: the orchestrator's own shell must keep talking to Anthropic.
  `ollama` is a placeholder, not a secret; `--bare` requires key-style auth.
- `--bare` skips hooks, plugins, auto-memory, and `CLAUDE.md` discovery, so
  the 27B model is not buried under the user's harness. Consequences: Qwen
  **cannot invoke skills**, and any repo convention it needs must be in the
  brief (copy the relevant lines from recon; do not tell it to go find them).
- **Max effort:** Qwen's thinking is on by default through this endpoint
  and `--effort max` requests the largest thinking budget. Ollama exposes
  no tier above "on" for this model family, so this is the ceiling. Ollama
  reports `thinking_tokens: 0` regardless; that is a reporting gap, not
  thinking being off.
- The JSON result carries `session_id`, `result` (Qwen's report),
  `num_turns`, `is_error`, and `usage.input_tokens`. Read only those with
  `jq` (the context budget's 15-line report rule); never `cat` the file.
  Log `dispatch` with `"model":"qwen3.8-mab"`.

## Steering: one call per chunk, `--resume` for continuity

Next chunk, or a fix round, for the same Qwen session:

```bash
... claude --bare -p "Read <abs MAB>/briefs/<next id>.md ..." --resume <session_id> <same flags>
```

Record the live `session_id` in `STATE.md` and the lane file next to the
agent id, so an overflow successor `<ID>b` can `--resume` it. Where
SKILL.md says "SendMessage to the implementer", this is what it means here.
A mid-chunk course correction is not possible; keep chunks small and put
everything in the brief.

## Briefs for a 27B model

Qwen follows explicit instructions well and infers intent poorly. Every
brief, beyond what SKILL.md already requires:

- names the exact files to create or change, and the exact gate commands;
- copies `## Intent` verbatim, plus: "If a step or fix would move
  against this intent or cross a guard, do not apply it; stop and report
  the conflict." (`references/intent.md`);
- copies the chunk's plan steps and the relevant test names in, rather than
  pointing at `PLAN.md` sections;
- carries the two standing rules verbatim (no test edits; no work beyond
  the chunk or finding);
- ends with: "Run the gate commands. Report in at most 15 lines, per
  step: done / failed and why. Last line: `CONTEXT: OK` or `CONTEXT: FILLING`."

## Watches

- **Stall:** simple chunks finish in under two minutes, thinking-heavy ones
  in 5–15. At ~2× the expectation, check the background task; TaskStop it
  and start a **fresh** session (no `--resume`) with the handoff file.
- **Rot, measured not guessed:** when `usage.input_tokens` in the last
  result passes ~60% of `num_ctx` (≈80k at 131072), or the report says
  `CONTEXT: FILLING`, the next call starts a fresh session with
  `HANDOFF-<id>.md`. Qwen cannot write a reliable handoff when far gone;
  write it from its reports.
- **Drift check at every chunk boundary** (before re-running gates):
  `git status --porcelain` must list only files in the chunk's claim, and
  no test file during implementation. Anything else is reverted by path
  (`git checkout -- <file>` / delete the untracked file) and counts as a
  no-progress strike. The rule in the brief is a request; this is the
  enforcement.

## Escalation ladder

| Trigger | Next |
|---------|------|
| Two chunks (or two fix rounds) without progress, drift twice, over-engineering | Fresh Qwen session once, if rot is the likely cause; otherwise Sonnet subagent |
| Sonnet fails on the same chunk | Opus subagent |
| Opus stalls | Astra read-only consult (SKILL.md Phase 4) |
| Chunk flagged hard-reasoning in `PLAN.md` | Opus from the start, never Qwen |

Sonnet and Opus are ordinary subagents and follow SKILL.md as written
(SendMessage steering applies to them). For Opus use the MAB plugin's
`multi-agent-building:mab-implementer` / `mab-test-author` (high effort)
when installed, else `general-purpose` with `model: "opus"`. Log every rung change in
`DECISIONS.md`; the ledger's Qwen-vs-escalated chunk count is how the user
judges whether the local model is earning its place.

## One GPU

Ollama serves one Qwen generation at a time at full speed; concurrent
requests queue or split throughput, and a queued call trips the stall
watch. So:

- Never run two Qwen calls at once inside a session (the test author's
  calls run one after another).
- **No parallel packets and no parallel programme runs in this fork.**
  The relay already gives each packet its own session, which is all the
  context isolation parallelism would buy; on one GPU it buys no
  wall-clock time and costs a merge plus a release-gate round. Mark every
  packet and run sequential.
- Codex reviews and Sonnet/Opus subagents are remote and overlap freely
  with a running Qwen call.
