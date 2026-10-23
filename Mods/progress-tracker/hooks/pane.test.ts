import { expect, test } from 'claude-code/testing'

const LONG = 'P0.8 Benchmark the baseline across every worktree and record the numbers so the next run has something to compare against'
const DOC = `# Plan\n\n## Phase 0: Recon\n\n- [x] P0.1 Confirm\n- [ ] ${LONG}\n- [ ] P0.9 Short one\n`

// the engine hands hooks Windows paths
const at = (e: { path: string }) => e.path.replaceAll('\\', '/')

test('pane lines wrap, with the status mark in its own column', async ($, on) => {
  // a one-repo fake disk: E:/r with a .git and BRIEF.md
  on('session.cwd', async () => ({ value: 'E:/r' }) as never)
  on('fs.exists', async (_, e) => ({ value: (at(e) === 'E:/r/.git') }) as never)
  on('fs.stat', async (_, e) => (at(e) === 'E:/r/.git' ? { value: { kind: 'dir', size: 0, mtimeMs: 0 } } : { deny: 'ENOENT' }) as never)
  on('fs.list', async (_, e) => ({ value: (at(e) === 'E:/r' ? [{ name: 'BRIEF.md', kind: 'file', size: DOC.length }] : []) }) as never)
  on('fs.read', async (_, e) => ({ value: (at(e) === 'E:/r/BRIEF.md' ? DOC : '') }) as never)
  on('store.get', async () => ({ value: undefined }) as never)
  on('ui.open', async () => ({ value: ({ isPlaced: true }) }) as never)
  on('command.register', async () => ({ value: undefined }) as never)
  on('clock.every', async () => ({ value: undefined }) as never)
  await $.command.run({ command: 'progress-tracker', args: '' } as never)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'progress-tracker', surface, component: 'Pane', requestId: 'progress-tracker', props: { title: 'Progress', isFocused: false, bodyColumns: 40 } as never })
    expect(JSON.stringify(await ui.drawn())).not.toContain('truncate')
    expect((await ui.find({ type: 'Text', text: LONG }))?.props).toMatchObject({ wrap: 'wrap' })
    expect(await ui.find({ type: 'Text', text: '   ○ ' })).toBeDefined() // mark drawn apart from the text it heads
    expect(await ui.find({ type: 'Text', text: '   ✓ ' })).toBeDefined()
    for (const key of ['✓ done', '▶ in progress', '◐ built, not ticked', '‖ paused', '○ to do']) expect(await ui.find({ type: 'Text', text: key })).toBeDefined()
    await ui.unmount()
  }
})
