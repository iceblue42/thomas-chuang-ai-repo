# Recon Workflow script (Phase 1)

Deterministic fan-out with schema-forced returns; the journal on disk
survives compaction. SKILL.md instructing this call is the Workflow tool's
required opt-in. Runs in the background; distill the returned summaries into
`.mab/PLAN.md` and log `phase_end` for Phase 1 with the ledger row.

```js
export const meta = {
  name: 'mab-recon',
  description: 'Parallel recon fan-out for multi-agent-building',
  phases: [{ title: 'Recon' }],
}
const SCHEMA = {
  type: 'object',
  required: ['summary', 'key_files'],
  properties: {
    summary: { type: 'string', description: 'Conclusions only, at most 15 lines, no file dumps' },
    key_files: { type: 'array', items: { type: 'string' } },
    gate_commands: {
      type: 'object',
      description: 'build/test/lint commands, only from the agent asked to find them',
    },
    frontend: {
      type: 'object',
      description: 'only from the agent asked about UI: framework, styling, tokens, new_ui_or_redesign, touches_ui (bool)',
    },
  },
}
phase('Recon')
const results = await parallel(args.questions.map(q => () =>
  agent(`${q}\nReport conclusions, not file dumps.`,
        { agentType: 'Explore', model: 'sonnet', schema: SCHEMA, phase: 'Recon' })))
return results.filter(Boolean)
```

`args.questions`, 3–6 entries, each scoped differently:

1. Relevant modules, entry points, and data flow for `<task>`.
2. Existing patterns and conventions the change must follow (naming, error
   handling, DI, logging).
3. Test infrastructure: frameworks, fixtures, how similar features are tested.
4. Integration points and blast radius: who calls what will change.
5. **Always:** the repo's build, test, and lint commands, exactly as run in
   CI (`gate_commands`).
6. **When UI is plausible:** does this touch frontend code? Framework,
   styling method, existing design tokens or system, new UI vs redesign
   (`frontend`).

Fallback without the Workflow tool: the same questions to 2–4 `Explore`
subagents (`model: "sonnet"`) dispatched in one message.
