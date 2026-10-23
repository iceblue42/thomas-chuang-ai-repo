import type { EngineInterface, Register } from 'claude-code'

import type { HandoffEntry, HandoffPending } from '../types'
import {
  addEntry, age, base, classifyPath, entryFromFile, handoffPrompt, holdingFileEntries, holdingPrompts, intentSuffix,
  isHandoffIntent, isHandoffPath, isRealUserPrompt, matchUsed, norm, parseArgs, setUsed, shelfKey, shouldShelve,
  shutdownDecision, stamp, type PromptSpec,
} from './logic'
import { locate, type Io, type Repo } from './repo'

type $ = EngineInterface

const PANE = 'handoffs'
const viewRef = { plugin: 'handoff', key: 'view' } as const
const pendingRef = { plugin: 'handoff', key: 'pending' } as const
const intentRef = { plugin: 'handoff', key: 'intent' } as const

const io = ($: $): Io => ({ read: p => $.fs.read(p), exists: p => $.fs.exists(p), stat: p => $.fs.stat(p) })
const dirOf = (p: string) => norm(p).replace(/\/[^/]*$/, '')
const fail = ($: $, what: string, err: unknown) => $.ui.toast(`handoff: ${what} failed: ${String(err).slice(0, 120)}`)

const loadShelf = async ($: $, main: string) => ((await $.store.get(shelfKey(main))) ?? []) as HandoffEntry[]
const saveShelf = ($: $, main: string, shelf: HandoffEntry[]) => $.store.set(shelfKey(main), shelf)

async function refreshView($: $) {
  const { main } = await locate(io($), await $.session.cwd())
  await $.state.set(viewRef, { repo: main, entries: await loadShelf($, main) })
}

async function spec($: $, repo: Repo, shutdown: boolean, note: string): Promise<PromptSpec> {
  const now = new Date(await $.clock.now())
  return { dir: repo.dir, stamp: stamp(now), project: repo.main, createdIso: now.toISOString(), shutdown, note }
}

/** Shelves a handoff or session-prompt file Claude just wrote, copies its body, and notes it for --shutdown. */
async function ingestFile($: $, path: string) {
  const repo = await locate(io($), dirOf(path))
  const entry = entryFromFile(path, await $.fs.read(path), repo.main, await $.clock.now())
  if (!entry) return
  await saveShelf($, repo.main, addEntry(await loadShelf($, repo.main), entry))
  const { value: pending } = await $.state.get(pendingRef)
  if (pending?.armed && isHandoffPath(path)) await $.state.set(pendingRef, { ...pending, file: norm(path) })
  const copied = await $.ui.copy({ text: entry.body })
  $.ui.toast(copied.isCopied ? `Handoff copied: ${entry.title}` : `Handoff shelved (copy from /handoffs): ${entry.title}`)
  await refreshView($)
}

/** MAB's saved HOLDING-PROMPTS.md: one shelf entry per holding prompt; nothing is copied, as there are several. */
async function ingestHoldingFile($: $, path: string) {
  const repo = await locate(io($), dirOf(path))
  const found = holdingFileEntries(path, await $.fs.read(path), repo.main, await $.clock.now())
  const shelf = await loadShelf($, repo.main)
  const fresh = found.filter(e => !shelf.some(o => o.key === e.key)).length
  await saveShelf($, repo.main, found.reduce(addEntry, shelf))
  if (fresh) $.ui.toast(`Shelved ${fresh} MAB holding prompt(s) from ${base(path)}: /handoffs to copy`)
  await refreshView($)
}

/** MAB prints its armed holding prompts in chat; shelve them so /handoffs can copy each one. */
async function ingestHolding($: $, answer: string) {
  const { main } = await locate(io($), await $.session.cwd())
  const found = holdingPrompts(answer, main, await $.clock.now())
  if (!found.length) return
  await saveShelf($, main, found.reduce(addEntry, await loadShelf($, main)))
  $.ui.toast(`Shelved ${found.length} MAB holding prompt(s): /handoffs to copy`)
  await refreshView($)
}

/** The store is shared by every session: a prompt pasted anywhere marks its entry used in any repo's shelf. */
async function markUsedAnywhere($: $, text: string) {
  const at = await $.clock.now()
  let changed = false
  for (const key of (await $.store.keys()).filter(k => k.startsWith('shelf:'))) {
    const shelf = ((await $.store.get(key)) ?? []) as HandoffEntry[]
    const ids = matchUsed(shelf, text)
    if (!ids.length) continue
    await $.store.set(key, ids.reduce((s, id) => setUsed(s, id, at), shelf))
    changed = true
  }
  if (changed) await refreshView($)
}

async function markOne($: $, repo: string, id: string) {
  await saveShelf($, repo, setUsed(await loadShelf($, repo), id, await $.clock.now()))
  await refreshView($)
}

