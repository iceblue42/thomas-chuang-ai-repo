// Compact rows for the band above the prompt; the full view stays in the /progress-tracker pane.
import type { Snapshot } from '../types'
import { PIPELINE, focusIndex, itemState } from './parse'

export type Seg = { text: string; color?: string; bold?: boolean; dim?: boolean }
export type Row = Seg[]

const short = (s: string, n = 60) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

export function bandRows(s: Snapshot): Row[] {
  const { run, plan } = s
  const rows: Row[] = []

  if (run) {
    rows.push([
      { text: `◆ ${run.title || run.id}`, bold: true },
      { text: ` · ${[run.session, run.tier, run.round && `round ${run.round}`, s.at].filter(Boolean).join(' · ')}`, dim: true },
    ])
    const p = PIPELINE[run.phase]
    rows.push([
      ...PIPELINE.map((ph, i): Seg => ({
        text: `${i < run.phase ? '✓' : i === run.phase ? '▶' : '○'}${ph.name} `,
        color: i < run.phase ? 'green' : i === run.phase ? 'cyan' : undefined,
        bold: i === run.phase,
        dim: i > run.phase,
      })),
      ...(p ? [{ text: '│ ', dim: true }, ...p.steps.map((st, i): Seg => ({
        text: `${i ? ' › ' : ''}${st}`,
        color: i === run.substep ? 'cyan' : i < run.substep ? 'green' : undefined,
        bold: i === run.substep,
        dim: i > run.substep,
      }))] : run.phase === 7 ? [{ text: 'run complete', color: 'green' }] : []),
    ])
    const doing = run.agents && !/^none/i.test(run.agents) ? run.agents : run.phaseText
    if (doing || run.next) rows.push([
      ...(doing ? [{ text: `now: ${short(doing)}` }] : []),
      ...(run.next ? [{ text: `${doing ? '  ' : ''}next: ${short(run.next)}`, dim: true }] : []),
    ])
    const done = run.chunks.filter(c => c.status === 'done').length
    const active = run.chunks.filter(c => c.status === 'active').map(c => c.id)
    const crit = run.openFindings.filter(f => /CRIT|HIGH/.test(f)).length
    const sessions = [run.session, run.held, ...run.lanes.map(l => `${l.session || l.id} ${l.status}`)].filter(x => x && !/^none|not yet/i.test(x))
    rows.push([
      ...(run.chunks.length ? [{ text: `chunks ${done}/${run.chunks.length}${active.length ? ` ▶${active.join(',')}` : ''}` }] : []),
      { text: ` · findings ${run.openFindings.length || 'none'} open`, color: crit ? 'red' : undefined, dim: !crit },
      ...(sessions.length ? [{ text: ` · sessions: ${short(sessions.join(', '), 80)}`, dim: true }] : []),
    ])
  }

  if (plan) {
    const cur = new Set(plan.current)
    const bld = new Set(plan.built)
    const pau = new Set(plan.paused ?? [])
    const all = plan.sections.flatMap(x => x.items)
    const built = all.filter(i => itemState(i, cur, bld, pau) === 'built').length
    const paused = all.filter(i => itemState(i, cur, bld, pau) === 'paused').length
    const focus = focusIndex(plan.sections, cur, bld, pau)
    const sec = plan.sections[focus]
    const curItem = sec?.items.find(i => cur.has(i.id)) ?? sec?.items.find(i => itemState(i, cur, bld, pau) === 'todo')
    const later = plan.sections.slice(focus + 1).filter(x => x.items.some(i => itemState(i, cur, bld, pau) === 'todo'))
    rows.push([
      { text: `plan ${all.filter(i => i.done).length}/${all.length}`, bold: true },
      ...(built ? [{ text: ` +${built} built`, color: 'yellow' }] : []),
      ...(paused ? [{ text: ` ‖${paused} paused`, color: 'magenta' }] : []),
      ...(sec ? [{ text: ` · ${short(sec.heading, 40)} ${sec.items.filter(i => i.done).length}/${sec.items.length}`, color: 'cyan' }] : [{ text: ' · all done', color: 'green' }]),
      ...(curItem ? [{ text: ` ▶ ${short(curItem.text, 50)}` }] : []),
      ...(later.length ? [{ text: ` · then ${short(later[0]!.heading, 30)}${later.length > 1 ? ` +${later.length - 1} more` : ''}`, dim: true }] : []),
    ])
  }
  return rows
}
