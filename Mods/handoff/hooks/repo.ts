// Finds the repo a session works in and its main checkout (the shelf's key). `$` may not cross an
// import, so register.tsx hands in an Io built from it (same pattern as progress-tracker).
import type { FsStat } from 'claude-code'

import { handoffDir, join, norm } from './logic'

export type Io = {
  read: (path: string) => Promise<string>
  exists: (path: string) => Promise<boolean>
  stat: (path: string) => Promise<FsStat>
}

const parent = (p: string) => norm(p).replace(/\/[^/]*$/, '')
const tryRead = (io: Io, p: string) => io.read(p).catch(() => '')

/** Nearest ancestor holding `.mab/` or `.git`, else the start folder itself. */
async function findRoot(io: Io, start: string) {
  for (let dir = norm(start), i = 0; i < 40; i++) {
    if ((await io.exists(join(dir, '.mab'))) || (await io.exists(join(dir, '.git')))) return dir
    const up = parent(dir)
    if (!up || up === dir) break
    dir = up
  }
  return norm(start)
}

/** A linked worktree's `.git` file points at `<main>/.git/worktrees/<name>`; the main checkout is two up from there. */
async function mainCheckout(io: Io, root: string) {
  const gitPath = join(root, '.git')
  const st = await io.stat(gitPath).catch(() => null)
  if (!st || st.kind !== 'file') return root
  const linked = /gitdir:\s*(.+)/.exec(await tryRead(io, gitPath))?.[1]?.trim()
  return linked ? parent(parent(parent(norm(linked)))) : root
}

export type Repo = { root: string; main: string; dir: string }

export async function locate(io: Io, cwd: string): Promise<Repo> {
  const root = await findRoot(io, cwd)
  const main = await mainCheckout(io, root)
  const [mainHasMab, rootHasMab] = await Promise.all([io.exists(join(main, '.mab')), io.exists(join(root, '.mab'))])
  return { root, main, dir: handoffDir(main, root, mainHasMab, rootHasMab) }
}