async function maybeShutdown($: $, pending: HandoffPending, isAborted: boolean) {
  if (isAborted) return $.ui.toast('Handoff turn was interrupted; not shutting down.', { timeoutMs: 15_000 })
  const text = pending.file ? await $.fs.read(pending.file).catch(() => null) : null
  const git = text === null ? null : await $.process.run(['git', 'status', '--porcelain=v2', '--branch'], { timeoutMs: 20_000 }).catch(() => null)
  const decision = shutdownDecision(text, git)
  if (!decision.ok) return $.ui.toast(`Not shutting down: ${decision.reason}.`, { timeoutMs: 30_000 })
  const ran = await $.process.run(['shutdown', '/s', '/t', '120', '/c', 'Claude handoff complete']).catch(err => ({ exitCode: -1, stdout: '', stderr: String(err) }))
  $.ui.toast(
    ran.exitCode === 0 ? 'Shutting down in 2 min — run `shutdown /a` to abort' : `shutdown failed: ${ran.stderr.trim().slice(0, 120)}`,
    { timeoutMs: 60_000 },
  )
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'handoff', description: 'Write one combined next-session prompt to the repo, shelve and copy it', argumentHint: '[--shutdown] [note...]' })
    await $.command.register({ name: 'handoffs', description: 'Open the Handoffs shelf: copy or mark next-session prompts used' })
    await refreshView($).catch(err => fail($, 'reading the shelf', err))
    // other sessions mark entries used or add new ones; pick that up between turns
    $.clock.every(60_000, () => void refreshView($).catch(() => {}))
    return next(e)
  })

  on('command.run', { command: 'handoff' }, async ($, e) => {
    try {
      const { shutdown, note } = parseArgs(e.args)
      const repo = await locate(io($), await $.session.cwd())
      await $.state.set(pendingRef, shutdown ? { armed: false, file: null, dir: repo.dir } : null)
      // queued: it runs as its own turn once the session is idle, so it must not be awaited here
      void $.prompt.submit({ text: handoffPrompt(await spec($, repo, shutdown, note)) }).catch(err => fail($, 'queueing the prompt', err))
      return { text: `Queued the handoff prompt; it will write to ${repo.dir}${shutdown ? ' and shut down after, if safe' : ''}.` }
    } catch (err) {
      return { text: `handoff failed: ${String(err)}` }
    }
  })

  on('command.run', { command: 'handoffs' }, async $ => {
    await refreshView($).catch(err => fail($, 'reading the shelf', err))
    await $.ui.open({ id: PANE, title: 'Handoffs' })
    return { text: 'Handoffs pane opened.' }
  })

  on('prompt.submit', async ($, e, next) => {
    if (e.origin.kind === 'plugin' && e.origin.name === 'handoff' && e.text.startsWith('[handoff]')) {
      const { value: pending } = await $.state.get(pendingRef)
      if (pending && !pending.armed) await $.state.set(pendingRef, { ...pending, armed: true })
      await $.state.set(intentRef, true).catch(() => {})
      return next(e)
    }
    if (!isRealUserPrompt(e.origin, e.text)) return next(e)
    await markUsedAnywhere($, e.text).catch(err => fail($, 'marking a handoff used', err))
    const intent = isHandoffIntent(e.text)
    await $.state.set(intentRef, intent).catch(() => {})
    if (!intent) return next(e)
    try {
      const repo = await locate(io($), await $.session.cwd())
      return next({ ...e, text: e.text + intentSuffix(await spec($, repo, false, '')) })
    } catch (err) {
      fail($, 'adding the handoff instruction', err)
      return next(e)
    }
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (e.tool !== 'Write' && e.tool !== 'Edit') return ran
    if (ran.deny !== undefined || ran.isError) return ran
    const kind = classifyPath(e.file_path)
    if (!kind) return ran
    const intent = kind === 'brief' && (await $.state.get(intentRef).catch(() => null))?.value === true
    if (!shouldShelve(e.file_path, intent)) return ran
    if (kind === 'holding') await ingestHoldingFile($, e.file_path).catch(err => fail($, 'shelving holding prompts', err))
    else await ingestFile($, e.file_path).catch(err => fail($, 'shelving the handoff', err))
    return ran
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId) return done
    await $.state.set(intentRef, false).catch(() => {})
    await ingestHolding($, e.answer).catch(err => fail($, 'shelving holding prompts', err))
    const { value: pending } = await $.state.get(pendingRef)
    if (pending?.armed) {
      await $.state.set(pendingRef, null)
      await maybeShutdown($, pending, e.isAborted).catch(err => fail($, 'the shutdown check', err))
    }
    return done
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const { value: view } = await $.state.get(viewRef)
    const entries = view?.entries ?? []
    const now = Date.now()
    return (
      <Box flexDirection="column">
        <Text dimColor wrap="truncate-end">{view?.repo ?? 'Loading…'}</Text>
        {entries.length === 0 && <Text dimColor wrap="wrap">No handoffs yet. Run /handoff at the end of a session.</Text>}
        {entries.map((entry, i) => (
          <Box flexDirection="column" marginTop={1}>
            <Text bold={!entry.used} dimColor={entry.used} wrap="truncate-end">{entry.title}</Text>
            <Text dimColor wrap="truncate-end">
              {[entry.kind, entry.role, `${age(now - entry.created)} ago`, entry.used ? 'used' : 'unused'].filter(Boolean).join(' · ')}
            </Text>
            <Box>
              <Button
                key={`copy-${i}`}
                label="Copy"
                onPress={press => void $.ui.copy({ text: entry.body, surface: press.surface })
                  .then(r => $.ui.toast(r.isCopied ? `Copied: ${entry.title}` : `Copy failed: ${r.reason}`))}
              />
              {!entry.used && view && (
                <Button key={`used-${i}`} label="Mark used" onPress={() => void markOne($, view.repo, entry.id).catch(err => fail($, 'marking used', err))} />
              )}
            </Box>
          </Box>
        ))}
      </Box>
    )
  })
}
